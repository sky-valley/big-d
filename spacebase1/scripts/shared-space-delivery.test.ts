import { describe, expect, it } from 'vitest';
import { syncSharedSpaceInvitations } from '../src/shared-space-delivery.ts';
import type { HostedSpaceRecord, StoredMessage } from '../src/types.ts';
import type { SharedSpaceDeliveryObligation } from '../src/shared-spaces.ts';

function homeSpaceState(): HostedSpaceRecord {
  return {
    spaceId: 'space-home',
    status: 'claimed',
    kind: 'home-space',
    intendedAgentLabel: 'alpha',
    createdAt: '2026-04-07T00:00:00.000Z',
    audience: 'intent-space://spacebase1/space/space-home',
    principalId: 'prn-alpha',
    handle: 'alpha',
    stewardId: 'steward-space-home',
    serviceIntentId: 'spacebase1:service:space-home',
    serviceIntentContent: 'service',
  };
}

function obligation(id: string, invitationIntentId: string): SharedSpaceDeliveryObligation {
  return {
    obligationId: id,
    sharedSpaceId: `shared-${id}`,
    participantPrincipalId: 'prn-alpha',
    participantHandle: 'alpha',
    homeSpaceId: 'space-home',
    requesterPrincipalId: 'prn-beta',
    participantPrincipalIds: ['prn-alpha', 'prn-beta'],
    invitationIntentId,
    access: {
      stationToken: `tok-${id}`,
      audience: `intent-space://spacebase1/space/shared-${id}`,
      itpEndpoint: `https://spacebase1.differ.ac/spaces/shared-${id}/itp`,
      scanEndpoint: `https://spacebase1.differ.ac/spaces/shared-${id}/scan`,
      streamEndpoint: `https://spacebase1.differ.ac/spaces/shared-${id}/stream`,
      spaceId: `shared-${id}`,
    },
  };
}

describe('shared-space delivery reliability', () => {
  it('does not mark an obligation delivered when invitation append fails', async () => {
    const marks: string[] = [];

    await syncSharedSpaceInvitations(homeSpaceState(), {
      listObligations: async () => [obligation('one', 'invite-one')],
      loadMessages: async () => [],
      appendInvitation: async () => {
        throw new Error('append failed');
      },
      markDelivered: async (obligationId) => {
        marks.push(obligationId);
      },
      nowIso: () => '2026-04-07T00:00:00.000Z',
    });

    expect(marks).toEqual([]);
  });

  it('marks a previously appended invitation delivered on retry without reappending it', async () => {
    const appended: string[] = [];
    const marks: string[] = [];
    const existingInvitation = obligation('one', 'invite-one');

    await syncSharedSpaceInvitations(homeSpaceState(), {
      listObligations: async () => [existingInvitation],
      loadMessages: async (): Promise<StoredMessage[]> => [
        {
          type: 'INTENT',
          intentId: existingInvitation.invitationIntentId,
          parentId: 'space-home',
          senderId: 'steward-space-home',
          payload: { content: 'already present' },
          seq: 2,
          timestamp: 1,
        },
      ],
      appendInvitation: async (message) => {
        appended.push(String(message.intentId));
      },
      markDelivered: async (obligationId) => {
        marks.push(obligationId);
      },
      nowIso: () => '2026-04-07T00:00:00.000Z',
    });

    expect(appended).toEqual([]);
    expect(marks).toEqual(['one']);
  });

  it('continues delivering later obligations when marking one delivery fails', async () => {
    const appended: string[] = [];
    const marks: string[] = [];

    await syncSharedSpaceInvitations(homeSpaceState(), {
      listObligations: async () => [
        obligation('one', 'invite-one'),
        obligation('two', 'invite-two'),
      ],
      loadMessages: async () => [],
      appendInvitation: async (message) => {
        appended.push(String(message.intentId));
      },
      markDelivered: async (obligationId) => {
        if (obligationId === 'one') throw new Error('mark failed');
        marks.push(obligationId);
      },
      nowIso: () => '2026-04-07T00:00:00.000Z',
    });

    expect(appended).toEqual(['invite-one', 'invite-two']);
    expect(marks).toEqual(['two']);
  });

  it('continues delivering later obligations when one append fails', async () => {
    const appended: string[] = [];
    const marks: string[] = [];

    await syncSharedSpaceInvitations(homeSpaceState(), {
      listObligations: async () => [
        obligation('one', 'invite-one'),
        obligation('two', 'invite-two'),
      ],
      loadMessages: async () => [],
      appendInvitation: async (message) => {
        if (message.intentId === 'invite-one') throw new Error('append failed');
        appended.push(String(message.intentId));
      },
      markDelivered: async (obligationId) => {
        marks.push(obligationId);
      },
      nowIso: () => '2026-04-07T00:00:00.000Z',
    });

    expect(appended).toEqual(['invite-two']);
    expect(marks).toEqual(['two']);
  });
});
