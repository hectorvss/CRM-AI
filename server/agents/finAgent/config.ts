/**
 * server/agents/finAgent/config.ts
 *
 * Fin AI Agent per-workspace configuration (spec: docs/fin-ai-agent-spec.md §8).
 * Stored under workspaces.settings.fin as a JSON blob; this module owns the
 * schema (zod), the defaults, and load/save with deep merge so partial PATCHes
 * from the settings screens never clobber sibling keys.
 */

import { z } from 'zod';
import { getSupabaseAdmin } from '../../db/supabase.js';

// ── Schema ────────────────────────────────────────────────────────────────────

const ReplyMode = z.enum(['off', 'draft_only', 'bot_reply']);

const ChannelConfig = z.object({
  enabled: z.boolean().default(false),
  /** Per ticket-type override; '*' is the fallback. */
  reply_modes: z.record(z.string(), ReplyMode).prefault({ '*': 'draft_only' }),
});

const GuidancePiece = z.object({
  id: z.string(),
  category: z.enum(['communication_style', 'context_clarification', 'content_sources', 'spam_filtering', 'other']),
  text: z.string().min(1),
  active: z.boolean().default(true),
  // Presentation metadata round-tripped for the Orientación screen.
  title: z.string().optional(),
  audience: z.string().optional(),
  channels: z.array(z.string()).optional(),
});

const FinAttribute = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().default(''),
  type: z.enum(['text', 'number', 'boolean', 'select']).default('text'),
  options: z.array(z.string()).optional(),
  // Round-trip metadata for the Atributos editor (values with descriptions,
  // audience, enabled). The engine reads name/description/values to classify.
  values: z.array(z.object({
    id: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
  })).optional(),
  audience: z.string().optional(),
  enabled: z.boolean().optional(),
});

const EscalationCondition = z.object({
  id: z.string().optional(),
  field: z.string(),
  operator: z.string(),
  value: z.string().optional().default(''),
});
const EscalationRule = z.object({
  id: z.string(),
  title: z.string().optional().default(''),
  description: z.string().optional().default(''),
  active: z.boolean().default(true),
  enabled: z.boolean().optional(),
  audience: z.string().optional(),
  channels: z.array(z.string()).optional(),
  conditions: z.array(EscalationCondition).optional().default([]),
});

const Audience = z.object({
  id: z.string(),
  name: z.string(),
  /** Simple attribute filters evaluated against the customer row. */
  filters: z.record(z.string(), z.string()).prefault({}),
  active: z.boolean().default(true),
});

export const FinConfigSchema = z.object({
  enabled: z.boolean().default(false),
  channels: z.object({
    chat: ChannelConfig.prefault({}),
    email: ChannelConfig.prefault({}),
    whatsapp: ChannelConfig.prefault({}),
  }).prefault({}),
  identity: z.object({
    name: z.string().default('Fin'),
    tone: z.enum(['professional', 'friendly', 'humorous']).default('friendly'),
    answer_length: z.enum(['concise', 'balanced', 'thorough']).default('balanced'),
    formality: z.enum(['tú', 'usted']).default('tú'),
    languages: z.array(z.string()).default(['es', 'en']),
  }).prefault({}),
  guidance: z.array(GuidancePiece).default([]),
  attributes: z.array(FinAttribute).default([]),
  escalation: z.object({
    rules: z.array(EscalationRule).default([]),
    default_team: z.string().nullable().default(null),
  }).prefault({}),
  audiences: z.array(Audience).default([]),
  retrieval: z.object({
    top_k: z.number().int().min(1).max(20).default(8),
    candidates: z.number().int().min(5).max(100).default(40),
  }).prefault({}),
  validation: z.object({
    confidence_threshold: z.number().min(0).max(1).default(0.6),
    max_attempts: z.number().int().min(1).max(5).default(3),
  }).prefault({}),
  debounce: z.object({
    chat_seconds: z.number().int().min(0).max(120).default(5),
    email_minutes: z.number().int().min(0).max(30).default(2),
  }).prefault({}),
  caps: z.object({
    concurrent_runs: z.number().int().min(1).max(100).default(20),
    daily_replies: z.number().int().nullable().default(null),
    alert_email: z.string().nullable().default(null),
  }).prefault({}),
  safety: z.object({
    blocked_topics: z.array(z.string()).default([]),
  }).prefault({}),
});

export type FinConfig = z.infer<typeof FinConfigSchema>;
/** Max live guidance pieces (parity with Fin's cap). */
export const MAX_ACTIVE_GUIDANCE = 100;

export interface FinScope {
  tenantId: string;
  workspaceId: string;
}

// ── Load / save ───────────────────────────────────────────────────────────────

/** Parse whatever is stored, filling every default. Never throws on bad data —
 *  a corrupt blob degrades to defaults so the pipeline can always run. */
export function parseFinConfig(raw: unknown): FinConfig {
  const parsed = FinConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : FinConfigSchema.parse({});
}

/**
 * Resolve the actual workspace row for a scope. Mirrors
 * server/data/workspaces.ts getById: 'ws_default' is a virtual id that maps
 * to the first workspace of the org (workspaces are scoped by org_id).
 */
async function resolveWorkspaceRow(scope: FinScope): Promise<{ id: string; settings: any } | null> {
  const supabase = getSupabaseAdmin();
  if (scope.workspaceId === 'ws_default') {
    const { data } = await supabase
      .from('workspaces')
      .select('id, settings')
      .eq('org_id', scope.tenantId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (data?.[0]) return data[0];
    const { data: first } = await supabase
      .from('workspaces')
      .select('id, settings')
      .order('created_at', { ascending: true })
      .limit(1);
    return first?.[0] ?? null;
  }
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, settings')
    .eq('id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function loadFinConfig(scope: FinScope): Promise<FinConfig> {
  const row = await resolveWorkspaceRow(scope);
  return parseFinConfig(row?.settings?.fin);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Deep merge patch into base; arrays replace wholesale (they are entities). */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch as T) ?? base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Apply a partial patch and persist; returns the validated result. */
export async function patchFinConfig(scope: FinScope, patch: unknown): Promise<FinConfig> {
  const supabase = getSupabaseAdmin();
  const row = await resolveWorkspaceRow(scope);
  if (!row) throw new Error(`workspace not found for scope ${scope.tenantId}/${scope.workspaceId}`);

  const settings = isPlainObject(row.settings) ? { ...row.settings } : {};
  const current = parseFinConfig(settings.fin);
  const merged = FinConfigSchema.parse(deepMerge(current, patch));

  const active = merged.guidance.filter((g) => g.active).length;
  if (active > MAX_ACTIVE_GUIDANCE) {
    throw Object.assign(new Error(`At most ${MAX_ACTIVE_GUIDANCE} guidance pieces can be active`), {
      code: 'FIN_GUIDANCE_CAP',
    });
  }

  settings.fin = merged;
  const { error: upErr } = await supabase
    .from('workspaces')
    .update({ settings, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (upErr) throw upErr;
  return merged;
}
