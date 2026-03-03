/**
 * Supervisor — the fixed point in the self-modifying system.
 *
 * Promise Theory role: containing environment agent.
 * Does NOT participate in the promise protocol.
 * Its only job: launch the agent process and handle failure.
 *
 * Exit codes from agent:
 *   0     — Source committed, restart with updated code
 *   2     — Clean shutdown, no more work
 *   other — Crash; rollback source via git checkout, then restart
 */

import { spawnSync } from 'child_process';
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DEFAULT_DB_DIR } from './promise-log.ts';

const PID_PATH = join(DEFAULT_DB_DIR, 'supervisor.pid');
const AGENT_ENTRY = join(import.meta.dirname!, 'agent.ts');

/** Write PID file; exit if another supervisor is already running */
function acquirePid(): void {
  if (existsSync(PID_PATH)) {
    const oldPid = parseInt(readFileSync(PID_PATH, 'utf-8').trim(), 10);
    try {
      process.kill(oldPid, 0); // Check if process exists
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

export function runSupervisor(sourceDir: string): void {
  acquirePid();
  process.on('exit', releasePid);
  process.on('SIGINT', () => { releasePid(); process.exit(0); });
  process.on('SIGTERM', () => { releasePid(); process.exit(0); });

  console.log(`Supervisor started (PID ${process.pid}). Source: ${sourceDir}`);

  let consecutiveCrashes = 0;

  while (true) {
    console.log('Launching agent...');

    const result = spawnSync(
      process.execPath,  // node or tsx
      ['--import', 'tsx', AGENT_ENTRY],
      { stdio: 'inherit', cwd: sourceDir, env: { ...process.env } },
    );

    const code = result.status ?? 1;
    const signal = result.signal;

    // SIGINT/SIGTERM — user killed it, not a crash
    if (signal === 'SIGINT' || signal === 'SIGTERM' || code === 130) {
      console.log(`Agent stopped by ${signal ?? 'interrupt'}. Stopping supervisor.`);
      break;
    }

    if (code === 0) {
      console.log('Agent exited cleanly (code 0). Restarting with updated source.');
      consecutiveCrashes = 0;
      continue;
    }

    if (code === 2) {
      console.log('Agent requested shutdown (code 2). Stopping supervisor.');
      break;
    }

    // Crash — rollback and restart with backoff
    consecutiveCrashes++;
    console.log(`Agent crashed (code ${code}). Rolling back source...`);
    try {
      execFileSync('git', ['checkout', '--', '.'], { cwd: sourceDir });
      console.log('Rollback complete.');
    } catch (err) {
      console.error('Rollback failed:', err);
      break;
    }

    if (consecutiveCrashes >= 5) {
      console.error(`Agent crashed ${consecutiveCrashes} times in a row. Stopping supervisor.`);
      break;
    }

    const backoffSec = Math.min(2 ** consecutiveCrashes, 60);
    console.log(`Waiting ${backoffSec}s before restart (crash ${consecutiveCrashes}/5)...`);
    spawnSync('sleep', [String(backoffSec)]);
  }
}
