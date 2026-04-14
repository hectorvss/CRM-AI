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
    status: 'completed' | 'failed' | 'dead';
    finishedAt: string;
    attempts?: number;
    error?: string | null;
  }): Promise<void>;

  countJobs(): Promise<Record<string, number>>;
  retryDeadJob(id: string): Promise<boolean>;
  quarantineOrphanJobs(): Promise<number>;
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
      SET status = 'running', started_at = CURRENT_TIMESTAMP
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'pending' AND run_at <= CURRENT_TIMESTAMP
        ORDER BY priority ASC, run_at ASC, created_at ASC
        LIMIT 1
      )
      RETURNING *
    `).get();
  }

  async finishJob(id: string, updates: any) {
    const db = getDb();
    const fields = ['status = ?', 'finished_at = ?'];
    const params = [updates.status, updates.finishedAt];

    if (updates.attempts !== undefined) {
      fields.push('attempts = ?');
      params.push(updates.attempts);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      params.push(updates.error);
    }

    params.push(id);
    db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`).run(...params);
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

  async quarantineOrphanJobs() {
    return 0;
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
    // In PostgreSQL/Supabase, we use a single query with FOR UPDATE SKIP LOCKED
    // to avoid race conditions. Since Supabase client doesn't support RETURNING on single UPDATE directly with SKIP LOCKED logic easily,
    // we use a Raw SQL via RPC or just a careful series.
    // Recommended: Use an RPC for atomic claim in Supabase.
    
    /* 
    SQL for RPC 'claim_next_job':
    UPDATE jobs
    SET status = 'running', started_at = now()
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pending' AND run_at <= now()
      ORDER BY priority ASC, run_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *;
    */

    const { data, error } = await supabase.rpc('claim_next_job');
    if (error) {
      // Fallback if RPC not defined: simple non-locking claim (risk of race if multiple workers)
      // For now, assume RPC exists or use a simple variant
      const { data: nextJob } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'pending')
        .lte('run_at', new Date().toISOString())
        .order('priority', { ascending: true })
        .order('run_at', { ascending: true })
        .limit(1)
        .single();
      
      if (!nextJob) return null;

      const { data: claimed } = await supabase
        .from('jobs')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', nextJob.id)
        .eq('status', 'pending') // Double check
        .select()
        .single();
      
      return claimed;
    }
    return data?.[0] || null;
  }

  async finishJob(id: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const toUpdate: any = {
      status: updates.status,
      finished_at: updates.finishedAt
    };
    if (updates.attempts !== undefined) toUpdate.attempts = updates.attempts;
    if (updates.error !== undefined) toUpdate.error = updates.error;

    const { error } = await supabase.from('jobs').update(toUpdate).eq('id', id);
    if (error) throw error;
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

  async quarantineOrphanJobs() {
    return 0;
  }
}

let instance: JobRepository | null = null;

export function createJobRepository(): JobRepository {
  if (instance) return instance;
  const provider = getDatabaseProvider();
  instance = provider === 'supabase' ? new SupabaseJobRepository() : new SQLiteJobRepository();
  return instance;
}
