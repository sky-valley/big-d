import { generateFriendlyAgentLabel } from './name-generator.ts';
import { renderClaimPage, renderCreatedSpace, renderHomepage } from './templates.ts';
import type { Env, HostedSpaceRecord, PreparedSpaceRecord, SpaceBundle } from './types.ts';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function textResponse(value: string, status = 200): Response {
  return new Response(value, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

function normalizeOrigin(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function makeSpaceId(): string {
  return `space-${crypto.randomUUID()}`;
}

function makeClaimToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function controlFetch(env: Env, origin: string, path: string, init?: RequestInit): Promise<Response> {
  const id = env.CONTROL.idFromName('spacebase1-control');
  return env.CONTROL.get(id).fetch(new Request(`${origin}${path}`, init));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = normalizeOrigin(url);

    if (request.method === 'GET' && url.pathname === '/') {
      return renderHomepage(origin);
    }

    if (request.method === 'POST' && url.pathname === '/create-space') {
      const form = await request.formData();
      const intendedAgentLabelRaw = form.get('intendedAgentLabel');
      const intendedAgentLabel =
        typeof intendedAgentLabelRaw === 'string' && intendedAgentLabelRaw.trim()
          ? intendedAgentLabelRaw.trim()
          : generateFriendlyAgentLabel(crypto.randomUUID());
      const response = await controlFetch(env, origin, '/create-space', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin, intendedAgentLabel }),
      });
      const bundle = (await response.json()) as SpaceBundle;
      return Response.redirect(`${origin}/spaces/${bundle.spaceId}?token=${encodeURIComponent(bundle.claimToken)}`, 303);
    }

    if (request.method === 'GET' && url.pathname.startsWith('/spaces/')) {
      const spaceId = url.pathname.slice('/spaces/'.length);
      const token = url.searchParams.get('token');
      if (!token) {
        return textResponse('Missing token\n', 400);
      }
      const response = await controlFetch(env, origin, `/bundle/${spaceId}?token=${encodeURIComponent(token)}`);
      if (!response.ok) {
        return response;
      }
      const bundle = (await response.json()) as SpaceBundle;
      const hostedResponse = await env.SPACES.get(env.SPACES.idFromName(spaceId)).fetch(new Request(`${origin}/state`));
      const hosted = (await hostedResponse.json()) as HostedSpaceRecord;
      return renderCreatedSpace(origin, bundle, hosted);
    }

    if (request.method === 'GET' && url.pathname.startsWith('/claim/')) {
      const spaceId = url.pathname.slice('/claim/'.length);
      const token = url.searchParams.get('token');
      if (!token) {
        return textResponse('Missing token\n', 400);
      }
      const response = await controlFetch(env, origin, `/bundle/${spaceId}?token=${encodeURIComponent(token)}`);
      if (!response.ok) {
        return response;
      }
      return renderClaimPage((await response.json()) as SpaceBundle);
    }

    if (request.method === 'GET' && url.pathname === '/commons') {
      return textResponse('Spacebase1 commons self-service door is planned in a later slice.\n');
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/bundle/')) {
      const spaceId = url.pathname.slice('/api/bundle/'.length);
      const token = url.searchParams.get('token');
      if (!token) {
        return textResponse('Missing token\n', 400);
      }
      return controlFetch(env, origin, `/bundle/${spaceId}?token=${encodeURIComponent(token)}`);
    }

    return textResponse('Not found\n', 404);
  },
};

export class SpacebaseControl {
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/create-space') {
      const body = (await request.json()) as { origin: string; intendedAgentLabel: string };
      const spaceId = makeSpaceId();
      const claimToken = makeClaimToken();
      const record: PreparedSpaceRecord = {
        spaceId,
        status: 'prepared',
        intendedAgentLabel: body.intendedAgentLabel,
        claimToken,
        createdAt: new Date().toISOString(),
        claimPath: `${body.origin}/claim/${spaceId}?token=${encodeURIComponent(claimToken)}`,
        bundlePath: `${body.origin}/api/bundle/${spaceId}?token=${encodeURIComponent(claimToken)}`,
      };
      await this.state.storage.put(`space:${spaceId}`, record);
      const stub = this.env.SPACES.get(this.env.SPACES.idFromName(spaceId));
      await stub.fetch(
        new Request(`${body.origin}/bootstrap`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            spaceId,
            intendedAgentLabel: record.intendedAgentLabel,
            status: record.status,
            createdAt: record.createdAt,
          }),
        }),
      );
      return jsonResponse({ ...record, origin: body.origin });
    }

    if (request.method === 'GET' && url.pathname.startsWith('/bundle/')) {
      const spaceId = url.pathname.slice('/bundle/'.length);
      const token = url.searchParams.get('token');
      const record = (await this.state.storage.get<PreparedSpaceRecord>(`space:${spaceId}`)) ?? null;
      if (!record) {
        return textResponse('Unknown space\n', 404);
      }
      if (record.claimToken !== token) {
        return textResponse('Invalid token\n', 403);
      }
      return jsonResponse({ ...record, origin: normalizeOrigin(url) });
    }

    return textResponse('Not found\n', 404);
  }
}

export class HostedSpace {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/bootstrap') {
      const body = (await request.json()) as {
        spaceId: string;
        intendedAgentLabel: string;
        status: 'prepared' | 'claimed';
        createdAt: string;
      };
      const record: HostedSpaceRecord = {
        spaceId: body.spaceId,
        status: body.status,
        intendedAgentLabel: body.intendedAgentLabel,
        createdAt: body.createdAt,
        stewardId: `steward-${body.spaceId}`,
        serviceIntentId: `spacebase1:service:${body.spaceId}`,
        serviceIntentContent: `This space was prepared for ${body.intendedAgentLabel}. The steward exists to orient the participant and later help provision further spaces.`,
      };
      await this.state.storage.put('state', record);
      return jsonResponse(record);
    }

    if (request.method === 'GET' && url.pathname === '/state') {
      const record = (await this.state.storage.get<HostedSpaceRecord>('state')) ?? null;
      if (!record) {
        return textResponse('Space not initialized\n', 404);
      }
      return jsonResponse(record);
    }

    return textResponse('Not found\n', 404);
  }
}

export function createPreparedSpaceRecord(origin: string, intendedAgentLabel?: string): SpaceBundle {
  const claimToken = makeClaimToken();
  const spaceId = makeSpaceId();
  const label = intendedAgentLabel?.trim() || generateFriendlyAgentLabel(spaceId);
  return {
    origin,
    spaceId,
    status: 'prepared',
    intendedAgentLabel: label,
    claimToken,
    createdAt: new Date().toISOString(),
    claimPath: `${origin}/claim/${spaceId}?token=${encodeURIComponent(claimToken)}`,
    bundlePath: `${origin}/api/bundle/${spaceId}?token=${encodeURIComponent(claimToken)}`,
  };
}
