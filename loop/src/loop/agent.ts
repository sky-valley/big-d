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
import { createPromise, createComplete, createRevise, createDecline } from '../itp/protocol.ts';
import type { StoredMessage } from './promise-log.ts';
import { doWork } from './work.ts';
import { printBanner } from './banner.ts';
import { query } from '@anthropic-ai/claude-agent-sdk';

const AGENT_ID = 'agent';
const POLL_INTERVAL_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg: string): void {
  console.log(`[agent] ${msg}`);
}

// ---- Deliberation helpers ----

/** Patterns that are unambiguously outside this agent's scope */
const OUT_OF_SCOPE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    // Non-TypeScript languages
    pattern: /\b(python|ruby|golang|rust|java(?:script\s+only)?|c\+\+|c#|php|swift|kotlin|scala|haskell|elixir|clojure|lua|perl|r\s+language|fortran)\b/i,
    reason: 'This agent only works with TypeScript. The intent appears to target a different language.',
  },
  {
    // Files outside the project root
    pattern: /outside\s+the\s+project|modify\s+files?\s+outside|\.\.[/\\]/i,
    reason: 'This agent cannot modify files outside the project root.',
  },
  {
    // Destructive repo/database operations
    pattern: /\b(delete|drop|rm\s+-rf|destroy|wipe|purge|truncate)\b.*\b(repo(?:sitory)?|database|db|schema|table|collection|bucket)\b/i,
    reason: 'Destructive operations against the repository or databases are not permitted.',
  },
  {
    // External services this agent has no credentials for
    pattern: /\b(send\s+(?:an?\s+)?email|send\s+sms|post\s+to\s+(?:twitter|x\.com|slack|discord|telegram)|deploy\s+to\s+(?:aws|gcp|azure|heroku|vercel|fly\.io|production|staging)|push\s+to\s+remote|publish\s+to\s+npm)\b/i,
    reason: 'This agent cannot interact with external services it has no access to.',
  },
  {
    // Completely unrelated domains
    pattern: /\b(build\s+(?:a\s+)?(?:mobile\s+app|ios\s+app|android\s+app|unity\s+game|video\s+game)|train\s+(?:a\s+)?(?:ml\s+)?model|fine[- ]tun(?:e|ing)|web\s+scraper\s+for|stock\s+trading\s+bot|mine\s+(?:bitcoin|crypto))\b/i,
    reason: 'This request is unrelated to the self-modifying agent loop for coordinating code changes through Promise Theory.',
  },
];

/**
 * Synchronous scope check.
 * Returns a decline reason string if out of scope, or null if it passes.
 */
function scopeCheck(intentContent: string): string | null {
  for (const { pattern, reason } of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(intentContent)) {
      return reason;
    }
  }
  return null;
}

/**
 * Lightweight LLM viability check via the Claude Agent SDK (maxTurns: 1).
 * Asks Claude whether the intent is realistically implementable in this codebase.
 * Returns { viable: boolean; reason: string }.
 */
async function viabilityCheck(
  intentContent: string,
  cwd: string,
): Promise<{ viable: boolean; reason: string }> {
  const prompt =
    `Given this codebase and its purpose as a self-modifying agent loop for coordinating ` +
    `code changes through Promise Theory, can you realistically implement this intent?\n\n` +
    `Intent: ${intentContent}\n\n` +
    `Reply YES or NO with a one-sentence reason.`;

  let resultText = '';

  try {
    for await (const message of query({
      prompt,
      options: {
        cwd,
        allowedTools: [],
        maxTurns: 1,
        systemPrompt: 'You are a concise technical advisor. Reply only YES or NO followed by one sentence.',
      },
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        resultText = message.result;
      }
    }
  } catch (err) {
    log(`Viability check LLM call failed: ${err}. Proceeding conservatively.`);
    return { viable: true, reason: 'LLM check unavailable; scope passed so proceeding.' };
  }

  if (!resultText) {
    log('Viability check returned no text. Proceeding conservatively.');
    return { viable: true, reason: 'Empty LLM response; scope passed so proceeding.' };
  }

  // Parse: first word of the response should be YES or NO
  const firstWord = resultText.trim().split(/\s+/)[0].toUpperCase();
  const viable = firstWord === 'YES';
  const reason = resultText.trim();

  return { viable, reason };
}

async function main(): Promise<void> {
  printBanner();

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
      const intentContent = intent.payload.content ?? '';
      log(`Found intent: ${intent.promiseId.slice(0, 8)} "${intentContent}"`);

      // ---- DELIBERATE: synchronous scope check ----
      const scopeFailReason = scopeCheck(intentContent);
      if (scopeFailReason) {
        log(`[deliberate] Scope check FAILED for ${intent.promiseId.slice(0, 8)}: ${scopeFailReason}`);
        const declineMsg = createDecline(AGENT_ID, intent.promiseId, scopeFailReason);
        promiseLog.post(declineMsg);
        log(`DECLINED ${intent.promiseId.slice(0, 8)}: ${scopeFailReason}`);
      } else {
        log(`[deliberate] Scope check passed for ${intent.promiseId.slice(0, 8)}`);

        // ---- DELIBERATE: LLM viability check ----
        log(`[deliberate] Running viability check for ${intent.promiseId.slice(0, 8)}...`);
        const { viable, reason } = await viabilityCheck(intentContent, cwd);

        if (!viable) {
          log(`[deliberate] Viability check FAILED for ${intent.promiseId.slice(0, 8)}: ${reason}`);
          const declineMsg = createDecline(AGENT_ID, intent.promiseId, reason);
          promiseLog.post(declineMsg);
          log(`DECLINED ${intent.promiseId.slice(0, 8)}: ${reason}`);
        } else {
          log(`[deliberate] Viability check PASSED for ${intent.promiseId.slice(0, 8)}: ${reason}`);

          // ---- PROMISE ----
          const plan = `I will implement: ${intentContent}`;
          const msg = createPromise(AGENT_ID, intent.promiseId, plan);
          promiseLog.post(msg);
          log(`PROMISED on ${intent.promiseId.slice(0, 8)}: ${plan}`);

          lastSeq = promiseLog.getLatestSeq();
          await waitAccept(promiseLog, intent.promiseId, intentContent, cwd, lastSeq);
        }
      }
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
        return;
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
