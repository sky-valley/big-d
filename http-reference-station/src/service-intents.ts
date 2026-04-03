import { createIntent } from '@differ/itp/src/protocol.ts';
import type { ITPMessage } from '@differ/itp/src/types.ts';

const SERVICE_DEFS = [
  { key: 'persist', content: 'I persist intents to durable storage' },
  { key: 'history', content: 'I serve intent history on request' },
  { key: 'containment', content: 'I scope intents by parent space' },
  { key: 'events', content: 'I persist and echo projected promise events inside intent subspaces' },
] as const;

export function buildServiceIntents(agentId: string): ITPMessage[] {
  return SERVICE_DEFS.map((def) => {
    const msg = createIntent(agentId, def.content);
    msg.intentId = `${agentId}:${def.key}`;
    return msg;
  });
}
