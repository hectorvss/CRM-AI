import React, { useEffect, useRef, useState } from 'react';
import { superAgentApi } from '../api/client';
import { supabase } from '../api/supabase';
import type { NavigateFn, NavigationTarget, Page } from '../types';
import CreditBanner from './billing/CreditBanner';
import { useAICredits } from '../hooks/useAICredits';
import {
  AssistantMessage,
  Markdown,
  StreamingCaret,
  ThinkingPill,
  ToolCallCard,
  UserMessage,
  type ToolCallData,
} from './ai-chat/ChatPrimitives';
import { InlineApprovalCard } from './ai-chat/InlineApprovalCard';
import ConversationsSidebar from './ai-chat/ConversationsSidebar';

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
  verificationDisplay?: {
    beforeState?: Record<string, any>;
    afterState?: Record<string, any>;
    impacts?: string[];
  };
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

type AgentTimelineEvent = {
  id: string;
  type: 'chat' | 'thinking' | 'tool_started' | 'tool_result' | 'edit' | 'approval_required' | 'blocked' | 'done';
  label: string;
  status?: 'running' | 'completed' | 'failed' | 'blocked';
  detail?: string | null;
  tool?: string | null;
};

type ResponseArtifact = {
  id: string;
  kind: 'analysis' | 'bulk' | 'playbook' | 'schedule' | 'feedback' | 'approval';
  title: string;
  summary: string;
  bullets: string[];
  status?: 'info' | 'success' | 'warning' | 'danger';
};

type ReasoningTrailPayload = {
  summary: string;
  intent: string;
  confidence: number;
  approvalRequired: boolean;
  approvalReasons: string[];
  signals: Array<{ source: string; observation: string; weight: 'low' | 'medium' | 'high' }>;
  steps: Array<{
    stepId: string;
    tool: string;
    rationale: string;
    riskLevel: string;
    outcome: string;
    observation?: string;
    durationMs?: number;
    sideEffectSummary?: string;
  }>;
  riskProfile: { distribution: Record<string, number>; maxRisk: string };
  notes: string[];
  spokenExplanation: string;
};

type AssistantPayload = {
  id: string;
  input: string;
  summary: string;
  narrative?: string;  // NEW: Multi-paragraph conversational response
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
  timelineEvents?: AgentTimelineEvent[];
  artifacts?: ResponseArtifact[];
  reasoningTrail?: ReasoningTrailPayload | null;
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

type ProactiveAlert = {
  label: string;
  query: string;
  severity: 'critical' | 'warning' | 'info';
};

type BootstrapData = {
  welcomeTitle: string;
  welcomeSubtitle: string;
  permissionMatrix: PermissionMatrix;
  overview: Array<{ label: string; value: string; detail: string }>;
  quickActions: string[];
  contextPanel: ContextPanel;
  localAgents: Array<{ slug: string; name: string; runtime?: string; mode?: string }>;
  proactiveAlerts?: ProactiveAlert[];
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
  /** When true, the component renders without its own outer page chrome so it
   * fits inside another shell (e.g. Fin AI Agent → Studio → Super Agent). */
  embedded?: boolean;
}

type SuperAgentMode = 'investigate' | 'operate';
type SuperAgentAutonomy = 'supervised' | 'assisted' | 'autonomous';

type ModelOption = {
  id: string;
  label: string;
  description: string;
};

type PendingAction = SuperAgentAction & {
  confirmationReason?: string;
};

const AUTONOMY_OPTIONS: Array<{
  value: SuperAgentAutonomy;
  label: string;
  description: string;
}> = [
  { value: 'supervised', label: 'Supervised', description: 'Every execution asks for confirmation.' },
  { value: 'assisted', label: 'Assisted', description: 'Only sensitive actions ask for confirmation.' },
  { value: 'autonomous', label: 'Full access', description: 'Safe actions run automatically; sensitive ones still prompt.' },
];

const MODULE_ICONS: Record<string, { icon: string; color: string }> = {
  case: { icon: 'inbox', color: 'text-blue-500' },
  order: { icon: 'shopping_bag', color: 'text-emerald-500' },
  payment: { icon: 'payments', color: 'text-amber-500' },
  customer: { icon: 'person', color: 'text-purple-500' },
  workflow: { icon: 'account_tree', color: 'text-indigo-500' },
  knowledge: { icon: 'menu_book', color: 'text-orange-500' },
  system: { icon: 'settings', color: 'text-gray-500' },
  resolution: { icon: 'auto_fix', color: 'text-rose-500' },
};

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'gpt-5.4-mini', label: '5.4-Mini', description: 'Fast and lightweight' },
  { id: 'gpt-5.4', label: '5.4', description: 'Balanced general-purpose' },
  { id: 'gpt-5.5', label: '5.5', description: 'Highest capability placeholder' },
  { id: 'gemini-2.5-pro', label: 'Gemini Pro', description: 'Gemini family placeholder' },
  { id: 'gemini-2.5-flash', label: 'Gemini Flash', description: 'Fast Gemini placeholder' },
  { id: 'claude-4-sonnet', label: 'Claude Sonnet', description: 'Claude family placeholder' },
  { id: 'claude-4-opus', label: 'Claude Opus', description: 'Higher-capacity Claude placeholder' },
];

const HERO_TITLE_WORDS = ['What', 'can', 'I', 'help', 'with?'];

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
  const timelineEvents = Array.isArray(payload.timelineEvents)
    ? payload.timelineEvents.map((event: any, index: number) => ({
        id: String(event.id || `event-${index}`),
        type: String(event.type || 'tool_result') as AgentTimelineEvent['type'],
        label: String(event.label || 'Agent event'),
        status: event.status === 'running' || event.status === 'failed' || event.status === 'blocked' ? event.status : 'completed',
        detail: event.detail ? String(event.detail) : null,
        tool: event.tool ? String(event.tool) : null,
      })) as AgentTimelineEvent[]
    : [];
  const artifacts = Array.isArray(payload.artifacts)
    ? payload.artifacts.map((artifact: any, index: number) => ({
        id: String(artifact.id || `artifact-${index}`),
        kind: String(artifact.kind || 'analysis') as ResponseArtifact['kind'],
        title: String(artifact.title || 'Insight'),
        summary: String(artifact.summary || ''),
        bullets: Array.isArray(artifact.bullets) ? artifact.bullets.map((item: any) => String(item)) : [],
        status: artifact.status === 'success' || artifact.status === 'warning' || artifact.status === 'danger' ? artifact.status : 'info',
      })) as ResponseArtifact[]
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
        verificationDisplay: action.verificationDisplay || undefined,
      })) as SuperAgentAction[]
    : [];

  return {
    id: String(payload.id || `assistant-${Date.now()}`),
    input: String(payload.input || fallbackInput || ''),
    summary: String(payload.summary || payload.question || payload.error || 'Super Agent is ready.'),
    narrative: payload.narrative ? String(payload.narrative) : undefined,
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
    timelineEvents,
    artifacts,
    reasoningTrail: payload.reasoningTrail || null,
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

function humanizeSuperAgentError(message: string) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  if (!text) return 'Super Agent could not complete the request.';
  if (lower.includes('llm_provider_not_configured') || lower.includes('configura un proveedor llm')) {
    return 'Super Agent needs a configured LLM provider before it can respond or execute actions.';
  }
  if (lower.includes('quota exceeded') || lower.includes('too many requests') || lower.includes('rate limit')) {
    return 'The configured LLM provider is currently out of quota or rate-limited, so Super Agent cannot answer right now.';
  }
  if (lower.includes('max_output_tokens must be positive')) {
    return 'The active LLM profile had an invalid token limit. The runtime now falls back safely, but this request failed before the fix was applied.';
  }
  if (lower === 'internal server error') {
    return 'Super Agent hit an internal server error while processing the request.';
  }
  return text;
}

