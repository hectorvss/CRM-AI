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
  category: z.enum(['communication_style', 'context_clarification', 'content_sources', 'other']),
  text: z.string().trim().min(1).max(2000),
  active: z.boolean().optional().default(true),
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

export default router;
