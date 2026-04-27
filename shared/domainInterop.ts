/**
 * shared/domainInterop.ts
 *
 * Canonical domain-capability declarations used by:
 *  - The post-approval dispatcher (to know which domains support writes / need approvals)
 *  - The E2E interop test suite (to assert capability coverage)
 *  - The Super Agent plan engine (to enrich policy decisions)
 *
 * Adding a new domain: add an entry to DOMAIN_CAPABILITIES and update
 * any dispatcher that reads this map.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type DomainKey =
  | 'payment'
  | 'order'
  | 'return'
  | 'case'
  | 'customer'
  | 'knowledge'
  | 'workspace'
  | 'workflow'
  | 'agent'
  | 'connector'
  | 'approval';

export interface DomainCapability {
  /** Human-readable display name */
  label: string;
  /** Can this domain be read without approval? */
  canRead: boolean;
  /** Can this domain be written (mutated) without special permission? */
  canWrite: boolean;
  /** Does any write action require an approval cycle? */
  requiresApproval: boolean;
  /**
   * Specific write actions that always require approval.
   * Used by policy engine to check individual tool calls.
   */
  approvalRequired: string[];
  /**
   * Write actions that are low-risk and can be executed without approval
   * even in 'assisted' autonomy mode.
   */
  lowRiskWrites: string[];
  /** Whether this domain emits domain events on mutation */
  emitsDomainEvents: boolean;
  /** API base path (relative to /api/) */
  apiPath: string;
}

// ── Capability map ─────────────────────────────────────────────────────────────

/**
 * Line 196 — knowledge and workspace declare real write/approval capabilities.
 * Previously they were read-only placeholders; Codex added proper write paths.
 */
export const DOMAIN_CAPABILITIES: Record<DomainKey, DomainCapability> = {

  payment: {
    label: 'Payment',
    canRead: true,
    canWrite: true,
    requiresApproval: true,
    approvalRequired: ['payment.refund', 'payment.void', 'payment.capture'],
    lowRiskWrites: ['payment.add_note'],
    emitsDomainEvents: true,
    apiPath: 'payments',
  },

  order: {
    label: 'Order',
    canRead: true,
    canWrite: true,
    requiresApproval: true,
    approvalRequired: ['order.cancel', 'order.refund', 'order.replace'],
    lowRiskWrites: ['order.add_note', 'order.update_tag'],
    emitsDomainEvents: true,
    apiPath: 'orders',
  },

  return: {
    label: 'Return',
    canRead: true,
    canWrite: true,
    requiresApproval: false,
    approvalRequired: [],
    lowRiskWrites: ['return.update_status', 'return.add_note', 'return.approve', 'return.reject'],
    emitsDomainEvents: true,
    apiPath: 'returns',
  },

  case: {
    label: 'Case',
    canRead: true,
    canWrite: true,
    requiresApproval: false,
    approvalRequired: [],
    lowRiskWrites: [
      'case.update_status',
      'case.update_priority',
      'case.update_assignment',
      'case.add_note',
    ],
    emitsDomainEvents: true,
    apiPath: 'cases',
  },

  customer: {
    label: 'Customer',
    canRead: true,
    canWrite: true,
    requiresApproval: false,
    approvalRequired: [],
    lowRiskWrites: ['customer.update'],
    emitsDomainEvents: false,
    apiPath: 'customers',
  },

  /**
   * Line 196 — knowledge now declares real write + approval capabilities.
   * Publishing an article requires an approval cycle; drafting does not.
   */
  knowledge: {
    label: 'Knowledge',
    canRead: true,
    canWrite: true,
    requiresApproval: true,
    approvalRequired: ['knowledge.publish', 'knowledge.delete'],
    lowRiskWrites: ['knowledge.create_draft', 'knowledge.update_draft', 'knowledge.search'],
    emitsDomainEvents: true,
    apiPath: 'knowledge',
  },

  /**
   * Line 313 — workspace now declares real write + approval capabilities.
   * Settings mutations always go through an approval cycle.
   */
  workspace: {
    label: 'Workspace',
    canRead: true,
    canWrite: true,
    requiresApproval: true,
    approvalRequired: [
      'settings.workspace.update',
      'settings.feature_flags.update',
      'integration.webhooks.create',
      'integration.webhooks.delete',
    ],
    lowRiskWrites: [],
    emitsDomainEvents: true,
    apiPath: 'workspaces',
  },

  workflow: {
    label: 'Workflow',
    canRead: true,
    canWrite: true,
    requiresApproval: true,
    approvalRequired: ['workflow.publish', 'workflow.fire_event'],
    lowRiskWrites: ['workflow.trigger', 'workflow.list', 'workflow.get'],
    emitsDomainEvents: true,
    apiPath: 'workflows',
  },

  agent: {
    label: 'Agent',
    canRead: true,
    canWrite: false,
    requiresApproval: true,
    approvalRequired: ['agent.run'],
    lowRiskWrites: ['agent.list', 'agent.get'],
    emitsDomainEvents: false,
    apiPath: 'agents',
  },

  connector: {
    label: 'Connector',
    canRead: true,
    canWrite: true,
    requiresApproval: false,
    approvalRequired: [],
    lowRiskWrites: ['connector.call', 'connector.test'],
    emitsDomainEvents: true,
    apiPath: 'connectors',
  },

  approval: {
    label: 'Approval',
    canRead: true,
    canWrite: true,
    requiresApproval: false,
    approvalRequired: [],
    lowRiskWrites: ['approval.decide'],
    emitsDomainEvents: true,
    apiPath: 'approvals',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the given tool action requires an approval cycle */
export function toolRequiresApproval(toolName: string): boolean {
  for (const cap of Object.values(DOMAIN_CAPABILITIES)) {
    if (cap.approvalRequired.includes(toolName)) return true;
  }
  return false;
}

/** Returns the domain capability for a given tool prefix (e.g. "payment.refund" → payment) */
export function capabilityForTool(toolName: string): DomainCapability | null {
  const prefix = toolName.split('.')[0] as DomainKey;
  return DOMAIN_CAPABILITIES[prefix] ?? null;
}

/** All domain keys that support writes */
export function writableDomains(): DomainKey[] {
  return (Object.keys(DOMAIN_CAPABILITIES) as DomainKey[]).filter(
    (key) => DOMAIN_CAPABILITIES[key].canWrite,
  );
}

/** All domain keys that require approval for at least one action */
export function approvalGatedDomains(): DomainKey[] {
  return (Object.keys(DOMAIN_CAPABILITIES) as DomainKey[]).filter(
    (key) => DOMAIN_CAPABILITIES[key].requiresApproval,
  );
}
