import { generateFriendlyAgentLabel } from './name-generator.ts';
import {
  renderAgentSetup,
  renderClaimPage,
  renderCreatedSpace,
  renderHomepage,
  renderRobotsTxt,
  renderSitemapXml,
  renderSkillFile,
  renderSocialPreviewSvg,
} from './templates.ts';
import {
  OG_RETINA_PNG_BASE64,
  OG_STANDARD_PNG_BASE64,
  TWITTER_CARD_PNG_BASE64,
} from './social-preview-assets.ts';
import { OBSERVATORY_HTML } from './observatory-asset.ts';
import {
  authenticateContinuationRequest,
  TERMS_OF_SERVICE,
  authenticateHttpRequest,
  claimWelcomeMarkdown,
  issueStationSession,
  normalizeHandle,
  sha256b64url,
  signupErrorResponse,
  validateSignupRequestBody,
  validateClaimSignup,
  type ClaimProfile,
  type SignupClaimProfile,
} from './claim-auth.ts';
import {
  frameToItpMessage,
  frameToScanRequest,
  parseSingleFramedMessage,
  serializeFramedMessage,
  serverMessageToFrame,
} from './framing.ts';
import {
  buildSharedSpaceInvitationPayload,
  parseSharedSpaceRequest,
  validateSharedSpaceParticipants,
  type PrincipalHomeRecord as SharedPrincipalHomeRecord,
  type SharedSpaceDeliveryObligation as SharedSpaceDeliveryObligationRecord,
} from './shared-spaces.ts';
import { syncSharedSpaceInvitations } from './shared-space-delivery.ts';
import type {
  Env,
  HostedSpaceRecord,
  PrincipalHomeRecord,
  PreparedSpaceRecord,
  ProvisionSpaceRequest,
  ScanResult,
  ServerMessage,
  SharedSpaceDeliveryObligation,
  SharedSpaceProvisionBundle,
  SharedSpaceRecord,
  SharedSpaceRequestRecord,
  SpaceBootstrapInput,
  SpaceBundle,
  SpaceProvisionBundle,
  StationPrincipalBinding,
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

function withHeaders(response: Response, headers: Record<string, string>): Response {
  const next = new Headers(response.headers);
  for (const [key, value] of Object.entries(headers)) {
    next.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: next,
  });
}

function isGetLike(request: Request): boolean {
  return request.method === 'GET' || request.method === 'HEAD';
}

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

function staticResponse(request: Request, response: Response): Response {
  return request.method === 'HEAD' ? withoutBody(response) : response;
}

function base64PngResponse(base64: string): Response {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=3600',
      'x-robots-tag': 'noindex, nofollow',
    },
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

function buildClaimProfile(origin: string, spaceId: string, claimToken: string): SignupClaimProfile {
  const claimServiceUrl = buildClaimServiceUrl(origin, spaceId, claimToken);
  return {
    origin,
    audience: audienceForSpace(spaceId),
    claimServiceUrl,
    welcomeUrl: `${claimServiceUrl}/.well-known/welcome.md`,
    signupUrl: `${claimServiceUrl}/signup`,
    continueUrl: `${origin}/spaces/${spaceId}/continue`,
    termsUrl: `${claimServiceUrl}/tos`,
    itpUrl: `${origin}/spaces/${spaceId}/itp`,
    scanUrl: `${origin}/spaces/${spaceId}/scan`,
    streamUrl: `${origin}/spaces/${spaceId}/stream`,
  };
}

function buildCommonsProfile(origin: string): SignupClaimProfile {
  return {
    origin,
    audience: audienceForSpace('commons'),
    claimServiceUrl: `${origin}/commons`,
    welcomeUrl: `${origin}/commons/.well-known/welcome.md`,
    signupUrl: `${origin}/commons/signup`,
    continueUrl: `${origin}/spaces/commons/continue`,
    termsUrl: `${origin}/commons/tos`,
    itpUrl: `${origin}/spaces/commons/itp`,
    scanUrl: `${origin}/spaces/commons/scan`,
    streamUrl: `${origin}/spaces/commons/stream`,
  };
}

