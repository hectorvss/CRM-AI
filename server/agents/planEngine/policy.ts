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

  // 6. External side-effect tools default to high risk
  {
    id: 'external_elevates_risk',
    description: 'Tools that call external systems are treated as higher risk',
    priority: 500,
    evaluate({ tool }) {
      if (tool.sideEffect === 'external' && tool.risk === 'low') {
        return {
          action: 'allow',
          reason: 'External call allowed but risk elevated to medium',
          riskElevation: 'medium',
        };
      }
      return null;
    },
  },

  // 7. Default allow for reads
  {
    id: 'allow_reads',
    description: 'Read-only tools are auto-allowed',
    priority: 100,
    evaluate({ tool }) {
      if (tool.sideEffect === 'read') {
        return { action: 'allow', reason: 'Read-only tool' };
      }
      return null;
    },
  },

  // 8. Default allow for low/medium-risk writes (conservative fallback)
  {
    id: 'allow_low_medium_writes',
    description: 'Allow write operations with low/medium risk when no higher rule applies',
    priority: 50,
    evaluate({ tool }) {
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

// ── Engine ───────────────────────────────────────────────────────────────────

const customRules: PolicyRule[] = [];

export function registerPolicyRule(rule: PolicyRule): void {
  customRules.push(rule);
}

/**
 * Evaluate a full plan against all rules. Returns one PolicyDecision per step.
 * Does NOT mutate the plan.
 */
export function evaluatePlan(
  plan: Plan,
  registry: typeof ToolRegistry,
  context: Pick<ToolExecutionContext, 'tenantId' | 'workspaceId' | 'userId' | 'hasPermission'>,
): PolicyDecision[] {
  const rules = [...baselineRules, ...customRules].sort((a, b) => b.priority - a.priority);
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

      // Risk elevation tracked independently of action
      const riskLevel = result.riskElevation ?? tool?.risk ?? 'medium';

      // Priority order: deny > require_approval > allow
      const shouldOverride =
        decision.action === 'deny'
          ? false
          : result.action === 'deny' ||
            (result.action === 'require_approval' && decision.action === 'allow');

      if (shouldOverride || decisions.length === 0 || decision.ruleId === undefined) {
        decision = {
          stepId: step.id,
          tool: step.tool,
          action: result.action,
          riskLevel,
          reason: result.reason,
          ruleId: rule.id,
        };
      }

      // Short-circuit on deny — no further rule can loosen it
      if (result.action === 'deny') break;
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
