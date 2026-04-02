#!/usr/bin/env node
/**
 * Loop CLI — Human interface for the promise protocol.
 *
 * Promise Theory role: human agent H.
 * Can only make promises about its own behavior:
 *   - INTENT: declare desired outcomes
 *   - ACCEPT: commit to using promised work (-b use-promise)
 *   - ASSESS: judge completion
 */

import { Command } from 'commander';
import { execFileSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { resolve, basename } from 'path';
import {
  PromiseLog,
  DEFAULT_DB_PATH,
  HMAC_KEY_PATH,
  INTENT_SOCKET_PATH,
  generateHmacKey,
  signMessage,
  archiveOldDb,
} from './promise-log.ts';
import {
  createIntent,
  createAccept,
  createAssess,
  createRelease,
} from '@differ/itp/src/protocol.ts';
import type { AssessmentResult } from '@differ/itp/src/types.ts';
import { TERMINAL_STATES } from '@differ/itp/src/types.ts';
import { IntentSpaceClient } from '@differ/tcp-reference-station/src/client.ts';
import { runSupervisor } from './supervisor.ts';
import { printBanner } from './banner.ts';

const program = new Command();

program
  .name('loop')
  .description('Differ — adaptive agent loop, promise protocol CLI')
  .version('0.1.0');

// ============ init ============

program
  .command('init')
  .description('Initialize promise log and HMAC key (archives old DB)')
  .option('--json', 'Output JSON')
  .action((opts) => {
    // Clean schema break: archive old DB if it exists
    const archived = archiveOldDb();

    const log = new PromiseLog();
    log.close();

    if (!existsSync(HMAC_KEY_PATH)) {
      generateHmacKey();
    }

    if (opts.json) {
      console.log(JSON.stringify({ status: 'initialized', dbPath: DEFAULT_DB_PATH, hmacKeyPath: HMAC_KEY_PATH }));
    } else {
      if (archived) console.log(`Archived old database to ${archived}`);
      console.log('Initialized promise log:', DEFAULT_DB_PATH);
      console.log('HMAC key:', HMAC_KEY_PATH);
    }
  });

// ============ add ============

program
  .command('add <path>')
  .description('Register a repository with Differ')
  .option('--name <name>', 'Human-readable project name')
  .option('--mode <mode>', 'Agent mode: self or external', 'external')
  .option('--json', 'Output JSON')
  .action((path: string, opts) => {
    const absPath = resolve(path);

    // Validate directory exists
    if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
      const err = `Not a directory: ${absPath}`;
      if (opts.json) console.log(JSON.stringify({ error: err }));
      else console.error(err);
      process.exit(1);
    }

    // Validate it's a git repo
    try {
      execFileSync('git', ['status'], { cwd: absPath, stdio: 'pipe' });
    } catch {
      const err = `Not a git repository: ${absPath}`;
      if (opts.json) console.log(JSON.stringify({ error: err }));
      else console.error(err);
      process.exit(1);
    }

    const log = new PromiseLog();

    // Check not already registered
    const existing = log.getProjectByPath(absPath);
    if (existing) {
      const err = `Already registered: ${existing.name ?? existing.projectId} (${absPath})`;
      if (opts.json) console.log(JSON.stringify({ error: err }));
      else console.error(err);
      log.close();
      process.exit(1);
    }

    const project = log.registerProject(absPath, opts.mode, opts.name);
    log.close();

    if (opts.json) {
      console.log(JSON.stringify(project));
    } else {
      console.log(`Registered: ${project.name}`);
      console.log(`  Path:     ${project.repoPath}`);
      console.log(`  Mode:     ${project.mode}`);
      console.log(`  Agent ID: ${project.agentId.slice(0, 8)}`);
    }
  });

// ============ remove ============

program
  .command('remove <nameOrId>')
  .description('Remove a registered repository')
  .option('--json', 'Output JSON')
  .action((nameOrId: string, opts) => {
    const log = new PromiseLog();
    const project = log.getProject(nameOrId);

    if (!project) {
      const err = `Project not found: ${nameOrId}`;
      if (opts.json) console.log(JSON.stringify({ error: err }));
      else console.error(err);
      log.close();
      process.exit(1);
    }

    // Release any active promises for this agent
    const active = log.getActivePromiseForAgent(project.agentId);
    if (active) {
      const releaseMsg = createRelease(project.agentId, active.promiseId, 'Project removed');
      const hmac = signMessage(releaseMsg);
      log.post(releaseMsg, hmac ?? undefined);
    }

    log.removeProject(project.projectId);
    log.close();

    if (opts.json) {
      console.log(JSON.stringify({ removed: project.projectId, name: project.name }));
    } else {
      console.log(`Removed: ${project.name} (${project.repoPath})`);
    }
  });

// ============ projects ============

