import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInterviewPrompt, shouldTriggerInterview } from './harness.ts';
import { assignBuiltinProfile, buildAgentPrompt, buildBasePrompt } from './prompts/headwaters-agent-pack.ts';

test('assignBuiltinProfile follows deterministic launch order and overflows to generalist', () => {
  assert.equal(assignBuiltinProfile(0).name, 'frontend-builder');
  assert.equal(assignBuiltinProfile(1).name, 'backend-builder');
  assert.equal(assignBuiltinProfile(2).name, 'creative-product');
  assert.equal(assignBuiltinProfile(3).name, 'systems-investigator');
  assert.equal(assignBuiltinProfile(4).name, 'generalist-builder');
  assert.equal(assignBuiltinProfile(5).name, 'generalist-builder');
  assert.equal(assignBuiltinProfile(9).name, 'generalist-builder');
});

test('buildAgentPrompt preserves baseline prompt when no profile is assigned', () => {
  const basePrompt = buildBasePrompt({
    packDir: '/tmp/agent-pack',
    baseUrl: 'http://127.0.0.1:8090',
  });

  assert.equal(buildAgentPrompt(basePrompt), basePrompt);
});

test('buildAgentPrompt prefixes the profile frame before the shared prompt', () => {
  const basePrompt = buildBasePrompt({
    packDir: '/tmp/agent-pack',
    baseUrl: 'http://127.0.0.1:8090',
  });
  const prompt = buildAgentPrompt(basePrompt, assignBuiltinProfile(0));

  assert.match(prompt, /^Built-in evaluation profile: frontend-builder\./);
  assert.ok(prompt.endsWith(basePrompt));
});

test('buildInterviewPrompt includes the fixed structure and completion marker', () => {
  const prompt = buildInterviewPrompt('/tmp/post-headwaters-interview.md');

  assert.match(prompt, /# Post-Headwaters Interview/);
  assert.match(prompt, /## What Happened At The End/);
  assert.match(prompt, /INTERVIEW_SAVED/);
  assert.match(prompt, /Do not reconnect to Headwaters/);
});

test('shouldTriggerInterview waits for a final disconnect grace window', () => {
  assert.equal(shouldTriggerInterview({
    reachedSpace: true,
    latestCloseAt: 1_000,
    latestActivityAt: 900,
  }, 3_500, 3_000), false);

  assert.equal(shouldTriggerInterview({
    reachedSpace: true,
    latestCloseAt: 1_000,
    latestActivityAt: 900,
  }, 4_500, 3_000), true);
});

test('shouldTriggerInterview ignores reconnect-like later activity and never-reached runs', () => {
  assert.equal(shouldTriggerInterview({
    reachedSpace: true,
    latestCloseAt: 1_000,
    latestActivityAt: 1_100,
  }, 6_000, 3_000), false);

  assert.equal(shouldTriggerInterview({
    reachedSpace: false,
    latestCloseAt: 1_000,
    latestActivityAt: 900,
  }, 6_000, 3_000), false);
});
