/**
 * server/runtime/adapters/actions.ts
 *
 * Adapter handlers for case.*, order.*, payment.*, return.*, approval.* keys.
 * Phase 3d of the workflow extraction (Turno 5b/D2). Byte-for-byte
 * transcription of the inline branches that previously lived in
 * `server/routes/workflows.ts`.
 *
 * Note: handlers run AFTER the `__simulation` short-circuit in the route.
 * That short-circuit remains inline (uses getNodeContract / buildSimulatedNodeResult).
 */

import type { NodeAdapter } from '../workflowExecutor.js';
import {
  createApprovalRepository,
  createCaseRepository,
  createCommerceRepository,
  createConversationRepository,
} from '../../data/index.js';
import { getRefundThreshold } from '../../utils/refundThreshold.js';

const caseRepository = createCaseRepository();
const conversationRepository = createConversationRepository();
const commerceRepository = createCommerceRepository();
const approvalRepository = createApprovalRepository();

const caseAssign: NodeAdapter = async ({ scope, context }, _node, config) => {
  if (!context.case?.id) return { status: 'failed', error: 'case.assign requires case context' } as any;
  await caseRepository.update(scope, context.case.id, {
    assigned_user_id: config.user_id || config.userId || null,
    assigned_team_id: config.team_id || config.teamId || null,
  });
  return { status: 'completed', output: { caseId: context.case.id, assigned: true } };
};

const caseNote: NodeAdapter = async ({ scope, context }, node, config) => {
  if (!context.case?.id) return { status: 'failed', error: 'case.note requires case context' } as any;
  const content = config.content || `Workflow note from ${node.label}`;
  const note = await conversationRepository.createInternalNote(scope, {
    caseId: context.case.id,
    content,
    createdBy: scope.userId || 'workflow',
  });
  return { status: 'completed', output: { noteId: note.id, content } };
};

const caseReply: NodeAdapter = async ({ scope, context }, _node, config) => {
  if (!context.case?.id) return { status: 'failed', error: 'case.reply requires case context' } as any;
  const conversation = await conversationRepository.ensureForCase(scope, context.case);
  const message = await conversationRepository.appendMessage(scope, {
    conversationId: conversation.id,
    caseId: context.case.id,
    customerId: context.case.customer_id || null,
    type: 'agent',
    direction: 'outbound',
    senderId: scope.userId || 'workflow',
    senderName: 'Workflow',
    content: config.content || 'Workflow generated reply',
    channel: conversation.channel || 'web_chat',
  });
  return { status: 'completed', output: { messageId: message.id } };
};

const caseUpdateStatus: NodeAdapter = async ({ scope, context }, node, config) => {
  if (!context.case?.id) return { status: 'failed', error: 'case.update_status requires case context' } as any;
  const nextStatus = config.status || config.to || 'open';
  const previousStatus = context.case.status ?? null;
  await caseRepository.update(scope, context.case.id, { status: nextStatus });
  await caseRepository.addStatusHistory(scope, {
    caseId: context.case.id,
    fromStatus: previousStatus,
    toStatus: nextStatus,
    changedBy: scope.userId || 'workflow',
    reason: config.reason || `Status updated by ${node.label}`,
  }).catch(() => undefined);
  context.case = { ...context.case, status: nextStatus };
  return { status: 'completed', output: { caseId: context.case.id, previousStatus, status: nextStatus } };
};

const caseSetPriority: NodeAdapter = async ({ scope, context }, _node, config) => {
  if (!context.case?.id) return { status: 'failed', error: 'case.set_priority requires case context' } as any;
  const updates: Record<string, any> = {};
  if (config.priority) updates.priority = config.priority;
  if (config.severity) updates.severity = config.severity;
  if (config.risk_level || config.riskLevel) updates.risk_level = config.risk_level || config.riskLevel;
  if (Object.keys(updates).length === 0) updates.priority = 'high';
  await caseRepository.update(scope, context.case.id, updates);
  context.case = { ...context.case, ...updates };
  return { status: 'completed', output: { caseId: context.case.id, updates } };
};

