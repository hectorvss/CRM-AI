export type PermissionState = 'Allowed' | 'Conditional' | 'Approval' | 'Blocked';
export type ToolAccessLevel = 'No access' | 'Read only' | 'Limited write' | 'Approval required' | 'Full access';

export type ActionCategory = {
  name: string;
  actions: string[];
};

export type LimitConfig = {
  id: string;
  label: string;
  type: 'number' | 'currency' | 'percentage' | 'tags';
  defaultValue: any;
  options?: string[];
};

export type AgentPermissionConfig = {
  template: string;
  effectiveAccessSummary: string[];
  applicableCategories: ActionCategory[];
  mainTools: string[];
  optionalTools: string[];
  limits: LimitConfig[];
  globalHardBlocks: string[];
  specificHardBlocks: string[];
  actionPermissions?: Record<string, PermissionState>;
  toolAccess?: Record<string, ToolAccessLevel>;
  conditionalRules?: Record<string, string[]>;
  approvalAssignments?: Record<string, string>;
  approvalEscalationHours?: Record<string, number>;
  defaultApprover?: string;
  evidenceRequirements?: {
    customerRecord?: boolean;
    orderRecord?: boolean;
    paymentRecord?: boolean;
    chatHistory?: boolean;
    orderDetails?: boolean;
    managerNote?: boolean;
  };
  automaticEscalation?: boolean;
};

const commonCategories = {
  communication: {
    name: 'Communication',
    actions: ['Send email to customer', 'Reply to chat', 'Send SMS', 'Add internal note']
  },
  ticketManagement: {
    name: 'Ticket management',
    actions: ['Change ticket status', 'Assign ticket', 'Add tags', 'Merge tickets']
  },
  orders: {
    name: 'Orders',
    actions: ['Create order', 'Cancel order', 'Modify shipping address', 'Apply discount']
  },
  shipping: {
    name: 'Shipping',
    actions: ['Create shipping label', 'Reroute package', 'Upgrade shipping']
  },
  returns: {
    name: 'Returns',
    actions: ['Approve return', 'Generate return label', 'Reject return']
  },
  refunds: {
    name: 'Refunds',
    actions: ['Issue full refund', 'Issue partial refund', 'Refund to store credit']
  },
  discounts: {
    name: 'Discounts/compensation',
    actions: ['Generate promo code', 'Apply account credit']
  },
  customerAccount: {
    name: 'Customer account',
    actions: ['Update profile', 'Reset password', 'Delete account']
  },
  dataOperations: {
    name: 'Data operations',
    actions: ['Export customer data', 'View PII', 'Modify PII']
  },
  escalation: {
    name: 'Escalation/routing',
    actions: ['Escalate to human', 'Route to specialist', 'Change priority']
  },
  admin: {
    name: 'Admin/system',
    actions: ['Change system settings', 'Manage other agents', 'View audit logs']
  },
  orchestration: {
    name: 'Orchestration',
    actions: ['Assign flow', 'Trigger approval request', 'Pause / resume workflow', 'Block unsafe action']
  },
  approvals: {
    name: 'Approvals',
    actions: ['Approve action', 'Deny action', 'Request more evidence', 'Unlock high-risk action', 'Finalize approval status']
  },
  policyValidation: {
    name: 'Policy validation',
    actions: ['Validate policy compliance', 'Verify evidence completeness', 'Block non-compliant action', 'Flag risk', 'Create audit note']
  },
  intake: {
    name: 'Intake & Parsing',
    actions: ['Receive inbound message', 'Parse event', 'Identify source', 'Extract metadata', 'Create intake object', 'Attach raw content']
  },
  normalization: {
    name: 'Normalization',
    actions: ['Normalize entities', 'Map fields', 'Standardize schema', 'Deduplicate attributes', 'Enrich case object', 'Clean event structure']
  },
  routing: {
    name: 'Routing',
    actions: ['Classify request', 'Route case', 'Select specialist', 'Set routing priority', 'Apply routing rules', 'Trigger fallback path']
  }
};

