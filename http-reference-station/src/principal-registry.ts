import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

export interface StationPrincipalRecord {
  principalId: string;
  handle: string;
  jwkThumbprint: string;
  createdAt: number;
  updatedAt: number;
}

interface PersistedPrincipalRegistry {
  records: StationPrincipalRecord[];
}

export class StationPrincipalRegistry {
  constructor(
    private readonly registryPath: string,
    private readonly principalPrefix: string,
  ) {}

  issue(handle: string, jwkThumbprint: string): StationPrincipalRecord {
    const persisted = this.load();
    const now = Date.now();
    const existing = persisted.records.find((record) => record.jwkThumbprint === jwkThumbprint);
    if (existing) {
      existing.handle = handle;
      existing.updatedAt = now;
      this.save(persisted);
      return existing;
    }

    const record: StationPrincipalRecord = {
      principalId: `${this.principalPrefix}_${randomUUID().replace(/-/g, '')}`,
      handle,
      jwkThumbprint,
      createdAt: now,
      updatedAt: now,
    };
    persisted.records.push(record);
    this.save(persisted);
    return record;
  }

  private load(): PersistedPrincipalRegistry {
    if (!existsSync(this.registryPath)) {
      return { records: [] };
    }
    const parsed = JSON.parse(readFileSync(this.registryPath, 'utf8')) as PersistedPrincipalRegistry;
    if (!Array.isArray(parsed.records)) {
      return { records: [] };
    }
    return parsed;
  }

  private save(value: PersistedPrincipalRegistry): void {
    mkdirSync(dirname(this.registryPath), { recursive: true });
    writeFileSync(this.registryPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  }
}
