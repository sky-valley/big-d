import { createVerify, randomUUID } from 'crypto';
import { IntentSpaceClient } from '../../intent-space/src/client.ts';
import type { ClientTarget, MessageEcho } from '../../intent-space/src/types.ts';
import {
  InMemoryThreadPathProjector,
  IntentSpaceClientProjectionAdapter,
  PromiseSessionRuntime,
  type SpaceRef,
} from '../../promise-runtime/src/index.ts';
import {
  REGISTRATION_SPACE_ID,
  TUTORIAL_SPACE_ID,
  RITUAL_GREETING_CONTENT,
  CHALLENGE_ALGORITHM,
  isRegistrationPayload,
  isSignedChallengePayload,
} from './station-contract.ts';
import type { RegistrationPayload, SignedChallengePayload } from './station-contract.ts';

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
  private runtime: PromiseSessionRuntime;
  private threadSpaces = new Map<string, SpaceRef[]>();
  private registrations = new Map<string, RegistrationSession>();
  private tutorialSessions = new Map<string, TutorialSession>();
  private seenMessages = new Set<string>();
  private verifiedAgents = new Set<string>();

  constructor(opts: StationTutorOptions) {
    this.client = new IntentSpaceClient(opts.target);
    this.agentId = opts.agentId ?? 'differ-tutor';
    const threadProjector = new InMemoryThreadPathProjector();
    this.runtime = new PromiseSessionRuntime({
      agentId: this.agentId,
      projection: new IntentSpaceClientProjectionAdapter(
        this.client,
        this.agentId,
        (threadId) => this.threadSpaces.get(threadId) ?? [],
      ),
      threadProjector,
    });
  }

  async start(): Promise<void> {
    this.client.on('message', (msg: MessageEcho) => {
      void this.handleMessage(msg);
    });
    this.client.on('client-warning', (err: Error) => {
      console.error(`station-tutor: client warning: ${err.message}`);
    });
    await this.client.connect();
  }

  stop(): void {
    this.client.disconnect();
  }

  private async handleMessage(msg: MessageEcho): Promise<void> {
    this.pruneExpiredState(msg.timestamp);

    const key = messageKey(msg);
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
    if (msg.parentId === REGISTRATION_SPACE_ID) {
      if (isRegistrationPayload(msg.payload)) {
        await this.handleRegistrationIntent(msg);
        return;
      }
      await this.declineWithGuidance(
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
        await this.handleSignedChallenge(msg, registration);
        return;
      }
      await this.declineWithGuidance(
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
      await this.handleTutorialIntent(msg, tutorial);
    }
  }

  private async handleRegistrationIntent(msg: MessageEcho): Promise<void> {
    const payload = msg.payload as RegistrationPayload;
    const challenge = randomUUID();
    this.upsertThread({
      threadId: msg.intentId!,
      role: 'promiser',
      summary: 'Registration verification thread',
      pathSpaces: [
        { spaceId: REGISTRATION_SPACE_ID, relation: 'origin', summary: 'Registration root' },
        { spaceId: msg.intentId!, relation: 'entered', summary: 'Registration subspace' },
      ],
      rawStateHints: { kind: 'registration', participantId: msg.senderId },
    });
    this.registrations.set(msg.intentId!, {
      registrationIntentId: msg.intentId!,
      agentId: msg.senderId,
      publicKeyPem: payload.publicKeyPem!,
      challenge,
      verified: false,
      createdAt: msg.timestamp,
    });

    await this.runtime.expressIntent(
      msg.intentId!,
      'Prove you control the registered identity by signing this challenge',
      {
        challenge,
        algorithm: CHALLENGE_ALGORITHM,
      },
    );
  }

  private async handleSignedChallenge(msg: MessageEcho, registration: RegistrationSession): Promise<void> {
    const payload = msg.payload as SignedChallengePayload;
    if (payload.challenge !== registration.challenge) {
      await this.declineWithGuidance(
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
      await this.declineWithGuidance(
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
    await this.runtime.expressIntent(
      registration.registrationIntentId,
      `Registration accepted. Go to ${TUTORIAL_SPACE_ID} and post the ritual greeting.`,
      {
        tutorialSpaceId: TUTORIAL_SPACE_ID,
        ritualGreeting: RITUAL_GREETING_CONTENT,
      },
    );
  }

  private async handleTutorialGreeting(msg: MessageEcho): Promise<void> {
    if (!this.verifiedAgents.has(msg.senderId)) {
      await this.declineWithGuidance(
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

    this.upsertThread({
      threadId: msg.intentId!,
      role: 'promiser',
      summary: 'Tutorial ritual thread',
      pathSpaces: [
        { spaceId: TUTORIAL_SPACE_ID, relation: 'origin', summary: 'Tutorial root' },
        { spaceId: msg.intentId!, relation: 'entered', summary: 'Greeting intent subspace' },
      ],
      rawStateHints: { kind: 'tutorial', visitorId: msg.senderId },
    });

    await this.runtime.expressIntent(
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
      await this.runtime.offerPromise(
        tutorial.greetingIntentId,
        'I will guide you through the station ritual',
        {},
        undefined,
        msg.intentId!,
      );
    }
  }

  private async handleAccept(msg: MessageEcho): Promise<void> {
    let matched = false;
    for (const tutorial of this.tutorialSessions.values()) {
      const promiseId = tutorial.phase === 'promised'
        ? await this.currentTutorialPromiseId(tutorial.greetingIntentId)
        : undefined;
      if (promiseId && promiseId === msg.promiseId && tutorial.phase === 'promised') {
        matched = true;
        tutorial.phase = 'completed';
        tutorial.updatedAt = msg.timestamp;
        await this.runtime.complete(
          tutorial.greetingIntentId,
          msg.promiseId!,
          'Tutorial promise complete. You have finished the first coordination loop.',
        );
      }
    }

    if (matched) return;

    const tutorial = msg.parentId ? this.tutorialSessions.get(msg.parentId) : undefined;
    if (!tutorial || tutorial.phase !== 'promised') return;
    const promiseId = await this.currentTutorialPromiseId(tutorial.greetingIntentId);

    await this.declineWithGuidance(
      tutorial.greetingIntentId,
      tutorial.greetingIntentId,
      'ACCEPT did not bind to the tutor promise.',
      {
        reasonCode: 'MISSING_OR_WRONG_PROMISE_ID',
        explanation: 'ACCEPT must bind to the tutor promise by promiseId.',
        expected: {
          type: 'ACCEPT',
          promiseId,
        },
        retryHint: 'Post a corrected ACCEPT in this same subspace using the tutor promiseId.',
      },
    );
  }

  private async handleAssess(msg: MessageEcho): Promise<void> {
    let matched = false;
    for (const tutorial of this.tutorialSessions.values()) {
      const promiseId = tutorial.phase === 'completed'
        ? await this.currentTutorialPromiseId(tutorial.greetingIntentId)
        : undefined;
      if (promiseId && promiseId === msg.promiseId && tutorial.phase === 'completed') {
        matched = true;
        tutorial.phase = 'assessed';
        tutorial.updatedAt = msg.timestamp;
        await this.runtime.expressIntent(
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
    const promiseId = await this.currentTutorialPromiseId(tutorial.greetingIntentId);

    const assessment = msg.payload?.assessment;
    if (assessment !== 'FULFILLED' && assessment !== 'BROKEN') {
      await this.declineWithGuidance(
        tutorial.greetingIntentId,
        tutorial.greetingIntentId,
        'ASSESS payload is malformed.',
        {
          reasonCode: 'INVALID_ASSESSMENT_PAYLOAD',
          explanation: 'ASSESS must include payload.assessment with FULFILLED or BROKEN.',
          expected: {
            type: 'ASSESS',
            promiseId,
            payload: {
              assessment: 'FULFILLED',
            },
          },
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
        expected: {
          type: 'ASSESS',
          promiseId,
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

  private async declineWithGuidance(
    intentId: string,
    parentId: string,
    reason: string,
    guidance: Record<string, unknown>,
  ): Promise<void> {
    const threadId = this.ensureThreadForParent(parentId);
    await this.runtime.decline(threadId, reason, guidance, intentId);
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

  private upsertThread(context: {
    threadId: string;
    role: 'requester' | 'promiser' | 'observer' | 'mixed';
    summary: string;
    pathSpaces: SpaceRef[];
    rawStateHints?: Record<string, unknown>;
  }): void {
    this.threadSpaces.set(context.threadId, context.pathSpaces);
    this.runtime.upsertThread(context);
  }

  private ensureThreadForParent(parentId: string): string {
    if (this.threadSpaces.has(parentId)) return parentId;
    const threadId = `space:${parentId}`;
    if (!this.threadSpaces.has(threadId)) {
      this.upsertThread({
        threadId,
        role: 'promiser',
        summary: `Space thread for ${parentId}`,
        pathSpaces: [{ spaceId: parentId, relation: 'origin', summary: `Space ${parentId}` }],
      });
    }
    return threadId;
  }

  private async currentTutorialPromiseId(threadId: string): Promise<string | undefined> {
    const state = await this.runtime.refreshThread(threadId);
    return state.openCommitments.at(-1)?.promiseId;
  }
}

function messageKey(msg: MessageEcho): string {
  return String(msg.seq);
}
