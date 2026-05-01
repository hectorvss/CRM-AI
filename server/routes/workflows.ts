import { Router } from 'express';
import crypto from 'crypto';
import vm from 'node:vm';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import {
  createApprovalRepository,
  createAuditRepository,
  createCaseRepository,
  createCommerceRepository,
  createConversationRepository,
  createIntegrationRepository,
  createKnowledgeRepository,
  createWorkflowRepository,
  createWorkspaceRepository,
} from '../data/index.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { runAgent } from '../agents/runner.js';
import { sendEmail, sendWhatsApp, sendSms } from '../pipeline/channelSenders.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withGeminiRetry } from '../ai/geminiRetry.js';
import { config as appConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import { broadcastSSE } from './sse.js';

const router = Router();
const workflowRepository = createWorkflowRepository();
const auditRepository = createAuditRepository();
const caseRepository = createCaseRepository();
const commerceRepository = createCommerceRepository();
const conversationRepository = createConversationRepository();
const approvalRepository = createApprovalRepository();
const knowledgeRepository = createKnowledgeRepository();
const integrationRepository = createIntegrationRepository();
const workspaceRepository = createWorkspaceRepository();

router.use(extractMultiTenant);

const NODE_CATALOG = [
  { type: 'trigger', key: 'case.created', label: 'Case created', category: 'Trigger', icon: 'assignment', requiresConfig: false },
  { type: 'trigger', key: 'message.received', label: 'Message received', category: 'Trigger', icon: 'mail', requiresConfig: false },
  { type: 'trigger', key: 'order.updated', label: 'Order updated', category: 'Trigger', icon: 'shopping_bag', requiresConfig: false },
  { type: 'trigger', key: 'payment.failed', label: 'Payment failed', category: 'Trigger', icon: 'payments', requiresConfig: false },
  { type: 'trigger', key: 'return.created', label: 'Return created', category: 'Trigger', icon: 'keyboard_return', requiresConfig: false },
  { type: 'trigger', key: 'approval.decided', label: 'Approval decided', category: 'Trigger', icon: 'task_alt', requiresConfig: false },
  { type: 'trigger', key: 'webhook.received', label: 'Webhook received', category: 'Trigger', icon: 'webhook', requiresConfig: true },
  { type: 'trigger', key: 'case.updated', label: 'Case updated', category: 'Trigger', icon: 'published_with_changes', requiresConfig: false },
  { type: 'trigger', key: 'customer.updated', label: 'Customer updated', category: 'Trigger', icon: 'manage_accounts', requiresConfig: false },
  { type: 'trigger', key: 'sla.breached', label: 'SLA breached', category: 'Trigger', icon: 'timer_off', requiresConfig: false },
  { type: 'trigger', key: 'payment.dispute.created', label: 'Payment dispute created', category: 'Trigger', icon: 'report', requiresConfig: false },
  { type: 'trigger', key: 'shipment.updated', label: 'Shipment updated', category: 'Trigger', icon: 'local_shipping', requiresConfig: false },
  { type: 'trigger', key: 'manual.run', label: 'Manual run', category: 'Trigger', icon: 'play_arrow', requiresConfig: false },
  { type: 'trigger', key: 'trigger.schedule', label: 'Schedule (cron)', category: 'Trigger', icon: 'event_repeat', requiresConfig: true },
  { type: 'condition', key: 'amount.threshold', label: 'Amount threshold', category: 'Condition', icon: 'attach_money', requiresConfig: true },
  { type: 'condition', key: 'status.matches', label: 'Status matches', category: 'Condition', icon: 'rule', requiresConfig: true },
  { type: 'condition', key: 'risk.level', label: 'Risk level', category: 'Condition', icon: 'gpp_maybe', requiresConfig: true },
  { type: 'condition', key: 'conflict.exists', label: 'Conflict exists', category: 'Condition', icon: 'sync_problem', requiresConfig: false },
  { type: 'condition', key: 'flow.if', label: 'If', category: 'Flow', icon: 'question_mark', requiresConfig: true },
  { type: 'condition', key: 'flow.filter', label: 'Filter', category: 'Flow', icon: 'filter_alt', requiresConfig: true },
  { type: 'condition', key: 'flow.switch', label: 'Switch', category: 'Flow', icon: 'shuffle', requiresConfig: true },
  { type: 'condition', key: 'flow.compare', label: 'Compare datasets', category: 'Flow', icon: 'compare_arrows', requiresConfig: true },
  { type: 'condition', key: 'flow.branch', label: 'Branch', category: 'Flow', icon: 'account_tree', requiresConfig: true },
  { type: 'utility', key: 'flow.merge', label: 'Merge branches', category: 'Flow', icon: 'merge', requiresConfig: true },
  { type: 'utility', key: 'flow.loop', label: 'Loop over items', category: 'Flow', icon: 'repeat', requiresConfig: true },
  { type: 'utility', key: 'flow.wait', label: 'Wait', category: 'Flow', icon: 'hourglass_top', requiresConfig: true },
  { type: 'utility', key: 'flow.subworkflow', label: 'Execute sub-workflow', category: 'Flow', icon: 'subdirectory_arrow_right', requiresConfig: true },
  { type: 'utility', key: 'flow.stop_error', label: 'Stop and error', category: 'Flow', icon: 'error', requiresConfig: true },
  { type: 'utility', key: 'flow.noop', label: 'No-op', category: 'Flow', icon: 'passkey', requiresConfig: false },
  { type: 'utility', key: 'data.set_fields', label: 'Set fields', category: 'Data transformation', icon: 'edit_note', requiresConfig: true },
  { type: 'utility', key: 'data.rename_fields', label: 'Rename fields', category: 'Data transformation', icon: 'drive_file_rename_outline', requiresConfig: true },
  { type: 'utility', key: 'data.extract_json', label: 'Extract JSON', category: 'Data transformation', icon: 'data_object', requiresConfig: true },
  { type: 'utility', key: 'data.normalize_text', label: 'Normalize text', category: 'Data transformation', icon: 'text_format', requiresConfig: true },
  { type: 'utility', key: 'data.format_date', label: 'Format date', category: 'Data transformation', icon: 'event', requiresConfig: true },
  { type: 'utility', key: 'data.split_items', label: 'Split items', category: 'Data transformation', icon: 'split_scene', requiresConfig: true },
  { type: 'utility', key: 'data.dedupe', label: 'Deduplicate', category: 'Data transformation', icon: 'content_copy', requiresConfig: true },
  { type: 'utility', key: 'data.map_fields', label: 'Map fields', category: 'Data transformation', icon: 'map', requiresConfig: true },
  { type: 'utility', key: 'data.pick_fields', label: 'Pick fields', category: 'Data transformation', icon: 'select_all', requiresConfig: true },
  { type: 'utility', key: 'data.merge_objects', label: 'Merge objects', category: 'Data transformation', icon: 'join_inner', requiresConfig: true },
  { type: 'utility', key: 'data.validate_required', label: 'Validate required fields', category: 'Data transformation', icon: 'fact_check', requiresConfig: true },
  { type: 'utility', key: 'data.calculate', label: 'Calculate value', category: 'Data transformation', icon: 'calculate', requiresConfig: true },
  { type: 'utility', key: 'data.aggregate', label: 'Aggregate', category: 'Data transformation', icon: 'list_alt', requiresConfig: true },
  { type: 'utility', key: 'data.limit', label: 'Limit', category: 'Data transformation', icon: 'crop', requiresConfig: true },
  { type: 'utility', key: 'data.split_out', label: 'Split out', category: 'Data transformation', icon: 'call_split', requiresConfig: true },
  { type: 'utility', key: 'data.ai_transform', label: 'AI Transform', category: 'Data transformation', icon: 'magic_button', requiresConfig: true },
  { type: 'utility', key: 'core.code', label: 'Code', category: 'Core', icon: 'code', requiresConfig: true },
  { type: 'utility', key: 'core.data_table_op', label: 'Data table', category: 'Core', icon: 'table_view', requiresConfig: true },
  { type: 'utility', key: 'core.respond_webhook', label: 'Respond to webhook', category: 'Core', icon: 'reply_all', requiresConfig: true },
  { type: 'agent', key: 'ai.information_extractor', label: 'Information Extractor', category: 'Agent', icon: 'fact_check', requiresConfig: true },
  { type: 'action', key: 'case.assign', label: 'Assign case', category: 'Action', icon: 'person_add', requiresConfig: true },
  { type: 'action', key: 'case.reply', label: 'Send reply', category: 'Action', icon: 'reply', requiresConfig: true },
  { type: 'action', key: 'case.note', label: 'Create internal note', category: 'Action', icon: 'note_add', requiresConfig: true },
  { type: 'action', key: 'case.update_status', label: 'Update case status', category: 'Action', icon: 'published_with_changes', requiresConfig: true },
  { type: 'action', key: 'case.set_priority', label: 'Set case priority', category: 'Action', icon: 'priority_high', requiresConfig: true },
  { type: 'action', key: 'case.add_tag', label: 'Add case tag', category: 'Action', icon: 'sell', requiresConfig: true },
  { type: 'action', key: 'order.cancel', label: 'Cancel order', category: 'Action', icon: 'block', requiresConfig: true, sensitive: true },
  { type: 'action', key: 'order.hold', label: 'Place order hold', category: 'Action', icon: 'pause_circle', requiresConfig: true, sensitive: true },
  { type: 'action', key: 'order.release', label: 'Release order hold', category: 'Action', icon: 'play_circle', requiresConfig: true },
  { type: 'action', key: 'payment.refund', label: 'Issue refund', category: 'Action', icon: 'currency_exchange', requiresConfig: true, sensitive: true },
  { type: 'action', key: 'payment.mark_dispute', label: 'Mark payment dispute', category: 'Action', icon: 'gavel', requiresConfig: true, sensitive: true },
  { type: 'action', key: 'return.create', label: 'Create return', category: 'Action', icon: 'assignment_return', requiresConfig: true },
  { type: 'action', key: 'return.approve', label: 'Approve return', category: 'Action', icon: 'task_alt', requiresConfig: true },
  { type: 'action', key: 'return.reject', label: 'Reject return', category: 'Action', icon: 'do_not_disturb_on', requiresConfig: true },
  { type: 'action', key: 'approval.create', label: 'Request approval', category: 'Action', icon: 'verified', requiresConfig: true },
  { type: 'action', key: 'approval.escalate', label: 'Escalate approval', category: 'Action', icon: 'escalator_warning', requiresConfig: true },
  { type: 'action', key: 'notification.email', label: 'Send email', category: 'Notification', icon: 'mail', requiresConfig: true },
  { type: 'action', key: 'notification.whatsapp', label: 'Send WhatsApp', category: 'Notification', icon: 'chat', requiresConfig: true },
  { type: 'action', key: 'notification.sms', label: 'Send SMS', category: 'Notification', icon: 'sms', requiresConfig: true },
  { type: 'integration', key: 'message.slack', label: 'Slack', category: 'Human review', icon: 'tag', requiresConfig: true },
  { type: 'integration', key: 'message.discord', label: 'Discord', category: 'Human review', icon: 'forum', requiresConfig: true },
  { type: 'integration', key: 'message.telegram', label: 'Telegram', category: 'Human review', icon: 'send', requiresConfig: true },
  { type: 'integration', key: 'message.gmail', label: 'Gmail', category: 'Human review', icon: 'mail', requiresConfig: true },
  { type: 'integration', key: 'message.outlook', label: 'Microsoft Outlook', category: 'Human review', icon: 'mark_email_unread', requiresConfig: true },
  { type: 'integration', key: 'message.teams', label: 'Microsoft Teams', category: 'Human review', icon: 'groups', requiresConfig: true },
  { type: 'integration', key: 'message.google_chat', label: 'Google Chat', category: 'Human review', icon: 'chat_bubble', requiresConfig: true },
  { type: 'agent', key: 'agent.run', label: 'Run specialist agent', category: 'Agent', icon: 'smart_toy', requiresConfig: true },
  { type: 'agent', key: 'agent.classify', label: 'Classify case', category: 'Agent', icon: 'category', requiresConfig: true },
  { type: 'agent', key: 'agent.sentiment', label: 'Analyze sentiment', category: 'Agent', icon: 'sentiment_satisfied', requiresConfig: true },
  { type: 'agent', key: 'agent.summarize', label: 'Summarize context', category: 'Agent', icon: 'summarize', requiresConfig: true },
  { type: 'agent', key: 'agent.draft_reply', label: 'Draft reply', category: 'Agent', icon: 'edit_square', requiresConfig: true },
  { type: 'policy', key: 'policy.evaluate', label: 'Evaluate policy', category: 'Policy', icon: 'shield', requiresConfig: true },
  { type: 'policy', key: 'core.audit_log', label: 'Write audit log', category: 'Policy', icon: 'receipt_long', requiresConfig: true },
  { type: 'policy', key: 'core.idempotency_check', label: 'Idempotency check', category: 'Policy', icon: 'fingerprint', requiresConfig: true },
  { type: 'policy', key: 'core.rate_limit', label: 'Rate limit gate', category: 'Policy', icon: 'speed', requiresConfig: true },
  { type: 'knowledge', key: 'knowledge.search', label: 'Search knowledge', category: 'Knowledge', icon: 'menu_book', requiresConfig: true },
  { type: 'knowledge', key: 'knowledge.validate_policy', label: 'Validate policy answer', category: 'Knowledge', icon: 'policy', requiresConfig: true },
  { type: 'knowledge', key: 'knowledge.attach_evidence', label: 'Attach evidence', category: 'Knowledge', icon: 'attach_file', requiresConfig: true },
  { type: 'integration', key: 'connector.call', label: 'Call connector', category: 'Integration', icon: 'hub', requiresConfig: true },
  { type: 'integration', key: 'connector.emit_event', label: 'Emit integration event', category: 'Integration', icon: 'send', requiresConfig: true },
  { type: 'integration', key: 'connector.check_health', label: 'Check connector health', category: 'Integration', icon: 'monitor_heart', requiresConfig: true },
  { type: 'utility', key: 'delay', label: 'Delay', category: 'Utility', icon: 'schedule', requiresConfig: true },
  { type: 'utility', key: 'retry', label: 'Retry', category: 'Utility', icon: 'refresh', requiresConfig: true },
  { type: 'utility', key: 'stop', label: 'Stop workflow', category: 'Utility', icon: 'stop_circle', requiresConfig: false },
  { type: 'agent', key: 'ai.generate_text', label: 'Generate text (AI)', category: 'Agent', icon: 'auto_awesome', requiresConfig: true },
  { type: 'agent', key: 'ai.gemini', label: 'Google Gemini', category: 'Agent', icon: 'diamond', requiresConfig: true },
  { type: 'utility', key: 'data.http_request', label: 'HTTP request', category: 'Data transformation', icon: 'http', requiresConfig: true },
];

const SENSITIVE_KEYS = new Set(['order.cancel', 'order.hold', 'payment.refund', 'payment.mark_dispute', 'connector.call', 'connector.emit_event']);
const PAUSED_STATUSES = new Set(['waiting', 'waiting_approval', 'paused']);

type WorkflowNodeContract = {
  required?: string[];
  optional?: string[];
  branchLabels?: string[];
  sideEffects?: 'none' | 'read' | 'write' | 'external';
  risk?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  resumable?: boolean;
};

const NODE_CONTRACTS: Record<string, WorkflowNodeContract> = {
  'webhook.received': { required: ['event'], optional: ['secret', 'source'], sideEffects: 'none' },
  'amount.threshold': { required: ['field', 'operator', 'amount'], branchLabels: ['true', 'false'], sideEffects: 'none' },
  'status.matches': { required: ['field', 'value'], optional: ['operator'], branchLabels: ['true', 'false'], sideEffects: 'none' },
  'risk.level': { required: ['field', 'value'], optional: ['operator'], branchLabels: ['true', 'false'], sideEffects: 'none' },
  'flow.if': { required: ['field', 'operator', 'value'], branchLabels: ['true', 'false'], sideEffects: 'none' },
  'flow.filter': { required: ['source', 'field', 'operator', 'value'], branchLabels: ['true', 'false'], sideEffects: 'none' },
  'flow.switch': { required: ['field', 'branches'], optional: ['fallback'], branchLabels: ['branches'], sideEffects: 'none' },
  'flow.compare': { required: ['left', 'operator', 'right'], branchLabels: ['true', 'false'], sideEffects: 'none' },
  'flow.branch': { required: ['branches'], branchLabels: ['branches'], sideEffects: 'none' },
  'flow.merge': { required: ['mode'], sideEffects: 'none' },
  'flow.loop': { required: ['source'], optional: ['batchSize', 'maxIterations'], sideEffects: 'none' },
  'flow.wait': { required: ['mode'], optional: ['duration', 'until', 'timeout'], sideEffects: 'none', resumable: true },
  'flow.subworkflow': { required: ['workflow'], optional: ['input'], sideEffects: 'external', risk: 'medium' },
  'flow.stop_error': { required: ['errorMessage'], sideEffects: 'none' },
  'data.set_fields': { required: ['field', 'value'], optional: ['source', 'target'], sideEffects: 'none' },
  'data.rename_fields': { required: ['mapping'], sideEffects: 'none' },
  'data.extract_json': { required: ['source'], optional: ['path'], sideEffects: 'none' },
  'data.normalize_text': { required: ['source'], optional: ['target'], sideEffects: 'none' },
  'data.format_date': { required: ['source', 'format'], optional: ['target'], sideEffects: 'none' },
  'data.split_items': { required: ['source'], optional: ['delimiter'], sideEffects: 'none' },
  'data.dedupe': { required: ['source'], sideEffects: 'none' },
  'data.map_fields': { required: ['mapping'], sideEffects: 'none' },
  'data.pick_fields': { required: ['fields'], sideEffects: 'none' },
  'data.merge_objects': { required: ['left', 'right'], sideEffects: 'none' },
  'data.validate_required': { required: ['fields'], sideEffects: 'none' },
  'data.calculate': { required: ['left', 'operation', 'right', 'target'], sideEffects: 'none' },
  'data.aggregate': { required: ['source', 'operation'], optional: ['field', 'target'], sideEffects: 'none' },
  'data.limit': { required: ['source', 'limit'], optional: ['mode', 'target'], sideEffects: 'none' },
  'data.split_out': { required: ['source'], optional: ['target'], sideEffects: 'none' },
  'data.ai_transform': { required: ['instruction'], optional: ['source', 'target', 'model'], sideEffects: 'external', risk: 'low' },
  'core.code': { required: ['code'], optional: ['language', 'target', 'timeoutMs'], sideEffects: 'none', risk: 'medium' },
  'core.data_table_op': { required: ['tableId', 'operation'], optional: ['matchField', 'matchValue', 'row', 'target'], sideEffects: 'write', risk: 'low' },
  'core.respond_webhook': { required: ['statusCode'], optional: ['body', 'contentType'], sideEffects: 'external', risk: 'low' },
  'ai.information_extractor': { required: ['text', 'schema'], optional: ['target', 'model'], sideEffects: 'external', risk: 'low' },
  'message.slack': { required: ['channel', 'content'], optional: ['thread_ts'], sideEffects: 'external', risk: 'medium' },
  'message.discord': { required: ['channel', 'content'], optional: ['username'], sideEffects: 'external', risk: 'medium' },
  'message.telegram': { required: ['chatId', 'content'], optional: ['parseMode'], sideEffects: 'external', risk: 'medium' },
  'message.gmail': { required: ['to', 'subject', 'content'], optional: ['cc', 'replyToCaseId'], sideEffects: 'external', risk: 'medium' },
  'message.outlook': { required: ['to', 'subject', 'content'], optional: ['importance'], sideEffects: 'external', risk: 'medium' },
  'message.teams': { required: ['channel', 'content'], optional: ['title'], sideEffects: 'external', risk: 'medium' },
  'message.google_chat': { required: ['space', 'content'], sideEffects: 'external', risk: 'medium' },
  'ai.gemini': { required: ['prompt'], optional: ['operation', 'systemInstruction', 'model', 'temperature', 'maxTokens', 'target'], sideEffects: 'external', risk: 'low' },
  'ai.generate_text': { required: ['prompt'], optional: ['target', 'maxTokens', 'model'], sideEffects: 'external', risk: 'low' },
  'case.assign': { required: ['user_id'], optional: ['team_id'], sideEffects: 'write', risk: 'medium' },
  'case.reply': { required: ['content'], sideEffects: 'write', risk: 'medium' },
  'case.note': { required: ['content'], sideEffects: 'write', risk: 'low' },
  'case.update_status': { required: ['status'], optional: ['reason'], sideEffects: 'write', risk: 'medium' },
  'case.set_priority': { required: ['priority'], sideEffects: 'write', risk: 'low' },
  'case.add_tag': { required: ['tag'], sideEffects: 'write', risk: 'low' },
  'order.cancel': { required: ['reason'], optional: ['order_id'], sideEffects: 'write', risk: 'high' },
  'order.hold': { required: ['reason'], optional: ['order_id'], sideEffects: 'write', risk: 'high' },
  'order.release': { required: ['reason'], optional: ['order_id'], sideEffects: 'write', risk: 'medium' },
  'payment.refund': { required: ['amount', 'reason'], optional: ['payment_id'], sideEffects: 'write', risk: 'critical' },
  'payment.mark_dispute': { required: ['reason'], optional: ['payment_id', 'dispute_id'], sideEffects: 'write', risk: 'high' },
  'return.create': { required: ['reason'], optional: ['order_id', 'amount', 'method'], sideEffects: 'write', risk: 'medium' },
  'return.approve': { required: ['reason'], optional: ['return_id'], sideEffects: 'write', risk: 'medium' },
  'return.reject': { required: ['reason'], optional: ['return_id'], sideEffects: 'write', risk: 'medium' },
  'approval.create': { required: ['action_type', 'risk_level'], optional: ['queue', 'reason'], sideEffects: 'write', risk: 'medium', resumable: true },
  'approval.escalate': { required: ['reason'], optional: ['queue', 'risk_level'], sideEffects: 'write', risk: 'high', resumable: true },
  'agent.run': { required: ['agent'], optional: ['case_id', 'input'], sideEffects: 'external', risk: 'medium' },
  'agent.classify': { required: ['text'], optional: ['intent'], sideEffects: 'none' },
  'agent.sentiment': { required: ['text'], sideEffects: 'none' },
  'agent.summarize': { required: ['text'], sideEffects: 'none' },
  'agent.draft_reply': { required: ['content'], sideEffects: 'none' },
  'policy.evaluate': { required: ['policy', 'field', 'operator', 'value'], branchLabels: ['allow', 'block'], sideEffects: 'none' },
  'core.audit_log': { required: ['action', 'entity_type', 'entity_id'], sideEffects: 'write', risk: 'low' },
  'core.idempotency_check': { required: ['key'], sideEffects: 'read' },
  'core.rate_limit': { required: ['bucket', 'limit'], sideEffects: 'read' },
  'knowledge.search': { required: ['query'], optional: ['limit', 'status'], sideEffects: 'read' },
  'knowledge.validate_policy': { required: ['policy', 'action'], branchLabels: ['allow', 'approval'], sideEffects: 'none' },
  'knowledge.attach_evidence': { required: ['title'], optional: ['source', 'note'], sideEffects: 'write', risk: 'low' },
  'connector.call': { required: ['connector', 'capability'], optional: ['payload'], sideEffects: 'external', risk: 'high' },
  'connector.emit_event': { required: ['event_type'], optional: ['connector', 'payload'], sideEffects: 'external', risk: 'high' },
  'connector.check_health': { required: ['connector'], sideEffects: 'read' },
  delay: { required: ['mode'], optional: ['duration', 'until'], sideEffects: 'none', resumable: true },
  retry: { required: ['retries', 'backoffMs'], sideEffects: 'none' },
};

function getNodeContract(key: string): WorkflowNodeContract {
  return NODE_CONTRACTS[key] ?? { required: [], optional: [], sideEffects: 'none', risk: SENSITIVE_KEYS.has(key) ? 'high' : 'low' };
}

function getConfigFieldsForNode(key: string) {
  const contract = getNodeContract(key);
  return Array.from(new Set([...(contract.required ?? []), ...(contract.optional ?? [])]));
}

function hasConfigValue(config: Record<string, any>, field: string) {
  const value = config?.[field];
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function parseMaybeJsonArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseMaybeJsonObject(value: any): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeNodeType(type: any, key?: any) {
  const raw = String(type ?? key ?? '').toLowerCase();
  if (raw === 'decision') return 'condition';
  if (raw === 'approval' || raw === 'human_review') return 'action';
  if (raw === 'task') return String(key ?? '').includes('agent') ? 'agent' : 'action';
  if (['trigger', 'condition', 'action', 'agent', 'policy', 'knowledge', 'integration', 'utility'].includes(raw)) return raw;
  return 'action';
}

function normalizeNodeKey(node: any, type: string) {
  if (node.key) return node.key;
  if (node.action) return node.action;
  if (node.type === 'approval') return 'approval.create';
  if (node.type === 'decision') return 'status.matches';
  if (type === 'trigger') return 'manual.run';
  if (type === 'policy') return 'policy.evaluate';
  if (type === 'knowledge') return 'knowledge.search';
  if (type === 'integration') return 'connector.call';
  if (type === 'agent') return 'agent.run';
  return 'case.note';
}

function normalizeEdges(edges: any[] | string = []) {
  return parseMaybeJsonArray(edges).map((edge, index) => {
    const source = edge.source ?? edge.from;
    const target = edge.target ?? edge.to;
    const label = edge.label ?? edge.condition ?? edge.sourceHandle ?? 'next';
    return {
      id: edge.id ?? `edge_${source}_${target}_${index}`,
      source,
      target,
      label,
      sourceHandle: edge.sourceHandle ?? edge.source_handle ?? (label === 'true' || label === 'false' ? label : 'main'),
      targetHandle: edge.targetHandle ?? edge.target_handle ?? null,
    };
  }).filter((edge) => edge.source && edge.target);
}

function normalizeNodes(nodes: any[] | string = []) {
  return parseMaybeJsonArray(nodes).map((node, index) => {
    const type = normalizeNodeType(node.type, node.key);
    const key = normalizeNodeKey(node, type);
    const config = parseMaybeJsonObject(node.config);
    return {
    id: node.id ?? `node_${index + 1}`,
    type,
    key,
    label: node.label ?? node.name ?? node.key ?? 'Untitled node',
    position: node.position ?? { x: 160 + index * 240, y: 160 + (index % 3) * 100 },
    config,
    disabled: Boolean(node.disabled),
    ui: node.ui ?? {},
    credentialsRef: node.credentialsRef ?? node.credentials_ref ?? config.connector_id ?? config.connectorId ?? config.connector ?? null,
    retryPolicy: node.retryPolicy ?? node.retry_policy ?? null,
  };
  });
}

function buildDiagnostic(nodeId: string | null, severity: 'error' | 'warning' | 'info', code: string, message: string, blocking = severity === 'error') {
  return { nodeId, severity, code, message, blocking };
}

function validateWorkflowDefinition(nodes: any[] = [], edges: any[] = []) {
  const normalized = normalizeNodes(nodes);
  const normalizedEdges = normalizeEdges(edges);
  const errors: string[] = [];
  const warnings: string[] = [];
  const diagnostics: any[] = [];
  const catalogByKey = new Map(NODE_CATALOG.map((node) => [node.key, node]));

  if (normalized.length === 0) {
    const diagnostic = buildDiagnostic(null, 'error', 'workflow.empty', 'Add at least one trigger node.');
    errors.push(diagnostic.message);
    diagnostics.push(diagnostic);
  }
  if (!normalized.some((node) => node.type === 'trigger')) {
    const diagnostic = buildDiagnostic(null, 'error', 'workflow.missing_trigger', 'A workflow needs one trigger.');
    errors.push(diagnostic.message);
    diagnostics.push(diagnostic);
  }

  const nodeIds = new Set(normalized.map((node) => node.id));
  for (const edge of normalizedEdges) {
    if (!nodeIds.has(edge.source)) {
      const diagnostic = buildDiagnostic(edge.source ?? null, 'error', 'edge.unknown_source', `Edge ${edge.id ?? ''} has an unknown source.`);
      errors.push(diagnostic.message);
      diagnostics.push(diagnostic);
    }
    if (!nodeIds.has(edge.target)) {
      const diagnostic = buildDiagnostic(edge.target ?? null, 'error', 'edge.unknown_target', `Edge ${edge.id ?? ''} has an unknown target.`);
      errors.push(diagnostic.message);
      diagnostics.push(diagnostic);
    }
  }

  for (const node of normalized) {
    const spec = catalogByKey.get(node.key);
    const contract = getNodeContract(node.key);
    if (node.disabled) {
      diagnostics.push(buildDiagnostic(node.id, 'info', 'node.disabled', `${node.label} is disabled and will be skipped.`, false));
      continue;
    }
    if (!spec) {
      const diagnostic = buildDiagnostic(node.id, 'warning', 'node.custom_key', `${node.label} uses a custom node key (${node.key}).`, false);
      warnings.push(diagnostic.message);
      diagnostics.push(diagnostic);
    }
    if (spec?.requiresConfig && Object.keys(node.config ?? {}).length === 0) {
      const diagnostic = buildDiagnostic(node.id, 'error', 'node.missing_config', `${node.label} needs configuration before publishing.`);
      errors.push(diagnostic.message);
      diagnostics.push(diagnostic);
    }
    const missingFields = (contract.required ?? []).filter((field) => !hasConfigValue(node.config ?? {}, field));
    for (const field of missingFields) {
      const diagnostic = buildDiagnostic(node.id, 'warning', 'node.missing_required_field', `${node.label} should configure "${field}" for reliable execution.`, false);
      warnings.push(diagnostic.message);
      diagnostics.push(diagnostic);
    }
    if (node.key === 'connector.call' && !(node.credentialsRef || node.config?.connector_id || node.config?.connectorId || node.config?.connector)) {
      const diagnostic = buildDiagnostic(node.id, 'error', 'connector.missing_connection', `${node.label} needs a connector connection before publishing.`);
      errors.push(diagnostic.message);
      diagnostics.push(diagnostic);
    }
    if (node.key === 'delay' && !(node.config?.duration || node.config?.until || node.config?.mode === 'manual_resume')) {
      diagnostics.push(buildDiagnostic(node.id, 'warning', 'delay.manual_resume', `${node.label} has no duration and will wait for manual resume.`, false));
    }
    if (SENSITIVE_KEYS.has(node.key) && !node.retryPolicy) {
      diagnostics.push(buildDiagnostic(node.id, 'warning', 'runtime.retry_missing', `${node.label} has no retry policy configured.`, false));
    }
    if (spec?.sensitive && !normalized.some((candidate) => !candidate.disabled && (candidate.type === 'policy' || candidate.key === 'policy.evaluate' || candidate.key === 'approval.create'))) {
      const diagnostic = buildDiagnostic(node.id, 'error', 'sensitive.missing_guardrail', `${node.label} is sensitive and requires a policy or approval node.`);
      errors.push(diagnostic.message);
      diagnostics.push(diagnostic);
    }
    if (node.type === 'condition') {
      const outgoingLabels = normalizedEdges.filter((edge) => edge.source === node.id).map((edge) => String(edge.label ?? '').toLowerCase());
      const requiredLabels = node.key === 'flow.switch' || node.key === 'flow.branch'
        ? asArray(node.config?.branches || node.config?.routes || node.config?.options).map((label) => String(label).toLowerCase())
        : (contract.branchLabels ?? []).filter((label) => label !== 'branches').map((label) => label.toLowerCase());
      for (const label of requiredLabels) {
        if (label && !outgoingLabels.includes(label)) {
          diagnostics.push(buildDiagnostic(node.id, 'warning', 'branch.missing_edge', `${node.label} has no "${label}" branch connection.`, false));
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    diagnostics,
    nodes: normalized,
    edges: normalizedEdges,
  };
}

async function buildDryRun(
  nodes: any[] = [],
  edges: any[] = [],
  triggerPayload: any = {},
  scope: { tenantId?: string; workspaceId?: string; userId?: string } = {},
) {
  const validation = validateWorkflowDefinition(nodes, edges);
  const startedAt = new Date().toISOString();
  const steps: any[] = [];

  if (validation.nodes.length > 0) {
    const workflowContext = await buildWorkflowContext(
      { tenantId: scope.tenantId ?? 'dry-run', workspaceId: scope.workspaceId ?? 'dry-run', userId: scope.userId },
      triggerPayload ?? {},
    ).catch(() => ({
      trigger: triggerPayload ?? {},
      data: triggerPayload && typeof triggerPayload === 'object' ? { ...triggerPayload } : triggerPayload ?? {},
      case: null,
      order: null,
      payment: null,
      return: null,
      agent: {},
      policy: {},
    }));
    workflowContext.__simulation = true;

    const visited = new Set<string>();
    let currentNode = getStartNode(validation.nodes);
    let order = 0;
    while (currentNode && !visited.has(currentNode.id) && order < validation.nodes.length) {
      visited.add(currentNode.id);
      const spec = NODE_CATALOG.find((item) => item.key === currentNode.key);
      const blocked = validation.errors.some((error) => error.includes(currentNode.label));
      const startedStepAt = Date.now();
      const result = blocked
        ? { status: 'blocked', output: { reason: 'Validation error' }, error: 'Validation error' }
        : await executeWorkflowNode(
          { tenantId: scope.tenantId ?? 'dry-run', workspaceId: scope.workspaceId ?? 'dry-run', userId: scope.userId },
          currentNode,
          workflowContext,
        );
      const durationMs = Math.max(1, Date.now() - startedStepAt);
      steps.push({
        nodeId: currentNode.id,
        label: currentNode.label,
        type: currentNode.type,
        key: currentNode.key,
        status: result.status === 'completed' ? 'would_run' : result.status,
        order: order + 1,
        input: order === 0 ? triggerPayload : { fromPreviousStep: true, lastOutput: workflowContext.lastOutput ?? null },
        output: result.output ?? {},
        error: result.error ?? null,
        durationMs,
        evidence: [{ type: 'workflow_node', id: currentNode.id, label: currentNode.label }],
        navigationTarget: { page: 'workflows', entityType: 'workflow_node', entityId: currentNode.id },
        sensitive: Boolean(spec?.sensitive),
      });
      workflowContext.lastOutput = result.output ?? null;
      workflowContext.lastNode = { id: currentNode.id, key: currentNode.key, label: currentNode.label, status: result.status };
      if (result.output && typeof result.output === 'object' && !Array.isArray(result.output)) {
        workflowContext.data = result.output.data ?? result.output;
      }
      order += 1;
      if (['failed', 'blocked', 'waiting_approval', 'waiting', 'stopped'].includes(result.status)) break;
      currentNode = pickNextNode(validation.nodes, validation.edges, currentNode, workflowContext);
    }
  }

  return {
    ok: validation.ok,
    dryRun: true,
    startedAt,
    endedAt: new Date().toISOString(),
    validation,
    steps,
    summary: validation.ok
      ? `Dry-run completed. ${steps.length} node(s) would execute with no real writes.`
      : `Dry-run found ${validation.errors.length} blocker(s).`,
  };
}

function resolveTemplateValue(value: any, context: any) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, path) => {
    const parts = String(path).split('.');
    let cursor = context;
    for (const part of parts) cursor = cursor?.[part];
    return cursor === undefined || cursor === null ? '' : String(cursor);
  });
}

function resolveNodeConfig(config: Record<string, any> = {}, context: any) {
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, resolveTemplateValue(value, context)]));
}

