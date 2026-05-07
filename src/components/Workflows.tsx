import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { connectorsApi, workflowsApi, workspacesApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import { ActionModal } from './ActionModal';
import type { NavigateFn } from '../types';
import LoadingState from './LoadingState';
import StyledSelect from './StyledSelect';

type WorkflowView = 'list' | 'builder';
type WorkflowTab = 'overview' | 'builder' | 'runs' | 'evaluations';
type WorkflowLibrarySection = 'workflows' | 'executions' | 'variables' | 'data_tables';
type NodeType = 'trigger' | 'condition' | 'action' | 'agent' | 'policy' | 'knowledge' | 'integration' | 'utility';
type AddPanelMode = { sourceNodeId?: string; sourceHandle?: string; edgeId?: string } | null;

interface WorkflowNode {
  id: string;
  type: NodeType;
  key: string;
  label: string;
  position: { x: number; y: number };
  config: Record<string, any>;
  disabled?: boolean;
  credentialsRef?: string | null;
  retryPolicy?: {
    retries?: number;
    backoffMs?: number;
  } | null;
  ui?: {
    notes?: string;
    displayNote?: boolean;
    ports?: string[];
  };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
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

function normalizeNodeType(type: any, key?: any): NodeType {
  const raw = String(type ?? key ?? '').toLowerCase();
  if (raw === 'decision') return 'condition';
  if (raw === 'approval' || raw === 'human_review') return 'action';
  if (raw === 'task') return String(key ?? '').includes('agent') ? 'agent' : 'action';
  if (['trigger', 'condition', 'action', 'agent', 'policy', 'knowledge', 'integration', 'utility'].includes(raw)) return raw as NodeType;
  return 'action';
}

function normalizeNodeKey(node: any, type: NodeType) {
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

interface Workflow {
  id: string;
  name: string;
  category: string;
  description: string;
  status: 'needs_setup' | 'blocked' | 'active' | 'warning' | 'dependency_missing';
  statusMessage?: string;
  metrics: { label: string; value: string; suffix?: string }[];
  lastRun: string;
  lastEdited: string;
  currentVersion?: any;
  versions?: any[];
  recentRuns?: any[];
}

interface WorkflowVariableReference {
  key: string;
  workflowIds: string[];
  workflowNames: string[];
  examples: string[];
}

type WorkflowVariableScope = 'workspace' | 'workflow' | 'secure';

interface WorkflowVariableRecord {
  id: string;
  key: string;
  value: string;
  scope: WorkflowVariableScope;
  createdAt: string;
  updatedAt: string;
}

type WorkflowColumnType = 'string' | 'number' | 'boolean' | 'datetime';

interface WorkflowDataTableColumn {
  id: string;
  name: string;
  type: WorkflowColumnType;
}

interface WorkflowDataTableRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  values: Record<string, string | number | boolean | null>;
}

interface WorkflowDataTableRecord {
  id: string;
  name: string;
  source: 'scratch' | 'csv';
  columns: WorkflowDataTableColumn[];
  rows: WorkflowDataTableRow[];
  createdAt: string;
  updatedAt: string;
}

interface WorkflowTableReference {
  key: string;
  workflowIds: string[];
  workflowNames: string[];
  sources: string[];
}

interface NodeSpec {
  type: NodeType;
  key: string;
  label: string;
  category: string;
  icon: string;
  requiresConfig?: boolean;
  sensitive?: boolean;
  description?: string;
  /** Pre-filled config applied when this node is inserted onto the canvas (e.g. agent slug for agent.run) */
  defaultConfig?: Record<string, any>;
}

type WorkflowActionDialogState =
  | { kind: 'rename'; value: string }
  | { kind: 'description'; value: string }
  | { kind: 'move'; value: string }
  | { kind: 'import_url'; value: string }
  | { kind: 'archive' };

interface WorkflowDiagnostic {
  nodeId: string | null;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  blocking?: boolean;
}

interface WorkflowsProps {
  onNavigate?: NavigateFn;
  focusWorkflowId?: string | null;
  initialView?: WorkflowView;
  createNewOnMount?: boolean;
}

type FlowNodeData = {
  workflowNode: WorkflowNode;
  spec?: NodeSpec;
  selected?: boolean;
  latestStatus?: string;
  diagnostics?: WorkflowDiagnostic[];
  onSelect: (nodeId: string) => void;
  onAdd: (nodeId: string, handle?: string) => void;
  onEdit: (nodeId: string) => void;
  onExecute: (nodeId: string) => void;
  onToggle: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onMenu: (nodeId: string, point: { x: number; y: number }) => void;
};

const FALLBACK_CATALOG: NodeSpec[] = [
  { type: 'trigger', key: 'case.created', label: 'Case created', category: 'Trigger', icon: 'assignment', description: 'Starts when a case is created.' },
  { type: 'trigger', key: 'message.received', label: 'Message received', category: 'Trigger', icon: 'chat', description: 'Starts when a message arrives.' },
  { type: 'trigger', key: 'order.updated', label: 'Order updated', category: 'Trigger', icon: 'shopping_bag', description: 'Starts when order data changes.' },
  { type: 'trigger', key: 'case.updated', label: 'Case updated', category: 'Trigger', icon: 'published_with_changes', description: 'Starts when a case changes.' },
  { type: 'trigger', key: 'customer.updated', label: 'Customer updated', category: 'Trigger', icon: 'manage_accounts', description: 'Starts when customer data changes.' },
  { type: 'trigger', key: 'sla.breached', label: 'SLA breached', category: 'Trigger', icon: 'timer_off', description: 'Starts when a case breaches SLA.' },
  { type: 'trigger', key: 'payment.failed', label: 'Payment failed', category: 'Trigger', icon: 'payments', description: 'Starts when a payment fails and needs review.' },
  { type: 'trigger', key: 'payment.dispute.created', label: 'Payment dispute created', category: 'Trigger', icon: 'report', description: 'Starts when a payment dispute appears.' },
  { type: 'trigger', key: 'return.created', label: 'Return created', category: 'Trigger', icon: 'keyboard_return', description: 'Starts when a return is opened.' },
  { type: 'trigger', key: 'approval.decided', label: 'Approval decided', category: 'Trigger', icon: 'task_alt', description: 'Starts when an approval is approved or rejected.' },
  { type: 'trigger', key: 'webhook.received', label: 'Webhook received', category: 'Trigger', icon: 'webhook', requiresConfig: true, description: 'Starts from an inbound external webhook.' },
  { type: 'trigger', key: 'shipment.updated', label: 'Shipment updated', category: 'Trigger', icon: 'local_shipping', description: 'Starts when shipment status changes.' },
  { type: 'trigger', key: 'manual.run', label: 'Manual run', category: 'Trigger', icon: 'play_arrow', description: 'Starts when a user runs it.' },
  { type: 'trigger', key: 'trigger.form_submission', label: 'On form submission', category: 'Trigger', icon: 'description', requiresConfig: true, description: 'Starts when a public CRM-AI form is submitted.' },
  { type: 'trigger', key: 'trigger.chat_message', label: 'On chat message', category: 'Trigger', icon: 'forum', requiresConfig: true, description: 'Starts when a user sends a message to the chat surface.' },
  { type: 'trigger', key: 'trigger.workflow_error', label: 'On workflow error', category: 'Trigger', icon: 'error_outline', requiresConfig: true, description: 'Starts when another workflow fails. Use this to handle errors centrally.' },
  { type: 'trigger', key: 'trigger.subworkflow_called', label: 'When called by another workflow', category: 'Trigger', icon: 'login', requiresConfig: false, description: 'Starts when another workflow invokes this one via Execute sub-workflow.' },
  { type: 'trigger', key: 'trigger.evaluation_run', label: 'When running evaluation', category: 'Trigger', icon: 'science', requiresConfig: false, description: 'Starts when this workflow is invoked by an Evaluations dataset run.' },
  { type: 'condition', key: 'amount.threshold', label: 'Amount threshold', category: 'Flow', icon: 'alt_route', requiresConfig: true, description: 'Branch based on a numeric amount.' },
  { type: 'condition', key: 'status.matches', label: 'Status matches', category: 'Flow', icon: 'rule', requiresConfig: true, description: 'Branch based on status.' },
  { type: 'condition', key: 'risk.level', label: 'Risk level', category: 'Flow', icon: 'gpp_maybe', requiresConfig: true, description: 'Branch based on risk.' },
  { type: 'condition', key: 'conflict.exists', label: 'Conflict exists', category: 'Flow', icon: 'sync_problem', description: 'Branch if a conflict exists.' },
  { type: 'condition', key: 'flow.if', label: 'If', category: 'Flow', icon: 'question_mark', requiresConfig: true, description: 'Route items to different branches (true/false).' },
  { type: 'condition', key: 'flow.filter', label: 'Filter', category: 'Flow', icon: 'filter_alt', requiresConfig: true, description: 'Keep only items matching a condition.' },
  { type: 'condition', key: 'flow.switch', label: 'Switch', category: 'Flow', icon: 'shuffle', requiresConfig: true, description: 'Route items to different branches by rules.' },
  { type: 'condition', key: 'flow.compare', label: 'Compare datasets', category: 'Flow', icon: 'compare_arrows', requiresConfig: true, description: 'Compare two inputs and branch on the result.' },
  { type: 'condition', key: 'flow.branch', label: 'Branch', category: 'Flow', icon: 'account_tree', requiresConfig: true, description: 'Split one flow into multiple routes.' },
  { type: 'utility', key: 'flow.note', label: 'Sticky Note', category: 'Flow', icon: 'sticky_note_2', requiresConfig: true, description: 'Add a persistent documentation note to the canvas.' },
  { type: 'utility', key: 'flow.merge', label: 'Merge', category: 'Flow', icon: 'merge', requiresConfig: true, description: 'Join parallel branches into one stream.' },
  { type: 'utility', key: 'flow.loop', label: 'Loop Over Items (Split in Batches)', category: 'Flow', icon: 'repeat', requiresConfig: true, description: 'Iterate over items in batches or one by one.' },
  { type: 'utility', key: 'flow.wait', label: 'Wait', category: 'Flow', icon: 'hourglass_top', requiresConfig: true, description: 'Pause before continuing the flow.' },
  { type: 'utility', key: 'flow.subworkflow', label: 'Execute sub-workflow', category: 'Flow', icon: 'subdirectory_arrow_right', requiresConfig: true, description: 'Call another workflow as a reusable step.' },
  { type: 'utility', key: 'flow.stop_error', label: 'Stop and error', category: 'Flow', icon: 'error', requiresConfig: true, description: 'Stop execution and raise an explicit error.' },
  { type: 'utility', key: 'flow.noop', label: 'No-op', category: 'Flow', icon: 'passkey', description: 'Pass data through without changes.' },
  { type: 'utility', key: 'data.set_fields', label: 'Set fields', category: 'Data transformation', icon: 'edit_note', requiresConfig: true, description: 'Set or override fields in the payload.' },
  { type: 'utility', key: 'data.rename_fields', label: 'Rename fields', category: 'Data transformation', icon: 'drive_file_rename_outline', requiresConfig: true, description: 'Rename keys in an object payload.' },
  { type: 'utility', key: 'data.extract_json', label: 'Extract JSON', category: 'Data transformation', icon: 'data_object', requiresConfig: true, description: 'Parse structured JSON from text.' },
  { type: 'utility', key: 'data.normalize_text', label: 'Normalize text', category: 'Data transformation', icon: 'text_format', requiresConfig: true, description: 'Trim, lowercase, and normalize text values.' },
  { type: 'utility', key: 'data.format_date', label: 'Format date', category: 'Data transformation', icon: 'event', requiresConfig: true, description: 'Convert a date into a standardized format.' },
  { type: 'utility', key: 'data.split_items', label: 'Split items', category: 'Data transformation', icon: 'split_scene', requiresConfig: true, description: 'Split a string or array into multiple items.' },
  { type: 'utility', key: 'data.dedupe', label: 'Deduplicate', category: 'Data transformation', icon: 'content_copy', requiresConfig: true, description: 'Remove duplicate entries from a list.' },
  { type: 'utility', key: 'data.map_fields', label: 'Map fields', category: 'Data transformation', icon: 'map', requiresConfig: true, description: 'Map one object structure into another.' },
  { type: 'utility', key: 'data.clean_context', label: 'Clean context', category: 'Data transformation', icon: 'cleaning_services', requiresConfig: true, description: 'Remove or prune keys from the workflow data to save memory and tokens.' },
  { type: 'utility', key: 'data.pick_fields', label: 'Pick fields', category: 'Data transformation', icon: 'select_all', requiresConfig: true, description: 'Keep only selected fields from a payload.' },
  { type: 'utility', key: 'data.merge_objects', label: 'Merge objects', category: 'Data transformation', icon: 'join_inner', requiresConfig: true, description: 'Merge multiple objects into one payload.' },
  { type: 'utility', key: 'data.validate_required', label: 'Validate required fields', category: 'Data transformation', icon: 'fact_check', requiresConfig: true, description: 'Block the flow if required fields are missing.' },
  { type: 'utility', key: 'data.calculate', label: 'Calculate value', category: 'Data transformation', icon: 'calculate', requiresConfig: true, description: 'Compute a numeric value from workflow data.' },
  { type: 'utility', key: 'data.aggregate', label: 'Aggregate', category: 'Data transformation', icon: 'list_alt', requiresConfig: true, description: 'Combine a field from many items into a list, sum, average, min or max.' },
  { type: 'utility', key: 'data.limit', label: 'Limit', category: 'Data transformation', icon: 'crop', requiresConfig: true, description: 'Restrict the number of items passed downstream.' },
  { type: 'utility', key: 'data.split_out', label: 'Split out', category: 'Data transformation', icon: 'call_split', requiresConfig: true, description: 'Turn a list inside an item into separate items.' },
  { type: 'utility', key: 'data.ai_transform', label: 'AI Transform', category: 'Data transformation', icon: 'magic_button', requiresConfig: true, description: 'Modify data with plain-English instructions using Gemini.' },
  // ── Core nodes ──────────────────────────────────────────────────────────
  { type: 'utility', key: 'core.code', label: 'Code', category: 'Core', icon: 'code', requiresConfig: true, description: 'Run custom JavaScript code in a sandbox.' },
  { type: 'utility', key: 'core.data_table_op', label: 'Data table', category: 'Core', icon: 'table_view', requiresConfig: true, description: 'Read or write rows in a workspace data table.' },
  { type: 'utility', key: 'core.respond_webhook', label: 'Respond to webhook', category: 'Core', icon: 'reply_all', requiresConfig: true, description: 'Return a custom HTTP response to the originating webhook trigger.' },
  { type: 'agent', key: 'ai.information_extractor', label: 'Information Extractor', category: 'AI', icon: 'fact_check', requiresConfig: true, description: 'Extract structured information from free text using Gemini.' },
  { type: 'action', key: 'case.assign', label: 'Assign case', category: 'Action', icon: 'person_add', requiresConfig: true, description: 'Assign a case to a user or team.' },
  { type: 'action', key: 'case.reply', label: 'Send reply', category: 'Action', icon: 'reply', requiresConfig: true, description: 'Send a customer reply.' },
  { type: 'action', key: 'case.note', label: 'Create internal note', category: 'Action', icon: 'note_add', requiresConfig: true, description: 'Add a private note to the case.' },
  { type: 'action', key: 'case.update_status', label: 'Update case status', category: 'Action', icon: 'published_with_changes', requiresConfig: true, description: 'Move a case to a new operational status.' },
  { type: 'action', key: 'case.set_priority', label: 'Set case priority', category: 'Action', icon: 'priority_high', requiresConfig: true, description: 'Update priority, severity, or risk.' },
  { type: 'action', key: 'case.add_tag', label: 'Add case tag', category: 'Action', icon: 'sell', requiresConfig: true, description: 'Append a tag to the case.' },
  { type: 'action', key: 'order.cancel', label: 'Cancel order', category: 'Action', icon: 'block', requiresConfig: true, sensitive: true, description: 'Cancel an eligible order.' },
  { type: 'action', key: 'order.hold', label: 'Place order hold', category: 'Action', icon: 'pause_circle', requiresConfig: true, sensitive: true, description: 'Pause fulfillment while an issue is reviewed.' },
  { type: 'action', key: 'order.release', label: 'Release order hold', category: 'Action', icon: 'play_circle', requiresConfig: true, description: 'Release a previously held order.' },
  { type: 'action', key: 'payment.refund', label: 'Issue refund', category: 'Action', icon: 'currency_exchange', requiresConfig: true, sensitive: true, description: 'Issue a safe refund or request approval.' },
  { type: 'action', key: 'payment.mark_dispute', label: 'Mark payment dispute', category: 'Action', icon: 'gavel', requiresConfig: true, sensitive: true, description: 'Mark a payment as disputed and route finance review.' },
  { type: 'action', key: 'return.create', label: 'Create return', category: 'Action', icon: 'assignment_return', requiresConfig: true, description: 'Create a return record.' },
  { type: 'action', key: 'return.approve', label: 'Approve return', category: 'Action', icon: 'task_alt', requiresConfig: true, description: 'Approve a return for processing.' },
  { type: 'action', key: 'return.reject', label: 'Reject return', category: 'Action', icon: 'do_not_disturb_on', requiresConfig: true, description: 'Reject a return with a reason.' },
  { type: 'action', key: 'approval.create', label: 'Request approval', category: 'Human review', icon: 'verified', requiresConfig: true, description: 'Ask a human to approve a risky action.' },
  { type: 'action', key: 'approval.escalate', label: 'Escalate approval', category: 'Human review', icon: 'escalator_warning', requiresConfig: true, description: 'Create a higher-priority approval request.' },
  { type: 'action', key: 'notification.email', label: 'Send email', category: 'Action', icon: 'mail', requiresConfig: true, description: 'Send an email directly to the customer.' },
  { type: 'action', key: 'notification.whatsapp', label: 'Send WhatsApp', category: 'Action', icon: 'chat', requiresConfig: true, description: 'Send a WhatsApp message to the customer.' },
  { type: 'action', key: 'notification.sms', label: 'Send SMS', category: 'Action', icon: 'sms', requiresConfig: true, description: 'Send an SMS to the customer.' },
  // ── External messaging (channel wrappers — require connector configured in Integrations) ──
  { type: 'integration', key: 'message.slack', label: 'Slack', category: 'Human review', icon: 'tag', requiresConfig: true, description: 'Send a message to a Slack channel or user. Requires Slack configured in Integrations.' },
  { type: 'integration', key: 'message.discord', label: 'Discord', category: 'Human review', icon: 'forum', requiresConfig: true, description: 'Send a message to a Discord channel via webhook. Requires Discord configured in Integrations.' },
  { type: 'integration', key: 'message.telegram', label: 'Telegram', category: 'Human review', icon: 'send', requiresConfig: true, description: 'Send a message via Telegram Bot. Requires Telegram configured in Integrations.' },
  { type: 'integration', key: 'message.gmail', label: 'Gmail', category: 'Human review', icon: 'mail', requiresConfig: true, description: 'Send an email through your Gmail account. Requires Gmail OAuth in Integrations.' },
  { type: 'integration', key: 'message.outlook', label: 'Microsoft Outlook', category: 'Human review', icon: 'mark_email_unread', requiresConfig: true, description: 'Send an email through your Outlook / Microsoft 365 account. Requires Outlook OAuth in Integrations.' },
  { type: 'integration', key: 'message.teams', label: 'Microsoft Teams', category: 'Human review', icon: 'groups', requiresConfig: true, description: 'Post a message to a Teams channel. Requires Microsoft Teams configured in Integrations.' },
  { type: 'integration', key: 'message.google_chat', label: 'Google Chat', category: 'Human review', icon: 'chat_bubble', requiresConfig: true, description: 'Post a message to a Google Chat space. Requires Google Workspace configured in Integrations.' },
  { type: 'agent', key: 'agent.run', label: 'Run AI Agent', category: 'AI Agent', icon: 'smart_toy', requiresConfig: true, description: 'Pick an AI Studio agent and run it as a workflow step. Configure agents in AI Studio → Agents.' },
  { type: 'agent', key: 'agent.classify', label: 'Classify case', category: 'AI Agent', icon: 'category', requiresConfig: true, description: 'Classify intent, priority, or risk from a text field.' },
  { type: 'agent', key: 'agent.sentiment', label: 'Analyze sentiment', category: 'AI Agent', icon: 'sentiment_satisfied', requiresConfig: true, description: 'Detect sentiment and frustration signals in customer text.' },
  { type: 'agent', key: 'agent.summarize', label: 'Summarize context', category: 'AI Agent', icon: 'summarize', requiresConfig: true, description: 'Create a concise operational summary of the workflow context.' },
  { type: 'agent', key: 'agent.draft_reply', label: 'Draft reply', category: 'AI Agent', icon: 'edit_square', requiresConfig: true, description: 'Draft a customer-ready response from context.' },
  { type: 'agent', key: 'ai.generate_text', label: 'Generate text (LLM)', category: 'AI', icon: 'auto_awesome', requiresConfig: true, description: 'Generate text using Gemini LLM from a prompt.' },
  { type: 'agent', key: 'ai.gemini', label: 'Google Gemini', category: 'AI', icon: 'diamond', requiresConfig: true, description: 'Interact with Google Gemini models (chat, completion, structured output).' },
  { type: 'agent', key: 'ai.anthropic', label: 'Anthropic Claude', category: 'AI', icon: 'auto_awesome_motion', requiresConfig: true, description: 'Interact with Anthropic Claude models. Requires ANTHROPIC_API_KEY in Integrations.' },
  { type: 'agent', key: 'ai.openai', label: 'OpenAI', category: 'AI', icon: 'memory', requiresConfig: true, description: 'Interact with OpenAI models (GPT-4, GPT-4o, embeddings, etc). Requires OPENAI_API_KEY.' },
  { type: 'agent', key: 'ai.ollama', label: 'Ollama (local)', category: 'AI', icon: 'computer', requiresConfig: true, description: 'Run a local model via an Ollama server. Requires OLLAMA_BASE_URL set.' },
  { type: 'agent', key: 'ai.guardrails', label: 'Guardrails', category: 'AI', icon: 'shield_lock', requiresConfig: true, description: 'Filter prompts or responses through safety/PII/topic checks before continuing.' },
  { type: 'utility', key: 'data.http_request', label: 'HTTP request', category: 'Integration', icon: 'http', requiresConfig: true, description: 'Make an outbound HTTP request and capture the response.' },
  { type: 'policy', key: 'policy.evaluate', label: 'Evaluate policy', category: 'Core', icon: 'shield', requiresConfig: true, description: 'Apply a policy decision.' },
  { type: 'policy', key: 'core.audit_log', label: 'Write audit log', category: 'Core', icon: 'receipt_long', requiresConfig: true, description: 'Write an explicit audit event.' },
  { type: 'policy', key: 'core.idempotency_check', label: 'Idempotency check', category: 'Core', icon: 'fingerprint', requiresConfig: true, description: 'Prevent duplicate executions for the same key.' },
  { type: 'policy', key: 'core.rate_limit', label: 'Rate limit gate', category: 'Core', icon: 'speed', requiresConfig: true, description: 'Pause or block flows that exceed a configured limit.' },
  { type: 'knowledge', key: 'knowledge.search', label: 'Search knowledge', category: 'Knowledge', icon: 'menu_book', requiresConfig: true, description: 'Retrieve relevant articles or SOPs.' },
  { type: 'knowledge', key: 'knowledge.validate_policy', label: 'Validate policy answer', category: 'Knowledge', icon: 'policy', requiresConfig: true, description: 'Check a proposed action against retrieved policy.' },
  { type: 'knowledge', key: 'knowledge.attach_evidence', label: 'Attach evidence', category: 'Knowledge', icon: 'attach_file', requiresConfig: true, description: 'Attach workflow evidence to context.' },
  { type: 'integration', key: 'connector.call', label: 'Call connector', category: 'Integration', icon: 'hub', requiresConfig: true, description: 'Call an enabled connector capability.' },
  { type: 'integration', key: 'connector.emit_event', label: 'Emit integration event', category: 'Integration', icon: 'send', requiresConfig: true, description: 'Create a canonical event for downstream systems.' },
  { type: 'integration', key: 'connector.check_health', label: 'Check connector health', category: 'Integration', icon: 'monitor_heart', requiresConfig: true, description: 'Check connector availability before continuing.' },
  { type: 'utility', key: 'delay', label: 'Delay', category: 'Flow', icon: 'schedule', requiresConfig: true, description: 'Pause execution.' },
  { type: 'utility', key: 'retry', label: 'Retry', category: 'Flow', icon: 'refresh', requiresConfig: true, description: 'Retry after failure.' },
  { type: 'utility', key: 'stop', label: 'Stop workflow', category: 'Flow', icon: 'stop_circle', description: 'Stop the workflow.' },
  { type: 'trigger', key: 'trigger.schedule', label: 'Schedule (cron)', category: 'Trigger', icon: 'event_repeat', requiresConfig: true, description: 'Run the workflow on a cron schedule.' },
];

const TEMPLATES = [
  {
    id: 'refund_guarded',
    label: 'Guarded refund',
    category: 'Payments & risk',
    description: 'Evaluate policy, route high-value refunds to approval, and execute safe refunds.',
    nodes: [
      { type: 'trigger', key: 'message.received', label: 'Refund request', position: { x: 100, y: 240 } },
      { type: 'policy', key: 'policy.evaluate', label: 'Check refund policy', position: { x: 420, y: 220 }, config: { policy: 'refund_policy' } },
      { type: 'condition', key: 'amount.threshold', label: 'Amount under threshold', position: { x: 760, y: 220 }, config: { field: 'payment.amount', operator: '<=', value: 250 } },
      { type: 'action', key: 'payment.refund', label: 'Issue refund', position: { x: 1100, y: 150 }, config: { amount: '{{payment.amount}}', reason: '{{case.reason}}' } },
      { type: 'action', key: 'approval.create', label: 'Request approval', position: { x: 1100, y: 330 }, config: { queue: 'manager' } },
    ],
    edges: [
      { source: 0, target: 1, label: 'next' },
      { source: 1, target: 2, label: 'next' },
      { source: 2, target: 3, label: 'true', sourceHandle: 'true' },
      { source: 2, target: 4, label: 'false', sourceHandle: 'false' },
    ],
  },
  {
    id: 'packing_guard',
    label: 'Damaged shipment guard',
    category: 'Orders & fulfillment',
    description: 'Detect damaged shipment cases, search policy, and create a guided internal note.',
    nodes: [
      { type: 'trigger', key: 'order.updated', label: 'Order updated', position: { x: 120, y: 260 } },
      { type: 'knowledge', key: 'knowledge.search', label: 'Damage policy', position: { x: 440, y: 240 }, config: { query: 'damaged shipment premium replacement' } },
      { type: 'action', key: 'case.note', label: 'Create internal note', position: { x: 780, y: 240 }, config: { content: 'Damage policy reviewed. Replacement evidence required before refund.' } },
    ],
  },
  {
    id: 'payment_dispute',
    label: 'Payment dispute review',
    category: 'Payments & risk',
    description: 'Pause risky payment disputes, call PSP connector, and ask finance approval.',
    nodes: [
      { type: 'trigger', key: 'payment.failed', label: 'Payment failed', position: { x: 100, y: 260 } },
      { type: 'integration', key: 'connector.call', label: 'Check PSP event', position: { x: 420, y: 240 }, config: { capability: 'payment.lookup' } },
      { type: 'condition', key: 'risk.level', label: 'High risk?', position: { x: 760, y: 240 }, config: { field: 'payment.risk_level', value: 'high' } },
      { type: 'action', key: 'approval.create', label: 'Finance approval', position: { x: 1100, y: 240 }, config: { queue: 'finance', action_type: 'payment_dispute_review' } },
    ],
  },
  {
    id: 'flow_orchestration',
    label: 'Flow orchestration',
    category: 'Orchestration & data',
    description: 'Filter, branch, wait, merge and hand off to reusable workflows.',
    nodes: [
      { type: 'trigger', key: 'case.created', label: 'Case created', position: { x: 100, y: 260 } },
      { type: 'condition', key: 'flow.filter', label: 'Filter eligible cases', position: { x: 390, y: 240 }, config: { expression: 'case.priority >= 2' } },
      { type: 'condition', key: 'flow.switch', label: 'Route by segment', position: { x: 720, y: 240 }, config: { branch: 'customer.segment', comparison: 'vip|standard|enterprise' } },
      { type: 'utility', key: 'flow.wait', label: 'Wait for SLA window', position: { x: 1040, y: 140 }, config: { timeout: '2h' } },
      { type: 'utility', key: 'flow.subworkflow', label: 'Call review sub-workflow', position: { x: 1040, y: 300 }, config: { workflow: 'review_case_flow' } },
      { type: 'utility', key: 'flow.merge', label: 'Merge branches', position: { x: 1360, y: 240 }, config: { mode: 'wait-all' } },
      { type: 'utility', key: 'flow.stop_error', label: 'Stop on error', position: { x: 1680, y: 240 }, config: { errorMessage: 'Flow stopped after failed policy check.' } },
    ],
    edges: [
      { source: 0, target: 1, label: 'next' },
      { source: 1, target: 2, label: 'next' },
      { source: 2, target: 3, label: 'vip', sourceHandle: 'vip' },
      { source: 2, target: 4, label: 'standard', sourceHandle: 'standard' },
      { source: 2, target: 6, label: 'other', sourceHandle: 'other' },
      { source: 3, target: 5, label: 'next' },
      { source: 4, target: 5, label: 'next' },
      { source: 5, target: 6, label: 'next' },
    ],
  },
  {
    id: 'vip_escalation',
    label: 'VIP escalation',
    category: 'Support operations',
    description: 'Detect VIP cases, assign to senior support, and create a clear note.',
    nodes: [
      { type: 'trigger', key: 'case.created', label: 'Case created', position: { x: 100, y: 260 } },
      { type: 'condition', key: 'status.matches', label: 'VIP customer', position: { x: 420, y: 240 }, config: { field: 'customer.segment', value: 'vip' } },
      { type: 'action', key: 'case.assign', label: 'Assign senior team', position: { x: 760, y: 160 }, config: { teamId: 'senior_support' } },
      { type: 'action', key: 'case.note', label: 'Create VIP note', position: { x: 760, y: 340 }, config: { content: 'VIP escalation workflow triggered.' } },
    ],
  },
  {
    id: 'sla_breach',
    label: 'SLA breach',
    category: 'Support operations',
    description: 'Delay, evaluate SLA policy, and escalate stale cases.',
    nodes: [
      { type: 'trigger', key: 'case.created', label: 'Case created', position: { x: 100, y: 260 } },
      { type: 'utility', key: 'delay', label: 'Wait SLA window', position: { x: 420, y: 240 }, config: { duration: '2h' } },
      { type: 'policy', key: 'policy.evaluate', label: 'Evaluate SLA', position: { x: 740, y: 240 }, config: { policy: 'sla_response' } },
      { type: 'action', key: 'approval.create', label: 'Manager review', position: { x: 1060, y: 240 }, config: { queue: 'manager', action_type: 'sla_breach' } },
    ],
  },
  {
    id: 'return_inspection',
    label: 'Return inspection',
    category: 'Returns & recovery',
    description: 'Create return, search inspection policy, and route high-value returns.',
    nodes: [
      { type: 'trigger', key: 'return.created', label: 'Return created', position: { x: 100, y: 260 } },
      { type: 'knowledge', key: 'knowledge.search', label: 'Inspection policy', position: { x: 420, y: 240 }, config: { query: 'return inspection policy' } },
      { type: 'condition', key: 'amount.threshold', label: 'Value above limit?', position: { x: 760, y: 240 }, config: { field: 'return.total_amount', operator: '>', value: 250 } },
      { type: 'action', key: 'approval.create', label: 'Inspection approval', position: { x: 1100, y: 240 }, config: { queue: 'returns' } },
    ],
  },
  {
    id: 'fraud_risk_review',
    label: 'Fraud risk review',
    category: 'Payments & risk',
    description: 'Run risk agent, branch by confidence, and block unsafe automation.',
    nodes: [
      { type: 'trigger', key: 'order.updated', label: 'Order updated', position: { x: 100, y: 260 } },
      { type: 'agent', key: 'agent.run', label: 'Risk agent', position: { x: 420, y: 240 }, config: { agent: 'risk-agent' } },
      { type: 'condition', key: 'risk.level', label: 'Critical risk?', position: { x: 760, y: 240 }, config: { field: 'agent.risk_level', value: 'critical' } },
      { type: 'action', key: 'approval.create', label: 'Risk approval', position: { x: 1100, y: 240 }, config: { queue: 'risk' } },
    ],
  },
  {
    id: 'agent_triage',
    label: 'Auto-triage with agent',
    category: 'AI & knowledge',
    description: 'Run a specialist agent, check confidence, and escalate when needed.',
    nodes: [
      { type: 'trigger', key: 'case.created', label: 'Case created', position: { x: 110, y: 260 } },
      { type: 'agent', key: 'agent.run', label: 'AI Agent', position: { x: 420, y: 220 }, config: { agent: 'triage-agent' } },
      { type: 'knowledge', key: 'knowledge.search', label: 'Search knowledge', position: { x: 720, y: 390 }, config: { query: '{{case.intent}}' } },
      { type: 'condition', key: 'risk.level', label: 'High risk?', position: { x: 780, y: 200 }, config: { field: 'agent.risk_level', value: 'high' } },
      { type: 'action', key: 'approval.create', label: 'Request approval', position: { x: 1120, y: 200 }, config: { queue: 'manager' } },
    ],
  },
  // ─── Production-grade default templates ──────────────────────────────────
  {
    id: 'tpl_refund_guarded_v2',
    label: 'Reembolso automático con aprobación bajo umbral',
    category: 'Payments & risk',
    description: 'Reembolsos rápidos cuando la política lo permite y bajo umbral; el resto va a aprobación humana. Cierra el caso con respuesta y email.',
    nodes: [
      { type: 'trigger', key: 'case.created', label: 'Caso de reembolso', position: { x: 80, y: 260 }, config: { tag: 'refund_request' } },
      { type: 'knowledge', key: 'knowledge.search', label: 'Buscar política reembolsos', position: { x: 340, y: 240 }, config: { query: 'política de reembolsos plazos elegibilidad' } },
      { type: 'policy', key: 'policy.evaluate', label: 'Evaluar política', position: { x: 600, y: 240 }, config: { policy: 'refund_policy', field: 'payment.amount', operator: '<=', blockValue: '100' } },
      { type: 'condition', key: 'flow.if', label: 'Política aprueba reembolso', position: { x: 860, y: 240 }, config: { field: 'policy.allow', operator: '==', value: 'true' } },
      { type: 'action', key: 'payment.refund', label: 'Emitir reembolso', position: { x: 1140, y: 120 }, config: { paymentId: '{{payment.id}}', amount: '{{payment.amount}}', reason: 'Reembolso automático aprobado por política' } },
      { type: 'action', key: 'case.reply', label: 'Confirmar al cliente', position: { x: 1400, y: 120 }, config: { content: 'Hola {{customer.name}}, hemos procesado tu reembolso de {{payment.amount}} EUR. Lo verás reflejado en 3-5 días.' } },
      { type: 'action', key: 'notification.email', label: 'Email confirmación', position: { x: 1660, y: 120 }, config: { to: '{{customer.email}}', subject: 'Reembolso confirmado — pedido {{order.id}}', content: 'Hola {{customer.name}},\n\nTu reembolso por {{payment.amount}} EUR ha sido procesado.\n\nGracias.' } },
      { type: 'action', key: 'approval.create', label: 'Aprobación humana', position: { x: 1140, y: 380 }, config: { queue: 'manager', action_type: 'payment_refund_approval', priority: 'normal', reason: 'Reembolso fuera de política automática' } },
      { type: 'action', key: 'case.update_status', label: 'Esperando aprobación', position: { x: 1400, y: 380 }, config: { status: 'pending', reason: 'Awaiting approval' } },
    ],
    edges: [
      { source: 0, target: 1, label: 'next' },
      { source: 1, target: 2, label: 'next' },
      { source: 2, target: 3, label: 'next' },
      { source: 3, target: 4, label: 'true', sourceHandle: 'true' },
      { source: 4, target: 5, label: 'next' },
      { source: 5, target: 6, label: 'next' },
      { source: 3, target: 7, label: 'false', sourceHandle: 'false' },
      { source: 7, target: 8, label: 'next' },
    ],
  },
  {
    id: 'tpl_onboarding_v1',
    label: 'Onboarding de cliente nuevo (multi-canal)',
    category: 'Customer lifecycle',
    description: 'Da la bienvenida a clientes nuevos con secuencia de emails y un SMS de re-engagement si no han vuelto a entrar tras 4 días.',
    nodes: [
      { type: 'trigger', key: 'webhook.received', label: 'Cliente registrado', position: { x: 80, y: 260 }, config: { event: 'customer.signed_up' } },
      { type: 'utility', key: 'data.set_fields', label: 'Enriquecer perfil', position: { x: 340, y: 240 }, config: { field: 'customer.segment', value: 'new' } },
      { type: 'action', key: 'notification.email', label: 'Email de bienvenida', position: { x: 600, y: 240 }, config: { to: '{{customer.email}}', subject: 'Bienvenido a CRM-AI, {{customer.name}}', content: 'Hola {{customer.name}},\n\nNos alegra tenerte. Aquí tienes los primeros pasos para empezar...' } },
      { type: 'utility', key: 'flow.wait', label: 'Esperar 1 día', position: { x: 860, y: 240 }, config: { timeout: '1d', mode: 'auto' } },
      { type: 'action', key: 'notification.email', label: 'Tips & tutoriales', position: { x: 1120, y: 240 }, config: { to: '{{customer.email}}', subject: '5 trucos para sacar partido a CRM-AI', content: 'Hola {{customer.name}},\n\nAquí tienes nuestros mejores consejos...' } },
      { type: 'utility', key: 'flow.wait', label: 'Esperar 3 días', position: { x: 1380, y: 240 }, config: { timeout: '3d', mode: 'auto' } },
      { type: 'condition', key: 'flow.if', label: '¿Cliente activo?', position: { x: 1640, y: 240 }, config: { field: 'customer.last_seen_within', operator: '<=', value: '2d' } },
      { type: 'utility', key: 'flow.noop', label: 'Activo: fin', position: { x: 1900, y: 140 } },
      { type: 'action', key: 'notification.sms', label: 'SMS re-engagement', position: { x: 1900, y: 360 }, config: { to: '{{customer.phone}}', content: 'Hola {{customer.name}}, ¿necesitas ayuda para empezar? Responde a este SMS.' } },
    ],
    edges: [
      { source: 0, target: 1, label: 'next' },
      { source: 1, target: 2, label: 'next' },
      { source: 2, target: 3, label: 'next' },
      { source: 3, target: 4, label: 'next' },
      { source: 4, target: 5, label: 'next' },
      { source: 5, target: 6, label: 'next' },
      { source: 6, target: 7, label: 'true', sourceHandle: 'true' },
      { source: 6, target: 8, label: 'false', sourceHandle: 'false' },
    ],
  },
  {
    id: 'tpl_vip_escalation_v2',
    label: 'Escalamiento de cases VIP',
    category: 'Support operations',
    description: 'Detecta clientes VIP, los asigna al equipo senior con notificación a Slack, y avisa por SMS al on-call si la urgencia es crítica.',
    nodes: [
      { type: 'trigger', key: 'case.created', label: 'Caso creado', position: { x: 80, y: 280 } },
      { type: 'knowledge', key: 'knowledge.search', label: 'Contexto del cliente', position: { x: 340, y: 260 }, config: { query: 'cliente {{customer.id}} historial VIP' } },
      { type: 'condition', key: 'flow.if', label: '¿Es VIP?', position: { x: 600, y: 260 }, config: { field: 'customer.segment', operator: '==', value: 'VIP' } },
      { type: 'action', key: 'case.assign', label: 'Asignar equipo VIP', position: { x: 880, y: 100 }, config: { teamId: 'vip_support' } },
      { type: 'integration', key: 'message.slack', label: 'Avisar #vip-support', position: { x: 1140, y: 100 }, config: { channel: '#vip-support', content: ':star: Caso VIP {{case.case_number}} de {{customer.name}} — {{case.subject}}' } },
      { type: 'agent', key: 'agent.classify', label: 'Clasificar urgencia', position: { x: 1400, y: 100 }, config: { text: '{{case.description}}', intent: 'urgency' } },
      { type: 'condition', key: 'flow.if', label: '¿Urgente?', position: { x: 1660, y: 100 }, config: { field: 'agent.priority', operator: '==', value: 'critical' } },
      { type: 'action', key: 'notification.sms', label: 'SMS al on-call', position: { x: 1920, y: 60 }, config: { to: '{{oncall.phone}}', content: 'URGENTE: caso VIP {{case.case_number}} requiere atención inmediata.' } },
      { type: 'agent', key: 'agent.classify', label: 'Clasificar prioridad', position: { x: 880, y: 420 }, config: { text: '{{case.description}}' } },
      { type: 'action', key: 'case.set_priority', label: 'Aplicar prioridad', position: { x: 1140, y: 420 }, config: { priority: 'medium' } },
      { type: 'action', key: 'case.assign', label: 'Asignar round-robin', position: { x: 1400, y: 420 }, config: { teamId: 'general_support' } },
    ],
    edges: [
      { source: 0, target: 1, label: 'next' },
      { source: 1, target: 2, label: 'next' },
      { source: 2, target: 3, label: 'true', sourceHandle: 'true' },
      { source: 3, target: 4, label: 'next' },
      { source: 4, target: 5, label: 'next' },
      { source: 5, target: 6, label: 'next' },
      { source: 6, target: 7, label: 'true', sourceHandle: 'true' },
      { source: 2, target: 8, label: 'false', sourceHandle: 'false' },
      { source: 8, target: 9, label: 'next' },
      { source: 9, target: 10, label: 'next' },
    ],
  },
  {
    id: 'tpl_post_resolution_nps',
    label: 'Seguimiento post-resolución con NPS',
    category: 'Support operations',
    description: 'Tras resolver un caso, espera y envía encuesta NPS por Gmail; reacciona a detractores con escalación interna y a promotores con invitación al programa de advocacy.',
    nodes: [
      { type: 'trigger', key: 'case.updated', label: 'Caso resuelto', position: { x: 80, y: 260 }, config: { status: 'resolved' } },
      { type: 'utility', key: 'flow.wait', label: 'Esperar 24h', position: { x: 340, y: 240 }, config: { timeout: '24h', mode: 'auto' } },
      { type: 'integration', key: 'message.gmail', label: 'Encuesta NPS (Gmail)', position: { x: 600, y: 240 }, config: { to: '{{customer.email}}', subject: '¿Cómo lo hicimos? — caso {{case.case_number}}', content: 'Hola {{customer.name}},\n\n¿Recomendarías nuestro soporte? https://crm.ai/nps/{{case.id}}\n\nGracias.', replyToCaseId: '{{case.id}}' } },
      { type: 'utility', key: 'flow.wait', label: 'Esperar 7 días', position: { x: 860, y: 240 }, config: { timeout: '7d', mode: 'auto' } },
      { type: 'condition', key: 'flow.switch', label: 'Rango NPS', position: { x: 1120, y: 240 }, config: { field: 'nps.score', comparison: 'detractor|promoter|neutral' } },
      { type: 'action', key: 'case.note', label: 'Crear seguimiento detractor', position: { x: 1380, y: 100 }, config: { content: 'Cliente detractor (NPS {{nps.score}}). Revisar internamente.' } },
      { type: 'integration', key: 'message.slack', label: 'Avisar #cs-leadership', position: { x: 1640, y: 100 }, config: { channel: '#cs-leadership', content: ':warning: Detractor NPS {{nps.score}} — caso {{case.case_number}}' } },
      { type: 'action', key: 'notification.email', label: 'Email agradecimiento', position: { x: 1380, y: 260 }, config: { to: '{{customer.email}}', subject: '¡Gracias por tu valoración!', content: 'Hola {{customer.name}}, gracias por puntuarnos. Te invitamos a nuestro programa de advocacy: https://crm.ai/advocacy' } },
      { type: 'utility', key: 'flow.noop', label: 'Sin acción', position: { x: 1380, y: 420 } },
    ],
    edges: [
      { source: 0, target: 1, label: 'next' },
      { source: 1, target: 2, label: 'next' },
      { source: 2, target: 3, label: 'next' },
      { source: 3, target: 4, label: 'next' },
      { source: 4, target: 5, label: 'detractor', sourceHandle: 'detractor' },
      { source: 5, target: 6, label: 'next' },
      { source: 4, target: 7, label: 'promoter', sourceHandle: 'promoter' },
      { source: 4, target: 8, label: 'neutral', sourceHandle: 'neutral' },
    ],
  },
  {
    id: 'tpl_fraud_order_validation',
    label: 'Validación de pedidos sospechosos (fraude)',
    category: 'Payments & risk',
    description: 'Para pedidos > 500€, llama a un servicio antifraude vía connector y enruta el riesgo (low/medium/high) a aprobación, hold + caso o auto-aprobación.',
    nodes: [
      { type: 'trigger', key: 'order.updated', label: 'Pedido > 500€', position: { x: 80, y: 280 }, config: { event: 'order.created', minAmount: 500 } },
      { type: 'utility', key: 'data.http_request', label: 'Llamar API antifraude', position: { x: 340, y: 260 }, config: { url: 'https://api.fraudshield.io/v1/score', method: 'POST', body: '{"orderId":"{{order.id}}","amount":{{order.total_amount}}}' } },
      { type: 'integration', key: 'connector.call', label: 'Conector fraude (fallback)', position: { x: 600, y: 260 }, config: { connector: 'fraudshield', capability: 'score_order', input: '{"orderId":"{{order.id}}"}' } },
      { type: 'condition', key: 'flow.switch', label: 'Score de riesgo', position: { x: 880, y: 260 }, config: { field: 'fraud.risk_score', comparison: 'low|medium|high' } },
      { type: 'action', key: 'order.release', label: 'Auto-aprobar', position: { x: 1180, y: 100 }, config: { orderId: '{{order.id}}', reason: 'Antifraude: riesgo bajo' } },
      { type: 'action', key: 'approval.create', label: 'Revisión manual', position: { x: 1180, y: 280 }, config: { queue: 'risk', action_type: 'fraud_manual_review', priority: 'normal' } },
      { type: 'action', key: 'order.hold', label: 'Bloquear pedido', position: { x: 1180, y: 460 }, config: { orderId: '{{order.id}}', reason: 'Antifraude: riesgo alto', requires_approval: 'true' } },
      { type: 'action', key: 'notification.email', label: 'Avisar al cliente', position: { x: 1460, y: 460 }, config: { to: '{{customer.email}}', subject: 'Verificación de tu pedido {{order.id}}', content: 'Hola {{customer.name}}, hemos detectado actividad inusual y necesitamos verificar tu pedido.' } },
      { type: 'action', key: 'case.note', label: 'Caso para investigación', position: { x: 1740, y: 460 }, config: { content: 'Pedido {{order.id}} bloqueado por riesgo alto antifraude. Score: {{fraud.risk_score}}.' } },
    ],
    edges: [
      { source: 0, target: 1, label: 'next' },
      { source: 1, target: 2, label: 'next' },
      { source: 2, target: 3, label: 'next' },
      { source: 3, target: 4, label: 'low', sourceHandle: 'low' },
      { source: 3, target: 5, label: 'medium', sourceHandle: 'medium' },
      { source: 3, target: 6, label: 'high', sourceHandle: 'high' },
      { source: 6, target: 7, label: 'next' },
      { source: 7, target: 8, label: 'next' },
    ],
  },
  {
    id: 'tpl_abandoned_cart_v1',
    label: 'Recordatorio de carrito abandonado',
    category: 'Customer lifecycle',
    description: 'Cada hora busca carritos abandonados (>1h, <24h) y envía recordatorio con descuento por email o WhatsApp según preferencia del cliente.',
    nodes: [
      { type: 'trigger', key: 'trigger.schedule', label: 'Cada hora', position: { x: 80, y: 260 }, config: { cron: '0 * * * *' } },
      { type: 'integration', key: 'connector.call', label: 'Carritos abandonados', position: { x: 340, y: 240 }, config: { connector: 'shop', capability: 'list_abandoned_carts', input: '{"olderThan":"1h","youngerThan":"24h"}' } },
      { type: 'utility', key: 'flow.loop', label: 'Iterar carritos', position: { x: 600, y: 240 }, config: { source: 'data.carts', batchSize: 1, maxIterations: 500 } },
      { type: 'condition', key: 'flow.if', label: '¿Email opt-in?', position: { x: 880, y: 240 }, config: { field: 'item.customer.email_opt_in', operator: '==', value: 'true' } },
      { type: 'action', key: 'notification.email', label: 'Email recordatorio', position: { x: 1160, y: 100 }, config: { to: '{{item.customer.email}}', subject: '¿Olvidaste algo? Aquí tienes 10% de descuento', content: 'Hola {{item.customer.name}}, tu carrito te espera. Usa COMEBACK10 al pagar.' } },
      { type: 'condition', key: 'flow.if', label: '¿Tiene WhatsApp?', position: { x: 1160, y: 380 }, config: { field: 'item.customer.phone', operator: 'exists', value: 'true' } },
      { type: 'action', key: 'notification.whatsapp', label: 'WhatsApp recordatorio', position: { x: 1440, y: 380 }, config: { to: '{{item.customer.phone}}', content: 'Hola {{item.customer.name}}, tu carrito sigue ahí. 10% de descuento con COMEBACK10.' } },
      { type: 'utility', key: 'flow.noop', label: 'Sin canal', position: { x: 1440, y: 520 } },
      { type: 'policy', key: 'core.audit_log', label: 'Auditar envío', position: { x: 1720, y: 240 }, config: { action: 'CART_REMINDER_SENT', entityType: 'customer', entityId: '{{item.customer.id}}' } },
    ],
    edges: [
      { source: 0, target: 1, label: 'next' },
      { source: 1, target: 2, label: 'next' },
      { source: 2, target: 3, label: 'item' },
      { source: 3, target: 4, label: 'true', sourceHandle: 'true' },
      { source: 3, target: 5, label: 'false', sourceHandle: 'false' },
      { source: 5, target: 6, label: 'true', sourceHandle: 'true' },
      { source: 5, target: 7, label: 'false', sourceHandle: 'false' },
      { source: 4, target: 8, label: 'next' },
      { source: 6, target: 8, label: 'next' },
    ],
  },
  {
    id: 'tpl_returns_processing',
    label: 'Procesamiento de devoluciones',
    category: 'Returns & recovery',
    description: 'Evalúa la ventana de devolución, crea la devolución y envía la etiqueta; al recibir el paquete dispara reembolso. Si está fuera de plazo, responde y cierra.',
    nodes: [
      { type: 'trigger', key: 'return.created', label: 'Devolución solicitada', position: { x: 80, y: 260 } },
      { type: 'policy', key: 'policy.evaluate', label: 'Ventana de devolución', position: { x: 340, y: 240 }, config: { policy: 'return_window', field: 'order.delivered_days_ago', operator: '<=', blockValue: '30' } },
      { type: 'condition', key: 'flow.if', label: '¿Dentro de plazo?', position: { x: 620, y: 240 }, config: { field: 'policy.allow', operator: '==', value: 'true' } },
      { type: 'action', key: 'return.create', label: 'Crear devolución', position: { x: 900, y: 100 }, config: { reason: '{{return.reason}}', amount: '{{order.total_amount}}', method: 'original_payment' } },
      { type: 'action', key: 'notification.email', label: 'Enviar etiqueta', position: { x: 1160, y: 100 }, config: { to: '{{customer.email}}', subject: 'Tu etiqueta de devolución — pedido {{order.id}}', content: 'Hola {{customer.name}}, adjuntamos la etiqueta. Imprímela y entrégala en tu punto de envío.' } },
      { type: 'utility', key: 'flow.wait', label: 'Esperar recepción', position: { x: 1420, y: 100 }, config: { timeout: '14d', mode: 'manual_resume' } },
      { type: 'action', key: 'payment.refund', label: 'Emitir reembolso', position: { x: 1680, y: 100 }, config: { paymentId: '{{payment.id}}', amount: '{{return.amount}}', reason: 'Devolución recibida' } },
      { type: 'action', key: 'case.reply', label: 'Explicar política', position: { x: 900, y: 400 }, config: { content: 'Hola {{customer.name}}, lamentamos no poder aceptar la devolución: el plazo de 30 días ha expirado.' } },
      { type: 'action', key: 'case.update_status', label: 'Cerrar caso', position: { x: 1160, y: 400 }, config: { status: 'resolved', reason: 'Fuera de plazo de devolución' } },
    ],
    edges: [
      { source: 0, target: 1, label: 'next' },
      { source: 1, target: 2, label: 'next' },
      { source: 2, target: 3, label: 'true', sourceHandle: 'true' },
      { source: 3, target: 4, label: 'next' },
      { source: 4, target: 5, label: 'next' },
      { source: 5, target: 6, label: 'next' },
      { source: 2, target: 7, label: 'false', sourceHandle: 'false' },
      { source: 7, target: 8, label: 'next' },
    ],
  },
  {
    id: 'tpl_nightly_crm_sync',
    label: 'Sincronización CRM nocturna',
    category: 'Orchestration & data',
    description: 'Cada noche a las 2:00 trae cambios del CRM externo, los mapea y aplica a clientes/casos, registra auditoría y publica resumen diario en Slack.',
    nodes: [
      { type: 'trigger', key: 'trigger.schedule', label: 'Diario 02:00', position: { x: 80, y: 280 }, config: { cron: '0 2 * * *' } },
      { type: 'integration', key: 'connector.call', label: 'Fetch CRM externo', position: { x: 340, y: 260 }, config: { connector: 'salesforce', capability: 'list_updated_records', input: '{"since":"{{trigger.previous_run_at}}"}' } },
      { type: 'utility', key: 'flow.loop', label: 'Iterar registros', position: { x: 620, y: 260 }, config: { source: 'data.records', batchSize: 50, maxIterations: 5000 } },
      { type: 'utility', key: 'data.map_fields', label: 'Mapear campos', position: { x: 900, y: 260 }, config: { mapping: '{"customerId":"item.Id","name":"item.Name","email":"item.Email"}' } },
      { type: 'condition', key: 'flow.if', label: '¿Es caso o cliente?', position: { x: 1180, y: 260 }, config: { field: 'item.type', operator: '==', value: 'case' } },
      { type: 'action', key: 'case.update_status', label: 'Actualizar caso', position: { x: 1460, y: 140 }, config: { status: '{{item.status}}', reason: 'Nightly sync' } },
      { type: 'utility', key: 'data.set_fields', label: 'Actualizar cliente', position: { x: 1460, y: 380 }, config: { field: 'customer.external_id', value: '{{item.customerId}}' } },
      { type: 'utility', key: 'data.aggregate', label: 'Contar resultados', position: { x: 1740, y: 260 }, config: { source: 'data.records', field: 'id', operation: 'count', target: 'syncCount' } },
      { type: 'policy', key: 'core.audit_log', label: 'Auditar sync', position: { x: 2020, y: 260 }, config: { action: 'NIGHTLY_CRM_SYNC', message: 'Sincronizados {{data.syncCount}} registros', entityType: 'workflow' } },
      { type: 'integration', key: 'message.slack', label: 'Resumen #ops-daily', position: { x: 2300, y: 260 }, config: { channel: '#ops-daily', content: ':sparkles: Nightly CRM sync — {{data.syncCount}} registros procesados.' } },
    ],
    edges: [
      { source: 0, target: 1, label: 'next' },
      { source: 1, target: 2, label: 'next' },
      { source: 2, target: 3, label: 'item' },
      { source: 3, target: 4, label: 'next' },
      { source: 4, target: 5, label: 'true', sourceHandle: 'true' },
      { source: 4, target: 6, label: 'false', sourceHandle: 'false' },
      { source: 5, target: 7, label: 'done' },
      { source: 6, target: 7, label: 'done' },
      { source: 7, target: 8, label: 'next' },
      { source: 8, target: 9, label: 'next' },
    ],
  },
] as const;

const CONFIG_FIELDS = ['field', 'operator', 'value', 'amount', 'reason', 'agent', 'policy', 'connector', 'content', 'queue', 'query', 'expression', 'source', 'target', 'branch', 'mode', 'timeout', 'batchSize', 'maxIterations', 'workflow', 'comparison', 'fallback', 'errorMessage', 'path', 'delimiter', 'format', 'mapping', 'operation', 'input', 'output'];

type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'agent-picker';
interface NodeFieldDef { key: string; label: string; type: FieldType; options?: string[]; placeholder?: string; hint?: string; }

const NODE_FIELD_SCHEMAS: Record<string, NodeFieldDef[]> = {
  // ── Flow / Conditions ──────────────────────────────────────────────────────
  'flow.if': [
    { key: 'field', label: 'Field path', type: 'text', placeholder: 'e.g. case.priority', hint: 'Use dot notation — e.g. customer.segment' },
    { key: 'operator', label: 'Operator', type: 'select', options: ['==', '!=', '>', '>=', '<', '<=', 'contains', 'not_contains', 'exists', 'not_exists', 'in'] },
    { key: 'value', label: 'Compare to', type: 'text', placeholder: 'e.g. high or {{customer.segment}}' },
  ],
  'flow.filter': [
    { key: 'source', label: 'Items path', type: 'text', placeholder: 'e.g. data.items' },
    { key: 'field', label: 'Filter by field', type: 'text', placeholder: 'e.g. status' },
    { key: 'operator', label: 'Operator', type: 'select', options: ['==', '!=', '>', '<', 'contains', 'exists'] },
    { key: 'value', label: 'Value', type: 'text', placeholder: 'e.g. open' },
  ],
  'flow.switch': [
    { key: 'field', label: 'Route by field', type: 'text', placeholder: 'e.g. customer.segment', hint: 'The value determines which branch to follow' },
    { key: 'comparison', label: 'Branches (pipe-separated)', type: 'text', placeholder: 'vip|standard|enterprise', hint: 'Last value is the fallback branch' },
  ],
  'flow.branch': [
    { key: 'branches', label: 'Branch labels (pipe-separated)', type: 'text', placeholder: 'branch1|branch2|branch3', hint: 'All branches execute in parallel' },
  ],
  'flow.compare': [
    { key: 'left', label: 'Left value path', type: 'text', placeholder: 'e.g. data.amount' },
    { key: 'operator', label: 'Operator', type: 'select', options: ['==', '!=', '>', '>=', '<', '<='] },
    { key: 'right', label: 'Right value path', type: 'text', placeholder: 'e.g. data.limit or literal' },
  ],
  'flow.wait': [
    { key: 'timeout', label: 'Duration', type: 'text', placeholder: 'e.g. 2h, 30m, 1d', hint: 'Workflow pauses until this duration elapses' },
    { key: 'mode', label: 'Resume mode', type: 'select', options: ['auto', 'manual_resume'] },
  ],
  'flow.loop': [
    { key: 'source', label: 'Items path', type: 'text', placeholder: 'e.g. data.items', hint: 'Array to iterate over' },
    { key: 'batchSize', label: 'Batch size', type: 'number', placeholder: '1' },
    { key: 'maxIterations', label: 'Max iterations', type: 'number', placeholder: '100' },
  ],
  'flow.subworkflow': [
    { key: 'workflowId', label: 'Sub-workflow ID', type: 'text', placeholder: 'uuid of the target workflow', hint: 'Must be a published workflow in the same tenant' },
    { key: 'outputKey', label: 'Output variable', type: 'text', placeholder: 'subworkflow', hint: 'Result stored as context.data.<variable>' },
    { key: 'input', label: 'Input mapping (JSON, optional)', type: 'textarea', placeholder: '{"caseId":"{{case.id}}"}', hint: 'Pass specific fields to the sub-workflow. Defaults to current context.' },
  ],
  'flow.note': [
    { key: 'content', label: 'Note content', type: 'textarea', placeholder: 'Write your notes here...' },
    { key: 'color', label: 'Color', type: 'select', options: ['yellow', 'blue', 'green', 'red', 'purple'] },
  ],
  'flow.stop_error': [
    { key: 'errorMessage', label: 'Error message', type: 'text', placeholder: 'e.g. Stopped: missing required data' },
  ],
  'flow.merge': [
    { key: 'mode', label: 'Merge mode', type: 'select', options: ['wait-all', 'first-wins', 'any'], hint: 'wait-all: wait for all branches; first-wins: continue on first arrival' },
  ],
  'amount.threshold': [
    { key: 'field', label: 'Amount field', type: 'text', placeholder: 'e.g. payment.amount' },
    { key: 'operator', label: 'Operator', type: 'select', options: ['>', '>=', '<', '<=', '=='] },
    { key: 'value', label: 'Threshold', type: 'number', placeholder: 'e.g. 250' },
  ],
  'status.matches': [
    { key: 'field', label: 'Status field', type: 'text', placeholder: 'e.g. case.status or customer.segment' },
    { key: 'operator', label: 'Operator', type: 'select', options: ['==', '!=', 'in', 'contains'] },
    { key: 'value', label: 'Expected value', type: 'text', placeholder: 'e.g. open or vip|premium' },
  ],
  'risk.level': [
    { key: 'field', label: 'Risk field', type: 'text', placeholder: 'e.g. payment.risk_level or agent.riskLevel' },
    { key: 'operator', label: 'Comparison', type: 'select', options: ['==', '!=', '>=', '>'] },
    { key: 'value', label: 'Risk threshold', type: 'select', options: ['low', 'medium', 'high', 'critical'] },
  ],
  // ── Data ──────────────────────────────────────────────────────────────────
  'data.set_fields': [
    { key: 'field', label: 'Target field', type: 'text', placeholder: 'e.g. case.resolved_at' },
    { key: 'value', label: 'Value or template', type: 'text', placeholder: 'e.g. {{trigger.date}} or static text' },
  ],
  'data.rename_fields': [
    { key: 'mapping', label: 'Mapping (JSON)', type: 'textarea', placeholder: '{"old_name": "new_name"}' },
  ],
  'data.extract_json': [
    { key: 'source', label: 'Source field', type: 'text', placeholder: 'e.g. trigger.body' },
    { key: 'path', label: 'JSON path (optional)', type: 'text', placeholder: 'e.g. data.user.id' },
  ],
  'data.normalize_text': [
    { key: 'field', label: 'Text field', type: 'text', placeholder: 'e.g. trigger.message' },
  ],
  'data.format_date': [
    { key: 'field', label: 'Date field', type: 'text', placeholder: 'e.g. case.created_at' },
    { key: 'format', label: 'Output format', type: 'select', options: ['iso', 'date', 'time'] },
  ],
  'data.split_items': [
    { key: 'field', label: 'Source field', type: 'text', placeholder: 'e.g. trigger.items' },
    { key: 'delimiter', label: 'Delimiter', type: 'text', placeholder: 'e.g. , or \\n' },
  ],
  'data.dedupe': [{ key: 'field', label: 'Items field', type: 'text', placeholder: 'e.g. data.items' }],
  'data.map_fields': [
    { key: 'mapping', label: 'Mapping (JSON)', type: 'textarea', placeholder: '{"target_key": "source.path"}' },
  ],
  'data.clean_context': [
    { key: 'fields', label: 'Fields to remove (comma-separated)', type: 'text', placeholder: 'large_payload, sensitive_data' },
    { key: 'mode', label: 'Mode', type: 'select', options: ['remove', 'keep_only'] },
  ],
  'data.pick_fields': [
    { key: 'fields', label: 'Fields to keep (comma-separated)', type: 'text', placeholder: 'id, name, status' },
  ],
  'data.merge_objects': [
    { key: 'left', label: 'First object path', type: 'text', placeholder: 'e.g. data' },
    { key: 'right', label: 'Second object path', type: 'text', placeholder: 'e.g. trigger' },
  ],
  'data.validate_required': [
    { key: 'fields', label: 'Required fields (comma-separated)', type: 'text', placeholder: 'case.id, payment.amount' },
  ],
  'data.calculate': [
    { key: 'left', label: 'Left operand path', type: 'text', placeholder: 'e.g. data.amount' },
    { key: 'operation', label: 'Operation', type: 'select', options: ['+', '-', '*', '/'] },
    { key: 'right', label: 'Right operand path or value', type: 'text', placeholder: 'e.g. data.fee or 0.1' },
    { key: 'target', label: 'Store result as', type: 'text', placeholder: 'e.g. total' },
  ],
  'data.aggregate': [
    { key: 'source', label: 'Items path', type: 'text', placeholder: 'e.g. data.items', hint: 'Array to aggregate from' },
    { key: 'field', label: 'Field to aggregate', type: 'text', placeholder: 'e.g. amount', hint: 'Path within each item' },
    { key: 'operation', label: 'Operation', type: 'select', options: ['list', 'sum', 'average', 'min', 'max', 'count'] },
    { key: 'target', label: 'Store result as', type: 'text', placeholder: 'e.g. totalAmount', hint: 'Saved into context.data.<target>' },
  ],
  'data.limit': [
    { key: 'source', label: 'Items path', type: 'text', placeholder: 'e.g. data.items' },
    { key: 'limit', label: 'Max items', type: 'number', placeholder: '10' },
    { key: 'mode', label: 'Mode', type: 'select', options: ['first', 'last'] },
    { key: 'target', label: 'Store result as', type: 'text', placeholder: 'limitedItems' },
  ],
  'data.split_out': [
    { key: 'source', label: 'Items path', type: 'text', placeholder: 'e.g. data.lineItems', hint: 'Array inside the current item' },
    { key: 'target', label: 'Output variable', type: 'text', placeholder: 'splitItems', hint: 'Each entry becomes its own item under context.data.<target>' },
  ],
  'data.ai_transform': [
    { key: 'instruction', label: 'Instruction (plain English)', type: 'textarea', placeholder: 'Convert the customer message into a JSON object with intent, sentiment and priority fields' },
    { key: 'source', label: 'Input path (optional)', type: 'text', placeholder: 'data', hint: 'Defaults to the entire workflow context' },
    { key: 'target', label: 'Output variable', type: 'text', placeholder: 'transformed' },
    { key: 'model', label: 'Model (optional)', type: 'select', options: ['', 'gemini-2.5-flash', 'gemini-2.5-pro'] },
  ],
  // ── Core nodes ────────────────────────────────────────────────────────────
  'core.code': [
    { key: 'language', label: 'Language', type: 'select', options: ['javascript'], hint: 'Python coming in a future release.' },
    { key: 'code', label: 'Code', type: 'textarea', placeholder: '// "context" is available read-only.\n// "data" is the current data payload.\n// Return the value you want to store.\n\nreturn data.items.map(i => ({ ...i, total: i.qty * i.price }));' },
    { key: 'target', label: 'Store result as', type: 'text', placeholder: 'codeResult' },
    { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', placeholder: '2000' },
  ],
  'core.data_table_op': [
    { key: 'tableId', label: 'Data table', type: 'text', placeholder: 'pick a data table id from the Data tables tab' },
    { key: 'operation', label: 'Operation', type: 'select', options: ['list', 'find', 'insert', 'update', 'upsert', 'delete'] },
    { key: 'matchField', label: 'Match field (find/update/delete/upsert)', type: 'text', placeholder: 'id' },
    { key: 'matchValue', label: 'Match value', type: 'text', placeholder: '{{trigger.id}}' },
    { key: 'row', label: 'Row data (JSON, for insert/update/upsert)', type: 'textarea', placeholder: '{"id":"{{order.id}}","status":"open"}' },
    { key: 'target', label: 'Store result as', type: 'text', placeholder: 'tableResult' },
  ],
  'core.respond_webhook': [
    { key: 'statusCode', label: 'HTTP status code', type: 'number', placeholder: '200' },
    { key: 'body', label: 'Response body (JSON or text)', type: 'textarea', placeholder: '{"ok":true,"id":"{{trigger.id}}"}' },
    { key: 'contentType', label: 'Content type', type: 'select', options: ['application/json', 'text/plain', 'text/html'] },
  ],
  'ai.information_extractor': [
    { key: 'text', label: 'Text to extract from', type: 'textarea', placeholder: '{{trigger.message}} or {{case.description}}' },
    { key: 'schema', label: 'JSON schema describing the output', type: 'textarea', placeholder: '{"type":"object","properties":{"intent":{"type":"string"},"orderId":{"type":"string"},"sentiment":{"type":"string","enum":["positive","neutral","negative"]}}}' },
    { key: 'target', label: 'Output variable', type: 'text', placeholder: 'extracted' },
    { key: 'model', label: 'Model', type: 'select', options: ['', 'gemini-2.5-flash', 'gemini-2.5-pro'] },
  ],
  // ── Case actions ──────────────────────────────────────────────────────────
  'case.assign': [
    { key: 'userId', label: 'Assign to user ID', type: 'text', placeholder: 'e.g. {{trigger.userId}} or a fixed ID' },
    { key: 'teamId', label: 'Assign to team', type: 'text', placeholder: 'e.g. senior_support' },
  ],
  'case.reply': [
    { key: 'content', label: 'Reply content', type: 'textarea', placeholder: 'Hi {{customer.name}}, we have reviewed your case...' },
  ],
  'case.note': [
    { key: 'content', label: 'Note content', type: 'textarea', placeholder: 'Internal note about this workflow step...' },
  ],
  'case.update_status': [
    { key: 'status', label: 'New status', type: 'select', options: ['open', 'pending', 'in_progress', 'resolved', 'closed', 'waiting_customer'] },
    { key: 'reason', label: 'Reason (optional)', type: 'text', placeholder: 'e.g. Resolved by workflow' },
  ],
  'case.set_priority': [
    { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'critical'] },
    { key: 'severity', label: 'Severity (optional)', type: 'select', options: ['', 'low', 'medium', 'high', 'critical'] },
    { key: 'riskLevel', label: 'Risk level (optional)', type: 'select', options: ['', 'low', 'medium', 'high', 'critical'] },
  ],
  'case.add_tag': [
    { key: 'tag', label: 'Tag', type: 'text', placeholder: 'e.g. vip-escalation or auto-resolved' },
  ],
  // ── Order actions ─────────────────────────────────────────────────────────
  'order.cancel': [
    { key: 'orderId', label: 'Order ID (optional)', type: 'text', placeholder: '{{order.id}}', hint: 'Leave blank to use context order' },
    { key: 'reason', label: 'Cancellation reason', type: 'text', placeholder: 'e.g. Customer requested cancellation' },
  ],
  'order.hold': [
    { key: 'orderId', label: 'Order ID (optional)', type: 'text', placeholder: '{{order.id}}' },
    { key: 'reason', label: 'Hold reason', type: 'text', placeholder: 'e.g. Fraud review' },
    { key: 'requires_approval', label: 'Requires approval', type: 'select', options: ['false', 'true'] },
  ],
  'order.release': [
    { key: 'orderId', label: 'Order ID (optional)', type: 'text', placeholder: '{{order.id}}' },
    { key: 'reason', label: 'Release reason', type: 'text', placeholder: 'e.g. Fraud review completed' },
  ],
  // ── Payment actions ───────────────────────────────────────────────────────
  'payment.refund': [
    { key: 'paymentId', label: 'Payment ID (optional)', type: 'text', placeholder: '{{payment.id}}' },
    { key: 'amount', label: 'Refund amount', type: 'text', placeholder: '{{payment.amount}} or a fixed number' },
    { key: 'reason', label: 'Reason', type: 'text', placeholder: 'e.g. Customer refund approved' },
  ],
  'payment.mark_dispute': [
    { key: 'paymentId', label: 'Payment ID (optional)', type: 'text', placeholder: '{{payment.id}}' },
    { key: 'dispute_status', label: 'Dispute status', type: 'select', options: ['open', 'under_review', 'won', 'lost'] },
    { key: 'reason', label: 'Reason', type: 'text', placeholder: 'e.g. Chargeback initiated' },
  ],
  // ── Return actions ────────────────────────────────────────────────────────
  'return.create': [
    { key: 'reason', label: 'Return reason', type: 'text', placeholder: 'e.g. Defective product' },
    { key: 'amount', label: 'Return amount', type: 'text', placeholder: '{{order.total_amount}}' },
    { key: 'method', label: 'Return method', type: 'select', options: ['workflow', 'store_credit', 'original_payment', 'exchange'] },
  ],
  'return.approve': [
    { key: 'returnId', label: 'Return ID (optional)', type: 'text', placeholder: '{{return.id}}' },
    { key: 'refund_status', label: 'Refund status', type: 'select', options: ['pending', 'approved', 'completed'] },
    { key: 'reason', label: 'Reason (optional)', type: 'text' },
  ],
  'return.reject': [
    { key: 'returnId', label: 'Return ID (optional)', type: 'text', placeholder: '{{return.id}}' },
    { key: 'reason', label: 'Rejection reason', type: 'text', placeholder: 'e.g. Return window expired' },
  ],
  // ── Approval ──────────────────────────────────────────────────────────────
  'approval.create': [
    { key: 'queue', label: 'Approver queue', type: 'text', placeholder: 'e.g. manager or finance' },
    { key: 'action_type', label: 'Action type', type: 'text', placeholder: 'e.g. payment_refund_approval' },
    { key: 'priority', label: 'Priority', type: 'select', options: ['normal', 'urgent', 'low'] },
    { key: 'reason', label: 'Context note (optional)', type: 'text' },
  ],
  'approval.escalate': [
    { key: 'queue', label: 'Escalation queue', type: 'text', placeholder: 'e.g. manager or exec' },
    { key: 'reason', label: 'Escalation reason', type: 'text', placeholder: 'e.g. No response within SLA window' },
    { key: 'priority', label: 'Priority', type: 'select', options: ['urgent', 'normal', 'critical'] },
  ],
  // ── Notifications ─────────────────────────────────────────────────────────
  'notification.email': [
    { key: 'to', label: 'To email', type: 'text', placeholder: '{{customer.email}} or fixed address' },
    { key: 'subject', label: 'Subject', type: 'text', placeholder: 'e.g. Your case has been resolved' },
    { key: 'content', label: 'Body', type: 'textarea', placeholder: 'Hi {{customer.name}},\n\nYour case {{case.case_number}} has been...' },
  ],
  'notification.whatsapp': [
    { key: 'to', label: 'Phone number', type: 'text', placeholder: '{{customer.phone}} or +34...' },
    { key: 'content', label: 'Message', type: 'textarea', placeholder: 'Hi {{customer.name}}, your case has been updated...' },
  ],
  'notification.sms': [
    { key: 'to', label: 'Phone number', type: 'text', placeholder: '{{customer.phone}} or +34...' },
    { key: 'content', label: 'Message (160 char max)', type: 'textarea', placeholder: 'Case update: your request has been processed.' },
  ],
  // ── External messaging (channel wrappers) ─────────────────────────────────
  'message.slack': [
    { key: 'channel', label: 'Channel or user', type: 'text', placeholder: '#alerts or @user.name', hint: 'Channel must exist in your Slack workspace' },
    { key: 'content', label: 'Message', type: 'textarea', placeholder: 'New high-priority case opened: {{case.case_number}}' },
    { key: 'thread_ts', label: 'Reply in thread (optional)', type: 'text', placeholder: '{{previous.thread_ts}}' },
  ],
  'message.discord': [
    { key: 'channel', label: 'Channel ID or webhook URL', type: 'text', placeholder: 'channel id, or https://discord.com/api/webhooks/...' },
    { key: 'content', label: 'Message', type: 'textarea', placeholder: 'Hello team — {{trigger.summary}}' },
    { key: 'username', label: 'Bot display name (optional)', type: 'text', placeholder: 'CRM-AI Bot' },
  ],
  'message.telegram': [
    { key: 'chatId', label: 'Chat ID', type: 'text', placeholder: '@your_channel or numeric chat id', hint: 'Your bot must already be added to this chat' },
    { key: 'content', label: 'Message', type: 'textarea', placeholder: 'Update on case {{case.case_number}}' },
    { key: 'parseMode', label: 'Parse mode (optional)', type: 'select', options: ['', 'Markdown', 'HTML'] },
  ],
  'message.gmail': [
    { key: 'to', label: 'To email', type: 'text', placeholder: '{{customer.email}} or alice@company.com' },
    { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Following up on your case' },
    { key: 'content', label: 'Body', type: 'textarea', placeholder: 'Hi {{customer.name}}, ...' },
    { key: 'cc', label: 'Cc (optional)', type: 'text' },
    { key: 'replyToCaseId', label: 'Link reply to case (optional)', type: 'text', placeholder: '{{case.id}}' },
  ],
  'message.outlook': [
    { key: 'to', label: 'To email', type: 'text', placeholder: '{{customer.email}}' },
    { key: 'subject', label: 'Subject', type: 'text' },
    { key: 'content', label: 'Body (HTML allowed)', type: 'textarea' },
    { key: 'importance', label: 'Importance', type: 'select', options: ['normal', 'high', 'low'] },
  ],
  'message.teams': [
    { key: 'channel', label: 'Channel webhook URL or channel id', type: 'text', placeholder: 'https://outlook.office.com/webhook/... or team:channel' },
    { key: 'content', label: 'Message', type: 'textarea', placeholder: 'Heads-up: {{trigger.summary}}' },
    { key: 'title', label: 'Card title (optional)', type: 'text', placeholder: 'Workflow alert' },
  ],
  'message.google_chat': [
    { key: 'space', label: 'Space ID or webhook URL', type: 'text', placeholder: 'spaces/AAAA... or https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...' },
    { key: 'content', label: 'Message', type: 'textarea' },
  ],
  // ── AI ────────────────────────────────────────────────────────────────────
  'agent.run': [
    { key: 'agent', label: 'Agent', type: 'agent-picker', placeholder: 'Select an AI Studio agent…' },
    { key: 'trigger_event', label: 'Trigger event (optional)', type: 'text', placeholder: 'e.g. workflow_node' },
  ],
  'agent.classify': [
    { key: 'text', label: 'Text to classify', type: 'text', placeholder: '{{case.description}} or {{trigger.message}}' },
    { key: 'intent', label: 'Override intent (optional)', type: 'text' },
  ],
  'agent.sentiment': [
    { key: 'text', label: 'Text to analyze', type: 'text', placeholder: '{{trigger.message}} or {{case.summary}}' },
  ],
  'agent.summarize': [
    { key: 'text', label: 'Content to summarize', type: 'text', placeholder: '{{case.description}}' },
  ],
  'agent.draft_reply': [
    { key: 'content', label: 'Reply template', type: 'textarea', placeholder: 'Thanks for reaching out, {{customer.name}}...' },
  ],
  // ── Policy / Core ─────────────────────────────────────────────────────────
  'policy.evaluate': [
    { key: 'policy', label: 'Policy name', type: 'text', placeholder: 'e.g. refund_policy' },
    { key: 'field', label: 'Risk field to check', type: 'text', placeholder: 'e.g. data.risk_level' },
    { key: 'operator', label: 'Block if', type: 'select', options: ['==', '!=', '>=', '>'] },
    { key: 'blockValue', label: 'Block value', type: 'text', placeholder: 'e.g. critical' },
  ],
  'core.audit_log': [
    { key: 'action', label: 'Audit action label', type: 'text', placeholder: 'e.g. WORKFLOW_EXECUTED' },
    { key: 'message', label: 'Log message (optional)', type: 'text', placeholder: 'e.g. Case processed by workflow' },
    { key: 'entityType', label: 'Entity type', type: 'select', options: ['case', 'order', 'payment', 'customer', 'workflow'] },
    { key: 'entityId', label: 'Entity ID (optional)', type: 'text', placeholder: '{{case.id}}' },
  ],
  'core.idempotency_check': [
    { key: 'key', label: 'Idempotency key', type: 'text', placeholder: '{{case.id}}:refund — leave blank for auto' },
  ],
  'core.rate_limit': [
    { key: 'limit', label: 'Max executions', type: 'number', placeholder: '1' },
    { key: 'bucket', label: 'Bucket name (optional)', type: 'text', placeholder: 'Leave blank to use node ID' },
  ],
  // ── Knowledge ─────────────────────────────────────────────────────────────
  'knowledge.search': [
    { key: 'query', label: 'Search query', type: 'text', placeholder: '{{case.intent}} or fixed terms' },
    { key: 'type', label: 'Article type (optional)', type: 'text', placeholder: 'e.g. policy or sop' },
    { key: 'limit', label: 'Max results', type: 'number', placeholder: '5' },
  ],
  'knowledge.validate_policy': [
    { key: 'policy', label: 'Policy text or key', type: 'text', placeholder: 'e.g. refund_policy' },
    { key: 'action', label: 'Proposed action', type: 'text', placeholder: 'e.g. {{agent.intent}}' },
  ],
  'knowledge.attach_evidence': [
    { key: 'title', label: 'Evidence title', type: 'text', placeholder: 'e.g. Damage inspection policy' },
    { key: 'note', label: 'Note (optional)', type: 'text' },
  ],
  // ── Integration ───────────────────────────────────────────────────────────
  'connector.call': [
    { key: 'capability', label: 'Capability key', type: 'text', placeholder: 'e.g. payment.lookup or order.sync' },
    { key: 'entityType', label: 'Entity type (optional)', type: 'text', placeholder: 'e.g. order' },
    { key: 'entityId', label: 'Entity ID (optional)', type: 'text', placeholder: '{{order.id}}' },
  ],
  'connector.emit_event': [
    { key: 'eventType', label: 'Event type', type: 'text', placeholder: 'e.g. order.fulfilled' },
    { key: 'sourceSystem', label: 'Source system (optional)', type: 'text', placeholder: 'e.g. shopify' },
  ],
  // ── Utility ───────────────────────────────────────────────────────────────
  'delay': [
    { key: 'duration', label: 'Duration', type: 'text', placeholder: 'e.g. 2h, 30m, 1d, 7d', hint: 'Pause execution for this duration' },
    { key: 'mode', label: 'Resume mode', type: 'select', options: ['auto', 'manual_resume'] },
  ],
  'retry': [
    { key: 'maxAttempts', label: 'Max attempts', type: 'number', placeholder: '3' },
    { key: 'backoffMs', label: 'Backoff ms', type: 'number', placeholder: '1000' },
  ],
  // ── AI ────────────────────────────────────────────────────────────────────
  'ai.generate_text': [
    { key: 'prompt', label: 'Prompt', type: 'textarea', placeholder: 'e.g. Summarize this case: {{case.description}}', hint: 'Supports {{template}} interpolation from workflow context' },
    { key: 'target', label: 'Output variable', type: 'text', placeholder: 'generatedText', hint: 'Result stored as context.agent.<variable> and context.data.<variable>' },
    { key: 'maxTokens', label: 'Max tokens (optional)', type: 'number', placeholder: '512' },
    { key: 'model', label: 'Model override (optional)', type: 'text', placeholder: 'e.g. gemini-2.5-pro' },
  ],
  'ai.gemini': [
    { key: 'operation', label: 'Operation', type: 'select', options: ['generate_text', 'chat', 'extract_structured'], hint: 'Pick the Gemini call style' },
    { key: 'prompt', label: 'Prompt', type: 'textarea', placeholder: 'Summarize this conversation: {{trigger.message}}' },
    { key: 'systemInstruction', label: 'System instruction (optional)', type: 'textarea', placeholder: 'You are a helpful customer support assistant.' },
    { key: 'model', label: 'Model', type: 'select', options: ['', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
    { key: 'temperature', label: 'Temperature (0-1)', type: 'number', placeholder: '0.7' },
    { key: 'maxTokens', label: 'Max tokens', type: 'number', placeholder: '1024' },
    { key: 'target', label: 'Output variable', type: 'text', placeholder: 'geminiResult' },
  ],
  'ai.anthropic': [
    { key: 'operation', label: 'Operation', type: 'select', options: ['message', 'analyze_document', 'analyze_image', 'generate_prompt', 'improve_prompt'], hint: 'Anthropic action category' },
    { key: 'prompt', label: 'Prompt / message', type: 'textarea', placeholder: 'Summarize the user query: {{trigger.message}}' },
    { key: 'systemInstruction', label: 'System instruction (optional)', type: 'textarea' },
    { key: 'model', label: 'Model', type: 'select', options: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'] },
    { key: 'maxTokens', label: 'Max tokens', type: 'number', placeholder: '1024' },
    { key: 'temperature', label: 'Temperature (0-1)', type: 'number', placeholder: '0.7' },
    { key: 'target', label: 'Output variable', type: 'text', placeholder: 'anthropicResult' },
  ],
  'ai.openai': [
    { key: 'operation', label: 'Operation', type: 'select', options: ['chat', 'completion', 'embeddings'], hint: 'Pick the OpenAI endpoint family' },
    { key: 'prompt', label: 'Prompt / input', type: 'textarea', placeholder: 'Categorize this message: {{trigger.message}}' },
    { key: 'systemInstruction', label: 'System instruction (optional)', type: 'textarea' },
    { key: 'model', label: 'Model', type: 'select', options: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'text-embedding-3-small', 'text-embedding-3-large'] },
    { key: 'maxTokens', label: 'Max tokens', type: 'number', placeholder: '1024' },
    { key: 'temperature', label: 'Temperature (0-1)', type: 'number', placeholder: '0.7' },
    { key: 'target', label: 'Output variable', type: 'text', placeholder: 'openaiResult' },
  ],
  'ai.ollama': [
    { key: 'model', label: 'Model name', type: 'text', placeholder: 'llama3, mistral, codellama, ...', hint: 'Must be installed on the Ollama server' },
    { key: 'prompt', label: 'Prompt', type: 'textarea' },
    { key: 'systemInstruction', label: 'System instruction (optional)', type: 'textarea' },
    { key: 'temperature', label: 'Temperature (0-1)', type: 'number', placeholder: '0.7' },
    { key: 'target', label: 'Output variable', type: 'text', placeholder: 'ollamaResult' },
  ],
  'ai.guardrails': [
    { key: 'mode', label: 'Mode', type: 'select', options: ['input', 'output'], hint: 'Filter input prompts before LLM, or output before continuing' },
    { key: 'text', label: 'Text path', type: 'text', placeholder: '{{data.userMessage}}' },
    { key: 'checks', label: 'Checks (comma-separated)', type: 'text', placeholder: 'pii, toxicity, prompt_injection, jailbreak, off_topic', hint: 'Built-in safety checks' },
    { key: 'topic', label: 'Allowed topic (optional)', type: 'text', placeholder: 'customer support' },
    { key: 'target', label: 'Result variable', type: 'text', placeholder: 'guardResult' },
  ],
  // ── HTTP ──────────────────────────────────────────────────────────────────
  'data.http_request': [
    { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/endpoint', hint: 'Supports {{template}} interpolation' },
    { key: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
    { key: 'body', label: 'Request body (JSON, optional)', type: 'textarea', placeholder: '{"key":"{{order.id}}"}' },
    { key: 'headers', label: 'Headers (JSON, optional)', type: 'textarea', placeholder: '{"Authorization":"Bearer {{token}}"}' },
    { key: 'target', label: 'Output variable', type: 'text', placeholder: 'httpResult', hint: 'Response stored as context.data.<variable>' },
  ],
  // Triggers with optional config
  'webhook.received': [
    { key: 'path', label: 'Webhook path', type: 'text', placeholder: 'e.g. /hooks/myworkflow' },
  ],
  'case.created': [{ key: 'filter', label: 'Filter expression (optional)', type: 'text', placeholder: 'e.g. case.priority == high' }],
  'trigger.form_submission': [
    { key: 'formSlug', label: 'Form slug', type: 'text', placeholder: 'e.g. contact-us', hint: 'Public form URL becomes /forms/<slug>' },
    { key: 'redirectUrl', label: 'Redirect URL after submit (optional)', type: 'text', placeholder: 'https://yoursite.com/thanks' },
    { key: 'allowAnonymous', label: 'Allow anonymous submissions', type: 'select', options: ['true', 'false'] },
  ],
  'trigger.chat_message': [
    { key: 'channel', label: 'Source channel', type: 'select', options: ['superagent', 'web_chat', 'whatsapp', 'any'], hint: 'Where the chat message comes from' },
    { key: 'agentId', label: 'Restrict to agent (optional)', type: 'agent-picker' },
  ],
  'trigger.workflow_error': [
    { key: 'sourceWorkflowId', label: 'Source workflow id (optional)', type: 'text', placeholder: 'leave blank to handle errors from any workflow', hint: 'Leave empty to act as a global error handler' },
    { key: 'severity', label: 'Severity threshold', type: 'select', options: ['', 'warning', 'error', 'critical'] },
  ],
  'trigger.subworkflow_called': [
    { key: 'expectedInputs', label: 'Expected input fields (comma-separated, optional)', type: 'text', placeholder: 'caseId, customerId' },
  ],
  'trigger.evaluation_run': [
    { key: 'datasetId', label: 'Dataset id (optional)', type: 'text', placeholder: 'evaluations dataset id' },
  ],
  // ── Scheduled trigger ─────────────────────────────────────────────────────
  'trigger.schedule': [
    { key: 'cron', label: 'Cron expression', type: 'text', placeholder: '0 9 * * 1-5', hint: 'Standard cron (min hour day month weekday). E.g. "0 9 * * 1-5" = every weekday at 9 AM' },
    { key: 'timezone', label: 'Timezone (optional)', type: 'text', placeholder: 'Europe/Madrid', hint: 'IANA timezone name. Defaults to UTC.' },
    { key: 'description', label: 'Schedule description (optional)', type: 'text', placeholder: 'e.g. Daily business-hours sweep' },
  ],
};

function nodeFieldsForKey(key: string): NodeFieldDef[] {
  return NODE_FIELD_SCHEMAS[key] ?? [];
}
const EDITOR_TABS = [
  { id: 'builder', label: 'Editor' },
  { id: 'runs', label: 'Executions' },
  { id: 'evaluations', label: 'Evaluations' },
] as const;
const ADD_GROUPS = ['AI Agent', 'AI', 'Action', 'Data transformation', 'Flow', 'Core', 'Human review', 'Integration', 'Knowledge', 'Trigger'] as const;

const CATEGORY_META: Record<string, { title: string; subtitle: string; icon: string }> = {
  'AI Agent': { title: 'AI Agent', subtitle: 'Connect pre-configured AI Studio agents directly into your workflows.', icon: 'smart_toy' },
  AI: { title: 'AI', subtitle: 'LLM providers, extractors, and safety guardrails for AI-powered steps.', icon: 'auto_awesome' },
  Action: { title: 'Action', subtitle: 'Write into cases, orders, payments, returns, and more.', icon: 'bolt' },
  'Data transformation': { title: 'Data transformation', subtitle: 'Map, clean, reshape, and prepare workflow data.', icon: 'transform' },
  Flow: { title: 'Flow', subtitle: 'Branch, merge, loop, wait, and coordinate execution.', icon: 'account_tree' },
  Core: { title: 'Core', subtitle: 'Policies, utilities, and internal system controls.', icon: 'shield' },
  'Human review': { title: 'Human review', subtitle: 'Pause for approvals and manual decisions.', icon: 'verified' },
  Integration: { title: 'Integration', subtitle: 'Call connectors and external capabilities.', icon: 'hub' },
  Knowledge: { title: 'Knowledge', subtitle: 'Search SOPs, policies, and product knowledge.', icon: 'menu_book' },
  Trigger: { title: 'Trigger', subtitle: 'Start workflows from events or manual runs.', icon: 'play_circle' },
};

const WORKFLOW_CATEGORY_ORDER = [
  'Support operations',
  'Orders & fulfillment',
  'Payments & risk',
  'Returns & recovery',
  'Approvals & governance',
  'AI & knowledge',
  'Integrations & sync',
  'Orchestration & data',
] as const;

const WORKFLOW_CATEGORY_META: Record<string, { subtitle: string; icon: string }> = {
  'Support operations': { subtitle: 'Customer cases, inbox triage, SLA handling, and outbound replies.', icon: 'support_agent' },
  'Orders & fulfillment': { subtitle: 'Order updates, shipment states, warehouse holds, and fulfillment controls.', icon: 'shopping_bag' },
  'Payments & risk': { subtitle: 'Refunds, disputes, PSP checks, fraud controls, and finance automation.', icon: 'payments' },
  'Returns & recovery': { subtitle: 'Return approvals, inspections, exchanges, and recovery journeys.', icon: 'assignment_return' },
  'Approvals & governance': { subtitle: 'Human review, policy gates, approvals, and operational guardrails.', icon: 'gpp_good' },
  'AI & knowledge': { subtitle: 'Reasoning, summaries, drafting, retrieval, and agent-assisted workflows.', icon: 'auto_awesome' },
  'Integrations & sync': { subtitle: 'Connectors, HTTP calls, webhook ingestion, and downstream sync.', icon: 'hub' },
  'Orchestration & data': { subtitle: 'Branching, loops, scheduling, delays, and payload shaping.', icon: 'account_tree' },
};

const WORKFLOW_CATEGORY_ALIASES: Record<string, string> = {
  refunds: 'Payments & risk',
  refund: 'Payments & risk',
  payments: 'Payments & risk',
  payment: 'Payments & risk',
  risk: 'Payments & risk',
  returns: 'Returns & recovery',
  return: 'Returns & recovery',
  orders: 'Orders & fulfillment',
  order: 'Orders & fulfillment',
  operations: 'Support operations',
  cases: 'Support operations',
  case: 'Support operations',
  inbox: 'Support operations',
  approvals: 'Approvals & governance',
  approval: 'Approvals & governance',
  governance: 'Approvals & governance',
  agents: 'AI & knowledge',
  ai: 'AI & knowledge',
  knowledge: 'AI & knowledge',
  flow: 'Orchestration & data',
  orchestration: 'Orchestration & data',
  general: 'Orchestration & data',
  integration: 'Integrations & sync',
  integrations: 'Integrations & sync',
  sync: 'Integrations & sync',
};

function normalizeWorkflowCategory(value?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (WORKFLOW_CATEGORY_META[raw]) return raw;
  return WORKFLOW_CATEGORY_ALIASES[raw.toLowerCase()] ?? raw;
}

function scoreWorkflowCategory(keys: string[], triggerType: string, description: string) {
  const score: Record<string, number> = Object.fromEntries(WORKFLOW_CATEGORY_ORDER.map((category) => [category, 0]));
  const add = (category: string, amount: number) => { score[category] = (score[category] ?? 0) + amount; };

  for (const key of keys) {
    if (key.startsWith('payment.') || key.includes('dispute') || key.includes('refund')) add('Payments & risk', 4);
    if (key.startsWith('return.')) add('Returns & recovery', 4);
    if (key.startsWith('order.') || key.startsWith('shipment.')) add('Orders & fulfillment', 4);
    if (key.startsWith('approval.') || key.startsWith('policy.') || key.startsWith('core.')) add('Approvals & governance', 3);
    if (key.startsWith('agent.') || key.startsWith('ai.') || key.startsWith('knowledge.')) add('AI & knowledge', 3);
    if (key.startsWith('connector.') || key === 'data.http_request' || key === 'webhook.received') add('Integrations & sync', 4);
    if (key.startsWith('case.') || key === 'message.received' || key === 'case.created' || key === 'case.updated' || key === 'customer.updated' || key === 'sla.breached' || key.startsWith('notification.')) add('Support operations', 3);
    if (key.startsWith('flow.') || key.startsWith('data.') || key === 'delay' || key === 'retry' || key === 'stop' || key === 'manual.run' || key === 'trigger.schedule') add('Orchestration & data', 2);
  }

  if (triggerType === 'payment.failed' || triggerType === 'payment.dispute.created') add('Payments & risk', 4);
  if (triggerType === 'return.created') add('Returns & recovery', 4);
  if (triggerType === 'order.updated' || triggerType === 'shipment.updated') add('Orders & fulfillment', 4);
  if (triggerType === 'approval.decided') add('Approvals & governance', 4);
  if (triggerType === 'webhook.received') add('Integrations & sync', 4);

  const normalizedDescription = description.toLowerCase();
  if (/\brefund|chargeback|dispute|psp|fraud\b/.test(normalizedDescription)) add('Payments & risk', 2);
  if (/\breturn|replacement|inspection|restock\b/.test(normalizedDescription)) add('Returns & recovery', 2);
  if (/\border|shipment|warehouse|fulfillment\b/.test(normalizedDescription)) add('Orders & fulfillment', 2);
  if (/\bapproval|policy|review|escalat/.test(normalizedDescription)) add('Approvals & governance', 2);
  if (/\bai|agent|knowledge|summar|draft\b/.test(normalizedDescription)) add('AI & knowledge', 2);
  if (/\bwebhook|connector|integration|http|sync\b/.test(normalizedDescription)) add('Integrations & sync', 2);
  if (/\bcase|support|customer|sla|inbox\b/.test(normalizedDescription)) add('Support operations', 2);

  return score;
}

function deriveWorkflowCategory(rawNodes: any[] | string = [], rawTrigger: any = {}, description = '', explicit?: string | null) {
  const normalizedExplicit = normalizeWorkflowCategory(explicit);
  if (normalizedExplicit && WORKFLOW_CATEGORY_META[normalizedExplicit]) return normalizedExplicit;

  const nodes = parseMaybeJsonArray(rawNodes);
  const keys = nodes
    .map((node) => normalizeNodeKey(node, normalizeNodeType(node.type, node.key)))
    .filter(Boolean);
  const trigger = parseMaybeJsonObject(rawTrigger);
  const triggerType = String(trigger.workflowCategoryTrigger ?? trigger.type ?? '').trim();
  const score = scoreWorkflowCategory(keys, triggerType, description);
  const top = [...WORKFLOW_CATEGORY_ORDER].sort((a, b) => (score[b] ?? 0) - (score[a] ?? 0))[0];
  return score[top] > 0 ? top : 'Orchestration & data';
}

function buildWorkflowTrigger(existingTrigger: any, category: string, firstNodeKey?: string) {
  const base = parseMaybeJsonObject(existingTrigger);
  const normalizedCategory = normalizeWorkflowCategory(category) || 'Orchestration & data';
  return {
    ...base,
    type: base.type ?? firstNodeKey ?? 'manual.run',
    workflowCategory: normalizedCategory,
  };
}

function extractWorkflowVariableReferences(workflows: Workflow[]): WorkflowVariableReference[] {
  const registry = new Map<string, WorkflowVariableReference>();
  const pattern = /{{\s*(?:vars?|variables)\.([a-zA-Z0-9_.-]+)\s*}}/g;
  for (const workflow of workflows) {
    const nodes = workflow.currentVersion?.nodes ?? [];
    const sources = [
      workflow.description,
      ...nodes.map((node: any) => JSON.stringify(node?.config ?? {})),
      ...nodes.map((node: any) => JSON.stringify(node?.ui ?? {})),
    ].filter(Boolean);

    for (const source of sources) {
      const text = String(source);
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const key = String(match[1] ?? '').trim();
        if (!key) continue;
        const current = registry.get(key) ?? { key, workflowIds: [], workflowNames: [], examples: [] };
        if (!current.workflowIds.includes(workflow.id)) current.workflowIds.push(workflow.id);
        if (!current.workflowNames.includes(workflow.name)) current.workflowNames.push(workflow.name);
        if (match[0] && !current.examples.includes(match[0])) current.examples.push(match[0]);
        registry.set(key, current);
      }
    }
  }
  return [...registry.values()].sort((a, b) => b.workflowIds.length - a.workflowIds.length || a.key.localeCompare(b.key));
}

function extractWorkflowTableReferences(workflows: Workflow[]): WorkflowTableReference[] {
  const registry = new Map<string, WorkflowTableReference>();
  for (const workflow of workflows) {
    const nodes = workflow.currentVersion?.nodes ?? [];
    for (const node of nodes) {
      const config = parseMaybeJsonObject(node?.config);
      const candidates = [
        config.table,
        config.tableName,
        config.dataTable,
        config.dataset,
      ].filter(Boolean);
      for (const candidate of candidates) {
        const key = String(candidate).trim();
        if (!key) continue;
        const current = registry.get(key) ?? { key, workflowIds: [], workflowNames: [], sources: [] };
        if (!current.workflowIds.includes(workflow.id)) current.workflowIds.push(workflow.id);
        if (!current.workflowNames.includes(workflow.name)) current.workflowNames.push(workflow.name);
        const source = node?.label || node?.key || 'workflow node';
        if (!current.sources.includes(source)) current.sources.push(source);
        registry.set(key, current);
      }
    }
  }
  return [...registry.values()].sort((a, b) => b.workflowIds.length - a.workflowIds.length || a.key.localeCompare(b.key));
}

function parseWorkspaceWorkflowSettings(settings: any): { variables: WorkflowVariableRecord[]; dataTables: WorkflowDataTableRecord[] } {
  const root = parseMaybeJsonObject(settings);
  const workflowsSettings = parseMaybeJsonObject(root.workflows);
  const variables = parseMaybeJsonArray(workflowsSettings.variables).map((item: any) => ({
    id: String(item?.id ?? crypto.randomUUID()),
    key: String(item?.key ?? ''),
    value: String(item?.value ?? ''),
    scope: (['workspace', 'workflow', 'secure'].includes(String(item?.scope)) ? item.scope : 'workspace') as WorkflowVariableScope,
    createdAt: String(item?.createdAt ?? item?.created_at ?? new Date().toISOString()),
    updatedAt: String(item?.updatedAt ?? item?.updated_at ?? new Date().toISOString()),
  })).filter((item: WorkflowVariableRecord) => item.key.trim());

  const dataTables = parseMaybeJsonArray(workflowsSettings.dataTables).map((item: any) => ({
    id: String(item?.id ?? crypto.randomUUID()),
    name: String(item?.name ?? 'Untitled table'),
    source: (item?.source === 'csv' ? 'csv' : 'scratch') as 'scratch' | 'csv',
    columns: parseMaybeJsonArray(item?.columns).map((column: any) => ({
      id: String(column?.id ?? crypto.randomUUID()),
      name: String(column?.name ?? ''),
      type: (['string', 'number', 'boolean', 'datetime'].includes(String(column?.type)) ? column.type : 'string') as WorkflowColumnType,
    })).filter((column: WorkflowDataTableColumn) => column.name.trim()),
    rows: parseMaybeJsonArray(item?.rows).map((row: any, index: number) => ({
      id: String(row?.id ?? index + 1),
      createdAt: String(row?.createdAt ?? row?.created_at ?? new Date().toISOString()),
      updatedAt: String(row?.updatedAt ?? row?.updated_at ?? new Date().toISOString()),
      values: parseMaybeJsonObject(row?.values),
    })),
    createdAt: String(item?.createdAt ?? item?.created_at ?? new Date().toISOString()),
    updatedAt: String(item?.updatedAt ?? item?.updated_at ?? new Date().toISOString()),
  }));

  return { variables, dataTables };
}

function mergeWorkspaceWorkflowSettings(existingSettings: any, patch: { variables?: WorkflowVariableRecord[]; dataTables?: WorkflowDataTableRecord[] }) {
  const root = parseMaybeJsonObject(existingSettings);
  const workflowsSettings = parseMaybeJsonObject(root.workflows);
  return {
    ...root,
    workflows: {
      ...workflowsSettings,
      ...(patch.variables ? { variables: patch.variables } : {}),
      ...(patch.dataTables ? { dataTables: patch.dataTables } : {}),
    },
  };
}

function parseCsvText(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { headers: [] as string[], rows: [] as string[][] };
  const split = (line: string) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
  const headers = split(lines[0]).filter(Boolean);
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

function makeNode(spec: Pick<WorkflowNode, 'type' | 'key' | 'label'> & { config?: Record<string, any>; position?: { x: number; y: number } }, index: number): WorkflowNode {
  return {
    id: `node_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
    type: spec.type,
    key: spec.key,
    label: spec.label,
    position: spec.position ?? { x: 120 + index * 300, y: 220 + (index % 2) * 160 },
    config: spec.config ?? {},
    disabled: false,
    credentialsRef: null,
    retryPolicy: null,
    ui: {},
  };
}

function makeEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
  return nodes.slice(1).map((node, index) => ({
    id: `edge_${nodes[index].id}_${node.id}`,
    source: nodes[index].id,
    target: node.id,
    label: nodes[index].type === 'condition' ? 'true' : 'next',
    sourceHandle: nodes[index].type === 'condition' ? 'true' : 'main',
  }));
}

function normalizeNodes(raw: any[] | string = []): WorkflowNode[] {
  return parseMaybeJsonArray(raw).map((node, index) => {
    const type = normalizeNodeType(node.type, node.key);
    const key = normalizeNodeKey(node, type);
    return {
    id: node.id ?? `node_${index + 1}`,
    type,
    key,
    label: node.label ?? node.name ?? node.key ?? `Step ${index + 1}`,
    position: node.position ?? { x: 120 + index * 300, y: 220 + (index % 2) * 160 },
    config: parseMaybeJsonObject(node.config),
    disabled: Boolean(node.disabled),
    credentialsRef: node.credentialsRef ?? node.credentials_ref ?? node.config?.connector_id ?? node.config?.connectorId ?? node.config?.connector ?? null,
    retryPolicy: node.retryPolicy ?? node.retry_policy ?? null,
    ui: node.ui ?? {},
  };
  });
}

function normalizeEdges(raw: any[] | string = [], nodes: WorkflowNode[] = []): WorkflowEdge[] {
  const edges = parseMaybeJsonArray(raw);
  if (!edges.length) return makeEdges(nodes);
  return edges.map((edge, index) => {
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

function mapWorkflow(w: any): Workflow {
  const rawVersion = w.current_version ?? w.workflow_versions ?? null;
  const rawTrigger = rawVersion?.trigger ?? w.trigger ?? {};
  const currentVersion = rawVersion ? {
    ...rawVersion,
    nodes: normalizeNodes(rawVersion.nodes ?? w.nodes ?? []),
    edges: normalizeEdges(rawVersion.edges ?? w.edges ?? []),
    trigger: parseMaybeJsonObject(rawTrigger),
  } : null;
  return {
    id: w.id,
    name: w.name,
    category: deriveWorkflowCategory(rawVersion?.nodes ?? w.nodes ?? [], rawTrigger, w.description || '', parseMaybeJsonObject(rawTrigger).workflowCategory ?? w.category),
    description: w.description || '',
    currentVersion,
    versions: parseMaybeJsonArray(w.versions ?? []),
    recentRuns: parseMaybeJsonArray(w.recent_runs ?? []),
    metrics: [
      { label: 'Executions', value: String(w.metrics?.executions ?? 0) },
      { label: 'Success rate', value: w.metrics?.success_rate !== undefined ? `${w.metrics.success_rate}%` : 'N/A' },
      { label: 'Failures', value: String(w.metrics?.failed ?? 0) },
      { label: 'Approvals', value: String(w.metrics?.approvals_created ?? 0) },
      { label: 'Blocked', value: String(w.metrics?.actions_blocked ?? 0) },
      { label: 'Time saved', value: String(w.metrics?.time_saved_minutes ?? 0), suffix: 'm' },
    ],
    lastRun: w.metrics?.last_run_at ? new Date(w.metrics.last_run_at).toLocaleString() : 'Never',
    lastEdited: w.updated_at ? new Date(w.updated_at).toLocaleDateString() : '-',
    status: ['blocked', 'warning', 'needs_setup', 'dependency_missing'].includes(w.health_status) ? w.health_status : 'active',
    statusMessage: w.health_message,
  };
}

function nodeTone(type: NodeType) {
  const tones: Record<NodeType, string> = {
    trigger: 'border-blue-200 bg-white text-blue-700',
    condition: 'border-amber-200 bg-white text-amber-700',
    action: 'border-emerald-200 bg-white text-emerald-700',
    agent: 'border-[#e9eae6] bg-white text-[#1a1a1a]',
    policy: 'border-slate-200 bg-white text-slate-800',
    knowledge: 'border-cyan-200 bg-white text-cyan-700',
    integration: 'border-orange-200 bg-white text-orange-700',
    utility: 'border-[#e9eae6] bg-white text-[#1a1a1a]',
  };
  return tones[type] ?? tones.action;
}

function categoryForSpec(spec: NodeSpec) {
  if (spec.key.startsWith('data.')) return 'Data transformation';
  if (spec.key.startsWith('message.')) return 'Human review';
  if (spec.key.startsWith('core.')) return 'Core';
  // agent.* keys → dedicated "AI Agent" category; ai.* keys → "AI" (LLM providers)
  if (spec.key.startsWith('agent.')) return 'AI Agent';
  if (spec.key.startsWith('ai.')) return 'AI';
  if (spec.type === 'agent') return 'AI';  // fallback for any remaining agent-typed node
  if (spec.type === 'condition' || spec.type === 'utility') return 'Flow';
  if (spec.type === 'action') return spec.key.startsWith('approval.') ? 'Human review' : 'Action';
  if (spec.type === 'policy') return 'Core';
  if (spec.type === 'knowledge') return 'Knowledge';
  if (spec.type === 'integration') return 'Integration';
  return spec.category || 'Core';
}

type AddPanelSection = {
  title: string;
  items: NodeSpec[];
};

function getAddPanelSections(category: string, catalog: NodeSpec[], search: string): AddPanelSection[] {
  const normalizedSearch = search.trim().toLowerCase();
  const specs = catalog.filter((spec) => {
    const matchesCategory = categoryForSpec(spec) === category;
    const haystack = `${spec.label} ${spec.key} ${spec.description ?? ''}`.toLowerCase();
    return matchesCategory && (!normalizedSearch || haystack.includes(normalizedSearch));
  });

  const byKey = new Map(specs.map((spec) => [spec.key, spec]));
  const pick = (keys: string[]) => keys.map((key) => byKey.get(key)).filter(Boolean) as NodeSpec[];

  const sectionsByCategory: Record<string, AddPanelSection[]> = {
    'AI Agent': [
      { title: 'Run an agent', items: pick(['agent.run']) },
      { title: 'Inline AI steps', items: pick(['agent.classify', 'agent.draft_reply', 'agent.sentiment', 'agent.summarize']) },
    ],
    Flow: [
      { title: 'Popular', items: pick(['flow.filter', 'flow.if', 'flow.loop', 'flow.merge']) },
      { title: 'Other', items: pick(['flow.compare', 'flow.branch', 'flow.switch', 'flow.wait', 'flow.subworkflow', 'flow.stop_error', 'flow.noop']) },
    ],
    'Data transformation': [
      { title: 'Popular', items: pick(['data.ai_transform', 'data.set_fields', 'data.pick_fields', 'data.map_fields', 'data.validate_required']) },
      { title: 'Add or remove items', items: pick(['data.limit', 'data.dedupe', 'data.split_out', 'data.split_items']) },
      { title: 'Combine items', items: pick(['data.aggregate', 'data.merge_objects']) },
      { title: 'Other', items: pick(['data.rename_fields', 'data.calculate', 'data.extract_json', 'data.normalize_text', 'data.format_date']) },
    ],
    AI: [
      { title: 'Popular', items: pick(['ai.generate_text', 'ai.information_extractor', 'ai.gemini']) },
      { title: 'AI providers', items: pick(['ai.gemini', 'ai.anthropic', 'ai.openai', 'ai.ollama']) },
      { title: 'Safety', items: pick(['ai.guardrails']) },
    ],
    Action: [
      { title: 'Cases', items: pick(['case.assign', 'case.update_status', 'case.set_priority', 'case.add_tag', 'case.reply', 'case.note']) },
      { title: 'Orders', items: pick(['order.hold', 'order.release', 'order.cancel']) },
      { title: 'Payments', items: pick(['payment.refund', 'payment.mark_dispute']) },
      { title: 'Returns', items: pick(['return.create', 'return.approve', 'return.reject']) },
    ],
    'Human review': [
      { title: 'Approvals', items: pick(['approval.create', 'approval.escalate']) },
      { title: 'Send and wait for response', items: pick(['message.slack', 'message.discord', 'message.gmail', 'message.outlook', 'message.teams', 'message.google_chat', 'message.telegram', 'notification.email']) },
    ],
    Core: [
      { title: 'Popular', items: pick(['core.code', 'core.data_table_op', 'core.respond_webhook']) },
      { title: 'Policy', items: pick(['policy.evaluate', 'core.idempotency_check', 'core.rate_limit']) },
      { title: 'Runtime', items: pick(['core.audit_log', 'stop', 'retry', 'delay']) },
    ],
    Integration: [
      { title: 'Connectors', items: pick(['connector.check_health', 'connector.call', 'connector.emit_event', 'data.http_request']) },
    ],
    Knowledge: [
      { title: 'Knowledge', items: pick(['knowledge.search', 'knowledge.validate_policy', 'knowledge.attach_evidence']) },
    ],
    Trigger: [
      { title: 'Popular', items: pick(['manual.run', 'webhook.received', 'trigger.schedule', 'trigger.form_submission', 'trigger.chat_message']) },
      { title: 'Support', items: pick(['case.created', 'case.updated', 'message.received', 'sla.breached']) },
      { title: 'Commerce', items: pick(['order.updated', 'shipment.updated', 'payment.failed', 'payment.dispute.created', 'return.created']) },
      { title: 'System', items: pick(['customer.updated', 'approval.decided', 'trigger.workflow_error', 'trigger.subworkflow_called', 'trigger.evaluation_run']) },
    ],
  };

  const sections = sectionsByCategory[category] ?? [{ title: 'Available blocks', items: specs }];
  return sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (normalizedSearch) return `${item.label} ${item.key} ${item.description ?? ''}`.toLowerCase().includes(normalizedSearch);
      return true;
    }),
  })).filter((section) => section.items.length > 0);
}

function getCategoryOverview(catalog: NodeSpec[], studioAgentCount = 0) {
  return ADD_GROUPS.map((category) => {
    const items = catalog.filter((spec) => categoryForSpec(spec) === category);
    const meta = CATEGORY_META[category] ?? { title: category, subtitle: 'Browse available blocks.', icon: 'grid_view' };
    // For the AI Agent category, add the live AI Studio agent count on top of the static spec count
    const count = category === 'AI Agent' ? items.length + studioAgentCount : items.length;
    return { category, ...meta, count, items };
  });
}

function toFlowNodes(
  workflowNodes: WorkflowNode[],
  catalog: NodeSpec[],
  selectedNodeId: string | null,
  latestSteps: any[],
  diagnostics: WorkflowDiagnostic[],
  handlers: Omit<FlowNodeData, 'workflowNode' | 'spec' | 'selected' | 'latestStatus'>,
): Node<FlowNodeData>[] {
  return workflowNodes.map((node) => ({
    id: node.id,
    type: 'workflowNode',
    position: node.position,
    data: {
      ...handlers,
      workflowNode: node,
      spec: catalog.find((spec) => spec.key === node.key),
      selected: selectedNodeId === node.id,
      latestStatus: latestSteps.find((step) => step.node_id === node.id || step.nodeId === node.id)?.status,
      diagnostics: diagnostics.filter((diagnostic) => diagnostic.nodeId === node.id),
    },
  }));
}

function toFlowEdges(
  workflowEdges: WorkflowEdge[],
  handlers?: {
    onAddEdge?: (edgeId: string) => void;
    onDeleteEdge?: (edgeId: string) => void;
    onRenameEdge?: (edgeId: string) => void;
  },
): Edge[] {
  return workflowEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    type: 'workflowEdge',
    data: handlers,
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#9ca3af' },
    style: { stroke: '#9ca3af', strokeWidth: 1.5 },
  }));
}

function fromFlowNodes(flowNodes: Node<FlowNodeData>[], currentNodes: WorkflowNode[]) {
  const byId = new Map(currentNodes.map((node) => [node.id, node]));
  return flowNodes.map((node) => ({
    ...byId.get(node.id)!,
    position: node.position,
  })).filter((node) => Boolean(node.id));
}

function fromFlowEdges(flowEdges: Edge[]): WorkflowEdge[] {
  return flowEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: String(edge.label ?? edge.sourceHandle ?? 'next'),
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  }));
}

function isSameFlowNode(a: Node<FlowNodeData>, b: Node<FlowNodeData>) {
  return a.id === b.id
    && a.position.x === b.position.x
    && a.position.y === b.position.y
    && a.type === b.type
    && a.data.workflowNode.id === b.data.workflowNode.id
    && a.data.workflowNode.key === b.data.workflowNode.key
    && a.data.selected === b.data.selected
    && a.data.latestStatus === b.data.latestStatus
    && (a.data.diagnostics?.length ?? 0) === (b.data.diagnostics?.length ?? 0);
}

function isSameFlowEdge(a: Edge, b: Edge) {
  return a.id === b.id
    && a.source === b.source
    && a.target === b.target
    && String(a.label ?? '') === String(b.label ?? '')
    && String(a.sourceHandle ?? '') === String(b.sourceHandle ?? '')
    && String(a.targetHandle ?? '') === String(b.targetHandle ?? '');
}

function templateEdges(template: (typeof TEMPLATES)[number], nodes: WorkflowNode[]) {
  if (!('edges' in template) || !template.edges) return makeEdges(nodes);
  return template.edges.map((edge, index) => {
    const templateEdge = edge as { source: number; target: number; label: string; sourceHandle?: string };
    return {
      id: `edge_${nodes[templateEdge.source].id}_${nodes[templateEdge.target].id}_${index}`,
      source: nodes[templateEdge.source].id,
      target: nodes[templateEdge.target].id,
      label: templateEdge.label,
      sourceHandle: templateEdge.sourceHandle ?? (templateEdge.label === 'false' ? 'false' : templateEdge.label === 'true' ? 'true' : 'main'),
    };
  });
}

function WorkflowNodeCard({ data }: NodeProps<Node<FlowNodeData>>) {
  const node = data.workflowNode;
  const isCompact = ['knowledge', 'integration', 'utility'].includes(node.type);
  const blockingDiagnostic = data.diagnostics?.find((diagnostic) => diagnostic.severity === 'error');
  const warningDiagnostic = data.diagnostics?.find((diagnostic) => diagnostic.severity === 'warning');
  const statusTone = data.latestStatus === 'failed' || data.latestStatus === 'blocked'
    ? 'border-red-300 ring-red-100'
    : blockingDiagnostic
      ? 'border-red-300 ring-red-100'
      : warningDiagnostic
        ? 'border-amber-300 ring-amber-100'
    : data.latestStatus === 'completed'
      ? 'border-green-300 ring-green-100'
      : data.latestStatus === 'waiting'
        ? 'border-amber-300 ring-amber-100'
        : 'border-[#e9eae6] ring-gray-100';

  if (node.key === 'flow.note') {
    return (
      <div className={`group relative p-5 rounded-[14px] shadow-sm border-2 min-w-56 min-h-32 flex flex-col ${node.config?.color === 'blue' ? 'bg-blue-50 border-blue-200' : node.config?.color === 'green' ? 'bg-green-50 border-green-200' : node.config?.color === 'red' ? 'bg-red-50 border-red-200' : node.config?.color === 'purple' ? 'bg-purple-50 border-purple-200' : 'bg-yellow-50 border-yellow-200'}`}>
        <div className="flex items-center gap-2 mb-3 text-[#646462] border-b border-black/5 pb-1.5">
          <span className="material-symbols-outlined text-[14px]">sticky_note_2</span>
          <span className="text-[10px] font-bold uppercase tracking-wider">Note</span>
        </div>
        <div className="flex-1 whitespace-pre-wrap text-[13px] text-[#1a1a1a] font-medium leading-relaxed italic">
          {node.config?.content || 'Double click to edit note...'}
        </div>
        <NodeInlineControls data={data} />
      </div>
    );
  }

  if (node.type === 'trigger') {
    return (
      <div className={`group relative flex flex-col items-center ${node.disabled ? 'opacity-45' : ''}`}>
        <span className="absolute -left-7 top-12 material-symbols-outlined text-[13px] text-red-400">bolt</span>
        <button
          onClick={() => data.onSelect(node.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            data.onMenu(node.id, { x: event.clientX, y: event.clientY });
          }}
          className={`relative flex h-28 w-28 items-center justify-center rounded-[28px] border bg-white shadow-sm transition hover:shadow-md ${data.selected ? 'ring-4 ring-gray-200' : ''} ${statusTone}`}
        >
          <Handle type="source" id="main" position={Position.Right} className="!h-4 !w-4 !border-[#d4d4d0] !bg-white" />
          <span className="material-symbols-outlined text-5xl text-[#1a1a1a]">{data.spec?.icon ?? 'chat'}</span>
          {blockingDiagnostic && <NodeDiagnosticDot tone="error" />}
          {!blockingDiagnostic && warningDiagnostic && <NodeDiagnosticDot tone="warning" />}
        </button>
        <div className="mt-3 max-w-40 text-center text-[14px] font-semibold leading-tight text-[#1a1a1a]">{node.label}</div>
        <NodeInlineControls data={data} />
      </div>
    );
  }

  if (isCompact) {
    return (
      <div className={`group relative flex flex-col items-center ${node.disabled ? 'opacity-45' : ''}`}>
        <Handle type="target" id="main" position={Position.Top} className="!h-4 !w-4 !rotate-45 !rounded-none !border-[#d4d4d0] !bg-white" />
        <button
          onClick={() => data.onSelect(node.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            data.onMenu(node.id, { x: event.clientX, y: event.clientY });
          }}
          className={`flex h-24 w-24 items-center justify-center rounded-full border bg-white shadow-sm transition hover:shadow-md ${data.selected ? 'ring-4 ring-gray-200' : ''} ${statusTone}`}
        >
          <span className={`material-symbols-outlined text-4xl ${node.type === 'integration' ? 'text-orange-500' : 'text-[#1a1a1a]'}`}>{data.spec?.icon ?? 'settings'}</span>
          {blockingDiagnostic && <NodeDiagnosticDot tone="error" />}
          {!blockingDiagnostic && warningDiagnostic && <NodeDiagnosticDot tone="warning" />}
        </button>
        <Handle type="source" id="main" position={Position.Bottom} className="!h-4 !w-4 !rotate-45 !rounded-none !border-[#d4d4d0] !bg-white" />
        <div className="mt-3 max-w-44 text-center text-[13px] font-semibold text-[#1a1a1a]">{node.label}</div>
        {node.ui?.displayNote && node.ui?.notes && <div className="mt-1 max-w-44 text-center text-[11px] text-[#646462]">{node.ui.notes}</div>}
        <NodeInlineControls data={data} />
      </div>
    );
  }

  return (
    <div className={`group relative ${node.disabled ? 'opacity-45' : ''}`}>
      <Handle type="target" id="main" position={Position.Left} className="!h-4 !w-4 !border-[#d4d4d0] !bg-white" />
      <button
        onClick={() => data.onSelect(node.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          data.onMenu(node.id, { x: event.clientX, y: event.clientY });
        }}
        className={`relative min-h-24 w-72 rounded-[12px] border bg-white px-5 py-4 text-left shadow-sm transition hover:shadow-md ${data.selected ? 'ring-4 ring-gray-200' : ''} ${statusTone}`}
      >
        <div className="flex items-center gap-4">
          <span className={`material-symbols-outlined text-5xl ${nodeTone(node.type).split(' ').at(-1)}`}>{data.spec?.icon ?? 'settings'}</span>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-[#1a1a1a]">{node.label}</div>
            <div className="mt-1 text-[12px] text-[#646462]">{node.key}</div>
          </div>
        </div>
        {data.latestStatus && <div className="mt-3 inline-flex rounded-full bg-[#f8f8f7] px-2 py-1 text-[10px] font-bold uppercase text-[#646462]">{data.latestStatus}</div>}
        {blockingDiagnostic && <div className="mt-3 text-[11px] font-semibold text-red-600">{blockingDiagnostic.message}</div>}
        {!blockingDiagnostic && warningDiagnostic && <div className="mt-3 text-[11px] font-semibold text-amber-600">{warningDiagnostic.message}</div>}
        {node.ui?.displayNote && node.ui?.notes && <div className="mt-2 text-[12px] text-[#646462]">{node.ui.notes}</div>}
      </button>
      {node.type === 'condition' ? (
        <>
          {node.key === 'flow.switch' ? (
            <>
              <Handle type="source" id="vip" position={Position.Right} className="!top-[22%] !h-4 !w-4 !border-green-500 !bg-white" />
              <Handle type="source" id="standard" position={Position.Right} className="!top-[50%] !h-4 !w-4 !border-amber-500 !bg-white" />
              <Handle type="source" id="other" position={Position.Right} className="!top-[78%] !h-4 !w-4 !border-red-500 !bg-white" />
              <button onClick={() => data.onAdd(node.id, 'vip')} className="absolute -right-14 top-4 rounded-[8px] bg-[#f1f1ee] px-2 py-1 text-[12px] font-bold text-[#1a1a1a] opacity-0 transition group-hover:opacity-100">+</button>
              <button onClick={() => data.onAdd(node.id, 'standard')} className="absolute -right-14 top-1/2 -translate-y-1/2 rounded-[8px] bg-[#f1f1ee] px-2 py-1 text-[12px] font-bold text-[#1a1a1a] opacity-0 transition group-hover:opacity-100">+</button>
              <button onClick={() => data.onAdd(node.id, 'other')} className="absolute -right-14 bottom-4 rounded-[8px] bg-[#f1f1ee] px-2 py-1 text-[12px] font-bold text-[#1a1a1a] opacity-0 transition group-hover:opacity-100">+</button>
            </>
          ) : (
            <>
              <Handle type="source" id="true" position={Position.Right} className="!top-[34%] !h-4 !w-4 !border-green-500 !bg-white" />
              <Handle type="source" id="false" position={Position.Right} className="!top-[66%] !h-4 !w-4 !border-red-500 !bg-white" />
              <button onClick={() => data.onAdd(node.id, 'true')} className="absolute -right-14 top-5 rounded-[8px] bg-[#f1f1ee] px-2 py-1 text-[12px] font-bold text-[#1a1a1a] opacity-0 transition group-hover:opacity-100">+</button>
              <button onClick={() => data.onAdd(node.id, 'false')} className="absolute -right-14 bottom-5 rounded-[8px] bg-[#f1f1ee] px-2 py-1 text-[12px] font-bold text-[#1a1a1a] opacity-0 transition group-hover:opacity-100">+</button>
            </>
          )}
        </>
      ) : (
        <>
          <Handle type="source" id="main" position={Position.Right} className="!h-4 !w-4 !border-[#d4d4d0] !bg-white" />
          <button onClick={() => data.onAdd(node.id, 'main')} className="absolute -right-14 top-1/2 -translate-y-1/2 rounded-[8px] bg-[#f1f1ee] px-2 py-1 text-[12px] font-bold text-[#1a1a1a] opacity-0 transition group-hover:opacity-100">+</button>
          
          {(node.type === 'action' || node.type === 'agent' || node.type === 'integration') && (
            <>
              <Handle type="source" id="error" position={Position.Bottom} className="!h-4 !w-4 !border-red-500 !bg-white" />
              <button 
                onClick={() => data.onAdd(node.id, 'error')} 
                className="absolute -bottom-10 left-1/2 -translate-x-1/2 rounded-[8px] bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600 opacity-0 transition group-hover:opacity-100 border border-red-100 shadow-sm"
              >
                ON FAILURE
              </button>
            </>
          )}
        </>
      )}
      {node.type === 'agent' && (
        <div className="absolute -bottom-11 left-10 flex gap-9 text-[11px] text-[#646462]">
          {['chatModel', 'memory', 'tool'].map((port) => (
            <button key={port} onClick={() => data.onAdd(node.id, port)} className="relative">
              <span className="absolute -top-3 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border border-[#e9eae6] bg-white" />
              {port === 'chatModel' ? 'Chat Model*' : port === 'memory' ? 'Memory' : 'Tool'}
            </button>
          ))}
        </div>
      )}
      <NodeInlineControls data={data} />
    </div>
  );
}

function NodeInlineControls({ data }: { data: FlowNodeData }) {
  const node = data.workflowNode;
  return (
    <div className="absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1 rounded-[10px] border border-[#e9eae6] bg-white px-1 py-1 shadow-sm group-hover:flex">
      <button title="Execute step" onClick={() => data.onExecute(node.id)} className="rounded-[6px] p-1 hover:bg-[#f8f8f7]"><span className="material-symbols-outlined text-[13px]">play_arrow</span></button>
      <button title={node.disabled ? 'Activate' : 'Deactivate'} onClick={() => data.onToggle(node.id)} className="rounded-[6px] p-1 hover:bg-[#f8f8f7]"><span className="material-symbols-outlined text-[13px]">{node.disabled ? 'power_settings_new' : 'power'}</span></button>
      <button title="Delete" onClick={() => data.onDelete(node.id)} className="rounded-[6px] p-1 hover:bg-[#f8f8f7]"><span className="material-symbols-outlined text-[13px]">delete</span></button>
      <button title="More" onClick={(event) => data.onMenu(node.id, { x: event.clientX, y: event.clientY })} className="rounded-[6px] p-1 hover:bg-[#f8f8f7]"><span className="material-symbols-outlined text-[13px]">more_horiz</span></button>
    </div>
  );
}

function NodeDiagnosticDot({ tone }: { tone: 'error' | 'warning' }) {
  return (
    <span className={`absolute right-3 top-3 h-3 w-3 rounded-full border-2 border-white ${tone === 'error' ? 'bg-red-500' : 'bg-amber-400'}`} />
  );
}

function WorkflowEdgeButton(props: EdgeProps) {
  const [x, y] = props.sourceX < props.targetX
    ? [(props.sourceX + props.targetX) / 2, (props.sourceY + props.targetY) / 2]
    : [props.sourceX + 60, props.sourceY];
  return (
    <>
      <path id={props.id} d={`M ${props.sourceX} ${props.sourceY} C ${props.sourceX + 80} ${props.sourceY}, ${props.targetX - 80} ${props.targetY}, ${props.targetX} ${props.targetY}`} fill="none" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray={props.label === 'false' ? '6 6' : undefined} markerEnd="url(#arrowclosed)" />
      <foreignObject width={74} height={28} x={x - 37} y={y - 14} className="overflow-visible">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={(event) => {
              event.stopPropagation();
              (props.data as any)?.onAddEdge?.(props.id);
            }}
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#e9eae6] bg-white text-[13px] font-bold text-[#1a1a1a] shadow-sm hover:bg-[#f8f8f7]"
          >
            +
          </button>
          {props.label && <span className="rounded-full border border-[#e9eae6] bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-[#646462] shadow-sm">{props.label}</span>}
          <button
            onClick={(event) => {
              event.stopPropagation();
              (props.data as any)?.onRenameEdge?.(props.id);
            }}
            className="pointer-events-auto hidden h-7 w-7 items-center justify-center rounded-[8px] border border-[#e9eae6] bg-white text-[12px] text-[#646462] shadow-sm hover:bg-[#f8f8f7] sm:flex"
            title="Rename connection"
          >
            <span className="material-symbols-outlined text-[13px]">edit</span>
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              (props.data as any)?.onDeleteEdge?.(props.id);
            }}
            className="pointer-events-auto hidden h-7 w-7 items-center justify-center rounded-[8px] border border-[#e9eae6] bg-white text-[12px] text-red-500 shadow-sm hover:bg-red-50 sm:flex"
            title="Delete connection"
          >
            <span className="material-symbols-outlined text-[13px]">delete</span>
          </button>
        </div>
      </foreignObject>
    </>
  );
}

const nodeTypes = { workflowNode: WorkflowNodeCard };
const edgeTypes = { workflowEdge: WorkflowEdgeButton };

export default function Workflows({ onNavigate: _onNavigate, focusWorkflowId, initialView, createNewOnMount }: WorkflowsProps) {
  const onNavigate = _onNavigate;
  const [view, setView] = useState<WorkflowView>(initialView ?? 'list');
  const [activeTab, setActiveTab] = useState<WorkflowTab>('builder');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [librarySection, setLibrarySection] = useState<WorkflowLibrarySection>('workflows');
  const [query, setQuery] = useState('');
  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNode[]>([]);
  const [workflowEdges, setWorkflowEdges] = useState<WorkflowEdge[]>([]);
  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [flowEdges, setFlowEdges, onFlowEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<any | null>(null);
  const [validation, setValidation] = useState<any | null>(null);
  const [stepResult, setStepResult] = useState<any | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [runResult, setRunResult] = useState<any | null>(null);
  const [addPanel, setAddPanel] = useState<AddPanelMode>(null);
  const [addPanelView, setAddPanelView] = useState<'categories' | 'category'>('categories');
  const [addSearch, setAddSearch] = useState('');
  const [addCategory, setAddCategory] = useState<string>('AI Agent');
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [editorNodeId, setEditorNodeId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'parameters' | 'settings'>('parameters');
  const [actionDialog, setActionDialog] = useState<WorkflowActionDialogState | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingCardAction, setPendingCardAction] = useState<string | null>(null);
  const [variableModalOpen, setVariableModalOpen] = useState(false);
  const [editingVariable, setEditingVariable] = useState<WorkflowVariableRecord | null>(null);
  const [dataTableModalOpen, setDataTableModalOpen] = useState(false);
  const [selectedDataTableId, setSelectedDataTableId] = useState<string | null>(null);

  const { data: apiWorkflows, loading, error } = useApi(() => workflowsApi.list(), [], []);
  const { data: catalogPayload } = useApi(() => workflowsApi.catalog(), [], null);
  const { data: agentCatalogData } = useApi(() => workflowsApi.agentCatalog(), [], []);
  const { data: connectorsPayload } = useApi(() => connectorsApi.list(), [], []);
  const { data: recentRunsPayload } = useApi(() => workflowsApi.recentRuns(), [], []);
  const { data: workspaceContext, refetch: refetchWorkspaceContext } = useApi(() => workspacesApi.currentContext(), [], null);
  const createWorkflow = useMutation((payload: Record<string, any>) => workflowsApi.create(payload));
  const updateWorkspaceSettings = useMutation((payload: { id: string; settings: Record<string, any> }) => workspacesApi.updateSettings(payload.id, payload.settings));
  const updateWorkflow = useMutation((payload: { id: string; body: Record<string, any> }) => workflowsApi.update(payload.id, payload.body));
  const validateWorkflow = useMutation((payload: { id: string; body: Record<string, any> }) => workflowsApi.validate(payload.id, payload.body));
  const publishWorkflow = useMutation((id: string) => workflowsApi.publish(id));
  const dryRunWorkflow = useMutation((payload: { id: string; body: Record<string, any> }) => workflowsApi.dryRun(payload.id, payload.body));
  const stepRunWorkflow = useMutation((payload: { id: string; body: Record<string, any> }) => workflowsApi.stepRun(payload.id, payload.body));
  const runWorkflow = useMutation((id: string) => workflowsApi.run(id));
  const rollbackWorkflow = useMutation((id: string) => workflowsApi.rollback(id));
  const archiveWorkflow = useMutation((id: string) => workflowsApi.archive(id));
  const retryWorkflowRun = useMutation((runId: string) => workflowsApi.retryRun(runId));
  const resumeWorkflowRun = useMutation((runId: string) => workflowsApi.resumeRun(runId));
  const cancelWorkflowRun = useMutation((runId: string) => workflowsApi.cancelRun(runId));
  const triggerWorkflowEvent = useMutation((payload: Record<string, any>) => workflowsApi.triggerEvent(payload));
  const loadWorkflowRun = useMutation((runId: string) => workflowsApi.getRun(runId));

  const workflows = useMemo<Workflow[]>(() => Array.isArray(apiWorkflows) ? apiWorkflows.map(mapWorkflow) : [], [apiWorkflows]);
  const catalog: NodeSpec[] = useMemo(() => {
    if (!Array.isArray(catalogPayload?.nodes)) return FALLBACK_CATALOG;
    return catalogPayload.nodes.map((node: NodeSpec) => ({ ...node, category: categoryForSpec(node) }));
  }, [catalogPayload]);
  const selectedNode = useMemo(() => workflowNodes.find((node) => node.id === selectedNodeId) ?? null, [workflowNodes, selectedNodeId]);
  const editorNode = useMemo(() => workflowNodes.find((node) => node.id === editorNodeId) ?? null, [workflowNodes, editorNodeId]);
  const latestSteps = useMemo(() => (stepResult ? [stepResult] : runResult?.steps ?? dryRun?.steps ?? []), [stepResult, runResult?.steps, dryRun?.steps]);
  const diagnostics: WorkflowDiagnostic[] = useMemo(() => validation?.diagnostics ?? dryRun?.validation?.diagnostics ?? stepResult?.diagnostics ?? [], [validation?.diagnostics, dryRun?.validation?.diagnostics, stepResult?.diagnostics]);
  const connectors = useMemo(() => (Array.isArray(connectorsPayload) ? connectorsPayload : []), [connectorsPayload]);
  const recentRuns = useMemo(() => (Array.isArray(recentRunsPayload) ? recentRunsPayload : []), [recentRunsPayload]);
  const variableReferences = useMemo(() => extractWorkflowVariableReferences(workflows), [workflows]);
  const tableReferences = useMemo(() => extractWorkflowTableReferences(workflows), [workflows]);
  const workspaceWorkflowSettings = useMemo(() => parseWorkspaceWorkflowSettings(workspaceContext?.settings), [workspaceContext?.settings]);
  const storedVariables = workspaceWorkflowSettings.variables;
  const storedDataTables = workspaceWorkflowSettings.dataTables;

  const filtered = useMemo(() => workflows.filter((workflow) => {
    const haystack = `${workflow.name} ${workflow.description} ${workflow.category} ${workflow.status}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  }), [workflows, query]);

  // ── Live run updates via SSE ────────────────────────────────────────────────
  // Listen for workflow:run:started / workflow:run:updated events and refresh
  // the runResult badge in the active workflow panel without a full page reload.
  useEffect(() => {
    const es = new EventSource('/api/sse');
    const onRunUpdated = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data?.runId && data?.status) {
          setRunResult((prev: any) => {
            if (!prev || prev.id !== data.runId) return prev;
            return { ...prev, status: data.status, error: data.error ?? prev.error };
          });
        }
      } catch { /* ignore malformed events */ }
    };
    es.addEventListener('workflow:run:updated', onRunUpdated);
    es.addEventListener('workflow:run:started', onRunUpdated);
    return () => es.close();
  }, []);

  const openAddPanel = useCallback((mode: AddPanelMode = {}) => {
    setAddPanel(mode);
    setAddPanelView('categories');
    setAddSearch('');
  }, []);

  const openAddCategory = useCallback((category: string) => {
    setAddCategory(category);
    setAddPanelView('category');
  }, []);

  const handleAddNode = useCallback((nodeId: string, handle?: string) => {
    setSelectedNodeId(nodeId);
    openAddPanel({ sourceNodeId: nodeId, sourceHandle: handle ?? 'main' });
  }, [openAddPanel]);

  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setContextMenu(null);
  }, []);

  const handleEditNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setEditorNodeId(nodeId);
    setContextMenu(null);
  }, []);

  const handleExecuteNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setEditorNodeId(nodeId);
    void executeNodeStep(nodeId);
  }, []);

  const handleToggleNode = useCallback((nodeId: string) => {
    setWorkflowNodes((items) => items.map((node) => node.id === nodeId ? { ...node, disabled: !node.disabled } : node));
  }, []);

  const handleDuplicateNode = useCallback((nodeId: string) => {
    setWorkflowNodes((items) => {
      const node = items.find((item) => item.id === nodeId);
      if (!node) return items;
      const duplicate = {
        ...node,
        id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        label: `${node.label} copy`,
        position: { x: node.position.x + 80, y: node.position.y + 80 },
      };
      setSelectedNodeId(duplicate.id);
      setEditorNodeId(duplicate.id);
      setContextMenu(null);
      return [...items, duplicate];
    });
  }, []);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setWorkflowNodes((items) => items.filter((node) => node.id !== nodeId));
    setWorkflowEdges((items) => items.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNodeId((current) => current === nodeId ? null : current);
    setEditorNodeId((current) => current === nodeId ? null : current);
    setContextMenu(null);
  }, []);

  const handleOpenNodeMenu = useCallback((nodeId: string, point: { x: number; y: number }) => {
    setContextMenu({ nodeId, ...point });
  }, []);

  const nodeHandlers = useMemo(() => ({
    onSelect: handleSelectNode,
    onAdd: handleAddNode,
    onEdit: handleEditNode,
    onExecute: handleExecuteNode,
    onToggle: handleToggleNode,
    onDuplicate: handleDuplicateNode,
    onDelete: handleDeleteNode,
    onMenu: handleOpenNodeMenu,
  }), [handleSelectNode, handleAddNode, handleEditNode, handleExecuteNode, handleToggleNode, handleDuplicateNode, handleDeleteNode, handleOpenNodeMenu]);

  useEffect(() => {
    const nextNodes = toFlowNodes(workflowNodes, catalog, selectedNodeId, latestSteps, diagnostics, nodeHandlers);
    setFlowNodes((current) => {
      if (current.length === nextNodes.length && current.every((node, index) => isSameFlowNode(node, nextNodes[index] as Node<FlowNodeData>))) {
        return current;
      }
      return nextNodes;
    });
  }, [workflowNodes, catalog, selectedNodeId, latestSteps, diagnostics, nodeHandlers]);

  useEffect(() => {
    const nextEdges = toFlowEdges(workflowEdges, {
      onAddEdge: (edgeId) => openAddPanel({ edgeId }),
      onDeleteEdge: (edgeId) => deleteEdge(edgeId),
      onRenameEdge: (edgeId) => renameEdge(edgeId),
    });
    setFlowEdges((current) => {
      if (current.length === nextEdges.length && current.every((edge, index) => isSameFlowEdge(edge, nextEdges[index] as Edge))) {
        return current;
      }
      return nextEdges;
    });
  }, [workflowEdges, openAddPanel]);

  useEffect(() => {
    if (addPanel) {
      setAddPanelView('categories');
      setAddSearch('');
    } else {
      setAddPanelView('categories');
      setAddSearch('');
    }
  }, [addPanel]);

  useEffect(() => {
    if (!focusWorkflowId || workflows.length === 0) return;
    const target = workflows.find((workflow) => workflow.id === focusWorkflowId);
    if (target) void openWorkflow(target);
  }, [focusWorkflowId, workflows.length]);

  // When mounted with createNewOnMount=true, immediately seed a new workflow
  // draft and open the builder. Gated by a ref so it only fires once per mount.
  const createNewFiredRef = useRef(false);
  useEffect(() => {
    if (!createNewOnMount || createNewFiredRef.current) return;
    createNewFiredRef.current = true;
    void createFromTemplate(TEMPLATES[0]);
  }, []);

  // Dispatch deferred card action after the workflow is loaded into editor state
  useEffect(() => {
    if (!pendingCardAction || !selectedWorkflow) return;
    const action = pendingCardAction;
    setPendingCardAction(null);
    switch (action) {
      case 'edit_description': void editWorkflowDescription(); break;
      case 'rename':           void renameCurrentWorkflow();   break;
      case 'move':             void moveCurrentWorkflow();     break;
      case 'duplicate':        void duplicateCurrentWorkflow(); break;
      case 'download':         downloadCurrentWorkflow();      break;
      case 'share':            void shareCurrentWorkflow();    break;
      case 'push_git':         void pushWorkflowToGit();       break;
      case 'import_url':       void importWorkflowFromUrl();   break;
      case 'import_file':      importWorkflowFromFile();       break;
      case 'archive':          void archiveCurrentWorkflow();  break;
      case 'validate':         void validateCurrentWorkflow(); break;
      case 'tidy':             tidyWorkflow();                 break;
      case 'dry_run':          void runDryRun();               break;
      case 'run':              void executeManualRun();        break;
      case 'trigger':          void triggerCurrentEvent();     break;
      case 'retry':            void retryLatestRun();          break;
      case 'resume':           void resumeLatestRun();         break;
      case 'cancel':           void cancelLatestRun();         break;
      case 'rollback':         void rollback();                break;
      default: break;
    }
  }, [pendingCardAction, selectedWorkflow?.id]);

  function syncFromFlow(nextNodes = flowNodes, nextEdges = flowEdges) {
    setWorkflowNodes(fromFlowNodes(nextNodes, workflowNodes));
    setWorkflowEdges(fromFlowEdges(nextEdges));
  }

