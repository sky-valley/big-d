import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { HEADWATERS_COMMONS_SPACE_ID, HEADWATERS_STEWARD_ID } from '../../headwaters/src/contract.ts';
import { IntentStore } from '../../intent-space/src/store.ts';
import type { StoredMessage } from '../../intent-space/src/types.ts';
import type { ObservatorySnapshot, RoomEdge, RoomEvent, RoomSummary, RoomType, SemanticEventKind } from './model.ts';

interface ProvisionedSpaceRecord {
  kind: 'home' | 'shared';
  spaceId: string;
  ownerId?: string;
  ownerPrincipalId?: string;
  participants?: string[];
  audience: string;
  endpoint: string;
  stationToken: string;
}

const DEFAULT_HEADWATERS_DATA_DIR = resolve(process.cwd(), '..', 'headwaters', '.headwaters');

function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function storeFor(dbPath: string): IntentStore {
  return new IntentStore(dbPath);
}

function rawRowsForParent(store: IntentStore, parentId: string): StoredMessage[] {
  const db = (store as unknown as { db: { prepare(sql: string): { all(...args: unknown[]): Array<Record<string, unknown>> } } }).db;
  const rows = db.prepare(
    'SELECT * FROM messages WHERE parent_id = ? ORDER BY seq ASC',
  ).all(parentId);
  return rows.map((row) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(String(row.payload ?? '{}')) as Record<string, unknown>;
    } catch {
      payload = {};
    }
    return {
      type: String(row.type),
      intentId: row.type === 'INTENT' || row.type === 'DECLINE'
        ? (typeof row.message_id === 'string' ? row.message_id : undefined)
        : (typeof row.intent_ref === 'string' ? row.intent_ref : undefined),
      promiseId: row.type !== 'INTENT' && row.type !== 'DECLINE'
        ? (typeof row.message_id === 'string' ? row.message_id : undefined)
        : undefined,
      parentId: String(row.parent_id),
      senderId: String(row.sender_id),
      payload,
      seq: Number(row.seq),
      timestamp: Number(row.timestamp),
    };
  });
}

