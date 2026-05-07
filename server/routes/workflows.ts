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
import { integrationRegistry } from '../integrations/registry.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withGeminiRetry } from '../ai/geminiRetry.js';
import { config as appConfig } from '../config.js';
import { getRefundThreshold } from '../utils/refundThreshold.js';
import { logger } from '../utils/logger.js';
import { broadcastSSE } from './sse.js';
import { executeNode as runAdapter, executeNodeWithRetry, executeWorkflow } from '../runtime/workflowExecutor.js';
import { registerSchedulerHooks } from '../runtime/adapters/flowScheduler.js';

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

// ── Wire flow.subworkflow / flow.merge / flow.loop / flow.wait / delay ─────
// Their adapters live in server/runtime/adapters/flowScheduler.ts but need
// callbacks into the route's repository singletons + scheduler. Done at
// module load so the registry is ready before the first node runs.
registerSchedulerHooks({
  getDefinition: (id, tenantId, workspaceId) =>
    workflowRepository.getDefinition(id, tenantId, workspaceId),
  getVersion: (id, scope) => workflowRepository.getVersion(id, scope),
  getLatestVersion: (definitionId, scope) =>
    workflowRepository.getLatestVersion(definitionId, scope),
  runSubworkflow: (opts) => executeWorkflowVersion(opts),
});

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
  { type: 'trigger', key: 'trigger.form_submission', label: 'On form submission', category: 'Trigger', icon: 'description', requiresConfig: true },
  { type: 'trigger', key: 'trigger.chat_message', label: 'On chat message', category: 'Trigger', icon: 'forum', requiresConfig: true },
  { type: 'trigger', key: 'trigger.workflow_error', label: 'On workflow error', category: 'Trigger', icon: 'error_outline', requiresConfig: false },
  { type: 'trigger', key: 'trigger.subworkflow_called', label: 'When called by another workflow', category: 'Trigger', icon: 'login', requiresConfig: false },
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
  { type: 'utility', key: 'flow.note', label: 'Sticky Note', category: 'Flow', icon: 'sticky_note_2', requiresConfig: true },
  { type: 'utility', key: 'data.clean_context', label: 'Clean context', category: 'Data transformation', icon: 'cleaning_services', requiresConfig: true },
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
  { type: 'agent', key: 'ai.anthropic', label: 'Anthropic Claude', category: 'Agent', icon: 'auto_awesome_motion', requiresConfig: true },
  { type: 'agent', key: 'ai.openai', label: 'OpenAI', category: 'Agent', icon: 'memory', requiresConfig: true },
  { type: 'agent', key: 'ai.ollama', label: 'Ollama (local)', category: 'Agent', icon: 'computer', requiresConfig: true },
  { type: 'agent', key: 'ai.guardrails', label: 'Guardrails', category: 'Agent', icon: 'shield_lock', requiresConfig: true },
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
  'trigger.form_submission': { required: ['formSlug'], optional: ['redirectUrl', 'allowAnonymous'], sideEffects: 'none' },
  'trigger.chat_message': { required: ['channel'], optional: ['agentId'], sideEffects: 'none' },
  'trigger.workflow_error': { optional: ['sourceWorkflowId', 'severity'], sideEffects: 'none' },
  'trigger.subworkflow_called': { optional: ['expectedInputs'], sideEffects: 'none' },
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
  'flow.note': { required: ['content'], optional: ['color'], sideEffects: 'none' },
  'data.clean_context': { required: ['fields'], optional: ['mode'], sideEffects: 'none' },
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
  'ai.anthropic': { required: ['prompt'], optional: ['operation', 'systemInstruction', 'model', 'maxTokens', 'temperature', 'target'], sideEffects: 'external', risk: 'low' },
  'ai.openai': { required: ['prompt'], optional: ['operation', 'systemInstruction', 'model', 'maxTokens', 'temperature', 'target'], sideEffects: 'external', risk: 'low' },
  'ai.ollama': { required: ['prompt', 'model'], optional: ['systemInstruction', 'temperature', 'target'], sideEffects: 'external', risk: 'low' },
  'ai.guardrails': { required: ['mode', 'text'], optional: ['checks', 'topic', 'target'], sideEffects: 'external', risk: 'low' },
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
      if (['failed', 'blocked', 'waiting_approval', 'waiting', 'stopped'].includes(result.status)) {
        // Check if there is an error handler branch
        const errorNode = pickErrorNode(validation.nodes, validation.edges, currentNode);
        if (errorNode) {
          currentNode = errorNode;
          continue;
        }
        break;
      }
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

