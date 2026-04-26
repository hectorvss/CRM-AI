import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { workflowsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import type { NavigateFn } from '../types';
import LoadingState from './LoadingState';

type WorkflowView = 'list' | 'builder';
type WorkflowTab = 'overview' | 'builder' | 'runs';
type NodeType = 'trigger' | 'condition' | 'action' | 'agent' | 'policy' | 'knowledge' | 'integration' | 'utility';

interface WorkflowNode {
  id: string;
  type: NodeType;
  key: string;
  label: string;
  position: { x: number; y: number };
  config: Record<string, any>;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface Workflow {
  id: string;
  name: string;
  category: string;
  description: string;
  status: 'needs_setup' | 'blocked' | 'active' | 'warning' | 'dependency_missing';
  statusMessage?: string;
  metrics: { label: string; value: string; suffix?: string }[];
  lastRun: string;
  lastEdited: string;
  currentVersion?: any;
  versions?: any[];
  recentRuns?: any[];
}

interface NodeSpec {
  type: NodeType;
  key: string;
  label: string;
  category: string;
  icon: string;
  requiresConfig?: boolean;
  sensitive?: boolean;
}

interface WorkflowsProps {
  onNavigate?: NavigateFn;
  focusWorkflowId?: string | null;
}

const FALLBACK_CATALOG: NodeSpec[] = [
  { type: 'trigger', key: 'case.created', label: 'Case created', category: 'Trigger', icon: 'assignment' },
  { type: 'trigger', key: 'message.received', label: 'Message received', category: 'Trigger', icon: 'mail' },
  { type: 'trigger', key: 'order.updated', label: 'Order updated', category: 'Trigger', icon: 'shopping_bag' },
  { type: 'trigger', key: 'manual.run', label: 'Manual run', category: 'Trigger', icon: 'play_arrow' },
  { type: 'condition', key: 'amount.threshold', label: 'Amount threshold', category: 'Condition', icon: 'attach_money', requiresConfig: true },
  { type: 'condition', key: 'risk.level', label: 'Risk level', category: 'Condition', icon: 'gpp_maybe', requiresConfig: true },
  { type: 'action', key: 'payment.refund', label: 'Issue refund', category: 'Action', icon: 'currency_exchange', requiresConfig: true, sensitive: true },
  { type: 'action', key: 'order.cancel', label: 'Cancel order', category: 'Action', icon: 'block', requiresConfig: true, sensitive: true },
  { type: 'agent', key: 'agent.run', label: 'Run specialist agent', category: 'Agent', icon: 'smart_toy', requiresConfig: true },
  { type: 'policy', key: 'policy.evaluate', label: 'Evaluate policy', category: 'Policy', icon: 'shield', requiresConfig: true },
  { type: 'knowledge', key: 'knowledge.search', label: 'Search knowledge', category: 'Knowledge', icon: 'menu_book', requiresConfig: true },
  { type: 'integration', key: 'connector.call', label: 'Call connector', category: 'Integration', icon: 'hub', requiresConfig: true },
  { type: 'utility', key: 'retry', label: 'Retry', category: 'Utility', icon: 'refresh', requiresConfig: true },
];

const TEMPLATES = [
  {
    id: 'refund_guarded',
    label: 'Guarded refund',
    category: 'Refunds',
    description: 'Evaluate policy, route high-value refunds to approval, and execute safe refunds.',
    nodes: [
      { type: 'trigger', key: 'message.received', label: 'Refund request' },
      { type: 'policy', key: 'policy.evaluate', label: 'Check refund policy', config: { policy: 'refund_policy' } },
      { type: 'condition', key: 'amount.threshold', label: 'Amount under threshold', config: { field: 'payment.amount', operator: '<=', value: 250 } },
      { type: 'action', key: 'payment.refund', label: 'Issue refund', config: { amount: '{{payment.amount}}', reason: '{{case.reason}}' } },
    ],
  },
  {
    id: 'packing_guard',
    label: 'Packing guard',
    category: 'Orders',
    description: 'Block cancellation after packing and create a clear internal note.',
    nodes: [
      { type: 'trigger', key: 'order.updated', label: 'Order updated' },
      { type: 'condition', key: 'status.matches', label: 'Status is packed', config: { field: 'order.fulfillment_status', value: 'packed' } },
      { type: 'action', key: 'case.note', label: 'Create internal note', config: { content: 'Cancellation blocked after packing.' } },
    ],
  },
  {
    id: 'agent_triage',
    label: 'Agent triage',
    category: 'Agents',
    description: 'Run a specialist agent, check confidence, and escalate when needed.',
    nodes: [
      { type: 'trigger', key: 'case.created', label: 'Case created' },
      { type: 'agent', key: 'agent.run', label: 'Run triage agent', config: { agent: 'triage-agent' } },
      { type: 'condition', key: 'risk.level', label: 'High risk?', config: { field: 'agent.risk_level', value: 'high' } },
      { type: 'action', key: 'approval.create', label: 'Request approval', config: { queue: 'manager' } },
    ],
  },
] as const;

function makeNode(spec: Pick<WorkflowNode, 'type' | 'key' | 'label'> & { config?: Record<string, any> }, index: number): WorkflowNode {
  return {
    id: `node_${Date.now()}_${index}`,
    type: spec.type,
    key: spec.key,
    label: spec.label,
    position: { x: 160 + index * 250, y: 180 + (index % 2) * 120 },
    config: spec.config ?? {},
  };
}

function makeEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
  return nodes.slice(1).map((node, index) => ({
    id: `edge_${nodes[index].id}_${node.id}`,
    source: nodes[index].id,
    target: node.id,
    label: nodes[index].type === 'condition' ? 'true' : 'next',
  }));
}

function normalizeNodes(raw: any[] = []): WorkflowNode[] {
  return raw.map((node, index) => ({
    id: node.id ?? `node_${index + 1}`,
    type: node.type ?? 'action',
    key: node.key ?? node.type ?? 'action',
    label: node.label ?? node.name ?? node.key ?? `Step ${index + 1}`,
    position: node.position ?? { x: 160 + index * 250, y: 180 + (index % 2) * 120 },
    config: node.config ?? {},
  }));
}

function mapWorkflow(w: any): Workflow {
  const currentVersion = w.current_version ?? w.workflow_versions ?? null;
  return {
    id: w.id,
    name: w.name,
    category: w.category || 'General',
    description: w.description || '',
    currentVersion,
    versions: w.versions ?? [],
    recentRuns: w.recent_runs ?? [],
    metrics: [
      { label: 'Executions', value: String(w.metrics?.executions ?? 0) },
      { label: 'Success rate', value: w.metrics?.success_rate !== undefined ? `${w.metrics.success_rate}%` : 'N/A' },
      { label: 'Failures', value: String(w.metrics?.failed ?? 0) },
    ],
    lastRun: w.metrics?.last_run_at ? new Date(w.metrics.last_run_at).toLocaleString() : 'Never',
    lastEdited: w.updated_at ? new Date(w.updated_at).toLocaleDateString() : '-',
    status: ['blocked', 'warning', 'needs_setup', 'dependency_missing'].includes(w.health_status) ? w.health_status : 'active',
    statusMessage: w.health_message,
  };
}

function nodeTone(type: NodeType) {
  const tones: Record<NodeType, string> = {
    trigger: 'border-blue-500 bg-blue-50 text-blue-700',
    condition: 'border-amber-500 bg-amber-50 text-amber-700',
    action: 'border-emerald-500 bg-emerald-50 text-emerald-700',
    agent: 'border-indigo-500 bg-indigo-50 text-indigo-700',
    policy: 'border-slate-700 bg-slate-100 text-slate-800',
    knowledge: 'border-cyan-500 bg-cyan-50 text-cyan-700',
    integration: 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700',
    utility: 'border-gray-500 bg-gray-50 text-gray-700',
  };
  return tones[type];
}

export default function Workflows({ onNavigate: _onNavigate, focusWorkflowId }: WorkflowsProps) {
  void _onNavigate;
  const [view, setView] = useState<WorkflowView>('list');
  const [activeTab, setActiveTab] = useState<WorkflowTab>('overview');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<any | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [runResult, setRunResult] = useState<any | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const { data: apiWorkflows, loading, error } = useApi(() => workflowsApi.list(), [], []);
  const { data: catalogPayload } = useApi(() => workflowsApi.catalog(), [], null);
  const createWorkflow = useMutation((payload: Record<string, any>) => workflowsApi.create(payload));
  const updateWorkflow = useMutation((payload: { id: string; body: Record<string, any> }) => workflowsApi.update(payload.id, payload.body));
  const publishWorkflow = useMutation((id: string) => workflowsApi.publish(id));
  const dryRunWorkflow = useMutation((payload: { id: string; body: Record<string, any> }) => workflowsApi.dryRun(payload.id, payload.body));
  const runWorkflow = useMutation((id: string) => workflowsApi.run(id));
  const rollbackWorkflow = useMutation((id: string) => workflowsApi.rollback(id));
  const retryWorkflowRun = useMutation((runId: string) => workflowsApi.retryRun(runId));
  const triggerWorkflowEvent = useMutation((payload: Record<string, any>) => workflowsApi.triggerEvent(payload));
  const loadWorkflowRun = useMutation((runId: string) => workflowsApi.getRun(runId));

  const workflows = useMemo(() => Array.isArray(apiWorkflows) ? apiWorkflows.map(mapWorkflow) : [], [apiWorkflows]);
  const catalog: NodeSpec[] = Array.isArray(catalogPayload?.nodes) ? catalogPayload.nodes : FALLBACK_CATALOG;
  const filters = ['All', ...Array.from(new Set(workflows.map((workflow) => workflow.category)))];
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;

  const filtered = workflows.filter((workflow) => {
    const matchesFilter = activeFilter === 'All' || workflow.category === activeFilter;
    const haystack = `${workflow.name} ${workflow.description} ${workflow.category} ${workflow.status}`.toLowerCase();
    return matchesFilter && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  });

  useEffect(() => {
    if (!focusWorkflowId || workflows.length === 0) return;
    const target = workflows.find((workflow) => workflow.id === focusWorkflowId);
    if (target) void openWorkflow(target);
  }, [focusWorkflowId, workflows.length]);

  function loadBuilderState(workflow: Workflow) {
    const version = workflow.currentVersion ?? {};
    const loadedNodes = normalizeNodes(version.nodes ?? workflow.currentVersion?.nodes ?? []);
    setNodes(loadedNodes.length ? loadedNodes : [makeNode({ type: 'trigger', key: 'manual.run', label: 'Manual run' }, 0)]);
    setEdges(version.edges ?? makeEdges(loadedNodes));
    setSelectedNodeId(loadedNodes[0]?.id ?? null);
    setDryRun(null);
    setRunResult(null);
    setMessage(null);
  }

  async function openWorkflow(workflow: Workflow) {
    const detail = await workflowsApi.get(workflow.id).catch(() => null);
    const hydrated = detail ? mapWorkflow(detail) : workflow;
    setSelectedWorkflow(hydrated);
    loadBuilderState(hydrated);
    setView('builder');
  }

  async function createFromTemplate(template = TEMPLATES[0]) {
    const nextNodes = template.nodes.map((node, index) => makeNode(node, index));
    const created = await createWorkflow.mutate({
      name: template.label,
      description: template.description,
      category: template.category,
      trigger: { type: nextNodes[0]?.key ?? 'manual.run' },
      nodes: nextNodes,
      edges: makeEdges(nextNodes),
    });
    if (created?.id) {
      const workflow = mapWorkflow(created);
      setTemplateOpen(false);
      setSelectedWorkflow(workflow);
      setNodes(nextNodes);
      setEdges(makeEdges(nextNodes));
      setSelectedNodeId(nextNodes[0]?.id ?? null);
      setView('builder');
      setActiveTab('builder');
      setMessage(`Created workflow from ${template.label}.`);
    }
  }

  function addNode(spec: NodeSpec, edgeLabel?: string) {
    const node = makeNode(spec, nodes.length);
    const nextNodes = [...nodes, node];
    const previous = selectedNode ?? nodes[nodes.length - 1];
    setNodes(nextNodes);
    setEdges(previous ? [
      ...edges,
      {
        id: `edge_${previous.id}_${node.id}_${Date.now()}`,
        source: previous.id,
        target: node.id,
        label: edgeLabel ?? (previous.type === 'condition' ? 'true' : 'next'),
      },
    ] : []);
    setSelectedNodeId(node.id);
  }

  function updateSelectedNode(patch: Partial<WorkflowNode>) {
    if (!selectedNode) return;
    setNodes((items) => items.map((node) => node.id === selectedNode.id ? { ...node, ...patch } : node));
  }

  function updateSelectedConfig(key: string, value: string) {
    if (!selectedNode) return;
    updateSelectedNode({ config: { ...selectedNode.config, [key]: value } });
  }

  async function saveWorkflow() {
    if (!selectedWorkflow) return;
    const updated = await updateWorkflow.mutate({
      id: selectedWorkflow.id,
      body: {
        name: selectedWorkflow.name,
        description: selectedWorkflow.description,
        category: selectedWorkflow.category,
        trigger: { type: nodes[0]?.key ?? 'manual.run' },
        nodes,
        edges,
      },
    });
    if (updated?.id) {
      const workflow = mapWorkflow(updated);
      setSelectedWorkflow(workflow);
      setMessage('Workflow draft saved.');
    }
  }

  async function runDryRun() {
    if (!selectedWorkflow) return;
    const result = await dryRunWorkflow.mutate({
      id: selectedWorkflow.id,
      body: { nodes, edges, triggerPayload: { manual: true, source: 'builder' } },
    });
    setDryRun(result);
    setMessage(result?.summary ?? 'Dry-run completed.');
  }

  async function publish() {
    if (!selectedWorkflow) return;
    await saveWorkflow();
    const published = await publishWorkflow.mutate(selectedWorkflow.id);
    if (published?.id) {
      setSelectedWorkflow(mapWorkflow(published));
      setMessage('Workflow published.');
    }
  }

  async function executeManualRun() {
    if (!selectedWorkflow) return;
    const run = await runWorkflow.mutate(selectedWorkflow.id);
    setRunResult(run);
    setMessage(`Workflow run ${run?.id ?? ''} ended as ${run?.status ?? 'unknown'}.`);
  }

  async function retryLatestRun() {
    const runId = runResult?.id ?? selectedWorkflow?.recentRuns?.[0]?.id;
    if (!runId) return;
    const run = await retryWorkflowRun.mutate(runId);
    setRunResult(run);
    setActiveTab('runs');
    setMessage(`Retried workflow run ${run?.id ?? ''}; status ${run?.status ?? 'unknown'}.`);
  }

  async function triggerCurrentEvent() {
    const triggerNode = nodes.find((node) => node.type === 'trigger') ?? nodes[0];
    if (!triggerNode) return;
    const result = await triggerWorkflowEvent.mutate({
      eventType: triggerNode.key,
      payload: {
        workflowId: selectedWorkflow?.id,
        manual: true,
        ...(triggerNode.config ?? {}),
      },
    });
    const latestRun = result?.runs?.[0] ?? null;
    if (latestRun) setRunResult(latestRun);
    setActiveTab('runs');
    setMessage(`Triggered ${result?.matched ?? 0} workflow(s) for ${triggerNode.key}.`);
  }

  async function viewRunSteps(runId: string) {
    const run = await loadWorkflowRun.mutate(runId);
    setRunResult(run);
    setActiveTab('runs');
    setMessage(`Loaded run ${run?.id ?? runId}.`);
  }

  async function rollback() {
    if (!selectedWorkflow) return;
    const rolledBack = await rollbackWorkflow.mutate(selectedWorkflow.id);
    if (rolledBack?.id) {
      setSelectedWorkflow(mapWorkflow(rolledBack));
      setMessage('Workflow rolled back to the previous version.');
    }
  }

  function beginDrag(event: React.MouseEvent, node: WorkflowNode) {
    const target = event.currentTarget as HTMLElement;
    const parent = target.offsetParent as HTMLElement | null;
    const bounds = parent?.getBoundingClientRect();
    setSelectedNodeId(node.id);
    setDraggingNodeId(node.id);
    setDragOffset({
      x: event.clientX - (bounds?.left ?? 0) - node.position.x,
      y: event.clientY - (bounds?.top ?? 0) - node.position.y,
    });
  }

  function moveDraggedNode(event: React.MouseEvent) {
    if (!draggingNodeId) return;
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const nextPosition = {
      x: Math.max(32, event.clientX - bounds.left - dragOffset.x),
      y: Math.max(32, event.clientY - bounds.top - dragOffset.y),
    };
    setNodes((items) => items.map((node) => node.id === draggingNodeId ? { ...node, position: nextPosition } : node));
  }

  if (loading && workflows.length === 0) {
    return <LoadingState title="Loading workflows" message="Fetching workflow definitions from Supabase." />;
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        <AnimatePresence mode="wait">
          {view === 'list' ? (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 pb-0">
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-card-dark shadow-card">
                  <div className="px-6 py-4 flex items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Workflows</h1>
                      <p className="text-xs text-gray-500 mt-1">Build operational automations for agents, cases, orders, refunds, returns, approvals, policies, and integrations.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workflows..." className="w-64 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 dark:border-gray-700 dark:bg-gray-800" />
                      <button onClick={() => setTemplateOpen(true)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Templates</button>
                      <button onClick={() => createFromTemplate(TEMPLATES[0])} className="rounded-lg bg-black px-4 py-2 text-sm font-bold text-white shadow-card hover:opacity-90 dark:bg-white dark:text-black">New workflow</button>
                    </div>
                  </div>
                  <div className="px-6 flex items-center gap-6 border-t border-gray-100 dark:border-gray-800">
                    {filters.map((filter) => (
                      <button key={filter} onClick={() => setActiveFilter(filter)} className={`py-3 text-sm border-b-2 ${activeFilter === filter ? 'border-black font-bold text-gray-900 dark:border-white dark:text-white' : 'border-transparent font-medium text-gray-500'}`}>{filter}</button>
                    ))}
                  </div>
                </div>
              </div>

              {(error || createWorkflow.error) && (
                <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{createWorkflow.error || error}</div>
              )}

              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  {filtered.map((workflow) => (
                    <button key={workflow.id} onClick={() => void openWorkflow(workflow)} className="text-left rounded-2xl border border-gray-200 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-card-dark">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">{workflow.category}</div>
                          <h3 className="font-bold text-gray-900 dark:text-white">{workflow.name}</h3>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${workflow.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{workflow.status}</span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{workflow.description}</p>
                      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                        {workflow.metrics.map((metric) => (
                          <div key={metric.label}>
                            <div className="text-sm font-bold text-gray-900 dark:text-white">{metric.value}{metric.suffix}</div>
                            <div className="text-[10px] text-gray-400">{metric.label}</div>
                          </div>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="builder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-6 pb-0 flex-shrink-0 z-20 bg-white dark:bg-card-dark">
                <div className="rounded-xl border border-gray-200 bg-white shadow-card dark:border-gray-700 dark:bg-card-dark">
                  <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <button onClick={() => setView('list')} className="text-sm font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white">Workflows</button>
                  <span className="text-gray-300">/</span>
                  <input value={selectedWorkflow?.name ?? ''} onChange={(event) => setSelectedWorkflow((workflow) => workflow ? { ...workflow, name: event.target.value } : workflow)} className="min-w-[260px] bg-transparent text-sm font-bold text-gray-900 outline-none dark:text-white" />
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase text-gray-500">{selectedWorkflow?.currentVersion?.status ?? 'draft'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={runDryRun} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">Dry-run</button>
                  <button onClick={executeManualRun} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">Run</button>
                  <button onClick={triggerCurrentEvent} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">Trigger event</button>
                  <button onClick={retryLatestRun} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">Retry</button>
                  <button onClick={rollback} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">Rollback</button>
                  <button onClick={saveWorkflow} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:opacity-90">Save</button>
                  <button onClick={publish} className="rounded-lg bg-black px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 dark:bg-white dark:text-black">Publish</button>
                </div>
                  </div>
                  <div className="px-6 flex items-center space-x-8 border-t border-gray-100 dark:border-gray-800 pt-3">
                    {[
                      { id: 'overview', label: 'Overview' },
                      { id: 'builder', label: 'Builder' },
                      { id: 'runs', label: 'Runs' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as WorkflowTab)}
                        className={`pb-3 text-sm transition-colors border-b-2 ${
                          activeTab === tab.id
                            ? 'font-bold text-gray-900 dark:text-white border-black dark:border-white'
                            : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {(message || updateWorkflow.error || publishWorkflow.error || dryRunWorkflow.error || runWorkflow.error || rollbackWorkflow.error || retryWorkflowRun.error || triggerWorkflowEvent.error || loadWorkflowRun.error) && (
                <div className="border-b border-gray-100 px-5 py-2 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-300">
                  {updateWorkflow.error || publishWorkflow.error || dryRunWorkflow.error || runWorkflow.error || rollbackWorkflow.error || retryWorkflowRun.error || triggerWorkflowEvent.error || loadWorkflowRun.error || message}
                </div>
              )}

              {activeTab === 'overview' && (
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="grid gap-6 xl:grid-cols-12">
                    <div className="xl:col-span-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-card-dark">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Workflow purpose</div>
                      <textarea
                        value={selectedWorkflow?.description ?? ''}
                        onChange={(event) => setSelectedWorkflow((workflow) => workflow ? { ...workflow, description: event.target.value } : workflow)}
                        className="mt-3 min-h-32 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-black/10 dark:border-gray-700 dark:bg-gray-800"
                      />
                      <div className="mt-6 grid gap-3 md:grid-cols-3">
                        {selectedWorkflow?.metrics.map((metric) => (
                          <div key={metric.label} className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                            <div className="text-xl font-bold text-gray-900 dark:text-white">{metric.value}</div>
                            <div className="mt-1 text-xs text-gray-500">{metric.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="xl:col-span-4 space-y-4">
                      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-card-dark">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Validation</div>
                        <div className="mt-3 space-y-2 text-sm">
                          <div className="flex items-center justify-between"><span>Nodes</span><b>{nodes.length}</b></div>
                          <div className="flex items-center justify-between"><span>Connections</span><b>{edges.length}</b></div>
                          <div className="flex items-center justify-between"><span>Sensitive actions</span><b>{nodes.filter((node) => ['payment.refund', 'order.cancel'].includes(node.key)).length}</b></div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-card-dark">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Latest result</div>
                        <div className="mt-3 text-sm font-bold text-gray-900 dark:text-white">{runResult?.status ?? dryRun?.summary ?? 'No execution yet'}</div>
                        {runResult?.error && <div className="mt-2 text-xs text-red-600">{runResult.error}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'builder' && (
              <div className="flex-1 flex overflow-hidden p-6 pt-4">
                <aside className="w-72 border-r border-gray-200 bg-gray-50/70 p-4 overflow-y-auto dark:border-gray-800 dark:bg-gray-900/20">
                  <div className="mb-4">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Node library</div>
                    <p className="mt-1 text-xs text-gray-500">Add CRM-AI nodes to build the operation.</p>
                  </div>
                  {Array.from(new Set(catalog.map((item) => item.category))).map((category) => (
                    <div key={category} className="mb-5">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">{category}</div>
                      <div className="space-y-1">
                        {catalog.filter((item) => item.category === category).map((spec) => (
                          <button key={spec.key} onClick={() => addNode(spec)} className="w-full rounded-xl border border-transparent p-2 text-left transition hover:border-gray-200 hover:bg-white hover:shadow-sm dark:hover:border-gray-700 dark:hover:bg-gray-800">
                            <div className="flex items-center gap-3">
                              <span className={`material-symbols-outlined rounded-lg border-l-2 p-1.5 text-base ${nodeTone(spec.type)}`}>{spec.icon}</span>
                              <div className="min-w-0">
                                <div className="truncate text-xs font-bold text-gray-800 dark:text-gray-100">{spec.label}</div>
                                <div className="text-[10px] text-gray-400">{spec.key}</div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </aside>

                <main
                  className="relative flex-1 overflow-auto bg-[#f6f7f9] dark:bg-[#101113] rounded-2xl border border-gray-200 dark:border-gray-800"
                  onMouseMove={moveDraggedNode}
                  onMouseUp={() => setDraggingNodeId(null)}
                  onMouseLeave={() => setDraggingNodeId(null)}
                >
                  <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(circle, rgba(100,116,139,.25) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                  <div className="relative min-h-[900px] min-w-[1200px]">
                    <svg className="absolute inset-0 h-full w-full pointer-events-none">
                      {edges.map((edge) => {
                        const source = nodes.find((node) => node.id === edge.source);
                        const target = nodes.find((node) => node.id === edge.target);
                        if (!source || !target) return null;
                        const x1 = source.position.x + 210;
                        const y1 = source.position.y + 48;
                        const x2 = target.position.x;
                        const y2 = target.position.y + 48;
                        const labelX = (x1 + x2) / 2;
                        const labelY = (y1 + y2) / 2 - 8;
                        return (
                          <g key={edge.id}>
                            <path d={`M ${x1} ${y1} C ${x1 + 80} ${y1}, ${x2 - 80} ${y2}, ${x2} ${y2}`} stroke="#94a3b8" strokeWidth="2" fill="none" />
                            {edge.label && (
                              <>
                                <rect x={labelX - 20} y={labelY - 10} width="40" height="18" rx="9" fill="white" stroke="#e2e8f0" />
                                <text x={labelX} y={labelY + 3} textAnchor="middle" className="fill-slate-500 text-[10px] font-bold uppercase">{edge.label}</text>
                              </>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                    {nodes.map((node) => (
                      <button
                        key={node.id}
                        onClick={() => setSelectedNodeId(node.id)}
                        onMouseDown={(event) => beginDrag(event, node)}
                        style={{ left: node.position.x, top: node.position.y }}
                        className={`absolute w-56 rounded-2xl border bg-white p-4 text-left shadow-card transition hover:shadow-lg dark:bg-card-dark ${selectedNodeId === node.id ? 'ring-2 ring-black dark:ring-white' : 'border-gray-200 dark:border-gray-800'}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`material-symbols-outlined rounded-xl border-l-4 p-2 ${nodeTone(node.type)}`}>
                            {catalog.find((spec) => spec.key === node.key)?.icon ?? 'settings'}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-gray-900 dark:text-white">{node.label}</div>
                            <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">{node.type} - {node.key}</div>
                          </div>
                        </div>
                        {Object.keys(node.config).length > 0 && (
                          <div className="mt-3 rounded-lg bg-gray-50 px-2 py-1 text-[10px] text-gray-500 dark:bg-gray-800">
                            {Object.keys(node.config).length} config field(s)
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </main>

                <aside className="w-96 border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-card-dark flex flex-col rounded-r-2xl">
                  <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Inspector</div>
                    <div className="mt-1 text-sm font-bold text-gray-900 dark:text-white">{selectedNode?.label ?? 'Select a node'}</div>
                  </div>
                  {selectedNode ? (
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      <label className="block">
                        <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Label</span>
                        <input value={selectedNode.label} onChange={(event) => updateSelectedNode({ label: event.target.value })} className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Node key</span>
                        <select value={selectedNode.key} onChange={(event) => {
                          const spec = catalog.find((item) => item.key === event.target.value);
                          if (spec) updateSelectedNode({ key: spec.key, type: spec.type, label: spec.label });
                        }} className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800">
                          {catalog.map((spec) => <option key={spec.key} value={spec.key}>{spec.label}</option>)}
                        </select>
                      </label>
                      {['field', 'operator', 'value', 'amount', 'reason', 'agent', 'policy', 'connector', 'content', 'queue'].map((field) => (
                        <label key={field} className="block">
                          <span className="text-xs font-bold capitalize text-gray-600 dark:text-gray-300">{field}</span>
                          <input value={selectedNode.config[field] ?? ''} onChange={(event) => updateSelectedConfig(field, event.target.value)} placeholder={`{{${field}}}`} className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800" />
                        </label>
                      ))}
                      <div className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Outgoing paths</div>
                        {edges.filter((edge) => edge.source === selectedNode.id).map((edge) => (
                          <div key={edge.id} className="mb-2 flex items-center gap-2 last:mb-0">
                            <select
                              value={edge.label ?? 'next'}
                              onChange={(event) => setEdges((items) => items.map((item) => item.id === edge.id ? { ...item, label: event.target.value } : item))}
                              className="w-28 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs outline-none dark:border-gray-700 dark:bg-gray-800"
                            >
                              <option value="next">next</option>
                              <option value="true">true</option>
                              <option value="false">false</option>
                              <option value="success">success</option>
                            </select>
                            <span className="truncate text-xs text-gray-500">
                              to {nodes.find((node) => node.id === edge.target)?.label ?? edge.target}
                            </span>
                          </div>
                        ))}
                        {selectedNode.type === 'condition' && (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              onClick={() => {
                                const spec = catalog.find((item) => item.key === 'approval.create') ?? catalog[0];
                                addNode(spec, 'true');
                              }}
                              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-bold hover:bg-gray-50 dark:border-gray-700"
                            >
                              Add true
                            </button>
                            <button
                              onClick={() => {
                                const spec = catalog.find((item) => item.key === 'case.note') ?? catalog[0];
                                addNode(spec, 'false');
                              }}
                              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-bold hover:bg-gray-50 dark:border-gray-700"
                            >
                              Add false
                            </button>
                          </div>
                        )}
                        {!edges.some((edge) => edge.source === selectedNode.id) && (
                          <div className="text-xs text-gray-400">No outgoing path yet.</div>
                        )}
                      </div>
                      <button onClick={() => {
                        setNodes((items) => items.filter((node) => node.id !== selectedNode.id));
                        setEdges((items) => items.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
                        setSelectedNodeId(null);
                      }} className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Delete node</button>
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-gray-500">Choose a node in the canvas to configure it.</div>
                  )}
                  <div className="border-t border-gray-100 p-4 dark:border-gray-800">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Dry-run / Timeline</div>
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {(dryRun?.steps ?? selectedWorkflow?.recentRuns ?? []).slice(0, 8).map((step: any, index: number) => (
                        <div key={step.id ?? step.nodeId ?? index} className="rounded-lg border border-gray-100 p-2 text-xs dark:border-gray-800">
                          <div className="font-bold text-gray-900 dark:text-white">{step.label ?? step.node_id ?? step.status}</div>
                          <div className="text-gray-400">{step.status ?? step.started_at ?? 'pending'}</div>
                        </div>
                      ))}
                      {!dryRun && !selectedWorkflow?.recentRuns?.length && <div className="text-xs text-gray-400">No runs yet.</div>}
                    </div>
                  </div>
                </aside>
              </div>
              )}

              {activeTab === 'runs' && (
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-card-dark">
                    <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white">Execution timeline</h3>
                        <p className="mt-1 text-xs text-gray-500">Dry-runs, real runs, waiting approvals and node-level status.</p>
                      </div>
                      <button
                        onClick={retryLatestRun}
                        disabled={!(runResult?.id ?? selectedWorkflow?.recentRuns?.[0]?.id)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        Retry latest
                      </button>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {(runResult?.steps ?? dryRun?.steps ?? selectedWorkflow?.recentRuns ?? []).map((step: any, index: number) => (
                        <div key={step.id ?? step.nodeId ?? index} className="grid grid-cols-12 gap-4 px-6 py-4 text-sm">
                          <div className="col-span-5 font-bold text-gray-900 dark:text-white">{step.label ?? step.node_id ?? `Step ${index + 1}`}</div>
                          <div className="col-span-3 text-gray-500">{step.node_type ?? step.type ?? step.key ?? 'workflow'}</div>
                          <div className="col-span-2">
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase text-gray-600">{step.status}</span>
                          </div>
                          <div className="col-span-2 text-right text-gray-400">
                            {step.steps === undefined && step.workflow_version_id ? (
                              <button onClick={() => viewRunSteps(step.id)} className="text-xs font-bold text-gray-700 underline-offset-2 hover:underline dark:text-gray-200">
                                View steps
                              </button>
                            ) : (
                              step.error ?? step.output?.reason ?? step.started_at ?? ''
                            )}
                          </div>
                        </div>
                      ))}
                      {!(runResult?.steps ?? dryRun?.steps ?? selectedWorkflow?.recentRuns ?? []).length && (
                        <div className="px-6 py-10 text-sm text-gray-500">No workflow runs yet. Run a dry-run or execute the published workflow.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {templateOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-card-dark">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Workflow templates</h3>
                    <p className="text-sm text-gray-500">Start from an operational pattern built for CRM-AI.</p>
                  </div>
                  <button onClick={() => setTemplateOpen(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {TEMPLATES.map((template) => (
                    <button key={template.id} onClick={() => createFromTemplate(template)} className="rounded-xl border border-gray-200 p-4 text-left transition hover:border-black hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">{template.category}</div>
                      <div className="font-bold text-gray-900 dark:text-white">{template.label}</div>
                      <div className="mt-2 text-xs leading-relaxed text-gray-500">{template.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
