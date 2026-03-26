import { createHash, generateKeyPairSync, randomUUID, sign } from 'crypto';
import { join } from 'path';
import { IntentSpaceClient } from '../../intent-space/src/client.ts';
import { StationPrincipalRegistry } from '../../intent-space/src/principal-registry.ts';
import type { StoredMessage } from '../../intent-space/src/types.ts';
import { HeadwatersProvisioner } from './provisioner.ts';
import { HeadwatersStewardState, type PersistedStewardRequest } from './steward-state.ts';
import {
  commonsStationEndpoint,
  commonsStationAudience,
  HEADWATERS_COMMONS_SPACE_ID,
  HEADWATERS_STEWARD_ID,
  headwatersOrigin,
  isCreateHomeSpacePayload,
  isCreateSharedSpacePayload,
  isProvisioningPayload,
  type CreateSpaceRequestPayload,
  type ProvisionedSpaceReply,
  type ProvisionedSharedSpaceReply,
  type SharedSpaceParticipantCredential,
} from './contract.ts';
import { issueCommonsStationToken } from './welcome-mat.ts';

function b64urlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalRequest(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return stableStringify(value);
  }
  const record = value as Record<string, unknown>;
  if (record.type === 'AUTH') {
    return 'AUTH';
  }
  if (record.type === 'SCAN') {
    return ['SCAN', String(record.spaceId ?? ''), String(record.since ?? 0)].join('|');
  }
  return [
    String(record.type ?? ''),
    String(record.senderId ?? ''),
    String(record.parentId ?? ''),
    String(record.intentId ?? ''),
    String(record.promiseId ?? ''),
    String(record.timestamp ?? ''),
    stableStringify(record.payload ?? {}),
  ].join('|');
}

function nowMs(): number {
  return Date.now();
}

function buildIntent(
  senderId: string,
  options: {
    intentId: string;
    parentId: string;
    content: string;
    payload: Record<string, unknown>;
  },
) {
  return {
    type: 'INTENT' as const,
    intentId: options.intentId,
    parentId: options.parentId,
    senderId,
    timestamp: nowMs(),
    payload: { content: options.content, ...options.payload },
  };
}

function buildPromise(
  senderId: string,
  options: {
    promiseId: string;
    intentId: string;
    parentId: string;
    content: string;
    payload?: Record<string, unknown>;
  },
) {
  return {
    type: 'PROMISE' as const,
    promiseId: options.promiseId,
    intentId: options.intentId,
    parentId: options.parentId,
    senderId,
    timestamp: nowMs(),
    payload: { content: options.content, ...(options.payload ?? {}) },
  };
}

function buildDecline(
  senderId: string,
  options: {
    intentId: string;
    parentId: string;
    reason: string;
    payload?: Record<string, unknown>;
  },
) {
  return {
    type: 'DECLINE' as const,
    intentId: options.intentId,
    parentId: options.parentId,
    senderId,
    timestamp: nowMs(),
    payload: { reason: options.reason, ...(options.payload ?? {}) },
  };
}

function buildComplete(
  senderId: string,
  options: {
    promiseId: string;
    parentId: string;
    summary: string;
    payload: Record<string, unknown>;
  },
) {
  return {
    type: 'COMPLETE' as const,
    promiseId: options.promiseId,
    parentId: options.parentId,
    senderId,
    timestamp: nowMs(),
    payload: { content: options.summary, summary: options.summary, ...options.payload },
  };
}

interface StewardIdentity {
  stationToken: string;
  buildProof: (action: string, request: Record<string, unknown>) => string;
}

