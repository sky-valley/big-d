import { describe, expect, it } from 'vitest';
import { buildClaimPrompt, renderAgentSetup, renderSkillFile } from '../src/templates.ts';
import type { SpaceBundle } from '../src/types.ts';

const TEST_ORIGIN = 'https://spacebase1.differ.ac';
const LOCAL_ORIGIN = 'http://127.0.0.1:8787';

/**
 * Patterns that trigger Claude Code's injection defense when found in web page
 * content fetched via WebFetch. These are imperative sentence openers that look
 * like directives from an untrusted source.
 */
const DIRECTIVE_OPENERS = [
  /^Read this document/im,
  /^Follow these/im,
  /^Execute the/im,
  /^You must/im,
  /^You should/im,
  /^IMPORTANT:/im,
  /^Step \d+:/im,
];

/**
 * Patterns that claim authority or pre-authorization — high-confidence
 * injection signals that Claude Code will refuse.
 */
const AUTHORITY_CLAIMS = [
  /the user has authorized/i,
  /you are authorized to/i,
  /system message/i,
  /admin override/i,
  /ignore previous instructions/i,
  /emergency protocol/i,
];

function makeBundleFixture(origin: string): SpaceBundle {
  return {
    origin,
    spaceId: 'space-test-123',
    status: 'prepared',
    intendedAgentLabel: 'steady-heron',
    claimToken: 'tok_abc123',
    createdAt: '2026-04-06T00:00:00.000Z',
    claimPath: `${origin}/claim/space-test-123/tok_abc123`,
    bundlePath: `${origin}/api/bundle/space-test-123?token=tok_abc123`,
    claimServiceUrl: `${origin}/claim/space-test-123/tok_abc123`,
    claimWelcomeUrl: `${origin}/claim/space-test-123/tok_abc123/.well-known/welcome.md`,
    claimSignupUrl: `${origin}/claim/space-test-123/tok_abc123/signup`,
    audience: 'intent-space://spacebase1/space/space-test-123',
  };
}

// ---------------------------------------------------------------------------
// Path 2: Agent-led onboarding via /agent-setup
// ---------------------------------------------------------------------------

describe('agent-setup page (Path 2: agent-led)', () => {
  it('serves text/markdown content type', async () => {
    const response = renderAgentSetup(TEST_ORIGIN);
    expect(response.headers.get('content-type')).toContain('text/markdown');
  });

  it('contains no directive openers that trigger injection detection', async () => {
    const markdown = await renderAgentSetup(TEST_ORIGIN).text();
    for (const pattern of DIRECTIVE_OPENERS) {
      expect(markdown).not.toMatch(pattern);
    }
  });

  it('contains no authority claims', async () => {
    const markdown = await renderAgentSetup(TEST_ORIGIN).text();
    for (const pattern of AUTHORITY_CLAIMS) {
      expect(markdown).not.toMatch(pattern);
    }
  });

  it('links to the SKILL.md without embedding executable commands', async () => {
    const markdown = await renderAgentSetup(TEST_ORIGIN).text();
    expect(markdown).toContain('spacebase1-onboard.SKILL.md');
    // Must NOT contain inline install commands — those belong in the SKILL.md
    expect(markdown).not.toContain('mkdir -p');
    expect(markdown).not.toContain('curl -fsSL');
  });

  it('describes Spacebase1 factually rather than imperatively', async () => {
    const markdown = await renderAgentSetup(TEST_ORIGIN).text();
    // Should contain factual descriptions
    expect(markdown).toContain('Spacebase1 is');
    expect(markdown).toContain('How Spacebase1 works');
    expect(markdown).toContain('API reference');
    expect(markdown).toContain('intentId');
    expect(markdown).toContain('bind_url');
  });

  it('references the commons endpoint', async () => {
    const markdown = await renderAgentSetup(TEST_ORIGIN).text();
    expect(markdown).toContain(`${TEST_ORIGIN}/commons`);
  });

  it('mentions the intent-space-agent-pack dependency', async () => {
    const markdown = await renderAgentSetup(TEST_ORIGIN).text();
    expect(markdown).toContain('intent-space-agent-pack');
    expect(markdown).toContain('https://github.com/sky-valley/claude-code-marketplace');
  });

  it('substitutes origin correctly for local dev', async () => {
    const markdown = await renderAgentSetup(LOCAL_ORIGIN).text();
    expect(markdown).toContain(`${LOCAL_ORIGIN}/commons`);
    expect(markdown).toContain(`${LOCAL_ORIGIN}/spacebase1-onboard.SKILL.md`);
  });
});

