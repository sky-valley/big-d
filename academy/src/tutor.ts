import { createComplete, createDecline, createIntent, createPromise } from '../../itp/src/protocol.ts';
import { IntentSpaceClient } from '../../intent-space/src/client.ts';
import type { ClientTarget, MessageEcho } from '../../intent-space/src/types.ts';
import { RITUAL_GREETING_CONTENT, TUTORIAL_SPACE_ID } from './station-contract.ts';
import { enrollAgent } from './agent-enrollment.ts';

interface TutorialSession {
  greetingIntentId: string;
  visitorId: string;
  phase: 'awaiting-first-intent' | 'declined-once' | 'promised' | 'completed';
  promiseId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StationTutorOptions {
  target: ClientTarget;
  academyUrl: string;
  agentId?: string;
}

export class StationTutor {
  private static readonly MAX_SEEN_MESSAGES = 10_000;
  private static readonly SESSION_TTL_MS = 15 * 60 * 1000;
  private static readonly FINAL_ACK_CONTENT = 'Tutorial complete. You can now proceed beyond the ritual.';
  private static readonly DOJO_TOKEN_ART = [
    '+--------------------------------------+',
    '| [:: dojo signal acquired ::]         |',
    '| [:: refusal survived ::]             |',
    '| [:: promise chain closed ::]         |',
    '| [:: status: FULFILLED ::]            |',
    '+--------------------------------------+',
  ].join('\n');

  private readonly academyUrl: string;
  private agentId: string;
  private client: IntentSpaceClient;
  private tutorialSessions = new Map<string, TutorialSession>();
  private seenMessages = new Set<string>();

  constructor(opts: StationTutorOptions) {
    this.academyUrl = opts.academyUrl;
    this.agentId = opts.agentId ?? 'differ-tutor';
    this.client = new IntentSpaceClient(opts.target);
  }

  async start(): Promise<void> {
    this.client.on('message', (msg: MessageEcho) => {
      void this.handleMessage(msg);
    });
    this.client.on('client-warning', (err: Error) => {
      console.error(`station-tutor: client warning: ${err.message}`);
    });
    const enrollment = await enrollAgent(this.academyUrl, this.agentId);
    this.agentId = enrollment.senderId;
    await this.client.connect();
    await this.client.authenticate(enrollment.stationToken, enrollment.buildProof);
  }

  stop(): void {
    this.client.disconnect();
  }

  private async handleMessage(msg: MessageEcho): Promise<void> {
    this.pruneExpiredState(msg.timestamp);
    const key = String(msg.seq);
    if (this.seenMessages.has(key)) return;
    this.seenMessages.add(key);
    this.pruneSeenMessages();

    if (msg.senderId === this.agentId) return;

    if (msg.type === 'INTENT') {
      await this.handleIntent(msg);
      return;
    }
    if (msg.type === 'ACCEPT') {
      await this.handleAccept(msg);
      return;
    }
    if (msg.type === 'ASSESS') {
      await this.handleAssess(msg);
    }
  }

  private async handleIntent(msg: MessageEcho): Promise<void> {
    if (msg.parentId === TUTORIAL_SPACE_ID) {
      if (msg.payload.content === RITUAL_GREETING_CONTENT) {
        await this.handleTutorialGreeting(msg);
        return;
      }
      await this.declineWithGuidance(
        msg.intentId!,
        TUTORIAL_SPACE_ID,
        'Tutorial greeting did not match the ritual contract.',
        {
          reasonCode: 'INVALID_TUTORIAL_GREETING',
          explanation: 'The dojo starts only after the exact ritual greeting is posted in the tutorial space.',
          expected: {
            type: 'INTENT',
            parentId: TUTORIAL_SPACE_ID,
            payload: { content: RITUAL_GREETING_CONTENT },
          },
          retryHint: 'Post the exact ritual greeting in tutorial, then continue in that greeting intent subspace.',
        },
      );
      return;
    }

    const tutorial = this.tutorialSessions.get(msg.parentId ?? '');
    if (tutorial) {
      await this.handleTutorialIntent(msg, tutorial);
    }
  }

