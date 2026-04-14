import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { customersApi } from '../api/client';
import { useApi } from '../api/hooks';

type CustomerTab = 'all_activity' | 'conversations' | 'orders' | 'system_logs';

interface Order {
  id: string;
  date: string;
  total: string;
  status: 'Processing' | 'Fulfilled' | 'Delivered';
  tracking?: string;
  items: { name: string; sku: string; price: string; icon: string }[];
}

interface Customer {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: string;
  company: string;
  location: string;
  timezone: string;
  since: string;
  segment: 'VIP Enterprise' | 'Standard';
  openTickets: number;
  aiImpact: { resolved: number; approvals?: number; escalated?: number };
  topIssue: string;
  risk?: 'Churn Risk' | 'Healthy' | 'Watchlist' | 'Refund Abuse';
  sources: { name: string; icon: string }[];
  plan: string;
  ltv: string;
  nextRenewal: string;
  orders: Order[];
  reconciliation?: {
    status: 'Healthy' | 'Warning' | 'Conflict' | 'Blocked';
    mismatches: number;
    lastChecked: string;
    domains: {
      domain: string;
      systems: { name: string; value: string }[];
      age: string;
      severity?: 'High' | 'Medium' | 'Low';
      sourceOfTruth: string;
      writebackStatus: 'Synced' | 'Pending writeback' | 'Failed' | 'Blocked by rule' | 'Requires approval' | 'Retry available';
      action: string;
      actionType: 'resolve' | 'retry' | 'approval' | 'workflow' | 'log';
      context: string;
    }[];
  };
}

type ApiLinkedIdentity = {
  system?: string | null;
  external_id?: string | null;
};

type ApiReconciliationDomain = {
  domain?: string | null;
  systems?: { name?: string | null; value?: string | null }[] | null;
  age?: string | null;
  severity?: 'high' | 'medium' | 'low' | string | null;
  sourceOfTruth?: string | null;
  writebackStatus?: Customer['reconciliation'] extends infer R
    ? R extends { domains: Array<infer D> }
      ? D extends { writebackStatus: infer S }
        ? S
        : never
      : never
    : never;
  action?: string | null;
  actionType?: 'resolve' | 'retry' | 'approval' | 'workflow' | 'log' | string | null;
  context?: string | null;
};

const defaultReconciliation = {
  status: 'Healthy' as const,
  mismatches: 0,
  lastChecked: 'N/A',
  domains: [],
};

function normalizeSource(name?: string | null, externalId?: string | null) {
  const safeName = name?.trim() || 'Unknown';
  return {
    name: safeName,
    icon: buildInitialsAvatar(safeName),
    externalId: externalId || undefined,
  };
}

function normalizeReconciliation(raw?: any): NonNullable<Customer['reconciliation']> {
  const domains = Array.isArray(raw?.domains)
    ? raw.domains.map((domain: ApiReconciliationDomain) => ({
        domain: domain.domain || 'Unknown domain',
        systems: Array.isArray(domain.systems)
          ? domain.systems.map((system) => ({
              name: system?.name || 'Unknown',
              value: system?.value || 'N/A',
            }))
          : [],
        age: domain.age || 'N/A',
        severity: domain.severity === 'high' ? 'High' : domain.severity === 'medium' ? 'Medium' : 'Low',
        sourceOfTruth: domain.sourceOfTruth || 'System',
        writebackStatus: (domain.writebackStatus as any) || 'Pending writeback',
        action: domain.action || 'Review required',
        actionType: (domain.actionType as any) || 'log',
        context: domain.context || 'No additional context provided.',
      }))
    : [];

  return {
    status: raw?.status === 'Blocked' ? 'Blocked' : raw?.status === 'Warning' ? 'Warning' : raw?.status === 'Conflict' ? 'Conflict' : 'Healthy',
    mismatches: Number(raw?.mismatches) || 0,
    lastChecked: raw?.lastChecked || raw?.last_checked || 'N/A',
    domains,
  };
}