function compareValues(left: any, operator: string, right: any) {
  const normalizedOperator = String(operator || '==').toLowerCase();
  if (normalizedOperator === 'exists') return left !== undefined && left !== null && String(left).length > 0;
  if (normalizedOperator === 'not_exists') return left === undefined || left === null || String(left).length === 0;
  if (normalizedOperator === 'contains') return String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
  if (normalizedOperator === 'not_contains') return !String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
  if (normalizedOperator === 'in') return asArray(right).map((item) => String(item).toLowerCase()).includes(String(left ?? '').toLowerCase());
  if (normalizedOperator === 'not_in') return !asArray(right).map((item) => String(item).toLowerCase()).includes(String(left ?? '').toLowerCase());
  const numericLeft = Number(left);
  const numericRight = Number(right);
  const canCompareNumber = Number.isFinite(numericLeft) && Number.isFinite(numericRight);
  switch (normalizedOperator) {
    case '>': return canCompareNumber ? numericLeft > numericRight : String(left) > String(right);
    case '>=': return canCompareNumber ? numericLeft >= numericRight : String(left) >= String(right);
    case '<': return canCompareNumber ? numericLeft < numericRight : String(left) < String(right);
    case '<=': return canCompareNumber ? numericLeft <= numericRight : String(left) <= String(right);
    case '!=':
    case '!==': return String(left) !== String(right);
    case '=':
    case '==':
    case '===':
    default: return String(left) === String(right);
  }
}

