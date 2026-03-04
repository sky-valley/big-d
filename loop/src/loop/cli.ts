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
import { existsSync } from 'fs';
import {
  PromiseLog,
  DEFAULT_DB_PATH,
  HMAC_KEY_PATH,
  generateHmacKey,
  signMessage,
} from './promise-log.ts';
import {
  createIntent,
  createAccept,
  createAssess,
} from '../itp/protocol.ts';
import type { AssessmentResult } from '../itp/types.ts';
import { runSupervisor } from './supervisor.ts';

const program = new Command();

program
  .name('loop')
  .description('Self-modifying agent loop — promise protocol CLI')
  .version('0.0.1');

// ============ init ============

program
  .command('init')
  .description('Initialize promise log and HMAC key')
  .option('--json', 'Output JSON')
  .action((opts) => {
    const log = new PromiseLog();
    log.close();

    if (!existsSync(HMAC_KEY_PATH)) {
      generateHmacKey();
    }

    if (opts.json) {
      console.log(JSON.stringify({ status: 'initialized', dbPath: DEFAULT_DB_PATH, hmacKeyPath: HMAC_KEY_PATH }));
    } else {
      console.log('Initialized promise log:', DEFAULT_DB_PATH);
      console.log('HMAC key:', HMAC_KEY_PATH);
    }
  });

// ============ intent ============

program
  .command('intent <content>')
  .description('Post an INTENT — declare a desired outcome')
  .option('--criteria <criteria>', 'Acceptance criteria')
  .option('--sender <id>', 'Sender identity', 'human')
  .option('--json', 'Output JSON')
  .action((content: string, opts) => {
    const log = new PromiseLog();
    const msg = createIntent(opts.sender, content, opts.criteria);
    const hmac = signMessage(msg);
    log.post(msg, hmac ?? undefined);
    log.close();

    if (opts.json) {
      console.log(JSON.stringify({ promiseId: msg.promiseId, type: 'INTENT' }));
    } else {
      console.log(`INTENT posted: ${msg.promiseId}`);
      console.log(`  "${content}"`);
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
    let diff = '';
    try {
      diff = execFileSync('git', ['diff', 'HEAD~1'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      try {
        diff = execFileSync('git', ['diff'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
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
  .description('Show promise lifecycle state')
  .option('--json', 'Output JSON')
  .action((opts) => {
    const log = new PromiseLog();
    const promises = log.getAllPromises();
    const messageCount = log.getLatestSeq();
    log.close();

    if (opts.json) {
      console.log(JSON.stringify({ promises, messageCount }));
      return;
    }

    const active = promises.filter(p => !['DECLINED', 'FULFILLED', 'BROKEN', 'REVISED', 'RELEASED'].includes(p.state));
    const terminal = promises.filter(p => ['DECLINED', 'FULFILLED', 'BROKEN', 'REVISED', 'RELEASED'].includes(p.state));

    console.log(`Promise Log (${messageCount} messages, ${active.length} active)\n`);

    for (const p of active) {
      console.log(`  [${p.state}] ${p.promiseId.slice(0, 8)}  "${p.content ?? ''}"`);
    }

    if (terminal.length > 0) {
      console.log(`\n  ${terminal.length} completed/terminal promises`);
    }

    if (promises.length === 0) {
      console.log('  (empty — post an intent to get started)');
    }
  });

// ============ run ============

program
  .command('run')
  .description('Start the agent loop (supervisor + agent)')
  .action(() => {
    const sourceDir = process.cwd();
    runSupervisor(sourceDir);
  });

program.parse();
