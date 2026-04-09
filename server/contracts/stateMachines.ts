import type {
  ApprovalStatus,
  CaseStatus,
  ConnectorHealthStatus,
  ExecutionPlanStatus,
  ReconciliationIssueStatus,
  WorkflowRunStatus,
} from './domain.js';

type TransitionMap<T extends string> = Record<T, ReadonlyArray<T>>;

export const caseTransitions: TransitionMap<CaseStatus> = {
  new: ['open', 'escalated'],
  open: ['waiting', 'in_review', 'pending_approval', 'pending_execution', 'resolved', 'escalated'],
  waiting: ['open', 'in_review', 'pending_approval', 'escalated'],
  in_review: ['open', 'pending_approval', 'pending_execution', 'resolved', 'escalated'],
  pending_approval: ['open', 'pending_execution', 'escalated'],
  pending_execution: ['resolved', 'escalated', 'in_review'],
  resolved: ['closed'],
  closed: [],
  escalated: ['open', 'in_review', 'pending_approval', 'pending_execution', 'resolved'],
};

export const approvalTransitions: TransitionMap<ApprovalStatus> = {
  pending: ['approved', 'rejected', 'expired', 'delegated'],
  approved: [],
  rejected: [],
  expired: ['pending'],
  delegated: ['approved', 'rejected', 'expired'],
};

export const workflowRunTransitions: TransitionMap<WorkflowRunStatus> = {
  running: ['waiting_approval', 'completed', 'paused', 'failed', 'cancelled'],
  waiting_approval: ['running', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  paused: ['running', 'cancelled', 'failed'],
  cancelled: [],
};

export const executionPlanTransitions: TransitionMap<ExecutionPlanStatus> = {
  draft: ['awaiting_approval', 'executing', 'cancelled'],
  awaiting_approval: ['approved', 'cancelled'],
  approved: ['executing', 'cancelled'],
  executing: ['completed', 'failed'],
  completed: [],
  failed: ['rolled_back'],
  rolled_back: [],
  cancelled: [],
};

export const reconciliationIssueTransitions: TransitionMap<ReconciliationIssueStatus> = {
  open: ['in_progress', 'resolved', 'escalated', 'ignored'],
  in_progress: ['resolved', 'escalated', 'ignored'],
  resolved: [],
  ignored: [],
  escalated: ['in_progress', 'resolved', 'ignored'],
};

export const connectorHealthTransitions: TransitionMap<ConnectorHealthStatus> = {
  healthy: ['degraded', 'error', 'disconnected', 'timeout'],
  degraded: ['healthy', 'error', 'disconnected', 'timeout'],
  error: ['healthy', 'degraded', 'disconnected', 'timeout'],
  timeout: ['healthy', 'degraded', 'error', 'disconnected'],
  disconnected: ['healthy'],
};

export function canTransition<T extends string>(from: T, to: T, transitions: TransitionMap<T>): boolean {
  return transitions[from].includes(to);
}

export function assertTransition<T extends string>(
  entityName: string,
  from: T,
  to: T,
  transitions: TransitionMap<T>
): void {
  if (!canTransition(from, to, transitions)) {
    throw new Error(`[${entityName}] Invalid transition from "${from}" to "${to}"`);
  }
}

