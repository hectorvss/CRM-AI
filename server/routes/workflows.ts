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
import { executeNode as runAdapter } from '../runtime/workflowExecutor.js';

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

// ── Gmail / Outlook OAuth send helpers ──────────────────────────────────────
// Both providers use OAuth2 with refresh tokens. Auth state is stored as JSON in
// `connectors.auth_config`: { access_token, refresh_token, expires_at, client_id, client_secret }.
// On a stale access_token we exchange the refresh_token for a fresh one and persist it back.

async function refreshOAuthToken(
  scope: { tenantId: string; workspaceId: string },
  connectorId: string,
  auth: Record<string, any>,
  tokenUrl: string,
): Promise<{ access_token: string; expires_at: number } | { error: string }> {
  if (!auth.refresh_token || !auth.client_id || !auth.client_secret) {
    return { error: 'Refresh token / client credentials missing en auth_config.' };
  }
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: String(auth.refresh_token),
    client_id:     String(auth.client_id),
    client_secret: String(auth.client_secret),
  });
  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return { error: `Token refresh ${resp.status}: ${detail.slice(0, 200)}` };
  }
  const json: any = await resp.json().catch(() => ({}));
  if (!json.access_token) return { error: 'Token refresh response sin access_token.' };
  const expiresAt = Date.now() + (Number(json.expires_in || 3600) * 1000);
  // Persist the rotated tokens back to the connector
  try {
    const newAuth = { ...auth, access_token: json.access_token, expires_at: expiresAt };
    if (json.refresh_token) newAuth.refresh_token = json.refresh_token;
    await integrationRepository.updateConnector?.({ tenantId: scope.tenantId }, connectorId, { auth_config: newAuth });
  } catch { /* persistence failure shouldn't block this send */ }
  return { access_token: json.access_token, expires_at: expiresAt };
}

async function ensureFreshAccessToken(
  scope: { tenantId: string; workspaceId: string },
  connectorId: string,
  auth: Record<string, any>,
  tokenUrl: string,
): Promise<{ access_token: string } | { error: string }> {
  const expiresAt = Number(auth.expires_at || 0);
  // Refresh 60s before expiry, or always if no expiry recorded
  if (auth.access_token && expiresAt && expiresAt > Date.now() + 60_000) {
    return { access_token: String(auth.access_token) };
  }
  const refreshed = await refreshOAuthToken(scope, connectorId, auth, tokenUrl);
  if ('error' in refreshed) return refreshed;
  return { access_token: refreshed.access_token };
}

