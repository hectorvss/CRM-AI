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
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, '[REDACTED_PHONE]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_CARD]')
    .replace(/\b(?:iban|account|acct|bank)\s*[:#]?\s*[A-Z0-9-]{6,}\b/gi, '[REDACTED_BANK]');
}

export function redactStructuredValue<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactSensitiveText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => redactStructuredValue(item)) as unknown as T;
  if (typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
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

