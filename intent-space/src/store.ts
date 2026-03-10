/**
 * IntentStore — SQLite persistence for the intent space.
 *
 * One table, one compound index. Append-only.
 * The space stores messages for visibility; it does not evaluate promise state.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import type { ITPMessage } from '@differ/itp/src/types.ts';
import type { StoredMessage } from './types.ts';

export const DEFAULT_DB_DIR = process.env.DIFFER_INTENT_SPACE_DIR ?? join(homedir(), '.differ', 'intent-space');
export const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'intent-space.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,
  message_id  TEXT,
  parent_id   TEXT NOT NULL DEFAULT 'root',
  sender_id   TEXT NOT NULL,
  payload     TEXT NOT NULL,
  timestamp   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_parent_seq ON messages(parent_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_intent_id
  ON messages(message_id) WHERE type = 'INTENT';
`;

function rowToMessage(row: Record<string, unknown>): StoredMessage {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(row.payload as string); } catch { /* ignore */ }
  return {
    type: row.type as string,
    intentId: row.type === 'INTENT' || row.type === 'DECLINE'
      ? (row.message_id as string | undefined)
      : undefined,
    promiseId: row.type !== 'INTENT' && row.type !== 'DECLINE'
      ? (row.message_id as string | undefined)
      : undefined,
    parentId: row.parent_id as string,
    senderId: row.sender_id as string,
    payload,
    seq: row.seq as number,
    timestamp: row.timestamp as number,
  };
}

export class IntentStore {
  private db: Database.Database;
  private _seq: number;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(SCHEMA);

    // Initialize seq from existing data
    const row = this.db.prepare('SELECT MAX(seq) AS max_seq FROM messages').get() as { max_seq: number | null } | undefined;
    this._seq = row?.max_seq ?? 0;
  }

  get latestSeq(): number {
    return this._seq;
  }

  /** Persist a message. INTENT posts are idempotent; non-INTENT posts are append-only. */
  post(msg: ITPMessage): number {
    const messageId = msg.type === 'INTENT' || msg.type === 'DECLINE'
      ? msg.intentId
      : msg.promiseId;

    if (msg.type === 'INTENT' && !msg.intentId) {
      throw new Error('INTENT message must have an intentId');
    }

    if (msg.type === 'INTENT') {
      const existing = this.db.prepare(
        'SELECT seq FROM messages WHERE type = ? AND message_id = ?',
      ).get('INTENT', msg.intentId) as { seq: number } | undefined;
      if (existing) return existing.seq;
    }

    this._seq += 1;
    const seq = this._seq;

    this.db.prepare(`
      INSERT INTO messages (seq, type, message_id, parent_id, sender_id, payload, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      seq,
      msg.type,
      messageId ?? null,
      msg.parentId ?? 'root',
      msg.senderId,
      JSON.stringify(msg.payload),
      msg.timestamp,
    );

    return seq;
  }

  /** Scan a space: messages with parentId = spaceId and seq > since. */
  scan(spaceId: string, since: number = 0): StoredMessage[] {
    const rows = this.db.prepare(
      'SELECT * FROM messages WHERE parent_id = ? AND seq > ? ORDER BY seq ASC',
    ).all(spaceId, since) as Array<Record<string, unknown>>;
    return rows.map(rowToMessage);
  }

  /** Check if an INTENT exists. */
  has(intentId: string): boolean {
    return this.db.prepare(
      'SELECT 1 FROM messages WHERE type = ? AND message_id = ?',
    ).get('INTENT', intentId) !== undefined;
  }

  /** Get a single INTENT by ID. */
  get(intentId: string): StoredMessage | undefined {
    const row = this.db.prepare(
      'SELECT * FROM messages WHERE type = ? AND message_id = ?',
    ).get('INTENT', intentId) as Record<string, unknown> | undefined;
    return row ? rowToMessage(row) : undefined;
  }

  close(): void {
    this.db.close();
  }
}