const caseAddTag: NodeAdapter = async ({ scope, context }, _node, config) => {
  if (!context.case?.id) return { status: 'failed', error: 'case.add_tag requires case context' } as any;
  const tag = String(config.tag || config.value || 'workflow').trim();
  const currentTags = Array.isArray(context.case.tags) ? context.case.tags : [];
  const tags = Array.from(new Set([...currentTags, tag].filter(Boolean)));
  await caseRepository.update(scope, context.case.id, { tags });
  context.case = { ...context.case, tags };
  return { status: 'completed', output: { caseId: context.case.id, tags } };
};

const orderCancel: NodeAdapter = async ({ scope, context }, _node, config) => {
  const orderId = config.order_id || config.orderId || context.order?.id;
  if (!orderId) return { status: 'failed', error: 'order.cancel requires order context' } as any;
  const order = await commerceRepository.getOrder(scope, orderId);
  if (!order) return { status: 'failed', error: 'Order not found' } as any;
  const fulfillment = String(order.fulfillment_status ?? order.status ?? '').toLowerCase();
  if (['packed', 'shipped', 'delivered', 'fulfilled'].includes(fulfillment)) {
    return { status: 'waiting_approval', output: { reason: `Order is ${fulfillment}`, orderId } };
  }
  await commerceRepository.updateOrder(scope, orderId, {
    status: 'cancelled',
    approval_status: 'not_required',
    last_update: config.reason || 'Cancelled by workflow',
    system_states: { ...(order.system_states ?? {}), canonical: 'cancelled', workflow: 'cancelled' },
  });
  return { status: 'completed', output: { orderId, status: 'cancelled' } };
};

const orderHoldOrRelease: NodeAdapter = async ({ scope, context }, node, config) => {
  const orderId = config.order_id || config.orderId || context.order?.id;
  if (!orderId) return { status: 'failed', error: `${node.key} requires order context` } as any;
  const order = await commerceRepository.getOrder(scope, orderId);
  if (!order) return { status: 'failed', error: 'Order not found' } as any;
  const hold = node.key === 'order.hold';
  const workflowStatus = hold ? 'held' : 'released';
  await commerceRepository.updateOrder(scope, orderId, {
    approval_status: hold ? 'pending' : 'not_required',
    last_update: config.reason || (hold ? 'Placed on hold by workflow' : 'Released by workflow'),
    system_states: { ...(order.system_states ?? {}), workflow: workflowStatus, hold: hold ? 'active' : 'released' },
  });
  context.order = { ...order, system_states: { ...(order.system_states ?? {}), workflow: workflowStatus, hold: hold ? 'active' : 'released' } };
  return { status: hold && config.requires_approval ? 'waiting_approval' : 'completed', output: { orderId, hold, status: workflowStatus } };
};

const paymentRefund: NodeAdapter = async ({ scope, context }, _node, config) => {
  const paymentId = config.payment_id || config.paymentId || context.payment?.id;
  if (!paymentId) return { status: 'failed', error: 'payment.refund requires payment context' } as any;
  const payment = await commerceRepository.getPayment(scope, paymentId);
  if (!payment) return { status: 'failed', error: 'Payment not found' } as any;
  const amount = Number(config.amount || payment.amount || 0);
  if (amount > getRefundThreshold(payment.currency) || ['high', 'critical'].includes(String(payment.risk_level ?? '').toLowerCase())) {
    return { status: 'waiting_approval', output: { reason: 'Refund requires approval', paymentId, amount } };
  }
  await commerceRepository.updatePayment(scope, paymentId, {
    status: 'refunded',
    refund_amount: amount,
    refund_type: amount >= Number(payment.amount ?? 0) ? 'full' : 'partial',
    approval_status: 'approved',
    system_states: { ...(payment.system_states ?? {}), canonical: 'refunded', workflow: 'refunded' },
    last_update: config.reason || 'Refunded by workflow',
  });
  return { status: 'completed', output: { paymentId, amount, status: 'refunded' } };
};

