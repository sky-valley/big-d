import { createVerify, randomUUID } from 'crypto';
import { IntentSpaceClient } from './client.ts';
import type { ClientTarget, MessageEcho } from './types.ts';
import {
  REGISTRATION_SPACE_ID,
  TUTORIAL_SPACE_ID,
  RITUAL_GREETING_CONTENT,
  CHALLENGE_ALGORITHM,
  isRegistrationPayload,
  isSignedChallengePayload,
} from './station-contract.ts';
import type { RegistrationPayload, SignedChallengePayload } from './station-contract.ts';
import {
  createComplete,
  createDecline,
  createIntent,
  createPromise,
} from '@differ/itp/src/protocol.ts';

interface RegistrationSession {
  registrationIntentId: string;
  agentId: string;
  publicKeyPem: string;
  challenge: string;
  verified: boolean;
  createdAt: number;
}

interface TutorialSession {
  greetingIntentId: string;
  visitorId: string;
  phase: 'awaiting-first-intent' | 'declined-once' | 'promised' | 'completed' | 'assessed';
  promiseId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StationTutorOptions {
  target: ClientTarget;
  agentId?: string;
}

export class StationTutor {
  private static readonly MAX_SEEN_MESSAGES = 10_000;
  private static readonly SESSION_TTL_MS = 15 * 60 * 1000;
  private client: IntentSpaceClient;
  private agentId: string;
  private registrations = new Map<string, RegistrationSession>();
  private tutorialSessions = new Map<string, TutorialSession>();
  private seenMessages = new Set<string>();
  private verifiedAgents = new Set<string>();

  constructor(opts: StationTutorOptions) {
    this.client = new IntentSpaceClient(opts.target);
    this.agentId = opts.agentId ?? 'differ-tutor';
  }

  async start(): Promise<void> {
    this.client.on('message', (msg: MessageEcho) => this.handleMessage(msg));
    await this.client.connect();
  }

  stop(): void {
    this.client.disconnect();
  }

  private handleMessage(msg: MessageEcho): void {
    this.pruneExpiredState(msg.timestamp);

    const key = messageKey(msg);
    if (this.seenMessages.has(key)) return;
    this.seenMessages.add(key);
    this.pruneSeenMessages();

    if (msg.senderId === this.agentId) return;

    if (msg.type === 'INTENT') {
      this.handleIntent(msg);
      return;
    }

    if (msg.type === 'ACCEPT') {
      this.handleAccept(msg);
      return;
    }

    if (msg.type === 'ASSESS') {
      this.handleAssess(msg);
    }
  }

  private handleIntent(msg: MessageEcho): void {
    if (msg.parentId === REGISTRATION_SPACE_ID && isRegistrationPayload(msg.payload)) {
      this.handleRegistrationIntent(msg);
      return;
    }

    const registration = this.registrations.get(msg.parentId ?? '');
    if (registration && isSignedChallengePayload(msg.payload)) {
      this.handleSignedChallenge(msg, registration);
      return;
    }

    if (msg.parentId === TUTORIAL_SPACE_ID && msg.payload.content === RITUAL_GREETING_CONTENT) {
      this.handleTutorialGreeting(msg);
      return;
    }

    const tutorial = this.tutorialSessions.get(msg.parentId ?? '');
    if (tutorial && msg.type === 'INTENT') {
      this.handleTutorialIntent(msg, tutorial);
    }
  }

  private handleRegistrationIntent(msg: MessageEcho): void {
    const payload = msg.payload as RegistrationPayload;
    const challenge = randomUUID();
    this.registrations.set(msg.intentId!, {
      registrationIntentId: msg.intentId!,
      agentId: msg.senderId,
      publicKeyPem: payload.publicKeyPem!,
      challenge,
      verified: false,
      createdAt: msg.timestamp,
    });

    const challengeIntent = createIntent(
      this.agentId,
      'Prove you control the registered identity by signing this challenge',
      undefined,
      undefined,
      msg.intentId,
    );
    Object.assign(challengeIntent.payload, {
      challenge,
      algorithm: CHALLENGE_ALGORITHM,
    });
    this.client.post(challengeIntent);
  }

  private handleSignedChallenge(msg: MessageEcho, registration: RegistrationSession): void {
    const payload = msg.payload as SignedChallengePayload;
    if (payload.challenge !== registration.challenge) return;

    const verify = createVerify('RSA-SHA256');
    verify.update(registration.challenge);
    verify.end();
    const valid = verify.verify(registration.publicKeyPem, Buffer.from(payload.signatureBase64!, 'base64'));
    if (!valid) {
      const decline = createDecline(this.agentId, registration.registrationIntentId, 'Signature verification failed');
      decline.parentId = registration.registrationIntentId;
      this.client.post(decline);
      return;
    }

    registration.verified = true;
    this.verifiedAgents.add(msg.senderId);
    this.registrations.delete(registration.registrationIntentId);
    const ack = createIntent(
      this.agentId,
      `Registration accepted. Go to ${TUTORIAL_SPACE_ID} and post the ritual greeting.`,
      undefined,
      undefined,
      registration.registrationIntentId,
    );
    Object.assign(ack.payload, {
      tutorialSpaceId: TUTORIAL_SPACE_ID,
      ritualGreeting: RITUAL_GREETING_CONTENT,
    });
    this.client.post(ack);
  }

