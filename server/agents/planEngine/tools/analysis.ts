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