  private async handleTutorialGreeting(msg: MessageEcho): Promise<void> {
    this.tutorialSessions.set(msg.intentId!, {
      greetingIntentId: msg.intentId!,
      visitorId: msg.senderId,
      phase: 'awaiting-first-intent',
      createdAt: msg.timestamp,
      updatedAt: msg.timestamp,
    });
    this.postIntent(
      msg.intentId!,
      'Enter this greeting intent subspace and post your first tutorial intent there.',
      { nextStep: 'enter-subspace' },
    );
  }

  private async handleTutorialIntent(msg: MessageEcho, tutorial: TutorialSession): Promise<void> {
    tutorial.updatedAt = msg.timestamp;
    if (tutorial.phase === 'awaiting-first-intent') {
      tutorial.phase = 'declined-once';
      await this.declineWithGuidance(
        msg.intentId!,
        tutorial.greetingIntentId,
        'Deliberate tutorial correction: retry with a clearer request after observing the subspace.',
        {
          reasonCode: 'DOJO_DELIBERATE_CORRECTION',
          explanation: 'This first decline is intentional. The dojo is teaching you to recover from refusal and retry clearly.',
          retryHint: 'Observe this subspace, then post a clearer tutorial request in the same subspace.',
        },
      );
      return;
    }

    if (tutorial.phase === 'declined-once') {
      tutorial.phase = 'promised';
      tutorial.promiseId = this.postPromise(
        tutorial.greetingIntentId,
        msg.intentId!,
        'I will guide you through the station ritual',
      );
    }
  }

  private async handleAccept(msg: MessageEcho): Promise<void> {
    let matched = false;
    for (const tutorial of this.tutorialSessions.values()) {
      const promiseId = tutorial.phase === 'promised' ? tutorial.promiseId : undefined;
      if (promiseId && promiseId === msg.promiseId && tutorial.phase === 'promised') {
        matched = true;
        tutorial.phase = 'completed';
        tutorial.updatedAt = msg.timestamp;
        this.postComplete(
          tutorial.greetingIntentId,
          msg.promiseId!,
          'Tutorial promise complete. You have finished the first coordination loop.',
        );
      }
    }
    if (matched) return;
    const tutorial = msg.parentId ? this.tutorialSessions.get(msg.parentId) : undefined;
    if (!tutorial || tutorial.phase !== 'promised') return;
    await this.declineWithGuidance(
      tutorial.greetingIntentId,
      tutorial.greetingIntentId,
      'ACCEPT did not bind to the tutor promise.',
      {
        reasonCode: 'MISSING_OR_WRONG_PROMISE_ID',
        explanation: 'ACCEPT must bind to the tutor promise by promiseId.',
        expected: { type: 'ACCEPT', promiseId: tutorial.promiseId },
        retryHint: 'Post a corrected ACCEPT in this same subspace using the tutor promiseId.',
      },
    );
  }