const paymentMarkDispute: NodeAdapter = async ({ scope, context }, _node, config) => {
  const paymentId = config.payment_id || config.paymentId || context.payment?.id;
  if (!paymentId) return { status: 'failed', error: 'payment.mark_dispute requires payment context' } as any;
  const payment = await commerceRepository.getPayment(scope, paymentId);
  if (!payment) return { status: 'failed', error: 'Payment not found' } as any;
  await commerceRepository.updatePayment(scope, paymentId, {
    status: config.status || payment.status || 'disputed',
    dispute_status: config.dispute_status || 'open',
    dispute_id: config.dispute_id || config.disputeId || payment.dispute_id || `workflow_dispute_${Date.now()}`,
    approval_status: 'pending',
    system_states: { ...(payment.system_states ?? {}), dispute: 'Open', workflow: 'dispute_review' },
    last_update: config.reason || 'Marked as disputed by workflow',
  });
  return { status: 'waiting_approval', output: { paymentId, dispute: 'open' } };
};

const returnCreate: NodeAdapter = async ({ scope, context }, _node, config) => {
  const returnId = await commerceRepository.upsertReturn(scope, {
    externalId: config.external_return_id || `workflow_return_${Date.now()}`,
    status: config.status || 'pending_review',
    totalAmount: Number(config.amount || context.order?.total_amount || 0),
    currency: config.currency || context.order?.currency || 'USD',
    source: 'workflow',
  });
  await commerceRepository.updateReturn(scope, returnId, {
    order_id: config.order_id || context.order?.id || null,
    customer_id: config.customer_id || context.customer?.id || context.case?.customer_id || null,
    return_reason: config.reason || 'Created by workflow',
    method: config.method || 'workflow',
  });
  return { status: 'completed', output: { returnId } };
};

const returnApproveOrReject: NodeAdapter = async ({ scope, context }, node, config) => {
  const returnId = config.return_id || config.returnId || context.return?.id;
  if (!returnId) return { status: 'failed', error: `${node.key} requires return context` } as any;
  const approved = node.key === 'return.approve';
  await commerceRepository.updateReturn(scope, returnId, {
    status: approved ? 'approved' : 'rejected',
    approval_status: approved ? 'approved' : 'rejected',
    refund_status: approved ? (config.refund_status || 'pending') : 'not_required',
    return_reason: config.reason || (approved ? 'Approved by workflow' : 'Rejected by workflow'),
  });
  return { status: 'completed', output: { returnId, approved } };
};

const approvalCreate: NodeAdapter = async ({ scope, context }, node, config) => {
  const approval = await approvalRepository.create(scope, {
    caseId: config.case_id || context.case?.id || null,
    actionType: config.action_type || 'workflow_approval',
    actionPayload: { nodeId: node.id, config, context: { caseId: context.case?.id } },
    riskLevel: config.risk_level || 'medium',
    priority: config.priority || 'normal',
    assignedTeamId: config.team_id || config.queue || null,
    evidencePackage: { workflowNode: node.label },
  });
  return { status: 'waiting_approval', output: { approvalId: approval.id } };
};

const approvalEscalate: NodeAdapter = async ({ scope, context }, node, config) => {
  const approval = await approvalRepository.create(scope, {
    caseId: config.case_id || context.case?.id || null,
    actionType: config.action_type || 'workflow_escalation',
    actionPayload: { nodeId: node.id, escalationReason: config.reason || 'Workflow escalation', context: { caseId: context.case?.id } },
    riskLevel: config.risk_level || 'high',
    priority: config.priority || 'urgent',
    assignedTeamId: config.team_id || config.queue || 'manager',
    evidencePackage: { workflowNode: node.label, escalation: true },
  });
  return { status: 'waiting_approval', output: { approvalId: approval.id, escalated: true } };
};

export const actionsAdapters: Record<string, NodeAdapter> = {
  'case.assign': caseAssign,
  'case.note': caseNote,
  'case.reply': caseReply,
  'case.update_status': caseUpdateStatus,
  'case.set_priority': caseSetPriority,
  'case.add_tag': caseAddTag,
  'order.cancel': orderCancel,
  'order.hold': orderHoldOrRelease,
  'order.release': orderHoldOrRelease,
  'payment.refund': paymentRefund,
  'payment.mark_dispute': paymentMarkDispute,
  'return.create': returnCreate,
  'return.approve': returnApproveOrReject,
  'return.reject': returnApproveOrReject,
  'approval.create': approvalCreate,
  'approval.escalate': approvalEscalate,
};
