import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

export interface AIScope {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}

export interface AIRepository {
  getStats(scope: AIScope): Promise<any>;
  updateCaseAIFields(scope: AIScope, caseId: string, data: any): Promise<void>;
  createDraftReply(scope: AIScope, data: any): Promise<string>;
  getAgentKnowledgeProfile(scope: AIScope, agentSlug: string): Promise<any>;
  getCaseContextData(scope: AIScope, caseId: string): Promise<any>;
}

async function getStatsSupabase(scope: AIScope) {
  const supabase = getSupabaseAdmin();
  const [
    { count: totalRuns },
    { count: resolvedByAI },
    { count: totalCases },
    { count: pendingApprovals }
  ] = await Promise.all([
    supabase.from('agent_runs').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).ilike('resolved_by', 'agent%'),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId),
    supabase.from('approval_requests').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).eq('status', 'pending')
  ]);

  return {
    total_agent_runs: totalRuns || 0,
    ai_resolution_rate: (totalCases || 0) > 0 ? Math.round(((resolvedByAI || 0) / (totalCases || 1)) * 100) : 0,
    pending_approvals: pendingApprovals || 0,
    total_cases: totalCases || 0,
  };
}

function getStatsSqlite(scope: AIScope) {
  const db = getDb();
  const totalRuns = db.prepare('SELECT COUNT(*) as c FROM agent_runs WHERE tenant_id = ?').get(scope.tenantId) as any;
  const resolvedByAI = db.prepare(`SELECT COUNT(*) as c FROM cases WHERE tenant_id = ? AND resolved_by LIKE 'agent%'`).get(scope.tenantId) as any;
  const totalCases = db.prepare('SELECT COUNT(*) as c FROM cases WHERE tenant_id = ?').get(scope.tenantId) as any;
  const pendingApprovals = db.prepare(`SELECT COUNT(*) as c FROM approval_requests WHERE tenant_id = ? AND status='pending'`).get(scope.tenantId) as any;

  return {
    total_agent_runs: totalRuns.c,
    ai_resolution_rate: totalCases.c > 0 ? Math.round((resolvedByAI.c / totalCases.c) * 100) : 0,
    pending_approvals: pendingApprovals.c,
    total_cases: totalCases.c,
  };
}

async function updateCaseAIFieldsSupabase(scope: AIScope, caseId: string, data: any) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('cases')
    .update({
      ai_diagnosis: data.summary,
      ai_root_cause: data.root_cause,
      ai_confidence: data.confidence,
      ai_recommended_action: data.recommended_action,
      ai_evidence_refs: data.citations,
      updated_at: new Date().toISOString()
    })
    .eq('id', caseId)
    .eq('tenant_id', scope.tenantId);
  if (error) throw error;
}

