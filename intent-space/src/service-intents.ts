/**
 * Service intents — the intent space's self-description.
 *
 * On startup, the space declares what it does using its own protocol.
 * These are real ITP INTENT messages stored in the space's own log.
 * Deterministic IDs ensure idempotence across restarts.
 */

import { createIntent } from '@differ/itp/src/protocol.ts';
import type { ITPMessage } from '@differ/itp/src/types.ts';

const SERVICE_DEFS = [
  { key: 'persist',     content: 'I persist intents to durable storage' },
  { key: 'history',     content: 'I serve intent history on request' },
  { key: 'containment', content: 'I scope intents by parent space' },
] as const;

export function buildServiceIntents(agentId: string): ITPMessage[] {
  return SERVICE_DEFS.map((def) => {
    const msg = createIntent(agentId, def.content);
    msg.intentId = `${agentId}:${def.key}`;
    return msg;
  });
}
