/**
 * Agent — the autonomous observer-promisor.
 *
 * Promise Theory role: autonomous agent A.
 * Makes give-promises (+b) voluntarily.
 * Can decline intents it cannot handle.
 *
 * Generalized to target any repository:
 *   - self mode: guards its own source, exits(0) after commit for supervisor restart
 *   - external mode: guards a target repo, loops back to observe after commit
 *
 * Configuration via environment variables:
 *   DIFFER_AGENT_ID  — UUID identity (default: 'agent')
 *   DIFFER_TARGET_DIR — path to target repo (default: cwd)
 *   DIFFER_MODE       — 'self' or 'external' (default: 'self')
 *
 * Observes the intent space via IntentSpaceClient:
 *   - Scans project sub-space + root from persisted cursor
 *   - Listens for echoed intents in real-time
 *   - Degrades to cached intents when space disconnects
 *   - Reconnects with exponential backoff
 *
 * Exit codes:
 *   0 — Source committed, supervisor should restart (self mode)
 *   2 — Clean shutdown, no more work
 *   1 — Error (supervisor will restart with backoff)
 */

import { execFileSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { PromiseLog, INTENT_SOCKET_PATH } from './promise-log.ts';
import { createPromise, createComplete, createRevise, createDecline, createRelease } from '@differ/itp/src/protocol.ts';
import type { ITPMessage, ProjectContext } from '@differ/itp/src/types.ts';
import { IntentSpaceClient } from '@differ/intent-space/src/client.ts';
import type { StoredIntent } from '@differ/intent-space/src/types.ts';
import { doWork } from './work.ts';
import { printBanner } from './banner.ts';
import { query } from '@anthropic-ai/claude-agent-sdk';

// ---- Configuration from environment ----

const agentId = process.env.DIFFER_AGENT_ID ?? 'agent';
const targetDir = process.env.DIFFER_TARGET_DIR ?? process.cwd();
const mode: 'self' | 'external' = (process.env.DIFFER_MODE as 'self' | 'external') ?? 'self';
const projectSpaceId = basename(targetDir);
let projectionClient: IntentSpaceClient | null = null;

const RECONNECT_DELAYS = [5_000, 10_000, 30_000, 60_000]; // Backoff schedule

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg: string): void {
  console.log(`[agent] ${msg}`);
}

function projectToIntentSpace(client: IntentSpaceClient | null, msg: ITPMessage, intentId: string): void {
  if (!client) return;
  try {
    client.post({ ...msg, parentId: intentId });
  } catch (err) {
    log(`Intent space projection failed (non-fatal): ${err}`);
  }
}

// ---- Project Context ----

/** Parse simple YAML frontmatter from a markdown file */
function parseFrontmatter(content: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return result;

  const lines = match[1].split('\n');
  let currentKey = '';
  let inList = false;

  for (const line of lines) {
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value === '') {
        // Could be start of a list
        inList = true;
        result[currentKey] = [];
      } else {
        inList = false;
        result[currentKey] = value;
      }
    } else if (inList && line.match(/^\s+-\s+(.+)$/)) {
      const listItem = line.match(/^\s+-\s+(.+)$/)![1];
      (result[currentKey] as string[]).push(listItem);
    }
  }

  return result;
}

/** Load project context from .differ/intent.md in the target repo */
function loadProjectContext(dir: string): ProjectContext {
  const intentPath = join(dir, '.differ', 'intent.md');

  if (!existsSync(intentPath)) {
    return {
      name: basename(dir),
      language: 'unknown',
      description: '',
      constraints: [],
      frameworks: [],
    };
  }

  const content = readFileSync(intentPath, 'utf-8');
  const fm = parseFrontmatter(content);

  // Extract markdown body (after frontmatter)
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const body = bodyMatch?.[1]?.trim() ?? '';

  return {
    name: (fm.name as string) ?? basename(dir),
    language: (fm.language as string) ?? 'unknown',
    description: body,
    constraints: Array.isArray(fm.constraints) ? fm.constraints : [],
    buildCommand: fm.build_command as string | undefined,
    testCommand: fm.test_command as string | undefined,
    projectType: fm.project_type as string | undefined,
    frameworks: Array.isArray(fm.frameworks) ? fm.frameworks : [],
  };
}

