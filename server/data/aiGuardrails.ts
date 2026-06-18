import { getSupabaseAdmin } from '../db/supabase.js';

export interface GuardrailScope { tenantId: string; workspaceId: string }

export type RuleType =
  | 'blocked_topic' | 'required_disclaimer' | 'tone_enforcement'
  | 'pii_redaction' | 'language_restriction' | 'max_response_length'
  | 'custom_regex';

export interface CreateGuardrailPayload {
  name:        string;
  description?: string | null;
  rule_type:   RuleType;
  config?:     Record<string, unknown>;
  enabled?:    boolean;
  priority?:   number;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listGuardrails(scope: GuardrailScope, onlyEnabled = false) {
  const supabase = getSupabaseAdmin();
  let q = supabase
    .from('ai_guardrails')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('priority', { ascending: false })
    .order('created_at');
  if (onlyEnabled) q = q.eq('enabled', true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getGuardrail(scope: GuardrailScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('ai_guardrails')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createGuardrail(scope: GuardrailScope, payload: CreateGuardrailPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('ai_guardrails')
    .insert({
      id:           randomUUID(),
      tenant_id:    scope.tenantId,
      workspace_id: scope.workspaceId,
      name:         payload.name,
      description:  payload.description ?? null,
      rule_type:    payload.rule_type,
      config:       payload.config ?? {},
      enabled:      payload.enabled ?? true,
      priority:     payload.priority ?? 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateGuardrail(
  scope: GuardrailScope, id: string, payload: Partial<CreateGuardrailPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name        !== undefined) updates.name = payload.name;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.rule_type   !== undefined) updates.rule_type = payload.rule_type;
  if (payload.config      !== undefined) updates.config = payload.config;
  if (payload.enabled     !== undefined) updates.enabled = payload.enabled;
  if (payload.priority    !== undefined) updates.priority = payload.priority;

  const { data, error } = await supabase
    .from('ai_guardrails')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteGuardrail(scope: GuardrailScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('ai_guardrails')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

// ── Evaluation ────────────────────────────────────────────────────────────────

export interface GuardrailViolation {
  guardrailId:   string;
  guardrailName: string;
  ruleType:      string;
  severity:      'block' | 'warn';
  detail:        string;
}

/**
 * Evaluate a text string against all enabled guardrails for the workspace.
 * Returns a list of violations (empty = clean).
 */
export async function evaluateGuardrails(
  scope: GuardrailScope,
  text: string,
): Promise<GuardrailViolation[]> {
  const guardrails = await listGuardrails(scope, true);
  const violations: GuardrailViolation[] = [];

  for (const g of guardrails) {
    const cfg = (g.config ?? {}) as Record<string, unknown>;

    switch (g.rule_type) {
      case 'blocked_topic': {
        const keywords = (cfg.keywords as string[] | undefined) ?? [];
        const hit = keywords.find(k => text.toLowerCase().includes(k.toLowerCase()));
        if (hit) {
          violations.push({
            guardrailId:   g.id,
            guardrailName: g.name,
            ruleType:      g.rule_type,
            severity:      (cfg.severity as 'block' | 'warn' | undefined) ?? 'block',
            detail:        `Blocked topic keyword detected: "${hit}"`,
          });
        }
        break;
      }
      case 'max_response_length': {
        const maxChars = (cfg.max_chars as number | undefined) ?? 2000;
        if (text.length > maxChars) {
          violations.push({
            guardrailId:   g.id,
            guardrailName: g.name,
            ruleType:      g.rule_type,
            severity:      'warn',
            detail:        `Response exceeds max length (${text.length} > ${maxChars})`,
          });
        }
        break;
      }
      case 'custom_regex': {
        const pattern = cfg.pattern as string | undefined;
        if (pattern) {
          try {
            const re = new RegExp(pattern, 'i');
            if (re.test(text)) {
              violations.push({
                guardrailId:   g.id,
                guardrailName: g.name,
                ruleType:      g.rule_type,
                severity:      (cfg.severity as 'block' | 'warn' | undefined) ?? 'warn',
                detail:        `Custom regex pattern matched: ${pattern}`,
              });
            }
          } catch { /* invalid regex — skip */ }
        }
        break;
      }
      case 'pii_redaction': {
        // Detect common PII patterns: email, phone, credit card
        const piiPatterns = [
          /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
          /\b(?:\+?\d[\s.-]?){9,15}\b/,
          /\b(?:\d{4}[\s-]?){3}\d{4}\b/,
        ];
        const found = piiPatterns.some(p => p.test(text));
        if (found) {
          violations.push({
            guardrailId:   g.id,
            guardrailName: g.name,
            ruleType:      g.rule_type,
            severity:      'warn',
            detail:        'Potential PII detected in response',
          });
        }
        break;
      }
      // tone_enforcement, required_disclaimer, language_restriction
      // would require LLM calls — return no-op here; external evaluator handles them
      default:
        break;
    }
  }

  return violations;
}
