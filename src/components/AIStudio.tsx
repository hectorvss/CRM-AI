import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { agentsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import { connectionCategories } from '../connectionsData';
import ConnectionsView from './ConnectionsView';
import PermissionsView from './PermissionsView';
import KnowledgeView from './KnowledgeView';
import ReasoningView from './ReasoningView';
import SafetyView from './SafetyView';

type AIStudioTab = 'Overview' | 'Agents' | 'Connections' | 'Permissions' | 'Knowledge' | 'Reasoning' | 'Safety';

const originalCategories = [
  {
    title: 'ORCHESTRATION',
    agents: [
      { 
        name: 'Supervisor', 
        desc: 'Orchestrates the overall agent flow', 
        icon: 'account_tree', 
        iconColor: 'text-purple-600', 
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
        iconColor: 'text-indigo-600', 
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
        iconColor: 'text-blue-600', 
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
        iconColor: 'text-orange-600', 
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
        iconColor: 'text-emerald-600', 
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
        iconColor: 'text-cyan-600', 
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
        iconColor: 'text-amber-600', 
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
        iconColor: 'text-pink-600', 
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
        iconColor: 'text-rose-600', 
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
        iconColor: 'text-fuchsia-600', 
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
        iconColor: 'text-lime-600', 
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
        iconColor: 'text-indigo-600', 
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
        iconColor: 'text-teal-600', 
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
        iconColor: 'text-slate-600', 
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
        iconColor: 'text-sky-600', 
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
        iconColor: 'text-indigo-600', 
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
        iconColor: 'text-emerald-600', 
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
        iconColor: 'text-stone-600', 
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
        iconColor: 'text-orange-600', 
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
        iconColor: 'text-violet-600', 
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
        iconColor: 'text-blue-600', 
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
        iconColor: 'text-red-600', 
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
        iconColor: 'text-blue-600', 
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
        iconColor: 'text-gray-600', 
        locked: true,
        purpose: 'Records executions, failures, retries, overrides, and recurring contradictions. Monitors system reliability and unhealthy patterns. Feeds logs, analytics, and observability.',
        triggers: ['Any agent execution', 'Any writeback', 'Any failed sync', 'Any approval wait', 'Any manual override', 'Any contradiction reopened', 'Any integration health anomaly'],
        dependencies: ['All resolution-related agents', 'Integrations / Sync Health', 'Resolution Executor', 'Reconciliation Agent', 'SLA & Escalation Agent'],
        ioLogic: { input: 'agent executions, system events, resolution outcomes, retries, failures', output: 'audit trail, observability records, recurring issue signals, reliability insights' }
      },
    ]
  }
];

export default function AIStudio() {
  const [activeTab, setActiveTab] = useState<AIStudioTab>('Overview');
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<string>('Supervisor');
  const [expandedConnection, setExpandedConnection] = useState<string | null>(null);
  const [configTab, setConfigTab] = useState<'Overview' | 'Configure' | 'Test' | 'Logs'>('Configure');
  const [agentSearch, setAgentSearch] = useState('');
  const [agentListFilter, setAgentListFilter] = useState<'All' | 'Needs setup' | 'Enabled' | 'Disabled'>('All');

  const { data: apiAgents, refetch: refetchAgents } = useApi(agentsApi.list);

  const CATEGORY_ICONS: Record<string, string> = {
    orchestration: 'supervisor_account', ingest: 'input', resolution: 'build',
    communication: 'forum', observability: 'monitoring', connectors: 'cable',
  };

  const CATEGORY_COLORS: Record<string, string> = {
    orchestration: 'text-purple-600', ingest: 'text-blue-600', resolution: 'text-orange-600',
    communication: 'text-green-600', observability: 'text-gray-600', connectors: 'text-cyan-600',
  };

  const tabs: AIStudioTab[] = ['Overview', 'Agents', 'Connections', 'Permissions', 'Knowledge', 'Reasoning', 'Safety'];

  // Map API agents into the categories structure for rendering
  const mappedCategories = useMemo(() => (
    apiAgents && apiAgents.length > 0
      ? [...new Set(apiAgents.map((a: any) => a.category))].map(cat => ({
          title: String(cat).toUpperCase().replace(/_/g, ' '),
          agents: apiAgents.filter((a: any) => a.category === cat).map((a: any) => ({
            id: a.id,
            slug: a.slug,
            name: a.name,
            desc: a.description || a.slug,
            icon: a.icon || CATEGORY_ICONS[a.category] || 'smart_toy',
            iconColor: a.iconColor || CATEGORY_COLORS[a.category] || 'text-indigo-600',
            active: !!a.is_active,
            locked: !!a.is_locked,
            purpose: a.purpose || a.reasoning_profile?.systemInstruction || a.description || a.slug,
            triggers: a.triggers?.length ? a.triggers : ['System defined triggers'],
            dependencies: a.dependencies?.length ? a.dependencies : ['Core routing', 'Context Window'],
            ioLogic: a.ioLogic || { input: 'Canonical event', output: 'Approved action or Routing' },
            metrics: a.metrics || {},
            permissionProfile: a.permission_profile,
            reasoningProfile: a.reasoning_profile,
            safetyProfile: a.safety_profile,
          }))
        }))
      : originalCategories
  ), [apiAgents]);

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

  const handleSaveDraft = async () => {
    if (!selectedAgentId) return;
    await updateDraft.mutate({
      id: selectedAgentId,
      body: currentPolicyBundle,
    });
    refetchDraft();
    refetchEffective();
    refetchAgents();
  };

  const handlePublishDraft = async () => {
    if (!selectedAgentId) return;
    await publishDraft.mutate({ id: selectedAgentId });
    refetchDraft();
    refetchEffective();
    refetchAgents();
  };

  const handleRollbackDraft = async () => {
    if (!selectedAgentId) return;
    await rollbackDraft.mutate({ id: selectedAgentId });
    refetchDraft();
    refetchEffective();
    refetchAgents();
  };

  const handleToggleAgent = async (agent: any) => {
    if (!agent?.id || agent.locked) return;
    await updateAgentConfig.mutate({
      id: agent.id,
      body: { isActive: !agent.active },
    });
    refetchAgents();
    refetchEffective();
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
      {/* Header */}
      <div className="p-6 pb-0 flex-shrink-0 z-20">
        <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">AI Studio</h1>
                <div className="bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded-full flex items-center gap-1.5 border border-orange-100 dark:border-orange-800/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                  <span className="text-[10px] font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider">Limited rollout (10%)</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Prebuilt AI agents for support</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="text-sm font-bold text-red-600 hover:text-red-700 transition-colors">Emergency stop</button>
              <button className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:opacity-90 transition-opacity shadow-sm">
                Deploy to 25%
              </button>
              <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-[11px] font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                Ecommerce Support preset
              </div>
            </div>
          </div>
          <div className="px-6 flex items-center space-x-8 border-t border-gray-100 dark:border-gray-800 pt-3">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm transition-colors border-b-2 ${
                  activeTab === tab
                    ? 'font-bold text-gray-900 dark:text-white border-black dark:border-white'
                    : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'Overview' ? (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 xl:grid-cols-12 gap-6"
            >
              {/* Left Column */}
              <div className="xl:col-span-8 space-y-6">
                {/* Checklist Card */}
                <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Go live checklist</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Complete these steps to fully activate your AI agents.</p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">4/7</span>
                      <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">completed</p>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full mb-8 overflow-hidden">
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
                      <div key={idx} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${item.completed ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-600' : 'border-gray-300 dark:border-gray-600'}`}>
                            {item.completed && <span className="material-symbols-outlined text-sm font-bold">check</span>}
                          </div>
                          <span className={`text-sm font-medium ${item.completed ? 'text-gray-500 line-through' : 'text-gray-900 dark:text-white'}`}>{item.label}</span>
                        </div>
                        <button className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${item.completed ? 'text-green-600' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
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
                    <div key={idx} className="bg-white dark:bg-card-dark p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{stat.label}</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                      {stat.change && (
                        <p className={`text-[11px] mt-1 flex items-center gap-1 ${stat.positive ? 'text-green-600' : 'text-red-600'}`}>
                          <span className="material-symbols-outlined text-xs">{stat.positive ? 'arrow_upward' : 'arrow_downward'}</span>
                          {stat.change}
                        </p>
                      )}
                      {stat.sub && (
                        <p className={`text-[11px] mt-1 ${stat.alert ? 'text-orange-600' : stat.error ? 'text-red-600' : 'text-gray-400'}`}>
                          {stat.sub}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Recent Runs */}
                <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 dark:text-white">Recent runs</h3>
                    <button className="text-xs font-bold text-indigo-600 hover:underline">View all</button>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-800">
                    {[
                      { id: '#RUN-8921', desc: 'Refund request for Order #1029', status: 'Resolved by AI', statusColor: 'text-green-600 bg-green-50' },
                      { id: '#RUN-8920', desc: 'Where is my tracking number?', status: 'Escalated', statusColor: 'text-orange-600 bg-orange-50' },
                      { id: '#RUN-8919', desc: 'Update subscription plan', status: 'Tool failed (Stripe)', statusColor: 'text-red-600 bg-red-50' },
                    ].map((run, idx) => (
                      <div key={idx} className="p-4 flex items-center justify-between hover:bg-white dark:hover:bg-gray-800/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{run.id}</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{run.desc}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${run.statusColor} dark:bg-opacity-10`}>
                          {run.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="xl:col-span-4 space-y-6">
                {/* Recommended Card */}
                <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
                      <span className="material-symbols-outlined">lightbulb</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">Recommended next step</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                        Connect Shopify to enable order tracking capabilities for your customers.
                      </p>
                    </div>
                  </div>
                  <button className="w-full py-2.5 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 rounded-xl text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors shadow-sm">
                    Open Connections
                  </button>
                </div>

                {/* Agents Status Card */}
                <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Agents Status</h3>
                    <button className="text-gray-400 hover:text-gray-600">
                      <span className="material-symbols-outlined text-lg">more_horiz</span>
                    </button>
                  </div>
                  <div className="space-y-5">
                    {[
                      { name: 'Supervisor', sub: 'Core logic', icon: 'account_tree', iconColor: 'text-purple-600', active: true },
                      { name: 'Canonicalizer', sub: 'Data clean up', icon: 'cleaning_services', iconColor: 'text-blue-600', active: true },
                      { name: 'Stripe Agent', sub: 'Connected', icon: 'credit_card', iconColor: 'text-gray-600', active: true },
                      { name: 'Shopify Agent', sub: 'Needs setup', icon: 'shopping_bag', iconColor: 'text-gray-400', active: false },
                    ].map((agent, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg ${agent.iconColor} flex items-center justify-center`}>
                            <span className="material-symbols-outlined text-lg">{agent.icon}</span>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-900 dark:text-white">{agent.name}</p>
                            <p className={`text-[10px] ${agent.name === 'Shopify Agent' ? 'text-orange-500' : 'text-gray-400'}`}>{agent.sub}</p>
                          </div>
                        </div>
                        <div className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${agent.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${agent.active ? 'right-0.5' : 'left-0.5'}`}></div>
                          {agent.active && <span className="absolute left-1 top-0.5 material-symbols-outlined text-[8px] text-white font-bold">check</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cost Controls Card */}
                <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Cost controls</h3>
                    <button className="text-gray-400 hover:text-gray-600">
                      <span className="material-symbols-outlined text-lg">settings</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">Daily cap: <span className="font-normal text-gray-500">€20.00</span></p>
                    <span className="text-[10px] font-bold text-gray-400">35% used</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mb-4 overflow-hidden">
                    <div className="h-full bg-black dark:bg-white w-[35%] rounded-full"></div>
                  </div>
                  <p className="text-[10px] text-gray-400 leading-relaxed">
                    Resets in 8h 12m. Usage is currently within expected limits.
                  </p>
                </div>
              </div>
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
              <div className="flex-1 space-y-8 pb-12 w-full">
                {activeAgentData && (
                  <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-6">
                    <div className="flex items-start justify-between gap-6">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`w-10 h-10 rounded-xl ${activeAgentData.iconColor} flex items-center justify-center`}>
                            <span className="material-symbols-outlined text-xl">{activeAgentData.icon}</span>
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{activeAgentData.name}</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{activeAgentData.desc}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                            Bundle {String(runtimeSummary.version)}
                          </span>
                          <span className="rounded-lg border border-indigo-200 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                            {runtimeSummary.status}
                          </span>
                          <span className="rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-300">
                            Rollout {runtimeSummary.rollout}%
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleRollbackDraft}
                          className="rounded-xl px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          Rollback
                        </button>
                        <button
                          onClick={handleSaveDraft}
                          className="rounded-xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
                        >
                          Save draft
                        </button>
                        <button
                          onClick={handlePublishDraft}
                          className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white dark:bg-white dark:text-black"
                        >
                          Publish
                        </button>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Permissions</p>
                        <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{runtimeSummary.permissions}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Reasoning</p>
                        <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{runtimeSummary.reasoning}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Safety</p>
                        <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{runtimeSummary.safety}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Knowledge</p>
                        <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{runtimeSummary.knowledge}</p>
                      </div>
                    </div>
                    {effectivePolicy && (
                      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Effective policy</p>
                        <p className="mt-2 text-sm text-blue-900 dark:text-blue-200">
                          Runtime governed by restrictive precedence across workspace safety, domain safety, role permissions, agent overrides and case conditions.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Search & Filters */}
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span>
                    <input 
                      type="text" 
                      placeholder="Search agents..." 
                      value={agentSearch}
                      onChange={(e) => setAgentSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    />
                  </div>
                  <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                    {(['All', 'Needs setup', 'Enabled', 'Disabled'] as const).map(filter => (
                      <button 
                        key={filter}
                        onClick={() => setAgentListFilter(filter)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          agentListFilter === filter 
                            ? 'bg-black dark:bg-white text-white dark:text-black shadow-sm' 
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
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
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">{category.title}</h3>
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
                          className={`bg-white dark:bg-card-dark border rounded-2xl transition-all cursor-pointer ${
                            selectedAgent === agent.name 
                              ? 'border-indigo-500 ring-1 ring-indigo-500/20 shadow-md' 
                              : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm'
                          }`}
                        >
                          <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-xl ${agent.iconColor} flex items-center justify-center`}>
                                <span className="material-symbols-outlined text-xl">{agent.icon}</span>
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white">{agent.name}</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{agent.desc}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              {agent.locked ? (
                                <div className="flex items-center gap-1.5 text-gray-400">
                                  <span className="material-symbols-outlined text-sm">lock</span>
                                  <span className="text-[10px] font-bold uppercase tracking-wider">Locked ON</span>
                                </div>
                              ) : (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleAgent(agent);
                                  }}
                                  className={`w-8 h-4 rounded-full relative transition-colors ${agent.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}`}
                                >
                                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${agent.active ? 'right-0.5' : 'left-0.5'}`}></div>
                                </div>
                              )}
                              <span className={`material-symbols-outlined text-gray-400 transition-transform ${expandedAgent === agent.name ? 'rotate-180' : ''}`}>expand_more</span>
                            </div>
                          </div>
                          
                          {/* Expanded Details */}
                          <AnimatePresence>
                            {expandedAgent === agent.name && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden border-t border-gray-50 dark:border-gray-800"
                              >
                                <div className="p-6 grid grid-cols-2 gap-8">
                                  <div className="space-y-4">
                                    <div>
                                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Purpose</p>
                                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                        {agent.purpose}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Triggers</p>
                                      <ul className="space-y-1.5">
                                        {agent.triggers.map((trigger, i) => (
                                          <li key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                                            {trigger}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                  <div className="space-y-4">
                                    <div>
                                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Dependencies</p>
                                      <div className="flex flex-wrap gap-2">
                                        {agent.dependencies.map(dep => (
                                          <span key={dep} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">{dep}</span>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">I/O Logic</p>
                                      <div className="flex items-center gap-2">
                                        <div className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700 text-[10px] font-mono">{agent.ioLogic?.input || 'Canonical Event'}</div>
                                        <span className="material-symbols-outlined text-xs text-gray-400">arrow_forward</span>
                                        <div className="px-2 py-1 bg-white dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700 text-[10px] font-mono">{agent.ioLogic?.output || 'Routing Decision'}</div>
                                      </div>
                                    </div>
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
    </div>
  );
}
