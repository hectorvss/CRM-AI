import React, { useEffect, useRef, useState } from 'react';
import { superAgentApi } from '../api/client';
import type { NavigateFn, NavigationTarget, Page } from '../types';

// ── Feature flag: set VITE_LLM_ROUTING=true to route through Plan Engine ─────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LLM_ROUTING = (import.meta as any).env?.VITE_LLM_ROUTING === 'true';

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
  const id = `assistant-plan-${Date.now()}`;
  const status = trace?.status ?? 'success';
  const summary = trace?.summary ?? planResp?.plan?.rationale ?? '';

  // Build step cards from execution spans
  const steps: StreamStep[] = (trace?.spans ?? []).map((span: any) => ({
    id: span.stepId,
    label: span.tool,
    status: span.result?.ok ? 'completed' : 'failed',
    detail: span.result?.ok
      ? JSON.stringify(span.result?.value ?? '').slice(0, 120)
      : span.result?.error,
  }));

  // Approval actions
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

  return {
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
  };
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

  function buildCommandContext() {
    const latest = [...messages].reverse().find((m) => m.role === 'assistant') as Extract<ConversationMessage, { role: 'assistant' }> | undefined;
    const recentTargets = dedupeTargets([
      activeTarget,
      contextPanel?.entityType && contextPanel?.entityId ? { page: fallbackNavigationTarget(pageFromContextPanel(contextPanel.entityType), contextPanel.entityId)?.page || 'super_agent', entityType: contextPanel.entityType, entityId: contextPanel.entityId, section: null, sourceContext: 'context_panel', runId: latest?.payload.runId || null } : null,
      latest?.payload.navigationTarget || null,
      ...(latest?.payload.actions || []).map((a) => a.navigationTarget || fallbackNavigationTarget(a.targetPage, a.focusId ?? null)),
    ]);
    return { activeTarget: activeTarget || null, recentTargets, lastStructuredIntent: latest?.payload.structuredIntent || null };
  }

  async function sendPrompt(promptOverride?: string) {
    const prompt = (promptOverride ?? composerText).trim();
    if (!prompt || isSending || isExecuting) return;
    const finalPrompt = mode === 'operate' && !promptOverride ? `Operate: ${prompt}` : prompt;
    setMessages((c) => [...c, { id: `user-${Date.now()}`, role: 'user', text: finalPrompt }]);
    setComposerText('');
    setPendingAction(null);
    setFlashMessage(null);
    setIsSending(true);
    const runId = window.crypto?.randomUUID?.() || `run-${Date.now()}`;
    streamRunIdRef.current = runId;
    setStreamActivity({ runId, statusLine: isStreamConnected ? 'Connecting...' : 'Waiting...', text: '', steps: [], agents: [], error: null });

    try {
      if (LLM_ROUTING) {
        // ── Plan Engine path ────────────────────────────────────────────────
        const result = await superAgentApi.plan(finalPrompt, {
          sessionId: planSessionId ?? undefined,
          dryRun: mode === 'investigate',
        });

        // Persist session id for multi-turn continuity
        if (result.sessionId) setPlanSessionId(result.sessionId);

        const resp = result.response;
        let payload: AssistantPayload;

        if (resp?.kind === 'plan') {
          payload = planResponseToPayload(resp, result.trace);
        } else if (resp?.kind === 'clarification') {
          payload = clarificationToPayload(resp.question);
        } else {
          payload = assistantFromError(finalPrompt, resp?.error ?? 'Unexpected response from Plan Engine.');
        }

        setMessages((c) => [...c, { id: payload.id, role: 'assistant', payload }]);
        if (payload.contextPanel) setContextPanel(payload.contextPanel);
        setStreamActivity(null);
      } else {
        // ── Legacy regex path (default) ─────────────────────────────────────
        const result = await superAgentApi.command(finalPrompt, { runId, mode, context: buildCommandContext() });
        const payload = result.response as AssistantPayload;
        setMessages((c) => [...c, { id: payload.id, role: 'assistant', payload }]);
        setPermissionMatrix(result.permissionMatrix || null);
        if (payload.contextPanel) setContextPanel(payload.contextPanel);
        setStreamActivity(null);
      }
    } catch (error) {
      const fallback = assistantFromError(finalPrompt, error instanceof Error ? error.message : 'Unable to process command.');
      setMessages((c) => [...c, { id: fallback.id, role: 'assistant', payload: fallback }]);
      setStreamActivity((c) => c ? { ...c, error: fallback.summary, statusLine: 'Failed' } : null);
    } finally {
      setIsSending(false);
      streamRunIdRef.current = null;
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
        const refreshed = await superAgentApi.command(refreshPrompt);
        const rp = refreshed.response as AssistantPayload;
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
      ? ['Review pending payments', 'Open pending approvals', 'Investigate a conflicted order']
      : activeSection === 'guardrails'
      ? ['Explain why an action is blocked', 'Open pending approvals', 'Show permission matrix']
      : (bootstrap?.quickActions || []).slice(0, 4);

  const sectionTitle =
    activeSection === 'live-runs' ? 'Live Runs'
    : activeSection === 'guardrails' ? 'Guardrails'
    : 'Super Agent';

  const sectionSubtitle =
    activeSection === 'live-runs' ? 'Monitor active agent runs and execution steps.'
    : activeSection === 'guardrails' ? 'Review permissions, approvals, and sensitive action guardrails.'
    : 'Investigate, cross-reference, and act across the entire workspace.';

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
                  <p className="text-sm leading-7 text-gray-900 dark:text-white">{msg.payload.summary}</p>

                  {[
                    ...msg.payload.sections,
                    ...(msg.payload.facts?.length ? [{ title: 'Found', items: msg.payload.facts }] : []),
                    ...(msg.payload.conflicts?.length ? [{ title: 'Conflicts', items: msg.payload.conflicts }] : []),
                  ].map((s) => (
                    <div key={`${msg.id}-${s.title}`} className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700/50 dark:bg-gray-800/30">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">{s.title}</p>
                      <div className="mt-2 space-y-1">
                        {s.items.map((item) => (
                          <p key={item} className="text-sm leading-6 text-gray-700 dark:text-gray-300">{item}</p>
                        ))}
                      </div>
                    </div>
                  ))}

                  {msg.payload.actions.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {msg.payload.actions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => handleAction(action)}
                          disabled={action.allowed === false}
                          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                            action.type === 'navigate'
                              ? 'border-gray-200 text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300'
                              : 'border-transparent bg-black text-white hover:opacity-90 dark:bg-white dark:text-black'
                          }`}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {msg.payload.suggestedReplies.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {msg.payload.suggestedReplies.map((reply) => (
                        <button
                          key={`${msg.id}-${reply}`}
                          type="button"
                          onClick={() => void sendPrompt(reply)}
                          className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          {reply}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            )}

            {/* Streaming indicator */}
            {isSending ? (
              <div className="flex gap-1.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300" />
              </div>
            ) : null}

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
