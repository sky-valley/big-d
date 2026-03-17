import type { AssessmentResult, ITPMessage } from '../../itp/src/types.ts';
import {
  createAccept,
  createAssess,
  createComplete,
  createDecline,
  createIntent,
  createPromise,
  createRevise,
} from '../../itp/src/protocol.ts';
import { IntentSpaceClient } from '../../intent-space/src/client.ts';
import type { MessageEcho, StoredMessage } from '../../intent-space/src/types.ts';
import type {
  IntentSpaceProjectionAdapter,
  ProjectionRef,
  SemanticMove,
  SpaceRef,
} from './types.ts';

type ThreadSpaceResolver = (threadId: string) => ReadonlyArray<SpaceRef>;

export class IntentSpaceClientProjectionAdapter implements IntentSpaceProjectionAdapter {
  constructor(
    private readonly client: IntentSpaceClient,
    private readonly senderId: string,
    private readonly resolveSpaces: ThreadSpaceResolver,
  ) {}

  async projectMove(threadId: string, move: SemanticMove): Promise<ProjectionRef[]> {
    const targetSpaceId = this.currentSpaceId(threadId);
    const message = this.toMessage(targetSpaceId, move);
    this.client.post(message);
    return [messageToProjectionRef(message, targetSpaceId, this.client.latestSeq + 1)];
  }

  async scanThreadProjection(threadId: string, since: number): Promise<ProjectionRef[]> {
    const spaces = this.resolveSpaces(threadId);
    const scans = await Promise.all(
      spaces.map(async (space) => {
        const messages = await this.client.scan(space.spaceId, since);
        return messages.map((msg) => storedMessageToProjectionRef(msg, space.spaceId));
      }),
    );
    return scans.flat().sort((a, b) => a.seq - b.seq);
  }

  async waitForProjection(threadId: string, since: number, timeoutSeconds: number): Promise<ProjectionRef[]> {
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadline) {
      const refs = await this.scanThreadProjection(threadId, since);
      if (refs.length > 0) return refs;
      await sleep(100);
    }
    return [];
  }

  private currentSpaceId(threadId: string): string {
    const spaces = this.resolveSpaces(threadId);
    for (let i = spaces.length - 1; i >= 0; i -= 1) {
      const space = spaces[i];
      if (!space) continue;
      if (space.relation === 'entered' || space.relation === 'delegated' || space.relation === 'projected') {
        return space.spaceId;
      }
    }
    return spaces[0]?.spaceId ?? threadId;
  }

  private toMessage(parentId: string, move: SemanticMove): ITPMessage {
    switch (move.kind) {
      case 'INTENT': {
        const message = createIntent(this.senderId, move.content, undefined, undefined, parentId);
        Object.assign(message.payload, move.payload ?? {});
        return message;
      }
      case 'PROMISE': {
        const message = createPromise(this.senderId, move.intentId ?? parentId, move.content);
        message.parentId = parentId;
        if (move.promiseId) message.promiseId = move.promiseId;
        Object.assign(message.payload, move.payload ?? {});
        return message;
      }
      case 'DECLINE': {
        const message = createDecline(this.senderId, move.intentId ?? parentId, move.reason);
        message.parentId = parentId;
        Object.assign(message.payload, move.payload ?? {});
        return message;
      }
      case 'ACCEPT': {
        const message = createAccept(this.senderId, move.promiseId);
        message.parentId = parentId;
        return message;
      }
      case 'ASSESS': {
        const assessment = toProtocolAssessment(move.assessment);
        const message = createAssess(this.senderId, move.promiseId, assessment);
        message.parentId = parentId;
        Object.assign(message.payload, move.payload ?? {});
        return message;
      }
      case 'COMPLETE': {
        const message = createComplete(this.senderId, move.promiseId, move.summary);
        message.parentId = parentId;
        Object.assign(message.payload, move.payload ?? {});
        return message;
      }
      case 'REVISE_DESIRE': {
        const message = createIntent(this.senderId, move.content, undefined, undefined, parentId);
        Object.assign(message.payload, { ...(move.payload ?? {}), revised: true });
        return message;
      }
      case 'REVISE_PROMISE': {
        const message = createRevise(this.senderId, move.promiseId, move.intentId ?? parentId, move.content);
        message.parentId = parentId;
        Object.assign(message.payload, move.payload ?? {});
        return message;
      }
    }
  }
}

function messageToProjectionRef(message: ITPMessage, spaceId: string, seq: number): ProjectionRef {
  return {
    atomType: message.type,
    atomId: message.promiseId ?? message.intentId ?? `${message.type.toLowerCase()}:${seq}`,
    spaceId,
    parentId: message.parentId ?? spaceId,
    senderId: message.senderId,
    seq,
    summary: summarizeMessage(message),
  };
}

function storedMessageToProjectionRef(message: StoredMessage | MessageEcho, spaceId: string): ProjectionRef {
  return {
    atomType: message.type,
    atomId: message.promiseId ?? message.intentId ?? `${message.type.toLowerCase()}:${message.seq}`,
    spaceId,
    parentId: message.parentId ?? spaceId,
    senderId: message.senderId,
    seq: message.seq,
    summary: summarizeStoredMessage(message),
  };
}

function summarizeMessage(message: ITPMessage): string {
  if (typeof message.payload.content === 'string') return message.payload.content;
  if (typeof message.payload.reason === 'string') return message.payload.reason;
  if (typeof message.payload.assessment === 'string') return message.payload.assessment;
  return message.type;
}

function summarizeStoredMessage(message: StoredMessage | MessageEcho): string {
  if (typeof message.payload.content === 'string') return message.payload.content;
  if (typeof message.payload.reason === 'string') return message.payload.reason;
  if (typeof message.payload.assessment === 'string') return message.payload.assessment;
  return message.type;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toProtocolAssessment(value: 'FULFILLED' | 'PARTIAL' | 'BROKEN' | 'UNKNOWN'): AssessmentResult {
  if (value === 'FULFILLED' || value === 'BROKEN') return value;
  throw new Error(`Intent space projection does not yet support assessment value ${value}`);
}