export const agentPermissionsConfig: Record<string, AgentPermissionConfig> = {
  'Supervisor': {
    template: 'Orchestration template',
    effectiveAccessSummary: [
      'Can orchestrate and route cases',
      'Cannot execute commerce actions',
      'Can request approvals',
      'Cannot access sensitive customer data'
    ],
    applicableCategories: [
      commonCategories.orchestration,
      commonCategories.escalation,
      commonCategories.ticketManagement
    ],
    mainTools: ['Zendesk', 'Salesforce'],
    optionalTools: ['Gorgias'],
    limits: [
      { id: 'actions_per_case', label: 'Actions per case limit', type: 'number', defaultValue: 5 },
      { id: 'routing_depth', label: 'Max routing depth', type: 'number', defaultValue: 3 }
    ],
    globalHardBlocks: [
      'Cannot export Personally Identifiable Information (PII)',
      'Cannot delete order history or customer records',
      'Cannot modify system-level routing rules'
    ],
    specificHardBlocks: [
      'Cannot execute direct refunds or payments',
      'Cannot modify customer account details'
    ]
  },
  'Approval Gatekeeper': {
    template: 'Approval template',
    effectiveAccessSummary: [
      'Can approve or deny high-risk actions',
      'Can request additional evidence',
      'Cannot execute direct customer communication',
      'Cannot create orders or shipping labels'
    ],
    applicableCategories: [
      commonCategories.approvals,
      commonCategories.escalation
    ],
    mainTools: ['Zendesk'],
    optionalTools: ['Salesforce'],
    limits: [
      { id: 'approval_timeout', label: 'Approval timeout (hours)', type: 'number', defaultValue: 24 },
      { id: 'escalation_threshold', label: 'Escalation threshold (amount)', type: 'currency', defaultValue: 500 }
    ],
    globalHardBlocks: [
      'Cannot export Personally Identifiable Information (PII)',
      'Cannot delete order history or customer records',
      'Cannot modify system-level routing rules'
    ],
    specificHardBlocks: [
      'Cannot execute refunds directly without another agent',
      'Cannot reply directly to customers'
    ]
  },
  'QA / Policy Check': {
    template: 'Validation template',
    effectiveAccessSummary: [
      'Can validate policy compliance',
      'Can block non-compliant actions',
      'Cannot execute refunds or orders',
      'Cannot update customer profiles'
    ],
    applicableCategories: [
      commonCategories.policyValidation,
      commonCategories.dataOperations
    ],
    mainTools: ['Zendesk', 'Salesforce'],
    optionalTools: [],
    limits: [
      { id: 'compliance_tolerance', label: 'Compliance tolerance (%)', type: 'percentage', defaultValue: 0 },
      { id: 'audit_retention', label: 'Audit note retention (days)', type: 'number', defaultValue: 90 }
    ],
    globalHardBlocks: [
      'Cannot export Personally Identifiable Information (PII)',
      'Cannot delete order history or customer records',
      'Cannot modify system-level routing rules'
    ],
    specificHardBlocks: [
      'Cannot execute commerce operations',
      'Cannot communicate with customers'
    ]
  },
  'Channel Ingest': {
    template: 'Intake template',
    effectiveAccessSummary: [
      'Can receive and parse inbound messages',
      'Can extract metadata and create intake objects',
      'Cannot execute commerce actions',
      'Cannot access admin settings'
    ],
    applicableCategories: [
      commonCategories.intake
    ],
    mainTools: ['Zendesk', 'Gorgias'],
    optionalTools: ['Salesforce'],
    limits: [
      { id: 'max_payload_size', label: 'Max payload size (MB)', type: 'number', defaultValue: 10 },
      { id: 'allowed_channels', label: 'Allowed Channels', type: 'tags', defaultValue: ['Email', 'Chat', 'SMS'], options: ['Email', 'Chat', 'SMS', 'WhatsApp', 'Social'] }
    ],
    globalHardBlocks: [
      'Cannot export Personally Identifiable Information (PII)',
      'Cannot delete order history or customer records',
      'Cannot modify system-level routing rules'
    ],
    specificHardBlocks: [
      'Cannot execute refunds or returns',
      'Cannot modify account data'
    ]
  },
  'Canonicalizer': {
    template: 'Intake template',
    effectiveAccessSummary: [
      'Can normalize entities and map fields',
      'Can enrich case objects',
      'Cannot execute commerce operations',
      'Cannot communicate with customers'
    ],
    applicableCategories: [
      commonCategories.normalization
    ],
    mainTools: ['Zendesk'],
    optionalTools: ['Salesforce'],
    limits: [
      { id: 'enrichment_timeout', label: 'Enrichment timeout (ms)', type: 'number', defaultValue: 5000 }
    ],
    globalHardBlocks: [
      'Cannot export Personally Identifiable Information (PII)',
      'Cannot delete order history or customer records',
      'Cannot modify system-level routing rules'
    ],
    specificHardBlocks: [
      'Cannot execute refunds or returns',
      'Cannot communicate with customers'
    ]
  },
  'Intent Router': {
    template: 'Orchestration template',
    effectiveAccessSummary: [
      'Can classify requests and route cases',
      'Can select specialists and set priority',
      'Cannot execute operational tasks'
    ],
    applicableCategories: [
      commonCategories.routing,
      commonCategories.escalation
    ],
    mainTools: ['Zendesk'],
    optionalTools: ['Salesforce'],
    limits: [
      { id: 'confidence_threshold', label: 'Min confidence threshold (%)', type: 'percentage', defaultValue: 85 }
    ],
    globalHardBlocks: [
      'Cannot export Personally Identifiable Information (PII)',
      'Cannot delete order history or customer records',
      'Cannot modify system-level routing rules'
    ],
    specificHardBlocks: [
      'Cannot execute commerce operations',
      'Cannot communicate with customers'
    ]
  },
  'Resolution Executor': {
    template: 'Commerce operations template',
    effectiveAccessSummary: [
      'Can execute refunds, returns, and orders',
      'Can apply discounts and store credit',
      'Cannot change system settings',
      'Cannot modify routing rules'
    ],
    applicableCategories: [
      commonCategories.orders,
      commonCategories.shipping,
      commonCategories.returns,
      commonCategories.refunds,
      commonCategories.discounts
    ],
    mainTools: ['Shopify', 'Stripe', 'ShipStation', 'Recharge'],
    optionalTools: ['Zendesk'],
    limits: [
      { id: 'max_refund', label: 'Max Refund Amount', type: 'currency', defaultValue: 50 },
      { id: 'max_discount', label: 'Max Discount Percentage', type: 'percentage', defaultValue: 15 }
    ],
    globalHardBlocks: [
      'Cannot export Personally Identifiable Information (PII)',
      'Cannot delete order history or customer records',
      'Cannot modify system-level routing rules'
    ],
    specificHardBlocks: [
      'Cannot bypass approval for high-risk refunds',
      'Cannot modify payment credentials'
    ]
  },
  'Customer Communication Agent': {
    template: 'Communication template',
    effectiveAccessSummary: [
      'Can send emails, SMS, and chat replies',
      'Can add internal notes',
      'Cannot execute commerce operations',
      'Cannot modify customer accounts'
    ],
    applicableCategories: [
      commonCategories.communication,
      commonCategories.ticketManagement
    ],
    mainTools: ['Zendesk', 'Gorgias', 'Klaviyo'],
    optionalTools: ['Salesforce'],
    limits: [
      { id: 'max_messages_per_case', label: 'Max messages per case', type: 'number', defaultValue: 10 },
      { id: 'allowed_channels', label: 'Allowed Channels', type: 'tags', defaultValue: ['Email', 'Chat', 'SMS'], options: ['Email', 'Chat', 'SMS', 'WhatsApp', 'Social'] }
    ],
    globalHardBlocks: [
      'Cannot export Personally Identifiable Information (PII)',
      'Cannot delete order history or customer records',
      'Cannot modify system-level routing rules'
    ],
    specificHardBlocks: [
      'Cannot execute refunds or returns',
      'Cannot promise compensation above limits'
    ]
  }
};

export const defaultAgentConfig: AgentPermissionConfig = {
  template: 'General template',
  effectiveAccessSummary: [
    'Can perform basic operations',
    'Cannot execute high-risk actions'
  ],
  applicableCategories: [
    commonCategories.communication,
    commonCategories.ticketManagement
  ],
  mainTools: ['Zendesk'],
  optionalTools: [],
  limits: [
    { id: 'actions_per_case', label: 'Actions per case limit', type: 'number', defaultValue: 5 }
  ],
  globalHardBlocks: [
    'Cannot export Personally Identifiable Information (PII)',
    'Cannot delete order history or customer records',
    'Cannot modify system-level routing rules'
  ],
  specificHardBlocks: []
};
