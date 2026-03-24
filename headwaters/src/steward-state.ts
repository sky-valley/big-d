import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { HomeSpaceRequestPayload } from './contract.ts';

export interface PersistedStewardRequest {
  intentId: string;
  senderId: string;
  payload: HomeSpaceRequestPayload;
  since: number;
  promiseId?: string;
  accepted?: boolean;
}

interface PersistedStewardState {
  commonsSince: number;
  requests: Record<string, PersistedStewardRequest>;
}

function emptyState(): PersistedStewardState {
  return {
    commonsSince: 0,
    requests: {},
  };
}

export class HeadwatersStewardState {
  constructor(private readonly statePath: string) {}

  private load(): PersistedStewardState {
    if (!existsSync(this.statePath)) {
      return emptyState();
    }
    try {
      const parsed = JSON.parse(readFileSync(this.statePath, 'utf8')) as Partial<PersistedStewardState>;
      return {
        commonsSince: typeof parsed.commonsSince === 'number' ? parsed.commonsSince : 0,
        requests: parsed.requests && typeof parsed.requests === 'object'
          ? parsed.requests as Record<string, PersistedStewardRequest>
          : {},
      };
    } catch {
      return emptyState();
    }
  }

  private save(state: PersistedStewardState): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  }

  commonsSince(): number {
    return this.load().commonsSince;
  }

  updateCommonsSince(seq: number): void {
    const state = this.load();
    if (seq > state.commonsSince) {
      state.commonsSince = seq;
      this.save(state);
    }
  }

  rememberRequest(request: Omit<PersistedStewardRequest, 'since'>): PersistedStewardRequest {
    const state = this.load();
    const existing = state.requests[request.intentId];
    const persisted: PersistedStewardRequest = {
      ...request,
      since: existing?.since ?? 0,
      promiseId: existing?.promiseId,
      accepted: existing?.accepted ?? false,
    };
    state.requests[request.intentId] = persisted;
    this.save(state);
    return persisted;
  }

  request(intentId: string): PersistedStewardRequest | null {
    return this.load().requests[intentId] ?? null;
  }

  allRequests(): PersistedStewardRequest[] {
    return Object.values(this.load().requests);
  }

  updateRequestSince(intentId: string, seq: number): void {
    const state = this.load();
    const request = state.requests[intentId];
    if (!request) return;
    if (seq > request.since) {
      request.since = seq;
      state.requests[intentId] = request;
      this.save(state);
    }
  }

  setRequestPromiseId(intentId: string, promiseId: string): void {
    const state = this.load();
    const request = state.requests[intentId];
    if (!request) return;
    if (request.promiseId === promiseId) return;
    request.promiseId = promiseId;
    state.requests[intentId] = request;
    this.save(state);
  }

  markAccepted(intentId: string): void {
    const state = this.load();
    const request = state.requests[intentId];
    if (!request) return;
    if (request.accepted) return;
    request.accepted = true;
    state.requests[intentId] = request;
    this.save(state);
  }

  forgetRequest(intentId: string): void {
    const state = this.load();
    if (!(intentId in state.requests)) return;
    delete state.requests[intentId];
    this.save(state);
  }
}