function readContextPath(context: any, path: string) {
  return String(path || '').split('.').reduce((cursor, part) => cursor?.[part], context);
}

function asArray(value: any) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return trimmed.split(/[\n,|]+/).map((item) => item.trim()).filter(Boolean);
    }
  }
  return [value];
}

function cloneJson(value: any) {
  if (Array.isArray(value)) return value.map((item) => cloneJson(item));
  if (value && typeof value === 'object') return { ...value };
  return value;
}

async function buildWorkflowContext(scope: { tenantId: string; workspaceId: string; userId?: string }, payload: any) {
  const context: any = {
    trigger: payload ?? {},
    data: payload && typeof payload === 'object' ? { ...payload } : payload ?? {},
    case: null,
    order: null,
    payment: null,
    return: null,
    agent: {},
    policy: {},
    __subworkflowDepth: Number(payload?.__subworkflowDepth || 0),
  };

  const caseId = payload?.caseId ?? payload?.case_id;
  if (caseId) {
    const bundle = await caseRepository.getBundle(scope, caseId).catch(() => null);
    if (bundle) {
      context.case = bundle.case;
      context.customer = bundle.customer;
      context.order = bundle.orders?.[0] ?? null;
      context.payment = bundle.payments?.[0] ?? null;
      context.return = bundle.returns?.[0] ?? null;
      context.conversation = bundle.conversation;
    }
  }

  const orderId = payload?.orderId ?? payload?.order_id ?? context.order?.id;
  if (orderId && !context.order) context.order = await commerceRepository.getOrder(scope, orderId).catch(() => null);
  const paymentId = payload?.paymentId ?? payload?.payment_id ?? context.payment?.id;
  if (paymentId && !context.payment) context.payment = await commerceRepository.getPayment(scope, paymentId).catch(() => null);
  const returnId = payload?.returnId ?? payload?.return_id ?? context.return?.id;
  if (returnId && !context.return) context.return = await commerceRepository.getReturn(scope, returnId).catch(() => null);
  return context;
}

function getStartNode(nodes: any[]) {
  return nodes.find((node) => node.type === 'trigger') ?? nodes[0] ?? null;
}

function resolveExecutionOrder(nodes: any[] = [], edges: any[] = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered: any[] = [];
  const visited = new Set<string>();
  let current = getStartNode(nodes);

  while (current && !visited.has(current.id) && ordered.length < nodes.length) {
    ordered.push(current);
    visited.add(current.id);
    const nextEdge = (edges ?? []).find((edge) => edge.source === current.id);
    current = nextEdge ? byId.get(nextEdge.target) : null;
  }

  return ordered.length ? ordered : nodes;
}

function pickNextNode(nodes: any[] = [], edges: any[] = [], currentNode: any, context: any) {
  return pickNextNodes(nodes, edges, currentNode, context)[0] ?? null;
}

/**
 * Returns the list of next nodes to execute after currentNode.
 * For conditions: returns the single branch matching the evaluated result.
 * For flow.branch (parallel fan-out): returns ALL connected nodes.
 * For everything else: returns the single "next/success" node.
 */
function pickNextNodes(nodes: any[] = [], edges: any[] = [], currentNode: any, context: any): any[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = (edges ?? []).filter((edge) => edge.source === currentNode.id);
  if (outgoing.length === 0) return [];

  // flow.branch = parallel fan-out: execute ALL connected targets
  if (currentNode.key === 'flow.branch') {
    return outgoing.map((edge) => byId.get(edge.target)).filter(Boolean);
  }

  if (currentNode.type === 'condition') {
    const expectedLabel = String(context.condition?.route ?? (context.condition?.result ? 'true' : 'false')).toLowerCase();
    const branch = outgoing.find((edge) => String(edge.label ?? '').toLowerCase() === expectedLabel);
    if (branch) {
      const target = byId.get(branch.target);
      return target ? [target] : [];
    }
    // No matching branch found — follow default/next if available, otherwise stop
    const fallback = outgoing.find((edge) => !edge.label || ['next', 'default'].includes(String(edge.label).toLowerCase()));
    if (fallback) {
      const target = byId.get(fallback.target);
      return target ? [target] : [];
    }
    return [];
  }

  const next = outgoing.find((edge) => !edge.label || ['next', 'success'].includes(String(edge.label).toLowerCase())) ?? outgoing[0];
  const target = byId.get(next.target);
  return target ? [target] : [];
}

async function buildStepDryRun(
  nodes: any[] = [],
  edges: any[] = [],
  nodeId: string,
  triggerPayload: any = {},
  scope: { tenantId?: string; workspaceId?: string; userId?: string } = {},
) {
  const dryRun = await buildDryRun(nodes, edges, triggerPayload, scope);
  const executionOrder = dryRun.steps ?? [];
  const index = executionOrder.findIndex((step: any) => step.nodeId === nodeId || step.node_id === nodeId);
  if (index === -1) {
    const error: any = new Error('Workflow node not found');
    error.statusCode = 404;
    throw error;
  }
  const step = executionOrder[index];
  const previous = index > 0 ? executionOrder[index - 1] : null;
  const node = dryRun.validation.nodes.find((item: any) => item.id === nodeId);
  return {
    ok: step.status !== 'blocked',
    dryRun: true,
    nodeId,
    label: step.label,
    status: step.status,
    input: previous?.output ? { previousOutput: previous.output, trigger: triggerPayload } : triggerPayload,
    output: step.output,
    error: step.status === 'blocked' ? step.output?.reason ?? 'Validation error' : null,
    durationMs: step.durationMs ?? 0,
    evidence: step.evidence ?? [{ type: 'workflow_node', id: nodeId, label: step.label }],
    navigationTarget: { page: 'workflows', entityType: 'workflow_node', entityId: nodeId },
    diagnostics: dryRun.validation.diagnostics.filter((diagnostic: any) => !diagnostic.nodeId || diagnostic.nodeId === nodeId),
    parentState: previous ? 'available' : 'root',
    node,
  };
}

/** Parse a human duration string (e.g. "2h", "30m", "1d") into an ISO expiry timestamp. */
function resolveDelayUntil(duration: string): string | null {
  const str = String(duration).trim().toLowerCase();
  const match = str.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  const unit = match[2];
  const ms = unit === 'ms' ? amount
    : unit === 's'  ? amount * 1_000
    : unit === 'm'  ? amount * 60_000
    : unit === 'h'  ? amount * 3_600_000
    : unit === 'd'  ? amount * 86_400_000
    : unit === 'w'  ? amount * 604_800_000
    : 0;
  if (!ms) return null;
  return new Date(Date.now() + ms).toISOString();
}

function normalizeTriggerName(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase().replace(/_/g, '.');
}

function workflowMatchesTrigger(version: any, eventType: string) {
  const normalizedEvent = normalizeTriggerName(eventType);
  const trigger = parseMaybeJsonObject(version?.trigger);
  const triggerType = normalizeTriggerName(trigger?.type ?? trigger?.event);
  const startNode = getStartNode(normalizeNodes(version?.nodes ?? []));
  const nodeTrigger = normalizeTriggerName(startNode?.key);
  const aliases: Record<string, string[]> = {
    'case.created': ['case.created', 'case_created'],
    'message.received': ['message.received', 'message_received'],
    'order.updated': ['order.updated', 'order_updated'],
    'payment.failed': ['payment.failed', 'payment_failed'],
    'return.created': ['return.created', 'return_created'],
    'approval.decided': ['approval.decided', 'approval_decided', 'approval.approved', 'approval.rejected'],
    'webhook.received': ['webhook.received', 'webhook_received'],
    'case.updated': ['case.updated', 'case_updated'],
    'customer.updated': ['customer.updated', 'customer_updated'],
    'sla.breached': ['sla.breached', 'sla_breached', 'sla.breach'],
    'payment.dispute.created': ['payment.dispute.created', 'payment_dispute_created', 'dispute.created'],
    'shipment.updated': ['shipment.updated', 'shipment_updated', 'fulfillment.updated'],
    'manual.run': ['manual.run', 'manual'],
  };
  const accepted = new Set([normalizedEvent, ...(aliases[normalizedEvent] ?? []).map(normalizeTriggerName)]);
  return accepted.has(triggerType) || accepted.has(nodeTrigger);
}

function buildSimulatedNodeResult(node: any, config: Record<string, any>, context: any) {
  const contract = getNodeContract(node.key);
  const risk = contract.risk ?? (SENSITIVE_KEYS.has(node.key) ? 'high' : 'low');
  const sideEffects = contract.sideEffects ?? (['action', 'integration'].includes(node.type) ? 'write' : 'none');
  const configPreview = Object.fromEntries(
    Object.entries(config ?? {}).filter(([key]) => !/secret|token|password|api[_-]?key/i.test(key)),
  );
  const output = {
    simulated: true,
    key: node.key,
    label: node.label,
    sideEffects,
    risk,
    configPreview,
  };
  if (node.key === 'approval.create' || node.key === 'approval.escalate') {
    context.approval = { simulated: true, riskLevel: config.risk_level ?? risk, actionType: config.action_type ?? node.key };
    return { status: 'waiting_approval', output: { ...output, approvalRequired: true } };
  }
  if (node.key === 'flow.wait' || node.key === 'delay') {
    return { status: 'waiting', output: { ...output, delay: config.duration || config.until || config.mode || 'manual_resume' } };
  }
  if (['high', 'critical'].includes(risk) && !context.policy?.decision && node.key !== 'policy.evaluate') {
    return { status: 'waiting_approval', output: { ...output, approvalRecommended: true } };
  }
  return { status: 'completed', output };
}

