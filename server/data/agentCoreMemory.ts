/**
 * server/data/agentCoreMemory.ts
 *
 * Tenant-level core memory for the Super Agent, over `agent_core_memory`
 * (migration 20260511_0009). Port of PostHog's CoreMemory model
 * (products/posthog_ai/backend/models/assistant.py): one text blob per team,
 * truncated for prompting, appended to over time.
 */

import { getSupabaseAdmin } from '../db/supabase.js';

/** PostHog caps prompt-visible memory at 5,000 chars (formatted_text). */
const PROMPT_MAX_CHARACTERS = 5000;
/** PostHog caps total memory at 10,000 chars (CORE_MEMORY_MAX_CHARACTERS). */
const TOTAL_MAX_CHARACTERS = 10_000;

export async function getCoreMemory(tenantId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('agent_core_memory')
    .select('content')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === '42P01') return null;
    throw error;
  }
  const content = (data?.content as string | undefined)?.trim();
  if (!content) return null;
  return content.length > PROMPT_MAX_CHARACTERS
    ? `${content.slice(0, PROMPT_MAX_CHARACTERS)}...`
    : content;
}

export async function appendCoreMemory(tenantId: string, fact: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('agent_core_memory')
    .select('content')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;

  const existing = (data?.content as string | undefined) ?? '';
  const next = existing ? `${existing}\n${fact.trim()}` : fact.trim();

  const { error: upsertError } = await supabase.from('agent_core_memory').upsert({
    tenant_id: tenantId,
    content: next.slice(-TOTAL_MAX_CHARACTERS),
    updated_at: new Date().toISOString(),
  });
  if (upsertError) throw upsertError;
}