function createStewardIdentity(authSecret: string): StewardIdentity {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 4096 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
  const thumbprint = createHash('sha256').update(
    JSON.stringify({ e: publicJwk.e, kty: 'RSA', n: publicJwk.n }),
  ).digest('base64url');
  const signup = issueCommonsStationToken(HEADWATERS_STEWARD_ID, HEADWATERS_STEWARD_ID, thumbprint, authSecret);

  return {
    stationToken: signup.station_token,
    buildProof: (action: string, request: Record<string, unknown>) => {
      const header = { typ: 'itp-pop+jwt', alg: 'RS256', jwk: publicJwk };
      const payload = {
        jti: `itp-proof-${randomUUID()}`,
        sub: HEADWATERS_STEWARD_ID,
        aud: commonsStationAudience(),
        iat: Math.floor(Date.now() / 1000),
        ath: createHash('sha256').update(signup.station_token).digest('base64url'),
        action,
        req_hash: createHash('sha256').update(canonicalRequest(request)).digest('base64url'),
      };
      const headerPart = b64urlEncode(Buffer.from(JSON.stringify(header), 'utf8'));
      const payloadPart = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
      const signingInput = `${headerPart}.${payloadPart}`;
      const signature = sign('RSA-SHA256', Buffer.from(signingInput, 'utf8'), privateKeyPem);
      return `${signingInput}.${b64urlEncode(signature)}`;
    },
  };
}

interface RequestValidationSuccess {
  requestedKind: 'home' | 'shared';
  ok: true;
}

interface RequestValidationFailure {
  requestedKind: 'home' | 'shared';
  ok: false;
  reason: string;
  reasonCode: string;
}

type RequestValidation = RequestValidationSuccess | RequestValidationFailure;

export interface HeadwatersStewardOptions {
  dataDir: string;
  host: string;
  commonsPort: number;
  authSecret: string;
}

export class HeadwatersSteward {
  private readonly options: HeadwatersStewardOptions;
  private readonly client: IntentSpaceClient;
  private readonly provisioner: HeadwatersProvisioner;
  private readonly registry: StationPrincipalRegistry;
  private readonly state: HeadwatersStewardState;
  private readonly identity: StewardIdentity;
  private running = false;
  private readonly inFlightRequests = new Set<string>();
  private readonly handleClientMessage = (message: StoredMessage): void => {
    void this.onClientMessage(message).catch((error) => {
      console.error('headwaters-steward: client message handling failed', error);
    });
  };

  constructor(options: HeadwatersStewardOptions) {
    this.options = options;
    this.client = new IntentSpaceClient({ host: options.host, port: options.commonsPort });
    this.provisioner = new HeadwatersProvisioner({
      baseDir: join(options.dataDir, 'spaces'),
      stationEndpoint: commonsStationEndpoint(),
      issuer: headwatersOrigin(),
      authSecret: options.authSecret,
    });
    this.registry = new StationPrincipalRegistry(join(options.dataDir, 'principal-registry.json'), 'prn_headwaters');
    this.state = new HeadwatersStewardState(join(options.dataDir, 'steward-state.json'));
    this.identity = createStewardIdentity(options.authSecret);
  }

  async start(): Promise<void> {
    await this.client.connect();
    await this.client.authenticate(this.identity.stationToken, this.identity.buildProof);
    this.client.on('message', this.handleClientMessage);
    this.publishPresence();
    this.running = true;
    await this.reconcile();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.client.off('message', this.handleClientMessage);
    this.client.disconnect();
    await this.provisioner.stop();
  }

  private publishPresence(): void {
    this.client.post(buildIntent(
      HEADWATERS_STEWARD_ID,
      {
        intentId: 'headwaters:steward:provision-spaces',
        parentId: HEADWATERS_COMMONS_SPACE_ID,
        content: 'I provision dedicated spaces in Headwaters through promises.',
        payload: {
          offeredSpaces: [{ kind: 'home' }, { kind: 'shared' }],
          howToRequest: {
            home: {
              type: 'INTENT',
              parentId: HEADWATERS_COMMONS_SPACE_ID,
              payload: {
                requestedSpace: { kind: 'home' },
                spacePolicy: {
                  visibility: 'private',
                  participants: ['<requester-principal-id>', HEADWATERS_STEWARD_ID],
                },
              },
            },
            shared: {
              type: 'INTENT',
              parentId: HEADWATERS_COMMONS_SPACE_ID,
              payload: {
                requestedSpace: {
                  kind: 'shared',
                  participants: ['<requester-principal-id>', '<other-principal-id>'],
                },
                spacePolicy: {
                  visibility: 'private',
                  participants: ['<requester-principal-id>', '<other-principal-id>', HEADWATERS_STEWARD_ID],
                },
              },
            },
          },
          lifecycle: ['PROMISE', 'ACCEPT', 'COMPLETE', 'ASSESS'],
          refusal: 'I explicitly decline invalid shared-space requests rather than ignoring them.',
        },
      },
    ));
  }