function assistantFromError(input: string, message: string): AssistantPayload {
  return {
    id: `assistant-error-${Date.now()}`,
    input,
    summary: humanizeSuperAgentError(message),
    statusLine: 'Unavailable',
    sections: [],
    actions: [],
    contextPanel: null,
    agents: [],
    suggestedReplies: ['Retry', 'Open pending approvals'],
    consultedModules: [],
  };
}

function assistantFromExecution(summary: string, sectionTitle: string, items: string[], actions: SuperAgentAction[] = []): AssistantPayload {
  return { id: `assistant-exec-${Date.now()}`, input: '', summary, statusLine: '', sections: [{ title: sectionTitle, items }], actions, contextPanel: null, agents: [], suggestedReplies: [], consultedModules: [] };
}

// ── Plan Engine response → AssistantPayload mapper ───────────────────────────

function planResponseToPayload(planResp: any, trace: any): AssistantPayload {
  const commandResponse =
    planResp?.enrichedResponse
    || trace?.commandResponse
    || planResp?.plan?.commandResponse
    || planResp?.response?.enrichedResponse
    || null;
  if (commandResponse) {
    return normalizeAssistantPayload(
      commandResponse,
      commandResponse.input || planResp?.response?.plan?.responseTemplate || '',
      commandResponse.runId || trace?.runId || planResp?.sessionId || planResp?.response?.plan?.planId || null,
    );
  }

  const id = `assistant-plan-${Date.now()}`;
  const status = trace?.status ?? 'success';
  const summary = trace?.summary ?? planResp?.response?.plan?.rationale ?? planResp?.response?.summary ?? '';

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
    runId: trace?.runId || planResp?.sessionId || planResp?.response?.plan?.planId || null,
  }, '', trace?.runId || planResp?.sessionId || planResp?.response?.plan?.planId || null);
}

function getAutonomyMeta(level: SuperAgentAutonomy) {
  return AUTONOMY_OPTIONS.find((option) => option.value === level) ?? AUTONOMY_OPTIONS[1];
}

function getModelMeta(modelId: string) {
  return MODEL_OPTIONS.find((option) => option.id === modelId) ?? MODEL_OPTIONS[0];
}

