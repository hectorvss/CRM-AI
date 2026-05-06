import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { aiApi, agentsApi, connectorsApi, operationsApi, reportsApi, workspacesApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import ConnectionsView from './ConnectionsView';
import { ActionModal } from './ActionModal';
import PermissionsView from './PermissionsView';
import KnowledgeView from './KnowledgeView';
import ReasoningView from './ReasoningView';
import SafetyView from './SafetyView';
import { MinimalButton, MinimalCard, MinimalPill, MinimalProgressBar } from './MinimalCategoryShell';
import { connectionCategories } from '../connectionsData';
import AgentNetworkGraph from './AgentNetworkGraph';

type AIStudioTab = 'Overview' | 'Agents' | 'Connections' | 'Permissions' | 'Knowledge' | 'Reasoning' | 'Safety';

function parseSettings(settings: any) {
  if (!settings) return {};
  if (typeof settings === 'string') {
    try {
      return JSON.parse(settings);
    } catch {
      return {};
    }
  }
  return settings;
}

function trendTone(value?: string | null) {
  if (value === 'up') return 'text-[#1a1a1a]';
  if (value === 'down') return 'text-[#1a1a1a]';
  return 'text-[#a4a4a2]';
}

function statusPill(status?: string | null) {
  const normalized = String(status || 'unknown').toLowerCase();
  if (['completed', 'connected', 'healthy', 'active', 'approved'].includes(normalized)) return 'bg-[#ededea] text-[#1a1a1a]';
  if (['failed', 'error', 'disconnected', 'blocked'].includes(normalized)) return 'bg-[#ededea] text-[#1a1a1a]';
  return 'bg-[#f8f8f7] text-[#646462] dark:text-[#c4c4c2]';
}

function formatCompactDate(value?: string | null) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toPercent(value: number) {
  return `${Math.round(value)}%`;
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeConnectorStatus(connector: any) {
  const raw = String(
    connector?.status ||
      connector?.health ||
      connector?.sync_status ||
      (connector?.is_enabled ? 'connected' : 'disabled'),
  ).toLowerCase();

  if (['connected', 'healthy', 'active', 'ok', 'enabled'].includes(raw)) return 'connected';
  if (['error', 'failed', 'degraded', 'blocked'].includes(raw)) return 'attention';
  return 'disabled';
}

const originalCategories = [
  {
    title: 'ORCHESTRATION',
    agents: [
      { 
        name: 'Supervisor', 
        desc: 'Orchestrates the overall agent flow', 
        icon: 'account_tree', 
        iconColor: 'text-[#1a1a1a]', 
        locked: true, 
        expanded: true,
        purpose: 'Orchestrates the overall agent flow. Decides the next agent/handoff. Does NOT perform deep domain reasoning. Does NOT execute domain actions. Does NOT validate policy. Does NOT draft messages. Does NOT reconcile systems itself.',
        triggers: ['New user message', 'Tool execution results'],
        dependencies: ['Intent Router', 'Context Window'],
        ioLogic: { input: 'Canonical Event', output: 'Routing Decision' }
      },
      { 
        name: 'Approval Gatekeeper', 
        desc: 'Handles human approval requirements for high-risk actions', 
        icon: 'approval_delegation', 
        iconColor: 'text-[#1a1a1a]', 
        active: true,
        purpose: 'Handles human approval requirements for high-risk actions. Does NOT validate brand/policy tone. Does NOT reconcile systems. Does NOT plan the entire resolution. Does NOT execute tool actions.',
        triggers: ['Refunds over threshold', 'Low confidence score actions'],
        dependencies: ['Intent Router', 'Context Window'],
        ioLogic: { input: 'Canonical Event', output: 'Routing Decision' }
      },
      { 
        name: 'QA / Policy Check', 
        desc: 'Performs pre-send / pre-execution safety, policy, and quality validation', 
        icon: 'security', 
        iconColor: 'text-[#1a1a1a]', 
        active: true,
        purpose: 'Performs pre-send / pre-execution safety, policy, and quality validation. Checks brand voice, restricted topics, unsafe action packaging. Does NOT manage human approvals. Does NOT detect contradictions. Does NOT execute tools. Does NOT plan resolution strategy.',
        triggers: ['Pre-send validation', 'Pre-write action'],
        dependencies: ['Intent Router', 'Context Window'],
        ioLogic: { input: 'Canonical Event', output: 'Routing Decision' }
      },
    ]
  },
  {
    title: 'INGEST & INTELLIGENCE',
    agents: [
      { 
        name: 'Channel Ingest', 
        desc: 'Receives inbound channel events and converts them into normalized intake events.', 
        sub: 'WhatsApp Disabled', 
        icon: 'mail', 
        iconColor: 'text-[#1a1a1a]', 
        active: true,
        purpose: 'Ingests messages and channel-originated events from Email, Web Chat, WhatsApp, or other enabled channels and passes a structured event downstream.',
        triggers: ['New customer message', 'new chat session', 'inbound support event'],
        dependencies: ['Enabled channels', 'Canonicalizer', 'Context Window'],
        ioLogic: { input: 'Raw channel event', output: 'Canonical intake event' }
      },
      { 
        name: 'Canonicalizer', 
        desc: 'Normalizes entities, fields, and event structure.', 
        icon: 'cleaning_services', 
        iconColor: 'text-[#1a1a1a]', 
        active: true,
        purpose: 'Extracts and standardizes customer, order, payment, refund, return, subscription, and channel metadata into a canonical system format.',
        triggers: ['New intake event', 'tool result', 'webhook payload', 'support sync event'],
        dependencies: ['Channel Ingest', 'Context Window'],
        ioLogic: { input: 'Raw or semi-structured event', output: 'Canonical structured case context' }
      },
      { 
        name: 'Intent Router', 
        desc: 'Classifies the task and routes it to the correct next agent.', 
        icon: 'split_scene', 
        iconColor: 'text-[#1a1a1a]', 
        active: true,
        purpose: 'Determines whether the task is an order inquiry, refund issue, contradiction, return issue, subscription issue, communication update, etc.',
        triggers: ['Canonical event ready', 'context updated'],
        dependencies: ['Canonicalizer', 'Context Window'],
        ioLogic: { input: 'Canonical case context', output: 'Intent classification + next-agent routing' }
      },
      { 
        name: 'Knowledge Retriever', 
        desc: 'Fetches relevant policies, SOPs, and operational guidance.', 
        icon: 'menu_book', 
        iconColor: 'text-[#1a1a1a]', 
        active: false,
        purpose: 'Supplies the exact articles, policies, workflows, exception rules, and knowledge snippets needed by planning, QA, and communication.',
        triggers: ['Policy lookup needed', 'contradiction detected', 'pre-send validation', 'manual assist requested'],
        dependencies: ['Knowledge module', 'Intent Router', 'Context Window'],
        ioLogic: { input: 'Structured context + knowledge query', output: 'Relevant knowledge bundle' }
      },
      { 
        name: 'Composer + Translator', 
        desc: 'Drafts and localizes internal and customer-facing messages.', 
        icon: 'edit_note', 
        iconColor: 'text-[#1a1a1a]', 
        active: true,
        purpose: 'Generates summaries, explanations, replies, and localized versions using the approved operational context.',
        triggers: ['Draft requested', 'customer update needed', 'support note needed', 'resolution completed'],
        dependencies: ['Knowledge Retriever', 'Context Window', 'Customer Communication Agent'],
        ioLogic: { input: 'Approved message objective + context', output: 'Drafted and localized text' }
      },
    ]
  },
  {
    title: 'RESOLUTION & RECONCILIATION',
    agents: [
      { 
        name: 'Reconciliation Agent', 
        desc: 'Detects contradictions across systems', 
        icon: 'compare_arrows', 
        iconColor: 'text-[#1a1a1a]', 
        locked: true,
        purpose: 'Detects contradictions across systems. Compares state across commerce, payments, OMS, returns, CRM, support, logistics, and subscriptions. Identifies broken domains, missing IDs, stale sync, and blocked downstream flows. Opens structured conflict context.',
        triggers: ['New ticket or customer issue linked to an order/payment/refund', 'New webhook or sync event from connected systems', 'Change in payment/refund/return/order/subscription state', 'Missing or mismatched external ID detected', 'Resolve mode opened', 'Periodic reconciliation checks'],
        dependencies: ['Canonicalizer', 'Intent Router', 'Stripe Agent', 'Shopify Agent', 'OMS / ERP Agent', 'Returns Agent', 'CRM / Customer Identity Agent', 'Recharge / Subscription Agent', 'Logistics / Tracking Agent'],
        ioLogic: { input: 'normalized case context, system states, external IDs, integration events', output: 'contradiction domain, source-of-truth comparison, conflict summary, blocked downstream process, reconciliation task' }
      },
      { 
        name: 'Case Resolution Planner', 
        desc: 'Converts detected contradictions into resolution plans', 
        icon: 'schema', 
        iconColor: 'text-[#1a1a1a]', 
        active: true,
        purpose: 'Converts detected contradictions into resolution plans. Selects resolution strategy: AI, Manual, Approval-first. Defines expected final state and execution owner. Builds the step-by-step resolution plan.',
        triggers: ['Conflict opened by Reconciliation Agent', 'Case Graph Resolve mode opened', 'Policy blocker detected', 'Manual intervention requested', 'Approval rejected or delayed'],
        dependencies: ['Reconciliation Agent', 'Approval Gatekeeper', 'QA / Policy Check', 'Knowledge Retriever', 'OMS / ERP Agent', 'Returns Agent', 'Stripe Agent', 'Shopify Agent', 'CRM / Customer Identity Agent'],
        ioLogic: { input: 'contradiction graph, policies, source-of-truth, current system states, available integrations', output: 'resolution strategy, step-by-step plan, recommended execution path, expected final state' }
      },
      { 
        name: 'Resolution Executor', 
        desc: 'Executes the approved external/system-facing resolution steps', 
        icon: 'play_circle', 
        iconColor: 'text-[#1a1a1a]', 
        active: true,
        purpose: 'Executes the approved external/system-facing resolution steps. Creates/updates missing records. Propagates canonical states. Retries failed writebacks. Updates external tools and connected systems.',
        triggers: ['Approved AI resolution', 'Manual approval completion', 'Explicit operator action from Resolve mode', 'Retry requested', 'Recovery workflow started'],
        dependencies: ['Case Resolution Planner', 'Approval Gatekeeper', 'QA / Policy Check', 'Stripe Agent', 'Shopify Agent', 'OMS / ERP Agent', 'Returns Agent', 'Logistics / Tracking Agent', 'Recharge / Subscription Agent', 'Audit & Observability Agent'],
        ioLogic: { input: 'approved execution plan, target systems, ID mappings, policy result', output: 'writebacks executed, missing records created, workflow resumed, final state update, audit event' }
      },
      { 
        name: 'Workflow Runtime Agent', 
        desc: 'Manages internal workflow progression after reconciliation and execution.', 
        icon: 'account_tree', 
        iconColor: 'text-[#1a1a1a]', 
        active: true,
        purpose: 'Owns the internal workflow state of the SaaS. Pauses, resumes, advances, or unblocks internal workflow steps once contradiction state changes or execution completes.',
        triggers: ['Resolution Executor completed', 'Conflict state changed', 'Approval completed', 'Blocked flow becomes recoverable', 'Manual resolution step completed'],
        dependencies: ['Case Resolution Planner', 'Resolution Executor', 'Returns Agent', 'SLA & Escalation Agent', 'Workflows module'],
        ioLogic: { input: 'Resolution result + workflow context', output: 'Updated internal workflow state, resumed or advanced workflow steps' }
      },
    ]
  },
  {
    title: 'IDENTITY & CUSTOMER TRUTH',
    agents: [
      { 
        name: 'Identity Mapping Agent', 
        desc: 'Resolves entity and identity links across systems', 
        icon: 'fingerprint', 
        iconColor: 'text-[#1a1a1a]', 
        active: true,
        purpose: 'Resolves entity and identity links across systems. Matches customer/order/refund/return/payment references. Detects missing links, duplicates, ambiguous matches. Prevents unsafe propagation when identity is unclear.',
        triggers: ['Missing external ID', 'Duplicate customer match', 'Order/refund/return not linked correctly', 'Contradiction caused by missing mapping', 'CRM/support/customer mismatch detected'],
        dependencies: ['Canonicalizer', 'CRM / Customer Identity Agent', 'Shopify Agent', 'Stripe Agent', 'OMS / ERP Agent', 'Helpdesk Agent', 'Returns Agent'],
        ioLogic: { input: 'customer records, order IDs, refund IDs, external references, support identities', output: 'identity mapping, missing/mismatched reference warning, canonical entity link, merge/sync suggestion' }
      },
      { 
        name: 'CRM / Customer Identity Agent', 
        desc: 'Provides canonical customer truth from CRM/identity source', 
        icon: 'contact_page', 
        iconColor: 'text-[#1a1a1a]', 
        active: false,
        purpose: 'Provides canonical customer truth from CRM/identity source. Supplies VIP/risk/segment/account-owner context. Acts as customer truth provider where configured. Supports Identity Mapping Agent with master data.',
        triggers: ['Customer loaded', 'Identity conflict detected', 'New case linked to customer', 'Segment/VIP/risk state needed', 'Manual review of customer truth'],
        dependencies: ['CRM / Identity connector', 'Identity Mapping Agent', 'Customers module', 'Reconciliation Agent'],
        ioLogic: { input: 'customer identifiers, CRM records, support/customer/order context', output: 'canonical customer profile, linked identities, customer truth data, conflict notes' }
      },
    ]
  },
  {
    title: 'SYSTEM / TOOL AGENTS',
    agents: [
      { 
        name: 'Helpdesk Agent', 
        desc: 'Reads/writes tickets, tags, notes, and support metadata in the helpdesk system', 
        icon: 'support_agent', 
        iconColor: 'text-[#1a1a1a]', 
        active: false,
        purpose: 'Reads/writes tickets, tags, notes, and support metadata in the helpdesk system. Syncs support thread state into the SaaS. Applies notes, status changes, and support-linked updates.',
        triggers: ['New inbound ticket', 'Ticket status change', 'Internal note / escalation', 'AI-generated reply ready', 'Resolution state change', 'Customer communication required'],
        dependencies: ['Channel Ingest', 'Composer + Translator', 'QA / Policy Check', 'Customer Communication Agent', 'Gorgias / Zendesk / Intercom connection'],
        ioLogic: { input: 'ticket, thread, support metadata, linked customer/order/payment context', output: 'synchronized support state, notes, tags, linked operational case, outgoing updates' }
      },
      { 
        name: 'Stripe Agent', 
        desc: 'Reads and updates payment, refund, dispute, and subscription state in Stripe.', 
        icon: 'credit_card', 
        iconColor: 'text-[#1a1a1a]', 
        active: false,
        purpose: 'Provides payment/refund truth signals, performs approved Stripe-side actions, and returns Stripe execution results to the system.',
        triggers: ['Payment/refund inquiry', 'contradiction check', 'approved writeback', 'subscription-related action'],
        dependencies: ['Stripe connection', 'Reconciliation Agent', 'Resolution Executor'],
        ioLogic: { input: 'Stripe-targeted request or approved action', output: 'Stripe state/result' }
      },
      { 
        name: 'Shopify Agent', 
        desc: 'Reads and updates order, customer, and commerce state in Shopify.', 
        icon: 'shopping_bag', 
        iconColor: 'text-[#1a1a1a]', 
        active: false,
        purpose: 'Provides order/customer/fulfillment context, supports approved Shopify-side actions, and supplies commerce truth to reconciliation flows.',
        triggers: ['Order inquiry', 'contradiction check', 'approved order/customer action', 'return-related commerce lookup'],
        dependencies: ['Shopify connection', 'Reconciliation Agent', 'Resolution Executor'],
        ioLogic: { input: 'Shopify-targeted request or approved action', output: 'Shopify state/result' }
      },
      { 
        name: 'OMS / ERP Agent', 
        desc: 'Handles back-office order/refund/return records in OMS/ERP', 
        icon: 'inventory', 
        iconColor: 'text-[#1a1a1a]', 
        active: false,
        purpose: 'Handles back-office order/refund/return records in OMS/ERP. Creates missing OMS/ERP references when needed. Updates canonical back-office records once approved.',
        triggers: ['Contradiction affecting OMS/ERP state', 'Missing refund reference', 'Order state mismatch', 'Return authorization mismatch', 'Approved reconciliation execution'],
        dependencies: ['Reconciliation Agent', 'Resolution Executor', 'Identity Mapping Agent', 'NetSuite / Generic OMS / Generic ERP connection'],
        ioLogic: { input: 'canonical order/refund/return state, target IDs, approved writeback', output: 'OMS/ERP records updated, missing refs created, state aligned, audit event emitted' }
      },
      { 
        name: 'Returns Agent', 
        desc: 'Handles return lifecycle state, block/unblock logic, label/inspection/restock progression', 
        icon: 'assignment_return', 
        iconColor: 'text-[#1a1a1a]', 
        active: false,
        purpose: 'Handles return lifecycle state, block/unblock logic, label/inspection/restock progression. Understands downstream return impact. Works with refund/order state but only in the returns domain.',
        triggers: ['Return requested', 'Label created', 'Return blocked by unresolved refund/payment contradiction', 'Warehouse/inspection state changed', 'Reconciliation completed'],
        dependencies: ['Shopify Agent', 'OMS / ERP Agent', 'Logistics / Tracking Agent', 'Reconciliation Agent', 'Resolution Executor'],
        ioLogic: { input: 'return state, refund linkage, warehouse/logistics state, contradiction result', output: 'return flow status, block/unblock action, restock/review progression' }
      },
      { 
        name: 'Recharge / Subscription Agent', 
        desc: 'Handles subscription/renewal/charge state for subscription commerce', 
        icon: 'autorenew', 
        iconColor: 'text-[#1a1a1a]', 
        active: false,
        purpose: 'Handles subscription/renewal/charge state for subscription commerce. Reads subscription truth and performs authorized subscription changes.',
        triggers: ['Subscription change', 'Renewal charge issue', 'Refund/subscription contradiction', 'Billing state mismatch', 'Subscription-related support case'],
        dependencies: ['Recharge connection', 'Stripe Agent', 'Shopify Agent', 'Reconciliation Agent', 'Resolution Executor'],
        ioLogic: { input: 'subscription records, charges, renewal events, customer identity, payment state', output: 'subscription truth, mismatch detection, resolution actions, lifecycle updates' }
      },
      { 
        name: 'Logistics / Tracking Agent', 
        desc: 'Handles shipment/tracking/address-related logistics signals', 
        icon: 'local_shipping', 
        iconColor: 'text-[#1a1a1a]', 
        active: false,
        purpose: 'Handles shipment/tracking/address-related logistics signals. Detects logistics-side contradictions and supports address/shipping impact analysis.',
        triggers: ['Shipment update', 'Delivery event', 'Address change', 'Tracking inconsistency', 'Return logistics event', 'Resolve mode on logistics-related case'],
        dependencies: ['EasyPost / WMS / 3PL connection', 'Shopify Agent', 'Returns Agent', 'Reconciliation Agent'],
        ioLogic: { input: 'shipment data, tracking events, address state, delivery milestones', output: 'logistics truth, blocked downstream effect, address sync issue, shipment impact' }
      },
    ]
  },
  {
    title: 'OBSERVABILITY & COMMUNICATION',
    agents: [
      { 
        name: 'SLA & Escalation Agent', 
        desc: 'Monitors aging cases, stalled resolutions, delayed approvals, and blocked flows', 
        icon: 'warning', 
        iconColor: 'text-[#1a1a1a]', 
        active: true,
        purpose: 'Monitors aging cases, stalled resolutions, delayed approvals, and blocked flows. Escalates to the correct owner/team.',
        triggers: ['Conflict open time threshold exceeded', 'Approval pending too long', 'Writeback retry loop exceeded', 'Customer waiting too long for update', 'Downstream flow blocked beyond SLA window'],
        dependencies: ['Reconciliation Agent', 'Case Resolution Planner', 'Resolution Executor', 'Approval Gatekeeper', 'Helpdesk Agent', 'Customer Communication Agent', 'Audit & Observability Agent'],
        ioLogic: { input: 'open conflicts, pending approvals, blocked workflows, SLA policy', output: 'escalation event, owner notification, urgency flag, priority raise' }
      },
      { 
        name: 'Customer Communication Agent', 
        desc: 'Decides when customer-facing communication should happen based on real reconciled operational state', 
        icon: 'chat', 
        iconColor: 'text-[#1a1a1a]', 
        active: true,
        purpose: 'Decides when customer-facing communication should happen based on real reconciled operational state. Coordinates with Composer + Translator and Helpdesk Agent. Prevents sending incorrect information before truth is reconciled. Can prepare or send messages if policy allows.',
        triggers: ['Resolution completed', 'Customer waiting on update', 'Refund/return delay detected', 'Approval delay requires customer communication', 'Resolve mode indicates communication should be sent'],
        dependencies: ['Composer + Translator', 'QA / Policy Check', 'Helpdesk Agent', 'Reconciliation Agent', 'Resolution Executor', 'CRM / Customer Identity Agent'],
        ioLogic: { input: 'reconciled case state, customer profile, language, policy constraints', output: 'customer-ready message, response draft, approved outbound update, communication status' }
      },
      { 
        name: 'Audit & Observability Agent', 
        desc: 'Records executions, failures, retries, overrides, and recurring contradictions', 
        icon: 'visibility', 
        iconColor: 'text-[#646462]', 
        locked: true,
        purpose: 'Records executions, failures, retries, overrides, and recurring contradictions. Monitors system reliability and unhealthy patterns. Feeds logs, analytics, and observability.',
        triggers: ['Any agent execution', 'Any writeback', 'Any failed sync', 'Any approval wait', 'Any manual override', 'Any contradiction reopened', 'Any integration health anomaly'],
        dependencies: ['All resolution-related agents', 'Integrations / Sync Health', 'Resolution Executor', 'Reconciliation Agent', 'SLA & Escalation Agent'],
        ioLogic: { input: 'agent executions, system events, resolution outcomes, retries, failures', output: 'audit trail, observability records, recurring issue signals, reliability insights' }
      },
    ]
  }
];

interface AIStudioProps {
  /** When provided, controls which tab is initially active. */
  initialTab?: AIStudioTab;
  /** When true, hides the outer card chrome and the AI Studio header/tabs strip
   * so the component can be embedded inside another shell (e.g. Fin AI Agent). */
  embedded?: boolean;
  /** Fired when an internal cross-link (e.g. Overview's "Open agents" button)
   * switches the active tab. The Fin shell uses it to sync the URL ?sub=. */
  onTabChange?: (tab: AIStudioTab) => void;
}

export default function AIStudio({ initialTab = 'Overview', embedded = false, onTabChange }: AIStudioProps = {}) {
  const [activeTab, setActiveTabRaw] = useState<AIStudioTab>(initialTab);
  // Wrap setActiveTab so internal cross-links also notify the embedding shell.
  const setActiveTab = (next: AIStudioTab) => {
    setActiveTabRaw(next);
    if (onTabChange) onTabChange(next);
  };
  // Keep the active tab in sync when the parent re-mounts with a different initialTab
  // (e.g. user navigates between Fin sidebar entries that each map to a tab).
  useEffect(() => { setActiveTabRaw(initialTab); }, [initialTab]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [agentSearch, setAgentSearch] = useState('');
  const [agentListFilter, setAgentListFilter] = useState<'All' | 'Needs setup' | 'Enabled' | 'Disabled'>('All');
  const [overviewMessage, setOverviewMessage] = useState<string>('');
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const [pendingAgentToggle, setPendingAgentToggle] = useState<any | null>(null);
  const [pendingWorkspaceAction, setPendingWorkspaceAction] = useState<'enable_all' | 'emergency_stop' | null>(null);
  const [agentActiveOverrides, setAgentActiveOverrides] = useState<Record<string, boolean>>({});
  const [stableAgentCatalog, setStableAgentCatalog] = useState<any[]>([]);
  const [savingCostControls, setSavingCostControls] = useState(false);

  const { data: studioData, refetch: refetchStudio } = useApi(aiApi.studio);
  const { data: agentCatalog, refetch: refetchAgentCatalog } = useApi(agentsApi.list, [], []);
  const { data: workspace, refetch: refetchWorkspace } = useApi(workspacesApi.currentContext, [], null);
  const { data: reportOverview } = useApi(() => reportsApi.overview('7d'), [], null);
  const { data: reportApprovals } = useApi(() => reportsApi.approvals('7d'), [], null);
  const { data: reportCosts } = useApi(() => reportsApi.costs('7d'), [], null);
  const { data: operationsOverview } = useApi(operationsApi.overview, [], null);
  const { data: recentRuns, refetch: refetchRuns } = useApi(operationsApi.agentRuns, [], []);
  const { data: connectors } = useApi(connectorsApi.list, [], []);

  useEffect(() => {
    if (Array.isArray(agentCatalog) && agentCatalog.length > 0) {
      setStableAgentCatalog(agentCatalog);
    }
  }, [agentCatalog]);

  const apiAgents = useMemo(() => {
    const raw = Array.isArray(agentCatalog) && agentCatalog.length > 0
      ? agentCatalog
      : stableAgentCatalog.length > 0
        ? stableAgentCatalog
      : Array.isArray(studioData?.agents?.list)
        ? studioData.agents.list
          : Array.isArray(studioData?.agents)
            ? studioData.agents
            : studioData?.data ?? [];
    if (!Array.isArray(raw)) return [];

    const byIdentity = new Map<string, any>();
    raw.forEach((agent: any) => {
      const key = agent.slug || agent.name || agent.id;
      const current = byIdentity.get(key);
      if (!current) {
        byIdentity.set(key, agent);
        return;
      }

      const currentScore =
        (current.current_version_id ? 4 : 0) +
        (current.version_status === 'published' ? 2 : 0) +
        (current.has_registered_impl ? 1 : 0);
      const candidateScore =
        (agent.current_version_id ? 4 : 0) +
        (agent.version_status === 'published' ? 2 : 0) +
        (agent.has_registered_impl ? 1 : 0);

      if (candidateScore > currentScore) {
        byIdentity.set(key, agent);
      }
    });

    return Array.from(byIdentity.values());
  }, [agentCatalog, stableAgentCatalog, studioData]);

  const CATEGORY_ICONS: Record<string, string> = {
    orchestration: 'supervisor_account', ingest: 'input', resolution: 'build',
    communication: 'forum', observability: 'monitoring', connectors: 'cable',
  };

  const CATEGORY_COLORS: Record<string, string> = {
    orchestration: 'text-[#1a1a1a]', ingest: 'text-[#1a1a1a]', resolution: 'text-[#1a1a1a]',
    communication: 'text-[#1a1a1a]', observability: 'text-[#646462]', connectors: 'text-[#1a1a1a]',
  };

  const tabs: AIStudioTab[] = ['Overview', 'Agents', 'Permissions', 'Knowledge', 'Reasoning', 'Safety'];

  const connectionAgentByName = useMemo(() => {
    const map = new Map<string, any>();
    connectionCategories.forEach((category) => {
      category.agents.forEach((agent: any) => map.set(agent.name, { ...agent, category: category.category }));
    });
    return map;
  }, []);

  // Map API agents into the categories structure for rendering
  const mappedCategories = useMemo(() => (
    apiAgents && apiAgents.length > 0
      ? [...new Set(apiAgents.map((a: any) => a.category))].map(cat => ({
          title: String(cat).toUpperCase().replace(/_/g, ' '),
          agents: apiAgents.filter((a: any) => a.category === cat).map((a: any) => {
            const connectionProfile = connectionAgentByName.get(a.name);
            return {
              id: a.id,
              slug: a.slug,
              category: a.category,
              name: a.name,
              desc: connectionProfile?.role || a.description || a.slug,
              icon: connectionProfile?.icon || a.icon || CATEGORY_ICONS[a.category] || 'smart_toy',
              iconColor: connectionProfile?.iconColor || a.iconColor || CATEGORY_COLORS[a.category] || 'text-[#1a1a1a]',
              active: a.id && agentActiveOverrides[a.id] !== undefined ? agentActiveOverrides[a.id] : !!a.is_active,
              locked: !!a.is_locked,
              purpose: connectionProfile?.role || a.purpose || a.reasoning_profile?.systemInstruction || a.description || a.slug,
              triggers: connectionProfile?.receivesFrom?.length ? connectionProfile.receivesFrom : a.triggers?.length ? a.triggers : ['System defined triggers'],
              dependencies: connectionProfile?.reportsTo?.length ? connectionProfile.reportsTo : a.dependencies?.length ? a.dependencies : ['Core routing', 'Context Window'],
              ioLogic: a.ioLogic || {
                input: connectionProfile?.receivesFrom?.slice(0, 2).join(', ') || 'Canonical event',
                output: connectionProfile?.reportsTo?.slice(0, 2).join(', ') || 'Approved action or Routing',
              },
              metrics: a.metrics || {},
              permissionProfile: a.permission_profile,
              reasoningProfile: a.reasoning_profile,
              safetyProfile: a.safety_profile,
              connectionProfile,
            };
          })
        }))
      : originalCategories
  ), [CATEGORY_COLORS, CATEGORY_ICONS, agentActiveOverrides, apiAgents, connectionAgentByName]);

  const activeAgentData = useMemo(
    () => mappedCategories.flatMap(c => c.agents).find(a => a.name === selectedAgent) || mappedCategories[0]?.agents?.[0],
    [mappedCategories, selectedAgent],
  );
  const selectedAgentId = activeAgentData?.id;

  useEffect(() => {
    if (!selectedAgent && mappedCategories[0]?.agents?.[0]?.name) {
      setSelectedAgent(mappedCategories[0].agents[0].name);
    }
  }, [mappedCategories, selectedAgent]);

  const { data: policyDraft, refetch: refetchDraft } = useApi(
    () => (selectedAgentId ? agentsApi.policyDraft(selectedAgentId) : Promise.resolve(null)),
    [selectedAgentId],
    null,
  );
  const { data: effectivePolicy, refetch: refetchEffective } = useApi(
    () => (selectedAgentId ? agentsApi.effectivePolicy(selectedAgentId) : Promise.resolve(null)),
    [selectedAgentId],
    null,
  );

  const updateDraft = useMutation((payload: { id: string; body: Record<string, any> }) =>
    agentsApi.updatePolicyDraft(payload.id, payload.body),
  );
  const publishDraft = useMutation((payload: { id: string; body?: Record<string, any> }) =>
    agentsApi.publishPolicyDraft(payload.id, payload.body || {}),
  );
  const rollbackDraft = useMutation((payload: { id: string; body?: Record<string, any> }) =>
    agentsApi.rollbackPolicy(payload.id, payload.body?.versionId || undefined),
  );
  const updateAgentConfig = useMutation((payload: { id: string; body: Record<string, any> }) =>
    agentsApi.config(payload.id, payload.body),
  );

  const runtimeSummary = useMemo(() => {
    const bundle = policyDraft?.bundle || {};
    const effective = effectivePolicy || {};
    const permissionKeys = Object.keys(bundle.permission_profile || effective.permission_profile || {});
    const reasoningKeys = Object.keys(bundle.reasoning_profile || effective.reasoning_profile || {});
    const safetyKeys = Object.keys(bundle.safety_profile || effective.safety_profile || {});
    const knowledgeKeys = Object.keys(bundle.knowledge_profile || effective.knowledge_profile || {});
    return {
      version: bundle.version_number || effective.version_id || '-',
      status: policyDraft?.bundle_status || effective.version_status || 'published',
      permissions: permissionKeys.length,
      reasoning: reasoningKeys.length,
      safety: safetyKeys.length,
      knowledge: knowledgeKeys.length,
      rollout: bundle.rollout_percentage ?? effective.rollout_policy?.rollout_percentage ?? 100,
    };
  }, [effectivePolicy, policyDraft]);

  const currentPolicyBundle = useMemo(() => ({
    ...(policyDraft?.bundle || {}),
    permission_profile: activeAgentData?.permissionProfile || policyDraft?.bundle?.permission_profile || {},
    reasoning_profile: activeAgentData?.reasoningProfile || policyDraft?.bundle?.reasoning_profile || {},
    safety_profile: activeAgentData?.safetyProfile || policyDraft?.bundle?.safety_profile || {},
    knowledge_profile: activeAgentData?.knowledgeProfile || policyDraft?.bundle?.knowledge_profile || {},
    rollout_policy: policyDraft?.bundle?.rollout_policy || { rollout_percentage: runtimeSummary.rollout },
  }), [activeAgentData, policyDraft?.bundle, runtimeSummary.rollout]);

  const workspaceSettings = useMemo(() => parseSettings(workspace?.settings), [workspace?.settings]);
  const aiStudioSettings = useMemo(() => parseSettings(workspaceSettings?.aiStudio), [workspaceSettings]);
  const costControls = useMemo(() => ({
    dailyCap: safeNumber(aiStudioSettings?.costControls?.dailyCap, 20),
    hardStopEnabled: Boolean(aiStudioSettings?.costControls?.hardStopEnabled),
    rolloutPercentage: safeNumber(aiStudioSettings?.rolloutPercentage, 10),
  }), [aiStudioSettings]);

  const costSummary = reportCosts?.summary || {};
  const overviewKpis = reportOverview?.kpis || [];
  const approvalsFunnel = reportApprovals?.funnel || [];
  const approvalsRates = reportApprovals?.rates || {};
  const pendingApprovals = safeNumber(approvalsFunnel.find((item: any) => item.label === 'Pending')?.val);
  const deflectionRate = safeNumber(overviewKpis.find((item: any) => item.id === 'auto_resolution')?.value);
  const escalationRate = Math.max(0, Math.min(100, 100 - safeNumber(approvalsRates.approvalRate, 100)));
  const toolErrors = safeNumber(operationsOverview?.agent_failures_last_24h);
  const totalCreditsUsed = safeNumber(costSummary.creditsUsed);
  const totalCreditsAdded = Math.max(safeNumber(costSummary.creditsAdded), 1);
  const dailyCapUsage = Math.min(100, Math.round((totalCreditsUsed / Math.max(costControls.dailyCap, 1)) * 100));

  const connectorList = Array.isArray(connectors) ? connectors : [];
  const connectedConnectors = connectorList.filter((connector: any) => normalizeConnectorStatus(connector) === 'connected').length;
  const availableConnectors = connectorList.length;
  const recentRunsList = Array.isArray(recentRuns) ? recentRuns : [];

  const goLiveChecklist = useMemo(() => {
    const items = [
      {
        label: 'LLM provider configured',
        completed: Boolean(studioData?.modelConfig?.apiKeyConfigured),
        actionLabel: 'Open Safety',
        onClick: () => setActiveTab('Safety'),
      },
      {
        label: 'Core agents active',
        completed: safeNumber(studioData?.agents?.active) > 0,
        actionLabel: 'Open Agents',
        onClick: () => setActiveTab('Agents'),
      },
      {
        label: 'At least one connector online',
        completed: connectedConnectors > 0,
        actionLabel: 'Review setup',
        onClick: () => setActiveTab('Overview'),
      },
      {
        label: 'Knowledge imported',
        completed: safeNumber(studioData?.knowledge?.publishedArticles) > 0,
        actionLabel: 'Open Knowledge',
        onClick: () => setActiveTab('Knowledge'),
      },
      {
        label: 'Policy runtime enabled',
        completed: Boolean(studioData?.planEngine?.enabled),
        actionLabel: 'Open Permissions',
        onClick: () => setActiveTab('Permissions'),
      },
      {
        label: 'Recent agent runs observed',
        completed: recentRunsList.length > 0,
        actionLabel: 'View runs',
        onClick: () => setActiveTab('Agents'),
      },
      {
        label: 'Cost controls configured',
        completed: costControls.dailyCap > 0,
        actionLabel: 'Review controls',
        onClick: () => setActiveTab('Overview'),
      },
    ];
    return items;
  }, [
    connectedConnectors,
    costControls.dailyCap,
    recentRunsList.length,
    studioData?.agents?.active,
    studioData?.knowledge?.publishedArticles,
    studioData?.modelConfig?.apiKeyConfigured,
    studioData?.planEngine?.enabled,
  ]);

  const completedChecklist = goLiveChecklist.filter((item) => item.completed).length;
  const topAgents = useMemo(
    () => mappedCategories.flatMap((category) => category.agents).slice(0, 5),
    [mappedCategories],
  );

  const handleSaveDraft = async () => {
    if (!selectedAgentId) return;
    await updateDraft.mutate({
      id: selectedAgentId,
      body: currentPolicyBundle,
    });
    refetchDraft();
    refetchEffective();
    refetchStudio();
  };

  const handlePublishDraft = async () => {
    if (!selectedAgentId) return;
    await publishDraft.mutate({ id: selectedAgentId });
    refetchDraft();
    refetchEffective();
    refetchStudio();
  };

  const handleRollbackDraft = async () => {
    if (!selectedAgentId) return;
    await rollbackDraft.mutate({ id: selectedAgentId });
    refetchDraft();
    refetchEffective();
    refetchStudio();
  };

  const persistAiStudioSettings = async (nextAiStudioSettings: Record<string, any>) => {
    if (!workspace?.id) return;
    await workspacesApi.update(workspace.id, {
      settings: {
        ...workspaceSettings,
        aiStudio: nextAiStudioSettings,
      },
    });
    refetchWorkspace();
  };

  const handleEmergencyStop = async () => {
    const stoppableAgents = mappedCategories
      .flatMap((category) => category.agents)
      .filter((agent: any) => agent.id && agent.active && !agent.locked);

    await Promise.all(
      stoppableAgents.map((agent: any) =>
        updateAgentConfig.mutate({
          id: agent.id,
          body: { isActive: false },
        }),
      ),
    );
    setOverviewMessage(`Stopped ${stoppableAgents.length} editable agents.`);
    setAgentActiveOverrides((current) => {
      const next = { ...current };
      stoppableAgents.forEach((agent: any) => { next[agent.id] = false; });
      return next;
    });
    refetchAgentCatalog();
    refetchStudio();
    refetchEffective();
    refetchRuns();
  };

  const handleEnableAllAgents = async () => {
    const editableAgents = mappedCategories
      .flatMap((category) => category.agents)
      .filter((agent: any) => agent.id && !agent.locked && !agent.active);

    await Promise.all(
      editableAgents.map((agent: any) =>
        updateAgentConfig.mutate({
          id: agent.id,
          body: { isActive: true },
        }),
      ),
    );
    setOverviewMessage(`Enabled ${editableAgents.length} editable agents.`);
    setAgentActiveOverrides((current) => {
      const next = { ...current };
      editableAgents.forEach((agent: any) => { next[agent.id] = true; });
      return next;
    });
    refetchAgentCatalog();
    refetchStudio();
    refetchEffective();
    refetchRuns();
  };

  const confirmWorkspaceAction = async () => {
    if (pendingWorkspaceAction === 'enable_all') {
      await handleEnableAllAgents();
    }
    if (pendingWorkspaceAction === 'emergency_stop') {
      await handleEmergencyStop();
    }
    setPendingWorkspaceAction(null);
  };

  const handleCostControlToggle = async () => {
    setSavingCostControls(true);
    await persistAiStudioSettings({
      ...aiStudioSettings,
      rolloutPercentage: costControls.rolloutPercentage,
      costControls: {
        ...costControls,
        hardStopEnabled: !costControls.hardStopEnabled,
      },
    });
    setSavingCostControls(false);
    setOverviewMessage(`Hard stop ${!costControls.hardStopEnabled ? 'enabled' : 'disabled'}.`);
  };

  const handleDailyCapChange = async (delta: number) => {
    setSavingCostControls(true);
    const nextDailyCap = Math.max(5, costControls.dailyCap + delta);
    await persistAiStudioSettings({
      ...aiStudioSettings,
      rolloutPercentage: costControls.rolloutPercentage,
      costControls: {
        ...costControls,
        dailyCap: nextDailyCap,
      },
    });
    setSavingCostControls(false);
    setOverviewMessage(`Daily cap updated to €${nextDailyCap}.`);
  };

  const handleToggleAgent = async (agent: any) => {
    if (!agent?.id || agent.locked) return false;
    const nextActive = !agent.active;
    setPendingAgentId(agent.id);
    const result = await updateAgentConfig.mutate({
      id: agent.id,
      body: { isActive: nextActive },
    });
    if (!result) {
      setOverviewMessage(`Could not ${nextActive ? 'enable' : 'disable'} ${agent.name}. Check permissions or agent configuration.`);
      setPendingAgentId(null);
      return false;
    }
    setAgentActiveOverrides((current) => ({ ...current, [agent.id]: nextActive }));
    setOverviewMessage(`${agent.name} ${nextActive ? 'enabled' : 'disabled'}.`);
    refetchAgentCatalog();
    refetchStudio();
    refetchEffective();
    refetchRuns();
    setPendingAgentId(null);
    return true;
  };

  const confirmAgentToggle = async () => {
    if (!pendingAgentToggle?.agent) return;
    const changed = await handleToggleAgent(pendingAgentToggle.agent);
    if (changed) setPendingAgentToggle(null);
  };

  const agentRoadmapData = (agent: any) => {
    const profile = agent?.connectionProfile || connectionAgentByName.get(agent?.name) || {};
    return {
      receivesFrom: Array.isArray(profile.receivesFrom) && profile.receivesFrom.length ? profile.receivesFrom : agent.triggers || [],
      uses: Array.isArray(profile.uses) ? profile.uses : [],
      does: Array.isArray(profile.does) ? profile.does : [],
      reportsTo: Array.isArray(profile.reportsTo) && profile.reportsTo.length ? profile.reportsTo : agent.dependencies || [],
      writesTo: Array.isArray(profile.writesTo) ? profile.writesTo : [],
      blockedBy: Array.isArray(profile.blockedBy) ? profile.blockedBy : [],
      steps: Array.isArray(profile.steps) ? profile.steps : [],
      summary: profile.summary || `${(agent.triggers || []).length} inputs - ${(agent.dependencies || []).length} connections`,
      role: profile.role || agent.purpose || agent.desc,
    };
  };

  return (
    <div className={embedded ? "flex-1 flex flex-col h-full min-w-0 min-h-0" : "flex-1 flex flex-col h-full min-w-0 bg-[#f3f3f1] dark:bg-[#f3f3f1] p-2 pl-0"}>
      <div className={embedded ? "flex-1 flex flex-col overflow-hidden min-h-0" : "flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-white overflow-hidden rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] shadow-[0px_1px_2px_rgba(20,20,20,0.04)]"}>
      {!embedded && (<>
      {/* Header */}
      <div className="p-5 pb-0 flex-shrink-0 z-20">
        <div className="bg-white dark:bg-white rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] shadow-[0px_1px_2px_rgba(20,20,20,0.04)]">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-[15px] font-bold text-[#1a1a1a]">AI Studio</h1>
              </div>
              <p className="text-[12px] text-[#646462] mt-0.5">Prebuilt AI agents for support</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setPendingWorkspaceAction('enable_all')}
                disabled={!mappedCategories.some((category) => category.agents.some((agent: any) => agent.id && !agent.locked && !agent.active))}
                className="inline-flex items-center justify-center rounded-full border border-[#e9eae6] bg-white h-8 px-3 text-[13px] font-semibold text-[#1a1a1a] transition-colors hover:bg-[#f8f8f7] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Enable all agents
              </button>
              <button
                type="button"
                onClick={() => setPendingWorkspaceAction('emergency_stop')}
                disabled={!mappedCategories.some((category) => category.agents.some((agent: any) => agent.id && agent.active && !agent.locked))}
                className="inline-flex items-center justify-center rounded-full bg-[#dc2626] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Emergency stop
              </button>
            </div>
          </div>
          <div className="px-6 flex items-center space-x-8 border-t border-[#e9eae6] dark:border-[#e9eae6] pt-3">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-[13px] transition-colors border-b-2 ${
                  activeTab === tab
                    ? 'font-bold text-[#1a1a1a] border-black dark:border-white'
                    : 'font-medium text-[#646462] hover:text-[#1a1a1a] dark:text-[#a4a4a2] border-transparent hover:border-[#dcdcd9]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>
      </>)}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
        <AnimatePresence mode="wait">
          {activeTab === 'Overview' ? (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              {overviewMessage ? (
                <div className="rounded-[12px] border border-[#e9eae6] bg-[#f8f8f7] px-5 py-4 text-[13px] text-[#1a1a1a]">
                  {overviewMessage}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: 'Deflection Rate',
                    value: toPercent(deflectionRate),
                    detail: `${safeNumber(costSummary.autoResolvedCases).toLocaleString()} auto-resolved in the last 7 days`,
                  },
                  {
                    label: 'Escalation Rate',
                    value: toPercent(escalationRate),
                    detail: `${safeNumber(approvalsRates.avgDecisionHours, 0).toFixed(1)}h average approval decision`,
                  },
                  {
                    label: 'Pending Approvals',
                    value: pendingApprovals.toLocaleString(),
                    detail: pendingApprovals > 0 ? 'Needs operator attention' : 'No pending queues',
                  },
                  {
                    label: 'Tool Errors',
                    value: toolErrors.toLocaleString(),
                    detail: 'Last 24h execution failures',
                  },
                ].map((kpi) => (
                  <div key={kpi.label}>
                    <MinimalCard title={kpi.label} subtitle={kpi.detail}>
                      <div className="text-[28px] font-mono font-bold tracking-[-0.5px] text-[#1a1a1a]">{kpi.value}</div>
                    </MinimalCard>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_1fr]">
                <MinimalCard
                  title="Go live checklist"
                  subtitle="Operational readiness based on the current workspace, connectors and runtime."
                  icon="task_alt"
                  action={<MinimalPill tone="active">{completedChecklist}/{goLiveChecklist.length} complete</MinimalPill>}
                >
                  <div className="space-y-5">
                    <MinimalProgressBar label="Readiness" value={completedChecklist} max={goLiveChecklist.length} />
                    <div className="space-y-3">
                      {goLiveChecklist.map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-4 rounded-[20px] border border-[#e9eae6] px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full border ${item.completed ? 'border-[#e9eae6] bg-[#dc2626] text-white dark:border-[#e9eae6]' : 'border-[#e9eae6] text-[#a4a4a2] dark:text-[#646462]'}`}>
                              <span className="material-symbols-outlined text-[16px]">{item.completed ? 'check' : 'schedule'}</span>
                            </div>
                            <div>
                              <p className="text-[13px] font-semibold text-[#1a1a1a]">{item.label}</p>
                              <p className="text-[12px] text-[#646462] dark:text-[#a4a4a2]">{item.completed ? 'Ready' : 'Still needs setup'}</p>
                            </div>
                          </div>
                          <MinimalButton variant={item.completed ? 'ghost' : 'outline'} onClick={item.onClick}>
                            {item.actionLabel}
                          </MinimalButton>
                        </div>
                      ))}
                    </div>
                  </div>
                </MinimalCard>

                <div className="space-y-5">
                  <MinimalCard
                    title="Agent status"
                    subtitle="Live activation state for the agents currently loaded in this workspace."
                    icon="memory"
                    action={<MinimalButton variant="ghost" onClick={() => setActiveTab('Agents')}>Open agents</MinimalButton>}
                  >
                    <div className="space-y-4">
                      {topAgents.map((agent: any) => (
                        <div key={agent.id || agent.name} className="flex items-center justify-between gap-4 rounded-[18px] border border-[#e9eae6] px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-[#1a1a1a]">{agent.name}</p>
                            <p className="truncate text-[12px] text-[#646462] dark:text-[#a4a4a2]">{agent.desc}</p>
                          </div>
                          {agent.locked ? (
                            <MinimalPill tone="neutral">Locked</MinimalPill>
                          ) : (
                            <button
                              type="button"
                              aria-label={`${agent.active ? 'Disable' : 'Enable'} ${agent.name}`}
                              onClick={() => setPendingAgentToggle({ agent, nextActive: !agent.active })}
                              disabled={pendingAgentId === agent.id}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${agent.active ? 'border-[#1a1a1a] bg-[#dc2626]' : 'border-[#e9eae6] bg-black/10 dark:bg-white/10'} ${pendingAgentId === agent.id ? 'opacity-50' : ''}`}
                            >
                              <span className={`absolute h-4 w-4 rounded-full bg-white transition-all ${agent.active ? 'right-1' : 'left-1'}`} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </MinimalCard>

                  <MinimalCard
                    title="Cost controls"
                    subtitle="Persistent runtime limits shared with the workspace settings."
                    icon="tune"
                    action={<MinimalPill tone="neutral">{dailyCapUsage}% used</MinimalPill>}
                  >
                    <div className="space-y-5">
                      <MinimalProgressBar label="Daily cap" value={totalCreditsUsed} max={Math.max(costControls.dailyCap, totalCreditsUsed, 1)} suffix="credits" />
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-[18px] border border-[#e9eae6] px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-[#a4a4a2]">Limit</p>
                          <p className="mt-2 text-[20px] font-bold text-[#1a1a1a]">€{costControls.dailyCap}</p>
                        </div>
                        <div className="rounded-[18px] border border-[#e9eae6] px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-[#a4a4a2]">Runtime stop</p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-[13px] font-semibold text-[#1a1a1a]">{costControls.hardStopEnabled ? 'Enabled' : 'Disabled'}</span>
                            <button
                              type="button"
                              onClick={handleCostControlToggle}
                              disabled={savingCostControls}
                              className={`relative inline-flex h-7 w-12 items-center rounded-full border transition-colors ${costControls.hardStopEnabled ? 'border-[#1a1a1a] bg-[#dc2626]' : 'border-[#e9eae6] bg-black/10 dark:bg-white/10'} ${savingCostControls ? 'opacity-50' : ''}`}
                            >
                              <span className={`absolute h-5 w-5 rounded-full bg-white transition-all ${costControls.hardStopEnabled ? 'right-1' : 'left-1'}`} />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <MinimalButton variant="outline" onClick={() => handleDailyCapChange(-5)} disabled={savingCostControls}>- €5</MinimalButton>
                        <MinimalButton variant="outline" onClick={() => handleDailyCapChange(5)} disabled={savingCostControls}>+ €5</MinimalButton>
                        <MinimalButton variant="ghost" onClick={() => setActiveTab('Safety')}>Open safety</MinimalButton>
                      </div>
                    </div>
                  </MinimalCard>
                </div>
              </div>

              <MinimalCard
                title="Recent runs"
                subtitle="Latest agent executions pulled from live operations."
                icon="history"
                action={<MinimalButton variant="ghost" onClick={() => setActiveTab('Agents')}>View agents</MinimalButton>}
              >
                <div className="space-y-3">
                  {recentRunsList.slice(0, 6).map((run: any) => (
                    <div key={run.id} className="grid gap-3 rounded-[20px] border border-[#e9eae6] px-4 py-4 md:grid-cols-[1.4fr_0.9fr_0.7fr_0.7fr] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[#1a1a1a]">{run.agent_name || run.agent_slug || 'Agent run'}</p>
                        <p className="text-[12px] text-[#646462] dark:text-[#a4a4a2]">{run.trace_id || run.case_id || run.id}</p>
                      </div>
                      <div className="text-[13px] text-[#1a1a1a] dark:text-[#c4c4c2]">
                        {run.started_at ? formatCompactDate(run.started_at) : 'Waiting for timestamp'}
                      </div>
                      <div>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusPill(run.outcome_status)}`}>
                          {String(run.outcome_status || 'unknown').replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-[13px] text-[#646462] dark:text-[#a4a4a2]">
                        {safeNumber(run.cost_credits).toFixed(2)} cr · {safeNumber(run.tokens_used).toLocaleString()} tok
                      </div>
                    </div>
                  ))}
                  {!recentRunsList.length ? (
                    <div className="rounded-[20px] border border-dashed border-[#e9eae6] px-4 py-6 text-center text-[13px] text-[#646462] dark:text-[#a4a4a2]">
                      No recent runs yet. As soon as the runtime starts executing agents, they will appear here.
                    </div>
                  ) : null}
                </div>
              </MinimalCard>

              {false && (
                <>
              {/* Left Column */}
              <div className="xl:col-span-8 space-y-5">
                {/* Checklist Card */}
                <div className="bg-white dark:bg-white rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] shadow-[0px_1px_2px_rgba(20,20,20,0.04)] p-5">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-[16px] font-bold text-[#1a1a1a]">Go live checklist</h2>
                      <p className="text-[13px] text-[#646462] dark:text-[#a4a4a2]">Complete these steps to fully activate your AI agents.</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[20px] font-bold text-[#1a1a1a]">4/7</span>
                      <p className="text-[12px] text-[#a4a4a2] uppercase font-bold tracking-wider">completed</p>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-[#ededea] rounded-full mb-8 overflow-hidden">
                    <div className="h-full bg-black dark:bg-white w-[57%] rounded-full"></div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: 'Connect Channels', status: 'Done', completed: true },
                      { label: 'Connect Shopify', status: 'Connect', completed: false },
                      { label: 'Connect Stripe', status: 'Done', completed: true },
                      { label: 'Import Knowledge Base', status: 'Import', completed: false },
                      { label: 'Set approval limits', status: 'Set limits', completed: false },
                      { label: 'Configure brand voice', status: 'Configure', completed: false },
                      { label: 'Test in Playground', status: 'Test', completed: false },
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-white/50 border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px]">
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${item.completed ? 'bg-[#f8f8f7] dark:bg-green-900/20 border-[#e9eae6] dark:border-green-800 text-[#1a1a1a]' : 'border-[#dcdcd9] dark:border-gray-600'}`}>
                            {item.completed && <span className="material-symbols-outlined text-[13px] font-bold">check</span>}
                          </div>
                          <span className={`text-[13px] font-medium ${item.completed ? 'text-[#646462] line-through' : 'text-[#1a1a1a]'}`}>{item.label}</span>
                        </div>
                        <button className={`px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-colors ${item.completed ? 'text-[#1a1a1a]' : 'bg-[#1a1a1a] text-white hover:bg-indigo-700'}`}>
                          {item.status}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Deflection Rate', value: '42%', change: '+ 4%', positive: true },
                    { label: 'Escalation Rate', value: '12%', change: '1%', positive: true },
                    { label: 'Pending Approvals', value: '8', sub: 'Requires attention', alert: true },
                    { label: 'Tool Errors', value: '2', sub: 'Last 24h', error: true },
                  ].map((stat, idx) => (
                    <div key={idx} className="bg-white dark:bg-white p-5 rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] shadow-[0px_1px_2px_rgba(20,20,20,0.04)]">
                      <p className="text-[12px] font-medium text-[#646462] dark:text-[#a4a4a2] mb-2">{stat.label}</p>
                      <p className="text-[20px] font-bold text-[#1a1a1a]">{stat.value}</p>
                      {stat.change && (
                        <p className={`text-[11px] mt-1 flex items-center gap-1 ${stat.positive ? 'text-[#1a1a1a]' : 'text-[#1a1a1a]'}`}>
                          <span className="material-symbols-outlined text-[12px]">{stat.positive ? 'arrow_upward' : 'arrow_downward'}</span>
                          {stat.change}
                        </p>
                      )}
                      {stat.sub && (
                        <p className={`text-[11px] mt-1 ${stat.alert ? 'text-[#1a1a1a]' : stat.error ? 'text-[#1a1a1a]' : 'text-[#a4a4a2]'}`}>
                          {stat.sub}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Recent Runs */}
                <div className="bg-white dark:bg-white rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] shadow-[0px_1px_2px_rgba(20,20,20,0.04)] overflow-hidden">
                  <div className="p-5 border-b border-[#e9eae6] dark:border-[#e9eae6] flex items-center justify-between">
                    <h3 className="font-bold text-[#1a1a1a]">Recent runs</h3>
                    <button className="text-[12px] font-bold text-[#1a1a1a] hover:underline">View all</button>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-800">
                    {[
                      { id: '#RUN-8921', desc: 'Refund request for Order #1029', status: 'Resolved by AI', statusColor: 'text-[#1a1a1a] bg-[#f8f8f7]' },
                      { id: '#RUN-8920', desc: 'Where is my tracking number?', status: 'Escalated', statusColor: 'text-[#1a1a1a] bg-[#f8f8f7]' },
                      { id: '#RUN-8919', desc: 'Update subscription plan', status: 'Tool failed (Stripe)', statusColor: 'text-[#1a1a1a] bg-[#f8f8f7]' },
                    ].map((run, idx) => (
                      <div key={idx} className="p-4 flex items-center justify-between hover:bg-white/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-bold text-[#a4a4a2] uppercase tracking-widest">{run.id}</span>
                          <span className="text-[13px] font-medium text-[#1a1a1a]">{run.desc}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-[10px] font-mono uppercase tracking-[0.6px] ${run.statusColor} dark:bg-opacity-10`}>
                          {run.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="xl:col-span-4 space-y-5">
                {/* Recommended Card */}
                <div className="bg-white dark:bg-white rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] p-5 shadow-[0px_1px_2px_rgba(20,20,20,0.04)]">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 rounded-[12px] bg-[#1a1a1a] text-white flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
                      <span className="material-symbols-outlined">lightbulb</span>
                    </div>
                    <div>
                      <h3 className="text-[13px] font-bold text-[#1a1a1a]">Recommended next step</h3>
                      <p className="text-[12px] text-[#646462] dark:text-[#a4a4a2] mt-1 leading-relaxed">
                        Connect Shopify to enable order tracking capabilities for your customers.
                      </p>
                    </div>
                  </div>
                  <button className="w-full py-2.5 bg-white border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px] text-[13px] font-bold text-[#1a1a1a] dark:text-[#1a1a1a] hover:bg-[#f8f8f7] dark:hover:bg-gray-700 transition-colors shadow-[0px_1px_2px_rgba(20,20,20,0.04)]">
                    Open Connections
                  </button>
                </div>

                {/* Agents Status Card */}
                <div className="bg-white dark:bg-white rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] shadow-[0px_1px_2px_rgba(20,20,20,0.04)] p-5">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[13px] font-bold text-[#1a1a1a]">Agents Status</h3>
                    <button className="text-[#a4a4a2] hover:text-[#646462]">
                      <span className="material-symbols-outlined text-[14px]">more_horiz</span>
                    </button>
                  </div>
                  <div className="space-y-5">
                    {[
                      { name: 'Supervisor', sub: 'Core logic', icon: 'account_tree', iconColor: 'text-[#1a1a1a]', active: true },
                      { name: 'Canonicalizer', sub: 'Data clean up', icon: 'cleaning_services', iconColor: 'text-[#1a1a1a]', active: true },
                      { name: 'Stripe Agent', sub: 'Connected', icon: 'credit_card', iconColor: 'text-[#646462]', active: true },
                      { name: 'Shopify Agent', sub: 'Needs setup', icon: 'shopping_bag', iconColor: 'text-[#a4a4a2]', active: false },
                    ].map((agent, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-[8px] ${agent.iconColor} flex items-center justify-center`}>
                            <span className="material-symbols-outlined text-[14px]">{agent.icon}</span>
                          </div>
                          <div>
                            <p className="text-[12px] font-bold text-[#1a1a1a]">{agent.name}</p>
                            <p className={`text-[10px] ${agent.name === 'Shopify Agent' ? 'text-[#1a1a1a]' : 'text-[#a4a4a2]'}`}>{agent.sub}</p>
                          </div>
                        </div>
                        <div className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${agent.active ? 'bg-[#1a1a1a]' : 'bg-gray-300 dark:bg-gray-700'}`}>
                          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${agent.active ? 'right-0.5' : 'left-0.5'}`}></div>
                          {agent.active && <span className="absolute left-1 top-0.5 material-symbols-outlined text-[8px] text-white font-bold">check</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cost Controls Card */}
                <div className="bg-white dark:bg-white rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] shadow-[0px_1px_2px_rgba(20,20,20,0.04)] p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[13px] font-bold text-[#1a1a1a]">Cost controls</h3>
                    <button className="text-[#a4a4a2] hover:text-[#646462]">
                      <span className="material-symbols-outlined text-[14px]">settings</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[12px] font-bold text-[#1a1a1a]">Daily cap: <span className="font-normal text-[#646462]">€20.00</span></p>
                    <span className="text-[10px] font-bold text-[#a4a4a2]">35% used</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#ededea] rounded-full mb-4 overflow-hidden">
                    <div className="h-full bg-black dark:bg-white w-[35%] rounded-full"></div>
                  </div>
                  <p className="text-[10px] text-[#a4a4a2] leading-relaxed">
                    Resets in 8h 12m. Usage is currently within expected limits.
                  </p>
                </div>
              </div>
                </>
              )}
            </motion.div>
          ) : activeTab === 'Connections' ? (
            <ConnectionsView />
          ) : activeTab === 'Permissions' ? (
            <PermissionsView />
          ) : activeTab === 'Knowledge' ? (
            <KnowledgeView />
          ) : activeTab === 'Reasoning' ? (
            <ReasoningView />
          ) : activeTab === 'Safety' ? (
            <SafetyView />
          ) : (
            <motion.div
              key="agents"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex gap-6 h-full"
            >
              {/* Left Side: Agent List */}
              <div className="flex-1 space-y-5 pb-12 w-full">
                {activeAgentData && (
                  <div className="bg-white dark:bg-white rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] shadow-[0px_1px_2px_rgba(20,20,20,0.04)] p-5">
                    <div className="flex items-start justify-between gap-6">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`w-10 h-10 rounded-[12px] ${activeAgentData.iconColor} flex items-center justify-center`}>
                            <span className="material-symbols-outlined text-[15px]">{activeAgentData.icon}</span>
                          </div>
                          <div>
                            <h2 className="text-[15px] font-bold text-[#1a1a1a]">{activeAgentData.name}</h2>
                            <p className="text-[12px] text-[#646462] dark:text-[#a4a4a2]">{activeAgentData.desc}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-[8px] border border-[#e9eae6] dark:border-[#e9eae6] px-2 py-1 text-[10px] font-mono uppercase tracking-[0.6px] text-[#646462] dark:text-[#c4c4c2]">
                            Bundle {String(runtimeSummary.version)}
                          </span>
                          <span className="rounded-[8px] border border-[#e9eae6] dark:border-[#e9eae6] bg-[#f8f8f7] dark:bg-[#f8f8f7] px-2 py-1 text-[10px] font-mono uppercase tracking-[0.6px] text-[#1a1a1a] dark:text-[#1a1a1a]">
                            {runtimeSummary.status}
                          </span>
                          <span className="rounded-[8px] border border-[#e9eae6] dark:border-[#e9eae6] px-2 py-1 text-[10px] font-mono uppercase tracking-[0.6px] text-[#646462] dark:text-[#c4c4c2]">
                            Rollout {runtimeSummary.rollout}%
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleRollbackDraft}
                          className="h-8 px-3 rounded-[8px] text-[13px] font-semibold text-[#646462] dark:text-[#c4c4c2] hover:bg-[#f8f8f7]"
                        >
                          Rollback
                        </button>
                        <button
                          onClick={handleSaveDraft}
                          className="h-8 px-3 rounded-[8px] bg-[#f8f8f7] text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#ededea] border border-[#e9eae6] dark:bg-[#f8f8f7] dark:text-[#1a1a1a] dark:hover:bg-[#ededea]"
                        >
                          Save draft
                        </button>
                        <button
                          onClick={handlePublishDraft}
                          className="h-8 px-3 rounded-[8px] bg-[#1a1a1a] text-[13px] font-semibold text-white hover:bg-black dark:bg-white"
                        >
                          Publish
                        </button>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] bg-[#f8f8f7] dark:bg-[#f8f8f7] p-4">
                        <p className="text-[10px] font-mono uppercase tracking-[0.6px] text-[#a4a4a2]">Permissions</p>
                        <p className="mt-2 text-[20px] font-bold text-[#1a1a1a]">{runtimeSummary.permissions}</p>
                      </div>
                      <div className="rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] bg-[#f8f8f7] dark:bg-[#f8f8f7] p-4">
                        <p className="text-[10px] font-mono uppercase tracking-[0.6px] text-[#a4a4a2]">Reasoning</p>
                        <p className="mt-2 text-[20px] font-bold text-[#1a1a1a]">{runtimeSummary.reasoning}</p>
                      </div>
                      <div className="rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] bg-[#f8f8f7] dark:bg-[#f8f8f7] p-4">
                        <p className="text-[10px] font-mono uppercase tracking-[0.6px] text-[#a4a4a2]">Safety</p>
                        <p className="mt-2 text-[20px] font-bold text-[#1a1a1a]">{runtimeSummary.safety}</p>
                      </div>
                      <div className="rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] bg-[#f8f8f7] dark:bg-[#f8f8f7] p-4">
                        <p className="text-[10px] font-mono uppercase tracking-[0.6px] text-[#a4a4a2]">Knowledge</p>
                        <p className="mt-2 text-[20px] font-bold text-[#1a1a1a]">{runtimeSummary.knowledge}</p>
                      </div>
                    </div>
                    {effectivePolicy && (
                      <div className="mt-5 rounded-[12px] border border-blue-100 bg-[#f8f8f7]/70 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
                        <p className="text-[10px] font-mono uppercase tracking-[0.6px] text-[#1a1a1a] dark:text-blue-300">Effective policy</p>
                        <p className="mt-2 text-[13px] text-blue-900 dark:text-blue-200">
                          Runtime governed by restrictive precedence across workspace safety, domain safety, role permissions, agent overrides and case conditions.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Search & Filters */}
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#a4a4a2] text-[14px]">search</span>
                    <input 
                      type="text" 
                      placeholder="Search agents..." 
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15 transition-all"
                    />
                  </div>
                  <div className="flex bg-[#ededea] p-1 rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6]">
                    {(['All', 'Needs setup', 'Enabled', 'Disabled'] as const).map(filter => (
                      <button 
                        key={filter}
                        onClick={() => setAgentListFilter(filter)}
                        className={`px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all ${
                          agentListFilter === filter 
                            ? 'bg-black dark:bg-white text-white shadow-[0px_1px_2px_rgba(20,20,20,0.04)]' 
                            : 'text-[#646462] dark:text-[#a4a4a2] hover:text-[#1a1a1a]'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Categories */}
                {mappedCategories.map((category, catIdx) => (
                  <div key={catIdx} className="space-y-4">
                    <h3 className="text-[10px] font-bold text-[#a4a4a2] uppercase tracking-widest px-1">{category.title}</h3>
                    <div className="space-y-3">
                      {category.agents
                        .filter(agent => {
                          const query = agentSearch.trim().toLowerCase();
                          const matchesSearch = !query || agent.name.toLowerCase().includes(query) || agent.desc.toLowerCase().includes(query);
                          const matchesFilter = agentListFilter === 'All'
                            ? true
                            : agentListFilter === 'Needs setup'
                              ? !agent.active
                              : agentListFilter === 'Enabled'
                                ? agent.active
                                : !agent.active;
                          return matchesSearch && matchesFilter;
                        })
                        .map((agent, agentIdx) => (
                        <div 
                          key={agentIdx} 
                          onClick={() => {
                            setSelectedAgent(agent.name);
                            setExpandedAgent(expandedAgent === agent.name ? null : agent.name);
                          }}
                          className={`bg-white dark:bg-white border rounded-[12px] transition-all cursor-pointer ${
                            selectedAgent === agent.name 
                              ? 'border-[#1a1a1a] ring-1 ring-[#1a1a1a]/15 shadow-[0px_1px_4px_rgba(20,20,20,0.08)]' 
                              : 'border-[#e9eae6] dark:border-[#e9eae6] hover:border-[#e9eae6] dark:hover:border-[#e9eae6] shadow-[0px_1px_2px_rgba(20,20,20,0.04)]'
                          }`}
                        >
                          <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-[12px] ${agent.iconColor} flex items-center justify-center`}>
                                <span className="material-symbols-outlined text-[15px]">{agent.icon}</span>
                              </div>
                              <div>
                                <h4 className="text-[13px] font-bold text-[#1a1a1a]">{agent.name}</h4>
                                <p className="text-[12px] text-[#646462] dark:text-[#a4a4a2]">{agent.desc}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              {agent.locked ? (
                                <div className="flex items-center gap-1.5 text-[#a4a4a2]">
                                  <span className="material-symbols-outlined text-[13px]">lock</span>
                                  <span className="text-[10px] font-mono uppercase tracking-[0.6px]">Locked ON</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  aria-label={`${agent.active ? 'Disable' : 'Enable'} ${agent.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPendingAgentToggle({ agent, nextActive: !agent.active });
                                  }}
                                  disabled={pendingAgentId === agent.id}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${agent.active ? 'border-[#1a1a1a] bg-[#dc2626]' : 'border-[#e9eae6] bg-black/10 dark:bg-white/10'} ${pendingAgentId === agent.id ? 'opacity-50' : ''}`}
                                >
                                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${agent.active ? 'right-1' : 'left-1'}`}></div>
                                </button>
                              )}
                              <button
                                type="button"
                                aria-label={`${expandedAgent === agent.name ? 'Collapse' : 'Expand'} ${agent.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAgent(agent.name);
                                  setExpandedAgent(expandedAgent === agent.name ? null : agent.name);
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-[#a4a4a2] transition-colors hover:bg-[#f8f8f7] hover:text-[#1a1a1a]"
                              >
                                <span className={`material-symbols-outlined text-[18px] transition-transform ${expandedAgent === agent.name ? 'rotate-180' : ''}`}>expand_more</span>
                              </button>
                            </div>
                          </div>
                          
                          {/* Expanded Details */}
                          <AnimatePresence>
                            {expandedAgent === agent.name && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden border-t border-gray-50 dark:border-[#e9eae6]"
                              >
                                {(() => {
                                  const profileMeta = agent.connectionProfile || connectionAgentByName.get(agent.name) || {};
                                  const fallbackDescription = (agent.desc || agent.purpose || agent.category || 'Operational agent').trim();
                                  const responsibilities = Array.isArray(profileMeta?.does) ? profileMeta.does : [];
                                  const receivesFrom = Array.isArray(profileMeta?.receivesFrom) ? profileMeta.receivesFrom : [];
                                  const reportsTo = Array.isArray(profileMeta?.reportsTo) ? profileMeta.reportsTo : [];
                                  const writesTo = Array.isArray(profileMeta?.writesTo) ? profileMeta.writesTo : [];
                                  const blockedBy = Array.isArray(profileMeta?.blockedBy) ? profileMeta.blockedBy : [];
                                  const uses = Array.isArray(profileMeta?.uses) ? profileMeta.uses : [];
                                  const joinShort = (items: string[], limit = 2) => items.slice(0, limit).join(' and ');
                                  const normalizeSentence = (text: string) => {
                                    const sentence = text.trim().replace(/\.$/, '');
                                    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
                                  };
                                  const detailBullets = responsibilities.length
                                    ? responsibilities.slice(0, 3).map((item: string, index: number) => {
                                      const action = normalizeSentence(item);
                                      if (index === 0 && writesTo.length) {
                                        return `${action}. This matters because it produces ${joinShort(writesTo)} that downstream modules can trust.`;
                                      }
                                      if (index === 1 && reportsTo.length) {
                                        return `${action}. This keeps ${joinShort(reportsTo)} aligned with the same operational state.`;
                                      }
                                      if (index === 2 && blockedBy.length) {
                                        return `${action}. This helps prevent blockers such as ${joinShort(blockedBy)} before work moves forward.`;
                                      }
                                      if (uses.length) {
                                        return `${action}. It uses ${joinShort(uses)} so the decision is grounded in the configured runtime context.`;
                                      }
                                      if (receivesFrom.length) {
                                        return `${action}. It turns signals from ${joinShort(receivesFrom)} into usable agent context.`;
                                      }
                                      return `${action}.`;
                                    })
                                    : [fallbackDescription];

                                  return (
                                    <div className="p-5 space-y-5">
                                      <div className="rounded-[12px] border border-[#e9eae6] bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
                                        <div className="flex items-center justify-between gap-3">
                                          <div>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a4a4a2]">What it does</p>
                                          </div>
                                          <MinimalPill tone="subtle">{agent.active ? 'Live' : 'Paused'}</MinimalPill>
                                        </div>

                                        <div className="mt-4">
                                          <ul className="grid grid-cols-1 gap-2">
                                            {detailBullets.map((item: string, index: number) => (
                                              <li key={`${agent.name}-detail-${index}`} className="flex items-start gap-2 text-[13px] leading-6 text-[#1a1a1a] dark:text-[#c4c4c2]">
                                                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-[#dc2626]/70" />
                                                <span>{item}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}
                                <div className="px-6 pb-6">
                                  <div className="rounded-[12px] border border-[#e9eae6] bg-[#f8f8f7] p-5">
                                    <div className="flex items-center justify-between gap-3">
                                      <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#a4a4a2]">Agent network</p>
                                        <p className="mt-1 text-[13px] text-[#646462] dark:text-[#a4a4a2]">
                                          Real connections this agent has with the rest of the system.
                                        </p>
                                      </div>
                                      <MinimalPill tone="subtle">{agent.active ? 'Live' : 'Paused'}</MinimalPill>
                                    </div>
                                    <AgentNetworkGraph
                                      agent={{
                                        name: agent.name,
                                        icon: agent.icon,
                                        iconColor: agent.iconColor,
                                        active: agent.active,
                                      }}
                                      roadmap={agentRoadmapData(agent)}
                                    />
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>
      <ActionModal
        open={Boolean(pendingWorkspaceAction)}
        onClose={() => setPendingWorkspaceAction(null)}
        loading={false}
        variant={pendingWorkspaceAction === 'emergency_stop' ? 'danger' : 'warning'}
        icon={pendingWorkspaceAction === 'emergency_stop' ? 'emergency' : 'toggle_on'}
        title={pendingWorkspaceAction === 'emergency_stop' ? 'Emergency stop' : 'Enable all agents'}
        subtitle={pendingWorkspaceAction === 'emergency_stop'
          ? 'This will stop every editable active agent and prevent new tasks from being routed to them.'
          : 'This will enable every editable disabled agent so the runtime can route new tasks to them.'}
        context={pendingWorkspaceAction ? [
          { label: 'Scope', value: 'Workspace agents' },
          { label: 'Editable agents', value: pendingWorkspaceAction === 'emergency_stop'
            ? String(mappedCategories.flatMap((category) => category.agents).filter((agent: any) => agent.id && agent.active && !agent.locked).length)
            : String(mappedCategories.flatMap((category) => category.agents).filter((agent: any) => agent.id && !agent.locked && !agent.active).length)
          },
          { label: 'Current mode', value: pendingWorkspaceAction === 'emergency_stop' ? 'Live to paused' : 'Paused to live' },
        ] : []}
        steps={pendingWorkspaceAction === 'emergency_stop' ? [
          { text: 'Active editable agents are stopped', detail: 'Only unlocked agents currently active will be paused.' },
          { text: 'Routing is refreshed', detail: 'The runtime map is reloaded so the dashboard reflects the new state.' },
          { text: 'No configuration is deleted', detail: 'Agent bundles stay intact; only execution state changes.' },
        ] : [
          { text: 'Disabled editable agents are activated', detail: 'Only unlocked agents currently paused will be enabled.' },
          { text: 'Routing becomes available again', detail: 'The runtime can start sending work to those agents.' },
          { text: 'Live state is synced back to the UI', detail: 'The agent list refreshes to show the new status.' },
        ]}
        considerations={pendingWorkspaceAction === 'emergency_stop' ? [
          { text: 'This will immediately halt routing to live editable agents.' },
          { text: 'Locked agents are not affected.' },
        ] : [
          { text: 'This can expose newly enabled agents to live traffic right away.' },
          { text: 'If an agent is not fully configured it may still fail on missing tools or connectors.' },
        ]}
        confirmLabel={pendingWorkspaceAction === 'emergency_stop' ? 'Stop all agents' : 'Enable all agents'}
        onConfirm={confirmWorkspaceAction}
      />

      <ActionModal
        open={Boolean(pendingAgentToggle?.agent)}
        onClose={() => setPendingAgentToggle(null)}
        loading={pendingAgentId === pendingAgentToggle?.agent?.id}
        variant={pendingAgentToggle?.nextActive ? 'warning' : 'danger'}
        icon={pendingAgentToggle?.nextActive ? 'toggle_on' : 'toggle_off'}
        title={pendingAgentToggle?.nextActive ? `Enable ${pendingAgentToggle?.agent?.name || 'agent'}` : `Disable ${pendingAgentToggle?.agent?.name || 'agent'}`}
        subtitle={pendingAgentToggle?.nextActive
          ? 'This will activate the agent in the live runtime and let it receive new tasks.'
          : 'This will pause the agent so it stops receiving new tasks from the runtime.'}
        context={pendingAgentToggle?.agent ? [
          { label: 'Agent', value: pendingAgentToggle.agent.name },
          { label: 'Category', value: pendingAgentToggle.agent.category || 'Workspace agent' },
          { label: 'Current state', value: pendingAgentToggle.agent.active ? 'Active' : 'Disabled' },
          { label: 'Next state', value: pendingAgentToggle?.nextActive ? 'Active' : 'Disabled', accent: !pendingAgentToggle?.nextActive },
        ] : []}
        steps={pendingAgentToggle?.nextActive ? [
          { text: 'The agent becomes available to the runtime', detail: 'New tasks can be routed to this agent once the toggle is confirmed.' },
          { text: 'Any policy bundle stays intact', detail: 'Only the activation state changes; permissions, safety and reasoning profiles remain in place.' },
          { text: 'Operational routing is refreshed', detail: 'The dashboard refetches agent state so the UI reflects the new live status.' },
        ] : [
          { text: 'The agent stops receiving new work', detail: 'The runtime will avoid routing fresh tasks to this agent.' },
          { text: 'Current policy definitions remain stored', detail: 'No policy or configuration bundle is deleted; only execution is paused.' },
          { text: 'The workspace agent map is refreshed', detail: 'The list and live status indicators update after the change lands.' },
        ]}
        considerations={pendingAgentToggle?.nextActive ? [
          { text: 'Turning an agent on can immediately expose it to live traffic.' },
          { text: 'If the agent depends on incomplete setup, it may route but still fail on missing tools or connectors.' },
        ] : [
          { text: 'Disabling an agent prevents it from receiving new tasks, which can pause part of the support flow.' },
          { text: 'Locked agents cannot be toggled from this screen.' },
        ]}
        confirmLabel={pendingAgentToggle?.nextActive ? 'Enable agent' : 'Disable agent'}
        onConfirm={confirmAgentToggle}
      />
    </div>
  );
}

