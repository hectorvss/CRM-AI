/**
 * Centralized permission catalog.
 * Single source of truth for both frontend gating (<Can>) and the
 * Settings → Roles permission matrix UI.
 * Backend uses the same key strings via requirePermission().
 */

export type PermissionAction = 'read' | 'write' | 'delete' | 'export' | 'admin' | 'invite' | 'decide' | 'trigger' | 'publish' | 'assign' | 'manage';

export interface PermissionDef {
  key: string;
  domain: string;
  domainIcon: string;
  action: PermissionAction;
  label: string;
  description: string;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  // ─── Inbox / Cases ───────────────────────────────────────────────
  { key: 'inbox.read',       domain: 'Inbox',        domainIcon: 'inbox',             action: 'read',    label: 'View conversations',        description: 'Read cases, messages and conversations' },
  { key: 'inbox.write',      domain: 'Inbox',        domainIcon: 'inbox',             action: 'write',   label: 'Reply & manage cases',      description: 'Send replies, change status, assign cases' },
  { key: 'cases.read',       domain: 'Inbox',        domainIcon: 'inbox',             action: 'read',    label: 'View cases',                description: 'Read case details and timeline' },
  { key: 'cases.write',      domain: 'Inbox',        domainIcon: 'inbox',             action: 'write',   label: 'Edit cases',                description: 'Update case fields, notes and status' },
  { key: 'cases.assign',     domain: 'Inbox',        domainIcon: 'inbox',             action: 'assign',  label: 'Assign cases',              description: 'Reassign cases to agents or teams' },

  // ─── Customers ───────────────────────────────────────────────────
  { key: 'customers.read',   domain: 'Customers',    domainIcon: 'people',            action: 'read',    label: 'View customers',            description: 'Read customer profiles and history' },
  { key: 'customers.write',  domain: 'Customers',    domainIcon: 'people',            action: 'write',   label: 'Edit customers',            description: 'Update customer data, tags and segments' },

  // ─── Orders ──────────────────────────────────────────────────────
  { key: 'orders.read',      domain: 'Orders',       domainIcon: 'shopping_bag',      action: 'read',    label: 'View orders',               description: 'Read order details and line items' },
  { key: 'orders.write',     domain: 'Orders',       domainIcon: 'shopping_bag',      action: 'write',   label: 'Manage orders',             description: 'Cancel, modify or fulfill orders' },

  // ─── Payments ────────────────────────────────────────────────────
  { key: 'payments.read',    domain: 'Payments',     domainIcon: 'payments',          action: 'read',    label: 'View payments',             description: 'Read payment records and transactions' },
  { key: 'payments.write',   domain: 'Payments',     domainIcon: 'payments',          action: 'write',   label: 'Process payments & refunds',description: 'Issue refunds, void charges, adjust amounts' },

  // ─── Returns ─────────────────────────────────────────────────────
  { key: 'returns.read',     domain: 'Returns',      domainIcon: 'assignment_return', action: 'read',    label: 'View returns',              description: 'Read return requests and status' },
  { key: 'returns.write',    domain: 'Returns',      domainIcon: 'assignment_return', action: 'write',   label: 'Manage returns',            description: 'Approve, reject and process return requests' },

  // ─── Approvals ───────────────────────────────────────────────────
  { key: 'approvals.read',   domain: 'Approvals',    domainIcon: 'check_circle',      action: 'read',    label: 'View approvals',            description: 'Read approval requests and decisions' },
  { key: 'approvals.write',  domain: 'Approvals',    domainIcon: 'check_circle',      action: 'write',   label: 'Submit approvals',          description: 'Create and submit approval requests' },
  { key: 'approvals.decide', domain: 'Approvals',    domainIcon: 'check_circle',      action: 'decide',  label: 'Approve / Reject',          description: 'Make final decisions on approval requests' },

  // ─── Workflows ───────────────────────────────────────────────────
  { key: 'workflows.read',   domain: 'Workflows',    domainIcon: 'account_tree',      action: 'read',    label: 'View workflows',            description: 'Read workflow definitions and run history' },
  { key: 'workflows.write',  domain: 'Workflows',    domainIcon: 'account_tree',      action: 'write',   label: 'Edit workflows',            description: 'Create and edit workflow definitions' },
  { key: 'workflows.trigger',domain: 'Workflows',    domainIcon: 'account_tree',      action: 'trigger', label: 'Trigger workflows',         description: 'Manually execute workflow runs' },

  // ─── Knowledge ───────────────────────────────────────────────────
  { key: 'knowledge.read',   domain: 'Knowledge',    domainIcon: 'menu_book',         action: 'read',    label: 'View knowledge base',       description: 'Read articles, snippets and policies' },
  { key: 'knowledge.write',  domain: 'Knowledge',    domainIcon: 'menu_book',         action: 'write',   label: 'Edit knowledge articles',   description: 'Create and edit knowledge articles' },
  { key: 'knowledge.publish',domain: 'Knowledge',    domainIcon: 'menu_book',         action: 'publish', label: 'Publish articles',          description: 'Publish and unpublish knowledge articles' },

