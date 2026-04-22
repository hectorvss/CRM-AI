import React, { useEffect, useRef, useState } from 'react';
import { superAgentApi } from '../api/client';
import type { Page } from '../types';

type NavigateFn = (page: Page, focusCaseId?: string | null) => void;

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
  related: Array<{ label: string; value: string; targetPage?: string; focusId?: string | null }>;
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

interface SuperAgentProps {
  onNavigate?: NavigateFn;
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
        items: ['The Super Agent backend did not return a valid response.', 'You can retry the command or continue from a structured module.'],
      },
    ],
    actions: [],
    contextPanel: null,
    agents: [],
    suggestedReplies: ['Reintenta el comando', 'Abre aprobaciones pendientes', 'Busca un pedido'],
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

export default function SuperAgent({ onNavigate }: SuperAgentProps) {
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
  const bottomRef = useRef<HTMLDivElement>(null);

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
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pendingAction, flashMessage, isSending]);

  async function sendPrompt(promptOverride?: string) {
    const prompt = (promptOverride ?? composerText).trim();
    if (!prompt || isSending || isExecuting) return;

    const finalPrompt = mode === 'operate' && !promptOverride
      ? `Operate: ${prompt}`
      : prompt;

    const userMessage: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: finalPrompt,
    };

    setMessages((current) => [...current, userMessage]);
    setComposerText('');
    setPendingAction(null);
    setFlashMessage(null);
    setIsSending(true);

    try {
      const result = await superAgentApi.command(finalPrompt);
      const payload = result.response as AssistantPayload;
      setMessages((current) => [...current, { id: payload.id, role: 'assistant', payload }]);
      setPermissionMatrix(result.permissionMatrix || null);
      if (payload.contextPanel) {
        setContextPanel(payload.contextPanel);
      }
    } catch (error) {
      const fallback = assistantFromError(finalPrompt, error instanceof Error ? error.message : 'Unable to process command.');
      setMessages((current) => [...current, { id: fallback.id, role: 'assistant', payload: fallback }]);
    } finally {
      setIsSending(false);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction?.payload || isExecuting) return;

    setIsExecuting(true);
    setFlashMessage(null);

    try {
      const result = await superAgentApi.execute(pendingAction.payload, true);

      if (result.ok) {
        const update = assistantFromExecution(
          `${pendingAction.label} completed.`,
          'Execution result',
          [
            pendingAction.description,
            'The change was written through the Super Agent guardrail layer and recorded in the audit trail.',
          ],
        );

        setMessages((current) => [...current, { id: update.id, role: 'assistant', payload: update }]);

        const refreshPrompt =
          pendingAction.payload.kind === 'approval.decide'
            ? 'Aprobaciones pendientes'
            : pendingAction.payload.kind === 'workflow.publish'
            ? `workflow ${pendingAction.payload.entityId}`
            : `${pendingAction.payload.entityType} ${pendingAction.payload.entityId}`;
        const refreshed = await superAgentApi.command(refreshPrompt);
        const refreshedPayload = refreshed.response as AssistantPayload;
        setMessages((current) => [...current, { id: refreshedPayload.id, role: 'assistant', payload: refreshedPayload, muted: true }]);
        setPermissionMatrix(refreshed.permissionMatrix || null);
        if (refreshedPayload.contextPanel) {
          setContextPanel(refreshedPayload.contextPanel);
        }
      } else if (result.approvalRequired) {
        const approvalId = result.approval?.id || 'pending approval';
        const approvalMessage = assistantFromExecution(
          'Action routed to approval.',
          'Guardrail applied',
          [
            'The requested action crossed a sensitive threshold and was not executed directly.',
            `Approval request created: ${approvalId}.`,
          ],
          [
            {
              id: `nav-approval-${approvalId}`,
              type: 'navigate',
              label: 'Open approvals',
              description: 'Review the newly created approval request.',
              targetPage: 'approvals',
              focusId: approvalId,
            },
          ],
        );

        setMessages((current) => [...current, { id: approvalMessage.id, role: 'assistant', payload: approvalMessage }]);
        setFlashMessage('Approval created instead of executing directly.');
      } else {
        const failure = assistantFromExecution(
          'Action blocked.',
          'Execution blocked',
          [result.error || pendingAction.blockedReason || 'The requested action could not be executed.'],
        );
        setMessages((current) => [...current, { id: failure.id, role: 'assistant', payload: failure }]);
      }
    } catch (error) {
      const failure = assistantFromExecution(
        'Action failed.',
        'Execution error',
        [error instanceof Error ? error.message : 'The requested action failed unexpectedly.'],
      );
      setMessages((current) => [...current, { id: failure.id, role: 'assistant', payload: failure }]);
    } finally {
      setPendingAction(null);
      setIsExecuting(false);
    }
  }

  function handleAction(action: SuperAgentAction) {
    if (action.type === 'navigate') {
      if (action.targetPage) {
        onNavigate?.(action.targetPage as Page, action.focusId ?? null);
      }
      return;
    }

    if (!action.allowed) {
      setFlashMessage(action.blockedReason || 'You do not have permission to execute this action.');
      return;
    }

    setPendingAction(action);
    setFlashMessage(null);
  }

  function renderAssistantMessage(payload: AssistantPayload, muted = false) {
    return (
      <div
        key={payload.id}
        className={`rounded-[28px] border px-6 py-5 shadow-card backdrop-blur-sm ${
          muted
            ? 'bg-white/70 border-white/70 dark:bg-card-dark/70 dark:border-gray-700/70'
            : 'bg-white/90 border-white dark:bg-card-dark/90 dark:border-gray-700'
        }`}
      >
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black text-white shadow-sm dark:bg-white dark:text-black">
            <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Super Agent</p>
              {payload.statusLine ? (
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-semibold text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {payload.statusLine}
                </span>
              ) : null}
            </div>
            <h3 className="mt-2 text-lg font-semibold leading-7 text-gray-900 dark:text-white">{payload.summary}</h3>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {payload.sections.map((section) => (
            <section
              key={`${payload.id}-${section.title}`}
              className="rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-4 dark:border-gray-700 dark:bg-gray-800/60"
            >
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{section.title}</h4>
              <div className="mt-3 space-y-2">
                {section.items.map((item) => (
                  <p key={item} className="text-sm leading-6 text-gray-700 dark:text-gray-200">
                    {item}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {payload.consultedModules.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {payload.consultedModules.map((moduleName) => (
              <span
                key={`${payload.id}-${moduleName}`}
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300"
              >
                {moduleName}
              </span>
            ))}
          </div>
        ) : null}

        {payload.agents.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-gray-100 bg-white/80 px-4 py-4 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Agent orchestration</h4>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{payload.agents.length} specialists</span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {payload.agents.map((agent) => (
                <div key={`${payload.id}-${agent.slug}`} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{agent.name}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(agent.status)}`}>
                      {agent.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    {[agent.runtime, agent.mode].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">{agent.summary}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {payload.actions.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {payload.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => handleAction(action)}
                className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                  action.type === 'navigate'
                    ? 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-200'
                    : 'border-transparent bg-black text-white hover:opacity-90 dark:bg-white dark:text-black'
                } ${!action.allowed ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={action.allowed === false}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}

        {payload.suggestedReplies.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
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
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="relative mx-2 my-2 flex-1 overflow-hidden rounded-[28px] border border-gray-200/80 bg-[#f7f5ef] shadow-soft dark:border-gray-800 dark:bg-[#151515]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(110,98,229,0.16),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(31,31,31,0.1),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.74),rgba(255,255,255,0))] dark:bg-[radial-gradient(circle_at_top,rgba(110,98,229,0.22),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.06),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />

        <div className="relative flex h-full min-h-0">
          <section className="flex min-w-0 flex-1 flex-col">
            <header className="border-b border-white/70 px-6 py-5 backdrop-blur-sm dark:border-gray-800/80">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                      AI Operating Layer
                    </span>
                    {permissionMatrix ? (
                      <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${roleTone(permissionMatrix.accessLevel)}`}>
                        {permissionMatrix.accessLevel}
                      </span>
                    ) : null}
                  </div>
                  <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-gray-900 dark:text-white">
                    {bootstrap?.welcomeTitle || 'Super Agent'}
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
                    {bootstrap?.welcomeSubtitle || 'Unified command center for reading state, coordinating agents, and executing controlled actions.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {bootstrap?.localAgents?.length ? (
                    <span className="rounded-full border border-gray-200 bg-white/70 px-3 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
                      {bootstrap.localAgents.length} local agents online
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setIsPanelOpen((current) => !current)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white/80 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200 dark:hover:bg-gray-900"
                  >
                    <span className="material-symbols-outlined text-[18px]">right_panel_open</span>
                    {isPanelOpen ? 'Hide context' : 'Show context'}
                  </button>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-56 pt-8">
              <div className="mx-auto flex max-w-4xl flex-col gap-5">
                {isBootstrapping ? (
                  <div className="rounded-[28px] border border-white/80 bg-white/70 px-8 py-12 text-center shadow-card backdrop-blur-sm dark:border-gray-700 dark:bg-card-dark/80">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white dark:bg-white dark:text-black">
                      <span className="material-symbols-outlined text-[24px]">auto_awesome</span>
                    </div>
                    <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Preparing the command center</h2>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Loading workspace context, permissions, and the local specialist roster.
                    </p>
                  </div>
                ) : null}

                {!isBootstrapping && messages.length === 0 && bootstrap ? (
                  <>
                    <div className="rounded-[32px] border border-white/90 bg-white/80 px-8 py-10 shadow-soft backdrop-blur-sm dark:border-gray-700 dark:bg-card-dark/85">
                      <div className="mx-auto max-w-2xl text-center">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                          Control conversation
                        </p>
                        <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-gray-900 dark:text-white">
                          Opera el SaaS desde un unico punto de control
                        </h2>
                        <p className="mt-4 text-base leading-7 text-gray-600 dark:text-gray-300">
                          Investiga entidades, cruza modulos, entiende bloqueos reales, coordina especialistas y ejecuta cambios con trazabilidad.
                        </p>
                      </div>

                      <div className="mt-8 grid gap-3 md:grid-cols-4">
                        {bootstrap.overview.map((card) => (
                          <div key={card.label} className="rounded-2xl border border-gray-100 bg-gray-50/90 px-4 py-4 dark:border-gray-700 dark:bg-gray-800/60">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{card.label}</p>
                            <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">{card.value}</p>
                            <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{card.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-white/80 bg-white/70 px-6 py-6 shadow-card backdrop-blur-sm dark:border-gray-700 dark:bg-card-dark/80">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Quick actions</p>
                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Start from a realistic operational task adapted to the current workspace.</p>
                        </div>
                        {permissionMatrix ? (
                          <div className="rounded-2xl border border-gray-200 bg-white/80 px-4 py-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-white">{permissionMatrix.roleId}</span>
                            <div className="mt-1">{permissionMatrix.preview.join(' • ')}</div>
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {bootstrap.quickActions.map((action) => (
                          <button
                            key={action}
                            type="button"
                            onClick={() => void sendPrompt(action)}
                            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:border-secondary/40 hover:text-secondary dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-200"
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    </div>

                    {bootstrap.localAgents?.length ? (
                      <div className="grid gap-3 md:grid-cols-3">
                        {bootstrap.localAgents.slice(0, 6).map((agent) => (
                          <div key={agent.slug} className="rounded-2xl border border-white/70 bg-white/65 px-4 py-4 shadow-card backdrop-blur-sm dark:border-gray-700 dark:bg-card-dark/75">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">{agent.name}</p>
                              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                {agent.runtime}
                              </span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                              {agent.mode || 'available'} specialist ready for orchestration from the central command layer.
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}

                {messages.map((message) =>
                  message.role === 'user' ? (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-2xl rounded-[26px] rounded-br-md border border-gray-200 bg-[#f1ede4] px-5 py-4 text-sm leading-6 text-gray-800 shadow-card dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                        {message.text}
                      </div>
                    </div>
                  ) : (
                    renderAssistantMessage(message.payload, message.muted === true)
                  ),
                )}

                {isSending ? (
                  <div className="rounded-[24px] border border-white/80 bg-white/80 px-5 py-4 shadow-card dark:border-gray-700 dark:bg-card-dark/80">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white dark:bg-white dark:text-black">
                        <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Reading modules and assembling the operational answer...</p>
                        <div className="mt-2 flex gap-1">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.2s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.1s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div ref={bottomRef} />
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 z-20 border-t border-white/70 bg-[linear-gradient(180deg,rgba(247,245,239,0),rgba(247,245,239,0.95)_25%,rgba(247,245,239,1)_100%)] px-6 pb-6 pt-10 backdrop-blur-md dark:border-gray-800/80 dark:bg-[linear-gradient(180deg,rgba(21,21,21,0),rgba(21,21,21,0.92)_25%,rgba(21,21,21,1)_100%)]">
              <div className="mx-auto max-w-4xl">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {(bootstrap?.quickActions || []).slice(0, 5).map((action) => (
                    <button
                      key={`input-${action}`}
                      type="button"
                      onClick={() => void sendPrompt(action)}
                      className="rounded-full border border-gray-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:border-secondary/40 hover:text-secondary dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-300"
                    >
                      {action}
                    </button>
                  ))}
                </div>

                {flashMessage ? (
                  <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
                    {flashMessage}
                  </div>
                ) : null}

                {pendingAction ? (
                  <div className="mb-3 rounded-[24px] border border-gray-200 bg-white/90 px-5 py-4 shadow-card dark:border-gray-700 dark:bg-card-dark/90">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Confirmation required</p>
                        <p className="mt-2 text-base font-semibold text-gray-900 dark:text-white">{pendingAction.label}</p>
                        <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{pendingAction.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPendingAction(null)}
                          className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void confirmPendingAction()}
                          disabled={isExecuting}
                          className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-black"
                        >
                          {isExecuting ? 'Executing...' : 'Confirm action'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-[30px] border border-white/90 bg-white/92 p-3 shadow-soft backdrop-blur-sm dark:border-gray-700 dark:bg-card-dark/92">
                  <div className="mb-3 flex flex-wrap items-center gap-2 px-2">
                    <button
                      type="button"
                      onClick={() => setMode('investigate')}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                        mode === 'investigate'
                          ? 'bg-black text-white dark:bg-white dark:text-black'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      Investigate
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('operate')}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                        mode === 'operate'
                          ? 'bg-secondary text-white'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      Operate
                    </button>
                    <div className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">
                      {mode === 'investigate'
                        ? 'Read state, explain blockers, connect modules.'
                        : 'Prepare guarded actions and execute with confirmation.'}
                    </div>
                  </div>

                  <div className="flex items-end gap-3">
                    <div className="flex-1 rounded-[24px] border border-gray-200 bg-[#f7f5ef] px-4 py-3 dark:border-gray-700 dark:bg-gray-900/60">
                      <textarea
                        value={composerText}
                        onChange={(event) => setComposerText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            void sendPrompt();
                          }
                        }}
                        placeholder={
                          mode === 'investigate'
                            ? 'Ask about an order, payment, customer, case, approval, policy, or inconsistency...'
                            : 'Ask to update status, refund a payment, cancel an order, publish a workflow, or request approval...'
                        }
                        className="min-h-[92px] w-full resize-none bg-transparent text-[15px] leading-7 text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => void sendPrompt()}
                      disabled={!composerText.trim() || isSending || isExecuting}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white transition-all hover:scale-[1.02] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
                    >
                      <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside
            className={`relative border-l border-white/70 bg-white/78 backdrop-blur-xl transition-all duration-300 dark:border-gray-800/80 dark:bg-card-dark/78 ${
              isPanelOpen ? 'w-[360px] max-w-[42vw]' : 'w-0'
            } overflow-hidden`}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-gray-100 px-5 py-5 dark:border-gray-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Context panel</p>
                    <h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                      {contextPanel?.title || 'No entity selected'}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {contextPanel?.subtitle || 'Structured operational context will appear here.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPanelOpen(false)}
                    className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 transition-colors hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300 dark:hover:text-white"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>

                {contextPanel ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {contextPanel.status ? (
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusTone(contextPanel.status)}`}>
                        {contextPanel.status}
                      </span>
                    ) : null}
                    {contextPanel.risk ? (
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusTone(contextPanel.risk)}`}>
                        {contextPanel.risk}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
                      {contextPanel.entityType}
                    </span>
                  </div>
                ) : null}

                {contextPanel?.description ? (
                  <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">{contextPanel.description}</p>
                ) : null}
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5">
                {contextPanel ? (
                  <div className="space-y-5">
                    <section className="rounded-2xl border border-gray-100 bg-gray-50/90 p-4 dark:border-gray-700 dark:bg-gray-800/60">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Facts</h3>
                      <div className="mt-3 space-y-3">
                        {contextPanel.facts.map((fact) => (
                          <div key={`${contextPanel.title}-${fact.label}`} className="flex items-start justify-between gap-3">
                            <span className="text-xs uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">{fact.label}</span>
                            <span className="text-sm text-right font-medium text-gray-900 dark:text-white">{fact.value}</span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-gray-100 bg-white/90 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Evidence</h3>
                      <div className="mt-3 space-y-3">
                        {contextPanel.evidence.map((evidence) => (
                          <div key={`${contextPanel.title}-${evidence.label}`} className={`rounded-xl border px-3 py-3 ${statusTone(evidence.tone)}`}>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{evidence.label}</p>
                            <p className="mt-2 text-sm leading-6">{evidence.value}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-gray-100 bg-white/90 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Timeline</h3>
                      <div className="mt-3 space-y-3">
                        {contextPanel.timeline.length > 0 ? contextPanel.timeline.map((entry) => (
                          <div key={`${contextPanel.title}-${entry.label}-${entry.time || entry.value}`} className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">{entry.label}</p>
                              {entry.time ? (
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">{entry.time}</span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{entry.value}</p>
                          </div>
                        )) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">No timeline entries available for this context yet.</p>
                        )}
                      </div>
                    </section>

                    <section className="rounded-2xl border border-gray-100 bg-white/90 p-4 dark:border-gray-700 dark:bg-gray-900/40">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Related</h3>
                      <div className="mt-3 space-y-2">
                        {contextPanel.related.length > 0 ? contextPanel.related.map((link) => (
                          <button
                            key={`${contextPanel.title}-${link.label}-${link.value}`}
                            type="button"
                            onClick={() => {
                              if (link.targetPage) {
                                onNavigate?.(link.targetPage as Page, link.focusId ?? null);
                              }
                            }}
                            className="flex w-full items-center justify-between rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-3 text-left transition-colors hover:border-secondary/30 hover:text-secondary dark:border-gray-700 dark:bg-gray-800/60"
                          >
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">{link.label}</p>
                              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{link.value}</p>
                            </div>
                            <span className="material-symbols-outlined text-[18px] text-gray-300 dark:text-gray-500">open_in_new</span>
                          </button>
                        )) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">No related entities linked to this context.</p>
                        )}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-5 py-8 text-center dark:border-gray-700 dark:bg-gray-900/40">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                      <span className="material-symbols-outlined text-[22px]">hub</span>
                    </div>
                    <p className="mt-4 text-sm font-medium text-gray-700 dark:text-gray-200">The structured context will appear here.</p>
                    <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                      Ask the Super Agent about a case, order, payment, return, customer, approval, workflow, or inconsistency.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
