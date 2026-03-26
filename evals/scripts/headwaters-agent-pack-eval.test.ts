import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './headwaters-agent-pack-eval.ts';

test('parseArgs defaults profile mode to none', () => {
  const args = parseArgs([]);
  assert.equal(args.profileMode, 'none');
});

test('parseArgs accepts builtin profile mode', () => {
  const args = parseArgs(['--profile-mode', 'builtin', '--agents', 'codex,claude']);
  assert.equal(args.profileMode, 'builtin');
  assert.deepEqual(args.agents, ['codex', 'claude']);
});