async function executeWorkflowNode(scope: { tenantId: string; workspaceId: string; userId?: string }, node: any, context: any) {
  if (node.disabled) {
    return { status: 'skipped', output: { reason: 'Node is disabled' } };
  }

  const config = resolveNodeConfig(node.config ?? {}, context);

  if (node.type === 'trigger') {
    return { status: 'completed', output: { accepted: true, trigger: node.key } };
  }

  if (node.type === 'condition') {
    if (node.key === 'conflict.exists') {
      const result = Boolean(context.case?.has_reconciliation_conflicts || context.order?.has_conflict || context.payment?.has_conflict || context.return?.has_conflict);
      context.condition = { result };
      return { status: result ? 'completed' : 'skipped', output: { result } };
    }
    if (node.key === 'flow.if') {
      const left = readContextPath(context, config.field || config.source || config.path || 'data.value');
      const right = config.value ?? config.right ?? config.expected ?? config.compareTo ?? config.comparison;
      const operator = config.operator ?? config.comparisonOperator ?? '==';
      const result = compareValues(left, operator, right);
      context.condition = { result, left, operator, right };
      return { status: result ? 'completed' : 'skipped', output: context.condition };
    }
    if (node.key === 'flow.filter') {
      const source = readContextPath(context, config.source || config.field || 'data.items');
      const list = asArray(source);
      const field = config.field || 'value';
      const operator = config.operator || '==';
      const expected = config.value ?? config.expected ?? config.right ?? config.comparison;
      const filtered = list.filter((item) => {
        const candidate = item && typeof item === 'object' ? readContextPath(item, field) ?? item[field] : item;
        return compareValues(candidate, operator, expected);
      });
      context.data = Array.isArray(source) ? filtered : { ...(source && typeof source === 'object' ? source : {}), items: filtered };
      context.condition = { result: filtered.length > 0, filteredCount: filtered.length, operator, expected };
      return { status: filtered.length > 0 ? 'completed' : 'skipped', output: { ...context.condition, items: filtered } };
    }
    if (node.key === 'flow.compare') {
      const left = readContextPath(context, config.left || config.sourceA || config.fieldA || config.field || 'data.left');
      const right = readContextPath(context, config.right || config.sourceB || config.fieldB || 'data.right') ?? config.value ?? config.expected;
      const operator = config.operator ?? '==';
      const result = compareValues(left, operator, right);
      context.condition = { result, left, operator, right };
      return { status: 'completed', output: context.condition };
    }
    if (node.key === 'flow.branch') {
      const branches = String(config.branches || config.routes || config.options || 'true|false')
        .split('|')
        .map((value: string) => value.trim())
        .filter(Boolean);
      context.condition = { result: true, route: branches[0] ?? 'true', branches };
      return { status: 'completed', output: context.condition };
    }
    if (node.key === 'flow.switch') {
      const source = config.field || config.branch || 'customer.segment';
      const rawRoute = String(readContextPath(context, source) ?? config.value ?? config.comparison ?? 'other').trim();
      const branches = String(config.comparison || config.branches || config.value || 'vip|standard|other')
        .split('|')
        .map((value: string) => value.trim())
        .filter(Boolean);
      const normalizedRoute = branches.find((branch: string) => branch.toLowerCase() === rawRoute.toLowerCase())
        ?? ((branches.at(-1) ?? rawRoute) || 'other');
      context.condition = {
        result: normalizedRoute !== (branches.at(-1) ?? 'other'),
        route: normalizedRoute,
        left: rawRoute,
        branches,
      };
      return { status: normalizedRoute === (branches.at(-1) ?? 'other') ? 'skipped' : 'completed', output: context.condition };
    }
    const left = readContextPath(context, config.field);
    const result = compareValues(left, config.operator ?? '==', config.value);
    context.condition = { result, left, operator: config.operator ?? '==', right: config.value };
    return { status: result ? 'completed' : 'skipped', output: context.condition };
  }

  if (node.key.startsWith('data.')) {
    const source = readContextPath(context, config.source || config.path || 'data');
    const base = cloneJson(source && typeof source === 'object' ? source : context.data && typeof context.data === 'object' ? context.data : {});

    if (node.key === 'data.set_fields') {
      const field = String(config.field || config.target || 'value');
      const value = resolveTemplateValue(config.value ?? config.content ?? config.output ?? '', context);
      if (base && typeof base === 'object') {
        base[field] = value;
      }
      context.data = base;
      return { status: 'completed', output: { data: base, updated: { [field]: value } } };
    }

    if (node.key === 'data.rename_fields') {
      const mapping = parseMaybeJsonObject(config.mapping);
      const renamed: Record<string, any> = {};
      Object.entries(base && typeof base === 'object' ? base : {}).forEach(([key, value]) => {
        const targetKey = mapping[key] ?? mapping[String(key)] ?? (key === config.source ? config.target : key);
        renamed[String(targetKey ?? key)] = value;
      });
      context.data = renamed;
      return { status: 'completed', output: { data: renamed, renamed: true } };
    }

    if (node.key === 'data.extract_json') {
      const raw = readContextPath(context, config.source || config.field || config.path || 'trigger');
      let extracted: any = raw;
      if (typeof raw === 'string') {
        try {
          extracted = JSON.parse(raw);
        } catch {
          extracted = { raw };
        }
      }
      if (config.path && extracted && typeof extracted === 'object') {
        extracted = readContextPath(extracted, config.path);
      }
      context.data = extracted ?? {};
      return { status: 'completed', output: { data: extracted, extracted: true } };
    }

    if (node.key === 'data.normalize_text') {
      const raw = readContextPath(context, config.source || config.field || 'trigger.message') ?? config.value ?? '';
      const normalized = String(raw).trim().replace(/\s+/g, ' ').toLowerCase();
      context.data = { text: normalized };
      return { status: 'completed', output: { data: { text: normalized }, normalized: true } };
    }

    if (node.key === 'data.format_date') {
      const raw = readContextPath(context, config.source || config.field || 'trigger.date') ?? config.value ?? new Date().toISOString();
      const date = new Date(raw);
      const formatted = Number.isNaN(date.getTime())
        ? String(raw)
        : (config.format === 'date' ? date.toLocaleDateString() : config.format === 'time' ? date.toLocaleTimeString() : date.toISOString());
      context.data = { date: formatted };
      return { status: 'completed', output: { data: { date: formatted }, formatted: true } };
    }

    if (node.key === 'data.split_items') {
      const raw = readContextPath(context, config.source || config.field || 'trigger.items') ?? config.value ?? '';
      const delimiter = config.delimiter || '\n';
      const items = Array.isArray(raw)
        ? raw
        : String(raw)
          .split(delimiter)
          .map((value) => value.trim())
          .filter(Boolean);
      context.data = { items };
      return { status: 'completed', output: { data: { items }, split: true, count: items.length } };
    }

    if (node.key === 'data.dedupe') {
      const raw = asArray(readContextPath(context, config.source || config.field || 'trigger.items'));
      const seen = new Set<string>();
      const items = raw.filter((value) => {
        const key = JSON.stringify(value);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      context.data = { items };
      return { status: 'completed', output: { data: { items }, deduped: true, count: items.length } };
    }

    if (node.key === 'data.map_fields') {
      const mapping = parseMaybeJsonObject(config.mapping);
      const payload = base && typeof base === 'object' ? base : {};
      const mapped = Object.fromEntries(Object.entries(mapping).map(([targetKey, sourcePath]) => [targetKey, readContextPath(context, String(sourcePath)) ?? payload[String(sourcePath)] ?? null]));
      context.data = mapped;
      return { status: 'completed', output: { data: mapped, mapped: true } };
    }

    if (node.key === 'data.pick_fields') {
      const fields = asArray(config.fields || config.field || config.keys).map((field) => String(field));
      const payload = base && typeof base === 'object' ? base : {};
      const picked = Object.fromEntries(fields.map((field) => [field, readContextPath(payload, field) ?? readContextPath(context, field)]));
      context.data = picked;
      return { status: 'completed', output: { data: picked, fields } };
    }

    if (node.key === 'data.merge_objects') {
      const left = readContextPath(context, config.left || 'data') ?? {};
      const right = readContextPath(context, config.right || 'trigger') ?? {};
      const merged = {
        ...(left && typeof left === 'object' && !Array.isArray(left) ? left : {}),
        ...(right && typeof right === 'object' && !Array.isArray(right) ? right : {}),
      };
      context.data = merged;
      return { status: 'completed', output: { data: merged, merged: true } };
    }

    if (node.key === 'data.validate_required') {
      const fields = asArray(config.fields || config.required || config.field).map((field) => String(field));
      const payload = base && typeof base === 'object' ? base : context;
      const missing = fields.filter((field) => {
        const value = readContextPath(payload, field) ?? readContextPath(context, field);
        return value === undefined || value === null || String(value).trim() === '';
      });
      context.validation = { requiredFields: fields, missing };
      return {
        status: missing.length ? 'blocked' : 'completed',
        output: { valid: missing.length === 0, missing, fields },
        error: missing.length ? `Missing required fields: ${missing.join(', ')}` : null,
      };
    }

    if (node.key === 'data.calculate') {
      const left = Number(readContextPath(context, config.left || config.source || 'data.amount') ?? config.leftValue ?? 0);
      const right = Number(readContextPath(context, config.right || 'data.value') ?? config.rightValue ?? config.value ?? 0);
      const operation = String(config.operation || config.operator || '+');
      const result = operation === '-' ? left - right : operation === '*' ? left * right : operation === '/' ? (right === 0 ? 0 : left / right) : left + right;
      const target = String(config.target || 'calculated');
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: result };
      return { status: 'completed', output: { data: context.data, result, operation, target } };
    }

    if (node.key === 'data.aggregate') {
      const items = asArray(readContextPath(context, config.source || 'data.items'));
      const field = config.field ? String(config.field) : '';
      const operation = String(config.operation || 'list');
      const target = String(config.target || 'aggregated');
      const values = field
        ? items.map((item: any) => readContextPath(item, field) ?? (item && typeof item === 'object' ? item[field] : item))
        : items;
      let result: any;
      if (operation === 'sum') result = values.reduce((acc: number, v: any) => acc + (Number(v) || 0), 0);
      else if (operation === 'average') result = values.length ? values.reduce((acc: number, v: any) => acc + (Number(v) || 0), 0) / values.length : 0;
      else if (operation === 'min') result = values.length ? Math.min(...values.map((v: any) => Number(v) || 0)) : null;
      else if (operation === 'max') result = values.length ? Math.max(...values.map((v: any) => Number(v) || 0)) : null;
      else if (operation === 'count') result = values.length;
      else result = values; // 'list'
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: result };
      return { status: 'completed', output: { data: context.data, result, operation, count: values.length, target } };
    }

    if (node.key === 'data.limit') {
      const items = asArray(readContextPath(context, config.source || 'data.items'));
      const limit = Math.max(0, Number(config.limit ?? config.max ?? 10) || 0);
      const mode = String(config.mode || 'first');
      const result = mode === 'last' ? items.slice(-limit) : items.slice(0, limit);
      const target = String(config.target || 'items');
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: result };
      return { status: 'completed', output: { data: context.data, count: result.length, originalCount: items.length, target } };
    }

    if (node.key === 'data.split_out') {
      const items = asArray(readContextPath(context, config.source || 'data.items'));
      const target = String(config.target || 'splitItems');
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: items, currentBatch: items };
      return { status: 'completed', output: { data: context.data, count: items.length, target } };
    }

    if (node.key === 'data.ai_transform') {
      const instruction = resolveTemplateValue(config.instruction || config.prompt || '', context);
      if (!instruction) return { status: 'failed', error: 'data.ai_transform: instruction is required' };
      const geminiKey = appConfig.ai.geminiApiKey;
      if (!geminiKey) return { status: 'failed', error: 'data.ai_transform: GEMINI_API_KEY not configured' };
      const sourceValue = readContextPath(context, config.source || 'data') ?? context.data ?? {};
      const target = String(config.target || 'transformed');
      const modelName = String(config.model || appConfig.ai.geminiModel || 'gemini-2.5-flash');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: modelName });
      const fullPrompt = `You are a JSON transformer. Apply the following instruction to the input and return ONLY the transformed JSON output (no commentary, no code fences).\n\nInstruction: ${instruction}\n\nInput JSON:\n${JSON.stringify(sourceValue)}`;
      const result = await withGeminiRetry(
        () => model.generateContent({
          contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2048 },
        }),
        { label: 'workflow.data.ai_transform' },
      );
      const text = result.response.text().trim();
      let parsed: any = text;
      try { parsed = JSON.parse(text); } catch { /* keep as text */ }
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: parsed };
      return { status: 'completed', output: { data: context.data, target, model: modelName } };
    }

    context.data = base;
    return { status: 'completed', output: { data: base, transformed: true } };
  }

  if (context.__simulation && getNodeContract(node.key).sideEffects !== 'none') {
    return buildSimulatedNodeResult(node, config, context);
  }

  if (node.key === 'case.assign') {
    if (!context.case?.id) return { status: 'failed', error: 'case.assign requires case context' };
    await caseRepository.update(scope, context.case.id, {
      assigned_user_id: config.user_id || config.userId || null,
      assigned_team_id: config.team_id || config.teamId || null,
    });
    return { status: 'completed', output: { caseId: context.case.id, assigned: true } };
  }

  if (node.key === 'case.note') {
    if (!context.case?.id) return { status: 'failed', error: 'case.note requires case context' };
    const content = config.content || `Workflow note from ${node.label}`;
    const note = await conversationRepository.createInternalNote(scope, {
      caseId: context.case.id,
      content,
      createdBy: scope.userId || 'workflow',
    });
    return { status: 'completed', output: { noteId: note.id, content } };
  }

  if (node.key === 'case.reply') {
    if (!context.case?.id) return { status: 'failed', error: 'case.reply requires case context' };
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
  }

  if (node.key === 'case.update_status') {
    if (!context.case?.id) return { status: 'failed', error: 'case.update_status requires case context' };
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
  }

  if (node.key === 'case.set_priority') {
    if (!context.case?.id) return { status: 'failed', error: 'case.set_priority requires case context' };
    const updates: Record<string, any> = {};
    if (config.priority) updates.priority = config.priority;
    if (config.severity) updates.severity = config.severity;
    if (config.risk_level || config.riskLevel) updates.risk_level = config.risk_level || config.riskLevel;
    if (Object.keys(updates).length === 0) updates.priority = 'high';
    await caseRepository.update(scope, context.case.id, updates);
    context.case = { ...context.case, ...updates };
    return { status: 'completed', output: { caseId: context.case.id, updates } };
  }

  if (node.key === 'case.add_tag') {
    if (!context.case?.id) return { status: 'failed', error: 'case.add_tag requires case context' };
    const tag = String(config.tag || config.value || 'workflow').trim();
    const currentTags = Array.isArray(context.case.tags) ? context.case.tags : [];
    const tags = Array.from(new Set([...currentTags, tag].filter(Boolean)));
    await caseRepository.update(scope, context.case.id, { tags });
    context.case = { ...context.case, tags };
    return { status: 'completed', output: { caseId: context.case.id, tags } };
  }

  if (node.key === 'order.cancel') {
    const orderId = config.order_id || config.orderId || context.order?.id;
    if (!orderId) return { status: 'failed', error: 'order.cancel requires order context' };
    const order = await commerceRepository.getOrder(scope, orderId);
    if (!order) return { status: 'failed', error: 'Order not found' };
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
  }

  if (node.key === 'order.hold' || node.key === 'order.release') {
    const orderId = config.order_id || config.orderId || context.order?.id;
    if (!orderId) return { status: 'failed', error: `${node.key} requires order context` };
    const order = await commerceRepository.getOrder(scope, orderId);
    if (!order) return { status: 'failed', error: 'Order not found' };
    const hold = node.key === 'order.hold';
    const workflowStatus = hold ? 'held' : 'released';
    await commerceRepository.updateOrder(scope, orderId, {
      approval_status: hold ? 'pending' : 'not_required',
      last_update: config.reason || (hold ? 'Placed on hold by workflow' : 'Released by workflow'),
      system_states: { ...(order.system_states ?? {}), workflow: workflowStatus, hold: hold ? 'active' : 'released' },
    });
    context.order = { ...order, system_states: { ...(order.system_states ?? {}), workflow: workflowStatus, hold: hold ? 'active' : 'released' } };
    return { status: hold && config.requires_approval ? 'waiting_approval' : 'completed', output: { orderId, hold, status: workflowStatus } };
  }

  if (node.key === 'payment.refund') {
    const paymentId = config.payment_id || config.paymentId || context.payment?.id;
    if (!paymentId) return { status: 'failed', error: 'payment.refund requires payment context' };
    const payment = await commerceRepository.getPayment(scope, paymentId);
    if (!payment) return { status: 'failed', error: 'Payment not found' };
    const amount = Number(config.amount || payment.amount || 0);
    if (amount > 250 || ['high', 'critical'].includes(String(payment.risk_level ?? '').toLowerCase())) {
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
  }

  if (node.key === 'payment.mark_dispute') {
    const paymentId = config.payment_id || config.paymentId || context.payment?.id;
    if (!paymentId) return { status: 'failed', error: 'payment.mark_dispute requires payment context' };
    const payment = await commerceRepository.getPayment(scope, paymentId);
    if (!payment) return { status: 'failed', error: 'Payment not found' };
    await commerceRepository.updatePayment(scope, paymentId, {
      status: config.status || payment.status || 'disputed',
      dispute_status: config.dispute_status || 'open',
      dispute_id: config.dispute_id || config.disputeId || payment.dispute_id || `workflow_dispute_${Date.now()}`,
      approval_status: 'pending',
      system_states: { ...(payment.system_states ?? {}), dispute: 'Open', workflow: 'dispute_review' },
      last_update: config.reason || 'Marked as disputed by workflow',
    });
    return { status: 'waiting_approval', output: { paymentId, dispute: 'open' } };
  }

  if (node.key === 'return.create') {
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
  }

  if (node.key === 'return.approve' || node.key === 'return.reject') {
    const returnId = config.return_id || config.returnId || context.return?.id;
    if (!returnId) return { status: 'failed', error: `${node.key} requires return context` };
    const approved = node.key === 'return.approve';
    await commerceRepository.updateReturn(scope, returnId, {
      status: approved ? 'approved' : 'rejected',
      approval_status: approved ? 'approved' : 'rejected',
      refund_status: approved ? (config.refund_status || 'pending') : 'not_required',
      return_reason: config.reason || (approved ? 'Approved by workflow' : 'Rejected by workflow'),
    });
    return { status: 'completed', output: { returnId, approved } };
  }

  if (node.key === 'approval.create') {
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
  }

  if (node.key === 'approval.escalate') {
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
  }

  if (node.key === 'policy.evaluate') {
    const policyKey = config.policy || config.policyKey || config.policy_key || 'default';
    const proposedAction = String(config.action || config.proposedAction || config.proposed_action || context.agent?.intent || '');
    const amount = Number(readContextPath(context, config.amountField || config.amount_field || 'payment.amount') ?? context.payment?.amount ?? 0);
    const riskLevel = String(readContextPath(context, config.riskField || config.risk_field || 'agent.riskLevel') ?? context.agent?.riskLevel ?? context.payment?.risk_level ?? 'low');

    // 1. Look up the policy in the knowledge base
    let policyDecision: 'allow' | 'review' | 'block' = 'allow';
    let policyReason = `Policy ${policyKey}: default allow`;
    let policySource = 'default';

    try {
      const articles = await knowledgeRepository.listArticles(scope, { q: policyKey, status: 'published', type: 'policy' });
      const policyArticle = articles?.[0];
      if (policyArticle) {
        const policyText = String(policyArticle.content ?? policyArticle.summary ?? policyArticle.title ?? '').toLowerCase();
        policySource = policyArticle.title ?? policyKey;
        const blockedTerms = ['forbidden', 'not allowed', 'manager required', 'escalate', 'reject'];
        const reviewTerms = ['review required', 'approval needed', 'check with', 'verify'];
        if (blockedTerms.some((term) => policyText.includes(term)) || riskLevel === 'high') {
          policyDecision = 'block';
          policyReason = `Policy ${policySource}: blocked (risk=${riskLevel})`;
        } else if (reviewTerms.some((term) => policyText.includes(term)) || amount > Number(config.reviewThreshold || config.review_threshold || 500)) {
          policyDecision = 'review';
          policyReason = `Policy ${policySource}: requires review (amount=${amount}, risk=${riskLevel})`;
        } else {
          policyDecision = 'allow';
          policyReason = `Policy ${policySource}: allowed`;
        }
      } else {
        // No KB article — fall back to config-driven field comparison
        const fieldValue = readContextPath(context, config.field || 'agent.riskLevel');
        const fieldDecision = compareValues(fieldValue, config.operator || '!=', config.blockValue || 'critical') ? 'allow' : 'block';
        policyDecision = fieldDecision as typeof policyDecision;
        policyReason = `Policy ${policyKey}: field-based decision (${config.field}=${fieldValue})`;
      }
    } catch {
      // KB lookup failed — use simple heuristic
      policyDecision = riskLevel === 'high' ? 'block' : amount > 1000 ? 'review' : 'allow';
      policyReason = `Policy ${policyKey}: heuristic (risk=${riskLevel}, amount=${amount})`;
    }

    // 2. Config override: explicit decision wins
    if (config.decision) {
      policyDecision = config.decision as typeof policyDecision;
      policyReason = `Policy ${policyKey}: config override`;
    }

    const result = { decision: policyDecision, policy: policyKey, source: policySource, reason: policyReason, proposedAction, amount, riskLevel };
    context.policy = result;
    return {
      status: policyDecision === 'block' ? 'blocked' : policyDecision === 'review' ? 'waiting_approval' : 'completed',
      output: result,
    };
  }

  if (node.key === 'core.audit_log') {
    const entityType = config.entity_type || config.entityType || (context.case ? 'case' : 'workflow');
    const entityId = config.entity_id || config.entityId || context.case?.id || node.id;
    await auditRepository.logEvent({ tenantId: scope.tenantId, workspaceId: scope.workspaceId }, {
      actorId: scope.userId ?? 'workflow',
      actorType: 'system',
      action: config.action || 'WORKFLOW_NODE_AUDIT',
      entityType,
      entityId,
      metadata: { nodeId: node.id, label: node.label, message: config.message || null, data: context.data ?? {} },
    });
    return { status: 'completed', output: { audited: true, entityType, entityId } };
  }

  if (node.key === 'core.idempotency_check') {
    const key = String(config.key || config.idempotencyKey || `${node.id}:${context.case?.id ?? context.order?.id ?? context.trigger?.id ?? 'manual'}`);
    context.idempotency = context.idempotency ?? {};
    if (context.idempotency[key]) return { status: 'skipped', output: { duplicate: true, key } };
    context.idempotency[key] = true;
    return { status: 'completed', output: { duplicate: false, key } };
  }

  if (node.key === 'core.rate_limit') {
    const limit = Number(config.limit || 1);
    const bucket = String(config.bucket || node.id);
    context.rateLimits = context.rateLimits ?? {};
    context.rateLimits[bucket] = Number(context.rateLimits[bucket] || 0) + 1;
    const allowed = context.rateLimits[bucket] <= limit;
    return { status: allowed ? 'completed' : 'waiting', output: { bucket, count: context.rateLimits[bucket], limit, allowed } };
  }

  if (node.key === 'knowledge.search') {
    const query = config.query || config.q || config.content || context.case?.intent || context.case?.summary || context.trigger?.query || '';
    const articles = await knowledgeRepository.listArticles(scope, {
      q: query || undefined,
      status: config.status || 'published',
      type: config.type || undefined,
      domain_id: config.domain_id || config.domainId || undefined,
    });
    const top = articles.slice(0, Number(config.limit || 5)).map((article: any) => ({
      id: article.id,
      title: article.title,
      status: article.status,
      domain: article.domain_name ?? article.domain_id ?? null,
      version: article.version,
    }));
    context.knowledge = { query, articles: top };
    return { status: 'completed', output: { query, count: top.length, articles: top } };
  }

  if (node.key === 'knowledge.validate_policy') {
    const policyText = String(config.policy || context.knowledge?.articles?.[0]?.title || '');
    const proposedAction = String(config.action || config.proposedAction || context.agent?.intent || '');
    const blockedTerms = asArray(config.blocked_terms || config.blockedTerms || 'forbidden|not allowed|manager required').map((term) => String(term).toLowerCase());
    const requiresReview = blockedTerms.some((term) => policyText.toLowerCase().includes(term)) || ['refund', 'cancel', 'dispute'].includes(proposedAction.toLowerCase()) && config.require_review !== false;
    context.policy = { decision: requiresReview ? 'review' : 'allow', policy: config.policy || 'knowledge', proposedAction };
    return { status: requiresReview ? 'waiting_approval' : 'completed', output: context.policy };
  }

  if (node.key === 'knowledge.attach_evidence') {
    const evidence = {
      title: config.title || context.knowledge?.articles?.[0]?.title || 'Workflow evidence',
      source: config.source || 'knowledge',
      articles: context.knowledge?.articles ?? [],
      note: config.note || null,
    };
    context.evidence = [...(Array.isArray(context.evidence) ? context.evidence : []), evidence];
    return { status: 'completed', output: { evidenceAttached: true, evidence } };
  }

  if (['agent.classify', 'agent.sentiment', 'agent.summarize', 'agent.draft_reply'].includes(node.key)) {
    const text = String(
      resolveTemplateValue(config.text || config.content || '', context) ||
      context.case?.summary || context.case?.description || context.trigger?.message || '',
    );
    const lower = text.toLowerCase();

    // ── Gemini-powered path ────────────────────────────────────────────────
    if (appConfig.ai.geminiApiKey && text.length > 3) {
      const genAI = new GoogleGenerativeAI(appConfig.ai.geminiApiKey);
      const model = genAI.getGenerativeModel({ model: appConfig.ai.geminiModel || 'gemini-2.0-flash' });

      if (node.key === 'agent.classify') {
        const prompt = `You are a CRM classification engine. Analyze the customer text and return ONLY valid JSON (no markdown fences).

Text: """${text.slice(0, 1500)}"""

JSON schema:
{
  "intent": "refund|return|cancellation|shipping|billing|fraud|general_support",
  "riskLevel": "low|medium|high",
  "priority": "low|normal|high|critical",
  "confidence": <float 0-1>,
  "tags": [<string>, ...]
}`;
        const result = await withGeminiRetry(
          () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 300 } }),
          { label: 'workflow.agent.classify' },
        );
        const raw = result.response.text().trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
        const parsed = JSON.parse(raw);
        context.agent = { ...(context.agent ?? {}), ...parsed };
        return { status: 'completed', output: context.agent };
      }

      if (node.key === 'agent.sentiment') {
        const prompt = `You are a customer-sentiment analyzer for a CRM. Analyze the text and return ONLY valid JSON (no markdown fences).

Text: """${text.slice(0, 1500)}"""

JSON schema:
{
  "sentiment": "positive|neutral|negative",
  "frustrationScore": <int 0-10>,
  "urgencyScore": <int 0-10>,
  "confidence": <float 0-1>,
  "signals": [<string>, ...]
}`;
        const result = await withGeminiRetry(
          () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 300 } }),
          { label: 'workflow.agent.sentiment' },
        );
        const raw = result.response.text().trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
        const parsed = JSON.parse(raw);
        context.agent = { ...(context.agent ?? {}), ...parsed };
        return { status: 'completed', output: context.agent };
      }

      if (node.key === 'agent.summarize') {
        const maxLen = Number(config.maxLength || 300);
        const prompt = `Summarize the following customer-service text in ${maxLen} characters or fewer. Be concise and factual. Output plain text, no JSON.

Text: """${text.slice(0, 2000)}"""`;
        const result = await withGeminiRetry(
          () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200 } }),
          { label: 'workflow.agent.summarize' },
        );
        const summary = result.response.text().trim();
        context.agent = { ...(context.agent ?? {}), summary };
        context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), summary };
        return { status: 'completed', output: { summary } };
      }

      // agent.draft_reply
      const tone = config.tone || 'professional and empathetic';
      const instructions = config.instructions ? `\nAdditional instructions: ${config.instructions}` : '';
      const prompt = `You are a customer-support agent. Draft a reply to the following customer message.
Tone: ${tone}${instructions}

Customer message: """${text.slice(0, 1500)}"""

Write ONLY the reply text, no subject line, no JSON.`;
      const result = await withGeminiRetry(
        () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 512 } }),
        { label: 'workflow.agent.draft_reply' },
      );
      const draftReply = result.response.text().trim();
      context.agent = { ...(context.agent ?? {}), draftReply };
      return { status: 'completed', output: { draftReply } };
    }

    // ── Keyword fallback (no Gemini key) ──────────────────────────────────
    if (node.key === 'agent.classify') {
      const intent = config.intent || (lower.includes('refund') ? 'refund' : lower.includes('return') ? 'return' : lower.includes('cancel') ? 'cancellation' : 'support');
      const riskLevel = config.risk_level || (lower.includes('fraud') || lower.includes('chargeback') ? 'high' : lower.includes('angry') ? 'medium' : 'low');
      context.agent = { ...(context.agent ?? {}), intent, riskLevel, confidence: 0.55 };
      return { status: 'completed', output: context.agent };
    }
    if (node.key === 'agent.sentiment') {
      const sentiment = lower.includes('angry') || lower.includes('bad') || lower.includes('damaged') ? 'negative' : lower.includes('thanks') || lower.includes('great') ? 'positive' : 'neutral';
      context.agent = { ...(context.agent ?? {}), sentiment, confidence: 0.55 };
      return { status: 'completed', output: context.agent };
    }
    if (node.key === 'agent.summarize') {
      const summary = config.summary || text.slice(0, 240) || `Case ${context.case?.case_number ?? context.case?.id ?? 'context'} summarized by workflow.`;
      context.agent = { ...(context.agent ?? {}), summary };
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), summary };
      return { status: 'completed', output: { summary } };
    }
    const draft = config.content || config.template || `Thanks for reaching out. We have reviewed your case and will follow the next approved step.`;
    context.agent = { ...(context.agent ?? {}), draftReply: resolveTemplateValue(draft, context) };
    return { status: 'completed', output: { draftReply: context.agent.draftReply } };
  }

  if (node.key === 'agent.run') {
    const caseId = config.case_id || config.caseId || context.case?.id;
    const agentSlug = config.agent || config.agentSlug || 'triage-agent';
    if (!caseId) return { status: 'failed', error: 'agent.run requires case context' };
    const result = await runAgent({
      agentSlug,
      caseId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      triggerEvent: config.trigger_event || config.triggerEvent || 'workflow_node',
      traceId: `workflow:${node.id}:${Date.now()}`,
      extraContext: {
        workflowNodeId: node.id,
        workflowNodeLabel: node.label,
        workflowTrigger: context.trigger,
      },
    });
    context.agent = {
      slug: agentSlug,
      success: result.success,
      confidence: result.confidence ?? null,
      summary: result.summary ?? result.error ?? null,
      output: result.output ?? {},
    };
    return {
      status: result.success ? 'completed' : 'failed',
      output: context.agent,
      error: result.success ? null : result.error ?? 'Agent execution failed',
    };
  }

  if (node.key === 'connector.call') {
    const connectorId = config.connector_id || config.connectorId || config.connector;
    if (!connectorId) return { status: 'failed', error: 'connector.call requires connector id' };
    const connector = await integrationRepository.getConnector({ tenantId: scope.tenantId }, connectorId);
    if (!connector) return { status: 'failed', error: 'Connector not found' };
    const capabilities = await integrationRepository.listCapabilities({ tenantId: scope.tenantId }, connectorId);
    const capabilityKey = config.capability || config.capability_key || config.action || capabilities.find((cap: any) => cap.is_enabled !== false)?.capability_key || 'workflow.call';
    const capability = capabilities.find((cap: any) => cap.capability_key === capabilityKey);
    if (capability && capability.is_enabled === false) {
      return { status: 'blocked', output: { reason: 'Connector capability is disabled', connectorId, capabilityKey } };
    }
    if (capability?.requires_approval) {
      const approval = await approvalRepository.create(scope, {
        caseId: context.case?.id ?? null,
        actionType: 'connector.call',
        actionPayload: { connectorId, capabilityKey, nodeId: node.id, config },
        riskLevel: 'medium',
        priority: 'normal',
        evidencePackage: { workflowNode: node.label, connector: connector.system },
      });
      return { status: 'waiting_approval', output: { approvalId: approval.id, connectorId, capabilityKey } };
    }
    const canonicalEvent = await integrationRepository.createCanonicalEvent({ tenantId: scope.tenantId }, {
      sourceSystem: connector.system,
      sourceEntityType: config.source_entity_type || config.sourceEntityType || 'workflow',
      sourceEntityId: config.source_entity_id || config.sourceEntityId || node.id,
      eventType: capabilityKey,
      eventCategory: 'workflow',
      canonicalEntityType: config.entity_type || config.entityType || (context.case ? 'case' : 'workflow'),
      canonicalEntityId: config.entity_id || config.entityId || context.case?.id || node.id,
      normalizedPayload: {
        nodeId: node.id,
        config,
        trigger: context.trigger,
      },
      dedupeKey: config.dedupe_key || `${node.id}:${Date.now()}`,
      caseId: context.case?.id ?? null,
      workspaceId: scope.workspaceId,
      status: 'processed',
    });
    context.integration = { connectorId, system: connector.system, capabilityKey, canonicalEventId: canonicalEvent.id };
    return { status: 'completed', output: context.integration };
  }

  if (node.key === 'connector.check_health') {
    const connectorId = config.connector_id || config.connectorId || config.connector;
    if (!connectorId) return { status: 'failed', error: 'connector.check_health requires connector id' };
    const connector = await integrationRepository.getConnector({ tenantId: scope.tenantId }, connectorId);
    if (!connector) return { status: 'failed', error: 'Connector not found' };
    const healthy = !['disabled', 'error', 'failed'].includes(String(connector.status || connector.health_status || '').toLowerCase());
    context.integration = { connectorId, system: connector.system, healthy, status: connector.status ?? connector.health_status ?? 'unknown' };
    return { status: healthy ? 'completed' : 'blocked', output: context.integration };
  }

  if (node.key === 'connector.emit_event') {
    const connectorId = config.connector_id || config.connectorId || config.connector;
    const connector = connectorId ? await integrationRepository.getConnector({ tenantId: scope.tenantId }, connectorId) : null;
    const sourceSystem = connector?.system || config.source_system || config.sourceSystem || 'workflow';
    const eventType = config.event_type || config.eventType || config.capability || 'workflow.event';
    const canonicalEvent = await integrationRepository.createCanonicalEvent({ tenantId: scope.tenantId }, {
      sourceSystem,
      sourceEntityType: config.source_entity_type || config.sourceEntityType || 'workflow',
      sourceEntityId: config.source_entity_id || config.sourceEntityId || node.id,
      eventType,
      eventCategory: config.event_category || config.eventCategory || 'workflow',
      canonicalEntityType: config.entity_type || config.entityType || (context.case ? 'case' : 'workflow'),
      canonicalEntityId: config.entity_id || config.entityId || context.case?.id || node.id,
      normalizedPayload: { nodeId: node.id, trigger: context.trigger, data: context.data },
      dedupeKey: config.dedupe_key || `${node.id}:${eventType}:${Date.now()}`,
      caseId: context.case?.id ?? null,
      workspaceId: scope.workspaceId,
      status: 'processed',
    });
    context.integration = { sourceSystem, eventType, canonicalEventId: canonicalEvent.id };
    return { status: 'completed', output: context.integration };
  }

  // ── Notification nodes ──────────────────────────────────────────────────────
  if (node.key === 'notification.email') {
    const to = resolveTemplateValue(config.to || config.email || context.customer?.email || context.case?.customer_email || '', context);
    const subject = resolveTemplateValue(config.subject || 'Update from support', context);
    const content = resolveTemplateValue(config.content || config.body || config.message || '', context);
    if (!to) return { status: 'failed', error: 'notification.email: no recipient — set "to" or ensure customer.email is in context' };
    const result = await sendEmail(to, subject, content, config.ref || context.case?.id || 'workflow').catch((err: any) => ({ messageId: null, simulated: false, error: String(err?.message ?? err) }));
    if ((result as any).error) return { status: 'failed', error: `Email send failed: ${(result as any).error}` };
    return { status: 'completed', output: { to, subject, messageId: result.messageId, simulated: result.simulated } };
  }

  if (node.key === 'notification.whatsapp') {
    const to = resolveTemplateValue(config.to || config.phone || context.customer?.phone || '', context);
    const content = resolveTemplateValue(config.content || config.body || config.message || '', context);
    if (!to) return { status: 'failed', error: 'notification.whatsapp: no recipient — set "to" or ensure customer.phone is in context' };
    const result = await sendWhatsApp(to, content).catch((err: any) => ({ messageId: null, simulated: false, error: String(err?.message ?? err) }));
    if ((result as any).error) return { status: 'failed', error: `WhatsApp send failed: ${(result as any).error}` };
    return { status: 'completed', output: { to, messageId: result.messageId, simulated: result.simulated } };
  }

  if (node.key === 'notification.sms') {
    const to = resolveTemplateValue(config.to || config.phone || context.customer?.phone || '', context);
    const content = resolveTemplateValue(config.content || config.body || config.message || '', context);
    if (!to) return { status: 'failed', error: 'notification.sms: no recipient — set "to" or ensure customer.phone is in context' };
    const result = await sendSms(to, content).catch((err: any) => ({ messageId: null, simulated: false, error: String(err?.message ?? err) }));
    if ((result as any).error) return { status: 'failed', error: `SMS send failed: ${(result as any).error}` };
    return { status: 'completed', output: { to, messageId: result.messageId, simulated: result.simulated } };
  }

  // ── AI text generation (real Gemini) ────────────────────────────────────────
  if (node.key === 'ai.generate_text') {
    const prompt = resolveTemplateValue(config.prompt || config.content || config.input || '', context);
    if (!prompt) return { status: 'failed', error: 'ai.generate_text: prompt is required' };
    const geminiKey = appConfig.ai.geminiApiKey;
    if (!geminiKey) {
      // Graceful fallback when no API key configured
      const fallback = `[AI unavailable — configure GEMINI_API_KEY] ${prompt.slice(0, 120)}`;
      const target = config.target || config.output || 'generatedText';
      context.agent = { ...(context.agent ?? {}), [target]: fallback };
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: fallback };
      return { status: 'completed', output: { text: fallback, target, simulated: true } };
    }
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: appConfig.ai.geminiModel || 'gemini-2.5-pro' });
    const systemInstruction = resolveTemplateValue(config.system || config.systemPrompt || '', context);
    const fullPrompt = systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt;
    const maxTokens = Number(config.maxTokens || config.max_tokens || 512);
    const result = await withGeminiRetry(
      () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: fullPrompt }] }], generationConfig: { maxOutputTokens: maxTokens } }),
      { label: 'workflow.ai.generate_text' },
    );
    const text = result.response.text().trim();
    const target = config.target || config.output || 'generatedText';
    context.agent = { ...(context.agent ?? {}), [target]: text };
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: text };
    return { status: 'completed', output: { text, target, length: text.length } };
  }

  // ── Core: Code (sandboxed JavaScript) ───────────────────────────────────────
  if (node.key === 'core.code') {
    const language = String(config.language || 'javascript').toLowerCase();
    if (language !== 'javascript') {
      return { status: 'failed', error: `core.code: language '${language}' not supported. Only 'javascript' is available.` };
    }
    const code = String(config.code || '').trim();
    if (!code) return { status: 'failed', error: 'core.code: code is required' };
    const timeoutMs = Math.min(30_000, Math.max(50, Number(config.timeoutMs || 2000)));
    const target = String(config.target || 'codeResult');
    try {
      const sandboxContext = {
        // Read-only snapshot of workflow context — code can mutate locally without
        // affecting the real context object.
        context: cloneJson(context ?? {}),
        data: cloneJson(context.data ?? {}),
        trigger: cloneJson(context.trigger ?? {}),
        // Safe globals
        JSON,
        Math,
        Date,
        Number,
        String,
        Array,
        Object,
        Boolean,
        console: {
          log: (...args: any[]) => logger.info('core.code log', { nodeId: node.id, args }),
        },
      };
      const wrappedSource = `(function userCode() { ${code} })()`;
      const script = new vm.Script(wrappedSource, { filename: `workflow-node-${node.id}.js` });
      const ctx = vm.createContext(sandboxContext);
      const value = script.runInContext(ctx, { timeout: timeoutMs, breakOnSigint: true });
      const safeValue = (() => {
        try { return JSON.parse(JSON.stringify(value ?? null)); } catch { return null; }
      })();
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: safeValue };
      return { status: 'completed', output: { data: context.data, target, value: safeValue } };
    } catch (err: any) {
      return { status: 'failed', error: `core.code execution failed: ${err?.message ?? String(err)}` };
    }
  }

  // ── Core: Data table CRUD ───────────────────────────────────────────────────
  if (node.key === 'core.data_table_op') {
    const tableId = String(config.tableId || config.table_id || '');
    if (!tableId) return { status: 'failed', error: 'core.data_table_op: tableId is required' };
    const operation = String(config.operation || 'list');
    const target = String(config.target || 'tableResult');

    // Load workspace and read tables from settings.workflows.dataTables
    const workspace = await workspaceRepository.getById(scope.workspaceId, scope.tenantId);
    if (!workspace) return { status: 'failed', error: 'core.data_table_op: workspace not found' };
    const settings = (workspace.settings && typeof workspace.settings === 'object' ? workspace.settings : {}) as any;
    const wfSettings = (settings.workflows && typeof settings.workflows === 'object' ? settings.workflows : {}) as any;
    const tables: any[] = Array.isArray(wfSettings.dataTables) ? wfSettings.dataTables : [];
    const table = tables.find((t) => t && t.id === tableId);
    if (!table) {
      return { status: 'failed', error: `core.data_table_op: data table '${tableId}' not found in workspace. Create it under Workflows → Data tables.` };
    }
    const rows: any[] = Array.isArray(table.rows) ? table.rows : [];
    const matchField = config.matchField ? String(config.matchField) : 'id';
    const matchValueRaw = config.matchValue !== undefined ? resolveTemplateValue(String(config.matchValue), context) : undefined;

    const persistTables = async (nextRows: any[]) => {
      const updatedTables = tables.map((t) => (t.id === tableId ? { ...t, rows: nextRows, updated_at: new Date().toISOString() } : t));
      const nextSettings = {
        ...settings,
        workflows: { ...wfSettings, dataTables: updatedTables },
      };
      await workspaceRepository.updateSettings(scope.workspaceId, nextSettings);
    };

    if (operation === 'list') {
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: rows };
      return { status: 'completed', output: { data: context.data, count: rows.length, target } };
    }
    if (operation === 'find') {
      const found = rows.find((r) => String(r?.[matchField] ?? '') === String(matchValueRaw ?? ''));
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: found ?? null };
      return { status: 'completed', output: { data: context.data, found: !!found, target } };
    }
    if (operation === 'insert') {
      const row = parseMaybeJsonObject(config.row);
      if (Object.keys(row).length === 0) return { status: 'failed', error: 'core.data_table_op insert: row data is required' };
      const nextRows = [...rows, row];
      await persistTables(nextRows);
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: row };
      return { status: 'completed', output: { data: context.data, target, inserted: true } };
    }
    if (operation === 'update') {
      const row = parseMaybeJsonObject(config.row);
      const nextRows = rows.map((r) => (String(r?.[matchField] ?? '') === String(matchValueRaw ?? '') ? { ...r, ...row } : r));
      const updatedCount = nextRows.filter((r, i) => r !== rows[i]).length;
      if (updatedCount > 0) await persistTables(nextRows);
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: { updated: updatedCount } };
      return { status: 'completed', output: { data: context.data, target, updated: updatedCount } };
    }
    if (operation === 'upsert') {
      const row = parseMaybeJsonObject(config.row);
      const idx = rows.findIndex((r) => String(r?.[matchField] ?? '') === String(matchValueRaw ?? ''));
      const nextRows = idx >= 0 ? rows.map((r, i) => (i === idx ? { ...r, ...row } : r)) : [...rows, row];
      await persistTables(nextRows);
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: row };
      return { status: 'completed', output: { data: context.data, target, mode: idx >= 0 ? 'updated' : 'inserted' } };
    }
    if (operation === 'delete') {
      const before = rows.length;
      const nextRows = rows.filter((r) => String(r?.[matchField] ?? '') !== String(matchValueRaw ?? ''));
      const deleted = before - nextRows.length;
      if (deleted > 0) await persistTables(nextRows);
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: { deleted } };
      return { status: 'completed', output: { data: context.data, target, deleted } };
    }
    return { status: 'failed', error: `core.data_table_op: unsupported operation '${operation}'` };
  }

  // ── Core: Respond to webhook ────────────────────────────────────────────────
  if (node.key === 'core.respond_webhook') {
    const statusCode = Math.max(100, Math.min(599, Number(config.statusCode || 200)));
    const contentType = String(config.contentType || 'application/json');
    const bodyTemplate = config.body || '';
    const resolvedBody = resolveTemplateValue(bodyTemplate, context);
    let payload: any = resolvedBody;
    if (contentType === 'application/json') {
      try { payload = JSON.parse(resolvedBody); } catch { /* keep raw */ }
    }
    // Stash the response on the context. The webhook trigger handler reads this
    // when finalizing the run and uses it as the actual HTTP response body.
    context.webhookResponse = { statusCode, contentType, body: payload };
    return { status: 'completed', output: { statusCode, contentType, body: payload } };
  }

  // ── AI: Information extractor (structured output) ───────────────────────────
  if (node.key === 'ai.information_extractor') {
    const text = resolveTemplateValue(config.text || '', context);
    if (!text) return { status: 'failed', error: 'ai.information_extractor: text is required' };
    const schemaRaw = config.schema || '';
    const schema = parseMaybeJsonObject(schemaRaw);
    if (Object.keys(schema).length === 0) return { status: 'failed', error: 'ai.information_extractor: a JSON schema is required' };
    const geminiKey = appConfig.ai.geminiApiKey;
    if (!geminiKey) return { status: 'failed', error: 'ai.information_extractor: GEMINI_API_KEY not configured' };
    const target = String(config.target || 'extracted');
    const modelName = String(config.model || appConfig.ai.geminiModel || 'gemini-2.5-flash');
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    const prompt = `Extract structured information from the following text and return ONLY a JSON object that matches this schema:\n\nSchema: ${JSON.stringify(schema)}\n\nText:\n${text}\n\nReturn valid JSON only.`;
    const result = await withGeminiRetry(
      () => model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024 },
      }),
      { label: 'workflow.ai.information_extractor' },
    );
    const raw = result.response.text().trim();
    let extracted: any = {};
    try { extracted = JSON.parse(raw); } catch { extracted = { _raw: raw, _error: 'Model did not return valid JSON' }; }
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: extracted };
    return { status: 'completed', output: { data: context.data, target, model: modelName } };
  }

  // ── Google Gemini (explicit AI provider node) ───────────────────────────────
  if (node.key === 'ai.gemini') {
    const prompt = resolveTemplateValue(config.prompt || config.content || config.input || '', context);
    if (!prompt) return { status: 'failed', error: 'ai.gemini: prompt is required' };
    const geminiKey = appConfig.ai.geminiApiKey;
    if (!geminiKey) {
      return { status: 'failed', error: 'ai.gemini: GEMINI_API_KEY not configured. Add it under Integrations → AI providers.' };
    }
    const operation = String(config.operation || 'generate_text');
    const systemInstruction = resolveTemplateValue(config.systemInstruction || config.system || '', context);
    const modelName = String(config.model || appConfig.ai.geminiModel || 'gemini-2.5-pro');
    const temperature = config.temperature !== undefined && config.temperature !== '' ? Number(config.temperature) : undefined;
    const maxTokens = Number(config.maxTokens || config.max_tokens || 1024);
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      ...(systemInstruction ? { systemInstruction } : {}),
    });
    const generationConfig: any = { maxOutputTokens: maxTokens };
    if (temperature !== undefined && Number.isFinite(temperature)) generationConfig.temperature = temperature;
    if (operation === 'extract_structured') {
      generationConfig.responseMimeType = 'application/json';
    }
    const result = await withGeminiRetry(
      () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
      { label: `workflow.ai.gemini.${operation}` },
    );
    const text = result.response.text().trim();
    let parsed: any = text;
    if (operation === 'extract_structured') {
      try { parsed = JSON.parse(text); } catch { /* keep as text */ }
    }
    const target = String(config.target || 'geminiResult');
    context.agent = { ...(context.agent ?? {}), [target]: parsed };
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: parsed };
    return { status: 'completed', output: { result: parsed, model: modelName, operation, target, length: text.length } };
  }

  // ── External messaging wrappers ─────────────────────────────────────────────
  // Each message.* node validates that the corresponding integration is connected,
  // then emits a canonical event. Real transport (sending the actual message via
  // Slack/Discord/etc API) is owned by Phase 5 — for now we record the intent and
  // return success when the connector is healthy, blocked when it's not.
  if (node.key.startsWith('message.')) {
    const system = node.key.split('.')[1]; // slack, discord, telegram, gmail, outlook, teams, google_chat
    // Find a connector for this system in this tenant
    const allConnectors = await integrationRepository.listConnectors({ tenantId: scope.tenantId });
    const connector = allConnectors.find((c: any) => String(c.system || '').toLowerCase() === system);
    if (!connector) {
      return {
        status: 'failed',
        error: `${node.label || node.key}: ${system} is not configured. Open Integrations and connect ${system} first.`,
      };
    }
    const status = String(connector.status || connector.health_status || '').toLowerCase();
    if (['error', 'failed', 'disabled'].includes(status)) {
      return {
        status: 'blocked',
        output: { reason: `${system} connector is in '${status}' state. Reconnect it in Integrations.`, connectorId: connector.id, system },
      };
    }
    // Resolve the per-channel destination + message body
    const dest = resolveTemplateValue(
      config.channel || config.chatId || config.to || config.space || '',
      context,
    );
    const content = resolveTemplateValue(config.content || config.body || config.message || '', context);
    if (!dest) {
      return { status: 'failed', error: `${node.key}: destination (channel / to / chatId / space) is required.` };
    }
    if (!content) {
      return { status: 'failed', error: `${node.key}: message content is required.` };
    }
    // Record the send intent as a canonical event so it appears in the integration timeline
    const canonicalEvent = await integrationRepository.createCanonicalEvent({ tenantId: scope.tenantId }, {
      sourceSystem: system,
      sourceEntityType: 'workflow',
      sourceEntityId: node.id,
      eventType: `${system}.message.sent`,
      eventCategory: 'workflow',
      canonicalEntityType: context.case ? 'case' : 'workflow',
      canonicalEntityId: context.case?.id || node.id,
      normalizedPayload: {
        nodeId: node.id,
        destination: dest,
        content,
        config,
      },
      dedupeKey: `${node.id}:${system}:${Date.now()}`,
      caseId: context.case?.id ?? null,
      workspaceId: scope.workspaceId,
      status: 'processed',
    });
    context.integration = { connectorId: connector.id, system, destination: dest, canonicalEventId: canonicalEvent.id };
    return {
      status: 'completed',
      output: {
        system,
        connectorId: connector.id,
        destination: dest,
        canonicalEventId: canonicalEvent.id,
        // Phase 1 records the intent — Phase 5 will replace this with real transport.
        delivery: 'recorded',
      },
    };
  }

  // ── HTTP request (outbound) ──────────────────────────────────────────────────
  if (node.key === 'data.http_request') {
    const url = resolveTemplateValue(config.url || config.endpoint || '', context);
    if (!url) return { status: 'failed', error: 'data.http_request: url is required' };
    const method = String(config.method || 'GET').toUpperCase();
    const rawHeaders = parseMaybeJsonObject(config.headers);
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...rawHeaders };
    const bodyTemplate = config.body || config.payload || '';
    const bodyStr = bodyTemplate ? resolveTemplateValue(bodyTemplate, context) : undefined;
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: bodyStr && method !== 'GET' && method !== 'HEAD' ? bodyStr : undefined,
        signal: AbortSignal.timeout(15_000),
      });
      const responseText = await response.text();
      let responseData: any = responseText;
      try { responseData = JSON.parse(responseText); } catch { /* keep as string */ }
      const target = config.target || config.output || 'httpResponse';
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: responseData };
      return {
        status: response.ok ? 'completed' : 'failed',
        output: { status: response.status, ok: response.ok, data: responseData, target },
        ...(response.ok ? {} : { error: `HTTP ${response.status} ${response.statusText}` }),
      };
    } catch (fetchErr: any) {
      return { status: 'failed', error: `HTTP request failed: ${fetchErr?.message ?? String(fetchErr)}` };
    }
  }

  if (['agent', 'integration', 'knowledge'].includes(node.type)) {
    return { status: 'failed', error: `Unsupported ${node.type} node key: ${node.key}` };
  }

  if (node.key === 'delay' || node.key === 'flow.wait') {
    const duration = config.duration || config.timeout || null;
    // Store delay expiry in context so the scheduler can resume at the right time
    const delayUntil = duration ? resolveDelayUntil(duration) : null;
    context.delayUntil = delayUntil;
    return { status: 'waiting', output: { delay: duration || 'manual_resume', delayUntil } };
  }

  if (node.key === 'flow.merge') {
    return { status: 'completed', output: { merged: true, mode: config.mode || 'wait-all' } };
  }

  if (node.key === 'flow.loop') {
    const items = asArray(readContextPath(context, config.source || 'data.items'));
    const maxIterations = Math.max(1, Number(config.maxIterations || config.max_iterations || 100));
    const batchSize = Math.max(1, Number(config.batchSize || config.batch_size || 1));
    const batches = [];
    for (let index = 0; index < Math.min(items.length, maxIterations); index += batchSize) {
      batches.push(items.slice(index, index + batchSize));
    }
    context.loop = { items, batches, index: 0, count: items.length, batchSize, maxIterations };
    return { status: 'completed', output: { looped: true, count: items.length, batches: batches.length, batchSize, maxIterations } };
  }

  if (node.key === 'flow.subworkflow') {
    const subWorkflowId = config.workflow || config.workflowId || null;
    if (!subWorkflowId) return { status: 'failed', error: 'flow.subworkflow requires workflow id' };
    const definition = await workflowRepository.getDefinition(subWorkflowId, scope.tenantId, scope.workspaceId);
    if (!definition) return { status: 'failed', error: 'Sub-workflow not found' };
    const version = definition.current_version_id
      ? await workflowRepository.getVersion(definition.current_version_id)
      : await workflowRepository.getLatestVersion(definition.id);
    if (!version) return { status: 'failed', error: 'Sub-workflow has no version' };
    const nestedDepth = Number(context.__subworkflowDepth || 0);
    if (nestedDepth >= 3) return { status: 'blocked', output: { reason: 'Sub-workflow nesting limit reached', subWorkflowId } };
    const result = await executeWorkflowVersion({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      workflowId: definition.id,
      version,
      triggerPayload: {
        ...(parseMaybeJsonObject(config.input) || {}),
        parentWorkflowNodeId: node.id,
        parentContext: {
          caseId: context.case?.id,
          orderId: context.order?.id,
          paymentId: context.payment?.id,
          returnId: context.return?.id,
          data: context.data,
        },
        __subworkflowDepth: nestedDepth + 1,
      },
      triggerType: 'subworkflow',
    });
    context.subworkflow = { subWorkflowId, runId: result.id, status: result.status };
    return { status: result.status === 'completed' ? 'completed' : 'waiting', output: context.subworkflow, error: result.error ?? null };
  }

  if (node.key === 'flow.stop_error') {
    return { status: 'failed', error: config.errorMessage || 'Stopped by flow.stop_error', output: { stopped: true } };
  }

  if (node.key === 'flow.noop') {
    return { status: 'completed', output: { passedThrough: true } };
  }

  if (node.key === 'stop') {
    return { status: 'stopped', output: { stopped: true } };
  }

  return { status: 'completed', output: { simulated: true, key: node.key } };
}

