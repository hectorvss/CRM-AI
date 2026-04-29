import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Page } from '../types';
import TreeGraph from './TreeGraph';
import { casesApi, aiApi } from '../api/client';
import { buildResolutionPlan, type ResolutionStep } from '../utils/resolutionPlan';
import { useApi } from '../api/hooks';
import type { GraphBranch } from './TreeGraph';
import LoadingState from './LoadingState';

type RightTab = 'details' | 'copilot';
// ResolveTab type removed — new flat layout doesn't use tabs.

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

function formatStatus(value?: string | null) {
  if (!value) return 'N/A';
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function branchStatusMap(status: string): 'healthy' | 'warning' | 'critical' {
  if (status === 'critical' || status === 'blocked') return 'critical';
  if (status === 'warning' || status === 'pending') return 'warning';
  return 'healthy';
}

function nodeStatusMap(status: string): 'healthy' | 'warning' | 'critical' {
  if (status === 'critical' || status === 'blocked') return 'critical';
  if (status === 'warning' || status === 'pending') return 'warning';
  return 'healthy';
}

function pageFromBranchKey(key?: string | null): Page | null {
  if (!key) return null;
  const normalized = key.toLowerCase();
  if (normalized.includes('conversation') || normalized.includes('message') || normalized.includes('note')) return 'inbox';
  if (normalized.includes('reconciliation')) return 'reports';
  if (normalized.includes('linked')) return 'case_graph';
  if (normalized.includes('payment')) return 'payments';
  if (normalized.includes('return')) return 'returns';
  if (normalized.includes('order') || normalized.includes('fulfillment') || normalized.includes('shipping') || normalized.includes('warehouse')) return 'orders';
  if (normalized.includes('approval') || normalized.includes('policy')) return 'approvals';
  if (normalized.includes('workflow') || normalized.includes('agent')) return 'workflows';
  if (normalized.includes('knowledge') || normalized.includes('article')) return 'knowledge';
  if (normalized.includes('integration') || normalized.includes('connector') || normalized.includes('webhook')) return 'tools_integrations';
  return null;
}

function pageFromText(text?: string | null): Page | null {
  if (!text) return null;
  const value = text.toLowerCase();
  if (/(refund|payment|psp|charge|settlement|invoice|captured|authorized|dispute)/.test(value)) return 'payments';
  if (/(return|rma|replacement|exchange)/.test(value)) return 'returns';
  if (/(fulfill|warehouse|shipping|shipment|order|oms|packing|tracking|delivery|inventory|cancel)/.test(value)) return 'orders';
  if (/(approval|manager|policy|review|authorization|approve|reject)/.test(value)) return 'approvals';
  if (/(workflow|automation|orchestration|run|agent)/.test(value)) return 'workflows';
  if (/(knowledge|article|policy bundle|kb|documentation)/.test(value)) return 'knowledge';
  if (/(connector|integration|webhook|stripe|shopify|intercom)/.test(value)) return 'tools_integrations';
  return null;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function approvalActionSummary(step: any) {
  const execution = step?.execution;
  if (!execution) return 'This step requires approval before execution.';
  if (execution.kind === 'navigate') return execution.reason || 'Open the approval queue for this action.';
  if (execution.kind === 'blocked') return execution.reason || 'This action cannot run until missing context is resolved.';
  const tool = execution.tool || 'registered tool';
  const args = execution.args || {};
  if (tool === 'payment.refund') {
    return `Refund payment ${args.paymentId || 'linked payment'}${args.amount ? ` for ${args.amount}` : ''}.`;
  }
  if (tool === 'order.cancel') {
    return `Cancel order ${args.orderId || 'linked order'}${args.currentStatus ? ` currently ${formatStatus(String(args.currentStatus))}` : ''}.`;
  }
  if (tool === 'message.send_to_customer') {
    return `Send a ${args.channel || 'customer'} message for this case.`;
  }
  if (tool === 'return.update_status') {
    return `Update return ${args.returnId || 'linked return'} to ${formatStatus(String(args.status || 'next status'))}.`;
  }
  if (tool === 'reconciliation.resolve_issue') {
    return `Resolve reconciliation issue ${args.issueId || 'linked issue'} using target state ${args.targetStatus || 'resolved'}.`;
  }
  if (tool === 'agent.run') {
    return `Run agent ${args.agentSlug || 'configured agent'} for this case.`;
  }
  if (tool === 'case.update_status') {
    return `Move this case to ${formatStatus(String(args.status || 'the next status'))}.`;
  }
  return `Execute ${tool}.`;
}

function approvalPayloadPreview(step: any) {
  const execution = step?.execution;
  if (!execution || execution.kind !== 'tool') return null;
  const args = execution.args || {};
  const safeEntries = Object.entries(args)
    .filter(([key]) => !['message', 'content', 'extraContext'].includes(key))
    .slice(0, 5);
  if (!safeEntries.length) return null;
  return safeEntries.map(([key, value]) => `${formatStatus(key)}: ${String(value)}`).join(' · ');
}

export default function CaseGraph({ onPageChange, focusCaseId }: { onPageChange: (page: Page) => void; focusCaseId?: string | null }) {
  const [rightTab, setRightTab] = useState<RightTab>('copilot');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graphView, setGraphView] = useState<'tree' | 'timeline' | 'resolve'>('tree');
  // ResolveTab state removed — new flat layout doesn't use tabs.
  const [executingStepId, setExecutingStepId] = useState<string | null>(null);
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(new Set());
  const [resolveStatusMessage, setResolveStatusMessage] = useState<string | null>(null);
  const [isAiResolving, setIsAiResolving] = useState(false);
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set());
  const [approvedStepIds, setApprovedStepIds] = useState<Set<string>>(new Set());

  // ── Copilot state ────────────────────────────────────────────────
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([]);
  const [copilotInput, setCopilotInput] = useState('');
  const [isCopilotSending, setIsCopilotSending] = useState(false);
  const [showCaseBrief, setShowCaseBrief] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const copilotBottomRef = useRef<HTMLDivElement>(null);
  const copilotInputRef = useRef<HTMLInputElement>(null);
  const welcomeSentForRef = useRef<string | null>(null);

  // Reset chat when case changes
  useEffect(() => {
    setCopilotMessages([]);
    setShowCaseBrief(false);
    welcomeSentForRef.current = null;
    setCompletedStepIds(new Set());
    setExecutingStepId(null);
    setResolveStatusMessage(null);
    setIsAiResolving(false);
    setExpandedStepIds(new Set());
    setApprovedStepIds(new Set());
  }, [selectedId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    copilotBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [copilotMessages, isCopilotSending]);

  // NOTE: Auto-welcome effect is defined further down, AFTER `stateData`,
  // `resolveData`, and `selectedCase` are declared. Declaring it here
  // would hit a Temporal Dead Zone when the deps array is evaluated,
  // producing "Cannot access 'X' before initialization" at runtime.

  // ── Fetch case list ──────────────────────────────────────────────
  const { data: apiCases, loading: casesLoading } = useApi(() => casesApi.list(), [], []);
  const cases = useMemo(() => (apiCases || []).map((c: any) => ({
    id: c.id,
    orderId: Array.isArray(c.order_ids) && c.order_ids.length > 0 ? c.order_ids[0] : c.case_number,
    customerName: c.customer_name || c.case_number,
    summary: c.ai_diagnosis || c.conflict_summary?.recommended_action || formatStatus(c.type),
    lastUpdate: c.last_activity_at ? new Date(c.last_activity_at).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
    status: c.status,
    riskLevel: c.risk_level,
    badges: [
      ...(c.conflict_summary?.has_conflict ? ['Conflict'] : []),
      ...(c.risk_level === 'high' || c.risk_level === 'critical' ? ['High Risk'] : []),
      ...(c.status === 'blocked' ? ['Blocked'] : []),
    ],
  })), [apiCases]);

  useEffect(() => {
    if (!selectedId && cases.length > 0) setSelectedId(cases[0].id);
  }, [cases, selectedId]);

  useEffect(() => {
    if (!focusCaseId || !cases.length) return;
    const target = cases.find((c) => c.id === focusCaseId || c.orderId === focusCaseId || c.customerName === focusCaseId);
    if (target && target.id !== selectedId) {
      setSelectedId(target.id);
    }
  }, [cases, focusCaseId, selectedId]);

  // ── Fetch case graph (branches + timeline) ──────────────────────
  const { data: graphData, loading: graphLoading } = useApi(
    () => selectedId ? casesApi.graph(selectedId) : Promise.resolve(null),
    [selectedId]
  );

  // ── Fetch case resolve data ─────────────────────────────────────
  const { data: resolveData, loading: resolveLoading } = useApi(
    () => selectedId ? casesApi.resolve(selectedId) : Promise.resolve(null),
    [selectedId]
  );

  const { data: serverResolutionPlan, refetch: refetchResolutionPlan } = useApi(
    () => selectedId ? casesApi.resolutionPlan(selectedId) : Promise.resolve(null),
    [selectedId]
  );

  // ── Fetch case state ────────────────────────────────────────────
  const { data: stateData, loading: stateLoading } = useApi(
    () => selectedId ? casesApi.state(selectedId) : Promise.resolve(null),
    [selectedId]
  );

  // ── Map graph API response to TreeGraph branches ────────────────
  const branches: GraphBranch[] = useMemo(() => {
    if (!graphData?.branches) return [];
    const pageMap: Record<string, Page> = {
      orders: 'orders', payments: 'payments', returns: 'returns',
      fulfillment: 'orders', approvals: 'approvals', workflows: 'workflows',
      knowledge: 'knowledge', integrations: 'tools_integrations',
      refunds: 'payments',
      conversation: 'inbox', notes: 'inbox', linked_cases: 'case_graph', reconciliation: 'reports',
    };
    return graphData.branches.map((b: any) => {
      const branchId = b.key || b.id || 'unknown';
      return {
        id: branchId,
        label: b.label,
        icon: b.nodes?.[0]?.icon || iconForBranch(branchId),
        page: pageMap[branchId] || ('case_graph' as Page),
        status: branchStatusMap(b.status),
        nodes: (b.nodes || []).map((n: any) => ({
          id: n.id || n.key || String(Math.random()),
          label: n.label,
          status: nodeStatusMap(n.status),
          context: n.context || n.value || n.source || '',
          icon: n.icon || iconForBranch(branchId),
          timestamp: n.timestamp,
        })),
      };
    });
  }, [graphData]);

  // ── Timeline data from graph API ────────────────────────────────
  const timeline = useMemo(() => graphData?.timeline || [], [graphData]);

  // ── Root data from graph API ────────────────────────────────────
  const rootData = useMemo(() => {
    if (graphData?.root) {
      return {
        orderId: graphData.root.order_id || graphData.root.case_number || '',
        customerName: graphData.root.customer_name || '',
        riskLevel: graphData.root.risk_level || 'Low Risk',
        status: graphData.root.status || 'Open',
      };
    }
    const selected = cases.find(c => c.id === selectedId);
    return {
      orderId: selected?.orderId || '',
      customerName: selected?.customerName || '',
      riskLevel: 'Low Risk',
      status: selected?.status || 'Open',
    };
  }, [graphData, cases, selectedId]);

  // ── Resolve data ────────────────────────────────────────────────
  const caseResolve = resolveData || {};
  const caseState = stateData || {};

  // ── Derived detail data ─────────────────────────────────────────
  const impactedBranches = useMemo(() =>
    branches.filter(b => b.status === 'critical' || b.status === 'warning'),
    [branches]
  );

  const links = useMemo(() => {
    const refs: any[] = [];
    if (stateData?.identifiers?.external_refs) {
      stateData.identifiers.external_refs.forEach((ref: string) => {
        refs.push({ label: ref, href: '#' });
      });
    }
    return refs;
  }, [stateData]);

  const relatedCases = useMemo(() =>
    stateData?.related?.linked_cases || resolveData?.linked_cases || [],
    [stateData, resolveData]
  );

  const internalNotes = useMemo(() =>
    resolveData?.notes || [],
    [resolveData]
  );

  // ── Copilot brief data ──────────────────────────────────────────
  const copilotBrief = useMemo(() => ({
    summary: stateData?.case?.ai_diagnosis || caseResolve?.conflict?.summary || 'No AI summary yet.',
    rootCause: caseResolve?.conflict?.root_cause || stateData?.case?.ai_root_cause || 'Pending analysis.',
    conflict: caseResolve?.conflict?.title || null,
    recommendation: caseResolve?.conflict?.recommended_action || stateData?.case?.ai_recommended_action || null,
  }), [stateData, caseResolve]);

  const selectedCase = useMemo(() => cases.find(c => c.id === selectedId), [cases, selectedId]);

  // No auto-welcome message — copilot starts empty until user asks something.

  const riskLevel = rootData.riskLevel || selectedCase?.riskLevel || 'low';
  const riskLabel = typeof riskLevel === 'string' ? riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1).toLowerCase() : 'Low';

  // ── Suggested question chips ────────────────────────────────────
  const suggestedQuestions = useMemo(() => {
    const qs: string[] = [];
    if (copilotBrief.conflict) qs.push("What's causing the conflict?");
    else qs.push("What's the current status?");
    qs.push("What should I do next?");
    if (impactedBranches.some(b => b.label?.toLowerCase().includes('payment'))) {
      qs.push("What's wrong with the payment?");
    } else if (impactedBranches.some(b => b.label?.toLowerCase().includes('return'))) {
      qs.push("What's the return status?");
    } else {
      qs.push("Walk me through this case");
    }
    if (riskLabel.toLowerCase() === 'high' || riskLabel.toLowerCase() === 'critical') {
      qs.push("Why is this high risk?");
    }
    return qs.slice(0, 4);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copilotBrief.conflict, impactedBranches, riskLabel]);

  const impactedModule = useMemo<Page>(() => {
    const textCandidates = [
      caseResolve?.conflict?.source_of_truth,
      caseResolve?.conflict?.root_cause,
      caseResolve?.conflict?.recommended_action,
      caseResolve?.conflict?.summary,
      stateData?.case?.type,
      stateData?.case?.ai_diagnosis,
      stateData?.case?.ai_root_cause,
      stateData?.case?.ai_recommended_action,
    ];

    for (const candidate of textCandidates) {
      const page = pageFromText(candidate);
      if (page) return page;
    }

    const strongestBranch = branches.find(branch => branch.status === 'critical')
      || branches.find(branch => branch.status === 'warning')
      || branches[0];

    const branchPage = pageFromBranchKey(strongestBranch?.id || strongestBranch?.label);
    if (branchPage) return branchPage;

    return strongestBranch?.page || 'case_graph';
  }, [branches, caseResolve, stateData]);

  // ── Copilot submit ──────────────────────────────────────────────
  const handleCopilotSubmit = useCallback(async (questionOverride?: string) => {
    const question = (questionOverride !== undefined ? questionOverride : copilotInput).trim();
    if (!selectedId || !question || isCopilotSending) return;
    const userMsg: CopilotMessage = { id: `u-${Date.now()}`, role: 'user', content: question, time: nowTime() };
    const history = copilotMessages.map(m => ({ role: m.role, content: m.content }));

    setCopilotMessages(prev => [...prev, userMsg]);
    setCopilotInput('');
    setIsCopilotSending(true);

    try {
      const result = await aiApi.copilot(selectedId, question, history);
      const answer = result?.answer || 'No response available.';
      setCopilotMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: answer,
        time: nowTime(),
      }]);
    } catch {
      const localParts = [
        copilotBrief.summary && copilotBrief.summary !== 'No AI summary yet.' ? copilotBrief.summary : null,
        copilotBrief.rootCause && copilotBrief.rootCause !== 'Pending analysis.' ? `Root cause: ${copilotBrief.rootCause}` : null,
        copilotBrief.conflict ? `Active blocker: ${copilotBrief.conflict}` : null,
        copilotBrief.recommendation ? `Recommendation: ${copilotBrief.recommendation}` : null,
        impactedBranches.length ? `Impacted systems: ${impactedBranches.map(b => b.label).join(', ')}` : null,
      ].filter(Boolean);
      const fallbackContent = localParts.length
        ? `The AI server isn't reachable right now, but here's what the canonical state shows:\n\n${localParts.join('\n\n')}`
        : 'The AI server is currently unreachable and there is no local canonical data for this case yet.';
      setCopilotMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: fallbackContent,
        time: nowTime(),
      }]);
    } finally {
      setIsCopilotSending(false);
    }
  }, [selectedId, copilotInput, isCopilotSending, copilotMessages, copilotBrief, impactedBranches]);

  // ── Resolve plan + handlers ──────────────────────────────────────
  const resolutionPlan = useMemo(
    () => serverResolutionPlan || buildResolutionPlan(caseResolve),
    [caseResolve, serverResolutionPlan],
  );

  const toggleStepExpansion = useCallback((stepId: string) => {
    setExpandedStepIds(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }, []);

  const toggleStepApproval = useCallback((stepId: string) => {
    setApprovedStepIds(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }, []);

  const executeRoutedStep = useCallback(async (step: ResolutionStep) => {
    if (!selectedId) return { ok: false, message: 'No case selected.' };
    const result = await casesApi.runResolutionStep(selectedId, step.id, {
      sessionId: `case-resolution-${selectedId}`,
    });
    if (result?.action === 'navigate' && result.targetPage === 'approvals') {
      onPageChange('approvals');
    }
    return {
      ok: result?.ok !== false,
      message: result?.message || result?.error || `Step "${step.title}" executed.`,
      approvalRequired: Boolean(result?.approvalRequired),
      trace: result?.trace,
    };
  }, [onPageChange, selectedId]);

  const handleRunDeterministicStep = useCallback(async (step: ResolutionStep) => {
    if (!selectedId || !step?.id || executingStepId !== null) return;
    if ((step as any).requiresApproval && !approvedStepIds.has(step.id)) {
      setExpandedStepIds(prev => new Set(prev).add(step.id));
      setResolveStatusMessage('Review and approve this sensitive action before running it.');
      return;
    }
    setExecutingStepId(step.id);
    setResolveStatusMessage(null);
    try {
      const result = await executeRoutedStep(step);
      if (result.ok) {
        setCompletedStepIds(prev => {
          const next = new Set(prev);
          next.add(step.id);
          return next;
        });
        setResolveStatusMessage(result.message);
        refetchResolutionPlan();
      }
    } catch (error: any) {
      setResolveStatusMessage(error?.message || `Failed to execute "${step.title}".`);
    } finally {
      setExecutingStepId(null);
    }
  }, [approvedStepIds, executeRoutedStep, executingStepId, refetchResolutionPlan, selectedId]);

  const handleRunAllDeterministicSteps = useCallback(async () => {
    if (!selectedId || !resolutionPlan.hasSteps || executingStepId !== null) return;
    const pendingApprovalStep = resolutionPlan.steps.find((step: ResolutionStep) => {
      const isAlreadyDone = completedStepIds.has(step.id) || step.status === 'completed' || step.status === 'success';
      return (step as any).requiresApproval && !isAlreadyDone && !approvedStepIds.has(step.id);
    });
    if (pendingApprovalStep) {
      setExpandedStepIds(prev => new Set(prev).add(pendingApprovalStep.id));
      setResolveStatusMessage(`Review and approve "${pendingApprovalStep.title}" before running all steps.`);
      return;
    }
    setResolveStatusMessage(null);
    setExecutingStepId('all');
    try {
      const result = await casesApi.runResolutionPlan(selectedId, {
        sessionId: `case-resolution-${selectedId}`,
      });
      const executedStepIds = new Set<string>(
        (result?.trace?.spans || [])
          .filter((span: any) => span?.result?.ok)
          .map((span: any) => String(span.stepId).replace(/_/g, ':')),
      );
      setCompletedStepIds(prev => {
        const next = new Set(prev);
        resolutionPlan.steps.forEach((step: ResolutionStep) => {
          const normalized = step.id.replace(/[^a-zA-Z0-9_-]/g, '_');
          if (executedStepIds.has(step.id) || executedStepIds.has(normalized)) next.add(step.id);
        });
        return next;
      });
      setResolveStatusMessage(result?.message || 'Deterministic resolution plan executed.');
      refetchResolutionPlan();
    } catch (error: any) {
      setResolveStatusMessage(error?.message || 'Some steps could not be executed automatically. Review the plan.');
    } finally {
      setExecutingStepId(null);
    }
  }, [approvedStepIds, completedStepIds, executingStepId, refetchResolutionPlan, resolutionPlan, selectedId]);

  const handleResolveWithAI = useCallback(async () => {
    if (!selectedId) return;
    setIsAiResolving(true);
    setResolveStatusMessage(null);
    try {
      const response = await casesApi.resolveWithAI(selectedId, {
        sessionId: `case-resolution-ai-${selectedId}`,
      });
      const executedStepIds = new Set<string>(
        (response?.trace?.spans || [])
          .filter((span: any) => span?.result?.ok)
          .map((span: any) => String(span.stepId).replace(/_/g, ':')),
      );
      setCompletedStepIds(prev => {
        const next = new Set(prev);
        resolutionPlan.steps.forEach((step: ResolutionStep) => {
          const normalized = step.id.replace(/[^a-zA-Z0-9_-]/g, '_');
          if (executedStepIds.has(step.id) || executedStepIds.has(normalized)) next.add(step.id);
        });
        return next;
      });
      const summary = response?.message || 'AI resolution completed through the Plan Engine.';
      setResolveStatusMessage(summary);
      refetchResolutionPlan();
    } catch (error: any) {
      setResolveStatusMessage(error?.message || 'Unable to dispatch the AI resolution agent.');
    } finally {
      setIsAiResolving(false);
    }
  }, [refetchResolutionPlan, resolutionPlan.steps, selectedId]);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Case Graph</h1>
            <div className="flex space-x-1">
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-black text-white">All cases ({cases.length})</span>
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                Active ({cases.filter(c => !['resolved', 'closed', 'cancelled'].includes(c.status)).length})
              </span>
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                Resolved ({cases.filter(c => c.status === 'resolved' || c.status === 'closed').length})
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center text-gray-500 text-sm mr-2">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
              Sync Active
            </div>
            <button className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <span className="material-symbols-outlined">filter_list</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* ── Left Panel: Case List ────────────────────────────── */}
          <div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col bg-gray-50/30 dark:bg-black/5">
            <div className="overflow-y-auto flex-1 custom-scrollbar p-2 space-y-2">
              {casesLoading && cases.length === 0 && (
                <LoadingState title="Loading cases" message="Fetching canonical case data from Supabase." compact />
              )}
              {cases.length === 0 && !casesLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <span className="material-symbols-outlined text-4xl mb-3">inbox</span>
                  <p className="text-sm font-medium">No cases yet</p>
                  <p className="text-xs mt-1">Run a demo scenario to generate cases</p>
                </div>
              )}
              {cases.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                    selectedId === c.id
                      ? 'bg-white dark:bg-gray-800 border-secondary shadow-card scale-[1.02] z-10'
                      : 'bg-white dark:bg-card-dark border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm hover:shadow-card'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex flex-col">
                      <span className={`font-semibold text-sm ${selectedId === c.id ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{c.customerName}</span>
                      <span className="text-xs text-gray-400 font-mono">{c.orderId}</span>
                    </div>
                    <span className="text-xs text-gray-400">{c.lastUpdate}</span>
                  </div>
                  <p className={`text-sm truncate ${selectedId === c.id ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-300'}`}>{c.summary}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.badges.map((badge: string) => (
                      <span key={badge} className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Center Panel: Graph / Timeline / Resolve ─────────── */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#F8F9FA] dark:bg-card-dark overflow-hidden relative">
            <div className="absolute top-4 left-6 z-10">
              <div className="flex items-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm p-1 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm">
                {(['tree', 'timeline', 'resolve'] as const).map(view => (
                  <button
                    key={view}
                    onClick={() => setGraphView(view)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                      graphView === view ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">{view === 'tree' ? 'account_tree' : view === 'timeline' ? 'timeline' : 'handyman'}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">{view === 'tree' ? 'Tree View' : view === 'timeline' ? 'Timeline' : 'Resolve'}</span>
                  </button>
                ))}
              </div>
            </div>
            {!isRightSidebarOpen && (
              <button
                onClick={() => setIsRightSidebarOpen(true)}
                className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-100 dark:border-gray-700 shadow-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-all"
                title="Show Sidebar"
              >
                <span className="material-symbols-outlined text-[20px]">view_sidebar</span>
              </button>
            )}

            {graphView === 'tree' ? (
              <div className="flex-1 flex items-center justify-center relative bg-white dark:bg-card-dark">
                {(graphLoading || resolveLoading || stateLoading) && !graphData && !resolveData && !stateData ? (
                  <LoadingState title="Loading case graph" message="Fetching live graph, resolve and state data." compact />
                ) : branches.length > 0 ? (
                  <TreeGraph onNavigate={onPageChange} branches={branches} rootData={rootData} />
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <span className="material-symbols-outlined text-5xl mb-3">account_tree</span>
                    <p className="text-sm font-medium">
                      {selectedId ? (graphLoading ? 'Loading graph...' : 'No graph data available') : 'Select a case to view its graph'}
                    </p>
                  </div>
                )}
              </div>
            ) : graphView === 'timeline' ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-20 relative bg-[#F8F9FA] dark:bg-card-dark">
                {(graphLoading || resolveLoading || stateLoading) && timeline.length === 0 ? (
                  <LoadingState title="Loading timeline" message="Fetching case history from Supabase." compact />
                ) : (
                  <>
                    <div className="relative">
                      {timeline.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                          <span className="material-symbols-outlined text-4xl mb-3">timeline</span>
                          <p className="text-sm font-medium">No timeline events yet</p>
                        </div>
                      )}
                      {timeline.length > 0 && (
                        <div className="absolute left-[18px] top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700"></div>
                      )}
                      <div className="space-y-6 relative">
                        {timeline.map((entry: any, index: number) => {
                          const isCritical = entry.severity === 'critical' || entry.severity === 'blocked';
                          const isWarning = entry.severity === 'warning' || entry.severity === 'pending';
                          const dotColor = isCritical ? 'bg-red-500' : isWarning ? 'bg-orange-400' : 'bg-green-500';
                          return (
                            <div key={entry.id} className="grid grid-cols-[36px_minmax(0,1fr)] gap-4 group">
                              <div className="relative flex justify-center">
                                <div className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-gray-200 dark:bg-gray-700 ${index === 0 ? 'top-6' : ''} ${index === timeline.length - 1 ? 'bottom-6' : ''}`}></div>
                                <div className={`relative z-10 mt-4 w-4 h-4 rounded-full border-2 border-white dark:border-gray-900 shadow-sm ${dotColor}`}></div>
                              </div>
                              <div className="p-4 rounded-xl border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
                                <div className="flex justify-between items-start mb-2 gap-3">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="material-symbols-outlined text-lg text-gray-500 dark:text-gray-400">{entry.icon || 'circle'}</span>
                                    <h3 className="font-bold text-gray-900 dark:text-white truncate">{formatStatus(entry.entry_type || entry.type)}</h3>
                                  </div>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 font-mono flex-shrink-0">{new Date(entry.occurred_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-300">{entry.content}</div>
                                <div className="mt-3 flex items-center justify-between gap-3">
                                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded border bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">{formatStatus(entry.domain)}</span>
                                  <span className="text-xs text-gray-500">{entry.source || entry.actor || 'System'}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar px-0 py-0 pt-16 relative bg-[#F8F9FA] dark:bg-card-dark">
                {(graphLoading || resolveLoading || stateLoading) && !resolveData && !stateData ? (
                  <LoadingState title="Loading resolve view" message="Fetching conflict, policy and execution context from Supabase." compact />
                ) : (
                  <div className="space-y-6 px-6 pb-6">
                    {resolveStatusMessage && (
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">
                        {resolveStatusMessage}
                      </div>
                    )}

                    {/* Key Problem Card */}
                    <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Key Problem</h2>
                        {caseResolve?.conflict?.severity && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                            caseResolve.conflict.severity === 'critical' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/30' :
                            caseResolve.conflict.severity === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/30' :
                            'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/30'
                          }`}>
                            {formatStatus(caseResolve.conflict.severity)}
                          </span>
                        )}
                      </div>
                      <div className="p-6 space-y-3">
                        <div>
                          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{caseResolve?.conflict?.title || 'No active conflict'}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{caseResolve?.conflict?.summary || 'No conflict summary available for this case.'}</p>
                        </div>
                        {caseResolve?.conflict?.root_cause && (
                          <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Root cause</div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">{caseResolve.conflict.root_cause}</p>
                          </div>
                        )}
                        {(caseResolve?.blockers || []).length > 0 && (
                          <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Active blockers</div>
                            <ul className="space-y-2">
                              {(caseResolve?.blockers || []).map((blocker: any) => (
                                <li key={blocker.key} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    blocker.status === 'critical' || blocker.status === 'blocked' ? 'bg-red-500' :
                                    blocker.status === 'warning' || blocker.status === 'pending' ? 'bg-amber-500' : 'bg-gray-400'
                                  }`} />
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-gray-900 dark:text-white">{blocker.label}</span>
                                    {(blocker.summary || blocker.source_of_truth) && (
                                      <span className="text-gray-500 dark:text-gray-400"> — {blocker.summary || blocker.source_of_truth}</span>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Resolution Plan */}
                    <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                        <div>
                          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Resolution</h2>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{resolutionPlan.headline}</p>
                        </div>
                        <button
                          onClick={handleRunAllDeterministicSteps}
                          disabled={!resolutionPlan.hasSteps || executingStepId !== null}
                          className="px-4 py-2 rounded-lg text-xs font-semibold bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Run all steps
                        </button>
                      </div>
                      <div className="p-6">
                        {!resolutionPlan.hasSteps ? (
                          <div className="flex flex-col items-center justify-center text-center py-8">
                            <span className="material-symbols-outlined text-gray-300 dark:text-gray-700 text-3xl mb-2">checklist</span>
                            <p className="text-sm text-gray-500 dark:text-gray-400">No deterministic steps available yet for this case.</p>
                          </div>
                        ) : (
                          <ol className="space-y-3">
                            {resolutionPlan.steps.map((step) => {
                              const isCompleted =
                                completedStepIds.has(step.id) ||
                                step.status === 'completed' ||
                                step.status === 'success';
                              const isExecuting = executingStepId === step.id;
                              const isExpanded = expandedStepIds.has(step.id);
                              const requiresApproval = Boolean((step as any).requiresApproval);
                              const isApproved = approvedStepIds.has(step.id);
                              const canRunStep = !isCompleted && !isExecuting && executingStepId === null && (!requiresApproval || isApproved);
                              const execution = (step as any).execution;
                              const payloadPreview = approvalPayloadPreview(step);
                              return (
                                <li
                                  key={step.id}
                                  className={`rounded-xl border transition-colors overflow-hidden ${
                                    isCompleted
                                      ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/30 dark:bg-emerald-900/10'
                                      : 'border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-800/20'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleStepExpansion(step.id)}
                                    aria-expanded={isExpanded}
                                    className="w-full flex items-start gap-3 px-4 py-3 text-left"
                                  >
                                    <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
                                      isCompleted
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                    }`}>
                                      {isCompleted ? <span className="material-symbols-outlined text-[14px]">check</span> : step.index + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{step.title}</div>
                                        <span className="px-2 py-0.5 rounded text-[10px] font-medium border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 capitalize">
                                          {step.group}
                                        </span>
                                        {step.requiresApproval && (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/30">
                                            {isApproved ? 'Approved' : 'Approval'}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{step.label}</div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRunDeterministicStep(step);
                                        }}
                                        disabled={!canRunStep}
                                        className="px-3 py-1 rounded-md text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        {isCompleted ? 'Done' : isExecuting ? 'Running…' : requiresApproval && !isApproved ? 'Approve first' : 'Run'}
                                      </button>
                                      <span className={`material-symbols-outlined text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                    </div>
                                  </button>
                                  {isExpanded && (
                                    <div className="px-4 pb-4 pl-[3.25rem] space-y-3 text-sm text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-800/60 pt-3 bg-white/50 dark:bg-gray-900/20">
                                      <div>
                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">What this step does</div>
                                        <p>{step.explanation}</p>
                                      </div>
                                      <div>
                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Expected outcome</div>
                                        <p>{step.expectedOutcome}</p>
                                      </div>
                                      {(step.context || step.source || step.domain) && (
                                        <div>
                                          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Source</div>
                                          <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {[step.domain, step.source, step.context].filter(Boolean).map(formatStatus).join(' · ')}
                                          </p>
                                        </div>
                                      )}
                                      {requiresApproval && (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-900 dark:border-amber-800/50 dark:bg-amber-900/15 dark:text-amber-100">
                                          <div className="flex items-start gap-2">
                                            <span className="material-symbols-outlined text-[17px] text-amber-600 dark:text-amber-300 mt-0.5">privacy_tip</span>
                                            <div className="min-w-0 flex-1">
                                              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">Approval required before run</div>
                                              <p className="text-sm font-medium">{approvalActionSummary(step)}</p>
                                              <div className="mt-2 grid gap-1 text-xs text-amber-800/80 dark:text-amber-100/80">
                                                <p><span className="font-semibold">Action:</span> {execution?.kind === 'tool' ? execution.tool : execution?.kind || 'approval'}</p>
                                                {payloadPreview && <p><span className="font-semibold">Payload:</span> {payloadPreview}</p>}
                                                <p><span className="font-semibold">Policy:</span> this may create an approval request or execute after explicit user approval.</p>
                                              </div>
                                              <label className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-100">
                                                <input
                                                  type="checkbox"
                                                  checked={isApproved}
                                                  onChange={(event) => {
                                                    event.stopPropagation();
                                                    toggleStepApproval(step.id);
                                                  }}
                                                  onClick={(event) => event.stopPropagation()}
                                                  className="h-3.5 w-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                                />
                                                I approve this action and understand what will run.
                                              </label>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ol>
                        )}
                        {resolutionPlan.requiresApproval && (
                          <p className="mt-4 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px]">info</span>
                            Some steps require approval before execution.
                          </p>
                        )}
                      </div>
                    </section>

                    {/* AI Resolution */}
                    <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                        <div>
                          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Resolve with AI</h2>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Delegate the entire resolution to the agent.</p>
                        </div>
                        <span className="material-symbols-outlined text-gray-400">auto_awesome</span>
                      </div>
                      <div className="p-6 space-y-4">
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          The agent will analyse the canonical state, execute the safe deterministic steps automatically, and request approval for any sensitive action before applying it.
                        </p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            onClick={handleResolveWithAI}
                            disabled={isAiResolving || !selectedId}
                            className="px-4 py-2 rounded-lg text-xs font-semibold bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center gap-2"
                          >
                            {isAiResolving ? 'Dispatching…' : 'Start AI resolution'}
                          </button>
                          <button
                            onClick={() => onPageChange('super_agent')}
                            className="px-4 py-2 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                          >
                            Open Super Agent
                          </button>
                        </div>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right Panel: Details / Copilot ───────────────────── */}
          <div className={`transition-all duration-300 bg-white dark:bg-card-dark flex flex-col overflow-hidden ${isRightSidebarOpen ? 'w-80 lg:w-96 border-l border-gray-100 dark:border-gray-800' : 'w-0 border-none'}`}>
            {/* Tabs */}
            <div className="relative flex items-center justify-center px-4 pt-4 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRightTab('details')}
                  className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold transition-colors border ${
                    rightTab === 'details'
                      ? 'text-white dark:text-gray-900 bg-gray-900 dark:bg-white border-gray-900 dark:border-white'
                      : 'text-gray-700 dark:text-gray-300 bg-transparent border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  Details
                </button>
                <button
                  onClick={() => setRightTab('copilot')}
                  className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold transition-colors border ${
                    rightTab === 'copilot'
                      ? 'text-white dark:text-gray-900 bg-gray-900 dark:bg-white border-gray-900 dark:border-white'
                      : 'text-gray-700 dark:text-gray-300 bg-transparent border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  Copilot
                </button>
              </div>
              <button
                onClick={() => setIsRightSidebarOpen(false)}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-all"
                title="Hide Sidebar"
              >
                <span className="material-symbols-outlined text-[20px]">view_sidebar</span>
              </button>
            </div>

            {/* Tab content */}
            <div className={`flex-1 min-h-0 ${rightTab === 'copilot' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto custom-scrollbar'}`}>
              {rightTab === 'copilot' ? (
                <div className="flex flex-col h-full min-h-0">

                  {/* Chat messages */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-3 min-h-0">
                    {copilotMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center px-4">
                        {stateLoading ? (
                          <div className="flex flex-col items-center gap-3">
                            <div className="h-2 w-24 rounded-full bg-black/5 dark:bg-white/10 animate-pulse" />
                            <p className="text-xs text-gray-400">Reading case data...</p>
                          </div>
                        ) : (
                          <div className="relative">
                            <div className="super-agent-title-glow pointer-events-none absolute -inset-x-6 -inset-y-4 rounded-full bg-sky-500/5 blur-2xl dark:bg-sky-400/5" />
                            <h1 className="relative flex flex-wrap justify-center gap-x-2 gap-y-1 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                              {['Ask', 'about', 'this', 'case'].map((word, index) => (
                                <span
                                  key={`${word}-${index}`}
                                  className="super-agent-title-word inline-block"
                                  style={{ animationDelay: `${120 + index * 80}ms` }}
                                >
                                  {word}
                                </span>
                              ))}
                            </h1>
                          </div>
                        )}
                      </div>
                    ) : (
                      copilotMessages.map((message, idx) => (
                        <React.Fragment key={message.id}>
                          <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start items-end gap-2'}`}>
                            {message.role === 'assistant' && (
                              <div className="w-6 h-6 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 shadow-sm shadow-secondary/20">
                                <span className="material-symbols-outlined text-white text-[13px]">auto_awesome</span>
                              </div>
                            )}
                            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed border ${
                              message.role === 'user'
                                ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600 rounded-br-sm'
                                : 'bg-white dark:bg-card-dark text-gray-700 dark:text-gray-200 border-gray-100 dark:border-gray-700 rounded-bl-sm shadow-card'
                            }`}>
                              <p className="whitespace-pre-wrap">{message.content}</p>
                              <span className={`block mt-1 text-[10px] ${message.role === 'user' ? 'text-gray-500' : 'text-gray-400'}`}>{message.time}</span>
                            </div>
                          </div>
                          {/* Suggested chips after welcome */}
                          {message.role === 'assistant' && idx === 0 && copilotMessages.length === 1 && !isCopilotSending && (
                            <div className="flex flex-wrap gap-1.5 pl-8 pt-0.5">
                              {suggestedQuestions.map(q => (
                                <button
                                  key={q}
                                  onClick={() => handleCopilotSubmit(q)}
                                  className="text-[11px] px-2.5 py-1.5 rounded-full border border-secondary/30 text-secondary hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-secondary transition-all font-medium"
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
                          )}
                        </React.Fragment>
                      ))
                    )}
                    {isCopilotSending && (
                      <div className="flex justify-start">
                        <div className="bg-white dark:bg-card-dark border border-gray-100 dark:border-gray-700 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5 shadow-card">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]"></span>
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]"></span>
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"></span>
                        </div>
                      </div>
                    )}
                    <div ref={copilotBottomRef} />
                  </div>

                  {/* Copilot input */}
                  <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark flex-shrink-0">
                    <div className="relative bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center p-2 focus-within:ring-2 focus-within:ring-secondary/20 focus-within:border-secondary transition-all shadow-card">
                      <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg">
                        <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                      </button>
                      <input
                        ref={copilotInputRef}
                        value={copilotInput}
                        onChange={e => setCopilotInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCopilotSubmit(); }
                        }}
                        disabled={!selectedId || isCopilotSending}
                        className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-sm text-gray-800 dark:text-gray-200 px-2 h-9 disabled:opacity-50"
                        placeholder="Ask Copilot about this case..."
                        type="text"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleCopilotSubmit}
                          disabled={!copilotInput.trim() || isCopilotSending}
                          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg disabled:opacity-40"
                        >
                          <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Details tab */
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  <div className="p-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Case Attributes</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div><span className="text-[10px] uppercase tracking-wider text-gray-500">Order ID</span><div className="text-xs font-bold text-gray-900 dark:text-white">{rootData.orderId}</div></div>
                      <div><span className="text-[10px] uppercase tracking-wider text-gray-500">Customer</span><div className="text-xs font-bold text-gray-900 dark:text-white">{rootData.customerName}</div></div>
                      <div><span className="text-[10px] uppercase tracking-wider text-gray-500">Status</span><div className="text-xs font-bold text-red-600 dark:text-red-400">{formatStatus(caseState?.case?.status || rootData.status)}</div></div>
                      <div><span className="text-[10px] uppercase tracking-wider text-gray-500">Risk Level</span><div className="text-xs font-bold text-orange-600 dark:text-orange-400">{riskLabel}</div></div>
                    </div>
                    <div className="mt-4">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Impacted Branches</span>
                      {impactedBranches.length ? (
                        <div className="space-y-1.5">
                          {impactedBranches.map(branch => (
                            <button
                              key={branch.id}
                              onClick={() => onPageChange(branch.page)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group shadow-sm"
                            >
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${branch.status === 'critical' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-orange-50 dark:bg-orange-900/20'}`}>
                                <span className={`material-symbols-outlined text-[15px] ${branch.status === 'critical' ? 'text-red-500' : 'text-orange-500'}`}>{branch.icon}</span>
                              </div>
                              <span className="flex-1 text-xs font-semibold text-gray-700 dark:text-gray-300 text-left">{branch.label}</span>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className={`w-1.5 h-1.5 rounded-full ${branch.status === 'critical' ? 'bg-red-500' : 'bg-orange-400'}`} />
                                <span className={`text-[10px] font-bold uppercase ${branch.status === 'critical' ? 'text-red-500' : 'text-orange-500'}`}>{branch.status}</span>
                              </div>
                              <span className="material-symbols-outlined text-[14px] text-gray-300 group-hover:text-gray-500 transition-colors">chevron_right</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                          All branches healthy
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Operational Links</h3>
                    <div className="space-y-2">
                      {links.map((link: any) => (
                        <a key={link.label} href={link.href} className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">hub</span>
                            {link.label}
                          </div>
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                        </a>
                      ))}
                      {!links.length && <p className="text-xs text-gray-500">No integration links observed yet.</p>}
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Related Cases</h3>
                    <div className="space-y-2">
                      {relatedCases.map((item: any) => (
                        <div key={item.id} className="p-2 rounded border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-gray-900 dark:text-white">{item.case_number}</span>
                            <span className="text-[10px] text-gray-500">{formatStatus(item.type)}</span>
                          </div>
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[9px] font-bold rounded uppercase">{formatStatus(item.status)}</span>
                        </div>
                      ))}
                      {!relatedCases.length && <p className="text-xs text-gray-500">No linked cases.</p>}
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Internal Notes</h3>
                    <div className="space-y-3">
                      {internalNotes.map((note: any) => (
                        <div key={note.id} className="p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg border border-yellow-100 dark:border-yellow-800/20">
                          <p className="text-xs text-yellow-900 dark:text-yellow-100 leading-relaxed italic">{note.content}</p>
                          <div className="mt-2 flex justify-between items-center text-[10px] text-yellow-700/70">
                            <span>{note.created_by || 'System'}</span>
                            <span>{note.created_at ? new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                        </div>
                      ))}
                      {!internalNotes.length && <p className="text-xs text-gray-500">No internal notes yet.</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function iconForBranch(key: string) {
  const iconMap: Record<string, string> = {
    orders: 'shopping_bag', payments: 'payments', returns: 'assignment_return',
    fulfillment: 'local_shipping', approvals: 'check_circle', workflows: 'account_tree',
    knowledge: 'description', integrations: 'hub',
  };
  return iconMap[key] || 'widgets';
}
