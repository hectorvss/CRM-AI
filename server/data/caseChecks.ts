/**
 * server/data/caseChecks.ts
 *
 * "Check actions" engine for the Case Graph.
 *
 * For every case, the SaaS runs a fixed set of automated checks across each
 * category — order verification, payment reconciliation, RMA tracking,
 * approval status, integration health, knowledge linkage, etc. — and tags
 * each result with a traffic-light semaphore:
 *
 *   pass  → ✅ green   the check ran and the state is correct
 *   warn  → ⚠️ amber   the check ran but the result is ambiguous / pending
 *   fail  → ❌ red     the check ran and detected a real problem
 *   skip  → ⚪ grey    not applicable (e.g. no orders linked, no return yet)
 *
 * This module is the single source of truth for what the Tree View, the
 * Timeline, and the Resolve panel render. It's deterministic: same bundle
 * in, same checks out — no LLM, no flakiness.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';

export type CheckCategory =
  | 'orders'
  | 'payments'
  | 'returns'
  | 'refunds'
  | 'approvals'
  | 'reconciliation'
  | 'knowledge'
  | 'ai_studio'
  | 'workflows'
  | 'integrations'
  | 'conversation'
  | 'notes'
  | 'linked_cases';

export interface CaseCheck {
  id: string;
  category: CheckCategory;
  label: string;          // What was checked (one-liner)
  status: CheckStatus;
  detail?: string;        // Optional human-readable explanation
  evidence?: string[];    // External refs / IDs / row ids
  at?: string | null;     // ISO timestamp the underlying state changed
}

const CATEGORY_LABELS: Record<CheckCategory, string> = {
  orders: 'Orders',
  payments: 'Payments',
  returns: 'Returns',
  refunds: 'Refunds',
  approvals: 'Approvals',
  reconciliation: 'Reconciliation',
  knowledge: 'Knowledge',
  ai_studio: 'AI Studio',
  workflows: 'Workflows',
  integrations: 'Integrations',
  conversation: 'Conversation',
  notes: 'Internal Notes',
  linked_cases: 'Linked Cases',
};

function lc(value: any): string {
  return String(value ?? '').toLowerCase();
}

function statusFromSeverity(sev: any): CheckStatus {
  const s = lc(sev);
  if (s === 'critical' || s === 'blocked' || s === 'failed' || s === 'fail') return 'fail';
  if (s === 'warning' || s === 'pending' || s === 'open' || s === 'awaiting' || s === 'awaiting_approval' || s === 'unresolved') return 'warn';
  if (s === 'healthy' || s === 'ok' || s === 'success' || s === 'completed' || s === 'resolved' || s === 'closed' || s === 'sent' || s === 'delivered') return 'pass';
  return 'warn';
}

function summariseCheck(label: string, status: CheckStatus, detail?: string): string {
  const tag = status === 'pass' ? '[OK]' : status === 'warn' ? '[CHECK]' : status === 'fail' ? '[ISSUE]' : '[N/A]';
  return detail ? `${tag} ${label} — ${detail}` : `${tag} ${label}`;
}

// ── Per-category check builders ──────────────────────────────────────────────

function checkOrders(bundle: any): CaseCheck[] {
  const orders = bundle.orders ?? [];
  const events = bundle.order_events ?? [];
  const lineItems = bundle.order_line_items ?? [];
  const payments = bundle.payments ?? [];
  const refunds = bundle.refunds ?? [];
  const checks: CaseCheck[] = [];

  if (!orders.length) {
    checks.push({ id: 'orders.linkage', category: 'orders', label: 'Order linked to case', status: 'skip', detail: 'No orders attached to this case.' });
    return checks;
  }

  for (const o of orders) {
    const ext = o.external_order_id || o.id;
    checks.push({
      id: `orders.fetch.${o.id}`,
      category: 'orders',
      label: `Fetched ${ext} from ${o.source_system || 'OMS'}`,
      status: 'pass',
      detail: `${o.source_system || 'OMS'} returned the order with status "${o.status || 'unknown'}".`,
      evidence: [ext],
      at: o.updated_at || o.created_at,
    });

    const fulfStatus = lc(o.fulfillment_status);
    const fulfFail = ['cancelled', 'failed', 'lost', 'damaged'].includes(fulfStatus);
    const fulfWarn = ['pending', 'in_transit', 'awaiting_pickup', 'partial'].includes(fulfStatus);
    checks.push({
      id: `orders.fulfillment.${o.id}`,
      category: 'orders',
      label: 'Fulfillment status verified',
      status: fulfFail ? 'fail' : fulfWarn ? 'warn' : 'pass',
      detail: `fulfillment_status = ${o.fulfillment_status || 'n/a'}${o.tracking_number ? ` (tracking ${o.tracking_number})` : ''}`,
      evidence: [o.tracking_number, o.tracking_url].filter(Boolean) as string[],
      at: o.updated_at,
    });

    const orderEvents = events.filter((e: any) => e.order_id === o.id);
    const cancelled = orderEvents.some((e: any) => /cancel|refund|dispute/i.test(e.type || ''));
    if (orderEvents.length) {
      checks.push({
        id: `orders.events.${o.id}`,
        category: 'orders',
        label: `Order events scanned (${orderEvents.length})`,
        status: cancelled ? 'fail' : 'pass',
        detail: cancelled ? 'A cancellation/refund event was detected on this order.' : `${orderEvents.length} event(s) recorded.`,
        evidence: orderEvents.slice(0, 3).map((e: any) => `${e.type}@${e.created_at}`),
        at: orderEvents[0]?.created_at,
      });
    }

    const orderLines = lineItems.filter((li: any) => li.order_id === o.id);
    if (orderLines.length) {
      const out = orderLines.find((li: any) => Number(li.quantity_outstanding) > 0);
      checks.push({
        id: `orders.line_items.${o.id}`,
        category: 'orders',
        label: `Line items reconciled (${orderLines.length})`,
        status: out ? 'warn' : 'pass',
        detail: out ? `Outstanding quantity remains on at least one line item.` : 'All line items closed.',
        at: o.updated_at,
      });
    }

    const orderPayments = payments.filter((p: any) => p.order_id === o.id);
    checks.push({
      id: `orders.payment_link.${o.id}`,
      category: 'orders',
      label: 'Payment linkage verified',
      status: orderPayments.length ? 'pass' : 'warn',
      detail: orderPayments.length
        ? `${orderPayments.length} payment(s) linked.`
        : 'No payment row references this order yet.',
      evidence: orderPayments.map((p: any) => p.external_payment_id || p.id),
      at: orderPayments[0]?.created_at || o.created_at,
    });

    const orderRefunds = refunds.filter((r: any) => r.order_id === o.id);
    if (orderRefunds.length) {
      const blocked = orderRefunds.find((r: any) => ['blocked', 'failed', 'disputed'].includes(lc(r.status)));
      checks.push({
        id: `orders.refund_link.${o.id}`,
        category: 'orders',
        label: 'Refund linkage verified',
        status: blocked ? 'fail' : 'pass',
        detail: blocked ? `Refund ${blocked.external_refund_id || blocked.id} is in ${blocked.status}.` : `${orderRefunds.length} refund(s) linked.`,
        evidence: orderRefunds.map((r: any) => r.external_refund_id || r.id),
        at: orderRefunds[0]?.created_at,
      });
    }
  }

  return checks;
}

function checkPayments(bundle: any): CaseCheck[] {
  const payments = bundle.payments ?? [];
  const refunds = bundle.refunds ?? [];
  const checks: CaseCheck[] = [];

  if (!payments.length) {
    checks.push({ id: 'payments.linkage', category: 'payments', label: 'Payment linked to case', status: 'skip', detail: 'No payments associated with this case.' });
    return checks;
  }

  for (const p of payments) {
    const ext = p.external_payment_id || p.id;
    const status = lc(p.status);
    const psp = p.psp_provider || p.provider || p.psp || 'PSP';
    const pStatus: CheckStatus =
      ['failed', 'disputed', 'blocked', 'refunded'].includes(status) ? 'fail' :
      ['pending', 'authorized', 'requires_action', 'processing'].includes(status) ? 'warn' :
      'pass';
    checks.push({
      id: `payments.status.${p.id}`,
      category: 'payments',
      label: `Payment ${ext} verified with ${psp}`,
      status: pStatus,
      detail: `status=${p.status} amount=${p.amount} ${p.currency}`,
      evidence: [ext],
      at: p.updated_at || p.created_at,
    });

    const disputeMarker = p.dispute_state || p.dispute_id || p.dispute_reference;
    if (disputeMarker && lc(disputeMarker) !== 'none') {
      checks.push({
        id: `payments.dispute.${p.id}`,
        category: 'payments',
        label: 'Dispute / chargeback check',
        status: 'fail',
        detail: `dispute = ${disputeMarker}`,
        evidence: [ext, p.dispute_reference].filter(Boolean) as string[],
        at: p.updated_at,
      });
    }

    const linkedRefunds = refunds.filter((r: any) => r.payment_id === p.id);
    if (Number(p.refund_amount) > 0 || linkedRefunds.length) {
      const refSum = linkedRefunds.reduce((acc: number, r: any) => acc + Number(r.amount || 0), 0);
      const expected = Number(p.refund_amount || refSum);
      const reconciled = Math.abs(refSum - expected) < 0.01;
      checks.push({
        id: `payments.refund_recon.${p.id}`,
        category: 'payments',
        label: 'Refund amount reconciled with PSP',
        status: reconciled ? 'pass' : 'fail',
        detail: reconciled
          ? `Refund total ${refSum} matches payment.refund_amount ${expected}.`
          : `Mismatch: refunds total ${refSum} but payment.refund_amount = ${expected}.`,
        evidence: linkedRefunds.map((r: any) => r.external_refund_id || r.id),
      });
    }
  }

  return checks;
}

function checkReturns(bundle: any): CaseCheck[] {
  const returns = bundle.returns ?? [];
  const events = bundle.return_events ?? [];
  const checks: CaseCheck[] = [];

  if (!returns.length) {
    checks.push({ id: 'returns.linkage', category: 'returns', label: 'Return / RMA created', status: 'skip', detail: 'No return has been opened for this case.' });
    return checks;
  }

  for (const r of returns) {
    const ext = r.external_return_id || r.id;
    const status = lc(r.status);
    const rStatus: CheckStatus =
      ['rejected', 'failed', 'lost'].includes(status) ? 'fail' :
      ['pending_review', 'in_transit', 'received', 'inspecting', 'pending', 'awaiting_pickup'].includes(status) ? 'warn' :
      ['received_inspected', 'completed', 'refunded', 'closed'].includes(status) ? 'pass' :
      'warn';
    checks.push({
      id: `returns.status.${r.id}`,
      category: 'returns',
      label: `RMA ${ext} status checked`,
      status: rStatus,
      detail: `status=${r.status} reason=${r.reason || 'n/a'}`,
      evidence: [ext, r.tracking_number].filter(Boolean) as string[],
      at: r.updated_at || r.created_at,
    });
    if (r.tracking_number) {
      checks.push({
        id: `returns.tracking.${r.id}`,
        category: 'returns',
        label: 'Return tracking active',
        status: 'pass',
        detail: `tracking ${r.tracking_number}`,
        evidence: [r.tracking_number],
        at: r.updated_at,
      });
    }
    const relEvents = events.filter((e: any) => e.return_id === r.id);
    if (relEvents.length) {
      checks.push({
        id: `returns.events.${r.id}`,
        category: 'returns',
        label: `Return events recorded (${relEvents.length})`,
        status: 'pass',
        detail: relEvents.slice(0, 3).map((e: any) => e.type).join(', '),
        at: relEvents[0]?.created_at,
      });
    }
  }
  return checks;
}

function checkRefunds(bundle: any): CaseCheck[] {
  const refunds = bundle.refunds ?? [];
  if (!refunds.length) {
    return [{ id: 'refunds.linkage', category: 'refunds', label: 'Refund issued', status: 'skip', detail: 'No refund recorded yet.' }];
  }
  return refunds.map((r: any) => {
    const status = lc(r.status);
    const rStatus: CheckStatus =
      ['failed', 'blocked', 'rejected'].includes(status) ? 'fail' :
      ['pending', 'processing', 'requested'].includes(status) ? 'warn' :
      'pass';
    return {
      id: `refunds.${r.id}`,
      category: 'refunds' as const,
      label: `Refund ${r.external_refund_id || r.id} ${status}`,
      status: rStatus,
      detail: `amount ${r.amount} ${r.currency} via ${r.method || 'PSP'}`,
      evidence: [r.external_refund_id || r.id],
      at: r.updated_at || r.created_at,
    };
  });
}

function checkApprovals(bundle: any): CaseCheck[] {
  const approvals = bundle.approvals ?? [];
  if (!approvals.length) {
    return [{ id: 'approvals.required', category: 'approvals', label: 'Approval required', status: 'skip', detail: 'No approval has been requested for this case.' }];
  }
  return approvals.map((a: any) => {
    const decision = lc(a.decision);
    const status: CheckStatus =
      decision === 'rejected' || decision === 'denied' ? 'fail' :
      decision === 'approved' ? 'pass' :
      'warn';
    return {
      id: `approvals.${a.id}`,
      category: 'approvals' as const,
      label: `Approval ${a.id.slice(0, 8)} ${a.decision || 'pending'}`,
      status,
      detail: a.reason || a.comment || `${a.action_type || 'action'} requested by ${a.requested_by || 'system'}`,
      evidence: [a.id],
      at: a.updated_at || a.created_at,
    };
  });
}

function checkReconciliation(bundle: any): CaseCheck[] {
  const issues = bundle.reconciliation_issues ?? [];
  if (!issues.length) {
    return [{
      id: 'reconciliation.clean',
      category: 'reconciliation',
      label: 'Cross-system reconciliation clean',
      status: 'pass',
      detail: 'No conflicts between connected systems.',
    }];
  }
  return issues.map((i: any) => ({
    id: `reconciliation.${i.id}`,
    category: 'reconciliation' as const,
    label: `Conflict: ${i.conflict_domain || i.entity_type || 'state mismatch'}`,
    status: lc(i.severity) === 'critical' ? 'fail' as CheckStatus : 'warn' as CheckStatus,
    detail: i.expected_state ? `Expected: ${i.expected_state}.` : (i.resolution_plan || i.summary || 'Reconciliation pending.'),
    evidence: [i.source_of_truth_system, i.id].filter(Boolean) as string[],
    at: i.detected_at || i.created_at,
  }));
}

function checkKnowledge(bundle: any): CaseCheck[] {
  const articles = bundle.knowledge_articles ?? [];
  const links = bundle.case_knowledge_links ?? [];
  if (!links.length) {
    return [{
      id: 'knowledge.linked',
      category: 'knowledge',
      label: 'Knowledge articles linked',
      status: 'warn',
      detail: 'No KB articles have been associated with this case yet.',
    }];
  }
  const outdated = articles.find((a: any) => a.outdated_flag);
  return [
    { id: 'knowledge.linked', category: 'knowledge', label: `Knowledge articles linked (${links.length})`, status: 'pass', detail: articles.slice(0, 2).map((a: any) => a.title).join(' · ') },
    ...(outdated ? [{ id: 'knowledge.outdated', category: 'knowledge' as const, label: 'Outdated KB article flagged', status: 'fail' as CheckStatus, detail: `"${outdated.title}" is marked outdated.` }] : []),
  ];
}

function checkIntegrations(bundle: any): CaseCheck[] {
  const connectors = bundle.connectors ?? [];
  const required = ['shopify', 'stripe'];
  const checks: CaseCheck[] = [];
  for (const sys of required) {
    const c = connectors.find((row: any) => lc(row.system) === sys);
    if (!c) {
      checks.push({ id: `integrations.${sys}`, category: 'integrations', label: `${sys} connector available`, status: 'warn', detail: `No ${sys} connector configured.` });
    } else {
      const ok = lc(c.status) === 'connected';
      checks.push({
        id: `integrations.${sys}`,
        category: 'integrations',
        label: `${sys} connector connected`,
        status: ok ? 'pass' : 'fail',
        detail: `status=${c.status}${c.last_synced_at ? ` (last sync ${c.last_synced_at})` : ''}`,
        at: c.last_synced_at || c.updated_at,
      });
    }
  }
  // Any connector currently in "error" state on this tenant
  const errored = connectors.filter((c: any) => lc(c.status) === 'error');
  for (const e of errored) {
    checks.push({
      id: `integrations.error.${e.id}`,
      category: 'integrations',
      label: `${e.system} connector in error`,
      status: 'fail',
      detail: e.last_error || `status=${e.status}`,
      at: e.updated_at,
    });
  }
  return checks;
}

function checkAiStudio(bundle: any): CaseCheck[] {
  const agents = bundle.agents ?? [];
  const runs = bundle.agent_runs ?? [];
  if (!agents.length) {
    return [{ id: 'ai_studio.agents', category: 'ai_studio', label: 'AI agents configured', status: 'warn', detail: 'No agents are configured for this tenant.' }];
  }
  const lastRun = runs[0];
  return [
    { id: 'ai_studio.agents', category: 'ai_studio', label: `AI agents configured (${agents.length})`, status: 'pass' },
    ...(lastRun ? [{
      id: `ai_studio.last_run`,
      category: 'ai_studio' as const,
      label: `Last agent run ${lastRun.status}`,
      status: lc(lastRun.status) === 'failed' ? 'fail' as CheckStatus : lc(lastRun.status) === 'success' ? 'pass' as CheckStatus : 'warn' as CheckStatus,
      detail: `${lastRun.agent_id || ''} • ${lastRun.started_at}`,
      at: lastRun.started_at,
    }] : []),
  ];
}

function checkWorkflows(bundle: any): CaseCheck[] {
  const runs = bundle.workflow_runs ?? [];
  if (!runs.length) {
    return [{ id: 'workflows.runs', category: 'workflows', label: 'Workflow runs', status: 'skip', detail: 'No workflow has fired for this case.' }];
  }
  return runs.slice(0, 5).map((r: any) => ({
    id: `workflows.${r.id}`,
    category: 'workflows' as const,
    label: `Workflow run ${r.status}`,
    status: lc(r.status) === 'failed' ? 'fail' as CheckStatus : lc(r.status) === 'success' || lc(r.status) === 'completed' ? 'pass' as CheckStatus : 'warn' as CheckStatus,
    detail: r.workflow_version_id ? `version ${r.workflow_version_id}` : '',
    evidence: [r.id],
    at: r.started_at,
  }));
}

function checkConversation(bundle: any): CaseCheck[] {
  const conv = bundle.conversation;
  const messages = bundle.messages ?? [];
  if (!conv && !messages.length) {
    return [{ id: 'conversation.exists', category: 'conversation', label: 'Conversation thread present', status: 'warn', detail: 'No conversation linked to this case.' }];
  }
  const inbound = messages.filter((m: any) => m.direction === 'inbound');
  const outbound = messages.filter((m: any) => m.direction === 'outbound');
  const lastMsg = messages[messages.length - 1];
  const awaiting = lastMsg?.direction === 'inbound';
  return [
    { id: 'conversation.exists', category: 'conversation', label: `Conversation on ${conv?.channel || bundle.case.source_channel || 'unknown'}`, status: 'pass', detail: conv?.subject || `${messages.length} message(s)`, at: conv?.last_message_at },
    { id: 'conversation.inbound', category: 'conversation', label: `${inbound.length} inbound message(s)`, status: 'pass' },
    { id: 'conversation.outbound', category: 'conversation', label: `${outbound.length} outbound message(s)`, status: outbound.length ? 'pass' : 'warn' },
    { id: 'conversation.awaiting', category: 'conversation', label: 'Awaiting agent reply', status: awaiting ? 'warn' : 'pass', detail: awaiting ? 'Customer wrote last; reply pending.' : 'Last message is from the agent.', at: lastMsg?.sent_at || lastMsg?.created_at },
  ];
}

function checkNotes(bundle: any): CaseCheck[] {
  const notes = bundle.internal_notes ?? [];
  if (!notes.length) {
    return [{ id: 'notes.exists', category: 'notes', label: 'Internal notes', status: 'skip', detail: 'No internal notes recorded.' }];
  }
  return [{ id: 'notes.count', category: 'notes', label: `Internal notes (${notes.length})`, status: 'pass', detail: notes[0]?.content?.slice(0, 80) || '', at: notes[0]?.created_at }];
}

function checkLinkedCases(bundle: any): CaseCheck[] {
  const linked = bundle.linked_cases ?? [];
  if (!linked.length) {
    return [{ id: 'linked.none', category: 'linked_cases', label: 'Linked cases', status: 'skip', detail: 'No related cases.' }];
  }
  const open = linked.filter((c: any) => !['resolved', 'closed', 'cancelled'].includes(lc(c.status)));
  return [{
    id: 'linked.count',
    category: 'linked_cases',
    label: `Linked cases (${linked.length}, ${open.length} open)`,
    status: open.length ? 'warn' : 'pass',
    detail: linked.slice(0, 3).map((c: any) => c.case_number).join(', '),
  }];
}

// ── Public API ──────────────────────────────────────────────────────────────

export function buildCaseChecks(bundle: any): {
  categories: Array<{
    key: CheckCategory;
    label: string;
    status: CheckStatus;
    counts: { pass: number; warn: number; fail: number; skip: number };
    checks: CaseCheck[];
  }>;
  flat: CaseCheck[];
  totals: { pass: number; warn: number; fail: number; skip: number };
} {
  const allBuilders: Array<[CheckCategory, (b: any) => CaseCheck[]]> = [
    ['orders',          checkOrders],
    ['payments',        checkPayments],
    ['returns',         checkReturns],
    ['refunds',         checkRefunds],
    ['approvals',       checkApprovals],
    ['reconciliation',  checkReconciliation],
    ['knowledge',       checkKnowledge],
    ['ai_studio',       checkAiStudio],
    ['workflows',       checkWorkflows],
    ['integrations',    checkIntegrations],
    ['conversation',    checkConversation],
    ['notes',           checkNotes],
    ['linked_cases',    checkLinkedCases],
  ];

  const categories: ReturnType<typeof buildCaseChecks>['categories'] = [];
  const flat: CaseCheck[] = [];
  const totals = { pass: 0, warn: 0, fail: 0, skip: 0 };

  for (const [key, build] of allBuilders) {
    const checks = build(bundle);
    const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };
    for (const c of checks) counts[c.status]++;
    const status: CheckStatus =
      counts.fail > 0 ? 'fail' :
      counts.warn > 0 ? 'warn' :
      counts.pass > 0 ? 'pass' :
      'skip';
    categories.push({ key, label: CATEGORY_LABELS[key], status, counts, checks });
    for (const c of checks) flat.push(c);
    totals.pass += counts.pass;
    totals.warn += counts.warn;
    totals.fail += counts.fail;
    totals.skip += counts.skip;
  }

  return { categories, flat, totals };
}

export { CATEGORY_LABELS, statusFromSeverity, summariseCheck };