  // ─── Reports ─────────────────────────────────────────────────────
  { key: 'reports.read',     domain: 'Reports',      domainIcon: 'bar_chart',         action: 'read',    label: 'View reports',              description: 'Access analytics dashboards and reports' },
  { key: 'reports.export',   domain: 'Reports',      domainIcon: 'bar_chart',         action: 'export',  label: 'Export reports',            description: 'Download reports as CSV / PDF' },

  // ─── Integrations ────────────────────────────────────────────────
  { key: 'integrations.read',  domain: 'Integrations', domainIcon: 'extension',       action: 'read',    label: 'View integrations',         description: 'See connected apps and API configurations' },
  { key: 'integrations.write', domain: 'Integrations', domainIcon: 'extension',       action: 'write',   label: 'Manage integrations',       description: 'Connect, disconnect and configure apps' },

  // ─── Settings ────────────────────────────────────────────────────
  { key: 'settings.read',    domain: 'Settings',     domainIcon: 'settings',          action: 'read',    label: 'View workspace settings',   description: 'Read workspace configuration and policies' },
  { key: 'settings.write',   domain: 'Settings',     domainIcon: 'settings',          action: 'write',   label: 'Edit workspace settings',   description: 'Change workspace name, logo, hours and policies' },

  // ─── Members ─────────────────────────────────────────────────────
  { key: 'members.read',     domain: 'Members',      domainIcon: 'group',             action: 'read',    label: 'View team members',         description: 'See workspace members, roles and status' },
  { key: 'members.invite',   domain: 'Members',      domainIcon: 'group',             action: 'invite',  label: 'Invite members',            description: 'Send invitations to new team members' },
  { key: 'members.remove',   domain: 'Members',      domainIcon: 'group',             action: 'delete',  label: 'Remove / suspend members',  description: 'Suspend or remove members from workspace' },

  // ─── Billing ─────────────────────────────────────────────────────
  { key: 'billing.read',     domain: 'Billing',      domainIcon: 'diamond',           action: 'read',    label: 'View billing & usage',      description: 'Read invoices, usage metrics and plan info' },
  { key: 'billing.manage',   domain: 'Billing',      domainIcon: 'diamond',           action: 'manage',  label: 'Manage billing',            description: 'Upgrade plan, manage seats and payment methods' },

  // ─── Audit ───────────────────────────────────────────────────────
  { key: 'audit.read',       domain: 'Audit',        domainIcon: 'admin_panel_settings', action: 'read', label: 'View audit log',            description: 'Read workspace activity and security log' },
];

/** All unique domain groups in display order */
export const PERMISSION_DOMAINS = [...new Set(PERMISSION_CATALOG.map(p => p.domain))];

/** Lookup a permission definition by key */
export function getPermission(key: string): PermissionDef | undefined {
  return PERMISSION_CATALOG.find(p => p.key === key);
}

/** Get all permissions for a domain */
export function getPermissionsByDomain(domain: string): PermissionDef[] {
  return PERMISSION_CATALOG.filter(p => p.domain === domain);
}

/** All permission keys as a flat array */
export const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map(p => p.key);

/**
 * Role presets — mirrors the backend ROLE_PERMISSION_PRESETS.
 * Used for role creation templates in Settings → Teams & Roles.
 */
export const ROLE_PRESETS: Record<string, { label: string; description: string; icon: string; permissions: string[] }> = {
  workspace_admin: {
    label: 'Workspace Admin',
    description: 'Full access to all features and settings',
    icon: 'admin_panel_settings',
    permissions: ['*'],
  },
  supervisor: {
    label: 'Supervisor',
    description: 'Team management, reports and settings access',
    icon: 'supervisor_account',
    permissions: [
      'cases.read', 'cases.write', 'cases.assign',
      'customers.read', 'customers.write',
      'orders.read', 'orders.write',
      'payments.read', 'payments.write',
      'returns.read', 'returns.write',
      'approvals.read', 'approvals.decide',
      'workflows.read', 'workflows.write', 'workflows.trigger',
      'knowledge.read', 'knowledge.write', 'knowledge.publish',
      'reports.read', 'reports.export',
      'settings.read', 'settings.write',
      'members.read', 'members.invite', 'members.remove',
      'audit.read',
    ],
  },
  agent: {
    label: 'Support Agent',
    description: 'Handle cases, customers and knowledge — no admin',
    icon: 'support_agent',
    permissions: [
      'inbox.read', 'inbox.write',
      'cases.read', 'cases.write',
      'customers.read',
      'orders.read',
      'payments.read',
      'returns.read',
      'approvals.read',
      'workflows.read', 'workflows.trigger',
      'knowledge.read',
      'reports.read',
      'settings.read',
    ],
  },
  billing_admin: {
    label: 'Billing Admin',
    description: 'Billing, plans and usage — read-only elsewhere',
    icon: 'receipt_long',
    permissions: ['billing.read', 'billing.manage', 'reports.read', 'reports.export'],
  },
  viewer: {
    label: 'Viewer',
    description: 'Read-only access across all areas',
    icon: 'visibility',
    permissions: [
      'inbox.read', 'cases.read', 'customers.read',
      'orders.read', 'payments.read', 'returns.read',
      'approvals.read', 'workflows.read', 'knowledge.read',
      'reports.read', 'settings.read', 'members.read',
    ],
  },
};
