import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';

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


export function createAIRepository(): AIRepository {
  return {
    getStats: getStatsSupabase,
    updateCaseAIFields: updateCaseAIFieldsSupabase,
    createDraftReply: createDraftReplySupabase,
    getAgentKnowledgeProfile: getAgentKnowledgeProfileSupabase,
    getCaseContextData: getCaseContextDataSupabase,
  };
}
