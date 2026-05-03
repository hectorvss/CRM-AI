import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { buildCaseState, createCaseRepository } from './cases.js';
import { applyPostApprovalDecision } from '../services/postApproval.js';

export interface ApprovalScope {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}

function parseJsonApproval(row: any) {
  const result = { ...row };
  ['action_payload', 'evidence_package'].forEach((field) => {
    if (result[field] && typeof result[field] === 'string') {
      try {
        result[field] = JSON.parse(result[field]);
      } catch {
        result[field] = {};
      }
    }
  });
  return result;
}

async function listApprovalsSupabase(
  scope: ApprovalScope,
  filters: { status?: string; risk_level?: string; assigned_to?: string; limit?: number; offset?: number },
): Promise<{ items: any[]; total: number; hasMore: boolean }> {
  const supabase = getSupabaseAdmin();
  const limit = Math.max(1, Math.min(200, Number.isFinite(filters.limit as number) ? Number(filters.limit) : 50));
  const offset = Math.max(0, Number.isFinite(filters.offset as number) ? Number(filters.offset) : 0);

  let query = supabase
    .from('approval_requests')
    .select('*', { count: 'exact' })
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.risk_level) query = query.eq('risk_level', filters.risk_level);
  if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to);

  const { data, error, count } = await query;
  if (error) throw error;

  const approvals = data ?? [];
  const caseIds = Array.from(new Set(approvals.map((item) => item.case_id).filter(Boolean)));
  const casesRes = caseIds.length
    ? await supabase
        .from('cases')
        .select('id, case_number, type, priority, risk_level, customer_id')
        .eq('tenant_id', scope.tenantId)
        .eq('workspace_id', scope.workspaceId)
        .in('id', caseIds)
    : { data: [], error: null } as any;
  if (casesRes.error) throw casesRes.error;

  const customerIds = Array.from(new Set((casesRes.data ?? []).map((row: any) => row.customer_id).filter(Boolean)));
  const usersIds = Array.from(new Set(approvals.map((item) => item.assigned_to).filter(Boolean)));
  const [customersRes, usersRes] = await Promise.all([
    customerIds.length
      ? supabase
          .from('customers')
          .select('id, canonical_name, segment')
          .eq('tenant_id', scope.tenantId)
          .in('id', customerIds)
      : Promise.resolve({ data: [], error: null } as any),
    usersIds.length ? supabase.from('users').select('id, name').in('id', usersIds) : Promise.resolve({ data: [], error: null } as any),
  ]);
  for (const result of [customersRes, usersRes]) {
    if (result?.error) throw result.error;
  }

  const cases = new Map<string, any>((casesRes.data ?? []).map((row: any) => [row.id, row]));
  const customers = new Map<string, any>((customersRes.data ?? []).map((row: any) => [row.id, row]));
  const users = new Map<string, any>((usersRes.data ?? []).map((row: any) => [row.id, row]));

  const enriched = approvals.map((approval) => {
    const caseRow = cases.get(approval.case_id);
    const customer = caseRow?.customer_id ? customers.get(caseRow.customer_id) : null;
    return {
      ...approval,
      case_number: caseRow?.case_number || null,
      case_type: caseRow?.type || null,
      case_priority: caseRow?.priority || null,
      case_risk: caseRow?.risk_level || null,
      customer_name: customer?.canonical_name || null,
      customer_segment: customer?.segment || null,
      assigned_user_name: approval.assigned_to ? users.get(approval.assigned_to)?.name || null : null,
    };
  });

  const items = enriched.filter((approval, index, list) => {
    const key = [approval.case_id ?? 'no_case', approval.action_type ?? 'manual_review', approval.status ?? 'pending'].join(':');
    return list.findIndex((item) => [item.case_id ?? 'no_case', item.action_type ?? 'manual_review', item.status ?? 'pending'].join(':') === key) === index;
  });

  const total = typeof count === 'number' ? count : items.length + offset;
  const hasMore = offset + (data?.length ?? 0) < total;
  return { items, total, hasMore };
}


async function getApprovalSupabase(scope: ApprovalScope, approvalId: string) {
  const supabase = getSupabaseAdmin();
  const { data: approval, error } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', approvalId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!approval) return null;

  const caseRepository = createCaseRepository();
  const bundle = await caseRepository.getBundle({ tenantId: scope.tenantId, workspaceId: scope.workspaceId }, approval.case_id);
  if (!bundle) return parseJsonApproval(approval);

  return {
    ...parseJsonApproval(approval),
    case_number: bundle.case.case_number,
    case_type: bundle.case.type,
    priority: bundle.case.priority,
    case_risk: bundle.case.risk_level,
    customer_name: bundle.customer?.canonical_name || null,
    customer_segment: bundle.customer?.segment || null,
    lifetime_value: bundle.customer?.lifetime_value || 0,
    dispute_rate: bundle.customer?.dispute_rate || 0,
    refund_rate: bundle.customer?.refund_rate || 0,
  };
}

