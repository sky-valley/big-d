/**
 * IntentStore — SQLite persistence for the intent space.
 *
 * One table, one compound index. Append-only.
 * Intents never transition, never close, never get deleted.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import type { ITPMessage } from '@differ/itp/src/types.ts';
import type { StoredIntent } from './types.ts';

export const DEFAULT_DB_DIR = process.env.DIFFER_INTENT_SPACE_DIR ?? join(homedir(), '.differ', 'intent-space');
export const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'intent-space.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS intents (
  intent_id   TEXT PRIMARY KEY,
  parent_id   TEXT NOT NULL DEFAULT 'root',
  sender_id   TEXT NOT NULL,
  payload     TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  timestamp   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intents_parent_seq ON intents(parent_id, seq);
`;

function rowToIntent(row: Record<string, unknown>): StoredIntent {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(row.payload as string); } catch { /* ignore */ }
  return {
    intentId: row.intent_id as string,
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
    const row = this.db.prepare('SELECT MAX(seq) AS max_seq FROM intents').get() as { max_seq: number | null } | undefined;
    this._seq = row?.max_seq ?? 0;
  }

  get latestSeq(): number {
    return this._seq;
  }

  /**
   * Persist an INTENT message. Returns the assigned seq.
   * Idempotent: duplicate intentId returns the existing seq.
   */
  post(msg: ITPMessage): number {
    if (msg.type !== 'INTENT') {
      throw new Error(`Intent space only accepts INTENT messages, got: ${msg.type}`);
    }
    if (!msg.intentId) {
      throw new Error('INTENT message must have an intentId');
    }

    // Idempotent: check for existing
    const existing = this.db.prepare('SELECT seq FROM intents WHERE intent_id = ?').get(msg.intentId) as { seq: number } | undefined;
    if (existing) return existing.seq;

    this._seq += 1;
    const seq = this._seq;

    this.db.prepare(`
      INSERT INTO intents (intent_id, parent_id, sender_id, payload, seq, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      msg.intentId,
      msg.parentId ?? 'root',
      msg.senderId,
      JSON.stringify(msg.payload),
      seq,
      msg.timestamp,
    );

    return seq;
  }

  /** Scan a space: intents with parentId = spaceId and seq > since. */
  scan(spaceId: string, since: number = 0): StoredIntent[] {
    const rows = this.db.prepare(
      'SELECT * FROM intents WHERE parent_id = ? AND seq > ? ORDER BY seq ASC',
    ).all(spaceId, since) as Array<Record<string, unknown>>;
    return rows.map(rowToIntent);
  }

  /** Check if an intent exists. */
  has(intentId: string): boolean {
    return this.db.prepare('SELECT 1 FROM intents WHERE intent_id = ?').get(intentId) !== undefined;
  }

  /** Get a single intent by ID. */
  get(intentId: string): StoredIntent | undefined {
    const row = this.db.prepare('SELECT * FROM intents WHERE intent_id = ?').get(intentId) as Record<string, unknown> | undefined;
    return row ? rowToIntent(row) : undefined;
  }

  close(): void {
    this.db.close();
  }
}
