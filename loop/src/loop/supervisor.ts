/**
 * Supervisor — the fixed point in the self-modifying system.
 *
 * Promise Theory role: containing environment agent.
 * Does NOT participate in the promise protocol.
 * Its job: build the agent, launch N agent processes (one per registered
 * project), and handle per-agent failure and lifecycle.
 *
 * Multi-agent model:
 *   - Reads the `projects` registry from the shared promise log
 *   - Spawns one agent process per registered project
 *   - Hot-reloads the registry every REGISTRY_POLL_MS
 *   - Self-mode exit(0) triggers rebuild-all + restart-all
 *   - External-mode exit(0) restarts just that agent
 *   - Crash: exponential backoff per agent, max MAX_CONSECUTIVE_CRASHES
 *
 * Blue-green deployment model:
 *   dist/current/  — active compiled agent
 *   dist/previous/ — last known-good (rollback target)
 *
 * Exit codes from agent:
 *   0     — Work committed. Self-mode: rebuild all. External-mode: restart one.
 *   2     — Clean shutdown, no more work.
 *   SIGINT/SIGTERM — User stopped it. Clean exit.
 *   other — Crash. Restart same binary with backoff.
 */

import { spawn, execFileSync, ChildProcess } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync, existsSync, rmSync, cpSync } from 'fs';
import { join } from 'path';
import { PromiseLog, DEFAULT_DB_DIR } from './promise-log.ts';

const PID_PATH = join(DEFAULT_DB_DIR, 'supervisor.pid');
const MAX_CONSECUTIVE_CRASHES = 5;
const REGISTRY_POLL_MS = 10_000;

// ============ Agent Handle ============

interface AgentHandle {
  projectId: string;
  repoPath: string;
  agentId: string;
  mode: 'self' | 'external';
  name: string;
  process: ChildProcess | null;
  consecutiveCrashes: number;
  stopping: boolean;
}

const agents = new Map<string, AgentHandle>();
let agentDir = ''; // Set in runSupervisor

// ============ PID file ============

function acquirePid(): void {
  if (existsSync(PID_PATH)) {
    const oldPid = parseInt(readFileSync(PID_PATH, 'utf-8').trim(), 10);
    try {
      process.kill(oldPid, 0);
      console.error(`Supervisor already running (PID ${oldPid}). Exiting.`);
      process.exit(1);
    } catch {
      // Stale PID file
    }
  }
  writeFileSync(PID_PATH, String(process.pid));
}

function releasePid(): void {
  try { unlinkSync(PID_PATH); } catch { /* ignore */ }
}

// ============ Build / Swap / Rollback ============

function distCurrent(sourceDir: string): string {
  return join(sourceDir, 'dist', 'current');
}

function distPrevious(sourceDir: string): string {
  return join(sourceDir, 'dist', 'previous');
}

function agentEntry(sourceDir: string): string {
  return join(distCurrent(sourceDir), 'agent.js');
}

function build(sourceDir: string): boolean {
  try {
    rmSync(distCurrent(sourceDir), { recursive: true, force: true });
    execFileSync('bun', [
      'build', 'src/loop/agent.ts',
      '--outdir', join('dist', 'current'),
      '--target', 'node',
      '--format', 'esm',
      '--external', 'better-sqlite3',
      '--external', '@anthropic-ai/claude-agent-sdk',
      '--sourcemap=external',
    ], { cwd: sourceDir, stdio: 'inherit' });
    console.log('Build succeeded.');
    return true;
  } catch (err) {
    console.error('Build failed:', err);
    return false;
  }
}

function snapshotCurrent(sourceDir: string): void {
  const current = distCurrent(sourceDir);
  const previous = distPrevious(sourceDir);
  if (existsSync(current)) {
    rmSync(previous, { recursive: true, force: true });
    cpSync(current, previous, { recursive: true });
    console.log('Snapshot saved to dist/previous/.');
  }
}

function rollback(sourceDir: string): boolean {
  const current = distCurrent(sourceDir);
  const previous = distPrevious(sourceDir);
  if (!existsSync(previous)) {
    console.error('No previous version to rollback to.');
    return false;
  }
  rmSync(current, { recursive: true, force: true });
  cpSync(previous, current, { recursive: true });
  console.log('Rolled back to previous version.');
  return true;
}

// ============ Agent Lifecycle ============

function spawnAgent(handle: AgentHandle): void {
  if (handle.stopping) return;

  const entry = agentEntry(agentDir);
  if (!existsSync(entry)) {
    console.error(`Agent entry not found: ${entry}. Skipping ${handle.name}.`);
    return;
  }

  console.log(`Launching agent for ${handle.name} (${handle.mode}) at ${handle.repoPath}...`);

  const child = spawn('node', ['--enable-source-maps', entry], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DIFFER_AGENT_ID: handle.agentId,
      DIFFER_TARGET_DIR: handle.repoPath,
      DIFFER_MODE: handle.mode,
    },
  });

  child.on('exit', (code, signal) => {
    handle.process = null;
    handleAgentExit(handle, code, signal);
  });

  handle.process = child;
}