async function getApprovalContextSupabase(scope: ApprovalScope, approvalId: string) {
  const approval = await getApprovalSupabase(scope, approvalId);
  if (!approval) return null;

  const caseRepository = createCaseRepository();
  const bundle = await caseRepository.getBundle({ tenantId: scope.tenantId, workspaceId: scope.workspaceId }, approval.case_id);
  if (!bundle) return null;

  return {
    approval,
    case: bundle.case,
    customer: bundle.customer,
    case_state: buildCaseState(bundle),
    conversation: bundle.conversation,
    messages: bundle.messages ?? [],
    internal_notes: bundle.internal_notes ?? [],
    evidence: {
      approvals: bundle.approvals ?? [],
      reconciliation_issues: bundle.reconciliation_issues ?? [],
      linked_cases: bundle.linked_cases ?? [],
    },
  };
}


async function decideApprovalSupabase(scope: ApprovalScope, approvalId: string, input: { decision: 'approved' | 'rejected'; note?: string; decided_by?: string }) {
  const supabase = getSupabaseAdmin();
  const { data: approval, error } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', approvalId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!approval) return null;
  if (approval.status !== 'pending') {
    throw new Error('Approval is not pending');
  }

  const now = new Date().toISOString();
  const decisionBy = input.decided_by || scope.userId || 'unknown';

  const { error: updateApprovalError } = await supabase
    .from('approval_requests')
    .update({
      status: input.decision,
      decision_by: decisionBy,
      decision_at: now,
      decision_note: input.note ?? null,
      updated_at: now,
    })
    .eq('id', approvalId)
    .eq('tenant_id', scope.tenantId);
  if (updateApprovalError) throw updateApprovalError;

  const { error: historyError } = await supabase
    .from('case_status_history')
    .insert({
      id: randomUUID(),
      case_id: approval.case_id,
      from_status: 'approval_pending',
      to_status: input.decision === 'approved' ? 'approval_approved' : 'approval_rejected',
      changed_by: decisionBy,
      changed_by_type: 'human',
      reason: input.note ?? `Approval ${input.decision}`,
      tenant_id: scope.tenantId,
      created_at: now,
    });
  if (historyError) throw historyError;

  if (approval.execution_plan_id) {
    const { error: planError } = await supabase
      .from('execution_plans')
      .update({
        status: input.decision === 'approved' ? 'approved' : 'rejected',
      })
      .eq('id', approval.execution_plan_id)
      .eq('tenant_id', scope.tenantId);
    if (planError) throw planError;
  }

  const { error: caseError } = await supabase
    .from('cases')
    .update({
      approval_state: input.decision,
      execution_state: input.decision === 'approved' ? 'queued' : 'idle',
      priority: input.decision === 'rejected' ? 'high' : approval.priority,
      updated_at: now,
    })
    .eq('id', approval.case_id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (caseError) throw caseError;

  const postApproval = await applyPostApprovalDecision(
    { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
    approval,
    input.decision,
    decisionBy,
    input.note,
  );

  return {
    success: true,
    decision: input.decision,
    caseId: approval.case_id,
    executionPlanId: approval.execution_plan_id || null,
    postApproval,
  };
}


async function createApprovalSupabase(scope: ApprovalScope, input: any) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const payload = {
    id,
    case_id: input.caseId ?? input.case_id,
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    requested_by: input.requestedBy ?? input.requested_by ?? scope.userId ?? 'system',
    requested_by_type: input.requestedByType ?? input.requested_by_type ?? 'system',
    action_type: input.actionType ?? input.action_type ?? 'manual_review',
    action_payload: input.actionPayload ?? input.action_payload ?? {},
    risk_level: input.riskLevel ?? input.risk_level ?? 'medium',
    policy_rule_id: input.policyRuleId ?? input.policy_rule_id ?? null,
    evidence_package: input.evidencePackage ?? input.evidence_package ?? {},
    status: input.status ?? 'pending',
    priority: input.priority ?? 'normal',
    assigned_to: input.assignedTo ?? input.assigned_to ?? null,
    assigned_team_id: input.assignedTeamId ?? input.assigned_team_id ?? null,
    expires_at: input.expiresAt ?? input.expires_at ?? null,
    execution_plan_id: input.executionPlanId ?? input.execution_plan_id ?? null,
    created_at: now,
    updated_at: now,
  };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('approval_requests').insert(payload);
  if (error) throw error;
  return parseJsonApproval(payload);
}


export interface CreateApprovalRequestInput {
  tenantId: string;
  workspaceId: string;
  caseId: string;
  requestType: string; // e.g. 'refund' | 'order_cancel'
  requestedBy: string;
  requestedByType?: 'agent' | 'human' | 'system';
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any>;
  evidencePackage?: Record<string, any>;
  policyRuleId?: string | null;
  executionPlanId?: string | null;
  assignedTo?: string | null;
  assignedTeamId?: string | null;
  expiresAt?: string | null;
}

/**
 * Find an existing pending approval_request that matches the given (case_id, action_type, entity).
 * Used to enforce idempotency when a payment/order is already flagged 'approval_needed'
 * but the corresponding approval row may or may not exist.
 */
export async function findPendingApprovalRequest(input: {
  tenantId: string;
  workspaceId: string;
  caseId: string;
  requestType: string;
  entityKey: string; // e.g. payment_id or order_id
  entityValue: string;
}): Promise<any | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('tenant_id', input.tenantId)
    .eq('workspace_id', input.workspaceId)
    .eq('case_id', input.caseId)
    .eq('action_type', input.requestType)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  for (const row of data ?? []) {
    const payload = (() => {
      const p = row.action_payload;
      if (p && typeof p === 'string') {
        try { return JSON.parse(p); } catch { return {}; }
      }
      return p ?? {};
    })();
    if (payload?.[input.entityKey] === input.entityValue) {
      return row;
    }
  }
  return null;
}

