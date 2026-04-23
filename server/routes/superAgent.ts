import crypto from 'crypto';
import { Router } from 'express';
import { logger } from '../utils/logger.js';
import {
  buildCaseState,
  buildResolveView,
  createAgentRepository,
  createApprovalRepository,
  createAuditRepository,
  createCaseRepository,
  createCommerceRepository,
  createConversationRepository,
  createCustomerRepository,
  createWorkflowRepository,
  createWorkspaceRepository,
} from '../data/index.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { broadcastSSE } from './sse.js';
import { isGeneralConversationInput, normalizeSearchQuery } from '../agents/superAgent/search.js';
import type {
  CommandContext,
  NavigationTarget,
  StructuredCommand,
} from '../agents/superAgent/intent.js';
import { parseCommandIntent as parseSuperAgentCommandIntent } from '../agents/superAgent/intent.js';

const router = Router();

router.use(extractMultiTenant);

const caseRepository = createCaseRepository();
const commerceRepository = createCommerceRepository();
const customerRepository = createCustomerRepository();
const approvalRepository = createApprovalRepository();
const workflowRepository = createWorkflowRepository();
const agentRepository = createAgentRepository();
const auditRepository = createAuditRepository();
const workspaceRepository = createWorkspaceRepository();
const conversationRepository = createConversationRepository();

type CommandScope = {
  tenantId: string;
  workspaceId: string;
  userId?: string;
};

type SuperAgentActionPayload = {
  kind:
    | 'case.update_status'
    | 'case.add_internal_note'
    | 'order.cancel'
    | 'payment.refund'
    | 'approval.decide'
    | 'workflow.publish';
  entityType: 'case' | 'order' | 'payment' | 'approval' | 'workflow';
  entityId: string;
  caseId?: string | null;
  params?: Record<string, any>;
};

type UiAction = {
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
  payload?: SuperAgentActionPayload;
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

type AgentActivity = {
  slug: string;
  name: string;
  runtime?: string | null;
  mode?: string | null;
  status: 'available' | 'consulted' | 'proposed' | 'executed' | 'blocked';
  summary: string;
};

type StreamStep = {
  id: string;
  label: string;
  status: 'running' | 'completed' | 'failed';
  detail?: string | null;
};

function getScope(req: MultiTenantRequest): CommandScope {
  return {
    tenantId: req.tenantId!,
    workspaceId: req.workspaceId!,
    userId: req.userId,
  };
}

function hasPermission(req: MultiTenantRequest, permission: string) {
  const permissions = req.permissions || [];
  return permissions.includes('*') || permissions.includes(permission);
}

function hasAnyPermission(req: MultiTenantRequest, permissions: string[]) {
  return permissions.some((permission) => hasPermission(req, permission));
}

function canInspectSuperAgent(req: MultiTenantRequest) {
  return hasAnyPermission(req, ['audit.read', 'cases.read', 'approvals.read', 'reports.read', 'settings.read', 'agents.read']);
}

function titleCase(value?: string | null) {
  if (!value) return 'N/A';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatWhen(value?: string | null) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(value: any, currency = 'USD') {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return String(value ?? 'N/A');
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  }).format(numeric);
}

