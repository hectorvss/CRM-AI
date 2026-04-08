/**
 * server/agents/impl/triageAgent.ts
 *
 * Triage Agent — classifies urgency, severity, priority and assigns SLA tier.
 *
 * Uses Gemini to analyze the full context window and returns structured
 * triage output. Writes updated priority/severity back to the case row.
 *
 * Prompt returns JSON:
 * {
 *   urgency: 'critical'|'high'|'medium'|'low',
 *   severity: 'S1'|'S2'|'S3'|'S4',
 *   priority: 'urgent'|'high'|'normal'|'low',
 *   slaTier: 'tier1'|'tier2'|'tier3',
 *   reasoning: string,
 *   confidence: number,
 *   suggestedTags: string[],
 *   requiresImmediateEscalation: boolean,
 *   escalationReason?: string,
 * }
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

const SLA_DEADLINES_HOURS: Record<string, { first_response: number; resolution: number }> = {
  tier1: { first_response: 1,  resolution: 4  },
  tier2: { first_response: 4,  resolution: 24 },
  tier3: { first_response: 8,  resolution: 72 },
};

export const triageAgentImpl: AgentImplementation = {
  slug: 'triage-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, gemini, reasoning, tenantId, knowledgeBundle } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();

    // ── Build prompt ──────────────────────────────────────────────────────
    const contextStr = contextWindow.toPromptString();

    const prompt = `You are a CRM triage specialist. Analyze this support case and classify it.

${contextStr}

${knowledgeBundle.promptContext ? `RELEVANT KNOWLEDGE:\n${knowledgeBundle.promptContext}\n` : ''}

Return a JSON object with exactly these fields:
{
  "urgency": "critical" | "high" | "medium" | "low",
  "severity": "S1" | "S2" | "S3" | "S4",
  "priority": "urgent" | "high" | "normal" | "low",
  "slaTier": "tier1" | "tier2" | "tier3",
  "reasoning": "Brief explanation of classification",
  "confidence": 0.0 to 1.0,
  "suggestedTags": ["tag1", "tag2"],
  "requiresImmediateEscalation": true | false,
  "escalationReason": "Only if requiresImmediateEscalation is true"
}

Classification rules:
- S1/critical/urgent: Active fraud, >$1000 dispute, VIP customer with critical issue, SLA already breached
- S2/high: Payment conflict, chargeback active, VIP customer, >$200 amount
- S3/medium: Standard return/refund issues, policy questions
- S4/low: General inquiries, status checks

SLA tiers:
- tier1: 1h first response / 4h resolution
- tier2: 4h first response / 24h resolution
- tier3: 8h first response / 72h resolution`;

    // ── Call Gemini ───────────────────────────────────────────────────────
    let triageOutput: any;
    let tokensUsed = 0;

    try {
      const model = gemini.getGenerativeModel({
        model: reasoning.model,
        generationConfig: {
          temperature: reasoning.temperature,
          maxOutputTokens: reasoning.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      });

      const response = await model.generateContent(prompt);
      const text = response.response.text();
      tokensUsed = response.response.usageMetadata?.totalTokenCount ?? 0;
      triageOutput = JSON.parse(text);
    } catch (err: any) {
      logger.error('Triage agent Gemini call failed', { caseId, error: err?.message });
      return { success: false, error: err?.message, tokensUsed };
    }

    // ── Validate output ───────────────────────────────────────────────────
    const {
      urgency, severity, priority, slaTier, reasoning: triageReason,
      confidence, suggestedTags = [], requiresImmediateEscalation, escalationReason,
    } = triageOutput;

    if (!urgency || !severity || !priority || !slaTier) {
      return { success: false, error: 'Triage output missing required fields', tokensUsed };
    }

    // ── Write to DB ───────────────────────────────────────────────────────
    const now = new Date().toISOString();
    const slaDeadlines = SLA_DEADLINES_HOURS[slaTier] ?? SLA_DEADLINES_HOURS.tier2;

    // Compute SLA deadlines
    const firstResponseDeadline = new Date(Date.now() + slaDeadlines.first_response * 3600000).toISOString();
    const resolutionDeadline    = new Date(Date.now() + slaDeadlines.resolution    * 3600000).toISOString();

    // Read current tags and merge
    const currentCase = db.prepare('SELECT tags FROM cases WHERE id = ?').get(caseId) as any;
    const currentTags: string[] = JSON.parse(currentCase?.tags ?? '[]');
    const mergedTags = [...new Set([...currentTags, ...suggestedTags])];

    db.prepare(`
      UPDATE cases SET
        priority = ?, severity = ?,
        sla_first_response_deadline = ?, sla_resolution_deadline = ?,
        tags = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(
      priority, severity,
      firstResponseDeadline, resolutionDeadline,
      JSON.stringify(mergedTags), now,
      caseId, tenantId,
    );

    // If immediate escalation required, create an alert
    if (requiresImmediateEscalation) {
      try {
        db.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, entity_type, entity_id, event_type, description, metadata, created_at)
          VALUES (?, ?, 'case', ?, 'escalation_required', ?, ?, ?)
        `).run(
          randomUUID(), tenantId, caseId,
          escalationReason ?? 'Immediate escalation required by triage agent',
          JSON.stringify({ urgency, severity, agentSlug: 'triage-agent' }),
          now,
        );
      } catch { /* non-critical */ }
    }

    const costCredits = Math.ceil(tokensUsed / 1000);

    return {
      success: true,
      confidence,
      tokensUsed,
      costCredits,
      summary: `Triaged as ${priority}/${severity} (${slaTier}). ${triageReason}`,
      output: { urgency, severity, priority, slaTier, requiresImmediateEscalation, suggestedTags, citations: knowledgeBundle.citations },
    };
  },
};