const mockCustomers: Customer[] = [
  {
    id: 'C-101',
    name: 'Sarah Jenkins',
    email: 'sarah.j@acme.inc',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuByxk_qSdsiUPoFXfDQdCXHX-P_CBpcUM4bGfdd1KMKuEazMn76CPb_5w9v5FAnqSKSvmr8kfyJILXehrHqYvmMp98mES_P7pWRLK8GL5f5SbdESjm0p4CB4jtaPEISWEwnY5OfbaoI59M8yBBwEDgUz4vtC4u4-pwLVR4GgjTVgyHN3jxeV_r910m4EAk3NpsLmQqJzy9vXgwKAVdLdsJHTjNHiQn9F9rPY8lpgz6HLrxvAKvR_fqk8L3QjkYJefdp11QvJKpvjycJ',
    role: 'VP of Operations',
    company: 'Acme Corp',
    location: 'San Francisco, CA',
    timezone: '10:42 AM (PST)',
    since: 'Mar 2021',
    segment: 'VIP Enterprise',
    openTickets: 2,
    aiImpact: { resolved: 12, approvals: 3 },
    topIssue: 'Billing',
    risk: 'Churn Risk',
    sources: [
      { name: 'Shopify', icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBJS6liX4oOKOUkQrfpyS87xKNO-D-w0jnNINW9d8eEQclWUPWf0J94QkxhnjmDI2fpci69c6R1OfZbCErTx3pTpv99Q4AHUWO7WPXoTJvLawOoWoP2MdwGmul9sP-ss9dhh-raaVZnYbWpvbMk7lHAmtaUrSF-JI5g8QcruZKy8pB3iSQGIYd3Vq_aGR0hcEA2LCvGxf-dbmQKUuPMnU0Jh1aDw806OElFhr5BpJn-gj3b-gkidYtJDU8AEvEEENQex_QFiF-wMil0' },
      { name: 'Stripe', icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA4nAmoAjBQiTpAs7wI7XpwWVyX1EtXPAgy7NNKX-QMWebOSjwSwIDsG0AUnfklGFyn6hvA2YuJSQ0ladrydMbnM1E0AvqIdO6BfXbGqO6DEEMAa4tpUbHpAz4BnEk4UJncJxwumk9wdx_3Q2MczAuc-WOtJG2puq3o0hAohqZky-yrhSvmLqSpzdAY7lwLXK1ldhR4RhYlJdODRRunvMBhRVDWA1wTbu75wcpD-FkMbU3DpKKpDiUeqgtrlS8i9xdkKsUlHmIWPc6i' }
    ],
    plan: 'Pro Annual',
    ltv: '$12,450',
    nextRenewal: 'Nov 12, 2024',
    orders: [
      {
        id: '#KD-9921',
        date: 'Oct 24, 2024',
        total: '$1,250.00',
        status: 'Processing',
        tracking: 'UPS 1Z99999999...',
        items: [
          { name: 'Enterprise Annual License - Seats (x10)', sku: 'ENT-ANN-10', price: '$1,000.00', icon: 'inventory_2' },
          { name: 'Premium Onboarding Package', sku: 'SRV-ONB-PRM', price: '$250.00', icon: 'design_services' }
        ]
      },
      {
        id: '#KD-8834',
        date: 'Sep 12, 2024',
        total: '$450.00',
        status: 'Delivered',
        tracking: 'FedEx 77382...',
        items: [{ name: 'Standard Support Add-on', sku: 'SUP-STD', price: '$450.00', icon: 'support_agent' }]
      }
    ],
    reconciliation: {
      status: 'Conflict',
      mismatches: 2,
      lastChecked: '2 min ago',
      domains: [
        {
          domain: 'Subscription status',
          systems: [
            { name: 'Stripe', value: 'Active' },
            { name: 'Billing', value: 'Canceled' }
          ],
          age: '14 min',
          severity: 'High',
          sourceOfTruth: 'Billing',
          writebackStatus: 'Pending writeback',
          action: 'Sync cancellation to Stripe',
          actionType: 'retry',
          context: 'Billing cancellation was applied, but Stripe remains active.'
        },
        {
          domain: 'Refund status',
          systems: [
            { name: 'Support', value: 'Refund requested' },
            { name: 'Payments', value: 'Not executed' }
          ],
          age: '6 min',
          severity: 'Medium',
          sourceOfTruth: 'Payments workflow',
          writebackStatus: 'Requires approval',
          action: 'Send to Finance Ops',
          actionType: 'approval',
          context: 'Refund was requested in Support but execution has not reached Payments.'
        }
      ]
    }
  },
  {
    id: 'C-102',
    name: 'Michael Chen',
    email: 'm.chen@nebula.io',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA_LRdXKRPFzG2NbTcpIPDpGxCd4pq7vRWf5yyQsIXNsM-ZOE1jg-QKkRAx0Gxup56ADdNiG_fylLc_gBnQPVEFfaNLgRmDvCSfjrwjL4PaLudiaWvhrRZ89IdOIacEYTCuSepH9XyFWEPK8iF18DmcBIxB6UBJ6AEwSiChFyEGDguj2Gq-7burpd0o7n1aj9yOSCt9nwdO7rrmgE-NPz1wh5rRASN5Ytwz8pTUHcJXPoRfSDD06ndEWrXKdU-nv8kQe3mZRmehxQDc',
    role: 'CTO',
    company: 'Nebula',
    location: 'Austin, TX',
    timezone: '12:42 PM (CST)',
    since: 'Jan 2022',
    segment: 'Standard',
    openTickets: 0,
    aiImpact: { resolved: 4 },
    topIssue: 'Login',
    risk: 'Healthy',
    sources: [
      { name: 'Stripe', icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDnXEZBHRvRln4DMejkOxpILqdSAF-TiC3xWIRCbF0eEoaZE0cOQYyfEeILHiBxWIau3SLll-cLLNXDfBxzzzMe7vZJk9RWGfZ35iR09A-nIsB1JI0BezaLTri_AbTkazj-UWVYtE34LOJ7UUxoGsHAaD4e2K8vuChsL3HwdLOH6TeiavZvvKPWikfJIVSsKLbncsLmi6q9BLjAboXYzNcPbQaDBCEIEWLONgSijtnbaiuJlLoJ4EMvrI4utih6BmLSfZNl1X3dkH__' }
    ],
    plan: 'Pro Monthly',
    ltv: '$2,450',
    nextRenewal: 'Nov 05, 2024',
    orders: [],
    reconciliation: {
      status: 'Healthy',
      mismatches: 0,
      lastChecked: '1 min ago',
      domains: []
    }
  }
];

function buildInitialsAvatar(name: string) {
  const initials = name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase() || 'CU';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#EDE9FE"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700" fill="#6D28D9">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function Customers() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<CustomerTab>('all_activity');

  // Fetch canonical customers from the backend. The visual mock list is kept
  // only as historical reference data, never as runtime source.
  const { data: apiCustomers } = useApi(() => customersApi.list(), [], []);
  const { data: apiSelectedState } = useApi(
    () => selectedCustomerId ? customersApi.state(selectedCustomerId) : Promise.resolve(null),
    [selectedCustomerId]
  );

  const mapApiCustomer = (c: any) => {
    const name = c.canonical_name || c.name || 'Unknown';
    const email = c.canonical_email || c.email || '';
    const ltv = c.lifetime_value ?? c.ltv ?? 0;
    const segment = c.segment || 'regular';
    const linkedIdentities = Array.isArray(c.linked_identities) ? c.linked_identities as ApiLinkedIdentity[] : [];
    const canonicalSystems = Array.isArray(c.canonical_systems) ? c.canonical_systems : [];
    const sources = linkedIdentities.length > 0
      ? linkedIdentities.map(identity => normalizeSource(identity.system, identity.external_id))
      : canonicalSystems.length > 0
        ? canonicalSystems.map((system: any) => normalizeSource(system.system || system.name || system, system.external_id || system.externalId))
        : [normalizeSource(c.company || name)];
    return {
      id: c.id,
      name,
      email,
      avatar: c.avatar || buildInitialsAvatar(name),
      role: c.role || 'Customer',
      company: c.company || 'Personal',
      location: c.location || 'N/A',
      timezone: c.timezone || 'N/A',
      since: c.created_at ? new Date(c.created_at).getFullYear().toString() : 'N/A',
      segment: (segment === 'vip' ? 'VIP Enterprise' : 'Standard') as 'VIP Enterprise' | 'Standard',
      ltv: `$${Number(ltv).toLocaleString()}`,
      orders: Array.isArray(c.orders) ? c.orders : [],
      openTickets: Number(c.open_cases || 0),
      aiImpact: {
        resolved: Number(c.ai_impact?.resolved ?? c.ai_resolved ?? 0),
        approvals: Number(c.ai_impact?.approvals ?? c.ai_approvals ?? 0) || undefined,
        escalated: Number(c.ai_impact?.escalated ?? c.ai_escalated ?? 0) || undefined,
      },
      topIssue: c.top_issue || 'N/A',
      risk: c.risk_level === 'high' || c.risk_level === 'critical'
        ? 'Churn Risk'
        : c.risk_level === 'medium'
          ? 'Watchlist'
          : 'Healthy',
      badges: Array.isArray(c.badges) ? c.badges : [],
      orders_list: [],
      cases: [],
      activity: [],
      sources,
      plan: c.plan || 'Standard',
      nextRenewal: c.next_renewal || 'N/A',
      reconciliation: normalizeReconciliation(c.reconciliation),
    };
  };

  const customers: Customer[] = useMemo(() => {
    if (apiCustomers && apiCustomers.length > 0) {
      return apiCustomers.map(mapApiCustomer);
    }
    return [];
  }, [apiCustomers]);

  const selectedCustomer = React.useMemo(() => {
    const fallbackCustomer = customers.find(c => c.id === selectedCustomerId) || null;
    if (!apiSelectedState) return fallbackCustomer;

    const customer = apiSelectedState.customer || {};
    const systems = apiSelectedState.systems || {};
    const recentCases = apiSelectedState.recent_cases || [];
    const linkedIdentities = apiSelectedState.linked_identities || [];
    const unresolvedConflicts = apiSelectedState.unresolved_conflicts || [];

    const reconciliation = {
      status: unresolvedConflicts.length > 0 ? 'Conflict' : 'Healthy',
      mismatches: unresolvedConflicts.length,
      lastChecked: 'just now',
      domains: unresolvedConflicts.map((conflict: any) => ({
        domain: conflict.conflict_type,
        systems: [
          { name: 'Cases', value: conflict.case_number },
          { name: 'Recommended', value: conflict.recommended_action || 'Review required' },
        ],
        age: 'recent',
        severity: conflict.severity === 'critical' ? 'High' : conflict.severity === 'warning' ? 'Medium' : 'Low',
        sourceOfTruth: 'Case Runtime',
        writebackStatus: 'Requires approval',
        action: conflict.recommended_action || 'Review case',
        actionType: 'approval',
        context: conflict.recommended_action || 'Conflict detected in canonical state',
      })),
    };

    return {
      ...(fallbackCustomer || {}),
      id: customer.id,
      name: customer.canonical_name || fallbackCustomer?.name || 'Unknown',
      email: customer.canonical_email || fallbackCustomer?.email || '',
      avatar: fallbackCustomer?.avatar || buildInitialsAvatar(customer.canonical_name || fallbackCustomer?.name || 'Unknown'),
      role: fallbackCustomer?.role || 'Customer',
      company: fallbackCustomer?.company || 'Personal',
      location: fallbackCustomer?.location || 'N/A',
      timezone: fallbackCustomer?.timezone || 'N/A',
      since: customer.created_at ? new Date(customer.created_at).getFullYear().toString() : (fallbackCustomer?.since || 'N/A'),
      segment: customer.segment === 'vip' ? 'VIP Enterprise' : (fallbackCustomer?.segment || 'Standard'),
      openTickets: apiSelectedState.metrics?.open_cases || 0,
      aiImpact: fallbackCustomer?.aiImpact || { resolved: 0 },
      topIssue: unresolvedConflicts[0]?.conflict_type || fallbackCustomer?.topIssue || 'N/A',
      risk: customer.risk_level === 'high' || customer.risk_level === 'critical' ? 'Churn Risk' : (fallbackCustomer?.risk || 'Healthy'),
      sources: linkedIdentities.length > 0
        ? linkedIdentities.map((identity: any) => normalizeSource(identity.system, identity.external_id))
        : (fallbackCustomer?.sources || []),
      plan: fallbackCustomer?.plan || 'Standard',
      ltv: `$${Number(apiSelectedState.metrics?.lifetime_value || customer.lifetime_value || 0).toLocaleString()}`,
      nextRenewal: fallbackCustomer?.nextRenewal || 'N/A',
      orders: (systems.orders?.nodes || []).map((node: any) => ({
        id: node.label,
        date: node.timestamp ? new Date(node.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A',
        total: 'N/A',
        status: node.status === 'critical' ? 'Processing' : 'Delivered',
        items: [],
      })),
      reconciliation,
    } as Customer;
  }, [apiSelectedState, customers, selectedCustomerId]);

  const renderListView = () => (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-0 flex-shrink-0 z-20">
        <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Customers</h1>
              <p className="text-xs text-gray-500 mt-0.5">Unified customer records with AI insights & integrations</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-64 mr-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span>
                <input 
                  type="text" 
                  placeholder="Search customers..." 
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-all"
                />
              </div>
              <button className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:opacity-90 transition-opacity shadow-card flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">add</span>
                New Customer
              </button>
            </div>
          </div>
          <div className="px-6 flex items-center space-x-8 border-t border-gray-100 dark:border-gray-800 pt-3">
            {/* Keeping these as pills since they are not mutually exclusive tabs, but placing them in the tab area */}
            <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar pb-3">
              <button className="flex items-center px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-card">
                <span className="material-symbols-outlined text-sm mr-1.5 text-gray-500">filter_list</span>
                Segment
              </button>
              <button className="flex items-center px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-card">Source</button>
              <button className="flex items-center px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-card">Has open tickets</button>
              <button className="flex items-center px-3 py-1.5 text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg border border-purple-100 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors shadow-card">VIP</button>
              <button className="flex items-center px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-card">Risk flags</button>
              <button className="flex items-center px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-card">AI handled</button>
              <div className="border-l border-gray-200 dark:border-gray-700 h-5 mx-2"></div>
              <button className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 font-medium transition-colors">Clear all</button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-3 overflow-hidden min-h-0 p-6">
        <div className="flex-1 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50/80 dark:bg-card-dark sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">Customer</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">Source</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">Segment</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 text-center">Open</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">AI Impact (30d)</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">Top Issues</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">Risk</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800 bg-white dark:bg-card-dark">
                {customers.map((customer) => (
                  <tr 
                    key={customer.id} 
                    className="group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedCustomerId(customer.id)}
                  >
                    <td className="px-6 py-5 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <img alt="" className="h-10 w-10 rounded-full object-cover border border-gray-100 dark:border-gray-700 shadow-card" src={customer.avatar} referrerPolicy="no-referrer" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">{customer.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">{customer.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap">
                      <div className="flex -space-x-1.5 hover:space-x-0.5 transition-all">
                        {customer.sources.map((source, i) => (
                          <div key={i} className="w-6 h-6 rounded-full bg-white dark:bg-gray-800 shadow-card border border-gray-100 dark:border-gray-700 flex items-center justify-center p-1 z-10" title={source.name}>
                            <img alt={source.name} className="w-full h-full object-contain" src={source.icon} referrerPolicy="no-referrer" />
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap">
                      <span className={`px-2.5 py-1 inline-flex text-xs leading-4 font-semibold rounded-md border ${
                        customer.segment === 'VIP Enterprise' 
                          ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-100 dark:border-purple-800' 
                          : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-100 dark:border-blue-800'
                      }`}>
                        {customer.segment}
                      </span>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap text-center">
                      <span className={`text-sm font-bold ${customer.openTickets > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{customer.openTickets}</span>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-1 rounded text-[11px] font-semibold bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-900">{customer.aiImpact.resolved} Resolved</span>
                        {customer.aiImpact.approvals && (
                          <span className="px-2 py-1 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-900">{customer.aiImpact.approvals} Approval</span>
                        )}
                        {customer.aiImpact.escalated && (
                          <span className="px-2 py-1 rounded text-[11px] font-semibold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">{customer.aiImpact.escalated} Escalated</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap">
                      <span className="px-2 py-1 rounded text-[11px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{customer.topIssue}</span>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap">
                      {customer.risk && (
                        <span className={`px-2 py-1 rounded text-[11px] font-semibold border flex items-center w-fit ${
                          customer.risk === 'Churn Risk' || customer.risk === 'Refund Abuse' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border-red-100 dark:border-red-900/30' :
                          customer.risk === 'Watchlist' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 border-amber-100 dark:border-amber-900/30' :
                          'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-900/30'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                            customer.risk === 'Churn Risk' || customer.risk === 'Refund Abuse' ? 'bg-red-500' :
                            customer.risk === 'Watchlist' ? 'bg-amber-500' :
                            'bg-green-500'
                          }`}></span>
                          {customer.risk}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap text-right text-sm font-medium">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end space-x-1">
                        <button className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"><span className="material-symbols-outlined text-lg">visibility</span></button>
                        <button className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"><span className="material-symbols-outlined text-lg">more_horiz</span></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="w-80 flex flex-col gap-3 flex-shrink-0">
          <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm">AI Impact Overview</h3>
              <span className="text-xs text-gray-400 font-medium">Last 7 days</span>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-600 dark:text-gray-400 text-xs font-medium">Resolution Rate</span>
                  <span className="font-bold text-green-600 dark:text-green-400 text-xs">88%</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full shadow-card" style={{ width: '88%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-600 dark:text-gray-400 text-xs font-medium">Customer CSAT</span>
                  <span className="font-bold text-gray-900 dark:text-white text-xs">4.8/5</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                  <div className="bg-indigo-500 h-2 rounded-full shadow-card" style={{ width: '96%' }}></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide">Conversations</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white mt-1">1,204</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide">Handover</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white mt-1">142</div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30 rounded-xl p-5 shadow-card">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-800/30 rounded-lg text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                <span className="material-symbols-outlined text-lg">auto_awesome</span>
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">Churn Prediction</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                  AI detected 3 high-value customers at risk of churning due to recent billing disputes.
                </p>
                <button className="mt-3 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors">View analysis →</button>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card p-5 flex-1 overflow-y-auto">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 text-sm">Recent Activity</h3>
            <div className="space-y-4">
              {[
                { label: 'Refund approved for Order #2910', time: '2 mins ago', user: 'Sarah Jenkins', color: 'bg-green-500' },
                { label: 'New ticket: API Integration help', time: '15 mins ago', user: 'Tech Corp', color: 'bg-blue-500' },
                { label: 'Payment failed warning sent', time: '1 hour ago', user: 'Auto-system', color: 'bg-amber-500' }
              ].map((activity, i) => (
                <div key={i} className="flex gap-3 items-start group">
                  <div className={`mt-1.5 w-2 h-2 rounded-full ${activity.color} flex-shrink-0 ring-2 ring-white dark:ring-card-dark shadow-card`}></div>
                  <div>
                    <p className="text-xs text-gray-800 dark:text-gray-200 font-medium group-hover:text-black dark:group-hover:text-white transition-colors">{activity.label}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{activity.time} • {activity.user}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderProfileView = () => {
    if (!selectedCustomer) return null;

    return (
      <div className="flex-1 flex flex-col h-full min-w-0 bg-[#F8F9FA] dark:bg-background-dark overflow-hidden">
        <header className="flex-shrink-0 px-8 py-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-card-dark flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 font-medium">
              <button onClick={() => setSelectedCustomerId(null)} className="hover:text-gray-900 dark:hover:text-white transition-colors">Customers</button>
              <span className="material-symbols-outlined text-sm mx-1">chevron_right</span>
              <span className="text-gray-900 dark:text-white">{selectedCustomer.name}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
              {selectedCustomer.name}
              <span className={`px-2.5 py-1 rounded text-xs font-semibold border ${
                selectedCustomer.segment === 'VIP Enterprise' 
                  ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 border-purple-100 dark:border-purple-800/30' 
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border-blue-100 dark:border-blue-800/30'
              }`}>
                {selectedCustomer.segment}
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 text-sm font-semibold bg-white dark:bg-card-dark text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-card flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">more_horiz</span>
              More
            </button>
            <button className="px-4 py-2 text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors shadow-card flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              Open in Inbox
            </button>
          </div>
        </header>

        <div className="flex-1 flex gap-6 p-6 overflow-hidden min-h-0">
          {/* Left Sidebar */}
          <div className="w-80 flex-shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1 pb-4">
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card p-5">
              <div className="flex items-start gap-4 mb-4">
                <img alt={selectedCustomer.name} className="w-12 h-12 rounded-full object-cover border border-gray-100 dark:border-gray-800" src={selectedCustomer.avatar} referrerPolicy="no-referrer" />
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white text-base">{selectedCustomer.name}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{selectedCustomer.email}</p>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mt-1">{selectedCustomer.role} at {selectedCustomer.company}</p>
                </div>
              </div>
              <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">location_on</span> {selectedCustomer.location}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{selectedCustomer.timezone}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">calendar_today</span> Customer since</span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedCustomer.since}</span>
                </div>
              </div>
              <div className="mt-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Linked Profiles</span>
                  <span className="text-[10px] text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded border border-green-100 dark:border-green-800/30">98% Match Confidence</span>
                </div>
                <div className="flex gap-2">
                  {selectedCustomer.sources.map((source, i) => (
                    <button key={i} className="flex items-center justify-center w-8 h-8 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-card hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" title={`${source.name}: id_...`}>
                      <img alt={source.name} className="w-4 h-4 object-contain" src={source.icon} referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card p-5">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-3">Plan & Spend</h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide mb-1">Current Plan</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{selectedCustomer.plan}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide mb-1">Lifetime Value</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{selectedCustomer.ltv}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Next renewal</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">{selectedCustomer.nextRenewal}</span>
              </div>
            </div>

            {selectedCustomer.reconciliation && (
              <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-gray-400">sync_alt</span>
                    Reconciliation Center
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                    selectedCustomer.reconciliation.status === 'Conflict' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-100 dark:border-red-800/30' :
                    selectedCustomer.reconciliation.status === 'Warning' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-100 dark:border-amber-800/30' :
                    selectedCustomer.reconciliation.status === 'Blocked' ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 border-purple-100 dark:border-purple-800/30' :
                    'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-800/30'
                  }`}>
                    {selectedCustomer.reconciliation.status}
                  </span>
                </div>

                <div className="text-xs text-gray-500 dark:text-gray-400 mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                  {selectedCustomer.reconciliation.status === 'Healthy' ? (
                    <p>All connected customer states are aligned across Billing, Payments, Support, Orders, Returns, and CRM.</p>
                  ) : (
                    <p>Conflict &middot; {selectedCustomer.reconciliation.mismatches} mismatches</p>
                  )}
                  <p className="mt-1">Last reconciliation run {selectedCustomer.reconciliation.lastChecked}.</p>
                </div>

                {selectedCustomer.reconciliation.domains.length > 0 && (
                  <div className="space-y-4">
                    {selectedCustomer.reconciliation.domains.map((domain, idx) => (
                      <div key={idx} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="text-xs font-bold text-gray-900 dark:text-white">{domain.domain}</h4>
                          {domain.severity && (
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              domain.severity === 'High' ? 'text-red-600 bg-red-100/50' :
                              domain.severity === 'Medium' ? 'text-amber-600 bg-amber-100/50' :
                              'text-blue-600 bg-blue-100/50'
                            }`}>
                              {domain.severity}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5 mb-3">
                          {domain.systems.map((sys, sIdx) => (
                            <div key={sIdx} className="flex justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400">{sys.name}:</span>
                              <span className="font-medium text-gray-900 dark:text-white">{sys.value}</span>
                            </div>
                          ))}
                        </div>

                        <div className="space-y-1 mb-3 text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Source of truth:</span>
                            <span className="font-medium text-gray-700 dark:text-gray-300">{domain.sourceOfTruth}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Writeback:</span>
                            <span className="font-medium text-gray-700 dark:text-gray-300">{domain.writebackStatus}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Open for:</span>
                            <span className="font-medium text-gray-700 dark:text-gray-300">{domain.age}</span>
                          </div>
                        </div>

                        <div className="mb-3 p-2 bg-white dark:bg-card-dark rounded border border-gray-100 dark:border-gray-700 text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                          {domain.context}
                        </div>

                        <button className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md text-xs font-medium text-gray-900 dark:text-white transition-colors shadow-sm">
                          {domain.actionType === 'resolve' && <span className="material-symbols-outlined text-[14px]">check_circle</span>}
                          {domain.actionType === 'retry' && <span className="material-symbols-outlined text-[14px]">sync</span>}
                          {domain.actionType === 'approval' && <span className="material-symbols-outlined text-[14px]">gavel</span>}
                          {domain.actionType === 'workflow' && <span className="material-symbols-outlined text-[14px]">account_tree</span>}
                          {domain.actionType === 'log' && <span className="material-symbols-outlined text-[14px]">receipt_long</span>}
                          {domain.action}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg text-gray-400">shopping_bag</span>
                  Orders ({selectedCustomer.orders.length})
                </h3>
                <a className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline" href="#">View all</a>
              </div>
              <div className="space-y-3">
                {selectedCustomer.orders.slice(0, 2).map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-2.5 rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                    <div>
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">{order.id}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{order.date} • {order.total}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                      order.status === 'Processing' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-100 dark:border-amber-800/30' :
                      'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-800/30'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card p-5">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <button className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors">
                  <span className="flex items-center gap-2"><span className="material-symbols-outlined text-[18px] text-gray-500">assignment_turned_in</span> Create Approval</span>
                  <span className="material-symbols-outlined text-[16px] text-gray-400">arrow_forward</span>
                </button>
                <button className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800/30 transition-colors">
                  <span className="flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">currency_exchange</span> Start Refund</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col gap-4 overflow-hidden min-w-[400px]">
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/10 dark:to-purple-900/10 rounded-xl border border-indigo-100 dark:border-indigo-800/30 shadow-card p-5 flex-shrink-0 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <span className="material-symbols-outlined text-6xl">smart_toy</span>
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-xl">auto_awesome</span>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base">AI Executive Summary</h3>
                  <span className="text-[10px] bg-white/50 dark:bg-black/20 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200/50 dark:border-indigo-700/50 font-medium">Generated just now</span>
                </div>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 leading-snug">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
                    Customer reported a duplicate charge on Order #KD-9921 on Oct 25.
                  </li>
                  <li className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 leading-snug">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>
                    AI detected elevated churn risk due to sentiment drop in last 2 interactions.
                  </li>
                  <li className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 leading-snug">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
                    Historically a high-value VIP with 0 previous disputes in 3 years.
                  </li>
                  <li className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 leading-snug">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"></span>
                    Stripe confirms duplicate charge; eligible for immediate automated refund.
                  </li>
                  <li className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 leading-snug">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
                    Recommended action: Execute refund and send apology template #4.
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card flex flex-col flex-1 overflow-hidden">
              <div className="flex items-center border-b border-gray-100 dark:border-gray-800 px-4 pt-3 overflow-x-auto no-scrollbar flex-shrink-0">
                {(['all_activity', 'conversations', 'orders', 'system_logs'] as CustomerTab[]).map(tab => (
                  <button 
                    key={tab}
                    onClick={() => setActiveProfileTab(tab)}
                    className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-all border-b-2 ${
                      activeProfileTab === tab 
                        ? 'text-gray-900 dark:text-white border-gray-900 dark:border-white font-semibold' 
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border-transparent'
                    }`}
                  >
                    {tab.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                {activeProfileTab === 'all_activity' && (
                  <div className="relative border-l border-gray-200 dark:border-gray-700 ml-3 space-y-6 pb-4">
                    <div className="relative pl-6">
                      <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/30 border-2 border-white dark:border-card-dark flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Today, 10:30 AM</p>
                        <span className="text-[10px] font-medium text-gray-400">via Email</span>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Customer reported duplicate charge</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">"Hi, I noticed I was charged twice for my recent annual renewal. Order #KD-9921 shows two charges of $1,250 on my credit card statement. Can you please fix this immediately?"</p>
                      </div>
                    </div>
                    <div className="relative pl-6">
                      <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-900/30 border-2 border-white dark:border-card-dark flex items-center justify-center">
                        <span className="material-symbols-outlined text-[10px] text-indigo-600 dark:text-indigo-400">smart_toy</span>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Today, 10:31 AM</p>
                        <span className="text-[10px] font-medium text-indigo-500">System AI</span>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200"><span className="font-medium text-gray-900 dark:text-white">AI identified issue</span> as 'Duplicate Charge' and drafted reply.</p>
                    </div>
                  </div>
                )}
                {activeProfileTab === 'conversations' && (
                  <div className="space-y-4">
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-100 dark:border-gray-700 hover:bg-white dark:hover:bg-card-dark transition-colors group cursor-pointer shadow-card">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">#T-9921</span>
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white">Duplicate Charge on Renewal</h4>
                          </div>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">calendar_today</span> Oct 25, 2024 • via Email</p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-100 dark:border-amber-800/30">Open</span>
                      </div>
                      <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded p-2.5 border border-indigo-100/50 dark:border-indigo-800/30 mt-3 flex gap-2">
                        <span className="material-symbols-outlined text-indigo-500 text-[16px] flex-shrink-0 mt-0.5">auto_awesome</span>
                        <p className="text-xs text-gray-700 dark:text-gray-300"><span className="font-medium text-gray-900 dark:text-gray-100">AI Role:</span> Identified duplicate charge in Stripe, verified eligibility for refund, and prepared action plan for agent review.</p>
                      </div>
                    </div>
                  </div>
                )}
                {activeProfileTab === 'orders' && (
                  <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-left text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800/50">
                        <tr>
                          <th className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-300" scope="col">Order</th>
                          <th className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-300" scope="col">Date</th>
                          <th className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-300" scope="col">Total</th>
                          <th className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-300" scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-card-dark">
                        {selectedCustomer.orders.map(order => (
                          <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white flex items-center gap-2">
                              <span className="material-symbols-outlined text-[16px] text-gray-400">chevron_right</span>
                              {order.id}
                            </td>
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{order.date}</td>
                            <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{order.total}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                                order.status === 'Processing' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-100 dark:border-amber-800/30' :
                                'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-800/30'
                              }`}>
                                {order.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {activeProfileTab === 'system_logs' && (
                  <div className="font-mono text-[11px] md:text-xs space-y-1">
                    <div className="flex items-start gap-4 p-2 md:p-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <div className="w-24 flex-shrink-0 text-gray-400 dark:text-gray-500">10:31:05.122</div>
                      <div className="w-20 flex-shrink-0"><span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 font-medium">INFO</span></div>
                      <div className="w-32 flex-shrink-0 text-gray-500 dark:text-gray-400">webhook.stripe</div>
                      <div className="flex-1 text-gray-800 dark:text-gray-300 break-all">Stripe webhook received: charge.succeeded</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar pl-1 pb-4">
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card p-5">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-3">Risk Profile</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 rounded bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30">
                  <span className="text-xs font-medium text-red-800 dark:text-red-300 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Churn Risk</span>
                  <span className="text-xs font-bold text-red-700 dark:text-red-400">High</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800/30">
                  <span className="text-xs font-medium text-green-800 dark:text-green-300 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Fraud Risk</span>
                  <span className="text-xs font-bold text-green-700 dark:text-green-400">Low</span>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card p-5">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-indigo-500 text-sm">lightbulb</span> Next Actions
              </h3>
              <div className="space-y-2">
                <button className="w-full text-left p-3 rounded-lg border border-indigo-100 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-900/10 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors group">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">Offer Partial Refund</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Execute $1,250 refund via Stripe automatically.</p>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        <AnimatePresence mode="wait">
        {selectedCustomerId ? (
          <motion.div
            key="profile"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {renderProfileView()}
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {renderListView()}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
