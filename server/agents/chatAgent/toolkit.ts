/**
 * server/agents/chatAgent/toolkit.ts
 *
 * Surface-scoped tool selection over the Plan Engine registry.
 *
 * This is the contract layer between the two agents (see
 * docs/posthog-support-agent-analysis.md): the operator copilot gets
 * read+write tools (writes gated by approval in phase 2), while the future
 * autonomous support agent gets `support_readonly` — strictly
 * sideEffect === 'read', mirroring PostHog's sandboxed draft agent whose MCP
 * scopes are read-only (business_knowledge:read, query:read, ...).
 */

import { toolRegistry, type CatalogEntry } from '../planEngine/registry.js';
import type { RiskLevel } from '../planEngine/types.js';

export type AgentSurface = 'operator' | 'support_readonly';

const RISK_ORDER: Record<RiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export interface SelectToolkitOptions {
  hasPermission: (perm: string) => boolean;
  surface?: AgentSurface;
  /**
   * Highest risk allowed in the catalog. Phase 1 caps at 'medium' (high and
   * critical tools are simply absent); phase 2 raises this and gates
   * high/critical behind the approval flow instead.
   */
  maxRisk?: RiskLevel;
  /** Explicit allow-list of canonical tool names (applied after filters). */
  allow?: string[];
  /** Explicit block-list of canonical tool names. */
  block?: string[];
  /**
   * Include third-party integration connectors (category 'integration':
   * linear/jira/github/asana/front/…). Default false — they are ~half the
   * catalog (~77 tools, ~9k prompt tokens per turn) and rarely relevant to a
   * given conversation, so we drop them unless a view opts in via `allow` or
   * this flag. Core external actions (message.send_to_customer, workflow.*)
   * are NOT integrations and always stay.
   */
  includeIntegrations?: boolean;
}

export function selectToolkit(opts: SelectToolkitOptions): CatalogEntry[] {
  const surface = opts.surface ?? 'operator';
  const maxRisk = RISK_ORDER[opts.maxRisk ?? 'medium'];
  const allow = opts.allow?.length ? new Set(opts.allow) : null;
  const block = opts.block?.length ? new Set(opts.block) : null;

  let catalog = toolRegistry.listForCaller(opts.hasPermission);

  if (surface === 'support_readonly') {
    catalog = catalog.filter((t) => t.sideEffect === 'read');
  }

  catalog = catalog.filter((t) => RISK_ORDER[t.risk] <= maxRisk);

  if (allow) {
    // An explicit relevant-tools list wins: narrow to exactly those.
    catalog = catalog.filter((t) => allow.has(t.name));
  } else if (!opts.includeIntegrations) {
    // Default: drop the third-party integration connectors to keep the prompt
    // lean and the agent focused on core CRM tools.
    catalog = catalog.filter((t) => t.category !== 'integration');
  }

  if (block) catalog = catalog.filter((t) => !block.has(t.name));

  return catalog;
}
