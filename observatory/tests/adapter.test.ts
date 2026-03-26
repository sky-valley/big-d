import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { IntentStore } from '../../intent-space/src/store.ts';
import { HEADWATERS_COMMONS_SPACE_ID, HEADWATERS_STEWARD_ID } from '../../headwaters/src/contract.ts';
import { readObservatorySnapshot } from '../src/adapter.ts';

function makeTempHeadwatersDir(): string {
  return mkdtempSync(join(tmpdir(), 'observatory-headwaters-'));
}

test('adapter derives commons, private request rooms, and spawned spaces across both top-level parent conventions', () => {
  const dataDir = makeTempHeadwatersDir();
  process.env.OBSERVATORY_HEADWATERS_DATA_DIR = dataDir;
  try {
    const commonsDir = join(dataDir, 'commons');
    mkdirSync(commonsDir, { recursive: true });
    const commonsStore = new IntentStore(join(commonsDir, 'intent-space.db'));
    try {
      commonsStore.post({
        type: 'INTENT',
        intentId: 'request-1',
        parentId: HEADWATERS_COMMONS_SPACE_ID,
        senderId: 'agent-a',
        timestamp: 1,
        payload: {
          content: 'Please create my home space',
          requestedSpace: { kind: 'home' },
          spacePolicy: {
            visibility: 'private',
            participants: ['agent-a', HEADWATERS_STEWARD_ID],
          },
        },
      });
      commonsStore.post({
        type: 'PROMISE',
        promiseId: 'promise-1',
        intentId: 'request-1',
        parentId: 'request-1',
        senderId: HEADWATERS_STEWARD_ID,
        timestamp: 2,
        payload: { content: 'I will provision your home space.' },
      });
      commonsStore.post({
        type: 'ACCEPT',
        promiseId: 'promise-1',
        parentId: 'request-1',
        senderId: 'agent-a',
        timestamp: 3,
        payload: { content: 'Accepted.' },
      });
      commonsStore.post({
        type: 'COMPLETE',
        promiseId: 'promise-1',
        parentId: 'request-1',
        senderId: HEADWATERS_STEWARD_ID,
        timestamp: 4,
        payload: {
          content: 'Provisioned.',
          headwatersStatus: 'SPACE_CREATED',
          spaceId: 'home-agent-a',
          stationEndpoint: 'tcp://127.0.0.1:4010',
          stationAudience: 'intent-space://headwaters/spaces/home-agent-a',
          stationToken: 'token',
        },
      });
      commonsStore.post({
        type: 'ASSESS',
        promiseId: 'promise-1',
        parentId: 'request-1',
        senderId: 'agent-a',
        timestamp: 5,
        payload: { content: 'Looks good.' },
      });
    } finally {
      commonsStore.close();
    }

    const spaceDir = join(dataDir, 'spaces', 'home-agent-a');
    mkdirSync(spaceDir, { recursive: true });
    writeFileSync(join(spaceDir, 'space.json'), JSON.stringify({
      kind: 'home',
      spaceId: 'home-agent-a',
      ownerPrincipalId: 'agent-a',
      audience: 'intent-space://headwaters/spaces/home-agent-a',
      endpoint: 'tcp://127.0.0.1:4010',
      stationToken: 'token',
    }, null, 2));
    const spawnedStore = new IntentStore(join(spaceDir, 'intent-space.db'));
    try {
      spawnedStore.post({
        type: 'INTENT',
        intentId: 'hello-space',
        parentId: 'root',
        senderId: 'agent-a',
        timestamp: 6,
        payload: { content: 'Hello from my new space.' },
      });
      spawnedStore.post({
        type: 'INTENT',
        intentId: 'hello-space-bound',
        parentId: 'home-agent-a',
        senderId: 'agent-a',
        timestamp: 7,
        payload: { content: 'Hello from the bound space target.' },
      });
    } finally {
      spawnedStore.close();
    }

    const snapshot = readObservatorySnapshot();
    assert.equal(snapshot.rooms.length, 3);
    assert.deepEqual(
      snapshot.rooms.map((room) => room.id),
      [HEADWATERS_COMMONS_SPACE_ID, 'home-agent-a', 'request-1'],
    );
    assert.equal(snapshot.eventsByRoom['request-1'].some((event) => event.kind === 'promise_posted'), true);
    assert.equal(snapshot.eventsByRoom['request-1'].some((event) => event.kind === 'complete_posted'), true);
    assert.equal(snapshot.eventsByRoom['home-agent-a'].filter((event) => event.kind === 'intent_posted').length, 2);
    assert.equal(snapshot.edges.some((edge) => edge.from === 'request-1' && edge.to === 'home-agent-a'), true);
  } finally {
    delete process.env.OBSERVATORY_HEADWATERS_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