  private async reconcile(): Promise<void> {
    if (!this.running) return;
    const requests = await this.client.scan(HEADWATERS_COMMONS_SPACE_ID, this.state.commonsSince());
    this.state.updateCommonsSince(this.client.latestSeq);
    for (const request of requests) {
      if (!this.isProvisioningRequest(request)) continue;
      await this.handleProvisioningRequest(request);
    }
    for (const request of this.state.allRequests()) {
      await this.handleRequest(request);
    }
  }

  private async onClientMessage(message: StoredMessage): Promise<void> {
    if (!this.running) return;

    if (this.isProvisioningRequest(message)) {
      await this.handleProvisioningRequest(message);
      return;
    }

    const requestId = this.requestIdFromMessage(message);
    if (!requestId) return;
    const request = this.state.request(requestId);
    if (!request) return;
    await this.handleRequest(request);
  }

  private isProvisioningRequest(message: StoredMessage): boolean {
    return message.type === 'INTENT'
      && message.senderId !== HEADWATERS_STEWARD_ID
      && message.parentId === HEADWATERS_COMMONS_SPACE_ID
      && Boolean(message.intentId)
      && isProvisioningPayload(message.payload);
  }

  private requestIdFromMessage(message: StoredMessage): string | null {
    if (message.parentId && message.parentId !== 'root') {
      return message.parentId;
    }
    if (message.intentId) {
      return message.intentId;
    }
    return null;
  }

  private requestInteriorParticipants(payload: Record<string, unknown>): string[] {
    const policy = payload.spacePolicy as Record<string, unknown> | undefined;
    return Array.isArray(policy?.participants)
      ? policy!.participants.filter((value): value is string => typeof value === 'string')
      : [];
  }

  private sharedRequestParticipants(payload: Record<string, unknown>): string[] {
    const requestedSpace = payload.requestedSpace as Record<string, unknown> | undefined;
    return Array.isArray(requestedSpace?.participants)
      ? requestedSpace!.participants.filter((value): value is string => typeof value === 'string')
      : [];
  }

  private hasDuplicates(values: string[]): boolean {
    return new Set(values).size !== values.length;
  }

  private sameParticipantSet(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    const normalizedLeft = [...left].sort();
    const normalizedRight = [...right].sort();
    return normalizedLeft.every((value, index) => value === normalizedRight[index]);
  }

