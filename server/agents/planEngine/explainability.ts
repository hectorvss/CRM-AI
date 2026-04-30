/**
 * server/agents/planEngine/explainability.ts
 *
 * Builds a structured reasoning trail from a Plan + ExecutionTrace.
 *
 * The Super Agent already records *what* happened. Explainability records
 * *why* — surfacing:
 *   - The high-level intent the LLM inferred from the user message
 *   - Per-step rationale (already present in PlanStep.rationale)
 *   - Signals that triggered the decision (e.g. fraud_flag, sla_breach)
 *   - Policy decisions per step (allow / require_approval / deny)
 *   - Risk distribution across the plan
 *   - Notable side-effects observed (compensations, partial failures)
 *
 * The output is a `ReasoningTrail` object that the response builder attaches
 * to the chat payload so the UI can render an "Explain" panel.
 */

import type { Plan, ExecutionTrace, ExecutionSpan, RiskLevel } from './types.js';

export interface ReasoningStepEntry {
  stepId: string;
  tool: string;
  rationale: string;
  riskLevel: RiskLevel;
  outcome: 'success' | 'failed' | 'pending_approval' | 'skipped' | 'rejected';
  observation?: string;
  durationMs?: number;
  /** When the step was a write or external call, surface what was changed. */
  sideEffectSummary?: string;
}

export interface ReasoningSignal {
  source: string;
  observation: string;
  weight: 'low' | 'medium' | 'high';
}

export interface ReasoningTrail {
  /** One-paragraph "why" — derived from plan.rationale + LLM narrative. */
  summary: string;
  /** The user intent the LLM committed to. */
  intent: string;
  /** Confidence the LLM expressed in its plan (0..1). */
  confidence: number;
  /** Whether human approval was required (and if so why). */
  approvalRequired: boolean;
  approvalReasons: string[];
  /** Signals from data that pushed the agent toward the chosen plan. */
  signals: ReasoningSignal[];
  /** Per-step rationale + outcome. */
  steps: ReasoningStepEntry[];
  /** Aggregated risk picture. */
  riskProfile: {
    distribution: Record<RiskLevel, number>;
    maxRisk: RiskLevel;
  };
  /** Notable observations: compensations triggered, partial failures, retries. */
  notes: string[];
  /** Plain-text version usable for narration / TTS. */
  spokenExplanation: string;
}

const RISK_RANK: Record<RiskLevel, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

// ── Public API ───────────────────────────────────────────────────────────────