// ── Gmail / Outlook OAuth send helpers extracted to server/runtime/adapters/messaging.ts (Phase 3f)

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
function pickErrorNode(nodes: any[] = [], edges: any[] = [], currentNode: any) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = (edges ?? []).filter((edge) => edge.source === currentNode.id);
  const errorEdge = outgoing.find((edge) => ['error', 'failure', 'fail'].includes(String(edge.label || edge.sourceHandle || '').toLowerCase()));
  return errorEdge ? byId.get(errorEdge.target) : null;
}

function pickNextNodes(nodes: any[] = [], edges: any[] = [], currentNode: any, context: any): any[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = (edges ?? []).filter((edge) => edge.source === currentNode.id);
  if (outgoing.length === 0) return [];

  // flow.branch = parallel fan-out: execute ALL connected targets
  if (currentNode.key === 'flow.branch') {
    return outgoing.filter(edge => !['error', 'failure', 'fail'].includes(String(edge.label || edge.sourceHandle || '').toLowerCase()))
      .map((edge) => byId.get(edge.target)).filter(Boolean);
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

  const next = outgoing.find((edge) => {
    const label = String(edge.label || edge.sourceHandle || '').toLowerCase();
    return !label || ['next', 'success', 'main', 'true'].includes(label);
  }) ?? outgoing[0];
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

// `resolveDelayUntil` extracted to server/runtime/adapters/flowScheduler.ts (Phase 4b).

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
    'shipment.updated': ['shipment.updated', 'shipment_updated', 'fulfillment.updated', 'shipping.updated'],
    'manual.run': ['manual.run', 'manual'],
    'trigger.form_submission': ['trigger.form.submission', 'form.submitted', 'form_submitted'],
    'trigger.chat_message': ['trigger.chat.message', 'chat.message', 'chat_message'],
    'trigger.workflow_error': ['trigger.workflow.error', 'workflow.error', 'workflow_failed'],
    'trigger.subworkflow_called': ['trigger.subworkflow.called', 'subworkflow.called', 'subworkflow'],
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

// Note: `services` is OPTIONAL and only consumed by pilot node handlers
// (`flow.loop`, `notification.email`). All other handlers fall back to
// inline imports — see server/runtime/workflowServices.ts for the
// migration plan. Marked `export` so the workflow-runtime test harness
// can drive node execution without spinning up the HTTP stack.
export async function executeWorkflowNode(
  scope: { tenantId: string; workspaceId: string; userId?: string },
  node: any,
  context: any,
  services?: import('../runtime/workflowServices.js').WorkflowServices,
) {
  if (node.disabled) {
    return { status: 'skipped', output: { reason: 'Node is disabled' } };
  }

  const config = resolveNodeConfig(node.config ?? {}, context);

  // ── Node-level System Settings: Idempotency ──
  if (config.idempotencyKey) {
    const key = resolveTemplateValue(config.idempotencyKey, context);
    context.__idempotency = context.__idempotency ?? {};
    if (context.__idempotency[key]) {
      return { status: 'skipped', output: { duplicate: true, idempotencyKey: key, reason: 'Idempotency key match' } };
    }
    context.__idempotency[key] = true;
  }

  // ── Node-level System Settings: Rate Limit ──
  if (config.rateLimitBucket && config.rateLimitLimit) {
    const bucket = resolveTemplateValue(config.rateLimitBucket, context);
    const limit = Number(config.rateLimitLimit);
    context.__rateLimits = context.__rateLimits ?? {};
    context.__rateLimits[bucket] = (context.__rateLimits[bucket] || 0) + 1;
    if (context.__rateLimits[bucket] > limit) {
      return { status: 'waiting', output: { bucket, limit, current: context.__rateLimits[bucket], reason: 'Rate limit exceeded' } };
    }
  }

  if (node.type === 'trigger') {
    return { status: 'completed', output: { accepted: true, trigger: node.key } };
  }

  // ── Early adapter dispatch (Turno 5/D2 — Phase 2) ────────────────────────
  // For node keys that have been migrated to `server/runtime/adapters/`,
  // delegate here before falling through to the legacy inline branches.
  // `runAdapter` returns `undefined` when no adapter is registered, in
  // which case we keep the original control flow intact.
  //
  // Simulation safety: in the legacy inline executor the simulation
  // short-circuit (`if (context.__simulation && contract.sideEffects !== 'none')`)
  // sat between the condition/data.* blocks and the side-effect blocks
  // (case.*/order.*/payment.*/.../ai.*/connector.*/notification.*/message.*).
  // When extracting THOSE blocks we must apply the same gate before
  // delegating, otherwise a simulated run would execute real side effects.
  // Pre-extraction position-equivalent: condition/data.* run before this
  // check; everything else runs after.
  {
    const SIDE_EFFECT_FREE_PREFIXES = ['flow.', 'data.'] as const;
    const isPreSimulationGate = node.type === 'condition'
      || SIDE_EFFECT_FREE_PREFIXES.some((p) => String(node.key || '').startsWith(p))
      || node.key === 'stop';
    if (!isPreSimulationGate
        && context.__simulation
        && getNodeContract(node.key).sideEffects !== 'none') {
      return buildSimulatedNodeResult(node, config, context);
    }
    const adapterResult = await runAdapter(
      { scope, context, services },
      node,
      config,
    );
    if (adapterResult !== undefined) return adapterResult;
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

  // ── data.* adapters extracted to server/runtime/adapters/data.ts (Phase 3a)
  // The early adapter dispatch above handles all known data.* keys. This
  // fallback preserves prior behavior for any UNKNOWN data.* key (non-existent
  // in NODE_CATALOG) that would previously have run through the shared
  // `base = cloneJson(...)` path and returned `transformed: true`.
  if (node.key.startsWith('data.')) {
    const source = readContextPath(context, config.source || config.path || 'data');
    const base = cloneJson(source && typeof source === 'object' ? source : context.data && typeof context.data === 'object' ? context.data : {});
    context.data = base;
    return { status: 'completed', output: { data: base, transformed: true } };
  }

  if (context.__simulation && getNodeContract(node.key).sideEffects !== 'none') {
    return buildSimulatedNodeResult(node, config, context);
  }

  // ── All side-effectful node families now live under server/runtime/adapters/:
  //   case.* / order.* / payment.* / return.* / approval.*  → adapters/actions.ts (Phase 3d)
  //   policy.* / core.audit_log / core.idempotency_check / core.rate_limit
  //     / core.code / core.data_table_op / core.respond_webhook → adapters/core.ts (Phase 3b)
  //   knowledge.*                                              → adapters/knowledge.ts (Phase 3c)
  //   notification.*                                           → adapters/notifications.ts (Phase 3e)
  //   message.*                                                → adapters/messaging.ts (Phase 3f)
  //   ai.*  + agent.*                                          → adapters/ai.ts (Phase 3g)
  //   connector.*                                              → adapters/connectors.ts (Phase 3h)
  //   data.* + data.http_request                               → adapters/data.ts (Phase 3a)
  //   flow.wait/delay/merge/loop/subworkflow                   → adapters/flowScheduler.ts (Phase 4b)
  //
  // The early adapter dispatch above handles them all.
  if (['agent', 'integration', 'knowledge'].includes(node.type)) {
    return { status: 'failed', error: `Unsupported ${node.type} node key: ${node.key}` };
  }

  // All flow.*, stop, flow.noop, flow.stop_error keys are handled by the
  // adapter registry (server/runtime/adapters/flow.ts + flowScheduler.ts).
  // Anything that reaches this point is a node key with no handler — return
  // a synthesised completion (matches the pre-extraction fallback).
  return { status: 'completed', output: { simulated: true, key: node.key } };
}

// `executeWorkflowNodeWithRetry` was extracted to
// `server/runtime/workflowExecutor.ts` (Phase 4a — Turno 5/D2). This thin
// wrapper preserves the exact call sites (the BFS scheduler + resume path)
// without leaking the dependency-injection plumbing into them.
async function executeWorkflowNodeWithRetry(
  scope: { tenantId: string; workspaceId: string; userId?: string },
  node: any,
  context: any,
) {
  return executeNodeWithRetry(scope, node, context, {
    executeNode: executeWorkflowNode,
    getNodeContract,
    auditLog: (auditScope, entry) => auditRepository.logEvent(auditScope, entry).catch(() => undefined),
    logger,
  });
}

// `executeWorkflowVersion` was extracted to
// `server/runtime/workflowExecutor.ts` as `executeWorkflow` (Phase 4c — Turno
// 5/D2). This thin wrapper preserves the original signature + every existing
// call site (POST /:id/run, /:id/retry, /events/trigger, /forms/:slug, the
// flow.subworkflow scheduler hook, and `executeWorkflowsByEvent`) by
// injecting the route's repositories + helpers as a deps bundle.
async function executeWorkflowVersion(opts: {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  workflowId: string;
  version: any;
  triggerPayload: any;
  triggerType?: string;
  retryOfRunId?: string | null;
}) {
  return executeWorkflow(opts, {
    validateWorkflowDefinition,
    getStartNode,
    pickNextNodes,
    buildWorkflowContext,
    executeNodeWithRetry: executeWorkflowNodeWithRetry,
    getSupabaseAdmin,
    auditLog: (scope, entry) => auditRepository.logEvent(scope, entry),
    broadcastSSE,
    executeWorkflowsByEvent,
    logger,
  });
}


export async function continueWorkflowRun({
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
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId);

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
  }).eq('id', run.id).eq('tenant_id', tenantId).eq('workspace_id', workspaceId);
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
    const version = await workflowRepository.getVersion(versionId, { tenantId });

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
    const runs = await workflowRepository.listRecentRuns(req.tenantId!, req.workspaceId!);
    res.json(runs);
  } catch (error) {
    console.error('Error fetching recent runs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/runs/:runId', requirePermission('workflows.read'), async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const supabase = getSupabaseAdmin();
    const { data: run, error: runError } = await supabase
      .from('workflow_runs')
      .select('*, workflow_versions!inner(workflow_id, workflow_definitions!workflow_versions_workflow_id_fkey(name)), cases(case_number)')
      .eq('id', req.params.runId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
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
      .eq('workspace_id', workspaceId)
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
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!run) return res.status(404).json({ error: 'Workflow run not found' });
    if (['completed', 'failed', 'cancelled'].includes(String(run.status))) {
      return res.status(409).json({ error: `Run is already ${run.status} and cannot be cancelled` });
    }

    const { error } = await supabase
      .from('workflow_runs')
      .update({
        status: 'cancelled',
        ended_at: now,
        error: req.body?.reason ?? 'Cancelled manually',
        context: { ...(run.context ?? {}), cancelledAt: now, cancelledBy: req.userId ?? 'system' },
      })
      .eq('id', req.params.runId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId);
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
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (runError) throw runError;
    if (!previousRun) return res.status(404).json({ error: 'Workflow run not found' });

    const version = previousRun.workflow_versions;
    if (!version) return res.status(404).json({ error: 'Workflow version not found for run' });

    await supabase
      .from('workflow_runs')
      .update({ status: 'retrying' })
      .eq('id', previousRun.id)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId);

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
    const version = await workflowRepository.getVersion(workflow.current_version_id, { tenantId });
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
 * POST /forms/:slug
 * Public form-submission endpoint that fires `trigger.form_submission` for any
 * workflow whose start node matches the slug. Workflows opt-in by setting
 * `formSlug` on the trigger config; only those with `allowAnonymous=true` can
 * be reached without auth.
 *
 * The endpoint resolves the tenant/workspace by scanning all published workflows
 * across tenants for the matching slug. To prevent enumeration we return a
 * generic 404 if nothing matches.
 */
router.post('/forms/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return res.status(404).json({ error: 'Form not found' });

    const supabase = getSupabaseAdmin();
    const { data: rows, error: rowsError } = await supabase
      .from('workflow_versions')
      .select('id, workflow_id, tenant_id, workspace_id, nodes, trigger')
      .eq('status', 'published')
      .limit(500);
    if (rowsError) {
      logger.warn('forms endpoint: query failed', { slug, error: String(rowsError) });
      return res.status(500).json({ error: 'Internal error' });
    }
    const matches = (rows ?? []).filter((row: any) => {
      const nodes = parseMaybeJsonArray(row.nodes);
      const start = getStartNode(normalizeNodes(nodes));
      if (start?.key !== 'trigger.form_submission') return false;
      const cfg = (start.config && typeof start.config === 'object' ? start.config : {}) as any;
      return String(cfg.formSlug || cfg.slug || '').trim() === slug;
    });
    if (matches.length === 0) return res.status(404).json({ error: 'Form not found' });

    // Verify allowAnonymous on the matched workflow
    const allowed = matches.filter((row: any) => {
      const nodes = parseMaybeJsonArray(row.nodes);
      const start = getStartNode(normalizeNodes(nodes));
      const cfg = (start?.config && typeof start.config === 'object' ? start.config : {}) as any;
      return String(cfg.allowAnonymous ?? 'true').toLowerCase() !== 'false';
    });
    if (allowed.length === 0) {
      return res.status(401).json({ error: 'Form requires authentication' });
    }

    const results = [] as any[];
    for (const row of allowed) {
      try {
        const versions = await workflowRepository.getVersion(row.id, { tenantId: row.tenant_id });
        if (!versions) continue;
        const result = await executeWorkflowVersion({
          tenantId: row.tenant_id,
          workspaceId: row.workspace_id,
          userId: undefined,
          workflowId: row.workflow_id,
          version: versions,
          triggerPayload: { formSlug: slug, body: req.body ?? {}, headers: { 'user-agent': req.headers['user-agent'] || '' } },
          triggerType: 'trigger.form_submission',
        });
        results.push({ workflowId: row.workflow_id, runId: result.id, status: result.status });
      } catch (err: any) {
        logger.warn('forms endpoint: workflow execution failed', { slug, workflowId: row.workflow_id, error: String(err?.message ?? err) });
      }
    }

    return res.status(202).json({ formSlug: slug, matched: results.length, runs: results });
  } catch (error: any) {
    logger.warn('forms endpoint: unexpected error', { error: String(error?.message ?? error) });
    return res.status(500).json({ error: 'Internal error' });
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
      ? workflowRepository.getVersion(wf.current_version_id, { tenantId })
      : workflowRepository.getLatestVersion(wf.id, { tenantId }));

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
      ? workflowRepository.getVersion(wf.current_version_id, { tenantId })
      : workflowRepository.getLatestVersion(wf.id, { tenantId }));

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

    const draftVersion = await workflowRepository.getVersion(draftId, { tenantId });

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
      ? await workflowRepository.getVersion(wf.current_version_id, { tenantId })
      : await workflowRepository.getLatestVersion(wf.id, { tenantId });
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
      ? await workflowRepository.getVersion(wf.current_version_id, { tenantId })
      : await workflowRepository.getLatestVersion(wf.id, { tenantId });
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
      ? await workflowRepository.getVersion(wf.current_version_id, { tenantId })
      : await workflowRepository.getLatestVersion(wf.id, { tenantId });
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
      ? await workflowRepository.getVersion(wf.current_version_id, { tenantId })
      : await workflowRepository.getLatestVersion(wf.id, { tenantId });
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
    const version = await workflowRepository.getVersion(draftVersion.id, { tenantId });

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
      ? await workflowRepository.getVersion(wf.current_version_id, { tenantId })
      : await workflowRepository.getLatestVersion(wf.id, { tenantId });

    if (!currentVersion) {
      return res.status(400).json({ error: 'No version available to archive' });
    }

    await workflowRepository.updateVersion(currentVersion.id, { status: 'archived' });

    const updated = await workflowRepository.getDefinition(wf.id, tenantId, workspaceId);
    const version = await workflowRepository.getVersion(currentVersion.id, { tenantId });

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

