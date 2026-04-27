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
import { connectorsApi, workflowsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import type { NavigateFn } from '../types';
import LoadingState from './LoadingState';

type WorkflowView = 'list' | 'builder';
type WorkflowTab = 'overview' | 'builder' | 'runs' | 'evaluations';
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

interface NodeSpec {
  type: NodeType;
  key: string;
  label: string;
  category: string;
  icon: string;
  requiresConfig?: boolean;
  sensitive?: boolean;
  description?: string;
}

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
  { type: 'trigger', key: 'payment.dispute.created', label: 'Payment dispute created', category: 'Trigger', icon: 'report', description: 'Starts when a payment dispute appears.' },
  { type: 'trigger', key: 'shipment.updated', label: 'Shipment updated', category: 'Trigger', icon: 'local_shipping', description: 'Starts when shipment status changes.' },
  { type: 'trigger', key: 'manual.run', label: 'Manual run', category: 'Trigger', icon: 'play_arrow', description: 'Starts when a user runs it.' },
  { type: 'condition', key: 'amount.threshold', label: 'Amount threshold', category: 'Flow', icon: 'alt_route', requiresConfig: true, description: 'Branch based on a numeric amount.' },
  { type: 'condition', key: 'status.matches', label: 'Status matches', category: 'Flow', icon: 'rule', requiresConfig: true, description: 'Branch based on status.' },
  { type: 'condition', key: 'risk.level', label: 'Risk level', category: 'Flow', icon: 'gpp_maybe', requiresConfig: true, description: 'Branch based on risk.' },
  { type: 'condition', key: 'conflict.exists', label: 'Conflict exists', category: 'Flow', icon: 'sync_problem', description: 'Branch if a conflict exists.' },
  { type: 'condition', key: 'flow.if', label: 'If', category: 'Flow', icon: 'question_mark', requiresConfig: true, description: 'Route items to different branches (true/false).' },
  { type: 'condition', key: 'flow.filter', label: 'Filter', category: 'Flow', icon: 'filter_alt', requiresConfig: true, description: 'Keep only items matching a condition.' },
  { type: 'condition', key: 'flow.switch', label: 'Switch', category: 'Flow', icon: 'shuffle', requiresConfig: true, description: 'Route items to different branches by rules.' },
  { type: 'condition', key: 'flow.compare', label: 'Compare datasets', category: 'Flow', icon: 'compare_arrows', requiresConfig: true, description: 'Compare two inputs and branch on the result.' },
  { type: 'condition', key: 'flow.branch', label: 'Branch', category: 'Flow', icon: 'account_tree', requiresConfig: true, description: 'Split one flow into multiple routes.' },
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
  { type: 'utility', key: 'data.pick_fields', label: 'Pick fields', category: 'Data transformation', icon: 'select_all', requiresConfig: true, description: 'Keep only selected fields from a payload.' },
  { type: 'utility', key: 'data.merge_objects', label: 'Merge objects', category: 'Data transformation', icon: 'join_inner', requiresConfig: true, description: 'Merge multiple objects into one payload.' },
  { type: 'utility', key: 'data.validate_required', label: 'Validate required fields', category: 'Data transformation', icon: 'fact_check', requiresConfig: true, description: 'Block the flow if required fields are missing.' },
  { type: 'utility', key: 'data.calculate', label: 'Calculate value', category: 'Data transformation', icon: 'calculate', requiresConfig: true, description: 'Compute a numeric value from workflow data.' },
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
  { type: 'agent', key: 'agent.run', label: 'AI Agent', category: 'AI', icon: 'smart_toy', requiresConfig: true, description: 'Run a specialist CRM-AI agent.' },
  { type: 'agent', key: 'agent.classify', label: 'Classify case', category: 'AI', icon: 'category', requiresConfig: true, description: 'Classify intent, priority, or risk from context.' },
  { type: 'agent', key: 'agent.sentiment', label: 'Analyze sentiment', category: 'AI', icon: 'sentiment_satisfied', requiresConfig: true, description: 'Detect sentiment and frustration signals.' },
  { type: 'agent', key: 'agent.summarize', label: 'Summarize context', category: 'AI', icon: 'summarize', requiresConfig: true, description: 'Create a concise operational summary.' },
  { type: 'agent', key: 'agent.draft_reply', label: 'Draft reply', category: 'AI', icon: 'edit_square', requiresConfig: true, description: 'Draft a customer-ready response.' },
  { type: 'agent', key: 'ai.generate_text', label: 'Generate text (LLM)', category: 'AI', icon: 'auto_awesome', requiresConfig: true, description: 'Generate text using Gemini LLM from a prompt.' },
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
    category: 'Refunds',
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
    category: 'Orders',
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
    category: 'Payments',
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
    category: 'Flow',
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
    category: 'Cases',
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
    category: 'Operations',
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
    category: 'Returns',
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
    category: 'Risk',
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
    category: 'Agents',
    description: 'Run a specialist agent, check confidence, and escalate when needed.',
    nodes: [
      { type: 'trigger', key: 'case.created', label: 'Case created', position: { x: 110, y: 260 } },
      { type: 'agent', key: 'agent.run', label: 'AI Agent', position: { x: 420, y: 220 }, config: { agent: 'triage-agent' } },
      { type: 'knowledge', key: 'knowledge.search', label: 'Search knowledge', position: { x: 720, y: 390 }, config: { query: '{{case.intent}}' } },
      { type: 'condition', key: 'risk.level', label: 'High risk?', position: { x: 780, y: 200 }, config: { field: 'agent.risk_level', value: 'high' } },
      { type: 'action', key: 'approval.create', label: 'Request approval', position: { x: 1120, y: 200 }, config: { queue: 'manager' } },
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
const ADD_GROUPS = ['AI', 'Action', 'Data transformation', 'Flow', 'Core', 'Human review', 'Integration', 'Knowledge', 'Trigger'] as const;

const CATEGORY_META: Record<string, { title: string; subtitle: string; icon: string }> = {
  AI: { title: 'AI', subtitle: 'Build specialist agents and context-aware assistive steps.', icon: 'smart_toy' },
  Action: { title: 'Action', subtitle: 'Write into cases, orders, payments, returns, and more.', icon: 'bolt' },
  'Data transformation': { title: 'Data transformation', subtitle: 'Map, clean, reshape, and prepare workflow data.', icon: 'transform' },
  Flow: { title: 'Flow', subtitle: 'Branch, merge, loop, wait, and coordinate execution.', icon: 'account_tree' },
  Core: { title: 'Core', subtitle: 'Policies, utilities, and internal system controls.', icon: 'shield' },
  'Human review': { title: 'Human review', subtitle: 'Pause for approvals and manual decisions.', icon: 'verified' },
  Integration: { title: 'Integration', subtitle: 'Call connectors and external capabilities.', icon: 'hub' },
  Knowledge: { title: 'Knowledge', subtitle: 'Search SOPs, policies, and product knowledge.', icon: 'menu_book' },
  Trigger: { title: 'Trigger', subtitle: 'Start workflows from events or manual runs.', icon: 'play_circle' },
};

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
  const currentVersion = rawVersion ? {
    ...rawVersion,
    nodes: normalizeNodes(rawVersion.nodes ?? w.nodes ?? []),
    edges: normalizeEdges(rawVersion.edges ?? w.edges ?? []),
    trigger: parseMaybeJsonObject(rawVersion.trigger ?? w.trigger ?? {}),
  } : null;
  return {
    id: w.id,
    name: w.name,
    category: w.category || 'General',
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
    agent: 'border-gray-200 bg-white text-gray-800',
    policy: 'border-slate-200 bg-white text-slate-800',
    knowledge: 'border-cyan-200 bg-white text-cyan-700',
    integration: 'border-orange-200 bg-white text-orange-700',
    utility: 'border-gray-200 bg-white text-gray-700',
  };
  return tones[type] ?? tones.action;
}

function categoryForSpec(spec: NodeSpec) {
  if (spec.key.startsWith('data.')) return 'Data transformation';
  if (spec.type === 'agent') return 'AI';
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
    Flow: [
      { title: 'Popular', items: pick(['flow.filter', 'flow.if', 'flow.loop', 'flow.merge']) },
      { title: 'Other', items: pick(['flow.compare', 'flow.branch', 'flow.switch', 'flow.wait', 'flow.subworkflow', 'flow.stop_error', 'flow.noop']) },
    ],
    'Data transformation': [
      { title: 'Popular', items: pick(['data.set_fields', 'data.pick_fields', 'data.map_fields', 'data.validate_required']) },
      { title: 'Other', items: pick(['data.rename_fields', 'data.merge_objects', 'data.calculate', 'data.extract_json', 'data.normalize_text', 'data.format_date', 'data.split_items', 'data.dedupe']) },
    ],
    AI: [
      { title: 'Popular', items: pick(['agent.run', 'agent.classify', 'agent.draft_reply']) },
      { title: 'Other', items: pick(['agent.sentiment', 'agent.summarize', 'knowledge.search']) },
    ],
    Action: [
      { title: 'Cases', items: pick(['case.assign', 'case.update_status', 'case.set_priority', 'case.add_tag', 'case.reply', 'case.note']) },
      { title: 'Orders', items: pick(['order.hold', 'order.release', 'order.cancel']) },
      { title: 'Payments', items: pick(['payment.refund', 'payment.mark_dispute']) },
      { title: 'Returns', items: pick(['return.create', 'return.approve', 'return.reject']) },
    ],
    'Human review': [
      { title: 'Approvals', items: pick(['approval.create', 'approval.escalate']) },
    ],
    Core: [
      { title: 'Policy', items: pick(['policy.evaluate', 'core.idempotency_check', 'core.rate_limit']) },
      { title: 'Runtime', items: pick(['core.audit_log', 'stop', 'retry', 'delay']) },
    ],
    Integration: [
      { title: 'Connectors', items: pick(['connector.check_health', 'connector.call', 'connector.emit_event']) },
    ],
    Knowledge: [
      { title: 'Knowledge', items: pick(['knowledge.search', 'knowledge.validate_policy', 'knowledge.attach_evidence']) },
    ],
    Trigger: [
      { title: 'Support', items: pick(['manual.run', 'case.created', 'case.updated', 'message.received', 'sla.breached']) },
      { title: 'Commerce', items: pick(['order.updated', 'shipment.updated', 'payment.failed', 'payment.dispute.created', 'return.created']) },
      { title: 'System', items: pick(['customer.updated', 'approval.decided', 'webhook.received']) },
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

function getCategoryOverview(catalog: NodeSpec[]) {
  return ADD_GROUPS.map((category) => {
    const items = catalog.filter((spec) => categoryForSpec(spec) === category);
    const meta = CATEGORY_META[category] ?? { title: category, subtitle: 'Browse available blocks.', icon: 'grid_view' };
    return { category, ...meta, count: items.length, items };
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
        : 'border-gray-200 ring-gray-100';

  if (node.type === 'trigger') {
    return (
      <div className={`group relative flex flex-col items-center ${node.disabled ? 'opacity-45' : ''}`}>
        <span className="absolute -left-7 top-12 material-symbols-outlined text-sm text-red-400">bolt</span>
        <button
          onClick={() => data.onSelect(node.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            data.onMenu(node.id, { x: event.clientX, y: event.clientY });
          }}
          className={`relative flex h-28 w-28 items-center justify-center rounded-[28px] border bg-white shadow-sm transition hover:shadow-md ${data.selected ? 'ring-4 ring-gray-200' : ''} ${statusTone}`}
        >
          <Handle type="source" id="main" position={Position.Right} className="!h-4 !w-4 !border-gray-400 !bg-white" />
          <span className="material-symbols-outlined text-5xl text-gray-700">{data.spec?.icon ?? 'chat'}</span>
          {blockingDiagnostic && <NodeDiagnosticDot tone="error" />}
          {!blockingDiagnostic && warningDiagnostic && <NodeDiagnosticDot tone="warning" />}
        </button>
        <div className="mt-3 max-w-40 text-center text-base font-semibold leading-tight text-gray-900">{node.label}</div>
        <NodeInlineControls data={data} />
      </div>
    );
  }

  if (isCompact) {
    return (
      <div className={`group relative flex flex-col items-center ${node.disabled ? 'opacity-45' : ''}`}>
        <Handle type="target" id="main" position={Position.Top} className="!h-4 !w-4 !rotate-45 !rounded-none !border-gray-400 !bg-white" />
        <button
          onClick={() => data.onSelect(node.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            data.onMenu(node.id, { x: event.clientX, y: event.clientY });
          }}
          className={`flex h-24 w-24 items-center justify-center rounded-full border bg-white shadow-sm transition hover:shadow-md ${data.selected ? 'ring-4 ring-gray-200' : ''} ${statusTone}`}
        >
          <span className={`material-symbols-outlined text-4xl ${node.type === 'integration' ? 'text-orange-500' : 'text-gray-700'}`}>{data.spec?.icon ?? 'settings'}</span>
          {blockingDiagnostic && <NodeDiagnosticDot tone="error" />}
          {!blockingDiagnostic && warningDiagnostic && <NodeDiagnosticDot tone="warning" />}
        </button>
        <Handle type="source" id="main" position={Position.Bottom} className="!h-4 !w-4 !rotate-45 !rounded-none !border-gray-400 !bg-white" />
        <div className="mt-3 max-w-44 text-center text-sm font-semibold text-gray-900">{node.label}</div>
        {node.ui?.displayNote && node.ui?.notes && <div className="mt-1 max-w-44 text-center text-[11px] text-gray-500">{node.ui.notes}</div>}
        <NodeInlineControls data={data} />
      </div>
    );
  }

  return (
    <div className={`group relative ${node.disabled ? 'opacity-45' : ''}`}>
      <Handle type="target" id="main" position={Position.Left} className="!h-4 !w-4 !border-gray-400 !bg-white" />
      <button
        onClick={() => data.onSelect(node.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          data.onMenu(node.id, { x: event.clientX, y: event.clientY });
        }}
        className={`relative min-h-24 w-72 rounded-xl border bg-white px-5 py-4 text-left shadow-sm transition hover:shadow-md ${data.selected ? 'ring-4 ring-gray-200' : ''} ${statusTone}`}
      >
        <div className="flex items-center gap-4">
          <span className={`material-symbols-outlined text-5xl ${nodeTone(node.type).split(' ').at(-1)}`}>{data.spec?.icon ?? 'settings'}</span>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-gray-900">{node.label}</div>
            <div className="mt-1 text-xs text-gray-500">{node.key}</div>
          </div>
        </div>
        {data.latestStatus && <div className="mt-3 inline-flex rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase text-gray-500">{data.latestStatus}</div>}
        {blockingDiagnostic && <div className="mt-3 text-[11px] font-semibold text-red-600">{blockingDiagnostic.message}</div>}
        {!blockingDiagnostic && warningDiagnostic && <div className="mt-3 text-[11px] font-semibold text-amber-600">{warningDiagnostic.message}</div>}
        {node.ui?.displayNote && node.ui?.notes && <div className="mt-2 text-xs text-gray-500">{node.ui.notes}</div>}
      </button>
      {node.type === 'condition' ? (
        <>
          {node.key === 'flow.switch' ? (
            <>
              <Handle type="source" id="vip" position={Position.Right} className="!top-[22%] !h-4 !w-4 !border-green-500 !bg-white" />
              <Handle type="source" id="standard" position={Position.Right} className="!top-[50%] !h-4 !w-4 !border-amber-500 !bg-white" />
              <Handle type="source" id="other" position={Position.Right} className="!top-[78%] !h-4 !w-4 !border-red-500 !bg-white" />
              <button onClick={() => data.onAdd(node.id, 'vip')} className="absolute -right-14 top-4 rounded-md bg-gray-200 px-2 py-1 text-xs font-bold text-gray-700 opacity-0 transition group-hover:opacity-100">+</button>
              <button onClick={() => data.onAdd(node.id, 'standard')} className="absolute -right-14 top-1/2 -translate-y-1/2 rounded-md bg-gray-200 px-2 py-1 text-xs font-bold text-gray-700 opacity-0 transition group-hover:opacity-100">+</button>
              <button onClick={() => data.onAdd(node.id, 'other')} className="absolute -right-14 bottom-4 rounded-md bg-gray-200 px-2 py-1 text-xs font-bold text-gray-700 opacity-0 transition group-hover:opacity-100">+</button>
            </>
          ) : (
            <>
              <Handle type="source" id="true" position={Position.Right} className="!top-[34%] !h-4 !w-4 !border-green-500 !bg-white" />
              <Handle type="source" id="false" position={Position.Right} className="!top-[66%] !h-4 !w-4 !border-red-500 !bg-white" />
              <button onClick={() => data.onAdd(node.id, 'true')} className="absolute -right-14 top-5 rounded-md bg-gray-200 px-2 py-1 text-xs font-bold text-gray-700 opacity-0 transition group-hover:opacity-100">+</button>
              <button onClick={() => data.onAdd(node.id, 'false')} className="absolute -right-14 bottom-5 rounded-md bg-gray-200 px-2 py-1 text-xs font-bold text-gray-700 opacity-0 transition group-hover:opacity-100">+</button>
            </>
          )}
        </>
      ) : (
        <>
          <Handle type="source" id="main" position={Position.Right} className="!h-4 !w-4 !border-gray-400 !bg-white" />
          <button onClick={() => data.onAdd(node.id, 'main')} className="absolute -right-14 top-1/2 -translate-y-1/2 rounded-md bg-gray-200 px-2 py-1 text-xs font-bold text-gray-700 opacity-0 transition group-hover:opacity-100">+</button>
        </>
      )}
      {node.type === 'agent' && (
        <div className="absolute -bottom-11 left-10 flex gap-9 text-[11px] text-gray-500">
          {['chatModel', 'memory', 'tool'].map((port) => (
            <button key={port} onClick={() => data.onAdd(node.id, port)} className="relative">
              <span className="absolute -top-3 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border border-gray-300 bg-white" />
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
    <div className="absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-1 rounded-lg border border-gray-200 bg-white px-1 py-1 shadow-sm group-hover:flex">
      <button title="Execute step" onClick={() => data.onExecute(node.id)} className="rounded p-1 hover:bg-gray-100"><span className="material-symbols-outlined text-sm">play_arrow</span></button>
      <button title={node.disabled ? 'Activate' : 'Deactivate'} onClick={() => data.onToggle(node.id)} className="rounded p-1 hover:bg-gray-100"><span className="material-symbols-outlined text-sm">{node.disabled ? 'power_settings_new' : 'power'}</span></button>
      <button title="Delete" onClick={() => data.onDelete(node.id)} className="rounded p-1 hover:bg-gray-100"><span className="material-symbols-outlined text-sm">delete</span></button>
      <button title="More" onClick={(event) => data.onMenu(node.id, { x: event.clientX, y: event.clientY })} className="rounded p-1 hover:bg-gray-100"><span className="material-symbols-outlined text-sm">more_horiz</span></button>
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
            className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            +
          </button>
          {props.label && <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-gray-500 shadow-sm">{props.label}</span>}
          <button
            onClick={(event) => {
              event.stopPropagation();
              (props.data as any)?.onRenameEdge?.(props.id);
            }}
            className="pointer-events-auto hidden h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-xs text-gray-600 shadow-sm hover:bg-gray-50 sm:flex"
            title="Rename connection"
          >
            <span className="material-symbols-outlined text-sm">edit</span>
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              (props.data as any)?.onDeleteEdge?.(props.id);
            }}
            className="pointer-events-auto hidden h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-xs text-red-500 shadow-sm hover:bg-red-50 sm:flex"
            title="Delete connection"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>
      </foreignObject>
    </>
  );
}

const nodeTypes = { workflowNode: WorkflowNodeCard };
const edgeTypes = { workflowEdge: WorkflowEdgeButton };

export default function Workflows({ onNavigate: _onNavigate, focusWorkflowId }: WorkflowsProps) {
  void _onNavigate;
  const [view, setView] = useState<WorkflowView>('list');
  const [activeTab, setActiveTab] = useState<WorkflowTab>('overview');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [activeFilter, setActiveFilter] = useState('All');
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
  const [addCategory, setAddCategory] = useState<string>('AI');
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [editorNodeId, setEditorNodeId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'parameters' | 'settings'>('parameters');
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingCardAction, setPendingCardAction] = useState<string | null>(null);

  const { data: apiWorkflows, loading, error } = useApi(() => workflowsApi.list(), [], []);
  const { data: catalogPayload } = useApi(() => workflowsApi.catalog(), [], null);
  const { data: connectorsPayload } = useApi(() => connectorsApi.list(), [], []);
  const createWorkflow = useMutation((payload: Record<string, any>) => workflowsApi.create(payload));
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
  const workflowCategories = useMemo(() => workflows.map((workflow) => String(workflow.category)), [workflows]);
  const filters: string[] = useMemo(() => ['All', ...Array.from(new Set<string>(workflowCategories))], [workflowCategories]);
  const selectedNode = useMemo(() => workflowNodes.find((node) => node.id === selectedNodeId) ?? null, [workflowNodes, selectedNodeId]);
  const editorNode = useMemo(() => workflowNodes.find((node) => node.id === editorNodeId) ?? null, [workflowNodes, editorNodeId]);
  const latestSteps = useMemo(() => (stepResult ? [stepResult] : runResult?.steps ?? dryRun?.steps ?? []), [stepResult, runResult?.steps, dryRun?.steps]);
  const diagnostics: WorkflowDiagnostic[] = useMemo(() => validation?.diagnostics ?? dryRun?.validation?.diagnostics ?? stepResult?.diagnostics ?? [], [validation?.diagnostics, dryRun?.validation?.diagnostics, stepResult?.diagnostics]);
  const connectors = useMemo(() => (Array.isArray(connectorsPayload) ? connectorsPayload : []), [connectorsPayload]);

  const filtered = useMemo(() => workflows.filter((workflow) => {
    const matchesFilter = activeFilter === 'All' || workflow.category === activeFilter;
    const haystack = `${workflow.name} ${workflow.description} ${workflow.category} ${workflow.status}`.toLowerCase();
    return matchesFilter && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [workflows, activeFilter, query]);

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
  }

  async function handleCardAction(workflow: Workflow, action: string) {
    // Open the workflow in the editor, then dispatch the deferred action via effect
    await openWorkflow(workflow);
    setPendingCardAction(action);
  }

  async function createFromTemplate(template = TEMPLATES[0]) {
    const nextNodes = template.nodes.map((node, index) => makeNode(node as any, index));
    const nextEdges = templateEdges(template, nextNodes);
    const created = await createWorkflow.mutate({
      name: template.label,
      description: template.description,
      category: template.category,
      trigger: { type: nextNodes[0]?.key ?? 'manual.run' },
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
    }
  }

  function addNode(spec: NodeSpec, mode: AddPanelMode = addPanel) {
    const sourceNode = mode?.sourceNodeId ? workflowNodes.find((node) => node.id === mode.sourceNodeId) : selectedNode ?? workflowNodes.at(-1);
    const sourcePosition = sourceNode?.position ?? { x: 120, y: 220 };
    const node = makeNode({ ...spec, position: { x: sourcePosition.x + 340, y: sourcePosition.y + (mode?.sourceHandle === 'false' ? 160 : 0) } }, workflowNodes.length);
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
          label: mode?.sourceHandle === 'false' ? 'false' : mode?.sourceHandle === 'true' ? 'true' : 'next',
          sourceHandle: mode?.sourceHandle ?? 'main',
        },
      ];
    }
    setWorkflowNodes((items) => [...items, node]);
    setWorkflowEdges(nextEdges);
    setSelectedNodeId(node.id);
    setEditorNodeId(node.id);
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
    return {
      name: overrides.name ?? selectedWorkflow?.name ?? 'Workflow',
      description: overrides.description ?? selectedWorkflow?.description ?? '',
      category: overrides.category ?? selectedWorkflow?.category ?? 'General',
      trigger: { type: nodes[0]?.key ?? 'manual.run' },
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
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    setMessage('Workflow link copied to clipboard.');
  }

  async function renameCurrentWorkflow() {
    if (!selectedWorkflow) return;
    const next = window.prompt('Rename workflow', selectedWorkflow.name);
    if (!next || next === selectedWorkflow.name) return;
    await persistWorkflowDraft({ name: next });
    setMessage('Workflow renamed.');
  }

  async function moveCurrentWorkflow() {
    if (!selectedWorkflow) return;
    const next = window.prompt('Move workflow to category', selectedWorkflow.category);
    if (!next || next === selectedWorkflow.category) return;
    await persistWorkflowDraft({ category: next });
    setMessage(`Workflow moved to ${next}.`);
  }

  async function editWorkflowDescription() {
    if (!selectedWorkflow) return;
    setActiveTab('overview');
    setMessage('Edit the workflow description in Overview.');
  }

  async function importWorkflowFromUrl() {
    if (!selectedWorkflow) return;
    const source = window.prompt('Import workflow JSON from URL');
    if (!source) return;
    try {
      const response = await fetch(source, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();
      const imported = mapWorkflow(raw);
      setSelectedWorkflow(imported);
      setWorkflowNodes(imported.currentVersion?.nodes ?? []);
      setWorkflowEdges(imported.currentVersion?.edges ?? []);
      setSelectedNodeId(imported.currentVersion?.nodes?.[0]?.id ?? null);
      setEditorNodeId(null);
      setActiveTab('builder');
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
      setSelectedWorkflow(imported);
      setWorkflowNodes(imported.currentVersion?.nodes ?? []);
      setWorkflowEdges(imported.currentVersion?.edges ?? []);
      setSelectedNodeId(imported.currentVersion?.nodes?.[0]?.id ?? null);
      setEditorNodeId(null);
      setActiveTab('builder');
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
    setMessage('Workflow JSON copied for git push.');
  }

  async function archiveCurrentWorkflow() {
    if (!selectedWorkflow) return;
    const archived = await archiveWorkflow.mutate(selectedWorkflow.id);
    if (archived?.id) {
      setSelectedWorkflow(mapWorkflow(archived));
      setMessage('Workflow archived.');
    }
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
      return;
    }
    const published = await publishWorkflow.mutate(selectedWorkflow.id);
    if (published?.id) {
      setSelectedWorkflow(mapWorkflow(published));
      setMessage('Workflow published.');
    }
  }

  async function executeManualRun() {
    if (!selectedWorkflow) return;
    const run = await runWorkflow.mutate(selectedWorkflow.id);
    setRunResult(run);
    setStepResult(null);
    setSelectedRunId(run?.id ?? null);
    setActiveTab('runs');
    setMessage(`Workflow run ${run?.id ?? ''} ended as ${run?.status ?? 'unknown'}.`);
  }

  async function retryLatestRun() {
    const runId = runResult?.id ?? selectedWorkflow?.recentRuns?.[0]?.id;
    if (!runId) return;
    const run = await retryWorkflowRun.mutate(runId);
    setRunResult(run);
    setSelectedRunId(run?.id ?? null);
    setActiveTab('runs');
    setMessage(`Retried workflow run ${run?.id ?? ''}; status ${run?.status ?? 'unknown'}.`);
  }

  async function resumeLatestRun() {
    const runId = runResult?.id ?? selectedRunId ?? selectedWorkflow?.recentRuns?.[0]?.id;
    if (!runId) return;
    const run = await resumeWorkflowRun.mutate(runId);
    setRunResult(run);
    setSelectedRunId(run?.id ?? runId);
    setActiveTab('runs');
    setMessage(`Resumed workflow run ${run?.id ?? runId}; status ${run?.status ?? 'unknown'}.`);
  }

  async function cancelLatestRun() {
    const runId = runResult?.id ?? selectedRunId ?? selectedWorkflow?.recentRuns?.[0]?.id;
    if (!runId) return;
    const run = await cancelWorkflowRun.mutate(runId);
    setRunResult(run);
    setSelectedRunId(run?.id ?? runId);
    setActiveTab('runs');
    setMessage(`Cancelled workflow run ${run?.id ?? runId}.`);
  }

  async function triggerCurrentEvent() {
    const triggerNode = workflowNodes.find((node) => node.type === 'trigger') ?? workflowNodes[0];
    if (!triggerNode) return;
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
    const rolledBack = await rollbackWorkflow.mutate(selectedWorkflow.id);
    if (rolledBack?.id) {
      setSelectedWorkflow(mapWorkflow(rolledBack));
      loadBuilderState(mapWorkflow(rolledBack));
      setMessage('Workflow rolled back to the previous version.');
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

  const addCategories = useMemo(() => getCategoryOverview(catalog), [catalog]);
  const addSections = useMemo(() => getAddPanelSections(addCategory, catalog, addSearch), [catalog, addCategory, addSearch]);

  if (loading && workflows.length === 0) {
    return <LoadingState title="Loading workflows" message="Fetching workflow definitions from Supabase." />;
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        <AnimatePresence mode="wait">
          {view === 'list' ? (
            <WorkflowList
              error={error || createWorkflow.error ? String(error || createWorkflow.error) : null}
              filters={filters}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              query={query}
              setQuery={setQuery}
              workflows={filtered}
              onOpen={openWorkflow}
              onCardAction={handleCardAction}
              onTemplate={() => setTemplateOpen(true)}
              onCreate={() => createFromTemplate(TEMPLATES[0])}
            />
          ) : (
            <motion.div key="builder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
              <WorkflowEditorTopbar
                workflow={selectedWorkflow}
                setWorkflow={setSelectedWorkflow}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onBack={() => setView('list')}
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
                <div className="border-b border-gray-100 px-5 py-2 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-300">
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
                      <MiniMap pannable zoomable nodeStrokeWidth={3} className="!rounded-xl !border !border-gray-200 !bg-white" />
                      <Controls position="bottom-left" className="!rounded-xl !border !border-gray-200 !bg-white !shadow-sm" />
                      <Panel position="top-center">
                        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 shadow-sm">
                          <div className="font-semibold">Workflow editor ready</div>
                          <div className="text-xs">Use + on any node or line to add the next operation.</div>
                        </div>
                      </Panel>
                      <Panel position="bottom-center">
                        <button onClick={executeManualRun} className="rounded-lg bg-[#ff4f3d] px-4 py-2 text-sm font-bold text-white shadow-lg hover:opacity-90">
                          Open execution
                        </button>
                      </Panel>
                    </ReactFlow>

                    <button onClick={() => openAddPanel({})} className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-xl shadow-sm hover:bg-gray-50">+</button>

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
  { action: 'push_git',         label: 'Push to Git',      icon: 'commit' },
  { action: 'import_url',       label: 'Import from URL',  icon: 'cloud_download' },
  { action: 'import_file',      label: 'Import from file', icon: 'upload_file' },
  { action: 'archive',          label: 'Archive',          icon: 'archive', danger: true },
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
          className="w-52 rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.action}
              onClick={(e) => { e.stopPropagation(); setOpen(false); props.onAction(props.workflow, item.action); }}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800
                ${'danger' in item && item.danger ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}`}
            >
              <span className="material-symbols-outlined text-base leading-none">{item.icon}</span>
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
        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <span className="material-symbols-outlined text-base leading-none">
          {props.kind === 'manage' ? 'settings' : 'play_circle'}
        </span>
        <span>{props.kind === 'manage' ? 'Manage' : 'Run'}</span>
        <span className="material-symbols-outlined text-xs leading-none">expand_more</span>
      </button>
      {menu}
    </div>
  );
}

function WorkflowList(props: {
  error: string | null;
  filters: string[];
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  query: string;
  setQuery: (query: string) => void;
  workflows: Workflow[];
  onOpen: (workflow: Workflow) => void;
  onCardAction: (workflow: Workflow, action: string) => void;
  onTemplate: () => void;
  onCreate: () => void;
}) {
  return (
    <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
      <div className="p-6 pb-0">
        <div className="rounded-xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-card-dark">
          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Workflows</h1>
              <p className="text-xs text-gray-500 mt-1">Build operational automations for agents, cases, orders, refunds, returns, approvals, policies, and integrations.</p>
            </div>
            <div className="flex items-center gap-2">
              <input value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Search workflows..." className="w-64 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 dark:border-gray-700 dark:bg-gray-800" />
              <button onClick={props.onTemplate} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Templates</button>
              <button onClick={props.onCreate} className="rounded-lg bg-black px-4 py-2 text-sm font-bold text-white shadow-card hover:opacity-90 dark:bg-white dark:text-black">New workflow</button>
            </div>
          </div>
          <div className="px-6 flex items-center gap-6 border-t border-gray-100 dark:border-gray-800">
            {props.filters.map((filter) => (
              <button key={filter} onClick={() => props.setActiveFilter(filter)} className={`py-3 text-sm border-b-2 ${props.activeFilter === filter ? 'border-black font-bold text-gray-900 dark:border-white dark:text-white' : 'border-transparent font-medium text-gray-500'}`}>{filter}</button>
            ))}
          </div>
        </div>
      </div>
      {props.error && <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{props.error}</div>}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {props.workflows.map((workflow) => (
            <div
              key={workflow.id}
              className="relative cursor-pointer rounded-2xl border border-gray-200 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-card-dark"
              onClick={() => void props.onOpen(workflow)}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">{workflow.category}</div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{workflow.name}</h3>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${workflow.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{workflow.status}</span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{workflow.description}</p>
              {/* Metrics */}
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                {workflow.metrics.map((metric) => (
                  <div key={metric.label}>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">{metric.value}{metric.suffix}</div>
                    <div className="text-[10px] text-gray-400">{metric.label}</div>
                  </div>
                ))}
              </div>
              {/* Per-card action dropdowns */}
              <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                <WorkflowCardDropdown workflow={workflow} kind="manage" onAction={props.onCardAction} />
                <WorkflowCardDropdown workflow={workflow} kind="run"    onAction={props.onCardAction} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
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
    { label: 'Push to git', action: runAndClose(props.onPushToGit) },
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
    { label: 'Settings', action: () => { closeMenu(); props.setActiveTab('overview'); } },
    { label: 'Archive', action: runAndClose(props.onArchive), danger: true },
  ];

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={props.onBack} className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">Workflows</button>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <input value={props.workflow?.name ?? ''} onChange={(event) => props.setWorkflow((workflow) => workflow ? { ...workflow, name: event.target.value } : workflow)} className="min-w-[260px] bg-transparent text-sm font-semibold text-gray-900 outline-none dark:text-white" />
          <span className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">{props.workflow?.currentVersion?.status ?? 'draft'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={menuRef}>
            <div className="flex items-center gap-2">
              <button onClick={() => setMenuOpen((value) => value === 'edit' ? null : 'edit')} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50" aria-haspopup="menu" aria-expanded={menuOpen === 'edit'} aria-label="Edit workflow actions">
                Edit
              </button>
              <button onClick={() => setMenuOpen((value) => value === 'run' ? null : 'run')} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50" aria-haspopup="menu" aria-expanded={menuOpen === 'run'} aria-label="Run workflow actions">
                Run
              </button>
            </div>

            {menuOpen === 'edit' && (
              <div className="absolute right-20 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                <div className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Workflow actions</div>
                <div className="border-t border-gray-100" />
                <div className="p-2">
                  {editMenuItems.map((item, index) => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-gray-50 ${item.bold ? 'font-semibold text-gray-900' : 'text-gray-700'} ${index === editMenuItems.length - 1 ? 'border-t border-gray-100 mt-2 pt-3' : ''}`}
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {menuOpen === 'run' && (
              <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                <div className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Workflow actions</div>
                <div className="border-t border-gray-100" />
                <div className="p-2">
                  {runMenuItems.map((item, index) => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-gray-50 ${item.danger ? 'text-red-600' : 'text-gray-700'} ${index === runMenuItems.length - 1 ? 'border-t border-gray-100 mt-2 pt-3' : ''}`}
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={props.onPublish} className="rounded-lg bg-black px-4 py-1.5 text-xs font-bold text-white hover:opacity-90">Publish</button>
        </div>
      </div>
      <div className="-mb-px flex justify-center">
        <div className="rounded-t-lg bg-gray-200 p-1">
          {EDITOR_TABS.map((tab) => (
            <button key={tab.id} onClick={() => props.setActiveTab(tab.id)} className={`rounded-md px-4 py-2 text-xs font-semibold ${props.activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              {tab.label}
            </button>
          ))}
        </div>
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
}) {
  return (
    <aside className="absolute right-0 top-0 z-30 h-full w-[420px] border-l border-gray-200 bg-white shadow-xl">
      <AnimatePresence mode="wait" initial={false}>
        {props.screen === 'categories' ? (
          <motion.div
            key="categories"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            className="flex h-full flex-col"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">What happens next?</h3>
                <p className="mt-1 text-xs text-gray-500">Choose the next CRM-AI operation.</p>
              </div>
              <button onClick={props.onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="border-b border-gray-100 p-5">
              <div className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 focus-within:ring-2 focus-within:ring-black/10">
                <span className="material-symbols-outlined text-base text-gray-400">search</span>
                <input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Search nodes..." className="w-full bg-transparent text-sm outline-none" />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
              <div className="space-y-2 pb-8">
                {props.categories.map((category) => (
                    <button
                      key={category.category}
                      onClick={() => props.onOpenCategory(category.category)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                        props.activeCategory === category.category
                          ? 'border-gray-300 bg-gray-50 text-gray-900 shadow-sm'
                          : 'border-transparent text-gray-700 hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-gray-700 shadow-sm">
                        <span className="material-symbols-outlined text-xl">{category.icon}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{category.title}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">{category.count}</span>
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-gray-500">{category.subtitle}</span>
                      </span>
                      <span className="material-symbols-outlined text-base text-gray-400">chevron_right</span>
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
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <button onClick={props.onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-900">
                <span className="material-symbols-outlined text-lg">arrow_back</span>
                <span className="text-sm font-semibold">Back</span>
              </button>
              <button onClick={props.onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700">
                  <span className="material-symbols-outlined text-xl">{CATEGORY_META[props.activeCategory]?.icon ?? 'grid_view'}</span>
                </span>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{CATEGORY_META[props.activeCategory]?.title ?? props.activeCategory}</h3>
                  <p className="mt-1 text-xs text-gray-500">{CATEGORY_META[props.activeCategory]?.subtitle ?? 'Choose a block for this category.'}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 focus-within:ring-2 focus-within:ring-black/10">
                <span className="material-symbols-outlined text-base text-gray-400">search</span>
                <input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Search nodes..." className="w-full bg-transparent text-sm outline-none" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {props.sections.length > 0 ? (
                <div className="space-y-5">
                  {props.sections.map((section) => (
                    <section key={section.title}>
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <h4 className="text-sm font-bold text-gray-700">{section.title}</h4>
                        <span className="text-[11px] uppercase tracking-[0.24em] text-gray-400">{section.items.length}</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {section.items.map((spec) => (
                          <button key={spec.key} onClick={() => props.onSelect(spec)} className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-gray-50">
                            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-600 shadow-sm">
                              <span className="material-symbols-outlined text-lg">{spec.icon}</span>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-gray-900">{spec.label}</span>
                              <span className="mt-1 block text-xs leading-5 text-gray-500">{spec.description ?? spec.key}</span>
                            </span>
                            <span className="material-symbols-outlined mt-1 text-base text-gray-400">arrow_forward</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">No nodes found.</div>
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
    <div className="fixed z-50 w-64 rounded-lg border border-gray-200 bg-white py-2 shadow-2xl" style={{ left: props.contextMenu.x, top: props.contextMenu.y }}>
      {items.map((item, index) => (
        <button key={item.label} onClick={() => { item.action(); props.onClose(); }} className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 ${item.danger ? 'text-red-600' : 'text-gray-700'} ${index === items.length - 1 ? 'border-t border-gray-100 mt-2 pt-3' : ''}`}>
          <span>{item.label}</span>
          {item.key && <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400">{item.key}</span>}
        </button>
      ))}
    </div>
  );
}

/** Renders smart per-node config fields based on NODE_FIELD_SCHEMAS. Falls back to generic CONFIG_FIELDS if no schema defined. */
// ── AgentPickerField ──────────────────────────────────────────────────────────
// Fetches AI Studio agents from /api/workflows/agent-catalog and renders a
// searchable dropdown so the user can pick by name instead of typing a slug.

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
        <span className={selectedAgent ? 'text-gray-900' : 'text-gray-400'}>
          {loading ? 'Loading agents…' : selectedAgent ? (
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-orange-400">smart_toy</span>
              <span>{selectedAgent.name}</span>
              <span className="text-[10px] text-gray-400">({selectedAgent.slug})</span>
            </span>
          ) : value || placeholder || 'Select an AI Studio agent…'}
        </span>
        <span className="material-symbols-outlined text-sm text-gray-400">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="sticky top-0 bg-white px-3 py-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents…"
              className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-gray-400"
            />
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-gray-400">
              {loading ? 'Loading…' : agents.length === 0 ? 'No agents found. Create one in AI Studio.' : 'No match'}
            </div>
          ) : (
            filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { onChange(a.slug); setOpen(false); setQuery(''); }}
                className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-orange-50 ${value === a.slug ? 'bg-orange-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-orange-400">smart_toy</span>
                  <span className="font-medium text-gray-900">{a.name}</span>
                  <span className="text-[10px] text-gray-400">{a.slug}</span>
                  {a.status && a.status !== 'active' && (
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-500">{a.status}</span>
                  )}
                </div>
                {a.description && (
                  <span className="ml-6 mt-0.5 text-[11px] text-gray-400 line-clamp-1">{a.description}</span>
                )}
              </button>
            ))
          )}
          {/* Manual entry option */}
          <div className="border-t border-gray-100 px-3 py-2">
            <button
              type="button"
              onClick={() => { onChange(query || value); setOpen(false); setQuery(''); }}
              className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700"
            >
              <span className="material-symbols-outlined text-sm">edit</span>
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
    ? 'mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400'
    : 'mt-1.5 w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-gray-400';

  // No schema defined → generic fallback for any existing config keys
  if (fields.length === 0) {
    const existingKeys = Object.keys(node.config ?? {}).filter((k) => k !== '_meta');
    if (existingKeys.length === 0) {
      return <div className="py-6 text-center text-xs text-gray-400">No configuration required for this node.</div>;
    }
    return (
      <div className="space-y-3">
        {existingKeys.map((key) => (
          <label key={key} className="block">
            <span className="text-xs font-semibold capitalize text-gray-600">{key}</span>
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
          <span className="text-xs font-semibold text-gray-600">{field.label}</span>
          {field.hint && <span className="ml-2 text-[10px] text-gray-400">{field.hint}</span>}
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
        className="flex h-[94vh] w-[98vw] max-w-[1820px] flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-6">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-orange-500">{props.spec?.icon ?? 'settings'}</span>
            <div>
              <div className="text-sm font-semibold text-gray-900">{props.node.label}</div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-gray-400">{props.node.key}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={props.onExecute} className="rounded-lg bg-[#ff4f3d] px-3 py-2 text-xs font-bold text-white shadow-sm">Execute step</button>
            <button onClick={props.onClose} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">Close</button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-[1.15fr_0.95fr_1.1fr] overflow-hidden bg-white">
          <section className="border-r border-gray-100 bg-gray-50/70">
            <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.24em] text-gray-400">Input</div>
            <div className="p-5">
              <div className="flex items-center gap-2 pb-4">
                <button className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm">Mapping</button>
                <button className="rounded-md px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-white">From AI</button>
              </div>
              <div className="min-h-[60vh] overflow-auto rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
                {inputData ? (
                  <pre className="h-full whitespace-pre-wrap break-words text-left text-xs text-gray-700">{JSON.stringify(inputData, null, 2)}</pre>
                ) : (
                  <div className="flex h-full min-h-[45vh] flex-col items-center justify-center text-center">
                    <span className="material-symbols-outlined mb-3 text-3xl">input</span>
                    <b>Parent node hasn't run yet</b>
                    <p className="mt-2 max-w-xs">Run previous nodes or execute the workflow to view input data.</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="border-r border-gray-100 bg-white">
            <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5">
              <div className="flex gap-3">
                <button onClick={() => props.setMode('parameters')} className={`h-16 border-b-2 text-sm font-semibold ${props.mode === 'parameters' ? 'border-[#ff4f3d] text-[#ff4f3d]' : 'border-transparent text-gray-500'}`}>Parameters</button>
                <button onClick={() => props.setMode('settings')} className={`h-16 border-b-2 text-sm font-semibold ${props.mode === 'settings' ? 'border-[#ff4f3d] text-[#ff4f3d]' : 'border-transparent text-gray-500'}`}>Settings</button>
              </div>
            </div>
            <div className="h-[calc(100%-64px)] overflow-y-auto p-5">
              {props.mode === 'parameters' ? (
                <div className="space-y-4">
                  {props.spec?.description && (
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-xs text-gray-500">{props.spec.description}</div>
                  )}
                  <NodeConfigFields node={props.node} onConfig={props.onConfig} size="lg" />
                  {props.node.type === 'integration' && (
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-600">Connection</span>
                      <select
                        value={props.node.credentialsRef ?? props.node.config.connector ?? ''}
                        onChange={(event) => props.onCredentials(event.target.value || null)}
                        className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                      >
                        <option value="">Select connector...</option>
                        {props.connectors.map((connector) => (
                          <option key={connector.id} value={connector.id}>
                            {connector.name || connector.system || connector.id} · {connector.status || 'unknown'}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2 text-[11px] text-gray-400">Secrets stay inside Integrations. Workflows only reference the connection.</div>
                    </label>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Notes</span>
                    <textarea value={props.node.ui?.notes ?? ''} onChange={(event) => props.onUi({ notes: event.target.value })} className="mt-2 h-28 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
                  </label>
                  <label className="flex items-center justify-between text-sm">
                    <span>Display Note in Flow?</span>
                    <button onClick={() => props.onUi({ displayNote: !props.node.ui?.displayNote })} className={`h-6 w-11 rounded-full transition ${props.node.ui?.displayNote ? 'bg-gray-900' : 'bg-gray-300'}`}>
                      <span className={`block h-5 w-5 rounded-full bg-white transition ${props.node.ui?.displayNote ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                  <button onClick={props.onToggle} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50">{props.node.disabled ? 'Activate node' : 'Deactivate node'}</button>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-600">Retries</span>
                      <input type="number" min={0} value={props.node.retryPolicy?.retries ?? ''} onChange={(event) => props.onRetryPolicy({ retries: Number(event.target.value || 0) })} className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-600">Backoff ms</span>
                      <input type="number" min={0} value={props.node.retryPolicy?.backoffMs ?? ''} onChange={(event) => props.onRetryPolicy({ backoffMs: Number(event.target.value || 0) })} className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
                    </label>
                  </div>
                  <div className="border-t border-gray-100 pt-4 text-xs text-gray-400">{props.node.key} node version 1.0</div>
                </div>
              )}
            </div>
          </section>

          <section className="bg-gray-50/80">
            <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-gray-400">Output</div>
              <button onClick={props.onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100"><span className="material-symbols-outlined text-lg">close</span></button>
            </div>
            <div className="flex h-[calc(100%-64px)] items-center justify-center p-8 text-center text-sm text-gray-500">
              {props.latestStep ? (
                <div className="flex h-full w-full flex-col gap-3">
                  <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2 text-left text-xs text-gray-600">
                    <span>Status: <b className="uppercase">{props.latestStep.status}</b></span>
                    <span>{props.latestStep.durationMs ?? props.latestStep.duration_ms ?? 0} ms</span>
                  </div>
                  <pre className="min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200 bg-white p-4 text-left text-xs text-gray-700">{JSON.stringify(props.latestStep.output ?? props.latestStep, null, 2)}</pre>
                </div>
              ) : (
                <div>
                  <span className="material-symbols-outlined mb-3 text-3xl">output</span>
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
    <div className="absolute inset-x-0 bottom-0 z-20 h-[42%] border-t border-gray-200 bg-white shadow-2xl">
      <div className="flex h-full">
        <section className="w-[38%] border-r border-gray-100 bg-gray-50">
          <div className="flex h-10 items-center gap-2 border-b border-gray-200 px-4">
            <span className="material-symbols-outlined text-orange-500">{props.spec?.icon ?? 'settings'}</span>
            <span className="font-semibold text-gray-900">{props.node.label}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-3">
            <button className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold shadow-sm">Mapping</button>
            <button className="rounded-md px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-white">From AI</button>
          </div>
          <div className="h-[calc(100%-88px)] overflow-auto p-4 text-sm text-gray-500">
            {inputData ? (
              <pre className="h-full rounded-xl border border-gray-200 bg-white p-4 text-left text-xs text-gray-700">{JSON.stringify(inputData, null, 2)}</pre>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <span className="material-symbols-outlined mb-3 text-3xl">input</span>
                <b>Parent node hasn't run yet</b>
                <p className="mt-2 max-w-xs">Run previous nodes or execute the workflow to view input data.</p>
              </div>
            )}
          </div>
        </section>
        <section className="w-[24%] border-r border-gray-100 bg-white">
          <div className="flex h-10 items-center justify-between border-b border-gray-200 px-4">
            <div className="flex gap-3">
              <button onClick={() => props.setMode('parameters')} className={`h-10 border-b-2 text-sm font-semibold ${props.mode === 'parameters' ? 'border-[#ff4f3d] text-[#ff4f3d]' : 'border-transparent text-gray-500'}`}>Parameters</button>
              <button onClick={() => props.setMode('settings')} className={`h-10 border-b-2 text-sm font-semibold ${props.mode === 'settings' ? 'border-[#ff4f3d] text-[#ff4f3d]' : 'border-transparent text-gray-500'}`}>Settings</button>
            </div>
            <button onClick={props.onExecute} className="rounded-md bg-[#ff4f3d] px-3 py-1.5 text-xs font-bold text-white">Execute step</button>
          </div>
          <div className="h-[calc(100%-40px)] overflow-y-auto p-4">
            {props.mode === 'parameters' ? (
              <div className="space-y-3">
                {props.spec?.description && (
                  <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">{props.spec.description}</div>
                )}
                <NodeConfigFields node={props.node} onConfig={props.onConfig} size="sm" />
                {props.node.type === 'integration' && (
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Connection</span>
                    <select
                      value={props.node.credentialsRef ?? props.node.config.connector ?? ''}
                      onChange={(event) => props.onCredentials(event.target.value || null)}
                      className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    >
                      <option value="">Select connector...</option>
                      {props.connectors.map((connector) => (
                        <option key={connector.id} value={connector.id}>
                          {connector.name || connector.system || connector.id} · {connector.status || 'unknown'}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-[11px] text-gray-400">Secrets stay inside Integrations. Workflows only reference the connection.</div>
                  </label>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Notes</span>
                  <textarea value={props.node.ui?.notes ?? ''} onChange={(event) => props.onUi({ notes: event.target.value })} className="mt-2 h-24 w-full resize-none rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
                </label>
                <label className="flex items-center justify-between text-sm">
                  <span>Display Note in Flow?</span>
                  <button onClick={() => props.onUi({ displayNote: !props.node.ui?.displayNote })} className={`h-6 w-11 rounded-full transition ${props.node.ui?.displayNote ? 'bg-gray-900' : 'bg-gray-300'}`}>
                    <span className={`block h-5 w-5 rounded-full bg-white transition ${props.node.ui?.displayNote ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </label>
                <button onClick={props.onToggle} className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50">{props.node.disabled ? 'Activate node' : 'Deactivate node'}</button>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Retries</span>
                    <input type="number" min={0} value={props.node.retryPolicy?.retries ?? ''} onChange={(event) => props.onRetryPolicy({ retries: Number(event.target.value || 0) })} className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Backoff ms</span>
                    <input type="number" min={0} value={props.node.retryPolicy?.backoffMs ?? ''} onChange={(event) => props.onRetryPolicy({ backoffMs: Number(event.target.value || 0) })} className="mt-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
                  </label>
                </div>
                <div className="border-t border-gray-100 pt-4 text-xs text-gray-400">{props.node.key} node version 1.0</div>
              </div>
            )}
          </div>
        </section>
        <section className="flex-1 bg-gray-50">
          <div className="flex h-10 items-center justify-between border-b border-gray-200 px-4">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-gray-400">Output</div>
            <button onClick={props.onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100"><span className="material-symbols-outlined text-lg">close</span></button>
          </div>
          <div className="flex h-[calc(100%-40px)] items-center justify-center p-8 text-center text-sm text-gray-500">
            {props.latestStep ? (
              <div className="flex h-full w-full flex-col gap-3">
                <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-2 text-left text-xs text-gray-600">
                  <span>Status: <b className="uppercase">{props.latestStep.status}</b></span>
                  <span>{props.latestStep.durationMs ?? props.latestStep.duration_ms ?? 0} ms</span>
                </div>
                <pre className="min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200 bg-white p-4 text-left text-xs text-gray-700">{JSON.stringify(props.latestStep.output ?? props.latestStep, null, 2)}</pre>
              </div>
            ) : (
              <div>
                <span className="material-symbols-outlined mb-3 text-3xl">output</span>
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
        <div className="xl:col-span-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-card dark:border-gray-800 dark:bg-card-dark">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Workflow purpose</div>
          <textarea
            value={props.workflow?.description ?? ''}
            onChange={(event) => props.setWorkflow((workflow) => workflow ? { ...workflow, description: event.target.value } : workflow)}
            className="mt-3 min-h-32 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-black/10 dark:border-gray-700 dark:bg-gray-800"
          />
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {props.workflow?.metrics.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                <div className="text-xl font-bold text-gray-900 dark:text-white">{metric.value}</div>
                <div className="mt-1 text-xs text-gray-500">{metric.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="xl:col-span-4 space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-card-dark">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Validation</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between"><span>Nodes</span><b>{props.nodes.length}</b></div>
              <div className="flex items-center justify-between"><span>Connections</span><b>{props.edges.length}</b></div>
              <div className="flex items-center justify-between"><span>Disabled</span><b>{props.nodes.filter((node) => node.disabled).length}</b></div>
              <div className="flex items-center justify-between"><span>Blockers</span><b>{props.validation?.errors?.length ?? 0}</b></div>
            </div>
            {props.validation?.diagnostics?.length > 0 && (
              <div className="mt-4 space-y-2">
                {props.validation.diagnostics.slice(0, 5).map((diagnostic: WorkflowDiagnostic, index: number) => (
                  <div key={`${diagnostic.code}-${index}`} className={`rounded-lg px-3 py-2 text-xs ${diagnostic.severity === 'error' ? 'bg-red-50 text-red-700' : diagnostic.severity === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
                    {diagnostic.message}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-card-dark">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Latest result</div>
            <div className="mt-3 text-sm font-bold text-gray-900 dark:text-white">{props.runResult?.status ?? props.dryRun?.summary ?? 'No execution yet'}</div>
            {props.runResult?.error && <div className="mt-2 text-xs text-red-600">{props.runResult.error}</div>}
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-800 dark:bg-card-dark">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Versions</div>
            <div className="mt-3 space-y-2">
              {(props.workflow?.versions ?? []).slice(0, 5).map((version: any) => (
                <div key={version.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                  <span>v{version.version_number}</span>
                  <span className="font-bold uppercase text-gray-500">{version.status}</span>
                </div>
              ))}
              {!(props.workflow?.versions ?? []).length && <div className="text-sm text-gray-500">No version history yet.</div>}
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
    if (status === 'skipped') return 'bg-gray-100 text-gray-500';
    return 'bg-blue-50 text-blue-700';
  };
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-card dark:border-gray-800 dark:bg-card-dark">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">Execution timeline</h3>
            <p className="mt-1 text-xs text-gray-500">Dry-runs, real runs, waiting approvals and node-level status.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={props.onResume} disabled={!(props.runResult?.id ?? props.selectedWorkflow?.recentRuns?.[0]?.id)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Resume</button>
            <button onClick={props.onCancel} disabled={!(props.runResult?.id ?? props.selectedWorkflow?.recentRuns?.[0]?.id)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Cancel</button>
            <button onClick={props.onRetry} disabled={!(props.runResult?.id ?? props.selectedWorkflow?.recentRuns?.[0]?.id)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
              Retry latest
            </button>
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((step: any, index: number) => (
            <div key={step.id ?? step.nodeId ?? index} className="grid grid-cols-12 gap-4 px-6 py-4 text-sm">
              <div className="col-span-5 flex items-center gap-3 font-bold text-gray-900 dark:text-white">
                <span className={`h-3 w-3 rounded-full ${statusTone(String(step.status)).split(' ')[0]}`} />
                {step.label ?? step.node_id ?? `Step ${index + 1}`}
              </div>
              <div className="col-span-3 text-gray-500">{step.node_type ?? step.type ?? step.key ?? 'workflow'}</div>
              <div className="col-span-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${statusTone(String(step.status))}`}>{step.status}</span></div>
              <div className="col-span-2 text-right text-gray-400">
                {step.steps === undefined && step.workflow_version_id ? (
                  <button onClick={() => props.onViewSteps(step.id)} className="text-xs font-bold text-gray-700 underline-offset-2 hover:underline dark:text-gray-200">View steps</button>
                ) : (
                  step.error ?? step.output?.reason ?? step.started_at ?? ''
                )}
              </div>
            </div>
          ))}
          {!rows.length && <div className="px-6 py-10 text-sm text-gray-500">No workflow runs yet. Run a dry-run or execute the published workflow.</div>}
        </div>
      </div>
    </div>
  );
}

function WorkflowEvaluations({ workflow }: { workflow: Workflow | null }) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center shadow-card">
        <span className="material-symbols-outlined text-4xl text-gray-400">fact_check</span>
        <h3 className="mt-3 text-lg font-bold text-gray-900">Evaluations are ready for this workflow</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">
          Once evaluation metrics are connected, this tab will show test scenarios, pass rates and regression history for {workflow?.name ?? 'this workflow'}.
        </p>
      </div>
    </div>
  );
}

function TemplateModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (template: typeof TEMPLATES[number]) => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-card-dark">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Workflow templates</h3>
                <p className="text-sm text-gray-500">Start from an operational pattern built for CRM-AI.</p>
              </div>
              <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {TEMPLATES.map((template) => (
                <button key={template.id} onClick={() => onCreate(template)} className="rounded-xl border border-gray-200 p-4 text-left transition hover:border-black hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">{template.category}</div>
                  <div className="font-bold text-gray-900 dark:text-white">{template.label}</div>
                  <div className="mt-2 text-xs leading-relaxed text-gray-500">{template.description}</div>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
