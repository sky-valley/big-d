import { mkdirSync } from 'fs';
import { join } from 'path';
import { IntentSpace } from '../../intent-space/src/space.ts';
import type { MessageEcho } from '../../intent-space/src/types.ts';
import type { StationSessionAuth } from '../../intent-space/src/auth.ts';
import {
  commonsStationAudience,
  CREATE_HOME_SPACE_ACTION,
  HEADWATERS_COMMONS_SPACE_ID,
  headwatersOrigin,
  HEADWATERS_STEWARD_ID,
  isCreateHomeSpacePayload,
  type ProvisionedSpaceReply,
} from './contract.ts';
import { HeadwatersProvisioner } from './provisioner.ts';

export interface HeadwatersServiceOptions {
  dataDir: string;
  host: string;
  commonsPort: number;
  authSecret: string;
}

export class HeadwatersService {
  private readonly dataDir: string;
  private readonly host: string;
  private readonly commonsPort: number;
  private readonly authSecret: string;
  private readonly provisioner: HeadwatersProvisioner;
  private readonly commons: IntentSpace;

  constructor(options: HeadwatersServiceOptions) {
    this.dataDir = options.dataDir;
    this.host = options.host;
    this.commonsPort = options.commonsPort;
    this.authSecret = options.authSecret;
    mkdirSync(this.dataDir, { recursive: true });
    this.provisioner = new HeadwatersProvisioner({
      baseDir: join(this.dataDir, 'spaces'),
      host: this.host,
      issuer: headwatersOrigin(),
      authSecret: this.authSecret,
    });
    this.commons = new IntentSpace({
      agentId: 'headwaters-commons',
      dbPath: join(this.dataDir, 'commons', 'intent-space.db'),
      socketPath: join(this.dataDir, 'commons', 'intent-space.sock'),
      tcpHost: this.host,
      tcpPort: this.commonsPort,
      stationAudience: commonsStationAudience(),
      authSecret: this.authSecret,
      authResult: {},
      onStoredMessage: (echo, auth) => {
        void this.handleStoredMessage(echo, auth);
      },
    });
  }

  get commonsEndpoint(): string {
    return `tcp://${this.host}:${this.commons.tcpPort}`;
  }

  async start(): Promise<void> {
    await this.commons.start();
    this.publishStewardPresence();
  }

  async stop(): Promise<void> {
    await this.provisioner.stop();
    await this.commons.stop();
  }

  private publishStewardPresence(): void {
    this.commons.publish({
      type: 'INTENT',
      intentId: 'headwaters:steward:create-home-space',
      parentId: HEADWATERS_COMMONS_SPACE_ID,
      senderId: HEADWATERS_STEWARD_ID,
      timestamp: Date.now(),
      payload: {
        content: 'I provision personal home spaces in the Headwaters commons.',
        headwatersActions: [CREATE_HOME_SPACE_ACTION],
        howToRequest: {
          type: 'INTENT',
          parentId: HEADWATERS_COMMONS_SPACE_ID,
          payload: { headwatersAction: CREATE_HOME_SPACE_ACTION },
        },
      },
    });
  }

  private async handleStoredMessage(message: MessageEcho, auth: StationSessionAuth | null): Promise<void> {
    if (!auth) return;
    if (message.type !== 'INTENT') return;
    if (message.parentId !== HEADWATERS_COMMONS_SPACE_ID) return;
    if (!isCreateHomeSpacePayload(message.payload)) return;

    if (!message.intentId) return;

    try {
      const provisioned = await this.provisioner.provisionHomeSpace(auth.senderId, auth.jkt);
      const payload: ProvisionedSpaceReply = {
        headwatersStatus: provisioned.created ? 'SPACE_CREATED' : 'SPACE_ALREADY_EXISTS',
        spaceKind: 'home',
        spaceId: provisioned.spaceId,
        stationEndpoint: provisioned.endpoint,
        stationAudience: provisioned.audience,
        stationToken: provisioned.stationToken,
      };
      this.commons.publish({
        type: 'INTENT',
        intentId: `headwaters:reply:${message.intentId}`,
        parentId: message.intentId,
        senderId: HEADWATERS_STEWARD_ID,
        timestamp: Date.now(),
        payload: {
          content: 'Home space ready. Connect directly to your dedicated space.',
          ...payload,
        },
      });
    } catch (error) {
      this.commons.publish({
        type: 'DECLINE',
        intentId: message.intentId,
        parentId: message.intentId,
        senderId: HEADWATERS_STEWARD_ID,
        timestamp: Date.now(),
        payload: {
          reason: error instanceof Error ? error.message : String(error),
          reasonCode: 'HEADWATERS_PROVISIONING_FAILED',
        },
      });
    }
  }
}
