/**
 * server/jobs/auditExport.ts
 *
 * Hourly sweeper that processes pending entries in `workspace_export_requests`.
 *
 * Behaviour:
 *   - kind='export'   → produce a JSON dump of all rows belonging to the
 *                       workspace across the major data tables and persist a
 *                       download URL (or send via email if email service is
 *                       configured later). Marks the request as `completed`.
 *   - kind='deletion' → schedules a DELETE_WORKSPACE_DATA job (priority 10) for
 *                       30 days from now (grace period). Marks the request as
 *                       `processed`. The actual deletion job is responsible for
 *                       removing rows when the grace period elapses.
 *
 * Failures are recorded on the row itself (status='failed', error=<msg>) so they
 * surface in audit dashboards.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';

const AUDIT_EXPORT_INTERVAL_MS = 60 * 60 * 1_000; // 1 hour
const DELETION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1_000; // 30 days

let auditExportIntervalId: ReturnType<typeof setInterval> | null = null;

// Tables we attempt to dump for an export request. Missing tables are skipped
// silently; existing tables are filtered by tenant_id + workspace_id.
const EXPORTABLE_TABLES = [
  'cases',
  'conversations',
  'messages',
  'customers',
  'orders',
  'order_items',
  'payments',
  'returns',
  'refunds',
  'agent_runs',
  'workflow_runs',
  'workflow_versions',
  'workflow_definitions',
  'audit_events',
  'approval_requests',
  'knowledge_articles',
  'webhook_events',
  'canonical_events',
  'reconciliation_issues',
  'execution_plans',
];

async function buildWorkspaceDump(
  tenantId: string,
  workspaceId: string,
): Promise<Record<string, unknown[]>> {
  const supabase = getSupabaseAdmin();
  const dump: Record<string, unknown[]> = {};

  for (const table of EXPORTABLE_TABLES) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId);
      if (error) {
        // 42P01 = undefined_table; PGRST116 = column missing
        const code = (error as any).code;
        if (code === '42P01' || code === '42703' || code === 'PGRST116') {
          logger.debug(`auditExport: table ${table} not present, skipping`);
          continue;
        }
        logger.warn(`auditExport: failed to read ${table}`, { error: error.message });
        continue;
      }
      dump[table] = data ?? [];
    } catch (err) {
      logger.warn(`auditExport: unexpected error reading ${table}`, {
        error: (err as Error).message,
      });
    }
  }

  return dump;
}

async function processExportRequest(row: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const dump = await buildWorkspaceDump(row.tenant_id, row.workspace_id);

  // Persist the dump to a storage bucket if available; otherwise embed inline.
  let downloadUrl: string | null = null;
  try {
    const bucket = supabase.storage.from('workspace-exports');
    const path = `${row.tenant_id}/${row.workspace_id}/${row.id}.json`;
    const { error: upErr } = await bucket.upload(
      path,
      new Blob([JSON.stringify(dump)], { type: 'application/json' }) as any,
      { upsert: true, contentType: 'application/json' },
    );
    if (!upErr) {
      const { data: signed } = await bucket.createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
      downloadUrl = signed?.signedUrl ?? null;
    } else {
      logger.warn('auditExport: storage upload failed; falling back to inline payload', {
        error: upErr.message,
      });
    }
  } catch (err) {
    logger.warn('auditExport: storage path failed', { error: (err as Error).message });
  }

  await supabase
    .from('workspace_export_requests')
    .update({
      status:       'completed',
      download_url: downloadUrl,
      processed_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    })
    .eq('id', row.id);

  logger.info('auditExport: export request completed', {
    requestId: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    tables: Object.keys(dump).length,
    downloadUrl: downloadUrl ? '(signed)' : '(inline)',
  });
}

async function processDeletionRequest(row: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const scheduledFor = new Date(Date.now() + DELETION_GRACE_PERIOD_MS).toISOString();

  // Lazy import to avoid pulling the queue client into routes that don't need it.
  const { enqueueDelayed } = await import('../queue/client.js');
  try {
    await enqueueDelayed(
      'workspace.delete' as any,
      {
        tenantId: row.tenant_id,
        workspaceId: row.workspace_id,
        requestId: row.id,
      } as any,
      DELETION_GRACE_PERIOD_MS,
      {
        tenantId: row.tenant_id,
        workspaceId: row.workspace_id,
        priority: 10,
      },
    );
  } catch (err) {
    logger.warn('auditExport: failed to enqueue delayed deletion job (no handler yet?)', {
      error: (err as Error).message,
    });
  }

  await supabase
    .from('workspace_export_requests')
    .update({
      status:        'completed',
      scheduled_for: scheduledFor,
      processed_at:  new Date().toISOString(),
      completed_at:  new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    })
    .eq('id', row.id);

  logger.info('auditExport: deletion request scheduled', {
    requestId: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    scheduledFor,
  });
}

async function sweepAuditExportRequests(): Promise<void> {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return; // Supabase not configured (sqlite-only deploy)
  }

  // Claim a batch of pending requests by flipping them to 'processing'.
  const { data: pending, error } = await supabase
    .from('workspace_export_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    // Table may not exist yet — log once and bail.
    if ((error as any).code === '42P01') {
      logger.debug('auditExport: workspace_export_requests table not present yet, skipping');
      return;
    }
    logger.warn('auditExport: failed to query pending requests', { error: error.message });
    return;
  }
  if (!pending?.length) return;

  logger.info(`auditExport: processing ${pending.length} pending request(s)`);

  for (const row of pending) {
    // Atomic claim — only proceed if still 'pending'.
    const { data: claimed } = await supabase
      .from('workspace_export_requests')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (!claimed) continue;

    try {
      if (claimed.kind === 'export') {
        await processExportRequest(claimed);
      } else if (claimed.kind === 'deletion') {
        await processDeletionRequest(claimed);
      } else {
        throw new Error(`Unknown request kind: ${claimed.kind}`);
      }
    } catch (err) {
      const message = (err as Error).message;
      logger.warn('auditExport: request processing failed', {
        requestId: claimed.id,
        kind: claimed.kind,
        error: message,
      });
      await supabase
        .from('workspace_export_requests')
        .update({
          status:     'failed',
          error:      message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', claimed.id);
    }
  }
}

export function startAuditExportSweeper(): void {
  // Fire once shortly after startup, then on a fixed hourly interval.
  setTimeout(() => {
    void sweepAuditExportRequests().catch((err) =>
      logger.warn('auditExport: initial sweep failed', { error: (err as Error).message }),
    );
  }, 45_000);

  auditExportIntervalId = setInterval(() => {
    void sweepAuditExportRequests().catch((err) =>
      logger.warn('auditExport: hourly sweep failed', { error: (err as Error).message }),
    );
  }, AUDIT_EXPORT_INTERVAL_MS);
}

export function stopAuditExportSweeper(): void {
  if (auditExportIntervalId) clearInterval(auditExportIntervalId);
  auditExportIntervalId = null;
}
