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

import { triageAgentImpl }              from './impl/triageAgent.js';
import { identityResolverImpl }         from './impl/identityResolver.js';
import { customerProfilerImpl }         from './impl/customerProfiler.js';
import { knowledgeRetrieverImpl }       from './impl/knowledgeRetriever.js';
import { draftReplyAgentImpl }          from './impl/draftReplyAgent.js';
import { qaCheckImpl }                  from './impl/qaCheck.js';
import { auditLoggerImpl }             from './impl/auditLogger.js';
import { reportGeneratorImpl }         from './impl/reportGenerator.js';
import { escalationManagerImpl }       from './impl/escalationManager.js';
import { fraudDetectorImpl }           from './impl/fraudDetector.js';
import { slaMonitorImpl }             from './impl/slaMonitor.js';
import { shopifyConnectorImpl }        from './impl/shopifyConnector.js';
import { stripeConnectorImpl }         from './impl/stripeConnector.js';
import { composerTranslatorImpl }      from './impl/composerTranslator.js';
import { identityMappingAgentImpl }    from './impl/identityMappingAgent.js';
import { customerIdentityAgentImpl }   from './impl/customerIdentityAgent.js';
import { helpdeskAgentImpl }           from './impl/helpdeskAgent.js';
import { omsErpAgentImpl }            from './impl/omsErpAgent.js';
import { returnsAgentImpl }           from './impl/returnsAgent.js';
import { subscriptionAgentImpl }       from './impl/subscriptionAgent.js';
import { logisticsTrackingAgentImpl }  from './impl/logisticsTrackingAgent.js';
import { slaEscalationAgentImpl }      from './impl/slaEscalationAgent.js';
import { customerCommunicationAgentImpl } from './impl/customerCommunicationAgent.js';
import { workflowRuntimeAgentImpl }    from './impl/workflowRuntimeAgent.js';

// ── Registry map ──────────────────────────────────────────────────────────────

const REGISTRY = new Map<string, AgentImplementation>([
  // ── Orchestration ─────────────────────────────────────────────────────────
  ['supervisor',               noopAgent('supervisor')],            // delegated to orchestrator
  ['approval-gatekeeper',      qaCheckImpl],                        // shares QA logic
  ['qa-policy-check',          qaCheckImpl],
  ['escalation-manager',       escalationManagerImpl],

  // ── Ingest & Intelligence ─────────────────────────────────────────────────
  ['channel-ingest',           noopAgent('channel-ingest')],        // delegated to pipeline
  ['canonicalizer',            noopAgent('canonicalizer')],         // delegated to pipeline
  ['intent-router',            triageAgentImpl],                    // reuse triage logic
  ['triage-agent',             triageAgentImpl],
  ['knowledge-retriever',      knowledgeRetrieverImpl],
  ['composer-translator',      composerTranslatorImpl],

  // ── Resolution & Reconciliation ───────────────────────────────────────────
  ['reconciliation-agent',     noopAgent('reconciliation-agent')],  // delegated to pipeline
  ['case-resolution-planner',  noopAgent('case-resolution-planner')], // delegated to pipeline
  ['resolution-executor',      noopAgent('resolution-executor')],   // delegated to pipeline
  ['workflow-runtime-agent',   workflowRuntimeAgentImpl],
  ['fraud-detector',           fraudDetectorImpl],
  ['report-generator',         reportGeneratorImpl],

  // ── Identity & Customer Truth ─────────────────────────────────────────────
  ['identity-resolver',        identityResolverImpl],
  ['identity-mapping-agent',   identityMappingAgentImpl],
  ['customer-identity-agent',  customerIdentityAgentImpl],
  ['customer-profiler',        customerProfilerImpl],

  // ── System / Tool Connectors ──────────────────────────────────────────────
  ['helpdesk-agent',           helpdeskAgentImpl],
  ['stripe-agent',             stripeConnectorImpl],
  ['stripe-connector',         stripeConnectorImpl],
  ['shopify-agent',            shopifyConnectorImpl],
  ['shopify-connector',        shopifyConnectorImpl],
  ['oms-erp-agent',            omsErpAgentImpl],
  ['returns-agent',            returnsAgentImpl],
  ['subscription-agent',       subscriptionAgentImpl],
  ['logistics-tracking-agent', logisticsTrackingAgentImpl],

  // ── Observability & Communication ─────────────────────────────────────────
  ['sla-monitor',              slaMonitorImpl],
  ['sla-escalation-agent',     slaEscalationAgentImpl],
  ['customer-communication-agent', customerCommunicationAgentImpl],
  ['audit-observability',      auditLoggerImpl],
  ['audit-logger',             auditLoggerImpl],
  ['draft-reply-agent',        draftReplyAgentImpl],
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
  const delegatedSlugs = [
    'supervisor', 'channel-ingest', 'canonicalizer',
    'reconciliation-agent', 'case-resolution-planner', 'resolution-executor',
  ];
  if (delegatedSlugs.includes(slug)) return 'delegated';
  return 'implemented';
}
