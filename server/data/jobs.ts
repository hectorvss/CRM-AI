import { getSupabaseAdmin } from '../db/supabase.js';

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
  rescheduleJob(id: string, updates: {
    runAt: string;
    error?: string | null;
  }): Promise<void>;

  countJobs(): Promise<Record<string, number>>;
  retryDeadJob(id: string): Promise<boolean>;
  quarantineOrphanJobs(): Promise<number>;
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

  async rescheduleJob(id: string, updates: { runAt: string; error?: string | null }) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'pending',
        run_at: updates.runAt,
        started_at: null,
        finished_at: null,
        error: updates.error ?? null,
      })
      .eq('id', id);
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

var instance: JobRepository | null = null;

export function createJobRepository(): JobRepository {
  if (instance) return instance;
  instance = new SupabaseJobRepository();
  return instance;
}
