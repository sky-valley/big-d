import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
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
  stationEndpoint: string;
  issuer: string;
  authSecret: string;
  maxSpaces?: number;
}

export class HeadwatersProvisioner {
  private readonly baseDir: string;
  private readonly stationEndpoint: string;
  private readonly issuer: string;
  private readonly authSecret: string;
  private readonly maxSpaces: number;
  private readonly spaces = new Map<string, ProvisionedSpace>();

  constructor(options: HeadwatersProvisionerOptions) {
    this.baseDir = options.baseDir;
    this.stationEndpoint = options.stationEndpoint;
    this.issuer = options.issuer;
    this.authSecret = options.authSecret;
    this.maxSpaces = options.maxSpaces ?? parseInt(process.env.HEADWATERS_MAX_SPACES ?? '100', 10);
    mkdirSync(this.baseDir, { recursive: true });
    this.loadPersistedSpaces();
  }

  async stop(): Promise<void> {
    this.spaces.clear();
  }

  async provisionHomeSpace(ownerId: string, jwkThumb: string): Promise<ProvisionedSpace & { created: boolean }> {
    const existing = this.spaces.get(ownerId);
    if (existing) {
      const normalized = this.refreshRecord(existing, jwkThumb);
      this.spaces.set(ownerId, normalized);
      this.persistRecord(normalized);
      return { ...normalized, created: false };
    }

    if (this.spaces.size >= this.maxSpaces) {
      throw new Error(`Headwaters capacity reached (${this.maxSpaces} hosted spaces)`);
    }

    const safeOwner = ownerId.replace(/[^a-zA-Z0-9.-]/g, '-');
    const spaceId = `home-${safeOwner}`;
    const audience = `intent-space://headwaters/spaces/${spaceId}`;
    const dir = join(this.baseDir, spaceId);
    mkdirSync(dir, { recursive: true });
    const stationToken = issueSpaceToken({
      issuer: this.issuer,
      subject: ownerId,
      audience,
      spaceId,
      jwkThumb,
      secret: this.authSecret,
    });

    const record: ProvisionedSpace = {
      kind: 'home',
      spaceId,
      ownerId,
      audience,
      endpoint: this.stationEndpoint,
      stationToken,
    };

    this.persistRecord(record);
    this.spaces.set(ownerId, record);
    return { ...record, created: true };
  }

  getSpaceById(spaceId: string): ProvisionedSpace | undefined {
    return Array.from(this.spaces.values()).find((record) => record.spaceId === spaceId);
  }

  allSpaces(): ProvisionedSpace[] {
    return Array.from(this.spaces.values());
  }

  private loadPersistedSpaces(): void {
    for (const entry of readdirSync(this.baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(this.baseDir, entry.name, 'space.json');
      if (!existsSync(path)) continue;
      try {
        const parsed = this.normalizeRecord(JSON.parse(readFileSync(path, 'utf8')) as ProvisionedSpace);
        if (parsed.ownerId && parsed.spaceId) {
          this.spaces.set(parsed.ownerId, parsed);
          this.persistRecord(parsed);
        }
      } catch {
        // ignore malformed persisted records; operator cleanup can handle them later
      }
    }
  }

  private normalizeRecord(record: ProvisionedSpace): ProvisionedSpace {
    return {
      ...record,
      endpoint: this.stationEndpoint,
    };
  }

  private refreshRecord(record: ProvisionedSpace, jwkThumb: string): ProvisionedSpace {
    const normalized = this.normalizeRecord(record);
    return {
      ...normalized,
      stationToken: issueSpaceToken({
        issuer: this.issuer,
        subject: normalized.ownerId,
        audience: normalized.audience,
        spaceId: normalized.spaceId,
        jwkThumb,
        secret: this.authSecret,
      }),
    };
  }

  private persistRecord(record: ProvisionedSpace): void {
    const dir = join(this.baseDir, record.spaceId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'space.json'), JSON.stringify(record, null, 2) + '\n', 'utf8');
  }
}
