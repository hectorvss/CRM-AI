import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { workflowsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import type { NavigateFn } from '../types';
import LoadingState from './LoadingState';

type WorkflowView = 'list' | 'builder' | 'new';

interface WorkflowsProps {
  onNavigate?: NavigateFn;
  focusWorkflowId?: string | null;
}

interface Workflow {
  id: string;
  name: string;
  category: string;
  description: string;
  enabled: boolean;
  metrics: {
    label: string;
    value: string;
    suffix?: string;
  }[];
  lastRun: string;
  lastEdited: string;
  status?: 'needs_setup' | 'blocked' | 'active' | 'warning' | 'dependency_missing';
  statusMessage?: string;
}

const mockWorkflows: Workflow[] = [
  {
    id: '1',
    name: 'Auto-approve low-value refunds',
    category: 'Refunds',
    description: 'Automatically approve refunds below the configured threshold when no dispute, conflict, or policy restriction exists.',
    enabled: true,
    metrics: [
      { label: 'Cases processed', value: '1,204', suffix: '/mo' },
      { label: 'Avg time saved', value: '45s', suffix: '/case' },
      { label: 'Manual reviews avoided', value: '850' }
    ],
    lastRun: '4m ago',
    lastEdited: 'Yesterday by Alex',
    status: 'active'
  },
  {
    id: '2',
    name: 'Block cancellation after packing',
    category: 'Orders',
    description: 'Prevent automatic cancellation once WMS status is packed or a shipping label has already been created.',
    enabled: true,
    metrics: [
      { label: 'Conflicts prevented', value: '142' },
      { label: 'Execution success rate', value: '99.8%' },
      { label: 'Manual reviews avoided', value: '320' }
    ],
    lastRun: '12m ago',
    lastEdited: '2d ago by Sarah',
    status: 'dependency_missing',
    statusMessage: 'WMS mapping incomplete'
  },
  {
    id: '3',
    name: 'Trigger refund after return received',
    category: 'Returns',
    description: 'Issue refund automatically once the return is marked as received and validated according to policy.',
    enabled: true,
    metrics: [
      { label: 'Cases processed', value: '890', suffix: '/mo' },
      { label: 'Avg time saved', value: '2m 10s', suffix: '/case' },
      { label: 'Execution success rate', value: '94%' }
    ],
    lastRun: 'Failed 2m ago',
    lastEdited: '5h ago by Mike',
    status: 'blocked',
    statusMessage: 'PSP connection lost'
  },
  {
    id: '4',
    name: 'Flag duplicate refund risk',
    category: 'Conflicts',
    description: 'Detect possible duplicate refund attempts across OMS and PSP and route them for review.',
    enabled: false,
    metrics: [
      { label: 'Conflicts prevented', value: '0' },
      { label: 'Manual reviews avoided', value: '0' },
      { label: 'Cases triggered', value: '0', suffix: '/mo' }
    ],
    lastRun: 'Never',
    lastEdited: '1w ago by Sam',
    status: 'needs_setup',
    statusMessage: 'OMS sync unavailable'
  },
  {
    id: '5',
    name: 'Escalate payment conflict to finance',
    category: 'Escalations',
    description: 'Route refund and chargeback mismatches to Finance for manual review.',
    enabled: true,
    metrics: [
      { label: 'Conflicts prevented', value: '45' },
      { label: 'Approvals triggered', value: '12' },
      { label: 'Avg time saved', value: '15m', suffix: '/case' }
    ],
    lastRun: '1m ago',
    lastEdited: '3d ago by Alex',
    status: 'warning',
    statusMessage: 'Approval policy not configured'
  },
  {
    id: '6',
    name: 'Detect OMS vs PSP mismatch',
    category: 'Conflicts',
    description: 'Create a conflict case when order and payment statuses do not match across systems.',
    enabled: true,
    metrics: [
      { label: 'Conflicts prevented', value: '210' },
      { label: 'Cases triggered', value: '45', suffix: '/mo' },
      { label: 'Manual reviews avoided', value: '180' }
    ],
    lastRun: '10m ago',
    lastEdited: '1d ago by Sarah',
    status: 'active'
  },
  {
    id: '7',
    name: 'Route warehouse intervention',
    category: 'Orders',
    description: 'Create an operational intervention when a customer change request arrives after fulfillment has started.',
    enabled: true,
    metrics: [
      { label: 'Cases processed', value: '340', suffix: '/mo' },
      { label: 'Avg time saved', value: '5m', suffix: '/case' },
      { label: 'Conflicts prevented', value: '88' }
    ],
    lastRun: '1h ago',
    lastEdited: '4d ago by Mike',
    status: 'active'
  },
  {
    id: '8',
    name: 'Require approval for high-value refund',
    category: 'Approvals',
    description: 'Send refunds above the configured threshold to manual approval before execution.',
    enabled: true,
    metrics: [
      { label: 'Approvals triggered', value: '56' },
      { label: 'Manual reviews avoided', value: '120' },
      { label: 'Execution success rate', value: '100%' }
    ],
    lastRun: '30m ago',
    lastEdited: '2h ago by Alex',
    status: 'active'
  }
];

const TEMPLATE_LIBRARY = [
  {
    id: 'refund_auto_approval',
    label: 'Refund Auto-Approval',
    description: 'Approve low-risk refunds below the threshold and route anything suspicious to manual review.',
    category: 'Refunds',
  },
  {
    id: 'cancel_packing_guard',
    label: 'Packing Guard',
    description: 'Block cancellations once the order is packed or a label has been generated.',
    category: 'Orders',
  },
  {
    id: 'approval_escalation',
    label: 'Approval Escalation',
    description: 'Route high-value or high-risk actions to approval before execution.',
    category: 'Approvals',
  },
] as const;

export default function Workflows({ onNavigate: _onNavigate, focusWorkflowId }: WorkflowsProps) {
  void _onNavigate;
  const [view, setView] = useState<WorkflowView>('list');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [rightTab, setRightTab] = useState<'details' | 'copilot'>('details');
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<string | null>(null);

  const filters = ['All', 'Orders', 'Refunds', 'Returns', 'Approvals', 'Conflicts', 'Escalations'];

  // Fetch from API, fallback to static
  const { data: apiWorkflows, loading: workflowsLoading, error: workflowsError } = useApi(() => workflowsApi.list(), [], []);
  const createWorkflow = useMutation((payload: Record<string, any>) => workflowsApi.create(payload));
  const updateWorkflow = useMutation((payload: { id: string; body: Record<string, any> }) => workflowsApi.update(payload.id, payload.body));
  const publishWorkflow = useMutation((id: string) => workflowsApi.publish(id));

  const mapApiWorkflow = (w: any): Workflow => ({
    id: w.id,
    name: w.name,
    category: w.category || 'General',
    description: w.description || '',
    enabled: w.is_enabled !== false,
    metrics: [
      { label: 'Cases processed', value: String(w.metrics?.executions || 0) },
      { label: 'Execution success rate', value: w.metrics?.success_rate ? `${w.metrics.success_rate}%` : 'N/A' },
      { label: 'Avg time saved', value: w.metrics?.avg_time_saved || 'N/A' },
    ],
    lastRun: w.last_run_at ? new Date(w.last_run_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Never',
    lastEdited: w.updated_at ? new Date(w.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-',
    status: (w.health_status === 'blocked' || w.health_status === 'warning' || w.health_status === 'needs_setup' || w.health_status === 'dependency_missing') ? w.health_status : 'active',
    statusMessage: w.health_message || undefined,
  });

  const workflows = Array.isArray(apiWorkflows) ? apiWorkflows.map(mapApiWorkflow) : [];

  useEffect(() => {
    if (!focusWorkflowId || workflows.length === 0) return;
    const target = workflows.find((workflow) => workflow.id === focusWorkflowId);
    if (!target) return;
    if (selectedWorkflow?.id !== target.id || view !== 'builder') {
      setSelectedWorkflow(target);
      setView('builder');
    }
  }, [focusWorkflowId, selectedWorkflow?.id, view, workflows]);

  if (workflowsLoading && workflows.length === 0) {
    return <LoadingState title="Loading workflows" message="Fetching live workflow definitions from Supabase." />;
  }

  const handleWorkflowClick = (wf: Workflow) => {
    setActionMessage(null);
    setDryRunResult(null);
    setSelectedWorkflow(wf);
    setView('builder');
  };

  const handleBrowseTemplates = () => {
    setIsTemplatePickerOpen(true);
  };

  const handleNewWorkflow = async () => {
    setActionMessage(null);
    setDryRunResult(null);
    const created = await createWorkflow.mutate({
      name: 'New workflow draft',
      description: 'Draft workflow created from template',
      trigger: { type: 'manual' },
      nodes: [{ id: 'start', type: 'trigger', label: 'Start' }],
      edges: [],
    });
    if (created?.id) {
      const mapped = mapApiWorkflow(created);
      setSelectedWorkflow(mapped);
      setView('builder');
    } else {
      setSelectedWorkflow(null);
      setView('new');
    }
  };

  const createFromTemplate = async (templateId: typeof TEMPLATE_LIBRARY[number]['id']) => {
    const template = TEMPLATE_LIBRARY.find((item) => item.id === templateId);
    if (!template) return;
    setActionMessage(null);
    setDryRunResult(null);
    setIsTemplatePickerOpen(false);
    const created = await createWorkflow.mutate({
      name: template.label,
      description: template.description,
      category: template.category,
      trigger: { type: 'manual' },
      nodes: [
        { id: 'start', type: 'trigger', label: 'Start' },
        { id: 'guard', type: 'condition', label: template.category },
      ],
      edges: [{ id: 'edge_1', source: 'start', target: 'guard' }],
    });
    if (created?.id) {
      setSelectedWorkflow(mapApiWorkflow(created));
      setView('builder');
      setActionMessage(`Template created: ${template.label}`);
    }
  };

  const handleSaveWorkflow = async () => {
    if (!selectedWorkflow?.id) return;
    const updated = await updateWorkflow.mutate({
      id: selectedWorkflow.id,
      body: {
        name: selectedWorkflow.name,
        description: selectedWorkflow.description,
        trigger: { type: selectedWorkflow.category.toLowerCase() || 'manual' },
        nodes: [
          { id: 'start', type: 'trigger', label: selectedWorkflow.category || 'Trigger' },
          { id: 'action', type: 'action', label: selectedWorkflow.name },
        ],
        edges: [{ id: 'edge_1', source: 'start', target: 'action' }],
      },
    });
    if (updated?.id) {
      setSelectedWorkflow(mapApiWorkflow(updated));
    }
  };

  const handleFixDependencies = () => {
    const problematic = workflows.find((wf) => wf.status === 'dependency_missing' || wf.status === 'blocked' || wf.status === 'warning');
    if (!problematic) {
      setActionMessage('No dependency issues found right now.');
      return;
    }
    setSelectedWorkflow(problematic);
    setView('builder');
    setRightTab('details');
    setActionMessage(`Opened ${problematic.name} for dependency review.`);
  };

  const handleRunDryRun = () => {
    if (!selectedWorkflow) {
      setDryRunResult('Select a workflow first.');
      return;
    }
    const hasIssue = selectedWorkflow.status === 'blocked' || selectedWorkflow.status === 'dependency_missing';
    const result = hasIssue
      ? `Dry-run detected a blocker in ${selectedWorkflow.name}: ${selectedWorkflow.statusMessage || 'dependency issue'}`
      : `Dry-run passed for ${selectedWorkflow.name}. No blocking conditions detected.`;
    setDryRunResult(result);
    setActionMessage(result);
  };

  const handleApplyToComposer = async () => {
    if (!selectedWorkflow?.id) {
      setActionMessage('Select a workflow first.');
      return;
    }
    const updatedDescription = `${selectedWorkflow.description}\n\nComposer note: optimize this workflow for operational guardrails and faster reviews.`;
    const updated = await updateWorkflow.mutate({
      id: selectedWorkflow.id,
      body: {
        name: selectedWorkflow.name,
        description: updatedDescription,
        trigger: { type: selectedWorkflow.category.toLowerCase() || 'manual' },
        nodes: [
          { id: 'start', type: 'trigger', label: 'Start' },
          { id: 'composer', type: 'action', label: 'Composer note applied' },
        ],
        edges: [{ id: 'edge_1', source: 'start', target: 'composer' }],
      },
    });
    if (updated?.id) {
      setSelectedWorkflow(mapApiWorkflow(updated));
      setActionMessage(`Composer note applied to ${selectedWorkflow.name}`);
    }
  };

  const handlePublishWorkflow = async () => {
    if (!selectedWorkflow?.id) return;
    await handleSaveWorkflow();
    const published = await publishWorkflow.mutate(selectedWorkflow.id);
    if (published?.id) {
      setSelectedWorkflow(mapApiWorkflow(published));
    }
  };

  const filteredWorkflows = workflows.filter(wf => 
    (activeFilter === 'All' || wf.category === activeFilter) &&
    (
      searchQuery.trim() === '' ||
      `${wf.name} ${wf.description} ${wf.category} ${wf.status}`.toLowerCase().includes(searchQuery.trim().toLowerCase())
    )
  );

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        <AnimatePresence mode="wait">
        {view === 'list' ? (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 pb-0 flex-shrink-0 z-20">
              <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card">
                <div className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Workflows</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Operational workflows to coordinate orders, refunds, returns, approvals, and system conflicts safely.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative w-64 mr-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span>
                      <input 
                        type="text" 
                        placeholder="Search workflows..." 
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-all"
                      />
                    </div>
                    <button onClick={handleBrowseTemplates} className="px-4 py-2 text-sm font-bold text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800/60 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700">
                      Browse templates
                    </button>
                    <button 
                      onClick={handleNewWorkflow}
                      className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:opacity-90 transition-opacity shadow-card flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-lg">add</span>
                      New from template
                    </button>
                  </div>
                </div>
                <div className="px-6 flex items-center space-x-8 border-t border-gray-100 dark:border-gray-800 pt-3">
                  {filters.map(filter => (
                    <button
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      className={`pb-3 text-sm transition-colors border-b-2 ${
                        activeFilter === filter
                          ? 'font-bold text-gray-900 dark:text-white border-black dark:border-white'
                          : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {(workflowsError || createWorkflow.error || updateWorkflow.error || publishWorkflow.error) && (
              <div className="px-6 mt-4">
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-card dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-lg mt-0.5">error</span>
                    <div className="min-w-0">
                      <div className="font-semibold">Workflow action unavailable</div>
                      <div className="text-xs opacity-90">{publishWorkflow.error || updateWorkflow.error || createWorkflow.error || workflowsError}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {actionMessage && (
              <div className="px-6 mt-4">
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 shadow-card dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-lg mt-0.5">info</span>
                    <div className="min-w-0">
                      <div className="font-semibold">Workflow action status</div>
                      <div className="text-xs opacity-90">{actionMessage}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* List Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                <div className="xl:col-span-9 space-y-4">
                  {filteredWorkflows.map((wf) => (
                    <div 
                      key={wf.id}
                      onClick={() => handleWorkflowClick(wf)}
                      className="group bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-card hover:shadow-md transition-all cursor-pointer relative"
                    >
                      <div className="flex items-start justify-between pr-10">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-bold text-gray-900 dark:text-white">{wf.name}</h3>
                            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider rounded">
                              {wf.category}
                            </span>
                            {wf.status === 'needs_setup' && (
                              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800/30 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                <span className="text-[10px] font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider">Needs setup</span>
                                <span className="text-[10px] text-orange-500 ml-1">{wf.statusMessage}</span>
                              </div>
                            )}
                            {wf.status === 'dependency_missing' && (
                              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Dependency missing</span>
                                <span className="text-[10px] text-amber-500 ml-1">{wf.statusMessage}</span>
                              </div>
                            )}
                            {wf.status === 'warning' && (
                              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800/30 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                                <span className="text-[10px] font-bold text-yellow-700 dark:text-yellow-400 uppercase tracking-wider">Warning</span>
                                <span className="text-[10px] text-yellow-500 ml-1">{wf.statusMessage}</span>
                              </div>
                            )}
                            {wf.status === 'blocked' && (
                              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                <span className="text-[10px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">Blocked</span>
                                <span className="text-[10px] text-red-500 ml-1">{wf.statusMessage}</span>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{wf.description}</p>
                        </div>
                        <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                          <div className={`w-10 h-5 rounded-full relative transition-colors ${wf.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${wf.enabled ? 'right-0.5' : 'left-0.5'}`}></div>
                          </div>
                        </div>
                      </div>
                      
                      <span className="absolute right-6 top-7 material-symbols-outlined text-gray-300 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors">chevron_right</span>

                      <div className="mt-6 pt-6 border-t border-gray-50 dark:border-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-8">
                          {wf.metrics.map((metric, idx) => (
                            <div key={idx}>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{metric.label}</p>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">
                                {metric.value} {metric.suffix && <span className="text-xs font-normal text-gray-400">{metric.suffix}</span>}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-400">Last run: {wf.lastRun}</p>
                          <p className="text-[10px] text-gray-400">Last edited: {wf.lastEdited}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Automation Health Sidebar */}
                <div className="xl:col-span-3">
                  <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-card sticky top-8">
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Workflow Health</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Automation layer is partially healthy.</p>
                      </div>
                      
                      <div className="pt-4 border-t border-gray-50 dark:border-gray-800">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Main Metric</p>
                        <div className="flex items-end gap-2">
                          <span className="text-2xl font-bold text-gray-900 dark:text-white">92%</span>
                          <span className="text-xs text-gray-500 mb-1">Execution success rate</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1 mt-3 overflow-hidden">
                          <div className="bg-green-500 h-full rounded-full" style={{ width: '92%' }}></div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-gray-50 dark:border-gray-800">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Top Issue</p>
                        <div className="flex items-start gap-3 mb-4">
                          <span className="material-symbols-outlined text-amber-500 text-lg">warning</span>
                          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                            2 workflows blocked due to PSP mapping mismatch
                          </p>
                        </div>
                        {dryRunResult && (
                          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                            {dryRunResult}
                          </div>
                        )}
                        <button onClick={handleFixDependencies} className="w-full py-2 bg-white dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold shadow-card hover:bg-gray-50 dark:hover:bg-gray-700">
                          Fix dependencies
                        </button>
                      </div>

                      <div className="pt-4 border-t border-gray-50 dark:border-gray-800 flex justify-between items-center">
                        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Last run</span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">4m ago</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="builder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Builder Header */}
            <div className="px-6 py-4 bg-white dark:bg-card-dark border-b border-gray-200 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setView('list')}
                  className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  Workflows
                </button>
                <span className="text-gray-300 dark:text-gray-700">/</span>
                <h1 className="text-sm font-bold text-gray-900 dark:text-white">
                  {view === 'new' ? 'New Automation' : selectedWorkflow?.name}
                </h1>
                <div className={`flex items-center gap-2 ml-4 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  view === 'new' 
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/30'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${view === 'new' ? 'bg-amber-400' : 'bg-green-500'}`}></div>
                  {view === 'new' ? 'Draft' : 'Active'}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleRunDryRun} className="px-4 py-1.5 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800/60 border border-gray-300 dark:border-gray-600 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 shadow-card hover:bg-gray-50 dark:hover:bg-gray-700">
                  <span className="material-symbols-outlined text-sm">play_arrow</span>
                  Run dry-run
                </button>
                <button
                  onClick={handleSaveWorkflow}
                  className="px-5 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 text-xs font-bold rounded-lg hover:opacity-90 transition-opacity shadow-card"
                >
                  Save
                </button>
                <button
                  onClick={handlePublishWorkflow}
                  className="px-5 py-1.5 bg-black dark:bg-white text-white dark:text-black text-xs font-bold rounded-lg hover:opacity-90 transition-opacity shadow-card"
                >
                  Publish
                </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Canvas Area */}
              <div className="flex-1 relative bg-[#F3F4F6] dark:bg-[#111111] overflow-hidden">
                <div className="absolute inset-0 canvas-bg opacity-50"></div>
                
                {/* Canvas Controls */}
                <div className="absolute bottom-6 left-6 flex items-center bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-1 z-10">
                  <button className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <span className="material-symbols-outlined text-lg">fit_screen</span>
                  </button>
                  <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                  <button className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <span className="material-symbols-outlined text-lg">remove</span>
                  </button>
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300 px-3 min-w-[3.5rem] text-center">100%</span>
                  <button className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <span className="material-symbols-outlined text-lg">add</span>
                  </button>
                </div>

                {/* Sidebar Toggle */}
                <div className="absolute top-6 right-6 z-10">
                  {!isRightSidebarOpen && (
                    <button 
                      onClick={() => setIsRightSidebarOpen(true)}
                      className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-all"
                      title="Show Sidebar"
                    >
                      <span className="material-symbols-outlined">view_sidebar</span>
                    </button>
                  )}
                </div>

                {/* Minimap */}
                <div className="absolute bottom-6 right-6 w-40 h-28 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-10 p-2 opacity-80 hover:opacity-100 transition-opacity overflow-hidden">
                  <div className="w-full h-full bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-10 border-2 border-indigo-500 bg-indigo-500/10 rounded-md"></div>
                  </div>
                </div>

                {/* Nodes Container */}
                <div className="absolute inset-0 overflow-auto p-20 flex items-center justify-center">
                  <div className="relative flex items-center gap-32">
                    {view === 'new' ? (
                      <>
                        <div className="w-48 bg-white dark:bg-card-dark rounded-2xl border-l-4 border-black dark:border-white border-t border-r border-b border-gray-200 dark:border-gray-800 p-5 shadow-xl flex flex-col items-center text-center">
                          <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white flex items-center justify-center mb-3">
                            <span className="material-symbols-outlined text-2xl">flag</span>
                          </div>
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white">Start</h4>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 uppercase font-bold tracking-widest">Manual Trigger</p>
                        </div>
                        <div className="w-48 h-32 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center justify-center text-center opacity-50">
                          <p className="text-xs font-bold text-gray-400">Add next step</p>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col gap-20">
                        {/* Example flow nodes would go here */}
                        <div className="flex items-center gap-24">
                          <div className="w-44 bg-white dark:bg-card-dark rounded-2xl border-l-4 border-blue-500 border-t border-r border-b border-gray-200 dark:border-gray-800 p-4 shadow-xl flex flex-col items-center text-center">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center mb-2">
                              <span className="material-symbols-outlined">payments</span>
                            </div>
                            <h4 className="text-xs font-bold text-gray-900 dark:text-white">Refund Requested</h4>
                            <p className="text-[9px] text-gray-500 mt-1 uppercase font-bold tracking-widest">OMS Trigger</p>
                          </div>
                          <div className="w-44 bg-white dark:bg-card-dark rounded-2xl border-l-4 border-green-500 border-t border-r border-b border-gray-200 dark:border-gray-800 p-4 shadow-xl flex flex-col items-center text-center">
                            <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-600 flex items-center justify-center mb-2">
                              <span className="material-symbols-outlined">universal_currency_alt</span>
                            </div>
                            <h4 className="text-xs font-bold text-gray-900 dark:text-white">Check Amount</h4>
                            <p className="text-[9px] text-gray-500 mt-1 uppercase font-bold tracking-widest">Condition</p>
                          </div>
                          <div className="flex flex-col gap-8">
                            <div className="w-44 bg-white dark:bg-card-dark rounded-2xl border-l-4 border-purple-500 border-t border-r border-b border-gray-200 dark:border-gray-800 p-4 shadow-xl flex flex-col items-center text-center">
                              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-600 flex items-center justify-center mb-2">
                                <span className="material-symbols-outlined">check_circle</span>
                              </div>
                              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Auto-approve</h4>
                              <p className="text-[9px] text-gray-500 mt-1 uppercase font-bold tracking-widest">Action</p>
                            </div>
                            <div className="w-44 bg-blue-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-200 dark:border-indigo-800 p-4 shadow-xl flex flex-col items-center text-center ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-gray-900">
                              <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 text-indigo-600 flex items-center justify-center mb-2 shadow-card border border-gray-100 dark:border-gray-700">
                                <span className="font-bold text-lg">S</span>
                              </div>
                              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Trigger PSP Refund</h4>
                              <p className="text-[9px] text-gray-500 mt-1 uppercase font-bold tracking-widest">Stripe</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar Area */}
              <div className={`transition-all duration-300 bg-white dark:bg-card-dark flex flex-col overflow-hidden shadow-2xl ${isRightSidebarOpen ? 'w-80 lg:w-96 border-l border-gray-200 dark:border-gray-800' : 'w-0 border-none'}`}>
                <div className="flex items-center border-b border-gray-100 dark:border-gray-700 px-2 flex-shrink-0">
                  <button
                    onClick={() => setRightTab('details')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                      rightTab === 'details'
                        ? 'text-gray-900 border-gray-900 font-bold'
                        : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 border-transparent'
                    }`}
                  >
                    Details
                  </button>
                  <button
                    onClick={() => setRightTab('copilot')}
                    className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-2 ${
                      rightTab === 'copilot'
                        ? 'text-secondary border-secondary font-bold bg-purple-50/50 dark:bg-purple-900/10'
                        : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 border-transparent'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">smart_toy</span>
                    Copilot
                  </button>
                  <div className="flex items-center gap-1 ml-auto">
                    <button 
                      onClick={() => setIsRightSidebarOpen(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-all"
                      title="Hide Sidebar"
                    >
                      <span className="material-symbols-outlined text-[20px]">view_sidebar</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {rightTab === 'copilot' ? (
                    <div className="p-4 flex flex-col gap-4">
                      {/* Copilot Case Summary */}
                      <div className="flex gap-2">
                        <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-white flex-shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                        </div>
                        <div className="flex flex-col gap-2 max-w-[85%] w-full">
                          <div className="bg-purple-50 dark:bg-purple-900/20 text-gray-800 dark:text-gray-200 text-sm py-2.5 px-3.5 rounded-2xl rounded-tl-sm border border-purple-100 dark:border-purple-800/30">
                            <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Workflow Summary</h4>
                            <p className="leading-relaxed mb-3">
                              {view === 'new' 
                                ? 'This is a new workflow draft. AI suggests adding a fraud check before the final action.' 
                                : `Workflow "${selectedWorkflow?.name}" is currently ${selectedWorkflow?.status}. It has processed ${selectedWorkflow?.metrics[0].value} executions.`}
                            </p>
                            
                            <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Conflict Detection</h4>
                            <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-800/30 text-xs text-red-700 dark:text-red-400 mb-3">
                              No major conflicts detected in this workflow definition.
                            </div>

                            <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Recommended Action</h4>
                            <p className="text-xs bg-white/50 dark:bg-black/20 p-2 rounded border border-purple-100 dark:border-purple-800/30 italic">
                              Consider optimizing the "Manual Review" step to reduce latency.
                            </p>
                          </div>
                          
                          <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                            <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">Suggested Reply</h4>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed italic mb-3">
                              "I've analyzed the workflow. It's performing well, but we could improve the efficiency of the conditional branches."
                            </p>
                <button onClick={handleApplyToComposer} className="w-full py-1.5 bg-secondary text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity">
                  Apply to Composer
                </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {view === 'new' ? (
                        <div className="p-4 space-y-8">
                          {/* Triggers Section */}
                          <div className="space-y-3">
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Operational Triggers</h3>
                            <div className="space-y-1">
                              {[
                                { name: 'Order Created', icon: 'shopping_cart', color: 'text-blue-600' },
                                { name: 'Refund Requested', icon: 'payments', color: 'text-blue-600' },
                                { name: 'Return Received', icon: 'keyboard_return', color: 'text-blue-600' },
                                { name: 'Conflict Detected', icon: 'sync_problem', color: 'text-blue-600' },
                                { name: 'WMS Status Change', icon: 'inventory_2', color: 'text-blue-600' },
                                { name: 'Payment Update', icon: 'account_balance', color: 'text-blue-600' },
                              ].map(item => (
                                <div key={item.name} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/10 border border-transparent hover:border-blue-100 dark:hover:border-blue-800/30 cursor-grab transition-all group">
                                  <span className={`material-symbols-outlined ${item.color} text-lg`}>{item.icon}</span>
                                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{item.name}</span>
                                  <span className="ml-auto material-symbols-outlined text-blue-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity">add</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Conditions Section */}
                          <div className="space-y-3">
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Logic & Conditions</h3>
                            <div className="space-y-1">
                              {[
                                { name: 'Amount Threshold', icon: 'universal_currency_alt', color: 'text-amber-600' },
                                { name: 'Order Status is...', icon: 'assignment_late', color: 'text-amber-600' },
                                { name: 'Risk Score check', icon: 'gpp_maybe', color: 'text-amber-600' },
                                { name: 'System Mismatch', icon: 'compare_arrows', color: 'text-amber-600' },
                                { name: 'Inventory Check', icon: 'warehouse', color: 'text-amber-600' },
                                { name: 'Refund Reason', icon: 'psychology', color: 'text-amber-600' },
                              ].map(item => (
                                <div key={item.name} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/10 border border-transparent hover:border-amber-100 dark:hover:border-amber-800/30 cursor-grab transition-all group">
                                  <span className={`material-symbols-outlined ${item.color} text-lg`}>{item.icon}</span>
                                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{item.name}</span>
                                  <span className="ml-auto material-symbols-outlined text-amber-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity">add</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Actions Section */}
                          <div className="space-y-3">
                            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Operational Actions</h3>
                            <div className="space-y-1">
                              {[
                                { name: 'Approve Refund', icon: 'check_circle', color: 'text-purple-600' },
                                { name: 'Block Action', icon: 'block', color: 'text-purple-600' },
                                { name: 'Create Case', icon: 'assignment_add', color: 'text-purple-600' },
                                { name: 'Update OMS', icon: 'system_update_alt', color: 'text-purple-600' },
                                { name: 'Trigger PSP', icon: 'account_balance_wallet', color: 'text-purple-600' },
                                { name: 'Escalate', icon: 'priority_high', color: 'text-purple-600' },
                              ].map(item => (
                                <div key={item.name} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/10 border border-transparent hover:border-purple-100 dark:hover:border-purple-800/30 cursor-grab transition-all group">
                                  <span className={`material-symbols-outlined ${item.color} text-lg`}>{item.icon}</span>
                                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{item.name}</span>
                                  <span className="ml-auto material-symbols-outlined text-purple-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity">add</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col h-full">
                          <div className="p-6 space-y-6 flex-1">
                            <div className="flex items-start gap-4 pb-6 border-b border-gray-50 dark:border-gray-800">
                              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-gray-800 text-indigo-600 flex items-center justify-center shadow-card border border-gray-100 dark:border-gray-700 flex-shrink-0">
                                <span className="font-bold text-xl">S</span>
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Trigger PSP Refund</h3>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mt-1">Stripe Integration</p>
                              </div>
                            </div>

                            <div className="bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800/30 rounded-xl p-4 flex items-center gap-3">
                              <span className="material-symbols-outlined text-green-600 text-xl">check_circle</span>
                              <span className="text-xs font-bold text-green-800 dark:text-green-400">PSP (Stripe) connected</span>
                            </div>

                            <div className="space-y-6">
                              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Configuration</h4>
                              
                              <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Requires manual approval</label>
                                <div className="w-8 h-4 bg-gray-200 dark:bg-gray-700 rounded-full relative cursor-pointer">
                                  <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full"></div>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Refund Amount</label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-sm">data_object</span>
                                  <input 
                                    type="text" 
                                    defaultValue="{{order.refund_amount}}" 
                                    className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  />
                                </div>
                                <p className="text-[9px] text-gray-400 font-medium">Use variables from previous steps.</p>
                              </div>

                              <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Currency</label>
                                <select className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 appearance-none">
                                  <option>USD - US Dollar</option>
                                  <option>EUR - Euro</option>
                                  <option>GBP - British Pound</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* Recent Executions */}
                          <div className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30 flex flex-col h-1/3 min-h-[250px]">
                            <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800">
                              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Recent executions</h4>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                              <table className="w-full text-left">
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                  {[
                                    { id: 'CASE-4921', status: 'Success', time: '2m ago', color: 'text-green-600 bg-green-50', icon: 'check_circle' },
                                    { id: 'CASE-4920', status: 'Success', time: '15m ago', color: 'text-green-600 bg-green-50', icon: 'check_circle' },
                                    { id: 'CASE-4919', status: 'Waiting', time: '1h ago', color: 'text-amber-600 bg-amber-50', icon: 'schedule' },
                                    { id: 'CASE-4918', status: 'Failed', time: '3h ago', color: 'text-red-600 bg-red-50', icon: 'error' },
                                    { id: 'CASE-4917', status: 'Success', time: '5h ago', color: 'text-green-600 bg-green-50', icon: 'check_circle' },
                                  ].map(exec => (
                                    <tr key={exec.id} className="hover:bg-white dark:hover:bg-gray-800 transition-colors cursor-pointer">
                                      <td className="px-6 py-3 text-[11px] font-bold text-gray-900 dark:text-white">
                                        <div className="flex items-center gap-2">
                                          <span className="material-symbols-outlined text-[14px] text-gray-400">assignment</span>
                                          {exec.id}
                                        </div>
                                      </td>
                                      <td className="px-6 py-3">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 w-fit ${exec.color} dark:bg-opacity-10`}>
                                          <span className="material-symbols-outlined text-[10px]">{exec.icon}</span>
                                          {exec.status}
                                        </span>
                                      </td>
                                      <td className="px-6 py-3 text-[10px] text-gray-400 text-right">{exec.time}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isTemplatePickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          >
            <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-card-dark shadow-2xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Browse templates</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Create a workflow from a working operational pattern.</p>
                </div>
                <button
                  onClick={() => setIsTemplatePickerOpen(false)}
                  className="w-9 h-9 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {TEMPLATE_LIBRARY.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => createFromTemplate(template.id)}
                    className="text-left rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-secondary hover:bg-purple-50/40 dark:hover:bg-purple-900/10 transition-colors"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">{template.category}</div>
                    <div className="font-bold text-gray-900 dark:text-white mb-2">{template.label}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{template.description}</div>
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
