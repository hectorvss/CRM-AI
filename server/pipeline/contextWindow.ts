/**
 * server/pipeline/contextWindow.ts
 *
 * Context Window builder.
 *
 * Aggregates every piece of information about a case into a single structured
 * object. This is the "global state" that the Inbox copilot, AI diagnosis,
 * and all agents read from. It is built on demand and never stored — always
 * derived fresh from the DB so it reflects the latest state.
 */

import { createCaseRepository } from '../data/cases.js';
import { requireScope } from '../lib/scope.js';

// ── Output types ─────────────────────────────────────────────────────────────

export interface CWCustomer {
  id:           string;
  name:         string | null;
  email:        string | null;
  segment:      string;
  riskLevel:    string;
  ltv:          number;
  totalOrders:  number;
  disputeRate:  number;
  refundRate:   number;
  chargebacks:  number;
  linkedIds:    Array<{ system: string; externalId: string }>;
}

export interface CWOrder {
  id:             string;
  externalId:     string;
  status:         string;
  amount:         number;
  currency:       string;
  systemStates:   Record<string, string>;
  hasConflict:    boolean;
  conflictDomain: string | null;
  conflictDetail: string | null;
  recommendation: string | null;
  createdAt:      string;
}

export interface CWPayment {
  id:            string;
  externalId:    string | null;
  status:        string;
  amount:        number;
  currency:      string;
  psp:           string;
  refundAmount:  number;
  disputeId:     string | null;
  systemStates:  Record<string, string>;
  hasConflict:   boolean;
}

export interface CWReturn {
  id:              string;
  externalId:      string | null;
  status:          string;
  inspectionStatus: string | null;
  refundStatus:    string | null;
  carrierStatus:   string | null;
  systemStates:    Record<string, string>;
}

export interface CWMessage {
  id:         string;
  type:       string;
  sender:     string | null;
  content:    string;
  sentAt:     string;
  sentiment:  string | null;
}

export interface CWConflict {
  id:                string;
  domain:            string;
  severity:          string;
  conflictingSystems: string[];
  expectedState:     string | null;
  actualStates:      Record<string, string>;
  sourceOfTruth:     string | null;
}

export interface CWCase {
  id:           string;
  caseNumber:   string;
  type:         string;
  status:       string;
  priority:     string;
  riskLevel:    string;
  intent:       string | null;
  intentConf:   number | null;
  approvalState: string;
  executionState: string;
  slaDue:       string | null;
  slaStatus:    string;
  tags:         string[];
  aiDiagnosis:  string | null;
  aiRootCause:  string | null;
  aiConfidence: number | null;
  aiRecommendedAction: string | null;
  createdAt:    string;
  lastActivity: string;
}

export interface CWCopilot {
  summary:        string;
  rootCause:      string | null;
  recommendation: string | null;
  draftReply:     string | null;
  conflictCount:  number;
  requiresApproval: boolean;
  confidence:     number | null;
}

