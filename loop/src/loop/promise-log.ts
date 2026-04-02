/**
 * PromiseLog — SQLite-backed ITP message log with materialized state.
 *
 * The shared coordination medium between CLI and agent(s).
 * Append-only message log + transactionally-updated materialized tables.
 *
 * Schema split (Promise Theory alignment):
 *   intents  — Immutable declarations. No state machine. Never transition.
 *   promises — Autonomous agent commitments. Each has its own lifecycle.
 *   projects — Registry of target repositories.
 *   messages — Append-only log of all ITP messages.
 */

import Database from 'better-sqlite3';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { dirname, join, basename } from 'path';
import { homedir } from 'os';
import { nextState } from '@differ/itp/src/protocol.ts';
import type { ITPMessage, PromiseState } from '@differ/itp/src/types.ts';

export const DEFAULT_DB_DIR = process.env.DIFFER_DB_DIR ?? join(homedir(), '.differ', 'loop');
export const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'promise-log.db');
export const HMAC_KEY_PATH = join(DEFAULT_DB_DIR, '.hmac-key');
export const INTENT_SOCKET_PATH = process.env.DIFFER_INTENT_SOCKET
  ?? join(homedir(), '.differ', 'tcp-reference-station', 'intent-space.sock');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS intents (
  intent_id   TEXT PRIMARY KEY,
  sender_id   TEXT NOT NULL,
  content     TEXT NOT NULL,
  criteria    TEXT,
  target_hint TEXT,
  timestamp   INTEGER NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_intents_timestamp ON intents(timestamp);

CREATE TABLE IF NOT EXISTS promises (
  promise_id    TEXT PRIMARY KEY,
  intent_id     TEXT NOT NULL REFERENCES intents(intent_id),
  parent_id     TEXT,
  agent_id      TEXT NOT NULL,
  current_state TEXT NOT NULL DEFAULT 'PROMISED',
  content       TEXT,
  target_repo   TEXT,
  updated_at    INTEGER NOT NULL,
  CHECK (current_state IN (
    'PROMISED','ACCEPTED','COMPLETED','FULFILLED','BROKEN','REVISED','RELEASED'
  ))
);

CREATE INDEX IF NOT EXISTS idx_promises_intent ON promises(intent_id);
CREATE INDEX IF NOT EXISTS idx_promises_agent ON promises(agent_id);
CREATE INDEX IF NOT EXISTS idx_promises_state ON promises(current_state);

CREATE TABLE IF NOT EXISTS projects (
  project_id    TEXT PRIMARY KEY,
  repo_path     TEXT NOT NULL UNIQUE,
  agent_id      TEXT NOT NULL,
  name          TEXT,
  mode          TEXT NOT NULL DEFAULT 'external',
  registered_at INTEGER NOT NULL,
  CHECK (mode IN ('self', 'external'))
);

CREATE TABLE IF NOT EXISTS messages (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,
  promise_id TEXT,
  intent_id  TEXT,
  parent_id  TEXT,
  sender_id  TEXT NOT NULL,
  timestamp  INTEGER NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}',
  hmac       TEXT,
  CHECK (type IN ('INTENT','PROMISE','ACCEPT','DECLINE','COMPLETE','ASSESS','REVISE','RELEASE'))
);

CREATE INDEX IF NOT EXISTS idx_messages_promise ON messages(promise_id);
CREATE INDEX IF NOT EXISTS idx_messages_intent ON messages(intent_id);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);

