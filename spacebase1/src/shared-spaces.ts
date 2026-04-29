export interface PrincipalHomeRecord {
  principalId: string;
  handle: string;
  homeSpaceId: string;
  jkt: string;
}

export interface SharedSpaceRequestSpec {
  participantPrincipalIds: string[];
}

export interface SharedSpaceAccessMaterial {
  stationToken: string;
  audience: string;
  itpEndpoint: string;
  scanEndpoint: string;
  streamEndpoint: string;
  spaceId: string;
}

export interface SharedSpaceDeliveryObligation {
  obligationId: string;
  sharedSpaceId: string;
  participantPrincipalId: string;
  participantHandle: string;
  homeSpaceId: string;
  requesterPrincipalId: string;
  participantPrincipalIds: string[];
  invitationIntentId: string;
  access: SharedSpaceAccessMaterial;
  deliveredAt?: string;
}

export type SharedSpaceRequestValidation =
  | {
      ok: true;
      participantPrincipalIds: string[];
    }
  | {
      ok: false;
      error:
        | 'missing_participants'
        | 'requester_not_included'
        | 'unknown_principal'
        | 'principal_missing_home_space';
      detail?: string;
      unresolvedPrincipalIds?: string[];
    };

export function parseSharedSpaceRequest(payload: Record<string, unknown>): SharedSpaceRequestSpec | null {
  const requestedSpace = payload.requestedSpace;
  if (!requestedSpace || typeof requestedSpace !== 'object') return null;
  const record = requestedSpace as Record<string, unknown>;
  if (record.kind !== 'shared') return null;
  if (!Array.isArray(record.participant_principals)) return null;
  const participantPrincipalIds = record.participant_principals
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return { participantPrincipalIds };
}

// ===== Steward operation classification =====
//
// These helpers tell the route handler which operation (if any) a given intent
// payload matches. Home-space stewards still fail loudly for malformed shared
// space requests. Commons is a public room, so unrelated top-level intents are
// ignored silently instead of receiving provisioning promises or declines.

export const COMMONS_STEWARD_OPERATIONS = ['provision-home-space'] as const;
export const HOME_SPACE_STEWARD_OPERATIONS = ['provision-shared-space'] as const;

const HOME_SPACE_STRUCTURED_VALUES = new Set([
  'agent space',
  'home',
  'home space',
  'home-space',
  'intent space',
  'personal',
  'personal space',
  'private',
  'private home',
  'private home space',
  'private space',
  'spacebase1 space',
]);

const NON_HOME_SPACE_STRUCTURED_VALUES = new Set([
  'commons',
  'group',
  'group space',
  'public',
  'public space',
  'shared',
  'shared space',
  'team',
  'team space',
]);

const NATURAL_TEXT_KEYS = [
  'ask',
  'body',
  'content',
  'description',
  'goal',
  'instruction',
  'intent',
  'message',
  'objective',
  'prompt',
  'query',
  'request',
  'summary',
  'task',
  'text',
  'title',
];

export type StewardUnsupported = {
  kind: 'unsupported';
  reason: string;
  supportedOperations: readonly string[];
};

export type CommonsClassification =
  | { kind: 'provision-home-space' }
  | { kind: 'ignore' }
  | StewardUnsupported;

export type HomeSpaceClassification =
  | { kind: 'provision-shared-space'; request: SharedSpaceRequestSpec }
  | StewardUnsupported;

/**
 * Classify an INTENT received by the commons steward at the top-level space.
 *
 * Commons only provisions home spaces. Explicit unsupported space-operation
 * requests can DECLINE, but arbitrary public commons intents should be ignored.
 */
export function classifyCommonsIntent(payload: Record<string, unknown>): CommonsClassification {
  const structured = classifyStructuredHomeSpaceRequest(payload);
  if (structured === true) return { kind: 'provision-home-space' };
  if (structured === false) {
    return {
      kind: 'unsupported',
      reason: 'commons steward only provisions home/private/personal agent spaces; request shared spaces from your bound home space instead.',
      supportedOperations: COMMONS_STEWARD_OPERATIONS,
    };
  }

  if (isCommonsHomeSpaceProvisioningRequest(payload)) {
    return { kind: 'provision-home-space' };
  }
  return { kind: 'ignore' };
}