async function executeWorkflowNodeWithRetry(scope: { tenantId: string; workspaceId: string; userId?: string }, node: any, context: any) {
  const retries = Math.max(0, Number(node.retryPolicy?.retries ?? node.retry_policy?.retries ?? 0));
  const backoffMs = Math.max(0, Number(node.retryPolicy?.backoffMs ?? node.retry_policy?.backoffMs ?? 0));
  let attempt = 0;
  let lastResult: any = null;
  while (attempt <= retries) {
    const result = await executeWorkflowNode(scope, node, context);
    lastResult = { ...result, attempt, maxRetries: retries };
    if (!['failed'].includes(String(result.status))) return lastResult;
    if (attempt >= retries) return lastResult;
    if (backoffMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(backoffMs, 1_500)));
    }
    attempt += 1;
  }
  return lastResult ?? { status: 'failed', error: 'Node execution failed before producing a result', attempt, maxRetries: retries };
}

async function executeWorkflowVersion({
  tenantId,
  workspaceId,
  userId,
  workflowId,
  version,
  triggerPayload,
  triggerType = 'manual',
  retryOfRunId = null,
}: {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  workflowId: string;
  version: any;
  triggerPayload: any;
  triggerType?: string;
  retryOfRunId?: string | null;
}) {
  const validation = validateWorkflowDefinition(version.nodes ?? [], version.edges ?? []);
  if (!validation.ok) {
    const error: any = new Error('Workflow is not executable');
    error.statusCode = 422;
    error.validation = validation;
    throw error;
  }

  const supabase = getSupabaseAdmin();
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  const workflowContext = await buildWorkflowContext(
    { tenantId, workspaceId, userId },
    triggerPayload ?? {},
  );
  const caseId = triggerPayload?.caseId ?? triggerPayload?.case_id ?? workflowContext.case?.id ?? null;

  const { error: runError } = await supabase.from('workflow_runs').insert({
    id: runId,
    workflow_version_id: version.id,
    case_id: caseId,
    tenant_id: tenantId,
    trigger_type: triggerType,
    trigger_payload: triggerPayload ?? {},
    status: 'running',
    current_node_id: getStartNode(validation.nodes)?.id ?? null,
    context: { dryRun: false, source: retryOfRunId ? 'workflow_retry' : 'workflow_api', retryOfRunId, workflowContext },
    started_at: now,
    ended_at: null,
    error: null,
  });
  if (runError) throw runError;

  // Broadcast run started
  broadcastSSE(tenantId, 'workflow:run:started', {
    runId, workflowId: version.workflow_id ?? '', versionId: version.id,
    triggerType: triggerType ?? 'manual', startedAt: now,
  });

  const steps: any[] = [];
  // BFS queue: each entry carries the node plus the input data snapshot for that branch
  const queue: Array<{ node: any; branchInput: any; order: number }> = [
    { node: getStartNode(validation.nodes), branchInput: triggerPayload ?? {}, order: 0 },
  ];
  const visited = new Set<string>();
  let finalStatus = 'completed';
  let finalError: string | null = null;
  const MAX_STEPS = validation.nodes.length * 4; // guard against runaway graphs

  while (queue.length > 0 && steps.length < MAX_STEPS) {
    const { node: currentNode, branchInput, order } = queue.shift()!;
    if (!currentNode || visited.has(currentNode.id)) continue;
    visited.add(currentNode.id);

    const startedAt = new Date().toISOString();
    const result = await executeWorkflowNodeWithRetry({ tenantId, workspaceId, userId }, currentNode, workflowContext);
    const endedAt = new Date().toISOString();

    const step = {
      id: crypto.randomUUID(),
      workflow_run_id: runId,
      node_id: currentNode.id,
      node_type: currentNode.type,
      status: result.status,
      input: order === 0 ? branchInput : { fromPreviousStep: true },
      output: result.output ?? {},
      started_at: startedAt,
      ended_at: endedAt,
      error: (result as any).error ?? null,
    };
    steps.push(step);

    workflowContext.lastOutput = result.output ?? null;
    workflowContext.lastNode = { id: currentNode.id, key: currentNode.key, label: currentNode.label, status: result.status };
    if (result.output && typeof result.output === 'object' && !Array.isArray(result.output)) {
      workflowContext.data = (result.output as any).data ?? result.output;
    }

    if (['failed', 'blocked', 'waiting_approval', 'waiting', 'stopped'].includes(result.status)) {
      // Blocking result: record final status, drain remaining queue as skipped
      finalStatus = result.status === 'waiting_approval' ? 'waiting' : result.status;
      finalError = (result as any).error ?? (result.output as any)?.reason ?? null;
      break;
    }

    // Enqueue next nodes (may be multiple for flow.branch fan-out)
    const nextNodes = pickNextNodes(validation.nodes, validation.edges, currentNode, workflowContext);
    for (const nextNode of nextNodes) {
      if (!visited.has(nextNode.id)) {
        queue.push({ node: nextNode, branchInput: result.output ?? {}, order: order + 1 });
      }
    }
  }

  // Cycle detection: if queue still has items that were already visited
  if (steps.length >= MAX_STEPS) {
    finalStatus = 'failed';
    finalError = 'Workflow exceeded maximum step count — possible cycle detected';
  }

  if (steps.length > 0) {
    const { error: stepsError } = await supabase.from('workflow_run_steps').insert(steps);
    if (stepsError) throw stepsError;
  }

  const { error: updateRunError } = await supabase.from('workflow_runs').update({
    status: finalStatus,
    current_node_id: steps.at(-1)?.node_id ?? null,
    context: { dryRun: false, source: retryOfRunId ? 'workflow_retry' : 'workflow_api', retryOfRunId, workflowContext },
    ended_at: ['completed', 'failed', 'blocked', 'stopped'].includes(finalStatus) ? new Date().toISOString() : null,
    error: finalError,
  }).eq('id', runId).eq('tenant_id', tenantId);
  if (updateRunError) throw updateRunError;

  await auditRepository.logEvent({ tenantId, workspaceId }, {
    actorId: userId ?? 'system',
    action: finalStatus === 'completed' ? 'WORKFLOW_RUN_COMPLETED' : 'WORKFLOW_RUN_PAUSED',
    entityType: 'workflow',
    entityId: workflowId,
    metadata: { runId, retryOfRunId, stepCount: steps.length, finalStatus, finalError },
  });

  // Broadcast run completed/failed/paused
  broadcastSSE(tenantId, 'workflow:run:updated', {
    runId,
    workflowId: workflowId ?? '',
    status: finalStatus,
    stepCount: steps.length,
    error: finalError,
    endedAt: new Date().toISOString(),
  });

  return { id: runId, status: finalStatus, error: finalError, steps, retryOfRunId };
}

