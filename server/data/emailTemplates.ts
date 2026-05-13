import { getSupabaseAdmin } from '../db/supabase.js';

export interface TemplateScope { tenantId: string; workspaceId: string }

export interface CreateEmailTemplatePayload {
  name:        string;
  description?: string | null;
  subject:     string;
  body_html:   string;
  body_text?:  string | null;
  category?:   string | null;
  locale?:     string;
  active?:     boolean;
}

/** Extract {{variable}} placeholders from template strings */
function extractVariables(html: string, subject: string): string[] {
  const re = /\{\{(\w+)\}\}/g;
  const vars = new Set<string>();
  let m: RegExpExecArray | null;
  for (const text of [html, subject]) {
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) vars.add(m[1]);
  }
  return Array.from(vars);
}

export async function listEmailTemplates(
  scope: TemplateScope,
  filters?: { active?: boolean; category?: string },
) {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('email_templates').select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('name');
  if (filters?.active !== undefined) q = q.eq('active', filters.active);
  if (filters?.category) q = q.eq('category', filters.category);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getEmailTemplate(scope: TemplateScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('email_templates').select('*')
    .eq('id', id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createEmailTemplate(scope: TemplateScope, payload: CreateEmailTemplatePayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const variables = extractVariables(payload.body_html, payload.subject);
  const { data, error } = await supabase.from('email_templates').insert({
    id:           randomUUID(),
    tenant_id:    scope.tenantId,
    workspace_id: scope.workspaceId,
    name:         payload.name,
    description:  payload.description ?? null,
    subject:      payload.subject,
    body_html:    payload.body_html,
    body_text:    payload.body_text ?? null,
    variables,
    category:     payload.category ?? null,
    locale:       payload.locale ?? 'es',
    active:       payload.active ?? true,
  }).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateEmailTemplate(
  scope: TemplateScope, id: string, payload: Partial<CreateEmailTemplatePayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const keys: (keyof CreateEmailTemplatePayload)[] = ['name','description','subject','body_html','body_text','category','locale','active'];
  for (const k of keys) if (payload[k] !== undefined) updates[k] = payload[k];
  if (payload.body_html !== undefined || payload.subject !== undefined) {
    const bodyHtml  = (payload.body_html  ?? '') as string;
    const subject   = (payload.subject    ?? '') as string;
    updates.variables = extractVariables(bodyHtml, subject);
  }
  const { data, error } = await supabase.from('email_templates').update(updates)
    .eq('id', id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)
    .select('*').maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteEmailTemplate(scope: TemplateScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('email_templates').delete()
    .eq('id', id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

/** Render a template by substituting {{var}} with values from context */
export function renderTemplate(
  template: { subject: string; body_html: string; body_text?: string | null },
  context: Record<string, string>,
): { subject: string; body_html: string; body_text: string | null } {
  const replace = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? `{{${key}}}`);
  return {
    subject:   replace(template.subject),
    body_html: replace(template.body_html),
    body_text: template.body_text ? replace(template.body_text) : null,
  };
}
