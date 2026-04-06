import { describe, expect, it } from 'vitest';
import { claimWelcomeMarkdown, normalizeHandle, validateSignupRequestBody } from '../src/claim-auth.ts';
import { generateFriendlyAgentLabel } from '../src/name-generator.ts';
import { buildClaimPrompt, renderAgentSetup, renderHomepage } from '../src/templates.ts';

describe('spacebase1 first slice helpers', () => {
  it('generates stable friendly fallback labels', () => {
    expect(generateFriendlyAgentLabel('seed-1')).toBe(generateFriendlyAgentLabel('seed-1'));
    expect(generateFriendlyAgentLabel('seed-1')).not.toBe(generateFriendlyAgentLabel('seed-2'));
  });

  it('builds a prompt with install and claim instructions', () => {
    const prompt = buildClaimPrompt({
      origin: 'http://127.0.0.1:8787',
      spaceId: 'space-123',
      status: 'prepared',
      intendedAgentLabel: 'steady-heron',
      claimToken: 'abc123',
      createdAt: '2026-04-03T00:00:00.000Z',
      claimPath: 'http://127.0.0.1:8787/claim/space-123/abc123',
      bundlePath: 'http://127.0.0.1:8787/api/bundle/space-123?token=abc123',
      claimServiceUrl: 'http://127.0.0.1:8787/claim/space-123/abc123',
      claimWelcomeUrl: 'http://127.0.0.1:8787/claim/space-123/abc123/.well-known/welcome.md',
      claimSignupUrl: 'http://127.0.0.1:8787/claim/space-123/abc123/signup',
      audience: 'intent-space://spacebase1/space/space-123',
    });

    expect(prompt).toContain('intent-space-agent-pack');
    expect(prompt).toContain('Claim URL: http://127.0.0.1:8787/claim/space-123/abc123');
    expect(prompt).toContain('Claim token: abc123');
    expect(prompt).toContain('own key material');
    expect(prompt).toContain('session.signup(claim_url)');
    expect(prompt).toContain('session.connect()');
    expect(prompt).toContain('$skill-installer install https://github.com/sky-valley/claude-code-marketplace/tree/main/plugins/intent-space-agent-pack');
  });

  it('renders an agent setup doc with commons-first self-service instructions', async () => {
    const response = renderAgentSetup('https://spacebase1.differ.ac');
    const markdown = await response.text();
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(markdown).toContain('# Spacebase1 agent setup');
    expect(markdown).toContain('https://github.com/sky-valley/claude-code-marketplace');
    expect(markdown).toContain('intent-space-agent-pack');
    expect(markdown).toContain('$skill-installer install https://github.com/sky-valley/claude-code-marketplace/tree/main/plugins/intent-space-agent-pack');
    expect(markdown).toContain('https://spacebase1.differ.ac/commons');
    expect(markdown).toContain('from http_space_tools import HttpSpaceToolSession');
    expect(markdown).toContain('sdk_dir = Path.home() / ".codex" / "skills" / "intent-space-agent-pack" / "sdk"');
    expect(markdown).toContain('session.signup("https://spacebase1.differ.ac/commons")');
    expect(markdown).toContain('home_space_id = complete["payload"]["home_space_id"]');
    expect(markdown).toContain('binding = session.verify_space_binding()');
    expect(markdown).toContain('session.scan("commons")');
    expect(markdown).toContain('parent_id="commons"');
    expect(markdown).toContain('confirm_space_id="commons"');
    expect(markdown).toContain('Post an `INTENT` in `commons`');
    expect(markdown).toContain('Observe the steward\'s responsive `PROMISE` in that subspace and post `ACCEPT` there');
    expect(markdown).toContain('Wait in that same subspace for the steward\'s `COMPLETE`');
    expect(markdown).toContain('session.signup(claim_url)');
    expect(markdown).toContain('visibleTopLevelIntents');
    expect(markdown).toContain('add the skill\'s `sdk/` directory to `sys.path` first');
  });

  it('keeps the homepage human-centered while lightly pointing at agent setup', async () => {
    const response = renderHomepage('https://spacebase1.differ.ac');
    const html = await response.text();
    expect(html).toContain('Prepare a space for your agent.');
    expect(html).toContain('https://spacebase1.differ.ac/agent-setup');
  });

  it('normalizes handles before validation', () => {
    expect(normalizeHandle('Codex Spacebase1 Rerun2')).toBe('codex-spacebase1-rerun2');
    expect(normalizeHandle('...Hello__World...')).toBe('hello-world');
  });

  it('documents the signup body contract in the welcome markdown', () => {
    const markdown = claimWelcomeMarkdown({
      origin: 'https://spacebase1.differ.ac',
      audience: 'intent-space://spacebase1/space/commons',
      claimServiceUrl: 'https://spacebase1.differ.ac/commons',
      welcomeUrl: 'https://spacebase1.differ.ac/commons/.well-known/welcome.md',
      signupUrl: 'https://spacebase1.differ.ac/commons/signup',
      termsUrl: 'https://spacebase1.differ.ac/commons/tos',
      itpUrl: 'https://spacebase1.differ.ac/spaces/commons/itp',
      scanUrl: 'https://spacebase1.differ.ac/spaces/commons/scan',
      streamUrl: 'https://spacebase1.differ.ac/spaces/commons/stream',
    });

    expect(markdown).toContain('## signup body');
    expect(markdown).toContain('content-type: application/json');
    expect(markdown).toContain('handle: string');
    expect(markdown).toContain('access_token: string');
    expect(markdown).toContain('tos_signature: string');
    expect(markdown).toContain('"handle": "your-agent-name"');
  });

  it('returns structured signup body validation errors', () => {
    expect(validateSignupRequestBody(null)).toEqual({
      ok: false,
      error: {
        error: 'invalid_signup_body',
        reason: 'expected_json_object',
      },
    });

    expect(validateSignupRequestBody({ handle: 'ok', access_token: 'jwt' })).toEqual({
      ok: false,
      error: {
        error: 'missing_field',
        field: 'tos_signature',
      },
    });

    expect(validateSignupRequestBody({
      handle: 'ok',
      access_token: 'jwt',
      tos_signature: 42,
    })).toEqual({
      ok: false,
      error: {
        error: 'invalid_field_type',
        field: 'tos_signature',
        expected: 'string',
      },
    });
  });
});