function updateCaseAIFieldsSqlite(scope: AIScope, caseId: string, data: any) {
  const db = getDb();
  db.prepare(`
    UPDATE cases SET
      ai_diagnosis = ?, ai_root_cause = ?, ai_confidence = ?, ai_recommended_action = ?,
      ai_evidence_refs = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(
    data.summary,
    data.root_cause,
    data.confidence,
    data.recommended_action,
    JSON.stringify(data.citations || []),
    caseId,
    scope.tenantId
  );
}

async function createDraftReplySupabase(scope: AIScope, data: any) {
  const supabase = getSupabaseAdmin();
  const id = randomUUID();
  const { error } = await supabase
    .from('draft_replies')
    .insert({
      id,
      case_id: data.caseId,
      conversation_id: data.conversationId,
      content: data.content,
      generated_by: data.model,
      status: 'pending_review',
      tenant_id: scope.tenantId,
      has_policies: data.hasPolicies ? 1 : 0,
      citations: data.citations || [],
      generated_at: new Date().toISOString()
    });
  if (error) throw error;
  return id;
}

function createDraftReplySqlite(scope: AIScope, data: any) {
  const db = getDb();
  const id = randomUUID();
  db.prepare(`
    INSERT INTO draft_replies (
      id, case_id, conversation_id, content, generated_by, generated_at,
      status, tenant_id, has_policies, citations
    )
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'pending_review', ?, ?, ?)
  `).run(
    id, data.caseId, data.conversationId, data.content, data.model,
    scope.tenantId, data.hasPolicies ? 1 : 0, JSON.stringify(data.citations || [])
  );
  return id;
}

async function getAgentKnowledgeProfileSupabase(scope: AIScope, agentSlug: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('agents')
    .select('agent_versions(knowledge_profile)')
    .eq('slug', agentSlug)
    .eq('tenant_id', scope.tenantId)
    .eq('is_active', true)
    .eq('agent_versions.id', supabase.from('agents').select('current_version_id'))
    .maybeSingle();

  // Simplification for the join/select - we might need a better query or just get the agent and then the version
  const { data: agent } = await supabase.from('agents').select('current_version_id').eq('slug', agentSlug).eq('tenant_id', scope.tenantId).maybeSingle();
  if (!agent?.current_version_id) return {};
  
  const { data: version } = await supabase.from('agent_versions').select('knowledge_profile').eq('id', agent.current_version_id).maybeSingle();
  return version?.knowledge_profile || {};
}

function getAgentKnowledgeProfileSqlite(scope: AIScope, agentSlug: string) {
  const db = getDb();
  const row = db.prepare(`
    SELECT av.knowledge_profile
    FROM agents a
    LEFT JOIN agent_versions av ON a.current_version_id = av.id
    WHERE a.slug = ? AND a.tenant_id = ? AND a.is_active = 1
    LIMIT 1
  `).get(agentSlug, scope.tenantId) as any;

  return row?.knowledge_profile ? JSON.parse(row.knowledge_profile) : {};
}

async function getCaseContextDataSupabase(scope: AIScope, caseId: string) {
  const supabase = getSupabaseAdmin();
  const { data: caseRow, error } = await supabase
    .from('cases')
    .select('*, customers(*)')
    .eq('id', caseId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!caseRow) return null;

  const conversationId = caseRow.conversation_id;
  const [convRes, messagesRes, conflictsRes] = await Promise.all([
    supabase.from('conversations').select('*').or(`case_id.eq.${caseId},id.eq.${conversationId}`).eq('tenant_id', scope.tenantId).order('updated_at', { ascending: false }).limit(1),
    supabase.from('messages').select('*').eq('conversation_id', conversationId).order('sent_at', { ascending: true }),
    supabase.from('reconciliation_issues').select('conflict_domain').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('id', { ascending: false }).limit(10)
  ]);

  const orderIds = Array.isArray(caseRow.order_ids) ? caseRow.order_ids : [];
  const paymentIds = Array.isArray(caseRow.payment_ids) ? caseRow.payment_ids : [];
  const returnIds = Array.isArray(caseRow.return_ids) ? caseRow.return_ids : [];

  const [orders, payments, returns] = await Promise.all([
    orderIds.length ? supabase.from('orders').select('*').in('id', orderIds) : Promise.resolve({ data: [] }),
    paymentIds.length ? supabase.from('payments').select('*').in('id', paymentIds) : Promise.resolve({ data: [] }),
    returnIds.length ? supabase.from('returns').select('*').in('id', returnIds) : Promise.resolve({ data: [] })
  ]);

  return {
    caseRow,
    customer: caseRow.customers,
    messages: messagesRes.data || [],
    orders: orders.data || [],
    payments: payments.data || [],
    returns: returns.data || [],
    conflicts: conflictsRes.data || []
  };
}

function getCaseContextDataSqlite(scope: AIScope, caseId: string) {
  const db = getDb();
  const caseRow = db.prepare(`
    SELECT c.*, cu.canonical_name, cu.canonical_email, cu.segment, cu.lifetime_value,
           cu.dispute_rate, cu.refund_rate
    FROM cases c
    LEFT JOIN customers cu ON c.customer_id = cu.id
    WHERE c.id = ? AND c.tenant_id = ?
  `).get(caseId, scope.tenantId) as any;

  if (!caseRow) return null;

  const conversation = db.prepare(`
    SELECT * FROM conversations
    WHERE (case_id = ? OR id = ?) AND tenant_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(caseId, caseRow.conversation_id, scope.tenantId) as any;

  const messages = conversation
    ? db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY sent_at ASC').all(conversation.id)
    : [];

  const parseJsonArray = (val: any) => {
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val) || []; } catch { return []; }
  };

  const orderIds = parseJsonArray(caseRow.order_ids);
  const paymentIds = parseJsonArray(caseRow.payment_ids);
  const returnIds = parseJsonArray(caseRow.return_ids);

  const orders = orderIds.map((id: string) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id)).filter(Boolean);
  const payments = paymentIds.map((id: string) => db.prepare('SELECT * FROM payments WHERE id = ?').get(id)).filter(Boolean);
  const returns = returnIds.map((id: string) => db.prepare('SELECT * FROM returns WHERE id = ?').get(id)).filter(Boolean);

  const conflicts = db.prepare(`
    SELECT conflict_domain
    FROM reconciliation_issues
    WHERE case_id = ? AND tenant_id = ?
    ORDER BY id DESC
    LIMIT 10
  `).all(caseId, scope.tenantId);

  return {
    caseRow: parseRow(caseRow),
    customer: parseRow(caseRow), // customer fields are joined
    messages: messages.map(parseRow),
    orders: orders.map(parseRow),
    payments: payments.map(parseRow),
    returns: returns.map(parseRow),
    conflicts: conflicts.map(parseRow)
  };
}

export function createAIRepository(): AIRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      getStats: getStatsSupabase,
      updateCaseAIFields: updateCaseAIFieldsSupabase,
      createDraftReply: createDraftReplySupabase,
      getAgentKnowledgeProfile: getAgentKnowledgeProfileSupabase,
      getCaseContextData: getCaseContextDataSupabase,
    };
  }

  return {
    getStats: async (scope) => getStatsSqlite(scope),
    updateCaseAIFields: async (scope, caseId, data) => updateCaseAIFieldsSqlite(scope, caseId, data),
    createDraftReply: async (scope, data) => createDraftReplySqlite(scope, data),
    getAgentKnowledgeProfile: async (scope, agentSlug) => getAgentKnowledgeProfileSqlite(scope, agentSlug),
    getCaseContextData: async (scope, caseId) => getCaseContextDataSqlite(scope, caseId),
  };
}