export function isCommonsHomeSpaceProvisioningRequest(payload: Record<string, unknown>): boolean {
  const structured = classifyStructuredHomeSpaceRequest(payload);
  if (structured != null) return structured;

  const text = NATURAL_TEXT_KEYS
    .map((key) => payload[key])
    .filter((value): value is string => typeof value === 'string')
    .join(' ');

  return isNaturalLanguageHomeSpaceProvisioningRequest(text);
}

/**
 * Classify an INTENT received by a home-space steward at the top-level space.
 *
 * Home-space stewards only provision shared spaces. Missing or malformed
 * shared-space requests must DECLINE so callers see the failure immediately
 * instead of timing out.
 */
export function classifyHomeSpaceIntent(payload: Record<string, unknown>): HomeSpaceClassification {
  const requestedSpace = payload.requestedSpace;
  if (!requestedSpace || typeof requestedSpace !== 'object') {
    return {
      kind: 'unsupported',
      reason: 'home-space steward needs payload.requestedSpace with kind="shared" and participant_principals: string[]. No requestedSpace block was provided.',
      supportedOperations: HOME_SPACE_STEWARD_OPERATIONS,
    };
  }
  const record = requestedSpace as Record<string, unknown>;
  if (record.kind !== 'shared') {
    const observed = typeof record.kind === 'string' ? record.kind : JSON.stringify(record.kind ?? null);
    return {
      kind: 'unsupported',
      reason: `home-space steward does not support requestedSpace.kind=${observed}. Only "shared" is supported; home-space provisioning belongs to the commons steward.`,
      supportedOperations: HOME_SPACE_STEWARD_OPERATIONS,
    };
  }
  if (!Array.isArray(record.participant_principals)) {
    return {
      kind: 'unsupported',
      reason: 'home-space steward needs requestedSpace.participant_principals as an array of principal ids.',
      supportedOperations: HOME_SPACE_STEWARD_OPERATIONS,
    };
  }
  const parsed = parseSharedSpaceRequest(payload);
  if (!parsed) {
    return {
      kind: 'unsupported',
      reason: 'home-space steward could not parse requestedSpace.participant_principals as a non-empty list of principal ids.',
      supportedOperations: HOME_SPACE_STEWARD_OPERATIONS,
    };
  }
  return { kind: 'provision-shared-space', request: parsed };
}

function classifyStructuredHomeSpaceRequest(payload: Record<string, unknown>): boolean | null {
  const requestedSpace = objectField(payload, 'requestedSpace') ?? objectField(payload, 'requested_space');
  if (requestedSpace) {
    const requestedSpaceKind = firstStringField(requestedSpace, ['kind', 'type', 'spaceKind', 'space_kind', 'spaceType', 'space_type']);
    if (requestedSpaceKind) return isHomeSpaceStructuredValue(requestedSpaceKind);

    const requestedVisibility = firstStringField(requestedSpace, ['visibility', 'scope', 'privacy']);
    if (requestedVisibility && isHomeSpaceStructuredValue(requestedVisibility)) return true;
  }

  const directKind = firstStringField(payload, [
    'requestedSpaceKind',
    'requested_space_kind',
    'requestedKind',
    'requested_kind',
    'spaceKind',
    'space_kind',
    'spaceType',
    'space_type',
  ]);
  if (directKind) return isHomeSpaceStructuredValue(directKind);

  const requestType = firstStringField(payload, ['requestType', 'request_type', 'action', 'intentType', 'intent_type']);
  if (requestType && /\b(provision|create|setup|set up|claim|bind)[\s_-]*(home|private|personal|intent|agent|spacebase1)[\s_-]*space\b/i.test(requestType)) {
    return true;
  }

  return null;
}

function isHomeSpaceStructuredValue(value: string): boolean {
  const normalized = normalizeProvisioningText(value);
  if (HOME_SPACE_STRUCTURED_VALUES.has(normalized)) return true;
  if (NON_HOME_SPACE_STRUCTURED_VALUES.has(normalized)) return false;
  return /\b(home|private|personal|intent|agent|spacebase1)\s+space\b/.test(normalized);
}

