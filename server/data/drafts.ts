import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

export interface DraftScope {
  tenantId: string;
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
  if (getDatabaseProvider() === 'supabase') {
    return {
      getPendingDraft: async (scope, caseId) => {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('draft_replies')
          .select('*')
          .eq('case_id', caseId)
          .eq('status', 'pending_review')
          .eq('tenant_id', scope.tenantId)
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
          .upsert({ ...draft, tenant_id: scope.tenantId, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
    };
  }

  return {
    getPendingDraft: async (scope, caseId) => {
      const db = getDb();
      const row = db.prepare(`
        SELECT * FROM draft_replies
        WHERE case_id = ? AND status = 'pending_review'
        ORDER BY created_at DESC
        LIMIT 1
      `).get(caseId);
      return row ? parseRow(row) : null;
    },
    upsert: async (scope, draft) => {
      const db = getDb();
      const existing = db.prepare('SELECT id FROM draft_replies WHERE id = ?').get(draft.id);
      
      const fields = Object.keys(draft);
      const values = fields.map(f => {
        const val = (draft as any)[f];
        return (val && typeof val === 'object') ? JSON.stringify(val) : val;
      });

      if (existing) {
        const setClause = fields.map(f => `${f} = ?`).join(', ');
        db.prepare(`UPDATE draft_replies SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(...values, draft.id);
      } else {
        const placeholders = fields.map(() => '?').join(', ');
        db.prepare(`INSERT INTO draft_replies (${fields.join(', ')}, tenant_id) VALUES (${placeholders}, ?)`)
          .run(...values, scope.tenantId);
      }
    }
  };
}
