/**
 * server/agents/impl/fraudDetector.ts
 *
 * Fraud Detector Agent — identifies fraud signals in payment and
 * customer behaviour patterns.
 *
 * Uses Gemini to analyze the full context window and returns structured
 * fraud assessment. Writes fraud risk to audit_events and updates
 * case risk_level when fraud indicators are found.
 *
 * Prompt returns JSON:
 * {
 *   fraudRisk: 'none' | 'low' | 'medium' | 'high' | 'critical',
 *   signals: string[],
 *   confidence: number,
 *   recommendation: string,
 *   requiresBlock: boolean,
 *   blockReason?: string,
 * }
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const fraudDetectorImpl: AgentImplementation = {
  slug: 'fraud-detector',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, gemini, reasoning, tenantId, workspaceId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();

    // ── Build prompt ──────────────────────────────────────────────────────
    const contextStr = contextWindow.toPromptString();

    const prompt = `You are an expert fraud analyst for an e-commerce CRM.
Analyze this support case for fraud indicators.

${contextStr}

Return a JSON object with exactly these fields:
{
  "fraudRisk": "none" | "low" | "medium" | "high" | "critical",
  "signals": ["list of specific fraud signals detected"],
  "confidence": 0.0 to 1.0,
  "recommendation": "What action should be taken (1-2 sentences)",
  "requiresBlock": true | false,
  "blockReason": "Only if requiresBlock is true"
}

Fraud signals to evaluate:
- Multiple refund requests in short period
- Payment amount / refund amount mismatches
- Dispute filed while refund already pending
- New customer with high-value order returning immediately
- Mismatched shipping addresses across orders
- Chargeback history from the customer profile
- Cross-system state contradictions suggesting manipulation
- Unusual order patterns (multiple orders, different addresses, same items)`;

    // ── Call Gemini ───────────────────────────────────────────────────────
    let fraudOutput: any;
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
      fraudOutput = JSON.parse(text);
    } catch (err: any) {
      logger.error('Fraud detector Gemini call failed', { caseId, error: err?.message });
      return { success: false, error: err?.message, tokensUsed };
    }

    const {
      fraudRisk = 'none', signals = [], confidence = 0,
      recommendation, requiresBlock, blockReason,
    } = fraudOutput;

    if (!fraudRisk) {
      return { success: false, error: 'Fraud output missing fraudRisk field', tokensUsed };
    }

    const now = new Date().toISOString();

    // ── Write fraud assessment to audit ───────────────────────────────────
    if (fraudRisk !== 'none') {
      try {
        db.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
          VALUES (?, ?, ?, 'agent', ?, 'case', ?, ?, ?, ?)
        `).run(
          randomUUID(), tenantId, workspaceId,
          `fraud_assessment:${fraudRisk}`,
          caseId,
          `Fraud risk ${fraudRisk}: ${signals.slice(0, 3).join('; ')}`,
          JSON.stringify({
            fraudRisk, signals, confidence, recommendation,
            requiresBlock, blockReason, agentRunId: runId,
          }),
          now,
        );
      } catch (err: any) {
        logger.error('Failed to write fraud audit event', { caseId, error: err?.message });
      }
    }

    // ── Update case risk if fraud is high/critical ───────────────────────
    if (fraudRisk === 'high' || fraudRisk === 'critical') {
      try {
        db.prepare(
          'UPDATE cases SET risk_level = ?, updated_at = ? WHERE id = ? AND tenant_id = ?'
        ).run(fraudRisk === 'critical' ? 'critical' : 'high', now, caseId, tenantId);
      } catch { /* non-critical */ }

      // If block required, create an approval request to block the customer
      if (requiresBlock) {
        try {
          db.prepare(`
            INSERT OR IGNORE INTO approval_requests
              (id, case_id, tenant_id, workspace_id, requested_by, requested_by_type,
               action_type, action_payload, risk_level, evidence_package, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'fraud-detector', 'agent', 'block_customer', ?, ?, ?, 'pending', ?, ?)
          `).run(
            randomUUID(),
            caseId,
            tenantId,
            workspaceId,
            JSON.stringify({ reason: blockReason ?? 'Fraud detected', recommendation }),
            fraudRisk === 'critical' ? 'critical' : 'high',
            JSON.stringify({ fraudRisk, signals, confidence, agentRunId: runId }),
            now,
            now,
          );
        } catch { /* non-critical */ }
      }
    }

    const costCredits = Math.ceil(tokensUsed / 1000);

    return {
      success: true,
      confidence,
      tokensUsed,
      costCredits,
      summary: `Fraud assessment: ${fraudRisk} risk — ${signals.length} signal(s) detected`,
      output: { fraudRisk, signals, recommendation, requiresBlock },
    };
  },
};