function isNaturalLanguageHomeSpaceProvisioningRequest(value: string): boolean {
  const text = normalizeProvisioningText(value);
  if (!text) return false;

  const hasConflictingSpaceKind = /\b(shared|team|public|group|commons)\s+(space|room)\b/.test(text);
  const hasQualifiedHomeSpace = /\b(home|private|personal|intent|agent|spacebase1)\s+(space|room)\b/.test(text)
    || /\b(my|own)\s+(home\s+)?space\b/.test(text)
    || /\bspace\s+for\s+(me|my agent|this agent)\b/.test(text);
  const hasGenericSpace = /\b(space|room)\b/.test(text);
  const hasStrongProvisioningVerb = /\b(provision|claim|bind)\b/.test(text);
  const hasCreateProvisioningVerb = /\b(create|make|set up|setup|prepare|open|allocate|spin up|give me|assign|issue|reserve|start|establish|initialize|initialise)\b/.test(text);
  const hasNeedProvisioningVerb = /\b(need|want|request|require|looking for|would like|help me get|get me)\b/.test(text);

  if (hasConflictingSpaceKind && !hasQualifiedHomeSpace) return false;
  if (hasStrongProvisioningVerb && hasGenericSpace) return true;
  if ((hasCreateProvisioningVerb || hasNeedProvisioningVerb) && hasQualifiedHomeSpace) return true;
  return false;
}

function normalizeProvisioningText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function objectField(payload: Record<string, unknown>, field: string): Record<string, unknown> | null {
  const value = payload[field];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function firstStringField(payload: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = payload[field];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

export function validateSharedSpaceParticipants(
  requesterPrincipalId: string,
  requestedParticipantPrincipalIds: string[],
  knownHomes: Map<string, PrincipalHomeRecord>,
): SharedSpaceRequestValidation {
  const canonicalParticipantPrincipalIds = Array.from(new Set(requestedParticipantPrincipalIds)).sort();
  if (canonicalParticipantPrincipalIds.length === 0) {
    return {
      ok: false,
      error: 'missing_participants',
      detail: 'Provide at least one participant principal id.',
    };
  }
  if (!canonicalParticipantPrincipalIds.includes(requesterPrincipalId)) {
    return {
      ok: false,
      error: 'requester_not_included',
      detail: 'The requester must be one of the named participants.',
    };
  }

  const unknownPrincipalIds = canonicalParticipantPrincipalIds.filter((principalId) => !knownHomes.has(principalId));
  if (unknownPrincipalIds.length > 0) {
    return {
      ok: false,
      error: 'unknown_principal',
      detail: 'Every named participant must already exist in Spacebase1.',
      unresolvedPrincipalIds: unknownPrincipalIds,
    };
  }

  const missingHomePrincipals = canonicalParticipantPrincipalIds.filter((principalId) => {
    const home = knownHomes.get(principalId);
    return !home || !home.homeSpaceId;
  });
  if (missingHomePrincipals.length > 0) {
    return {
      ok: false,
      error: 'principal_missing_home_space',
      detail: 'Every named participant must already have a bound home space.',
      unresolvedPrincipalIds: missingHomePrincipals,
    };
  }

  return {
    ok: true,
    participantPrincipalIds: canonicalParticipantPrincipalIds,
  };
}

export function buildSharedSpaceInvitationPayload(
  obligation: SharedSpaceDeliveryObligation,
): Record<string, unknown> {
  return {
    content: `You are invited to shared space ${obligation.sharedSpaceId}.`,
    shared_space_id: obligation.sharedSpaceId,
    requester_principal_id: obligation.requesterPrincipalId,
    participant_principals: obligation.participantPrincipalIds,
    access: {
      station_token: obligation.access.stationToken,
      audience: obligation.access.audience,
      itp_endpoint: obligation.access.itpEndpoint,
      scan_endpoint: obligation.access.scanEndpoint,
      stream_endpoint: obligation.access.streamEndpoint,
      space_id: obligation.access.spaceId,
    },
  };
}
