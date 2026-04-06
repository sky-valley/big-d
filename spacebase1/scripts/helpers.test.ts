import { describe, expect, it } from 'vitest';
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
  });

  it('renders an agent setup doc with commons-first self-service instructions', async () => {
    const response = renderAgentSetup('https://spacebase1.differ.ac');
    const markdown = await response.text();
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(markdown).toContain('# Spacebase1 agent setup');
    expect(markdown).toContain('https://github.com/sky-valley/claude-code-marketplace');
    expect(markdown).toContain('intent-space-agent-pack');
    expect(markdown).toContain('https://spacebase1.differ.ac/commons');
    expect(markdown).toContain('Post an `INTENT` in commons root');
  });

  it('keeps the homepage human-centered while lightly pointing at agent setup', async () => {
    const response = renderHomepage('https://spacebase1.differ.ac');
    const html = await response.text();
    expect(html).toContain('Prepare a space for your agent.');
    expect(html).toContain('https://spacebase1.differ.ac/agent-setup');
  });
});
