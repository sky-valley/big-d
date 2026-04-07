import { buildSharedSpaceInvitationPayload } from './shared-spaces.ts';
import type { HostedSpaceRecord, StoredMessage } from './types.ts';
import type { SharedSpaceDeliveryObligation } from './shared-spaces.ts';

export interface SharedSpaceDeliveryRuntime {
  listObligations(): Promise<SharedSpaceDeliveryObligation[]>;
  loadMessages(): Promise<StoredMessage[]>;
  appendInvitation(message: Omit<StoredMessage, 'seq' | 'timestamp'>): Promise<void>;
  markDelivered(obligationId: string, deliveredAt: string): Promise<void>;
  nowIso(): string;
}

export function shouldSyncSharedSpaceInvitations(state: HostedSpaceRecord): boolean {
  return state.kind === 'home-space' && typeof state.principalId === 'string' && state.principalId.length > 0;
}

export async function syncSharedSpaceInvitations(
  state: HostedSpaceRecord,
  runtime: SharedSpaceDeliveryRuntime,
): Promise<void> {
  if (!shouldSyncSharedSpaceInvitations(state)) return;

  const obligations = await runtime.listObligations();
  if (obligations.length === 0) return;

  const messages = await runtime.loadMessages();
  const seenIntentIds = new Set(
    messages
      .map((message) => message.intentId)
      .filter((value): value is string => typeof value === 'string'),
  );

  for (const obligation of obligations) {
    if (seenIntentIds.has(obligation.invitationIntentId)) {
      try {
        await runtime.markDelivered(obligation.obligationId, runtime.nowIso());
      } catch {
        // Leave the obligation pending and continue with later deliveries.
      }
      continue;
    }

    try {
      await runtime.appendInvitation({
        type: 'INTENT',
        intentId: obligation.invitationIntentId,
        parentId: state.spaceId,
        senderId: state.stewardId,
        payload: buildSharedSpaceInvitationPayload(obligation),
      });
      seenIntentIds.add(obligation.invitationIntentId);
    } catch {
      // The invitation was not durably appended, so do not mark delivery yet.
      continue;
    }

    try {
      await runtime.markDelivered(obligation.obligationId, runtime.nowIso());
    } catch {
      // The invitation already exists; a later sync can mark the obligation.
    }
  }
}
