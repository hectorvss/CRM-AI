import type { AgentImplementation } from './types.js';
import { logger } from '../utils/logger.js';
import { AGENT_CATALOG, getCatalogEntryBySlug } from './catalog.js';

import { triageAgentImpl } from './impl/triageAgent.js';
import { identityResolverImpl } from './impl/identityResolver.js';
import { customerProfilerImpl } from './impl/customerProfiler.js';
import { knowledgeRetrieverImpl } from './impl/knowledgeRetriever.js';
import { draftReplyAgentImpl } from './impl/draftReplyAgent.js';
import { qaCheckImpl } from './impl/qaCheck.js';
import { auditLoggerImpl } from './impl/auditLogger.js';

function delegatedAgent(slug: string, summary: string): AgentImplementation {
  return {
    slug,
    async execute(ctx) {
      logger.debug(`Agent ${slug} delegated to pipeline/system layer`, {
        runId: ctx.runId,
        caseId: ctx.contextWindow.case.id,
        triggerEvent: ctx.triggerEvent,
      });
      return {
        success: true,
        confidence: 1,
        summary,
        output: {
          delegated: true,
          delegated_to: getCatalogEntryBySlug(slug)?.runtimeKind ?? 'system',
        },
      };
    },
  };
}

function stubAgent(slug: string, summary: string): AgentImplementation {
  return {
    slug,
    async execute(ctx) {
      logger.info(`Agent ${slug} is architected but still using stub implementation`, {
        runId: ctx.runId,
        caseId: ctx.contextWindow.case.id,
      });
      return {
        success: true,
        confidence: 0.4,
        summary,
        output: {
          status: 'stub',
          next_step: 'connector/runtime implementation pending',
        },
      };
    },
  };
}

const REGISTRY = new Map<string, AgentImplementation>([
  ['intent-router', triageAgentImpl],
  ['knowledge-retriever', knowledgeRetrieverImpl],
  ['composer-translator', draftReplyAgentImpl],
  ['approval-gatekeeper', qaCheckImpl],
  ['qa-policy-check', qaCheckImpl],
  ['identity-mapping-agent', identityResolverImpl],
  ['customer-identity-agent', customerProfilerImpl],
  ['audit-observability', auditLoggerImpl],

  ['supervisor', delegatedAgent('supervisor', 'Supervisor delegated orchestration to deterministic runtime')],
  ['channel-ingest', delegatedAgent('channel-ingest', 'Inbound event delegated to webhook/pipeline ingest layer')],
  ['canonicalizer', delegatedAgent('canonicalizer', 'Canonicalization delegated to canonical event pipeline')],
  ['reconciliation-agent', delegatedAgent('reconciliation-agent', 'Reconciliation delegated to canonical conflict engine')],
  ['resolution-executor', delegatedAgent('resolution-executor', 'Execution delegated to tool action runtime')],
  ['workflow-runtime-agent', delegatedAgent('workflow-runtime-agent', 'Workflow progression delegated to workflow runtime')],

  ['case-resolution-planner', stubAgent('case-resolution-planner', 'Resolution planner architecture is ready and awaiting full planner implementation')],
  ['helpdesk-agent', stubAgent('helpdesk-agent', 'Helpdesk synchronization agent is ready for connector implementation')],
  ['stripe-agent', stubAgent('stripe-agent', 'Stripe agent is ready for connector-backed execution')],
  ['shopify-agent', stubAgent('shopify-agent', 'Shopify agent is ready for connector-backed execution')],
  ['oms-erp-agent', stubAgent('oms-erp-agent', 'OMS / ERP agent is ready for connector-backed execution')],
  ['returns-agent', stubAgent('returns-agent', 'Returns agent is ready for lifecycle execution wiring')],
  ['subscription-agent', stubAgent('subscription-agent', 'Subscription agent is ready for Recharge/billing execution wiring')],
  ['logistics-tracking-agent', stubAgent('logistics-tracking-agent', 'Logistics agent is ready for carrier/tracking execution wiring')],
  ['sla-escalation-agent', stubAgent('sla-escalation-agent', 'SLA escalation agent is ready for scheduled escalation runtime')],
  ['customer-communication-agent', stubAgent('customer-communication-agent', 'Customer communication governor is ready for runtime orchestration')],
]);

export function getAgentImpl(slug: string): AgentImplementation {
  const impl = REGISTRY.get(slug);
  if (impl) return impl;

  const catalogEntry = getCatalogEntryBySlug(slug);
  if (catalogEntry) {
    const fallback = catalogEntry.implementationMode === 'delegated'
      ? delegatedAgent(slug, `${catalogEntry.name} delegated to ${catalogEntry.runtimeKind} runtime`)
      : stubAgent(slug, `${catalogEntry.name} has no explicit implementation yet`);
    return fallback;
  }

  logger.warn(`No implementation registered for agent slug "${slug}"`, { slug });
  return stubAgent(slug, `${slug} has no explicit implementation`);
}

export function hasAgentImpl(slug: string): boolean {
  return REGISTRY.has(slug);
}

export function getImplementationMode(slug: string): string {
  if (REGISTRY.has(slug)) return 'registered';
  return getCatalogEntryBySlug(slug)?.implementationMode ?? 'unknown';
}

export function listRegisteredAgentSlugs(): string[] {
  return AGENT_CATALOG.map((entry) => entry.slug);
}
