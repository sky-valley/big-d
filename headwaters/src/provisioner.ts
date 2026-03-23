import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { IntentSpace } from '../../intent-space/src/space.ts';
import { issueSpaceToken } from './welcome-mat.ts';

export interface ProvisionedSpace {
  kind: 'home';
  spaceId: string;
  ownerId: string;
  audience: string;
  endpoint: string;
  stationToken: string;
}

interface HeadwatersProvisionerOptions {
  baseDir: string;
  host: string;
  issuer: string;
  authSecret: string;
}

export class HeadwatersProvisioner {
  private readonly baseDir: string;
  private readonly host: string;
  private readonly issuer: string;
  private readonly authSecret: string;
  private readonly spaces = new Map<string, { record: ProvisionedSpace; runtime: IntentSpace }>();

  constructor(options: HeadwatersProvisionerOptions) {
    this.baseDir = options.baseDir;
    this.host = options.host;
    this.issuer = options.issuer;
    this.authSecret = options.authSecret;
    mkdirSync(this.baseDir, { recursive: true });
  }

  async stop(): Promise<void> {
    for (const { runtime } of this.spaces.values()) {
      await runtime.stop();
    }
    this.spaces.clear();
  }

  async provisionHomeSpace(ownerId: string, jwkThumb: string): Promise<ProvisionedSpace & { created: boolean }> {
    const existing = this.spaces.get(ownerId);
    if (existing) {
      return { ...existing.record, created: false };
    }

    const safeOwner = ownerId.replace(/[^a-zA-Z0-9.-]/g, '-');
    const spaceId = `home-${safeOwner}`;
    const audience = `intent-space://headwaters/spaces/${spaceId}`;
    const dir = join(this.baseDir, spaceId);
    mkdirSync(dir, { recursive: true });

    const runtime = new IntentSpace({
      agentId: `headwaters-space:${spaceId}`,
      dbPath: join(dir, 'intent-space.db'),
      socketPath: join(tmpdir(), `hw-${spaceId}.sock`),
      tcpHost: this.host,
      tcpPort: 0,
      stationAudience: audience,
      authSecret: this.authSecret,
      authResult: {},
    });
    await runtime.start();

    const endpoint = `tcp://${this.host}:${runtime.tcpPort}`;
    const stationToken = issueSpaceToken({
      issuer: this.issuer,
      subject: ownerId,
      audience,
      jwkThumb,
      secret: this.authSecret,
    });

    const record: ProvisionedSpace = {
      kind: 'home',
      spaceId,
      ownerId,
      audience,
      endpoint,
      stationToken,
    };

    writeFileSync(join(dir, 'space.json'), JSON.stringify(record, null, 2) + '\n', 'utf8');
    this.spaces.set(ownerId, { record, runtime });
    return { ...record, created: true };
  }
}