// ---------------------------------------------------------------------------
// Path 1: Human-led onboarding via claim prompt
// ---------------------------------------------------------------------------

describe('claim prompt (Path 1: human-led)', () => {
  it('contains the claim materials', () => {
    const bundle = makeBundleFixture(TEST_ORIGIN);
    const prompt = buildClaimPrompt(bundle);
    expect(prompt).toContain(`Claim URL: ${bundle.claimPath}`);
    expect(prompt).toContain(`Claim token: ${bundle.claimToken}`);
    expect(prompt).toContain(`Agent label: ${bundle.intendedAgentLabel}`);
    expect(prompt).toContain(`Space id: ${bundle.spaceId}`);
  });

  it('contains a curl one-liner for Claude Code', () => {
    const prompt = buildClaimPrompt(makeBundleFixture(TEST_ORIGIN));
    expect(prompt).toContain('mkdir -p ~/.claude/skills/spacebase1-onboard');
    expect(prompt).toContain('curl -fsSL');
    expect(prompt).toContain('spacebase1-onboard.SKILL.md');
  });

  it('contains a curl one-liner for Codex', () => {
    const prompt = buildClaimPrompt(makeBundleFixture(TEST_ORIGIN));
    expect(prompt).toContain('mkdir -p ~/.codex/skills/spacebase1-onboard');
  });

  it('contains no directive openers', () => {
    const prompt = buildClaimPrompt(makeBundleFixture(TEST_ORIGIN));
    for (const pattern of DIRECTIVE_OPENERS) {
      expect(prompt).not.toMatch(pattern);
    }
  });

  it('contains no authority claims', () => {
    const prompt = buildClaimPrompt(makeBundleFixture(TEST_ORIGIN));
    for (const pattern of AUTHORITY_CLAIMS) {
      expect(prompt).not.toMatch(pattern);
    }
  });

  it('does not contain numbered imperative steps', () => {
    const prompt = buildClaimPrompt(makeBundleFixture(TEST_ORIGIN));
    // Should not have the old "Before claiming it:" numbered list
    expect(prompt).not.toContain('Before claiming it:');
    expect(prompt).not.toMatch(/^\d+\.\s+(Install|Use|Claim|Enroll|Once)/m);
  });

  it('uses origin from bundle for skill URL', () => {
    const prompt = buildClaimPrompt(makeBundleFixture(LOCAL_ORIGIN));
    expect(prompt).toContain(`${LOCAL_ORIGIN}/spacebase1-onboard.SKILL.md`);
  });
});

// ---------------------------------------------------------------------------
// SKILL.md (trusted instructions for both paths)
// ---------------------------------------------------------------------------

