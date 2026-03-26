import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { issueSpaceToken } from './welcome-mat.ts';

export interface HomeProvisionedSpace {
  kind: 'home';
  spaceId: string;
  ownerPrincipalId: string;
  audience: string;
  endpoint: string;
  stationToken: string;
}

export interface SharedProvisionedSpace {
  kind: 'shared';
  spaceId: string;
  participantPrincipalIds: string[];
  audience: string;
  endpoint: string;
  participantTokens: Record<string, string>;
}

export type ProvisionedSpace = HomeProvisionedSpace | SharedProvisionedSpace;

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
  private readonly homeSpacesByOwner = new Map<string, HomeProvisionedSpace>();
  private readonly spacesById = new Map<string, ProvisionedSpace>();

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
    this.homeSpacesByOwner.clear();
    this.spacesById.clear();
  }

  async provisionHomeSpace(ownerPrincipalId: string, jwkThumb: string): Promise<HomeProvisionedSpace & { created: boolean }> {
    const existing = this.homeSpacesByOwner.get(ownerPrincipalId);
    if (existing) {
      const normalized = this.refreshHomeRecord(existing, jwkThumb);
      this.homeSpacesByOwner.set(ownerPrincipalId, normalized);
      this.spacesById.set(normalized.spaceId, normalized);
      this.persistRecord(normalized);
      return { ...normalized, created: false };
    }

    this.assertCapacity();

    const spaceId = `space-${randomUUID()}`;
    const audience = `intent-space://headwaters/spaces/${spaceId}`;
    mkdirSync(join(this.baseDir, spaceId), { recursive: true });
    const stationToken = issueSpaceToken({
      issuer: this.issuer,
      principalId: ownerPrincipalId,
      audience,
      spaceId,
      jwkThumb,
      secret: this.authSecret,
    });

    const record: HomeProvisionedSpace = {
      kind: 'home',
      spaceId,
      ownerPrincipalId,
      audience,
      endpoint: this.stationEndpoint,
      stationToken,
    };

    this.persistRecord(record);
    this.homeSpacesByOwner.set(ownerPrincipalId, record);
    this.spacesById.set(record.spaceId, record);
    return { ...record, created: true };
  }

  async provisionSharedSpace(
    participantPrincipalIds: string[],
    participantJwkThumbs: Record<string, string>,
  ): Promise<SharedProvisionedSpace & { created: true }> {
    this.assertCapacity();

    const normalizedParticipants = Array.from(new Set(participantPrincipalIds));
    const spaceId = `space-${randomUUID()}`;
    const audience = `intent-space://headwaters/spaces/${spaceId}`;
    mkdirSync(join(this.baseDir, spaceId), { recursive: true });

    const participantTokens = Object.fromEntries(
      normalizedParticipants.map((principalId) => {
        const jwkThumb = participantJwkThumbs[principalId];
        if (!jwkThumb) {
          throw new Error(`Missing station binding for ${principalId}`);
        }
        return [
          principalId,
          issueSpaceToken({
            issuer: this.issuer,
            principalId,
            audience,
            spaceId,
            jwkThumb,
            secret: this.authSecret,
          }),
        ];
      }),
    );

    const record: SharedProvisionedSpace = {
      kind: 'shared',
      spaceId,
      participantPrincipalIds: normalizedParticipants,
      audience,
      endpoint: this.stationEndpoint,
      participantTokens,
    };

    this.persistRecord(record);
    this.spacesById.set(record.spaceId, record);
    return { ...record, created: true };
  }

  getSpaceById(spaceId: string): ProvisionedSpace | undefined {
    return this.spacesById.get(spaceId);
  }

  allSpaces(): ProvisionedSpace[] {
    return Array.from(this.spacesById.values());
  }

  private assertCapacity(): void {
    if (this.spacesById.size >= this.maxSpaces) {
      throw new Error(`Headwaters capacity reached (${this.maxSpaces} hosted spaces)`);
    }
  }

  private loadPersistedSpaces(): void {
    for (const entry of readdirSync(this.baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(this.baseDir, entry.name, 'space.json');
      if (!existsSync(path)) continue;
      try {
        const parsed = this.normalizeRecord(JSON.parse(readFileSync(path, 'utf8')) as ProvisionedSpace);
        if (parsed.kind === 'home') {
          this.homeSpacesByOwner.set(parsed.ownerPrincipalId, parsed);
          this.spacesById.set(parsed.spaceId, parsed);
          this.persistRecord(parsed);
          continue;
        }
        this.spacesById.set(parsed.spaceId, parsed);
        this.persistRecord(parsed);
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

  private refreshHomeRecord(record: HomeProvisionedSpace, jwkThumb: string): HomeProvisionedSpace {
    const normalized = this.normalizeRecord(record);
    return {
      ...normalized,
      stationToken: issueSpaceToken({
        issuer: this.issuer,
        principalId: normalized.ownerPrincipalId,
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