  private validateRequest(request: PersistedStewardRequest): RequestValidation {
    const payload = request.payload as Record<string, unknown>;
    const policyParticipants = this.requestInteriorParticipants(payload);
    const requestedSpace = (payload.requestedSpace ?? {}) as Record<string, unknown>;
    const requestedKind = requestedSpace.kind === 'shared' ? 'shared' : 'home';

    if (requestedKind === 'home') {
      if (!policyParticipants.includes(HEADWATERS_STEWARD_ID) || !policyParticipants.includes(request.senderId)) {
        return {
          requestedKind: 'home',
          ok: false,
          reason: 'Home-space requests must keep the request interior private to the requester and steward.',
          reasonCode: 'HEADWATERS_INVALID_HOME_REQUEST_POLICY',
        };
      }
      return { requestedKind: 'home', ok: true };
    }

    if (!isCreateSharedSpacePayload(payload)) {
      return {
        requestedKind: 'shared',
        ok: false,
        reason: 'Shared-space requests must declare shared requestedSpace participants and a private request-interior policy.',
        reasonCode: 'HEADWATERS_INVALID_SHARED_REQUEST_SHAPE',
      };
    }

    const requestedParticipants = this.sharedRequestParticipants(payload);
    if (requestedParticipants.length < 2) {
      return {
        requestedKind: 'shared',
        ok: false,
        reason: 'Shared-space requests must name at least two non-steward participants.',
        reasonCode: 'HEADWATERS_SHARED_PARTICIPANT_COUNT',
      };
    }
    if (!requestedParticipants.includes(request.senderId)) {
      return {
        requestedKind: 'shared',
        ok: false,
        reason: 'Shared-space requester must be explicitly included in requestedSpace.participants.',
        reasonCode: 'HEADWATERS_SHARED_REQUESTER_NOT_INCLUDED',
      };
    }
    if (requestedParticipants.includes(HEADWATERS_STEWARD_ID)) {
      return {
        requestedKind: 'shared',
        ok: false,
        reason: 'The steward cannot be a spawned shared-space participant.',
        reasonCode: 'HEADWATERS_SHARED_STEWARD_NOT_ALLOWED',
      };
    }
    if (this.hasDuplicates(requestedParticipants)) {
      return {
        requestedKind: 'shared',
        ok: false,
        reason: 'Shared-space participants must be unique principals.',
        reasonCode: 'HEADWATERS_SHARED_DUPLICATE_PARTICIPANTS',
      };
    }
    const expectedInteriorParticipants = [...requestedParticipants, HEADWATERS_STEWARD_ID];
    if (!this.sameParticipantSet(policyParticipants, expectedInteriorParticipants)) {
      return {
        requestedKind: 'shared',
        ok: false,
        reason: 'The request interior must be private to the exact shared participant set plus the steward.',
        reasonCode: 'HEADWATERS_SHARED_REQUEST_POLICY_MISMATCH',
      };
    }
    for (const principalId of requestedParticipants) {
      if (!this.registry.getByPrincipalId(principalId)?.jwkThumbprint) {
        return {
          requestedKind: 'shared',
          ok: false,
          reason: `Could not determine station binding for ${principalId}.`,
          reasonCode: 'HEADWATERS_UNKNOWN_SHARED_PARTICIPANT_BINDING',
        };
      }
    }
    return { requestedKind: 'shared', ok: true };
  }

  private sharedCredentialBundle(
    participantTokens: Record<string, string>,
  ): SharedSpaceParticipantCredential[] {
    return Object.entries(participantTokens).map(([principal_id, station_token]) => ({
      principal_id,
      station_token,
    }));
  }

  private completionSummary(kind: 'home' | 'shared'): string {
    if (kind === 'shared') {
      return 'Shared space provisioned. Distribute the participant credentials, then connect directly and assess the result.';
    }
    return 'Home space provisioned. Connect directly to your dedicated space and assess the result.';
  }

  private async handleProvisioningRequest(request: StoredMessage): Promise<void> {
    const requestId = request.intentId;
    if (!requestId) return;
    this.state.rememberRequest({
      intentId: requestId,
      senderId: request.senderId,
      payload: request.payload as CreateSpaceRequestPayload,
    });
    await this.handleRequest(this.state.request(requestId)!);
  }

