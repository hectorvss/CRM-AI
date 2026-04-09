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

function isColumnNotNull(db: Database.Database, table: string, column: string): boolean {
  const cols = db.pragma(`table_info(${table})`) as Array<{ name: string; notnull: number }>;
  return cols.some(c => c.name === column && c.notnull === 1);
}

function addColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  if (!hasColumn(db, table, column)) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      logger.debug(`Migration: added ${table}.${column}`);
    } catch (err: any) {
      // SQLite cannot add a column whose DEFAULT is an expression such as
      // CURRENT_TIMESTAMP. In that case we degrade the definition safely,
      // add the nullable column, and backfill current timestamps so older DBs
      // can still boot and keep moving.
      if (String(err?.message || '').includes('non-constant default')) {
        const relaxedDefinition = definition
          .replace(/\s+NOT NULL\s+DEFAULT\s+\(CURRENT_TIMESTAMP\)/i, ' TEXT')
          .replace(/\s+DEFAULT\s+\(CURRENT_TIMESTAMP\)/i, '')
          .replace(/\s+NOT NULL/i, '');

        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}${relaxedDefinition.startsWith(' ') ? '' : ' '}${relaxedDefinition}`);
        db.prepare(`UPDATE ${table} SET ${column} = CURRENT_TIMESTAMP WHERE ${column} IS NULL`).run();
        logger.debug(`Migration: added ${table}.${column} with relaxed SQLite-compatible definition`);
        return;
      }
      throw err;
    }
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

  {
    version: '2026-04-08-001',
    up(db) {
      const workspace = db.prepare('SELECT id, org_id FROM workspaces LIMIT 1').get() as { id: string; org_id: string } | undefined;
      if (!workspace) return;

      const businessTables = [
        'customers',
        'cases',
        'case_status_history',
        'case_links',
        'conversations',
        'messages',
        'draft_replies',
        'internal_notes',
        'orders',
        'order_events',
        'payments',
        'returns',
        'return_events',
        'reconciliation_issues',
        'approval_requests',
        'execution_plans',
        'tool_action_attempts',
        'workflow_runs',
        'knowledge_domains',
        'knowledge_articles',
        'connectors',
        'canonical_events',
        'agents',
        'agent_runs',
        'audit_events',
        'jobs',
      ];

      businessTables.forEach(table => {
        if (!hasTable(db, table) || !hasColumn(db, table, 'tenant_id')) return;
        db.prepare(`UPDATE ${table} SET tenant_id = ? WHERE tenant_id = 'tenant_default'`).run(workspace.org_id);
      });
    },
  },
  {
    version: '2026-04-08-002',
    up(db) {
      addColumn(db, 'agents', 'updated_at', `TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)`);
      db.prepare('UPDATE agents SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL').run();
    },
  },
  {
    version: '2026-04-08-003',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS case_knowledge_links (
          id TEXT PRIMARY KEY,
          case_id TEXT NOT NULL REFERENCES cases(id),
          article_id TEXT NOT NULL REFERENCES knowledge_articles(id),
          tenant_id TEXT NOT NULL,
          relevance_score REAL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          UNIQUE(case_id, article_id)
        )
      `);
    },
  },
  {
    version: '2026-04-09-001',
    up(db) {
      addColumn(db, 'linked_identities', 'tenant_id', 'TEXT');
      addColumn(db, 'linked_identities', 'workspace_id', 'TEXT');
      addColumn(db, 'linked_identities', 'verified_at', 'TEXT');

      const workspace = db.prepare('SELECT id, org_id FROM workspaces LIMIT 1').get() as { id: string; org_id: string } | undefined;
      if (workspace) {
        db.prepare('UPDATE linked_identities SET tenant_id = COALESCE(tenant_id, ?)').run(workspace.org_id);
        db.prepare('UPDATE linked_identities SET workspace_id = COALESCE(workspace_id, ?)').run(workspace.id);
      }
      db.prepare('UPDATE linked_identities SET verified_at = COALESCE(verified_at, created_at) WHERE verified = 1').run();
    },
  },
  {
    version: '2026-04-09-002',
    up(db) {
      addColumn(db, 'orders', 'fulfillment_status', 'TEXT');
      addColumn(db, 'orders', 'tracking_number', 'TEXT');
      addColumn(db, 'orders', 'tracking_url', 'TEXT');
      addColumn(db, 'orders', 'shipping_address', 'TEXT');
    },
  },
  {
    version: '2026-04-09-003',
    up(db) {
      if (!isColumnNotNull(db, 'conversations', 'case_id')) return;

      db.pragma('foreign_keys = OFF');
      db.exec(`
        ALTER TABLE conversations RENAME TO conversations_legacy_not_null_case;

        CREATE TABLE conversations (
          id TEXT PRIMARY KEY,
          case_id TEXT REFERENCES cases(id),
          customer_id TEXT REFERENCES customers(id),
          channel TEXT NOT NULL DEFAULT 'email',
          status TEXT NOT NULL DEFAULT 'open',
          subject TEXT,
          external_thread_id TEXT,
          first_message_at TEXT,
          last_message_at TEXT,
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          tenant_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL DEFAULT 'ws_default'
        );

        INSERT INTO conversations (
          id, case_id, customer_id, channel, status, subject, external_thread_id,
          first_message_at, last_message_at, created_at, updated_at, tenant_id, workspace_id
        )
        SELECT
          id, case_id, customer_id, channel, status, subject, external_thread_id,
          first_message_at, last_message_at, created_at, COALESCE(updated_at, created_at),
          tenant_id, workspace_id
        FROM conversations_legacy_not_null_case;

        DROP TABLE conversations_legacy_not_null_case;
      `);
      db.pragma('foreign_keys = ON');
    },
  },
  {
    version: '2026-04-09-004',
    up(db) {
      const messageFk = db.pragma('foreign_key_list(messages)') as Array<{ table: string }>;
      const draftFk = db.pragma('foreign_key_list(draft_replies)') as Array<{ table: string }>;
      const needsMessageRebuild = messageFk.some(fk => fk.table === 'conversations_legacy_not_null_case');
      const needsDraftRebuild = draftFk.some(fk => fk.table === 'conversations_legacy_not_null_case');

      if (!needsMessageRebuild && !needsDraftRebuild) return;

      db.pragma('foreign_keys = OFF');

      if (needsMessageRebuild) {
        db.exec(`
          ALTER TABLE messages RENAME TO messages_legacy_conversation_fk;

          CREATE TABLE messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL REFERENCES conversations(id),
            case_id TEXT REFERENCES cases(id),
            customer_id TEXT REFERENCES customers(id),
            type TEXT NOT NULL DEFAULT 'customer',
            direction TEXT NOT NULL DEFAULT 'inbound',
            sender_id TEXT,
            sender_name TEXT,
            content TEXT NOT NULL,
            content_type TEXT NOT NULL DEFAULT 'text',
            channel TEXT NOT NULL DEFAULT 'email',
            external_message_id TEXT,
            draft_reply_id TEXT REFERENCES draft_replies(id),
            sentiment TEXT,
            sentiment_score REAL,
            attachments TEXT DEFAULT '[]',
            sent_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            delivered_at TEXT,
            read_at TEXT,
            tenant_id TEXT NOT NULL
          );

          INSERT INTO messages (
            id, conversation_id, case_id, customer_id, type, direction,
            sender_id, sender_name, content, content_type, channel,
            external_message_id, draft_reply_id, sentiment, sentiment_score,
            attachments, sent_at, created_at, delivered_at, read_at, tenant_id
          )
          SELECT
            id, conversation_id, case_id, customer_id, type, direction,
            sender_id, sender_name, content, content_type, channel,
            external_message_id, draft_reply_id, sentiment, sentiment_score,
            attachments, sent_at, created_at, delivered_at, read_at, tenant_id
          FROM messages_legacy_conversation_fk;

          DROP TABLE messages_legacy_conversation_fk;
        `);
      }

      if (needsDraftRebuild) {
        db.exec(`
          ALTER TABLE draft_replies RENAME TO draft_replies_legacy_conversation_fk;

          CREATE TABLE draft_replies (
            id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL REFERENCES cases(id),
            conversation_id TEXT NOT NULL REFERENCES conversations(id),
            content TEXT NOT NULL,
            generated_by TEXT,
            generated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            tone TEXT DEFAULT 'professional',
            confidence REAL DEFAULT 0.5,
            has_policies INTEGER DEFAULT 0,
            citations TEXT DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'pending_review',
            reviewed_by TEXT,
            reviewed_at TEXT,
            sent_at TEXT,
            updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
            tenant_id TEXT NOT NULL
          );

          INSERT INTO draft_replies (
            id, case_id, conversation_id, content, generated_by, generated_at,
            tone, confidence, has_policies, citations, status, reviewed_by,
            reviewed_at, sent_at, updated_at, tenant_id
          )
          SELECT
            id, case_id, conversation_id, content, generated_by, generated_at,
            tone, confidence, has_policies, citations, status, reviewed_by,
            reviewed_at, sent_at, updated_at, tenant_id
          FROM draft_replies_legacy_conversation_fk;

          DROP TABLE draft_replies_legacy_conversation_fk;
        `);
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sent_at);
        CREATE INDEX IF NOT EXISTS idx_messages_case ON messages(case_id, sent_at);
      `);
      db.pragma('foreign_keys = ON');
    },
  },
  {
    version: '2026-04-09-005',
    up(db) {
      const messageFk = db.pragma('foreign_key_list(messages)') as Array<{ table: string }>;
      if (!messageFk.some(fk => fk.table === 'draft_replies_legacy_conversation_fk')) return;

      db.pragma('foreign_keys = OFF');
      db.exec(`
        ALTER TABLE messages RENAME TO messages_legacy_draft_fk;

        CREATE TABLE messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id),
          case_id TEXT REFERENCES cases(id),
          customer_id TEXT REFERENCES customers(id),
          type TEXT NOT NULL DEFAULT 'customer',
          direction TEXT NOT NULL DEFAULT 'inbound',
          sender_id TEXT,
          sender_name TEXT,
          content TEXT NOT NULL,
          content_type TEXT NOT NULL DEFAULT 'text',
          channel TEXT NOT NULL DEFAULT 'email',
          external_message_id TEXT,
          draft_reply_id TEXT REFERENCES draft_replies(id),
          sentiment TEXT,
          sentiment_score REAL,
          attachments TEXT DEFAULT '[]',
          sent_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          delivered_at TEXT,
          read_at TEXT,
          tenant_id TEXT NOT NULL
        );

        INSERT INTO messages (
          id, conversation_id, case_id, customer_id, type, direction,
          sender_id, sender_name, content, content_type, channel,
          external_message_id, draft_reply_id, sentiment, sentiment_score,
          attachments, sent_at, created_at, delivered_at, read_at, tenant_id
        )
        SELECT
          id, conversation_id, case_id, customer_id, type, direction,
          sender_id, sender_name, content, content_type, channel,
          external_message_id, draft_reply_id, sentiment, sentiment_score,
          attachments, sent_at, created_at, delivered_at, read_at, tenant_id
        FROM messages_legacy_draft_fk;

        DROP TABLE messages_legacy_draft_fk;
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sent_at);
        CREATE INDEX IF NOT EXISTS idx_messages_case ON messages(case_id, sent_at);
      `);
      db.pragma('foreign_keys = ON');
    },
  },
  {
    version: '2026-04-09-006',
    up(db) {
      const rows = db.prepare(`
        SELECT id, reasoning_profile
        FROM agent_versions
        WHERE reasoning_profile IS NOT NULL
      `).all() as Array<{ id: string; reasoning_profile: string }>;

      const update = db.prepare('UPDATE agent_versions SET reasoning_profile = ? WHERE id = ?');
      for (const row of rows) {
        try {
          const profile = JSON.parse(row.reasoning_profile) as Record<string, unknown>;
          if (typeof profile.model === 'string' && profile.model.startsWith('gemini-')) {
            profile.model = 'gemini-2.5-pro';
            update.run(JSON.stringify(profile), row.id);
          }
        } catch {
          // Leave malformed historical profiles untouched.
        }
      }
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
