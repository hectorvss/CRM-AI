import { randomUUID } from 'crypto';
import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withGeminiRetry } from '../ai/geminiRetry.js';
import { getDb } from '../db/client.js';
import { config } from '../config.js';
import { parseRow } from '../db/utils.js';
import { extractMultiTenant, type MultiTenantRequest } from '../middleware/multiTenant.js';
import { resolveAgentKnowledgeBundle } from '../services/agentKnowledge.js';
import { getCaseCanonicalState } from '../services/canonicalState.js';

const router = Router();

router.use(extractMultiTenant);

function getAI() {
  const apiKey = config.ai.geminiApiKey;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  return new GoogleGenerativeAI(apiKey);
}

function hasAI() {
  return Boolean(config.ai.geminiApiKey);
}

function parseJsonArray(value: any): string[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadAgentKnowledgeProfile(agentSlug: string, tenantId: string) {
  const db = getDb();
  const row = db.prepare(`
    SELECT av.knowledge_profile
    FROM agents a
    LEFT JOIN agent_versions av ON a.current_version_id = av.id
    WHERE a.slug = ? AND a.tenant_id = ? AND a.is_active = 1
    LIMIT 1
  `).get(agentSlug, tenantId) as any;

  return row?.knowledge_profile ? JSON.parse(row.knowledge_profile) : {};
}

function buildCaseContext(caseId: string, tenantId: string) {
  const db = getDb();
  const caseRow = db.prepare(`
    SELECT c.*, cu.canonical_name, cu.canonical_email, cu.segment, cu.lifetime_value,
           cu.dispute_rate, cu.refund_rate
    FROM cases c
    LEFT JOIN customers cu ON c.customer_id = cu.id
    WHERE c.id = ? AND c.tenant_id = ?
  `).get(caseId, tenantId) as any;

  if (!caseRow) throw new Error('Case not found');

  const conversation = db.prepare(`
    SELECT * FROM conversations
    WHERE (case_id = ? OR id = ?) AND tenant_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(caseId, caseRow.conversation_id, tenantId) as any;
  const messages: any[] = conversation
    ? db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY sent_at ASC').all(conversation.id)
    : [];
  const orderIds = parseJsonArray(caseRow.order_ids);
  const paymentIds = parseJsonArray(caseRow.payment_ids);
  const returnIds = parseJsonArray(caseRow.return_ids);
  const orders = orderIds
    .map((id: string) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id))
    .filter(Boolean) as any[];
  const payments = paymentIds
    .map((id: string) => db.prepare('SELECT * FROM payments WHERE id = ?').get(id))
    .filter(Boolean) as any[];
  const returns = returnIds
    .map((id: string) => db.prepare('SELECT * FROM returns WHERE id = ?').get(id))
    .filter(Boolean) as any[];
  const canonicalState = getCaseCanonicalState(caseId, tenantId, caseRow.workspace_id || 'ws_default');
  const conflicts = db.prepare(`
    SELECT conflict_domain
    FROM reconciliation_issues
    WHERE case_id = ? AND tenant_id = ?
    ORDER BY id DESC
    LIMIT 10
  `).all(caseId, tenantId) as Array<{ conflict_domain: string }>;

  const contextText = `
CASE: ${caseRow.case_number} | Type: ${caseRow.type} | Status: ${caseRow.status}
Priority: ${caseRow.priority} | Risk: ${caseRow.risk_level} | SLA: ${caseRow.sla_status}
Approval State: ${caseRow.approval_state}

CUSTOMER: ${caseRow.canonical_name} (${caseRow.canonical_email})
Segment: ${caseRow.segment} | LTV: $${caseRow.lifetime_value ?? 'N/A'}
Dispute rate: ${caseRow.dispute_rate} | Refund rate: ${caseRow.refund_rate}

CONVERSATION (${messages.length} messages):
${messages.map((message: any) => `[${message.type.toUpperCase()}] ${message.sender_name || message.type}: ${message.content}`).join('\n')}

ORDERS:
${orders.map((order: any) => `- ${order.external_order_id}: ${order.status} | $${order.total_amount} ${order.currency}
  System states: ${order.system_states}
  ${order.conflict_detected ? 'CONFLICT: ' + order.conflict_detected : ''}
  ${order.recommended_action ? 'Recommended: ' + order.recommended_action : ''}`).join('\n')}

PAYMENTS:
${payments.map((payment: any) => `- ${payment.external_payment_id || payment.id}: ${payment.status} | $${payment.amount} ${payment.currency}
  PSP: ${payment.psp || 'N/A'} | Refund: ${payment.refund_status || 'N/A'}
  ${payment.conflict_detected ? 'CONFLICT: ' + payment.conflict_detected : ''}
  ${payment.recommended_action ? 'Recommended: ' + payment.recommended_action : ''}`).join('\n')}

RETURNS:
${returns.map((ret: any) => `- ${ret.external_return_id || ret.id}: ${ret.status} | ${ret.return_reason || 'N/A'}
  Refund: ${ret.refund_status || 'N/A'} | Carrier: ${ret.carrier_status || 'N/A'}
  ${ret.conflict_detected ? 'CONFLICT: ' + ret.conflict_detected : ''}
  ${ret.recommended_action ? 'Recommended: ' + ret.recommended_action : ''}`).join('\n')}

CANONICAL CONFLICT:
${canonicalState?.conflict.has_conflict ? `${canonicalState.conflict.conflict_type || 'conflict'}: ${canonicalState.conflict.root_cause || canonicalState.conflict.recommended_action}` : 'No active canonical conflict'}
`.trim();

  return {
    caseRow: parseRow(caseRow) as any,
    contextText,
    caseContext: {
      type: caseRow.type,
      intent: caseRow.intent,
      tags: parseRow(caseRow).tags ?? [],
      customerSegment: caseRow.segment ?? null,
      conflictDomains: conflicts.map((item) => item.conflict_domain).filter(Boolean),
      latestMessage: messages.at(-1)?.content ?? null,
      canonicalState,
    },
  };
}

function buildFallbackCopilotAnswer(question: string, contextText: string, canonicalState: any, citations: any[] = []) {
  const conflict = canonicalState?.conflict;
  const customerName = canonicalState?.customer?.canonical_name || canonicalState?.case?.customer_name || 'the customer';
  const orderId = canonicalState?.identifiers?.order_ids?.[0] || canonicalState?.case?.case_number || 'the case';
  const mainIssue = conflict?.root_cause || conflict?.recommended_action || canonicalState?.case?.ai_diagnosis || 'the case is still being analyzed';
  const recommended = conflict?.recommended_action || canonicalState?.case?.ai_recommended_action || 'continue reviewing the canonical state before taking action';
  const evidence = citations.length > 0 ? ` I am applying ${citations.length} accessible knowledge source${citations.length === 1 ? '' : 's'}.` : '';

  return {
    answer: `For ${customerName}, the canonical state says the key issue on ${orderId} is: ${mainIssue}. Recommended next action: ${recommended}.${evidence}\n\nRegarding your question: "${question}"\n\nI would answer using the current customer/case state, avoid promising an action that is blocked by policy, and escalate if the conflict or approval state requires human review.`,
    mode: 'fallback',
    context_excerpt: contextText.slice(0, 1200),
  };
}

function buildKnowledgePrompt(agentSlug: string, tenantId: string, workspaceId: string, caseContext: any) {
  const knowledgeProfile = loadAgentKnowledgeProfile(agentSlug, tenantId);
  return resolveAgentKnowledgeBundle({
    tenantId,
    workspaceId,
    knowledgeProfile,
    caseContext,
  });
}

router.post('/diagnose/:caseId', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const { caseRow, contextText, caseContext } = buildCaseContext(req.params.caseId, tenantId);
    const knowledgeBundle = buildKnowledgePrompt('qa-policy-check', tenantId, workspaceId, caseContext);
    const ai = getAI();
    const model = ai.getGenerativeModel({ model: config.ai.geminiModel });

    const prompt = `You are an expert AI operations analyst for a support & operations SaaS.
Analyze the following case and provide a structured diagnosis.

${contextText}

${knowledgeBundle.promptContext ? `RELEVANT POLICIES:\n${knowledgeBundle.promptContext}\n` : ''}

Provide a JSON response with this exact structure:
{
  "summary": "1-2 sentence executive summary of the case situation",
  "root_cause": "The specific technical or operational root cause",
  "diagnosis": "Detailed analysis paragraph",
  "confidence": 0.95,
  "risk_factors": [{"factor": "name", "detail": "explanation"}],
  "recommended_action": "Clear, actionable recommendation",
  "requires_approval": false,
  "draft_reply": "A professional, empathetic draft reply to the customer"
}

Return ONLY valid JSON, no markdown or explanation.`;

    const result = await withGeminiRetry(
      () => model.generateContent(prompt),
      { label: 'api.ai.diagnose' },
    );
    const text = result.response.text().trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(500).json({ error: 'AI response parse failed', raw: text });
    }

    const db = getDb();
    db.prepare(`
      UPDATE cases SET
        ai_diagnosis = ?, ai_root_cause = ?, ai_confidence = ?, ai_recommended_action = ?,
        ai_evidence_refs = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(
      parsed.summary,
      parsed.root_cause,
      parsed.confidence,
      parsed.recommended_action,
      JSON.stringify(knowledgeBundle.citations),
      req.params.caseId,
      tenantId,
    );

    res.json({
      ...parsed,
      citations: knowledgeBundle.citations,
      case_type: caseRow.type,
    });
  } catch (err: any) {
    console.error('AI diagnose error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/draft/:caseId', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const { tone = 'professional', additional_context = '' } = req.body;
    const { contextText, caseContext } = buildCaseContext(req.params.caseId, tenantId);
    const knowledgeBundle = buildKnowledgePrompt('composer-translator', tenantId, workspaceId, caseContext);
    const ai = getAI();
    const model = ai.getGenerativeModel({ model: config.ai.geminiModel });

    const prompt = `You are an expert customer support agent for an ecommerce operations platform.
Write a ${tone} reply to the customer based on this case:

${contextText}

${knowledgeBundle.promptContext ? `RELEVANT POLICIES:\n${knowledgeBundle.promptContext}\n` : ''}
${additional_context ? `Additional context: ${additional_context}` : ''}

Rules:
- Be empathetic and professional
- Reference specific order/case details
- Don't promise things you can't confirm
- Keep it concise (2-4 paragraphs max)
- Don't use generic phrases like "I hope this email finds you well"

Return ONLY the reply text, nothing else.`;

    const result = await withGeminiRetry(
      () => model.generateContent(prompt),
      { label: 'api.ai.draft' },
    );
    const draft = result.response.text().trim();

    const db = getDb();
    const caseRow = db.prepare('SELECT conversation_id FROM cases WHERE id = ? AND tenant_id = ?')
      .get(req.params.caseId, tenantId) as any;

    if (caseRow?.conversation_id) {
      const draftId = randomUUID();
      db.prepare(`
        INSERT INTO draft_replies (
          id, case_id, conversation_id, content, generated_by, generated_at,
          status, tenant_id, has_policies, citations
        )
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'pending_review', ?, ?, ?)
      `).run(
        draftId,
        req.params.caseId,
        caseRow.conversation_id,
        draft,
        config.ai.geminiModel,
        tenantId,
        knowledgeBundle.citations.length > 0 ? 1 : 0,
        JSON.stringify(knowledgeBundle.citations),
      );
    }

    res.json({ draft, citations: knowledgeBundle.citations });
  } catch (err: any) {
    console.error('AI draft error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/policy-check', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const { action, context: actionContext } = req.body;
    const db = getDb();
    const policies = db.prepare('SELECT * FROM policy_rules WHERE tenant_id = ? AND is_active = 1').all(tenantId) as any[];

    const caseId = String(actionContext?.caseId ?? '');
    const fallbackContext = {
      type: actionContext?.caseType ?? actionContext?.type ?? 'general_support',
      intent: actionContext?.intent ?? null,
      tags: Array.isArray(actionContext?.tags) ? actionContext.tags : [],
      customerSegment: actionContext?.customerSegment ?? null,
      conflictDomains: Array.isArray(actionContext?.conflictDomains) ? actionContext.conflictDomains : [],
      latestMessage: actionContext?.latestMessage ?? null,
    };
    const caseContext = caseId ? buildCaseContext(caseId, tenantId).caseContext : fallbackContext;
    const knowledgeBundle = buildKnowledgePrompt('approval-gatekeeper', tenantId, workspaceId, caseContext);

    const ai = getAI();
    const model = ai.getGenerativeModel({ model: config.ai.geminiModel });

    const prompt = `You are a policy compliance checker for a customer support operations platform.

ACTION TO EVALUATE: ${action}
CONTEXT: ${JSON.stringify(actionContext)}

ACTIVE POLICY RULES:
${policies.map((policy) => `- ${policy.name}: conditions=${policy.conditions}`).join('\n')}

${knowledgeBundle.promptContext ? `KNOWLEDGE BASE POLICIES:\n${knowledgeBundle.promptContext}` : 'KNOWLEDGE BASE POLICIES:\nNo accessible policies.'}

Evaluate if this action is compliant and return JSON:
{
  "decision": "allow" | "conditional" | "approval_required" | "block",
  "reason": "explanation",
  "matched_rule": "rule name if matched",
  "citation": "article title cited",
  "risk_level": "low" | "medium" | "high" | "critical"
}

Return ONLY valid JSON.`;

    const result = await withGeminiRetry(
      () => model.generateContent(prompt),
      { label: 'api.ai.policy-check' },
    );
    const text = result.response.text().trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const parsed = JSON.parse(text);

    res.json({
      ...parsed,
      available_citations: knowledgeBundle.citations,
      blocked_documents: knowledgeBundle.blockedDocuments.map((doc) => ({
        id: doc.id,
        title: doc.title,
        reason: doc.blocked_reason,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/copilot/:caseId', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const { question, history = [] } = req.body || {};
    const cleanQuestion = String(question || '').trim();

    if (!cleanQuestion) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const { contextText, caseContext } = buildCaseContext(req.params.caseId, tenantId);
    const canonicalState = getCaseCanonicalState(req.params.caseId, tenantId, workspaceId);
    const knowledgeBundle = buildKnowledgePrompt('composer-translator', tenantId, workspaceId, caseContext);

    if (!hasAI()) {
      return res.json({
        ...buildFallbackCopilotAnswer(cleanQuestion, contextText, canonicalState, knowledgeBundle.citations),
        citations: knowledgeBundle.citations,
        blocked_documents: knowledgeBundle.blockedDocuments.map((doc) => ({
          id: doc.id,
          title: doc.title,
          reason: doc.blocked_reason,
        })),
      });
    }

    const ai = getAI();
    const model = ai.getGenerativeModel({ model: config.ai.geminiModel });
    const compactHistory = Array.isArray(history)
      ? history.slice(-8).map((item: any) => `${item.role || 'user'}: ${String(item.content || '').slice(0, 800)}`).join('\n')
      : '';

    const prompt = `You are CRM AI Copilot inside an ecommerce operations SaaS.
You answer support operators, not customers directly, unless asked to draft customer-facing copy.
Use the canonical customer/case state as the source of truth. Respect accessible knowledge policies.
If an action is blocked by approval/policy/conflict, say that clearly and recommend the safe next step.

CANONICAL CASE CONTEXT:
${contextText}

${canonicalState ? `FULL CANONICAL STATE JSON:\n${JSON.stringify(canonicalState).slice(0, 14000)}\n` : ''}

${knowledgeBundle.promptContext ? `ACCESSIBLE KNOWLEDGE POLICIES:\n${knowledgeBundle.promptContext}\n` : 'ACCESSIBLE KNOWLEDGE POLICIES:\nNo accessible policies.'}

RECENT COPILOT CHAT:
${compactHistory || 'No previous Copilot messages in this session.'}

OPERATOR QUESTION:
${cleanQuestion}

Return a concise, actionable answer in the same language as the operator question.
Mention the relevant system states and policy/approval blockers when they matter.
Do not invent SaaS data that is not present in the canonical state.`;

    const result = await withGeminiRetry(
      () => model.generateContent(prompt),
      { label: 'api.ai.copilot' },
    );

    res.json({
      answer: result.response.text().trim(),
      mode: 'llm',
      citations: knowledgeBundle.citations,
      blocked_documents: knowledgeBundle.blockedDocuments.map((doc) => ({
        id: doc.id,
        title: doc.title,
        reason: doc.blocked_reason,
      })),
    });
  } catch (err: any) {
    console.error('AI copilot error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', (req: MultiTenantRequest, res) => {
  const db = getDb();
  const tenantId = req.tenantId!;
  const totalRuns = db.prepare('SELECT COUNT(*) as c FROM agent_runs WHERE tenant_id = ?').get(tenantId) as any;
  const resolvedByAI = db.prepare(`SELECT COUNT(*) as c FROM cases WHERE tenant_id = ? AND resolved_by LIKE 'agent%'`).get(tenantId) as any;
  const totalCases = db.prepare('SELECT COUNT(*) as c FROM cases WHERE tenant_id = ?').get(tenantId) as any;
  const pendingApprovals = db.prepare(`SELECT COUNT(*) as c FROM approval_requests WHERE tenant_id = ? AND status='pending'`).get(tenantId) as any;

  res.json({
    total_agent_runs: totalRuns.c,
    ai_resolution_rate: totalCases.c > 0 ? Math.round((resolvedByAI.c / totalCases.c) * 100) : 0,
    pending_approvals: pendingApprovals.c,
    total_cases: totalCases.c,
  });
});

export default router;
