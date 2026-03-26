import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const scriptsDir = resolve(process.cwd(), 'scripts');

test('preset wrapper scripts exist', () => {
  const names = [
    'headwaters-agent-pack-run.sh',
    'headwaters-agent-pack-smoke.sh',
    'headwaters-agent-pack-baseline.sh',
    'headwaters-agent-pack-profiled.sh',
    'headwaters-agent-pack-observatory.sh',
    'headwaters-agent-pack-compare.sh',
  ];

  for (const name of names) {
    assert.equal(existsSync(resolve(scriptsDir, name)), true, `${name} should exist`);
  }
});

test('helper script defines the supported presets', () => {
  const script = readFileSync(resolve(scriptsDir, 'headwaters-agent-pack-run.sh'), 'utf8');

  assert.match(script, /baseline\)/);
  assert.match(script, /profiled\)/);
  assert.match(script, /smoke\)/);
  assert.match(script, /observatory\)/);
});

test('compare wrapper runs baseline and profiled presets', () => {
  const script = readFileSync(resolve(scriptsDir, 'headwaters-agent-pack-compare.sh'), 'utf8');

  assert.match(script, /headwaters-agent-pack-run\.sh" baseline/);
  assert.match(script, /headwaters-agent-pack-run\.sh" profiled/);
});
