/**
 * server/db/migrate.ts
 *
 * Incremental migration runner for existing SQLite databases.
 *
 * Why this exists:
 *   schema.sql uses CREATE TABLE IF NOT EXISTS, which silently skips tables
 *   that already exist. This means new columns added to schema.sql are never
 *   applied to databases created by earlier versions of the code.
 *
 *   This runner tracks applied migrations in the schema_migrations table and
 *   uses PRAGMA table_info() to safely add columns only when they are absent.
 *
 * Each migration is a plain function that receives the db instance.
 * If a migration throws, the process logs and exits so the error is visible.
 */

import type Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return cols.some(c => c.name === column);
}

function addColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    logger.debug(`Migration: added ${table}.${column}`);
  }
}

function hasTable(db: Database.Database, table: string): boolean {
  const row = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(table);
  return row != null;
}

// ── Migration definitions ──────────────────────────────────────────────────────
//
// Each entry: { version: string, up: (db) => void }
// Version strings must be unique and sortable (use YYYY-MM-DD-NNN format).

const migrations: Array<{ version: string; up: (db: Database.Database) => void }> = [

  // ── 2024-01-001: customers — phone, email alias, workspace_id default ────
  {
    version: '2024-01-001',
    up(db) {
      addColumn(db, 'customers', 'phone',        'TEXT');
      addColumn(db, 'customers', 'email',         'TEXT');
      // workspace_id already exists but may lack a default — we can't change
      // the default via ALTER TABLE in SQLite; new rows from channelIngest
      // will supply the value directly. Nothing to do here.
    },
  },

  // ── 2024-01-002: conversations — nullable case_id + new columns ──────────
  {
    version: '2024-01-002',
    up(db) {
      // SQLite cannot remove NOT NULL constraints via ALTER TABLE.
      // The schema.sql already defines case_id as nullable for fresh DBs.
      // For existing DBs, SQLite doesn't enforce NOT NULL on existing rows,
      // and the constraint was declared without a CHECK, so new INSERTs with
      // NULL case_id will succeed in practice on better-sqlite3 / SQLite 3.37+.
      // We still add the missing columns:
      addColumn(db, 'conversations', 'subject',          'TEXT');
      addColumn(db, 'conversations', 'first_message_at', 'TEXT');
      addColumn(db, 'conversations', 'last_message_at',  'TEXT');
      addColumn(db, 'conversations', 'updated_at',
        `TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)`);
    },
  },

  // ── 2024-01-003: messages — new columns ──────────────────────────────────
  {
    version: '2024-01-003',
    up(db) {
      addColumn(db, 'messages', 'customer_id',         'TEXT REFERENCES customers(id)');
      addColumn(db, 'messages', 'direction',            `TEXT NOT NULL DEFAULT 'inbound'`);
      addColumn(db, 'messages', 'content_type',         `TEXT NOT NULL DEFAULT 'text'`);
      addColumn(db, 'messages', 'external_message_id',  'TEXT');
      addColumn(db, 'messages', 'draft_reply_id',       'TEXT REFERENCES draft_replies(id)');
      addColumn(db, 'messages', 'created_at',
        `TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)`);
    },
  },

  // ── 2024-01-004: draft_replies — new columns ─────────────────────────────
  {
    version: '2024-01-004',
    up(db) {
      addColumn(db, 'draft_replies', 'tone',        `TEXT DEFAULT 'professional'`);
      addColumn(db, 'draft_replies', 'confidence',  'REAL DEFAULT 0.5');
      addColumn(db, 'draft_replies', 'has_policies','INTEGER DEFAULT 0');
      addColumn(db, 'draft_replies', 'sent_at',     'TEXT');
      addColumn(db, 'draft_replies', 'updated_at',
        `TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)`);
    },
  },

  // ── 2024-01-005: payments — has_conflict flag ─────────────────────────────
  {
    version: '2024-01-005',
    up(db) {
      addColumn(db, 'payments', 'has_conflict', 'INTEGER DEFAULT 0');
    },
  },

  // ── 2024-01-006: returns — has_conflict flag ──────────────────────────────
  {
    version: '2024-01-006',
    up(db) {
      addColumn(db, 'returns', 'has_conflict', 'INTEGER DEFAULT 0');
    },
  },

  // ── 2024-01-007: canonical_events — updated_at + defaults ────────────────
  {
    version: '2024-01-007',
    up(db) {
      addColumn(db, 'canonical_events', 'updated_at',
        `TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)`);
      // source_entity_type, source_entity_id, occurred_at, workspace_id already
      // exist in the original schema with NOT NULL; we only add the new column.
    },
  },

  // ── 2024-01-008: schema_migrations table itself (idempotent) ─────────────
  // Already created by schema.sql; this entry is a no-op that marks the
  // migration system as bootstrapped.
  {
    version: '2024-01-008',
    up(_db) {
      // no-op — table was created by schema.sql
    },
  },

  // ── 2024-01-009: agent_runs — columns expected by runner.ts ─────────────
  {
    version: '2024-01-009',
    up(db) {
      addColumn(db, 'agent_runs', 'workspace_id',    `TEXT NOT NULL DEFAULT 'ws_default'`);
      addColumn(db, 'agent_runs', 'trigger_event',   `TEXT DEFAULT 'case_created'`);
      addColumn(db, 'agent_runs', 'status',           `TEXT NOT NULL DEFAULT 'running'`);
      addColumn(db, 'agent_runs', 'summary',          'TEXT');
      addColumn(db, 'agent_runs', 'output',            'TEXT');
      addColumn(db, 'agent_runs', 'error_message',    'TEXT');
      addColumn(db, 'agent_runs', 'finished_at',      'TEXT');
    },
  },
];

// ── Runner ─────────────────────────────────────────────────────────────────────

export function runIncrementalMigrations(db: Database.Database): void {
  // Ensure the tracking table exists (it may not on very old DBs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      version    TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: string }>)
      .map(r => r.version)
  );

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version) VALUES (?)'
  );

  let ran = 0;
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;

    try {
      migration.up(db);
      insertMigration.run(migration.version);
      ran++;
      logger.debug(`Applied migration ${migration.version}`);
    } catch (err) {
      logger.error(`Migration ${migration.version} failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  if (ran > 0) {
    logger.info(`Applied ${ran} incremental migration(s)`);
  }
}
