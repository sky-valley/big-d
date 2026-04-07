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