function isSensitiveAction(action: SuperAgentAction) {
  return action.requiresConfirmation === true || action.sensitive === true;
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

function lineToneClass(tone: 'muted' | 'normal' | 'success' | 'warning' | 'danger' | 'link' = 'normal') {
  switch (tone) {
    case 'success':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'warning':
      return 'text-amber-600 dark:text-amber-400';
    case 'danger':
      return 'text-red-600 dark:text-red-400';
    case 'link':
      return 'text-blue-600 dark:text-blue-400';
    case 'muted':
      return 'text-gray-400 dark:text-gray-500';
    default:
      return 'text-gray-800 dark:text-gray-100';
  }
}

function stepTone(step: StreamStep): 'muted' | 'normal' | 'success' | 'warning' | 'danger' {
  if (step.status === 'failed') return 'danger';
  if (step.status === 'running') return 'warning';
  return 'success';
}

function eventTone(event: AgentTimelineEvent): 'muted' | 'normal' | 'success' | 'warning' | 'danger' {
  if (event.status === 'failed' || event.type === 'blocked') return 'danger';
  if (event.status === 'running' || event.type === 'approval_required') return 'warning';
  if (event.type === 'done' || event.type === 'tool_result' || event.type === 'edit') return 'success';
  return 'muted';
}

function eventLabel(event: AgentTimelineEvent) {
  switch (event.type) {
    case 'thinking': return 'Thinking';
    case 'tool_started': return 'Running';
    case 'tool_result': return 'Ran';
    case 'edit': return 'Edited';
    case 'approval_required': return 'Approval';
    case 'blocked': return 'Blocked';
    case 'done': return 'Done';
    default: return 'Agent';
  }
}

function artifactAccent(status?: ResponseArtifact['status']) {
  switch (status) {
    case 'success':
      return 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20';
    case 'warning':
      return 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20';
    case 'danger':
      return 'border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20';
    default:
      return 'border-gray-200 bg-white/80 dark:border-gray-800 dark:bg-gray-950/70';
  }
}

function actionTone(action: SuperAgentAction): 'muted' | 'normal' | 'warning' | 'link' {
  if (action.allowed === false) return 'muted';
  if (action.type === 'execute' || action.requiresConfirmation) return 'warning';
  return 'link';
}

function TranscriptLine({
  label,
  children,
  tone = 'normal',
}: {
  label?: string;
  children: React.ReactNode;
  key?: React.Key;
  tone?: 'muted' | 'normal' | 'success' | 'warning' | 'danger' | 'link';
}) {
  return (
    <div className="flex gap-3 text-[15px] leading-7">
      <div className="w-24 shrink-0 truncate text-right text-[13px] text-gray-400 dark:text-gray-500">{label || ''}</div>
      <div className={`min-w-0 flex-1 ${lineToneClass(tone)}`}>{children}</div>
    </div>
  );
}

function AgentTranscriptMessage({
  message,
  onAction,
  onReply,
}: {
  message: Extract<ConversationMessage, { role: 'assistant' }>;
  onAction: (action: SuperAgentAction) => void;
  onReply: (reply: string) => void;
}) {
  const payload = message.payload;
  const isThinking = payload.summary === 'Thinking through your request...' && !payload.narrative;
  const commandCount = (payload.steps?.length || 0) + payload.agents.length + payload.consultedModules.length;
  const narrativeLines = (payload.narrative || payload.summary || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const visibleSections = payload.sections.filter((section) => section.items.length > 0);
  const visibleActions = payload.actions.slice(0, 4);
  const visibleReplies = payload.suggestedReplies.slice(0, 4);

  return (
    <div className={message.muted ? 'opacity-60' : ''}>
      {commandCount > 0 ? (
        <TranscriptLine label={`Ran ${commandCount}`} tone="muted">
          commands
        </TranscriptLine>
      ) : null}

      {payload.statusLine || payload.runId ? (
        <TranscriptLine label="Status" tone="muted">
          <span>{payload.statusLine || 'Ready'}</span>
          {payload.runId ? <span className="ml-2 text-gray-400">Run {payload.runId.slice(0, 8)}</span> : null}
        </TranscriptLine>
      ) : null}

      {isThinking ? (
        <TranscriptLine label="Thinking" tone="muted">
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" />
            Thinking
          </span>
        </TranscriptLine>
      ) : narrativeLines.length > 0 ? (
        narrativeLines.map((line, index) => (
          <TranscriptLine key={`${payload.id}-narrative-${index}`} label={index === 0 ? 'Agent' : ''}>
            {line}
          </TranscriptLine>
        ))
      ) : null}

      {payload.consultedModules.length > 0 ? (
        <TranscriptLine label="Read" tone="muted">
          {payload.consultedModules.map((mod, index) => (
            <span key={mod}>
              <span className="font-medium text-gray-600 dark:text-gray-300">{mod}</span>
              {index < payload.consultedModules.length - 1 ? <span className="text-gray-300">, </span> : null}
            </span>
          ))}
        </TranscriptLine>
      ) : null}

      {payload.agents.map((agent) => (
        <TranscriptLine key={`${payload.id}-agent-${agent.slug}`} label="Agent" tone={agent.status === 'blocked' ? 'danger' : agent.status === 'executed' ? 'success' : 'muted'}>
          <span className="font-medium">{agent.name}</span>
          <span className="ml-2 text-gray-400">{agent.summary}</span>
        </TranscriptLine>
      ))}

      {payload.steps?.map((step) => (
        <TranscriptLine key={`${payload.id}-step-${step.id}`} label={step.status === 'running' ? 'Running' : step.status === 'failed' ? 'Failed' : 'Ran'} tone={stepTone(step)}>
          <span className="font-medium">{step.label}</span>
          {step.detail ? <span className="ml-2 text-gray-400">{step.detail}</span> : null}
        </TranscriptLine>
      ))}

      {payload.timelineEvents?.filter((event) => !payload.steps?.some((step) => step.id === event.id)).map((event) => (
        <TranscriptLine key={`${payload.id}-event-${event.id}`} label={eventLabel(event)} tone={eventTone(event)}>
          <span className="font-medium">{event.label}</span>
          {event.detail ? <span className="ml-2 text-gray-400">{event.detail}</span> : null}
        </TranscriptLine>
      ))}

      {visibleSections.map((section) => (
        <div key={`${payload.id}-section-${section.title}`}>
          <TranscriptLine label={section.title} tone="muted">
            {section.items[0]}
          </TranscriptLine>
          {section.items.slice(1, 6).map((item, index) => (
            <TranscriptLine key={`${payload.id}-${section.title}-${index}`} label="">
              {item}
            </TranscriptLine>
          ))}
        </div>
      ))}

      {payload.evidence?.slice(0, 4).map((item, index) => (
        <TranscriptLine key={`${payload.id}-evidence-${index}`} label={index === 0 ? 'Evidence' : ''} tone="muted">
          {item}
        </TranscriptLine>
      ))}

      {visibleActions.length > 0 ? (
        <TranscriptLine label="Actions">
          <div className="flex flex-wrap gap-2 pt-0.5">
            {visibleActions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => onAction(action)}
                disabled={action.allowed === false}
                className={`rounded-md px-2 py-1 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${lineToneClass(actionTone(action))} hover:bg-gray-100 dark:hover:bg-gray-800`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </TranscriptLine>
      ) : null}

      {visibleReplies.length > 0 ? (
        <TranscriptLine label="Try" tone="muted">
          <div className="flex flex-wrap gap-2 pt-0.5">
            {visibleReplies.map((reply) => (
              <button
                key={`${payload.id}-${reply}`}
                type="button"
                onClick={() => onReply(reply)}
                className="rounded-md px-2 py-1 text-[13px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                {reply}
              </button>
            ))}
          </div>
        </TranscriptLine>
      ) : null}
    </div>
  );
}

// ── Thinking Indicator Component ──────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <span className="h-px w-10 origin-left animate-pulse rounded-full bg-gray-300 dark:bg-gray-600" />
  );
}

function ThinkingCard() {
  return (
    <div className="max-w-4xl">
      <div className="flex gap-3 text-[15px] leading-7">
        <span className="w-24 shrink-0 text-right text-[13px] text-gray-400 dark:text-gray-500">Thinking</span>
        <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-gray-400 dark:text-gray-500">
          <ThinkingIndicator />
          Thinking
        </span>
      </div>
    </div>
  );
}

// ── Agent Card Component ──────────────────────────────────────────

interface AgentCardProps {
  agent: AgentCard;
}

const AgentCardComponent: React.FC<AgentCardProps> = ({ agent }) => {
  const statusColor =
    agent.status === 'executed' ? 'bg-emerald-500'
    : agent.status === 'proposed' || agent.status === 'consulted' ? 'bg-amber-500'
    : agent.status === 'blocked' ? 'bg-red-500'
    : 'bg-gray-400';

  return (
    <div className="flex items-center gap-2 rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2 border border-gray-200 dark:border-gray-700">
      <div className={`h-2 w-2 rounded-full ${statusColor}`} />
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{agent.name}</span>
    </div>
  );
};

// ── Streaming Steps Component ─────────────────────────────────────────

function StreamingStepsComponent({ steps }: { steps: StreamStep[] }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="space-y-1">
        {steps.map((step) => (
          <TranscriptLine key={step.id} label={step.status === 'running' ? 'Running' : step.status === 'failed' ? 'Failed' : 'Ran'} tone={stepTone(step)}>
            {step.status === 'completed' && (
              <span className="text-emerald-500 font-semibold">✓</span>
            )}
            {step.status === 'running' && (
              <span className="text-amber-500 animate-pulse">⏳</span>
            )}
            {step.status === 'failed' && (
              <span className="text-red-500 font-semibold">✗</span>
            )}
            <span className="font-medium">{step.label}</span>
            {step.detail ? <span className="ml-2 text-gray-400">{step.detail}</span> : null}
          </TranscriptLine>
        ))}
    </div>
  );
}

