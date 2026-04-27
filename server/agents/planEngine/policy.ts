/**
 * server/agents/planEngine/policy.ts
 *
 * Policy engine + risk classifier. Evaluates a Plan against declarative rules
 * BEFORE execution. Returns per-step decisions (`allow`, `require_approval`,
 * `deny`). Writes and externals are never allowed unless a rule explicitly
 * permits them.
 *
 * Rules are pure functions of (tool, args, context). This keeps policy
 * testable and auditable. The rule DSL can be promoted to YAML later — the
 * engine signature stays the same.
 */

import type {
  Plan,
  PlanStep,
  PolicyAction,
  PolicyDecision,
  RiskLevel,
  ToolExecutionContext,
  ToolSpec,
} from './types.js';
import type { toolRegistry as ToolRegistry } from './registry.js';
import { createPolicyRepository } from '../../data/index.js';
import { logger } from '../../utils/logger.js';
import { classifyRiskFromPlanSignal, isToolBlocked } from './safety.js';

// ── Rule contract ────────────────────────────────────────────────────────────

export interface PolicyRule {
  /** Stable id for audit ("refund.high_amount"). */
  id: string;
  description: string;
  /** Higher priority rules fire first. First `deny` wins; first `require_approval` wins over `allow`. */
  priority: number;
  /** Returns a decision or null to abstain. */
  evaluate(input: {
    step: PlanStep;
    tool: ToolSpec;
    args: unknown;
    context: Pick<ToolExecutionContext, 'tenantId' | 'workspaceId' | 'userId' | 'hasPermission'>;
  }): { action: PolicyAction; reason: string; riskElevation?: RiskLevel } | null;
}

// ── Baseline rules ───────────────────────────────────────────────────────────
//
// These are the opinionated defaults. More specific rules can be added via
// `registerPolicyRule()` at startup.

