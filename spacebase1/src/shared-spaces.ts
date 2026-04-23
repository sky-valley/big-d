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
// Stewards must reply with an explicit DECLINE on any unsupported operation
// within ~1s, never drop the intent silently. The hackathon rule: "fail loudly
// and fast." These helpers tell the route handler which operation (if any) a
// given intent payload matches, and — on a miss — what DECLINE reason and
// supportedOperations hint to return.

export const COMMONS_STEWARD_OPERATIONS = ['provision-home-space'] as const;
export const HOME_SPACE_STEWARD_OPERATIONS = ['provision-shared-space'] as const;

export type StewardUnsupported = {
  kind: 'unsupported';
  reason: string;
  supportedOperations: readonly string[];
};

export type CommonsClassification =
  | { kind: 'provision-home-space' }
  | StewardUnsupported;

export type HomeSpaceClassification =
  | { kind: 'provision-shared-space'; request: SharedSpaceRequestSpec }
  | StewardUnsupported;

/**
 * Classify an INTENT received by the commons steward at the top-level space.
 *
 * Commons only provisions home spaces. Anything else must DECLINE.
 *
 * Payloads without an explicit `requestedSpace` block are treated as the
 * plain legacy "please provision a home space" intent — the pre-April-2026
 * onboarding docs used free-text content only.
 */
export function classifyCommonsIntent(payload: Record<string, unknown>): CommonsClassification {
  const requestedSpace = payload.requestedSpace;
  if (!requestedSpace || typeof requestedSpace !== 'object') {
    return { kind: 'provision-home-space' };
  }
  const record = requestedSpace as Record<string, unknown>;
  if (record.kind === 'home') {
    return { kind: 'provision-home-space' };
  }
  const observed = typeof record.kind === 'string' ? record.kind : JSON.stringify(record.kind ?? null);
  return {
    kind: 'unsupported',
    reason: `commons steward does not support requestedSpace.kind=${observed}. commons only provisions home spaces; request shared spaces from your bound home space instead.`,
    supportedOperations: COMMONS_STEWARD_OPERATIONS,
  };
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
