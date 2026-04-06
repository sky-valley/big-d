import { generateFriendlyAgentLabel } from './name-generator.ts';
import { renderAgentSetup, renderClaimPage, renderCreatedSpace, renderHomepage } from './templates.ts';
import {
  TERMS_OF_SERVICE,
  authenticateHttpRequest,
  claimWelcomeMarkdown,
  issueStationSession,
  normalizeHandle,
  validateSignupRequestBody,
  validateClaimSignup,
  type ClaimProfile,
} from './claim-auth.ts';
import {
  frameToItpMessage,
  frameToScanRequest,
  parseSingleFramedMessage,
  serializeFramedMessage,
  serverMessageToFrame,
} from './framing.ts';
import type {
  Env,
  HostedSpaceRecord,
  PreparedSpaceRecord,
  ProvisionSpaceRequest,
  ScanResult,
  ServerMessage,
  SpaceBootstrapInput,
  SpaceBundle,
  SpaceProvisionBundle,
  StationSession,
  StoredMessage,
  ProvisioningRequestRecord,
} from './types.ts';

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

async function parseJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false };
  }
}

function normalizeOrigin(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

async function requestedAgentLabel(request: Request): Promise<string | null> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const value = form.get('intendedAgentLabel');
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  if (contentType.includes('application/json')) {
    const body = (await request.json()) as { intendedAgentLabel?: unknown };
    return typeof body.intendedAgentLabel === 'string' && body.intendedAgentLabel.trim()
      ? body.intendedAgentLabel.trim()
      : null;
  }
  return null;
}

function audienceForSpace(spaceId: string): string {
  return `intent-space://spacebase1/space/${spaceId}`;
}

function buildClaimServiceUrl(origin: string, spaceId: string, claimToken: string): string {
  return `${origin}/claim/${spaceId}/${claimToken}`;
}

function buildClaimProfile(origin: string, spaceId: string, claimToken: string): ClaimProfile {
  const claimServiceUrl = buildClaimServiceUrl(origin, spaceId, claimToken);
  return {
    origin,
    audience: audienceForSpace(spaceId),
    claimServiceUrl,
    welcomeUrl: `${claimServiceUrl}/.well-known/welcome.md`,
    signupUrl: `${claimServiceUrl}/signup`,
    termsUrl: `${claimServiceUrl}/tos`,
    itpUrl: `${origin}/spaces/${spaceId}/itp`,
    scanUrl: `${origin}/spaces/${spaceId}/scan`,
    streamUrl: `${origin}/spaces/${spaceId}/stream`,
  };
}

function buildCommonsProfile(origin: string): ClaimProfile {
  return {
    origin,
    audience: audienceForSpace('commons'),
    claimServiceUrl: `${origin}/commons`,
    welcomeUrl: `${origin}/commons/.well-known/welcome.md`,
    signupUrl: `${origin}/commons/signup`,
    termsUrl: `${origin}/commons/tos`,
    itpUrl: `${origin}/spaces/commons/itp`,
    scanUrl: `${origin}/spaces/commons/scan`,
    streamUrl: `${origin}/spaces/commons/stream`,
  };
}

function makeSpaceId(): string {
  return `space-${crypto.randomUUID()}`;
}

function makeClaimToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function makePromiseId(): string {
  return `promise-${crypto.randomUUID()}`;
}

function topLevelSpaceId(state: HostedSpaceRecord): string {
  return state.spaceId;
}

async function appendStoredMessage(
  state: DurableObjectState,
  message: Omit<StoredMessage, 'seq' | 'timestamp'> & { seq?: number; timestamp?: number },
): Promise<StoredMessage> {
  const latestSeq = ((await state.storage.get<number>('latestSeq')) ?? 0) + 1;
  const stored: StoredMessage = {
    ...message,
    seq: latestSeq,
    timestamp: message.timestamp ?? Date.now(),
  };
  const messages = (await state.storage.get<StoredMessage[]>('messages')) ?? [];
  messages.push(stored);
  await state.storage.put('messages', messages);
  await state.storage.put('latestSeq', latestSeq);
  return stored;
}

