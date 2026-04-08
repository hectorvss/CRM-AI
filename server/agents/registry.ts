/**
 * server/agents/registry.ts
 *
 * Maps agent slugs to their implementation objects.
 * The runner looks up an implementation here before executing.
 *
 * New implementations should be imported and registered in the map below.
 * Agents without a registered implementation fall back to a noop stub
 * that logs a warning (so the pipeline doesn't break while an agent is
 * being developed).
 */

import type { AgentImplementation } from './types.js';
import { logger } from '../utils/logger.js';

// ── Implementations ───────────────────────────────────────────────────────────

import { triageAgentImpl }       from './impl/triageAgent.js';
import { identityResolverImpl }  from './impl/identityResolver.js';
import { customerProfilerImpl }  from './impl/customerProfiler.js';
import { knowledgeRetrieverImpl }from './impl/knowledgeRetriever.js';
import { draftReplyAgentImpl }   from './impl/draftReplyAgent.js';
import { qaCheckImpl }           from './impl/qaCheck.js';
import { auditLoggerImpl }       from './impl/auditLogger.js';
import { reportGeneratorImpl }   from './impl/reportGenerator.js';

// ── Registry map ──────────────────────────────────────────────────────────────

const REGISTRY = new Map<string, AgentImplementation>([
  // ── Triage & classification ────────────────────────────────────────────────
  ['triage-agent',             triageAgentImpl],
  ['intent-router',            triageAgentImpl],        // reuse triage logic

  // ── Identity & customer ────────────────────────────────────────────────────
  ['identity-resolver',        identityResolverImpl],
  ['customer-profiler',        customerProfilerImpl],

  // ── Knowledge ─────────────────────────────────────────────────────────────
  ['knowledge-retriever',      knowledgeRetrieverImpl],

  // ── Communication ──────────────────────────────────────────────────────────
  ['draft-reply-agent',        draftReplyAgentImpl],

  // ── Quality & compliance ───────────────────────────────────────────────────
  ['qa-policy-check',          qaCheckImpl],
  ['approval-gatekeeper',      qaCheckImpl],            // shares QA logic

  // ── Observability ──────────────────────────────────────────────────────────
  ['audit-observability',      auditLoggerImpl],
  ['audit-logger',             auditLoggerImpl],

  // ── Reporting & diagnosis ──────────────────────────────────────────────────
  ['report-generator',         reportGeneratorImpl],

  // ── Existing pipeline agents (mapped to noop — handled by pipeline jobs) ──
  ['channel-ingest',           noopAgent('channel-ingest')],
  ['canonicalizer',            noopAgent('canonicalizer')],
  ['reconciliation-agent',     noopAgent('reconciliation-agent')],
  ['case-resolution-planner',  noopAgent('case-resolution-planner')],
  ['resolution-executor',      noopAgent('resolution-executor')],
  ['supervisor',               noopAgent('supervisor')],
]);

// ── Noop stub (for pipeline agents handled by their own job handlers) ─────────

function noopAgent(slug: string): AgentImplementation {
  return {
    slug,
    async execute(ctx) {
      logger.debug(`Agent ${slug} is handled by its own pipeline job — noop via AGENT_TRIGGER`, {
        runId: ctx.runId,
        caseId: ctx.contextWindow.case.id,
      });
      return { success: true, summary: `${slug}: delegated to pipeline job` };
    },
  };
}

// ── Lookup ────────────────────────────────────────────────────────────────────

export function getAgentImpl(slug: string): AgentImplementation {
  const impl = REGISTRY.get(slug);
  if (impl) return impl;

  logger.warn(`No implementation registered for agent slug "${slug}" — using noop`, { slug });
  return noopAgent(slug);
}

export function hasAgentImpl(slug: string): boolean {
  return REGISTRY.has(slug);
}

export function getImplementationMode(slug: string): 'implemented' | 'delegated' | 'stub' {
  if (!REGISTRY.has(slug)) return 'stub';
  // Agents with actual implementations (not noopAgent)
  const implementedSlugs = [
    'triage-agent', 'intent-router', 'identity-resolver', 'customer-profiler',
    'knowledge-retriever', 'draft-reply-agent', 'qa-policy-check', 'approval-gatekeeper',
    'audit-logger', 'report-generator'
  ];
  if (implementedSlugs.includes(slug)) return 'implemented';
  // Pipeline-delegated agents (handled by their own job handlers)
  return 'delegated';
}