async function continueWorkflowRun({
  tenantId,
  workspaceId,
  userId,
  run,
  version,
  resumePayload,
}: {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  run: any;
  version: any;
  resumePayload?: any;
}) {
  if (!PAUSED_STATUSES.has(String(run.status))) {
    const error: any = new Error('Workflow run is not paused or waiting');
    error.statusCode = 409;
    throw error;
  }

  const validation = validateWorkflowDefinition(version.nodes ?? [], version.edges ?? []);
  if (!validation.ok) {
    const error: any = new Error('Workflow is not executable');
    error.statusCode = 422;
    error.validation = validation;
    throw error;
  }

  const supabase = getSupabaseAdmin();
  const workflowContext = {
    ...(run.context?.workflowContext ?? {}),
    resume: {
      resumedAt: new Date().toISOString(),
      resumedBy: userId ?? 'system',
      payload: resumePayload ?? {},
    },
  };

  const currentNode = validation.nodes.find((node: any) => node.id === run.current_node_id) ?? null;
  let nextNode = currentNode
    ? pickNextNode(validation.nodes, validation.edges, currentNode, workflowContext)
    : getStartNode(validation.nodes);

  const resumedStep = {
    id: crypto.randomUUID(),
    workflow_run_id: run.id,
    node_id: run.current_node_id ?? 'resume',
    node_type: 'resume',
    status: 'resumed',
    input: resumePayload ?? {},
    output: { resumed: true, previousStatus: run.status },
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    error: null,
  };

  const steps: any[] = [resumedStep];
  const visited = new Set<string>();
  let finalStatus = 'completed';
  let finalError: string | null = null;
  let guard = 0;

  await supabase
    .from('workflow_runs')
    .update({ status: 'running', ended_at: null, error: null })
    .eq('id', run.id)
    .eq('tenant_id', tenantId);

  while (nextNode && !visited.has(nextNode.id) && guard < validation.nodes.length) {
    visited.add(nextNode.id);
    const startedAt = new Date().toISOString();
    const result = await executeWorkflowNodeWithRetry({ tenantId, workspaceId, userId }, nextNode, workflowContext);
    const endedAt = new Date().toISOString();
    steps.push({
      id: crypto.randomUUID(),
      workflow_run_id: run.id,
      node_id: nextNode.id,
      node_type: nextNode.type,
      status: result.status,
      input: { resumed: true, fromPreviousStep: true },
      output: result.output ?? {},
      started_at: startedAt,
      ended_at: endedAt,
      error: result.error ?? null,
    });
    workflowContext.lastOutput = result.output ?? null;
    workflowContext.lastNode = { id: nextNode.id, key: nextNode.key, label: nextNode.label, status: result.status };
    if (result.output && typeof result.output === 'object' && !Array.isArray(result.output)) {
      workflowContext.data = result.output.data ?? result.output;
    }
    guard += 1;

    if (['failed', 'blocked', 'waiting_approval', 'waiting', 'stopped'].includes(result.status)) {
      finalStatus = result.status === 'waiting_approval' ? 'waiting' : result.status;
      finalError = result.error ?? result.output?.reason ?? null;
      break;
    }

    nextNode = pickNextNode(validation.nodes, validation.edges, nextNode, workflowContext);
  }

  if (nextNode && visited.has(nextNode.id)) {
    finalStatus = 'failed';
    finalError = `Cycle detected at node ${nextNode.label ?? nextNode.id}`;
  }

  const { error: stepsError } = await supabase.from('workflow_run_steps').insert(steps);
  if (stepsError) throw stepsError;

  const { error: runError } = await supabase.from('workflow_runs').update({
    status: finalStatus,
    current_node_id: steps.at(-1)?.node_id ?? run.current_node_id,
    context: { ...(run.context ?? {}), workflowContext, resumedFromRunId: run.id },
    ended_at: ['completed', 'failed', 'blocked', 'stopped', 'cancelled'].includes(finalStatus) ? new Date().toISOString() : null,
    error: finalError,
  }).eq('id', run.id).eq('tenant_id', tenantId);
  if (runError) throw runError;

  await auditRepository.logEvent({ tenantId, workspaceId }, {
    actorId: userId ?? 'system',
    action: finalStatus === 'completed' ? 'WORKFLOW_RUN_RESUMED_COMPLETED' : 'WORKFLOW_RUN_RESUMED_PAUSED',
    entityType: 'workflow_run',
    entityId: run.id,
    metadata: { finalStatus, finalError, stepCount: steps.length },
  });

  return { id: run.id, status: finalStatus, error: finalError, steps };
}

