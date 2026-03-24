import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

export interface EnrolledBinding {
  handle: string;
  jwkThumbprint: string;
  updatedAt: number;
}

export class HeadwatersEnrollmentRegistry {
  constructor(private readonly registryPath: string) {}

  private load(): Record<string, EnrolledBinding> {
    if (!existsSync(this.registryPath)) {
      return {};
    }
    return JSON.parse(readFileSync(this.registryPath, 'utf8')) as Record<string, EnrolledBinding>;
  }

  private save(bindings: Record<string, EnrolledBinding>): void {
    mkdirSync(dirname(this.registryPath), { recursive: true });
    writeFileSync(this.registryPath, JSON.stringify(bindings, null, 2) + '\n', 'utf8');
  }

  remember(handle: string, jwkThumbprint: string): EnrolledBinding {
    const bindings = this.load();
    const binding: EnrolledBinding = {
      handle,
      jwkThumbprint,
      updatedAt: Date.now(),
    };
    bindings[handle] = binding;
    this.save(bindings);
    return binding;
  }

  get(handle: string): EnrolledBinding | null {
    return this.load()[handle] ?? null;
  }
}
