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
  private static readonly FINAL_ACK_CONTENT = 'Tutorial complete. You can now proceed beyond the ritual.';
  private static readonly DOJO_TOKEN_ART = [
    '+--------------------------------------+',
    '| [:: dojo signal acquired ::]         |',
    '| [:: refusal survived ::]             |',
    '| [:: promise chain closed ::]         |',
    '| [:: status: FULFILLED ::]            |',
    '+--------------------------------------+',
  ].join('\n');
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
    this.client.on('client-warning', (err: Error) => {
      console.error(`station-tutor: client warning: ${err.message}`);
    });
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
    if (msg.parentId === REGISTRATION_SPACE_ID) {
      if (isRegistrationPayload(msg.payload)) {
        this.handleRegistrationIntent(msg);
        return;
      }
      this.declineWithGuidance(
        msg.intentId!,
        REGISTRATION_SPACE_ID,
        'Registration intent is malformed.',
        {
          reasonCode: 'INVALID_REGISTRATION_PAYLOAD',
          explanation: 'Registration requires agentName, publicKeyPem, and fingerprint in the payload.',
          expected: {
            type: 'INTENT',
            parentId: REGISTRATION_SPACE_ID,
            payload: {
              agentName: '<agent-name>',
              publicKeyPem: '-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----',
              fingerprint: 'SHA256:<fingerprint>',
            },
          },
          retryHint: 'Post a corrected registration intent in the registration space.',
        },
      );
      return;
    }

    const registration = this.registrations.get(msg.parentId ?? '');
    if (registration) {
      if (isSignedChallengePayload(msg.payload)) {
        this.handleSignedChallenge(msg, registration);
        return;
      }
      this.declineWithGuidance(
        msg.intentId!,
        registration.registrationIntentId,
        'Challenge response is malformed.',
        {
          reasonCode: 'INVALID_CHALLENGE_RESPONSE',
          explanation: 'Reply in the registration subspace with both challenge and signatureBase64.',
          expected: {
            type: 'INTENT',
            parentId: registration.registrationIntentId,
            payload: {
              challenge: registration.challenge,
              signatureBase64: '<base64-signature>',
            },
          },
          retryHint: 'Sign the exact challenge string with RSA-SHA256, base64 encode the signature, and retry in this same subspace.',
        },
      );
      return;
    }

    if (msg.parentId === TUTORIAL_SPACE_ID) {
      if (msg.payload.content === RITUAL_GREETING_CONTENT) {
        this.handleTutorialGreeting(msg);
        return;
      }
      this.declineWithGuidance(
        msg.intentId!,
        TUTORIAL_SPACE_ID,
        'Tutorial greeting did not match the ritual contract.',
        {
          reasonCode: 'INVALID_TUTORIAL_GREETING',
          explanation: 'The dojo starts only after the exact ritual greeting is posted in the tutorial space.',
          expected: {
            type: 'INTENT',
            parentId: TUTORIAL_SPACE_ID,
            payload: {
              content: RITUAL_GREETING_CONTENT,
            },
          },
          retryHint: 'Post the exact ritual greeting in tutorial, then continue in that greeting intent subspace.',
        },
      );
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
    if (payload.challenge !== registration.challenge) {
      this.declineWithGuidance(
        msg.intentId!,
        registration.registrationIntentId,
        'Challenge response used the wrong challenge value.',
        {
          reasonCode: 'CHALLENGE_MISMATCH',
          explanation: 'The signed response must echo the exact challenge string issued by the tutor.',
          expected: {
            challenge: registration.challenge,
          },
          retryHint: 'Use the latest challenge value from this registration subspace and retry.',
        },
      );
      return;
    }

    const verify = createVerify('RSA-SHA256');
    verify.update(registration.challenge);
    verify.end();
    const valid = verify.verify(registration.publicKeyPem, Buffer.from(payload.signatureBase64!, 'base64'));
    if (!valid) {
      this.declineWithGuidance(
        msg.intentId!,
        registration.registrationIntentId,
        'Signature verification failed.',
        {
          reasonCode: 'SIGNATURE_VERIFICATION_FAILED',
          explanation: 'The tutor verifies RSA-SHA256 over the raw challenge string exactly as issued.',
          expected: {
            algorithm: CHALLENGE_ALGORITHM,
            signedBytes: registration.challenge,
            encoding: 'base64(signature)',
          },
          retryHint: 'Sign the raw challenge text exactly, base64 encode the signature, and post a corrected response in this same subspace.',
        },
      );
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
      this.declineWithGuidance(
        msg.intentId!,
        TUTORIAL_SPACE_ID,
        'Complete registration and proof-of-possession before entering the tutorial ritual.',
        {
          reasonCode: 'REGISTRATION_REQUIRED',
          explanation: 'The tutorial gate opens only after the tutor accepts your registration challenge response.',
          retryHint: 'Register in the registration space, finish proof-of-possession, then repost the ritual greeting.',
        },
      );
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
      this.declineWithGuidance(
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
      const promise = createPromise(this.agentId, msg.intentId!, 'I will guide you through the station ritual');
      promise.parentId = tutorial.greetingIntentId;
      tutorial.promiseId = promise.promiseId;
      this.client.post(promise);
    }
  }

  private handleAccept(msg: MessageEcho): void {
    let matched = false;
    for (const tutorial of this.tutorialSessions.values()) {
      if (tutorial.promiseId === msg.promiseId && tutorial.phase === 'promised') {
        matched = true;
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

    if (matched) return;

    const tutorial = msg.parentId ? this.tutorialSessions.get(msg.parentId) : undefined;
    if (!tutorial || tutorial.phase !== 'promised') return;

    this.declineWithGuidance(
      tutorial.greetingIntentId,
      tutorial.greetingIntentId,
      'ACCEPT did not bind to the tutor promise.',
      {
        reasonCode: 'MISSING_OR_WRONG_PROMISE_ID',
        explanation: 'ACCEPT must bind to the tutor promise by promiseId.',
        expected: {
          type: 'ACCEPT',
          promiseId: tutorial.promiseId,
        },
        retryHint: 'Post a corrected ACCEPT in this same subspace using the tutor promiseId.',
      },
    );
  }

  private handleAssess(msg: MessageEcho): void {
    let matched = false;
    for (const tutorial of this.tutorialSessions.values()) {
      if (tutorial.promiseId === msg.promiseId && tutorial.phase === 'completed') {
        matched = true;
        tutorial.phase = 'assessed';
        tutorial.updatedAt = msg.timestamp;
        const ack = createIntent(
          this.agentId,
          StationTutor.FINAL_ACK_CONTENT,
          undefined,
          undefined,
          tutorial.greetingIntentId,
        );
        Object.assign(ack.payload as Record<string, unknown>, {
          dojoReward: {
            type: 'matrix-dojo-token',
            version: 1,
            title: 'dojo signal acquired',
            art: StationTutor.DOJO_TOKEN_ART,
            status: 'FULFILLED',
            ritual: 'phase1-first-contact-ritual',
            issuedAt: msg.timestamp,
            visitorId: tutorial.visitorId,
            promiseId: tutorial.promiseId,
            saveAs: '.intent-space/state/dojo-token.txt',
          },
          dojoCertificate: {
            ritual: 'phase1-first-contact-ritual',
            status: 'FULFILLED',
            issuedAt: msg.timestamp,
            visitorId: tutorial.visitorId,
            promiseId: tutorial.promiseId,
          },
        });
        this.client.post(ack);
        this.tutorialSessions.delete(tutorial.greetingIntentId);
      }
    }

    if (matched) return;

    const tutorial = msg.parentId ? this.tutorialSessions.get(msg.parentId) : undefined;
    if (!tutorial || tutorial.phase !== 'completed') return;

    const assessment = msg.payload?.assessment;
    if (assessment !== 'FULFILLED' && assessment !== 'BROKEN') {
      this.declineWithGuidance(
        tutorial.greetingIntentId,
        tutorial.greetingIntentId,
        'ASSESS payload is malformed.',
        {
          reasonCode: 'INVALID_ASSESSMENT_PAYLOAD',
          explanation: 'ASSESS must include payload.assessment with FULFILLED or BROKEN.',
          expected: {
            type: 'ASSESS',
            promiseId: tutorial.promiseId,
            payload: {
              assessment: 'FULFILLED',
            },
          },
          retryHint: 'Post a corrected ASSESS in this same subspace.',
        },
      );
      return;
    }

    this.declineWithGuidance(
      tutorial.greetingIntentId,
      tutorial.greetingIntentId,
      'ASSESS did not bind to the tutor promise.',
      {
        reasonCode: 'MISSING_OR_WRONG_PROMISE_ID',
        explanation: 'ASSESS must bind to the tutor promise by promiseId.',
        expected: {
          type: 'ASSESS',
          promiseId: tutorial.promiseId,
          payload: {
            assessment,
          },
        },
        retryHint: 'Post a corrected ASSESS in this same subspace using the tutor promiseId.',
      },
    );
  }

  getStateCounts(): { registrations: number; tutorials: number; seenMessages: number; verifiedAgents: number } {
    return {
      registrations: this.registrations.size,
      tutorials: this.tutorialSessions.size,
      seenMessages: this.seenMessages.size,
      verifiedAgents: this.verifiedAgents.size,
    };
  }

  private declineWithGuidance(
    intentId: string,
    parentId: string,
    reason: string,
    guidance: Record<string, unknown>,
  ): void {
    const decline = createDecline(this.agentId, intentId, reason);
    decline.parentId = parentId;
    Object.assign(decline.payload as Record<string, unknown>, guidance);
    this.client.post(decline);
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
