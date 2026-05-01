/**
 * server/agents/planEngine/safety.ts
 *
 * Shared safety helpers for the Super Agent runtime.
 *
 * Responsibilities:
 *  - Parse tool kill-switches from env.
 *  - Redact sensitive data before LLM context construction.
 *  - Provide lightweight risk heuristics for plan execution.
 */

import type { RiskLevel } from './types.js';

function parseList(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

const toolBlocklist = parseList(
  process.env.SUPER_AGENT_BLOCKED_TOOLS
    || process.env.SUPER_AGENT_DISABLED_TOOLS
    || '',
);

const riskRank: Record<RiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return riskRank[b] > riskRank[a] ? b : a;
}

const sensitiveKeyPattern = /(secret|token|password|passwd|api[_-]?key|apikey|private[_-]?key|client[_-]?secret|refresh[_-]?token|access[_-]?token|session[_-]?token|jwt|bearer|ssn|social[_-]?security|passport|driver[_-]?license|license[_-]?number|id[_-]?number)/i;
const jwtPattern = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const apiKeyPattern = /\b(?:sk|rk|pk|ak|ghp|gho|ghu|ghs|ghr|xox[pbar]-)[A-Za-z0-9._-]{8,}\b/gi;
const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;
const driverLicensePattern = /\b(?:DL|DNI|ID|LIC|LICENSE)[-_ ]?[A-Z0-9]{5,}\b/gi;

export function isToolBlocked(toolName: string): boolean {
  return toolBlocklist.has(toolName);
}

export function listBlockedTools(): string[] {
  return Array.from(toolBlocklist.values());
}

export function redactSensitiveText(input: string): string {
  if (!input) return input;

  return input
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_CARD]')
    .replace(ssnPattern, '[REDACTED_SSN]')
    .replace(jwtPattern, '[REDACTED_JWT]')
    .replace(apiKeyPattern, '[REDACTED_API_KEY]')
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, '[REDACTED_PHONE]')
    .replace(/\b(?:iban|account|acct|bank)\s*[:#]?\s*[A-Z0-9-]{6,}\b/gi, '[REDACTED_BANK]')
    .replace(/\b(?:passport|pass(?:port)?\s*no\.?|document(?:o)?\s*no\.?|doc(?:ument)?\s*no\.?)\s*[:#]?\s*[A-Z0-9-]{5,}\b/gi, '[REDACTED_ID]')
    .replace(driverLicensePattern, '[REDACTED_LICENSE]');
}

export function redactStructuredValue<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactSensitiveText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => redactStructuredValue(item)) as unknown as T;
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKeyPattern.test(key)) {
      out[key] = '[REDACTED_SECRET]';
      continue;
    }
    out[key] = redactStructuredValue(nested);
  }
  return out as T;
}

export function classifyRiskFromArgs(toolName: string, args: unknown): RiskLevel {
  const text = redactSensitiveText(JSON.stringify(args ?? {})).toLowerCase();

  let risk: RiskLevel = 'low';
  if (/(card|iban|bank|account|chargeback|dispute)/.test(text)) risk = 'high';
  if (/(amount[^0-9]{0,8}\d{4,}|refund|cancel|publish|approve|reject|delete|remove)/.test(text)) {
    risk = maxRisk(risk, 'medium');
  }
  if (toolName.includes('refund') || toolName.includes('cancel') || toolName.includes('publish')) {
    risk = maxRisk(risk, 'medium');
  }
  if (/(mass|bulk|all records|every record|multiple)/.test(text)) {
    risk = maxRisk(risk, 'high');
  }
  return risk;
}

export function classifyRiskFromPlanSignal(toolName: string, args: unknown): RiskLevel {
  const text = redactSensitiveText(JSON.stringify(args ?? {})).toLowerCase();

  if (toolName === 'payment.refund') {
    const amount = Number((args as any)?.amount ?? 0);
    if (!Number.isNaN(amount) && amount > 50) return 'high';
    return 'high';
  }

  if (toolName === 'order.cancel') {
    const status = String((args as any)?.currentStatus ?? '').toLowerCase();
    if (status.includes('packed') || status.includes('shipped') || status.includes('delivered')) return 'high';
    return 'medium';
  }

  if (toolName === 'approval.decide') {
    return 'high';
  }

  if (toolName === 'workflow.publish') {
    return 'high';
  }

  if (toolName === 'agent.run') {
    const slug = String((args as any)?.agentSlug ?? '').toLowerCase();
    if (/(refund|payment|finance|fraud|escalat|approval|policy|workflow|settings|integration|connector)/.test(slug)) {
      return 'high';
    }
    return 'medium';
  }

  if (toolName.startsWith('settings.') && toolName.includes('.')) {
    return 'high';
  }

  if (toolName.startsWith('return.')) {
    if (toolName === 'return.approve' || toolName === 'return.reject') return 'medium';
    if (toolName === 'return.update_status') return 'low';
    return 'none';
  }

  if (toolName.startsWith('knowledge.')) {
    return 'none';
  }

  if (toolName.startsWith('case.')) {
    if (toolName === 'case.update_status' && /(escalat|closed|resolved)/.test(text)) return 'medium';
    if (toolName === 'case.add_note') return 'low';
  }

  return classifyRiskFromArgs(toolName, args);
}
