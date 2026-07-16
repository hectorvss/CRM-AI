/**
 * server/agents/planEngine/tools/analysis.ts
 *
 * Root-cause analysis tools for the Super Agent.
 *
 * These tools do not invent answers. They assemble the canonical state that
 * already exists in the SaaS so the LLM can explain the real cause using the
 * same evidence the operator can inspect.
 */

import { buildCaseState, createCaseRepository, createCustomerRepository } from '../../../data/index.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

const caseRepo = createCaseRepository();
const customerRepo = createCustomerRepository();

type RootCauseArgs = {
  caseId?: string;
  customerId?: string;
  query?: string;
};

function scope(context: { tenantId: string; workspaceId: string | null }) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId ?? '',
  };
}

function titleCase(value?: string | null) {
  if (!value) return 'N/A';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function pickSignals(state: any) {
  const signals: string[] = [];
  const systems = Object.values(state?.systems || {}) as any[];
  for (const system of systems) {
    if (!system) continue;
    if (['warning', 'critical', 'blocked'].includes(String(system.status))) {
      signals.push(`${titleCase(system.label || system.key)} is ${system.status}: ${system.summary || system.context || 'attention required'}`);
    }
  }
  const conflict = state?.conflict;
  if (conflict?.summary) signals.push(conflict.summary);
  if (conflict?.root_cause) signals.push(`Canonical conflict root cause: ${conflict.root_cause}`);
  if (state?.case?.ai_diagnosis) signals.push(`Existing AI diagnosis: ${state.case.ai_diagnosis}`);
  if (state?.case?.ai_root_cause) signals.push(`Existing AI root cause: ${state.case.ai_root_cause}`);
  if (state?.case?.risk_level) signals.push(`Case risk level: ${state.case.risk_level}`);
  if (state?.case?.approval_state) signals.push(`Approval state: ${state.case.approval_state}`);
  return Array.from(new Set(signals)).slice(0, 12);
}

function summarizeRecommendations(state: any) {
  if (state?.case?.ai_recommended_action) return state.case.ai_recommended_action;
  if (state?.conflict?.recommended_action) return state.conflict.recommended_action;
  if (state?.conflict?.root_cause) return `Resolve the mismatch that caused: ${state.conflict.root_cause}`;
  return 'Review the case in context and reconcile the related entities before taking action.';
}

function summarizeRootCause(state: any, query?: string | null) {
  const conflictRootCause = state?.conflict?.root_cause || null;
  const aiRootCause = state?.case?.ai_root_cause || null;
  const summary = state?.conflict?.summary || state?.case?.ai_diagnosis || null;
  const rootCause =
    conflictRootCause
    || aiRootCause
    || summary
    || (query ? `No explicit root cause stored yet for "${query}".` : 'No explicit root cause stored yet.');
  return rootCause;
}

export const rootCauseAnalyzeTool: ToolSpec<RootCauseArgs, unknown> = {
  name: 'analysis.root_cause',
  version: '1.0.0',
  description:
    'Inspect the canonical case/customer state and surface the most likely root cause, contributing signals, risk, and recommended next action. ' +
    'Use this when the user asks "why" or when the Super Agent needs to explain the real operational cause behind a problem.',
  category: 'resolution',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    caseId: s.string({ required: false, description: 'Case UUID to analyze' }),
    customerId: s.string({ required: false, description: 'Customer UUID to analyze' }),
    query: s.string({ required: false, description: 'Optional natural-language query to preserve operator intent' }),
  }),
  returns: s.any('Structured root-cause analysis'),
  async run({ args, context }) {
    const scopeValue = scope(context);

    if (!args.caseId && !args.customerId) {
      return {
        ok: false,
        error: 'Provide caseId or customerId',
        errorCode: 'INVALID_ARGS',
      };
    }

    let state: any = null;
    let customer: any = null;

    if (args.caseId) {
      const bundle = await caseRepo.getBundle(scopeValue, args.caseId);
      if (!bundle) {
        return { ok: false, error: 'Case not found', errorCode: 'NOT_FOUND' };
      }
      state = buildCaseState(bundle);
      customer = bundle.customer || null;
    } else if (args.customerId) {
      customer = await customerRepo.getDetail(scopeValue, args.customerId);
      if (!customer) {
        return { ok: false, error: 'Customer not found', errorCode: 'NOT_FOUND' };
      }
      const caseId = Array.isArray(customer.cases) && customer.cases.length > 0
        ? [...customer.cases].sort((a: any, b: any) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())[0]?.id
        : null;
      if (caseId) {
        const bundle = await caseRepo.getBundle(scopeValue, caseId);
        if (bundle) state = buildCaseState(bundle);
      }
      if (!state) {
        state = {
          case: {
            id: null,
            ai_diagnosis: null,
            ai_root_cause: null,
            ai_recommended_action: null,
            risk_level: customer?.risk_level || 'unknown',
            approval_state: customer?.approval_state || null,
          },
          conflict: null,
          systems: {},
        };
      }
    }

    const signals = pickSignals(state);
    const rootCause = summarizeRootCause(state, args.query);
    const diagnosis = state?.case?.ai_diagnosis || state?.conflict?.summary || customer?.summary || rootCause;
    const recommendedAction = summarizeRecommendations(state);
    const confidence =
      typeof state?.case?.ai_confidence === 'number'
        ? state.case.ai_confidence
        : state?.conflict?.confidence ?? (signals.length > 3 ? 0.74 : 0.6);

    const timeline = Array.isArray(state?.timeline) ? state.timeline.slice(-8) : [];
    const relatedCases = Array.isArray(customer?.cases)
      ? customer.cases.slice(0, 5).map((item: any) => ({
          id: item.id,
          case_number: item.case_number,
          status: item.status,
          priority: item.priority,
          ai_root_cause: item.ai_root_cause || null,
        }))
      : [];

    return {
      ok: true,
      value: {
        caseId: args.caseId || null,
        customerId: args.customerId || null,
        query: args.query || null,
        diagnosis,
        rootCause,
        recommendedAction,
        confidence,
        signals,
        timeline,
        relatedCases,
        customerSummary: customer
          ? {
              id: customer.id,
              name: customer.display_name || customer.name || customer.canonical_name || 'Customer',
              segment: customer.segment || null,
              riskLevel: customer.risk_level || null,
              openCases: customer.open_cases ?? null,
              totalCases: customer.total_cases ?? null,
            }
          : null,
        summary: rootCause,
      },
    };
  },
};