router.get('/', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wfs = await workflowRepository.listDefinitions(tenantId, workspaceId);

    const enriched = await Promise.all(wfs.map(async (workflow: any) => {
      const metrics = await workflowRepository.getMetrics(workflow.id, tenantId);
      const health_status =
        metrics.failed > 0 ? 'warning'
        : workflow.version_status === 'draft' ? 'needs_setup'
        : 'active';

      return {
        ...workflow,
        metrics,
        health_status,
        health_message: health_status === 'warning' ? 'Recent workflow failures detected' : undefined,
        last_run_at: metrics.last_run_at,
      };
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Error fetching workflows:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requirePermission('workflows.write'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const workflowId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const {
      name = 'New workflow draft',
      description = 'Draft workflow created from template',
      nodes = [],
      edges = [],
      trigger = { type: 'manual' },
    } = req.body ?? {};
    const normalizedNodes = normalizeNodes(nodes);
    const normalizedEdges = normalizeEdges(edges);

    await workflowRepository.createDefinition({
      id: workflowId,
      tenantId,
      workspaceId,
      name,
      description,
      currentVersionId: null,
      createdBy: req.userId ?? 'system',
    });

    try {
      await workflowRepository.createVersion({
        id: versionId,
        workflowId,
        versionNumber: 1,
        status: 'draft',
        nodes: normalizedNodes,
        edges: normalizedEdges,
        trigger: parseMaybeJsonObject(trigger),
        tenantId,
      });

      await workflowRepository.updateDefinition(workflowId, tenantId, workspaceId, {
        currentVersionId: versionId,
      });
    } catch (versionError) {
      const supabase = getSupabaseAdmin();
      // Best-effort cleanup — ignore errors so the original error propagates
      try { await supabase.from('workflow_versions').delete().eq('id', versionId); } catch { /* ignore */ }
      try { await supabase.from('workflow_definitions').delete().eq('id', workflowId).eq('tenant_id', tenantId).eq('workspace_id', workspaceId); } catch { /* ignore */ }
      throw versionError;
    }

    const workflow = await workflowRepository.getDefinition(workflowId, tenantId, workspaceId);
    const version = await workflowRepository.getVersion(versionId);

    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_CREATED',
      entityType: 'workflow',
      entityId: workflowId,
      newValue: { workflow, version },
    });

    res.status(201).json({
      ...workflow,
      current_version: version,
      metrics: await workflowRepository.getMetrics(workflowId, tenantId),
    });
  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/catalog', requirePermission('workflows.read'), async (_req: MultiTenantRequest, res) => {
  res.json({
    categories: Array.from(new Set(NODE_CATALOG.map((node) => node.category))),
    nodes: NODE_CATALOG.map((node) => {
      const contract = getNodeContract(node.key);
      return {
        ...node,
        configFields: getConfigFieldsForNode(node.key),
        requiredFields: contract.required ?? [],
        branchLabels: contract.branchLabels ?? [],
        sideEffects: contract.sideEffects ?? 'none',
        risk: contract.risk ?? (node.sensitive ? 'high' : 'low'),
        resumable: Boolean(contract.resumable),
      };
    }),
  });
});

router.get('/runs/recent', async (req: MultiTenantRequest, res) => {
  try {
    const runs = await workflowRepository.listRecentRuns(req.tenantId!);
    res.json(runs);
  } catch (error) {
    console.error('Error fetching recent runs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/runs/:runId', requirePermission('workflows.read'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const supabase = getSupabaseAdmin();
    const { data: run, error: runError } = await supabase
      .from('workflow_runs')
      .select('*, workflow_versions!inner(workflow_id, workflow_definitions!workflow_versions_workflow_id_fkey(name)), cases(case_number)')
      .eq('id', req.params.runId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (runError) throw runError;
    if (!run) return res.status(404).json({ error: 'Workflow run not found' });

    const { data: steps, error: stepsError } = await supabase
      .from('workflow_run_steps')
      .select('*')
      .eq('workflow_run_id', run.id)
      .order('started_at', { ascending: true });
    if (stepsError) throw stepsError;

    res.json({
      ...run,
      workflow_name: run.workflow_versions?.workflow_definitions?.name,
      workflow_id: run.workflow_versions?.workflow_id,
      case_number: run.cases?.case_number,
      steps: steps ?? [],
    });
  } catch (error) {
    console.error('Error fetching workflow run:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/runs/:runId/resume', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const supabase = getSupabaseAdmin();
    const { data: run, error: runError } = await supabase
      .from('workflow_runs')
      .select('*, workflow_versions!inner(id, workflow_id, status, nodes, edges, trigger)')
      .eq('id', req.params.runId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (runError) throw runError;
    if (!run) return res.status(404).json({ error: 'Workflow run not found' });
    const result = await continueWorkflowRun({
      tenantId,
      workspaceId,
      userId: req.userId,
      run,
      version: run.workflow_versions,
      resumePayload: req.body ?? {},
    });

    res.json(result);
  } catch (error) {
    console.error('Error resuming workflow run:', error);
    const status = (error as any)?.statusCode ?? 500;
    res.status(status).json({ error: status === 409 ? (error as Error).message : 'Internal server error', validation: (error as any)?.validation });
  }
});

router.post('/runs/:runId/cancel', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { data: run, error: fetchError } = await supabase
      .from('workflow_runs')
      .select('*')
      .eq('id', req.params.runId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!run) return res.status(404).json({ error: 'Workflow run not found' });

    const { error } = await supabase
      .from('workflow_runs')
      .update({
        status: 'cancelled',
        ended_at: now,
        error: req.body?.reason ?? 'Cancelled manually',
        context: { ...(run.context ?? {}), cancelledAt: now, cancelledBy: req.userId ?? 'system' },
      })
      .eq('id', req.params.runId)
      .eq('tenant_id', tenantId);
    if (error) throw error;

    const step = {
      id: crypto.randomUUID(),
      workflow_run_id: req.params.runId,
      node_id: run.current_node_id ?? 'cancel',
      node_type: 'cancel',
      status: 'cancelled',
      input: req.body ?? {},
      output: { cancelled: true },
      started_at: now,
      ended_at: now,
      error: req.body?.reason ?? null,
    };
    await supabase.from('workflow_run_steps').insert(step);

    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_RUN_CANCELLED',
      entityType: 'workflow_run',
      entityId: req.params.runId,
      metadata: { reason: req.body?.reason ?? null },
    });

    res.json({ id: req.params.runId, status: 'cancelled', steps: [step] });
  } catch (error) {
    console.error('Error cancelling workflow run:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/runs/:runId/retry', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const supabase = getSupabaseAdmin();
    const { data: previousRun, error: runError } = await supabase
      .from('workflow_runs')
      .select('*, workflow_versions!inner(id, workflow_id, status, nodes, edges, trigger)')
      .eq('id', req.params.runId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (runError) throw runError;
    if (!previousRun) return res.status(404).json({ error: 'Workflow run not found' });

    const version = previousRun.workflow_versions;
    if (!version) return res.status(404).json({ error: 'Workflow version not found for run' });

    await supabase
      .from('workflow_runs')
      .update({ status: 'retrying' })
      .eq('id', previousRun.id)
      .eq('tenant_id', tenantId);

    const result = await executeWorkflowVersion({
      tenantId,
      workspaceId,
      userId: req.userId,
      workflowId: version.workflow_id,
      version,
      triggerPayload: req.body?.triggerPayload ?? previousRun.trigger_payload ?? {},
      triggerType: 'retry',
      retryOfRunId: previousRun.id,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error retrying workflow run:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Core event-dispatch logic — exported so workflowEventBus.ts can call it directly
 * without going through HTTP. Used both by the route handler below and by the bus.
 */
export async function executeWorkflowsByEvent(
  scope: { tenantId: string; workspaceId: string; userId?: string },
  eventType: string,
  payload: Record<string, any> = {},
): Promise<Array<{ workflowId: string; workflowName: string; id: string; status: string }>> {
  const { tenantId, workspaceId, userId } = scope;
  const workflows = await workflowRepository.listDefinitions(tenantId, workspaceId);
  const results: any[] = [];

  for (const workflow of workflows) {
    if (workflow.version_status !== 'published' || !workflow.current_version_id) continue;
    const version = await workflowRepository.getVersion(workflow.current_version_id);
    if (!version || !workflowMatchesTrigger(version, eventType)) continue;

    try {
      const result = await executeWorkflowVersion({
        tenantId,
        workspaceId,
        userId,
        workflowId: workflow.id,
        version,
        triggerPayload: { ...payload, eventType },
        triggerType: normalizeTriggerName(eventType),
      });
      results.push({ workflowId: workflow.id, workflowName: workflow.name, ...result });
    } catch (err: any) {
      logger.warn('executeWorkflowsByEvent: workflow execution failed', {
        workflowId: workflow.id, eventType, error: String(err?.message ?? err),
      });
    }
  }

  if (results.length > 0) {
    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: userId ?? 'system',
      action: 'WORKFLOW_EVENT_TRIGGERED',
      entityType: 'workflow_event',
      entityId: normalizeTriggerName(eventType),
      metadata: { eventType, matched: results.length, runIds: results.map((r) => r.id) },
    }).catch(() => null);
  }

  return results;
}

router.post('/events/trigger', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const eventType = req.body?.eventType ?? req.body?.event_type;
    if (!eventType) return res.status(400).json({ error: 'eventType is required' });

    const results = await executeWorkflowsByEvent(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      eventType,
      req.body?.payload ?? req.body?.triggerPayload ?? {},
    );

    res.status(202).json({ eventType, matched: results.length, runs: results });
  } catch (error) {
    console.error('Error triggering workflows by event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /agent-catalog
 * Returns all AI Studio agents as workflow NodeSpec entries so the canvas
 * can render them as real, named nodes without hardcoding.
 */
router.get('/agent-catalog', async (req: MultiTenantRequest, res) => {
  try {
    const { createAgentRepository } = await import('../data/agents.js');
    const agentRepo = createAgentRepository();
    const agents: any[] = await agentRepo.listAgents({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
    });

    const nodes = agents.map((agent: any) => ({
      type: 'agent' as const,
      key: `agent.run`,
      agentId: agent.id,
      agentSlug: agent.slug,
      label: agent.name ?? agent.slug,
      category: 'AI Agents',
      icon: agent.icon ?? 'smart_toy',
      description: agent.description ?? agent.purpose ?? `Run the ${agent.name ?? agent.slug} agent.`,
      requiresConfig: false,
      // Pre-filled config so agent.run knows which agent to invoke
      defaultConfig: { agentId: agent.id, agentSlug: agent.slug },
    }));

    res.json({ nodes });
  } catch (error) {
    logger.warn('Failed to load agent catalog', { error: String(error) });
    res.json({ nodes: [] });
  }
});

router.get('/:id', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });

    const versions = await workflowRepository.listVersions(wf.id);
    const runs = await workflowRepository.listRunsByWorkflow(wf.id, tenantId);
    const currentVersion = await (wf.current_version_id 
      ? workflowRepository.getVersion(wf.current_version_id) 
      : workflowRepository.getLatestVersion(wf.id));

    res.json({
      ...wf,
      current_version: currentVersion,
      versions,
      recent_runs: runs,
      metrics: await workflowRepository.getMetrics(wf.id, tenantId),
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', requirePermission('workflows.write'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });

    const currentVersion = await (wf.current_version_id 
      ? workflowRepository.getVersion(wf.current_version_id) 
      : workflowRepository.getLatestVersion(wf.id));

    const nextVersionNumber = currentVersion ? Number(currentVersion.version_number || 0) + 1 : 1;
    const draftId = currentVersion?.status === 'draft' ? currentVersion.id : crypto.randomUUID();
    
    const updates = {
      nodes: normalizeNodes(req.body.nodes ?? currentVersion?.nodes ?? []),
      edges: normalizeEdges(req.body.edges ?? currentVersion?.edges ?? []),
      trigger: parseMaybeJsonObject(req.body.trigger ?? currentVersion?.trigger ?? {}),
    };

    await workflowRepository.updateDefinition(wf.id, tenantId, workspaceId, {
      name: req.body.name ?? wf.name,
      description: req.body.description ?? wf.description,
    });

    if (currentVersion?.status === 'draft') {
      await workflowRepository.updateVersion(draftId, updates);
    } else {
      await workflowRepository.createVersion({
        id: draftId,
        workflowId: wf.id,
        versionNumber: nextVersionNumber,
        status: 'draft',
        ...updates,
        tenantId,
      });
    }

    const draftVersion = await workflowRepository.getVersion(draftId);

    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_DRAFT_UPDATED',
      entityType: 'workflow',
      entityId: wf.id,
      oldValue: { workflow: wf, version: currentVersion },
      newValue: { workflow: { ...wf, ...req.body }, version: draftVersion },
    });

    res.json({
      ...wf,
      name: req.body.name ?? wf.name,
      description: req.body.description ?? wf.description,
      current_version: draftVersion,
      metrics: await workflowRepository.getMetrics(wf.id, tenantId),
    });
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/validate', requirePermission('workflows.read'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });
    const version = wf.current_version_id
      ? await workflowRepository.getVersion(wf.current_version_id)
      : await workflowRepository.getLatestVersion(wf.id);
    res.json(validateWorkflowDefinition(req.body?.nodes ?? version?.nodes ?? [], req.body?.edges ?? version?.edges ?? []));
  } catch (error) {
    console.error('Error validating workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/dry-run', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });
    const version = wf.current_version_id
      ? await workflowRepository.getVersion(wf.current_version_id)
      : await workflowRepository.getLatestVersion(wf.id);
    const dryRun = await buildDryRun(
      req.body?.nodes ?? version?.nodes ?? [],
      req.body?.edges ?? version?.edges ?? [],
      req.body?.triggerPayload ?? { workflowId: wf.id, manual: true },
      { tenantId, workspaceId, userId: req.userId },
    );
    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_DRY_RUN',
      entityType: 'workflow',
      entityId: wf.id,
      metadata: { ok: dryRun.ok, errors: dryRun.validation.errors },
    });
    res.json(dryRun);
  } catch (error) {
    console.error('Error running workflow dry-run:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/step-run', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });
    const version = wf.current_version_id
      ? await workflowRepository.getVersion(wf.current_version_id)
      : await workflowRepository.getLatestVersion(wf.id);
    const nodeId = req.body?.nodeId ?? req.body?.node_id;
    if (!nodeId) return res.status(400).json({ error: 'nodeId is required' });
    const result = await buildStepDryRun(
      req.body?.nodes ?? version?.nodes ?? [],
      req.body?.edges ?? version?.edges ?? [],
      nodeId,
      req.body?.triggerPayload ?? { workflowId: wf.id, manual: true, source: 'step-run' },
      { tenantId, workspaceId, userId: req.userId },
    );
    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_STEP_DRY_RUN',
      entityType: 'workflow',
      entityId: wf.id,
      metadata: { nodeId, status: result.status, ok: result.ok },
    });
    res.json(result);
  } catch (error) {
    console.error('Error running workflow step dry-run:', error);
    const status = (error as any)?.statusCode ?? 500;
    res.status(status).json({ error: status === 404 ? 'Workflow node not found' : 'Internal server error' });
  }
});

