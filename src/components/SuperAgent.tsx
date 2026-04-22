import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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

function roleTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('manager')) return 'bg-black text-white dark:bg-white dark:text-black';
  if (normalized.includes('operator')) return 'bg-secondary text-white';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200';
}

function statusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('warning') || normalized.includes('pending') || normalized.includes('blocked')) {
    return 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40';
  }
  if (normalized.includes('success') || normalized.includes('resolved') || normalized.includes('approved') || normalized.includes('executed')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/40';
  }
  if (normalized.includes('high') || normalized.includes('critical') || normalized.includes('risk')) {
    return 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800/40';
  }
  return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700';
}

function assistantFromError(input: string, message: string): AssistantPayload {
  return {
    id: `assistant-error-${Date.now()}`,
    input,
    summary: message,
    statusLine: 'Command center unavailable',
    sections: [
      {
        title: 'What happened',
        items: [
          'The Super Agent backend did not return a valid response.',
          'You can retry the command or navigate to a structured module.',
        ],
      },
    ],
    actions: [],
    contextPanel: null,
    agents: [],
    suggestedReplies: ['Retry command', 'Open pending approvals', 'Search for an order'],
    consultedModules: [],
  };
}

function assistantFromExecution(summary: string, sectionTitle: string, items: string[], actions: SuperAgentAction[] = []): AssistantPayload {
  return {
    id: `assistant-exec-${Date.now()}`,
    input: '',
    summary,
    statusLine: 'Execution update',
    sections: [{ title: sectionTitle, items }],
    actions,
    contextPanel: null,
    agents: [],
    suggestedReplies: [],
    consultedModules: [],
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

  return {
    page: normalizedPage,
    entityType,
    entityId: entityId ?? null,
    section: null,
    sourceContext: 'super_agent',
    runId: null,
  };
}

function dedupeTargets(targets: Array<NavigationTarget | null | undefined>) {
  const seen = new Set<string>();
  return targets.filter((target): target is NavigationTarget => {
    if (!target?.page) return false;
    const key = [target.page, target.entityType || '', target.entityId || '', target.section || ''].join('::');
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
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [streamActivity, setStreamActivity] = useState<StreamActivity | null>(null);
  const [isStreamConnected, setIsStreamConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamRunIdRef = useRef<string | null>(null);

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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pendingAction, flashMessage, isSending, streamActivity]);

  useEffect(() => {
    const source = new EventSource('/api/sse/agent-runs');

    const handleConnected = () => setIsStreamConnected(true);
    const handleFailure = () => setIsStreamConnected(false);
    const parseData = (event: MessageEvent) => {
      try { return JSON.parse(event.data || '{}'); } catch { return {}; }
    };
    const updateIfCurrent = (event: MessageEvent, updater: (data: any, current: StreamActivity) => StreamActivity) => {
      const data = parseData(event);
      setStreamActivity((current) => {
        if (!current || data.runId !== current.runId) return current;
        return updater(data, current);
      });
    };

    source.addEventListener('connected', handleConnected as EventListener);
    source.addEventListener('super-agent:run_started', ((event: MessageEvent) => {
      const data = parseData(event);
      setStreamActivity((current) => {
        if (!current || data.runId !== current.runId) return current;
        return { ...current, statusLine: 'Connecting modules and specialists...' };
      });
    }) as EventListener);
    source.addEventListener('super-agent:message_chunk', ((event: MessageEvent) => {
      updateIfCurrent(event, (data, current) => ({ ...current, text: `${current.text}${data.chunk || ''}` }));
    }) as EventListener);
    source.addEventListener('super-agent:step_started', ((event: MessageEvent) => {
      updateIfCurrent(event, (data, current) => ({
        ...current,
        statusLine: data.step?.label || current.statusLine,
        steps: [...current.steps.filter((step) => step.id !== data.step?.id), data.step].filter(Boolean),
      }));
    }) as EventListener);
    source.addEventListener('super-agent:step_completed', ((event: MessageEvent) => {
      updateIfCurrent(event, (data, current) => ({
        ...current,
        statusLine: data.step?.label || 'Step completed',
        steps: [...current.steps.filter((step) => step.id !== data.step?.id), data.step].filter(Boolean),
      }));
    }) as EventListener);
    source.addEventListener('super-agent:agent_called', ((event: MessageEvent) => {
      updateIfCurrent(event, (data, current) => ({
        ...current,
        agents: [...current.agents.filter((agent) => agent.slug !== data.agent?.slug), {
          slug: data.agent?.slug || 'agent',
          name: data.agent?.name || data.agent?.slug || 'Agent',
          runtime: data.agent?.runtime || null,
          mode: data.agent?.mode || null,
          status: data.agent?.status || 'consulted',
          summary: 'Consulted during orchestration.',
        }],
      }));
    }) as EventListener);
    source.addEventListener('super-agent:agent_result', ((event: MessageEvent) => {
      updateIfCurrent(event, (data, current) => ({
        ...current,
        agents: [...current.agents.filter((agent) => agent.slug !== data.agent?.slug), {
          slug: data.agent?.slug || 'agent',
          name: data.agent?.name || data.agent?.slug || 'Agent',
          runtime: null,
          mode: null,
          status: data.agent?.status || 'consulted',
          summary: data.agent?.summary || 'Completed.',
        }],
      }));
    }) as EventListener);
    source.addEventListener('super-agent:action_proposed', ((event: MessageEvent) => {
      updateIfCurrent(event, (_data, current) => ({ ...current, statusLine: 'Action proposal ready for review' }));
    }) as EventListener);
    source.addEventListener('super-agent:action_executing', ((event: MessageEvent) => {
      updateIfCurrent(event, (_data, current) => ({ ...current, statusLine: 'Executing guarded action...' }));
    }) as EventListener);
    source.addEventListener('super-agent:action_completed', ((event: MessageEvent) => {
      updateIfCurrent(event, (_data, current) => ({ ...current, statusLine: 'Action execution completed' }));
    }) as EventListener);
    source.addEventListener('super-agent:run_finished', ((event: MessageEvent) => {
      updateIfCurrent(event, (data, current) => ({ ...current, statusLine: data.statusLine || 'Run completed' }));
    }) as EventListener);
    source.addEventListener('super-agent:run_failed', ((event: MessageEvent) => {
      updateIfCurrent(event, (data, current) => ({
        ...current,
        error: data.error || 'The run failed unexpectedly.',
        statusLine: 'Run failed',
      }));
    }) as EventListener);
    source.onerror = handleFailure;

    return () => { source.close(); };
  }, []);

  function buildCommandContext() {
    const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant') as Extract<ConversationMessage, { role: 'assistant' }> | undefined;
    const recentTargets = dedupeTargets([
      activeTarget,
      contextPanel?.entityType && contextPanel?.entityId ? {
        page: fallbackNavigationTarget(pageFromContextPanel(contextPanel.entityType), contextPanel.entityId)?.page || 'super_agent',
        entityType: contextPanel.entityType,
        entityId: contextPanel.entityId,
        section: null,
        sourceContext: 'context_panel',
        runId: latestAssistant?.payload.runId || null,
      } : null,
      latestAssistant?.payload.navigationTarget || null,
      ...(latestAssistant?.payload.actions || []).map((action) => action.navigationTarget || fallbackNavigationTarget(action.targetPage, action.focusId ?? null)),
      ...(contextPanel?.related || []).map((link) => link.navigationTarget || fallbackNavigationTarget(link.targetPage, link.focusId ?? null)),
    ]);

    return {
      activeTarget: activeTarget || null,
      recentTargets,
      lastStructuredIntent: latestAssistant?.payload.structuredIntent || null,
    };
  }

  async function sendPrompt(promptOverride?: string) {
    const prompt = (promptOverride ?? composerText).trim();
    if (!prompt || isSending || isExecuting) return;

    const finalPrompt = mode === 'operate' && !promptOverride ? `Operate: ${prompt}` : prompt;

    const userMessage: ConversationMessage = { id: `user-${Date.now()}`, role: 'user', text: finalPrompt };

    setMessages((current) => [...current, userMessage]);
    setComposerText('');
    setPendingAction(null);
    setFlashMessage(null);
    setIsSending(true);
    const runId = typeof window !== 'undefined' && 'crypto' in window && 'randomUUID' in window.crypto
      ? window.crypto.randomUUID()
      : `run-${Date.now()}`;
    streamRunIdRef.current = runId;
    setStreamActivity({
      runId,
      statusLine: isStreamConnected ? 'Connecting modules and specialists...' : 'Waiting for response...',
      text: '',
      steps: [],
      agents: [],
      error: null,
    });

    try {
      const result = await superAgentApi.command(finalPrompt, { runId, mode, context: buildCommandContext() });
      const payload = result.response as AssistantPayload;
      setMessages((current) => [...current, { id: payload.id, role: 'assistant', payload }]);
      setPermissionMatrix(result.permissionMatrix || null);
      if (payload.contextPanel) setContextPanel(payload.contextPanel);
      setStreamActivity(null);
    } catch (error) {
      const fallback = assistantFromError(finalPrompt, error instanceof Error ? error.message : 'Unable to process command.');
      setMessages((current) => [...current, { id: fallback.id, role: 'assistant', payload: fallback }]);
      setStreamActivity((current) => current ? { ...current, error: fallback.summary, statusLine: 'Command failed' } : null);
    } finally {
      setIsSending(false);
      streamRunIdRef.current = null;
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction?.payload || isExecuting) return;

    setIsExecuting(true);
    setFlashMessage(null);
    const runId = typeof window !== 'undefined' && 'crypto' in window && 'randomUUID' in window.crypto
      ? window.crypto.randomUUID()
      : `run-${Date.now()}`;
    streamRunIdRef.current = runId;
    setStreamActivity({ runId, statusLine: 'Executing guarded action...', text: '', steps: [], agents: [], error: null });

    try {
      const result = await superAgentApi.execute(pendingAction.payload, true, {
        runId,
        sourceContext: 'super_agent_confirmation',
      });

      if (result.ok) {
        const update = assistantFromExecution(
          `${pendingAction.label} completed.`,
          'Execution result',
          [pendingAction.description, 'The change was written through the Super Agent guardrail layer and recorded in the audit trail.'],
        );
        setMessages((current) => [...current, { id: update.id, role: 'assistant', payload: update }]);
        setStreamActivity(null);

        const refreshPrompt =
          pendingAction.payload.kind === 'approval.decide' ? 'Pending approvals'
          : pendingAction.payload.kind === 'workflow.publish' ? `workflow ${pendingAction.payload.entityId}`
          : `${pendingAction.payload.entityType} ${pendingAction.payload.entityId}`;
        const refreshed = await superAgentApi.command(refreshPrompt);
        const refreshedPayload = refreshed.response as AssistantPayload;
        setMessages((current) => [...current, { id: refreshedPayload.id, role: 'assistant', payload: refreshedPayload, muted: true }]);
        setPermissionMatrix(refreshed.permissionMatrix || null);
        if (refreshedPayload.contextPanel) setContextPanel(refreshedPayload.contextPanel);
      } else if (result.approvalRequired) {
        const approvalId = result.approval?.id || 'pending approval';
        const approvalMessage = assistantFromExecution(
          'Action routed to approval.',
          'Guardrail applied',
          [
            'The requested action crossed a sensitive threshold and was not executed directly.',
            `Approval request created: ${approvalId}.`,
          ],
          [{
            id: `nav-approval-${approvalId}`,
            type: 'navigate',
            label: 'Open approvals',
            description: 'Review the newly created approval request.',
            targetPage: 'approvals',
            focusId: approvalId,
            navigationTarget: {
              page: 'approvals',
              entityType: 'approval',
              entityId: approvalId,
              section: null,
              sourceContext: 'super_agent_approval',
              runId,
            },
          }],
        );
        setMessages((current) => [...current, { id: approvalMessage.id, role: 'assistant', payload: approvalMessage }]);
        setFlashMessage('Approval created instead of executing directly.');
        setStreamActivity(null);
      } else {
        const failure = assistantFromExecution('Action blocked.', 'Execution blocked', [result.error || pendingAction.blockedReason || 'The requested action could not be executed.']);
        setMessages((current) => [...current, { id: failure.id, role: 'assistant', payload: failure }]);
        setStreamActivity((current) => current ? { ...current, error: failure.summary, statusLine: 'Action blocked' } : null);
      }
    } catch (error) {
      const failure = assistantFromExecution('Action failed.', 'Execution error', [error instanceof Error ? error.message : 'The requested action failed unexpectedly.']);
      setMessages((current) => [...current, { id: failure.id, role: 'assistant', payload: failure }]);
      setStreamActivity((current) => current ? { ...current, error: failure.summary, statusLine: 'Action failed' } : null);
    } finally {
      setPendingAction(null);
      setIsExecuting(false);
      streamRunIdRef.current = null;
    }
  }

  function navigateToTarget(target?: NavigationTarget | null, fallbackPage?: string, fallbackId?: string | null) {
    const resolvedTarget = target || fallbackNavigationTarget(fallbackPage, fallbackId);
    if (!resolvedTarget) return;
    onNavigate?.(resolvedTarget);
  }

  function handleAction(action: SuperAgentAction) {
    if (action.type === 'navigate') {
      navigateToTarget(action.navigationTarget, action.targetPage, action.focusId ?? null);
      return;
    }
    if (!action.allowed) {
      setFlashMessage(action.blockedReason || 'You do not have permission to execute this action.');
      return;
    }
    setPendingAction(action);
    setFlashMessage(null);
  }

  function navigateToSection(section: string) {
    onNavigate?.({ page: 'super_agent', section, entityType: 'workspace', entityId: null, sourceContext: 'super_agent_tabs', runId: null });
  }

  const sectionMeta = activeSection === 'live-runs'
    ? {
        label: 'Live Runs',
        title: 'Real-time operational tracking',
        description: 'Monitor agent runs, investigation steps, and long-running executions from the command center.',
        quickReplies: ['Review pending payments', 'Open pending approvals', 'Investigate a conflicted order'],
      }
    : activeSection === 'guardrails'
    ? {
        label: 'Guardrails',
        title: 'Control, approvals & traceability',
        description: 'Review effective permissions, sensitive actions, and the security layer protecting writes and automations.',
        quickReplies: ['Explain why an action is blocked', 'Open pending approvals', 'Prepare next operational step'],
      }
    : {
        label: 'Command Center',
        title: bootstrap?.welcomeTitle || 'Super Agent',
        description: bootstrap?.welcomeSubtitle || 'Investigate entities, cross-reference modules, understand blockers, coordinate specialists, and execute changes with full traceability.',
        quickReplies: bootstrap?.quickActions || [],
      };

  const tabs = [
    { id: 'command-center', label: 'Command Center', icon: 'auto_awesome' },
    { id: 'live-runs', label: 'Live Runs', icon: 'monitoring' },
    { id: 'guardrails', label: 'Guardrails', icon: 'shield' },
  ];

  function renderAssistantMessage(payload: AssistantPayload, muted = false) {
    const structuredBlocks = [
      payload.facts?.length ? { title: 'What I found', items: payload.facts } : null,
      payload.conflicts?.length ? { title: 'Conflict detected', items: payload.conflicts } : null,
      payload.sources?.length ? { title: 'Modules consulted', items: payload.sources } : null,
      payload.evidence?.length ? { title: 'Evidence', items: payload.evidence } : null,
    ].filter(Boolean) as MessageSection[];
    const sections = [...payload.sections, ...structuredBlocks];

    return (
      <motion.div
        key={payload.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={`${muted ? 'opacity-60' : ''}`}
      >
        {/* Agent header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black">
            <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-gray-900 dark:text-white">Super Agent</span>
            {payload.statusLine ? (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {payload.statusLine}
              </span>
            ) : null}
          </div>
        </div>

        {/* Summary */}
        <div className="ml-11">
          <p className="text-[15px] leading-7 font-medium text-gray-900 dark:text-white">{payload.summary}</p>

          {/* Sections */}
          {sections.length > 0 ? (
            <div className="mt-4 space-y-2">
              {sections.map((section) => (
                <div
                  key={`${payload.id}-${section.title}`}
                  className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700/60 dark:bg-gray-800/40"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">{section.title}</p>
                  <div className="mt-2 space-y-1.5">
                    {section.items.map((item) => (
                      <p key={item} className="text-sm leading-6 text-gray-700 dark:text-gray-300">{item}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Consulted modules */}
          {payload.consultedModules.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {payload.consultedModules.map((mod) => (
                <span
                  key={`${payload.id}-${mod}`}
                  className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                >
                  {mod}
                </span>
              ))}
            </div>
          ) : null}

          {/* Agents */}
          {payload.agents.length > 0 ? (
            <div className="mt-4 rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-700/60 dark:bg-gray-900/40">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Agent orchestration</p>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{payload.agents.length} specialists</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {payload.agents.map((agent) => (
                  <div key={`${payload.id}-${agent.slug}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-700/60 dark:bg-gray-800/40">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{agent.name}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(agent.status)}`}>
                        {agent.status}
                      </span>
                    </div>
                    {(agent.runtime || agent.mode) ? (
                      <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                        {[agent.runtime, agent.mode].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    <p className="mt-1.5 text-xs leading-5 text-gray-600 dark:text-gray-300">{agent.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Steps */}
          {payload.steps?.length ? (
            <div className="mt-4 rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-700/60 dark:bg-gray-900/40">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Execution trace</p>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{payload.steps.length} steps</span>
              </div>
              <div className="space-y-1.5">
                {payload.steps.map((step) => (
                  <div key={`${payload.id}-${step.id}`} className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-700/60 dark:bg-gray-800/40">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{step.label}</p>
                      {step.detail ? <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{step.detail}</p> : null}
                    </div>
                    <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(step.status)}`}>
                      {step.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Actions */}
          {payload.actions.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {payload.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleAction(action)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                    action.type === 'navigate'
                      ? 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'
                      : 'border-transparent bg-black text-white hover:opacity-90 dark:bg-white dark:text-black'
                  } ${!action.allowed ? 'opacity-40 cursor-not-allowed' : ''}`}
                  disabled={action.allowed === false}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}

          {/* Suggested replies */}
          {payload.suggestedReplies.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {payload.suggestedReplies.map((reply) => (
                <button
                  key={`${payload.id}-${reply}`}
                  type="button"
                  onClick={() => void sendPrompt(reply)}
                  className="rounded-full border border-secondary/20 bg-secondary/5 px-3 py-1.5 text-xs font-medium text-secondary transition-all hover:border-secondary/40 hover:bg-secondary/10"
                >
                  {reply}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </motion.div>
    );
  }

  function renderStreamingMessage(activity: StreamActivity) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black">
            <span className="material-symbols-outlined text-[14px] animate-pulse">auto_awesome</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-gray-900 dark:text-white">Super Agent</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {activity.statusLine}
            </span>
          </div>
        </div>
        <div className="ml-11">
          <p className="text-[15px] leading-7 font-medium text-gray-900 dark:text-white">
            {activity.text || 'Reading modules and assembling the operational answer...'}
          </p>

          {activity.steps.length > 0 ? (
            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700/60 dark:bg-gray-800/40">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500 mb-3">Live execution</p>
              <div className="space-y-1.5">
                {activity.steps.map((step) => (
                  <div key={`${activity.runId}-${step.id}`} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{step.label}</p>
                      {step.detail ? <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{step.detail}</p> : null}
                    </div>
                    <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(step.status)}`}>
                      {step.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activity.agents.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {activity.agents.map((agent) => (
                <span
                  key={`${activity.runId}-${agent.slug}`}
                  className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                >
                  {agent.name} · {agent.status}
                </span>
              ))}
            </div>
          ) : null}

          {activity.error ? (
            <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/10 dark:text-rose-300">
              {activity.error}
            </div>
          ) : null}

          {!activity.text && !activity.error ? (
            <div className="mt-3 flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300" />
            </div>
          ) : null}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">

        {/* Header */}
        <div className="flex-shrink-0 z-20">
          <div className="bg-white dark:bg-card-dark border-b border-gray-100 dark:border-gray-800">
            <div className="px-6 py-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Super Agent</h1>
                  {permissionMatrix ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${roleTone(permissionMatrix.accessLevel)}`}>
                      {permissionMatrix.accessLevel}
                    </span>
                  ) : null}
                  {isStreamConnected ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {sectionMeta.description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {bootstrap?.localAgents?.length ? (
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    {bootstrap.localAgents.length} agents online
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsPanelOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isPanelOpen
                      ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-black'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">right_panel_open</span>
                  Context
                </button>
              </div>
            </div>

            {/* Section tabs */}
            <div className="px-6 flex items-center gap-6 pt-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => navigateToSection(tab.id)}
                  className={`pb-3 flex items-center gap-1.5 text-sm transition-colors border-b-2 ${
                    activeSection === tab.id
                      ? 'font-bold text-gray-900 dark:text-white border-black dark:border-white'
                      : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* Chat area */}
          <div className="flex flex-1 flex-col min-w-0 relative">
            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-60 pt-8">
              <div className="mx-auto flex max-w-3xl flex-col gap-8">

                {/* Bootstrapping */}
                {isBootstrapping ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                      <span className="material-symbols-outlined text-[22px] text-gray-400 dark:text-gray-500 animate-pulse">auto_awesome</span>
                    </div>
                    <p className="mt-4 text-sm font-medium text-gray-700 dark:text-gray-300">Preparing the command center</p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Loading workspace context, permissions, and agent roster...</p>
                  </div>
                ) : null}

                {/* Empty state */}
                {!isBootstrapping && messages.length === 0 && bootstrap ? (
                  <AnimatePresence>
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex flex-col items-center text-center pt-12 pb-8"
                    >
                      {/* Icon */}
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white dark:bg-white dark:text-black shadow-sm">
                        <span className="material-symbols-outlined text-[24px]">auto_awesome</span>
                      </div>

                      <h2 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-gray-900 dark:text-white">
                        {sectionMeta.title}
                      </h2>
                      <p className="mt-3 max-w-lg text-sm leading-6 text-gray-500 dark:text-gray-400">
                        {sectionMeta.description}
                      </p>

                      {/* Overview cards */}
                      {bootstrap.overview.length > 0 ? (
                        <div className="mt-10 w-full grid gap-3 md:grid-cols-4">
                          {bootstrap.overview.map((card) => (
                            <div key={card.label} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 text-left dark:border-gray-700/60 dark:bg-gray-800/40">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">{card.label}</p>
                              <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{card.value}</p>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{card.detail}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {/* Quick actions */}
                      {sectionMeta.quickReplies.length > 0 ? (
                        <div className="mt-8 w-full">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500 mb-4">Quick actions</p>
                          <div className="flex flex-wrap justify-center gap-2">
                            {sectionMeta.quickReplies.map((action) => (
                              <button
                                key={action}
                                type="button"
                                onClick={() => void sendPrompt(action)}
                                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600"
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Local agents */}
                      {bootstrap.localAgents?.length ? (
                        <div className="mt-10 w-full">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500 mb-4">Available specialists</p>
                          <div className="grid gap-2 md:grid-cols-3">
                            {bootstrap.localAgents.slice(0, 6).map((agent) => (
                              <div key={agent.slug} className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-left dark:border-gray-700/60 dark:bg-gray-900/40">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{agent.name}</p>
                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                    {agent.runtime}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                                  {agent.mode || 'available'} · ready for orchestration
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </motion.div>
                  </AnimatePresence>
                ) : null}

                {/* Messages */}
                {messages.map((message) =>
                  message.role === 'user' ? (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex justify-end"
                    >
                      <div className="max-w-xl rounded-2xl bg-gray-100 px-5 py-3.5 text-[15px] leading-7 text-gray-900 dark:bg-gray-800 dark:text-white">
                        {message.text}
                      </div>
                    </motion.div>
                  ) : (
                    renderAssistantMessage(message.payload, message.muted === true)
                  )
                )}

                {/* Streaming */}
                {isSending && streamActivity ? renderStreamingMessage(streamActivity) : null}

                {isSending && !streamActivity ? (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black">
                        <span className="material-symbols-outlined text-[14px] animate-pulse">auto_awesome</span>
                      </div>
                      <div className="pt-1.5 flex gap-1">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.2s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.1s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300" />
                      </div>
                    </div>
                  </motion.div>
                ) : null}

                <div ref={bottomRef} />
              </div>
            </div>

            {/* Input area — floats at bottom */}
            <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-6 pt-16 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-card-dark dark:via-card-dark/95">
              <div className="mx-auto max-w-3xl">

                {/* Flash message */}
                <AnimatePresence>
                  {flashMessage ? (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="mb-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-900/10 dark:text-amber-300"
                    >
                      {flashMessage}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {/* Pending action confirmation */}
                <AnimatePresence>
                  {pendingAction ? (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="mb-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Confirmation required</p>
                          <p className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white">{pendingAction.label}</p>
                          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{pendingAction.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingAction(null)}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void confirmPendingAction()}
                            disabled={isExecuting}
                            className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
                          >
                            {isExecuting ? 'Executing...' : 'Confirm'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                {/* Composer */}
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  {/* Mode toggle row */}
                  <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 border-b border-gray-100 dark:border-gray-800">
                    <button
                      type="button"
                      onClick={() => setMode('investigate')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                        mode === 'investigate'
                          ? 'bg-gray-900 text-white dark:bg-white dark:text-black'
                          : 'bg-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                      }`}
                    >
                      Investigate
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('operate')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                        mode === 'operate'
                          ? 'bg-secondary text-white'
                          : 'bg-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                      }`}
                    >
                      Operate
                    </button>
                    <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
                      {mode === 'investigate' ? 'Read state, explain blockers, connect modules' : 'Prepare guarded actions and execute with confirmation'}
                    </span>
                  </div>

                  {/* Textarea + send button */}
                  <div className="flex items-end gap-3 px-4 py-3">
                    <textarea
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendPrompt();
                        }
                      }}
                      placeholder={
                        mode === 'investigate'
                          ? 'Ask about an order, payment, customer, case, approval, or inconsistency...'
                          : 'Ask to update a status, process a refund, cancel an order, or publish a workflow...'
                      }
                      className="flex-1 min-h-[72px] resize-none bg-transparent text-sm leading-6 text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => void sendPrompt()}
                      disabled={!composerText.trim() || isSending || isExecuting}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-black text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-white dark:text-black"
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                    </button>
                  </div>

                  {/* Quick prompts row */}
                  {sectionMeta.quickReplies.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                      {sectionMeta.quickReplies.slice(0, 4).map((action) => (
                        <button
                          key={`input-${action}`}
                          type="button"
                          onClick={() => void sendPrompt(action)}
                          className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 transition-all hover:border-gray-300 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Context panel */}
          <AnimatePresence>
            {isPanelOpen ? (
              <motion.aside
                key="context-panel"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 340, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="flex-shrink-0 border-l border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/20 overflow-hidden"
                style={{ minWidth: 0 }}
              >
                <div className="flex h-full flex-col w-[340px]">
                  {/* Panel header */}
                  <div className="flex-shrink-0 border-b border-gray-100 dark:border-gray-800 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Context panel</p>
                        <h2 className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {contextPanel?.title || 'No entity selected'}
                        </h2>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                          {contextPanel?.subtitle || 'Structured operational context appears here.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsPanelOpen(false)}
                        className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                      >
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>

                    {contextPanel ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[10px] font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                          {contextPanel.entityType}
                        </span>
                        {contextPanel.status ? (
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusTone(contextPanel.status)}`}>
                            {contextPanel.status}
                          </span>
                        ) : null}
                        {contextPanel.risk ? (
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${statusTone(contextPanel.risk)}`}>
                            {contextPanel.risk}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {contextPanel?.description ? (
                      <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">{contextPanel.description}</p>
                    ) : null}
                  </div>

                  {/* Panel content */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 space-y-4">
                    {contextPanel ? (
                      <>
                        {/* Facts */}
                        <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-700/60 dark:bg-gray-900/40">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500 mb-3">Facts</p>
                          <div className="space-y-2.5">
                            {contextPanel.facts.map((fact) => (
                              <div key={`${contextPanel.title}-${fact.label}`} className="flex items-start justify-between gap-3">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 flex-shrink-0">{fact.label}</span>
                                <span className="text-xs font-medium text-right text-gray-900 dark:text-white">{fact.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Evidence */}
                        {contextPanel.evidence.length > 0 ? (
                          <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-700/60 dark:bg-gray-900/40">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500 mb-3">Evidence</p>
                            <div className="space-y-2">
                              {contextPanel.evidence.map((ev) => (
                                <div key={`${contextPanel.title}-${ev.label}`} className={`rounded-lg border px-3 py-2.5 ${statusTone(ev.tone)}`}>
                                  <p className="text-[10px] font-semibold uppercase tracking-wide">{ev.label}</p>
                                  <p className="mt-1 text-xs leading-5">{ev.value}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {/* Timeline */}
                        <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-700/60 dark:bg-gray-900/40">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500 mb-3">Timeline</p>
                          {contextPanel.timeline.length > 0 ? (
                            <div className="space-y-2">
                              {contextPanel.timeline.map((entry) => (
                                <div
                                  key={`${contextPanel.title}-${entry.label}-${entry.time || entry.value}`}
                                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-700/60 dark:bg-gray-800/40"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-xs font-semibold text-gray-900 dark:text-white">{entry.label}</p>
                                    {entry.time ? <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">{entry.time}</span> : null}
                                  </div>
                                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{entry.value}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 dark:text-gray-500">No timeline entries available.</p>
                          )}
                        </div>

                        {/* Related */}
                        {contextPanel.related.length > 0 ? (
                          <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-700/60 dark:bg-gray-900/40">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500 mb-3">Related</p>
                            <div className="space-y-1.5">
                              {contextPanel.related.map((link) => (
                                <button
                                  key={`${contextPanel.title}-${link.label}-${link.value}`}
                                  type="button"
                                  onClick={() => navigateToTarget(link.navigationTarget, link.targetPage, link.focusId ?? null)}
                                  className="flex w-full items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-left transition-colors hover:border-secondary/30 hover:bg-secondary/5 dark:border-gray-700/60 dark:bg-gray-800/40"
                                >
                                  <div>
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{link.label}</p>
                                    <p className="mt-0.5 text-xs font-semibold text-gray-900 dark:text-white">{link.value}</p>
                                  </div>
                                  <span className="material-symbols-outlined text-[14px] text-gray-300 dark:text-gray-600">open_in_new</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
                          <span className="material-symbols-outlined text-[18px] text-gray-400 dark:text-gray-500">hub</span>
                        </div>
                        <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-300">No context selected</p>
                        <p className="mt-1 text-xs leading-5 text-gray-400 dark:text-gray-500 max-w-[200px]">
                          Ask the Super Agent about a case, order, payment, customer, or workflow.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
