import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

export interface JobRepository {
  enqueue(data: {
    id: string;
    type: string;
    payload: any;
    priority: number;
    maxAttempts: number;
    runAt: string;
    tenantId: string | null;
    workspaceId: string | null;
    traceId: string;
  }): Promise<string>;

  getJob(id: string): Promise<any>;
  claimJob(): Promise<any>;
  finishJob(id: string, updates: {
    status: 'completed' | 'pending' | 'dead';
    finishedAt?: string;
    runAt?: string;
    error?: string | null;
  }): Promise<void>;
  quarantineOrphanJobs(): Promise<number>;

  countJobs(): Promise<Record<string, number>>;
  retryDeadJob(id: string): Promise<boolean>;
}

class SQLiteJobRepository implements JobRepository {
  async enqueue(data: any) {
    const db = getDb();
    db.prepare(`
      INSERT INTO jobs
        (id, type, payload, status, priority, attempts, max_attempts,
         run_at, started_at, finished_at, error, created_at,
         tenant_id, workspace_id, trace_id)
      VALUES
        (?, ?, ?, 'pending', ?, 0, ?, ?, NULL, NULL, NULL,
         CURRENT_TIMESTAMP, ?, ?, ?)
    `).run(
      data.id, data.type, JSON.stringify(data.payload), data.priority, data.maxAttempts,
      data.runAt, data.tenantId, data.workspaceId, data.traceId
    );
    return data.id;
  }

  async getJob(id: string) {
    const db = getDb();
    return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  }

  async claimJob() {
    const db = getDb();
    // Atomic claim in SQLite using subquery
    return db.prepare(`
      UPDATE jobs
      SET status = 'running', started_at = CURRENT_TIMESTAMP, attempts = attempts + 1
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'pending'
          AND run_at <= CURRENT_TIMESTAMP
          AND tenant_id IS NOT NULL
          AND workspace_id IS NOT NULL
        ORDER BY priority ASC, run_at ASC, created_at ASC
        LIMIT 1
      )
      RETURNING *
    `).get();
  }

  async finishJob(id: string, updates: any) {
    const db = getDb();
    const fields = ['status = ?'];
    const params = [updates.status];

    if (updates.status === 'pending') {
      fields.push('run_at = ?', 'finished_at = NULL');
      params.push(updates.runAt ?? new Date().toISOString());
    } else {
      fields.push('finished_at = ?');
      params.push(updates.finishedAt ?? new Date().toISOString());
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      params.push(updates.error);
    }

    params.push(id);
    db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  }

  async quarantineOrphanJobs() {
    const db = getDb();
    const result = db.prepare(`
      UPDATE jobs
      SET status = 'dead',
          finished_at = CURRENT_TIMESTAMP,
          error = COALESCE(error, 'Missing tenant/workspace scope')
      WHERE status IN ('pending', 'running')
        AND (tenant_id IS NULL OR workspace_id IS NULL)
    `).run();
    return result.changes ?? 0;
  }

  async countJobs() {
    const db = getDb();
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count FROM jobs GROUP BY status
    `).all() as any[];
    return rows.reduce((acc, r) => ({ ...acc, [r.status]: r.count }), {});
  }

  async retryDeadJob(id: string) {
    const db = getDb();
    const result = db.prepare(`
      UPDATE jobs
      SET status = 'pending', attempts = 0, error = NULL,
          run_at = CURRENT_TIMESTAMP, finished_at = NULL
      WHERE id = ? AND status = 'dead'
    `).run(id);
    return result.changes > 0;
  }
}

class SupabaseJobRepository implements JobRepository {
  async enqueue(data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('jobs').insert({
      id: data.id,
      type: data.type,
      payload: data.payload,
      status: 'pending',
      priority: data.priority,
      attempts: 0,
      max_attempts: data.maxAttempts,
      run_at: data.runAt,
      tenant_id: data.tenantId,
      workspace_id: data.workspaceId,
      trace_id: data.traceId
    });
    if (error) throw error;
    return data.id;
  }

  async getJob(id: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('jobs').select('*').eq('id', id).single();
    return data;
  }

  async claimJob() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('claim_next_job');
    if (error) {
      throw new Error(`claim_next_job RPC failed: ${error.message}. Deploy server/db/supabase-rpc-claim_next_job.sql to Supabase.`);
    }
    return data?.[0] || null;
  }

  async finishJob(id: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const toUpdate: any = updates.status === 'pending'
      ? {
          status: 'pending',
          run_at: updates.runAt ?? new Date().toISOString(),
          finished_at: null,
        }
      : {
          status: updates.status,
          finished_at: updates.finishedAt ?? new Date().toISOString(),
        };
    if (updates.error !== undefined) toUpdate.error = updates.error;

    const { error } = await supabase.from('jobs').update(toUpdate).eq('id', id);
    if (error) throw error;
  }

  async quarantineOrphanJobs() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('jobs')
      .update({
        status: 'dead',
        finished_at: new Date().toISOString(),
        error: 'Missing tenant/workspace scope',
      })
      .in('status', ['pending', 'running'])
      .or('tenant_id.is.null,workspace_id.is.null')
      .select('id');
    if (error) throw error;
    return data?.length ?? 0;
  }

  async countJobs() {
    const supabase = getSupabaseAdmin();
    // Count groups
    const { data, error } = await supabase.from('jobs').select('status');
    if (error) throw error;
    
    const counts: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    return counts;
  }

  async retryDeadJob(id: string) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'pending',
        attempts: 0,
        error: null,
        run_at: new Date().toISOString(),
        finished_at: null
      })
      .eq('id', id)
      .eq('status', 'dead');
    return !error;
  }
}

let instance: JobRepository | null = null;

export function createJobRepository(): JobRepository {
  if (instance) return instance;
  const provider = getDatabaseProvider();
  instance = provider === 'supabase' ? new SupabaseJobRepository() : new SQLiteJobRepository();
  return instance;
}