function toText(value: any) {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function describeConflict(conflict: any) {
  if (!conflict) return 'No active canonical conflict detected.';
  return conflict.root_cause || conflict.conflict_type || 'Active conflict detected.';
}

function describeExecutionNextStep(resolve: any) {
  const firstStep = Array.isArray(resolve?.execution?.steps) ? resolve.execution.steps[0] : null;
  return firstStep?.label || resolve?.execution?.status || 'No execution step returned.';
}

function flattenPermissions(req: MultiTenantRequest) {
  const permissions = req.permissions || [];
  if (permissions.includes('*')) return ['Full workspace access'];
  return permissions.slice(0, 8);
}

function entityTypeFromPage(page?: string | null) {
  switch (page) {
    case 'inbox':
    case 'case_graph':
      return 'case';
    case 'orders':
      return 'order';
    case 'payments':
      return 'payment';
    case 'returns':
      return 'return';
    case 'approvals':
      return 'approval';
    case 'customers':
      return 'customer';
    case 'workflows':
      return 'workflow';
    case 'knowledge':
      return 'knowledge';
    case 'reports':
      return 'report';
    case 'settings':
      return 'setting';
    default:
      return 'workspace';
  }
}

function pageFromEntityType(entityType?: string | null) {
  switch (entityType) {
    case 'case':
      return 'case_graph';
    case 'order':
      return 'orders';
    case 'payment':
      return 'payments';
    case 'return':
      return 'returns';
    case 'approval':
      return 'approvals';
    case 'customer':
      return 'customers';
    case 'workflow':
      return 'workflows';
    case 'knowledge':
      return 'knowledge';
    case 'report':
      return 'reports';
    case 'agents':
      return 'super_agent';
    default:
      return 'super_agent';
  }
}

function buildNavigationTarget(input: {
  page: string;
  entityType?: string | null;
  entityId?: string | null;
  section?: string | null;
  sourceContext?: string | null;
  runId?: string | null;
}): NavigationTarget {
  return {
    page: input.page,
    entityType: input.entityType ?? entityTypeFromPage(input.page),
    entityId: input.entityId ?? null,
    section: input.section ?? null,
    sourceContext: input.sourceContext ?? null,
    runId: input.runId ?? null,
  };
}

function emitSuperAgentEvent(scope: CommandScope, event: string, data: Record<string, unknown>) {
  broadcastSSE(scope.tenantId, `super-agent:${event}`, data);
}

function splitIntoChunks(value: string, size = 120) {
  const text = String(value || '').trim();
  if (!text) return [];
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function inferPrimaryNavigationTarget(response: any) {
  if (response?.navigationTarget) return response.navigationTarget;
  const actionTarget = Array.isArray(response?.actions)
    ? response.actions.find((action: UiAction) => action.navigationTarget || action.targetPage)
    : null;
  if (actionTarget?.navigationTarget) return actionTarget.navigationTarget;
  if (actionTarget?.targetPage) {
    return buildNavigationTarget({
      page: actionTarget.targetPage,
      entityType: actionTarget.payload?.entityType || entityTypeFromPage(actionTarget.targetPage),
      entityId: actionTarget.focusId ?? actionTarget.payload?.entityId ?? null,
    });
  }
  if (response?.contextPanel?.entityType && response?.contextPanel?.entityId) {
    return buildNavigationTarget({
      page: pageFromEntityType(response.contextPanel.entityType),
      entityType: response.contextPanel.entityType,
      entityId: response.contextPanel.entityId,
    });
  }
  return null;
}

function deriveFacts(response: any) {
  if (Array.isArray(response?.facts) && response.facts.length) return response.facts;
  if (Array.isArray(response?.contextPanel?.facts)) {
    return response.contextPanel.facts.map((fact: any) => `${fact.label}: ${fact.value}`);
  }
  return [];
}

function deriveConflicts(response: any) {
  if (Array.isArray(response?.conflicts) && response.conflicts.length) return response.conflicts;
  const evidence = Array.isArray(response?.contextPanel?.evidence) ? response.contextPanel.evidence : [];
  return evidence
    .filter((item: any) => item.tone === 'warning')
    .map((item: any) => `${item.label}: ${item.value}`);
}

function deriveEvidence(response: any) {
  if (Array.isArray(response?.evidence) && response.evidence.length) return response.evidence;
  return Array.isArray(response?.contextPanel?.evidence)
    ? response.contextPanel.evidence.map((item: any) => `${item.label}: ${item.value}`)
    : [];
}

function asObject(value: any): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function firstResultRecord(value: any): Record<string, any> | null {
  if (Array.isArray(value)) return asObject(value[0]);
  return asObject(value);
}

function pickFirstString(value: Record<string, any> | null, keys: string[]) {
  if (!value) return null;
  for (const key of keys) {
    const candidate = value[key];
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) return String(candidate);
  }
  return null;
}

function entityInfoFromPlanSpan(span: any) {
  const tool = String(span?.tool || '');
  const root = tool.split('.')[0];
  const action = tool.split('.').slice(1).join('.');
  const args = asObject(span?.args) || {};
  const value = span?.result?.value;
  const record = firstResultRecord(value);

  if (!span?.result?.ok) return null;
  if (root === 'case') {
    return {
      entityType: 'case',
      entityId: pickFirstString(record, ['id', 'case_id', 'caseId']) || pickFirstString(args, ['caseId', 'case_id', 'id']),
      page: 'case_graph',
      section: action || null,
      record,
      tool,
    };
  }
  if (root === 'order') {
    return {
      entityType: 'order',
      entityId: pickFirstString(record, ['id', 'order_id', 'orderId']) || pickFirstString(args, ['orderId', 'order_id', 'id']),
      page: 'orders',
      section: action || null,
      record,
      tool,
    };
  }
  if (root === 'payment') {
    return {
      entityType: 'payment',
      entityId: pickFirstString(record, ['id', 'payment_id', 'paymentId']) || pickFirstString(args, ['paymentId', 'payment_id', 'id']),
      page: 'payments',
      section: action || null,
      record,
      tool,
    };
  }
  if (root === 'return') {
    return {
      entityType: 'return',
      entityId: pickFirstString(record, ['id', 'return_id', 'returnId']) || pickFirstString(args, ['returnId', 'return_id', 'id']),
      page: 'returns',
      section: action || null,
      record,
      tool,
    };
  }
  if (root === 'approval') {
    return {
      entityType: 'approval',
      entityId: pickFirstString(record, ['id', 'approval_id', 'approvalId']) || pickFirstString(args, ['approvalId', 'approval_id', 'id']),
      page: 'approvals',
      section: action || null,
      record,
      tool,
    };
  }
  if (root === 'customer') {
    return {
      entityType: 'customer',
      entityId: pickFirstString(record, ['id', 'customer_id', 'customerId']) || pickFirstString(args, ['customerId', 'customer_id', 'id']),
      page: 'customers',
      section: action || null,
      record,
      tool,
    };
  }
  if (root === 'workflow') {
    return {
      entityType: 'workflow',
      entityId: pickFirstString(record, ['id', 'workflowId', 'workflow_id']) || pickFirstString(args, ['workflowId', 'workflow_id', 'id']),
      page: 'workflows',
      section: action || null,
      record,
      tool,
    };
  }
  if (root === 'knowledge') {
    return {
      entityType: 'knowledge',
      entityId: pickFirstString(record, ['id', 'article_id', 'policy_id']) || null,
      page: 'knowledge',
      section: action || null,
      record,
      tool,
    };
  }
  if (root === 'report') {
    return {
      entityType: 'report',
      entityId: null,
      page: 'reports',
      section: action || null,
      record,
      tool,
    };
  }
  if (root === 'agent') {
    return {
      entityType: 'agents',
      entityId: pickFirstString(args, ['agentSlug', 'slug']) || null,
      page: 'super_agent',
      section: action || null,
      record,
      tool,
    };
  }
  return null;
}

function inferPlanNavigationTargetFromTrace(trace: any, runId: string): NavigationTarget | null {
  const spans = Array.isArray(trace?.spans) ? trace.spans : [];
  for (const span of spans) {
    const info = entityInfoFromPlanSpan(span);
    if (!info) continue;
    if (!info.entityId && info.entityType !== 'report' && info.entityType !== 'agents') continue;
    return buildNavigationTarget({
      page: info.page,
      entityType: info.entityType,
      entityId: info.entityId || null,
      section: info.section,
      sourceContext: 'plan_engine',
      runId,
    });
  }
  return null;
}

function displayTitleForPlanEntity(info: ReturnType<typeof entityInfoFromPlanSpan>) {
  if (!info) return 'Super Agent result';
  const record = info.record;
  return pickFirstString(record, [
    'case_number',
    'order_number',
    'payment_reference',
    'return_number',
    'canonical_name',
    'name',
    'title',
    'slug',
    'id',
  ]) || (info.entityId ? `${titleCase(info.entityType)} ${info.entityId}` : titleCase(info.entityType));
}

function buildPlanPanelFacts(record: Record<string, any> | null) {
  if (!record) return [];
  const keys = [
    ['Status', ['status', 'version_status', 'approval_status', 'refund_status']],
    ['Risk', ['risk_level', 'risk']],
    ['Amount', ['amount', 'total', 'refund_amount']],
    ['Customer', ['customer_name', 'canonical_name', 'customer_id']],
    ['Updated', ['updated_at', 'publishedAt', 'published_at']],
  ] as const;

  return keys.flatMap(([label, candidates]) => {
    const value = pickFirstString(record, candidates as unknown as string[]);
    return value ? [{ label, value }] : [];
  }).slice(0, 5);
}

function buildPlanContextPanelFromTrace(trace: any, navigationTarget: NavigationTarget | null): ContextPanel | null {
  if (!navigationTarget) return null;
  const spans = Array.isArray(trace?.spans) ? trace.spans : [];
  const info = spans.map(entityInfoFromPlanSpan).find((candidate) =>
    candidate?.entityType === navigationTarget.entityType
    && String(candidate?.entityId || '') === String(navigationTarget.entityId || ''),
  ) || spans.map(entityInfoFromPlanSpan).find(Boolean);
  if (!info) return null;

  const record = info.record;
  return {
    entityType: info.entityType,
    entityId: info.entityId || null,
    title: displayTitleForPlanEntity(info),
    subtitle: `${titleCase(info.entityType)} context from ${info.tool}`,
    status: pickFirstString(record, ['status', 'version_status', 'approval_status']) || null,
    risk: pickFirstString(record, ['risk_level', 'risk']) || null,
    description: pickFirstString(record, ['summary', 'description', 'reason', 'resolution_notes']) || null,
    facts: buildPlanPanelFacts(record),
    evidence: [
      { label: 'Tool', value: info.tool, tone: 'success' },
      { label: 'Trace', value: trace?.planId || navigationTarget.runId || 'current run', tone: 'neutral' },
    ],
    timeline: record
      ? [
          { label: 'Created', value: formatWhen(record.created_at), time: record.created_at || null },
          { label: 'Updated', value: formatWhen(record.updated_at || record.published_at), time: record.updated_at || record.published_at || null },
        ].filter((item) => item.value !== 'N/A')
      : [],
    related: [
      {
        label: `Open ${titleCase(info.entityType)}`,
        value: 'Open module',
        targetPage: info.page,
        focusId: info.entityId || null,
        navigationTarget,
      },
    ],
  };
}

function derivePlanFactsFromTrace(trace: any) {
  const spans = Array.isArray(trace?.spans) ? trace.spans : [];
  return spans.flatMap((span: any) => {
    const info = entityInfoFromPlanSpan(span);
    if (!info) {
      return span?.result?.ok
        ? [`${span.tool}: ${toText(span.result?.value)}`]
        : [`${span.tool}: ${span?.result?.error || 'Failed'}`];
    }
    const title = displayTitleForPlanEntity(info);
    const status = pickFirstString(info.record, ['status', 'version_status', 'approval_status', 'refund_status']);
    return [`${span.tool}: ${title}${status ? ` (${status})` : ''}`];
  }).slice(0, 8);
}

function derivePlanEvidenceFromTrace(trace: any) {
  const spans = Array.isArray(trace?.spans) ? trace.spans : [];
  const evidence = spans.map((span: any) => {
    const status = span?.result?.ok ? 'ok' : 'failed';
    const latency = typeof span?.latencyMs === 'number' ? `${span.latencyMs}ms` : 'n/a';
    return `${span.tool}: ${status}, risk ${span.riskLevel || 'n/a'}, ${latency}`;
  });
  if (Array.isArray(trace?.approvalIds) && trace.approvalIds.length) {
    evidence.unshift(`Approval required: ${trace.approvalIds.join(', ')}`);
  }
  return evidence;
}

function resolveRelativeTarget(text: string, context?: CommandContext | null) {
  if (context?.activeTarget) {
    const activeTarget = context.activeTarget;
    const wantsOrder = /(pedido|order)/.test(text);
    const wantsPayment = /(pago|payment|refund)/.test(text);
    const wantsReturn = /(devolucion|return)/.test(text);
    const wantsApproval = /(aprob|approval)/.test(text);
    const wantsCustomer = /(cliente|customer)/.test(text);
    const wantsWorkflow = /(workflow)/.test(text);
    const wantsCase = /(caso|case|hilo|thread)/.test(text);

    const matchesActive =
      (wantsOrder && activeTarget.entityType === 'order') ||
      (wantsPayment && activeTarget.entityType === 'payment') ||
      (wantsReturn && activeTarget.entityType === 'return') ||
      (wantsApproval && activeTarget.entityType === 'approval') ||
      (wantsCustomer && activeTarget.entityType === 'customer') ||
      (wantsWorkflow && activeTarget.entityType === 'workflow') ||
      (wantsCase && activeTarget.entityType === 'case');

    if (matchesActive) return activeTarget;
  }

  const recentTargets = Array.isArray(context?.recentTargets) ? context!.recentTargets! : [];
  if (!recentTargets.length) return null;

  const wantsOrder = /(pedido|order)/.test(text);
  const wantsPayment = /(pago|payment|refund)/.test(text);
  const wantsReturn = /(devolucion|return)/.test(text);
  const wantsApproval = /(aprob|approval)/.test(text);
  const wantsCustomer = /(cliente|customer)/.test(text);
  const wantsWorkflow = /(workflow)/.test(text);
  const wantsCase = /(caso|case|hilo|thread)/.test(text);

  const desiredType =
    wantsOrder ? 'order'
    : wantsPayment ? 'payment'
    : wantsReturn ? 'return'
    : wantsApproval ? 'approval'
    : wantsCustomer ? 'customer'
    : wantsWorkflow ? 'workflow'
    : wantsCase ? 'case'
    : null;

  return recentTargets.find((target) => !desiredType || target.entityType === desiredType) || recentTargets[0];
}

function getAccessLevel(req: MultiTenantRequest) {
  if (hasPermission(req, 'settings.write') || hasPermission(req, 'members.remove')) return 'manager';
  if (
    hasAnyPermission(req, [
      'cases.write',
      'approvals.decide',
      'workflows.write',
      'workflows.trigger',
      'knowledge.write',
    ])
  ) {
    return 'operator';
  }
  return 'restricted';
}

function buildPermissionMatrix(req: MultiTenantRequest) {
  return {
    roleId: req.roleId || 'unknown',
    accessLevel: getAccessLevel(req),
    canRead: {
      cases: hasPermission(req, 'cases.read'),
      approvals: hasPermission(req, 'approvals.read'),
      workflows: hasPermission(req, 'workflows.read'),
      knowledge: hasPermission(req, 'knowledge.read'),
      reports: hasPermission(req, 'reports.read'),
      settings: hasPermission(req, 'settings.read'),
      agents: hasPermission(req, 'agents.read'),
      audit: hasPermission(req, 'audit.read'),
    },
    canWrite: {
      cases: hasPermission(req, 'cases.write'),
      approvals: hasPermission(req, 'approvals.decide'),
      workflows: hasPermission(req, 'workflows.write') || hasPermission(req, 'workflows.trigger'),
      knowledge: hasPermission(req, 'knowledge.write'),
      settings: hasPermission(req, 'settings.write'),
      agents: hasPermission(req, 'agents.write'),
    },
    preview: flattenPermissions(req),
  };
}

function buildQuickActions(req: MultiTenantRequest) {
  const actions = [
    'Investiga un pedido con conflicto',
    'Analiza una inconsistencia entre sistemas',
    'Explica por que una accion esta bloqueada',
    'Busca un cliente y resume su contexto',
    'Revisa pagos pendientes o bloqueados',
    'Abre aprobaciones pendientes',
    'Prepara el siguiente paso operativo',
  ];

  if (hasPermission(req, 'cases.write')) {
    actions.push('Cierra un caso con trazabilidad');
  }

  if (hasPermission(req, 'approvals.decide')) {
    actions.push('Aprueba o rechaza una solicitud sensible');
  }

  if (hasPermission(req, 'workflows.write')) {
    actions.push('Publica un workflow listo para operar');
  }

  return actions.slice(0, 8);
}

function buildWorkspacePanel(workspace: any, permissionMatrix: ReturnType<typeof buildPermissionMatrix>, counts: Record<string, number>): ContextPanel {
  return {
    entityType: 'workspace',
    entityId: workspace?.id || null,
    title: 'AI Command Center',
    subtitle: workspace?.name || 'Operational workspace',
    status: permissionMatrix.accessLevel,
    risk: null,
    description: 'Unified operating layer for cross-module investigation, controlled actions, and agent orchestration.',
    facts: [
      { label: 'Role', value: titleCase(permissionMatrix.roleId) },
      { label: 'Access level', value: titleCase(permissionMatrix.accessLevel) },
      { label: 'Open cases', value: String(counts.cases) },
      { label: 'Orders', value: String(counts.orders) },
      { label: 'Payments', value: String(counts.payments) },
      { label: 'Approvals pending', value: String(counts.approvals) },
    ],
    evidence: [
      { label: 'Guardrails', value: 'Sensitive actions require confirmation and are always audited.', tone: 'success' },
      { label: 'Permissions', value: permissionMatrix.preview.join(' • ') || 'No explicit permissions detected.', tone: 'neutral' },
    ],
    timeline: [
      { label: 'Workspace ready', value: 'Modules, agents, and guardrails are online.', time: workspace?.updated_at || workspace?.created_at || null },
    ],
    related: [
      { label: 'Open inbox', value: 'Go to Inbox', targetPage: 'inbox' },
      { label: 'Review approvals', value: 'Go to Approvals', targetPage: 'approvals' },
      { label: 'Inspect workflows', value: 'Go to Workflows', targetPage: 'workflows' },
      { label: 'Audit trail', value: 'Go to Settings', targetPage: 'settings' },
    ],
  };
}

function pickAgentActivity(agents: any[], preferred: string[], status: AgentActivity['status'], summary: string): AgentActivity[] {
  const selected = agents.filter((agent) => preferred.includes(agent.slug));
  return selected.map((agent) => ({
    slug: agent.slug,
    name: agent.name || titleCase(agent.slug),
    runtime: agent.runtime || null,
    mode: agent.mode || agent.version_status || null,
    status,
    summary,
  }));
}

function buildAction({
  label,
  description,
  targetPage,
  focusId,
  navigationTarget,
  permission,
  req,
  payload,
  sensitive = false,
  requiresConfirmation = false,
}: {
  label: string;
  description: string;
  targetPage?: string;
  focusId?: string | null;
  navigationTarget?: NavigationTarget | null;
  permission?: string;
  req: MultiTenantRequest;
  payload?: SuperAgentActionPayload;
  sensitive?: boolean;
  requiresConfirmation?: boolean;
}): UiAction {
  const allowed = permission ? hasPermission(req, permission) : true;
  return {
    id: crypto.randomUUID(),
    type: payload ? 'execute' : 'navigate',
    label,
    description,
    targetPage,
    focusId: focusId ?? null,
    navigationTarget: navigationTarget || (targetPage
      ? buildNavigationTarget({
          page: targetPage,
          entityType: payload?.entityType || entityTypeFromPage(targetPage),
          entityId: focusId ?? payload?.entityId ?? null,
          sourceContext: 'super_agent_action',
        })
      : null),
    permission,
    allowed,
    sensitive,
    requiresConfirmation,
    blockedReason: allowed ? null : `Missing permission: ${permission}`,
    payload,
  };
}

async function resolveCaseBundle(scope: CommandScope, caseIdOrNumber: string) {
  const direct = await caseRepository.getBundle(scope, caseIdOrNumber);
  if (direct) return direct;

  const cases = await caseRepository.list(scope, { q: caseIdOrNumber });
  const match = cases.find((item: any) =>
    [item.id, item.case_number].filter(Boolean).some((value) => String(value).toLowerCase() === caseIdOrNumber.toLowerCase())
  ) || cases[0];
  return match ? caseRepository.getBundle(scope, match.id) : null;
}

async function resolveOrder(scope: CommandScope, orderId: string) {
  const direct = await commerceRepository.getOrder(scope, orderId);
  if (direct) return direct;
  const list = await commerceRepository.listOrders(scope, { q: orderId });
  return list[0] || null;
}

async function resolvePayment(scope: CommandScope, paymentId: string) {
  const direct = await commerceRepository.getPayment(scope, paymentId);
  if (direct) return direct;
  const list = await commerceRepository.listPayments(scope, { q: paymentId });
  return list[0] || null;
}

async function resolveReturn(scope: CommandScope, returnId: string) {
  const direct = await commerceRepository.getReturn(scope, returnId);
  if (direct) return direct;
  const list = await commerceRepository.listReturns(scope, { q: returnId });
  return list[0] || null;
}

async function resolveCustomer(scope: CommandScope, customerIdOrQuery: string) {
  const direct = await customerRepository.get(scope, customerIdOrQuery);
  if (direct) return direct;
  const list = await customerRepository.list(scope, { q: customerIdOrQuery });
  return list[0] ? customerRepository.get(scope, list[0].id) : null;
}

function buildCasePanel(bundle: any): ContextPanel {
  const state = buildCaseState(bundle);
  const resolve = buildResolveView(bundle);
  const customerName = bundle.customer?.canonical_name || bundle.case.customer_name || 'Unknown customer';
  const orders = Array.isArray(bundle.orders) ? bundle.orders : [];
  const payments = Array.isArray(bundle.payments) ? bundle.payments : [];
  const returns = Array.isArray(bundle.returns) ? bundle.returns : [];
  const approvals = Array.isArray(bundle.approvals) ? bundle.approvals : [];

  return {
    entityType: 'case',
    entityId: bundle.case.id,
    title: bundle.case.case_number || bundle.case.id,
    subtitle: `${titleCase(bundle.case.type || 'case')} · ${customerName}`,
    status: titleCase(bundle.case.status),
    risk: titleCase(bundle.case.risk_level),
    description: bundle.case.ai_diagnosis || bundle.case.ai_root_cause || 'Case context loaded from the unified data plane.',
    facts: [
      { label: 'Priority', value: titleCase(bundle.case.priority) },
      { label: 'Execution', value: titleCase(bundle.case.execution_state) },
      { label: 'Approval', value: titleCase(bundle.case.approval_state) },
      { label: 'Orders linked', value: String(orders.length) },
      { label: 'Payments linked', value: String(payments.length) },
      { label: 'Returns linked', value: String(returns.length) },
    ],
    evidence: [
      { label: 'Conflict', value: describeConflict(state.conflict), tone: state.conflict ? 'warning' : 'success' },
      { label: 'Recommended action', value: bundle.case.ai_recommended_action || describeExecutionNextStep(resolve) || 'No recommendation generated yet.', tone: 'neutral' },
      { label: 'Blockers', value: (resolve.blockers || []).slice(0, 3).map((item: any) => item.summary || item.title || item.label).filter(Boolean).join(' • ') || 'No blocking constraints returned.', tone: resolve.blockers?.length ? 'warning' : 'success' },
    ],
    timeline: state.timeline.slice(-6).reverse().map((entry: any) => ({
      label: titleCase(entry.domain || entry.type || 'event'),
      value: entry.content || entry.summary || 'Case event',
      time: entry.occurred_at || entry.created_at || null,
    })),
    related: [
      ...orders.slice(0, 2).map((order: any) => ({
        label: 'Order',
        value: order.external_order_id || order.id,
        targetPage: 'orders',
        focusId: order.id,
      })),
      ...payments.slice(0, 2).map((payment: any) => ({
        label: 'Payment',
        value: payment.external_payment_id || payment.id,
        targetPage: 'payments',
        focusId: payment.id,
      })),
      ...approvals.slice(0, 2).map((approval: any) => ({
        label: 'Approval',
        value: approval.id,
        targetPage: 'approvals',
        focusId: approval.id,
      })),
    ],
  };
}

function buildOrderPanel(order: any, context: any): ContextPanel {
  const linkedCases = Array.isArray(order.related_cases) ? order.related_cases : [];
  const timeline = Array.isArray(order.events) ? order.events : [];
  const canonical = context?.case_state || context || {};

  return {
    entityType: 'order',
    entityId: order.id,
    title: order.external_order_id || order.id,
    subtitle: `${order.customer_name || 'Unknown customer'} · ${formatMoney(order.total_amount, order.currency || 'USD')}`,
    status: titleCase(order.status),
    risk: titleCase(order.risk_level),
    description: order.summary || canonical?.conflict?.summary || 'Commerce order context loaded.',
    facts: [
      { label: 'Payment', value: titleCase(order.payment_status || order.system_states?.psp || 'N/A') },
      { label: 'Fulfillment', value: titleCase(order.fulfillment_status || order.system_states?.wms || 'N/A') },
      { label: 'Refund', value: titleCase(order.refund_status || order.system_states?.refund_status || 'N/A') },
      { label: 'Approval', value: titleCase(order.approval_status || 'N/A') },
      { label: 'Country', value: toText(order.country) },
      { label: 'Brand', value: toText(order.brand) },
    ],
    evidence: [
      { label: 'Conflict', value: order.conflict_detected || canonical?.conflict?.summary || 'No active mismatch reported for this order.', tone: order.conflict_detected ? 'warning' : 'success' },
      { label: 'Recommended next step', value: order.recommended_action || 'Review order state and linked case context.', tone: 'neutral' },
    ],
    timeline: timeline.slice(-6).reverse().map((event: any) => ({
      label: titleCase(event.system || event.source || event.type || 'event'),
      value: event.content || 'Order event',
      time: event.occurred_at || event.time || null,
    })),
    related: linkedCases.slice(0, 3).map((item: any) => ({
      label: 'Related case',
      value: item.case_number || item.id,
      targetPage: 'case_graph',
      focusId: item.id,
    })),
  };
}

function buildPaymentPanel(payment: any, context: any): ContextPanel {
  const linkedCases = Array.isArray(payment.related_cases) ? payment.related_cases : [];
  const timeline = Array.isArray(payment.events) ? payment.events : [];

  return {
    entityType: 'payment',
    entityId: payment.id,
    title: payment.external_payment_id || payment.id,
    subtitle: `${payment.customer_name || 'Unknown customer'} · ${formatMoney(payment.amount, payment.currency || 'USD')}`,
    status: titleCase(payment.status),
    risk: titleCase(payment.risk_level),
    description: payment.summary || context?.case_state?.conflict?.summary || 'Payment context loaded.',
    facts: [
      { label: 'PSP', value: toText(payment.psp) },
      { label: 'Method', value: toText(payment.payment_method) },
      { label: 'Refund', value: titleCase(payment.refund_status || payment.system_states?.refund || 'N/A') },
      { label: 'Dispute', value: titleCase(payment.dispute_status || payment.system_states?.dispute || 'N/A') },
      { label: 'Reconciliation', value: titleCase(payment.reconciliation_status || payment.system_states?.reconciliation || 'N/A') },
      { label: 'Approval', value: titleCase(payment.approval_status || 'N/A') },
    ],
    evidence: [
      { label: 'Conflict', value: payment.conflict_detected || context?.case_state?.conflict?.summary || 'No active mismatch reported for this payment.', tone: payment.conflict_detected ? 'warning' : 'success' },
      { label: 'Recommended next step', value: payment.recommended_action || 'Review PSP status and linked case state.', tone: 'neutral' },
    ],
    timeline: timeline.slice(-6).reverse().map((event: any) => ({
      label: titleCase(event.system || event.source || event.type || 'event'),
      value: event.content || 'Payment event',
      time: event.occurred_at || event.time || null,
    })),
    related: linkedCases.slice(0, 3).map((item: any) => ({
      label: 'Related case',
      value: item.case_number || item.id,
      targetPage: 'case_graph',
      focusId: item.id,
    })),
  };
}

function buildReturnPanel(ret: any, context: any): ContextPanel {
  const linkedCases = Array.isArray(ret.related_cases) ? ret.related_cases : [];
  const timeline = Array.isArray(ret.events) ? ret.events : [];

  return {
    entityType: 'return',
    entityId: ret.id,
    title: ret.external_return_id || ret.id,
    subtitle: `${ret.customer_name || 'Unknown customer'} · ${ret.external_order_id || ret.order_id || 'No order linked'}`,
    status: titleCase(ret.status),
    risk: titleCase(ret.risk_level),
    description: ret.summary || context?.case_state?.conflict?.summary || 'Return context loaded.',
    facts: [
      { label: 'Reason', value: toText(ret.reason || ret.return_reason) },
      { label: 'Inspection', value: titleCase(ret.inspection_status || 'N/A') },
      { label: 'Refund', value: titleCase(ret.refund_status || 'N/A') },
      { label: 'Carrier', value: titleCase(ret.carrier_status || 'N/A') },
      { label: 'Method', value: toText(ret.method || 'N/A') },
      { label: 'Order', value: toText(ret.external_order_id || ret.order_id || 'N/A') },
    ],
    evidence: [
      { label: 'Conflict', value: ret.conflict_detected || context?.case_state?.conflict?.summary || 'No active mismatch reported for this return.', tone: ret.conflict_detected ? 'warning' : 'success' },
      { label: 'Recommended next step', value: ret.recommended_action || 'Review inspection state and refund dependency.', tone: 'neutral' },
    ],
    timeline: timeline.slice(-6).reverse().map((event: any) => ({
      label: titleCase(event.system || event.source || event.type || 'event'),
      value: event.content || 'Return event',
      time: event.occurred_at || event.time || null,
    })),
    related: linkedCases.slice(0, 3).map((item: any) => ({
      label: 'Related case',
      value: item.case_number || item.id,
      targetPage: 'case_graph',
      focusId: item.id,
    })),
  };
}

function buildCustomerPanel(customer: any): ContextPanel {
  const state = customer.state_snapshot || {};
  const activity = Array.isArray(customer.activity) ? customer.activity : [];

  return {
    entityType: 'customer',
    entityId: customer.id,
    title: customer.canonical_name || customer.id,
    subtitle: customer.canonical_email || customer.email || customer.phone || 'Customer profile',
    status: titleCase(customer.segment || 'customer'),
    risk: titleCase(customer.risk_level || state.customer?.risk_level || 'low'),
    description: 'Customer profile connected to cases, orders, payments, and identities.',
    facts: [
      { label: 'Segment', value: titleCase(customer.segment || 'N/A') },
      { label: 'LTV', value: formatMoney(state.metrics?.lifetime_value || customer.lifetime_value || customer.total_spent || 0, customer.currency || 'USD') },
      { label: 'Open cases', value: String(state.metrics?.open_cases || customer.open_cases || 0) },
      { label: 'Orders', value: String(state.metrics?.total_orders || 0) },
      { label: 'Payments', value: String(state.metrics?.total_payments || 0) },
      { label: 'Returns', value: String(state.metrics?.total_returns || 0) },
    ],
    evidence: [
      { label: 'Conflicts', value: String(state.metrics?.active_conflicts || customer.active_conflicts || 0), tone: Number(state.metrics?.active_conflicts || customer.active_conflicts || 0) > 0 ? 'warning' : 'success' },
      { label: 'Linked identities', value: String((state.linked_identities || customer.linked_identities || []).length || 0), tone: 'neutral' },
    ],
    timeline: activity.slice(0, 6).map((entry: any) => ({
      label: titleCase(entry.system || entry.type || 'activity'),
      value: entry.title || entry.content || 'Customer activity',
      time: entry.occurred_at || null,
    })),
    related: [
      { label: 'Customer workspace', value: 'Open Customers', targetPage: 'customers', focusId: customer.id },
      { label: 'Inbox', value: 'Look up linked cases', targetPage: 'inbox', focusId: null },
    ],
  };
}

function buildApprovalPanel(approval: any, context: any): ContextPanel {
  const approvalRow = context?.approval || approval;
  const timeline = Array.isArray(context?.case_state?.timeline) ? context.case_state.timeline.slice(-6).reverse() : [];

  return {
    entityType: 'approval',
    entityId: approvalRow.id,
    title: approvalRow.id,
    subtitle: `${titleCase(approvalRow.action_type || 'approval')} · ${approvalRow.customer_name || context?.customer?.canonical_name || 'Unknown customer'}`,
    status: titleCase(approvalRow.status || 'pending'),
    risk: titleCase(approvalRow.risk_level || 'medium'),
    description: approvalRow.evidence_package?.summary || approvalRow.action_payload?.summary || 'Approval request loaded with backend context.',
    facts: [
      { label: 'Case', value: approvalRow.case_number || approvalRow.case_id || 'N/A' },
      { label: 'Priority', value: titleCase(approvalRow.priority || 'normal') },
      { label: 'Assigned to', value: approvalRow.assigned_user_name || approvalRow.assigned_to || 'Unassigned' },
      { label: 'Requested by', value: approvalRow.requested_by || 'system' },
      { label: 'Expires', value: formatWhen(approvalRow.expires_at) },
      { label: 'Created', value: formatWhen(approvalRow.created_at) },
    ],
    evidence: [
      { label: 'Policy note', value: approvalRow.action_payload?.reason || approvalRow.evidence_package?.policy_text || 'Human review required before writeback.', tone: 'warning' },
      { label: 'Execution plan', value: approvalRow.execution_plan_id || 'No execution plan linked.', tone: 'neutral' },
    ],
    timeline: timeline.map((entry: any) => ({
      label: titleCase(entry.domain || entry.type || 'event'),
      value: entry.content || entry.summary || 'Case event',
      time: entry.occurred_at || entry.created_at || null,
    })),
    related: [
      { label: 'Approvals module', value: 'Open Approvals', targetPage: 'approvals', focusId: approvalRow.id },
      { label: 'Case graph', value: approvalRow.case_number || approvalRow.case_id || 'Open linked case', targetPage: 'case_graph', focusId: approvalRow.case_id || null },
    ],
  };
}

function buildWorkflowPanel(workflow: any): ContextPanel {
  return {
    entityType: 'workflow',
    entityId: workflow.id,
    title: workflow.name || workflow.id,
    subtitle: workflow.description || 'Workflow definition',
    status: titleCase(workflow.version_status || workflow.health_status || 'draft'),
    risk: null,
    description: workflow.health_message || 'Workflow definition loaded from the runtime registry.',
    facts: [
      { label: 'Version', value: toText(workflow.version_number || 'N/A') },
      { label: 'Trigger', value: titleCase(workflow.trigger?.type || workflow.trigger?.event || 'manual') },
      { label: 'Runs', value: String(workflow.metrics?.total || workflow.metrics?.runs || 0) },
      { label: 'Failures', value: String(workflow.metrics?.failed || 0) },
      { label: 'Published', value: workflow.current_version_id ? 'Yes' : 'No' },
      { label: 'Last run', value: formatWhen(workflow.last_run_at || workflow.metrics?.last_run_at) },
    ],
    evidence: [
      { label: 'Health', value: titleCase(workflow.health_status || 'active'), tone: workflow.health_status === 'warning' ? 'warning' : 'success' },
      { label: 'Description', value: workflow.description || 'No description provided.', tone: 'neutral' },
    ],
    timeline: [
      { label: 'Last run', value: workflow.health_message || 'Latest workflow execution metrics loaded.', time: workflow.last_run_at || workflow.metrics?.last_run_at || null },
    ],
    related: [
      { label: 'Workflow builder', value: 'Open Workflows', targetPage: 'workflows', focusId: workflow.id },
    ],
  };
}

function getCaseActions(req: MultiTenantRequest, bundle: any) {
  const actions: UiAction[] = [
    buildAction({
      req,
      label: 'Open case graph',
      description: 'Jump to the structured case graph for deeper inspection.',
      targetPage: 'case_graph',
      focusId: bundle.case.id,
    }),
    buildAction({
      req,
      label: 'Open inbox thread',
      description: 'Continue work in the inbox conversation thread.',
      targetPage: 'inbox',
      focusId: bundle.case.id,
    }),
  ];

  if (hasPermission(req, 'cases.write')) {
    actions.push(
      buildAction({
        req,
        label: 'Mark case resolved',
        description: 'Update the case status and record the change in the audit trail.',
        permission: 'cases.write',
        sensitive: true,
        requiresConfirmation: true,
        payload: {
          kind: 'case.update_status',
          entityType: 'case',
          entityId: bundle.case.id,
          caseId: bundle.case.id,
          params: {
            status: 'resolved',
            reason: 'Resolved from Super Agent',
          },
        },
      }),
    );
  }

  return actions;
}

function getOrderActions(req: MultiTenantRequest, order: any) {
  const actions: UiAction[] = [
    buildAction({
      req,
      label: 'Open order module',
      description: 'Navigate to the Orders workspace for full structured detail.',
      targetPage: 'orders',
      focusId: order.id,
    }),
  ];

  if (hasPermission(req, 'cases.write') && !String(order.status || '').toLowerCase().includes('cancel')) {
    actions.push(
      buildAction({
        req,
        label: 'Cancel order',
        description: 'Propose a cancellation and require explicit confirmation before execution.',
        permission: 'cases.write',
        sensitive: true,
        requiresConfirmation: true,
        payload: {
          kind: 'order.cancel',
          entityType: 'order',
          entityId: order.id,
          params: {
            reason: 'Cancelled from Super Agent',
          },
        },
      }),
    );
  }

  return actions;
}

function getPaymentActions(req: MultiTenantRequest, payment: any) {
  const actions: UiAction[] = [
    buildAction({
      req,
      label: 'Open payment module',
      description: 'Navigate to the Payments workspace for full structured detail.',
      targetPage: 'payments',
      focusId: payment.id,
    }),
  ];

  if (hasPermission(req, 'cases.write') && !String(payment.status || '').toLowerCase().includes('refund')) {
    actions.push(
      buildAction({
        req,
        label: 'Issue refund',
        description: 'Prepare a refund with guardrails, confirmation, and audit logging.',
        permission: 'cases.write',
        sensitive: true,
        requiresConfirmation: true,
        payload: {
          kind: 'payment.refund',
          entityType: 'payment',
          entityId: payment.id,
          params: {
            reason: 'Refund issued from Super Agent',
            amount: Number(payment.amount || 0),
          },
        },
      }),
    );
  }

  return actions;
}

function getApprovalActions(req: MultiTenantRequest, approval: any) {
  const actions: UiAction[] = [
    buildAction({
      req,
      label: 'Open approvals module',
      description: 'Inspect the approval in the structured approvals workspace.',
      targetPage: 'approvals',
      focusId: approval.id,
    }),
  ];

  if (hasPermission(req, 'approvals.decide') && String(approval.status || 'pending') === 'pending') {
    actions.push(
      buildAction({
        req,
        label: 'Approve request',
        description: 'Approve the request and allow post-approval execution to continue.',
        permission: 'approvals.decide',
        sensitive: true,
        requiresConfirmation: true,
        payload: {
          kind: 'approval.decide',
          entityType: 'approval',
          entityId: approval.id,
          caseId: approval.case_id || null,
          params: {
            decision: 'approved',
            note: 'Approved from Super Agent',
          },
        },
      }),
    );
    actions.push(
      buildAction({
        req,
        label: 'Reject request',
        description: 'Reject the request and keep a clear decision note in the audit trail.',
        permission: 'approvals.decide',
        sensitive: true,
        requiresConfirmation: true,
        payload: {
          kind: 'approval.decide',
          entityType: 'approval',
          entityId: approval.id,
          caseId: approval.case_id || null,
          params: {
            decision: 'rejected',
            note: 'Rejected from Super Agent',
          },
        },
      }),
    );
  }

  return actions;
}

function getWorkflowActions(req: MultiTenantRequest, workflow: any) {
  const actions: UiAction[] = [
    buildAction({
      req,
      label: 'Open workflow builder',
      description: 'Review the workflow definition in the Workflows workspace.',
      targetPage: 'workflows',
      focusId: workflow.id,
    }),
  ];

  if (hasPermission(req, 'workflows.write') && String(workflow.version_status || '').toLowerCase() === 'draft') {
    actions.push(
      buildAction({
        req,
        label: 'Publish workflow',
        description: 'Publish the current workflow draft with audit logging.',
        permission: 'workflows.write',
        sensitive: true,
        requiresConfirmation: true,
        payload: {
          kind: 'workflow.publish',
          entityType: 'workflow',
          entityId: workflow.id,
        },
      }),
    );
  }

  return actions;
}

function createResponse(input: {
  input: string;
  summary: string;
  statusLine: string;
  sections: Array<{ title: string; items: string[] }>;
  actions?: UiAction[];
  contextPanel?: ContextPanel | null;
  agents?: AgentActivity[];
  suggestedReplies?: string[];
  consultedModules?: string[];
  facts?: string[];
  conflicts?: string[];
  sources?: string[];
  evidence?: string[];
  steps?: StreamStep[];
  runId?: string | null;
  structuredIntent?: StructuredCommand | null;
  navigationTarget?: NavigationTarget | null;
}) {
  return {
    id: crypto.randomUUID(),
    input: input.input,
    summary: input.summary,
    statusLine: input.statusLine,
    sections: input.sections,
    actions: input.actions || [],
    contextPanel: input.contextPanel || null,
    agents: input.agents || [],
    suggestedReplies: input.suggestedReplies || [],
    consultedModules: input.consultedModules || [],
    facts: input.facts || [],
    conflicts: input.conflicts || [],
    sources: input.sources || input.consultedModules || [],
    evidence: input.evidence || [],
    steps: input.steps || [],
    runId: input.runId || null,
    structuredIntent: input.structuredIntent || null,
    navigationTarget: input.navigationTarget || null,
  };
}

function buildResponseFromPlanOutcome(
  input: string,
  runId: string,
  response: any,
  trace: any,
): ReturnType<typeof createResponse> {
  const consultedModules: string[] = Array.from(
    new Set(
      (trace?.spans ?? [])
        .map((span: any) => String(span.tool || '').split('.')[0])
        .filter(Boolean),
    ),
  ) as string[];
  const summary =
    trace?.summary
    || response?.plan?.rationale
    || response?.question
    || response?.error
    || 'Super Agent completed the requested operation.';
  const statusLine =
    response?.kind === 'clarification' ? 'Clarification required'
    : trace?.status === 'pending_approval' ? 'Waiting for approval'
    : trace?.status === 'rejected_by_policy' ? 'Blocked by policy'
    : trace?.status === 'failed' ? 'Execution failed'
    : 'Completed';

  const steps = Array.isArray(trace?.spans)
    ? trace.spans.map((span: any) => ({
        label: span.tool,
        value: span.result?.ok
          ? toText(span.result?.value)
          : span.result?.error || 'Failed',
      }))
    : [];
  const navigationTarget = inferPlanNavigationTargetFromTrace(trace, runId);
  const contextPanel = buildPlanContextPanelFromTrace(trace, navigationTarget);
  const evidence = derivePlanEvidenceFromTrace(trace);
  const facts = derivePlanFactsFromTrace(trace);

  return createResponse({
    input,
    summary,
    statusLine,
    sections: response?.kind === 'plan'
      ? [
          { title: 'Plan', items: (response.plan?.steps ?? []).map((step: any) => `${step.tool} · ${step.rationale || 'No rationale'}`) },
          { title: 'Execution', items: [trace?.summary || 'Execution completed.'] },
        ]
      : response?.kind === 'clarification'
        ? [{ title: 'Clarification', items: [response.question] }]
        : [{ title: 'Execution', items: [response?.error || 'Unknown LLM error'] }],
    actions: Array.isArray(trace?.approvalIds) && trace.approvalIds.length
      ? trace.approvalIds.map((approvalId: string) => buildAction({
          req: { permissions: [] } as MultiTenantRequest,
          label: 'Review approval',
          description: 'Open the required approval request.',
          targetPage: 'approvals',
          focusId: approvalId,
        }))
      : [],
    contextPanel,
    agents: [],
    suggestedReplies: [],
    consultedModules,
    facts: facts.length ? facts : steps.map((step: any) => `${step.label}: ${step.value}`),
    conflicts: [],
    sources: consultedModules,
    evidence,
    steps: Array.isArray(trace?.spans)
      ? trace.spans.map((span: any) => ({
          id: span.stepId,
          label: span.tool,
          status: span.result?.ok ? 'completed' : 'failed',
          detail: span.result?.error || null,
        }))
      : [],
    runId,
    structuredIntent: response?.kind === 'plan' ? response.plan : null,
    navigationTarget,
  });
}

function parseEntityId(input: string, pattern: RegExp) {
  const match = input.match(pattern);
  return match ? match[0] : null;
}

function parseCommandIntent(input: string, context?: CommandContext | null): StructuredCommand {
  return parseSuperAgentCommandIntent(input, context);
  const text = input.trim().toLowerCase();
  const caseId = parseEntityId(input, /\bcas[-_a-z0-9]+\b/i);
  const orderId = parseEntityId(input, /\bord[-_a-z0-9]+\b/i);
  const paymentId = parseEntityId(input, /\bpay[-_a-z0-9]+\b/i);
  const returnId = parseEntityId(input, /\bret[-_a-z0-9]+\b/i);
  const workflowId = parseEntityId(input, /\bwf[-_a-z0-9]+\b/i);
  const recentTarget = resolveRelativeTarget(text, context);
  const orderQuery = input.replace(/pedido|order|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const paymentQuery = input.replace(/pago|payment|refund|reembolso|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const caseQuery = input.replace(/caso|case|hilo|thread|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const returnQuery = input.replace(/devolucion|return|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const customerQuery = input.replace(/cliente|customer|abrir|open|revisa|review|investiga|investigate/gi, '').trim();
  const workflowQuery = input.replace(/workflow|flujo|abrir|open|publica|publish|revisa|review|investiga|investigate/gi, '').trim();
  const filters = [
    text.includes('pend') ? 'pending' : null,
    text.includes('bloque') ? 'blocked' : null,
    text.includes('alto riesgo') || text.includes('high risk') ? 'high_risk' : null,
  ].filter(Boolean) as string[];
  const intent =
    /(abrir|open|go to|ll[eé]vame|navega)/.test(text) ? 'open'
    : /(por que|por qué|why|bloquead|blocked)/.test(text) ? 'explain_blocker'
    : /(compara|compare)/.test(text) ? 'compare'
    : /(cancel|refund|reembolso|aprueba|approve|rechaza|reject|publica|publish|actualiza|update|cambia|change|cierra|close)/.test(text) ? 'operate'
    : /(busca|search)/.test(text) ? 'search'
    : 'investigate';
  const requestedAction =
    /(cancel|cancela)/.test(text) ? 'cancel'
    : /(refund|reembolso)/.test(text) ? 'refund'
    : /(approve|aprueba)/.test(text) ? 'approve'
    : /(reject|rechaza)/.test(text) ? 'reject'
    : /(publish|publica)/.test(text) ? 'publish'
    : /(open|abrir)/.test(text) ? 'open'
    : /(update|actualiza|change|cambia|close|cierra)/.test(text) ? 'update'
    : null;

  let command: StructuredCommand | null = null;

  if ((text.includes('aprob') || text.includes('approval')) && text.includes('pend')) {
    command = {
      kind: 'approval_queue',
      intent,
      targetEntityType: 'approval',
      targetEntityRef: null,
      requestedAction,
      filters: filters.length ? filters : ['pending'],
      riskLevel: 'medium',
      needsConfirmation: false,
      navigationTarget: buildNavigationTarget({ page: 'approvals', entityType: 'approval' }),
    };
  } else if ((text.includes('pago') || text.includes('payment')) && (text.includes('pend') || text.includes('bloque') || text.includes('refund'))) {
    command = {
      kind: 'payment_queue',
      intent,
      targetEntityType: 'payment',
      targetEntityRef: null,
      requestedAction,
      filters,
      riskLevel: filters.includes('high_risk') ? 'high' : 'medium',
      needsConfirmation: false,
      navigationTarget: buildNavigationTarget({ page: 'payments', entityType: 'payment' }),
    };
  } else if (caseId || ((text.includes('caso') || text.includes('case')) && caseQuery) || recentTarget?.entityType === 'case') {
    const resolved = caseId || caseQuery || recentTarget?.entityId || input.trim();
    command = {
      kind: 'case',
      intent,
      id: resolved,
      targetEntityType: 'case',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: filters.includes('high_risk') ? 'high' : 'medium',
      needsConfirmation: requestedAction !== null,
      navigationTarget: buildNavigationTarget({ page: 'case_graph', entityType: 'case', entityId: resolved }),
    };
  } else if (orderId || ((text.includes('pedido') || text.includes('order')) && orderQuery) || recentTarget?.entityType === 'order') {
    const resolved = orderId || orderQuery || recentTarget?.entityId || input.trim();
    command = {
      kind: 'order',
      intent,
      id: resolved,
      targetEntityType: 'order',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: requestedAction === 'cancel' ? 'high' : 'medium',
      needsConfirmation: requestedAction === 'cancel',
      navigationTarget: buildNavigationTarget({ page: 'orders', entityType: 'order', entityId: resolved }),
    };
  } else if (paymentId || ((text.includes('pago') || text.includes('payment')) && paymentQuery) || recentTarget?.entityType === 'payment') {
    const resolved = paymentId || paymentQuery || recentTarget?.entityId || input.trim();
    command = {
      kind: 'payment',
      intent,
      id: resolved,
      targetEntityType: 'payment',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: requestedAction === 'refund' ? 'high' : 'medium',
      needsConfirmation: requestedAction === 'refund',
      navigationTarget: buildNavigationTarget({ page: 'payments', entityType: 'payment', entityId: resolved }),
    };
  } else if (returnId || ((text.includes('devolucion') || text.includes('return')) && returnQuery) || recentTarget?.entityType === 'return') {
    const resolved = returnId || returnQuery || recentTarget?.entityId || input.trim();
    command = {
      kind: 'return',
      intent,
      id: resolved,
      targetEntityType: 'return',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: filters.includes('high_risk') ? 'high' : 'medium',
      needsConfirmation: false,
      navigationTarget: buildNavigationTarget({ page: 'returns', entityType: 'return', entityId: resolved }),
    };
  } else if (text.includes('workflow') || text.includes('flujo') || workflowId || recentTarget?.entityType === 'workflow') {
    const resolved = workflowId || workflowQuery || recentTarget?.entityId || null;
    command = {
      kind: 'workflow',
      intent,
      id: resolved || undefined,
      query: workflowQuery || undefined,
      targetEntityType: 'workflow',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: requestedAction === 'publish' ? 'high' : 'medium',
      needsConfirmation: requestedAction === 'publish',
      navigationTarget: buildNavigationTarget({ page: 'workflows', entityType: 'workflow', entityId: resolved }),
    };
  } else if (text.includes('agente') || text.includes('agent')) {
    command = {
      kind: 'agents',
      intent,
      targetEntityType: 'agent',
      targetEntityRef: null,
      requestedAction,
      filters,
      riskLevel: 'low',
      needsConfirmation: false,
      navigationTarget: buildNavigationTarget({ page: 'super_agent', entityType: 'agent' }),
    };
  } else if (text.includes('inconsist') || text.includes('conflict') || text.includes('bloquead')) {
    command = {
      kind: 'conflicts',
      intent: intent === 'search' ? 'explain_blocker' : intent,
      targetEntityType: recentTarget?.entityType || null,
      targetEntityRef: recentTarget?.entityId || null,
      requestedAction,
      filters,
      riskLevel: 'high',
      needsConfirmation: false,
      navigationTarget: recentTarget || buildNavigationTarget({ page: 'super_agent' }),
    };
  } else if (text.includes('cliente') || text.includes('customer') || recentTarget?.entityType === 'customer') {
    const resolved = customerQuery || recentTarget?.entityId || input.trim();
    command = {
      kind: 'customer',
      intent,
      query: resolved,
      targetEntityType: 'customer',
      targetEntityRef: resolved,
      requestedAction,
      filters,
      riskLevel: filters.includes('high_risk') ? 'high' : 'low',
      needsConfirmation: false,
      navigationTarget: buildNavigationTarget({ page: 'customers', entityType: 'customer', entityId: recentTarget?.entityType === 'customer' ? recentTarget.entityId : null }),
    };
  }

  if (command) {
    return command;
  }

  return {
    kind: 'search',
    intent,
    query: input.trim(),
    targetEntityType: recentTarget?.entityType || null,
    targetEntityRef: recentTarget?.entityId || null,
    requestedAction,
    filters,
    riskLevel: filters.includes('high_risk') ? 'high' : 'low',
    needsConfirmation: false,
    navigationTarget: recentTarget || context?.activeTarget || buildNavigationTarget({ page: 'super_agent' }),
  };
}

async function handleCaseIntent(req: MultiTenantRequest, scope: CommandScope, input: string, caseId: string, agents: any[]) {
  const bundle = await resolveCaseBundle(scope, caseId);
  if (!bundle) {
    return createResponse({
      input,
      summary: `I couldn't find a case matching ${caseId}.`,
      statusLine: 'No case found',
      sections: [
        { title: 'What I checked', items: ['Cases registry', 'Unified case bundle'] },
        { title: 'Next step', items: ['Try the exact case number or search by customer or order ID.'] },
      ],
      suggestedReplies: ['Busca el cliente relacionado', 'Investiga el pedido relacionado', 'Abre aprobaciones pendientes'],
      consultedModules: ['cases'],
    });
  }

  const state = buildCaseState(bundle);
  const resolve = buildResolveView(bundle);
  const customerName = bundle.customer?.canonical_name || bundle.case.customer_name || 'Unknown customer';
  const actions = getCaseActions(req, bundle);

  return createResponse({
    input,
    summary: `${bundle.case.case_number || bundle.case.id} is ${titleCase(bundle.case.status)} for ${customerName}. ${describeConflict(state.conflict) || bundle.case.ai_root_cause || 'The case is synchronized and ready for review.'}`,
    statusLine: `${titleCase(bundle.case.type || 'case')} · ${titleCase(bundle.case.priority || 'normal')} priority`,
    sections: [
      {
        title: 'Summary',
        items: [
          bundle.case.ai_diagnosis || 'Unified case state loaded successfully.',
          bundle.case.ai_recommended_action || describeExecutionNextStep(resolve) || 'No automatic recommendation available yet.',
        ],
      },
      {
        title: 'What I found',
        items: [
          `Conflict: ${describeConflict(state.conflict)}`,
          `Approval state: ${titleCase(bundle.case.approval_state || 'none')}`,
          `Execution state: ${titleCase(bundle.case.execution_state || 'idle')}`,
          `Modules linked: ${(Array.isArray(bundle.orders) ? bundle.orders.length : 0)} orders, ${(Array.isArray(bundle.payments) ? bundle.payments.length : 0)} payments, ${(Array.isArray(bundle.returns) ? bundle.returns.length : 0)} returns`,
        ],
      },
      {
        title: 'Guardrails',
        items: [
          resolve.blockers?.length
            ? `Blocking conditions: ${resolve.blockers.slice(0, 3).map((item: any) => item.summary || item.title || item.label).join(' • ')}`
            : 'No blocking approval or execution constraints returned.',
        ],
      },
    ],
    actions,
    contextPanel: buildCasePanel(bundle),
    agents: [
      ...pickAgentActivity(agents, ['supervisor', 'knowledge-retriever', 'qa-policy-check'], 'consulted', 'Loaded for case analysis and policy interpretation.'),
      ...pickAgentActivity(agents, ['approval-gatekeeper', 'audit-observability'], 'available', 'Ready if this case requires sensitive execution or audit review.'),
    ],
    suggestedReplies: ['Explica por que esta bloqueado', 'Marca el caso como resuelto', 'Abre el case graph'],
    consultedModules: ['cases', 'orders', 'payments', 'returns', 'approvals'],
  });
}

async function handleOrderIntent(req: MultiTenantRequest, scope: CommandScope, input: string, orderId: string, agents: any[]) {
  const order = await resolveOrder(scope, orderId);
  if (!order) {
    return createResponse({
      input,
      summary: `I couldn't find an order matching ${orderId}.`,
      statusLine: 'No order found',
      sections: [
        { title: 'What I checked', items: ['Orders registry', 'Cross-module search'] },
      ],
      suggestedReplies: ['Busca el cliente', 'Analiza una inconsistencia', 'Revisa pagos pendientes'],
      consultedModules: ['orders'],
    });
  }

  const context = await commerceRepository.getOrderContext(scope, order.id);
  return createResponse({
    input,
    summary: `${order.external_order_id || order.id} is ${titleCase(order.status)} for ${order.customer_name || 'Unknown customer'}. ${order.conflict_detected || order.summary || 'The order is synchronized and available for action.'}`,
    statusLine: `${formatMoney(order.total_amount, order.currency || 'USD')} · ${titleCase(order.fulfillment_status || 'N/A')}`,
    sections: [
      {
        title: 'Summary',
        items: [
          order.summary || 'Order context loaded.',
          order.recommended_action || 'Use the linked modules to continue the operational flow.',
        ],
      },
      {
        title: 'Operational state',
        items: [
          `Payment: ${titleCase(order.payment_status || order.system_states?.psp || 'N/A')}`,
          `Fulfillment: ${titleCase(order.fulfillment_status || order.system_states?.wms || 'N/A')}`,
          `Refund: ${titleCase(order.refund_status || order.system_states?.refund_status || 'N/A')}`,
          `Approval: ${titleCase(order.approval_status || 'N/A')}`,
        ],
      },
    ],
    actions: getOrderActions(req, order),
    contextPanel: buildOrderPanel(order, context),
    agents: [
      ...pickAgentActivity(agents, ['supervisor', 'shopify-agent', 'oms-erp-agent'], 'consulted', 'Read the commerce state and verified operational dependencies.'),
      ...pickAgentActivity(agents, ['approval-gatekeeper', 'audit-observability'], 'available', 'Ready if this order needs sensitive execution or audit review.'),
    ],
    suggestedReplies: ['Cancela este pedido', 'Abre el modulo de orders', 'Busca el caso relacionado'],
    consultedModules: ['orders', 'cases'],
  });
}

async function handlePaymentIntent(req: MultiTenantRequest, scope: CommandScope, input: string, paymentId: string, agents: any[]) {
  const payment = await resolvePayment(scope, paymentId);
  if (!payment) {
    return createResponse({
      input,
      summary: `I couldn't find a payment matching ${paymentId}.`,
      statusLine: 'No payment found',
      sections: [{ title: 'What I checked', items: ['Payments registry', 'Cross-module search'] }],
      suggestedReplies: ['Revisa pagos pendientes', 'Busca el cliente', 'Analiza una inconsistencia'],
      consultedModules: ['payments'],
    });
  }

  const context = await commerceRepository.getPaymentContext(scope, payment.id);
  return createResponse({
    input,
    summary: `${payment.external_payment_id || payment.id} is ${titleCase(payment.status)} for ${payment.customer_name || 'Unknown customer'}. ${payment.conflict_detected || payment.summary || 'The payment state is loaded and actionable.'}`,
    statusLine: `${formatMoney(payment.amount, payment.currency || 'USD')} · ${titleCase(payment.psp || 'N/A')}`,
    sections: [
      {
        title: 'Summary',
        items: [
          payment.summary || 'Payment context loaded.',
          payment.recommended_action || 'Review refund, dispute, and reconciliation state before executing writes.',
        ],
      },
      {
        title: 'Payment controls',
        items: [
          `Refund: ${titleCase(payment.refund_status || payment.system_states?.refund || 'N/A')}`,
          `Dispute: ${titleCase(payment.dispute_status || payment.system_states?.dispute || 'N/A')}`,
          `Reconciliation: ${titleCase(payment.reconciliation_status || payment.system_states?.reconciliation || 'N/A')}`,
          `Approval: ${titleCase(payment.approval_status || 'N/A')}`,
        ],
      },
    ],
    actions: getPaymentActions(req, payment),
    contextPanel: buildPaymentPanel(payment, context),
    agents: [
      ...pickAgentActivity(agents, ['supervisor', 'stripe-agent', 'reconciliation-agent'], 'consulted', 'Read payment, refund, and reconciliation state.'),
      ...pickAgentActivity(agents, ['approval-gatekeeper', 'audit-observability'], 'available', 'Ready if this payment needs approval or a sensitive write.'),
    ],
    suggestedReplies: ['Emite un reembolso', 'Abre el modulo de payments', 'Explica el conflicto'],
    consultedModules: ['payments', 'approvals'],
  });
}

async function handleReturnIntent(req: MultiTenantRequest, scope: CommandScope, input: string, returnId: string, agents: any[]) {
  const ret = await resolveReturn(scope, returnId);
  if (!ret) {
    return createResponse({
      input,
      summary: `I couldn't find a return matching ${returnId}.`,
      statusLine: 'No return found',
      sections: [{ title: 'What I checked', items: ['Returns registry', 'Cross-module search'] }],
      suggestedReplies: ['Busca el pedido relacionado', 'Analiza una inconsistencia', 'Abre aprobaciones pendientes'],
      consultedModules: ['returns'],
    });
  }

  const context = await commerceRepository.getReturnContext(scope, ret.id);
  return createResponse({
    input,
    summary: `${ret.external_return_id || ret.id} is ${titleCase(ret.status)} for ${ret.customer_name || 'Unknown customer'}. ${ret.conflict_detected || ret.summary || 'The return context is available for review.'}`,
    statusLine: `${titleCase(ret.reason || ret.return_reason || 'return')} · ${titleCase(ret.refund_status || 'N/A')}`,
    sections: [
      {
        title: 'Summary',
        items: [
          ret.summary || 'Return context loaded.',
          ret.recommended_action || 'Review inspection and refund state before moving forward.',
        ],
      },
      {
        title: 'Operational state',
        items: [
          `Inspection: ${titleCase(ret.inspection_status || 'N/A')}`,
          `Refund: ${titleCase(ret.refund_status || 'N/A')}`,
          `Carrier: ${titleCase(ret.carrier_status || 'N/A')}`,
        ],
      },
    ],
    actions: [
      buildAction({
        req,
        label: 'Open returns module',
        description: 'Navigate to the Returns workspace for structured detail.',
        targetPage: 'returns',
        focusId: ret.id,
      }),
    ],
    contextPanel: buildReturnPanel(ret, context),
    agents: [
      ...pickAgentActivity(agents, ['supervisor', 'returns-agent', 'qa-policy-check'], 'consulted', 'Read the return lifecycle and current blockers.'),
    ],
    suggestedReplies: ['Abre el modulo de returns', 'Busca el caso relacionado', 'Explica si el reembolso esta bloqueado'],
    consultedModules: ['returns'],
  });
}

async function handleCustomerIntent(req: MultiTenantRequest, scope: CommandScope, input: string, query: string, agents: any[]) {
  const customer = await resolveCustomer(scope, query || input);
  if (!customer) {
    return createResponse({
      input,
      summary: `I couldn't find a customer matching "${query || input}".`,
      statusLine: 'No customer found',
      sections: [{ title: 'What I checked', items: ['Customer registry', 'Search index'] }],
      suggestedReplies: ['Busca un pedido', 'Analiza una inconsistencia', 'Revisa pagos pendientes'],
      consultedModules: ['customers'],
    });
  }

  return createResponse({
    input,
    summary: `${customer.canonical_name || customer.id} has ${customer.state_snapshot?.metrics?.open_cases || customer.open_cases || 0} open cases and ${customer.state_snapshot?.metrics?.active_conflicts || customer.active_conflicts || 0} active conflicts.`,
    statusLine: `${titleCase(customer.segment || 'customer')} · ${titleCase(customer.risk_level || 'low')} risk`,
    sections: [
      {
        title: 'Summary',
        items: [
          `Open cases: ${customer.state_snapshot?.metrics?.open_cases || customer.open_cases || 0}`,
          `Linked identities: ${(customer.linked_identities || []).length || 0}`,
          `Lifetime value: ${formatMoney(customer.state_snapshot?.metrics?.lifetime_value || customer.lifetime_value || customer.total_spent || 0, customer.currency || 'USD')}`,
        ],
      },
      {
        title: 'Recommended next step',
        items: [
          Number(customer.state_snapshot?.metrics?.active_conflicts || customer.active_conflicts || 0) > 0
            ? 'Investigate the linked open cases before executing cross-system changes.'
            : 'Customer context is clean enough to continue in Customers or Inbox.',
        ],
      },
    ],
    actions: [
      buildAction({
        req,
        label: 'Open customers module',
        description: 'Navigate to the Customers workspace for the full profile.',
        targetPage: 'customers',
        focusId: customer.id,
      }),
    ],
    contextPanel: buildCustomerPanel(customer),
    agents: [
      ...pickAgentActivity(agents, ['supervisor', 'customer-identity-agent', 'identity-mapping-agent'], 'consulted', 'Resolved the canonical customer view across systems.'),
    ],
    suggestedReplies: ['Busca un caso de este cliente', 'Abre el modulo de customers', 'Investiga el ultimo pedido'],
    consultedModules: ['customers', 'cases', 'orders', 'payments', 'returns'],
  });
}

async function handleApprovalQueueIntent(req: MultiTenantRequest, scope: CommandScope, input: string, agents: any[]) {
  const approvals = await approvalRepository.list(scope, { status: 'pending' });
  const top = approvals.slice(0, 5);

  return createResponse({
    input,
    summary: top.length
      ? `There are ${approvals.length} pending approvals. The top request is ${titleCase(top[0].action_type || 'approval')} for ${top[0].customer_name || 'Unknown customer'}.`
      : 'There are no pending approvals right now.',
    statusLine: `${approvals.length} pending approvals`,
    sections: [
      {
        title: 'Queue snapshot',
        items: top.length
          ? top.map((item: any) => `${item.id} · ${titleCase(item.action_type || 'approval')} · ${item.customer_name || 'Unknown customer'} · ${titleCase(item.risk_level || 'medium')} risk`)
          : ['Approval queue is clear.'],
      },
    ],
    actions: [
      buildAction({
        req,
        label: 'Open approvals module',
        description: 'Review and decide requests in the structured approvals workspace.',
        targetPage: 'approvals',
      }),
      ...(top[0] ? getApprovalActions(req, top[0]).filter((item) => item.type === 'execute') : []),
    ],
    contextPanel: top[0] ? buildApprovalPanel(top[0], await approvalRepository.getContext(scope, top[0].id)) : null,
    agents: [
      ...pickAgentActivity(agents, ['approval-gatekeeper', 'workflow-runtime-agent', 'audit-observability'], top[0] ? 'consulted' : 'available', 'Approval routing and audit specialists are ready for the queue.'),
    ],
    suggestedReplies: ['Aprueba la primera solicitud', 'Abre el modulo de approvals', 'Explica por que requiere aprobacion'],
    consultedModules: ['approvals'],
  });
}

async function handlePaymentQueueIntent(req: MultiTenantRequest, scope: CommandScope, input: string, agents: any[]) {
  const payments = await commerceRepository.listPayments(scope, {});
  const flagged = payments.filter((payment: any) => {
    const status = String(payment.status || '').toLowerCase();
    const refundStatus = String(payment.refund_status || payment.system_states?.refund || '').toLowerCase();
    return status.includes('pending')
      || status.includes('failed')
      || refundStatus.includes('pending')
      || refundStatus.includes('fail')
      || Boolean(payment.conflict_detected);
  }).slice(0, 6);

  return createResponse({
    input,
    summary: flagged.length
      ? `I found ${flagged.length} payments needing attention. The top item is ${flagged[0].external_payment_id || flagged[0].id} with ${titleCase(flagged[0].status || 'unknown')} status.`
      : 'No pending or blocked payments need attention right now.',
    statusLine: `${flagged.length} payments need attention`,
    sections: [
      {
        title: 'Payments requiring attention',
        items: flagged.length
          ? flagged.map((payment: any) => `${payment.external_payment_id || payment.id} · ${payment.customer_name || 'Unknown customer'} · ${titleCase(payment.status || 'unknown')} · ${payment.conflict_detected || payment.summary || 'Review payment state'}`)
          : ['Payment queue looks healthy.'],
      },
    ],
    actions: [
      buildAction({
        req,
        label: 'Open payments module',
        description: 'Review payments in the structured payments workspace.',
        targetPage: 'payments',
      }),
      ...(flagged[0] ? getPaymentActions(req, flagged[0]).filter((item) => item.type === 'execute') : []),
    ],
    contextPanel: flagged[0] ? buildPaymentPanel(flagged[0], await commerceRepository.getPaymentContext(scope, flagged[0].id)) : null,
    agents: [
      ...pickAgentActivity(agents, ['stripe-agent', 'reconciliation-agent', 'approval-gatekeeper'], flagged[0] ? 'consulted' : 'available', 'Payment specialists are ready to investigate and enforce guardrails.'),
    ],
    suggestedReplies: ['Emite un reembolso del primer pago', 'Abre el modulo de payments', 'Explica el conflicto del primer pago'],
    consultedModules: ['payments'],
  });
}

async function handleConflictIntent(req: MultiTenantRequest, scope: CommandScope, input: string, agents: any[]) {
  const [cases, orders, payments] = await Promise.all([
    caseRepository.list(scope, {}),
    commerceRepository.listOrders(scope, {}),
    commerceRepository.listPayments(scope, {}),
  ]);

  const conflicts = [
    ...cases
      .filter((item: any) => item.has_reconciliation_conflicts || item.conflict_severity || item.ai_root_cause)
      .slice(0, 2)
      .map((item: any) => ({ label: 'Case', value: `${item.case_number || item.id} · ${item.ai_root_cause || item.latest_message_preview || 'Conflict detected'}` })),
    ...orders
      .filter((item: any) => item.conflict_detected || item.has_conflict)
      .slice(0, 2)
      .map((item: any) => ({ label: 'Order', value: `${item.external_order_id || item.id} · ${item.conflict_detected || item.summary || 'Conflict detected'}` })),
    ...payments
      .filter((item: any) => item.conflict_detected || item.has_conflict)
      .slice(0, 2)
      .map((item: any) => ({ label: 'Payment', value: `${item.external_payment_id || item.id} · ${item.conflict_detected || item.summary || 'Conflict detected'}` })),
  ];

  return createResponse({
    input,
    summary: conflicts.length
      ? `I found ${conflicts.length} active inconsistencies across the connected modules.`
      : 'I did not find active inconsistencies in the current workspace snapshot.',
    statusLine: `${conflicts.length} active inconsistencies`,
    sections: [
      {
        title: 'Conflict snapshot',
        items: conflicts.length ? conflicts.map((item) => `${item.label} · ${item.value}`) : ['No cross-system conflicts detected.'],
      },
      {
        title: 'Recommended next step',
        items: [
          conflicts.length
            ? 'Open the affected entity and review policy plus approval constraints before executing writebacks.'
            : 'Continue with a targeted search if you want to inspect a specific order, payment, return, or case.',
        ],
      },
    ],
    actions: [
      buildAction({
        req,
        label: 'Open inbox',
        description: 'Review cases with the richest operational context.',
        targetPage: 'inbox',
      }),
      buildAction({
        req,
        label: 'Open payments',
        description: 'Review payment-side conflicts and reconciliation issues.',
        targetPage: 'payments',
      }),
    ],
    contextPanel: null,
    agents: [
      ...pickAgentActivity(agents, ['supervisor', 'reconciliation-agent', 'qa-policy-check', 'audit-observability'], 'consulted', 'Conflict and policy specialists were considered for this investigation.'),
    ],
    suggestedReplies: ['Investiga un pedido concreto', 'Revisa pagos pendientes', 'Abre aprobaciones pendientes'],
    consultedModules: ['cases', 'orders', 'payments'],
  });
}

async function handleWorkflowIntent(req: MultiTenantRequest, scope: CommandScope, input: string, agents: any[]) {
  const workflows = await workflowRepository.listDefinitions(scope.tenantId, scope.workspaceId);
  const top = workflows.slice(0, 5);

  return createResponse({
    input,
    summary: top.length
      ? `I found ${workflows.length} workflows. ${top[0].name || top[0].id} is currently ${titleCase(top[0].version_status || top[0].health_status || 'active')}.`
      : 'No workflows are configured in this workspace yet.',
    statusLine: `${workflows.length} workflows available`,
    sections: [
      {
        title: 'Workflow snapshot',
        items: top.length
          ? top.map((workflow: any) => `${workflow.name || workflow.id} · ${titleCase(workflow.version_status || 'draft')} · trigger ${titleCase(workflow.trigger?.type || workflow.trigger?.event || 'manual')}`)
          : ['No workflows returned by the runtime.'],
      },
    ],
    actions: [
      buildAction({
        req,
        label: 'Open workflows module',
        description: 'Review or edit workflows in the structured builder.',
        targetPage: 'workflows',
      }),
      ...(top[0] ? getWorkflowActions(req, top[0]).filter((item) => item.type === 'execute') : []),
    ],
    contextPanel: top[0] ? buildWorkflowPanel(top[0]) : null,
    agents: [
      ...pickAgentActivity(agents, ['workflow-runtime-agent', 'approval-gatekeeper', 'audit-observability'], top[0] ? 'consulted' : 'available', 'Workflow runtime and guardrail specialists are online.'),
    ],
    suggestedReplies: ['Publica el primer workflow', 'Abre el modulo de workflows', 'Explica si hay fallos recientes'],
    consultedModules: ['workflows'],
  });
}

async function handleAgentIntent(input: string, agents: any[]) {
  const top = agents.slice(0, 8);
  return createResponse({
    input,
    summary: top.length
      ? `I found ${agents.length} local agents in the current roster. ${top[0].name || top[0].slug} is available as a ${top[0].runtime || 'system'} specialist.`
      : 'No local agents were returned by the registry.',
    statusLine: `${agents.length} agents detected`,
    sections: [
      {
        title: 'Available specialists',
        items: top.length
          ? top.map((agent: any) => `${agent.name || agent.slug} · ${titleCase(agent.runtime || 'system')} · ${titleCase(agent.mode || agent.version_status || 'available')}`)
          : ['No agent registry entries available.'],
      },
    ],
    actions: [],
    contextPanel: {
      entityType: 'agents',
      title: 'Local agent roster',
      subtitle: 'Specialists available to the Command Center',
      status: 'online',
      risk: null,
      description: 'The Super Agent remains the single conversational entrypoint and delegates to specialists when clarity or execution requires it.',
      facts: top.slice(0, 6).map((agent: any) => ({
        label: agent.name || agent.slug,
        value: `${titleCase(agent.runtime || 'system')} · ${titleCase(agent.mode || agent.version_status || 'available')}`,
      })),
      evidence: [
        { label: 'Orchestration model', value: 'Supervisor-led coordination with specialist delegation.', tone: 'success' },
      ],
      timeline: [],
      related: [],
    },
    suggestedReplies: ['Investiga un caso con agentes', 'Revisa approvals pendientes', 'Explica que agente participa en pagos'],
    consultedModules: ['agents'],
  });
}

async function handleSearchIntent(req: MultiTenantRequest, scope: CommandScope, input: string, query: string, agents: any[]) {
  const safeQuery = normalizeSearchQuery(query || input);
  if (isGeneralConversationInput(input) || !safeQuery) {
    return createResponse({
      input,
      summary: 'I can help you investigate cases, orders, payments, returns, approvals, customers, workflows, and agents.',
      statusLine: 'Ready',
      sections: [
        {
          title: 'What I can do',
          items: [
            'Investigate a specific case, order, payment, return, approval, or customer.',
            'Explain why an action is blocked or requires approval.',
            'Navigate to the right module and keep the context for the next turn.',
          ],
        },
      ],
      actions: [
        buildAction({
          req,
          label: 'Investigate a case',
          description: 'Open the most relevant operational record and analyze the current state.',
          targetPage: 'case_graph',
        }),
        buildAction({
          req,
          label: 'Review approvals',
          description: 'Open the approval queue and inspect pending sensitive actions.',
          targetPage: 'approvals',
        }),
        buildAction({
          req,
          label: 'Search customers',
          description: 'Look for customers, orders, or payments by name, email, or ID.',
          targetPage: 'customers',
        }),
      ],
      contextPanel: null,
      agents: [
        ...pickAgentActivity(agents, ['supervisor', 'knowledge-retriever', 'customer-identity-agent'], 'available', 'Standing by for a focused request.'),
      ],
      suggestedReplies: [
        'Investiga un pedido',
        'Revisa pagos pendientes',
        'Abre aprobaciones pendientes',
      ],
      consultedModules: [],
    });
  }

  const [cases, orders, customers, payments] = await Promise.all([
    caseRepository.list(scope, { q: safeQuery }),
    commerceRepository.listOrders(scope, { q: safeQuery }),
    customerRepository.list(scope, { q: safeQuery }),
    commerceRepository.listPayments(scope, { q: safeQuery }),
  ]);

  const hits = [
    ...cases.slice(0, 2).map((item: any) => ({ label: 'Case', value: `${item.case_number || item.id} · ${item.latest_message_preview || item.ai_diagnosis || item.type || 'Case result'}` })),
    ...orders.slice(0, 2).map((item: any) => ({ label: 'Order', value: `${item.external_order_id || item.id} · ${item.customer_name || 'Unknown customer'} · ${titleCase(item.status || 'unknown')}` })),
    ...customers.slice(0, 2).map((item: any) => ({ label: 'Customer', value: `${item.canonical_name || item.id} · ${item.canonical_email || item.phone || 'Customer result'}` })),
    ...payments.slice(0, 2).map((item: any) => ({ label: 'Payment', value: `${item.external_payment_id || item.id} · ${titleCase(item.status || 'unknown')}` })),
  ];

  return createResponse({
    input,
    summary: hits.length
      ? `I found ${hits.length} relevant results for "${query}".`
      : `I couldn't find a strong match for "${query}".`,
    statusLine: `${hits.length} results`,
    sections: [
      {
        title: 'Search results',
        items: hits.length ? hits.map((hit) => `${hit.label} · ${hit.value}`) : ['Try a case number, order ID, payment ID, or customer name.'],
      },
    ],
    actions: [
      buildAction({
        req,
        label: 'Open inbox',
        description: 'Review cases if you want the richest conversation context.',
        targetPage: 'inbox',
      }),
      buildAction({
        req,
        label: 'Open customers',
        description: 'Inspect customer profiles in the structured workspace.',
        targetPage: 'customers',
      }),
    ],
    contextPanel: null,
    agents: [
      ...pickAgentActivity(agents, ['supervisor', 'knowledge-retriever', 'customer-identity-agent'], 'consulted', 'Search and identity specialists were considered for this query.'),
    ],
    suggestedReplies: ['Investiga el primer resultado', 'Revisa pagos pendientes', 'Abre aprobaciones pendientes'],
    consultedModules: ['cases', 'orders', 'customers', 'payments'],
  });
}

function shouldRequireApprovalForAction(payload: SuperAgentActionPayload, entity: any) {
  if (payload.kind === 'payment.refund') {
    const amount = Number(payload.params?.amount ?? entity?.amount ?? 0);
    const risk = String(entity?.risk_level || '').toLowerCase();
    return amount > 50 || risk === 'high' || risk === 'critical';
  }

  if (payload.kind === 'order.cancel') {
    const risk = String(entity?.risk_level || '').toLowerCase();
    const status = String(entity?.fulfillment_status || entity?.status || '').toLowerCase();
    return risk === 'high' || status.includes('packed') || status.includes('shipped') || status.includes('delivered');
  }

  if (payload.kind === 'workflow.publish') return false;
  if (payload.kind === 'case.update_status') return false;
  if (payload.kind === 'approval.decide') return false;
  if (payload.kind === 'case.add_internal_note') return false;
  if (payload.kind === 'workflow.publish') return true;
  return false;
}

async function createApprovalForSensitiveAction(scope: CommandScope, req: MultiTenantRequest, payload: SuperAgentActionPayload, entity: any) {
  const created = await approvalRepository.create(
    { tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.userId },
    {
      caseId: payload.caseId || entity?.case_id || null,
      actionType: payload.kind,
      actionPayload: {
        ...payload.params,
        entity_id: payload.entityId,
        entity_type: payload.entityType,
      },
      riskLevel: String(entity?.risk_level || 'medium'),
      priority: 'high',
      requestedBy: req.userId || 'system',
      requestedByType: 'human',
      evidencePackage: {
        summary: `Approval required for ${payload.kind} on ${payload.entityType} ${payload.entityId}.`,
      },
    },
  );

  await auditRepository.log({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    actorId: req.userId || 'system',
    action: 'SUPER_AGENT_APPROVAL_REQUESTED',
    entityType: payload.entityType,
    entityId: payload.entityId,
    newValue: created,
    metadata: {
      source: 'super-agent',
      payload,
    },
  });

  return created;
}

async function executeAction(req: MultiTenantRequest, scope: CommandScope, payload: SuperAgentActionPayload) {
  const actorId = req.userId || 'system';

  switch (payload.kind) {
    case 'case.update_status': {
      if (!hasPermission(req, 'cases.write')) {
        return { ok: false, error: 'Missing permission: cases.write' };
      }

      const bundle = await caseRepository.getBundle(scope, payload.entityId);
      if (!bundle) return { ok: false, error: 'Case not found' };

      await caseRepository.update(scope, payload.entityId, {
        status: payload.params?.status || 'resolved',
        last_activity_at: new Date().toISOString(),
      });
      await caseRepository.addStatusHistory(scope, {
        caseId: payload.entityId,
        fromStatus: bundle.case.status,
        toStatus: payload.params?.status || 'resolved',
        changedBy: actorId,
        reason: payload.params?.reason || null,
      });
      await auditRepository.log({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        actorId,
        action: 'SUPER_AGENT_CASE_STATUS_UPDATE',
        entityType: 'case',
        entityId: payload.entityId,
        oldValue: { status: bundle.case.status },
        newValue: { status: payload.params?.status || 'resolved' },
        metadata: { source: 'super-agent', payload },
      });
      return { ok: true, result: { caseId: payload.entityId, status: payload.params?.status || 'resolved' } };
    }

    case 'case.add_internal_note': {
      if (!hasPermission(req, 'cases.write')) {
        return { ok: false, error: 'Missing permission: cases.write' };
      }

      const bundle = await caseRepository.getBundle(scope, payload.entityId);
      if (!bundle) return { ok: false, error: 'Case not found' };

      const content = String(payload.params?.content || '').trim();
      if (!content) return { ok: false, error: 'Note content is required' };

      await conversationRepository.createInternalNote(scope, {
        caseId: payload.entityId,
        content,
        createdBy: actorId,
      });
      if (bundle.conversation || bundle.case.conversation_id) {
        const conversation = await conversationRepository.ensureForCase(scope, bundle.case);
        await conversationRepository.appendMessage(scope, {
          conversationId: conversation.id,
          caseId: payload.entityId,
          customerId: bundle.case.customer_id || null,
          type: 'internal',
          direction: 'outbound',
          senderId: actorId,
          senderName: 'Super Agent',
          content,
          channel: 'internal',
        });
      }
      await auditRepository.log({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        actorId,
        action: 'SUPER_AGENT_CASE_INTERNAL_NOTE',
        entityType: 'case',
        entityId: payload.entityId,
        newValue: { content },
        metadata: { source: 'super-agent', payload },
      });
      return { ok: true, result: { caseId: payload.entityId, note: content } };
    }

    case 'order.cancel': {
      if (!hasPermission(req, 'cases.write')) {
        return { ok: false, error: 'Missing permission: cases.write' };
      }

      const order = await commerceRepository.getOrder(scope, payload.entityId);
      if (!order) return { ok: false, error: 'Order not found' };

      if (shouldRequireApprovalForAction(payload, order)) {
        const approval = await createApprovalForSensitiveAction(scope, req, payload, order);
        return { ok: false, approvalRequired: true, approval };
      }

      await commerceRepository.updateOrder(scope, payload.entityId, {
        status: 'cancelled',
        approval_status: 'not_required',
        summary: payload.params?.reason || 'Cancelled from Super Agent',
        updated_at: new Date().toISOString(),
      });
      await auditRepository.log({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        actorId,
        action: 'SUPER_AGENT_ORDER_CANCELLED',
        entityType: 'order',
        entityId: payload.entityId,
        oldValue: { status: order.status },
        newValue: { status: 'cancelled', reason: payload.params?.reason || null },
        metadata: { source: 'super-agent', payload },
      });
      return { ok: true, result: { orderId: payload.entityId, status: 'cancelled' } };
    }

    case 'payment.refund': {
      if (!hasPermission(req, 'cases.write')) {
        return { ok: false, error: 'Missing permission: cases.write' };
      }

      const payment = await commerceRepository.getPayment(scope, payload.entityId);
      if (!payment) return { ok: false, error: 'Payment not found' };

      if (shouldRequireApprovalForAction(payload, payment)) {
        const approval = await createApprovalForSensitiveAction(scope, req, payload, payment);
        return { ok: false, approvalRequired: true, approval };
      }

      await commerceRepository.updatePayment(scope, payload.entityId, {
        status: 'refunded',
        refund_status: 'succeeded',
        approval_status: 'not_required',
        summary: payload.params?.reason || 'Refund executed from Super Agent',
        updated_at: new Date().toISOString(),
      });
      await auditRepository.log({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        actorId,
        action: 'SUPER_AGENT_PAYMENT_REFUNDED',
        entityType: 'payment',
        entityId: payload.entityId,
        oldValue: { status: payment.status, refund_status: payment.refund_status || null },
        newValue: {
          status: 'refunded',
          refund_status: 'succeeded',
          amount: payload.params?.amount ?? payment.amount,
          reason: payload.params?.reason || null,
        },
        metadata: { source: 'super-agent', payload },
      });
      return { ok: true, result: { paymentId: payload.entityId, status: 'refunded' } };
    }

    case 'approval.decide': {
      if (!hasPermission(req, 'approvals.decide')) {
        return { ok: false, error: 'Missing permission: approvals.decide' };
      }

      const approval = await approvalRepository.get(scope, payload.entityId);
      if (!approval) return { ok: false, error: 'Approval not found' };

      const decision = payload.params?.decision === 'rejected' ? 'rejected' : 'approved';
      const result = await approvalRepository.decide(scope, payload.entityId, {
        decision,
        note: payload.params?.note || null,
        decided_by: actorId,
      });

      await auditRepository.log({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        actorId,
        action: 'SUPER_AGENT_APPROVAL_DECIDED',
        entityType: 'approval',
        entityId: payload.entityId,
        oldValue: { status: approval.status },
        newValue: { status: decision, note: payload.params?.note || null },
        metadata: { source: 'super-agent', payload },
      });

      return { ok: true, result: { approvalId: payload.entityId, decision, caseId: result?.caseId || approval.case_id || null } };
    }

    case 'workflow.publish': {
      if (!hasPermission(req, 'workflows.write')) {
        return { ok: false, error: 'Missing permission: workflows.write' };
      }

      const workflow = await workflowRepository.getDefinition(payload.entityId, scope.tenantId, scope.workspaceId);
      if (!workflow) return { ok: false, error: 'Workflow not found' };

      if (shouldRequireApprovalForAction(payload, workflow)) {
        const approval = await createApprovalForSensitiveAction(scope, req, payload, workflow);
        return { ok: false, approvalRequired: true, approval };
      }

      const versions = await workflowRepository.listVersions(payload.entityId);
      const draftVersion = versions.find((version: any) => String(version.status) === 'draft');
      if (!draftVersion) {
        return { ok: false, error: 'No draft workflow version available to publish' };
      }

      const now = new Date().toISOString();
      if (workflow.current_version_id && workflow.current_version_id !== draftVersion.id) {
        await workflowRepository.updateVersion(workflow.current_version_id, { status: 'archived' });
      }

      await workflowRepository.updateVersion(draftVersion.id, {
        status: 'published',
        publishedBy: actorId,
        publishedAt: now,
      });
      await workflowRepository.updateDefinition(payload.entityId, scope.tenantId, scope.workspaceId, {
        currentVersionId: draftVersion.id,
      });

      await auditRepository.log({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        actorId,
        action: 'SUPER_AGENT_WORKFLOW_PUBLISHED',
        entityType: 'workflow',
        entityId: payload.entityId,
        oldValue: { current_version_id: workflow.current_version_id || null },
        newValue: { current_version_id: draftVersion.id },
        metadata: { source: 'super-agent', payload },
      });

      return { ok: true, result: { workflowId: payload.entityId, versionId: draftVersion.id, publishedAt: now } };
    }
  }
}

router.get('/bootstrap', async (req: MultiTenantRequest, res) => {
  try {
    const scope = getScope(req);
    const permissionMatrix = buildPermissionMatrix(req);
    const [workspace, cases, orders, payments, approvals, agents] = await Promise.all([
      workspaceRepository.getById(scope.workspaceId, scope.tenantId),
      hasPermission(req, 'cases.read') ? caseRepository.list(scope, {}) : Promise.resolve([]),
      hasPermission(req, 'cases.read') ? commerceRepository.listOrders(scope, {}) : Promise.resolve([]),
      hasPermission(req, 'cases.read') ? commerceRepository.listPayments(scope, {}) : Promise.resolve([]),
      hasPermission(req, 'approvals.read') ? approvalRepository.list(scope, { status: 'pending' }) : Promise.resolve([]),
      hasPermission(req, 'agents.read') ? agentRepository.listAgents(scope) : Promise.resolve([]),
    ]);

    const counts = {
      cases: cases.length,
      orders: orders.length,
      payments: payments.length,
      approvals: approvals.length,
    };

    res.json({
      welcomeTitle: 'Super Agent',
      welcomeSubtitle: 'A unified operating layer for reading state, moving across modules, and executing controlled actions.',
      permissionMatrix,
      overview: [
        { label: 'Cases', value: String(counts.cases), detail: 'Open operational records available to inspect.' },
        { label: 'Orders', value: String(counts.orders), detail: 'Commerce entities ready for cross-module review.' },
        { label: 'Payments', value: String(counts.payments), detail: 'Financial state available for controlled actions.' },
        { label: 'Approvals', value: String(counts.approvals), detail: 'Pending sensitive actions waiting for decision.' },
      ],
      quickActions: buildQuickActions(req),
      contextPanel: buildWorkspacePanel(workspace, permissionMatrix, counts),
      localAgents: agents.slice(0, 8).map((agent: any) => ({
        slug: agent.slug,
        name: agent.name || titleCase(agent.slug),
        runtime: agent.runtime || 'system',
        mode: agent.mode || agent.version_status || 'available',
      })),
    });
  } catch (error) {
    console.error('Super Agent bootstrap error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/command', async (req: MultiTenantRequest, res) => {
  try {
    const scope = getScope(req);
    const input = String(req.body?.input || '').trim();
    const runId = String(req.body?.runId || crypto.randomUUID());
    const mode = String(req.body?.mode || 'investigate') === 'operate' ? 'operate' : 'investigate';
    const commandContext = (req.body?.context || {}) as CommandContext;
    const sessionId = commandContext.sessionId || runId;
    const agents = hasPermission(req, 'agents.read') ? await agentRepository.listAgents(scope) : [];
    planEngine.ensureSession(sessionId, req.userId || 'system', scope.tenantId, scope.workspaceId || null);
    const sessionMemory = planEngine.getCommandContext(sessionId);
    const enrichedCommandContext: CommandContext = {
      ...commandContext,
      recentTargets: [
        ...(commandContext.recentTargets || []),
        ...(sessionMemory.recentTargets || []),
      ].slice(0, 5),
      activeTarget: commandContext.activeTarget || sessionMemory.activeTarget || null,
    };

    if (!input) {
      res.status(400).json({ error: 'input is required' });
      return;
    }

    emitSuperAgentEvent(scope, 'run_started', { runId, input });
    emitSuperAgentEvent(scope, 'step_started', {
      runId,
      step: { id: 'parse', label: 'Normalizing command intent', status: 'running' },
    });

    const useLlmFirst = process.env.SUPER_AGENT_LEGACY_ROUTING !== 'true';
    if (useLlmFirst) {
      try {
        const { response: llmResponse, trace } = await planEngine.planAndExecute(
          {
            userMessage: input,
            sessionId,
            userId: req.userId || 'system',
            tenantId: scope.tenantId,
            workspaceId: scope.workspaceId || null,
            hasPermission: (perm: string) => hasPermission(req, perm),
          },
          { dryRun: mode !== 'operate' },
        );

        const finalResponse = buildResponseFromPlanOutcome(input, runId, llmResponse, trace);

        if (finalResponse.navigationTarget) {
          planEngine.rememberTarget(sessionId, finalResponse.navigationTarget);
        }

        emitSuperAgentEvent(scope, 'step_completed', {
          runId,
          step: {
            id: 'parse',
            label: 'Normalizing command intent',
            status: 'completed',
            detail: llmResponse.kind,
          },
        });

        emitSuperAgentEvent(scope, 'step_started', {
          runId,
          step: {
            id: 'modules',
            label: `Consulting ${Array.isArray(finalResponse.consultedModules) && finalResponse.consultedModules.length ? finalResponse.consultedModules.join(', ') : 'workspace data'}`,
            status: 'running',
          },
        });

        if (Array.isArray(finalResponse.agents)) {
          finalResponse.agents.forEach((agent: AgentActivity) => {
            emitSuperAgentEvent(scope, 'agent_called', {
              runId,
              agent: {
                slug: agent.slug,
                name: agent.name,
                runtime: agent.runtime || null,
                mode: agent.mode || null,
                status: agent.status,
              },
            });
            emitSuperAgentEvent(scope, 'agent_result', {
              runId,
              agent: {
                slug: agent.slug,
                name: agent.name,
                status: agent.status,
                summary: agent.summary,
              },
            });
          });
        }

        if (Array.isArray(finalResponse.actions) && finalResponse.actions.length > 0) {
          emitSuperAgentEvent(scope, 'action_proposed', {
            runId,
            actions: finalResponse.actions.map((action: UiAction) => ({
              id: action.id,
              label: action.label,
              type: action.type,
              sensitive: action.sensitive === true,
              requiresConfirmation: action.requiresConfirmation === true,
            })),
          });
        }

        const chunks = splitIntoChunks([
          finalResponse.summary,
          ...(Array.isArray(finalResponse.facts) ? finalResponse.facts.slice(0, 3) : []),
          ...(Array.isArray(finalResponse.conflicts) ? finalResponse.conflicts.slice(0, 2) : []),
        ].filter(Boolean).join(' '));

        chunks.forEach((chunk, index) => {
          emitSuperAgentEvent(scope, 'message_chunk', {
            runId,
            chunk,
            index,
          });
        });

        emitSuperAgentEvent(scope, 'run_finished', {
          runId,
          summary: finalResponse.summary,
          statusLine: finalResponse.statusLine,
          navigationTarget: finalResponse.navigationTarget,
        });

        await auditRepository.log({
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          actorId: req.userId || 'system',
          action: 'SUPER_AGENT_COMMAND',
          entityType: finalResponse.navigationTarget?.entityType || 'workspace',
          entityId: finalResponse.navigationTarget?.entityId || scope.workspaceId,
          metadata: {
            source: 'super-agent',
            input,
            runId,
            sessionId,
            llmRouting: true,
            consultedModules: finalResponse.consultedModules || [],
            navigationTarget: finalResponse.navigationTarget || null,
          },
        });

        return res.json({
          ok: true,
          sessionId,
          permissionMatrix: buildPermissionMatrix(req),
          response: finalResponse,
        });
      } catch (llmError) {
        logger.warn('LLM-first command path failed, falling back to legacy routing', {
          runId,
          error: llmError instanceof Error ? llmError.message : String(llmError),
        });
      }
    }

    const command = parseCommandIntent(input, enrichedCommandContext);

    emitSuperAgentEvent(scope, 'step_completed', {
      runId,
      step: { id: 'parse', label: 'Normalizing command intent', status: 'completed', detail: command.kind },
    });
    emitSuperAgentEvent(scope, 'step_started', {
      runId,
      step: {
        id: 'modules',
        label: `Consulting ${command.kind === 'search' ? 'connected modules' : `${command.kind} context`}`,
        status: 'running',
      },
    });

    const response =
      command.kind === 'case' ? await handleCaseIntent(req, scope, input, command.id || command.targetEntityRef || input, agents)
      : command.kind === 'order' ? await handleOrderIntent(req, scope, input, command.id || command.targetEntityRef || input, agents)
      : command.kind === 'payment' ? await handlePaymentIntent(req, scope, input, command.id || command.targetEntityRef || input, agents)
      : command.kind === 'return' ? await handleReturnIntent(req, scope, input, command.id || command.targetEntityRef || input, agents)
      : command.kind === 'customer' ? await handleCustomerIntent(req, scope, input, command.query || command.targetEntityRef || input, agents)
      : command.kind === 'approval_queue' ? await handleApprovalQueueIntent(req, scope, input, agents)
      : command.kind === 'payment_queue' ? await handlePaymentQueueIntent(req, scope, input, agents)
      : command.kind === 'conflicts' ? await handleConflictIntent(req, scope, input, agents)
      : command.kind === 'workflow' ? await handleWorkflowIntent(req, scope, input, agents)
      : command.kind === 'agents' ? await handleAgentIntent(input, agents)
      : await handleSearchIntent(req, scope, input, command.query || input, agents);

    emitSuperAgentEvent(scope, 'step_completed', {
      runId,
      step: {
        id: 'modules',
        label: `Consulting ${command.kind === 'search' ? 'connected modules' : `${command.kind} context`}`,
        status: 'completed',
        detail: Array.isArray(response?.consultedModules) ? response.consultedModules.join(', ') : null,
      },
    });

    if (Array.isArray(response?.agents)) {
      response.agents.forEach((agent: AgentActivity) => {
        emitSuperAgentEvent(scope, 'agent_called', {
          runId,
          agent: {
            slug: agent.slug,
            name: agent.name,
            runtime: agent.runtime || null,
            mode: agent.mode || null,
            status: agent.status,
          },
        });
        emitSuperAgentEvent(scope, 'agent_result', {
          runId,
          agent: {
            slug: agent.slug,
            name: agent.name,
            status: agent.status,
            summary: agent.summary,
          },
        });
      });
    }

    if (Array.isArray(response?.actions) && response.actions.length > 0) {
      emitSuperAgentEvent(scope, 'action_proposed', {
        runId,
        actions: response.actions.map((action: UiAction) => ({
          id: action.id,
          label: action.label,
          type: action.type,
          sensitive: action.sensitive === true,
          requiresConfirmation: action.requiresConfirmation === true,
        })),
      });
    }

    const finalResponse = {
      ...response,
      runId,
      structuredIntent: response?.structuredIntent || command,
      navigationTarget: response?.navigationTarget || command.navigationTarget || inferPrimaryNavigationTarget(response),
      facts: deriveFacts(response),
      conflicts: deriveConflicts(response),
      sources: Array.isArray(response?.sources) && response.sources.length ? response.sources : (response?.consultedModules || []),
      evidence: deriveEvidence(response),
      steps: Array.isArray(response?.steps) && response.steps.length ? response.steps : [
        { id: 'parse', label: 'Normalizing command intent', status: 'completed' },
        {
          id: 'modules',
          label: `Consulted ${Array.isArray(response?.consultedModules) && response.consultedModules.length ? response.consultedModules.join(', ') : 'workspace data'}`,
          status: 'completed',
        },
      ],
    };

    if (finalResponse.navigationTarget) {
      planEngine.rememberTarget(sessionId, finalResponse.navigationTarget);
    }

    const chunks = splitIntoChunks([
      finalResponse.summary,
      ...(Array.isArray(finalResponse.facts) ? finalResponse.facts.slice(0, 3) : []),
      ...(Array.isArray(finalResponse.conflicts) ? finalResponse.conflicts.slice(0, 2) : []),
    ].filter(Boolean).join(' '));

    chunks.forEach((chunk, index) => {
      emitSuperAgentEvent(scope, 'message_chunk', {
        runId,
        chunk,
        index,
      });
    });

    emitSuperAgentEvent(scope, 'run_finished', {
      runId,
      summary: finalResponse.summary,
      statusLine: finalResponse.statusLine,
      navigationTarget: finalResponse.navigationTarget,
    });

    await auditRepository.log({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      actorId: req.userId || 'system',
      action: 'SUPER_AGENT_COMMAND',
      entityType: finalResponse.navigationTarget?.entityType || 'workspace',
      entityId: finalResponse.navigationTarget?.entityId || scope.workspaceId,
      metadata: {
        source: 'super-agent',
        input,
        runId,
        command,
        consultedModules: finalResponse.consultedModules || [],
        agents: Array.isArray(finalResponse.agents) ? finalResponse.agents.map((agent: AgentActivity) => agent.slug) : [],
        navigationTarget: finalResponse.navigationTarget || null,
        actions: Array.isArray(finalResponse.actions)
          ? finalResponse.actions.map((action: UiAction) => ({
              type: action.type,
              label: action.label,
              allowed: action.allowed !== false,
            }))
          : [],
      },
    });

    // ── Shadow mode: fire LLM path async (non-blocking) ─────────────────────
    // When SUPER_AGENT_LLM_ROUTING=true the /plan endpoint is the primary
    // path. Here we silently mirror traffic to measure LLM accuracy vs. regex.
    const llmEnabled = process.env.SUPER_AGENT_LLM_ROUTING === 'true';
    if (llmEnabled && input) {
      const { response: llmResponse, trace } = await planEngine.planAndExecute(
        {
          userMessage: input,
          sessionId,
          userId: req.userId || 'system',
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId || null,
          hasPermission: (perm: string) => hasPermission(req, perm),
        },
        { dryRun: mode === 'investigate' },
      );

      const finalResponse = buildResponseFromPlanOutcome(input, runId, llmResponse, trace);

      if (finalResponse.navigationTarget) {
        planEngine.rememberTarget(sessionId, finalResponse.navigationTarget);
      }

      await auditRepository.log({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        actorId: req.userId || 'system',
        action: 'SUPER_AGENT_COMMAND',
        entityType: finalResponse.navigationTarget?.entityType || 'workspace',
        entityId: finalResponse.navigationTarget?.entityId || scope.workspaceId,
        metadata: {
          source: 'super-agent',
          input,
          runId,
          sessionId,
          llmRouting: true,
          consultedModules: finalResponse.consultedModules || [],
          navigationTarget: finalResponse.navigationTarget || null,
        },
      });

      return res.json({
        ok: true,
        sessionId,
        permissionMatrix: buildPermissionMatrix(req),
        response: finalResponse,
      });
    }

    if (!llmEnabled && input) {
      const shadowSessionId = commandContext.sessionId || `shadow-${req.userId || 'anon'}-${scope.workspaceId}`;
      void planEngine
        .generate({
          userMessage: input,
          sessionId: shadowSessionId,
          userId: req.userId || 'system',
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId || null,
          hasPermission: (perm: string) => hasPermission(req, perm),
        })
        .then((llmResp) => {
          const diverged = llmResp.kind !== 'plan'
            || llmResp.plan.steps.length === 0
            || finalResponse.consultedModules?.length === 0;
          logger.debug('Shadow mode LLM response', {
            runId,
            kind: llmResp.kind,
            regexKind: command.kind,
            diverged,
            steps: llmResp.kind === 'plan' ? llmResp.plan.steps.map((s) => s.tool) : [],
          });
        })
        .catch((err) => {
          logger.debug('Shadow mode LLM error', { runId, error: String(err) });
        });
    }

    res.json({
      ok: true,
      sessionId,
      permissionMatrix: buildPermissionMatrix(req),
      response: finalResponse,
    });
  } catch (error) {
    console.error('Super Agent command error:', error);
    try {
      emitSuperAgentEvent(getScope(req), 'run_failed', {
        runId: String(req.body?.runId || ''),
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    } catch {
      // noop
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/execute', async (req: MultiTenantRequest, res) => {
  try {
    const scope = getScope(req);
    const payload = req.body?.payload as SuperAgentActionPayload | undefined;
    const confirmed = req.body?.confirmed === true;
    const runId = String(req.body?.runId || crypto.randomUUID());

    if (!payload || !payload.kind || !payload.entityId) {
      res.status(400).json({ error: 'payload.kind and payload.entityId are required' });
      return;
    }

    if (!confirmed) {
      res.status(400).json({ error: 'Sensitive actions require confirmed=true' });
      return;
    }

    emitSuperAgentEvent(scope, 'action_executing', {
      runId,
      action: {
        kind: payload.kind,
        entityType: payload.entityType,
        entityId: payload.entityId,
      },
    });

    const result = await executeAction(req, scope, payload);
    if (!result.ok) {
      emitSuperAgentEvent(scope, result.approvalRequired ? 'action_completed' : 'run_failed', {
        runId,
        action: {
          kind: payload.kind,
          entityType: payload.entityType,
          entityId: payload.entityId,
        },
        approvalRequired: result.approvalRequired === true,
        approvalId: result.approval?.id || null,
        error: result.error || null,
      });
      res.status(result.approvalRequired ? 202 : 403).json(result);
      return;
    }

    emitSuperAgentEvent(scope, 'action_completed', {
      runId,
      action: {
        kind: payload.kind,
        entityType: payload.entityType,
        entityId: payload.entityId,
      },
      result: result.result || null,
    });

    res.json(result);
  } catch (error) {
    console.error('Super Agent execute error:', error);
    try {
      emitSuperAgentEvent(getScope(req), 'run_failed', {
        runId: String(req.body?.runId || ''),
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    } catch {
      // noop
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Plan Engine endpoints ────────────────────────────────────────────────────
//
// These are the NEW LLM-driven routes. They run in parallel to the existing
// regex-based routes. Feature flag SUPER_AGENT_LLM_ROUTING=true enables them.
//
// POST /api/super-agent/plan
//   Body: { userMessage, sessionId?, dryRun? }
//   Returns: { response: LLMResponse, trace?: ExecutionTrace }
//
// GET /api/super-agent/catalog
//   Returns the tool catalog visible to the caller.

import { planEngine } from '../agents/planEngine/index.js';

router.post('/plan', async (req: MultiTenantRequest, res) => {
  try {
    const scope = getScope(req);
    const { userMessage, sessionId, dryRun } = req.body as {
      userMessage?: string;
      sessionId?: string;
      dryRun?: boolean;
    };

    if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
      return res.status(400).json({ error: 'userMessage is required' });
    }

    const effectiveSessionId = sessionId || `${req.userId || 'anon'}-${Date.now()}`;

    const { response, trace } = await planEngine.planAndExecute(
      {
        userMessage: userMessage.trim(),
        sessionId: effectiveSessionId,
        userId: req.userId || 'system',
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId || null,
        hasPermission: (perm: string) => hasPermission(req, perm),
      },
      { dryRun: dryRun === true },
    );

    const plannedResponse = buildResponseFromPlanOutcome(userMessage.trim(), effectiveSessionId, response, trace);
    if (plannedResponse.navigationTarget) {
      planEngine.rememberTarget(effectiveSessionId, plannedResponse.navigationTarget);
    }

    return res.json({ response, trace: trace ?? null, sessionId: effectiveSessionId });
  } catch (error) {
    console.error('Plan Engine error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

router.get('/catalog', (req: MultiTenantRequest, res) => {
  try {
    const catalog = planEngine.catalog.listForCaller(
      (perm) => hasPermission(req, perm),
    );
    return res.json({ tools: catalog, count: catalog.length });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to list tool catalog' });
  }
});

router.get('/sessions/:sessionId', (req: MultiTenantRequest, res) => {
  try {
    if (!canInspectSuperAgent(req)) {
      return res.status(403).json({ error: 'Missing permission to inspect Super Agent sessions' });
    }
    const session = planEngine.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    return res.json({ session });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load Super Agent session' });
  }
});

router.get('/sessions/:sessionId/traces', (req: MultiTenantRequest, res) => {
  try {
    if (!canInspectSuperAgent(req)) {
      return res.status(403).json({ error: 'Missing permission to inspect Super Agent traces' });
    }
    const traces = planEngine.listTraces(req.params.sessionId, Number(req.query.limit ?? 20) || 20);
    return res.json({ sessionId: req.params.sessionId, traces, count: traces.length });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load Super Agent traces' });
  }
});

router.get('/traces/:planId', (req: MultiTenantRequest, res) => {
  try {
    if (!canInspectSuperAgent(req)) {
      return res.status(403).json({ error: 'Missing permission to inspect Super Agent traces' });
    }
    const trace = planEngine.getTrace(req.params.planId);
    if (!trace) {
      return res.status(404).json({ error: 'Trace not found' });
    }
    return res.json({ trace });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load Super Agent trace' });
  }
});

router.get('/replay/:sessionId', (req: MultiTenantRequest, res) => {
  try {
    if (!canInspectSuperAgent(req)) {
      return res.status(403).json({ error: 'Missing permission to inspect Super Agent replay' });
    }
    const session = planEngine.getSession(req.params.sessionId);
    const traces = planEngine.listTraces(req.params.sessionId, Number(req.query.limit ?? 20) || 20);
    if (!session && traces.length === 0) {
      return res.status(404).json({ error: 'Replay not found' });
    }
    return res.json({
      session,
      traces,
      timeline: traces.map((trace) => ({
        planId: trace.planId,
        status: trace.status,
        summary: trace.summary,
        startedAt: trace.startedAt,
        endedAt: trace.endedAt,
        approvalIds: trace.approvalIds || [],
        consultedModules: Array.from(new Set((trace.spans || []).map((span) => String(span.tool || '').split('.')[0]))).filter(Boolean),
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load Super Agent replay' });
  }
});

router.get('/metrics', (req: MultiTenantRequest, res) => {
  try {
    if (!canInspectSuperAgent(req)) {
      return res.status(403).json({ error: 'Missing permission to inspect Super Agent metrics' });
    }
    const sessionId = req.query.sessionId ? String(req.query.sessionId) : undefined;
    return res.json({ metrics: planEngine.getMetrics(sessionId), sessionId: sessionId || null });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load Super Agent metrics' });
  }
});

export default router;