  private handleTutorialGreeting(msg: MessageEcho): void {
    if (!this.verifiedAgents.has(msg.senderId)) {
      const decline = createDecline(
        this.agentId,
        msg.intentId!,
        'Complete registration and proof-of-possession before entering the tutorial ritual.',
      );
      decline.parentId = TUTORIAL_SPACE_ID;
      this.client.post(decline);
      return;
    }

    this.tutorialSessions.set(msg.intentId!, {
      greetingIntentId: msg.intentId!,
      visitorId: msg.senderId,
      phase: 'awaiting-first-intent',
      createdAt: msg.timestamp,
      updatedAt: msg.timestamp,
    });

    const instruction = createIntent(
      this.agentId,
      'Enter this greeting intent subspace and post your first tutorial intent there.',
      undefined,
      undefined,
      msg.intentId,
    );
    Object.assign(instruction.payload, { nextStep: 'enter-subspace' });
    this.client.post(instruction);
  }

  private handleTutorialIntent(msg: MessageEcho, tutorial: TutorialSession): void {
    tutorial.updatedAt = msg.timestamp;

    if (tutorial.phase === 'awaiting-first-intent') {
      tutorial.phase = 'declined-once';
      const decline = createDecline(
        this.agentId,
        msg.intentId!,
        'Deliberate tutorial correction: retry with a clearer request after observing the subspace.',
      );
      decline.parentId = tutorial.greetingIntentId;
      this.client.post(decline);
      return;
    }

    if (tutorial.phase === 'declined-once') {
      tutorial.phase = 'promised';
      const promise = createPromise(this.agentId, msg.intentId!, 'I will guide you through the station ritual');
      promise.parentId = tutorial.greetingIntentId;
      tutorial.promiseId = promise.promiseId;
      this.client.post(promise);
    }
  }

  private handleAccept(msg: MessageEcho): void {
    for (const tutorial of this.tutorialSessions.values()) {
      if (tutorial.promiseId === msg.promiseId && tutorial.phase === 'promised') {
        tutorial.phase = 'completed';
        tutorial.updatedAt = msg.timestamp;
        const complete = createComplete(
          this.agentId,
          msg.promiseId!,
          'Tutorial promise complete. You have finished the first coordination loop.',
          [],
        );
        complete.parentId = tutorial.greetingIntentId;
        this.client.post(complete);
      }
    }
  }

  private handleAssess(msg: MessageEcho): void {
    for (const tutorial of this.tutorialSessions.values()) {
      if (tutorial.promiseId === msg.promiseId && tutorial.phase === 'completed') {
        tutorial.phase = 'assessed';
        tutorial.updatedAt = msg.timestamp;
        const ack = createIntent(
          this.agentId,
          'Tutorial complete. You can now proceed beyond the ritual.',
          undefined,
          undefined,
          tutorial.greetingIntentId,
        );
        this.client.post(ack);
        this.tutorialSessions.delete(tutorial.greetingIntentId);
      }
    }
  }

  getStateCounts(): { registrations: number; tutorials: number; seenMessages: number; verifiedAgents: number } {
    return {
      registrations: this.registrations.size,
      tutorials: this.tutorialSessions.size,
      seenMessages: this.seenMessages.size,
      verifiedAgents: this.verifiedAgents.size,
    };
  }

  private pruneSeenMessages(): void {
    while (this.seenMessages.size > StationTutor.MAX_SEEN_MESSAGES) {
      const oldest = this.seenMessages.values().next().value;
      if (oldest === undefined) return;
      this.seenMessages.delete(oldest);
    }
  }

  private pruneExpiredState(now: number): void {
    for (const [registrationId, registration] of this.registrations.entries()) {
      if (now - registration.createdAt > StationTutor.SESSION_TTL_MS) {
        this.registrations.delete(registrationId);
      }
    }

    for (const [greetingId, tutorial] of this.tutorialSessions.entries()) {
      if (now - tutorial.updatedAt > StationTutor.SESSION_TTL_MS) {
        this.tutorialSessions.delete(greetingId);
      }
    }
  }
}

function messageKey(msg: MessageEcho): string {
  return String(msg.seq);
}