/** Auto-generate .differ/intent.md via a 1-turn LLM call */
async function generateIntentDoc(dir: string): Promise<ProjectContext> {
  log('No .differ/intent.md found. Auto-generating project context...');

  // Gather project signals
  const signals: string[] = [];
  const tryRead = (file: string) => {
    const p = join(dir, file);
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf-8');
      signals.push(`--- ${file} ---\n${content.slice(0, 2000)}\n`);
    }
  };

  tryRead('package.json');
  tryRead('Cargo.toml');
  tryRead('go.mod');
  tryRead('requirements.txt');
  tryRead('pyproject.toml');
  tryRead('README.md');

  // List top-level files
  try {
    const ls = execFileSync('ls', ['-1'], { cwd: dir, encoding: 'utf-8' });
    signals.push(`--- directory listing ---\n${ls}\n`);
  } catch { /* ignore */ }

  const prompt = `Analyze this project and generate a .differ/intent.md file with YAML frontmatter.

Project files:
${signals.join('\n')}

Generate EXACTLY this format (nothing else):

---
name: <project-name>
language: <primary-language>
build_command: <build command or empty>
test_command: <test command or empty>
project_type: <type like web-api, cli, library, etc>
frameworks:
  - <framework1>
constraints:
  - <constraint1>
---

# <Project Name>

<2-3 sentence description of what this project does>

## Key Conventions

<Brief notes on code organization and conventions>`;

  let resultText = '';

  try {
    for await (const message of query({
      prompt,
      options: {
        cwd: dir,
        allowedTools: [],
        maxTurns: 1,
        systemPrompt: 'You are a concise project analyzer. Output only the requested markdown format, nothing else.',
      },
    })) {
      if (message.type === 'result' && message.subtype === 'success') {
        resultText = message.result;
      }
    }
  } catch (err) {
    log(`Intent doc generation failed: ${err}. Using defaults.`);
    return loadProjectContext(dir);
  }

  if (resultText) {
    const differDir = join(dir, '.differ');
    mkdirSync(differDir, { recursive: true });
    writeFileSync(join(differDir, 'intent.md'), resultText);
    log('Generated .differ/intent.md');

    // Commit the intent doc to the target repo
    try {
      execFileSync('git', ['add', '.differ/intent.md'], { cwd: dir });
      execFileSync('git', ['commit', '-m', 'differ: initialize project intent document'], { cwd: dir });
      log('Committed .differ/intent.md to target repo.');
    } catch (err) {
      log(`Could not commit intent doc: ${err}`);
    }
  }

  return loadProjectContext(dir);
}

// ---- Deliberation ----

/**
 * Dynamic scope check based on project context.
 * Returns a decline reason string if out of scope, or null if it passes.
 */
function scopeCheck(intentContent: string, ctx: ProjectContext): string | null {
  const lower = intentContent.toLowerCase();

  // Check for destructive operations
  if (/\b(delete|drop|rm\s+-rf|destroy|wipe|purge|truncate)\b.*\b(repo(?:sitory)?|database|db|schema|table|collection|bucket)\b/i.test(intentContent)) {
    return 'Destructive operations against the repository or databases are not permitted.';
  }

  // Check for external services the agent has no access to
  if (/\b(send\s+(?:an?\s+)?email|send\s+sms|post\s+to\s+(?:twitter|x\.com|slack|discord|telegram)|deploy\s+to\s+(?:aws|gcp|azure|heroku|vercel|fly\.io|production|staging)|push\s+to\s+remote|publish\s+to\s+npm)\b/i.test(intentContent)) {
    return 'This agent cannot interact with external services it has no access to.';
  }

  // Check for files outside the project root
  if (/outside\s+the\s+project|modify\s+files?\s+outside|\.\.[/\\]/i.test(intentContent)) {
    return 'This agent cannot modify files outside the project root.';
  }

  // Language mismatch check (only if project language is known)
  if (ctx.language && ctx.language !== 'unknown') {
    const otherLangs = ['python', 'ruby', 'golang', 'rust', 'java', 'c++', 'c#', 'php', 'swift', 'kotlin', 'scala', 'haskell', 'elixir', 'clojure', 'lua', 'perl', 'fortran'];
    const projectLang = ctx.language.toLowerCase();
    for (const lang of otherLangs) {
      if (lang === projectLang) continue;
      // Check if intent explicitly asks to work in a different language
      const langRegex = new RegExp(`\\b(write|build|create|implement)\\s+.*\\b${lang}\\b`, 'i');
      if (langRegex.test(intentContent)) {
        return `This agent works on a ${ctx.language} project. The intent appears to target ${lang}.`;
      }
    }
  }

  // Check against project constraints
  for (const constraint of ctx.constraints) {
    // Simple keyword matching against constraints
    if (constraint.toLowerCase().includes('do not') || constraint.toLowerCase().includes('never')) {
      // Extract the action from the constraint
      const action = constraint.replace(/^(do not|never)\s+/i, '').toLowerCase();
      if (lower.includes(action.slice(0, 20))) {
        return `Project constraint violated: ${constraint}`;
      }
    }
  }

  return null;
}