const baselineRules: PolicyRule[] = [
  // 0. Kill-switch / tool blocklist
  {
    id: 'tool_kill_switch',
    description: 'Block tools disabled by environment kill-switch',
    priority: 1100,
    evaluate({ tool }) {
      if (tool && isToolBlocked(tool.name)) {
        return {
          action: 'deny',
          reason: `Tool ${tool.name} is disabled by Super Agent kill-switch`,
        };
      }
      return null;
    },
  },

  // 1. Deny unknown tools (defence in depth — registry should have caught this)
  {
    id: 'unknown_tool',
    description: 'Reject steps whose tool is not registered',
    priority: 1000,
    evaluate({ tool }) {
      if (!tool) return { action: 'deny', reason: 'Tool not found in registry' };
      return null;
    },
  },

  // 2. Permission enforcement
  {
    id: 'missing_permission',
    description: 'Deny steps whose required permission the caller lacks',
    priority: 900,
    evaluate({ tool, context }) {
      if (tool.requiredPermission && !context.hasPermission(tool.requiredPermission)) {
        return {
          action: 'deny',
          reason: `Missing permission: ${tool.requiredPermission}`,
        };
      }
      return null;
    },
  },

  // 3. Critical-risk writes always require approval
  {
    id: 'critical_risk_requires_approval',
    description: 'Any tool classified as critical risk routes to human approval',
    priority: 800,
    evaluate({ tool }) {
      if (tool.risk === 'critical') {
        return {
          action: 'require_approval',
          reason: 'Critical-risk tool requires human approval',
        };
      }
      return null;
    },
  },

  // 4. Refund amount threshold
  {
    id: 'refund_amount_threshold',
    description: 'Refunds over 50 units require approval',
    priority: 700,
    evaluate({ tool, args }) {
      if (tool.name !== 'payment.refund') return null;
      const amount = Number((args as any)?.amount ?? 0);
      if (amount > 50) {
        return {
          action: 'require_approval',
          reason: `Refund amount ${amount} exceeds auto-approve threshold (50)`,
          riskElevation: 'high',
        };
      }
      return null;
    },
  },

  // 5. Order cancel after fulfilment requires approval
  {
    id: 'order_cancel_post_fulfillment',
    description: 'Cancelling packed/shipped/delivered orders requires approval',
    priority: 700,
    evaluate({ tool, args }) {
      if (tool.name !== 'order.cancel') return null;
      const status = String((args as any)?.currentStatus ?? '').toLowerCase();
      if (status.includes('packed') || status.includes('shipped') || status.includes('delivered')) {
        return {
          action: 'require_approval',
          reason: `Cancelling fulfilled order (${status}) requires approval`,
          riskElevation: 'high',
        };
      }
      return null;
    },
  },

  // 6. External side-effect tools: medium risk requires approval, low risk is elevated to medium
  {
    id: 'external_elevates_risk',
    description: 'External-side-effect tools with low risk are elevated to medium; medium risk requires approval',
    priority: 500,
    evaluate({ tool }) {
      if (tool.sideEffect !== 'external') return null;
      if (tool.risk === 'medium') {
        return {
          action: 'require_approval',
          reason: 'External call with medium risk requires approval',
          riskElevation: 'medium',
        };
      }
      if (tool.risk === 'low') {
        return {
          action: 'allow',
          reason: 'External call allowed but risk elevated to medium',
          riskElevation: 'medium',
        };
      }
      return null;
    },
  },

  // 7. Workflow publication is a structural change and should be reviewed
  {
    id: 'workflow_publish_requires_approval',
    description: 'Publishing workflows requires approval to avoid structural regressions',
    priority: 450,
    evaluate({ tool }) {
      if (tool.name === 'workflow.publish') {
        return {
          action: 'require_approval',
          reason: 'Publishing workflows requires explicit approval',
          riskElevation: 'high',
        };
      }
      return null;
    },
  },

  // 8. Settings mutations are always sensitive
  {
    id: 'settings_write_requires_approval',
    description: 'Settings writes require approval',
    priority: 440,
    evaluate({ tool }) {
      if (tool.name.startsWith('settings.') && tool.sideEffect === 'write') {
        return {
          action: 'require_approval',
          reason: 'Settings changes require approval',
          riskElevation: 'high',
        };
      }
      return null;
    },
  },

  // 8b. Knowledge writes are not part of the public agent surface yet
  {
    id: 'knowledge_write_requires_approval',
    description: 'Knowledge writes require approval',
    priority: 435,
    evaluate({ tool }) {
      if (tool.name.startsWith('knowledge.') && tool.sideEffect === 'write') {
        return {
          action: 'require_approval',
          reason: 'Knowledge writes require approval',
          riskElevation: 'high',
        };
      }
      return null;
    },
  },

  // 8c. Integration writes can affect inbound/outbound data contracts
  {
    id: 'integration_write_requires_approval',
    description: 'Integration writes require approval',
    priority: 432,
    evaluate({ tool }) {
      if (tool.name.startsWith('integration.') && tool.sideEffect === 'write') {
        return {
          action: 'require_approval',
          reason: 'Integration writes can change operational data contracts',
          riskElevation: 'high',
        };
      }
      return null;
    },
  },

  // 9. Bulk operations should not execute blindly
  {
    id: 'bulk_operation_requires_approval',
    description: 'Large bulk operations route to approval',
    priority: 430,
    evaluate({ args, tool }) {
      const raw = JSON.stringify(args ?? {});
      if (tool.sideEffect !== 'write') return null;
      if (/"bulk"\s*:\s*true/.test(raw) || /"items"\s*:\s*\[\s*.*,.+/.test(raw) || /"ids"\s*:\s*\[\s*.*,.+/.test(raw)) {
        return {
          action: 'require_approval',
          reason: 'Bulk operations require approval',
          riskElevation: 'high',
        };
      }
      return null;
    },
  },

  // 10b. Approval decisions are high signal actions that should be tracked as elevated risk
  {
    id: 'approval_decide_requires_approval',
    description: 'Approval decisions are sensitive and should remain elevated for traceability',
    priority: 420,
    evaluate({ tool }) {
      if (tool.name === 'approval.decide') {
        return {
          action: 'allow',
          reason: 'Approval decisions are allowed for authorized users but remain high risk',
          riskElevation: 'high',
        };
      }
      return null;
    },
  },

  // 10c. Return moderation actions are medium risk by default
  {
    id: 'return_moderation_medium_risk',
    description: 'Return moderation actions are treated as medium risk',
    priority: 410,
    evaluate({ tool }) {
      if (tool.name === 'return.approve' || tool.name === 'return.reject') {
        return {
          action: 'allow',
          reason: 'Return moderation allowed for authorized users',
          riskElevation: 'medium',
        };
      }
      return null;
    },
  },

  // 10d. Sensitive delegated agents should not bypass human gates
  {
    id: 'sensitive_agent_run_requires_approval',
    description: 'Delegated agents that touch finance, approvals, policy, or critical operations require approval',
    priority: 405,
    evaluate({ tool, args }) {
      if (tool.name !== 'agent.run') return null;
      const agentSlug = String((args as any)?.agentSlug ?? '').toLowerCase();
      if (/(refund|payment|finance|fraud|escalat|approval|policy|workflow|settings|integration|connector)/.test(agentSlug)) {
        return {
          action: 'require_approval',
          reason: `Sensitive delegated agent ${agentSlug || 'unknown'} requires approval`,
          riskElevation: 'high',
        };
      }
      return null;
    },
  },

  // 10. Default allow for reads
  {
    id: 'allow_reads',
    description: 'Read-only tools are auto-allowed',
    priority: 100,
    evaluate({ tool }) {
      if (tool.sideEffect === 'read') {
        return { action: 'allow', reason: 'Read-only tool', riskElevation: 'none' };
      }
      return null;
    },
  },

  // 11. Default allow for low/medium-risk writes (conservative fallback)
  {
    id: 'allow_low_medium_writes',
    description: 'Allow write operations with low/medium risk when no higher rule applies',
    priority: 50,
    evaluate({ tool }) {
      if (tool.name === 'approval.decide') {
        return {
          action: 'allow',
          reason: 'Authorized approval decisions are executed directly',
          riskElevation: 'high',
        };
      }
      if (tool.sideEffect === 'write' && (tool.risk === 'low' || tool.risk === 'medium')) {
        return { action: 'allow', reason: `${tool.risk}-risk write allowed by default` };
      }
      if (tool.sideEffect === 'write' && tool.risk === 'high') {
        return {
          action: 'require_approval',
          reason: 'High-risk write requires approval',
        };
      }
      return null;
    },
  },
];

// ── DB rule bridge ───────────────────────────────────────────────────────────
//
// Converts a policy_rules DB row (entity-level, condition-based) into a
// PolicyRule compatible with the Plan Engine's per-step evaluator.
//
// Mapping conventions:
//   DB entity_type "payment"  → tool names beginning with "payment."
//   DB action_mapping.action_types ["refund"] → tool action suffix "refund"
//   DB conditions              → evaluated against {...step.args, toolRisk, userId}
//   DB action_mapping.decision → "block" → deny | "approval_required" → require_approval

function getFieldValue(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((acc: any, k: string) => (acc && typeof acc === 'object' ? acc[k] : undefined), obj);
}

function evalCondition(operator: string, actual: any, expected: any): boolean {
  switch (operator) {
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'gt': return Number(actual) > Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    case 'in': return Array.isArray(expected) ? expected.includes(actual) : false;
    case 'contains':
      if (typeof actual === 'string' && typeof expected === 'string')
        return actual.toLowerCase().includes(expected.toLowerCase());
      return Array.isArray(actual) ? actual.includes(expected) : false;
    case 'exists': return actual !== undefined && actual !== null;
    default: return false;
  }
}

function asArr(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

function asObj(v: unknown): Record<string, any> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, any>;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; } catch { return {}; } }
  return {};
}

