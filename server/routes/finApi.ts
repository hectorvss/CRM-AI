/**
 * server/routes/finApi.ts
 *
 * Fin AI Agent API (customer-facing autonomous support agent).
 * Spec: docs/fin-ai-agent-spec.md.
 *
 * GET    /fin/config              — full fin.* config (with defaults filled)
 * PATCH  /fin/config              — deep-merge partial config
 * GET    /fin/guidance            — list guidance pieces
 * POST   /fin/guidance            — add a piece
 * PATCH  /fin/guidance/:id        — edit / toggle
 * DELETE /fin/guidance/:id        — remove
 * POST   /fin/preview             — dry-run the pipeline against a question
 * GET    /fin/runs/:caseId        — read ai_triage (answer inspection)
 * GET    /fin/gaps                — open knowledge gaps
 * GET    /fin/outcomes            — outcome events (analytics)
 */

import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { sendError } from '../http/errors.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { loadFinConfig, patchFinConfig, runFinPipeline, type FinScope } from '../agents/finAgent/index.js';
import { getUtilityProvider } from '../agents/chatAgent/providers/index.js';

const router = Router();
router.use(extractMultiTenant);

function scopeOf(req: MultiTenantRequest): FinScope | null {
  if (!req.tenantId || !req.workspaceId) return null;
  return { tenantId: req.tenantId, workspaceId: req.workspaceId };
}

// ── Config ────────────────────────────────────────────────────────────────────

