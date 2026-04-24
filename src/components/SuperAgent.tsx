import React, { useEffect, useRef, useState } from 'react';
import { superAgentApi } from '../api/client';
import type { NavigateFn, NavigationTarget, Page } from '../types';

type MessageSection = {
  title: string;
  items: string[];
};

type AgentCard = {
  slug: string;
  name: string;
  runtime?: string | null;
  mode?: string | null;
  status: 'available' | 'consulted' | 'proposed' | 'executed' | 'blocked';
  summary: string;
};

type SuperAgentAction = {
  id: string;
  type: 'navigate' | 'execute';
  label: string;
  description: string;
  targetPage?: string;
  focusId?: string | null;
  navigationTarget?: NavigationTarget | null;
  permission?: string;
  allowed?: boolean;
  sensitive?: boolean;
  requiresConfirmation?: boolean;
  blockedReason?: string | null;
  payload?: Record<string, any>;
};

type ContextPanel = {
  entityType: string;
  entityId?: string | null;
  title: string;
  subtitle: string;
  status?: string | null;
  risk?: string | null;
  description?: string | null;
  facts: Array<{ label: string; value: string }>;
  evidence: Array<{ label: string; value: string; tone?: 'neutral' | 'warning' | 'success' }>;
  timeline: Array<{ label: string; value: string; time?: string | null }>;
  related: Array<{ label: string; value: string; targetPage?: string; focusId?: string | null; navigationTarget?: NavigationTarget | null }>;
};

type StreamStep = {
  id: string;
  label: string;
  status: 'running' | 'completed' | 'failed';
  detail?: string | null;
};

type AssistantPayload = {
  id: string;
  input: string;
  summary: string;
  statusLine: string;
  sections: MessageSection[];
  actions: SuperAgentAction[];
  contextPanel: ContextPanel | null;
  agents: AgentCard[];
  suggestedReplies: string[];
  consultedModules: string[];
  facts?: string[];
  conflicts?: string[];
  sources?: string[];
  evidence?: string[];
  steps?: StreamStep[];
  runId?: string | null;
  structuredIntent?: Record<string, any> | null;
  navigationTarget?: NavigationTarget | null;
};

type PermissionMatrix = {
  roleId: string;
  accessLevel: string;
  canRead: Record<string, boolean>;
  canWrite: Record<string, boolean>;
  preview: string[];
};

type BootstrapData = {
  welcomeTitle: string;
  welcomeSubtitle: string;
  permissionMatrix: PermissionMatrix;
  overview: Array<{ label: string; value: string; detail: string }>;
  quickActions: string[];
  contextPanel: ContextPanel;
  localAgents: Array<{ slug: string; name: string; runtime?: string; mode?: string }>;
};

type ConversationMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; payload: AssistantPayload; muted?: boolean };

type StreamActivity = {
  runId: string;
  statusLine: string;
  text: string;
  steps: StreamStep[];
  agents: AgentCard[];
  error?: string | null;
};

interface SuperAgentProps {
  onNavigate?: NavigateFn;
  activeTarget?: NavigationTarget;
}