program
  .command('projects')
  .description('List registered projects')
  .option('--json', 'Output JSON')
  .action((opts) => {
    const log = new PromiseLog();
    const projects = log.getAllProjects();
    log.close();

    if (opts.json) {
      console.log(JSON.stringify({ projects }));
      return;
    }

    if (projects.length === 0) {
      console.log('No projects registered. Use `differ add <path>` to register one.');
      return;
    }

    console.log('Projects:\n');
    for (const p of projects) {
      const agentShort = p.agentId.slice(0, 8);
      console.log(`  ${p.name ?? '(unnamed)'}  ${p.repoPath}  ${p.mode}  agent-${agentShort}`);
    }
  });

// ============ intent ============

program
  .command('intent <content>')
  .description('Post an INTENT — declare a desired outcome')
  .option('--criteria <criteria>', 'Acceptance criteria')
  .option('--target <path>', 'Target repository hint')
  .option('--sender <id>', 'Sender identity', 'human')
  .option('--json', 'Output JSON')
  .action(async (content: string, opts) => {
    const targetRepo = opts.target ? resolve(opts.target) : undefined;
    const projectSpaceId = opts.target
      ? basename(resolve(opts.target))
      : 'root';

    const msg = createIntent(opts.sender, content, opts.criteria, targetRepo, projectSpaceId);

    // Post to intent space — the canonical store of desire
    try {
      const client = new IntentSpaceClient(INTENT_SOCKET_PATH);
      client.on('error', () => {}); // Suppress EventEmitter crash — we handle via try/catch
      await client.connect();
      client.post(msg);
      // Wait for echo to confirm persistence
      await new Promise(r => setTimeout(r, 200));
      client.disconnect();
    } catch {
      const err = 'Intent space not running. Start it with: cd tcp-reference-station && npm start';
      if (opts.json) {
        console.log(JSON.stringify({ error: err }));
      } else {
        console.error(err);
      }
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify({ intentId: msg.intentId, type: 'INTENT' }));
    } else {
      console.log(`INTENT posted: ${msg.intentId}`);
      console.log(`  "${content}"`);
      if (targetRepo) {
        console.log(`  target: ${targetRepo} (space: ${projectSpaceId})`);
      }
    }
  });

// ============ accept ============

program
  .command('accept <promiseId>')
  .description('ACCEPT a promise — commit to using the work (-b use-promise)')
  .option('--sender <id>', 'Sender identity', 'human')
  .option('--json', 'Output JSON')
  .action((promiseIdPrefix: string, opts) => {
    const log = new PromiseLog();
    let promiseId: string;
    try {
      promiseId = log.resolvePromiseId(promiseIdPrefix) ?? promiseIdPrefix;
    } catch (e: any) {
      if (opts.json) console.log(JSON.stringify({ error: e.message }));
      else console.error(e.message);
      log.close();
      process.exit(1);
    }
    const ps = log.getPromiseState(promiseId);

    if (!ps || ps.state !== 'PROMISED') {
      const err = `Cannot ACCEPT: promise ${promiseId.slice(0, 8)} is in state ${ps?.state ?? 'NOT_FOUND'} (must be PROMISED)`;
      if (opts.json) console.log(JSON.stringify({ error: err }));
      else console.error(err);
      log.close();
      process.exit(1);
    }

    const msg = createAccept(opts.sender, promiseId);
    const hmac = signMessage(msg);
    log.post(msg, hmac ?? undefined);
    log.close();

    if (opts.json) {
      console.log(JSON.stringify({ promiseId, type: 'ACCEPT' }));
    } else {
      console.log(`ACCEPTED: ${promiseId}`);
    }
  });

// ============ release ============

program
  .command('release <promiseId>')
  .description('RELEASE a promise — gracefully abandon it')
  .option('--reason <reason>', 'Reason for releasing the promise')
  .option('--sender <id>', 'Sender identity', 'human')
  .option('--json', 'Output JSON')
  .action((promiseIdPrefix: string, opts) => {
    const log = new PromiseLog();
    let promiseId: string;
    try {
      promiseId = log.resolvePromiseId(promiseIdPrefix) ?? promiseIdPrefix;
    } catch (e: any) {
      if (opts.json) console.log(JSON.stringify({ error: e.message }));
      else console.error(e.message);
      log.close();
      process.exit(1);
    }
    const ps = log.getPromiseState(promiseId);

    if (!ps || !['PROMISED', 'ACCEPTED'].includes(ps.state)) {
      const err = `Cannot RELEASE: promise ${promiseId.slice(0, 8)} is in state ${ps?.state ?? 'NOT_FOUND'} (must be PROMISED or ACCEPTED)`;
      if (opts.json) console.log(JSON.stringify({ error: err }));
      else console.error(err);
      log.close();
      process.exit(1);
    }

    const msg = createRelease(opts.sender, promiseId, opts.reason);
    const hmac = signMessage(msg);
    log.post(msg, hmac ?? undefined);
    log.close();

    if (opts.json) {
      console.log(JSON.stringify({ promiseId, type: 'RELEASE' }));
    } else {
      console.log(`RELEASED: ${promiseId}`);
    }
  });

