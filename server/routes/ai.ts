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
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { buildCaseState, buildResolveView } from '../data/cases.js';
import { buildContextWindow } from '../pipeline/contextWindow.js';
import { createAIRepository, createAgentRepository, createCaseRepository } from '../data/index.js';

const router = Router();
router.use(extractMultiTenant);

const aiRepository = createAIRepository();
const agentRepository = createAgentRepository();
const caseRepository = createCaseRepository();

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

    const caseData = await aiRepository.getCaseContextData({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, caseId);
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

    const caseData = await aiRepository.getCaseContextData({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, caseId);
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
        model: config.ai.geminiModel,
        answer: buildFallbackCopilotAnswer(state),
        summary,
      });
      return;
    }

    const gemini = new GoogleGenerativeAI(config.ai.geminiApiKey);
    const model = gemini.getGenerativeModel({ model: config.ai.geminiModel });

    const prompt = `
You are Copilot for a customer support SaaS.
Answer using only the canonical case state and the context below.
If something is missing, say so clearly. Do not invent facts.
Be concise, actionable, and specific.

CASE CONTEXT WINDOW:
${contextWindow?.toPromptString() || 'Unavailable'}

CANONICAL STATE SNAPSHOT:
${JSON.stringify(summary, null, 2)}

RECENT CHAT HISTORY:
${safeHistory.length ? safeHistory.map((item) => `${item.role.toUpperCase()}: ${item.content}`).join('\n') : 'No prior chat history.'}

USER QUESTION:
${String(question).trim()}

Return plain text only.
`.trim();

    const result = await withGeminiRetry(
      () => model.generateContent(prompt),
      { label: 'ai.copilot' },
    );

    const answer = result.response.text().trim();

    res.json({
      ok: true,
      source: 'gemini',
      model: config.ai.geminiModel,
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
          model: config.ai.geminiModel,
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

export default router;
