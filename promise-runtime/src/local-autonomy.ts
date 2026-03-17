import { randomUUID } from 'crypto';
import type {
  AssessmentValue,
  AuthorityRef,
  DesireRef,
  JsonDict,
  LocalAutonomyAdapter,
} from './types.ts';

interface PromiseRecord extends AuthorityRef {
  threadId: string;
}

interface DesireRecord extends DesireRef {
  threadId: string;
}

export class InMemoryLocalAutonomyAdapter implements LocalAutonomyAdapter {
  private readonly promiseRefs = new Map<string, PromiseRecord[]>();
  private readonly desireRefs = new Map<string, DesireRecord[]>();
  private readonly ownedPromiseIds = new Map<string, string>();

  constructor(private readonly ownerId: string) {}

  recordIntent(threadId: string, content: string, payload: JsonDict): DesireRef[] {
    return this.appendDesire(threadId, {
      summary: summarize(content, payload),
      status: 'active',
    });
  }

  recordPromise(threadId: string, content: string, promiseId: string | undefined, payload: JsonDict): AuthorityRef[] {
    const resolvedPromiseId = promiseId ?? randomUUID();
    this.ownedPromiseIds.set(threadId, resolvedPromiseId);
    return this.appendAuthority(threadId, {
      promiseId: resolvedPromiseId,
      summary: summarize(content, payload),
      status: 'open',
    });
  }

  recordDecline(threadId: string, reason: string, payload: JsonDict): AuthorityRef[] {
    return this.appendAuthority(threadId, {
      promiseId: this.ownedPromiseIds.get(threadId) ?? `decline:${threadId}`,
      summary: summarize(reason, payload),
      status: 'broken',
    });
  }

  recordAccept(threadId: string, promiseId: string): AuthorityRef[] {
    return this.appendAuthority(threadId, {
      promiseId,
      summary: `Accepted promise ${promiseId}`,
      status: 'open',
    });
  }

  recordAssess(
    threadId: string,
    promiseId: string,
    assessment: AssessmentValue,
    payload: JsonDict,
  ): AuthorityRef[] {
    return this.appendAuthority(threadId, {
      promiseId,
      summary: summarize(`Assessed ${assessment}`, payload),
      status: assessment === 'BROKEN' ? 'broken' : 'assessed',
    });
  }

  recordComplete(threadId: string, promiseId: string, summary: string, payload: JsonDict): AuthorityRef[] {
    return this.appendAuthority(threadId, {
      promiseId,
      summary: summarize(summary, payload),
      status: 'completed',
    });
  }

  recordDesireRevision(threadId: string, content: string, payload: JsonDict): DesireRef[] {
    return this.appendDesire(threadId, {
      summary: summarize(content, payload),
      status: 'revised',
    });
  }

  recordPromiseRevision(
    threadId: string,
    promiseId: string,
    content: string,
    payload: JsonDict,
  ): AuthorityRef[] {
    this.ownedPromiseIds.set(threadId, promiseId);
    return this.appendAuthority(threadId, {
      promiseId,
      summary: summarize(content, payload),
      status: 'open',
    });
  }

  readThreadDesire(threadId: string): DesireRef[] {
    return [...(this.desireRefs.get(threadId) ?? [])];
  }

  readThreadAuthority(threadId: string): AuthorityRef[] {
    return [...(this.promiseRefs.get(threadId) ?? [])];
  }

  private appendDesire(
    threadId: string,
    attrs: Pick<DesireRecord, 'summary' | 'status'>,
  ): DesireRef[] {
    const next: DesireRecord = {
      threadId,
      recordId: randomUUID(),
      desireId: randomUUID(),
      ownerId: this.ownerId,
      summary: attrs.summary,
      status: attrs.status,
    };
    const records = this.desireRefs.get(threadId) ?? [];
    records.push(next);
    this.desireRefs.set(threadId, records);
    return [next];
  }

  private appendAuthority(
    threadId: string,
    attrs: Pick<PromiseRecord, 'promiseId' | 'summary' | 'status'>,
  ): AuthorityRef[] {
    const next: PromiseRecord = {
      threadId,
      recordId: randomUUID(),
      ownerId: this.ownerId,
      promiseId: attrs.promiseId,
      summary: attrs.summary,
      status: attrs.status,
    };
    const records = this.promiseRefs.get(threadId) ?? [];
    records.push(next);
    this.promiseRefs.set(threadId, records);
    return [next];
  }
}

function summarize(content: string, payload: JsonDict): string {
  const detail = typeof payload.content === 'string' ? payload.content : undefined;
  return detail && detail !== content ? `${content} (${detail})` : content;
}