/**
 * Resolve a case_id from a payment or order id by searching cases.payment_ids / order_ids.
 * Returns null if the entity is orphan (not linked to any case).
 */
export async function findCaseIdForEntity(input: {
  tenantId: string;
  workspaceId: string;
  entity: 'payment' | 'order';
  entityId: string;
}): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const column = input.entity === 'payment' ? 'payment_ids' : 'order_ids';
  const { data, error } = await supabase
    .from('cases')
    .select('id')
    .eq('tenant_id', input.tenantId)
    .eq('workspace_id', input.workspaceId)
    .contains(column, [input.entityId])
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    // contains() on jsonb requires array literal; fall back to silent null on driver error
    return null;
  }
  return data?.[0]?.id ?? null;
}

/**
 * Standalone helper to create an approval_request row that targets the manager queue.
 * Stores `requestType` in `action_type` and merges `metadata` into `action_payload`,
 * since the schema does not have explicit `request_type` / `metadata` columns.
 */
export async function createApprovalRequest(input: CreateApprovalRequestInput): Promise<{ id: string; row: any }> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const payload = {
    id,
    case_id: input.caseId,
    tenant_id: input.tenantId,
    workspace_id: input.workspaceId,
    requested_by: input.requestedBy,
    requested_by_type: input.requestedByType ?? 'human',
    action_type: input.requestType,
    action_payload: {
      request_type: input.requestType,
      ...(input.metadata ?? {}),
    },
    risk_level: input.riskLevel ?? 'medium',
    policy_rule_id: input.policyRuleId ?? null,
    evidence_package: input.evidencePackage ?? {},
    status: 'pending',
    assigned_to: input.assignedTo ?? null,
    assigned_team_id: input.assignedTeamId ?? null,
    expires_at: input.expiresAt ?? null,
    execution_plan_id: input.executionPlanId ?? null,
    created_at: now,
    updated_at: now,
  };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('approval_requests').insert(payload);
  if (error) throw error;
  return { id, row: payload };
}

export interface ApprovalRepository {
  list(
    scope: ApprovalScope,
    filters: { status?: string; risk_level?: string; assigned_to?: string; limit?: number; offset?: number },
  ): Promise<{ items: any[]; total: number; hasMore: boolean }>;
  get(scope: ApprovalScope, approvalId: string): Promise<any | null>;
  getContext(scope: ApprovalScope, approvalId: string): Promise<any | null>;
  create(scope: ApprovalScope, input: any): Promise<any>;
  decide(scope: ApprovalScope, approvalId: string, input: { decision: 'approved' | 'rejected'; note?: string; decided_by?: string }): Promise<any | null>;
}

export function createApprovalRepository(): ApprovalRepository {
  return {
    list: listApprovalsSupabase,
    get: getApprovalSupabase,
    getContext: getApprovalContextSupabase,
    create: createApprovalSupabase,
    decide: decideApprovalSupabase,
  };
}