function loadBuilderState(workflow: Workflow) {
    const version = workflow.currentVersion ?? {};
    const loadedNodes = normalizeNodes(version.nodes ?? workflow.currentVersion?.nodes ?? []);
    const nextNodes = loadedNodes.length ? loadedNodes : [makeNode({ type: 'trigger', key: 'manual.run', label: 'Manual run' }, 0)];
    const nextEdges = normalizeEdges(version.edges ?? workflow.currentVersion?.edges ?? [], nextNodes);
    setWorkflowNodes(nextNodes);
    setWorkflowEdges(nextEdges);
    setSelectedNodeId(nextNodes[0]?.id ?? null);
    setEditorNodeId(null);
    setDryRun(null);
    setRunResult(null);
    setMessage(null);
  }

  async function openWorkflow(workflow: Workflow) {
    const detail = await workflowsApi.get(workflow.id).catch(() => null);
    const hydrated = detail ? mapWorkflow(detail) : workflow;
    setSelectedWorkflow(hydrated);
    loadBuilderState(hydrated);
    setView('builder');
    setActiveTab('builder');
    onNavigate?.({ page: 'workflows', entityType: 'workflow', entityId: hydrated.id, section: 'builder', sourceContext: 'workflow_list' });
  }

  async function handleCardAction(workflow: Workflow, action: string) {
    // Open the workflow in the editor, then dispatch the deferred action via effect
    await openWorkflow(workflow);
    setPendingCardAction(action);
  }

  async function createFromTemplate(template = TEMPLATES[0]) {
    const nextNodes = template.nodes.map((node, index) => makeNode(node as any, index));
    const nextEdges = templateEdges(template, nextNodes);
    const category = normalizeWorkflowCategory(template.category) || deriveWorkflowCategory(nextNodes, { type: nextNodes[0]?.key ?? 'manual.run' }, template.description);
    const created = await createWorkflow.mutate({
      name: template.label,
      description: template.description,
      category,
      trigger: buildWorkflowTrigger({ type: nextNodes[0]?.key ?? 'manual.run' }, category, nextNodes[0]?.key),
      nodes: nextNodes,
      edges: nextEdges,
    });
    if (created?.id) {
      const workflow = mapWorkflow(created);
      setTemplateOpen(false);
      setSelectedWorkflow(workflow);
      setWorkflowNodes(nextNodes);
      setWorkflowEdges(nextEdges);
      setSelectedNodeId(nextNodes[0]?.id ?? null);
      setView('builder');
      setActiveTab('builder');
      setMessage(`Created workflow from ${template.label}.`);
      onNavigate?.({ page: 'workflows', entityType: 'workflow', entityId: workflow.id, section: 'builder', sourceContext: 'workflow_template' });
    }
  }

  function addNode(spec: NodeSpec, mode: AddPanelMode = addPanel) {
    const sourceNode = mode?.sourceNodeId ? workflowNodes.find((node) => node.id === mode.sourceNodeId) : selectedNode ?? workflowNodes.at(-1);
    const sourcePosition = sourceNode?.position ?? { x: 120, y: 220 };
    const node = makeNode({
      ...spec,
      config: spec.defaultConfig ?? {},
      position: { x: sourcePosition.x + 340, y: sourcePosition.y + (mode?.sourceHandle === 'false' ? 160 : 0) },
    }, workflowNodes.length);
    let nextEdges = workflowEdges;
    if (mode?.edgeId) {
      const edge = workflowEdges.find((item) => item.id === mode.edgeId);
      if (edge) {
        nextEdges = [
          ...workflowEdges.filter((item) => item.id !== edge.id),
          { id: `edge_${edge.source}_${node.id}_${Date.now()}`, source: edge.source, target: node.id, label: edge.label ?? 'next', sourceHandle: edge.sourceHandle ?? 'main' },
          { id: `edge_${node.id}_${edge.target}_${Date.now()}`, source: node.id, target: edge.target, label: 'next', sourceHandle: 'main' },
        ];
      }
    } else if (sourceNode) {
      nextEdges = [
        ...workflowEdges,
          {
            id: `edge_${sourceNode.id}_${node.id}_${Date.now()}`,
            source: sourceNode.id,
            target: node.id,
            label: mode?.sourceHandle === 'false' ? 'false' : mode?.sourceHandle === 'true' ? 'true' : mode?.sourceHandle === 'error' ? 'failure' : 'next',
            sourceHandle: mode?.sourceHandle ?? 'main',
          },
      ];
    }
    setWorkflowNodes((items) => [...items, node]);
    setWorkflowEdges(nextEdges);
    setSelectedNodeId(node.id);
    setAddPanel(null);
    setAddSearch('');
  }

  function updateNode(nodeId: string, patch: Partial<WorkflowNode>) {
    setWorkflowNodes((items) => items.map((node) => node.id === nodeId ? { ...node, ...patch } : node));
  }

  function updateConfig(nodeId: string, key: string, value: string) {
    const node = workflowNodes.find((item) => item.id === nodeId);
    if (!node) return;
    updateNode(nodeId, { config: { ...node.config, [key]: value } });
  }

  function updateUi(nodeId: string, patch: WorkflowNode['ui']) {
    const node = workflowNodes.find((item) => item.id === nodeId);
    if (!node) return;
    updateNode(nodeId, { ui: { ...(node.ui ?? {}), ...(patch ?? {}) } });
  }

  function updateRetryPolicy(nodeId: string, patch: NonNullable<WorkflowNode['retryPolicy']>) {
    const node = workflowNodes.find((item) => item.id === nodeId);
    if (!node) return;
    updateNode(nodeId, { retryPolicy: { ...(node.retryPolicy ?? {}), ...patch } });
  }

  function currentPayload() {
    const nodes = flowNodes.length === workflowNodes.length ? fromFlowNodes(flowNodes, workflowNodes) : workflowNodes;
    const edges = flowEdges.length ? fromFlowEdges(flowEdges) : workflowEdges;
    return {
      nodes,
      edges,
      triggerPayload: { manual: true, source: 'builder' },
    };
  }

  async function validateCurrentWorkflow() {
    if (!selectedWorkflow) return null;
    syncFromFlow();
    const result = await validateWorkflow.mutate({
      id: selectedWorkflow.id,
      body: currentPayload(),
    });
    setValidation(result);
    return result;
  }

  async function executeNodeStep(nodeId: string) {
    if (!selectedWorkflow) return;
    syncFromFlow();
    const result = await stepRunWorkflow.mutate({
      id: selectedWorkflow.id,
      body: { ...currentPayload(), nodeId },
    });
    setStepResult(result);
    setMessage(result?.status === 'blocked' ? result?.error ?? 'Step is blocked.' : `Step ${result?.label ?? nodeId} dry-run completed as ${result?.status ?? 'unknown'}.`);
  }

  function tidyWorkflow() {
    const start = workflowNodes.find((node) => node.type === 'trigger') ?? workflowNodes[0];
    if (!start) return;
    const byId = new Map(workflowNodes.map((node) => [node.id, node]));
    const levels = new Map<string, number>([[start.id, 0]]);
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift()!;
      const level = levels.get(id) ?? 0;
      workflowEdges.filter((edge) => edge.source === id).forEach((edge) => {
        if (!levels.has(edge.target)) {
          levels.set(edge.target, level + 1);
          queue.push(edge.target);
        }
      });
    }
    const buckets = new Map<number, WorkflowNode[]>();
    workflowNodes.forEach((node) => {
      const level = levels.get(node.id) ?? 0;
      buckets.set(level, [...(buckets.get(level) ?? []), node]);
    });
    const arranged = workflowNodes.map((node) => {
      const level = levels.get(node.id) ?? 0;
      const index = (buckets.get(level) ?? []).findIndex((item) => item.id === node.id);
      return { ...node, position: { x: 120 + level * 340, y: 180 + index * 170 } };
    });
    setWorkflowNodes(arranged);
    setMessage('Workflow layout tidied.');
  }

  function deleteEdge(edgeId: string) {
    setWorkflowEdges((items) => items.filter((edge) => edge.id !== edgeId));
    setFlowEdges((items) => items.filter((edge) => edge.id !== edgeId));
  }

  function renameEdge(edgeId: string) {
    const edge = workflowEdges.find((item) => item.id === edgeId);
    if (!edge) return;
    const label = window.prompt('Connection label', edge.label ?? 'next');
    if (label === null) return;
    setWorkflowEdges((items) => items.map((item) => item.id === edgeId ? { ...item, label } : item));
    setFlowEdges((items) => items.map((item) => item.id === edgeId ? { ...item, label } : item));
  }

  function buildDraftBody(overrides: Partial<Pick<Workflow, 'name' | 'description' | 'category'>> = {}) {
    const nodes = flowNodes.length ? fromFlowNodes(flowNodes, workflowNodes) : workflowNodes;
    const edges = flowEdges.length ? fromFlowEdges(flowEdges) : workflowEdges;
    const category = normalizeWorkflowCategory(
      overrides.category
      ?? selectedWorkflow?.category
      ?? deriveWorkflowCategory(nodes, selectedWorkflow?.currentVersion?.trigger ?? {}, overrides.description ?? selectedWorkflow?.description ?? ''),
    ) || 'Orchestration & data';
    return {
      name: overrides.name ?? selectedWorkflow?.name ?? 'Workflow',
      description: overrides.description ?? selectedWorkflow?.description ?? '',
      category,
      trigger: buildWorkflowTrigger(selectedWorkflow?.currentVersion?.trigger ?? {}, category, nodes[0]?.key),
      nodes,
      edges,
    };
  }

  async function persistWorkflowDraft(overrides: Partial<Pick<Workflow, 'name' | 'description' | 'category'>> = {}) {
    if (!selectedWorkflow) return null;
    const updated = await updateWorkflow.mutate({
      id: selectedWorkflow.id,
      body: buildDraftBody(overrides),
    });
    if (updated?.id) {
      const workflow = mapWorkflow(updated);
      setSelectedWorkflow(workflow);
      setWorkflowNodes(workflow.currentVersion?.nodes ?? workflowNodes);
      setWorkflowEdges(workflow.currentVersion?.edges ?? workflowEdges);
    }
    return updated;
  }

  async function saveWorkflow() {
    if (!selectedWorkflow) return;
    syncFromFlow();
    const updated = await persistWorkflowDraft();
    if (updated?.id) setMessage('Workflow draft saved.');
  }

  function downloadCurrentWorkflow() {
    if (!selectedWorkflow) return;
    const payload = {
      id: selectedWorkflow.id,
      name: selectedWorkflow.name,
      description: selectedWorkflow.description,
      category: selectedWorkflow.category,
      currentVersion: {
        nodes: workflowNodes,
        edges: workflowEdges,
      },
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedWorkflow.name.replace(/[^a-z0-9_-]+/gi, '_').toLowerCase() || 'workflow'}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMessage('Workflow exported as JSON.');
  }

  async function shareCurrentWorkflow() {
    if (!selectedWorkflow) return;
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({
      view: 'workflows',
      entityType: 'workflow',
      entityId: selectedWorkflow.id,
      section: activeTab,
      source: 'workflow_share',
    }).toString();
    await navigator.clipboard.writeText(url.toString());
    setMessage('Workflow link copied to clipboard.');
  }

  async function renameCurrentWorkflow() {
    if (!selectedWorkflow) return;
    setActionDialog({ kind: 'rename', value: selectedWorkflow.name });
  }

  async function moveCurrentWorkflow() {
    if (!selectedWorkflow) return;
    setActionDialog({ kind: 'move', value: normalizeWorkflowCategory(selectedWorkflow.category) || 'Support operations' });
  }

  async function editWorkflowDescription() {
    if (!selectedWorkflow) return;
    setActionDialog({ kind: 'description', value: selectedWorkflow.description ?? '' });
  }

  async function importWorkflowFromUrl() {
    setActionDialog({ kind: 'import_url', value: '' });
  }

  async function importWorkflowFromSource(source: string) {
    try {
      const response = await fetch(source, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();
      const imported = mapWorkflow(raw);
      const importedNodes = imported.currentVersion?.nodes ?? normalizeNodes(raw.currentVersion?.nodes ?? raw.nodes ?? []);
      const importedEdges = imported.currentVersion?.edges ?? normalizeEdges(raw.currentVersion?.edges ?? raw.edges ?? [], importedNodes);
      const category = normalizeWorkflowCategory(imported.category) || deriveWorkflowCategory(importedNodes, imported.currentVersion?.trigger ?? raw.currentVersion?.trigger ?? raw.trigger ?? {}, imported.description);
      const created = await createWorkflow.mutate({
        name: `${imported.name || 'Imported workflow'} imported`,
        description: imported.description ?? '',
        category,
        trigger: buildWorkflowTrigger(imported.currentVersion?.trigger ?? raw.currentVersion?.trigger ?? raw.trigger ?? {}, category, importedNodes[0]?.key),
        nodes: importedNodes,
        edges: importedEdges,
      });
      const persisted = created?.id ? mapWorkflow(created) : imported;
      setSelectedWorkflow(persisted);
      setWorkflowNodes(persisted.currentVersion?.nodes ?? importedNodes);
      setWorkflowEdges(persisted.currentVersion?.edges ?? importedEdges);
      setSelectedNodeId(persisted.currentVersion?.nodes?.[0]?.id ?? importedNodes[0]?.id ?? null);
      setEditorNodeId(null);
      setActiveTab('builder');
      setView('builder');
      onNavigate?.({ page: 'workflows', entityType: 'workflow', entityId: persisted.id, section: 'builder', sourceContext: 'workflow_import' });
      setMessage('Workflow imported from URL.');
    } catch (error) {
      setMessage(`Import from URL failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function importWorkflowFromFile() {
    importFileInputRef.current?.click();
  }

  async function handleWorkflowFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const imported = mapWorkflow(raw);
      const importedNodes = imported.currentVersion?.nodes ?? normalizeNodes(raw.currentVersion?.nodes ?? raw.nodes ?? []);
      const importedEdges = imported.currentVersion?.edges ?? normalizeEdges(raw.currentVersion?.edges ?? raw.edges ?? [], importedNodes);
      const category = normalizeWorkflowCategory(imported.category) || deriveWorkflowCategory(importedNodes, imported.currentVersion?.trigger ?? raw.currentVersion?.trigger ?? raw.trigger ?? {}, imported.description);
      const created = await createWorkflow.mutate({
        name: `${imported.name || 'Imported workflow'} imported`,
        description: imported.description ?? '',
        category,
        trigger: buildWorkflowTrigger(imported.currentVersion?.trigger ?? raw.currentVersion?.trigger ?? raw.trigger ?? {}, category, importedNodes[0]?.key),
        nodes: importedNodes,
        edges: importedEdges,
      });
      const persisted = created?.id ? mapWorkflow(created) : imported;
      setSelectedWorkflow(persisted);
      setWorkflowNodes(persisted.currentVersion?.nodes ?? importedNodes);
      setWorkflowEdges(persisted.currentVersion?.edges ?? importedEdges);
      setSelectedNodeId(persisted.currentVersion?.nodes?.[0]?.id ?? importedNodes[0]?.id ?? null);
      setEditorNodeId(null);
      setActiveTab('builder');
      setView('builder');
      onNavigate?.({ page: 'workflows', entityType: 'workflow', entityId: persisted.id, section: 'builder', sourceContext: 'workflow_import' });
      setMessage('Workflow imported from file.');
    } catch (error) {
      setMessage(`Import from file failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function pushWorkflowToGit() {
    if (!selectedWorkflow) return;
    const payload = {
      id: selectedWorkflow.id,
      name: selectedWorkflow.name,
      description: selectedWorkflow.description,
      category: selectedWorkflow.category,
      nodes: workflowNodes,
      edges: workflowEdges,
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setMessage('Workflow JSON copied to the clipboard for git export.');
  }

  async function archiveCurrentWorkflow() {
    if (!selectedWorkflow) return;
    setActionDialog({ kind: 'archive' });
  }

  async function duplicateCurrentWorkflow() {
    if (!selectedWorkflow) return;
    const created = await createWorkflow.mutate({
      ...buildDraftBody({
        name: `${selectedWorkflow.name} copy`,
      }),
    });
    if (created?.id) {
      const workflow = mapWorkflow(created);
      setSelectedWorkflow(workflow);
      setWorkflowNodes(workflow.currentVersion?.nodes ?? []);
      setWorkflowEdges(workflow.currentVersion?.edges ?? []);
      setSelectedNodeId(workflow.currentVersion?.nodes?.[0]?.id ?? null);
      setEditorNodeId(null);
      setView('builder');
      setActiveTab('builder');
      setMessage('Workflow duplicated.');
      onNavigate?.({ page: 'workflows', entityType: 'workflow', entityId: workflow.id, section: 'builder', sourceContext: 'workflow_duplicate' });
    }
  }

  async function runDryRun() {
    if (!selectedWorkflow) return;
    syncFromFlow();
    const result = await dryRunWorkflow.mutate({
      id: selectedWorkflow.id,
      body: currentPayload(),
    });
    setDryRun(result);
    setValidation(result?.validation ?? null);
    setStepResult(null);
    setMessage(result?.summary ?? 'Dry-run completed.');
  }

  async function publish() {
    if (!selectedWorkflow) return;
    await saveWorkflow();
    const validationResult = await validateCurrentWorkflow();
    if (validationResult && !validationResult.ok) {
      setMessage(`Publish blocked: ${validationResult.errors?.[0] ?? 'workflow validation failed'}`);
      return null;
    }
    const published = await publishWorkflow.mutate(selectedWorkflow.id);
    if (published?.id) {
      const workflow = mapWorkflow(published);
      setSelectedWorkflow(workflow);
      loadBuilderState(workflow);
      setMessage('Workflow published.');
      return workflow;
    }
    return null;
  }

  async function executeManualRun() {
    if (!selectedWorkflow) return;
    if (selectedWorkflow.currentVersion?.status !== 'published') {
      const published = await publish();
      if (!published) return;
    }
    const run = await runWorkflow.mutate(selectedWorkflow.id);
    setRunResult(run);
    setStepResult(null);
    setSelectedRunId(run?.id ?? null);
    setActiveTab('runs');
    setMessage(`Workflow run ${run?.id ?? ''} ended as ${run?.status ?? 'unknown'}.`);
  }

  async function retryLatestRun() {
    const runId = runResult?.id ?? selectedWorkflow?.recentRuns?.[0]?.id;
    if (!runId) {
      setMessage('No previous workflow run is available to retry.');
      return;
    }
    const run = await retryWorkflowRun.mutate(runId);
    setRunResult(run);
    setSelectedRunId(run?.id ?? null);
    setActiveTab('runs');
    setMessage(`Retried workflow run ${run?.id ?? ''}; status ${run?.status ?? 'unknown'}.`);
  }

  async function resumeLatestRun() {
    const runId = runResult?.id ?? selectedRunId ?? selectedWorkflow?.recentRuns?.[0]?.id;
    if (!runId) {
      setMessage('No paused workflow run is available to resume.');
      return;
    }
    const run = await resumeWorkflowRun.mutate(runId);
    setRunResult(run);
    setSelectedRunId(run?.id ?? runId);
    setActiveTab('runs');
    setMessage(`Resumed workflow run ${run?.id ?? runId}; status ${run?.status ?? 'unknown'}.`);
  }

  async function cancelLatestRun() {
    const runId = runResult?.id ?? selectedRunId ?? selectedWorkflow?.recentRuns?.[0]?.id;
    if (!runId) {
      setMessage('No workflow run is available to cancel.');
      return;
    }
    const run = await cancelWorkflowRun.mutate(runId);
    setRunResult(run);
    setSelectedRunId(run?.id ?? runId);
    setActiveTab('runs');
    setMessage(`Cancelled workflow run ${run?.id ?? runId}.`);
  }

  async function triggerCurrentEvent() {
    const triggerNode = workflowNodes.find((node) => node.type === 'trigger') ?? workflowNodes[0];
    if (!triggerNode) return;
    if (selectedWorkflow?.currentVersion?.status !== 'published') {
      const published = await publish();
      if (!published) return;
    }
    const result = await triggerWorkflowEvent.mutate({
      eventType: triggerNode.key,
      payload: { workflowId: selectedWorkflow?.id, manual: true, ...(triggerNode.config ?? {}) },
    });
    const latestRun = result?.runs?.[0] ?? null;
    if (latestRun) setRunResult(latestRun);
    if (latestRun?.id) setSelectedRunId(latestRun.id);
    setActiveTab('runs');
    setMessage(`Triggered ${result?.matched ?? 0} workflow(s) for ${triggerNode.key}.`);
  }

  async function viewRunSteps(runId: string) {
    const run = await loadWorkflowRun.mutate(runId);
    setRunResult(run);
    setSelectedRunId(run?.id ?? runId);
    setActiveTab('runs');
    setMessage(`Loaded run ${run?.id ?? runId}.`);
  }

  async function rollback() {
    if (!selectedWorkflow) return;
    if ((selectedWorkflow.versions?.length ?? 0) < 2) {
      setMessage('There is no previous version available to roll back to.');
      return;
    }
    const rolledBack = await rollbackWorkflow.mutate(selectedWorkflow.id);
    if (rolledBack?.id) {
      setSelectedWorkflow(mapWorkflow(rolledBack));
      loadBuilderState(mapWorkflow(rolledBack));
      setMessage('Workflow rolled back to the previous version.');
    }
  }

  async function persistWorkspaceWorkflowLibrary(patch: { variables?: WorkflowVariableRecord[]; dataTables?: WorkflowDataTableRecord[] }) {
    if (!workspaceContext?.id) {
      setMessage('Workspace context is not available yet.');
      return false;
    }
    const settings = mergeWorkspaceWorkflowSettings(workspaceContext.settings, patch);
    await updateWorkspaceSettings.mutate({ id: workspaceContext.id, settings });
    await refetchWorkspaceContext();
    return true;
  }

  async function handleSaveVariable(input: { key: string; value: string; scope: WorkflowVariableScope }) {
    const now = new Date().toISOString();
    const nextVariable: WorkflowVariableRecord = editingVariable
      ? { ...editingVariable, ...input, updatedAt: now }
      : { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now };
    const variables = editingVariable
      ? storedVariables.map((item) => (item.id === editingVariable.id ? nextVariable : item))
      : [...storedVariables, nextVariable];
    const ok = await persistWorkspaceWorkflowLibrary({ variables });
    if (!ok) return;
    setVariableModalOpen(false);
    setEditingVariable(null);
    setMessage(editingVariable ? `Variable ${input.key} updated.` : `Variable ${input.key} created.`);
  }

  async function handleCreateDataTable(input: { name: string; source: 'scratch' | 'csv'; csvText?: string }) {
    const now = new Date().toISOString();
    let columns: WorkflowDataTableColumn[] = [];
    let rows: WorkflowDataTableRow[] = [];

    if (input.source === 'csv' && input.csvText) {
      const parsed = parseCsvText(input.csvText);
      columns = parsed.headers.map((header) => ({ id: crypto.randomUUID(), name: header, type: 'string' as WorkflowColumnType }));
      rows = parsed.rows.map((cells, index) => {
        const values: Record<string, string> = {};
        parsed.headers.forEach((header, headerIndex) => {
          values[header] = cells[headerIndex] ?? '';
        });
        return {
          id: String(index + 1),
          createdAt: now,
          updatedAt: now,
          values,
        };
      });
    }

    const table: WorkflowDataTableRecord = {
      id: crypto.randomUUID(),
      name: input.name,
      source: input.source,
      columns,
      rows,
      createdAt: now,
      updatedAt: now,
    };

    const ok = await persistWorkspaceWorkflowLibrary({ dataTables: [...storedDataTables, table] });
    if (!ok) return;
    setSelectedDataTableId(table.id);
    setDataTableModalOpen(false);
    setMessage(`Data table ${table.name} created.`);
  }

  async function handleUpdateDataTable(table: WorkflowDataTableRecord) {
    const ok = await persistWorkspaceWorkflowLibrary({
      dataTables: storedDataTables.map((item) => (item.id === table.id ? table : item)),
    });
    if (!ok) return;
    setMessage(`Data table ${table.name} updated.`);
  }

  const selectedDataTable = useMemo(
    () => storedDataTables.find((table) => table.id === selectedDataTableId) ?? null,
    [selectedDataTableId, storedDataTables],
  );

  async function confirmWorkflowActionDialog() {
    if (!selectedWorkflow || !actionDialog) return;

    if (actionDialog.kind === 'rename') {
      const next = actionDialog.value.trim();
      if (!next || next === selectedWorkflow.name) {
        setActionDialog(null);
        return;
      }
      await persistWorkflowDraft({ name: next });
      setMessage('Workflow renamed.');
      setActionDialog(null);
      return;
    }

    if (actionDialog.kind === 'description') {
      const next = actionDialog.value.trim();
      await persistWorkflowDraft({ description: next });
      setMessage('Workflow description updated.');
      setActionDialog(null);
      return;
    }

    if (actionDialog.kind === 'move') {
      const next = normalizeWorkflowCategory(actionDialog.value) || 'Support operations';
      await persistWorkflowDraft({ category: next });
      setMessage(`Workflow moved to ${next}.`);
      setActionDialog(null);
      return;
    }

    if (actionDialog.kind === 'archive') {
      const archived = await archiveWorkflow.mutate(selectedWorkflow.id);
      if (archived?.id) {
        setSelectedWorkflow(mapWorkflow(archived));
        setMessage('Workflow archived.');
      }
      setActionDialog(null);
      return;
    }

    if (actionDialog.kind === 'import_url') {
      const source = actionDialog.value.trim();
      if (!source) {
        setActionDialog(null);
        return;
      }
      setActionDialog(null);
      await importWorkflowFromSource(source);
    }
  }

  function onConnect(connection: Connection) {
    const edgeId = `edge_${connection.source}_${connection.target}_${Date.now()}`;
    setFlowEdges((items) => addEdge({
      ...connection,
      id: edgeId,
      label: connection.sourceHandle === 'false' ? 'false' : connection.sourceHandle === 'true' ? 'true' : 'next',
      type: 'workflowEdge',
      markerEnd: { type: MarkerType.ArrowClosed },
    }, items));
    setWorkflowEdges((items) => [
      ...items,
      {
        id: edgeId,
        source: connection.source!,
        target: connection.target!,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        label: connection.sourceHandle === 'false' ? 'false' : connection.sourceHandle === 'true' ? 'true' : 'next',
      },
    ]);
  }

  function onNodeDragStop(_: any, node: Node<FlowNodeData>) {
    setWorkflowNodes((items) => items.map((item) => item.id === node.id ? { ...item, position: node.position } : item));
  }

  const addCategories = useMemo(
    () => getCategoryOverview(catalog, Array.isArray(agentCatalogData) ? agentCatalogData.length : 0),
    [catalog, agentCatalogData],
  );
  const addSections = useMemo(() => getAddPanelSections(addCategory, catalog, addSearch), [catalog, addCategory, addSearch]);

  if (loading && workflows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[#646462] bg-white">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-[#e9eae6] border-t-[#1a1a1a] rounded-full animate-spin" />
          <span className="text-[13px]">Cargando flujos de trabajo…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-[12px] border border-[#f1f1ee] dark:border-[#1a1a1a] shadow-card">
        <AnimatePresence mode="wait">
          {view === 'list' ? (
            <WorkflowList
              error={error || createWorkflow.error ? String(error || createWorkflow.error) : null}
              section={librarySection}
              setSection={setLibrarySection}
              query={query}
              setQuery={setQuery}
              workflows={filtered}
              connectors={connectors}
              recentRuns={recentRuns}
              variableReferences={variableReferences}
              tableReferences={tableReferences}
              storedVariables={storedVariables}
              storedDataTables={storedDataTables}
              selectedDataTable={selectedDataTable}
              onOpen={openWorkflow}
              onCardAction={handleCardAction}
              onTemplate={() => setTemplateOpen(true)}
              onCreate={() => createFromTemplate(TEMPLATES[0])}
              onNavigate={onNavigate}
              onNewVariable={() => {
                setEditingVariable(null);
                setVariableModalOpen(true);
              }}
              onEditVariable={(variable) => {
                setEditingVariable(variable);
                setVariableModalOpen(true);
              }}
              onCreateDataTable={() => setDataTableModalOpen(true)}
              onOpenDataTable={(tableId) => setSelectedDataTableId(tableId)}
              onCloseDataTable={() => setSelectedDataTableId(null)}
              onSaveDataTable={handleUpdateDataTable}
            />
          ) : (
            <motion.div key="builder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
              <WorkflowEditorTopbar
                workflow={selectedWorkflow}
                setWorkflow={setSelectedWorkflow}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onBack={() => {
                  setView('list');
                  onNavigate?.({ page: 'workflows', entityType: 'workflow', entityId: null, section: 'library', sourceContext: 'workflow_list' });
                }}
                onEditDescription={editWorkflowDescription}
                onDuplicate={duplicateCurrentWorkflow}
                onDownload={downloadCurrentWorkflow}
                onShare={shareCurrentWorkflow}
                onMove={moveCurrentWorkflow}
                onRename={renameCurrentWorkflow}
                onImportFromUrl={importWorkflowFromUrl}
                onImportFromFile={importWorkflowFromFile}
                onPushToGit={pushWorkflowToGit}
                onArchive={archiveCurrentWorkflow}
                onValidate={validateCurrentWorkflow}
                onTidy={tidyWorkflow}
                onDryRun={runDryRun}
                onRun={executeManualRun}
                onTrigger={triggerCurrentEvent}
                onRetry={retryLatestRun}
                onResume={resumeLatestRun}
                onCancel={cancelLatestRun}
                onRollback={rollback}
                onSave={saveWorkflow}
                onPublish={publish}
              />

              {(message || updateWorkflow.error || validateWorkflow.error || publishWorkflow.error || dryRunWorkflow.error || stepRunWorkflow.error || runWorkflow.error || rollbackWorkflow.error || retryWorkflowRun.error || resumeWorkflowRun.error || cancelWorkflowRun.error || triggerWorkflowEvent.error || loadWorkflowRun.error) && (
                <div className="border-b border-[#f1f1ee] px-5 py-2 text-[12px] text-[#646462] dark:border-[#1a1a1a] dark:text-[#a4a4a2]">
                  {updateWorkflow.error || validateWorkflow.error || publishWorkflow.error || dryRunWorkflow.error || stepRunWorkflow.error || runWorkflow.error || rollbackWorkflow.error || retryWorkflowRun.error || resumeWorkflowRun.error || cancelWorkflowRun.error || triggerWorkflowEvent.error || loadWorkflowRun.error || message}
                </div>
              )}

              {activeTab === 'overview' && <WorkflowOverview workflow={selectedWorkflow} nodes={workflowNodes} edges={workflowEdges} runResult={runResult} dryRun={dryRun} validation={validation} setWorkflow={setSelectedWorkflow} />}

              {activeTab === 'builder' && (
                <ReactFlowProvider>
                  <div className="relative flex-1 overflow-hidden bg-[#fbfbfb]">
                    <ReactFlow
                      nodes={flowNodes}
                      edges={flowEdges}
                      nodeTypes={nodeTypes}
                      edgeTypes={edgeTypes}
                      onNodesChange={onFlowNodesChange}
                      onEdgesChange={onFlowEdgesChange}
                      onConnect={onConnect}
                      onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                      onNodeDoubleClick={(_, node) => setSelectedNodeId(node.id)}
                      onNodeDragStop={onNodeDragStop}
                      onEdgeClick={(_, edge) => setAddPanel({ edgeId: edge.id })}
                      fitView
                      fitViewOptions={{ padding: 0.25 }}
                      minZoom={0.25}
                      maxZoom={1.6}
                      className="workflow-react-flow"
                    >
                      <Background gap={18} size={1} color="#d7d7d7" />
                      <MiniMap pannable zoomable nodeStrokeWidth={3} className="!rounded-[12px] !border !border-[#e9eae6] !bg-white" />
                      <Controls position="bottom-left" className="!rounded-[12px] !border !border-[#e9eae6] !bg-white !shadow-sm" />
                      <Panel position="top-center">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[#bbf7d0] bg-[#dcfce7] px-3 py-1.5 text-[12px] text-[#15803d] shadow-sm">
                          <span className="font-semibold">Workflow editor ready</span>
                          <span className="text-[#15803d]/80">Use + on any node or line to add the next operation.</span>
                        </div>
                      </Panel>
                      <Panel position="bottom-center">
                        <button onClick={executeManualRun} className="h-8 px-4 rounded-full bg-[#b91c1c] text-white text-[13px] font-semibold hover:bg-[#991b1b] shadow-sm">
                          Open execution
                        </button>
                      </Panel>
                    </ReactFlow>

                    <button onClick={() => openAddPanel({})} className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#e9eae6] bg-white text-[20px] shadow-sm hover:bg-[#f8f8f7]">+</button>

                    {addPanel && (
                      <WorkflowAddNodePanel
                        screen={addPanelView}
                        activeCategory={addCategory}
                        categories={addCategories}
                        sections={addSections}
                        onOpenCategory={openAddCategory}
                        onBack={() => setAddPanelView('categories')}
                        search={addSearch}
                        setSearch={setAddSearch}
                        onClose={() => setAddPanel(null)}
                        onSelect={(spec) => addNode(spec)}
                        agentCatalog={Array.isArray(agentCatalogData) ? agentCatalogData : []}
                      />
                    )}

                    {contextMenu && (
                      <WorkflowContextMenu
                        contextMenu={contextMenu}
                        node={workflowNodes.find((node) => node.id === contextMenu.nodeId)}
                        onClose={() => setContextMenu(null)}
                        onEdit={(nodeId) => {
                          setEditorNodeId(nodeId);
                          setContextMenu(null);
                        }}
                        onExecute={(nodeId) => nodeHandlers.onExecute(nodeId)}
                        onToggle={handleToggleNode}
                        onDuplicate={handleDuplicateNode}
                        onDelete={handleDeleteNode}
                      />
                    )}

                  </div>
                </ReactFlowProvider>
              )}

              {activeTab === 'runs' && <WorkflowRuns runResult={runResult} dryRun={dryRun} selectedWorkflow={selectedWorkflow} onRetry={retryLatestRun} onResume={resumeLatestRun} onCancel={cancelLatestRun} onViewSteps={viewRunSteps} />}
              {activeTab === 'evaluations' && <WorkflowEvaluations workflow={selectedWorkflow} />}
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={importFileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleWorkflowFileImport}
        />
        <WorkflowActionDialog
          open={Boolean(actionDialog)}
          state={actionDialog}
          workflow={selectedWorkflow}
          onClose={() => setActionDialog(null)}
          onChange={(value) => setActionDialog((current) => current && 'value' in current ? { ...current, value } as WorkflowActionDialogState : current)}
          onConfirm={() => void confirmWorkflowActionDialog()}
          loading={archiveWorkflow.loading}
        />
        <WorkflowVariableModal
          open={variableModalOpen}
          variable={editingVariable}
          onClose={() => {
            setVariableModalOpen(false);
            setEditingVariable(null);
          }}
          onSave={handleSaveVariable}
        />
        <WorkflowDataTableCreateModal
          open={dataTableModalOpen}
          onClose={() => setDataTableModalOpen(false)}
          onCreate={handleCreateDataTable}
        />
        <TemplateModal open={templateOpen} onClose={() => setTemplateOpen(false)} onCreate={createFromTemplate} />
        {editorNode && (
          <WorkflowNodeEditorModal
            node={editorNode}
            spec={catalog.find((spec) => spec.key === editorNode.key)}
            mode={editorMode}
            setMode={setEditorMode}
            latestStep={latestSteps.find((step: any) => step.node_id === editorNode.id || step.nodeId === editorNode.id)}
            connectors={connectors}
            onClose={() => setEditorNodeId(null)}
            onExecute={() => handleExecuteNode(editorNode.id)}
            onConfig={(key, value) => updateConfig(editorNode.id, key, value)}
            onUi={(patch) => updateUi(editorNode.id, patch)}
            onCredentials={(value) => updateNode(editorNode.id, { credentialsRef: value, config: { ...editorNode.config, connector: value, connector_id: value } })}
            onRetryPolicy={(patch) => updateRetryPolicy(editorNode.id, patch)}
            onToggle={() => handleToggleNode(editorNode.id)}
          />
        )}
      </div>
    </div>
  );
}

// ── Per-card dropdown menu items ──────────────────────────────────────────
const CARD_MANAGE_ITEMS: Array<{ action: string; label: string; icon: string; danger?: boolean }> = [
  { action: 'edit_description', label: 'Edit description', icon: 'description' },
  { action: 'rename',           label: 'Rename',           icon: 'drive_file_rename_outline' },
  { action: 'move',             label: 'Move to category', icon: 'folder_open' },
  { action: 'duplicate',        label: 'Duplicate',        icon: 'content_copy' },
  { action: 'download',         label: 'Download JSON',    icon: 'download' },
  { action: 'share',            label: 'Copy link',        icon: 'link' },
  { action: 'push_git',         label: 'Copy JSON for Git', icon: 'commit' },
  { action: 'import_url',       label: 'Import from URL',  icon: 'cloud_download' },
  { action: 'import_file',      label: 'Import from file', icon: 'upload_file' },
  { action: 'archive',          label: 'Archive',          icon: 'archive', danger: true },
];

const WORKFLOW_LIBRARY_SECTIONS: Array<{ key: WorkflowLibrarySection; label: string }> = [
  { key: 'workflows', label: 'Workflows' },
  { key: 'executions', label: 'Executions' },
  { key: 'variables', label: 'Variables' },
  { key: 'data_tables', label: 'Data tables' },
];

const WORKFLOW_VARIABLE_SCOPE_OPTIONS: Array<{ value: WorkflowVariableScope; label: string }> = [
  { value: 'workspace', label: 'Workspace' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'secure', label: 'Secure' },
];

const WORKFLOW_COLUMN_TYPE_OPTIONS: Array<{ value: WorkflowColumnType; label: string; icon: string }> = [
  { value: 'string', label: 'string', icon: 'text_fields' },
  { value: 'number', label: 'number', icon: 'pin' },
  { value: 'boolean', label: 'boolean', icon: 'check_box' },
  { value: 'datetime', label: 'datetime', icon: 'calendar_month' },
];

const CARD_RUN_ITEMS: Array<{ action: string; label: string; icon: string }> = [
  { action: 'validate',   label: 'Validate',     icon: 'fact_check' },
  { action: 'tidy',       label: 'Tidy canvas',  icon: 'auto_fix_high' },
  { action: 'dry_run',    label: 'Dry run',      icon: 'science' },
  { action: 'run',        label: 'Run now',      icon: 'play_arrow' },
  { action: 'trigger',    label: 'Trigger event',icon: 'bolt' },
  { action: 'retry',      label: 'Retry last',   icon: 'replay' },
  { action: 'resume',     label: 'Resume',       icon: 'play_circle' },
  { action: 'cancel',     label: 'Cancel',       icon: 'cancel' },
  { action: 'rollback',   label: 'Rollback',     icon: 'history' },
];

function WorkflowCardDropdown(props: {
  workflow: Workflow;
  kind: 'manage' | 'run';
  onAction: (workflow: Workflow, action: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const items = props.kind === 'manage' ? CARD_MANAGE_ITEMS : CARD_RUN_ITEMS;

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Element) &&
        btnRef.current && !btnRef.current.contains(e.target as Element)
      ) setOpen(false);
    };
    const closeOnScroll = () => setOpen(false);
    document.addEventListener('pointerdown', close);
    window.addEventListener('scroll', closeOnScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', closeOnScroll, { capture: true });
    };
  }, [open]);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(true);
  }

  const menu = open && menuPos
    ? createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
          className="w-52 rounded-[12px] border border-[#e9eae6] bg-white py-1 shadow-xl dark:border-[#1a1a1a] dark:bg-[#1a1a1a]"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.action}
              onClick={(e) => { e.stopPropagation(); setOpen(false); props.onAction(props.workflow, item.action); }}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] transition hover:bg-[#f8f8f7] dark:hover:bg-[#1a1a1a]
                ${'danger' in item && item.danger ? 'text-red-600 dark:text-red-400' : 'text-[#1a1a1a] dark:text-[#e9eae6]'}`}
            >
              <span className="material-symbols-outlined text-[14px] leading-none">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={handleToggle}
        title={props.kind === 'manage' ? 'Manage' : 'Run & Test'}
        className="flex items-center gap-1 rounded-[10px] border border-[#e9eae6] px-2 py-1 text-[12px] font-medium text-[#646462] transition hover:bg-[#f8f8f7] dark:border-[#1a1a1a] dark:text-[#a4a4a2] dark:hover:bg-[#1a1a1a]"
      >
        <span className="material-symbols-outlined text-[14px] leading-none">
          {props.kind === 'manage' ? 'settings' : 'play_circle'}
        </span>
        <span>{props.kind === 'manage' ? 'Manage' : 'Run'}</span>
        <span className="material-symbols-outlined text-[12px] leading-none">expand_more</span>
      </button>
      {menu}
    </div>
  );
}

function WorkflowList(props: {
  error: string | null;
  section: WorkflowLibrarySection;
  setSection: (section: WorkflowLibrarySection) => void;
  query: string;
  setQuery: (query: string) => void;
  workflows: Workflow[];
  connectors: any[];
  recentRuns: any[];
  variableReferences: WorkflowVariableReference[];
  tableReferences: WorkflowTableReference[];
  storedVariables: WorkflowVariableRecord[];
  storedDataTables: WorkflowDataTableRecord[];
  selectedDataTable: WorkflowDataTableRecord | null;
  onOpen: (workflow: Workflow) => void;
  onCardAction: (workflow: Workflow, action: string) => void;
  onTemplate: () => void;
  onCreate: () => void;
  onNavigate?: NavigateFn;
  onNewVariable: () => void;
  onEditVariable: (variable: WorkflowVariableRecord) => void;
  onCreateDataTable: () => void;
  onOpenDataTable: (tableId: string) => void;
  onCloseDataTable: () => void;
  onSaveDataTable: (table: WorkflowDataTableRecord) => Promise<void>;
  onRefreshConnectors?: () => void;
}) {
  const [sortKey, setSortKey] = useState('updated');

  const searchPlaceholder = props.section === 'executions'
    ? 'Search executions...'
    : props.section === 'variables'
      ? 'Search variables...'
      : props.section === 'data_tables'
        ? 'Search data tables...'
        : 'Search workflows...';

  const sortedWorkflows = [...props.workflows].sort((a, b) => {
    if (sortKey === 'name') return a.name.localeCompare(b.name);
    // @ts-ignore
    const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
    // @ts-ignore
    const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  const sortedConnectors = [...props.connectors].sort((a, b) => {
    if (sortKey === 'name') return (a.name || a.system || '').localeCompare(b.name || b.system || '');
    if (sortKey === 'type') return (a.system || '').localeCompare(b.system || '');
    const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
    const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  const sortedExecutions = [...props.recentRuns].sort((a, b) => {
    const dateA = new Date(a.startedAt || a.started_at || a.created_at || 0).getTime();
    const dateB = new Date(b.startedAt || b.started_at || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  const workflowCount = props.workflows.length;
  const executionCount = props.recentRuns.length;
  const variableCount = props.storedVariables.length > 0 ? props.storedVariables.length : props.variableReferences.length;
  const dataTableCount = props.storedDataTables.length > 0 ? props.storedDataTables.length : props.tableReferences.length;

  return (
    <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 pb-4">
        <div className="rounded-[14px] border border-[#e9eae6] bg-white shadow-card dark:border-[#1a1a1a] dark:bg-card-dark">
          <div className="px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <h1 className="text-[24px] font-bold text-[#1a1a1a] dark:text-white tracking-tight">Workflows</h1>
              <p className="text-[13px] text-[#646462] mt-1.5 max-w-xl">Build operational automations for agents, cases, orders, refunds, returns, approvals, and complex multi-tool integrations.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#646462] group-focus-within:text-[#1a1a1a] transition-colors dark:group-focus-within:text-white">search</span>
                <input 
                  value={props.query} 
                  onChange={(event) => props.setQuery(event.target.value)} 
                  placeholder={searchPlaceholder} 
                  className="w-full lg:w-72 rounded-[12px] border border-[#e9eae6] bg-[#f8f8f7] pl-10 pr-4 py-2.5 text-[13px] outline-none transition-all focus:border-black/20 focus:bg-white focus:ring-4 focus:ring-black/5 dark:border-[#1a1a1a] dark:bg-[#1a1a1a] dark:focus:border-white/20 dark:focus:bg-[#1a1a1a] dark:focus:ring-white/5" 
                />
              </div>
              
              {props.section === 'workflows' && (
                <>
                  <button onClick={props.onTemplate} className="rounded-[12px] border border-[#e9eae6] px-5 py-2.5 text-[13px] font-bold text-[#1a1a1a] transition-colors hover:bg-[#f8f8f7] dark:border-[#1a1a1a] dark:text-[#e9eae6] dark:hover:bg-[#1a1a1a]">Templates</button>
                  <button onClick={props.onCreate} className="rounded-[12px] bg-black px-5 py-2.5 text-[13px] font-bold text-white shadow-card transition-opacity hover:opacity-90 dark:bg-white dark:text-[#1a1a1a]">New workflow</button>
                </>
              )}
            </div>
          </div>
          <div className="px-8 flex items-center gap-8 border-t border-[#f1f1ee] dark:border-[#1a1a1a] overflow-x-auto no-scrollbar">
            {WORKFLOW_LIBRARY_SECTIONS.map((section) => {
              const isActive = props.section === section.key;
              return (
                <button
                  key={section.key}
                  onClick={() => props.setSection(section.key)}
                  className={`py-4 text-[13px] whitespace-nowrap transition-all border-b-2 ${
                    isActive
                      ? 'border-black font-bold text-[#1a1a1a] dark:border-white dark:text-white'
                      : 'border-transparent font-medium text-[#646462] hover:text-[#1a1a1a] dark:text-[#646462] dark:hover:text-[#e9eae6]'
                  }`}
                >
                  {section.label}
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isActive
                      ? 'bg-black text-white dark:bg-white dark:text-[#1a1a1a]'
                      : 'bg-[#f8f8f7] text-[#646462] dark:bg-[#1a1a1a] dark:text-[#646462]'
                  }`}>
                    {section.key === 'workflows' ? workflowCount : section.key === 'executions' ? executionCount : section.key === 'variables' ? variableCount : dataTableCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {props.error && <div className="mx-6 mt-4 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">{props.error}</div>}
      <div className="flex-1 overflow-y-auto p-6">
        {props.section === 'workflows' ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {sortedWorkflows.map((workflow) => (
              <div
                key={workflow.id}
                className="relative cursor-pointer rounded-[14px] border border-[#e9eae6] bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-md dark:border-[#1a1a1a] dark:bg-card-dark"
                onClick={() => void props.onOpen(workflow)}
              >
                {(() => {
                  const meta = WORKFLOW_CATEGORY_META[normalizeWorkflowCategory(workflow.category)] ?? { subtitle: workflow.category, icon: 'grid_view' };
                  return (
                    <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#646462]">
                      <span className="material-symbols-outlined !text-[13px] text-[#646462]">{meta.icon}</span>
                      {workflow.category}
                    </div>
                    <h3 className="font-bold text-[#1a1a1a] dark:text-white">{workflow.name}</h3>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${workflow.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{workflow.status}</span>
                </div>
                <p className="mt-3 line-clamp-2 text-[13px] text-[#646462] dark:text-[#646462]">{workflow.description}</p>
                <div className="mt-2 text-[12px] text-[#646462] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[12px]">history</span>
                  Last run {formatRelativeDate(workflow.metrics.find(m => m.label === 'Last run')?.value)}
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[#f1f1ee] pt-4 dark:border-[#1a1a1a]">
                  {workflow.metrics.map((metric) => (
                    <div key={metric.label}>
                      <div className="text-[13px] font-bold text-[#1a1a1a] dark:text-white">{metric.value}{metric.suffix}</div>
                      <div className="text-[10px] text-[#646462]">{metric.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#f1f1ee] pt-3 dark:border-[#1a1a1a]">
                  <WorkflowCardDropdown workflow={workflow} kind="manage" onAction={props.onCardAction} />
                  <WorkflowCardDropdown workflow={workflow} kind="run" onAction={props.onCardAction} />
                </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        ) : props.section === 'executions' ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#f8f8f7] text-[#646462]">
                  <span className="material-symbols-outlined">receipt_long</span>
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-[#1a1a1a]">Execution History</h2>
                  <p className="text-[12px] text-[#646462]">Audit and inspect recent automated runs across your workspace.</p>
                </div>
              </div>
            </div>
            <WorkflowExecutionsSection runs={sortedExecutions} query={props.query} workflows={props.workflows} onOpen={props.onOpen} />
          </div>
        ) : props.section === 'variables' ? (
          <WorkflowVariablesSection
            variables={props.variableReferences}
            storedVariables={props.storedVariables}
            query={props.query}
            onOpenWorkflow={props.onOpen}
            workflows={props.workflows}
            onCreate={props.onNewVariable}
            onEditVariable={props.onEditVariable}
          />
        ) : (
          <WorkflowDataTablesSection
            tables={props.tableReferences}
            storedTables={props.storedDataTables}
            selectedTable={props.selectedDataTable}
            query={props.query}
            onOpenWorkflow={props.onOpen}
            workflows={props.workflows}
            onCreate={props.onCreateDataTable}
            onOpenTable={props.onOpenDataTable}
            onCloseTable={props.onCloseDataTable}
            onSaveTable={props.onSaveDataTable}
          />
        )}
      </div>
    </motion.div>
  );
}

function formatRelativeDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function WorkflowExecutionsSection(props: {
  runs: any[];
  query: string;
  workflows: Workflow[];
  onOpen: (workflow: Workflow) => void;
}) {
  const rows = props.runs.filter((item) => !props.query.trim() || `${item.id} ${item.workflow_name || ''} ${item.status}`.toLowerCase().includes(props.query.trim().toLowerCase()));
  const workflowById = new Map(props.workflows.map((workflow) => [workflow.id, workflow]));

  if (rows.length === 0) {
    return (
      <WorkflowEmptySection
        title="No executions yet"
        description="Published workflows will report their latest runs here so operators can inspect the execution trail."
      />
    );
  }

  return (
    <section className="bg-white dark:bg-card-dark rounded-[14px] border border-[#e9eae6] dark:border-[#1a1a1a] shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#f1f1ee] dark:border-[#1a1a1a] bg-[#f8f8f7]/50 dark:bg-[#1a1a1a]/20">
              <th className="px-6 py-3 text-[12px] font-semibold text-[#646462] dark:text-[#646462]">Execution</th>
              <th className="px-6 py-3 text-[12px] font-semibold text-[#646462] dark:text-[#646462]">Trigger</th>
              <th className="px-6 py-3 text-[12px] font-semibold text-[#646462] dark:text-[#646462]">Date</th>
              <th className="px-6 py-3 text-[12px] font-semibold text-[#646462] dark:text-[#646462]">Status</th>
              <th className="px-6 py-3 text-[12px] font-semibold text-[#646462] dark:text-[#646462] text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((run) => {
              const workflow = workflowById.get(run?.workflowId ?? run?.workflow_id ?? '');
              const startedAt = run?.startedAt ?? run?.started_at ?? run?.created_at;
              const status = String(run?.status ?? 'pending').toLowerCase();
              
              return (
                <tr key={run.id} className="border-b border-[#f1f1ee] dark:border-[#1a1a1a]/50 hover:bg-[#f8f8f7] dark:hover:bg-[#1a1a1a]/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] ${
                        ['completed', 'resumed'].includes(status) ? 'bg-green-50 text-green-600' :
                        ['failed', 'blocked', 'cancelled'].includes(status) ? 'bg-red-50 text-red-600' :
                        'bg-amber-50 text-amber-600'
                      }`}>
                        <span className="material-symbols-outlined text-[15px]">
                          {['completed', 'resumed'].includes(status) ? 'check_circle' :
                           ['failed', 'blocked', 'cancelled'].includes(status) ? 'error' : 'schedule'}
                        </span>
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-[#1a1a1a] dark:text-white">
                          {run?.workflow_name ?? workflow?.name ?? 'Workflow run'}
                        </p>
                        <p className="text-[10px] font-mono text-[#646462] mt-0.5 uppercase tracking-tighter">
                          ID: {run.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-[10px] border border-[#f1f1ee] bg-[#f8f8f7] text-[10px] font-bold text-[#646462] uppercase tracking-tight dark:border-[#1a1a1a] dark:bg-[#1a1a1a]/50 dark:text-[#646462]">
                      {run?.trigger_type ?? 'manual'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[13px] text-[#646462] dark:text-[#a4a4a2] font-medium">
                      {startedAt ? new Date(startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                    </div>
                    <div className="text-[10px] text-[#646462] mt-0.5">
                      {formatRelativeDate(startedAt)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-[6px] text-[10px] font-bold uppercase tracking-wider border ${
                      ['completed', 'resumed'].includes(status) ? 'bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/30' :
                      ['failed', 'blocked', 'cancelled'].includes(status) ? 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/30' :
                      'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/30'
                    }`}>
                      {status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {workflow && (
                      <button 
                        onClick={() => props.onOpen(workflow)}
                        className="rounded-[10px] border border-[#e9eae6] px-3 py-1.5 text-[12px] font-bold text-[#1a1a1a] transition hover:bg-[#f8f8f7] dark:border-[#1a1a1a] dark:text-[#e9eae6] dark:hover:bg-[#1a1a1a]"
                      >
                        Inspect
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WorkflowVariablesSection(props: {
  variables: WorkflowVariableReference[];
  storedVariables: WorkflowVariableRecord[];
  query: string;
  workflows: Workflow[];
  onOpenWorkflow: (workflow: Workflow) => void;
  onCreate: () => void;
  onEditVariable: (variable: WorkflowVariableRecord) => void;
}) {
  const rows = props.variables.filter((item) => !props.query.trim() || `${item.key} ${item.workflowNames.join(' ')}`.toLowerCase().includes(props.query.trim().toLowerCase()));
  const workflowById = new Map(props.workflows.map((workflow) => [workflow.id, workflow]));
  const visibleStoredVariables = props.storedVariables
    .filter((item) => !props.query.trim() || `${item.key} ${item.value} ${item.scope}`.toLowerCase().includes(props.query.trim().toLowerCase()));

  return (
    <div className="space-y-5">
      {props.storedVariables.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[#1a1a1a]">Workspace Variables</h3>
            <button
              onClick={props.onCreate}
              className="flex items-center gap-2 rounded-[10px] bg-black px-4 py-2 text-[13px] font-bold text-white shadow-card hover:opacity-90"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              New Variable
            </button>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleStoredVariables.map((item) => (
              <button
                key={item.id}
                onClick={() => props.onEditVariable(item)}
                className="rounded-[14px] border border-[#e9eae6] bg-white p-5 text-left shadow-card transition hover:border-[#e9eae6] hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[#1a1a1a]">{item.key}</div>
                    <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#646462]">{item.value || 'No value yet'}</div>
                  </div>
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase text-blue-700">{item.scope}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 && props.storedVariables.length === 0 ? (
        <WorkflowEmptySection
          title="No workflow variables discovered"
          description="This workspace is not referencing shared workflow variables yet. Add reusable variables inside workflow prompts or data-mapping nodes to make flows easier to maintain."
          actionLabel="New variable"
          onAction={props.onCreate}
        />
      ) : rows.length > 0 ? (
        <div>
          <h3 className="mb-4 text-[15px] font-semibold text-[#1a1a1a]">Referenced Variables</h3>
          <div className="space-y-4">
            {rows.map((item) => (
              <div key={item.key} className="rounded-[14px] border border-[#e9eae6] bg-white p-5 shadow-card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[13px] font-semibold text-[#1a1a1a]">{item.key}</div>
                    <div className="mt-1 text-[12px] text-[#646462]">Used in {item.workflowIds.length} workflow{item.workflowIds.length === 1 ? '' : 's'}</div>
                  </div>
                  <span className="rounded-full bg-[#f8f8f7] px-2.5 py-1 text-[10px] font-bold uppercase text-[#646462]">Shared variable</span>
                </div>
                <div className="mt-4 space-y-2">
                  {item.workflowIds.map((workflowId, index) => {
                    const workflow = workflowById.get(workflowId);
                    return (
                      <button
                        key={`${workflowId}-${index}`}
                        onClick={() => workflow && props.onOpenWorkflow(workflow)}
                        className="flex w-full items-center justify-between rounded-[12px] border border-[#e9eae6] px-4 py-3 text-left transition hover:bg-[#f8f8f7]"
                      >
                        <div>
                          <div className="text-[13px] font-medium text-[#1a1a1a]">{item.workflowNames[index] || workflow?.name || 'Workflow'}</div>
                          <div className="mt-1 text-[12px] text-[#646462]">{item.examples[0] || '{{variables.example}}'}</div>
                        </div>
                        <span className="material-symbols-outlined text-[14px] text-[#646462]">chevron_right</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WorkflowDataTablesSection(props: {
  tables: WorkflowTableReference[];
  storedTables: WorkflowDataTableRecord[];
  selectedTable: WorkflowDataTableRecord | null;
  query: string;
  workflows: Workflow[];
  onOpenWorkflow: (workflow: Workflow) => void;
  onCreate: () => void;
  onOpenTable: (tableId: string) => void;
  onCloseTable: () => void;
  onSaveTable: (table: WorkflowDataTableRecord) => Promise<void>;
}) {
  const rows = props.tables.filter((item) => !props.query.trim() || `${item.key} ${item.workflowNames.join(' ')}`.toLowerCase().includes(props.query.trim().toLowerCase()));
  const workflowById = new Map(props.workflows.map((workflow) => [workflow.id, workflow]));

  if (props.selectedTable) {
    return (
      <WorkflowDataTableEditor
        table={props.selectedTable}
        onBack={props.onCloseTable}
        onSave={props.onSaveTable}
      />
    );
  }

  const visibleStoredTables = props.storedTables.filter((table) => !props.query.trim() || `${table.name}`.toLowerCase().includes(props.query.trim().toLowerCase()));

  return (
    <div className="space-y-5">
      {visibleStoredTables.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-[#1a1a1a]">Data Tables</h3>
            <button
              onClick={props.onCreate}
              className="flex items-center gap-2 rounded-[10px] bg-black px-4 py-2 text-[13px] font-bold text-white shadow-card hover:opacity-90"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              Create Data Table
            </button>
          </div>
          <div className="space-y-3">
            {visibleStoredTables.map((table) => (
              <button
                key={table.id}
                onClick={() => props.onOpenTable(table.id)}
                className="w-full rounded-[14px] border border-[#e9eae6] bg-white p-5 text-left shadow-card transition hover:border-[#e9eae6] hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-[#1a1a1a]">{table.name}</div>
                    <div className="mt-1 text-[12px] text-[#646462]">{table.rows.length} rows · {table.columns.length} custom columns</div>
                  </div>
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold uppercase text-green-700">{table.source}</span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-[12px] text-[#646462]">
                  <span className="material-symbols-outlined text-[13px]">edit</span>
                  Click to edit
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 && visibleStoredTables.length === 0 ? (
        <WorkflowEmptySection
          title="No data tables configured"
          description="No workflow node is referencing a shared data table yet. Use data-aware workflows when you want durable records, evaluation datasets, or shared execution context."
          actionLabel="Create data table"
          onAction={props.onCreate}
        />
      ) : rows.length > 0 ? (
        <div>
          <h3 className="mb-4 text-[15px] font-semibold text-[#1a1a1a]">Referenced Data Tables</h3>
          <div className="grid gap-4 xl:grid-cols-2">
            {rows.map((item) => (
              <div key={item.key} className="rounded-[14px] border border-[#e9eae6] bg-white p-5 shadow-card">
                <div className="text-[13px] font-semibold text-[#1a1a1a]">{item.key}</div>
                <div className="mt-1 text-[12px] text-[#646462]">Referenced by {item.workflowIds.length} workflow{item.workflowIds.length === 1 ? '' : 's'}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.sources.map((source) => (
                    <span key={source} className="rounded-full bg-[#f8f8f7] px-2.5 py-1 text-[10px] font-bold uppercase text-[#646462]">{source}</span>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {item.workflowIds.map((workflowId, index) => {
                    const workflow = workflowById.get(workflowId);
                    return (
                      <button
                        key={`${workflowId}-${index}`}
                        onClick={() => workflow && props.onOpenWorkflow(workflow)}
                        className="flex w-full items-center justify-between rounded-[12px] border border-[#e9eae6] px-4 py-3 text-left transition hover:bg-[#f8f8f7]"
                      >
                        <span className="text-[13px] font-medium text-[#1a1a1a]">{item.workflowNames[index] || workflow?.name || 'Workflow'}</span>
                        <span className="material-symbols-outlined text-[14px] text-[#646462]">chevron_right</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WorkflowEmptySection(props: { title: string; description: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#e9eae6] bg-white px-6 py-12 text-center shadow-card">
      <div className="mx-auto max-w-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#e9eae6] bg-[#f8f8f7] text-[#646462]">
          <span className="material-symbols-outlined text-[20px]">deployed_code</span>
        </div>
        <h3 className="mt-4 text-[24px] font-medium text-[#1a1a1a]">{props.title}</h3>
        <p className="mt-3 text-[13px] leading-6 text-[#646462]">{props.description}</p>
        {props.actionLabel && props.onAction && (
          <button onClick={props.onAction} className="mt-6 rounded-[10px] bg-black px-4 py-2 text-[13px] font-bold text-white shadow-card hover:opacity-90">
            {props.actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function StatTile(props: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[#e9eae6] bg-[#f8f8f7] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#646462]">{props.label}</div>
      <div className="mt-2 text-[13px] font-semibold text-[#1a1a1a]">{props.value}</div>
    </div>
  );
}

function WorkflowVariableModal(props: {
  open: boolean;
  variable: WorkflowVariableRecord | null;
  onClose: () => void;
  onSave: (input: { key: string; value: string; scope: WorkflowVariableScope }) => Promise<void>;
}) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [scope, setScope] = useState<WorkflowVariableScope>('workspace');

  useEffect(() => {
    if (!props.open) return;
    setKey(props.variable?.key ?? '');
    setValue(props.variable?.value ?? '');
    setScope(props.variable?.scope ?? 'workspace');
  }, [props.open, props.variable]);

  if (!props.open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="w-full max-w-2xl rounded-[14px] bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[24px] font-medium text-[#1a1a1a]">{props.variable ? 'Edit variable' : 'New variable'}</h3>
            </div>
            <button onClick={props.onClose} className="rounded-[10px] p-2 text-[#646462] hover:bg-[#f8f8f7]">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-[13px] font-medium text-[#1a1a1a]">Key <span className="text-[#ff5a46]">*</span></span>
              <input value={key} onChange={(event) => setKey(event.target.value)} placeholder="Enter a name" className="mt-2 w-full rounded-[12px] border border-[#e9eae6] px-4 py-3 text-[13px] outline-none focus:border-[#675cff] focus:ring-2 focus:ring-[#675cff]/10" />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-[#1a1a1a]">Value</span>
              <textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder="Enter a value" className="mt-2 min-h-28 w-full resize-none rounded-[12px] border border-[#e9eae6] px-4 py-3 text-[13px] outline-none focus:border-[#675cff] focus:ring-2 focus:ring-[#675cff]/10" />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-[#1a1a1a]">Scope</span>
              <select value={scope} onChange={(event) => setScope(event.target.value as WorkflowVariableScope)} className="mt-2 w-full rounded-[12px] border border-[#e9eae6] px-4 py-3 text-[13px] outline-none focus:border-[#675cff] focus:ring-2 focus:ring-[#675cff]/10">
                <option value="">Select</option>
                {WORKFLOW_VARIABLE_SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-8 flex justify-end gap-3">
            <button onClick={props.onClose} className="rounded-[10px] border border-[#e9eae6] px-4 py-2 text-[13px] font-semibold text-[#1a1a1a] transition hover:bg-[#f8f8f7]">Cancel</button>
            <button onClick={() => void props.onSave({ key: key.trim(), value, scope })} disabled={!key.trim()} className="rounded-[10px] bg-black px-4 py-2 text-[13px] font-bold text-white shadow-card transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              Save Variable
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function WorkflowDataTableCreateModal(props: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; source: 'scratch' | 'csv'; csvText?: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [source, setSource] = useState<'scratch' | 'csv'>('scratch');
  const [csvText, setCsvText] = useState('');

  useEffect(() => {
    if (!props.open) return;
    setName('');
    setSource('scratch');
    setCsvText('');
  }, [props.open]);

  if (!props.open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="w-full max-w-3xl rounded-[14px] bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-[24px] font-medium text-[#1a1a1a]">Create new data table</h3>
            </div>
            <button onClick={props.onClose} className="rounded-[10px] p-2 text-[#646462] hover:bg-[#f8f8f7]">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="text-[13px] font-medium text-[#1a1a1a]">Data table name <span className="text-[#ff5a46]">*</span></span>
              <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-[12px] border border-[#e9eae6] px-4 py-3 text-[13px] outline-none focus:border-[#675cff] focus:ring-2 focus:ring-[#675cff]/10" />
            </label>

            <div className="space-y-3">
              <label className="flex items-center gap-3 text-[15px] text-[#1a1a1a]">
                <input type="radio" checked={source === 'scratch'} onChange={() => setSource('scratch')} />
                <span>From scratch</span>
              </label>
              <label className="flex items-center gap-3 text-[15px] text-[#646462]">
                <input type="radio" checked={source === 'csv'} onChange={() => setSource('csv')} />
                <span>Import CSV</span>
              </label>
            </div>

            {source === 'csv' && (
              <label className="block">
                <span className="text-[13px] font-medium text-[#1a1a1a]">CSV content</span>
                <textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} placeholder="name,email&#10;Aurora,aurora@example.com" className="mt-2 min-h-36 w-full resize-none rounded-[12px] border border-[#e9eae6] px-4 py-3 text-[13px] outline-none focus:border-[#675cff] focus:ring-2 focus:ring-[#675cff]/10" />
              </label>
            )}
          </div>
          <div className="mt-8 flex justify-end gap-3">
            <button onClick={props.onClose} className="rounded-[10px] border border-[#e9eae6] px-4 py-2 text-[13px] font-semibold text-[#1a1a1a] transition hover:bg-[#f8f8f7]">Cancel</button>
            <button onClick={() => void props.onCreate({ name: name.trim(), source, csvText })} disabled={!name.trim() || (source === 'csv' && !csvText.trim())} className="rounded-[10px] bg-black px-5 py-2 text-[13px] font-bold text-white shadow-card transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              Create Table
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function WorkflowDataTableEditor(props: {
  table: WorkflowDataTableRecord;
  onBack: () => void;
  onSave: (table: WorkflowDataTableRecord) => Promise<void>;
}) {
  const [draft, setDraft] = useState<WorkflowDataTableRecord>(props.table);
  const [search, setSearch] = useState('');
  const [columnEditorOpen, setColumnEditorOpen] = useState(false);
  const [columnName, setColumnName] = useState('');
  const [columnType, setColumnType] = useState<WorkflowColumnType>('string');

  useEffect(() => {
    setDraft(props.table);
  }, [props.table]);

  const visibleRows = useMemo(() => {
    if (!search.trim()) return draft.rows;
    const needle = search.trim().toLowerCase();
    return draft.rows.filter((row) =>
      `${row.id} ${Object.values(row.values).join(' ')}`.toLowerCase().includes(needle),
    );
  }, [draft.rows, search]);

  const addRow = () => {
    const now = new Date().toISOString();
    const values = Object.fromEntries(draft.columns.map((column) => [column.name, '']));
    setDraft((current) => ({
      ...current,
      updatedAt: now,
      rows: [...current.rows, { id: String(current.rows.length + 1), createdAt: now, updatedAt: now, values }],
    }));
  };

  const addColumn = () => {
    if (!columnName.trim()) return;
    const nextColumn: WorkflowDataTableColumn = { id: crypto.randomUUID(), name: columnName.trim(), type: columnType };
    const now = new Date().toISOString();
    setDraft((current) => ({
      ...current,
      updatedAt: now,
      columns: [...current.columns, nextColumn],
      rows: current.rows.map((row) => ({
        ...row,
        updatedAt: now,
        values: { ...row.values, [nextColumn.name]: '' },
      })),
    }));
    setColumnName('');
    setColumnType('string');
    setColumnEditorOpen(false);
  };

  const updateCell = (rowId: string, columnNameToUpdate: string, value: string) => {
    const now = new Date().toISOString();
    setDraft((current) => ({
      ...current,
      updatedAt: now,
      rows: current.rows.map((row) => row.id === rowId ? { ...row, updatedAt: now, values: { ...row.values, [columnNameToUpdate]: value } } : row),
    }));
  };

  return (
    <div className="rounded-[14px] border border-[#e9eae6] bg-white shadow-card">
      <div className="flex items-center justify-between gap-4 border-b border-[#f1f1ee] px-6 py-5">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-1">
            <button onClick={props.onBack} className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-[13px] text-[#646462] transition hover:bg-[#f8f8f7] hover:text-[#1a1a1a]">
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              <span>Back to Data Tables</span>
            </button>
          </div>
          <div className="text-[24px] font-bold text-[#1a1a1a]">{draft.name}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-[12px] border border-[#e9eae6] px-3 py-2">
            <span className="material-symbols-outlined text-[14px] text-[#646462]">search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rows" className="w-48 bg-transparent text-[13px] outline-none" />
          </div>
          <button onClick={addRow} className="rounded-[10px] bg-[#ff5a46] px-4 py-2 text-[13px] font-bold text-white shadow-card hover:opacity-90">Add Row</button>
          <button onClick={() => setColumnEditorOpen((open) => !open)} className="rounded-[10px] border border-[#e9eae6] px-4 py-2 text-[13px] font-semibold text-[#1a1a1a] transition hover:bg-[#f8f8f7]">Add Column</button>
          <button onClick={() => void props.onSave({ ...draft, updatedAt: new Date().toISOString() })} className="rounded-[10px] bg-black px-4 py-2 text-[13px] font-bold text-white shadow-card hover:opacity-90">Save</button>
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <table className="min-w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#f8f8f7]">
              <th className="border-b border-r border-[#e9eae6] px-4 py-3 text-left font-medium text-[#646462]">id</th>
              <th className="border-b border-r border-[#e9eae6] px-4 py-3 text-left font-medium text-[#646462]">createdAt</th>
              <th className="border-b border-r border-[#e9eae6] px-4 py-3 text-left font-medium text-[#646462]">updatedAt</th>
              {draft.columns.map((column) => (
                <th key={column.id} className="border-b border-r border-[#e9eae6] px-4 py-3 text-left font-medium text-[#646462]">{column.name}</th>
              ))}
              <th className="border-b border-[#e9eae6] px-4 py-3 text-left font-medium text-[#646462]">
                <button onClick={() => setColumnEditorOpen((open) => !open)}>+</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                <td className="border-b border-r border-[#e9eae6] px-4 py-3 text-[#1a1a1a]">{row.id}</td>
                <td className="border-b border-r border-[#e9eae6] px-4 py-3 text-[#646462]">{row.createdAt}</td>
                <td className="border-b border-r border-[#e9eae6] px-4 py-3 text-[#646462]">{row.updatedAt}</td>
                {draft.columns.map((column) => (
                  <td key={column.id} className="border-b border-r border-[#e9eae6] px-2 py-2">
                    <input value={String(row.values[column.name] ?? '')} onChange={(event) => updateCell(row.id, column.name, event.target.value)} className="w-full rounded-[10px] border border-transparent px-2 py-1.5 outline-none focus:border-[#e9eae6] focus:bg-[#f8f8f7]" />
                  </td>
                ))}
                <td className="border-b border-[#e9eae6] px-4 py-3" />
              </tr>
            ))}
            <tr>
              <td colSpan={draft.columns.length + 4} className="px-4 py-3">
                <button onClick={addRow} className="text-[20px] text-[#1a1a1a]">+</button>
              </td>
            </tr>
          </tbody>
        </table>

        {columnEditorOpen && (
          <div className="absolute left-[37%] top-14 z-10 w-[300px] rounded-[12px] border border-[#e9eae6] bg-white p-4 shadow-2xl">
            <label className="block">
              <span className="text-[13px] font-medium text-[#1a1a1a]">Name <span className="text-[#ff5a46]">*</span></span>
              <input value={columnName} onChange={(event) => setColumnName(event.target.value)} placeholder="Enter column name" className="mt-2 w-full rounded-[12px] border border-[#e9eae6] px-3 py-2.5 text-[13px] outline-none focus:border-[#675cff]" />
            </label>
            <label className="mt-5 block">
              <span className="text-[13px] font-medium text-[#1a1a1a]">Type <span className="text-[#ff5a46]">*</span></span>
              <select value={columnType} onChange={(event) => setColumnType(event.target.value as WorkflowColumnType)} className="mt-2 w-full rounded-[12px] border border-[#675cff] px-3 py-2.5 text-[13px] outline-none">
                {WORKFLOW_COLUMN_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button onClick={addColumn} className="mt-8 rounded-[10px] bg-[#ff8b7f] px-4 py-2 text-[13px] font-bold text-white">Add Column</button>
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowEditorTopbar(props: {
  workflow: Workflow | null;
  setWorkflow: React.Dispatch<React.SetStateAction<Workflow | null>>;
  activeTab: WorkflowTab;
  setActiveTab: (tab: WorkflowTab) => void;
  onBack: () => void;
  onEditDescription: () => void;
  onDuplicate: () => void;
  onDownload: () => void;
  onShare: () => void;
  onMove: () => void;
  onRename: () => void;
  onImportFromUrl: () => void;
  onImportFromFile: () => void;
  onPushToGit: () => void;
  onArchive: () => void;
  onValidate: () => void;
  onTidy: () => void;
  onDryRun: () => void;
  onRun: () => void;
  onTrigger: () => void;
  onRetry: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRollback: () => void;
  onSave: () => void;
  onPublish: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState<'edit' | 'run' | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Element)) {
        setMenuOpen(null);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(null);
  const runAndClose = (action: () => void) => () => {
    action();
    closeMenu();
  };

  const editMenuItems = [
    { label: 'Edit description', action: runAndClose(props.onEditDescription) },
    { label: 'Save', action: runAndClose(props.onSave), bold: true },
    { label: 'Rename', action: runAndClose(props.onRename) },
    { label: 'Move', action: runAndClose(props.onMove) },
    { label: 'Duplicate', action: runAndClose(props.onDuplicate) },
    { label: 'Download', action: runAndClose(props.onDownload) },
    { label: 'Share', action: runAndClose(props.onShare) },
    { label: 'Import from URL...', action: runAndClose(props.onImportFromUrl) },
    { label: 'Import from file...', action: runAndClose(props.onImportFromFile) },
    { label: 'Copy JSON for Git', action: runAndClose(props.onPushToGit) },
  ];

  const runMenuItems = [
    { label: 'Validate', action: runAndClose(props.onValidate) },
    { label: 'Tidy up', action: runAndClose(props.onTidy) },
    { label: 'Dry-run', action: runAndClose(props.onDryRun) },
    { label: 'Run', action: runAndClose(props.onRun) },
    { label: 'Trigger event', action: runAndClose(props.onTrigger) },
    { label: 'Retry', action: runAndClose(props.onRetry) },
    { label: 'Resume', action: runAndClose(props.onResume) },
    { label: 'Cancel', action: runAndClose(props.onCancel) },
    { label: 'Rollback', action: runAndClose(props.onRollback) },
    { label: 'Archive', action: runAndClose(props.onArchive), danger: true },
  ];

  return (
    <div className="flex-shrink-0 border-b border-[#e9eae6] bg-white">
      <div className="flex h-14 items-center justify-between px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={props.onBack} className="text-[13px] font-medium text-[#646462] hover:text-[#1a1a1a]">Workflows</button>
          <span className="text-[#e9eae6]">/</span>
          <input value={props.workflow?.name ?? ''} onChange={(event) => props.setWorkflow((workflow) => workflow ? { ...workflow, name: event.target.value } : workflow)} className="min-w-[260px] bg-transparent text-[14px] font-semibold text-[#1a1a1a] outline-none" />
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase bg-[#f1f1ee] border border-[#e9eae6] text-[#646462]">{props.workflow?.currentVersion?.status ?? 'draft'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={menuRef}>
            <div className="flex items-center gap-2">
              <button onClick={() => setMenuOpen((value) => value === 'edit' ? null : 'edit')} className="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f8f8f7]" aria-haspopup="menu" aria-expanded={menuOpen === 'edit'} aria-label="Edit workflow actions">
                Edit
              </button>
              <button onClick={() => setMenuOpen((value) => value === 'run' ? null : 'run')} className="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f8f8f7]" aria-haspopup="menu" aria-expanded={menuOpen === 'run'} aria-label="Run workflow actions">
                Run
              </button>
            </div>

            {menuOpen === 'edit' && (
              <div className="absolute right-20 top-full z-50 mt-2 w-72 overflow-hidden rounded-[14px] border border-[#e9eae6] bg-white shadow-2xl">
                <div className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#646462]">Workflow actions</div>
                <div className="border-t border-[#f1f1ee]" />
                <div className="p-2">
                  {editMenuItems.map((item, index) => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className={`flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-left text-[13px] hover:bg-[#f8f8f7] ${item.bold ? 'font-semibold text-[#1a1a1a]' : 'text-[#1a1a1a]'} ${index === editMenuItems.length - 1 ? 'border-t border-[#f1f1ee] mt-2 pt-3' : ''}`}
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {menuOpen === 'run' && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-[14px] border border-[#e9eae6] bg-white shadow-2xl">
                <div className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#646462]">Workflow actions</div>
                <div className="border-t border-[#f1f1ee]" />
                <div className="p-2">
                  {runMenuItems.map((item, index) => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className={`flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-left text-[13px] hover:bg-[#f8f8f7] ${item.danger ? 'text-red-600' : 'text-[#1a1a1a]'} ${index === runMenuItems.length - 1 ? 'border-t border-[#f1f1ee] mt-2 pt-3' : ''}`}
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={props.onPublish} className="h-8 px-4 rounded-full bg-[#1a1a1a] text-white text-[13px] font-semibold hover:bg-black">Publish</button>
        </div>
      </div>
      <div className="-mb-px flex px-5">
        {EDITOR_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => props.setActiveTab(tab.id)}
            className={`h-10 px-3 text-[13px] font-medium border-b-2 transition-colors ${props.activeTab === tab.id ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkflowAddNodePanel(props: {
  screen: 'categories' | 'category';
  activeCategory: string;
  categories: Array<{ category: string; title: string; subtitle: string; icon: string; count: number }>;
  sections: AddPanelSection[];
  onOpenCategory: (category: string) => void;
  onBack: () => void;
  search: string;
  setSearch: (search: string) => void;
  onClose: () => void;
  onSelect: (spec: NodeSpec) => void;
  /** Pre-loaded AI Studio agents to show in the "AI Agent" category */
  agentCatalog?: Array<{ id: string; slug: string; name: string; description?: string; status?: string }>;
}) {
  return (
    <aside className="absolute right-0 top-0 z-30 h-full w-[420px] border-l border-[#e9eae6] bg-white shadow-xl">
      <AnimatePresence mode="wait" initial={false}>
        {props.screen === 'categories' ? (
          <motion.div
            key="categories"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            className="flex h-full flex-col"
          >
            <div className="flex items-center justify-between border-b border-[#f1f1ee] px-5 py-4">
              <div>
                <h3 className="text-[15px] font-bold text-[#1a1a1a]">What happens next?</h3>
                <p className="mt-1 text-[12px] text-[#646462]">Choose the next CRM-AI operation.</p>
              </div>
              <button onClick={props.onClose} className="rounded-[10px] p-2 text-[#646462] hover:bg-[#f8f8f7]">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="border-b border-[#f1f1ee] p-5">
              <div className="flex items-center gap-2 rounded-[12px] border border-[#e9eae6] px-3 py-2 focus-within:ring-2 focus-within:ring-black/10">
                <span className="material-symbols-outlined text-[14px] text-[#646462]">search</span>
                <input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Search nodes..." className="w-full bg-transparent text-[13px] outline-none" />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
              <div className="space-y-2 pb-8">
                {props.categories.map((category) => (
                    <button
                      key={category.category}
                      onClick={() => props.onOpenCategory(category.category)}
                      className={`flex w-full items-center gap-3 rounded-[14px] border px-3 py-3 text-left transition ${
                        props.activeCategory === category.category
                          ? 'border-[#e9eae6] bg-[#f8f8f7] text-[#1a1a1a] shadow-sm'
                          : 'border-transparent text-[#1a1a1a] hover:border-[#e9eae6] hover:bg-[#f8f8f7]'
                      }`}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white text-[#1a1a1a] shadow-sm">
                        <span className="material-symbols-outlined text-[20px]">{category.icon}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold">{category.title}</span>
                          <span className="inline-flex items-center rounded-full border border-[#e9eae6] bg-[#f1f1ee] px-2 py-0.5 text-[11px] font-semibold text-[#646462]">{category.count}</span>
                        </span>
                        <span className="mt-1 block text-[12px] leading-5 text-[#646462]">{category.subtitle}</span>
                      </span>
                      <span className="material-symbols-outlined text-[14px] text-[#646462]">chevron_right</span>
                    </button>
                  ))}
                </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="category"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            className="flex h-full flex-col"
          >
            <div className="flex items-center justify-between border-b border-[#f1f1ee] px-5 py-4">
              <button onClick={props.onBack} className="flex items-center gap-2 text-[#646462] hover:text-[#1a1a1a]">
                <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                <span className="text-[13px] font-semibold">Back</span>
              </button>
              <button onClick={props.onClose} className="rounded-[10px] p-2 text-[#646462] hover:bg-[#f8f8f7]">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="border-b border-[#f1f1ee] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#f8f8f7] text-[#1a1a1a]">
                  <span className="material-symbols-outlined text-[20px]">{CATEGORY_META[props.activeCategory]?.icon ?? 'grid_view'}</span>
                </span>
                <div>
                  <h3 className="text-[15px] font-bold text-[#1a1a1a]">{CATEGORY_META[props.activeCategory]?.title ?? props.activeCategory}</h3>
                  <p className="mt-1 text-[12px] text-[#646462]">{CATEGORY_META[props.activeCategory]?.subtitle ?? 'Choose a block for this category.'}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-[12px] border border-[#e9eae6] px-3 py-2 focus-within:ring-2 focus-within:ring-black/10">
                <span className="material-symbols-outlined text-[14px] text-[#646462]">search</span>
                <input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Search nodes..." className="w-full bg-transparent text-[13px] outline-none" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* AI Agent category: show real AI Studio agents as the first section */}
              {props.activeCategory === 'AI Agent' && props.agentCatalog && props.agentCatalog.length > 0 && !props.search && (
                <section className="mb-5">
                  <div className="flex items-center justify-between border-b border-[#f1f1ee] pb-2">
                    <h4 className="text-[13px] font-bold text-[#1a1a1a]">Your AI Studio Agents</h4>
                    <span className="text-[11px] uppercase tracking-[0.24em] text-[#646462]">{props.agentCatalog.length}</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {props.agentCatalog.map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => props.onSelect({
                          type: 'agent',
                          key: 'agent.run',
                          label: agent.name,
                          category: 'AI Agent',
                          icon: 'smart_toy',
                          requiresConfig: false,
                          description: agent.description ?? `Run the ${agent.name} agent`,
                          defaultConfig: { agent: agent.slug, agentId: agent.id },
                        })}
                        className="flex w-full items-start gap-3 rounded-[14px] px-3 py-3 text-left transition hover:bg-[#f8f8f7]"
                      >
                        <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-[12px] bg-white text-[#646462] shadow-sm">
                          <span className="material-symbols-outlined text-[15px]">smart_toy</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="block text-[13px] font-semibold text-[#1a1a1a]">{agent.name}</span>
                            {agent.status && agent.status !== 'active' && (
                              <span className="rounded-full bg-[#f8f8f7] px-1.5 py-0.5 text-[9px] text-[#646462]">{agent.status}</span>
                            )}
                          </span>
                          {agent.description && (
                            <span className="mt-1 block text-[12px] leading-4 text-[#646462] line-clamp-1">{agent.description}</span>
                          )}
                        </span>
                        <span className="material-symbols-outlined mt-1 text-[14px] text-[#646462]">arrow_forward</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] text-[#646462]">Configure agents in AI Studio → Agents. Each agent runs with its own persona, tools, and knowledge.</p>
                </section>
              )}
              {props.sections.length > 0 ? (
                <div className="space-y-5">
                  {props.sections.map((section) => (
                    <section key={section.title}>
                      <div className="flex items-center justify-between border-b border-[#f1f1ee] pb-2">
                        <h4 className="text-[13px] font-bold text-[#1a1a1a]">{section.title}</h4>
                        <span className="text-[11px] uppercase tracking-[0.24em] text-[#646462]">{section.items.length}</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {section.items.map((spec) => (
                          <button key={spec.key} onClick={() => props.onSelect(spec)} className="flex w-full items-start gap-3 rounded-[14px] px-3 py-3 text-left transition hover:bg-[#f8f8f7]">
                            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-[12px] bg-white text-[#646462] shadow-sm">
                              <span className="material-symbols-outlined text-[15px]">{spec.icon}</span>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-semibold text-[#1a1a1a]">{spec.label}</span>
                              <span className="mt-1 block text-[12px] leading-5 text-[#646462]">{spec.description ?? spec.key}</span>
                            </span>
                            <span className="material-symbols-outlined mt-1 text-[14px] text-[#646462]">arrow_forward</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : props.activeCategory !== 'AI Agent' ? (
                <div className="flex h-full items-center justify-center text-[13px] text-[#646462]">No nodes found.</div>
              ) : null}
              {props.activeCategory === 'AI Agent' && props.sections.length === 0 && (!props.agentCatalog || props.agentCatalog.length === 0) && (
                <div className="flex h-full items-center justify-center text-[13px] text-[#646462]">No AI agents found. Create one in AI Studio → Agents.</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}

function WorkflowContextMenu(props: {
  contextMenu: { nodeId: string; x: number; y: number };
  node?: WorkflowNode;
  onClose: () => void;
  onEdit: (nodeId: string) => void;
  onExecute: (nodeId: string) => void;
  onToggle: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}) {
  if (!props.node) return null;
  const items = [
    { label: 'Open...', action: () => props.onEdit(props.node!.id), key: 'â†µ' },
    { label: 'Execute step', action: () => props.onExecute(props.node!.id) },
    { label: 'Rename', action: () => props.onEdit(props.node!.id), key: 'Space' },
    { label: props.node.disabled ? 'Activate' : 'Deactivate', action: () => props.onToggle(props.node!.id), key: 'D' },
    { label: 'Copy', action: () => props.onDuplicate(props.node!.id), key: 'Ctrl C' },
    { label: 'Duplicate', action: () => props.onDuplicate(props.node!.id), key: 'Ctrl D' },
    { label: 'Delete', action: () => props.onDelete(props.node!.id), key: 'Del', danger: true },
  ];
  return (
    <div className="fixed z-50 w-64 rounded-[10px] border border-[#e9eae6] bg-white py-2 shadow-2xl" style={{ left: props.contextMenu.x, top: props.contextMenu.y }}>
      {items.map((item, index) => (
        <button key={item.label} onClick={() => { item.action(); props.onClose(); }} className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-[#f8f8f7] ${item.danger ? 'text-red-600' : 'text-[#1a1a1a]'} ${index === items.length - 1 ? 'border-t border-[#f1f1ee] mt-2 pt-3' : ''}`}>
          <span>{item.label}</span>
          {item.key && <span className="rounded-[6px] border border-[#e9eae6] px-1.5 py-0.5 text-[10px] text-[#646462]">{item.key}</span>}
        </button>
      ))}
    </div>
  );
}

interface AgentCatalogEntry {
  id: string;
  slug: string;
  name: string;
  description?: string;
  status?: string;
}

function AgentPickerField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [agents, setAgents] = useState<AgentCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Load agents once on mount
  useEffect(() => {
    setLoading(true);
    fetch('/api/workflows/agent-catalog')
      .then((r) => r.ok ? r.json() : [])
      .then((data: AgentCatalogEntry[]) => setAgents(Array.isArray(data) ? data : []))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Element)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedAgent = agents.find((a) => a.slug === value);
  const filtered = agents.filter((a) =>
    !query || a.name.toLowerCase().includes(query.toLowerCase()) || a.slug.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${className} flex w-full items-center justify-between text-left`}
      >
        <span className={selectedAgent ? 'text-[#1a1a1a]' : 'text-[#646462]'}>
          {loading ? 'Loading agents…' : selectedAgent ? (
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[13px] text-orange-400">smart_toy</span>
              <span>{selectedAgent.name}</span>
              <span className="text-[10px] text-[#646462]">({selectedAgent.slug})</span>
            </span>
          ) : value || placeholder || 'Select an AI Studio agent…'}
        </span>
        <span className="material-symbols-outlined text-[13px] text-[#646462]">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-[12px] border border-[#e9eae6] bg-white shadow-lg">
          <div className="sticky top-0 bg-white px-3 py-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents…"
              className="w-full rounded-[10px] border border-[#e9eae6] px-3 py-1.5 text-[13px] outline-none focus:border-[#d4d4d0]"
            />
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-[#646462]">
              {loading ? 'Loading…' : agents.length === 0 ? 'No agents found. Create one in AI Studio.' : 'No match'}
            </div>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { onChange(a.slug); setOpen(false); setQuery(''); }}
                className={`flex w-full flex-col items-start px-3 py-2 text-left text-[13px] hover:bg-orange-50 ${value === a.slug ? 'bg-orange-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[13px] text-orange-400">smart_toy</span>
                  <span className="font-medium text-[#1a1a1a]">{a.name}</span>
                  <span className="text-[10px] text-[#646462]">{a.slug}</span>
                  {a.status && a.status !== 'active' && (
                    <span className="rounded-full bg-[#f8f8f7] px-1.5 py-0.5 text-[9px] text-[#646462]">{a.status}</span>
                  )}
                </div>
                {a.description && (
                  <span className="ml-6 mt-0.5 text-[11px] text-[#646462] line-clamp-1">{a.description}</span>
                )}
              </button>
            ))
          )}
          {/* Manual entry option */}
          <div className="border-t border-[#f1f1ee] px-3 py-2">
            <button
              type="button"
              onClick={() => { onChange(query || value); setOpen(false); setQuery(''); }}
              className="flex items-center gap-2 text-[12px] text-[#646462] hover:text-[#1a1a1a]"
            >
              <span className="material-symbols-outlined text-[13px]">edit</span>
              Use custom slug: <span className="font-mono font-medium">{query || value || '…'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NodeConfigFields({ node, onConfig, size = 'lg' }: {
  node: WorkflowNode;
  onConfig: (key: string, value: string) => void;
  size?: 'sm' | 'lg';
}) {
  const fields = nodeFieldsForKey(node.key);
  const inputCls = size === 'lg'
    ? 'mt-2 w-full rounded-[12px] border border-[#e9eae6] px-3 py-2 text-[13px] outline-none focus:border-[#d4d4d0]'
    : 'mt-1.5 w-full rounded-[8px] border border-[#e9eae6] px-3 py-1.5 text-[13px] outline-none focus:border-[#d4d4d0]';

  // No schema defined → generic fallback for any existing config keys
  if (fields.length === 0) {
    const existingKeys = Object.keys(node.config ?? {}).filter((k) => k !== '_meta');
    if (existingKeys.length === 0) {
      return <div className="py-6 text-center text-[12px] text-[#646462]">No configuration required for this node.</div>;
    }
    return (
      <div className="space-y-3">
        {existingKeys.map((key) => (
          <label key={key} className="block">
            <span className="text-[12px] font-semibold capitalize text-[#646462]">{key}</span>
            <input value={node.config[key] ?? ''} onChange={(e) => onConfig(key, e.target.value)} className={inputCls} />
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <label key={field.key} className="block">
          <span className="text-[12px] font-semibold text-[#646462]">{field.label}</span>
          {field.hint && <span className="ml-2 text-[10px] text-[#646462]">{field.hint}</span>}
          {field.type === 'agent-picker' ? (
            <AgentPickerField
              value={node.config[field.key] ?? ''}
              onChange={(v) => onConfig(field.key, v)}
              placeholder={field.placeholder}
              className={inputCls}
            />
          ) : field.type === 'textarea' ? (
            <textarea
              value={node.config[field.key] ?? ''}
              onChange={(e) => onConfig(field.key, e.target.value)}
              placeholder={field.placeholder ?? `{{${field.key}}}`}
              rows={3}
              className={`${inputCls} resize-none`}
            />
          ) : field.type === 'select' && field.options ? (
            <select
              value={node.config[field.key] ?? ''}
              onChange={(e) => onConfig(field.key, e.target.value)}
              className={inputCls}
            >
              {field.options[0] !== '' && <option value="">Select…</option>}
              {field.options.map((opt) => (
                <option key={opt} value={opt}>{opt || '— none —'}</option>
              ))}
            </select>
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              value={node.config[field.key] ?? ''}
              onChange={(e) => onConfig(field.key, e.target.value)}
              placeholder={field.placeholder ?? `{{${field.key}}}`}
              className={inputCls}
            />
          )}
        </label>
      ))}
    </div>
  );
}

function WorkflowNodeEditorModal(props: {
  node: WorkflowNode;
  spec?: NodeSpec;
  mode: 'parameters' | 'settings';
  setMode: (mode: 'parameters' | 'settings') => void;
  latestStep?: any;
  connectors: any[];
  onClose: () => void;
  onExecute: () => void;
  onConfig: (key: string, value: string) => void;
  onUi: (patch: WorkflowNode['ui']) => void;
  onCredentials: (value: string | null) => void;
  onRetryPolicy: (patch: NonNullable<WorkflowNode['retryPolicy']>) => void;
  onToggle: () => void;
}) {
  const inputData = props.latestStep?.input ?? (props.node.type === 'trigger' ? { manual: true, source: 'builder' } : null);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-3 sm:p-5" onClick={props.onClose}>
      <div
        className="flex h-[94vh] w-[98vw] max-w-[1820px] flex-col overflow-hidden rounded-[28px] border border-[#e9eae6] bg-white shadow-[0_30px_100px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-16 items-center justify-between border-b border-[#e9eae6] px-6">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-orange-500">{props.spec?.icon ?? 'settings'}</span>
            <div>
              <div className="text-[13px] font-semibold text-[#1a1a1a]">{props.node.label}</div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-[#646462]">{props.node.key}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={props.onExecute} className="rounded-[10px] bg-[#ff4f3d] px-3 py-2 text-[12px] font-bold text-white shadow-sm">Execute step</button>
            <button onClick={props.onClose} className="rounded-[10px] border border-[#e9eae6] px-3 py-2 text-[12px] font-semibold text-[#1a1a1a] hover:bg-[#f8f8f7]">Close</button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-[1.15fr_0.95fr_1.1fr] overflow-hidden bg-white">
          <section className="border-r border-[#f1f1ee] bg-[#f8f8f7]/70">
            <div className="flex items-center gap-2 border-b border-[#e9eae6] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[#646462]">Input</div>
            <div className="p-5">
              <div className="flex items-center gap-2 pb-4">
                <button className="rounded-[8px] border border-[#e9eae6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1a1a1a] shadow-sm">Mapping</button>
                <button className="rounded-[8px] px-3 py-1.5 text-[12px] font-semibold text-[#646462] hover:bg-white">From AI</button>
              </div>
              <div className="min-h-[60vh] overflow-auto rounded-[14px] border border-[#e9eae6] bg-white p-4 text-[13px] text-[#646462]">
                {inputData ? (
                  <pre className="h-full whitespace-pre-wrap break-words text-left text-[12px] text-[#1a1a1a]">{JSON.stringify(inputData, null, 2)}</pre>
                ) : (
                  <div className="flex h-full min-h-[45vh] flex-col items-center justify-center text-center">
                    <span className="material-symbols-outlined mb-3 text-[28px]">input</span>
                    <b>Parent node hasn't run yet</b>
                    <p className="mt-2 max-w-xs">Run previous nodes or execute the workflow to view input data.</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="border-r border-[#f1f1ee] bg-white">
            <div className="flex h-16 items-center justify-between border-b border-[#e9eae6] px-5">
              <div className="flex gap-3">
                <button onClick={() => props.setMode('parameters')} className={`h-16 border-b-2 text-[13px] font-semibold ${props.mode === 'parameters' ? 'border-[#ff4f3d] text-[#ff4f3d]' : 'border-transparent text-[#646462]'}`}>Parameters</button>
                <button onClick={() => props.setMode('settings')} className={`h-16 border-b-2 text-[13px] font-semibold ${props.mode === 'settings' ? 'border-[#ff4f3d] text-[#ff4f3d]' : 'border-transparent text-[#646462]'}`}>Settings</button>
              </div>
            </div>
            <div className="h-[calc(100%-64px)] overflow-y-auto p-5">
              {props.mode === 'parameters' ? (
                <div className="space-y-4">
                  {props.spec?.description && (
                    <div className="rounded-[12px] border border-[#f1f1ee] bg-[#f8f8f7] px-3 py-2.5 text-[12px] text-[#646462]">{props.spec.description}</div>
                  )}
                  <NodeConfigFields node={props.node} onConfig={props.onConfig} size="lg" />
                  {props.node.type === 'integration' && (
                    <label className="block">
                      <span className="text-[12px] font-semibold text-[#646462]">Connection</span>
                      <select
                        value={props.node.credentialsRef ?? props.node.config.connector ?? ''}
                        onChange={(event) => props.onCredentials(event.target.value || null)}
                        className="mt-2 w-full rounded-[12px] border border-[#e9eae6] px-3 py-2 text-[13px] outline-none focus:border-[#d4d4d0]"
                      >
                        <option value="">Select connector...</option>
                        {props.connectors.map((connector) => (
                          <option key={connector.id} value={connector.id}>
                            {connector.name || connector.system || connector.id} · {connector.status || 'unknown'}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2 text-[11px] text-[#646462]">Secrets stay inside Integrations. Workflows only reference the connection.</div>
                    </label>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-[12px] font-semibold text-[#646462]">Notes</span>
                    <textarea value={props.node.ui?.notes ?? ''} onChange={(event) => props.onUi({ notes: event.target.value })} className="mt-2 h-28 w-full resize-none rounded-[12px] border border-[#e9eae6] px-3 py-2 text-[13px] outline-none focus:border-[#d4d4d0]" />
                  </label>
                  <label className="flex items-center justify-between text-[13px]">
                    <span>Display Note in Flow?</span>
                    <button onClick={() => props.onUi({ displayNote: !props.node.ui?.displayNote })} className={`h-6 w-11 rounded-full transition ${props.node.ui?.displayNote ? 'bg-[#1a1a1a]' : 'bg-[#e9eae6]'}`}>
                      <span className={`block h-5 w-5 rounded-full bg-white transition ${props.node.ui?.displayNote ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                  <button onClick={props.onToggle} className="w-full rounded-[12px] border border-[#e9eae6] px-3 py-2 text-[13px] font-semibold hover:bg-[#f8f8f7]">{props.node.disabled ? 'Activate node' : 'Deactivate node'}</button>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[12px] font-semibold text-[#646462]">Retries</span>
                      <input type="number" min={0} value={props.node.retryPolicy?.retries ?? ''} onChange={(event) => props.onRetryPolicy({ retries: Number(event.target.value || 0) })} className="mt-2 w-full rounded-[12px] border border-[#e9eae6] px-3 py-2 text-[13px] outline-none focus:border-[#d4d4d0]" />
                    </label>
                    <label className="block">
                      <span className="text-[12px] font-semibold text-[#646462]">Backoff ms</span>
                      <input type="number" min={0} value={props.node.retryPolicy?.backoffMs ?? ''} onChange={(event) => props.onRetryPolicy({ backoffMs: Number(event.target.value || 0) })} className="mt-2 w-full rounded-[12px] border border-[#e9eae6] px-3 py-2 text-[13px] outline-none focus:border-[#d4d4d0]" />
                    </label>
                  </div>
                  <div className="border-t border-[#f1f1ee] pt-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#646462] mb-3">System Controls</div>
                    <div className="space-y-4">
                      <label className="block">
                        <span className="text-[12px] font-semibold text-[#646462]">Idempotency Key (Template)</span>
                        <input 
                          value={props.node.config?.idempotencyKey ?? ''} 
                          onChange={(e) => props.onConfig('idempotencyKey', e.target.value)} 
                          placeholder="e.g. {{order.id}}:cancel"
                          className="mt-2 w-full rounded-[12px] border border-[#e9eae6] px-3 py-2 text-[13px] outline-none focus:border-[#d4d4d0]" 
                        />
                        <p className="mt-1.5 text-[10px] text-[#646462]">Prevents the node from running again if the key matches a previous execution in this context.</p>
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                          <span className="text-[12px] font-semibold text-[#646462]">Rate Limit Bucket</span>
                          <input 
                            value={props.node.config?.rateLimitBucket ?? ''} 
                            onChange={(e) => props.onConfig('rateLimitBucket', e.target.value)} 
                            placeholder="e.g. stripe_api"
                            className="mt-2 w-full rounded-[12px] border border-[#e9eae6] px-3 py-2 text-[13px] outline-none focus:border-[#d4d4d0]" 
                          />
                        </label>
                        <label className="block">
                          <span className="text-[12px] font-semibold text-[#646462]">Max / Session</span>
                          <input 
                            type="number"
                            value={props.node.config?.rateLimitLimit ?? ''} 
                            onChange={(e) => props.onConfig('rateLimitLimit', e.target.value)} 
                            placeholder="e.g. 5"
                            className="mt-2 w-full rounded-[12px] border border-[#e9eae6] px-3 py-2 text-[13px] outline-none focus:border-[#d4d4d0]" 
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-[#f1f1ee] pt-4 text-[12px] text-[#646462]">{props.node.key} node version 1.1</div>
                </div>
              )}
            </div>
          </section>

          <section className="bg-[#f8f8f7]/80">
            <div className="flex h-16 items-center justify-between border-b border-[#e9eae6] px-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#646462]">Output</div>
              <button onClick={props.onClose} className="rounded-[6px] p-1 text-[#646462] hover:bg-[#f8f8f7]"><span className="material-symbols-outlined text-[15px]">close</span></button>
            </div>
            <div className="flex h-[calc(100%-64px)] items-center justify-center p-8 text-center text-[13px] text-[#646462]">
              {props.latestStep ? (
                <div className="flex h-full w-full flex-col gap-3">
                  <div className="flex items-center justify-between rounded-[12px] border border-[#e9eae6] bg-white px-4 py-2 text-left text-[12px] text-[#646462]">
                    <span>Status: <b className="uppercase">{props.latestStep.status}</b></span>
                    <span>{props.latestStep.durationMs ?? props.latestStep.duration_ms ?? 0} ms</span>
                  </div>
                  <pre className="min-h-0 flex-1 overflow-auto rounded-[12px] border border-[#e9eae6] bg-white p-4 text-left text-[12px] text-[#1a1a1a]">{JSON.stringify(props.latestStep.output ?? props.latestStep, null, 2)}</pre>
                </div>
              ) : (
                <div>
                  <span className="material-symbols-outlined mb-3 text-[28px]">output</span>
                  <b className="block">No output data</b>
                  <p className="mt-2">Output will appear here once this node is run.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function WorkflowNodeEditorPanel(props: {
  node: WorkflowNode;
  spec?: NodeSpec;
  mode: 'parameters' | 'settings';
  setMode: (mode: 'parameters' | 'settings') => void;
  latestStep?: any;
  connectors: any[];
  onClose: () => void;
  onExecute: () => void;
  onConfig: (key: string, value: string) => void;
  onUi: (patch: WorkflowNode['ui']) => void;
  onCredentials: (value: string | null) => void;
  onRetryPolicy: (patch: NonNullable<WorkflowNode['retryPolicy']>) => void;
  onToggle: () => void;
}) {
  const inputData = props.latestStep?.input ?? (props.node.type === 'trigger' ? { manual: true, source: 'builder' } : null);
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 h-[42%] border-t border-[#e9eae6] bg-white shadow-2xl">
      <div className="flex h-full">
        <section className="w-[38%] border-r border-[#f1f1ee] bg-[#f8f8f7]">
          <div className="flex h-10 items-center gap-2 border-b border-[#e9eae6] px-4">
            <span className="material-symbols-outlined text-orange-500">{props.spec?.icon ?? 'settings'}</span>
            <span className="font-semibold text-[#1a1a1a]">{props.node.label}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-3">
            <button className="rounded-[8px] bg-white px-3 py-1.5 text-[12px] font-semibold shadow-sm">Mapping</button>
            <button className="rounded-[8px] px-3 py-1.5 text-[12px] font-semibold text-[#646462] hover:bg-white">From AI</button>
          </div>
          <div className="h-[calc(100%-88px)] overflow-auto p-4 text-[13px] text-[#646462]">
            {inputData ? (
              <pre className="h-full rounded-[12px] border border-[#e9eae6] bg-white p-4 text-left text-[12px] text-[#1a1a1a]">{JSON.stringify(inputData, null, 2)}</pre>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <span className="material-symbols-outlined mb-3 text-[28px]">input</span>
                <b>Parent node hasn't run yet</b>
                <p className="mt-2 max-w-xs">Run previous nodes or execute the workflow to view input data.</p>
              </div>
            )}
          </div>
        </section>
        <section className="w-[24%] border-r border-[#f1f1ee] bg-white">
          <div className="flex h-10 items-center justify-between border-b border-[#e9eae6] px-4">
            <div className="flex gap-3">
              <button onClick={() => props.setMode('parameters')} className={`h-10 border-b-2 text-[13px] font-semibold ${props.mode === 'parameters' ? 'border-[#ff4f3d] text-[#ff4f3d]' : 'border-transparent text-[#646462]'}`}>Parameters</button>
              <button onClick={() => props.setMode('settings')} className={`h-10 border-b-2 text-[13px] font-semibold ${props.mode === 'settings' ? 'border-[#ff4f3d] text-[#ff4f3d]' : 'border-transparent text-[#646462]'}`}>Settings</button>
            </div>
            <button onClick={props.onExecute} className="rounded-[8px] bg-[#ff4f3d] px-3 py-1.5 text-[12px] font-bold text-white">Execute step</button>
          </div>
          <div className="h-[calc(100%-40px)] overflow-y-auto p-4">
            {props.mode === 'parameters' ? (
              <div className="space-y-3">
                {props.spec?.description && (
                  <div className="rounded-[8px] border border-[#f1f1ee] bg-[#f8f8f7] px-3 py-2 text-[12px] text-[#646462]">{props.spec.description}</div>
                )}
                <NodeConfigFields node={props.node} onConfig={props.onConfig} size="sm" />
                {props.node.type === 'integration' && (
                  <label className="block">
                    <span className="text-[12px] font-semibold text-[#646462]">Connection</span>
                    <select
                      value={props.node.credentialsRef ?? props.node.config.connector ?? ''}
                      onChange={(event) => props.onCredentials(event.target.value || null)}
                      className="mt-2 w-full rounded-[8px] border border-[#e9eae6] px-3 py-2 text-[13px] outline-none focus:border-[#d4d4d0]"
                    >
                      <option value="">Select connector...</option>
                      {props.connectors.map((connector) => (
                        <option key={connector.id} value={connector.id}>
                          {connector.name || connector.system || connector.id} · {connector.status || 'unknown'}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-[11px] text-[#646462]">Secrets stay inside Integrations. Workflows only reference the connection.</div>
                  </label>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block">
                  <span className="text-[12px] font-semibold text-[#646462]">Notes</span>
                  <textarea value={props.node.ui?.notes ?? ''} onChange={(event) => props.onUi({ notes: event.target.value })} className="mt-2 h-24 w-full resize-none rounded-[8px] border border-[#e9eae6] px-3 py-2 text-[13px] outline-none focus:border-[#d4d4d0]" />
                </label>
                <label className="flex items-center justify-between text-[13px]">
                  <span>Display Note in Flow?</span>
                  <button onClick={() => props.onUi({ displayNote: !props.node.ui?.displayNote })} className={`h-6 w-11 rounded-full transition ${props.node.ui?.displayNote ? 'bg-[#1a1a1a]' : 'bg-[#e9eae6]'}`}>
                    <span className={`block h-5 w-5 rounded-full bg-white transition ${props.node.ui?.displayNote ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </label>
                <button onClick={props.onToggle} className="w-full rounded-[8px] border border-[#e9eae6] px-3 py-2 text-[13px] font-semibold hover:bg-[#f8f8f7]">{props.node.disabled ? 'Activate node' : 'Deactivate node'}</button>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[12px] font-semibold text-[#646462]">Retries</span>
                    <input type="number" min={0} value={props.node.retryPolicy?.retries ?? ''} onChange={(event) => props.onRetryPolicy({ retries: Number(event.target.value || 0) })} className="mt-2 w-full rounded-[8px] border border-[#e9eae6] px-3 py-2 text-[13px] outline-none focus:border-[#d4d4d0]" />
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-semibold text-[#646462]">Backoff ms</span>
                    <input type="number" min={0} value={props.node.retryPolicy?.backoffMs ?? ''} onChange={(event) => props.onRetryPolicy({ backoffMs: Number(event.target.value || 0) })} className="mt-2 w-full rounded-[8px] border border-[#e9eae6] px-3 py-2 text-[13px] outline-none focus:border-[#d4d4d0]" />
                  </label>
                </div>
                <div className="border-t border-[#f1f1ee] pt-4 text-[12px] text-[#646462]">{props.node.key} node version 1.0</div>
              </div>
            )}
          </div>
        </section>
        <section className="flex-1 bg-[#f8f8f7]">
          <div className="flex h-10 items-center justify-between border-b border-[#e9eae6] px-4">
            <div className="text-[12px] font-bold uppercase tracking-[0.25em] text-[#646462]">Output</div>
            <button onClick={props.onClose} className="rounded-[6px] p-1 text-[#646462] hover:bg-[#f8f8f7]"><span className="material-symbols-outlined text-[15px]">close</span></button>
          </div>
          <div className="flex h-[calc(100%-40px)] items-center justify-center p-8 text-center text-[13px] text-[#646462]">
            {props.latestStep ? (
              <div className="flex h-full w-full flex-col gap-3">
                <div className="flex items-center justify-between rounded-[12px] border border-[#e9eae6] bg-white px-4 py-2 text-left text-[12px] text-[#646462]">
                  <span>Status: <b className="uppercase">{props.latestStep.status}</b></span>
                  <span>{props.latestStep.durationMs ?? props.latestStep.duration_ms ?? 0} ms</span>
                </div>
                <pre className="min-h-0 flex-1 overflow-auto rounded-[12px] border border-[#e9eae6] bg-white p-4 text-left text-[12px] text-[#1a1a1a]">{JSON.stringify(props.latestStep.output ?? props.latestStep, null, 2)}</pre>
              </div>
            ) : (
              <div>
                <span className="material-symbols-outlined mb-3 text-[28px]">output</span>
                <b className="block">No output data</b>
                <p className="mt-2">Output will appear here once this node is run.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function WorkflowOverview(props: {
  workflow: Workflow | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  runResult: any;
  dryRun: any;
  validation: any;
  setWorkflow: React.Dispatch<React.SetStateAction<Workflow | null>>;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8 rounded-[14px] border border-[#e9eae6] bg-white p-6 shadow-card dark:border-[#1a1a1a] dark:bg-card-dark">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#646462]">Workflow purpose</div>
          <textarea
            value={props.workflow?.description ?? ''}
            onChange={(event) => props.setWorkflow((workflow) => workflow ? { ...workflow, description: event.target.value } : workflow)}
            className="mt-3 min-h-32 w-full resize-none rounded-[12px] border border-[#e9eae6] bg-[#f8f8f7] p-4 text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-black/10 dark:border-[#1a1a1a] dark:bg-[#1a1a1a]"
          />
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {props.workflow?.metrics.map((metric) => (
              <div key={metric.label} className="rounded-[12px] border border-[#f1f1ee] p-4 dark:border-[#1a1a1a]">
                <div className="text-[20px] font-bold text-[#1a1a1a] dark:text-white">{metric.value}</div>
                <div className="mt-1 text-[12px] text-[#646462]">{metric.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="xl:col-span-4 space-y-4">
          <div className="rounded-[14px] border border-[#e9eae6] bg-white p-5 shadow-card dark:border-[#1a1a1a] dark:bg-card-dark">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#646462]">Validation</div>
            <div className="mt-3 space-y-2 text-[13px]">
              <div className="flex items-center justify-between"><span>Nodes</span><b>{props.nodes.length}</b></div>
              <div className="flex items-center justify-between"><span>Connections</span><b>{props.edges.length}</b></div>
              <div className="flex items-center justify-between"><span>Disabled</span><b>{props.nodes.filter((node) => node.disabled).length}</b></div>
              <div className="flex items-center justify-between"><span>Blockers</span><b>{props.validation?.errors?.length ?? 0}</b></div>
            </div>
            {props.validation?.diagnostics?.length > 0 && (
              <div className="mt-4 space-y-2">
                {props.validation.diagnostics.slice(0, 5).map((diagnostic: WorkflowDiagnostic, index: number) => (
                  <div key={`${diagnostic.code}-${index}`} className={`rounded-[10px] px-3 py-2 text-[12px] ${diagnostic.severity === 'error' ? 'bg-red-50 text-red-700' : diagnostic.severity === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-[#f8f8f7] text-[#646462]'}`}>
                    {diagnostic.message}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-[14px] border border-[#e9eae6] bg-white p-5 shadow-card dark:border-[#1a1a1a] dark:bg-card-dark">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#646462]">Latest result</div>
            <div className="mt-3 text-[13px] font-bold text-[#1a1a1a] dark:text-white">{props.runResult?.status ?? props.dryRun?.summary ?? 'No execution yet'}</div>
            {props.runResult?.error && <div className="mt-2 text-[12px] text-red-600">{props.runResult.error}</div>}
          </div>
          <div className="rounded-[14px] border border-[#e9eae6] bg-white p-5 shadow-card dark:border-[#1a1a1a] dark:bg-card-dark">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#646462]">Versions</div>
            <div className="mt-3 space-y-2">
              {(props.workflow?.versions ?? []).slice(0, 5).map((version: any) => (
                <div key={version.id} className="flex items-center justify-between rounded-[10px] bg-[#f8f8f7] px-3 py-2 text-[12px]">
                  <span>v{version.version_number}</span>
                  <span className="font-bold uppercase text-[#646462]">{version.status}</span>
                </div>
              ))}
              {!(props.workflow?.versions ?? []).length && <div className="text-[13px] text-[#646462]">No version history yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowRuns(props: { runResult: any; dryRun: any; selectedWorkflow: Workflow | null; onRetry: () => void; onResume: () => void; onCancel: () => void; onViewSteps: (id: string) => void }) {
  const rows = props.runResult?.steps ?? props.dryRun?.steps ?? props.selectedWorkflow?.recentRuns ?? [];
  const statusTone = (status: string) => {
    if (['completed', 'resumed'].includes(status)) return 'bg-green-50 text-green-700';
    if (['failed', 'blocked', 'cancelled'].includes(status)) return 'bg-red-50 text-red-700';
    if (['waiting', 'waiting_approval', 'paused'].includes(status)) return 'bg-amber-50 text-amber-700';
    if (status === 'skipped') return 'bg-[#f8f8f7] text-[#646462]';
    return 'bg-blue-50 text-blue-700';
  };
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="rounded-[14px] border border-[#e9eae6] bg-white shadow-card dark:border-[#1a1a1a] dark:bg-card-dark">
        <div className="flex items-center justify-between border-b border-[#f1f1ee] px-6 py-4 dark:border-[#1a1a1a]">
          <div>
            <h3 className="font-bold text-[#1a1a1a] dark:text-white">Execution timeline</h3>
            <p className="mt-1 text-[12px] text-[#646462]">Dry-runs, real runs, waiting approvals and node-level status.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={props.onResume} disabled={!(props.runResult?.id ?? props.selectedWorkflow?.recentRuns?.[0]?.id)} className="rounded-[10px] border border-[#e9eae6] px-3 py-1.5 text-[12px] font-bold text-[#1a1a1a] hover:bg-[#f8f8f7] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#1a1a1a] dark:text-[#e9eae6] dark:hover:bg-[#1a1a1a]">Resume</button>
            <button onClick={props.onCancel} disabled={!(props.runResult?.id ?? props.selectedWorkflow?.recentRuns?.[0]?.id)} className="rounded-[10px] border border-[#e9eae6] px-3 py-1.5 text-[12px] font-bold text-[#1a1a1a] hover:bg-[#f8f8f7] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#1a1a1a] dark:text-[#e9eae6] dark:hover:bg-[#1a1a1a]">Cancel</button>
            <button onClick={props.onRetry} disabled={!(props.runResult?.id ?? props.selectedWorkflow?.recentRuns?.[0]?.id)} className="rounded-[10px] border border-[#e9eae6] px-3 py-1.5 text-[12px] font-bold text-[#1a1a1a] hover:bg-[#f8f8f7] disabled:cursor-not-allowed disabled:opacity-40 dark:border-[#1a1a1a] dark:text-[#e9eae6] dark:hover:bg-[#1a1a1a]">
              Retry latest
            </button>
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((step: any, index: number) => (
            <div key={step.id ?? step.nodeId ?? index} className="grid grid-cols-12 gap-4 px-6 py-4 text-[13px]">
              <div className="col-span-5 flex items-center gap-3 font-bold text-[#1a1a1a] dark:text-white">
                <span className={`h-3 w-3 rounded-full ${statusTone(String(step.status)).split(' ')[0]}`} />
                {step.label ?? step.node_id ?? `Step ${index + 1}`}
              </div>
              <div className="col-span-3 text-[#646462]">{step.node_type ?? step.type ?? step.key ?? 'workflow'}</div>
              <div className="col-span-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${statusTone(String(step.status))}`}>{step.status}</span></div>
              <div className="col-span-2 text-right text-[#646462]">
                {step.steps === undefined && step.workflow_version_id ? (
                  <button onClick={() => props.onViewSteps(step.id)} className="text-[12px] font-bold text-[#1a1a1a] underline-offset-2 hover:underline dark:text-[#e9eae6]">View steps</button>
                ) : (
                  step.error ?? step.output?.reason ?? step.started_at ?? ''
                )}
              </div>
            </div>
          ))}
          {!rows.length && <div className="px-6 py-10 text-[13px] text-[#646462]">No workflow runs yet. Run a dry-run or execute the published workflow.</div>}
        </div>
      </div>
    </div>
  );
}

function WorkflowEvaluations({ workflow }: { workflow: Workflow | null }) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="rounded-[14px] border border-dashed border-[#e9eae6] bg-white p-10 text-center shadow-card">
        <span className="material-symbols-outlined text-4xl text-[#646462]">fact_check</span>
        <h3 className="mt-3 text-[15px] font-bold text-[#1a1a1a]">Evaluations are ready for this workflow</h3>
        <p className="mx-auto mt-2 max-w-xl text-[13px] text-[#646462]">
          Once evaluation metrics are connected, this tab will show test scenarios, pass rates and regression history for {workflow?.name ?? 'this workflow'}.
        </p>
      </div>
    </div>
  );
}

function WorkflowActionDialog(props: {
  open: boolean;
  state: WorkflowActionDialogState | null;
  workflow: Workflow | null;
  onClose: () => void;
  onChange: (value: string) => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  if (!props.open || !props.state) return null;

  const titleByKind: Record<WorkflowActionDialogState['kind'], string> = {
    rename: 'Rename workflow',
    description: 'Edit description',
    move: 'Move to category',
    import_url: 'Import from URL',
    archive: 'Archive workflow',
  };

  const bodyByKind: Record<WorkflowActionDialogState['kind'], string> = {
    rename: 'Update the workflow name shown in the library and editor.',
    description: 'Keep this concise and operational so people understand when to use it.',
    move: 'Reclassify this workflow so it appears in the right operational lane.',
    import_url: 'Load a workflow JSON document from a direct URL.',
    archive: 'Archive this workflow version and keep the audit trail in place.',
  };

  if (props.state.kind === 'archive') {
    const workflow = props.workflow;
    return (
      <ActionModal
        open={props.open}
        onClose={props.onClose}
        onConfirm={props.onConfirm}
        loading={props.loading}
        variant="danger"
        icon="inventory_2"
        title="Archive Workflow"
        subtitle="Permanently disable this workflow version while preserving history."
        context={[
          { label: 'Workflow ID', value: workflow?.id.slice(0, 8) ?? 'N/A' },
          { label: 'Name', value: workflow?.name ?? 'Untitled' },
          { label: 'Category', value: workflow?.category ?? 'General' },
          { label: 'Status', value: 'Active' },
        ]}
        steps={[
          { text: 'Disable all triggers', detail: 'This workflow will no longer respond to events or schedules.' },
          { text: 'Release resources', detail: 'Any pending executions or queue items will be cancelled.' },
          { text: 'Preserve audit trail', detail: 'Historical runs and version history will remain available for compliance.' },
        ]}
        considerations={[
          { text: 'Archiving is reversible, but may disrupt ongoing operations if other systems depend on this workflow\'s outputs.' }
        ]}
        confirmLabel="Archive Workflow"
      />
    );
  }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} className="w-full max-w-xl rounded-[16px] border border-[#e9eae6] bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#646462]">Workflow action</div>
              <h3 className="mt-2 text-[20px] font-semibold text-[#1a1a1a]">{titleByKind[props.state.kind]}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[#646462]">{bodyByKind[props.state.kind]}</p>
            </div>
            <button onClick={props.onClose} className="rounded-[12px] p-2 text-[#646462] transition hover:bg-[#f8f8f7]">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {props.state.kind === 'rename' && (
            <input
              value={props.state.value}
              onChange={(event) => props.onChange(event.target.value)}
              className="mt-6 w-full rounded-[14px] border border-[#e9eae6] bg-[#f8f8f7] px-4 py-3 text-[13px] text-[#1a1a1a] outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Workflow name"
            />
          )}

          {props.state.kind === 'description' && (
            <textarea
              value={props.state.value}
              onChange={(event) => props.onChange(event.target.value)}
              className="mt-6 min-h-36 w-full rounded-[14px] border border-[#e9eae6] bg-[#f8f8f7] px-4 py-3 text-[13px] leading-relaxed text-[#1a1a1a] outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Describe what this workflow automates and when teams should use it."
            />
          )}

          {props.state.kind === 'import_url' && (
            <input
              value={props.state.value}
              onChange={(event) => props.onChange(event.target.value)}
              className="mt-6 w-full rounded-[14px] border border-[#e9eae6] bg-[#f8f8f7] px-4 py-3 text-[13px] text-[#1a1a1a] outline-none focus:ring-2 focus:ring-black/10"
              placeholder="https://example.com/workflow.json"
            />
          )}

          {props.state.kind === 'move' && (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {WORKFLOW_CATEGORY_ORDER.map((category) => {
                const active = props.state.kind === 'move' && normalizeWorkflowCategory(props.state.value) === category;
                const meta = WORKFLOW_CATEGORY_META[category];
                return (
                  <button
                    key={category}
                    onClick={() => props.onChange(category)}
                    className={`rounded-[14px] border px-4 py-4 text-left transition ${active ? 'border-black bg-[#f8f8f7]' : 'border-[#e9eae6] bg-white hover:bg-[#f8f8f7]'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[14px] text-[#1a1a1a]">{meta.icon}</span>
                      <div className="text-[13px] font-semibold text-[#1a1a1a]">{category}</div>
                    </div>
                    <div className="mt-2 text-[12px] leading-relaxed text-[#646462]">{meta.subtitle}</div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-3">
            <button onClick={props.onClose} className="rounded-full border border-[#e9eae6] px-4 py-2 text-[13px] font-medium text-[#646462] transition hover:bg-[#f8f8f7]">
              Cancel
            </button>
            <button onClick={props.onConfirm} className="rounded-full bg-black px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90">
              {props.state.kind === 'import_url'
                ? 'Import'
                : props.state.kind === 'move'
                  ? 'Move'
                  : 'Save'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function TemplateModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (template: typeof TEMPLATES[number]) => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-[14px] border border-[#e9eae6] bg-white p-6 shadow-2xl dark:border-[#1a1a1a] dark:bg-card-dark">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-bold text-[#1a1a1a] dark:text-white">Workflow templates</h3>
                <p className="text-[13px] text-[#646462]">Start from an operational pattern built for CRM-AI.</p>
              </div>
              <button onClick={onClose} className="rounded-[10px] p-2 text-[#646462] hover:bg-[#f8f8f7] dark:hover:bg-[#1a1a1a]">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {TEMPLATES.map((template) => (
                <button key={template.id} onClick={() => onCreate(template)} className="rounded-[12px] border border-[#e9eae6] p-4 text-left transition hover:border-black hover:bg-[#f8f8f7] dark:border-[#1a1a1a] dark:hover:bg-[#1a1a1a]">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#646462]">{template.category}</div>
                  <div className="font-bold text-[#1a1a1a] dark:text-white">{template.label}</div>
                  <div className="mt-2 text-[12px] leading-relaxed text-[#646462]">{template.description}</div>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