export const interoperabilityCheckTool: ToolSpec<{ entityType: string; entityId: string }, unknown> = {
  name: 'analysis.interoperability_check',
  version: '2.0.0',
  description: 'Check the canonical multi-system state of a case for REAL inconsistencies between modules (payments, orders, fulfillment, CRM). Reports the actual systems flagged warning/critical/blocked and the stored conflict — it does not fabricate mismatches and does not call external Stripe/Shopify APIs directly. Pass the related case UUID (or a customer UUID to use their latest case).',
  category: 'resolution',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    entityType: s.string({ description: 'Type of entity to check: order, payment, customer' }),
    entityId: s.string({ description: 'UUID or external ID of the entity' }),
  }),
  returns: s.any('Interoperability report derived from the canonical case state'),
  async run({ args, context }) {
    const scopeValue = scope(context);
    if (!args.entityId) {
      return { ok: false, error: 'Provide entityId (a case UUID; for a customer, its id)', errorCode: 'INVALID_ARGS' };
    }

    // The only cross-system state we actually have is the canonical case bundle,
    // which buildCaseState assembles from real records. Resolve the entity to it.
    let state: any = null;
    if (args.entityType === 'customer') {
      const customer = await customerRepo.getDetail(scopeValue, args.entityId);
      const caseId = customer && Array.isArray(customer.cases) && customer.cases.length > 0
        ? [...customer.cases].sort((a: any, b: any) =>
            new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())[0]?.id
        : null;
      if (caseId) {
        const bundle = await caseRepo.getBundle(scopeValue, caseId);
        if (bundle) state = buildCaseState(bundle);
      }
    } else {
      // order / payment / case share the case bundle view; treat entityId as the case UUID.
      const bundle = await caseRepo.getBundle(scopeValue, args.entityId);
      if (bundle) state = buildCaseState(bundle);
    }

    if (!state) {
      return {
        ok: true,
        value: {
          entityType: args.entityType,
          entityId: args.entityId,
          status: 'unknown',
          mismatches: [],
          note: 'No canonical case state found for this entity. Cross-system reconciliation is only available through a case — pass the related case UUID.',
          timestamp: new Date().toISOString(),
        },
      };
    }

    // REAL mismatches: systems flagged non-OK in the canonical state, plus the stored conflict.
    const mismatches: string[] = [];
    for (const system of Object.values(state.systems || {}) as any[]) {
      if (system && ['warning', 'critical', 'blocked'].includes(String(system.status))) {
        mismatches.push(`${titleCase(system.label || system.key)} is ${system.status}${system.summary ? `: ${system.summary}` : ''}`);
      }
    }
    if (state.conflict?.summary) mismatches.push(state.conflict.summary);
    if (state.conflict?.root_cause) mismatches.push(`Root cause: ${state.conflict.root_cause}`);
    const unique = Array.from(new Set(mismatches));
    const status = unique.length > 0 ? 'mismatch_detected' : 'synced';

    return {
      ok: true,
      value: {
        entityType: args.entityType,
        entityId: args.entityId,
        status,
        mismatches: unique,
        recommendation: status === 'mismatch_detected'
          ? (state.conflict?.recommended_action || 'Reconcile the flagged systems before acting on this entity.')
          : 'No cross-system mismatch detected in the canonical state.',
        timestamp: new Date().toISOString(),
      },
    };
  },
};