router.get('/config', async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    res.json({ data: await loadFinConfig(scope) });
  } catch (err) {
    console.error('[finApi] config get failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.patch('/config', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    res.json({ data: await patchFinConfig(scope, req.body ?? {}) });
  } catch (err: any) {
    if (err?.code === 'FIN_GUIDANCE_CAP') return sendError(res, 422, 'FIN_GUIDANCE_CAP', err.message);
    if (err?.name === 'ZodError') return sendError(res, 400, 'INVALID_CONFIG', err.issues?.[0]?.message ?? 'Invalid config');
    console.error('[finApi] config patch failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── Guidance CRUD (entity-style facade over the config blob) ──────────────────

const GuidanceCreate = z.object({
  category: z.enum(['communication_style', 'context_clarification', 'content_sources', 'spam_filtering', 'other']),
  text: z.string().trim().min(1).max(2000),
  active: z.boolean().optional().default(true),
  title: z.string().max(200).optional(),
  audience: z.string().max(100).optional(),
  channels: z.array(z.string()).optional(),
});
const GuidancePatch = GuidanceCreate.partial();

router.get('/guidance', async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const config = await loadFinConfig(scope);
    res.json({ data: config.guidance });
  } catch (err) {
    console.error('[finApi] guidance list failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/guidance', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  const parsed = GuidanceCreate.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, 'INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid body');
  try {
    const config = await loadFinConfig(scope);
    const piece = { id: crypto.randomUUID(), ...parsed.data };
    const next = await patchFinConfig(scope, { guidance: [...config.guidance, piece] });
    res.status(201).json({ data: next.guidance.find((g) => g.id === piece.id) });
  } catch (err: any) {
    if (err?.code === 'FIN_GUIDANCE_CAP') return sendError(res, 422, 'FIN_GUIDANCE_CAP', err.message);
    console.error('[finApi] guidance create failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.patch('/guidance/:id', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  const parsed = GuidancePatch.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, 'INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid body');
  try {
    const config = await loadFinConfig(scope);
    const idx = config.guidance.findIndex((g) => g.id === req.params.id);
    if (idx === -1) return sendError(res, 404, 'GUIDANCE_NOT_FOUND', 'Guidance piece not found');
    const guidance = [...config.guidance];
    guidance[idx] = { ...guidance[idx], ...parsed.data };
    const next = await patchFinConfig(scope, { guidance });
    res.json({ data: next.guidance[idx] });
  } catch (err: any) {
    if (err?.code === 'FIN_GUIDANCE_CAP') return sendError(res, 422, 'FIN_GUIDANCE_CAP', err.message);
    console.error('[finApi] guidance patch failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.delete('/guidance/:id', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const config = await loadFinConfig(scope);
    if (!config.guidance.some((g) => g.id === req.params.id)) {
      return sendError(res, 404, 'GUIDANCE_NOT_FOUND', 'Guidance piece not found');
    }
    await patchFinConfig(scope, { guidance: config.guidance.filter((g) => g.id !== req.params.id) });
    res.status(204).send();
  } catch (err) {
    console.error('[finApi] guidance delete failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Improve a single guidance/pauta text with the utility LLM. Preserves meaning
// and any {{attribute}} tokens; returns only the rewritten text.
const GUIDANCE_OPTIMIZE_SYSTEM = `Eres un editor experto en pautas para un agente de soporte de IA (Fin).
Reescribe la pauta que te den para que sea más clara, concreta y accionable, sin cambiar su intención.
Reglas:
- Mantén el MISMO idioma del texto original.
- Conserva EXACTAMENTE cualquier token con formato {{...}} (atributos) tal cual.
- Sé conciso; usa viñetas con "-" solo si aportan claridad.
- Responde SOLO con la pauta mejorada, sin comillas, sin preámbulos ni explicaciones.`;
const OptimizeBody = z.object({ text: z.string().trim().min(1).max(8000) });
router.post('/guidance/optimize', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  const parsed = OptimizeBody.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, 'INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid body');
  try {
    const { text } = await getUtilityProvider().completeUtility({
      system: GUIDANCE_OPTIMIZE_SYSTEM,
      prompt: `Pauta original:\n${parsed.data.text}`,
      maxTokens: 900,
    });
    const improved = (text || '').trim();
    res.json({ data: { text: improved || parsed.data.text } });
  } catch (err) {
    console.error('[finApi] guidance optimize failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── Preview (Pruebas screen) ──────────────────────────────────────────────────

const PreviewBody = z.object({
  question: z.string().trim().min(1).max(4000),
});

router.post('/preview', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  const parsed = PreviewBody.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, 'INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid body');
  try {
    const result = await runFinPipeline({
      scope,
      caseId: 'preview',
      conversationId: 'preview',
      channel: 'chat',
      dryRun: true,
      previewQuestion: parsed.data.question,
    });
    res.json({ data: result });
  } catch (err) {
    console.error('[finApi] preview failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── Answer inspection + analytics reads ───────────────────────────────────────

router.get('/runs/:caseId', async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('cases')
      .select('id, ai_triage, ai_resolved, escalation_reason')
      .eq('id', req.params.caseId)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return sendError(res, 404, 'CASE_NOT_FOUND', 'Case not found');
    res.json({ data });
  } catch (err) {
    console.error('[finApi] runs get failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/gaps', async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('fin_knowledge_gaps')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .eq('status', String(req.query.status ?? 'open'))
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('[finApi] gaps list failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/outcomes', async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('fin_outcomes')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('[finApi] outcomes list failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ═══ F4: Procedures + Data Connectors (spec §5, §5.1) ═════════════════════════

const StepSchema = z.discriminatedUnion('type', [
  // title/ui_kind are presentation metadata round-tripped for the editor.
  z.object({ type: z.literal('instruction'), text: z.string().min(1), title: z.string().optional(), ui_kind: z.string().optional() }),
  z.object({ type: z.literal('collect'), variable: z.string().regex(/^\w+$/), prompt: z.string().min(1), title: z.string().optional() }),
  z.object({ type: z.literal('verify_identity'), method: z.enum(['email_otp']).optional(), title: z.string().optional() }),
  z.object({ type: z.literal('condition'), text: z.string().min(1), title: z.string().optional(), ui_kind: z.string().optional() }),
  z.object({
    type: z.literal('action'),
    action_id: z.string().min(1),
    args_template: z.record(z.string(), z.string()),
    preview: z.string().optional(),
  }),
  z.object({ type: z.literal('handoff'), team: z.string().optional(), note: z.string().optional() }),
]);

const ProcedureCreate = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  trigger_criteria: z.string().max(2000).optional().default(''),
  steps: z.array(StepSchema).max(50).optional().default([]),
});
const ProcedurePatch = ProcedureCreate.partial().extend({
  status: z.enum(['draft', 'live', 'archived']).optional(),
});

router.get('/procedures', async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('fin_procedures').select('*')
      .eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('[finApi] procedures list failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/procedures', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  const parsed = ProcedureCreate.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, 'INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid body');
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('fin_procedures')
      .insert({ ...parsed.data, tenant_id: scope.tenantId, workspace_id: scope.workspaceId })
      .select('*').single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    console.error('[finApi] procedure create failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.patch('/procedures/:id', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  const parsed = ProcedurePatch.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, 'INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid body');
  try {
    const supabase = getSupabaseAdmin();
    const updates: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };
    // Publishing bumps the version (drafts are edited in place, spec §10).
    if (parsed.data.status === 'live') {
      const { data: current } = await supabase
        .from('fin_procedures').select('version, status').eq('id', req.params.id)
        .eq('tenant_id', scope.tenantId).maybeSingle();
      if (current && current.status !== 'live') updates.version = (current.version ?? 1) + 1;
    }
    const { data, error } = await supabase
      .from('fin_procedures').update(updates)
      .eq('id', req.params.id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)
      .select('*').maybeSingle();
    if (error) throw error;
    if (!data) return sendError(res, 404, 'PROCEDURE_NOT_FOUND', 'Procedure not found');
    res.json({ data });
  } catch (err) {
    console.error('[finApi] procedure patch failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.delete('/procedures/:id', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('fin_procedures').update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    console.error('[finApi] procedure archive failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── Connectors + actions ──────────────────────────────────────────────────────

const ConnectorCreate = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['internal', 'http']),
  base_url: z.string().url().optional().nullable(),
  /** { bearer } or { header_name, header_value } — encrypted at rest, never read back. */
  auth: z.record(z.string(), z.string()).optional(),
  active: z.boolean().optional().default(true),
});

const ActionCreate = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional().default(''),
  tool_name: z.string().optional().nullable(),
  http_method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().nullable(),
  http_path: z.string().max(500).optional().nullable(),
  input_schema: z.record(z.string(), z.unknown()).optional().default({}),
  policy: z.enum(['read', 'write_auto', 'write_approval', 'blocked']).optional().default('read'),
  requires_identity: z.boolean().optional().default(false),
});

router.get('/connectors', async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('fin_connectors')
      .select('id, name, kind, base_url, active, created_at, updated_at, fin_connector_actions(*)')
      .eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId);
    if (error) throw error;
    res.json({ data }); // auth_encrypted intentionally never selected
  } catch (err) {
    console.error('[finApi] connectors list failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/connectors', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  const parsed = ConnectorCreate.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, 'INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid body');
  try {
    const { encryptAuth } = await import('../agents/finAgent/connectors.js');
    const { auth, ...rest } = parsed.data;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('fin_connectors')
      .insert({
        ...rest,
        auth_encrypted: auth && Object.keys(auth).length ? encryptAuth(auth) : null,
        tenant_id: scope.tenantId,
        workspace_id: scope.workspaceId,
      })
      .select('id, name, kind, base_url, active').single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err: any) {
    if (err?.code === 'FIN_SECRET_MISSING') return sendError(res, 503, 'FIN_SECRET_MISSING', err.message);
    console.error('[finApi] connector create failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/connectors/:id/actions', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  const parsed = ActionCreate.safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, 'INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid body');
  try {
    const supabase = getSupabaseAdmin();
    const { data: connector } = await supabase
      .from('fin_connectors').select('id')
      .eq('id', req.params.id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)
      .maybeSingle();
    if (!connector) return sendError(res, 404, 'CONNECTOR_NOT_FOUND', 'Connector not found');
    const { data, error } = await supabase
      .from('fin_connector_actions')
      .insert({ ...parsed.data, connector_id: req.params.id, tenant_id: scope.tenantId, workspace_id: scope.workspaceId })
      .select('*').single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    console.error('[finApi] action create failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.patch('/actions/:id', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  const parsed = ActionCreate.partial().safeParse(req.body ?? {});
  if (!parsed.success) return sendError(res, 400, 'INVALID_BODY', parsed.error.issues[0]?.message ?? 'Invalid body');
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('fin_connector_actions')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)
      .select('*').maybeSingle();
    if (error) throw error;
    if (!data) return sendError(res, 404, 'ACTION_NOT_FOUND', 'Action not found');
    res.json({ data });
  } catch (err) {
    console.error('[finApi] action patch failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── Knowledge indexing (P0: make UI content retrievable by Fin) ───────────────

// GET /fin/knowledge-status → how many Fin chunks are indexed
router.get('/knowledge-status', async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const { countIndexedChunks } = await import('../agents/finAgent/ingest.js');
    res.json({ data: { indexed_chunks: await countIndexedChunks(scope) } });
  } catch (err) {
    console.error('[finApi] knowledge-status failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// POST /fin/reindex → (re)embed every fin_service article for this workspace
router.post('/reindex', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const { reindexWorkspace } = await import('../agents/finAgent/ingest.js');
    res.json({ data: await reindexWorkspace(scope) });
  } catch (err) {
    console.error('[finApi] reindex failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── AI drafts (inbox: send to customer / discard) ─────────────────────────────

router.post('/drafts/:messageId/send', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const supabase = getSupabaseAdmin();
    const { data: msg, error } = await supabase
      .from('messages')
      .select('id, case_id, conversation_id, is_private, author_type')
      .eq('id', req.params.messageId)
      .eq('tenant_id', scope.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!msg || msg.author_type !== 'ai' || !msg.is_private) {
      return sendError(res, 404, 'DRAFT_NOT_FOUND', 'AI draft not found (or already sent)');
    }
    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from('messages')
      .update({ is_private: false, type: 'reply', sent_at: now })
      .eq('id', msg.id)
      .eq('tenant_id', scope.tenantId);
    if (upErr) throw upErr;
    // The reply is now public → the assumed-resolution sweeper may claim it.
    if (msg.case_id) {
      const { data: caseRow } = await supabase
        .from('cases').select('ai_triage').eq('id', msg.case_id).eq('tenant_id', scope.tenantId).maybeSingle();
      const triage = { ...(caseRow?.ai_triage ?? {}), outcome: 'replied', sent_by_operator_at: now };
      await supabase.from('cases')
        .update({ ai_triage: triage, updated_at: now })
        .eq('id', msg.case_id).eq('tenant_id', scope.tenantId);
    }
    res.json({ data: { id: msg.id, sent: true } });
  } catch (err) {
    console.error('[finApi] draft send failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/drafts/:messageId/discard', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('messages')
      .delete()
      .eq('id', req.params.messageId)
      .eq('tenant_id', scope.tenantId)
      .eq('is_private', true)
      .eq('author_type', 'ai')
      .select('id');
    if (error) throw error;
    if (!data?.length) return sendError(res, 404, 'DRAFT_NOT_FOUND', 'AI draft not found (or already sent)');
    res.status(204).send();
  } catch (err) {
    console.error('[finApi] draft discard failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── Pending actions (inbox approvals) ─────────────────────────────────────────

router.get('/pending-actions', async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('fin_pending_actions').select('*')
      .eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)
      .eq('status', String(req.query.status ?? 'pending'))
      .order('requested_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('[finApi] pending list failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/pending-actions/:id/:decision(approve|reject)', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  try {
    const { decidePendingAction } = await import('../agents/finAgent/connectors.js');
    const { resumeRunAfterApproval } = await import('../agents/finAgent/procedures.js');
    const decision = req.params.decision === 'approve' ? 'approved' : 'rejected';
    const supabase = getSupabaseAdmin();
    const { data: pending } = await supabase
      .from('fin_pending_actions').select('run_id')
      .eq('id', req.params.id).eq('tenant_id', scope.tenantId).maybeSingle();
    const result = await decidePendingAction(scope, req.params.id, decision, req.userId ?? 'unknown');
    if (!result.ok && decision === 'approved') {
      return sendError(res, 422, 'ACTION_EXECUTION_FAILED', result.error ?? 'Execution failed');
    }
    if (pending?.run_id) {
      await resumeRunAfterApproval(scope, pending.run_id, decision === 'approved', result.result ?? null);
    }
    res.json({ data: { decision, result: result.result ?? null } });
  } catch (err) {
    console.error('[finApi] pending decide failed:', err);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
