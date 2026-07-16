/**
 * server/agents/finAgent/escalation.ts
 *
 * Deterministic escalation rules (spec §5, "Escalamiento"). Evaluates the
 * workspace's configured rules against a context built from the conversation:
 * attributes (from the E1.5 stage), ticket classification, message text and
 * customer fields. If a rule fully matches, Fin hands off to a human instead
 * of answering.
 *
 * Field namespaces (match the editor's FIN_ESCALATION_FIELDS):
 *   finAttribute.<Name>   → triage.attributes[Name]
 *   conversation.category → ticket_type
 *   conversation.language → language
 *   messageData.*         → latest customer message (text)
 *   personData.* / companyData.* → customer.<field>
 */

export type EscOperator =
  | 'is' | 'is_not' | 'starts_with' | 'ends_with' | 'contains'
  | 'contains_exact_word' | 'does_not_contain' | 'is_unknown' | 'has_any_value';

export interface EscCondition { field: string; operator: string; value?: string }
export interface EscRule {
  id: string;
  title?: string;
  description?: string;
  active?: boolean;
  enabled?: boolean;
  conditions?: EscCondition[];
}

export interface EscContext {
  attributes: Record<string, unknown>;
  ticketType?: string;
  language?: string;
  message?: string;
  customer?: Record<string, unknown>;
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/** Resolve a namespaced field to its value from the context. */
function resolveField(field: string, ctx: EscContext): string | null {
  const f = field.trim();
  if (f.startsWith('finAttribute.')) {
    const name = f.slice('finAttribute.'.length);
    // case-insensitive attribute lookup
    const key = Object.keys(ctx.attributes).find((k) => k.toLowerCase() === name.toLowerCase());
    const val = key ? ctx.attributes[key] : undefined;
    return val == null ? null : String(val);
  }
  if (f === 'conversation.category') return ctx.ticketType ?? null;
  if (f === 'conversation.language') return ctx.language ?? null;
  if (f.startsWith('messageData.')) return ctx.message ?? null;
  if (f.startsWith('conversationData.')) return ctx.message ?? null;
  if (f.startsWith('personData.') || f.startsWith('companyData.')) {
    const key = f.split('.').slice(1).join('.');
    const val = ctx.customer?.[key];
    return val == null ? null : String(val);
  }
  return null;
}

function applyOperator(actualRaw: string | null, operator: string, valueRaw?: string): boolean {
  const actual = norm(actualRaw);
  const value = norm(valueRaw);
  const has = actualRaw != null && actual !== '';
  switch (operator as EscOperator) {
    case 'is':                  return actual === value;
    case 'is_not':              return actual !== value;
    case 'contains':            return has && actual.includes(value);
    case 'does_not_contain':    return !actual.includes(value);
    case 'starts_with':         return actual.startsWith(value);
    case 'ends_with':           return actual.endsWith(value);
    case 'contains_exact_word': return has && new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(actual);
    case 'is_unknown':          return !has;
    case 'has_any_value':       return has;
    default:                    return false;
  }
}

export interface EscMatch { ruleId: string; title: string; reason: string }

/** Returns the first active rule whose conditions ALL match, or null. */
export function evaluateEscalation(rules: EscRule[] | undefined, ctx: EscContext): EscMatch | null {
  for (const rule of rules ?? []) {
    if (rule.active === false || rule.enabled === false) continue;
    const conds = rule.conditions ?? [];
    if (!conds.length) continue; // an empty rule never fires (avoid escalating everything)
    const allMatch = conds.every((c) => applyOperator(resolveField(c.field, ctx), c.operator, c.value));
    if (allMatch) {
      const title = rule.title || rule.description || 'regla de escalamiento';
      return { ruleId: rule.id, title, reason: `fin_escalation_rule:${title}` };
    }
  }
  return null;
}
