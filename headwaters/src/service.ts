import { mkdirSync } from 'fs';
import { join } from 'path';
import { SharedHeadwatersHost } from './shared-host.ts';
import { HeadwatersProvisioner } from './provisioner.ts';
import { commonsStationEndpoint, headwatersOrigin } from './contract.ts';

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
  private readonly stationHost: SharedHeadwatersHost;
  private readonly provisioner: HeadwatersProvisioner;

  constructor(options: HeadwatersServiceOptions) {
    this.dataDir = options.dataDir;
    this.host = options.host;
    this.commonsPort = options.commonsPort;
    this.authSecret = options.authSecret;
    mkdirSync(this.dataDir, { recursive: true });
    this.stationHost = new SharedHeadwatersHost({
      dataDir: this.dataDir,
      host: this.host,
      port: this.commonsPort,
      authSecret: this.authSecret,
    });
    this.provisioner = new HeadwatersProvisioner({
      baseDir: join(this.dataDir, 'spaces'),
      stationEndpoint: commonsStationEndpoint(),
      issuer: headwatersOrigin(),
      authSecret: this.authSecret,
    });
    this.stationHost.loadProvisionedSpaces(this.provisioner.allSpaces());
  }

  get commonsEndpoint(): string {
    return this.stationHost.endpoint;
  }

  getProvisioner(): HeadwatersProvisioner {
    return this.provisioner;
  }

  async start(): Promise<void> {
    await this.stationHost.start();
  }

  async stop(): Promise<void> {
    await this.provisioner.stop();
    await this.stationHost.stop();
  }
}
