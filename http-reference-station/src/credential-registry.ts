import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

export interface StationCredentialRecord {
  principalId: string;
  audience: string;
  currentTokenId: string;
  updatedAt: number;
}

interface PersistedCredentialRegistry {
  records: StationCredentialRecord[];
}

export class StationCredentialRegistry {
  constructor(private readonly registryPath: string) {}

  setCurrent(principalId: string, audience: string, tokenId: string): void {
    const persisted = this.load();
    const now = Date.now();
    const existing = persisted.records.find((record) => record.principalId === principalId && record.audience === audience);
    if (existing) {
      existing.currentTokenId = tokenId;
      existing.updatedAt = now;
      this.save(persisted);
      return;
    }

    persisted.records.push({
      principalId,
      audience,
      currentTokenId: tokenId,
      updatedAt: now,
    });
    this.save(persisted);
  }

  isCurrent(principalId: string, audience: string, tokenId: string): boolean {
    const record = this.load().records.find((entry) => entry.principalId === principalId && entry.audience === audience);
    return record?.currentTokenId === tokenId;
  }

  private load(): PersistedCredentialRegistry {
    if (!existsSync(this.registryPath)) {
      return { records: [] };
    }
    const parsed = JSON.parse(readFileSync(this.registryPath, 'utf8')) as PersistedCredentialRegistry;
    if (!Array.isArray(parsed.records)) {
      return { records: [] };
    }
    return parsed;
  }

  private save(value: PersistedCredentialRegistry): void {
    mkdirSync(dirname(this.registryPath), { recursive: true });
    writeFileSync(this.registryPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  }
}