CREATE TABLE IF NOT EXISTS agent_cursors (
  agent_id  TEXT NOT NULL,
  space_id  TEXT NOT NULL,
  last_seq  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, space_id)
);
`;

export interface StoredMessage extends ITPMessage {
  seq: number;
  hmac?: string;
}

export interface StoredIntent {
  intentId: string;
  senderId: string;
  content: string;
  criteria?: string;
  targetHint?: string;
  timestamp: number;
}

export interface StoredPromise {
  promiseId: string;
  intentId: string;
  parentId?: string;
  agentId: string;
  state: PromiseState;
  content?: string;
  targetRepo?: string;
  updatedAt: number;
}

export interface StoredProject {
  projectId: string;
  repoPath: string;
  agentId: string;
  name?: string;
  mode: 'self' | 'external';
  registeredAt: number;
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

  // ============ Post Messages ============

  /** Append a message and update materialized state in a single transaction */
  post(msg: ITPMessage, hmac?: string): void {
    const txn = this.db.transaction(() => {
      // Insert into messages log
      this.db.prepare(`
        INSERT INTO messages (type, promise_id, intent_id, parent_id, sender_id, timestamp, payload, hmac)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        msg.type,
        msg.promiseId ?? null,
        msg.intentId ?? null,
        msg.parentId ?? null,
        msg.senderId,
        msg.timestamp,
        JSON.stringify(msg.payload),
        hmac ?? null,
      );

      // Update materialized tables
      if (msg.type === 'INTENT') {
        this.db.prepare(`
          INSERT INTO intents (intent_id, sender_id, content, criteria, target_hint, timestamp, payload)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          msg.intentId!,
          msg.senderId,
          msg.payload.content ?? '',
          msg.payload.criteria ?? null,
          msg.payload.targetRepo ?? null,
          msg.timestamp,
          JSON.stringify(msg.payload),
        );
      } else if (msg.type === 'PROMISE') {
        this.db.prepare(`
          INSERT INTO promises (promise_id, intent_id, agent_id, current_state, content, updated_at)
          VALUES (?, ?, ?, 'PROMISED', ?, ?)
        `).run(
          msg.promiseId!,
          msg.intentId!,
          msg.senderId,
          msg.payload.content ?? '',
          msg.timestamp,
        );
      } else if (msg.type === 'REVISE') {
        // REVISE closes the parent promise and creates a new one
        if (msg.parentId) {
          this.db.prepare(`
            UPDATE promises SET current_state = 'REVISED', updated_at = ? WHERE promise_id = ?
          `).run(msg.timestamp, msg.parentId);
        }
        this.db.prepare(`
          INSERT INTO promises (promise_id, intent_id, parent_id, agent_id, current_state, content, updated_at)
          VALUES (?, ?, ?, ?, 'PROMISED', ?, ?)
        `).run(
          msg.promiseId!,
          msg.intentId!,
          msg.parentId ?? null,
          msg.senderId,
          msg.payload.revisedContent ?? '',
          msg.timestamp,
        );
      } else if (msg.type === 'DECLINE') {
        // DECLINE does NOT create a promise entity — it is message-log-only.
        // No materialized state update needed.
      } else {
        // ACCEPT, COMPLETE, ASSESS, RELEASE — update existing promise
        const row = this.db.prepare(
          `SELECT current_state FROM promises WHERE promise_id = ?`
        ).get(msg.promiseId!) as { current_state: PromiseState } | undefined;

        if (row) {
          const next = nextState(row.current_state, msg);
          if (next) {
            this.db.prepare(`
              UPDATE promises SET current_state = ?, updated_at = ? WHERE promise_id = ?
            `).run(next, msg.timestamp, msg.promiseId!);
          }
        }
      }
    });

    txn();
  }

  // ============ Intent Mirroring ============

  /** Insert an intent record if it doesn't already exist.
   *  Used by the agent to mirror intents from the intent space before promising. */
  ensureIntent(record: { intentId: string; senderId: string; content: string; criteria?: string; targetHint?: string; timestamp: number }): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO intents (intent_id, sender_id, content, criteria, target_hint, timestamp, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.intentId, record.senderId, record.content,
      record.criteria ?? null, record.targetHint ?? null,
      record.timestamp, JSON.stringify(record),
    );
  }

  /** Check if any promise for this intent has reached FULFILLED. */
  isIntentFulfilled(intentId: string): boolean {
    const row = this.db.prepare(
      `SELECT 1 FROM promises WHERE intent_id = ? AND current_state = 'FULFILLED' LIMIT 1`
    ).get(intentId);
    return !!row;
  }

  // ============ Intent Queries ============

  /** Get intents that have no FULFILLED promise (open for work) */
  getOpenIntents(): StoredIntent[] {
    const rows = this.db.prepare(`
      SELECT i.* FROM intents i
      WHERE NOT EXISTS (
        SELECT 1 FROM promises p
        WHERE p.intent_id = i.intent_id AND p.current_state = 'FULFILLED'
      )
      ORDER BY i.timestamp
    `).all() as Array<Record<string, unknown>>;
    return rows.map(rowToIntent);
  }

  /** Get all intents */
  getAllIntents(): StoredIntent[] {
    const rows = this.db.prepare(
      `SELECT * FROM intents ORDER BY timestamp DESC`
    ).all() as Array<Record<string, unknown>>;
    return rows.map(rowToIntent);
  }

  // ============ Promise Queries ============

  /** Get the current state of a promise */
  getPromiseState(promiseId: string): StoredPromise | null {
    const row = this.db.prepare(
      `SELECT * FROM promises WHERE promise_id = ?`
    ).get(promiseId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return rowToPromise(row);
  }

  /** Get all promises for a given intent */
  getPromisesForIntent(intentId: string): StoredPromise[] {
    const rows = this.db.prepare(
      `SELECT * FROM promises WHERE intent_id = ? ORDER BY updated_at DESC`
    ).all(intentId) as Array<Record<string, unknown>>;
    return rows.map(rowToPromise);
  }

  /** Get all non-terminal promises */
  getAllPromises(): StoredPromise[] {
    const rows = this.db.prepare(
      `SELECT * FROM promises ORDER BY updated_at DESC`
    ).all() as Array<Record<string, unknown>>;
    return rows.map(rowToPromise);
  }

  /** Get the active (in-progress) promise for a given agent identity */
  getActivePromiseForAgent(agentId: string): StoredPromise | null {
    const row = this.db.prepare(`
      SELECT * FROM promises
      WHERE agent_id = ? AND current_state IN ('PROMISED', 'ACCEPTED', 'COMPLETED')
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(agentId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return rowToPromise(row);
  }

  /** Resolve a prefix to a full promise ID */
  resolvePromiseId(prefix: string): string | null {
    const rows = this.db.prepare(
      `SELECT promise_id FROM promises WHERE promise_id LIKE ? || '%'`
    ).all(prefix) as Array<{ promise_id: string }>;

    if (rows.length === 0) return null;
    if (rows.length === 1) return rows[0].promise_id;
    const exact = rows.find(r => r.promise_id === prefix);
    if (exact) return exact.promise_id;
    throw new Error(`Ambiguous prefix "${prefix}" matches ${rows.length} promises`);
  }

  /** Resolve a prefix to a full intent ID */
  resolveIntentId(prefix: string): string | null {
    const rows = this.db.prepare(
      `SELECT intent_id FROM intents WHERE intent_id LIKE ? || '%'`
    ).all(prefix) as Array<{ intent_id: string }>;

    if (rows.length === 0) return null;
    if (rows.length === 1) return rows[0].intent_id;
    const exact = rows.find(r => r.intent_id === prefix);
    if (exact) return exact.intent_id;
    throw new Error(`Ambiguous prefix "${prefix}" matches ${rows.length} intents`);
  }

  // ============ Message Queries ============

  /** Get all messages for a promise (ordered by seq) */
  getMessages(promiseId: string): StoredMessage[] {
    const rows = this.db.prepare(
      `SELECT * FROM messages WHERE promise_id = ? ORDER BY seq`
    ).all(promiseId) as Array<Record<string, unknown>>;
    return rows.map(rowToMessage);
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

  // ============ Project Registry ============

  /** Register a project (target repository) */
  registerProject(repoPath: string, mode: 'self' | 'external' = 'external', name?: string): StoredProject {
    const projectId = randomUUID();
    const agentId = randomUUID();
    const registeredAt = Date.now();
    const projectName = name ?? basename(repoPath);

    this.db.prepare(`
      INSERT INTO projects (project_id, repo_path, agent_id, name, mode, registered_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(projectId, repoPath, agentId, projectName, mode, registeredAt);

    return { projectId, repoPath, agentId, name: projectName, mode, registeredAt };
  }

  /** Remove a project from the registry */
  removeProject(projectId: string): void {
    this.db.prepare(`DELETE FROM projects WHERE project_id = ?`).run(projectId);
  }

  /** Get all registered projects */
  getAllProjects(): StoredProject[] {
    const rows = this.db.prepare(
      `SELECT * FROM projects ORDER BY registered_at`
    ).all() as Array<Record<string, unknown>>;
    return rows.map(rowToProject);
  }

  /** Get a project by repo path */
  getProjectByPath(repoPath: string): StoredProject | null {
    const row = this.db.prepare(
      `SELECT * FROM projects WHERE repo_path = ?`
    ).get(repoPath) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToProject(row);
  }

  /** Get a project by ID or name */
  getProject(idOrName: string): StoredProject | null {
    const row = this.db.prepare(
      `SELECT * FROM projects WHERE project_id = ? OR name = ? OR project_id LIKE ? || '%'`
    ).get(idOrName, idOrName, idOrName) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToProject(row);
  }

  // ============ Cursor Persistence ============

  /** Get the persisted cursor for an agent scanning a space. Returns 0 if not set. */
  getCursor(agentId: string, spaceId: string): number {
    const row = this.db.prepare(
      `SELECT last_seq FROM agent_cursors WHERE agent_id = ? AND space_id = ?`
    ).get(agentId, spaceId) as { last_seq: number } | undefined;
    return row?.last_seq ?? 0;
  }

  /** Persist the cursor for an agent scanning a space. */
  setCursor(agentId: string, spaceId: string, lastSeq: number): void {
    this.db.prepare(`
      INSERT INTO agent_cursors (agent_id, space_id, last_seq) VALUES (?, ?, ?)
      ON CONFLICT(agent_id, space_id) DO UPDATE SET last_seq = excluded.last_seq
    `).run(agentId, spaceId, lastSeq);
  }

  // ============ HMAC ============

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
  const id = msg.promiseId ?? msg.intentId ?? '';
  const data = `${msg.type}:${id}:${msg.timestamp}:${msg.senderId}`;
  return createHmac('sha256', key).update(data).digest('hex');
}

/** Sign a message with the HMAC key (returns signature or null if no key) */
export function signMessage(msg: ITPMessage): string | null {
  const key = loadHmacKey();
  if (!key) return null;
  return computeHmac(key, msg);
}

/** Archive the old DB (for clean schema break). Returns backup path or null. */
export function archiveOldDb(dbPath: string = DEFAULT_DB_PATH): string | null {
  if (existsSync(dbPath)) {
    const backupPath = dbPath + '.bak.' + Date.now();
    renameSync(dbPath, backupPath);
    return backupPath;
  }
  return null;
}

// ============ Row Conversion ============

function rowToMessage(row: Record<string, unknown>): StoredMessage {
  return {
    seq: row.seq as number,
    type: row.type as ITPMessage['type'],
    promiseId: (row.promise_id as string) ?? undefined,
    intentId: (row.intent_id as string) ?? undefined,
    parentId: (row.parent_id as string) ?? undefined,
    senderId: row.sender_id as string,
    timestamp: row.timestamp as number,
    payload: JSON.parse(row.payload as string),
    hmac: (row.hmac as string) ?? undefined,
  };
}

function rowToIntent(row: Record<string, unknown>): StoredIntent {
  return {
    intentId: row.intent_id as string,
    senderId: row.sender_id as string,
    content: row.content as string,
    criteria: (row.criteria as string) ?? undefined,
    targetHint: (row.target_hint as string) ?? undefined,
    timestamp: row.timestamp as number,
  };
}

function rowToPromise(row: Record<string, unknown>): StoredPromise {
  return {
    promiseId: row.promise_id as string,
    intentId: row.intent_id as string,
    parentId: (row.parent_id as string) ?? undefined,
    agentId: row.agent_id as string,
    state: row.current_state as PromiseState,
    content: (row.content as string) ?? undefined,
    targetRepo: (row.target_repo as string) ?? undefined,
    updatedAt: row.updated_at as number,
  };
}

function rowToProject(row: Record<string, unknown>): StoredProject {
  return {
    projectId: row.project_id as string,
    repoPath: row.repo_path as string,
    agentId: row.agent_id as string,
    name: (row.name as string) ?? undefined,
    mode: row.mode as 'self' | 'external',
    registeredAt: row.registered_at as number,
  };
}