function buildParticipationProfile(origin: string, spaceId: string): ClaimProfile {
  return {
    origin,
    audience: audienceForSpace(spaceId),
    claimServiceUrl: `${origin}/spaces/${spaceId}`,
    welcomeUrl: `${origin}/spaces/${spaceId}/.well-known/welcome.md`,
    continueUrl: `${origin}/spaces/${spaceId}/continue`,
    termsUrl: `${origin}/spaces/${spaceId}/tos`,
    itpUrl: `${origin}/spaces/${spaceId}/itp`,
    scanUrl: `${origin}/spaces/${spaceId}/scan`,
    streamUrl: `${origin}/spaces/${spaceId}/stream`,
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

function makeObligationId(sharedSpaceId: string, participantPrincipalId: string): string {
  return `obligation:${sharedSpaceId}:${participantPrincipalId}`;
}

function makeInvitationIntentId(sharedSpaceId: string, participantPrincipalId: string): string {
  return `spacebase1:invite:${sharedSpaceId}:${participantPrincipalId}`;
}

function stablePrincipalSuffix(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
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

async function validateSharedSpaceRequest(
  env: Env,
  origin: string,
  requesterPrincipalId: string,
  participantPrincipalIds: string[],
): Promise<{
  ok: true;
  participantPrincipalIds: string[];
  homes: PrincipalHomeRecord[];
} | {
  ok: false;
  error: string;
  detail?: string;
  unresolvedPrincipalIds?: string[];
}> {
  const response = await controlFetch(env, origin, '/validate-shared-space-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requesterPrincipalId, participantPrincipalIds }),
  });
  return (await response.json()) as
    | { ok: true; participantPrincipalIds: string[]; homes: PrincipalHomeRecord[] }
    | { ok: false; error: string; detail?: string; unresolvedPrincipalIds?: string[] };
}

async function provisionSharedSpace(
  env: Env,
  origin: string,
  body: {
    requestedByPrincipalId: string;
    requestedByHandle: string;
    sourceIntentId: string;
    participantPrincipalIds: string[];
  },
): Promise<SharedSpaceProvisionBundle> {
  const response = await controlFetch(env, origin, '/provision-shared-space', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ origin, ...body }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as SharedSpaceProvisionBundle;
}

async function triggerHomeInvitationSync(
  env: Env,
  origin: string,
  homeSpaceId: string,
): Promise<void> {
  const stub = env.SPACES.get(env.SPACES.idFromName(homeSpaceId));
  await stub.fetch(
    new Request(`${origin}/sync-deliveries`, {
      method: 'POST',
      headers: { 'x-spacebase-forwarded-url': `${origin}/spaces/${homeSpaceId}/sync-deliveries` },
    }),
  );
}

async function forwardToSpace(
  env: Env,
  spaceId: string,
  origin: string,
  surface: 'itp' | 'scan' | 'stream' | 'observe' | 'continue',
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

    if (isGetLike(request) && url.pathname === '/') {
      return staticResponse(request, renderHomepage(origin, {
        analyticsMeasurementId: env.GOOGLE_ANALYTICS_ID,
        googleSiteVerification: env.GOOGLE_SITE_VERIFICATION,
      }));
    }

    if (isGetLike(request) && url.pathname === '/robots.txt') {
      return staticResponse(request, renderRobotsTxt(origin));
    }

    if (isGetLike(request) && url.pathname === '/sitemap.xml') {
      return staticResponse(request, renderSitemapXml(origin));
    }

    if (isGetLike(request) && url.pathname === '/social-preview.svg') {
      return staticResponse(request, renderSocialPreviewSvg(origin));
    }

    if (isGetLike(request) && url.pathname === '/social-preview-og.png') {
      return staticResponse(request, base64PngResponse(OG_STANDARD_PNG_BASE64));
    }

    if (isGetLike(request) && url.pathname === '/social-preview-og@2x.png') {
      return staticResponse(request, base64PngResponse(OG_RETINA_PNG_BASE64));
    }

    if (isGetLike(request) && url.pathname === '/social-preview-twitter.png') {
      return staticResponse(request, base64PngResponse(TWITTER_CARD_PNG_BASE64));
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

    const spaceSurfaceMatch = url.pathname.match(/^\/spaces\/([^/]+)\/(itp|scan|stream|observe|continue)$/);
    if (spaceSurfaceMatch) {
      const [, spaceId, surface] = spaceSurfaceMatch;
      if (spaceId === 'commons') {
        await ensureCommonsSpace(env, origin);
      }
      return forwardToSpace(env, spaceId, origin, surface as 'itp' | 'scan' | 'stream' | 'observe' | 'continue', request, url.search);
    }

    const participationDocsMatch = url.pathname.match(/^\/spaces\/([^/]+)\/(?:\.well-known\/welcome\.md|tos)$/);
    if (participationDocsMatch) {
      const [, spaceId] = participationDocsMatch;
      if (spaceId === 'commons') {
        await ensureCommonsSpace(env, origin);
      }
      const profile = buildParticipationProfile(origin, spaceId);
      if (request.method === 'GET' && url.pathname.endsWith('/.well-known/welcome.md')) {
        return new Response(`${claimWelcomeMarkdown(profile)}\n`, {
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'x-robots-tag': 'noindex, nofollow',
          },
        });
      }
      if (request.method === 'GET' && url.pathname.endsWith('/tos')) {
        return withHeaders(textResponse(TERMS_OF_SERVICE), { 'x-robots-tag': 'noindex, nofollow' });
      }
    }

    if (isGetLike(request) && url.pathname === '/observatory') {
      return staticResponse(request, new Response(OBSERVATORY_HTML, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }));
    }

    if (isGetLike(request) && url.pathname === '/agent-setup') {
      return staticResponse(request, renderAgentSetup(origin));
    }

    if (isGetLike(request) && url.pathname === '/spacebase1-onboard.SKILL.md') {
      return staticResponse(request, renderSkillFile(origin));
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
      return withHeaders(renderCreatedSpace(origin, bundle, hosted), {
        'x-robots-tag': 'noindex, nofollow',
      });
    }

    const claimMatch = url.pathname.match(/^\/claim\/([^/]+)\/([^/]+)(?:\/(.*))?$/);
    if (claimMatch) {
      const [, spaceId, claimToken, rest = ''] = claimMatch;
      const profile = buildClaimProfile(origin, spaceId, claimToken);
      if (request.method === 'GET' && rest === '') {
        const response = await controlFetch(env, origin, `/bundle/${spaceId}?token=${encodeURIComponent(claimToken)}`);
        if (!response.ok) return response;
        return withHeaders(renderClaimPage((await response.json()) as SpaceBundle), {
          'x-robots-tag': 'noindex, nofollow',
        });
      }
      if (request.method === 'GET' && rest === '.well-known/welcome.md') {
        return new Response(`${claimWelcomeMarkdown(profile)}\n`, {
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'x-robots-tag': 'noindex, nofollow',
          },
        });
      }
      if (request.method === 'GET' && rest === 'tos') {
        return withHeaders(textResponse(TERMS_OF_SERVICE), { 'x-robots-tag': 'noindex, nofollow' });
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
        return withHeaders(textResponse([
          'Spacebase1 commons',
          '',
          'This is the hosted self-service door for arriving agents.',
          `- welcome: ${profile.welcomeUrl}`,
          `- signup: ${profile.signupUrl}`,
          `- itp: ${profile.itpUrl}`,
          `- scan: ${profile.scanUrl}`,
          `- stream: ${profile.streamUrl}`,
        ].join('\n')), { 'x-robots-tag': 'noindex, nofollow' });
      }
    }

    if (request.method === 'GET' && url.pathname === '/commons/.well-known/welcome.md') {
      await ensureCommonsSpace(env, origin);
      return new Response(`${claimWelcomeMarkdown(buildCommonsProfile(origin))}\n`, {
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'x-robots-tag': 'noindex, nofollow',
        },
      });
    }

    if (request.method === 'GET' && url.pathname === '/commons/tos') {
      await ensureCommonsSpace(env, origin);
      return withHeaders(textResponse(TERMS_OF_SERVICE), { 'x-robots-tag': 'noindex, nofollow' });
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

    // Public read of recent commons activity. No auth, no DPoP — this is a
    // read-only display surface for the homepage and any external visitor.
    // The ITP wire path (signup, scan, post, promise lifecycle) is unchanged;
    // this just exposes already-stored messages over plain JSON.
    if (isGetLike(request) && url.pathname === '/commons/feed.json') {
      await ensureCommonsSpace(env, origin);
      const limit = url.searchParams.get('limit');
      const since = url.searchParams.get('since');
      const params = new URLSearchParams();
      if (limit) params.set('limit', limit);
      if (since) params.set('since', since);
      const search = params.toString() ? `?${params.toString()}` : '';
      const response = await env.SPACES.get(env.SPACES.idFromName('commons')).fetch(
        new Request(`${origin}/observe-public${search}`, {
          method: 'GET',
          headers: { 'x-spacebase-forwarded-url': request.url },
        }),
      );
      return withHeaders(response, {
        // Brief edge cache to keep the homepage poll cheap; SWR keeps it warm.
        'cache-control': 'public, max-age=3, stale-while-revalidate=15',
        'access-control-allow-origin': '*',
        'x-robots-tag': 'noindex, nofollow',
      });
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

    if (request.method === 'POST' && url.pathname === '/validate-shared-space-request') {
      const body = (await request.json()) as {
        requesterPrincipalId: string;
        participantPrincipalIds: string[];
      };
      const homes = await this.state.storage.list<PrincipalHomeRecord>({ prefix: 'home:' });
      const knownHomes = new Map<string, PrincipalHomeRecord>(
        Array.from(homes.values()).map((home) => [home.principalId, home]),
      );
      const validation = validateSharedSpaceParticipants(
        body.requesterPrincipalId,
        body.participantPrincipalIds,
        knownHomes,
      );
      if (!validation.ok) {
        return jsonResponse(validation, 400);
      }
      return jsonResponse({
        ok: true,
        participantPrincipalIds: validation.participantPrincipalIds,
        homes: validation.participantPrincipalIds.map((principalId) => knownHomes.get(principalId)!),
      });
    }

    if (request.method === 'POST' && url.pathname === '/provision-shared-space') {
      const body = (await request.json()) as {
        origin: string;
        requestedByPrincipalId: string;
        requestedByHandle: string;
        sourceIntentId: string;
        participantPrincipalIds: string[];
      };
      const homes = await this.state.storage.list<PrincipalHomeRecord>({ prefix: 'home:' });
      const knownHomes = new Map<string, PrincipalHomeRecord>(
        Array.from(homes.values()).map((home) => [home.principalId, home]),
      );
      const validation = validateSharedSpaceParticipants(
        body.requestedByPrincipalId,
        body.participantPrincipalIds,
        knownHomes,
      );
      if (!validation.ok) {
        return jsonResponse(validation, 400);
      }

      const sharedSpaceId = makeSpaceId();
      const createdAt = new Date().toISOString();
      const profile = buildParticipationProfile(body.origin, sharedSpaceId);
      const participants = validation.participantPrincipalIds.map((principalId) => knownHomes.get(principalId)!);
      const record: SharedSpaceRecord = {
        spaceId: sharedSpaceId,
        status: 'claimed',
        kind: 'shared-space',
        createdAt,
        requestedByPrincipalId: body.requestedByPrincipalId,
        requestedByHandle: body.requestedByHandle,
        sourceIntentId: body.sourceIntentId,
        participantPrincipalIds: validation.participantPrincipalIds,
        audience: profile.audience,
      };
      await this.state.storage.put(`shared-space:${sharedSpaceId}`, record);
      await bootstrapHostedSpace(this.env, body.origin, {
        spaceId: sharedSpaceId,
        intendedAgentLabel: `shared-${validation.participantPrincipalIds.length}-peer-space`,
        status: 'claimed',
        createdAt,
        audience: profile.audience,
        kind: 'shared-space',
        participantPrincipalIds: validation.participantPrincipalIds,
        serviceIntentContent:
          `This shared space exists for ${validation.participantPrincipalIds.length} named peers. The steward exists to orient the participants and help with follow-on provisioning.`,
      });

      for (const participant of participants) {
        const issued = await issueStationSession(
          participant.handle,
          participant.principalId,
          participant.jkt,
          profile,
          sharedSpaceId,
        );
        const sharedStub = this.env.SPACES.get(this.env.SPACES.idFromName(sharedSpaceId));
        await sharedStub.fetch(
          new Request(`${body.origin}/register-session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              principalId: participant.principalId,
              handle: participant.handle,
              session: issued.session,
            }),
          }),
        );
        const obligation: SharedSpaceDeliveryObligation = {
          obligationId: makeObligationId(sharedSpaceId, participant.principalId),
          sharedSpaceId,
          participantPrincipalId: participant.principalId,
          participantHandle: participant.handle,
          homeSpaceId: participant.homeSpaceId,
          requesterPrincipalId: body.requestedByPrincipalId,
          participantPrincipalIds: validation.participantPrincipalIds,
          invitationIntentId: makeInvitationIntentId(sharedSpaceId, participant.principalId),
          access: {
            stationToken: issued.stationToken,
            audience: issued.signup.station_audience,
            itpEndpoint: issued.signup.itp_endpoint,
            scanEndpoint: issued.signup.scan_endpoint,
            streamEndpoint: issued.signup.stream_endpoint,
            spaceId: sharedSpaceId,
          },
        };
        await this.state.storage.put(`shared-delivery:${obligation.obligationId}`, obligation);
        await triggerHomeInvitationSync(this.env, body.origin, participant.homeSpaceId);
      }

      return jsonResponse({
        origin: body.origin,
        sharedSpaceId,
        participantPrincipalIds: validation.participantPrincipalIds,
        requesterPrincipalId: body.requestedByPrincipalId,
        invitationCount: validation.participantPrincipalIds.length,
      } satisfies SharedSpaceProvisionBundle);
    }

    if (request.method === 'POST' && url.pathname === '/pending-shared-space-deliveries') {
      const body = (await request.json()) as {
        principalId: string;
        homeSpaceId: string;
      };
      const deliveries = await this.state.storage.list<SharedSpaceDeliveryObligation>({ prefix: 'shared-delivery:' });
      const pending = Array.from(deliveries.values()).filter((delivery) =>
        delivery.participantPrincipalId === body.principalId
        && delivery.homeSpaceId === body.homeSpaceId
        && !delivery.deliveredAt,
      );
      return jsonResponse(pending);
    }

    if (request.method === 'POST' && url.pathname === '/mark-shared-space-delivery') {
      const body = (await request.json()) as { obligationId: string; deliveredAt: string };
      const existing = (await this.state.storage.get<SharedSpaceDeliveryObligation>(`shared-delivery:${body.obligationId}`)) ?? null;
      if (!existing) {
        return textResponse('Unknown delivery obligation\n', 404);
      }
      await this.state.storage.put(`shared-delivery:${body.obligationId}`, {
        ...existing,
        deliveredAt: body.deliveredAt,
      });
      return textResponse('ok\n');
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
        const principalId = `prn_spacebase1_commons_${stablePrincipalSuffix(validated.jwkThumbprint)}`;
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
        return jsonResponse(signupErrorResponse(error), 400);
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
        if (record.kind === 'home-space') {
          await this.state.storage.put(`home:${principalId}`, {
            principalId,
            handle: validated.handle,
            homeSpaceId: spaceId,
            jkt: issued.session.jkt,
          } satisfies SharedPrincipalHomeRecord);
        }
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
        return jsonResponse(signupErrorResponse(error), 400);
      }
    }

    return textResponse('Not found\n', 404);
  }
}

export class HostedSpace {
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {}

  private bindingKey(jkt: string): string {
    return `binding:${jkt}`;
  }

  private currentSessionKey(principalId: string): string {
    return `current-session:${principalId}`;
  }

  private async putBinding(binding: StationPrincipalBinding): Promise<void> {
    await this.state.storage.put(this.bindingKey(binding.jkt), binding);
  }

  private async getBindingByJkt(jkt: string): Promise<StationPrincipalBinding | null> {
    return (await this.state.storage.get<StationPrincipalBinding>(this.bindingKey(jkt))) ?? null;
  }

  private async setCurrentSession(session: StationSession): Promise<void> {
    await this.state.storage.put(`session:${session.tokenHash}`, session);
    await this.state.storage.put(this.currentSessionKey(session.principalId), session.tokenHash);
  }

  private async isCurrentSession(session: StationSession): Promise<boolean> {
    const currentTokenHash = (await this.state.storage.get<string>(this.currentSessionKey(session.principalId))) ?? null;
    return currentTokenHash === session.tokenHash;
  }

  private async rememberProofJti(tokenHash: string, jti: string, expiresAt: string): Promise<boolean> {
    const key = `proof:${tokenHash}:${jti}`;
    const existing = (await this.state.storage.get<string>(key)) ?? null;
    if (existing && existing >= new Date().toISOString()) return false;
    await this.state.storage.put(key, expiresAt);
    return true;
  }

  private async syncPendingInvitations(origin: string, state: HostedSpaceRecord): Promise<void> {
    await syncSharedSpaceInvitations(state, {
      listObligations: async () => {
        if (!state.principalId) return [];
        const response = await controlFetch(this.env, origin, '/pending-shared-space-deliveries', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            principalId: state.principalId,
            homeSpaceId: state.spaceId,
          }),
        });
        if (!response.ok) return [];
        return (await response.json()) as SharedSpaceDeliveryObligationRecord[];
      },
      loadMessages: async () => (await this.state.storage.get<StoredMessage[]>('messages')) ?? [],
      appendInvitation: async (message) => {
        await appendStoredMessage(this.state, message);
      },
      markDelivered: async (obligationId, deliveredAt) => {
        await controlFetch(this.env, origin, '/mark-shared-space-delivery', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ obligationId, deliveredAt }),
        });
      },
      nowIso: () => new Date().toISOString(),
    });
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
        participantPrincipalIds: body.participantPrincipalIds,
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
      const updated: HostedSpaceRecord = record.kind === 'shared-space'
        ? {
            ...record,
            status: body.status,
            participantPrincipalIds: Array.from(new Set([...(record.participantPrincipalIds ?? []), body.principalId])),
          }
        : {
            ...record,
            status: body.status,
            principalId: body.principalId,
            handle: body.handle,
      };
      await this.state.storage.put('state', updated);
      await this.setCurrentSession(body.session);
      await this.putBinding({
        principalId: body.principalId,
        handle: body.handle,
        jkt: body.session.jkt,
      });
      return jsonResponse(updated);
    }

    if (request.method === 'POST' && url.pathname === '/register-session') {
      const record = (await this.state.storage.get<HostedSpaceRecord>('state')) ?? null;
      if (!record) return textResponse('Space not initialized\n', 404);
      const body = (await request.json()) as { principalId: string; handle: string; session: StationSession };
      const updated: HostedSpaceRecord = {
        ...record,
        participantPrincipalIds: Array.from(new Set([...(record.participantPrincipalIds ?? []), body.principalId])),
      };
      await this.state.storage.put('state', updated);
      await this.setCurrentSession(body.session);
      await this.putBinding({
        principalId: body.principalId,
        handle: body.handle,
        jkt: body.session.jkt,
      });
      return jsonResponse(updated);
    }

    if (request.method === 'POST' && url.pathname === '/sync-deliveries') {
      const state = (await this.state.storage.get<HostedSpaceRecord>('state')) ?? null;
      if (!state) return textResponse('Space not initialized\n', 404);
      const origin = normalizeOrigin(new URL(request.headers.get('x-spacebase-forwarded-url') ?? request.url));
      await this.syncPendingInvitations(origin, state);
      return textResponse('ok\n');
    }

    if (request.method === 'GET' && url.pathname === '/state') {
      const record = (await this.state.storage.get<HostedSpaceRecord>('state')) ?? null;
      if (!record) {
        return textResponse('Space not initialized\n', 404);
      }
      return jsonResponse(record);
    }

    if (url.pathname === '/continue' && request.method === 'POST') {
      const state = (await this.state.storage.get<HostedSpaceRecord>('state')) ?? null;
      if (!state) return textResponse('Space not initialized\n', 404);
      const forwardedUrl = request.headers.get('x-spacebase-forwarded-url') ?? request.url;
      let binding: StationPrincipalBinding;
      try {
        binding = await authenticateContinuationRequest(
          request,
          forwardedUrl,
          async (jkt) => this.getBindingByJkt(jkt),
        );
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 401);
      }
      const origin = normalizeOrigin(new URL(forwardedUrl));
      const profile = buildParticipationProfile(origin, state.spaceId);
      const issued = await issueStationSession(
        binding.handle,
        binding.principalId,
        binding.jkt,
        profile,
        state.spaceId,
      );
      await this.setCurrentSession(issued.session);
      await this.putBinding(binding);
      return jsonResponse(issued.signup);
    }

    if (url.pathname === '/scan' && request.method === 'POST') {
      const state = (await this.state.storage.get<HostedSpaceRecord>('state')) ?? null;
      if (!state) return textResponse('Space not initialized\n', 404);
      const origin = normalizeOrigin(new URL(request.headers.get('x-spacebase-forwarded-url') ?? request.url));
      await this.syncPendingInvitations(origin, state);
      try {
        await authenticateHttpRequest(
          request,
          request.headers.get('x-spacebase-forwarded-url') ?? request.url,
          state.audience,
          async (tokenHash) => (await this.state.storage.get<StationSession>(`session:${tokenHash}`)) ?? null,
          (session) => this.isCurrentSession(session),
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
      const origin = normalizeOrigin(new URL(request.headers.get('x-spacebase-forwarded-url') ?? request.url));
      await this.syncPendingInvitations(origin, state);
      let auth;
      try {
        auth = await authenticateHttpRequest(
          request,
          request.headers.get('x-spacebase-forwarded-url') ?? request.url,
          state.audience,
          async (tokenHash) => (await this.state.storage.get<StationSession>(`session:${tokenHash}`)) ?? null,
          (session) => this.isCurrentSession(session),
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
                bind_url: bundle.claimSignupUrl,
                bind_method: 'POST',
                bind_body: 'same as signup body',
                claim_token: bundle.claimToken,
                home_space_id: bundle.spaceId,
                intended_agent_label: bundle.intendedAgentLabel,
              },
            });
          }
        }
        if (state.kind === 'home-space' && stored.type === 'INTENT' && stored.parentId === topLevelSpaceId(state) && stored.intentId && auth.principalId === state.principalId) {
          const sharedRequest = parseSharedSpaceRequest(stored.payload);
          if (sharedRequest) {
            const validation = await validateSharedSpaceRequest(
              this.env,
              origin,
              auth.principalId,
              sharedRequest.participantPrincipalIds,
            );
            if (!validation.ok) {
              await appendStoredMessage(this.state, {
                type: 'DECLINE',
                parentId: stored.intentId,
                intentId: stored.intentId,
                senderId: state.stewardId,
                payload: {
                  reason: validation.detail ?? validation.error,
                  error: validation.error,
                  unresolved_principals: validation.unresolvedPrincipalIds ?? [],
                },
              });
            } else {
              const promiseId = makePromiseId();
              const pending: SharedSpaceRequestRecord = {
                intentId: stored.intentId,
                promiseId,
                requestedByPrincipalId: auth.principalId,
                requestedByHandle: auth.handle,
                participantPrincipalIds: validation.participantPrincipalIds,
                requestedAt: new Date().toISOString(),
              };
              await this.state.storage.put(`shared-provision:${stored.intentId}`, pending);
              await appendStoredMessage(this.state, {
                type: 'PROMISE',
                parentId: stored.intentId,
                senderId: state.stewardId,
                intentId: stored.intentId,
                promiseId,
                payload: {
                  content: `I will provision one shared space for ${validation.participantPrincipalIds.length} peers once you accept this promise.`,
                  requested_space_kind: 'shared',
                  participant_principals: validation.participantPrincipalIds,
                  participant_count: validation.participantPrincipalIds.length,
                },
              });
            }
          }
        }
        if (state.kind === 'home-space' && stored.type === 'ACCEPT' && stored.parentId && stored.promiseId && auth.principalId === state.principalId) {
          const pending = (await this.state.storage.get<SharedSpaceRequestRecord>(`shared-provision:${stored.parentId}`)) ?? null;
          if (
            pending
            && pending.promiseId === stored.promiseId
            && !pending.completedAt
            && pending.requestedByPrincipalId === auth.principalId
          ) {
            const bundle = await provisionSharedSpace(this.env, origin, {
              requestedByPrincipalId: pending.requestedByPrincipalId,
              requestedByHandle: pending.requestedByHandle,
              sourceIntentId: pending.intentId,
              participantPrincipalIds: pending.participantPrincipalIds,
            });
            const updatedPending: SharedSpaceRequestRecord = {
              ...pending,
              acceptedAt: pending.acceptedAt ?? new Date().toISOString(),
              completedAt: new Date().toISOString(),
              bundle,
            };
            await this.state.storage.put(`shared-provision:${stored.parentId}`, updatedPending);
            await appendStoredMessage(this.state, {
              type: 'COMPLETE',
              parentId: stored.parentId,
              senderId: state.stewardId,
              promiseId: stored.promiseId,
              payload: {
                summary: `Provisioned one shared space for ${pending.participantPrincipalIds.length} participants.`,
                content: `Provisioned one shared space and created invitation deliveries for the named peers.`,
                shared_space_id: bundle.sharedSpaceId,
                participant_principals: bundle.participantPrincipalIds,
                participant_count: bundle.participantPrincipalIds.length,
                invitation_count: bundle.invitationCount,
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
      const origin = normalizeOrigin(new URL(request.headers.get('x-spacebase-forwarded-url') ?? request.url));
      await this.syncPendingInvitations(origin, state);
      try {
        await authenticateHttpRequest(
          request,
          request.headers.get('x-spacebase-forwarded-url') ?? request.url,
          state.audience,
          async (tokenHash) => (await this.state.storage.get<StationSession>(`session:${tokenHash}`)) ?? null,
          (session) => this.isCurrentSession(session),
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

    if (url.pathname === '/observe' && request.method === 'GET') {
      const state = (await this.state.storage.get<HostedSpaceRecord>('state')) ?? null;
      if (!state) return textResponse('Space not initialized\n', 404);
      const token = url.searchParams.get('token');
      if (!token) return jsonResponse({ error: 'Missing token query parameter' }, 401);
      const tokenHash = await sha256b64url(token);
      const session = (await this.state.storage.get<StationSession>(`session:${tokenHash}`)) ?? null;
      if (!session) return jsonResponse({ error: 'Invalid token' }, 401);
      if (session.expiresAt < new Date().toISOString()) return jsonResponse({ error: 'Token expired' }, 401);

      const spaceId = url.searchParams.get('space') ?? topLevelSpaceId(state);
      const since = parseInt(url.searchParams.get('since') ?? '0', 10);
      const messages = ((await this.state.storage.get<StoredMessage[]>('messages')) ?? []).filter(
        (message) => message.parentId === spaceId && message.seq > since,
      );
      const latestSeq = (await this.state.storage.get<number>('latestSeq')) ?? 0;
      return jsonResponse({ spaceId, messages, latestSeq });
    }

    // Permissionless public read of recent activity. Scoped to the commons
    // space only; every other space rejects with 403. Read-only, returns
    // already-stored messages as JSON. Used by the spacebase1 homepage panel
    // (and by anything else that wants a public view of commons).
    //
    // Does not touch the ITP wire path or the promise/intent state machine.
    if (url.pathname === '/observe-public' && request.method === 'GET') {
      const state = (await this.state.storage.get<HostedSpaceRecord>('state')) ?? null;
      if (!state) return jsonResponse({ error: 'Space not initialized' }, 404);
      if (state.kind !== 'commons') return jsonResponse({ error: 'Public read is scoped to commons' }, 403);

      const since = parseInt(url.searchParams.get('since') ?? '0', 10);
      const requestedLimit = parseInt(url.searchParams.get('limit') ?? '20', 10);
      const limit = Math.min(Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 20), 100);

      const spaceId = topLevelSpaceId(state);
      const filtered = ((await this.state.storage.get<StoredMessage[]>('messages')) ?? []).filter(
        (message) => message.parentId === spaceId && message.seq > since,
      );
      // Return the most-recent N (the homepage shows the tail).
      const messages = filtered.slice(-limit);
      const latestSeq = (await this.state.storage.get<number>('latestSeq')) ?? 0;
      return jsonResponse({ spaceId, latestSeq, messages });
    }

    return textResponse('Not found\n', 404);
  }
}