export interface ContextWindow {
  case:      CWCase;
  customer:  CWCustomer | null;
  orders:    CWOrder[];
  payments:  CWPayment[];
  returns:   CWReturn[];
  messages:  CWMessage[];
  conflicts: CWConflict[];
  copilot:   CWCopilot;
  builtAt:   string;
  toPromptString(): string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeJson<T>(raw: any, fallback: T): T {
  if (!raw) return fallback;
  if (typeof raw === 'object') return raw as T;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ── Builder ───────────────────────────────────────────────────────────────────

export async function buildContextWindow(caseId: string, tenantId: string, workspaceId: string): Promise<ContextWindow | null> {
  const caseRepo = createCaseRepository();
  const bundle = await caseRepo.getBundle(requireScope({ tenantId, workspaceId }, 'contextWindow'), caseId);

  if (!bundle) return null;

  const caseRow = bundle.case;

  const cwCase: CWCase = {
    id:            caseRow.id,
    caseNumber:    caseRow.case_number,
    type:          caseRow.type,
    status:        caseRow.status,
    priority:      caseRow.priority,
    riskLevel:     caseRow.risk_level,
    intent:        caseRow.intent,
    intentConf:    caseRow.intent_confidence,
    approvalState: caseRow.approval_state,
    executionState: caseRow.execution_state,
    slaDue:        caseRow.sla_resolution_deadline,
    slaStatus:     caseRow.sla_status,
    tags:          safeJson<string[]>(caseRow.tags, []),
    aiDiagnosis:   caseRow.ai_diagnosis,
    aiRootCause:   caseRow.ai_root_cause,
    aiConfidence:  caseRow.ai_confidence,
    aiRecommendedAction: caseRow.ai_recommended_action,
    createdAt:     caseRow.created_at,
    lastActivity:  caseRow.last_activity_at,
  };

  // ── Customer ──────────────────────────────────────────────────────────────
  let cwCustomer: CWCustomer | null = null;

  if (bundle.customer) {
    cwCustomer = {
      id:          bundle.customer.id,
      name:        bundle.customer.canonical_name,
      email:       bundle.customer.canonical_email,
      segment:     bundle.customer.segment,
      riskLevel:   bundle.customer.risk_level,
      ltv:         bundle.customer.lifetime_value ?? 0,
      totalOrders: bundle.customer.total_orders   ?? 0,
      disputeRate: bundle.customer.dispute_rate   ?? 0,
      refundRate:  bundle.customer.refund_rate    ?? 0,
      chargebacks: bundle.customer.chargeback_count ?? 0,
      linkedIds:   (bundle.linked_identities ?? []).map((r: any) => ({ system: r.system, externalId: r.external_id })),
    };
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  const cwOrders: CWOrder[] = (bundle.orders ?? []).map((o: any) => ({
    id:             o.id,
    externalId:     o.external_order_id,
    status:         o.status,
    amount:         o.total_amount,
    currency:       o.currency,
    systemStates:   safeJson<Record<string, string>>(o.system_states, {}),
    hasConflict:    !!o.has_conflict,
    conflictDomain: o.conflict_domain,
    conflictDetail: o.conflict_detected,
    recommendation: o.recommended_action,
    createdAt:      o.created_at,
  }));

  // ── Payments ──────────────────────────────────────────────────────────────
  const cwPayments: CWPayment[] = (bundle.payments ?? []).map((p: any) => ({
    id:           p.id,
    externalId:   p.external_payment_id,
    status:       p.status,
    amount:       p.amount,
    currency:     p.currency,
    psp:          p.psp,
    refundAmount: p.refund_amount ?? 0,
    disputeId:    p.dispute_id,
    systemStates: safeJson<Record<string, string>>(p.system_states, {}),
    hasConflict:  !!p.conflict_detected,
  }));

  // ── Returns ───────────────────────────────────────────────────────────────
  const cwReturns: CWReturn[] = (bundle.returns ?? []).map((r: any) => ({
    id:               r.id,
    externalId:       r.external_return_id,
    status:           r.status,
    inspectionStatus: r.inspection_status,
    refundStatus:     r.refund_status,
    carrierStatus:    r.carrier_status,
    systemStates:     safeJson<Record<string, string>>(r.system_states, {}),
  }));

  // ── Messages ──────────────────────────────────────────────────────────────
  const cwMessages: CWMessage[] = (bundle.messages ?? []).slice(0, 50).map((m: any) => ({
    id:        m.id,
    type:      m.type,
    sender:    m.sender_name,
    content:   m.content,
    sentAt:    m.sent_at,
    sentiment: m.sentiment,
  }));

  // ── Reconciliation conflicts ──────────────────────────────────────────────
  const cwConflicts: CWConflict[] = (bundle.reconciliation_issues ?? [])
    .filter((r: any) => r.status === 'open')
    .map((r: any) => ({
      id:                 r.id,
      domain:             r.conflict_domain,
      severity:           r.severity,
      conflictingSystems: safeJson<string[]>(r.conflicting_systems, []),
      expectedState:      r.expected_state,
      actualStates:       safeJson<Record<string, string>>(r.actual_states, {}),
      sourceOfTruth:      r.source_of_truth_system,
    }));

  // ── Draft reply ───────────────────────────────────────────────────────────
  const draftReply = (bundle.drafts ?? [])[0]?.content ?? null;

  // ── Build copilot summary ─────────────────────────────────────────────────
  const conflictCount   = cwConflicts.length;
  const requiresApproval = caseRow.approval_state === 'required' ||
                            caseRow.approval_state === 'pending';

  let summary = caseRow.ai_diagnosis ?? buildAutoSummary(cwCase, cwCustomer, cwOrders, cwPayments, cwConflicts);

  const cwCopilot: CWCopilot = {
    summary,
    rootCause:       caseRow.ai_root_cause,
    recommendation:  caseRow.ai_recommended_action,
    draftReply,
    conflictCount,
    requiresApproval,
    confidence:      caseRow.ai_confidence,
  };

  // ── Assemble ──────────────────────────────────────────────────────────────
  const builtAt = new Date().toISOString();

  return {
    case:      cwCase,
    customer:  cwCustomer,
    orders:    cwOrders,
    payments:  cwPayments,
    returns:   cwReturns,
    messages:  cwMessages,
    conflicts: cwConflicts,
    copilot:   cwCopilot,
    builtAt,
    toPromptString() {
      return buildPromptString(this);
    },
  };
}

// ── Auto summary (before AI diagnosis runs) ──────────────────────────────────

function buildAutoSummary(
  c: CWCase,
  customer: CWCustomer | null,
  orders: CWOrder[],
  payments: CWPayment[],
  conflicts: CWConflict[]
): string {
  const parts: string[] = [];

  parts.push(`Case ${c.caseNumber}: ${c.type.replace(/_/g, ' ')} — ${c.status}`);

  if (customer) {
    parts.push(`Customer: ${customer.name ?? customer.email ?? 'Unknown'} (${customer.segment})`);
  }

  if (orders.length) {
    const conflicted = orders.filter(o => o.hasConflict);
    parts.push(`Orders: ${orders.length} (${conflicted.length} with conflicts)`);
  }

  if (payments.length) {
    const refunded = payments.filter(p => p.refundAmount > 0);
    const disputed = payments.filter(p => p.disputeId);
    parts.push(`Payments: ${payments.length}${refunded.length ? `, ${refunded.length} refunded` : ''}${disputed.length ? `, ${disputed.length} disputed` : ''}`);
  }

  if (conflicts.length) {
    parts.push(`⚠️ ${conflicts.length} active conflict(s): ${conflicts.map(c => c.domain).join(', ')}`);
  }

  return parts.join(' | ');
}

// ── Prompt string serialiser ────────────────────────────────────────────────

function buildPromptString(ctx: Omit<ContextWindow, 'toPromptString' | 'builtAt'>): string {
  const lines: string[] = [];

  lines.push(`=== CASE ${ctx.case.caseNumber} ===`);
  lines.push(`Type: ${ctx.case.type} | Status: ${ctx.case.status} | Priority: ${ctx.case.priority} | Risk: ${ctx.case.riskLevel}`);
  lines.push(`Intent: ${ctx.case.intent ?? 'unknown'} (confidence: ${ctx.case.intentConf ?? '?'})`);
  lines.push(`SLA: ${ctx.case.slaStatus} | Due: ${ctx.case.slaDue ?? 'N/A'}`);

  if (ctx.customer) {
    lines.push('');
    lines.push('=== CUSTOMER ===');
    lines.push(`Name: ${ctx.customer.name ?? 'N/A'} | Email: ${ctx.customer.email ?? 'N/A'}`);
    lines.push(`Segment: ${ctx.customer.segment} | Risk: ${ctx.customer.riskLevel} | LTV: $${ctx.customer.ltv}`);
    lines.push(`Orders: ${ctx.customer.totalOrders} | Dispute rate: ${ctx.customer.disputeRate} | Refund rate: ${ctx.customer.refundRate}`);
    if (ctx.customer.linkedIds.length) {
      lines.push(`Linked IDs: ${ctx.customer.linkedIds.map(l => `${l.system}:${l.externalId}`).join(', ')}`);
    }
  }

  if (ctx.orders.length) {
    lines.push('');
    lines.push('=== ORDERS ===');
    for (const o of ctx.orders) {
      lines.push(`${o.externalId}: ${o.status} | $${o.amount} ${o.currency}`);
      lines.push(`  System states: ${JSON.stringify(o.systemStates)}`);
      if (o.hasConflict) lines.push(`  ⚠️ CONFLICT [${o.conflictDomain}]: ${o.conflictDetail}`);
      if (o.recommendation) lines.push(`  Recommended: ${o.recommendation}`);
    }
  }

  if (ctx.payments.length) {
    lines.push('');
    lines.push('=== PAYMENTS ===');
    for (const p of ctx.payments) {
      lines.push(`${p.externalId ?? p.id}: ${p.status} | $${p.amount} ${p.currency} via ${p.psp}`);
      if (p.refundAmount > 0) lines.push(`  Refunded: $${p.refundAmount}`);
      if (p.disputeId) lines.push(`  ⚠️ DISPUTE: ${p.disputeId}`);
      if (p.hasConflict) lines.push(`  ⚠️ PAYMENT CONFLICT`);
    }
  }

  if (ctx.returns.length) {
    lines.push('');
    lines.push('=== RETURNS ===');
    for (const r of ctx.returns) {
      lines.push(`${r.externalId ?? r.id}: ${r.status}`);
      if (r.inspectionStatus) lines.push(`  Inspection: ${r.inspectionStatus}`);
      if (r.refundStatus)     lines.push(`  Refund status: ${r.refundStatus}`);
      if (r.carrierStatus)    lines.push(`  Carrier: ${r.carrierStatus}`);
    }
  }

  if (ctx.conflicts.length) {
    lines.push('');
    lines.push('=== ACTIVE CONFLICTS ===');
    for (const c of ctx.conflicts) {
      lines.push(`[${c.severity.toUpperCase()}] ${c.domain}`);
      lines.push(`  Conflicting systems: ${c.conflictingSystems.join(' vs ')}`);
      lines.push(`  Expected: ${c.expectedState ?? 'N/A'} | Actual: ${JSON.stringify(c.actualStates)}`);
      if (c.sourceOfTruth) lines.push(`  Source of truth: ${c.sourceOfTruth}`);
    }
  }

  if (ctx.messages.length) {
    lines.push('');
    lines.push('=== CONVERSATION ===');
    for (const m of ctx.messages.slice(-10)) {  // last 10 messages
      const label = m.type === 'customer' ? 'CUSTOMER' : m.type === 'agent' ? 'AGENT' : m.type.toUpperCase();
      lines.push(`[${label}] ${m.content}`);
    }
  }

  return lines.join('\n');
}