  private async handleAssess(msg: MessageEcho): Promise<void> {
    let matched = false;
    for (const tutorial of this.tutorialSessions.values()) {
      const promiseId = tutorial.phase === 'completed' ? tutorial.promiseId : undefined;
      if (promiseId && promiseId === msg.promiseId && tutorial.phase === 'completed') {
        matched = true;
        this.postIntent(
          tutorial.greetingIntentId,
          StationTutor.FINAL_ACK_CONTENT,
          {
            dojoReward: {
              type: 'matrix-dojo-token',
              version: 1,
              title: 'dojo signal acquired',
              art: StationTutor.DOJO_TOKEN_ART,
              status: 'FULFILLED',
              ritual: 'phase1-first-contact-ritual',
              issuedAt: msg.timestamp,
              visitorId: tutorial.visitorId,
              promiseId,
              saveAs: '.intent-space/state/dojo-token.txt',
            },
            dojoCertificate: {
              ritual: 'phase1-first-contact-ritual',
              status: 'FULFILLED',
              issuedAt: msg.timestamp,
              visitorId: tutorial.visitorId,
              promiseId,
            },
          },
        );
        this.tutorialSessions.delete(tutorial.greetingIntentId);
      }
    }
    if (matched) return;
    const tutorial = msg.parentId ? this.tutorialSessions.get(msg.parentId) : undefined;
    if (!tutorial || tutorial.phase !== 'completed') return;
    const assessment = msg.payload?.assessment;
    if (assessment !== 'FULFILLED' && assessment !== 'BROKEN') {
      await this.declineWithGuidance(
        tutorial.greetingIntentId,
        tutorial.greetingIntentId,
        'ASSESS payload is malformed.',
        {
          reasonCode: 'INVALID_ASSESSMENT_PAYLOAD',
          explanation: 'ASSESS must include payload.assessment with FULFILLED or BROKEN.',
          expected: { type: 'ASSESS', promiseId: tutorial.promiseId, payload: { assessment: 'FULFILLED' } },
          retryHint: 'Post a corrected ASSESS in this same subspace.',
        },
      );
      return;
    }
    await this.declineWithGuidance(
      tutorial.greetingIntentId,
      tutorial.greetingIntentId,
      'ASSESS did not bind to the tutor promise.',
      {
        reasonCode: 'MISSING_OR_WRONG_PROMISE_ID',
        explanation: 'ASSESS must bind to the tutor promise by promiseId.',
        expected: { type: 'ASSESS', promiseId: tutorial.promiseId, payload: { assessment } },
        retryHint: 'Post a corrected ASSESS in this same subspace using the tutor promiseId.',
      },
    );
  }

  getStateCounts(): { tutorials: number; seenMessages: number } {
    return {
      tutorials: this.tutorialSessions.size,
      seenMessages: this.seenMessages.size,
    };
  }

  private async declineWithGuidance(
    intentId: string,
    parentId: string,
    reason: string,
    guidance: Record<string, unknown>,
  ): Promise<void> {
    this.postDecline(intentId, parentId, reason, guidance);
  }

  private pruneSeenMessages(): void {
    while (this.seenMessages.size > StationTutor.MAX_SEEN_MESSAGES) {
      const oldest = this.seenMessages.values().next().value;
      if (oldest === undefined) return;
      this.seenMessages.delete(oldest);
    }
  }

  private pruneExpiredState(now: number): void {
    for (const [greetingId, tutorial] of this.tutorialSessions.entries()) {
      if (now - tutorial.updatedAt > StationTutor.SESSION_TTL_MS) {
        this.tutorialSessions.delete(greetingId);
      }
    }
  }

  private postIntent(parentId: string, content: string, payload: Record<string, unknown> = {}): void {
    const message = createIntent(this.agentId, content, undefined, undefined, parentId);
    Object.assign(message.payload, payload);
    this.client.post(message);
  }

  private postPromise(parentId: string, intentId: string, content: string, payload: Record<string, unknown> = {}): string {
    const message = createPromise(this.agentId, intentId, content);
    message.parentId = parentId;
    Object.assign(message.payload, payload);
    this.client.post(message);
    return message.promiseId!;
  }

  private postComplete(parentId: string, promiseId: string, summary: string, payload: Record<string, unknown> = {}): void {
    const message = createComplete(this.agentId, promiseId, summary);
    message.parentId = parentId;
    Object.assign(message.payload, payload);
    this.client.post(message);
  }

  private postDecline(intentId: string, parentId: string, reason: string, payload: Record<string, unknown> = {}): void {
    const message = createDecline(this.agentId, intentId, reason);
    message.parentId = parentId;
    Object.assign(message.payload, payload);
    this.client.post(message);
  }
}
