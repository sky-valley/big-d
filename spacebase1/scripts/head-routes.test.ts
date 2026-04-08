import { describe, expect, it } from 'vitest';
import worker from '../src/index.ts';
import type { Env } from '../src/types.ts';

const env = {
  GOOGLE_ANALYTICS_ID: 'G-TEST123456',
  GOOGLE_SITE_VERIFICATION: 'google-verification-token',
} as Env;

describe('HEAD support for human-facing static routes', () => {
  it('serves /agent-setup on HEAD with no body', async () => {
    const response = await worker.fetch(new Request('https://spacebase1.differ.ac/agent-setup', { method: 'HEAD' }), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).toBe('index, follow');
    expect(response.headers.get('content-type')).toContain('text/markdown');
    expect(await response.text()).toBe('');
  });

  it('serves homepage on HEAD with no body', async () => {
    const response = await worker.fetch(new Request('https://spacebase1.differ.ac/', { method: 'HEAD' }), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-robots-tag')).toBe('index, follow');
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe('');
  });
});