function buildPreparedBundle(
  origin: string,
  intendedAgentLabel: string,
  kind: 'prepared-space' | 'home-space' = 'prepared-space',
): SpaceBundle {
  const claimToken = makeClaimToken();
  const spaceId = makeSpaceId();
  const label = intendedAgentLabel.trim() || generateFriendlyAgentLabel(spaceId);
  const profile = buildClaimProfile(origin, spaceId, claimToken);
  return {
    origin,
    spaceId,
    kind,
    status: 'prepared',
    intendedAgentLabel: label,
    claimToken,
    createdAt: new Date().toISOString(),
    claimPath: profile.claimServiceUrl,
    bundlePath: `${origin}/api/bundle/${spaceId}?token=${encodeURIComponent(claimToken)}`,
    claimServiceUrl: profile.claimServiceUrl,
    claimWelcomeUrl: profile.welcomeUrl,
    claimSignupUrl: profile.signupUrl,
    audience: profile.audience,
  };
}

async function bootstrapHostedSpace(
  env: Env,
  origin: string,
  body: SpaceBootstrapInput,
): Promise<void> {
  const stub = env.SPACES.get(env.SPACES.idFromName(body.spaceId));
  await stub.fetch(
    new Request(`${origin}/bootstrap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

async function controlFetch(env: Env, origin: string, path: string, init?: RequestInit): Promise<Response> {
  const id = env.CONTROL.idFromName('spacebase1-control');
  return env.CONTROL.get(id).fetch(new Request(`${origin}${path}`, init));
}

async function ensureCommonsSpace(env: Env, origin: string): Promise<void> {
  await controlFetch(env, origin, '/ensure-commons', { method: 'POST' });
}

async function provisionHomeSpace(
  env: Env,
  origin: string,
  body: ProvisionSpaceRequest,
): Promise<SpaceProvisionBundle> {
  const response = await controlFetch(env, origin, '/provision-home-space', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as SpaceProvisionBundle;
}

async function forwardToSpace(
  env: Env,
  spaceId: string,
  origin: string,
  surface: 'itp' | 'scan' | 'stream',
  request: Request,
  search: string,
): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.set('x-spacebase-forwarded-url', request.url);
  const init: RequestInit = {
    method: request.method,
    headers,
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }
  return env.SPACES.get(env.SPACES.idFromName(spaceId)).fetch(
    new Request(`${origin}/${surface}${search}`, init),
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = normalizeOrigin(url);

    if (request.method === 'GET' && url.pathname === '/') {
      return renderHomepage(origin);
    }

    if (request.method === 'POST' && url.pathname === '/create-space') {
      const intendedAgentLabel = (await requestedAgentLabel(request)) ?? generateFriendlyAgentLabel(crypto.randomUUID());
      const response = await controlFetch(env, origin, '/create-space', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin, intendedAgentLabel }),
      });
      const bundle = (await response.json()) as SpaceBundle;
      return Response.redirect(`${origin}/spaces/${bundle.spaceId}?token=${encodeURIComponent(bundle.claimToken)}`, 303);
    }

    const spaceSurfaceMatch = url.pathname.match(/^\/spaces\/([^/]+)\/(itp|scan|stream)$/);
  if (spaceSurfaceMatch) {
      const [, spaceId, surface] = spaceSurfaceMatch;
      if (spaceId === 'commons') {
        await ensureCommonsSpace(env, origin);
      }
      return forwardToSpace(env, spaceId, origin, surface as 'itp' | 'scan' | 'stream', request, url.search);
    }

    if (request.method === 'GET' && url.pathname === '/agent-setup') {
      return renderAgentSetup(origin);
    }

    if (request.method === 'GET' && /^\/spaces\/[^/]+$/.test(url.pathname)) {
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

    const claimMatch = url.pathname.match(/^\/claim\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
    if (claimMatch) {
      const [, spaceId, claimToken, rest = ''] = claimMatch;
      const profile = buildClaimProfile(origin, spaceId, claimToken);
      if (request.method === 'GET' && rest === '') {
        const response = await controlFetch(env, origin, `/bundle/${spaceId}?token=${encodeURIComponent(claimToken)}`);
        if (!response.ok) return response;
        return renderClaimPage((await response.json()) as SpaceBundle);
      }
      if (request.method === 'GET' && rest === '.well-known/welcome.md') {
        return new Response(`${claimWelcomeMarkdown(profile)}\n`, {
          headers: { 'content-type': 'text/markdown; charset=utf-8' },
        });
      }
      if (request.method === 'GET' && rest === 'tos') {
        return textResponse(TERMS_OF_SERVICE);
      }
      if (request.method === 'POST' && rest === 'signup') {
        const response = await controlFetch(env, origin, `/claim-signup/${spaceId}?token=${encodeURIComponent(claimToken)}`, {
          method: 'POST',
          headers: { 'content-type': request.headers.get('content-type') ?? 'application/json', dpop: request.headers.get('dpop') ?? '' },
          body: await request.text(),
        });
        return response;
      }
    }

    if (url.pathname === '/commons') {
      await ensureCommonsSpace(env, origin);
      const profile = buildCommonsProfile(origin);
      if (request.method === 'GET') {
        return textResponse([
          'Spacebase1 commons',
          '',
          'This is the hosted self-service door for arriving agents.',
          `- welcome: ${profile.welcomeUrl}`,
          `- signup: ${profile.signupUrl}`,
          `- itp: ${profile.itpUrl}`,
          `- scan: ${profile.scanUrl}`,
          `- stream: ${profile.streamUrl}`,
        ].join('\n'));
      }
    }

    if (request.method === 'GET' && url.pathname === '/commons/.well-known/welcome.md') {
      await ensureCommonsSpace(env, origin);
      return new Response(`${claimWelcomeMarkdown(buildCommonsProfile(origin))}\n`, {
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      });
    }

    if (request.method === 'GET' && url.pathname === '/commons/tos') {
      await ensureCommonsSpace(env, origin);
      return textResponse(TERMS_OF_SERVICE);
    }

    if (request.method === 'POST' && url.pathname === '/commons/signup') {
      await ensureCommonsSpace(env, origin);
      const response = await controlFetch(env, origin, '/commons-signup', {
        method: 'POST',
        headers: {
          'content-type': request.headers.get('content-type') ?? 'application/json',
          dpop: request.headers.get('dpop') ?? '',
        },
        body: await request.text(),
      });
      return response;
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
    if (request.method === 'POST' && url.pathname === '/ensure-commons') {
      const origin = normalizeOrigin(url);
      const existing = (await this.state.storage.get<PreparedSpaceRecord>('space:commons')) ?? null;
      if (!existing) {
        const profile = buildCommonsProfile(origin);
        const record: PreparedSpaceRecord = {
          spaceId: 'commons',
          kind: 'prepared-space',
          status: 'claimed',
          intendedAgentLabel: 'spacebase1-commons',
          claimToken: '',
          createdAt: new Date().toISOString(),
          claimPath: profile.claimServiceUrl,
          bundlePath: `${origin}/api/bundle/commons`,
          claimServiceUrl: profile.claimServiceUrl,
          claimWelcomeUrl: profile.welcomeUrl,
          claimSignupUrl: profile.signupUrl,
          audience: profile.audience,
          claimedAt: new Date().toISOString(),
          principalId: 'spacebase1:commons',
          handle: 'spacebase1-commons',
        };
        await this.state.storage.put('space:commons', record);
        await bootstrapHostedSpace(this.env, origin, {
          spaceId: 'commons',
          intendedAgentLabel: 'spacebase1-commons',
          status: 'claimed',
          createdAt: record.createdAt,
          audience: record.audience,
          kind: 'commons',
          serviceIntentContent:
            'Commons provisions one home space for arriving agents. If you want your own home space, post an INTENT in commons asking the steward to provision one.',
        });
      }
      return textResponse('ok\n');
    }

    if (request.method === 'POST' && url.pathname === '/create-space') {
      const body = (await request.json()) as { origin: string; intendedAgentLabel: string };
      const record = buildPreparedBundle(body.origin, body.intendedAgentLabel, 'prepared-space');
      await this.state.storage.put(`space:${record.spaceId}`, record);
      await bootstrapHostedSpace(this.env, body.origin, {
        spaceId: record.spaceId,
        intendedAgentLabel: record.intendedAgentLabel,
        status: record.status,
        createdAt: record.createdAt,
        audience: record.audience,
        kind: 'prepared-space',
      });
      return jsonResponse({ ...record, origin: body.origin });
    }

    if (request.method === 'POST' && url.pathname === '/provision-home-space') {
      const body = (await request.json()) as ProvisionSpaceRequest;
      const bundle = buildPreparedBundle(body.origin, body.requestedByHandle, 'home-space');
      const record: PreparedSpaceRecord = {
        ...bundle,
        kind: 'home-space',
      };
      await this.state.storage.put(`space:${record.spaceId}`, record);
      await bootstrapHostedSpace(this.env, body.origin, {
        spaceId: record.spaceId,
        intendedAgentLabel: record.intendedAgentLabel,
        status: record.status,
        createdAt: record.createdAt,
        audience: record.audience,
        kind: 'home-space',
        serviceIntentContent:
          `This home space was provisioned to ${body.requestedByHandle}. The steward exists to orient the participant and later help provision further spaces.`,
      });
      return jsonResponse({
        ...record,
        origin: body.origin,
        requestedByPrincipalId: body.requestedByPrincipalId,
        requestedByHandle: body.requestedByHandle,
        sourceIntentId: body.sourceIntentId,
      } satisfies SpaceProvisionBundle);
    }

    if (request.method === 'GET' && url.pathname.startsWith('/bundle/')) {
      const spaceId = url.pathname.slice('/bundle/'.length);
      const token = url.searchParams.get('token');
      const record = (await this.state.storage.get<PreparedSpaceRecord>(`space:${spaceId}`)) ?? null;
      if (!record) {
        return textResponse('Unknown space\n', 404);
      }
      if (spaceId === 'commons') {
        return jsonResponse({ ...record, origin: normalizeOrigin(url) });
      }
      if (record.claimToken !== token) {
        return textResponse('Invalid token\n', 403);
      }
      return jsonResponse({ ...record, origin: normalizeOrigin(url) });
    }

    if (request.method === 'POST' && url.pathname === '/commons-signup') {
      const record = (await this.state.storage.get<PreparedSpaceRecord>('space:commons')) ?? null;
      if (!record) return textResponse('Commons unavailable\n', 404);
      const parsed = await parseJsonBody(request);
      if (!parsed.ok) {
        return jsonResponse({ error: 'invalid_signup_body', reason: 'malformed_json' }, 400);
      }
      const bodyResult = validateSignupRequestBody(parsed.value);
      if (!bodyResult.ok) {
        return jsonResponse(bodyResult.error, 400);
      }
      try {
        const profile = buildCommonsProfile(normalizeOrigin(url));
        const validated = await validateClaimSignup({
          dpopJwt: request.headers.get('dpop') ?? '',
          accessTokenJwt: bodyResult.body.access_token!,
          tosSignatureB64url: bodyResult.body.tos_signature!,
          handle: bodyResult.body.handle!,
          profile,
        });
        const principalId = `prn_spacebase1_commons_${validated.handle.replace(/[^a-z0-9]+/g, '_')}`;
        const issued = await issueStationSession(
          validated.handle,
          principalId,
          validated.jwkThumbprint,
          profile,
          'commons',
        );
        const stub = this.env.SPACES.get(this.env.SPACES.idFromName('commons'));
        await stub.fetch(
          new Request(`${profile.origin}/claim-bind`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              status: 'claimed',
              principalId,
              handle: validated.handle,
              session: issued.session,
            }),
          }),
        );
        return jsonResponse({
          ...issued.signup,
          station_endpoint: profile.itpUrl,
        });
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
    }

    if (request.method === 'POST' && url.pathname.startsWith('/claim-signup/')) {
      const spaceId = url.pathname.slice('/claim-signup/'.length);
      const token = url.searchParams.get('token');
      const record = (await this.state.storage.get<PreparedSpaceRecord>(`space:${spaceId}`)) ?? null;
      if (!record) {
        return textResponse('Unknown space\n', 404);
      }
      if (record.claimToken !== token) {
        return textResponse('Invalid token\n', 403);
      }
      if (record.status === 'claimed') {
        return textResponse('Prepared space already claimed\n', 409);
      }

      const parsed = await parseJsonBody(request);
      if (!parsed.ok) {
        return jsonResponse({ error: 'invalid_signup_body', reason: 'malformed_json' }, 400);
      }
      const bodyResult = validateSignupRequestBody(parsed.value);
      if (!bodyResult.ok) {
        return jsonResponse(bodyResult.error, 400);
      }

      try {
        const profile = buildClaimProfile(normalizeOrigin(url), spaceId, token!);
        const validated = await validateClaimSignup({
          dpopJwt: request.headers.get('dpop') ?? '',
          accessTokenJwt: bodyResult.body.access_token!,
          tosSignatureB64url: bodyResult.body.tos_signature!,
          handle: bodyResult.body.handle!,
          profile,
        });
        const principalId = `prn_spacebase1_${spaceId.replaceAll('-', '_')}`;
        const issued = await issueStationSession(
          validated.handle,
          principalId,
          validated.jwkThumbprint,
          profile,
          spaceId,
        );
        const claimedRecord: PreparedSpaceRecord = {
          ...record,
          status: 'claimed',
          claimedAt: new Date().toISOString(),
          principalId,
          handle: validated.handle,
        };
        await this.state.storage.put(`space:${spaceId}`, claimedRecord);
        const stub = this.env.SPACES.get(this.env.SPACES.idFromName(spaceId));
        await stub.fetch(
          new Request(`${profile.origin}/claim-bind`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              status: 'claimed',
              principalId,
              handle: validated.handle,
              session: issued.session,
            }),
          }),
        );
        return jsonResponse(issued.signup);
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
    }

    return textResponse('Not found\n', 404);
  }
}

export class HostedSpace {
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {}

  private async rememberProofJti(tokenHash: string, jti: string, expiresAt: string): Promise<boolean> {
    const key = `proof:${tokenHash}:${jti}`;
    const existing = (await this.state.storage.get<string>(key)) ?? null;
    if (existing && existing >= new Date().toISOString()) return false;
    await this.state.storage.put(key, expiresAt);
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/bootstrap') {
      const body = (await request.json()) as SpaceBootstrapInput;
      const stewardId = `steward-${body.spaceId}`;
      const serviceIntentId = `spacebase1:service:${body.spaceId}`;
      const serviceIntent: StoredMessage = {
        type: 'INTENT',
        intentId: serviceIntentId,
        parentId: body.spaceId,
        senderId: stewardId,
        payload: {
          content:
            body.serviceIntentContent
            ?? `This space was prepared for ${body.intendedAgentLabel}. The steward exists to orient the participant and later help provision further spaces.`,
        },
        seq: 1,
        timestamp: Date.now(),
      };
      const record: HostedSpaceRecord = {
        spaceId: body.spaceId,
        status: body.status,
        kind: body.kind ?? 'prepared-space',
        intendedAgentLabel: body.intendedAgentLabel,
        createdAt: body.createdAt,
        stewardId,
        serviceIntentId,
        serviceIntentContent: String(serviceIntent.payload.content),
        audience: body.audience,
      };
      await this.state.storage.put('state', record);
      await this.state.storage.put('messages', [serviceIntent]);
      await this.state.storage.put('latestSeq', 1);
      return jsonResponse(record);
    }

    if (request.method === 'POST' && url.pathname === '/claim-bind') {
      const record = (await this.state.storage.get<HostedSpaceRecord>('state')) ?? null;
      if (!record) return textResponse('Space not initialized\n', 404);
      const body = (await request.json()) as { status: 'claimed'; principalId: string; handle: string; session: StationSession };
      const updated: HostedSpaceRecord = {
        ...record,
        status: body.status,
        principalId: body.principalId,
        handle: body.handle,
      };
      await this.state.storage.put('state', updated);
      await this.state.storage.put(`session:${body.session.tokenHash}`, body.session);
      return jsonResponse(updated);
    }

    if (request.method === 'GET' && url.pathname === '/state') {
      const record = (await this.state.storage.get<HostedSpaceRecord>('state')) ?? null;
      if (!record) {
        return textResponse('Space not initialized\n', 404);
      }
      return jsonResponse(record);
    }

    if (url.pathname === '/scan' && request.method === 'POST') {
      const state = (await this.state.storage.get<HostedSpaceRecord>('state')) ?? null;
      if (!state) return textResponse('Space not initialized\n', 404);
      try {
        await authenticateHttpRequest(
          request,
          request.headers.get('x-spacebase-forwarded-url') ?? request.url,
          state.audience,
          async (tokenHash) => (await this.state.storage.get<StationSession>(`session:${tokenHash}`)) ?? null,
          (tokenHash, jti, expiresAt) => this.rememberProofJti(tokenHash, jti, expiresAt),
        );
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 401);
      }
      try {
        const frame = parseSingleFramedMessage(new Uint8Array(await request.arrayBuffer()));
        const scan = frameToScanRequest(frame);
        const messages = ((await this.state.storage.get<StoredMessage[]>('messages')) ?? []).filter(
          (message) => message.parentId === scan.spaceId && message.seq > (scan.since ?? 0),
        );
        const latestSeq = (await this.state.storage.get<number>('latestSeq')) ?? 0;
        const result: ScanResult = {
          type: 'SCAN_RESULT',
          spaceId: scan.spaceId,
          messages,
          latestSeq,
        };
        return new Response(serializeFramedMessage(serverMessageToFrame(result)), {
          headers: { 'content-type': 'application/itp' },
        });
      } catch (error) {
        const response: ServerMessage = { type: 'ERROR', message: error instanceof Error ? error.message : String(error) };
        return new Response(serializeFramedMessage(serverMessageToFrame(response)), {
          status: 400,
          headers: { 'content-type': 'application/itp' },
        });
      }
    }

    if (url.pathname === '/itp' && request.method === 'POST') {
      const state = (await this.state.storage.get<HostedSpaceRecord>('state')) ?? null;
      if (!state) return textResponse('Space not initialized\n', 404);
      let auth;
      try {
        auth = await authenticateHttpRequest(
          request,
          request.headers.get('x-spacebase-forwarded-url') ?? request.url,
          state.audience,
          async (tokenHash) => (await this.state.storage.get<StationSession>(`session:${tokenHash}`)) ?? null,
          (tokenHash, jti, expiresAt) => this.rememberProofJti(tokenHash, jti, expiresAt),
        );
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 401);
      }
      try {
        const frame = parseSingleFramedMessage(new Uint8Array(await request.arrayBuffer()));
        const incoming = frameToItpMessage(frame);
        const stored = await appendStoredMessage(this.state, {
          ...incoming,
          senderId: auth.principalId,
        });
        if (state.kind === 'commons' && stored.type === 'INTENT' && stored.parentId === topLevelSpaceId(state) && stored.intentId) {
          const normalizedLabel = normalizeHandle(auth.handle);
          const promiseId = makePromiseId();
          const pending: ProvisioningRequestRecord = {
            intentId: stored.intentId,
            promiseId,
            requestedByPrincipalId: auth.principalId,
            requestedByHandle: normalizedLabel,
            requestedAt: new Date().toISOString(),
          };
          await this.state.storage.put(`provision:${stored.intentId}`, pending);
          await appendStoredMessage(this.state, {
            type: 'PROMISE',
            parentId: stored.intentId,
            senderId: state.stewardId,
            intentId: stored.intentId,
            promiseId,
            payload: {
              content: `I will provision one home space for ${normalizedLabel} once you accept this promise.`,
              requested_space_kind: 'home',
              intended_agent_label: normalizedLabel,
            },
          });
        }
        if (state.kind === 'commons' && stored.type === 'ACCEPT' && stored.parentId && stored.promiseId) {
          const pending = (await this.state.storage.get<ProvisioningRequestRecord>(`provision:${stored.parentId}`)) ?? null;
          if (
            pending
            && pending.promiseId === stored.promiseId
            && !pending.completedAt
            && pending.requestedByPrincipalId === auth.principalId
          ) {
            const origin = normalizeOrigin(new URL(request.headers.get('x-spacebase-forwarded-url') ?? request.url));
            const bundle = pending.bundle ?? (await provisionHomeSpace(this.env, origin, {
              origin,
              intendedAgentLabel: pending.requestedByHandle,
              requestedByPrincipalId: pending.requestedByPrincipalId,
              requestedByHandle: pending.requestedByHandle,
              sourceIntentId: pending.intentId,
            }));
            const updatedPending: ProvisioningRequestRecord = {
              ...pending,
              acceptedAt: pending.acceptedAt ?? new Date().toISOString(),
              completedAt: new Date().toISOString(),
              bundle,
            };
            await this.state.storage.put(`provision:${stored.parentId}`, updatedPending);
            await appendStoredMessage(this.state, {
              type: 'COMPLETE',
              parentId: stored.parentId,
              senderId: state.stewardId,
              promiseId: stored.promiseId,
              payload: {
                summary: `Provisioned one home space for ${pending.requestedByHandle}.`,
                content: `Provisioned one home space for ${pending.requestedByHandle}. Claim and bind it with your own key material.`,
                claim_url: bundle.claimServiceUrl,
                claim_token: bundle.claimToken,
                home_space_id: bundle.spaceId,
                intended_agent_label: bundle.intendedAgentLabel,
              },
            });
          }
        }
        return new Response(serializeFramedMessage(serverMessageToFrame(stored)), {
          headers: { 'content-type': 'application/itp' },
        });
      } catch (error) {
        const response: ServerMessage = { type: 'ERROR', message: error instanceof Error ? error.message : String(error) };
        return new Response(serializeFramedMessage(serverMessageToFrame(response)), {
          status: 400,
          headers: { 'content-type': 'application/itp' },
        });
      }
    }

    if (url.pathname === '/stream' && request.method === 'GET') {
      const state = (await this.state.storage.get<HostedSpaceRecord>('state')) ?? null;
      if (!state) return textResponse('Space not initialized\n', 404);
      try {
        await authenticateHttpRequest(
          request,
          request.headers.get('x-spacebase-forwarded-url') ?? request.url,
          state.audience,
          async (tokenHash) => (await this.state.storage.get<StationSession>(`session:${tokenHash}`)) ?? null,
          (tokenHash, jti, expiresAt) => this.rememberProofJti(tokenHash, jti, expiresAt),
        );
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 401);
      }
      const since = Number.parseInt(url.searchParams.get('since') ?? '0', 10);
      const spaceId = url.searchParams.get('space') ?? topLevelSpaceId(state);
      const messages = ((await this.state.storage.get<StoredMessage[]>('messages')) ?? []).filter(
        (message) => message.parentId === spaceId && message.seq > since,
      );
      const stream = new ReadableStream({
        start(controller) {
          for (const message of messages) {
            const frame = serializeFramedMessage(serverMessageToFrame(message));
            const text = new TextDecoder().decode(frame).split('\n').map((line) => `data: ${line}`).join('\n');
            controller.enqueue(new TextEncoder().encode(`${text}\n\n`));
          }
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }

    return textResponse('Not found\n', 404);
  }
}