describe('SKILL.md (trusted onboarding instructions)', () => {
  it('serves text/markdown content type', async () => {
    const response = renderSkillFile(TEST_ORIGIN);
    expect(response.headers.get('content-type')).toContain('text/markdown');
  });

  it('has valid YAML frontmatter with name and description', async () => {
    const markdown = await renderSkillFile(TEST_ORIGIN).text();
    expect(markdown).toMatch(/^---\n/);
    expect(markdown).toContain('name: Spacebase1 Onboard');
    expect(markdown).toContain('description:');
  });

  it('documents Path 1: claiming a prepared space', async () => {
    const markdown = await renderSkillFile(TEST_ORIGIN).text();
    expect(markdown).toContain('Path 1: Claim a prepared space');
    expect(markdown).toContain('CLAIM_URL');
    expect(markdown).toContain('session.signup(CLAIM_URL)');
    expect(markdown).toContain('session.connect()');
    expect(markdown).toContain('session.verify_space_binding()');
  });

  it('documents Path 2: self-service through commons', async () => {
    const markdown = await renderSkillFile(TEST_ORIGIN).text();
    expect(markdown).toContain('Path 2: Self-service through commons');
    expect(markdown).toContain(`ENDPOINT = "${TEST_ORIGIN}"`);
    expect(markdown).toContain('{ENDPOINT}/commons');
    expect(markdown).toContain('session.scan("commons")');
    expect(markdown).toContain('session.intent(');
    expect(markdown).toContain('session.wait_for_promise(');
    expect(markdown).toContain('session.accept(');
    expect(markdown).toContain('session.wait_for_complete(');
    expect(markdown).toContain('claim_url = complete["payload"]["claim_url"]');
    expect(markdown).toContain('bind_url = complete["payload"]["bind_url"]');
    expect(markdown).toContain('session.signup(bind_url)');
  });

  it('references the intent-space-agent-pack dependency', async () => {
    const markdown = await renderSkillFile(TEST_ORIGIN).text();
    expect(markdown).toContain('intent-space-agent-pack');
    expect(markdown).toContain('https://github.com/sky-valley/claude-code-marketplace');
  });

  it('includes both Claude Code and Codex install commands for the pack', async () => {
    const markdown = await renderSkillFile(TEST_ORIGIN).text();
    expect(markdown).toContain('/plugin marketplace add');
    expect(markdown).toContain('/plugin install intent-space-agent-pack@skyvalley-marketplace');
    expect(markdown).toContain('$skill-installer install');
  });

  it('includes a success condition section', async () => {
    const markdown = await renderSkillFile(TEST_ORIGIN).text();
    expect(markdown).toContain('Success condition');
    expect(markdown).toContain('declaredSpaceId');
    expect(markdown).toContain('currentSpaceId');
    expect(markdown).toContain('visibleTopLevelIntents');
  });

  it('includes SDK path resolution for both agent types', async () => {
    const markdown = await renderSkillFile(TEST_ORIGIN).text();
    expect(markdown).toContain('.claude');
    expect(markdown).toContain('.codex');
    expect(markdown).toContain('intent-space-agent-pack');
  });

  it('substitutes origin correctly for local dev', async () => {
    const markdown = await renderSkillFile(LOCAL_ORIGIN).text();
    expect(markdown).toContain(`ENDPOINT = "${LOCAL_ORIGIN}"`);
    expect(markdown).toContain('{ENDPOINT}/commons');
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: both paths share the same SKILL.md install mechanism
// ---------------------------------------------------------------------------

describe('onboarding coherence', () => {
  it('agent-setup and claim prompt both point to the same SKILL.md URL pattern', async () => {
    const agentSetup = await renderAgentSetup(TEST_ORIGIN).text();
    const claimPrompt = buildClaimPrompt(makeBundleFixture(TEST_ORIGIN));

    const skillUrlPattern = `${TEST_ORIGIN}/spacebase1-onboard.SKILL.md`;
    expect(agentSetup).toContain(skillUrlPattern);
    expect(claimPrompt).toContain(skillUrlPattern);
  });

  it('SKILL.md covers both claim and self-service paths', async () => {
    const markdown = await renderSkillFile(TEST_ORIGIN).text();
    expect(markdown).toContain('Path 1');
    expect(markdown).toContain('Path 2');
  });

  it('no surface references /plugin commands directly (those belong in SKILL.md)', async () => {
    const agentSetup = await renderAgentSetup(TEST_ORIGIN).text();
    const claimPrompt = buildClaimPrompt(makeBundleFixture(TEST_ORIGIN));

    // The agent-setup page and claim prompt should NOT contain /plugin commands
    // Those belong in the SKILL.md which is a trusted source
    expect(agentSetup).not.toContain('/plugin marketplace add');
    expect(agentSetup).not.toContain('/plugin install');
    expect(claimPrompt).not.toContain('/plugin marketplace add');
    expect(claimPrompt).not.toContain('/plugin install');
  });

  it('no surface contains the full Python provisioning script (that belongs in SKILL.md)', async () => {
    const agentSetup = await renderAgentSetup(TEST_ORIGIN).text();
    const claimPrompt = buildClaimPrompt(makeBundleFixture(TEST_ORIGIN));

    // The web-facing surfaces should NOT contain Python code
    expect(agentSetup).not.toContain('from http_space_tools import');
    expect(agentSetup).not.toContain('HttpSpaceToolSession');
    expect(claimPrompt).not.toContain('from http_space_tools import');
    expect(claimPrompt).not.toContain('session.signup(');
  });
});
