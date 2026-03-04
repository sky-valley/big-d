/**
 * Supervisor — the fixed point in the self-modifying system.
 *
 * Promise Theory role: containing environment agent.
 * Does NOT participate in the promise protocol.
 * Its only job: build the agent, launch it, and handle failure.
 *
 * Blue-green deployment model:
 *   dist/current/  — active compiled agent
 *   dist/previous/ — last known-good (rollback target)
 *
 * Exit codes from agent:
 *   0     — Source committed. Blue-green swap: snapshot current, build new, launch.
 *   2     — Clean shutdown, no more work.
 *   SIGINT/SIGTERM — User stopped it. Clean exit.
 *   other — Crash. Restart same binary (agent retries with partial edits in src/).
 *
 * Source is NEVER rolled back. The supervisor never runs `git checkout`.
 */

import { spawnSync, execFileSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync, existsSync, rmSync, cpSync } from 'fs';
import { join } from 'path';
import { DEFAULT_DB_DIR } from './promise-log.ts';

const PID_PATH = join(DEFAULT_DB_DIR, 'supervisor.pid');
const MAX_CONSECUTIVE_CRASHES = 5;

// ============ PID file ============

/** Write PID file; exit if another supervisor is already running */
function acquirePid(): void {
  if (existsSync(PID_PATH)) {
    const oldPid = parseInt(readFileSync(PID_PATH, 'utf-8').trim(), 10);
    try {
      process.kill(oldPid, 0);
      console.error(`Supervisor already running (PID ${oldPid}). Exiting.`);
      process.exit(1);
    } catch {
      // Stale PID file — clean it up
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

/** Clean-build the agent from src/ into dist/current/ */
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

/** Copy dist/current/ → dist/previous/ (snapshot known-good before swap) */
function snapshotCurrent(sourceDir: string): void {
  const current = distCurrent(sourceDir);
  const previous = distPrevious(sourceDir);
  if (existsSync(current)) {
    rmSync(previous, { recursive: true, force: true });
    cpSync(current, previous, { recursive: true });
    console.log('Snapshot saved to dist/previous/.');
  }
}

/** Copy dist/previous/ → dist/current/ (restore known-good) */
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

// ============ Supervisor Loop ============

export function runSupervisor(sourceDir: string): void {
  acquirePid();
  process.on('exit', releasePid);
  process.on('SIGINT', () => { releasePid(); process.exit(0); });
  process.on('SIGTERM', () => { releasePid(); process.exit(0); });

  console.log(`Supervisor started (PID ${process.pid}). Source: ${sourceDir}`);

  // Initial build
  if (!build(sourceDir)) {
    console.error('Initial build failed. Exiting.');
    return;
  }

  let consecutiveCrashes = 0;
  let justBuiltNew = false; // tracks if we just did a blue-green swap

  while (true) {
    console.log('Launching agent...');

    const result = spawnSync(
      'node',
      ['--enable-source-maps', agentEntry(sourceDir)],
      { stdio: 'inherit', cwd: sourceDir, env: { ...process.env } },
    );

    const code = result.status ?? 1;
    const signal = result.signal;

    // SIGINT/SIGTERM — user killed it, clean exit
    if (signal === 'SIGINT' || signal === 'SIGTERM' || code === 130) {
      console.log(`Agent stopped by ${signal ?? 'interrupt'}. Stopping supervisor.`);
      break;
    }

    // Clean shutdown
    if (code === 2) {
      console.log('Agent requested shutdown (code 2). Stopping supervisor.');
      break;
    }

    // Exit 0 — agent committed source changes. Blue-green swap.
    if (code === 0) {
      console.log('Agent committed changes. Building new version...');
      snapshotCurrent(sourceDir);
      if (build(sourceDir)) {
        console.log('New version built. Restarting agent.');
      } else {
        console.log('Build failed. Rolling back to previous version.');
        if (!rollback(sourceDir)) {
          console.error('Rollback failed (no previous version). Stopping.');
          break;
        }
      }
      consecutiveCrashes = 0;
      justBuiltNew = true;
      continue;
    }

    // Crash — decide based on whether this is a new version or same version
    consecutiveCrashes++;

    if (justBuiltNew && consecutiveCrashes === 1) {
      // New version failed on first launch. Roll back to previous.
      console.log(`New version crashed (code ${code}). Rolling back to previous version.`);
      if (rollback(sourceDir)) {
        justBuiltNew = false;
        consecutiveCrashes = 0;
        continue;
      } else {
        console.error('Rollback failed (no previous version). Stopping.');
        break;
      }
    }

    justBuiltNew = false;

    // Same version crashed. Restart with backoff.
    console.log(`Agent crashed (code ${code}). Restarting same version (${consecutiveCrashes}/${MAX_CONSECUTIVE_CRASHES})...`);

    if (consecutiveCrashes >= MAX_CONSECUTIVE_CRASHES) {
      console.error(`Agent crashed ${consecutiveCrashes} times in a row. Stopping supervisor.`);
      break;
    }

    const backoffSec = Math.min(2 ** consecutiveCrashes, 60);
    console.log(`Waiting ${backoffSec}s before restart...`);
    spawnSync('sleep', [String(backoffSec)]);
  }
}