export function buildReasoningTrail(input: {
  userMessage: string;
  plan?: Plan | null;
  trace?: ExecutionTrace | null;
  narrative?: string;
}): ReasoningTrail {
  const { plan, trace } = input;

  // ── Intent + summary ─────────────────────────────────────────────────────
  const intent = inferIntentFromMessage(input.userMessage);
  const summary = pickSummary({
    planRationale: plan?.rationale,
    narrative: input.narrative,
    traceSummary: trace?.summary,
  });

  const confidence = typeof plan?.confidence === 'number' ? plan.confidence : 0;

  // ── Approval reasoning ───────────────────────────────────────────────────
  const approvalReasons: string[] = [];
  const policyDecisions = trace?.policyDecisions ?? [];
  for (const dec of policyDecisions) {
    if (dec.action === 'require_approval') approvalReasons.push(`${dec.tool}: ${dec.reason}`);
    if (dec.action === 'deny') approvalReasons.push(`${dec.tool} denied — ${dec.reason}`);
  }
  const approvalRequired = trace?.status === 'pending_approval' || (plan?.needsApproval ?? false);

  // ── Per-step entries ─────────────────────────────────────────────────────
  const spans = trace?.spans ?? [];
  const planSteps = plan?.steps ?? [];
  const steps: ReasoningStepEntry[] = spans.map((span) => {
    const planStep = planSteps.find((s) => s.id === span.stepId);
    const decision = policyDecisions.find((d) => d.stepId === span.stepId);
    return {
      stepId: span.stepId,
      tool: span.tool,
      rationale: planStep?.rationale || decision?.reason || 'No rationale recorded',
      riskLevel: span.riskLevel,
      outcome: classifyOutcome(span, decision?.action),
      observation: extractObservation(span),
      durationMs: span.latencyMs,
      sideEffectSummary: extractSideEffectSummary(span),
    };
  });

  // ── Signals ──────────────────────────────────────────────────────────────
  const signals = extractSignals(spans);

  // ── Risk profile ─────────────────────────────────────────────────────────
  const distribution: Record<RiskLevel, number> = { none: 0, low: 0, medium: 0, high: 0, critical: 0 };
  let maxRisk: RiskLevel = 'none';
  for (const span of spans) {
    distribution[span.riskLevel] = (distribution[span.riskLevel] ?? 0) + 1;
    if (RISK_RANK[span.riskLevel] > RISK_RANK[maxRisk]) maxRisk = span.riskLevel;
  }

  // ── Notes (compensations, partial failures, dry-run, etc.) ───────────────
  const notes: string[] = [];
  const compensationSpans = spans.filter((s) => s.stepId.startsWith('compensate_'));
  if (compensationSpans.length > 0) {
    notes.push(`Auto-rollback fired on ${compensationSpans.length} step(s) after a downstream failure.`);
  }
  if (trace?.status === 'partial') {
    const failed = spans.filter((s) => !s.result.ok && !s.stepId.startsWith('compensate_')).length;
    notes.push(`Plan completed partially — ${failed} step(s) failed.`);
  }
  if (trace?.status === 'rejected_by_policy') {
    notes.push('Policy engine rejected one or more steps before execution.');
  }
  if (spans.some((s) => s.dryRun)) {
    notes.push('Run was a dry-run — no persistent side effects were applied.');
  }

  // ── Spoken explanation ────────────────────────────────────────────────────
  const spokenExplanation = buildSpokenExplanation({
    intent,
    summary,
    steps,
    approvalRequired,
    notes,
  });

  return {
    summary,
    intent,
    confidence,
    approvalRequired,
    approvalReasons,
    signals,
    steps,
    riskProfile: { distribution, maxRisk },
    notes,
    spokenExplanation,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function classifyOutcome(span: ExecutionSpan, decision?: string): ReasoningStepEntry['outcome'] {
  if (decision === 'deny') return 'rejected';
  if (decision === 'require_approval') return 'pending_approval';
  if (!span.result) return 'skipped';
  if (span.result.ok) return 'success';
  return 'failed';
}

function extractObservation(span: ExecutionSpan): string | undefined {
  if (!span.result) return 'No result recorded';
  if (!span.result.ok) return span.result.error || 'Unspecified failure';
  const v = span.result.value as any;
  if (!v) return undefined;
  // Try common fields
  if (typeof v === 'string') return v.slice(0, 160);
  if (Array.isArray(v)) return `Returned ${v.length} item(s)`;
  if (v.totalHits != null) return `${v.totalHits} hit(s) found`;
  if (v.total != null && v.succeeded != null) return `${v.succeeded}/${v.total} succeeded`;
  if (v.status) return `Status → ${String(v.status)}`;
  if (v.id) return `Returned record ${String(v.id)}`;
  return undefined;
}

function extractSideEffectSummary(span: ExecutionSpan): string | undefined {
  if (!span.result?.ok) return undefined;
  const tool = span.tool;
  const v = span.result.value as any;
  if (!v) return undefined;

  // Common write tools
  if (tool === 'case.update_status') return `Case ${v.caseId || ''} → ${v.status || ''}`.trim();
  if (tool === 'case.update_priority') return `Case ${v.caseId || ''} priority → ${v.priority || ''}`.trim();
  if (tool === 'case.add_note') return `Internal note added to case ${v.caseId || ''}`.trim();
  if (tool === 'order.cancel') return `Order ${v.orderId || ''} cancelled (${v.executedVia || 'db'})`.trim();
  if (tool === 'payment.refund') return `Refund issued for payment ${v.paymentId || ''}`.trim();
  if (tool === 'message.send_to_customer') return `Message sent via ${v.channel || ''}${v.simulated ? ' (simulated)' : ''}`.trim();
  if (tool.startsWith('case.bulk_') || tool.startsWith('order.bulk_')) {
    return `Bulk: ${v.succeeded ?? '?'}/${v.total ?? '?'} succeeded`;
  }
  if (tool === 'playbook.execute') return `Playbook ${v.playbookId || ''} → ${v.status || ''}`.trim();
  return undefined;
}

function extractSignals(spans: ExecutionSpan[]): ReasoningSignal[] {
  const signals: ReasoningSignal[] = [];

  for (const span of spans) {
    if (!span.result?.ok) continue;
    const v = span.result.value as any;
    if (!v) continue;

    // Look at returned data for common risk markers
    if (typeof v === 'object') {
      const candidates = [v, v.case, v.customer, v.order, v.payment].filter(Boolean);
      for (const c of candidates) {
        if (c.fraud_flag) signals.push({ source: span.tool, observation: 'fraud_flag is set on the entity', weight: 'high' });
        if (c.sla_status === 'breached') signals.push({ source: span.tool, observation: 'SLA already breached on this case', weight: 'high' });
        if (c.sla_status === 'at_risk') signals.push({ source: span.tool, observation: 'SLA is at risk', weight: 'medium' });
        if (c.risk_level === 'critical') signals.push({ source: span.tool, observation: 'Entity is classified as critical risk', weight: 'high' });
        if (c.risk_level === 'high') signals.push({ source: span.tool, observation: 'Entity is classified as high risk', weight: 'medium' });
        if (typeof c.refund_rate === 'number' && c.refund_rate > 0.3) {
          signals.push({ source: span.tool, observation: `Refund rate is ${Math.round(c.refund_rate * 100)}%`, weight: 'medium' });
        }
        if (typeof c.dispute_rate === 'number' && c.dispute_rate > 0.2) {
          signals.push({ source: span.tool, observation: `Dispute rate is ${Math.round(c.dispute_rate * 100)}%`, weight: 'medium' });
        }
        if (typeof c.chargeback_count === 'number' && c.chargeback_count >= 2) {
          signals.push({ source: span.tool, observation: `${c.chargeback_count} chargebacks on record`, weight: 'high' });
        }
        if (c.conflict_detected) signals.push({ source: span.tool, observation: 'Cross-system conflict detected', weight: 'high' });
      }
    }
  }

  // Dedupe by observation text
  const seen = new Set<string>();
  return signals.filter((s) => {
    if (seen.has(s.observation)) return false;
    seen.add(s.observation);
    return true;
  });
}

function inferIntentFromMessage(message: string): string {
  const m = (message || '').toLowerCase().trim();
  if (!m) return 'No user message';
  // Cheap classification — the LLM's full intent is captured in the plan.rationale.
  if (/refund|reembolso|devolver/.test(m)) return 'Issue a refund / process a return';
  if (/cancel|cancelar/.test(m)) return 'Cancel an order or transaction';
  if (/resolv|cerrar|close|resolver/.test(m)) return 'Resolve / close a case';
  if (/fraud|fraude/.test(m)) return 'Investigate or respond to fraud';
  if (/churn|retain|recover|recuperar/.test(m)) return 'Retain a customer at risk';
  if (/notif|message|email|whatsapp|sms|enviar mensaje/.test(m)) return 'Send a notification to a customer';
  if (/show|list|find|search|busca|muestra/.test(m)) return 'Investigate / look something up';
  if (/update|change|modify|cambiar|actualizar/.test(m)) return 'Modify state on an entity';
  return m.length > 100 ? m.slice(0, 97) + '…' : m;
}

function pickSummary(input: { planRationale?: string; narrative?: string; traceSummary?: string }): string {
  return (
    input.planRationale?.trim()
    || input.narrative?.trim()
    || input.traceSummary?.trim()
    || 'No reasoning recorded for this run.'
  );
}

function buildSpokenExplanation(input: {
  intent: string;
  summary: string;
  steps: ReasoningStepEntry[];
  approvalRequired: boolean;
  notes: string[];
}): string {
  const parts: string[] = [];
  parts.push(`I understood the goal as: ${input.intent}.`);
  if (input.summary) parts.push(input.summary);
  if (input.steps.length === 0) {
    parts.push('No tool steps were executed.');
  } else {
    const ok = input.steps.filter((s) => s.outcome === 'success').length;
    const failed = input.steps.filter((s) => s.outcome === 'failed').length;
    parts.push(
      `I ran ${input.steps.length} step${input.steps.length !== 1 ? 's' : ''}: ${ok} succeeded${failed ? `, ${failed} failed` : ''}.`,
    );
  }
  if (input.approvalRequired) {
    parts.push('Some action${s} require human approval before they can take effect.');
  }
  if (input.notes.length > 0) {
    parts.push(input.notes.join(' '));
  }
  return parts.join(' ');
}
