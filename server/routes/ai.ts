import { Router } from 'express';
import { getDb } from '../db/client.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { sendError } from '../http/errors.js';

const router = Router();
const TENANT_ID = 'tenant_default';

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  return new GoogleGenerativeAI(apiKey);
}

function buildCaseContext(caseId: string): string {
  const db = getDb();
  const c = db.prepare(`
    SELECT c.*, cu.canonical_name, cu.canonical_email, cu.segment, cu.lifetime_value,
           cu.dispute_rate, cu.refund_rate
    FROM cases c LEFT JOIN customers cu ON c.customer_id = cu.id
    WHERE c.id = ? AND c.tenant_id = ?
  `).get(caseId, TENANT_ID) as any;
  if (!c) throw new Error('Case not found');

  const conv = db.prepare('SELECT * FROM conversations WHERE case_id = ?').get(caseId) as any;
  const messages = conv ? db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY sent_at ASC').all(conv.id) : [];
  const orderIds = JSON.parse(c.order_ids || '[]');
  const orders = orderIds.map((id: string) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id)).filter(Boolean);

  return `
CASE: ${c.case_number} | Type: ${c.type} | Status: ${c.status}
Priority: ${c.priority} | Risk: ${c.risk_level} | SLA: ${c.sla_status}
Approval State: ${c.approval_state}

CUSTOMER: ${c.canonical_name} (${c.canonical_email})
Segment: ${c.segment} | LTV: $${c.lifetime_value ?? 'N/A'}
Dispute rate: ${c.dispute_rate} | Refund rate: ${c.refund_rate}

CONVERSATION (${messages.length} messages):
${messages.map((m: any) => `[${m.type.toUpperCase()}] ${m.sender_name || m.type}: ${m.content}`).join('\n')}

ORDERS:
${orders.map((o: any) => `- ${o.external_order_id}: ${o.status} | $${o.total_amount} ${o.currency}
  System states: ${o.system_states}
  ${o.conflict_detected ? 'CONFLICT: ' + o.conflict_detected : ''}
  ${o.recommended_action ? 'Recommended: ' + o.recommended_action : ''}`).join('\n')}
`.trim();
}

// POST /api/ai/diagnose/:caseId
router.post('/diagnose/:caseId', async (req, res) => {
  try {
    const context = buildCaseContext(req.params.caseId);
    const ai = getAI();
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are an expert AI operations analyst for a support & operations SaaS.
Analyze the following case and provide a structured diagnosis.

${context}

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

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');

    let parsed;
    try { parsed = JSON.parse(text); } catch {
      return sendError(res, 500, 'AI_RESPONSE_PARSE_FAILED', 'AI response parse failed', { raw: text });
    }

    // Persist AI output to case
    const db = getDb();
    db.prepare(`
      UPDATE cases SET 
        ai_diagnosis=?, ai_root_cause=?, ai_confidence=?, ai_recommended_action=?,
        updated_at=datetime('now')
      WHERE id=?
    `).run(parsed.summary, parsed.root_cause, parsed.confidence, parsed.recommended_action, req.params.caseId);

    res.json(parsed);
  } catch (err: any) {
    console.error('AI diagnose error:', err);
    sendError(res, 500, 'AI_DIAGNOSE_ERROR', err.message || 'AI diagnose error');
  }
});

// POST /api/ai/draft/:caseId
router.post('/draft/:caseId', async (req, res) => {
  try {
    const context = buildCaseContext(req.params.caseId);
    const { tone = 'professional', additional_context = '' } = req.body;
    const ai = getAI();
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are an expert customer support agent for an ecommerce operations platform.
Write a ${tone} reply to the customer based on this case:

${context}

${additional_context ? 'Additional context: ' + additional_context : ''}

Rules:
- Be empathetic and professional
- Reference specific order/case details
- Don't promise things you can't confirm
- Keep it concise (2-4 paragraphs max)
- Don't use generic phrases like "I hope this email finds you well"

Return ONLY the reply text, nothing else.`;

    const result = await model.generateContent(prompt);
    const draft = result.response.text().trim();

    // Save draft to DB
    const db = getDb();
    const caseRow = db.prepare('SELECT conversation_id FROM cases WHERE id = ?').get(req.params.caseId) as any;
    if (caseRow?.conversation_id) {
      const draftId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO draft_replies (id,case_id,conversation_id,content,generated_by,generated_at,status,tenant_id)
        VALUES (?,?,?,?,'gemini-1.5-flash',datetime('now'),'pending_review',?)
      `).run(draftId, req.params.caseId, caseRow.conversation_id, draft, TENANT_ID);
    }

    res.json({ draft });
  } catch (err: any) {
    console.error('AI draft error:', err);
    sendError(res, 500, 'AI_DRAFT_ERROR', err.message || 'AI draft error');
  }
});

// POST /api/ai/policy-check
router.post('/policy-check', async (req, res) => {
  try {
    const { action, context: actionContext } = req.body;
    const db = getDb();

    // Load policy rules
    const policies = db.prepare('SELECT * FROM policy_rules WHERE tenant_id = ? AND is_active = 1').all(TENANT_ID) as any[];
    const articles = db.prepare('SELECT title, content FROM knowledge_articles WHERE tenant_id = ? AND status = "published" AND type = "policy"').all(TENANT_ID) as any[];

    const ai = getAI();
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a policy compliance checker for a customer support operations platform.

ACTION TO EVALUATE: ${action}
CONTEXT: ${JSON.stringify(actionContext)}

ACTIVE POLICY RULES:
${policies.map(p => `- ${p.name}: conditions=${p.conditions}`).join('\n')}

KNOWLEDGE BASE POLICIES:
${articles.map(a => `--- ${a.title} ---\n${a.content.slice(0, 500)}`).join('\n\n')}

Evaluate if this action is compliant and return JSON:
{
  "decision": "allow" | "conditional" | "approval_required" | "block",
  "reason": "explanation",
  "matched_rule": "rule name if matched",
  "citation": "article title cited",
  "risk_level": "low" | "medium" | "high" | "critical"
}

Return ONLY valid JSON.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (err: any) {
    sendError(res, 500, 'AI_POLICY_CHECK_ERROR', err.message || 'AI policy check error');
  }
});

// GET /api/ai/stats
router.get('/stats', (req, res) => {
  const db = getDb();
  const totalRuns = db.prepare('SELECT COUNT(*) as c FROM agent_runs WHERE tenant_id = ?').get(TENANT_ID) as any;
  const resolvedByAI = db.prepare(`SELECT COUNT(*) as c FROM cases WHERE tenant_id = ? AND resolved_by LIKE 'agent%'`).get(TENANT_ID) as any;
  const totalCases = db.prepare('SELECT COUNT(*) as c FROM cases WHERE tenant_id = ?').get(TENANT_ID) as any;
  const pendingApprovals = db.prepare(`SELECT COUNT(*) as c FROM approval_requests WHERE tenant_id = ? AND status='pending'`).get(TENANT_ID) as any;

  res.json({
    total_agent_runs: totalRuns.c,
    ai_resolution_rate: totalCases.c > 0 ? Math.round((resolvedByAI.c / totalCases.c) * 100) : 0,
    pending_approvals: pendingApprovals.c,
    total_cases: totalCases.c
  });
});

export default router;
