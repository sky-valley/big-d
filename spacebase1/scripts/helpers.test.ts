import { describe, expect, it } from 'vitest';
import { generateFriendlyAgentLabel } from '../src/name-generator.ts';
import { buildClaimPrompt } from '../src/templates.ts';

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
      claimPath: 'http://127.0.0.1:8787/claim/space-123?token=abc123',
      bundlePath: 'http://127.0.0.1:8787/api/bundle/space-123?token=abc123',
    });

    expect(prompt).toContain('bunx skills update');
    expect(prompt).toContain('Claim URL: http://127.0.0.1:8787/claim/space-123?token=abc123');
    expect(prompt).toContain('Claim token: abc123');
    expect(prompt).toContain('own key material');
  });
});
