/**
 * PromiseLog — SQLite-backed ITP message log with materialized state.
 *
 * The shared coordination medium between CLI and agent.
 * Append-only message log + transactionally-updated promise_state table.
 */

import Database from 'better-sqlite3';
import { createHmac, randomBytes } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { nextState } from '../itp/protocol.ts';
import type { ITPMessage, PromiseState } from '../itp/types.ts';

export const DEFAULT_DB_DIR = join(homedir(), '.differ', 'loop');
export const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'promise-log.db');
export const HMAC_KEY_PATH = join(DEFAULT_DB_DIR, '.hmac-key');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,
  promise_id TEXT NOT NULL,
  parent_id  TEXT,
  sender_id  TEXT NOT NULL,
  timestamp  INTEGER NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}',
  hmac       TEXT,
  CHECK (type IN ('INTENT','PROMISE','ACCEPT','DECLINE','COMPLETE','ASSESS','REVISE','RELEASE'))
);

CREATE INDEX IF NOT EXISTS idx_messages_promise ON messages(promise_id);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);

CREATE TABLE IF NOT EXISTS promise_state (
  promise_id    TEXT PRIMARY KEY,
  current_state TEXT NOT NULL DEFAULT 'PENDING',
  sender_id     TEXT NOT NULL,
  content       TEXT,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promise_state_state ON promise_state(current_state);
`;

export interface StoredMessage extends ITPMessage {
  seq: number;
  hmac?: string;
}

export class PromiseLog {
  private db: Database.Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(SCHEMA);
  }

  /** Append a message and update materialized state in a single transaction */
  post(msg: ITPMessage, hmac?: string): void {
    const txn = this.db.transaction(() => {
      // Insert message
      this.db.prepare(`
        INSERT INTO messages (type, promise_id, parent_id, sender_id, timestamp, payload, hmac)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        msg.type,
        msg.promiseId,
        msg.parentId ?? null,
        msg.senderId,
        msg.timestamp,
        JSON.stringify(msg.payload),
        hmac ?? null,
      );

      // Update materialized state
      if (msg.type === 'INTENT') {
        this.db.prepare(`
          INSERT INTO promise_state (promise_id, current_state, sender_id, content, updated_at)
          VALUES (?, 'PENDING', ?, ?, ?)
        `).run(msg.promiseId, msg.senderId, msg.payload.content ?? '', msg.timestamp);
      } else if (msg.type === 'REVISE') {
        // REVISE creates a new promise (with new promiseId) and closes the parent
        if (msg.parentId) {
          this.db.prepare(`
            UPDATE promise_state SET current_state = 'REVISED', updated_at = ? WHERE promise_id = ?
          `).run(msg.timestamp, msg.parentId);
        }
        // New promise from the revised content — starts as PROMISED (agent re-promises)
        this.db.prepare(`
          INSERT INTO promise_state (promise_id, current_state, sender_id, content, updated_at)
          VALUES (?, 'PROMISED', ?, ?, ?)
        `).run(msg.promiseId, msg.senderId, msg.payload.revisedContent ?? '', msg.timestamp);
      } else {
        // All other messages update an existing promise
        const row = this.db.prepare(
          `SELECT current_state FROM promise_state WHERE promise_id = ?`
        ).get(msg.promiseId) as { current_state: PromiseState } | undefined;

        if (row) {
          const next = nextState(row.current_state, msg);
          if (next) {
            this.db.prepare(`
              UPDATE promise_state SET current_state = ?, updated_at = ? WHERE promise_id = ?
            `).run(next, msg.timestamp, msg.promiseId);
          }
        }
      }
    });

    txn();
  }

  /** Get all messages for a promise (ordered by seq) */
  getMessages(promiseId: string): StoredMessage[] {
    const rows = this.db.prepare(
      `SELECT * FROM messages WHERE promise_id = ? ORDER BY seq`
    ).all(promiseId) as Array<Record<string, unknown>>;
    return rows.map(rowToMessage);
  }

  /** Get unpromised intents — O(1) via materialized state */
  getUnpromisedIntents(): StoredMessage[] {
    const rows = this.db.prepare(`
      SELECT m.* FROM messages m
      JOIN promise_state ps ON m.promise_id = ps.promise_id
      WHERE ps.current_state = 'PENDING' AND m.type = 'INTENT'
      ORDER BY m.seq
    `).all() as Array<Record<string, unknown>>;
    return rows.map(rowToMessage);
  }

  /** Resolve a prefix to a full promise ID. Returns null if no match, throws if ambiguous. */
  resolvePromiseId(prefix: string): string | null {
    const rows = this.db.prepare(
      `SELECT promise_id FROM promise_state WHERE promise_id LIKE ? || '%'`
    ).all(prefix) as Array<{ promise_id: string }>;

    if (rows.length === 0) return null;
    if (rows.length === 1) return rows[0].promise_id;
    const exact = rows.find(r => r.promise_id === prefix);
    if (exact) return exact.promise_id;
    throw new Error(`Ambiguous prefix "${prefix}" matches ${rows.length} promises: ${rows.map(r => r.promise_id.slice(0, 12)).join(', ')}`);
  }

  /** Get the current state of a promise */
  getPromiseState(promiseId: string): { promiseId: string; state: PromiseState; senderId: string; content: string | null } | null {
    const row = this.db.prepare(
      `SELECT promise_id, current_state, sender_id, content FROM promise_state WHERE promise_id = ?`
    ).get(promiseId) as { promise_id: string; current_state: PromiseState; sender_id: string; content: string | null } | undefined;

    if (!row) return null;
    return { promiseId: row.promise_id, state: row.current_state, senderId: row.sender_id, content: row.content };
  }

  /** Get all non-terminal promises (for status display) */
  getAllPromises(): Array<{ promiseId: string; state: PromiseState; senderId: string; content: string | null }> {
    const rows = this.db.prepare(
      `SELECT promise_id, current_state, sender_id, content FROM promise_state ORDER BY updated_at DESC`
    ).all() as Array<{ promise_id: string; current_state: PromiseState; sender_id: string; content: string | null }>;

    return rows.map(r => ({ promiseId: r.promise_id, state: r.current_state, senderId: r.sender_id, content: r.content }));
  }

  /** Get the active (in-progress) promise for a given agent identity */
  getActivePromiseForAgent(agentId: string): { promiseId: string; state: PromiseState; content: string | null } | null {
    // Look for promises where the agent has made a PROMISE message and state is non-terminal
    const row = this.db.prepare(`
      SELECT ps.promise_id, ps.current_state, ps.content
      FROM promise_state ps
      WHERE ps.current_state IN ('PROMISED', 'ACCEPTED', 'COMPLETED')
        AND EXISTS (
          SELECT 1 FROM messages m
          WHERE m.promise_id = ps.promise_id AND m.type = 'PROMISE' AND m.sender_id = ?
        )
      ORDER BY ps.updated_at DESC
      LIMIT 1
    `).get(agentId) as { promise_id: string; current_state: PromiseState; content: string | null } | undefined;

    if (!row) return null;
    return { promiseId: row.promise_id, state: row.current_state, content: row.content };
  }

  /** Get messages since a sequence number (for polling) */
  getMessagesSince(seq: number): StoredMessage[] {
    const rows = this.db.prepare(
      `SELECT * FROM messages WHERE seq > ? ORDER BY seq`
    ).all(seq) as Array<Record<string, unknown>>;
    return rows.map(rowToMessage);
  }

  /** Get the latest seq number */
  getLatestSeq(): number {
    const row = this.db.prepare(`SELECT MAX(seq) as max_seq FROM messages`).get() as { max_seq: number | null };
    return row.max_seq ?? 0;
  }

  /** Verify HMAC signature on a message */
  verifyHmac(msg: ITPMessage, hmac: string): boolean {
    const key = loadHmacKey();
    if (!key) return false;
    const expected = computeHmac(key, msg);
    return hmac === expected;
  }

  close(): void {
    this.db.close();
  }
}

