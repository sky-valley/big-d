import { describe, expect, it } from 'vitest';
import { claimWelcomeMarkdown, normalizeHandle, signupErrorResponse, validateClaimSignup, validateSignupRequestBody } from '../src/claim-auth.ts';
import { generateFriendlyAgentLabel } from '../src/name-generator.ts';
import { buildSharedSpaceInvitationPayload, parseSharedSpaceRequest, validateSharedSpaceParticipants } from '../src/shared-spaces.ts';
import { buildClaimPrompt, renderAgentSetup, renderHomepage, renderSkillFile } from '../src/templates.ts';

describe('spacebase1 first slice helpers', () => {
  it('generates stable friendly fallback labels', () => {
    expect(generateFriendlyAgentLabel('seed-1')).toBe(generateFriendlyAgentLabel('seed-1'));
    expect(generateFriendlyAgentLabel('seed-1')).not.toBe(generateFriendlyAgentLabel('seed-2'));
  });

  it('builds a prompt with skill install and claim materials', () => {
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

    expect(prompt).toContain('Claim URL: http://127.0.0.1:8787/claim/space-123/abc123');
    expect(prompt).toContain('Claim token: abc123');
    expect(prompt).toContain('spacebase1-onboard.SKILL.md');
    expect(prompt).toContain('mkdir -p ~/.claude/skills/spacebase1-onboard');
    expect(prompt).toContain('mkdir -p ~/.codex/skills/spacebase1-onboard');
    expect(prompt).toContain('curl -fsSL');
  });

  it('renders a factual agent setup doc with skill install commands', async () => {
    const response = renderAgentSetup('https://spacebase1.differ.ac');
    const markdown = await response.text();
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(markdown).toContain('# Spacebase1');
    expect(markdown).toContain('https://github.com/sky-valley/claude-code-marketplace');
    expect(markdown).toContain('intent-space-agent-pack');
    expect(markdown).toContain('https://spacebase1.differ.ac/commons');
    expect(markdown).toContain('spacebase1-onboard.SKILL.md');
    expect(markdown).not.toContain('mkdir -p');
    expect(markdown).not.toContain('curl -fsSL');
    expect(markdown).toContain('How Spacebase1 works');
    expect(markdown).toContain('API reference');
    expect(markdown).toContain('Shared spaces');
  });

  it('renders a valid SKILL.md with both onboarding paths', async () => {
    const response = renderSkillFile('https://spacebase1.differ.ac');
    const markdown = await response.text();
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(markdown).toContain('name: Spacebase1 Onboard');
    expect(markdown).toContain('Path 1: Claim a prepared space');
    expect(markdown).toContain('Path 2: Self-service through commons');
    expect(markdown).toContain('intent-space-agent-pack');
    expect(markdown).toContain('session.verify_space_binding()');
    expect(markdown).toContain('Success condition');
    expect(markdown).toContain('Path 3: Request a shared space');
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
    expect(markdown).toContain('dpop header: required');
    expect(markdown).toContain('handle: string');
    expect(markdown).toContain('access_token: string');
    expect(markdown).toContain('tos_signature: string');
    expect(markdown).toContain('## access token header');
    expect(markdown).toContain('jwk: omit this header field');
    expect(markdown).toContain('## access token claims');
    expect(markdown).toContain('tos_hash');
    expect(markdown).toContain('## dpop proof requirements');
    expect(markdown).toContain('htu');
    expect(markdown).toContain('base64url(sha256(terms_text))');
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

  it('returns a structured missing DPoP error for signup validation', async () => {
    let caught: unknown;
    try {
      await validateClaimSignup({
        dpopJwt: '',
        accessTokenJwt: 'a.b.c',
        tosSignatureB64url: 'sig',
        handle: 'ok',
        profile: {
          origin: 'https://spacebase1.differ.ac',
          audience: 'intent-space://spacebase1/space/commons',
          claimServiceUrl: 'https://spacebase1.differ.ac/commons',
          welcomeUrl: 'https://spacebase1.differ.ac/commons/.well-known/welcome.md',
          signupUrl: 'https://spacebase1.differ.ac/commons/signup',
          termsUrl: 'https://spacebase1.differ.ac/commons/tos',
          itpUrl: 'https://spacebase1.differ.ac/spaces/commons/itp',
          scanUrl: 'https://spacebase1.differ.ac/spaces/commons/scan',
          streamUrl: 'https://spacebase1.differ.ac/spaces/commons/stream',
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(signupErrorResponse(caught)).toEqual({
      error: 'missing_dpop_header',
      field: 'dpop',
      expected: 'a dpop+jwt proof header bound to this signup POST',
      hint: 'Include a DPoP header on the signup request itself.',
    });
  });

  it('parses shared-space requests from product payloads only', () => {
    expect(parseSharedSpaceRequest({
      requestedSpace: {
        kind: 'shared',
        participant_principals: ['prn-b', 'prn-a', ''],
      },
    })).toEqual({
      participantPrincipalIds: ['prn-b', 'prn-a'],
    });

    expect(parseSharedSpaceRequest({
      requestedSpace: {
        kind: 'home',
      },
    })).toBeNull();
  });

  it('validates shared-space participants as explicit principals with bound homes', () => {
    const knownHomes = new Map([
      ['prn-a', { principalId: 'prn-a', handle: 'alpha', homeSpaceId: 'space-a', jkt: 'jkt-a' }],
      ['prn-b', { principalId: 'prn-b', handle: 'beta', homeSpaceId: 'space-b', jkt: 'jkt-b' }],
    ]);

    expect(validateSharedSpaceParticipants('prn-a', ['prn-b', 'prn-a', 'prn-b'], knownHomes)).toEqual({
      ok: true,
      participantPrincipalIds: ['prn-a', 'prn-b'],
    });

    expect(validateSharedSpaceParticipants('prn-a', ['prn-b'], knownHomes)).toEqual({
      ok: false,
      error: 'requester_not_included',
      detail: 'The requester must be one of the named participants.',
    });

    expect(validateSharedSpaceParticipants('prn-a', ['prn-a', 'prn-c'], knownHomes)).toEqual({
      ok: false,
      error: 'unknown_principal',
      detail: 'Every named participant must already exist in Spacebase1.',
      unresolvedPrincipalIds: ['prn-c'],
    });
  });

  it('builds invitation payloads with shared-space access materials', () => {
    expect(buildSharedSpaceInvitationPayload({
      obligationId: 'obl-1',
      sharedSpaceId: 'space-shared-1',
      participantPrincipalId: 'prn-b',
      participantHandle: 'beta',
      homeSpaceId: 'space-b',
      requesterPrincipalId: 'prn-a',
      participantPrincipalIds: ['prn-a', 'prn-b'],
      invitationIntentId: 'spacebase1:invite:space-shared-1:prn-b',
      access: {
        stationToken: 'station-token-1',
        audience: 'https://spacebase1.differ.ac',
        itpEndpoint: 'https://spacebase1.differ.ac/spaces/space-shared-1/itp',
        scanEndpoint: 'https://spacebase1.differ.ac/spaces/space-shared-1/scan',
        streamEndpoint: 'https://spacebase1.differ.ac/spaces/space-shared-1/stream',
        spaceId: 'space-shared-1',
      },
    })).toEqual({
      content: 'You are invited to shared space space-shared-1.',
      shared_space_id: 'space-shared-1',
      requester_principal_id: 'prn-a',
      participant_principals: ['prn-a', 'prn-b'],
      access: {
        station_token: 'station-token-1',
        audience: 'https://spacebase1.differ.ac',
        itp_endpoint: 'https://spacebase1.differ.ac/spaces/space-shared-1/itp',
        scan_endpoint: 'https://spacebase1.differ.ac/spaces/space-shared-1/scan',
        stream_endpoint: 'https://spacebase1.differ.ac/spaces/space-shared-1/stream',
        space_id: 'space-shared-1',
      },
    });
  });
});
