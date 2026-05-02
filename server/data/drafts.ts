import { getSupabaseAdmin } from '../db/supabase.js';

export interface DraftScope {
  tenantId: string;
  workspaceId: string;
}

export interface DraftReply {
  id: string;
  case_id: string;
  conversation_id: string;
  content: string;
  generated_by: string;
  tone: string;
  confidence: number;
  has_policies: number;
  citations: any;
  status: string;
  tenant_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface DraftRepository {
  getPendingDraft(scope: DraftScope, caseId: string): Promise<DraftReply | null>;
  upsert(scope: DraftScope, draft: Partial<DraftReply>): Promise<void>;
}

export function createDraftRepository(): DraftRepository {
  return {
    getPendingDraft: async (scope, caseId) => {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('draft_replies')
        .select('*')
        .eq('case_id', caseId)
        .eq('status', 'pending_review')
        .eq('tenant_id', scope.tenantId)
        .eq('workspace_id', scope.workspaceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    upsert: async (scope, draft) => {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from('draft_replies')
        .upsert({
          ...draft,
          tenant_id: scope.tenantId,
          workspace_id: scope.workspaceId,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
    }
  };
}