function normalizeAssistantPayload(payload: Partial<AssistantPayload> & Record<string, any>, fallbackInput: string, fallbackRunId?: string | null): AssistantPayload {
  const consultedModules = Array.isArray(payload.consultedModules)
    ? [...new Set(payload.consultedModules.map((item) => String(item)).filter(Boolean))]
    : [];
  const agents = Array.isArray(payload.agents)
    ? payload.agents.map((agent: any) => ({
        slug: String(agent.slug || 'agent'),
        name: String(agent.name || 'Agent'),
        runtime: agent.runtime || null,
        mode: agent.mode || null,
        status: (agent.status || 'consulted') as AgentCard['status'],
        summary: String(agent.summary || 'Completed.'),
      })) as AgentCard[]
    : [];
  const steps = Array.isArray(payload.steps)
    ? payload.steps.map((step: any, index: number) => ({
        id: String(step.id || `step-${index}`),
        label: String(step.label || 'Step'),
        status: step.status === 'failed' ? 'failed' : step.status === 'running' ? 'running' : 'completed',
        detail: step.detail ? String(step.detail) : null,
      })) as StreamStep[]
    : [];
  const actions = Array.isArray(payload.actions)
    ? payload.actions.map((action: any, index: number) => ({
        id: String(action.id || `action-${index}`),
        type: (action.type === 'execute' ? 'execute' : 'navigate') as SuperAgentAction['type'],
        label: String(action.label || 'Open'),
        description: String(action.description || ''),
        targetPage: action.targetPage || undefined,
        focusId: action.focusId ?? null,
        navigationTarget: action.navigationTarget || null,
        permission: action.permission,
        allowed: action.allowed !== false,
        sensitive: action.sensitive === true,
        requiresConfirmation: action.requiresConfirmation === true,
        blockedReason: action.blockedReason ?? null,
        payload: action.payload || undefined,
      })) as SuperAgentAction[]
    : [];

  return {
    id: String(payload.id || `assistant-${Date.now()}`),
    input: String(payload.input || fallbackInput || ''),
    summary: String(payload.summary || payload.question || payload.error || 'Super Agent is ready.'),
    statusLine: String(payload.statusLine || ''),
    sections: Array.isArray(payload.sections)
      ? payload.sections.map((section: any, index: number) => ({
          title: String(section.title || `Section ${index + 1}`),
          items: Array.isArray(section.items) ? section.items.map((item: any) => String(item)) : [],
        }))
      : [],
    actions,
    contextPanel: payload.contextPanel || null,
    agents,
    suggestedReplies: Array.isArray(payload.suggestedReplies) ? payload.suggestedReplies.map((item: any) => String(item)) : [],
    consultedModules,
    facts: Array.isArray(payload.facts) ? payload.facts.map((item: any) => String(item)) : undefined,
    conflicts: Array.isArray(payload.conflicts) ? payload.conflicts.map((item: any) => String(item)) : undefined,
    sources: Array.isArray(payload.sources) ? payload.sources.map((item: any) => String(item)) : undefined,
    evidence: Array.isArray(payload.evidence) ? payload.evidence.map((item: any) => String(item)) : undefined,
    steps,
    runId: payload.runId ?? fallbackRunId ?? null,
    structuredIntent: payload.structuredIntent || null,
    navigationTarget: payload.navigationTarget || null,
  };
}

function fallbackNavigationTarget(page?: string, entityId?: string | null): NavigationTarget | null {
  if (!page) return null;
  const normalizedPage = page as Page;
  const entityType =
    normalizedPage === 'orders' ? 'order'
    : normalizedPage === 'payments' ? 'payment'
    : normalizedPage === 'returns' ? 'return'
    : normalizedPage === 'approvals' ? 'approval'
    : normalizedPage === 'customers' ? 'customer'
    : normalizedPage === 'workflows' ? 'workflow'
    : normalizedPage === 'case_graph' || normalizedPage === 'inbox' ? 'case'
    : 'workspace';
  return { page: normalizedPage, entityType, entityId: entityId ?? null, section: null, sourceContext: 'super_agent', runId: null };
}