function rawRowsForParents(store: IntentStore, parentIds: string[]): StoredMessage[] {
  const seen = new Set<string>();
  const merged: StoredMessage[] = [];
  for (const parentId of parentIds) {
    for (const row of rawRowsForParent(store, parentId)) {
      const key = `${row.type}:${row.intentId ?? ''}:${row.promiseId ?? ''}:${row.seq}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
  }
  return merged.sort((left, right) => left.seq - right.seq);
}

function topLevelParentsForProvisionedSpace(record: ProvisionedSpaceRecord): string[] {
  return ['root', record.spaceId];
}

function previewFor(events: RoomEvent[]): string {
  return events.at(-1)?.label ?? 'No visible activity yet';
}

function roomUpdatedAt(events: RoomEvent[]): number {
  return events.reduce((latest, event) => Math.max(latest, event.timestamp), 0);
}

function syntheticDiscoveryEvent(roomId: string, actorId: string, timestamp: number, label: string): RoomEvent {
  return {
    id: `${roomId}:discovered`,
    roomId,
    kind: 'room_discovered',
    label,
    actorId,
    timestamp,
    raw: {},
  };
}

function eventKindFor(message: StoredMessage): SemanticEventKind {
  if (message.type === 'PROMISE') return 'promise_posted';
  if (message.type === 'ACCEPT') return 'accept_posted';
  if (message.type === 'COMPLETE') return 'complete_posted';
  if (message.type === 'ASSESS') return 'assess_posted';
  if (message.type === 'DECLINE') return 'decline_posted';
  if (message.type === 'INTENT' && message.senderId === HEADWATERS_STEWARD_ID) return 'steward_visible';
  if (message.type === 'INTENT') return 'intent_posted';
  return 'message_posted';
}

function labelFor(message: StoredMessage, roomType: RoomType): string {
  if (message.type === 'PROMISE') {
    return String(message.payload.content ?? 'Steward promises to provision a space');
  }
  if (message.type === 'ACCEPT') {
    return `${message.senderId} accepts the provisioning promise`;
  }
  if (message.type === 'COMPLETE') {
    const status = String(message.payload.headwatersStatus ?? 'SPACE_CREATED');
    const spaceId = String(message.payload.spaceId ?? '');
    return status === 'SPACE_ALREADY_EXISTS'
      ? `Steward reconnects the requester to ${spaceId}`
      : `Steward completes provisioning for ${spaceId}`;
  }
  if (message.type === 'ASSESS') {
    return `${message.senderId} assesses the result`;
  }
  if (message.type === 'DECLINE') {
    return String(message.payload.reason ?? 'Provisioning was declined');
  }
  if (message.type === 'INTENT' && message.senderId === HEADWATERS_STEWARD_ID) {
    return String(message.payload.content ?? 'Steward advertises provisioning capability');
  }
  if (message.type === 'INTENT') {
    if (roomType === 'commons' && message.payload.requestedSpace) {
      const kind = String((message.payload.requestedSpace as Record<string, unknown>).kind ?? 'space');
      return `${message.senderId} requests a ${kind} space`;
    }
    return String(message.payload.content ?? 'Intent posted');
  }
  return String(message.payload.content ?? `${message.type.toLowerCase()} posted`);
}

function toSemanticEvents(roomId: string, roomType: RoomType, messages: StoredMessage[]): RoomEvent[] {
  const events = messages.map((message) => ({
    id: `${roomId}:${message.seq}`,
    roomId,
    kind: eventKindFor(message),
    label: labelFor(message, roomType),
    actorId: message.senderId,
    timestamp: message.timestamp,
    seq: message.seq,
    raw: {
      type: message.type,
      senderId: message.senderId,
      intentId: message.intentId,
      promiseId: message.promiseId,
      parentId: message.parentId,
      payload: message.payload,
    },
  }));
  const firstMessage = messages[0];
  if (!firstMessage) return [];
  return [
    syntheticDiscoveryEvent(
      roomId,
      firstMessage.senderId,
      firstMessage.timestamp,
      roomType === 'commons'
        ? 'Commons becomes visible'
        : roomType === 'private_request_interior'
          ? 'Private request interior appears'
          : 'Spawned space becomes visible',
    ),
    ...events,
  ];
}

function headwatersDataDir(): string {
  return process.env.OBSERVATORY_HEADWATERS_DATA_DIR
    ?? process.env.HEADWATERS_DATA_DIR
    ?? DEFAULT_HEADWATERS_DATA_DIR;
}

function headwatersOrigin(): string {
  return process.env.OBSERVATORY_HEADWATERS_ORIGIN
    ?? process.env.HEADWATERS_ORIGIN
    ?? 'http://127.0.0.1:8090';
}

function observatoryLabel(): string | undefined {
  return process.env.OBSERVATORY_LABEL;
}

export function readObservatorySnapshot(): ObservatorySnapshot {
  const dataDir = headwatersDataDir();
  const commonsDbPath = join(dataDir, 'commons', 'intent-space.db');
  const spacesDir = join(dataDir, 'spaces');
  const rooms: RoomSummary[] = [];
  const edges: RoomEdge[] = [];
  const eventsByRoom: Record<string, RoomEvent[]> = {};

  if (!existsSync(commonsDbPath)) {
    return {
      generatedAt: Date.now(),
      label: observatoryLabel(),
      headwatersOrigin: headwatersOrigin(),
      dataDir,
      rooms: [],
      edges: [],
      eventsByRoom: {},
    };
  }

  const commonsStore = storeFor(commonsDbPath);
  try {
    const commonsMessages = rawRowsForParent(commonsStore, HEADWATERS_COMMONS_SPACE_ID);
    const commonsEvents = toSemanticEvents(HEADWATERS_COMMONS_SPACE_ID, 'commons', commonsMessages);
    eventsByRoom[HEADWATERS_COMMONS_SPACE_ID] = commonsEvents;
    rooms.push({
      id: HEADWATERS_COMMONS_SPACE_ID,
      type: 'commons',
      title: 'Headwaters Commons',
      subtitle: 'The public room where requests first appear',
      visibility: 'public',
      participants: [],
      updatedAt: roomUpdatedAt(commonsEvents),
      eventCount: commonsEvents.length,
      preview: previewFor(commonsEvents),
    });

    const privateRooms = commonsMessages.filter((message) =>
      message.type === 'INTENT'
      && message.parentId === HEADWATERS_COMMONS_SPACE_ID
      && typeof message.intentId === 'string'
      && Boolean((message.payload.spacePolicy as Record<string, unknown> | undefined)?.visibility === 'private'),
    );

    const requestToSpace = new Map<string, string>();
    for (const request of privateRooms) {
      const requestId = request.intentId!;
      const participants = Array.isArray((request.payload.spacePolicy as Record<string, unknown>).participants)
        ? ((request.payload.spacePolicy as Record<string, unknown>).participants as unknown[]).filter((value): value is string => typeof value === 'string')
        : [];
      const requestMessages = rawRowsForParent(commonsStore, requestId);
      const requestEvents = toSemanticEvents(requestId, 'private_request_interior', requestMessages);
      eventsByRoom[requestId] = requestEvents;
      edges.push({ from: HEADWATERS_COMMONS_SPACE_ID, to: requestId, kind: 'contains' });
      rooms.push({
        id: requestId,
        type: 'private_request_interior',
        title: `Request · ${request.senderId}`,
        subtitle: 'Private room shared between requester and steward',
        visibility: 'private',
        participants,
        connectedTo: HEADWATERS_COMMONS_SPACE_ID,
        updatedAt: roomUpdatedAt(requestEvents),
        eventCount: requestEvents.length,
        preview: previewFor(requestEvents),
      });

      const completion = requestMessages.find((message) =>
        message.type === 'COMPLETE' && typeof (message.payload.spaceId) === 'string',
      );
      if (completion?.payload.spaceId && typeof completion.payload.spaceId === 'string') {
        requestToSpace.set(requestId, completion.payload.spaceId);
      }
    }

    if (existsSync(spacesDir)) {
      for (const entry of readdirSync(spacesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const record = readJsonFile<ProvisionedSpaceRecord>(join(spacesDir, entry.name, 'space.json'));
        if (!record) continue;
        const spaceDbPath = join(spacesDir, entry.name, 'intent-space.db');
        const spaceStore = existsSync(spaceDbPath) ? storeFor(spaceDbPath) : null;
        try {
          const topLevelParents = topLevelParentsForProvisionedSpace(record);
          const spaceMessages = spaceStore ? rawRowsForParents(spaceStore, topLevelParents) : [];
          const spaceEvents = toSemanticEvents(record.spaceId, 'spawned_space', spaceMessages);
          eventsByRoom[record.spaceId] = spaceEvents;
          const parentRequest = Array.from(requestToSpace.entries()).find(([, spaceId]) => spaceId === record.spaceId)?.[0];
          const participants = Array.isArray(record.participants)
            ? record.participants
            : [record.ownerPrincipalId ?? record.ownerId].filter((value): value is string => typeof value === 'string');
          const ownerLabel = record.ownerPrincipalId ?? record.ownerId ?? 'declared participants';
          edges.push({
            from: parentRequest ?? HEADWATERS_COMMONS_SPACE_ID,
            to: record.spaceId,
            kind: parentRequest ? 'fulfills' : 'contains',
          });
          rooms.push({
            id: record.spaceId,
            type: 'spawned_space',
            title: `Space · ${record.spaceId}`,
            subtitle: `Dedicated room for ${ownerLabel}`,
            visibility: 'private',
            participants,
            connectedTo: parentRequest ?? HEADWATERS_COMMONS_SPACE_ID,
            updatedAt: roomUpdatedAt(spaceEvents),
            eventCount: spaceEvents.length,
            preview: previewFor(spaceEvents),
          });
        } finally {
          spaceStore?.close();
        }
      }
    }
  } finally {
    commonsStore.close();
  }

  rooms.sort((left, right) => {
    if (left.type === 'commons') return -1;
    if (right.type === 'commons') return 1;
    return right.updatedAt - left.updatedAt;
  });

  return {
    generatedAt: Date.now(),
    label: observatoryLabel(),
    headwatersOrigin: headwatersOrigin(),
    dataDir,
    rooms,
    edges,
    eventsByRoom,
  };
}