function dbRuleToPolicyRule(dbRule: any): PolicyRule {
  const actionMapping = asObj(dbRule.action_mapping);
  const conditions = asArr(dbRule.conditions);
  const allowedActions = asArr(actionMapping.action_types);
  const entityType = String(dbRule.entity_type ?? '').toLowerCase();

  // Derive numeric priority: DB rules sit between permission checks (900) and
  // the low-priority defaults (50-100), so use 600 as a band.
  // If the DB rule specifies a priority field use it, otherwise 600.
  const priority = typeof dbRule.priority === 'number' ? dbRule.priority : 600;

  return {
    id: `db:${dbRule.id}`,
    description: dbRule.name ?? 'DB policy rule',
    priority,
    evaluate({ tool, args, context }) {
      // 1. Entity type gating: only consider rules that match this tool's entity
      if (entityType) {
        const toolEntity = tool.name.split('.')[0].toLowerCase();
        if (toolEntity !== entityType) return null;
      }

      // 2. Action type gating
      if (allowedActions.length > 0) {
        const toolAction = tool.name.split('.').slice(1).join('.').toLowerCase();
        if (!allowedActions.some((a: string) => String(a).toLowerCase() === toolAction)) return null;
      }

      // 3. Condition evaluation — check against {args..., toolRisk, userId}
      const ctx: Record<string, any> = {
        ...(args && typeof args === 'object' ? (args as Record<string, any>) : {}),
        toolRisk: tool.risk,
        userId: context.userId,
      };
      const allMatch = conditions.every((c: any) => {
        if (!c?.field) return true;
        const actual = getFieldValue(ctx, String(c.field));
        return evalCondition(String(c.operator ?? 'eq'), actual, c.value);
      });
      if (!allMatch) return null;

      // 4. Map DB decision → PolicyAction
      const rawDecision = String(actionMapping.decision ?? 'allow').toLowerCase();
      const action: PolicyAction =
        rawDecision === 'block' ? 'deny'
        : rawDecision === 'approval_required' ? 'require_approval'
        : 'allow';

      return {
        action,
        reason: actionMapping.reason ?? `DB policy rule matched: ${dbRule.name}`,
      };
    },
  };
}

