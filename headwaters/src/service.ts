import { mkdirSync } from 'fs';
import { join } from 'path';
import { IntentSpace } from '../../intent-space/src/space.ts';
import { commonsStationAudience } from './contract.ts';

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
  private readonly commons: IntentSpace;

  constructor(options: HeadwatersServiceOptions) {
    this.dataDir = options.dataDir;
    this.host = options.host;
    this.commonsPort = options.commonsPort;
    this.authSecret = options.authSecret;
    mkdirSync(this.dataDir, { recursive: true });
    this.commons = new IntentSpace({
      agentId: 'headwaters-commons',
      dbPath: join(this.dataDir, 'commons', 'intent-space.db'),
      socketPath: join(this.dataDir, 'commons', 'intent-space.sock'),
      tcpHost: this.host,
      tcpPort: this.commonsPort,
      stationAudience: commonsStationAudience(),
      authSecret: this.authSecret,
      authResult: {},
    });
  }

  get commonsEndpoint(): string {
    return `tcp://${this.host}:${this.commons.tcpPort}`;
  }

  async start(): Promise<void> {
    await this.commons.start();
  }

  async stop(): Promise<void> {
    await this.commons.stop();
  }
}
