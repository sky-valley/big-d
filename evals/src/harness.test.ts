import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInterviewPrompt, buildPromptWithExitInterview } from './harness.ts';
import { assignBuiltinProfile, buildAgentPrompt, buildBasePrompt, buildEvaluatorPrompt } from './prompts/headwaters-agent-pack.ts';
import { buildCacheKey, buildPackSourceConfig, buildWorkspacePackPath, DEFAULT_PACK_SOURCE } from './pack-provisioning.ts';
import { parseArgs } from '../scripts/headwaters-agent-pack-eval.ts';

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
    packDir: '/tmp/workspace/intent-space-agent-pack',
    baseUrl: 'http://127.0.0.1:8090',
  });

  assert.equal(buildAgentPrompt(basePrompt), basePrompt);
});

test('buildAgentPrompt prefixes the profile frame before the shared prompt', () => {
  const basePrompt = buildBasePrompt({
    packDir: '/tmp/workspace/intent-space-agent-pack',
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
  assert.match(prompt, /## Mechanism Of The Space/);
  assert.match(prompt, /## Working With Intents/);
  assert.match(prompt, /## Working With Promises/);
  assert.match(prompt, /## Main Friction/);
  assert.match(prompt, /INTERVIEW_SAVED/);
  assert.match(prompt, /When you decide to leave the space/);
});

test('buildPromptWithExitInterview appends the exit interview contract and file path', () => {
  const prompt = buildPromptWithExitInterview('Base prompt.', '/tmp/agent-workspace');

  assert.match(prompt, /^Base prompt\./);
  assert.match(prompt, /\/tmp\/agent-workspace\/\.intent-space\/state\/post-headwaters-interview\.md/);
  assert.match(prompt, /Only after writing the interview should you end your run/);
});

test('buildEvaluatorPrompt prioritizes intent posting over observation', () => {
  const prompt = buildEvaluatorPrompt('Base prompt.', 'I need a shared recipe book for my family.');

  assert.match(prompt, /requester-side evaluator participant/);
  assert.match(prompt, /first priority after joining/);
  assert.match(prompt, /Immediately after joining, post this exact/);
  assert.match(prompt, /shared recipe book for my family/);
  assert.match(prompt, /Do not request a home space/);
  assert.match(prompt, /Do not behave like a hidden harness fixture/);
  assert.match(prompt, /Base prompt\./);
  assert.doesNotMatch(prompt, /Observe first/);
});

test('buildPackSourceConfig applies marketplace defaults inside the eval output cache', () => {
  const config = buildPackSourceConfig({
    outputDir: '/tmp/headwaters-eval',
  });

  assert.equal(config.marketplaceRepoUrl, DEFAULT_PACK_SOURCE.marketplaceRepoUrl);
  assert.equal(config.marketplaceName, DEFAULT_PACK_SOURCE.marketplaceName);
  assert.equal(config.pluginName, DEFAULT_PACK_SOURCE.pluginName);
  assert.equal(config.ref, DEFAULT_PACK_SOURCE.ref);
  assert.equal(config.cacheDir, '/tmp/headwaters-eval/.pack-cache');
});

test('buildCacheKey is stable for the same source', () => {
  const source = {
    marketplaceRepoUrl: DEFAULT_PACK_SOURCE.marketplaceRepoUrl,
    marketplaceName: DEFAULT_PACK_SOURCE.marketplaceName,
    pluginName: DEFAULT_PACK_SOURCE.pluginName,
    ref: 'abc123',
  };

  assert.equal(buildCacheKey(source), buildCacheKey(source));
});

test('buildWorkspacePackPath uses the plugin name inside the agent workspace', () => {
  assert.equal(
    buildWorkspacePackPath('/tmp/agent-workspace', 'intent-space-agent-pack'),
    '/tmp/agent-workspace/intent-space-agent-pack',
  );
});

test('parseArgs accepts explicit pack source overrides', () => {
  const args = parseArgs([
    '--pack-marketplace-repo-url', 'https://example.com/marketplace.git',
    '--pack-marketplace-name', 'custom-marketplace',
    '--pack-plugin-name', 'custom-pack',
    '--pack-ref', 'deadbeef',
    '--pack-cache-dir', 'tmp/custom-cache',
  ]);

  assert.equal(args.packMarketplaceRepoUrl, 'https://example.com/marketplace.git');
  assert.equal(args.packMarketplaceName, 'custom-marketplace');
  assert.equal(args.packPluginName, 'custom-pack');
  assert.equal(args.packRef, 'deadbeef');
  assert.match(args.packCacheDir ?? '', /tmp\/custom-cache$/);
});
