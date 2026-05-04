/**
 * server/routes/ai.ts
 *
 * AI-Assisted Operations API — Refactored to Repository Pattern.
 * This route handles agent execution, automated diagnosis, and draft generation.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Router } from 'express';
import { config } from '../config.js';
import { withGeminiRetry } from '../ai/geminiRetry.js';
import { pickGeminiModel } from '../ai/modelSelector.js';
import { SAAS_PRODUCT_CONTEXT, ASSISTANT_TONE_GUIDE } from '../ai/systemContext.js';

// Resolve once per request — cheap, but isolated so we can swap per route.
const copilotModel = pickGeminiModel('copilot_chat');
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { buildCaseState, buildResolveView } from '../data/cases.js';
import { buildContextWindow } from '../pipeline/contextWindow.js';
import {
  createAIRepository,
  createAgentRepository,
  createCaseRepository,
  createPolicyRepository,
  createKnowledgeRepository,
} from '../data/index.js';
import { planEngine } from '../agents/planEngine/index.js';
import { invokeTool, listAvailableTools } from '../agents/planEngine/invokeTool.js';
import { assertCanUseAI, chargeCredits } from '../services/aiUsageMeter.js';

const router = Router();
router.use(extractMultiTenant);

const aiRepository = createAIRepository();
const agentRepository = createAgentRepository();
const caseRepository = createCaseRepository();
const policyRepository = createPolicyRepository();
const knowledgeRepository = createKnowledgeRepository();

function normalizeCopilotHistory(history: Array<{ role: string; content: string }> = []) {
  return history
    .filter((item) => item && typeof item.content === 'string' && item.content.trim().length > 0)
    .slice(-8)
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content.trim(),
    }));
}

function summarizeStateForPrompt(state: ReturnType<typeof buildCaseState>, resolve: ReturnType<typeof buildResolveView>) {
  return {
    case: {
      number: state.case.case_number,
      type: state.case.type,
      status: state.case.status,
      priority: state.case.priority,
      riskLevel: state.case.risk_level,
      approvalState: state.case.approval_state,
      executionState: state.case.execution_state,
      aiDiagnosis: state.case.ai_diagnosis,
      aiRootCause: state.case.ai_root_cause,
      aiRecommendedAction: state.case.ai_recommended_action,
    },
    identifiers: state.identifiers,
    conflict: state.conflict,
    branches: Object.values(state.systems).map((branch: any) => ({
      key: branch.key,
      label: branch.label,
      status: branch.status,
      sourceOfTruth: branch.source_of_truth,
      summary: branch.summary,
      identifiers: branch.identifiers,
      nodeCount: Array.isArray(branch.nodes) ? branch.nodes.length : 0,
    })),
    resolve: {
      blockers: resolve.blockers,
      execution: resolve.execution,
      expected: resolve.expected_post_resolution_state,
    },
    timelineTail: state.timeline.slice(-12),
  };
}

function buildFallbackCopilotAnswer(state: ReturnType<typeof buildCaseState>) {
  const branchSummaries = Object.values(state.systems)
    .filter((branch: any) => ['warning', 'critical', 'blocked'].includes(String(branch.status)))
    .slice(0, 4)
    .map((branch: any) => `${branch.label}: ${branch.summary || branch.status}`);

  return [
    state.case.ai_diagnosis || 'Copilot is using the canonical case state.',
    state.case.ai_root_cause ? `Root cause: ${state.case.ai_root_cause}` : null,
    state.case.ai_recommended_action ? `Recommended action: ${state.case.ai_recommended_action}` : null,
    branchSummaries.length ? `Active blockers: ${branchSummaries.join(' | ')}` : null,
  ].filter(Boolean).join('\n');
}

// ── GET /api/ai/studio ────────────────────────────────────────────────────────
// Master control plane overview for AI Studio. All tabs read from here.

router.get('/studio', requirePermission('agents.read'), async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };

    // Fan out to all data sources in parallel
    const [agents, policyMetrics, knowledgeDomains, knowledgeArticles] = await Promise.allSettled([
      agentRepository.listAgents(scope),
      policyRepository.getMetrics(scope),
      knowledgeRepository.listDomains(scope),
      knowledgeRepository.listArticles(scope, { status: 'published' }),
    ]);

    const agentList: any[] = agents.status === 'fulfilled' ? agents.value : [];
    const metrics = policyMetrics.status === 'fulfilled' ? policyMetrics.value : null;
    const domains: any[] = knowledgeDomains.status === 'fulfilled' ? knowledgeDomains.value : [];
    const articles: any[] = knowledgeArticles.status === 'fulfilled' ? knowledgeArticles.value : [];

    // Agent summary
    const activeAgents = agentList.filter((a) => a.is_active);
    const byCategory = agentList.reduce((acc: Record<string, number>, a) => {
      const cat = a.category ?? 'unknown';
      acc[cat] = (acc[cat] ?? 0) + 1;
      return acc;
    }, {});
    const byMode = agentList.reduce((acc: Record<string, number>, a) => {
      const mode = a.implementation_mode ?? 'unknown';
      acc[mode] = (acc[mode] ?? 0) + 1;
      return acc;
    }, {});

    // Plan engine traces (in-memory store — returns 0 when fresh)
    let recentTraceCount = 0;
    try {
      // listTraces needs a sessionId; we count via a no-op — fix when traces become DB-backed
      recentTraceCount = 0;
    } catch { /* ignore */ }

    // Feature flags (env-driven)
    const llmRoutingEnabled = process.env.SUPER_AGENT_LLM_ROUTING === 'true';

    res.json({
      agents: {
        total: agentList.length,
        active: activeAgents.length,
        inactive: agentList.length - activeAgents.length,
        byCategory,
        byImplementationMode: byMode,
        list: agentList.map((a) => ({
          id: a.id,
          slug: a.slug,
          name: a.name,
          category: a.category,
          is_active: a.is_active,
          implementation_mode: a.implementation_mode,
          version_number: a.version_number ?? null,
          version_status: a.version_status ?? null,
          metrics: a.metrics ?? null,
        })),
      },
      planEngine: {
        enabled: true,
        llmRoutingActive: llmRoutingEnabled,
        shadowModeActive: !llmRoutingEnabled,
        toolCount: planEngine.catalog.list().length,
        recentTraceCount,
        tools: planEngine.catalog.list().map((t) => ({
          name: t.name,
          version: t.version,
          sideEffect: t.sideEffect,
          risk: t.risk,
        })),
      },
      policy: {
        metrics,
        ruleCount: 0, // populated via effective-policy per agent
      },
      knowledge: {
        domainCount: domains.length,
        articleCount: articles.length,
        publishedArticles: articles.filter((a) => a.status === 'published').length,
        domains: domains.map((d) => ({ id: d.id, name: d.name })),
      },
      modelConfig: {
        model: copilotModel,
        apiKeyConfigured: Boolean(config.ai.geminiApiKey),
      },
      featureFlags: {
        llmRouting: llmRoutingEnabled,
      },
    });
  } catch (error) {
    console.error('AI Studio overview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/ai/stats ─────────────────────────────────────────────────────────

router.get('/stats', requirePermission('audit.read'), async (req: MultiTenantRequest, res) => {
  try {
    const stats = await aiRepository.getStats({ tenantId: req.tenantId!, workspaceId: req.workspaceId! });
    res.json(stats);
  } catch (error) {
    console.error('AI stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/ai/diagnose/:caseId ─────────────────────────────────────────────

router.post('/diagnose/:caseId', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  try {
    const { caseId } = req.params;
    const { profile = 'standard' } = req.body;

    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const preflight = await assertCanUseAI(scope, 5);
    if (!preflight.allowed) {
      return res.status(402).json({
        ok: false,
        kind: 'credit_exhausted',
        code: 'AI_CREDIT_EXHAUSTED',
        message: preflight.reason || 'AI credits exhausted. Upgrade your plan or add a top-up pack.',
        upgradeUrl: '/billing',
        available: preflight.available,
      });
    }

    const caseData = await aiRepository.getCaseContextData(scope, caseId);
    if (!caseData) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }

    const jobId = enqueue(
      JobType.AI_DIAGNOSE,
      { caseId, profile },
      {
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        traceId: `diag-${caseId}-${Date.now()}`,
        priority: 5,
      },
    );

    res.json({ ok: true, jobId, status: 'enqueued' });
  } catch (error) {
    console.error('AI diagnosis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/ai/draft/:caseId ───────────────────────────────────────────────

router.post('/draft/:caseId', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  try {
    const { caseId } = req.params;
    const { profile = 'friendly', agentSlug } = req.body;

    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const preflight = await assertCanUseAI(scope, 3);
    if (!preflight.allowed) {
      return res.status(402).json({
        ok: false,
        kind: 'credit_exhausted',
        code: 'AI_CREDIT_EXHAUSTED',
        message: preflight.reason || 'AI credits exhausted. Upgrade your plan or add a top-up pack.',
        upgradeUrl: '/billing',
        available: preflight.available,
      });
    }

    const caseData = await aiRepository.getCaseContextData(scope, caseId);
    if (!caseData) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }

    const jobId = enqueue(
      JobType.AI_DRAFT,
      { caseId, profile, agentSlug },
      {
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        traceId: `draft-${caseId}-${Date.now()}`,
        priority: 5,
      },
    );

    res.json({ ok: true, jobId, status: 'enqueued' });
  } catch (error) {
    console.error('AI draft error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/ai/runs/stats ────────────────────────────────────────────────────

router.get('/runs/stats', requirePermission('audit.read'), async (req: MultiTenantRequest, res) => {
  try {
    const stats = await aiRepository.getStats({ tenantId: req.tenantId!, workspaceId: req.workspaceId! });
    res.json(stats);
  } catch (error) {
    console.error('AI run stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/ai/copilot/:caseId ───────────────────────────────────────────────

router.post('/copilot/:caseId', requirePermission('cases.read'), async (req: MultiTenantRequest, res) => {
  try {
    const { caseId } = req.params;
    const { question = '', history = [] } = req.body ?? {};
    const safeHistory = normalizeCopilotHistory(Array.isArray(history) ? history : []);

    const bundle = await caseRepository.getBundle(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      caseId,
    );

    if (!bundle) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }

    const contextWindow = await buildContextWindow(caseId, req.tenantId!, req.workspaceId!);
    const state = buildCaseState(bundle);
    const resolve = buildResolveView(bundle);
    const summary = summarizeStateForPrompt(state, resolve);

    if (!config.ai.geminiApiKey) {
      res.json({
        ok: true,
        source: 'fallback',
        model: copilotModel,
        answer: buildFallbackCopilotAnswer(state),
        summary,
      });
      return;
    }

    const copilotScope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const copilotPreflight = await assertCanUseAI(copilotScope, 3);
    if (!copilotPreflight.allowed) {
      return res.status(402).json({
        ok: false,
        kind: 'credit_exhausted',
        code: 'AI_CREDIT_EXHAUSTED',
        message: copilotPreflight.reason || 'AI credits exhausted. Upgrade your plan or add a top-up pack.',
        upgradeUrl: '/billing',
        available: copilotPreflight.available,
      });
    }

    const gemini = new GoogleGenerativeAI(config.ai.geminiApiKey);
    const model = gemini.getGenerativeModel({ model: config.ai.geminiModel });

    const prompt = `${SAAS_PRODUCT_CONTEXT}

${ASSISTANT_TONE_GUIDE}

# This turn — Case Copilot

You are the inline copilot for a single case. The human support agent is staring at the case in their inbox right now and needs you to make sense of what they're seeing across every connected system. Be the senior colleague at their shoulder.

Your specific job on this turn:
- Read the full context below.
- Cross-reference systems. If Stripe and the case disagree, say so. If the order says delivered but the customer says not received, surface it.
- Use real IDs, amounts, statuses, timestamps from the data — never invent them.
- Recommend the next concrete action.

# Full case context

System trace (every connected system for this case):
${contextWindow?.toPromptString() || 'Unavailable — the case bundle could not be hydrated. Tell the agent so they know your answer is data-light.'}

Canonical state snapshot:
${JSON.stringify(summary, null, 2)}

Recent conversation in this copilot session:
${safeHistory.length ? safeHistory.map((item) => `${item.role === 'user' ? 'Agent' : 'Copilot'}: ${item.content}`).join('\n') : 'This is the start of the conversation.'}

# Agent's question right now
${String(question).trim()}

Now answer, following every rule in the Voice/Rules section above. No preambles, no narration of what you did — just the substantive reply.`;

    const result = await withGeminiRetry(
      () => model.generateContent(prompt),
      { label: 'ai.copilot' },
    );

    const answer = result.response.text().trim();

    // Charge credits based on actual token usage.
    try {
      const usage = (result.response as any).usageMetadata || {};
      await chargeCredits({
        scope: copilotScope,
        eventType: 'ai_copilot',
        model: copilotModel,
        promptTokens: usage.promptTokenCount || 0,
        completionTokens: usage.candidatesTokenCount || 0,
        metadata: { caseId },
      });
    } catch (err) {
      console.warn('ai.copilot: chargeCredits failed', err);
    }

    res.json({
      ok: true,
      source: 'gemini',
      model: copilotModel,
      answer: answer || buildFallbackCopilotAnswer(state),
      summary,
    });
  } catch (error) {
    console.error('AI copilot error:', error);
    try {
      const { caseId } = req.params;
      const bundle = await caseRepository.getBundle({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, caseId);
      if (bundle) {
        const state = buildCaseState(bundle);
        const resolve = buildResolveView(bundle);
        res.json({
          ok: true,
          source: 'fallback',
          model: copilotModel,
          answer: buildFallbackCopilotAnswer(state),
          summary: summarizeStateForPrompt(state, resolve),
        });
        return;
      }
    } catch {
      // ignore secondary fallback errors
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/ai/copilot/tools ────────────────────────────────────────────────
//
// Returns the planEngine tool catalog visible to the caller. The Copilot UI
// uses this both to show "Run action" suggestions in chat and to feed the
// LLM the list of available tools so it can recommend the correct one.

router.get('/copilot/tools', requirePermission('cases.read'), (req: MultiTenantRequest, res) => {
  const hasPermission = (perm: string) => Array.isArray(req.permissions) && req.permissions.includes(perm);
  const tools = listAvailableTools(hasPermission);
  res.json({ ok: true, count: tools.length, tools });
});

// ── POST /api/ai/copilot/:caseId/invoke ──────────────────────────────────────
//
// Execute a tool call from the Copilot UI. The user confirms; the UI calls
// this endpoint with { tool, args, dry_run? }. Result is normalised so the
// chat surface can render success / failure inline.

router.post('/copilot/:caseId/invoke', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const toolName = String(req.body?.tool || '').trim();
  const args = req.body?.args ?? {};
  const dryRun = req.body?.dry_run === true;
  if (!toolName) return res.status(400).json({ error: 'tool is required' });
  const hasPermission = (perm: string) => Array.isArray(req.permissions) && req.permissions.includes(perm);

  const result = await invokeTool({
    toolName, args,
    tenantId: req.tenantId,
    workspaceId: req.workspaceId ?? null,
    userId: req.userId ?? null,
    hasPermission, dryRun,
    planId: `copilot:${req.params.caseId}`,
  });
  if (!result.ok) {
    const code = (result as any).errorCode;
    const status = code === 'TOOL_NOT_FOUND' ? 404
      : code === 'PERMISSION_DENIED' ? 403
      : code === 'INVALID_ARGS' ? 400
      : code === 'TIMEOUT' ? 504
      : 500;
    return res.status(status).json(result);
  }
  return res.json(result);
});

export default router;
