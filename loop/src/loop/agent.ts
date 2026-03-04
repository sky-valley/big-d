/**
 * Self-Modifying Agent — the core loop.
 *
 * Promise Theory role: autonomous agent A.
 * Makes give-promises (+b) voluntarily.
 * Can decline intents it cannot handle.
 *
 * Event-driven agent (Definition 26, Ch 5):
 * "An agent that makes promises conditionally on sampling message events"
 *
 * Exit codes:
 *   0 — Source committed, supervisor should restart
 *   2 — No work available, clean shutdown
 *   1 — Error (supervisor will rollback and restart)
 */

import { execFileSync } from 'child_process';
import { PromiseLog } from './promise-log.ts';
import { createPromise, createComplete, createRevise } from '../itp/protocol.ts';
import type { StoredMessage } from './promise-log.ts';
import { doWork } from './work.ts';

const AGENT_ID = 'agent';
const POLL_INTERVAL_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg: string): void {
  console.log(`[agent] ${msg}`);
}

async function main(): Promise<void> {
  const now = new Date();
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  log(`Starting — ${timeStr}`);

  const promiseLog = new PromiseLog();
  const cwd = process.cwd();
  let lastSeq = promiseLog.getLatestSeq();

  // ---- Boot: derive state from promise log ----

  const active = promiseLog.getActivePromiseForAgent(AGENT_ID);

  if (active) {
    log(`Resuming active promise ${active.promiseId} in state ${active.state}`);

    if (active.state === 'ACCEPTED') {
      // Re-enter WORK phase
      await workPhase(promiseLog, active.promiseId, active.content ?? '', cwd);
      return;
    }

    if (active.state === 'COMPLETED') {
      // Wait for ASSESS
      lastSeq = promiseLog.getLatestSeq();
      await waitAssess(promiseLog, active.promiseId, active.content ?? '', cwd, lastSeq);
      return;
    }

    if (active.state === 'PROMISED') {
      // Wait for ACCEPT
      lastSeq = promiseLog.getLatestSeq();
      await waitAccept(promiseLog, active.promiseId, active.content ?? '', cwd, lastSeq);
      return;
    }
  } else {
    // Check for dirty working copy (crash recovery)
    try {
      const status = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' });
      if (status.trim()) {
        log('Dirty working copy detected (crash recovery). Resetting...');
        execFileSync('git', ['checkout', '--', '.'], { cwd });
      }
    } catch { /* not a git repo or git not available */ }
  }

  // ---- OBSERVE: scan for unpromised intents ----

  log('Observing intent space...');

  while (true) {
    const intents = promiseLog.getUnpromisedIntents();

    // Filter out intents from agents (prevent self-directed loops)
    const humanIntents = intents.filter(i => !i.senderId.startsWith('agent'));

    if (humanIntents.length > 0) {
      const intent = humanIntents[0]; // FIFO: oldest first
      log(`Found intent: ${intent.promiseId.slice(0, 8)} "${intent.payload.content}"`);

      // ---- PROMISE ----
      const plan = `I will implement: ${intent.payload.content}`;
      const msg = createPromise(AGENT_ID, intent.promiseId, plan);
      promiseLog.post(msg);
      log(`PROMISED on ${intent.promiseId.slice(0, 8)}: ${plan}`);

      lastSeq = promiseLog.getLatestSeq();
      await waitAccept(promiseLog, intent.promiseId, intent.payload.content ?? '', cwd, lastSeq);
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

/** Wait for ACCEPT, then proceed to WORK */
async function waitAccept(
  promiseLog: PromiseLog,
  promiseId: string,
  intentContent: string,
  cwd: string,
  lastSeq: number,
): Promise<void> {
  log(`Waiting for ACCEPT on ${promiseId.slice(0, 8)}...`);

  while (true) {
    const messages = promiseLog.getMessagesSince(lastSeq);
    for (const msg of messages) {
      lastSeq = Math.max(lastSeq, msg.seq);

      if (msg.promiseId !== promiseId) continue;

      if (msg.type === 'ACCEPT') {
        // Verify HMAC
        if (msg.hmac && !promiseLog.verifyHmac(msg, msg.hmac)) {
          log('WARNING: ACCEPT message has invalid HMAC. Ignoring.');
          continue;
        }
        log(`ACCEPTED by ${msg.senderId}`);
        await workPhase(promiseLog, promiseId, intentContent, cwd);
        return;
      }

      if (msg.type === 'RELEASE') {
        log('Promise RELEASED. Returning to observe.');
        promiseLog.close();
        process.exit(2); // Clean shutdown, supervisor won't rollback
      }
    }

    await sleep(1000);
  }
}

/** Do the work, post COMPLETE, wait for ASSESS */
async function workPhase(
  promiseLog: PromiseLog,
  promiseId: string,
  intentContent: string,
  cwd: string,
): Promise<void> {
  log(`Working on: "${intentContent}"`);

  const plan = `Implement: ${intentContent}`;
  const result = await doWork(intentContent, plan, cwd);

  log(`Work complete. Files changed: ${result.filesChanged.join(', ') || 'none'}`);

  const completeMsg = createComplete(AGENT_ID, promiseId, result.summary, result.filesChanged);
  promiseLog.post(completeMsg);
  log(`COMPLETED ${promiseId.slice(0, 8)}: ${result.summary.slice(0, 100)}`);

  const lastSeq = promiseLog.getLatestSeq();
  await waitAssess(promiseLog, promiseId, intentContent, cwd, lastSeq);
}

/** Wait for ASSESS, then commit or revise */
async function waitAssess(
  promiseLog: PromiseLog,
  promiseId: string,
  intentContent: string,
  cwd: string,
  lastSeq: number,
): Promise<void> {
  log(`Waiting for ASSESS on ${promiseId.slice(0, 8)}...`);

  while (true) {
    const messages = promiseLog.getMessagesSince(lastSeq);
    for (const msg of messages) {
      lastSeq = Math.max(lastSeq, msg.seq);

      if (msg.promiseId !== promiseId) continue;

      if (msg.type === 'ASSESS') {
        // Verify HMAC
        if (msg.hmac && !promiseLog.verifyHmac(msg, msg.hmac)) {
          log('WARNING: ASSESS message has invalid HMAC. Ignoring.');
          continue;
        }

        if (msg.payload.assessment === 'FULFILLED') {
          log('ASSESSED: FULFILLED. Committing and exiting.');
          await commitAndExit(promiseLog, promiseId, intentContent, cwd);
          return;
        } else {
          log(`ASSESSED: BROKEN. Reason: ${msg.payload.reason ?? 'none'}`);
          await revise(promiseLog, promiseId, intentContent, msg.payload.reason ?? '', cwd);
          return;
        }
      }
    }

    await sleep(1000);
  }
}

/** Commit source changes and exit(0) for supervisor restart */
async function commitAndExit(
  promiseLog: PromiseLog,
  promiseId: string,
  intentContent: string,
  cwd: string,
): Promise<void> {
  try {
    // Stage changed files
    const status = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' });
    if (status.trim()) {
      execFileSync('git', ['add', '-A'], { cwd });
      execFileSync('git', ['commit', '-m', `loop: ${intentContent}`], { cwd });
      log('Source committed.');
    } else {
      log('No changes to commit.');
    }
  } catch (err) {
    log(`Commit failed: ${err}`);
  }

  promiseLog.close();
  process.exit(0);
}

/** REVISE: create a new promise with feedback, wait for new ACCEPT */
async function revise(
  promiseLog: PromiseLog,
  promiseId: string,
  intentContent: string,
  feedback: string,
  cwd: string,
): Promise<void> {
  const revisedPlan = `Revising based on feedback: ${feedback}. Will re-implement: ${intentContent}`;
  const msg = createRevise(AGENT_ID, promiseId, revisedPlan);
  promiseLog.post(msg);
  log(`REVISED: new promise ${msg.promiseId.slice(0, 8)}`);

  // New promise needs its own ACCEPT
  const lastSeq = promiseLog.getLatestSeq();
  await waitAccept(promiseLog, msg.promiseId, intentContent, cwd, lastSeq);
}

// ---- Entry point ----
main().catch(err => {
  console.error('[agent] Fatal error:', err);
  process.exit(1);
});