export default function SuperAgent({ onNavigate, activeTarget, embedded: _embedded = false }: SuperAgentProps) {
  // The `embedded` prop currently has no effect on the SuperAgent body — it
  // already renders as a single column. Reserved for future tweaks (e.g.
  // dropping outer padding when nested in another shell). Suppress unused
  // warning while keeping the prop in the public surface.
  void _embedded;
  const activeSection = activeTarget?.section || 'command-center';

  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrix | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [contextPanel, setContextPanel] = useState<ContextPanel | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const { blocked: aiCreditsBlocked } = useAICredits();
  const [composerText, setComposerText] = useState('');
  // Default to "operate" so the agent actually persists its plan steps. The
  // policy engine still gates high-risk writes (refunds > threshold, order
  // cancels post-fulfilment, settings, etc.) via approvals — investigate is
  // for planning-only sessions.
  const [mode, setMode] = useState<SuperAgentMode>('operate');
  const [planMode, setPlanMode] = useState(false);
  const [autonomyLevel, setAutonomyLevel] = useState<SuperAgentAutonomy>('assisted');
  const [selectedModelId, setSelectedModelId] = useState<string>(MODEL_OPTIONS[0].id);
  const [openControlMenu, setOpenControlMenu] = useState<'mode' | 'autonomy' | 'model' | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [streamActivity, setStreamActivity] = useState<StreamActivity | null>(null);
  const [sseReconnectAttempt, setSseReconnectAttempt] = useState(0);
  const [caseCreatedToast, setCaseCreatedToast] = useState<{
    caseId: string;
    caseNumber: string;
    source?: string | null;
  } | null>(null);
  const [isStreamConnected, setIsStreamConnected] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<ProactiveAlert[]>([]);
  const [planSessionId, setPlanSessionId] = useState<string | null>(null);
  // Right-side conversations sidebar (saved threads).
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [conversationsRefreshKey, setConversationsRefreshKey] = useState(0);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [recentTraces, setRecentTraces] = useState<Array<{ planId: string; status: string; summary: string; startedAt: string; endedAt: string }>>([]);
  const [traceMetrics, setTraceMetrics] = useState<{ total: number; success: number; partial: number; failed: number; pendingApproval: number; rejectedByPolicy: number; averageLatencyMs: number; averageSpanCount: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const controlBarRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamRunIdRef = useRef<string | null>(null);
  const streamMessageIdRef = useRef<string | null>(null);
  const loadedDraftPromptRef = useRef<string | null>(null);
  const modeLabel = mode === 'investigate' ? 'Investigate' : 'Operate';
  const planSuggestionVisible = !planMode && /\bplan\b/i.test(composerText.trim());

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
    const draftPrompt = activeTarget?.draftPrompt?.trim();
    if (!draftPrompt) return;
    const draftKey = `${activeTarget?.runId || activeTarget?.entityId || 'draft'}:${draftPrompt}`;
    if (loadedDraftPromptRef.current === draftKey) return;

    loadedDraftPromptRef.current = draftKey;
    setComposerText(draftPrompt);
    setMode('operate');
    setPlanMode(false);
    setOpenControlMenu(null);
    window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, [activeTarget]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, 74), 220);
    el.style.height = `${nextHeight}px`;
  }, [composerText, planSuggestionVisible, planMode, mode]);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const parseData = (e: MessageEvent) => { try { return JSON.parse(e.data || '{}'); } catch { return {}; } };
    const updateIfCurrent = (e: MessageEvent, fn: (d: any, c: StreamActivity) => StreamActivity) => {
      const data = parseData(e);
      setStreamActivity((cur) => (!cur || data.runId !== cur.runId) ? cur : fn(data, cur));
    };

    async function connectSSE() {
      if (cancelled) return;

      // Pull the current Supabase access token (if any) and pass it as a
      // query param — EventSource cannot set Authorization headers in the
      // browser. The server strips this from logs (see sse.ts).
      let token: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token ?? null;
      } catch {
        // Auth lookup failed — connect anonymously; backend will reject if required.
      }
      if (cancelled) return;

      const url = token
        ? `/api/sse/agent-runs?token=${encodeURIComponent(token)}`
        : '/api/sse/agent-runs';

      const es = new EventSource(url);
      source = es;

      es.addEventListener('connected', () => {
        attempts = 0;
        setSseReconnectAttempt(0);
        setIsStreamConnected(true);
      });
      es.addEventListener('super-agent:run_started', ((e: MessageEvent) => {
        const data = parseData(e);
        setStreamActivity((cur) => (!cur || data.runId !== cur.runId) ? cur : { ...cur, statusLine: 'Thinking…' });
      }) as EventListener);
      es.addEventListener('super-agent:message_chunk', ((e: MessageEvent) => {
        updateIfCurrent(e, (d, c) => ({ ...c, text: `${c.text}${d.chunk || ''}` }));
      }) as EventListener);
      es.addEventListener('super-agent:step_started', ((e: MessageEvent) => {
        updateIfCurrent(e, (d, c) => ({ ...c, statusLine: d.step?.label || c.statusLine, steps: [...c.steps.filter((s) => s.id !== d.step?.id), d.step].filter(Boolean) }));
      }) as EventListener);
      es.addEventListener('super-agent:step_completed', ((e: MessageEvent) => {
        updateIfCurrent(e, (d, c) => ({ ...c, statusLine: d.step?.label || 'Done', steps: [...c.steps.filter((s) => s.id !== d.step?.id), d.step].filter(Boolean) }));
      }) as EventListener);
      es.addEventListener('super-agent:agent_called', ((e: MessageEvent) => {
        updateIfCurrent(e, (d, c) => ({ ...c, agents: [...c.agents.filter((a) => a.slug !== d.agent?.slug), { slug: d.agent?.slug || 'agent', name: d.agent?.name || 'Agent', runtime: d.agent?.runtime || null, mode: d.agent?.mode || null, status: d.agent?.status || 'consulted', summary: 'Consulting...' }] }));
      }) as EventListener);
      es.addEventListener('super-agent:agent_result', ((e: MessageEvent) => {
        updateIfCurrent(e, (d, c) => ({ ...c, agents: [...c.agents.filter((a) => a.slug !== d.agent?.slug), { slug: d.agent?.slug || 'agent', name: d.agent?.name || 'Agent', runtime: null, mode: null, status: d.agent?.status || 'consulted', summary: d.agent?.summary || 'Completed.' }] }));
      }) as EventListener);
      es.addEventListener('super-agent:run_finished', ((e: MessageEvent) => {
        updateIfCurrent(e, (d, c) => ({ ...c, statusLine: d.statusLine || 'Done' }));
      }) as EventListener);
      es.addEventListener('super-agent:run_failed', ((e: MessageEvent) => {
        updateIfCurrent(e, (d, c) => ({ ...c, error: d.error || 'Run failed.', statusLine: 'Failed' }));
      }) as EventListener);
      es.addEventListener('super-agent:workspace_alert', ((e: MessageEvent) => {
        const data = parseData(e);
        if (data.alerts && Array.isArray(data.alerts)) {
          setLiveAlerts((prev) => {
            const merged = [...prev];
            for (const a of data.alerts as ProactiveAlert[]) {
              if (!merged.some((x) => x.label === a.label)) merged.push(a);
            }
            return merged;
          });
        }
      }) as EventListener);

      // New-case notification (emitted by webhookProcess when an inbound
      // webhook auto-creates a case). Surface as a toast that links to the
      // case_graph page on click.
      es.addEventListener('case:created', ((e: MessageEvent) => {
        const data = parseData(e);
        if (!data?.caseId) return;
        setCaseCreatedToast({
          caseId: String(data.caseId),
          caseNumber: String(data.caseNumber || data.caseId),
          source: data.source ?? null,
        });
      }) as EventListener);

      es.onerror = () => {
        setIsStreamConnected(false);
        try { es.close(); } catch { /* noop */ }
        if (source === es) source = null;
        if (cancelled) return;

        attempts += 1;
        setSseReconnectAttempt(attempts);
        // Exponential backoff capped at 30s: 1s, 2s, 4s, 8s, 16s, 30s, 30s...
        const delay = Math.min(30_000, 1000 * Math.pow(2, attempts - 1));
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          void connectSSE();
        }, delay);
      };
    }

    void connectSSE();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (source) {
        try { source.close(); } catch { /* noop */ }
        source = null;
      }
    };
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

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (controlBarRef.current && !controlBarRef.current.contains(event.target as Node)) {
        setOpenControlMenu(null);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function buildCommandContext() {
    const latest = [...messages].reverse().find((m) => m.role === 'assistant') as Extract<ConversationMessage, { role: 'assistant' }> | undefined;
    const recentTargets = dedupeTargets([
      activeTarget,
      contextPanel?.entityType && contextPanel?.entityId ? { page: fallbackNavigationTarget(pageFromContextPanel(contextPanel.entityType), contextPanel.entityId)?.page || 'super_agent', entityType: contextPanel.entityType, entityId: contextPanel.entityId, section: null, sourceContext: 'context_panel', runId: latest?.payload.runId || null } : null,
      latest?.payload.navigationTarget || null,
      ...(latest?.payload.actions || []).map((a) => a.navigationTarget || fallbackNavigationTarget(a.targetPage, a.focusId ?? null)),
    ]);
    return {
      sessionId: planSessionId,
      activeTarget: activeTarget || null,
      recentTargets,
      lastStructuredIntent: latest?.payload.structuredIntent || null,
      autonomyLevel,
      model: selectedModelId,
      mode,
      planMode,
    };
  }

  function confirmationReasonForAction(action: SuperAgentAction) {
    if (autonomyLevel === 'supervised') {
      return 'Supervised mode requires confirmation before any execution.';
    }
    if (action.requiresConfirmation) {
      return 'The backend marked this action as requiring approval.';
    }
    if (action.sensitive) {
      return autonomyLevel === 'assisted'
        ? 'Assisted mode keeps sensitive actions behind confirmation.'
        : 'Sensitive action selected for review.';
    }
    return 'This action is queued for confirmation.';
  }

  function shouldRequireConfirmation(action: SuperAgentAction) {
    if (action.type !== 'execute') return false;
    if (autonomyLevel === 'supervised') return true;
    if (autonomyLevel === 'assisted') return action.requiresConfirmation === true || action.sensitive === true;
    return action.requiresConfirmation === true;
  }

  async function runAction(action: PendingAction, sourceContext: string, confirmed: boolean) {
    const runId = window.crypto?.randomUUID?.() || `run-${Date.now()}`;
    setIsExecuting(true);
    setOpenControlMenu(null);
    streamRunIdRef.current = runId;
    setStreamActivity({ runId, statusLine: 'Executing...', text: '', steps: [], agents: [], error: null });
    try {
      const result = await superAgentApi.execute(action.payload || {}, confirmed, {
        runId,
        sourceContext,
        autonomyLevel,
        model: selectedModelId,
      });
      if (result.ok) {
        const update = assistantFromExecution(`${action.label} completed.`, 'Result', [action.description, 'Change recorded in the audit trail.']);
        setMessages((c) => [...c, { id: update.id, role: 'assistant', payload: update }]);
        setStreamActivity(null);
        const refreshPrompt = action.payload?.kind === 'approval.decide'
          ? 'Pending approvals'
          : [action.payload?.entityType, action.payload?.entityId].filter(Boolean).join(' ') || action.label;
        const refreshed = await superAgentApi.command(refreshPrompt, {
          runId: window.crypto?.randomUUID?.() || `run-${Date.now()}`,
          mode: 'investigate',
          autonomyLevel,
          model: selectedModelId,
          context: buildCommandContext(),
        });
        const rp = normalizeAssistantPayload(refreshed.response as Partial<AssistantPayload>, refreshPrompt, refreshed.response?.runId || null);
        setMessages((c) => [...c, { id: rp.id, role: 'assistant', payload: rp, muted: true }]);
        if (refreshed.permissionMatrix) setPermissionMatrix(refreshed.permissionMatrix);
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
        const failure = assistantFromExecution('Action blocked.', 'Blocked', [result.error || action.blockedReason || 'Action could not be executed.']);
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

  // ── Saved-conversation handlers (right sidebar) ─────────────────────────
  // Reset the visible chat so the next turn starts a new session. The
  // backend will allocate a fresh sessionId on the first /command call;
  // until then planSessionId is null (no memory).
  function handleNewConversation() {
    setMessages([]);
    setPlanSessionId(null);
    setStreamActivity(null);
    setComposerText('');
    setPendingAction(null);
  }

  // Load a previously-saved conversation. The backend enforces ownership:
  // GET /super-agent/sessions/:id only returns the row if it belongs to
  // req.userId, so a guessed UUID can't expose someone else's thread.
  async function handleSelectSession(sessionId: string) {
    if (sessionId === planSessionId || isLoadingSession) return;
    setIsLoadingSession(true);
    try {
      const data = await superAgentApi.session(sessionId);
      const session = data?.session;
      if (!session) throw new Error('Conversation not found');
      const turns = Array.isArray(session.turns) ? session.turns : [];
      const replay: ConversationMessage[] = [];
      let counter = 0;
      for (const turn of turns) {
        const id = `replay-${sessionId}-${counter++}`;
        const content = String(turn?.content ?? '').trim();
        if (!content) continue;
        if (turn.role === 'user') {
          replay.push({ id, role: 'user', text: content });
        } else if (turn.role === 'assistant') {
          replay.push({
            id,
            role: 'assistant',
            payload: {
              id,
              input: '',
              summary: content,
              narrative: content,
              statusLine: '',
              sections: [],
              actions: [],
              contextPanel: null,
              agents: [],
              suggestedReplies: [],
              consultedModules: [],
              runId: turn.planId ?? null,
            },
          });
        }
      }
      setMessages(replay);
      setPlanSessionId(sessionId);
      setStreamActivity(null);
      setComposerText('');
      setPendingAction(null);
    } catch (err) {
      setFlashMessage(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setIsLoadingSession(false);
    }
  }

  async function sendPrompt(promptOverride?: string) {
    const prompt = (promptOverride ?? composerText).trim();
    if (!prompt || isSending || isExecuting) return;
    if (aiCreditsBlocked) {
      setFlashMessage('AI credits exhausted. Please add a top-up pack or upgrade your plan.');
      return;
    }
    const finalPrompt = mode === 'operate' && !promptOverride ? `Operate: ${prompt}` : prompt;
    setComposerText('');
    setPendingAction(null);
    setFlashMessage(null);
    setOpenControlMenu(null);
    setIsSending(true);
    const runId = window.crypto?.randomUUID?.() || `run-${Date.now()}`;
    const isPlanMode = planMode;
    const livePayload = normalizeAssistantPayload({
      id: `assistant-live-${runId}`,
      input: finalPrompt,
      summary: isPlanMode ? 'Planning your request...' : 'Thinking through your request...',
      statusLine: isStreamConnected ? (isPlanMode ? 'Planning' : 'Thinking') : 'Thinking',
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
    setStreamActivity({ runId, statusLine: isStreamConnected ? 'Thinking…' : 'Waiting...', text: '', steps: [], agents: [], error: null });

    try {
      const result = isPlanMode
        ? await superAgentApi.plan(finalPrompt, {
            sessionId: planSessionId ?? undefined,
            dryRun: false,
            autonomyLevel,
            model: selectedModelId,
            mode: 'plan',
          })
        : await superAgentApi.command(finalPrompt, {
            runId,
            mode,
            autonomyLevel,
            model: selectedModelId,
            // Persist the session across turns so the agent remembers prior
            // messages. The backend reads sessionId from context.sessionId
            // (see server/routes/superAgent.ts /command handler).
            context: {
              ...buildCommandContext(),
              ...(planSessionId ? { sessionId: planSessionId } : {}),
            },
          });
      if (result.sessionId) setPlanSessionId(result.sessionId);
      // Refresh the saved-conversations sidebar so the latest turn appears at the top.
      setConversationsRefreshKey((k) => k + 1);
      const payload = isPlanMode
        ? planResponseToPayload(result, result.trace || null)
        : normalizeAssistantPayload(result.response as Partial<AssistantPayload>, finalPrompt, result.response?.runId || runId);
      const liveMessageId = streamMessageIdRef.current;
      setMessages((c) => c.map((message) => (
        message.role === 'assistant' && message.payload.id === liveMessageId
          ? { id: payload.id, role: 'assistant', payload }
          : message
      )));
      if (result.permissionMatrix) setPermissionMatrix(result.permissionMatrix);
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

  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      setPlanMode(true);
      setOpenControlMenu(null);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendPrompt();
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction?.payload || isExecuting) return;
    setIsExecuting(true);
    setFlashMessage(null);
    await runAction(pendingAction, 'super_agent_confirmation', true);
  }

  function navigateToTarget(target?: NavigationTarget | null, fallbackPage?: string, fallbackId?: string | null) {
    const resolved = target || fallbackNavigationTarget(fallbackPage, fallbackId);
    if (resolved) onNavigate?.(resolved);
  }

  function handleAction(action: SuperAgentAction) {
    if (action.type === 'navigate') { navigateToTarget(action.navigationTarget, action.targetPage, action.focusId ?? null); return; }
    if (!action.allowed) { setFlashMessage(action.blockedReason || 'Permission denied.'); return; }
    setOpenControlMenu(null);
    const requiresConfirmation = shouldRequireConfirmation(action);
    if (!requiresConfirmation) {
      setFlashMessage(null);
      void runAction({ ...action, confirmationReason: confirmationReasonForAction(action) }, 'super_agent_autonomy', false);
      return;
    }
    setPendingAction({ ...action, confirmationReason: confirmationReasonForAction(action) });
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
    <div className="flex-1 flex h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="relative flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">


        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-56 pt-10 sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <CreditBanner />

            {/* Loading */}
            {isBootstrapping ? (
              <div className="flex min-h-[42vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="h-2 w-24 rounded-full bg-black/5 dark:bg-white/10" />
                  <p className="text-xs text-gray-400">Preparing your workspace</p>
                </div>
              </div>
            ) : null}

            {/* Empty state — minimalist */}
            {!isBootstrapping && messages.length === 0 ? (
              <div className="flex min-h-[58vh] flex-col items-center justify-center gap-8 text-center">
                <div className="relative">
                  <div className="super-agent-title-glow pointer-events-none absolute -inset-x-6 -inset-y-4 rounded-full bg-sky-500/5 blur-2xl dark:bg-sky-400/5" />
                  <h1 className="relative flex flex-wrap justify-center gap-x-2.5 gap-y-1 text-4xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
                    {HERO_TITLE_WORDS.map((word, index) => (
                      <span
                        key={word}
                        className="super-agent-title-word inline-block"
                        style={{ animationDelay: `${120 + index * 80}ms` }}
                      >
                        {word}
                      </span>
                    ))}
                  </h1>
                </div>
                {emptyHints.length > 0 ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    {emptyHints.map((hint) => (
                      <button
                        key={hint}
                        type="button"
                        onClick={() => void sendPrompt(hint)}
                        className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-white"
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
            {messages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <UserMessage key={msg.id}>{msg.text}</UserMessage>
                );
              }
              const isThinking = msg.payload.summary === 'Thinking through your request...' && !msg.payload.narrative;
              const isStreaming = isSending && streamMessageIdRef.current === msg.payload.id && !isThinking;
              const toolCalls: ToolCallData[] = (msg.payload.steps || []).map((step) => ({
                id: step.id,
                name: step.label || 'tool',
                status: step.status,
                detail: step.detail,
                result: step.detail || undefined,
              }));
              return (
                <div key={msg.id} className={msg.muted ? 'opacity-60' : ''}>
                  {isThinking ? (
                    <ThinkingPill
                      label={msg.payload.statusLine || 'Thinking'}
                      detail={msg.payload.consultedModules?.length ? `Consulting ${msg.payload.consultedModules.join(', ')}…` : null}
                    />
                  ) : (
                    <AssistantMessage>
                      {/* The plain narrative — written like a normal reply, no bubble. */}
                      <div className="text-[15px] leading-7">
                        <Markdown text={msg.payload.narrative || msg.payload.summary || ''} />
                        {isStreaming ? <StreamingCaret /> : null}
                      </div>

                      {/* Inline approval cards — surface gated actions (refund > threshold,
                          cancel post-fulfilment, etc.) right in the chat with Approve/Reject
                          buttons. Each renders its own state and decides via the backend. */}
                      {(() => {
                        const approvalActions = (msg.payload.actions || []).filter(
                          (a) => a.targetPage === 'approvals' && a.focusId,
                        );
                        if (approvalActions.length === 0) return null;
                        return (
                          <div className="flex flex-col gap-2">
                            {approvalActions.map((a) => (
                              <InlineApprovalCard
                                key={a.id}
                                approvalId={a.focusId as string}
                              />
                            ))}
                          </div>
                        );
                      })()}

                      {/* Everything technical (tool calls, reasoning, consulted modules, agents)
                          collapses into a single <details>. Collapsed by default. */}
                      {(toolCalls.length > 0
                        || msg.payload.reasoningTrail
                        || (msg.payload.consultedModules?.length ?? 0) > 0
                        || (msg.payload.agents?.length ?? 0) > 0
                        || msg.payload.runId) ? (
                        <details className="group mt-1 text-[13px] text-gray-500 dark:text-gray-400">
                          <summary className="flex cursor-pointer list-none items-center gap-1.5 select-none hover:text-gray-700 dark:hover:text-gray-200">
                            <svg
                              aria-hidden
                              viewBox="0 0 12 12"
                              className="h-3 w-3 transition-transform group-open:rotate-90"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <path d="M4 2 L8 6 L4 10" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span>
                              {toolCalls.length > 0
                                ? `${toolCalls.length} step${toolCalls.length === 1 ? '' : 's'}`
                                : 'Investigation'}
                              {msg.payload.runId ? ` · Run ${msg.payload.runId.slice(0, 8)}` : ''}
                            </span>
                          </summary>
                          <div className="mt-3 space-y-3 border-l border-gray-200 pl-4 dark:border-gray-700">

                      {toolCalls.length > 0 ? (
                        <div className="space-y-1.5">
                          {toolCalls.map((call) => (
                            <ToolCallCard key={call.id} call={call} />
                          ))}
                        </div>
                      ) : null}

                      {msg.payload.reasoningTrail ? (
                        <div className="rounded-2xl border border-gray-200 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/70">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                              Why this path
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400">
                              Confidence {Math.round((msg.payload.reasoningTrail.confidence || 0) * 100)}%
                            </div>
                          </div>
                          <div className="mt-2 text-[14px] leading-6 text-gray-900 dark:text-white">
                            {msg.payload.reasoningTrail.summary}
                          </div>
                          <div className="mt-3 space-y-1 text-[13px] leading-5 text-gray-600 dark:text-gray-400">
                            <div><span className="font-medium text-gray-800 dark:text-gray-200">Intent:</span> {msg.payload.reasoningTrail.intent}</div>
                            {msg.payload.reasoningTrail.approvalRequired ? (
                              <div><span className="font-medium text-gray-800 dark:text-gray-200">Approval:</span> required before the sensitive step runs</div>
                            ) : null}
                            {msg.payload.reasoningTrail.approvalReasons?.length ? (
                              <div className="space-y-1">
                                <div className="font-medium text-gray-800 dark:text-gray-200">Approval reasons</div>
                                {msg.payload.reasoningTrail.approvalReasons.slice(0, 3).map((reason, index) => (
                                  <div key={`${msg.id}-approval-${index}`} className="pl-3 text-gray-500 dark:text-gray-400">
                                    • {reason}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {msg.payload.reasoningTrail.signals?.length ? (
                              <div className="space-y-1">
                                <div className="font-medium text-gray-800 dark:text-gray-200">Signals</div>
                                {msg.payload.reasoningTrail.signals.slice(0, 4).map((signal, index) => (
                                  <div key={`${msg.id}-signal-${index}`} className="pl-3 text-gray-500 dark:text-gray-400">
                                    • {signal.source}: {signal.observation}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {msg.payload.reasoningTrail.notes?.length ? (
                              <div className="space-y-1">
                                <div className="font-medium text-gray-800 dark:text-gray-200">Notes</div>
                                {msg.payload.reasoningTrail.notes.slice(0, 3).map((note, index) => (
                                  <div key={`${msg.id}-note-${index}`} className="pl-3 text-gray-500 dark:text-gray-400">
                                    • {note}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {msg.payload.artifacts && msg.payload.artifacts.length > 0 ? (
                        <div className="space-y-3">
                          {msg.payload.artifacts.slice(0, 3).map((artifact) => (
                            <div
                              key={`${msg.id}-${artifact.id}`}
                              className={`rounded-2xl border p-4 shadow-sm ${artifactAccent(artifact.status)}`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                                  {artifact.title}
                                </div>
                                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                  {artifact.kind.replace('_', ' ')}
                                </div>
                              </div>
                              <div className="mt-2 text-[14px] leading-6 text-gray-900 dark:text-white">
                                {artifact.summary}
                              </div>
                              {artifact.bullets.length > 0 ? (
                                <div className="mt-3 space-y-1 text-[13px] leading-5 text-gray-600 dark:text-gray-400">
                                  {artifact.bullets.slice(0, 4).map((bullet, index) => (
                                    <div key={`${artifact.id}-bullet-${index}`} className="pl-3">
                                      • {bullet}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {msg.payload.consultedModules.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                          <span className="uppercase tracking-[0.18em] text-gray-400">Read</span>
                          {msg.payload.consultedModules.map((mod) => (
                            <span key={mod} className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                              {mod}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {msg.payload.agents.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {msg.payload.agents.map((agent) => (
                            <span
                              key={agent.slug}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] ${
                                agent.status === 'blocked'
                                  ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
                                  : agent.status === 'executed'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                                  : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                              }`}
                            >
                              <span className="font-medium">{agent.name}</span>
                              <span className="opacity-70">{agent.summary}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {msg.payload.timelineEvents && msg.payload.timelineEvents.length > 0 ? (
                        <div className="space-y-1.5">
                          {msg.payload.timelineEvents
                            .filter((event) => !msg.payload.steps?.some((step) => step.id === event.id))
                            .map((event) => (
                              <ToolCallCard
                                key={`${msg.id}-${event.id}`}
                                call={{
                                  id: event.id,
                                  name: event.tool || eventLabel(event),
                                  status: event.status === 'failed' ? 'failed' : event.status === 'running' ? 'running' : 'completed',
                                  detail: event.label,
                                  result: event.detail || undefined,
                                }}
                              />
                            ))}
                        </div>
                      ) : null}

                      {msg.payload.reasoningTrail || msg.payload.artifacts?.length ? null : null}

                      {(() => {
                        // Skip navigation buttons for approvals — they're rendered
                        // as InlineApprovalCard above with proper accept/reject UX.
                        const visible = msg.payload.actions.filter(
                          (a) => !(a.targetPage === 'approvals' && a.focusId),
                        );
                        return visible.length > 0 ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {visible.slice(0, 4).map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              onClick={() => handleAction(action)}
                              disabled={action.allowed === false}
                              className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                action.type === 'execute'
                                  ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40'
                                  : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800'
                              }`}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                        ) : null;
                      })()}

                      {msg.payload.suggestedReplies.length > 0 ? (
                        <div className="flex flex-wrap gap-2 pt-0.5">
                          {msg.payload.suggestedReplies.slice(0, 3).map((reply) => (
                            <button
                              key={`${msg.id}-${reply}`}
                              type="button"
                              onClick={() => void sendPrompt(reply)}
                              className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-[12px] text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-100"
                            >
                              {reply}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {/* Interoperability Chips (hidden, kept for future surfacing) */}
                      {(msg.payload.consultedModules?.length ?? 0) > 0 && (
                        <div className="hidden">
                          {msg.payload.consultedModules.map((mod) => {
                            const meta = MODULE_ICONS[mod.toLowerCase()] || MODULE_ICONS.system;
                            return (
                              <div key={mod} className="flex items-center gap-1">
                                <span className={`material-symbols-outlined text-[10px] ${meta.color}`}>{meta.icon}</span>
                                <span>{mod}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                          </div>
                        </details>
                      ) : null}
                    </AssistantMessage>
                  )}
                </div>
              );
            })}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input — pinned bottom */}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-5 pt-16 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-card-dark dark:via-card-dark/95 sm:px-6 sm:pb-6">
          <div className="mx-auto w-full max-w-3xl">

            {flashMessage ? (
              <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">{flashMessage}</p>
            ) : null}

            {!isStreamConnected && sseReconnectAttempt > 0 ? (
              <div
                role="status"
                aria-live="polite"
                className="mb-2 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400"
              >
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                <span>Reconnecting to live stream… (attempt {sseReconnectAttempt})</span>
              </div>
            ) : null}

            {caseCreatedToast ? (
              <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => {
                    const target = fallbackNavigationTarget('case_graph', caseCreatedToast.caseId);
                    if (target) onNavigate?.(target);
                    setCaseCreatedToast(null);
                  }}
                >
                  <span className="font-semibold">New case{caseCreatedToast.source ? ` from ${caseCreatedToast.source}` : ''}: </span>
                  <span className="underline">{caseCreatedToast.caseNumber}</span>
                  <span className="ml-1 opacity-70">— click to open</span>
                </button>
                <button
                  type="button"
                  aria-label="Dismiss"
                  className="opacity-60 hover:opacity-100"
                  onClick={() => setCaseCreatedToast(null)}
                >
                  ×
                </button>
              </div>
            ) : null}

            {pendingAction ? (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
                <div className="mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Confirm Operation</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-gray-900 dark:text-amber-300">
                      {getAutonomyMeta(autonomyLevel).label}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-900 dark:text-gray-300">
                      {getModelMeta(selectedModelId).label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{pendingAction.confirmationReason || pendingAction.description}</p>
                </div>

                {pendingAction.verificationDisplay && (
                  <div className="mb-3 space-y-2 rounded-lg bg-white p-3 dark:bg-gray-900">
                    {pendingAction.verificationDisplay.beforeState && (
                      <div>
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Before:</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                          {Object.entries(pendingAction.verificationDisplay.beforeState)
                            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                            .join(' · ')}
                        </p>
                      </div>
                    )}
                    {pendingAction.verificationDisplay.afterState && (
                      <div>
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">After:</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                          {Object.entries(pendingAction.verificationDisplay.afterState)
                            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                            .join(' · ')}
                        </p>
                      </div>
                    )}
                    {pendingAction.verificationDisplay.impacts && pendingAction.verificationDisplay.impacts.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Impact:</p>
                        <ul className="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside">
                          {pendingAction.verificationDisplay.impacts.map((impact, idx) => (
                            <li key={idx}>{impact}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={() => setPendingAction(null)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
                    Cancel
                  </button>
                  <button type="button" onClick={() => void confirmPendingAction()} disabled={isExecuting} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-800">
                    {isExecuting ? 'Executing...' : `Execute — ${pendingAction.label}`}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="super-agent-composer-shell space-y-2">
              {planSuggestionVisible ? (
                <div className="flex justify-center px-4">
                  <button
                    type="button"
                    onClick={() => {
                      setPlanMode(true);
                      setOpenControlMenu(null);
                    }}
                    className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] text-gray-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-blue-900 dark:hover:bg-blue-950/40 dark:hover:text-blue-200"
                  >
                    <span className="material-symbols-outlined text-[14px] text-blue-600 dark:text-blue-300">playlist_add_check</span>
                    <span className="font-medium text-gray-900 dark:text-white">Create a plan</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-300">Shift + Tab</span>
                    <span className="text-blue-600 dark:text-blue-300">Use plan mode</span>
                  </button>
                </div>
              ) : null}
            <div className="rounded-3xl border border-gray-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition-shadow focus-within:shadow-[0_12px_34px_rgba(15,23,42,0.08)] dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/20">
              <textarea
                ref={textareaRef}
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  planMode
                    ? 'Plan the next steps, review branches, or outline an execution path...'
                    : mode === 'operate'
                    ? 'Ask to update, refund, cancel, or publish...'
                    : 'Ask about an order, payment, customer, case, or approval...'
                }
                rows={3}
                className={`max-h-[220px] min-h-[74px] w-full resize-none overflow-y-auto bg-transparent px-5 text-[15px] leading-6 text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500 ${planSuggestionVisible ? 'pt-3 pb-1' : 'pt-4 pb-1'}`}
              />
              <div ref={controlBarRef} className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
                <div className="flex flex-wrap items-center gap-1">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenControlMenu(openControlMenu === 'mode' ? null : 'mode')}
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium transition-colors ${
                        mode === 'investigate'
                          ? 'text-gray-900 dark:text-white'
                          : 'text-gray-700 dark:text-gray-200'
                      } hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white`}
                    >
                      <span>{modeLabel}</span>
                      <span className="material-symbols-outlined text-[12px]">keyboard_arrow_down</span>
                    </button>
                    {openControlMenu === 'mode' ? (
                      <div className="absolute left-0 bottom-full z-30 mb-2 w-64 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                        <div className="border-b border-gray-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-400 dark:border-gray-800">Mode</div>
                        <div className="p-1">
                          {[
                            { value: 'investigate' as const, label: 'Investigate', description: 'Ask questions, inspect context, and explore safely.' },
                            { value: 'operate' as const, label: 'Operate', description: 'Take action with the current workflow context.' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setMode(option.value);
                                setOpenControlMenu(null);
                              }}
                              className={`flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition-colors ${
                                mode === option.value
                                  ? 'bg-gray-50 text-gray-900 dark:bg-gray-800 dark:text-white'
                                  : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                              }`}
                            >
                              <div>
                                <div className="text-xs font-semibold">{option.label}</div>
                                <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{option.description}</div>
                              </div>
                              {mode === option.value ? <span className="material-symbols-outlined text-[16px]">check</span> : null}
                            </button>
                          ))}
                          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                          <button
                            type="button"
                            onClick={() => {
                              setPlanMode((current) => !current);
                              setOpenControlMenu(null);
                            }}
                            className={`flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition-colors ${
                              planMode
                                ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
                                : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                            }`}
                          >
                            <div>
                              <div className="text-xs font-semibold">Plan</div>
                              <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Outline branches, compare options, and prepare an execution path.</div>
                            </div>
                            {planMode ? <span className="material-symbols-outlined text-[16px]">check</span> : null}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {planMode ? (
                    <button
                      type="button"
                      onClick={() => setPlanMode(false)}
                      className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/50"
                    >
                      Plan
                    </button>
                  ) : null}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenControlMenu(openControlMenu === 'autonomy' ? null : 'autonomy')}
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium text-gray-900 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-white dark:hover:bg-gray-800 dark:hover:text-white"
                    >
                      <span>{getAutonomyMeta(autonomyLevel).label}</span>
                      <span className="material-symbols-outlined text-[12px]">keyboard_arrow_down</span>
                    </button>
                    {openControlMenu === 'autonomy' ? (
                      <div className="absolute left-0 bottom-full z-30 mb-2 w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                        <div className="border-b border-gray-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-400 dark:border-gray-800">Autonomy</div>
                        <div className="p-1">
                          {AUTONOMY_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setAutonomyLevel(option.value);
                                setOpenControlMenu(null);
                              }}
                              className={`flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition-colors ${
                                autonomyLevel === option.value
                                  ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                                  : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                              }`}
                            >
                              <div>
                                <div className="text-xs font-semibold">{option.label}</div>
                                <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{option.description}</div>
                              </div>
                              {autonomyLevel === option.value ? <span className="material-symbols-outlined text-[16px]">check</span> : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-1">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenControlMenu(openControlMenu === 'model' ? null : 'model')}
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium text-gray-900 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-white dark:hover:bg-gray-800 dark:hover:text-white"
                    >
                      <span>{getModelMeta(selectedModelId).label}</span>
                      <span className="material-symbols-outlined text-[12px]">keyboard_arrow_down</span>
                    </button>
                    {openControlMenu === 'model' ? (
                      <div className="absolute left-0 bottom-full z-30 mb-2 w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                        <div className="border-b border-gray-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-400 dark:border-gray-800">Model</div>
                        <div className="p-1">
                          {MODEL_OPTIONS.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => {
                                setSelectedModelId(option.id);
                                setOpenControlMenu(null);
                              }}
                              className={`flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition-colors ${
                                selectedModelId === option.id
                                  ? 'bg-gray-50 text-gray-900 dark:bg-gray-800 dark:text-white'
                                  : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                              }`}
                            >
                              <div>
                                <div className="text-xs font-semibold">{option.label}</div>
                                <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{option.description}</div>
                              </div>
                              {selectedModelId === option.id ? <span className="material-symbols-outlined text-[16px]">check</span> : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void sendPrompt()}
                  disabled={!composerText.trim() || isSending || isExecuting}
                  className="ml-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-black text-white transition-opacity hover:opacity-80 disabled:opacity-30 dark:bg-white dark:text-black"
                >
                  <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                </button>
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
      <div className="my-2 mr-2 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-card dark:border-gray-800 dark:bg-card-dark">
        <ConversationsSidebar
          open={conversationsOpen}
          onToggle={() => setConversationsOpen((v) => !v)}
          activeSessionId={planSessionId}
          onSelect={(id) => void handleSelectSession(id)}
          onNewConversation={handleNewConversation}
          refreshKey={conversationsRefreshKey}
        />
      </div>
    </div>
  );
}