// ============ assess ============

program
  .command('assess <promiseId> <result>')
  .description('ASSESS a completed promise — pass or fail')
  .argument('[reason]', 'Reason for assessment')
  .option('--sender <id>', 'Sender identity', 'human')
  .option('--json', 'Output JSON')
  .action((promiseIdPrefix: string, result: string, reason: string | undefined, opts) => {
    const log = new PromiseLog();
    let promiseId: string;
    try {
      promiseId = log.resolvePromiseId(promiseIdPrefix) ?? promiseIdPrefix;
    } catch (e: any) {
      if (opts.json) console.log(JSON.stringify({ error: e.message }));
      else console.error(e.message);
      log.close();
      process.exit(1);
    }
    const ps = log.getPromiseState(promiseId);

    if (!ps || ps.state !== 'COMPLETED') {
      const err = `Cannot ASSESS: promise ${promiseId.slice(0, 8)} is in state ${ps?.state ?? 'NOT_FOUND'} (must be COMPLETED)`;
      if (opts.json) console.log(JSON.stringify({ error: err }));
      else console.error(err);
      log.close();
      process.exit(1);
    }

    // Mandatory diff review — show actual source changes
    // Use the promise's target repo if available, otherwise CWD
    const diffDir = ps.targetRepo ?? process.cwd();
    let diff = '';
    try {
      diff = execFileSync('git', ['diff', 'HEAD~1'], { cwd: diffDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      try {
        diff = execFileSync('git', ['diff'], { cwd: diffDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      } catch { /* no diff available */ }
    }

    if (!opts.json) {
      console.log('\n--- Source changes ---');
      console.log(diff || '(no changes)');
      console.log('--- End changes ---\n');
    }

    const assessment: AssessmentResult = result === 'pass' ? 'FULFILLED' : 'BROKEN';
    const msg = createAssess(opts.sender, promiseId, assessment, reason);
    const hmac = signMessage(msg);
    log.post(msg, hmac ?? undefined);
    log.close();

    if (opts.json) {
      console.log(JSON.stringify({ promiseId, assessment, diff }));
    } else {
      console.log(`ASSESSED ${promiseId}: ${assessment}`);
    }
  });

// ============ status ============

program
  .command('status')
  .description('Show intent/promise lifecycle state and registered projects')
  .option('--json', 'Output JSON')
  .action((opts) => {
    const log = new PromiseLog();
    const intents = log.getAllIntents();
    const projects = log.getAllProjects();
    const messageCount = log.getLatestSeq();

    if (opts.json) {
      const data = intents.map(i => ({
        ...i,
        promises: log.getPromisesForIntent(i.intentId),
      }));
      console.log(JSON.stringify({ intents: data, projects, messageCount }));
      log.close();
      return;
    }

    console.log(`Differ Status (${messageCount} messages)\n`);

    // Show intents grouped with their promises
    if (intents.length > 0) {
      console.log('Intents:');
      for (const intent of intents) {
        const iid = intent.intentId.slice(0, 8);
        const promises = log.getPromisesForIntent(intent.intentId);
        const fulfilled = promises.some(p => p.state === 'FULFILLED');
        const status = fulfilled ? 'fulfilled' : 'open';

        console.log(`  ${iid}  "${intent.content}"  (${status})`);

        if (promises.length === 0) {
          console.log('    (no promises yet)');
        } else {
          for (let i = 0; i < promises.length; i++) {
            const p = promises[i];
            const prefix = i === promises.length - 1 ? '└─' : '├─';
            const agentShort = p.agentId.slice(0, 8);
            const repo = p.targetRepo ? ` (${p.targetRepo})` : '';
            console.log(`    ${prefix} PROMISE ${p.promiseId.slice(0, 8)} by agent-${agentShort}${repo} — ${p.state}`);
          }
        }
        console.log('');
      }
    } else {
      console.log('  (no intents — post one to get started)\n');
    }

    // Show projects
    if (projects.length > 0) {
      console.log('Projects:');
      for (const p of projects) {
        const agentShort = p.agentId.slice(0, 8);
        console.log(`  ${p.name ?? '(unnamed)'}  ${p.repoPath}  ${p.mode}  agent-${agentShort}`);
      }
      console.log('');
    }

    log.close();
  });

// ============ run ============

program
  .command('run')
  .description('Start the agent loop (supervisor + agents)')
  .action(() => {
    printBanner();
    const sourceDir = process.cwd();
    runSupervisor(sourceDir);
  });

program.parse();
