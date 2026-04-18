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
          tenant_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL DEFAULT 'ws_default'
        );

        INSERT INTO draft_replies (
          id, case_id, conversation_id, content, generated_by, generated_at,
          tone, confidence, has_policies, citations, status, reviewed_by,
          reviewed_at, sent_at, updated_at, tenant_id, workspace_id
        )
        SELECT
          id, case_id, conversation_id, content, generated_by, generated_at,
          tone, confidence, has_policies, citations, status, reviewed_by,
          reviewed_at, sent_at, updated_at, tenant_id, COALESCE(workspace_id, 'ws_default')
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
          tenant_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL DEFAULT 'ws_default'
        );

        INSERT INTO messages (
          id, conversation_id, case_id, customer_id, type, direction,
          sender_id, sender_name, content, content_type, channel,
          external_message_id, draft_reply_id, sentiment, sentiment_score,
          attachments, sent_at, created_at, delivered_at, read_at, tenant_id, workspace_id
        )
        SELECT
          id, conversation_id, case_id, customer_id, type, direction,
          sender_id, sender_name, content, content_type, channel,
          external_message_id, draft_reply_id, sentiment, sentiment_score,
          attachments, sent_at, created_at, delivered_at, read_at, tenant_id, COALESCE(workspace_id, 'ws_default')
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
  {
    version: '2026-04-09-007',
    up(db) {
      const workspace = db.prepare('SELECT id FROM workspaces LIMIT 1').get() as { id: string } | undefined;
      addColumn(db, 'payments', 'workspace_id', `TEXT NOT NULL DEFAULT '${workspace?.id || 'ws_default'}'`);
      db.prepare('UPDATE payments SET workspace_id = COALESCE(workspace_id, ?)').run(workspace?.id || 'ws_default');
      db.exec('CREATE INDEX IF NOT EXISTS idx_payments_tenant_workspace ON payments(tenant_id, workspace_id)');
    },
  },
  {
    version: '2026-04-09-008',
    up(db) {
      const workspace = db.prepare('SELECT id FROM workspaces LIMIT 1').get() as { id: string } | undefined;
      addColumn(db, 'agent_runs', 'workspace_id', `TEXT NOT NULL DEFAULT '${workspace?.id || 'ws_default'}'`);
      addColumn(db, 'agent_runs', 'trigger_event', `TEXT DEFAULT 'case_created'`);
      addColumn(db, 'agent_runs', 'status', `TEXT NOT NULL DEFAULT 'running'`);
      addColumn(db, 'agent_runs', 'summary', 'TEXT');
      addColumn(db, 'agent_runs', 'output', 'TEXT');
      addColumn(db, 'agent_runs', 'error_message', 'TEXT');
      addColumn(db, 'agent_runs', 'finished_at', 'TEXT');
      db.prepare('UPDATE agent_runs SET workspace_id = COALESCE(workspace_id, ?)').run(workspace?.id || 'ws_default');
      db.prepare("UPDATE agent_runs SET status = COALESCE(status, outcome_status, 'completed')").run();
      db.exec('CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_workspace ON agent_runs(tenant_id, workspace_id)');
    },
  },
  {
    version: '2026-04-09-009',
    up(db) {
      const workspace = db.prepare('SELECT id FROM workspaces LIMIT 1').get() as { id: string } | undefined;
      const workspaceId = workspace?.id || 'ws_default';

      addColumn(db, 'draft_replies', 'workspace_id', `TEXT NOT NULL DEFAULT '${workspaceId}'`);
      addColumn(db, 'internal_notes', 'workspace_id', `TEXT NOT NULL DEFAULT '${workspaceId}'`);
      addColumn(db, 'reconciliation_issues', 'workspace_id', `TEXT NOT NULL DEFAULT '${workspaceId}'`);

      db.prepare('UPDATE draft_replies SET workspace_id = COALESCE(workspace_id, ?)').run(workspaceId);
      db.prepare('UPDATE internal_notes SET workspace_id = COALESCE(workspace_id, ?)').run(workspaceId);
      db.prepare('UPDATE reconciliation_issues SET workspace_id = COALESCE(workspace_id, ?)').run(workspaceId);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_draft_replies_case_workspace ON draft_replies(case_id, workspace_id, generated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_internal_notes_case_workspace ON internal_notes(case_id, workspace_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_reconciliation_issues_case_workspace ON reconciliation_issues(case_id, workspace_id, status, detected_at DESC);
      `);
    },
  },
  {
    version: '2026-04-09-010',
    up(db) {
      const workspace = db.prepare('SELECT org_id, id FROM workspaces LIMIT 1').get() as { org_id?: string; id?: string } | undefined;
      const tenantId = workspace?.org_id || 'org_default';
      const workspaceId = workspace?.id || 'ws_default';

      db.prepare(`
        UPDATE workflow_definitions
        SET tenant_id = ?, workspace_id = ?, updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
        WHERE tenant_id = 'tenant_default' OR workspace_id = 'ws_default'
      `).run(tenantId, workspaceId);

      db.prepare(`
        UPDATE workflow_versions
        SET tenant_id = ?
        WHERE tenant_id = 'tenant_default'
      `).run(tenantId);

      db.prepare(`
        UPDATE workflow_runs
        SET tenant_id = ?
        WHERE tenant_id = 'tenant_default'
      `).run(tenantId);
    },
  },
  {
    version: '2026-04-09-011',
    up(db) {
      const workspace = db.prepare('SELECT org_id FROM workspaces LIMIT 1').get() as { org_id?: string } | undefined;
      const tenantId = workspace?.org_id || 'org_default';
      const now = new Date().toISOString();
      const makePast = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

      const rows = [
        {
          id: 'wfr_001',
          workflow_version_id: 'wf_001_v1',
          case_id: 'case_001',
          tenant_id: tenantId,
          trigger_type: 'return.received',
          trigger_payload: JSON.stringify({ return_id: 'ret_001' }),
          status: 'completed',
          current_node_id: 'issue_refund',
          context: JSON.stringify({ approval_id: 'apr_001' }),
          started_at: makePast(240),
          ended_at: makePast(236),
          error: null,
        },
        {
          id: 'wfr_002',
          workflow_version_id: 'wf_002_v1',
          case_id: 'case_002',
          tenant_id: tenantId,
          trigger_type: 'return.received',
          trigger_payload: JSON.stringify({ return_id: 'ret_002' }),
          status: 'failed',
          current_node_id: 'approval_check',
          context: JSON.stringify({ approval_id: 'apr_002' }),
          started_at: makePast(120),
          ended_at: makePast(119),
          error: 'Approval gate timed out',
        },
        {
          id: 'wfr_003',
          workflow_version_id: 'wf_003_v1',
          case_id: 'case_004',
          tenant_id: tenantId,
          trigger_type: 'payment.refund_detected',
          trigger_payload: JSON.stringify({ payment_id: 'pay_004' }),
          status: 'running',
          current_node_id: 'duplicate_check',
          context: JSON.stringify({ risk_score: 0.82 }),
          started_at: makePast(25),
          ended_at: null,
          error: null,
        },
      ];

      const insertRun = db.prepare(`
        INSERT OR IGNORE INTO workflow_runs (
          id, workflow_version_id, case_id, tenant_id, trigger_type, trigger_payload,
          status, current_node_id, context, started_at, ended_at, error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const row of rows) {
        insertRun.run(
          row.id,
          row.workflow_version_id,
          row.case_id,
          row.tenant_id,
          row.trigger_type,
          row.trigger_payload,
          row.status,
          row.current_node_id,
          row.context,
          row.started_at,
          row.ended_at,
          row.error,
        );
      }
    },
  },
  {
    version: '2026-04-09-012',
    up(db) {
      const workspace = db.prepare('SELECT org_id FROM workspaces LIMIT 1').get() as { org_id?: string } | undefined;
      const tenantId = workspace?.org_id || 'org_default';
      const now = new Date().toISOString();

      const capabilities = [
        { id: 'cap_shopify_orders', connector_id: 'conn_shopify', capability_key: 'orders.read', direction: 'read', is_enabled: 1, requires_approval: 0, is_idempotent: 1 },
        { id: 'cap_shopify_cancel', connector_id: 'conn_shopify', capability_key: 'orders.cancel', direction: 'write', is_enabled: 1, requires_approval: 1, is_idempotent: 1 },
        { id: 'cap_shopify_returns', connector_id: 'conn_shopify', capability_key: 'returns.read', direction: 'read', is_enabled: 1, requires_approval: 0, is_idempotent: 1 },
        { id: 'cap_stripe_payments', connector_id: 'conn_stripe', capability_key: 'payments.read', direction: 'read', is_enabled: 1, requires_approval: 0, is_idempotent: 1 },
        { id: 'cap_stripe_refund', connector_id: 'conn_stripe', capability_key: 'refunds.create', direction: 'write', is_enabled: 1, requires_approval: 1, is_idempotent: 1 },
        { id: 'cap_zendesk_tickets', connector_id: 'conn_zendesk', capability_key: 'tickets.read', direction: 'read', is_enabled: 1, requires_approval: 0, is_idempotent: 1 },
        { id: 'cap_intercom_conversations', connector_id: 'conn_intercom', capability_key: 'conversations.read', direction: 'read', is_enabled: 1, requires_approval: 0, is_idempotent: 1 },
      ];

      const insertCapability = db.prepare(`
        INSERT OR IGNORE INTO connector_capabilities
          (id, connector_id, capability_key, direction, is_enabled, requires_approval, is_idempotent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const cap of capabilities) {
        insertCapability.run(
          cap.id,
          cap.connector_id,
          cap.capability_key,
          cap.direction,
          cap.is_enabled,
          cap.requires_approval,
          cap.is_idempotent,
        );
      }

      const events = [
        {
          id: 'webhook_shopify_001',
          connector_id: 'conn_shopify',
          source_system: 'shopify',
          event_type: 'orders/fulfilled',
          raw_payload: JSON.stringify({ order_id: 'ord_55213', status: 'fulfilled' }),
          status: 'processed',
          dedupe_key: 'shopify:orders/fulfilled:ord_55213',
          received_at: now,
          processed_at: now,
        },
        {
          id: 'webhook_stripe_001',
          connector_id: 'conn_stripe',
          source_system: 'stripe',
          event_type: 'charge.refunded',
          raw_payload: JSON.stringify({ payment_id: 'pay_001', amount: 129 }),
          status: 'processed',
          dedupe_key: 'stripe:charge.refunded:pay_001',
          received_at: now,
          processed_at: now,
        },
      ];

      const insertWebhook = db.prepare(`
        INSERT OR IGNORE INTO webhook_events
          (id, connector_id, tenant_id, source_system, event_type, raw_payload, status, dedupe_key, received_at, processed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const event of events) {
        insertWebhook.run(
          event.id,
          event.connector_id,
          tenantId,
          event.source_system,
          event.event_type,
          event.raw_payload,
          event.status,
          event.dedupe_key,
          event.received_at,
          event.processed_at,
        );
      }
    },
  },
  {
    version: '2026-04-10-001',
    up(db) {
      addColumn(db, 'users', 'preferences', `TEXT NOT NULL DEFAULT '{}'`);
      db.prepare("UPDATE users SET preferences = COALESCE(preferences, '{}')").run();
    },
  },
  // ── 2026-04-18-001: customers full profile + order line items + activity ──────
  {
    version: '2026-04-18-001',
    up(db) {
      // Customer profile fields (sourced from Shopify/Stripe sync)
      addColumn(db, 'customers', 'role',                  'TEXT');
      addColumn(db, 'customers', 'company',               'TEXT');
      addColumn(db, 'customers', 'location',              'TEXT');
      addColumn(db, 'customers', 'timezone',              'TEXT');
      addColumn(db, 'customers', 'avatar_url',            'TEXT');
      addColumn(db, 'customers', 'plan',                  'TEXT');
      addColumn(db, 'customers', 'next_renewal',          'TEXT');
      addColumn(db, 'customers', 'fraud_risk',            `TEXT NOT NULL DEFAULT 'low'`);
      addColumn(db, 'customers', 'notes',                 'TEXT');
      addColumn(db, 'customers', 'ai_executive_summary',  'TEXT');
      addColumn(db, 'customers', 'ai_recommendations',    'TEXT');  // JSON array
      addColumn(db, 'customers', 'ai_impact_resolved',    'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'customers', 'ai_impact_approvals',   'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'customers', 'ai_impact_escalated',   'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'customers', 'top_issue',             'TEXT');

      // Order tracking fields
      addColumn(db, 'orders', 'total_amount',        'REAL');
      addColumn(db, 'orders', 'tracking_number',     'TEXT');
      addColumn(db, 'orders', 'tracking_url',        'TEXT');
      addColumn(db, 'orders', 'fulfillment_status',  'TEXT');
      addColumn(db, 'orders', 'shipping_address',    'TEXT');  // JSON

      // order_line_items: items within each order (from Shopify line_items)
      if (!hasTable(db, 'order_line_items')) {
        db.exec(`
          CREATE TABLE order_line_items (
            id               TEXT PRIMARY KEY,
            order_id         TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            tenant_id        TEXT NOT NULL,
            workspace_id     TEXT NOT NULL DEFAULT 'ws_default',
            external_item_id TEXT,
            product_id       TEXT,
            sku              TEXT,
            name             TEXT NOT NULL,
            price            REAL NOT NULL DEFAULT 0,
            quantity         INTEGER NOT NULL DEFAULT 1,
            currency         TEXT DEFAULT 'USD',
            icon             TEXT,
            image_url        TEXT,
            created_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
          )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_order_line_items_order ON order_line_items(order_id)');
      }

      // customer_activity: unified timeline (messages, orders, payments, agent notes, AI, system logs)
      if (!hasTable(db, 'customer_activity')) {
        db.exec(`
          CREATE TABLE customer_activity (
            id           TEXT PRIMARY KEY,
            customer_id  TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            tenant_id    TEXT NOT NULL,
            workspace_id TEXT NOT NULL DEFAULT 'ws_default',
            type         TEXT NOT NULL,
            system       TEXT,
            level        TEXT NOT NULL DEFAULT 'info',
            title        TEXT,
            content      TEXT,
            metadata     TEXT,
            source       TEXT,
            occurred_at  TEXT NOT NULL,
            created_at   TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
          )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_customer_activity_customer ON customer_activity(customer_id, occurred_at)');
      },
    },
  },

  {
    version: '2026-04-18-002',
    up(db) {
      addColumn(db, 'payments', 'authorized_at', 'TEXT');
      addColumn(db, 'payments', 'captured_at', 'TEXT');
      addColumn(db, 'payments', 'refund_status', 'TEXT');
      addColumn(db, 'payments', 'refund_details', `TEXT DEFAULT '[]'`);
      addColumn(db, 'payments', 'reconciliation_details', `TEXT DEFAULT '{}'`);

      db.exec(`
        CREATE TABLE IF NOT EXISTS payment_events (
          id TEXT PRIMARY KEY,
          payment_id TEXT NOT NULL REFERENCES payments(id),
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          system TEXT NOT NULL,
          time TEXT NOT NULL,
          tenant_id TEXT NOT NULL
        )
      `);

      const paymentUpdates = [
        {
          id: 'pay_001',
          authorized_at: '2023-10-16T10:00:20Z',
          captured_at: '2023-10-16T10:01:00Z',
          refund_status: 'pending_bank_clearance',
          refund_details: JSON.stringify([
            {
              attempt: 1,
              initiated_at: '2023-10-16T12:00:00Z',
              amount: 129,
              status: 'processing',
              psp_ref: 're_001_a',
            },
          ]),
          reconciliation_details: JSON.stringify({
            status: 'mismatch',
            oms_state: 'refund_pending',
            psp_state: 'captured',
            diff_cents: 0,
          }),
        },
        {
          id: 'pay_002',
          authorized_at: '2023-10-16T10:00:20Z',
          captured_at: '2023-10-16T10:01:00Z',
          refund_status: 'N/A',
          refund_details: JSON.stringify([]),
          reconciliation_details: JSON.stringify({
            status: 'pending',
            notes: 'Cancellation approval pending — refund on hold',
          }),
        },
        {
          id: 'pay_003',
          authorized_at: '2023-10-15T10:00:20Z',
          captured_at: '2023-10-15T10:01:00Z',
          refund_status: 'succeeded',
          refund_details: JSON.stringify([
            {
              attempt: 1,
              initiated_at: '2023-10-15T14:00:00Z',
              amount: 89,
              status: 'succeeded',
              psp_ref: 're_003_a',
            },
          ]),
          reconciliation_details: JSON.stringify({
            status: 'matched',
            notes: 'Refund completed and reconciled',
          }),
        },
        {
          id: 'pay_004',
          authorized_at: '2023-10-14T10:00:20Z',
          captured_at: '2023-10-14T10:01:00Z',
          refund_status: 'N/A',
          refund_details: JSON.stringify([]),
          reconciliation_details: JSON.stringify({
            status: 'matched',
            notes: 'Payment captured and settled',
          }),
        },
      ];

      const updatePayment = db.prepare(`
        UPDATE payments
        SET authorized_at = ?,
            captured_at = ?,
            refund_status = ?,
            refund_details = ?,
            reconciliation_details = ?
        WHERE id = ?
      `);

      for (const payment of paymentUpdates) {
        updatePayment.run(
          payment.authorized_at,
          payment.captured_at,
          payment.refund_status,
          payment.refund_details,
          payment.reconciliation_details,
          payment.id,
        );
      }

      const paymentEvents = [
        ['pe_001_1', 'pay_001', 'authorized', 'Payment authorized — $129.00', 'Stripe', '2023-10-16T10:00:20Z'],
        ['pe_001_2', 'pay_001', 'captured', 'Payment captured successfully', 'Stripe', '2023-10-16T10:01:00Z'],
        ['pe_001_3', 'pay_001', 'refund_requested', 'Refund requested via OMS', 'OMS', '2023-10-16T12:00:00Z'],
        ['pe_001_4', 'pay_001', 'refund_initiated', 'Refund initiated in PSP', 'Stripe', '2023-10-16T12:05:00Z'],
        ['pe_001_5', 'pay_001', 'pending_bank', 'Awaiting bank clearance — T+3 expected', 'Bank', '2023-10-16T12:05:30Z'],
        ['pe_002_1', 'pay_002', 'authorized', 'Payment authorized — $129.00', 'Stripe', '2023-10-16T10:00:20Z'],
        ['pe_002_2', 'pay_002', 'captured', 'Payment captured', 'Stripe', '2023-10-16T10:01:00Z'],
        ['pe_002_3', 'pay_002', 'cancellation_hold', 'Refund on hold pending ops cancellation approval', 'System', '2023-10-16T12:01:00Z'],
        ['pe_003_1', 'pay_003', 'authorized', 'Payment authorized — $89.00', 'Stripe', '2023-10-15T10:00:20Z'],
        ['pe_003_2', 'pay_003', 'captured', 'Payment captured', 'Stripe', '2023-10-15T10:01:00Z'],
        ['pe_003_3', 'pay_003', 'settled', 'Payment settled and reconciled', 'System', '2023-10-15T20:00:00Z'],
        ['pe_004_1', 'pay_004', 'authorized', 'Payment authorized — $249.00', 'Stripe', '2023-10-14T10:00:20Z'],
        ['pe_004_2', 'pay_004', 'captured', 'Payment captured', 'Stripe', '2023-10-14T10:01:00Z'],
        ['pe_004_3', 'pay_004', 'settled', 'Payment settled', 'Stripe', '2023-10-14T22:00:00Z'],
      ] as const;

      const insertPaymentEvent = db.prepare(`
        INSERT OR IGNORE INTO payment_events
          (id, payment_id, type, content, system, time, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const workspace = db.prepare('SELECT org_id FROM workspaces LIMIT 1').get() as { org_id?: string } | undefined;
      const tenantId = workspace?.org_id || 'org_default';
      for (const event of paymentEvents) {
        insertPaymentEvent.run(event[0], event[1], event[2], event[3], event[4], event[5], tenantId);
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