  private async handleRequest(request: PersistedStewardRequest): Promise<void> {
    const requestId = request.intentId;
    if (!requestId || this.inFlightRequests.has(requestId)) return;
    this.inFlightRequests.add(requestId);
    try {
      const validation = this.validateRequest(request);
      if (!validation.ok) {
        this.client.post(buildDecline(
          HEADWATERS_STEWARD_ID,
          {
            intentId: requestId,
            parentId: requestId,
            reason: validation.reason,
            payload: { reasonCode: validation.reasonCode, requestedKind: validation.requestedKind },
          },
        ));
        this.state.forgetRequest(requestId);
        return;
      }

      const payload = request.payload as Record<string, unknown>;
      const subspace = await this.client.scan(requestId, request.since);
      this.state.updateRequestSince(requestId, this.client.latestSeq);
      const terminal = subspace.find((message) =>
        (message.type === 'COMPLETE' || message.type === 'DECLINE')
        && message.senderId === HEADWATERS_STEWARD_ID,
      );
      if (terminal) {
        this.state.forgetRequest(requestId);
        return;
      }

      const existingPromise = subspace.find((message) =>
        message.type === 'PROMISE'
        && message.senderId === HEADWATERS_STEWARD_ID
        && message.intentId === requestId,
      );
      const promiseId = existingPromise?.promiseId ?? request.promiseId;
      const requestedSpace = (payload.requestedSpace ?? {}) as Record<string, unknown>;
      const requestedKind = requestedSpace.kind === 'shared' ? 'shared' : 'home';

      if (!promiseId) {
        const nextPromiseId = `headwaters-promise-${randomUUID()}`;
        this.client.post(buildPromise(
          HEADWATERS_STEWARD_ID,
          {
            promiseId: nextPromiseId,
            intentId: requestId,
            parentId: requestId,
            content: `I will provision your ${requestedKind} space and return its dedicated endpoint.`,
          },
        ));
        this.state.setRequestPromiseId(requestId, nextPromiseId);
        return;
      }

      const accepted = subspace.find((message) =>
        message.type === 'ACCEPT'
        && message.promiseId === promiseId
        && message.senderId === request.senderId,
      );
      if (accepted) {
        this.state.markAccepted(requestId);
      }
      if (!accepted && !request.accepted) return;

      let completePayload: ProvisionedSpaceReply | ProvisionedSharedSpaceReply;
      try {
        if (isCreateHomeSpacePayload(payload)) {
          const requesterJkt = await this.lookupParticipantThumbprint(request.senderId);
          if (!requesterJkt) {
            throw new Error(`Could not determine station binding for ${request.senderId}.`);
          }
          const provisioned = await this.provisioner.provisionHomeSpace(request.senderId, requesterJkt);
          completePayload = {
            headwatersStatus: provisioned.created ? 'SPACE_CREATED' : 'SPACE_ALREADY_EXISTS',
            spaceKind: 'home',
            spaceId: provisioned.spaceId,
            station_endpoint: provisioned.endpoint,
            station_audience: provisioned.audience,
            station_token: provisioned.stationToken,
          };
        } else {
          const requestedParticipants = this.sharedRequestParticipants(payload);
          const participantJwkThumbs = Object.fromEntries(
            await Promise.all(
              requestedParticipants.map(async (principalId) => [principalId, await this.lookupParticipantThumbprint(principalId)] as const),
            ),
          );
          const missing = Object.entries(participantJwkThumbs).find(([, jwkThumb]) => !jwkThumb);
          if (missing) {
            throw new Error(`Could not determine station binding for ${missing[0]}.`);
          }
          const provisioned = await this.provisioner.provisionSharedSpace(
            requestedParticipants,
            participantJwkThumbs as Record<string, string>,
          );
          completePayload = {
            headwatersStatus: 'SPACE_CREATED',
            spaceKind: 'shared',
            spaceId: provisioned.spaceId,
            station_endpoint: provisioned.endpoint,
            station_audience: provisioned.audience,
            participants: this.sharedCredentialBundle(provisioned.participantTokens),
          };
        }
      } catch (error) {
        this.client.post(buildDecline(
          HEADWATERS_STEWARD_ID,
          {
            intentId: requestId,
            parentId: requestId,
            reason: error instanceof Error ? error.message : String(error),
            payload: { reasonCode: 'HEADWATERS_CAPACITY_OR_PROVISIONING_FAILURE' },
          },
        ));
        this.state.forgetRequest(requestId);
        return;
      }

      this.client.post(buildComplete(
        HEADWATERS_STEWARD_ID,
        {
          promiseId,
          parentId: requestId,
          summary: this.completionSummary(requestedKind),
          payload: completePayload,
        },
      ));
      this.state.forgetRequest(requestId);
    } finally {
      this.inFlightRequests.delete(requestId);
    }
  }

  private async lookupParticipantThumbprint(senderId: string): Promise<string | null> {
    return this.registry.getByPrincipalId(senderId)?.jwkThumbprint ?? null;
  }
}