/**
 * Lightweight LLM viability check via the Claude Agent SDK (maxTurns: 1).
 * Uses project context for a relevant prompt.
 */
async function viabilityCheck(
  intentContent: string,
  dir: string,
  ctx: ProjectContext,
): Promise<{ viable: boolean; reason: string }> {
  const projectDesc = ctx.description
    ? `${ctx.name}: ${ctx.description.slice(0, 200)}`
    : `${ctx.name} (a ${ctx.language} project)`;

  const prompt =
    `Given this codebase (${projectDesc}), can you realistically implement this intent?\n\n` +
    `Intent: ${intentContent}\n\n` +
    `Reply YES or NO with a one-sentence reason.`;

  let resultText = '';

  try {
    for await (const message of query({
      prompt,
      options: {
        cwd: dir,
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

  const firstWord = resultText.trim().split(/\s+/)[0].toUpperCase();
  const viable = firstWord === 'YES';
  const reason = resultText.trim();

  return { viable, reason };
}

// ---- Intent Queue & Filtering ----

/** Check if an intent should be processed by this agent */
function shouldProcess(intent: StoredIntent, promiseLog: PromiseLog): boolean {
  if (intent.type !== 'INTENT' || !intent.intentId) return false;
  // Exclude service intents (deterministic IDs like 'intent-space:persist')
  if (intent.intentId.includes(':')) return false;
  // Exclude agent-generated intents (prevent self-directed loops)
  if (intent.senderId.startsWith('agent')) return false;
  // Exclude already-fulfilled intents
  if (promiseLog.isIntentFulfilled(intent.intentId)) return false;
  // Exclude intents this agent already acted on
  const existing = promiseLog.getPromisesForIntent(intent.intentId);
  if (existing.some(p => p.agentId === agentId)) return false;
  return true;
}

// ---- Main Loop ----

async function main(): Promise<void> {
  printBanner();

  const now = new Date();
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  log(`Starting — ${timeStr}`);
  log(`Agent ID: ${agentId}`);
  log(`Target: ${targetDir}`);
  log(`Mode: ${mode}`);
  log(`Space ID: ${projectSpaceId}`);

  const promiseLog = new PromiseLog();

  // Load or generate project context
  let ctx: ProjectContext;
  if (!existsSync(join(targetDir, '.differ', 'intent.md'))) {
    ctx = await generateIntentDoc(targetDir);
  } else {
    ctx = loadProjectContext(targetDir);
  }
  log(`Project: ${ctx.name} (${ctx.language})`);

  let lastSeq = promiseLog.getLatestSeq();

  // ---- Boot: derive state from promise log ----

  const active = promiseLog.getActivePromiseForAgent(agentId);

  if (active) {
    log(`Resuming active promise ${active.promiseId.slice(0, 8)} in state ${active.state}`);

    if (active.state === 'ACCEPTED') {
      await workPhase(promiseLog, active.promiseId, active.intentId, active.content ?? '', targetDir, ctx);
      if (mode === 'self') return;
      // external mode: fall through to observe loop
    } else if (active.state === 'COMPLETED') {
      lastSeq = promiseLog.getLatestSeq();
      await waitAssess(promiseLog, active.promiseId, active.intentId, active.content ?? '', targetDir, ctx, lastSeq);
      if (mode === 'self') return;
    } else if (active.state === 'PROMISED') {
      lastSeq = promiseLog.getLatestSeq();
      await waitAccept(promiseLog, active.promiseId, active.intentId, active.content ?? '', targetDir, ctx, lastSeq);
      if (mode === 'self') return;
    }
  } else {
    // Check for dirty working copy
    // Source is never rolled back — partial edits from a crash are preserved.
    // For external-mode: refuse to work on a dirty target (user's uncommitted changes).
    if (mode === 'external') {
      try {
        const status = execFileSync('git', ['status', '--porcelain'], { cwd: targetDir, encoding: 'utf-8' });
        if (status.trim()) {
          log('Target repo has uncommitted changes. Will observe but not work until clean.');
        }
      } catch { /* not a git repo or git not available */ }
    }
  }

  // ---- OBSERVE: connect to intent space ----

  log('Observing intent space...');

  const intentQueue: StoredIntent[] = [];
  let connected = false;
  let intentClient: IntentSpaceClient | null = null;

  async function connectToSpace(): Promise<boolean> {
    try {
      intentClient = new IntentSpaceClient(INTENT_SOCKET_PATH);

      intentClient.on('intent', (echo) => {
        // Echo is an IntentEcho — ITPMessage & { seq: number }
        const stored: StoredIntent = {
          type: echo.type,
          intentId: echo.intentId!,
          parentId: echo.parentId ?? 'root',
          senderId: echo.senderId,
          payload: echo.payload as Record<string, unknown>,
          seq: echo.seq,
          timestamp: echo.timestamp,
        };
        if (shouldProcess(stored, promiseLog)) {
          log(`Echo: ${stored.intentId!.slice(0, 8)} "${stored.payload.content ?? ''}"`);
          intentQueue.push(stored);
        }
      });

      intentClient.on('disconnect', () => {
        connected = false;
        projectionClient = null;
        log('Intent space disconnected. Working from cached intents.');
        attemptReconnect();
      });

      await intentClient.connect();
      connected = true;
      projectionClient = intentClient;
      log('Connected to intent space.');

      // Scan project sub-space + root from persisted cursors
      const projectCursor = promiseLog.getCursor(agentId, projectSpaceId);
      const rootCursor = promiseLog.getCursor(agentId, 'root');

      const projectIntents = await intentClient.scan(projectSpaceId, projectCursor);
      const rootIntents = await intentClient.scan('root', rootCursor);

      for (const intent of projectIntents) {
        if (shouldProcess(intent, promiseLog)) intentQueue.push(intent);
      }
      for (const intent of rootIntents) {
        if (shouldProcess(intent, promiseLog)) intentQueue.push(intent);
      }

      // Persist cursor (latestSeq is tracked by the client across all scans)
      const latestSeq = intentClient.latestSeq;
      promiseLog.setCursor(agentId, projectSpaceId, latestSeq);
      promiseLog.setCursor(agentId, 'root', latestSeq);

      log(`Loaded ${intentQueue.length} open intents from intent space.`);
      return true;
    } catch (err) {
      log(`Cannot connect to intent space: ${err}`);
      connected = false;
      return false;
    }
  }

  function attemptReconnect(): void {
    let attempt = 0;
    const tryReconnect = async () => {
      if (connected) return;
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      log(`Reconnecting in ${delay / 1000}s (attempt ${attempt + 1})...`);
      await sleep(delay);
      if (connected) return;
      attempt++;
      const ok = await connectToSpace();
      if (!ok) tryReconnect();
    };
    tryReconnect();
  }

  // Initial connection
  const initialConnected = await connectToSpace();
  if (!initialConnected) {
    log('Starting in degraded mode (no intent space).');
    attemptReconnect();
  }

  // Serial processing loop — drain queue one intent at a time
  while (true) {
    if (intentQueue.length === 0) {
      await sleep(500);
      continue;
    }

    const intent = intentQueue.shift()!;

    // Re-check filters (state may have changed since queued)
    if (!shouldProcess(intent, promiseLog)) continue;
    const intentId = intent.intentId!;

    const intentContent = (intent.payload.content as string) ?? '';
    const iid = intentId.slice(0, 8);

    log(`Found intent: ${iid} "${intentContent}"`);

    // Mirror intent into PromiseLog before any action (satisfies FK constraint)
    promiseLog.ensureIntent({
      intentId,
      senderId: intent.senderId,
      content: intentContent,
      criteria: intent.payload.criteria as string | undefined,
      timestamp: intent.timestamp,
    });

    // ---- DELIBERATE: scope check ----
    const scopeFailReason = scopeCheck(intentContent, ctx);
    if (scopeFailReason) {
      log(`[deliberate] Scope check FAILED for ${iid}: ${scopeFailReason}`);
      const declineMsg = createDecline(agentId, intentId, scopeFailReason);
      promiseLog.post(declineMsg);
      projectToIntentSpace(projectionClient, declineMsg, intentId);
      log(`DECLINED ${iid}: ${scopeFailReason}`);
      continue;
    }

    log(`[deliberate] Scope check passed for ${iid}`);

    // Check target repo is clean before promising (external mode)
    if (mode === 'external') {
      try {
        const status = execFileSync('git', ['status', '--porcelain'], { cwd: targetDir, encoding: 'utf-8' });
        if (status.trim()) {
          log(`Target repo dirty — skipping intent ${iid}`);
          continue;
        }
      } catch { /* ignore */ }
    }

    // ---- DELIBERATE: LLM viability check ----
    log(`[deliberate] Running viability check for ${iid}...`);
    const { viable, reason } = await viabilityCheck(intentContent, targetDir, ctx);

    if (!viable) {
      log(`[deliberate] Viability check FAILED for ${iid}: ${reason}`);
      const declineMsg = createDecline(agentId, intentId, reason);
      promiseLog.post(declineMsg);
      projectToIntentSpace(projectionClient, declineMsg, intentId);
      log(`DECLINED ${iid}: ${reason}`);
      continue;
    }

    log(`[deliberate] Viability check PASSED for ${iid}: ${reason}`);

    // ---- PROMISE ----
    const plan = `I will implement: ${intentContent}`;
    const msg = createPromise(agentId, intentId, plan);
    promiseLog.post(msg);
    projectToIntentSpace(projectionClient, msg, intentId);
    log(`PROMISED on ${iid}: ${plan}`);

    lastSeq = promiseLog.getLatestSeq();
    await waitAccept(promiseLog, msg.promiseId!, intentId, intentContent, targetDir, ctx, lastSeq);

    if (mode === 'self') return;
    // external mode: continue processing queue
  }
}

/** Wait for ACCEPT, then proceed to WORK */
async function waitAccept(
  promiseLog: PromiseLog,
  promiseId: string,
  intentId: string,
  intentContent: string,
  dir: string,
  ctx: ProjectContext,
  lastSeq: number,
): Promise<void> {
  log(`Waiting for ACCEPT on ${promiseId.slice(0, 8)}...`);

  while (true) {
    const messages = promiseLog.getMessagesSince(lastSeq);
    for (const msg of messages) {
      lastSeq = Math.max(lastSeq, msg.seq);

      if (msg.type === 'ACCEPT' && msg.promiseId === promiseId) {
        // Verify HMAC
        if (msg.hmac && !promiseLog.verifyHmac(msg, msg.hmac)) {
          log('WARNING: ACCEPT message has invalid HMAC. Ignoring.');
          continue;
        }
        log(`ACCEPTED by ${msg.senderId}`);
        await workPhase(promiseLog, promiseId, intentId, intentContent, dir, ctx);
        return;
      }

      // Self-release if another agent's promise was accepted for the same intent
      if (msg.type === 'ACCEPT' && msg.promiseId !== promiseId) {
        const otherPromise = promiseLog.getPromiseState(msg.promiseId!);
        if (otherPromise && otherPromise.intentId === intentId) {
          const releaseMsg = createRelease(agentId, promiseId, 'Another agent was accepted');
          promiseLog.post(releaseMsg);
          projectToIntentSpace(projectionClient, releaseMsg, intentId);
          log('Another agent accepted for this intent. Self-releasing.');
          return;
        }
      }

      if (msg.type === 'RELEASE' && msg.promiseId === promiseId) {
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
  intentId: string,
  intentContent: string,
  dir: string,
  ctx: ProjectContext,
): Promise<void> {
  log(`Working on: "${intentContent}"`);

  const plan = `Implement: ${intentContent}`;
  const result = await doWork(intentContent, plan, dir, ctx);

  log(`Work complete. Files changed: ${result.filesChanged.join(', ') || 'none'}`);

  const completeMsg = createComplete(agentId, promiseId, result.summary, result.filesChanged);
  promiseLog.post(completeMsg);
  projectToIntentSpace(projectionClient, completeMsg, intentId);
  log(`COMPLETED ${promiseId.slice(0, 8)}: ${result.summary.slice(0, 100)}`);

  const lastSeq = promiseLog.getLatestSeq();
  await waitAssess(promiseLog, promiseId, intentId, intentContent, dir, ctx, lastSeq);
}

/** Wait for ASSESS, then commit or revise */
async function waitAssess(
  promiseLog: PromiseLog,
  promiseId: string,
  intentId: string,
  intentContent: string,
  dir: string,
  ctx: ProjectContext,
  lastSeq: number,
): Promise<void> {
  log(`Waiting for ASSESS on ${promiseId.slice(0, 8)}...`);

  while (true) {
    const messages = promiseLog.getMessagesSince(lastSeq);
    for (const msg of messages) {
      lastSeq = Math.max(lastSeq, msg.seq);

      if (msg.promiseId !== promiseId) continue;

      if (msg.type === 'ASSESS') {
        if (msg.hmac && !promiseLog.verifyHmac(msg, msg.hmac)) {
          log('WARNING: ASSESS message has invalid HMAC. Ignoring.');
          continue;
        }

        if (msg.payload.assessment === 'FULFILLED') {
          log('ASSESSED: FULFILLED. Committing.');
          await commitPhase(promiseLog, promiseId, intentContent, dir, ctx);
          return;
        } else {
          log(`ASSESSED: BROKEN. Reason: ${msg.payload.reason ?? 'none'}`);
          await revise(promiseLog, promiseId, intentId, intentContent, msg.payload.reason ?? '', dir, ctx);
          return;
        }
      }
    }

    await sleep(1000);
  }
}

/** Commit changes. Self-mode exits; external-mode returns. */
async function commitPhase(
  promiseLog: PromiseLog,
  promiseId: string,
  intentContent: string,
  dir: string,
  ctx: ProjectContext,
): Promise<void> {
  try {
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf-8' });
    if (status.trim()) {
      execFileSync('git', ['add', '-A'], { cwd: dir });
      execFileSync('git', ['commit', '-m', `${ctx.name}: ${intentContent}`], { cwd: dir });
      log('Source committed.');
    } else {
      log('No changes to commit.');
    }
  } catch (err) {
    log(`Commit failed: ${err}`);
  }

  if (mode === 'self') {
    promiseLog.close();
    process.exit(0);
  }
  // external mode: return to caller, which loops back to observe
}

/** REVISE: create a new promise with feedback, wait for new ACCEPT */
async function revise(
  promiseLog: PromiseLog,
  promiseId: string,
  intentId: string,
  intentContent: string,
  feedback: string,
  dir: string,
  ctx: ProjectContext,
): Promise<void> {
  const revisedPlan = `Revising based on feedback: ${feedback}. Will re-implement: ${intentContent}`;
  const msg = createRevise(agentId, promiseId, intentId, revisedPlan);
  promiseLog.post(msg);
  projectToIntentSpace(projectionClient, msg, intentId);
  log(`REVISED: new promise ${msg.promiseId!.slice(0, 8)}`);

  const lastSeq = promiseLog.getLatestSeq();
  await waitAccept(promiseLog, msg.promiseId!, intentId, intentContent, dir, ctx, lastSeq);
}

// ---- Entry point ----
main().catch(err => {
  console.error('[agent] Fatal error:', err);
  process.exit(1);
});