function handleAgentExit(handle: AgentHandle, code: number | null, signal: string | null): void {
  if (handle.stopping) return;

  // SIGINT/SIGTERM — user killed it
  if (signal === 'SIGINT' || signal === 'SIGTERM' || code === 130) {
    console.log(`Agent ${handle.name} stopped by ${signal ?? 'interrupt'}.`);
    return;
  }

  // Clean shutdown
  if (code === 2) {
    console.log(`Agent ${handle.name} requested shutdown (code 2).`);
    return;
  }

  // Exit 0 — agent committed changes
  if (code === 0) {
    if (handle.mode === 'self') {
      // Self-modifying agent committed. Rebuild ALL agents.
      console.log(`Agent ${handle.name} (self) committed changes. Rebuilding all...`);
      rebuildAndRestartAll();
      return;
    }

    // External agent finished work. Restart to pick up next intent.
    console.log(`Agent ${handle.name} (external) completed work. Restarting.`);
    handle.consecutiveCrashes = 0;
    spawnAgent(handle);
    return;
  }

  // Crash
  handle.consecutiveCrashes++;

  if (handle.consecutiveCrashes >= MAX_CONSECUTIVE_CRASHES) {
    console.error(`Agent ${handle.name} crashed ${handle.consecutiveCrashes} times. Stopping.`);
    return;
  }

  // Reset target repo if dirty (for self-mode only)
  if (handle.mode === 'self') {
    try {
      const status = execFileSync('git', ['status', '--porcelain'], { cwd: handle.repoPath, encoding: 'utf-8' });
      if (status.trim()) {
        console.log(`Resetting dirty working copy for ${handle.name}...`);
        execFileSync('git', ['checkout', '--', '.'], { cwd: handle.repoPath });
      }
    } catch { /* ignore */ }
  }

  const backoffSec = Math.min(2 ** handle.consecutiveCrashes, 60);
  console.log(`Agent ${handle.name} crashed (code ${code}). Restarting in ${backoffSec}s (${handle.consecutiveCrashes}/${MAX_CONSECUTIVE_CRASHES})...`);

  setTimeout(() => {
    if (!handle.stopping) spawnAgent(handle);
  }, backoffSec * 1000);
}

/** Stop all agents, rebuild, restart all */
function rebuildAndRestartAll(): void {
  // Stop all agents
  for (const handle of agents.values()) {
    stopAgent(handle);
  }

  // Wait briefly for processes to exit, then rebuild
  setTimeout(() => {
    snapshotCurrent(agentDir);
    if (build(agentDir)) {
      console.log('New version built. Restarting all agents.');
      for (const handle of agents.values()) {
        handle.consecutiveCrashes = 0;
        handle.stopping = false;
        spawnAgent(handle);
      }
    } else {
      console.log('Build failed. Rolling back.');
      if (rollback(agentDir)) {
        for (const handle of agents.values()) {
          handle.consecutiveCrashes = 0;
          handle.stopping = false;
          spawnAgent(handle);
        }
      } else {
        console.error('Rollback failed. Stopping supervisor.');
        cleanup();
        process.exit(1);
      }
    }
  }, 1000);
}

function stopAgent(handle: AgentHandle): void {
  handle.stopping = true;
  if (handle.process) {
    handle.process.kill('SIGTERM');
  }
}

// ============ Registry Hot-Reload ============

function syncRegistry(): void {
  let promiseLog: PromiseLog;
  try {
    promiseLog = new PromiseLog();
  } catch {
    return; // DB might be busy
  }

  const projects = promiseLog.getAllProjects();
  promiseLog.close();

  const currentIds = new Set(agents.keys());
  const registryIds = new Set(projects.map(p => p.projectId));

  // Spawn agents for new projects
  for (const project of projects) {
    if (!currentIds.has(project.projectId)) {
      const handle: AgentHandle = {
        projectId: project.projectId,
        repoPath: project.repoPath,
        agentId: project.agentId,
        mode: project.mode,
        name: project.name ?? project.repoPath,
        process: null,
        consecutiveCrashes: 0,
        stopping: false,
      };
      agents.set(project.projectId, handle);
      spawnAgent(handle);
    }
  }

  // Stop agents for removed projects
  for (const projectId of currentIds) {
    if (!registryIds.has(projectId)) {
      const handle = agents.get(projectId)!;
      console.log(`Project ${handle.name} removed from registry. Stopping agent.`);
      stopAgent(handle);
      agents.delete(projectId);
    }
  }
}

// ============ Cleanup ============

function cleanup(): void {
  for (const handle of agents.values()) {
    stopAgent(handle);
  }
  releasePid();
}

// ============ Supervisor Entry ============

export function runSupervisor(sourceDir: string): void {
  agentDir = sourceDir;

  acquirePid();
  process.on('exit', () => releasePid());
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });

  console.log(`Supervisor started (PID ${process.pid}). Source: ${sourceDir}`);

  // Initial build
  if (!build(sourceDir)) {
    console.error('Initial build failed. Exiting.');
    return;
  }

  // Initial registry sync
  syncRegistry();

  if (agents.size === 0) {
    console.log('No projects registered. Use `differ add <path>` to register a repository.');
    console.log('Supervisor will poll for new registrations...');
  }

  // Registry hot-reload
  const registryTimer = setInterval(syncRegistry, REGISTRY_POLL_MS);

  // Keep the process alive
  process.on('beforeExit', () => {
    clearInterval(registryTimer);
  });
}