function dedupeTargets(targets: Array<NavigationTarget | null | undefined>) {
  const seen = new Set<string>();
  return targets.filter((t): t is NavigationTarget => {
    if (!t?.page) return false;
    const key = [t.page, t.entityType || '', t.entityId || '', t.section || ''].join('::');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pageFromContextPanel(entityType?: string | null): Page {
  switch (entityType) {
    case 'case': return 'case_graph';
    case 'order': return 'orders';
    case 'payment': return 'payments';
    case 'return': return 'returns';
    case 'approval': return 'approvals';
    case 'customer': return 'customers';
    case 'workflow': return 'workflows';
    default: return 'super_agent';
  }
}

function assistantFromError(input: string, message: string): AssistantPayload {
  return { id: `assistant-error-${Date.now()}`, input, summary: message, statusLine: '', sections: [], actions: [], contextPanel: null, agents: [], suggestedReplies: ['Retry', 'Open pending approvals'], consultedModules: [] };
}

function assistantFromExecution(summary: string, sectionTitle: string, items: string[], actions: SuperAgentAction[] = []): AssistantPayload {
  return { id: `assistant-exec-${Date.now()}`, input: '', summary, statusLine: '', sections: [{ title: sectionTitle, items }], actions, contextPanel: null, agents: [], suggestedReplies: [], consultedModules: [] };
}

// ── Plan Engine response → AssistantPayload mapper ───────────────────────────

function planResponseToPayload(planResp: any, trace: any): AssistantPayload {
  const commandResponse = trace?.commandResponse || planResp?.plan?.commandResponse || null;
  if (commandResponse) {
    return normalizeAssistantPayload(
      commandResponse,
      commandResponse.input || planResp?.plan?.responseTemplate || '',
      commandResponse.runId || trace?.runId || planResp?.plan?.planId || null,
    );
  }

  const id = `assistant-plan-${Date.now()}`;
  const status = trace?.status ?? 'success';
  const summary = trace?.summary ?? planResp?.plan?.rationale ?? '';

  const steps: StreamStep[] = (trace?.spans ?? []).map((span: any) => ({
    id: span.stepId,
    label: span.tool,
    status: span.result?.ok ? 'completed' : 'failed',
    detail: span.result?.ok
      ? JSON.stringify(span.result?.value ?? '').slice(0, 120)
      : span.result?.error,
  }));

  const actions: SuperAgentAction[] = (trace?.approvalIds ?? []).map((apId: string) => ({
    id: `nav-approval-${apId}`,
    type: 'navigate' as const,
    label: 'Review approval',
    description: 'This action requires human approval.',
    targetPage: 'approvals',
    focusId: apId,
    navigationTarget: { page: 'approvals', entityType: 'approval', entityId: apId, section: null, sourceContext: 'plan_engine', runId: null },
    allowed: true,
  }));

  const statusLine =
    status === 'pending_approval' ? 'Waiting for approval'
    : status === 'rejected_by_policy' ? 'Blocked by policy'
    : status === 'failed' ? 'Execution failed'
    : '';

  return normalizeAssistantPayload({
    id,
    input: '',
    summary,
    statusLine,
    sections: [],
    actions,
    contextPanel: null,
    agents: [],
    suggestedReplies: [],
    consultedModules: [...new Set((trace?.spans ?? []).map((s: any) => String(s.tool?.split('.')[0] ?? '')))].filter(Boolean) as string[],
    steps,
    runId: trace?.runId || planResp?.plan?.planId || null,
  }, '', trace?.runId || planResp?.plan?.planId || null);
}

function clarificationToPayload(question: string): AssistantPayload {
  return {
    id: `assistant-clarify-${Date.now()}`,
    input: '',
    summary: question,
    statusLine: '',
    sections: [],
    actions: [],
    contextPanel: null,
    agents: [],
    suggestedReplies: [],
    consultedModules: [],
  };
}

function compactList(items: Array<string | null | undefined>, separator = ' · ') {
  return items.map((item) => String(item || '').trim()).filter(Boolean).join(separator);
}

export default function SuperAgent({ onNavigate, activeTarget }: SuperAgentProps) {
  const activeSection = activeTarget?.section || 'command-center';

  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrix | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [contextPanel, setContextPanel] = useState<ContextPanel | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [mode, setMode] = useState<'investigate' | 'operate'>('investigate');
  const [pendingAction, setPendingAction] = useState<SuperAgentAction | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [streamActivity, setStreamActivity] = useState<StreamActivity | null>(null);
  const [isStreamConnected, setIsStreamConnected] = useState(false);
  const [planSessionId, setPlanSessionId] = useState<string | null>(null);
  const [recentTraces, setRecentTraces] = useState<Array<{ planId: string; status: string; summary: string; startedAt: string; endedAt: string }>>([]);
  const [traceMetrics, setTraceMetrics] = useState<{ total: number; success: number; partial: number; failed: number; pendingApproval: number; rejectedByPolicy: number; averageLatencyMs: number; averageSpanCount: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamRunIdRef = useRef<string | null>(null);
  const streamMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await superAgentApi.bootstrap();
        if (cancelled) return;
        setBootstrap(data);
        setPermissionMatrix(data.permissionMatrix);
        setContextPanel(data.contextPanel || null);
      } catch (error) {
        if (cancelled) return;
        const fallback = assistantFromError('', error instanceof Error ? error.message : 'Unable to load Super Agent.');
        setMessages([{ id: fallback.id, role: 'assistant', payload: fallback, muted: true }]);
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadReplay() {
      if (!planSessionId || (activeSection !== 'live-runs' && activeSection !== 'guardrails')) {
        setRecentTraces([]);
        return;
      }
      try {
        const data = await superAgentApi.sessionTraces(planSessionId, 5);
        if (cancelled) return;
        setRecentTraces(Array.isArray(data?.traces) ? data.traces : []);
      } catch {
        if (!cancelled) setRecentTraces([]);
      }
    }
    void loadReplay();
    return () => {
      cancelled = true;
    };
  }, [activeSection, planSessionId]);

  useEffect(() => {
    let cancelled = false;
    async function loadMetrics() {
      if (activeSection !== 'live-runs' && activeSection !== 'guardrails') {
        setTraceMetrics(null);
        return;
      }
      try {
        const data = await superAgentApi.metrics(planSessionId ?? undefined);
        if (!cancelled) setTraceMetrics(data?.metrics || null);
      } catch {
        if (!cancelled) setTraceMetrics(null);
      }
    }
    void loadMetrics();
    return () => {
      cancelled = true;
    };
  }, [activeSection, planSessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pendingAction, flashMessage, isSending, streamActivity]);

  useEffect(() => {
    const source = new EventSource('/api/sse/agent-runs');
    const parseData = (e: MessageEvent) => { try { return JSON.parse(e.data || '{}'); } catch { return {}; } };
    const updateIfCurrent = (e: MessageEvent, fn: (d: any, c: StreamActivity) => StreamActivity) => {
      const data = parseData(e);
      setStreamActivity((cur) => (!cur || data.runId !== cur.runId) ? cur : fn(data, cur));
    };
    source.addEventListener('connected', () => setIsStreamConnected(true) as any);
    source.addEventListener('super-agent:run_started', ((e: MessageEvent) => {
      const data = parseData(e);
      setStreamActivity((cur) => (!cur || data.runId !== cur.runId) ? cur : { ...cur, statusLine: 'Connecting modules...' });
    }) as EventListener);
    source.addEventListener('super-agent:message_chunk', ((e: MessageEvent) => {
      updateIfCurrent(e, (d, c) => ({ ...c, text: `${c.text}${d.chunk || ''}` }));
    }) as EventListener);
    source.addEventListener('super-agent:step_started', ((e: MessageEvent) => {
      updateIfCurrent(e, (d, c) => ({ ...c, statusLine: d.step?.label || c.statusLine, steps: [...c.steps.filter((s) => s.id !== d.step?.id), d.step].filter(Boolean) }));
    }) as EventListener);
    source.addEventListener('super-agent:step_completed', ((e: MessageEvent) => {
      updateIfCurrent(e, (d, c) => ({ ...c, statusLine: d.step?.label || 'Done', steps: [...c.steps.filter((s) => s.id !== d.step?.id), d.step].filter(Boolean) }));
    }) as EventListener);
    source.addEventListener('super-agent:agent_called', ((e: MessageEvent) => {
      updateIfCurrent(e, (d, c) => ({ ...c, agents: [...c.agents.filter((a) => a.slug !== d.agent?.slug), { slug: d.agent?.slug || 'agent', name: d.agent?.name || 'Agent', runtime: d.agent?.runtime || null, mode: d.agent?.mode || null, status: d.agent?.status || 'consulted', summary: 'Consulting...' }] }));
    }) as EventListener);
    source.addEventListener('super-agent:agent_result', ((e: MessageEvent) => {
      updateIfCurrent(e, (d, c) => ({ ...c, agents: [...c.agents.filter((a) => a.slug !== d.agent?.slug), { slug: d.agent?.slug || 'agent', name: d.agent?.name || 'Agent', runtime: null, mode: null, status: d.agent?.status || 'consulted', summary: d.agent?.summary || 'Completed.' }] }));
    }) as EventListener);
    source.addEventListener('super-agent:run_finished', ((e: MessageEvent) => {
      updateIfCurrent(e, (d, c) => ({ ...c, statusLine: d.statusLine || 'Done' }));
    }) as EventListener);
    source.addEventListener('super-agent:run_failed', ((e: MessageEvent) => {
      updateIfCurrent(e, (d, c) => ({ ...c, error: d.error || 'Run failed.', statusLine: 'Failed' }));
    }) as EventListener);
    source.onerror = () => setIsStreamConnected(false);
    return () => { source.close(); };
  }, []);

  useEffect(() => {
    const messageId = streamMessageIdRef.current;
    if (!streamActivity || !messageId) return;
    setMessages((current) => current.map((message) => {
      if (message.role !== 'assistant' || message.payload.id !== messageId) return message;
      const payload = normalizeAssistantPayload({
        ...message.payload,
        summary: streamActivity.text || 'Thinking through your request...',
        statusLine: streamActivity.statusLine || 'Thinking',
        steps: streamActivity.steps,
        agents: streamActivity.agents,
        runId: streamActivity.runId,
      }, message.payload.input, streamActivity.runId);
      return { ...message, payload };
    }));
  }, [streamActivity]);

  function buildCommandContext() {
    const latest = [...messages].reverse().find((m) => m.role === 'assistant') as Extract<ConversationMessage, { role: 'assistant' }> | undefined;
    const recentTargets = dedupeTargets([
      activeTarget,
      contextPanel?.entityType && contextPanel?.entityId ? { page: fallbackNavigationTarget(pageFromContextPanel(contextPanel.entityType), contextPanel.entityId)?.page || 'super_agent', entityType: contextPanel.entityType, entityId: contextPanel.entityId, section: null, sourceContext: 'context_panel', runId: latest?.payload.runId || null } : null,
      latest?.payload.navigationTarget || null,
      ...(latest?.payload.actions || []).map((a) => a.navigationTarget || fallbackNavigationTarget(a.targetPage, a.focusId ?? null)),
    ]);
    return { sessionId: planSessionId, activeTarget: activeTarget || null, recentTargets, lastStructuredIntent: latest?.payload.structuredIntent || null };
  }

  async function sendPrompt(promptOverride?: string) {
    const prompt = (promptOverride ?? composerText).trim();
    if (!prompt || isSending || isExecuting) return;
    const finalPrompt = mode === 'operate' && !promptOverride ? `Operate: ${prompt}` : prompt;
    setComposerText('');
    setPendingAction(null);
    setFlashMessage(null);
    setIsSending(true);
    const runId = window.crypto?.randomUUID?.() || `run-${Date.now()}`;
    const livePayload = normalizeAssistantPayload({
      id: `assistant-live-${runId}`,
      input: finalPrompt,
      summary: 'Thinking through your request...',
      statusLine: isStreamConnected ? 'Thinking' : 'Connecting',
      sections: [],
      actions: [],
      contextPanel: null,
      agents: [],
      suggestedReplies: [],
      consultedModules: [],
      steps: [],
      runId,
    }, finalPrompt, runId);
    streamRunIdRef.current = runId;
    streamMessageIdRef.current = livePayload.id;
    setMessages((c) => [
      ...c,
      { id: `user-${Date.now()}`, role: 'user', text: finalPrompt },
      { id: livePayload.id, role: 'assistant', payload: livePayload },
    ]);
    setStreamActivity({ runId, statusLine: isStreamConnected ? 'Connecting...' : 'Waiting...', text: '', steps: [], agents: [], error: null });

    try {
      const result = await superAgentApi.command(finalPrompt, { runId, mode, context: buildCommandContext() });
      if (result.sessionId) setPlanSessionId(result.sessionId);
      const payload = normalizeAssistantPayload(result.response as Partial<AssistantPayload>, finalPrompt, result.response?.runId || runId);
      const liveMessageId = streamMessageIdRef.current;
      setMessages((c) => c.map((message) => (
        message.role === 'assistant' && message.payload.id === liveMessageId
          ? { id: payload.id, role: 'assistant', payload }
          : message
      )));
      setPermissionMatrix(result.permissionMatrix || null);
      if (payload.contextPanel) setContextPanel(payload.contextPanel);
      setStreamActivity(null);
    } catch (error) {
      const fallback = assistantFromError(finalPrompt, error instanceof Error ? error.message : 'Unable to process command.');
      const liveMessageId = streamMessageIdRef.current;
      setMessages((c) => c.map((message) => (
        message.role === 'assistant' && message.payload.id === liveMessageId
          ? { id: fallback.id, role: 'assistant', payload: fallback }
          : message
      )));
      setStreamActivity(null);
    } finally {
      setIsSending(false);
      streamRunIdRef.current = null;
      streamMessageIdRef.current = null;
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction?.payload || isExecuting) return;
    setIsExecuting(true);
    setFlashMessage(null);
    const runId = window.crypto?.randomUUID?.() || `run-${Date.now()}`;
    streamRunIdRef.current = runId;
    setStreamActivity({ runId, statusLine: 'Executing...', text: '', steps: [], agents: [], error: null });
    try {
      const result = await superAgentApi.execute(pendingAction.payload, true, { runId, sourceContext: 'super_agent_confirmation' });
      if (result.ok) {
        const update = assistantFromExecution(`${pendingAction.label} completed.`, 'Result', [pendingAction.description, 'Change recorded in the audit trail.']);
        setMessages((c) => [...c, { id: update.id, role: 'assistant', payload: update }]);
        setStreamActivity(null);
        const refreshPrompt = pendingAction.payload.kind === 'approval.decide' ? 'Pending approvals' : `${pendingAction.payload.entityType} ${pendingAction.payload.entityId}`;
        const refreshed = await superAgentApi.command(refreshPrompt, { runId: window.crypto?.randomUUID?.() || `run-${Date.now()}`, mode: 'investigate', context: buildCommandContext() });
        const rp = normalizeAssistantPayload(refreshed.response as Partial<AssistantPayload>, refreshPrompt, refreshed.response?.runId || null);
        setMessages((c) => [...c, { id: rp.id, role: 'assistant', payload: rp, muted: true }]);
        setPermissionMatrix(refreshed.permissionMatrix || null);
        if (rp.contextPanel) setContextPanel(rp.contextPanel);
      } else if (result.approvalRequired) {
        const approvalId = result.approval?.id || 'pending';
        const msg = assistantFromExecution('Action routed to approval.', 'Guardrail applied', ['Action crossed a sensitive threshold.', `Approval created: ${approvalId}.`], [{
          id: `nav-approval-${approvalId}`, type: 'navigate', label: 'Open approvals', description: 'Review the approval request.',
          targetPage: 'approvals', focusId: approvalId,
          navigationTarget: { page: 'approvals', entityType: 'approval', entityId: approvalId, section: null, sourceContext: 'super_agent_approval', runId },
        }]);
        setMessages((c) => [...c, { id: msg.id, role: 'assistant', payload: msg }]);
        setFlashMessage('Approval created.');
        setStreamActivity(null);
      } else {
        const failure = assistantFromExecution('Action blocked.', 'Blocked', [result.error || pendingAction.blockedReason || 'Action could not be executed.']);
        setMessages((c) => [...c, { id: failure.id, role: 'assistant', payload: failure }]);
        setStreamActivity((c) => c ? { ...c, error: failure.summary, statusLine: 'Blocked' } : null);
      }
    } catch (error) {
      const failure = assistantFromExecution('Action failed.', 'Error', [error instanceof Error ? error.message : 'Unexpected failure.']);
      setMessages((c) => [...c, { id: failure.id, role: 'assistant', payload: failure }]);
      setStreamActivity((c) => c ? { ...c, error: failure.summary, statusLine: 'Failed' } : null);
    } finally {
      setPendingAction(null);
      setIsExecuting(false);
      streamRunIdRef.current = null;
    }
  }

  function navigateToTarget(target?: NavigationTarget | null, fallbackPage?: string, fallbackId?: string | null) {
    const resolved = target || fallbackNavigationTarget(fallbackPage, fallbackId);
    if (resolved) onNavigate?.(resolved);
  }

  function handleAction(action: SuperAgentAction) {
    if (action.type === 'navigate') { navigateToTarget(action.navigationTarget, action.targetPage, action.focusId ?? null); return; }
    if (!action.allowed) { setFlashMessage(action.blockedReason || 'Permission denied.'); return; }
    setPendingAction(action);
    setFlashMessage(null);
  }

  const emptyHints =
    activeSection === 'live-runs'
      ? ['Review pending payments', 'Open pending approvals']
      : activeSection === 'guardrails'
      ? ['Explain why an action is blocked', 'Open pending approvals']
      : (bootstrap?.quickActions || []).slice(0, 3);

  const sectionTitle =
    activeSection === 'live-runs' ? 'Live Runs'
    : activeSection === 'guardrails' ? 'Guardrails'
    : 'Super Agent';

  const sectionSubtitle =
    activeSection === 'live-runs' ? 'Monitor active agent runs and execution steps.'
    : activeSection === 'guardrails' ? 'Review permissions, approvals, and sensitive action guardrails.'
    : 'Investigate, cross-reference, and act across the entire workspace.';

  const showObservabilityPanel = activeSection === 'live-runs' || activeSection === 'guardrails';

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="relative flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-52 pt-10">
          <div className="mx-auto flex max-w-2xl flex-col gap-6">

            {/* Loading */}
            {isBootstrapping ? (
              <div className="flex justify-center py-20">
                <div className="flex gap-1.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300" />
                </div>
              </div>
            ) : null}

            {/* Empty state */}
            {!isBootstrapping && messages.length === 0 ? (
              <div className="flex flex-col items-center text-center pt-16 pb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-white dark:bg-white dark:text-black">
                  <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                </div>
                <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">{sectionTitle}</h2>
                <p className="mt-1.5 text-sm text-gray-400 dark:text-gray-500 max-w-xs">{sectionSubtitle}</p>
                {emptyHints.length > 0 ? (
                  <div className="mt-8 flex flex-wrap justify-center gap-2">
                    {emptyHints.map((hint) => (
                      <button
                        key={hint}
                        type="button"
                        onClick={() => void sendPrompt(hint)}
                        className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!isBootstrapping && showObservabilityPanel && recentTraces.length > 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 text-left dark:border-gray-700 dark:bg-gray-900/50">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-400">Recent traces</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Latest plan executions for this session.</p>
                  </div>
                  {planSessionId ? <span className="text-[11px] text-gray-400 break-all">{planSessionId}</span> : null}
                </div>
                <div className="mt-3 space-y-2">
                  {recentTraces.map((trace) => (
                    <div key={trace.planId} className="rounded-xl bg-white px-3 py-2 shadow-sm dark:bg-gray-950/60">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{trace.summary || trace.planId}</p>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-300">{trace.status}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-400">
                        {trace.startedAt ? new Date(trace.startedAt).toLocaleString() : 'N/A'}
                        {trace.endedAt ? ` · ${new Date(trace.endedAt).toLocaleTimeString()}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {!isBootstrapping && showObservabilityPanel && traceMetrics ? (
              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm dark:border-gray-700 dark:bg-gray-950/60 md:grid-cols-4">
                {[
                  ['Total', traceMetrics.total],
                  ['Success', traceMetrics.success],
                  ['Pending', traceMetrics.pendingApproval],
                  ['Failed', traceMetrics.failed],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/60">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-gray-400">{label}</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{String(value)}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Messages */}
            {messages.map((msg) =>
              msg.role === 'user' ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-lg rounded-2xl bg-gray-100 px-4 py-3 text-sm leading-6 text-gray-900 dark:bg-gray-800 dark:text-white">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className={msg.muted ? 'opacity-50' : ''}>
                  <div className="max-w-2xl space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                      <span className="font-medium text-gray-700 dark:text-gray-300">Super Agent</span>
                      {msg.payload.statusLine ? <span>{msg.payload.statusLine}</span> : null}
                      {msg.payload.runId ? <span>Run {msg.payload.runId.slice(0, 8)}</span> : null}
                    </div>

                    <p className="text-[15px] leading-7 text-gray-900 dark:text-white">{msg.payload.summary}</p>

                    {compactList([
                      msg.payload.consultedModules.length ? `Data: ${compactList(msg.payload.consultedModules, ', ')}` : null,
                      msg.payload.agents.length ? `Agents: ${compactList(msg.payload.agents.map((agent) => agent.name), ', ')}` : null,
                      msg.payload.steps?.length ? `Thinking: ${compactList(msg.payload.steps.slice(0, 2).map((step) => step.detail ? step.detail : step.label), ' · ')}` : null,
                    ], ' · ') ? (
                      <p className="text-[12px] leading-6 text-gray-500 dark:text-gray-400">
                        {compactList([
                          msg.payload.consultedModules.length ? `Data: ${compactList(msg.payload.consultedModules, ', ')}` : null,
                          msg.payload.agents.length ? `Agents: ${compactList(msg.payload.agents.map((agent) => agent.name), ', ')}` : null,
                          msg.payload.steps?.length ? `Thinking: ${compactList(msg.payload.steps.slice(0, 2).map((step) => step.detail ? step.detail : step.label), ' · ')}` : null,
                        ], ' · ')}
                      </p>
                    ) : null}

                    {msg.payload.actions.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {msg.payload.actions.slice(0, 2).map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            onClick={() => handleAction(action)}
                            disabled={action.allowed === false}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
                              action.type === 'navigate'
                                ? 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                            }`}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {msg.payload.suggestedReplies.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {msg.payload.suggestedReplies.slice(0, 2).map((reply) => (
                          <button
                            key={`${msg.id}-${reply}`}
                            type="button"
                            onClick={() => void sendPrompt(reply)}
                            className="rounded-full border border-gray-200 px-3 py-1 text-[11px] text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                          >
                            {reply}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input — pinned bottom */}
        <div className="absolute inset-x-0 bottom-0 px-6 pb-6 pt-16 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-card-dark dark:via-card-dark/95">
          <div className="mx-auto max-w-2xl">

            {flashMessage ? (
              <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">{flashMessage}</p>
            ) : null}

            {pendingAction ? (
              <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                <p className="text-xs text-gray-500 dark:text-gray-400">{pendingAction.description}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setPendingAction(null)} className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">
                    Cancel
                  </button>
                  <button type="button" onClick={() => void confirmPendingAction()} disabled={isExecuting} className="rounded-lg bg-black px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black">
                    {isExecuting ? 'Executing...' : `Confirm — ${pendingAction.label}`}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <textarea
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendPrompt(); } }}
                placeholder={
                  mode === 'operate'
                    ? 'Ask to update, refund, cancel, or publish...'
                    : 'Ask about an order, payment, customer, case, or approval...'
                }
                rows={2}
                className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
              />
              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setMode('investigate')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      mode === 'investigate' ? 'bg-gray-900 text-white dark:bg-white dark:text-black' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Investigate
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('operate')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      mode === 'operate' ? 'bg-secondary text-white' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Operate
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void sendPrompt()}
                  disabled={!composerText.trim() || isSending || isExecuting}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-white transition-opacity hover:opacity-80 disabled:opacity-30 dark:bg-white dark:text-black"
                >
                  <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