router.post('/:id/run', requirePermission('workflows.trigger'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });
    const version = wf.current_version_id
      ? await workflowRepository.getVersion(wf.current_version_id)
      : await workflowRepository.getLatestVersion(wf.id);
    if (!version || version.status !== 'published') {
      return res.status(409).json({ error: 'Workflow must be published before execution' });
    }
    const result = await executeWorkflowVersion({
      tenantId,
      workspaceId,
      userId: req.userId,
      workflowId: wf.id,
      version,
      triggerPayload: req.body?.triggerPayload ?? { caseId: req.body?.caseId ?? req.body?.case_id ?? null },
      triggerType: req.body?.triggerType ?? 'manual',
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error running workflow:', error);
    if ((error as any)?.statusCode === 422) {
      return res.status(422).json({ error: 'Workflow is not executable', validation: (error as any).validation });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/rollback', requirePermission('workflows.write'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });
    const versions = await workflowRepository.listVersions(wf.id);
    const target = req.body?.versionId
      ? versions.find((version) => version.id === req.body.versionId)
      : versions.find((version) => version.status === 'archived') ?? versions[1];
    if (!target) return res.status(404).json({ error: 'No rollback target available' });

    if (wf.current_version_id && wf.current_version_id !== target.id) {
      await workflowRepository.updateVersion(wf.current_version_id, { status: 'archived' });
    }
    await workflowRepository.updateVersion(target.id, {
      status: 'published',
      publishedBy: req.userId ?? 'system',
      publishedAt: new Date().toISOString(),
    });
    await workflowRepository.updateDefinition(wf.id, tenantId, workspaceId, { currentVersionId: target.id });
    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_ROLLED_BACK',
      entityType: 'workflow',
      entityId: wf.id,
      newValue: { versionId: target.id, versionNumber: target.version_number },
    });
    const workflow = await workflowRepository.getDefinition(wf.id, tenantId, workspaceId);
    res.json({ ...workflow, current_version: target, metrics: await workflowRepository.getMetrics(wf.id, tenantId) });
  } catch (error) {
    console.error('Error rolling back workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/publish', requirePermission('workflows.write'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });

    const versions = await workflowRepository.listVersions(wf.id);
    const draftVersion = versions.find(v => v.status === 'draft');

    if (!draftVersion) {
      return res.status(400).json({ error: 'No draft version available to publish' });
    }

    const validation = validateWorkflowDefinition(draftVersion.nodes ?? [], draftVersion.edges ?? []);
    if (!validation.ok) {
      return res.status(422).json({
        error: 'Workflow cannot be published until validation passes',
        validation,
      });
    }

    const now = new Date().toISOString();
    if (wf.current_version_id && wf.current_version_id !== draftVersion.id) {
      await workflowRepository.updateVersion(wf.current_version_id, { status: 'archived' });
    }

    await workflowRepository.updateVersion(draftVersion.id, {
      status: 'published',
      publishedBy: req.userId ?? 'system',
      publishedAt: now,
    });

    await workflowRepository.updateDefinition(wf.id, tenantId, workspaceId, {
      currentVersionId: draftVersion.id,
    });

    const updated = await workflowRepository.getDefinition(wf.id, tenantId, workspaceId);
    const version = await workflowRepository.getVersion(draftVersion.id);

    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_PUBLISHED',
      entityType: 'workflow',
      entityId: wf.id,
      newValue: { workflow: updated, version },
    });

    res.json({
      ...updated,
      current_version: version,
      metrics: await workflowRepository.getMetrics(wf.id, tenantId),
    });
  } catch (error) {
    console.error('Error publishing workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/archive', requirePermission('workflows.write'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });

    const currentVersion = wf.current_version_id
      ? await workflowRepository.getVersion(wf.current_version_id)
      : await workflowRepository.getLatestVersion(wf.id);

    if (!currentVersion) {
      return res.status(400).json({ error: 'No version available to archive' });
    }

    await workflowRepository.updateVersion(currentVersion.id, { status: 'archived' });

    const updated = await workflowRepository.getDefinition(wf.id, tenantId, workspaceId);
    const version = await workflowRepository.getVersion(currentVersion.id);

    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_ARCHIVED',
      entityType: 'workflow',
      entityId: wf.id,
      newValue: { workflow: updated, version },
    });

    res.json({
      ...updated,
      current_version: version,
      metrics: await workflowRepository.getMetrics(wf.id, tenantId),
    });
  } catch (error) {
    console.error('Error archiving workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