// ============ HMAC Utilities ============

/** Generate and store a new HMAC key */
export function generateHmacKey(): void {
  mkdirSync(DEFAULT_DB_DIR, { recursive: true });
  const key = randomBytes(32).toString('hex');
  writeFileSync(HMAC_KEY_PATH, key, { mode: 0o600 });
}

/** Load the HMAC key from disk */
export function loadHmacKey(): string | null {
  if (!existsSync(HMAC_KEY_PATH)) return null;
  return readFileSync(HMAC_KEY_PATH, 'utf-8').trim();
}

/** Compute HMAC-SHA256 for a message */
export function computeHmac(key: string, msg: ITPMessage): string {
  const data = `${msg.type}:${msg.promiseId}:${msg.timestamp}:${msg.senderId}`;
  return createHmac('sha256', key).update(data).digest('hex');
}

/** Sign a message with the HMAC key (returns signature or null if no key) */
export function signMessage(msg: ITPMessage): string | null {
  const key = loadHmacKey();
  if (!key) return null;
  return computeHmac(key, msg);
}

// ============ Row Conversion ============

function rowToMessage(row: Record<string, unknown>): StoredMessage {
  return {
    seq: row.seq as number,
    type: row.type as ITPMessage['type'],
    promiseId: row.promise_id as string,
    parentId: (row.parent_id as string) ?? undefined,
    senderId: row.sender_id as string,
    timestamp: row.timestamp as number,
    payload: JSON.parse(row.payload as string),
    hmac: (row.hmac as string) ?? undefined,
  };
}