// ── Engine ───────────────────────────────────────────────────────────────────

const customRules: PolicyRule[] = [];

export function registerPolicyRule(rule: PolicyRule): void {
  customRules.push(rule);
}

/**
 * Evaluate a full plan against all rules. Returns one PolicyDecision per step.
 * Merges hardcoded baseline rules with active DB policy_rules for this tenant.
 * Does NOT mutate the plan.
 */
export async function evaluatePlan(
  plan: Plan,
  registry: typeof ToolRegistry,
  context: Pick<ToolExecutionContext, 'tenantId' | 'workspaceId' | 'userId' | 'hasPermission'>,
): Promise<PolicyDecision[]> {
  // Load tenant DB rules (non-fatal — fall back to baseline only if DB is unavailable)
  let dbRules: PolicyRule[] = [];
  try {
    const policyRepo = createPolicyRepository();
    const rows = await policyRepo.listRules(
      { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' },
      undefined,
      true, // isActive = true only
    );
    dbRules = rows.map(dbRuleToPolicyRule);
  } catch (err) {
    logger.warn('PlanEngine policy: failed to load DB rules, using baseline only', { error: String(err) });
  }

  const rules = [...baselineRules, ...dbRules, ...customRules].sort((a, b) => b.priority - a.priority);
  const decisions: PolicyDecision[] = [];

  for (const step of plan.steps) {
    const tool = registry.get(step.tool);
    let decision: PolicyDecision = {
      stepId: step.id,
      tool: step.tool,
      action: 'deny',
      riskLevel: tool?.risk ?? 'high',
      reason: 'No rule allowed this step',
    };

    for (const rule of rules) {
      const result = rule.evaluate({
        step,
        tool: tool as ToolSpec,
        args: step.args,
        context,
      });
      if (!result) continue;

      decision = {
        stepId: step.id,
        tool: step.tool,
        action: result.action,
        riskLevel: result.riskElevation
          ?? classifyRiskFromPlanSignal(step.tool, step.args)
          ?? tool?.risk
          ?? 'medium',
        reason: result.reason,
        ruleId: rule.id,
      };
      break;
    }

    decisions.push(decision);
  }

  return decisions;
}

/**
 * Aggregate per-step decisions into a single plan-level verdict.
 *  - If any step is denied → `deny`
 *  - Else if any step needs approval → `require_approval`
 *  - Else → `allow`
 */
export function aggregateDecision(decisions: PolicyDecision[]): PolicyAction {
  if (decisions.some((d) => d.action === 'deny')) return 'deny';
  if (decisions.some((d) => d.action === 'require_approval')) return 'require_approval';
  return 'allow';
}