function buildRfc822Email(opts: { from?: string; to: string; subject: string; body: string }): string {
  const lines: string[] = [];
  if (opts.from) lines.push(`From: ${opts.from}`);
  lines.push(`To: ${opts.to}`);
  lines.push(`Subject: ${opts.subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: 7bit');
  lines.push('');
  lines.push(opts.body);
  return lines.join('\r\n');
}

async function sendGmail(
  scope: { tenantId: string; workspaceId: string },
  connectorId: string,
  auth: Record<string, any>,
  payload: { to: string; subject: string; body: string },
): Promise<{ ok: boolean; messageId?: string; error?: string; transient?: boolean }> {
  if (!auth.refresh_token && !auth.access_token) {
    return { ok: false, error: 'Conecta tu cuenta de Gmail en Conectores antes de usar este nodo.' };
  }
  const fresh = await ensureFreshAccessToken(scope, connectorId, auth, 'https://oauth2.googleapis.com/token');
  if ('error' in fresh) return { ok: false, error: `Gmail OAuth: ${fresh.error}` };
  const rfc822 = buildRfc822Email({ from: auth.email, to: payload.to, subject: payload.subject, body: payload.body });
  // base64url-encoded RFC 822
  const raw = Buffer.from(rfc822, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${fresh.access_token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(20_000),
  });
  if (resp.ok) {
    const json: any = await resp.json().catch(() => ({}));
    return { ok: true, messageId: String(json.id ?? '') };
  }
  const detail = await resp.text().catch(() => '');
  const transient = resp.status >= 500;
  return { ok: false, error: `Gmail ${resp.status}: ${detail.slice(0, 200)}`, transient };
}

async function sendOutlookMail(
  scope: { tenantId: string; workspaceId: string },
  connectorId: string,
  auth: Record<string, any>,
  payload: { to: string; subject: string; body: string },
): Promise<{ ok: boolean; messageId?: string; error?: string; transient?: boolean }> {
  if (!auth.refresh_token && !auth.access_token) {
    return { ok: false, error: 'Conecta tu cuenta de Outlook en Conectores antes de usar este nodo.' };
  }
  const fresh = await ensureFreshAccessToken(scope, connectorId, auth, 'https://login.microsoftonline.com/common/oauth2/v2.0/token');
  if ('error' in fresh) return { ok: false, error: `Outlook OAuth: ${fresh.error}` };
  const message = {
    message: {
      subject: payload.subject,
      body: { contentType: 'Text', content: payload.body },
      toRecipients: [{ emailAddress: { address: payload.to } }],
    },
    saveToSentItems: true,
  };
  const resp = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${fresh.access_token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(20_000),
  });
  // Graph returns 202 Accepted with empty body on success
  if (resp.status === 202 || resp.ok) {
    return { ok: true, messageId: resp.headers.get('request-id') ?? '' };
  }
  const detail = await resp.text().catch(() => '');
  const transient = resp.status >= 500;
  return { ok: false, error: `Outlook ${resp.status}: ${detail.slice(0, 200)}`, transient };
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

  // ── case.*, order.*, payment.*, return.*, approval.*
  //    extracted to server/runtime/adapters/actions.ts (Phase 3d)

  // ── policy.evaluate, core.audit_log, core.idempotency_check, core.rate_limit
  // extracted to server/runtime/adapters/core.ts (Phase 3b)

  // ── knowledge.* extracted to server/runtime/adapters/knowledge.ts (Phase 3c)

  if (['agent.classify', 'agent.sentiment', 'agent.summarize', 'agent.draft_reply'].includes(node.key)) {
    const text = String(
      resolveTemplateValue(config.text || config.content || '', context) ||
      context.case?.summary || context.case?.description || context.trigger?.message || '',
    );
    const lower = text.toLowerCase();

    // ── Gemini-powered path ────────────────────────────────────────────────
    if (appConfig.ai.geminiApiKey && text.length > 3) {
      const genAI = new GoogleGenerativeAI(appConfig.ai.geminiApiKey);
      const { pickGeminiModel } = await import('../ai/modelSelector.js');
      const model = genAI.getGenerativeModel({ model: pickGeminiModel('workflow_ai_node', appConfig.ai.geminiModel) });

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

    // ── Real connector dispatch ────────────────────────────────────────────────
    // Resolve auth_config (oauth tokens, api keys, etc.) and dispatch the
    // capability call. Two paths:
    //   1) Adapter registered in integrationRegistry that exposes the named
    //      method (e.g. shopify.getOrders, stripe.createRefund) — preferred.
    //   2) Generic HTTP fallback using capability metadata
    //      (http_method + http_path + base_url) when present, otherwise
    //      best-effort POST against base_url with capabilityKey as path.
    const auth = (() => {
      const raw = connector.auth_config;
      if (!raw) return {} as Record<string, any>;
      if (typeof raw === 'object') return raw as Record<string, any>;
      try { return JSON.parse(String(raw)); } catch { return {}; }
    })();
    const inputPayload = parseMaybeJsonObject(config.input ?? config.payload ?? config.body ?? {}) || {};
    const resolvedInput: Record<string, any> = {};
    for (const [k, v] of Object.entries(inputPayload)) {
      resolvedInput[k] = typeof v === 'string' ? resolveTemplateValue(v, context) : v;
    }

    let dispatchResult: { ok: boolean; result?: any; error?: string; via: 'adapter' | 'http' | 'persisted-only' } = { ok: false, via: 'persisted-only' };
    try {
      const adapter: any = integrationRegistry.get(String(connector.system) as any);
      // Try adapter method that matches capability key (e.g. "orders.list" → ordersList, getOrders, listOrders)
      const candidateMethods = [
        capabilityKey,
        capabilityKey.replace(/[._-](\w)/g, (_: string, c: string) => c.toUpperCase()),
        `run${capabilityKey.charAt(0).toUpperCase()}${capabilityKey.slice(1)}`,
        `call${capabilityKey.charAt(0).toUpperCase()}${capabilityKey.slice(1)}`,
      ];
      const method = adapter ? candidateMethods.find((m) => typeof adapter[m] === 'function') : null;
      if (adapter && method) {
        const result = await adapter[method](resolvedInput);
        dispatchResult = { ok: true, result, via: 'adapter' };
      } else {
        // Generic HTTP fallback
        const httpMethod = String(capability?.http_method || config.http_method || config.method || 'POST').toUpperCase();
        const pathTemplate = String(capability?.http_path || config.http_path || config.path || `/${capabilityKey.replace(/\./g, '/')}`);
        const baseUrl = String(auth.base_url || auth.api_base || connector.base_url || capability?.base_url || '').replace(/\/+$/, '');
        if (!baseUrl) {
          dispatchResult = { ok: false, error: `Conector ${connector.system}: falta base_url y no hay adaptador registrado para la capacidad "${capabilityKey}".`, via: 'persisted-only' };
        } else {
          const url = `${baseUrl}${pathTemplate.startsWith('/') ? '' : '/'}${pathTemplate}`;
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (auth.access_token) headers['Authorization'] = `Bearer ${auth.access_token}`;
          else if (auth.api_key)  headers['Authorization'] = `Bearer ${auth.api_key}`;
          else if (auth.token)    headers['Authorization'] = `Bearer ${auth.token}`;
          const resp = await fetch(url, {
            method: httpMethod,
            headers,
            body: ['GET', 'HEAD'].includes(httpMethod) ? undefined : JSON.stringify(resolvedInput),
            signal: AbortSignal.timeout(20_000),
          });
          const text = await resp.text();
          let parsed: any = text;
          try { parsed = JSON.parse(text); } catch { /* keep as text */ }
          dispatchResult = resp.ok
            ? { ok: true, result: parsed, via: 'http' }
            : { ok: false, error: `HTTP ${resp.status} ${resp.statusText}: ${typeof parsed === 'string' ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 200)}`, via: 'http' };
        }
      }
    } catch (err: any) {
      dispatchResult = { ok: false, error: `Dispatch failed: ${err?.message ?? String(err)}`, via: dispatchResult.via };
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
        input: resolvedInput,
        result: dispatchResult.ok ? dispatchResult.result : null,
        dispatchError: dispatchResult.error ?? null,
        dispatchVia: dispatchResult.via,
      },
      dedupeKey: config.dedupe_key || `${node.id}:${Date.now()}`,
      caseId: context.case?.id ?? null,
      workspaceId: scope.workspaceId,
      status: dispatchResult.ok ? 'processed' : 'failed',
    });
    context.integration = {
      connectorId, system: connector.system, capabilityKey,
      canonicalEventId: canonicalEvent.id,
      result: dispatchResult.ok ? dispatchResult.result : null,
      via: dispatchResult.via,
    };
    if (!dispatchResult.ok) {
      return { status: 'failed', error: dispatchResult.error || `Connector call failed (${connector.system}.${capabilityKey})`, output: context.integration };
    }
    return { status: 'completed', output: { ...context.integration, ok: true, result: dispatchResult.result } };
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

    // Try to actually emit the event via the connector if its adapter exposes an emit hook.
    // Otherwise we still persist the canonical event but mark the step as "partial" so
    // operators can see the difference between "fired through external system" and
    // "logged-only because the connector has no emit transport".
    let emittedExternally = false;
    let emitError: string | null = null;
    let emitResult: any = null;
    if (connector) {
      try {
        const adapter: any = integrationRegistry.get(String(connector.system) as any);
        const emitFn = adapter
          ? (typeof adapter.emitEvent === 'function' ? adapter.emitEvent
            : typeof adapter.publishEvent === 'function' ? adapter.publishEvent
            : typeof adapter.sendEvent === 'function' ? adapter.sendEvent
            : null)
          : null;
        if (emitFn) {
          emitResult = await emitFn.call(adapter, {
            eventType,
            payload: context.data ?? {},
            nodeId: node.id,
            trigger: context.trigger,
          });
          emittedExternally = true;
        }
      } catch (err: any) {
        emitError = err?.message ?? String(err);
      }
    }

    const canonicalEvent = await integrationRepository.createCanonicalEvent({ tenantId: scope.tenantId }, {
      sourceSystem,
      sourceEntityType: config.source_entity_type || config.sourceEntityType || 'workflow',
      sourceEntityId: config.source_entity_id || config.sourceEntityId || node.id,
      eventType,
      eventCategory: config.event_category || config.eventCategory || 'workflow',
      canonicalEntityType: config.entity_type || config.entityType || (context.case ? 'case' : 'workflow'),
      canonicalEntityId: config.entity_id || config.entityId || context.case?.id || node.id,
      normalizedPayload: {
        nodeId: node.id,
        trigger: context.trigger,
        data: context.data,
        emittedExternally,
        emitResult,
        emitError,
      },
      dedupeKey: config.dedupe_key || `${node.id}:${eventType}:${Date.now()}`,
      caseId: context.case?.id ?? null,
      workspaceId: scope.workspaceId,
      status: emitError ? 'failed' : 'processed',
    });
    context.integration = { sourceSystem, eventType, canonicalEventId: canonicalEvent.id, emittedExternally };
    if (emitError) {
      return { status: 'failed', error: `connector.emit_event: ${emitError}`, output: context.integration };
    }
    // Adapter present and fired → completed; adapter absent → "blocked" (partial: persisted only)
    return {
      status: emittedExternally ? 'completed' : 'blocked',
      output: emittedExternally
        ? context.integration
        : { ...context.integration, reason: 'Conector sin transporte para emitir eventos; sólo se registró el evento canónico.' },
    };
  }

  // ── Notification nodes ──────────────────────────────────────────────────────
  if (node.key === 'notification.email') {
    const to = resolveTemplateValue(config.to || config.email || context.customer?.email || context.case?.customer_email || '', context);
    const subject = resolveTemplateValue(config.subject || 'Update from support', context);
    const content = resolveTemplateValue(config.content || config.body || config.message || '', context);
    if (!to) return { status: 'failed', error: 'notification.email: no recipient — set "to" or ensure customer.email is in context' };
    // Bug-3 fix: when injected services explicitly lack a transport, block
    // instead of silently simulating. In production (services not injected)
    // we still fall back to the real sendEmail.
    const emailSender = services?.channels?.email ?? (services ? undefined : sendEmail);
    if (!emailSender) {
      return {
        status: 'blocked',
        error: { code: 'TRANSPORT_NOT_CONFIGURED', message: 'Configura el transporte de email en Conectores antes de usar este nodo.' },
      };
    }
    const result = await emailSender(to, subject, content, config.ref || context.case?.id || 'workflow').catch((err: any) => ({ messageId: null, error: String(err?.message ?? err) }));
    if ((result as any).error) return { status: 'failed', error: `Email send failed: ${(result as any).error}` };
    return { status: 'completed', output: { to, subject, messageId: result.messageId } };
  }

  if (node.key === 'notification.whatsapp') {
    const to = resolveTemplateValue(config.to || config.phone || context.customer?.phone || '', context);
    const content = resolveTemplateValue(config.content || config.body || config.message || '', context);
    if (!to) return { status: 'failed', error: 'notification.whatsapp: no recipient — set "to" or ensure customer.phone is in context' };
    const whatsappSender = services?.channels?.whatsapp ?? (services ? undefined : sendWhatsApp);
    if (!whatsappSender) {
      return {
        status: 'blocked',
        error: { code: 'TRANSPORT_NOT_CONFIGURED', message: 'Configura el transporte de WhatsApp en Conectores antes de usar este nodo.' },
      };
    }
    const result = await whatsappSender(to, content).catch((err: any) => ({ messageId: null, error: String(err?.message ?? err) }));
    if ((result as any).error) return { status: 'failed', error: `WhatsApp send failed: ${(result as any).error}` };
    return { status: 'completed', output: { to, messageId: result.messageId } };
  }

  if (node.key === 'notification.sms') {
    const to = resolveTemplateValue(config.to || config.phone || context.customer?.phone || '', context);
    const content = resolveTemplateValue(config.content || config.body || config.message || '', context);
    if (!to) return { status: 'failed', error: 'notification.sms: no recipient — set "to" or ensure customer.phone is in context' };
    const smsSender = services?.channels?.sms ?? (services ? undefined : sendSms);
    if (!smsSender) {
      return {
        status: 'blocked',
        error: { code: 'TRANSPORT_NOT_CONFIGURED', message: 'Configura el transporte de SMS en Conectores antes de usar este nodo.' },
      };
    }
    const result = await smsSender(to, content).catch((err: any) => ({ messageId: null, error: String(err?.message ?? err) }));
    if ((result as any).error) return { status: 'failed', error: `SMS send failed: ${(result as any).error}` };
    return { status: 'completed', output: { to, messageId: result.messageId } };
  }

  // ── AI text generation (real Gemini) ────────────────────────────────────────
  if (node.key === 'ai.generate_text') {
    const prompt = resolveTemplateValue(config.prompt || config.content || config.input || '', context);
    if (!prompt) return { status: 'failed', error: 'ai.generate_text: prompt is required' };
    // Bug-3 fix: prefer injected aiKeys (testable); fall back to config in
    // production. When BOTH are absent, block instead of silently simulating.
    const geminiKey = services?.aiKeys?.gemini ?? (services ? undefined : appConfig.ai.geminiApiKey);
    if (!geminiKey) {
      return {
        status: 'blocked',
        error: { code: 'TRANSPORT_NOT_CONFIGURED', message: 'Configura una API key para el proveedor de IA antes de usar este nodo.' },
      };
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

  // ── core.code, core.data_table_op, core.respond_webhook
  //    extracted to server/runtime/adapters/core.ts (Phase 3b)

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

  // ── External AI providers (Anthropic / OpenAI / Ollama / Guardrails) ────────
  // Key resolution order: connector auth_config (per-workspace) → env var (global)
  // Users configure connector keys via Integrations → Connect (modal) in the UI.
  async function resolveAiProviderKey(system: string, envFallback: string | undefined): Promise<string | null> {
    try {
      const allConnectors = await integrationRepository.listConnectors({ tenantId: scope.tenantId });
      const connector = allConnectors.find((c: any) => String(c.system || '').toLowerCase() === system);
      if (connector) {
        const auth = typeof connector.auth_config === 'object' && connector.auth_config
          ? connector.auth_config as Record<string, any>
          : {};
        const fromConnector = auth.api_key || auth.access_token || auth.secret_key || auth.token || auth.apiKey;
        if (fromConnector) return String(fromConnector);
      }
    } catch { /* ignore — fall through to env */ }
    return envFallback || null;
  }

  if (node.key === 'ai.anthropic') {
    const apiKey = await resolveAiProviderKey('anthropic', appConfig.ai.anthropicApiKey);
    if (!apiKey) {
      return { status: 'failed', error: 'ai.anthropic: API key not configured. Go to Integrations → Connect Anthropic Claude and enter your API key.' };
    }
    const operation = String(config.operation || 'message');
    const prompt = resolveTemplateValue(config.prompt || config.content || config.input || '', context);
    if (!prompt) return { status: 'failed', error: 'ai.anthropic: prompt is required' };
    const model = String(config.model || 'claude-3-5-sonnet-latest');
    const systemInstruction = resolveTemplateValue(config.systemInstruction || '', context);
    const maxTokens = Math.max(1, Number(config.maxTokens || 1024));
    const temperature = config.temperature !== undefined && config.temperature !== '' ? Number(config.temperature) : undefined;
    const target = String(config.target || 'anthropicResult');

    try {
      const body: any = {
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      };
      if (systemInstruction) body.system = systemInstruction;
      if (temperature !== undefined && Number.isFinite(temperature)) body.temperature = temperature;
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      const json: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return { status: 'failed', error: `ai.anthropic: ${resp.status} ${json?.error?.message ?? resp.statusText}` };
      }
      const text = Array.isArray(json.content)
        ? json.content.map((c: any) => c.text || '').join('').trim()
        : String(json.content ?? '');
      context.agent = { ...(context.agent ?? {}), [target]: text };
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: text };
      return { status: 'completed', output: { text, target, model, operation, length: text.length } };
    } catch (err: any) {
      return { status: 'failed', error: `ai.anthropic call failed: ${err?.message ?? String(err)}` };
    }
  }

  if (node.key === 'ai.openai') {
    const apiKey = await resolveAiProviderKey('openai', appConfig.ai.openaiApiKey);
    if (!apiKey) {
      return { status: 'failed', error: 'ai.openai: API key not configured. Go to Integrations → Connect OpenAI and enter your API key.' };
    }
    const operation = String(config.operation || 'chat');
    const prompt = resolveTemplateValue(config.prompt || config.content || config.input || '', context);
    if (!prompt) return { status: 'failed', error: 'ai.openai: prompt is required' };
    const model = String(config.model || 'gpt-4o-mini');
    const systemInstruction = resolveTemplateValue(config.systemInstruction || '', context);
    const maxTokens = Math.max(1, Number(config.maxTokens || 1024));
    const temperature = config.temperature !== undefined && config.temperature !== '' ? Number(config.temperature) : undefined;
    const target = String(config.target || 'openaiResult');

    try {
      let endpoint = 'https://api.openai.com/v1/chat/completions';
      let body: any;
      if (operation === 'embeddings') {
        endpoint = 'https://api.openai.com/v1/embeddings';
        body = { model, input: prompt };
      } else {
        const messages: any[] = [];
        if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
        messages.push({ role: 'user', content: prompt });
        body = { model, messages, max_tokens: maxTokens };
        if (temperature !== undefined && Number.isFinite(temperature)) body.temperature = temperature;
      }
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      const json: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return { status: 'failed', error: `ai.openai: ${resp.status} ${json?.error?.message ?? resp.statusText}` };
      }
      let result: any;
      if (operation === 'embeddings') {
        result = json?.data?.[0]?.embedding ?? [];
      } else {
        result = String(json?.choices?.[0]?.message?.content ?? '').trim();
      }
      context.agent = { ...(context.agent ?? {}), [target]: result };
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: result };
      return { status: 'completed', output: { result, target, model, operation } };
    } catch (err: any) {
      return { status: 'failed', error: `ai.openai call failed: ${err?.message ?? String(err)}` };
    }
  }

  if (node.key === 'ai.ollama') {
    // For Ollama, check connector for base_url or api_key (some hosted Ollama instances need a key)
    let baseUrl = appConfig.ai.ollamaBaseUrl;
    try {
      const allConnectors = await integrationRepository.listConnectors({ tenantId: scope.tenantId });
      const ollamaConnector = allConnectors.find((c: any) => String(c.system || '').toLowerCase() === 'ollama');
      if (ollamaConnector) {
        const auth = typeof ollamaConnector.auth_config === 'object' && ollamaConnector.auth_config
          ? ollamaConnector.auth_config as Record<string, any>
          : {};
        if (auth.base_url) baseUrl = String(auth.base_url);
      }
    } catch { /* ignore */ }
    if (!baseUrl) {
      return { status: 'failed', error: 'ai.ollama: base URL not configured. Go to Integrations → Connect Ollama and enter your Ollama server URL.' };
    }
    const prompt = resolveTemplateValue(config.prompt || '', context);
    const model = String(config.model || '');
    if (!prompt) return { status: 'failed', error: 'ai.ollama: prompt is required' };
    if (!model) return { status: 'failed', error: 'ai.ollama: model is required (must be installed on the Ollama server)' };
    const systemInstruction = resolveTemplateValue(config.systemInstruction || '', context);
    const temperature = config.temperature !== undefined && config.temperature !== '' ? Number(config.temperature) : undefined;
    const target = String(config.target || 'ollamaResult');

    try {
      const body: any = { model, prompt, stream: false };
      if (systemInstruction) body.system = systemInstruction;
      if (temperature !== undefined && Number.isFinite(temperature)) body.options = { temperature };
      const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      const json: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return { status: 'failed', error: `ai.ollama: ${resp.status} ${json?.error ?? resp.statusText}` };
      }
      const text = String(json?.response ?? '').trim();
      context.agent = { ...(context.agent ?? {}), [target]: text };
      context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: text };
      return { status: 'completed', output: { text, target, model } };
    } catch (err: any) {
      return { status: 'failed', error: `ai.ollama call failed: ${err?.message ?? String(err)}` };
    }
  }

  // Guardrails: a lightweight safety filter using Gemini (or pattern matching as
  // fallback) to detect PII / toxicity / prompt injection / off-topic content.
  if (node.key === 'ai.guardrails') {
    const text = resolveTemplateValue(config.text || '', context);
    if (!text) return { status: 'failed', error: 'ai.guardrails: text is required' };
    const mode = String(config.mode || 'input');
    const checks = String(config.checks || 'pii,toxicity,prompt_injection')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const topic = config.topic ? resolveTemplateValue(String(config.topic), context) : '';
    const target = String(config.target || 'guardResult');

    // Pattern-based fast checks (cheap, no API call)
    const issues: Array<{ check: string; matched: boolean; detail?: string }> = [];
    if (checks.includes('pii')) {
      const piiPatterns = [
        /\b\d{3}-\d{2}-\d{4}\b/, // SSN
        /\b(?:\d[ -]*?){13,16}\b/, // Credit card
        /\b[\w.-]+@[\w.-]+\.[a-z]{2,}\b/i, // email
      ];
      const matched = piiPatterns.some((p) => p.test(text));
      issues.push({ check: 'pii', matched });
    }
    if (checks.includes('prompt_injection') || checks.includes('jailbreak')) {
      const injectionPatterns = [
        /ignore (?:all|previous) instructions/i,
        /system prompt/i,
        /you are now/i,
        /developer mode/i,
        /jailbreak/i,
        /pretend (?:you are|to be)/i,
      ];
      const matched = injectionPatterns.some((p) => p.test(text));
      issues.push({ check: 'prompt_injection', matched });
    }
    if (checks.includes('toxicity')) {
      const toxicWords = /(\bhate\b|\bkill\b|\bfucking?\b|\bidiot\b|\bstupid\b)/i;
      issues.push({ check: 'toxicity', matched: toxicWords.test(text) });
    }
    if (checks.includes('off_topic') && topic && appConfig.ai.geminiApiKey) {
      // Use Gemini to classify on/off-topic
      try {
        const genAI = new GoogleGenerativeAI(appConfig.ai.geminiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const judgePrompt = `Is the following text relevant to the topic "${topic}"? Answer with a single word: YES or NO.\n\nText: ${text}`;
        const result = await withGeminiRetry(
          () => model.generateContent({ contents: [{ role: 'user', parts: [{ text: judgePrompt }] }], generationConfig: { maxOutputTokens: 8 } }),
          { label: 'workflow.ai.guardrails.off_topic' },
        );
        const verdict = result.response.text().trim().toUpperCase();
        issues.push({ check: 'off_topic', matched: verdict.startsWith('NO'), detail: `topic=${topic}, verdict=${verdict}` });
      } catch (err: any) {
        issues.push({ check: 'off_topic', matched: false, detail: `judge failed: ${err?.message ?? String(err)}` });
      }
    }

    const flagged = issues.filter((i) => i.matched);
    const safe = flagged.length === 0;
    const guardResult = { safe, mode, issues, flagged: flagged.map((f) => f.check) };
    context.data = { ...(context.data && typeof context.data === 'object' ? context.data : {}), [target]: guardResult };
    return {
      status: safe ? 'completed' : 'blocked',
      output: { ...guardResult, target },
      error: safe ? null : `Guardrails blocked: ${flagged.map((f) => f.check).join(', ')}`,
    };
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

  // ── External messaging wrappers (real transport) ────────────────────────────
  // Each message.* node:
  //   1. Validates that a connector for the system is configured + healthy
  //   2. Reads auth_config (bot tokens, webhook URLs) from the connector
  //   3. Calls the provider API to send the message
  //   4. Records a canonical event in the integration timeline regardless of
  //      success or failure so admins can audit attempts
  if (node.key.startsWith('message.')) {
    const system = node.key.split('.')[1]; // slack, discord, telegram, gmail, outlook, teams, google_chat
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
    const auth = (() => {
      const raw = connector.auth_config;
      if (!raw) return {} as Record<string, any>;
      if (typeof raw === 'object') return raw as Record<string, any>;
      try { return JSON.parse(String(raw)); } catch { return {}; }
    })();

    const dest = resolveTemplateValue(
      config.channel || config.chatId || config.to || config.space || '',
      context,
    );
    const content = resolveTemplateValue(config.content || config.body || config.message || '', context);
    if (!dest) return { status: 'failed', error: `${node.key}: destination (channel / to / chatId / space) is required.` };
    if (!content) return { status: 'failed', error: `${node.key}: message content is required.` };

    // ── Provider-specific transport ──
    let delivery: { ok: boolean; messageId?: string; error?: string } = { ok: false };
    try {
      if (system === 'slack') {
        const token = auth.bot_token || auth.access_token || auth.token;
        if (!token) {
          delivery = { ok: false, error: 'Slack: bot_token not in connector auth_config. Reconnect Slack in Integrations.' };
        } else {
          const slackBody: any = { channel: dest, text: content };
          if (config.thread_ts) slackBody.thread_ts = resolveTemplateValue(String(config.thread_ts), context);
          const resp = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(slackBody),
            signal: AbortSignal.timeout(15_000),
          });
          const json: any = await resp.json().catch(() => ({}));
          delivery = json.ok ? { ok: true, messageId: json.ts } : { ok: false, error: `Slack: ${json.error ?? resp.statusText}` };
        }
      } else if (system === 'discord') {
        // Discord uses webhook URLs. The user can pass it as `channel` or store it in auth_config.webhook_url.
        const webhookUrl = /^https?:\/\//i.test(dest) ? dest : (auth.webhook_url || '');
        if (!webhookUrl) {
          delivery = { ok: false, error: 'Discord: provide a webhook URL as the channel field or store it in connector auth_config.webhook_url.' };
        } else {
          const body: any = { content };
          if (config.username) body.username = String(config.username);
          const resp = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
          });
          delivery = resp.ok ? { ok: true } : { ok: false, error: `Discord: ${resp.status} ${resp.statusText}` };
        }
      } else if (system === 'telegram') {
        const token = auth.bot_token || auth.token;
        if (!token) {
          delivery = { ok: false, error: 'Telegram: bot_token not in connector auth_config.' };
        } else {
          const body: any = { chat_id: dest, text: content };
          if (config.parseMode) body.parse_mode = String(config.parseMode);
          const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
          });
          const json: any = await resp.json().catch(() => ({}));
          delivery = json.ok ? { ok: true, messageId: String(json.result?.message_id ?? '') } : { ok: false, error: `Telegram: ${json.description ?? resp.statusText}` };
        }
      } else if (system === 'teams') {
        // Teams uses incoming webhook URLs (per channel). Either the user passes
        // it in the channel field, or it's stored in auth_config.webhook_url.
        const webhookUrl = /^https?:\/\//i.test(dest) ? dest : (auth.webhook_url || '');
        if (!webhookUrl) {
          delivery = { ok: false, error: 'Teams: provide a channel webhook URL.' };
        } else {
          const card: any = {
            '@type': 'MessageCard',
            '@context': 'https://schema.org/extensions',
            summary: config.title || 'CRM-AI alert',
            themeColor: '0078D4',
            title: config.title || undefined,
            text: content,
          };
          const resp = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(card),
            signal: AbortSignal.timeout(15_000),
          });
          delivery = resp.ok ? { ok: true } : { ok: false, error: `Teams: ${resp.status} ${resp.statusText}` };
        }
      } else if (system === 'google_chat') {
        const webhookUrl = /^https?:\/\//i.test(dest) ? dest : (auth.webhook_url || '');
        if (!webhookUrl) {
          delivery = { ok: false, error: 'Google Chat: provide a space webhook URL.' };
        } else {
          const resp = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({ text: content }),
            signal: AbortSignal.timeout(15_000),
          });
          delivery = resp.ok ? { ok: true } : { ok: false, error: `Google Chat: ${resp.status} ${resp.statusText}` };
        }
      } else if (system === 'gmail' || system === 'outlook') {
        const subject = resolveTemplateValue(config.subject || 'Update', context) || 'Update';
        const sendFn = system === 'gmail' ? sendGmail : sendOutlookMail;
        const result = await sendFn(
          { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
          connector.id,
          auth,
          { to: dest, subject, body: content },
        );
        if (result.ok) {
          delivery = { ok: true, messageId: result.messageId ?? '' };
        } else if (result.transient) {
          // Transient (5xx) → throw so workflow retry policy fires
          throw new Error(result.error || `${system}: transient transport error`);
        } else {
          delivery = { ok: false, error: result.error || `${system}: send failed` };
        }
      } else {
        delivery = { ok: false, error: `${system}: unsupported messaging system` };
      }
    } catch (err: any) {
      delivery = { ok: false, error: `${system} transport exception: ${err?.message ?? String(err)}` };
    }

    // Always log a canonical event so the integration timeline shows what happened.
    const canonicalEvent = await integrationRepository.createCanonicalEvent({ tenantId: scope.tenantId }, {
      sourceSystem: system,
      sourceEntityType: 'workflow',
      sourceEntityId: node.id,
      eventType: delivery.ok ? `${system}.message.sent` : `${system}.message.failed`,
      eventCategory: 'workflow',
      canonicalEntityType: context.case ? 'case' : 'workflow',
      canonicalEntityId: context.case?.id || node.id,
      normalizedPayload: { nodeId: node.id, destination: dest, content, delivery },
      dedupeKey: `${node.id}:${system}:${Date.now()}`,
      caseId: context.case?.id ?? null,
      workspaceId: scope.workspaceId,
      status: delivery.ok ? 'processed' : 'failed',
    });
    context.integration = { connectorId: connector.id, system, destination: dest, canonicalEventId: canonicalEvent.id, delivered: delivery.ok };

    if (!delivery.ok) {
      return { status: 'failed', error: delivery.error || `${system}: send failed`, output: { system, connectorId: connector.id, destination: dest, canonicalEventId: canonicalEvent.id } };
    }
    return {
      status: 'completed',
      output: { system, connectorId: connector.id, destination: dest, messageId: delivery.messageId, canonicalEventId: canonicalEvent.id, delivered: true },
    };
  }

  // ── data.http_request extracted to server/runtime/adapters/data.ts (Phase 3a)

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
    // Bug-2 fix: when the scheduler has aggregated upstream branch outputs into
    // `context.__mergeInputs` (Map<sourceId, output>), expose them as
    // `output.merged.from_<sourceId>`. The scheduler is responsible for not
    // firing this node until ALL incoming edges have arrived. If no merge
    // inputs have been seeded (legacy / single-incoming caller) we degenerate
    // to a passthrough.
    const inputs = context.__mergeInputs;
    const merged: Record<string, any> = {};
    if (inputs && typeof inputs === 'object') {
      for (const [sourceId, payload] of Object.entries(inputs)) {
        merged[`from_${sourceId}`] = payload;
      }
    }
    return {
      status: 'completed',
      output: {
        merged: Object.keys(merged).length > 0 ? merged : { passthrough: true },
        mode: config.mode || 'wait-all',
        sources: Object.keys(merged),
      },
    };
  }

  if (node.key === 'flow.loop') {
    // Resolve the items array. Accepts either a context path ("steps.fetch.output.items"),
    // a JSONPath-ish "$.steps.fetch.output.items", or a literal array via config.items.
    const rawSource = config.items ?? config.source ?? 'data.items';
    let resolvedItems: any;
    if (Array.isArray(rawSource)) {
      resolvedItems = rawSource;
    } else if (typeof rawSource === 'string') {
      const cleaned = rawSource.replace(/^\$\.?/, '');
      resolvedItems = readContextPath(context, cleaned);
      if (resolvedItems == null) resolvedItems = asArray(rawSource);
    } else {
      resolvedItems = rawSource;
    }
    if (!Array.isArray(resolvedItems)) {
      return { status: 'failed', error: `flow.loop: el campo "items" no resolvió a un array (recibido ${typeof resolvedItems}).` };
    }
    const items = resolvedItems;
    const maxIterations = Math.max(1, Number(config.maxIterations || config.max_iterations || 1000));
    const truncated = items.length > maxIterations;
    const sliced = truncated ? items.slice(0, maxIterations) : items;
    logger.info('flow.loop start', { nodeId: node.id, count: sliced.length, maxIterations, truncated });

    const aggregated: any[] = [];
    let failures = 0;
    // Bug-1 fix: if the scheduler has provided a body runner via
    // `context.__bodyRunner`, invoke it per item so downstream `body`-handle
    // nodes actually execute once per iteration. The runner walks the body
    // sub-graph and returns the terminal step's output. When no runner is
    // wired (legacy / pre-fan-out callers), we fall back to the previous
    // snapshot-only behaviour so existing tests keep passing.
    const bodyRunner: ((loopBinding: any) => Promise<any>) | undefined =
      typeof context.__bodyRunner === 'function' ? context.__bodyRunner : undefined;
    for (let index = 0; index < sliced.length; index += 1) {
      const item = sliced[index];
      context.loop = { item, index, count: sliced.length, maxIterations };
      try {
        if (bodyRunner) {
          const bodyResult = await bodyRunner({ item, index, count: sliced.length });
          const bodyOutput = bodyResult?.output ?? bodyResult ?? {};
          const bodyStatus = bodyResult?.status ?? 'completed';
          const ok = bodyStatus !== 'failed';
          if (!ok) failures += 1;
          aggregated.push({
            index,
            item,
            ok,
            status: bodyStatus,
            output: bodyOutput,
            snapshot: cloneJson(context.data ?? {}),
            ...(bodyResult?.error ? { error: bodyResult.error } : {}),
          });
        } else {
          aggregated.push({ index, item, ok: true, snapshot: cloneJson(context.data ?? {}) });
        }
      } catch (err: any) {
        failures += 1;
        aggregated.push({ index, item, ok: false, error: err?.message ?? String(err) });
        logger.warn('flow.loop iteration failed', { nodeId: node.id, index, error: err?.message ?? String(err) });
      }
    }

    context.loop = { items: sliced, count: sliced.length, maxIterations, truncated, completed: true };
    context.data = {
      ...(context.data && typeof context.data === 'object' ? context.data : {}),
      [String(config.target || 'loopResults')]: aggregated,
    };
    logger.info('flow.loop done', { nodeId: node.id, count: sliced.length, failures, truncated });
    return {
      status: failures > 0 && failures === sliced.length ? 'failed' : 'completed',
      output: {
        looped: true,
        count: sliced.length,
        truncated,
        failures,
        items: aggregated,
        target: config.target || 'loopResults',
      },
      ...(failures > 0 && failures === sliced.length
        ? { error: `flow.loop: todas las ${sliced.length} iteraciones fallaron.` }
        : {}),
    };
  }

  if (node.key === 'flow.subworkflow') {
    const subWorkflowId = config.workflow || config.workflowId || null;
    if (!subWorkflowId) return { status: 'failed', error: 'flow.subworkflow requires workflow id' };
    const definition = await workflowRepository.getDefinition(subWorkflowId, scope.tenantId, scope.workspaceId);
    if (!definition) return { status: 'failed', error: 'Sub-workflow not found' };
    const version = definition.current_version_id
      ? await workflowRepository.getVersion(definition.current_version_id, { tenantId: scope.tenantId })
      : await workflowRepository.getLatestVersion(definition.id, { tenantId: scope.tenantId });
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
    if (!['failed'].includes(String(result.status))) break;
    if (attempt >= retries) break;
    if (backoffMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(backoffMs, 1_500)));
    }
    attempt += 1;
  }

  // ── Step-level audit (Phase 6 — deep SaaS sync) ─────────────────────────────
  // Every node whose contract declares a write or external side-effect generates
  // an audit_log entry identical to the one produced by the equivalent UI action.
  // This means: a workflow that runs case.update_status leaves the same trail as
  // a supervisor clicking "Update status" in the case panel.
  try {
    const contract = getNodeContract(node.key);
    const sideEffects = contract.sideEffects ?? 'none';
    if (sideEffects === 'write' || sideEffects === 'external') {
      const finalResult = lastResult ?? { status: 'failed' };
      const action = `WORKFLOW_${String(node.key).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
      const entityType = node.key.startsWith('case.') ? 'case'
        : node.key.startsWith('order.') ? 'order'
        : node.key.startsWith('payment.') ? 'payment'
        : node.key.startsWith('return.') ? 'return'
        : node.key.startsWith('approval.') ? 'approval'
        : node.key.startsWith('customer.') ? 'customer'
        : node.key.startsWith('message.') ? 'integration'
        : node.key.startsWith('ai.') || node.key.startsWith('agent.') ? 'agent_run'
        : 'workflow';
      const entityId = (
        context?.case?.id || context?.order?.id || context?.payment?.id ||
        context?.return?.id || context?.customer?.id || node.id
      );
      await auditRepository.logEvent(
        { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
        {
          actorId: scope.userId ?? 'workflow',
          action,
          entityType,
          entityId,
          metadata: {
            nodeKey: node.key,
            nodeLabel: node.label ?? null,
            nodeId: node.id,
            status: finalResult.status,
            error: finalResult.error ?? null,
            sideEffects,
            risk: contract.risk ?? 'low',
            attempt,
          },
        },
      ).catch(() => undefined);
    }
  } catch (auditErr: any) {
    logger.warn('workflow step audit failed', { nodeId: node.id, key: node.key, error: String(auditErr?.message ?? auditErr) });
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

  // Idempotency: if the trigger payload carries a trace_id and a run already
  // exists for this version + trace_id, return that run instead of creating a
  // duplicate. This protects against double-fires from retries / cron sweeps.
  const traceId = triggerPayload?.trace_id ?? triggerPayload?.traceId ?? null;
  if (traceId && !retryOfRunId) {
    const { data: existing } = await supabase
      .from('workflow_runs')
      .select('id, status, error')
      .eq('tenant_id', tenantId)
      .eq('workflow_version_id', version.id)
      .eq('trigger_payload->>trace_id', String(traceId))
      .limit(1);
    if (existing && existing.length > 0) {
      const prior = existing[0];
      logger.info('executeWorkflowVersion: idempotent replay, returning existing run', {
        traceId, runId: prior.id, status: prior.status,
      });
      const { data: priorSteps } = await supabase
        .from('workflow_run_steps')
        .select('*')
        .eq('workflow_run_id', prior.id)
        .order('started_at', { ascending: true });
      return { id: prior.id, status: prior.status, error: prior.error ?? null, steps: priorSteps ?? [], retryOfRunId: null };
    }
  }

  const { error: runError } = await supabase.from('workflow_runs').insert({
    id: runId,
    workflow_version_id: version.id,
    case_id: caseId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
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
  }).eq('id', runId).eq('tenant_id', tenantId).eq('workspace_id', workspaceId);
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

  // Dispatch trigger.workflow_error event so error-handler workflows can react.
  // Skipped on retries to avoid loops.
  if (finalStatus === 'failed' && triggerType !== 'workflow.error' && !retryOfRunId) {
    try {
      await executeWorkflowsByEvent(
        { tenantId, workspaceId, userId },
        'trigger.workflow_error',
        {
          sourceWorkflowId: workflowId,
          sourceRunId: runId,
          severity: 'error',
          error: finalError,
          failedNodeId: steps.find((s) => s.status === 'failed')?.node_id ?? null,
          failedNodeKey: steps.find((s) => s.status === 'failed')?.node_id ?? null,
        },
      );
    } catch (dispatchErr: any) {
      logger.warn('workflow_error event dispatch failed', { runId, error: String(dispatchErr?.message ?? dispatchErr) });
    }
  }

  return { id: runId, status: finalStatus, error: finalError, steps, retryOfRunId };
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

