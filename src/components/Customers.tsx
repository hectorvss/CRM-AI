import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { customersApi, paymentsApi, policyApi } from '../api/client';
import { useApi } from '../api/hooks';
import LoadingState from './LoadingState';
import type { NavigateFn, Page } from '../types';

type CustomerTab = 'all_activity' | 'conversations' | 'orders' | 'system_logs';

interface CustomersProps {
  onNavigate?: NavigateFn;
  focusCustomerId?: string | null;
}

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
  recentCases?: Array<{
    id: string;
    caseNumber?: string;
    case_number?: string;
    type?: string;
    status?: string;
  }>;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

export default function Customers({ onNavigate, focusCustomerId }: CustomersProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<CustomerTab>('all_activity');
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<'all' | 'vip' | 'standard'>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [openTicketsFilter, setOpenTicketsFilter] = useState<'all' | 'open'>('all');
  const [riskFilter, setRiskFilter] = useState<'all' | 'risk'>('all');
  const [aiHandledFilter, setAiHandledFilter] = useState<'all' | 'handled'>('all');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [customerActionsOpen, setCustomerActionsOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    company: '',
    source: 'manual',
    externalId: '',
  });

  // Fetch canonical customers from the backend — no mock data used.
  const { data: apiCustomers, loading: customersLoading, error: customersError } = useApi(() => customersApi.list(), [], []);
  const { data: apiSelectedState, loading: customerStateLoading, error: customerStateError } = useApi(
    () => selectedCustomerId ? customersApi.state(selectedCustomerId) : Promise.resolve(null),
    [selectedCustomerId]
  );
  const { data: apiActivity } = useApi(
    () => selectedCustomerId ? customersApi.activity(selectedCustomerId) : Promise.resolve([]),
    [selectedCustomerId]
  );

  React.useEffect(() => {
    if (!focusCustomerId) return;
    if (selectedCustomerId !== focusCustomerId) {
      setSelectedCustomerId(focusCustomerId);
    }
  }, [focusCustomerId, selectedCustomerId]);

  const mapApiCustomer = (c: any) => {
    const name    = c.canonical_name || c.name || 'Unknown';
    const email   = c.canonical_email || c.email || '';
    const ltv     = c.lifetime_value ?? c.ltv ?? 0;
    const segment = c.segment || 'regular';
    const linkedIdentities = Array.isArray(c.linked_identities) ? c.linked_identities as ApiLinkedIdentity[] : [];
    const sources = linkedIdentities.length > 0
      ? linkedIdentities.map(identity => normalizeSource(identity.system, identity.external_id))
      : [normalizeSource(c.company || name)];
    return {
      id:       c.id,
      name,
      email,
      avatar:   c.avatar_url || buildInitialsAvatar(name),
      role:     c.role     || 'Customer',
      company:  c.company  || 'Personal',
      location: c.location || 'N/A',
      timezone: c.timezone || 'N/A',
      since:    c.created_at ? new Date(c.created_at).getFullYear().toString() : 'N/A',
      segment:  (segment === 'vip' ? 'VIP Enterprise' : 'Standard') as 'VIP Enterprise' | 'Standard',
      ltv:      `$${Number(ltv).toLocaleString()}`,
      orders:   [],
      openTickets: Number(c.open_cases || 0),
      aiImpact: {
        resolved:  Number(c.ai_impact_resolved  ?? 0),
        approvals: Number(c.ai_impact_approvals ?? 0) || undefined,
        escalated: Number(c.ai_impact_escalated ?? 0) || undefined,
      },
      topIssue: c.top_issue || 'N/A',
      risk: (c.risk_level === 'high' || c.risk_level === 'critical')
        ? 'Churn Risk'
        : c.risk_level === 'medium' ? 'Watchlist' : 'Healthy',
      sources,
      plan:        c.plan        || 'Standard',
      nextRenewal: c.next_renewal ? new Date(c.next_renewal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A',
      reconciliation: defaultReconciliation,
    };
  };

  const customers: Customer[] = useMemo(() => {
    if (apiCustomers && apiCustomers.length > 0) {
      return apiCustomers.map(mapApiCustomer);
    }
    return [];
  }, [apiCustomers]);

  const isSelectedCustomerLoading = Boolean(selectedCustomerId && customerStateLoading && !apiSelectedState);

  const sourceOptions = useMemo(() => {
    const names = new Set<string>();
    customers.forEach(customer => {
      customer.sources.forEach(source => {
        const value = source.name?.trim();
        if (value) names.add(value);
      });
    });
    return ['all', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [customers]);

  const visibleCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return customers.filter(customer => {
      const haystack = [
        customer.name,
        customer.email,
        customer.company,
        customer.plan,
        customer.segment,
        customer.topIssue,
        customer.risk || '',
        ...customer.sources.map(source => source.name),
      ].join(' ').toLowerCase();
      const matchesSearch = !query || haystack.includes(query);
      const matchesSegment =
        segmentFilter === 'all' ||
        (segmentFilter === 'vip' && customer.segment === 'VIP Enterprise') ||
        (segmentFilter === 'standard' && customer.segment === 'Standard');
      const matchesSource =
        sourceFilter === 'all' ||
        customer.sources.some(source => source.name === sourceFilter);
      const matchesOpenTickets =
        openTicketsFilter === 'all' || customer.openTickets > 0;
      const matchesRisk =
        riskFilter === 'all' || (customer.risk ? customer.risk !== 'Healthy' : false);
      const matchesAiHandled =
        aiHandledFilter === 'all' || customer.aiImpact.resolved > 0;
      return matchesSearch && matchesSegment && matchesSource && matchesOpenTickets && matchesRisk && matchesAiHandled;
    });
  }, [aiHandledFilter, customers, openTicketsFilter, riskFilter, searchQuery, segmentFilter, sourceFilter]);
  const selectedCustomer = React.useMemo(() => {
    // Prefer full state data; fall back to list-level data while loading
    const listCustomer = customers.find(c => c.id === selectedCustomerId) || null;
    if (!apiSelectedState) return listCustomer;

    const customer          = apiSelectedState.customer           || {};
    const linkedIdentities  = apiSelectedState.linked_identities  || [];
    const unresolvedConflicts = apiSelectedState.unresolved_conflicts || [];
    const recentCases       = apiSelectedState.recent_cases        || [];

    // Orders: use the orders with line_items from state_snapshot.systems
    const orderNodes = apiSelectedState.systems?.orders?.nodes || [];
    const orders: Order[] = orderNodes.map((node: any) => ({
      id:       node.label || node.id,
      date:     node.timestamp ? new Date(node.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A',
      total:    node.total != null ? `$${Number(node.total).toLocaleString()}` : 'N/A',
      status:   (['in_transit', 'packed', 'processing'].includes(node.value) ? 'Processing' : node.status === 'critical' ? 'Processing' : 'Delivered') as Order['status'],
      tracking: node.tracking ?? undefined,
      items:    (node.line_items || []).map((li: any) => ({
        name:  li.name,
        sku:   li.sku   || '',
        price: li.price != null ? `$${Number(li.price).toFixed(2)}` : 'N/A',
        icon:  li.icon  || 'inventory_2',
      })),
    }));

    const reconciliation = {
      status:     (unresolvedConflicts.length > 0 ? 'Conflict' : 'Healthy') as Customer['reconciliation'] extends infer R ? R extends { status: infer S } ? S : never : never,
      mismatches: unresolvedConflicts.length,
      lastChecked: 'just now',
      domains: unresolvedConflicts.map((c: any) => ({
        domain:         c.conflict_type   || 'Unknown conflict',
        systems:        [{ name: 'Case', value: c.case_number || c.case_id }, { name: 'Action', value: c.recommended_action || 'Review required' }],
        age:            'recent',
        severity:       (c.severity === 'critical' ? 'High' : c.severity === 'warning' ? 'Medium' : 'Low') as 'High' | 'Medium' | 'Low',
        sourceOfTruth:  'Case Runtime',
        writebackStatus: 'Requires approval' as const,
        action:         c.recommended_action || 'Review case',
        actionType:     'approval' as const,
        context:        c.recommended_action || 'State conflict detected across systems.',
      })),
    };

    // AI recommendations from DB column
    const aiRecs: Array<{ action: string; priority: string; reason: string }> =
      Array.isArray(customer.ai_recommendations) ? customer.ai_recommendations : [];

    return {
      id:          customer.id            || listCustomer?.id    || '',
      name:        customer.canonical_name || listCustomer?.name  || 'Unknown',
      email:       customer.canonical_email|| listCustomer?.email || '',
      avatar:      customer.avatar_url     || buildInitialsAvatar(customer.canonical_name || listCustomer?.name || 'Unknown'),
      role:        customer.role           || listCustomer?.role    || 'Customer',
      company:     customer.company        || listCustomer?.company || 'Personal',
      location:    customer.location       || listCustomer?.location|| 'N/A',
      timezone:    customer.timezone       || listCustomer?.timezone|| 'N/A',
      since:       customer.created_at ? new Date(customer.created_at).getFullYear().toString() : (listCustomer?.since || 'N/A'),
      segment:     (customer.segment === 'vip' ? 'VIP Enterprise' : 'Standard') as 'VIP Enterprise' | 'Standard',
      openTickets: apiSelectedState.metrics?.open_cases ?? 0,
      aiImpact: {
        resolved:  Number(customer.ai_impact_resolved  ?? 0),
        approvals: Number(customer.ai_impact_approvals ?? 0) || undefined,
        escalated: Number(customer.ai_impact_escalated ?? 0) || undefined,
      },
      topIssue:    unresolvedConflicts[0]?.conflict_type || customer.top_issue || listCustomer?.topIssue || 'N/A',
      risk:        (customer.risk_level === 'high' || customer.risk_level === 'critical') ? 'Churn Risk'
                 : customer.risk_level === 'medium' ? 'Watchlist' : 'Healthy',
      fraudRisk:   customer.fraud_risk || 'low',
      aiExecutiveSummary: customer.ai_executive_summary || null,
      aiRecommendations:  aiRecs,
      sources:     linkedIdentities.length > 0
        ? linkedIdentities.map((id: any) => normalizeSource(id.system, id.external_id))
        : (listCustomer?.sources || []),
      plan:        customer.plan        || listCustomer?.plan        || 'Standard',
      ltv:         `$${Number(apiSelectedState.metrics?.lifetime_value || customer.lifetime_value || 0).toLocaleString()}`,
      nextRenewal: customer.next_renewal
        ? new Date(customer.next_renewal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : (listCustomer?.nextRenewal || 'N/A'),
      recentCases: recentCases.map((rc: any) => ({
        id:          rc.id || rc.case_number,
        caseNumber:  rc.case_number || rc.id,
        case_number: rc.case_number || rc.id,
        type:        rc.type || 'Case',
        status:      rc.status || 'open',
      })),
      orders,
      reconciliation,
    } as Customer & { fraudRisk: string; aiExecutiveSummary: string | null; aiRecommendations: typeof aiRecs };
  }, [apiSelectedState, customers, selectedCustomerId]);

  const selectedCustomerCaseId = selectedCustomer?.recentCases?.[0]?.id
    || selectedCustomer?.recentCases?.[0]?.caseNumber
    || selectedCustomer?.recentCases?.[0]?.case_number
    || null;

  const openCustomerCase = (page: Page) => {
    if (!selectedCustomerCaseId) {
      setActionMessage('No linked case found for this customer.');
      return;
    }
    onNavigate?.(page, selectedCustomerCaseId);
  };

  const handleCreateCustomer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionMessage(null);
    setIsCreatingCustomer(true);
    try {
      const created = await customersApi.create({
        displayName: newCustomer.name.trim() || newCustomer.email.trim() || 'New Customer',
        email: newCustomer.email.trim(),
        source: newCustomer.source,
        externalId: newCustomer.externalId.trim() || undefined,
        company: newCustomer.company.trim() || undefined,
      });
      setActionMessage(`Customer created: ${created?.canonical_name || created?.name || newCustomer.name || 'New Customer'}`);
      setIsCreateCustomerOpen(false);
      setNewCustomer({ name: '', email: '', company: '', source: 'manual', externalId: '' });
      if (created?.id) setSelectedCustomerId(created.id);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Failed to create customer.');
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  const handleCreateApproval = async () => {
    if (!selectedCustomerCaseId) {
      setActionMessage('No linked case found to send for approval.');
      return;
    }
    try {
      const result = await policyApi.evaluateAndRoute({
        entity_type: 'case',
        action_type: 'customer_profile_action',
        case_id: selectedCustomerCaseId,
        requested_by: 'user_alex',
        requested_by_type: 'human',
        context: {
          customer_id: selectedCustomer?.id,
          customer_email: selectedCustomer?.email,
          customer_name: selectedCustomer?.name,
          risk_level: selectedCustomer?.risk === 'Churn Risk' ? 'high' : selectedCustomer?.risk === 'Watchlist' ? 'medium' : 'low',
        },
      });
      setActionMessage(result?.approval_request_id
        ? `Approval request created for ${selectedCustomerCaseId}`
        : `Policy evaluated for ${selectedCustomerCaseId}: ${result?.decision || 'approved'}`);
      if (result?.approval_request_id) onNavigate?.('approvals');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Failed to create approval.');
    }
  };

  const handleStartRefund = async () => {
    if (!selectedCustomer) {
      setActionMessage('Select a customer first.');
      return;
    }
    try {
      const candidatePayments = await paymentsApi.list(selectedCustomer.email ? { q: selectedCustomer.email } : {});
      const payment = candidatePayments[0];
      if (!payment) {
        setActionMessage('No refundable payment found for this customer.');
        return;
      }
      const refund = await paymentsApi.refund(payment.id, {
        reason: `Refund requested from customer profile for ${selectedCustomer.name}`,
      });
      setActionMessage(`Refund created for payment ${payment.id}${refund?.id ? ` (${refund.id})` : ''}`);
      onNavigate?.('payments');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Failed to start refund.');
    }
  };

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
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-all"
                />
              </div>
              <button
                onClick={() => setIsCreateCustomerOpen(true)}
                className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold shadow-card flex items-center gap-2 hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-lg">add</span>
                New Customer
              </button>
            </div>
          </div>
          <div className="px-6 flex items-center space-x-8 border-t border-gray-100 dark:border-gray-800 pt-3">
            <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar pb-3">
              <button
                onClick={() => setSegmentFilter(prev => prev === 'all' ? 'vip' : 'all')}
                className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border transition-all shadow-card ${
                  segmentFilter !== 'all'
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span className="material-symbols-outlined text-sm mr-1.5 text-gray-500">filter_list</span>
                Segment
              </button>
              <button
                onClick={() => setSourceFilter(prev => prev === 'all' ? (sourceOptions[1] || 'all') : 'all')}
                className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border transition-all shadow-card ${
                  sourceFilter !== 'all'
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                Source
              </button>
              <button
                onClick={() => setOpenTicketsFilter(prev => prev === 'all' ? 'open' : 'all')}
                className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border transition-all shadow-card ${
                  openTicketsFilter === 'open'
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                Has open tickets
              </button>
              <button
                onClick={() => setSegmentFilter(prev => prev === 'vip' ? 'all' : 'vip')}
                className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border transition-all shadow-card ${
                  segmentFilter === 'vip'
                    ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                VIP
              </button>
              <button
                onClick={() => setRiskFilter(prev => prev === 'all' ? 'risk' : 'all')}
                className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border transition-all shadow-card ${
                  riskFilter === 'risk'
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                Risk flags
              </button>
              <button
                onClick={() => setAiHandledFilter(prev => prev === 'all' ? 'handled' : 'all')}
                className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border transition-all shadow-card ${
                  aiHandledFilter === 'handled'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-900 dark:border-white'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                AI handled
              </button>
              <div className="border-l border-gray-200 dark:border-gray-700 h-5 mx-2"></div>
              <button
                onClick={() => {
                  setSegmentFilter('all');
                  setSourceFilter('all');
                  setOpenTicketsFilter('all');
                  setRiskFilter('all');
                  setAiHandledFilter('all');
                  setSearchQuery('');
                }}
                className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 font-medium transition-colors"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      </div>

      {(customersError || customerStateError) && (
        <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-card dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-lg mt-0.5">error</span>
            <div className="min-w-0">
              <div className="font-semibold">Customer data unavailable</div>
              <div className="text-xs opacity-90">{customerStateError || customersError}</div>
            </div>
          </div>
        </div>
      )}
      {actionMessage && (
        <div className="mx-6 mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 shadow-card dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-lg mt-0.5">info</span>
            <div className="min-w-0">
              <div className="font-semibold">Customer action status</div>
              <div className="text-xs opacity-90">{actionMessage}</div>
            </div>
          </div>
        </div>
      )}

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
                {visibleCustomers.length > 0 ? visibleCustomers.map((customer) => (
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
                        <button
                          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedCustomerId(customer.id);
                            openCustomerCase('case_graph');
                          }}
                          title="View analysis"
                        >
                          <span className="material-symbols-outlined text-lg">visibility</span>
                        </button>
                        <button
                          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedCustomerId(customer.id);
                            setCustomerActionsOpen((value) => !value);
                          }}
                          title="More actions"
                        >
                          <span className="material-symbols-outlined text-lg">more_horiz</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500">
                      No customers match your search.
                    </td>
                  </tr>
                )}
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
                        <button onClick={() => openCustomerCase('case_graph')} className="mt-3 text-xs font-bold text-indigo-700 dark:text-indigo-300 transition-colors hover:underline">View analysis →</button>
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
    if (isSelectedCustomerLoading) {
      return (
        <LoadingState
          title="Loading customer"
          message="Fetching live customer state from Supabase."
        />
      );
    }
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
          <div className="relative flex items-center gap-3">
            <button
              onClick={() => setCustomerActionsOpen((value) => !value)}
              className="px-4 py-2 text-sm font-semibold bg-white/90 dark:bg-card-dark/90 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg shadow-card flex items-center gap-2 hover:bg-white dark:hover:bg-gray-800 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">more_horiz</span>
              More
            </button>
            <button
              onClick={() => openCustomerCase('inbox')}
              className="px-4 py-2 text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg shadow-card flex items-center gap-2 hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              Open in Inbox
            </button>
            {customerActionsOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-card-dark shadow-2xl z-20 p-2">
                <button
                  onClick={() => openCustomerCase('case_graph')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span className="material-symbols-outlined text-[18px]">timeline</span>
                  View analysis
                </button>
                <button
                  onClick={() => handleCreateApproval()}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span className="material-symbols-outlined text-[18px]">assignment_turned_in</span>
                  Create approval
                </button>
                <button
                  onClick={() => handleStartRefund()}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span className="material-symbols-outlined text-[18px]">currency_exchange</span>
                  Start refund
                </button>
              </div>
            )}
          </div>
        </header>

        {actionMessage && (
          <div className="px-6 pt-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 shadow-card dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-lg mt-0.5">info</span>
                <div className="min-w-0">
                  <div className="font-semibold">Customer action status</div>
                  <div className="text-xs opacity-90">{actionMessage}</div>
                </div>
              </div>
            </div>
          </div>
        )}

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
                <button
                  onClick={handleCreateApproval}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-600 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <span className="flex items-center gap-2"><span className="material-symbols-outlined text-[18px] text-gray-500">assignment_turned_in</span> Create Approval</span>
                  <span className="material-symbols-outlined text-[16px] text-gray-400">arrow_forward</span>
                </button>
                <button
                  onClick={handleStartRefund}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-800/30 transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
                >
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
                  <span className="text-[10px] bg-white/50 dark:bg-black/20 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200/50 dark:border-indigo-700/50 font-medium">From canonical state</span>
                </div>
                {(selectedCustomer as any).aiExecutiveSummary ? (
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{(selectedCustomer as any).aiExecutiveSummary}</p>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 italic">No AI summary available for this customer yet.</p>
                )}
                {((selectedCustomer as any).aiRecommendations?.length > 0) && (
                  <div className="mt-3 space-y-1.5 pt-3 border-t border-indigo-100/60 dark:border-indigo-800/30">
                    <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">Recommended Actions</p>
                    {(selectedCustomer as any).aiRecommendations.map((rec: any, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          rec.priority === 'high' ? 'bg-red-500' : rec.priority === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                        }`}></span>
                        <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug"><span className="font-medium">{rec.action}</span> — {rec.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
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
                {activeProfileTab === 'all_activity' && (() => {
                  const events = Array.isArray(apiActivity) ? apiActivity.filter((e: any) => e.type !== 'system_log') : [];
                  if (events.length === 0) return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No activity recorded yet.</p>;
                  const dotColor = (type: string, level: string) => {
                    if (level === 'error')   return 'bg-red-500';
                    if (level === 'warning') return 'bg-amber-500';
                    if (type === 'ai_summary') return 'bg-indigo-500';
                    if (type === 'agent_note') return 'bg-purple-500';
                    if (type === 'payment')   return 'bg-green-500';
                    return 'bg-blue-500';
                  };
                  return (
                    <div className="relative border-l border-gray-200 dark:border-gray-700 ml-3 space-y-6 pb-4">
                      {events.map((event: any) => (
                        <div key={event.id} className="relative pl-6">
                          <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full ${dotColor(event.type, event.level)} bg-opacity-20 border-2 border-white dark:border-card-dark flex items-center justify-center`}>
                            <div className={`w-2 h-2 rounded-full ${dotColor(event.type, event.level)}`}></div>
                          </div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(event.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <span className="text-[10px] font-medium text-gray-400">{event.source || event.system || ''}</span>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">{event.title}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{event.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {activeProfileTab === 'conversations' && (() => {
                  const cases = selectedCustomer?.recentCases || [];
                  if (cases.length === 0) return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No linked conversations found.</p>;
                  return (
                    <div className="space-y-4">
                      {cases.map((c) => (
                        <div key={c.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-100 dark:border-gray-700 hover:bg-white dark:hover:bg-card-dark transition-colors group cursor-pointer shadow-card" onClick={() => onNavigate?.('inbox', c.id)}>
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{c.caseNumber || c.case_number || c.id}</span>
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white">{c.type || 'Case'}</h4>
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                              c.status === 'open' || c.status === 'escalated' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-100 dark:border-amber-800/30' :
                              'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-800/30'
                            }`}>{c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : 'Open'}</span>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <span className="material-symbols-outlined text-indigo-500 text-[16px] flex-shrink-0 mt-0.5">open_in_new</span>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Click to open in Inbox</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
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
                {activeProfileTab === 'system_logs' && (() => {
                  const logs = Array.isArray(apiActivity) ? apiActivity.filter((e: any) => e.type === 'system_log') : [];
                  if (logs.length === 0) return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No system logs recorded yet.</p>;
                  return (
                    <div className="font-mono text-[11px] md:text-xs space-y-1">
                      {logs.map((log: any) => (
                        <div key={log.id} className="flex items-start gap-4 p-2 md:p-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <div className="w-28 flex-shrink-0 text-gray-400 dark:text-gray-500 text-[10px]">
                            {new Date(log.occurred_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </div>
                          <div className="w-16 flex-shrink-0">
                            <span className={`px-1.5 py-0.5 rounded font-medium ${
                              log.level === 'error'   ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
                              log.level === 'warning' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' :
                              'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                            }`}>{(log.level || 'info').toUpperCase()}</span>
                          </div>
                          <div className="w-28 flex-shrink-0 text-gray-500 dark:text-gray-400">{log.system || log.source || 'system'}</div>
                          <div className="flex-1 text-gray-800 dark:text-gray-300 break-all">{log.content}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar pl-1 pb-4">
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card p-5">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-3">Risk Profile</h3>
              <div className="space-y-3">
                {(() => {
                  const churn = selectedCustomer?.risk || 'Healthy';
                  const fraud = (selectedCustomer as any)?.fraudRisk || 'low';
                  const churnHigh = churn === 'Churn Risk';
                  const fraudHigh = fraud === 'high' || fraud === 'critical';
                  return (
                    <>
                      <div className={`flex items-center justify-between p-2 rounded border ${churnHigh ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800/30' : 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-800/30'}`}>
                        <span className={`text-xs font-medium flex items-center gap-1.5 ${churnHigh ? 'text-red-800 dark:text-red-300' : 'text-green-800 dark:text-green-300'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${churnHigh ? 'bg-red-500' : 'bg-green-500'}`}></span> Churn Risk
                        </span>
                        <span className={`text-xs font-bold ${churnHigh ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>{churnHigh ? 'High' : churn === 'Watchlist' ? 'Medium' : 'Low'}</span>
                      </div>
                      <div className={`flex items-center justify-between p-2 rounded border ${fraudHigh ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800/30' : 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-800/30'}`}>
                        <span className={`text-xs font-medium flex items-center gap-1.5 ${fraudHigh ? 'text-red-800 dark:text-red-300' : 'text-green-800 dark:text-green-300'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${fraudHigh ? 'bg-red-500' : 'bg-green-500'}`}></span> Fraud Risk
                        </span>
                        <span className={`text-xs font-bold ${fraudHigh ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>{fraudHigh ? 'High' : fraud === 'medium' ? 'Medium' : 'Low'}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card p-5">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-3 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-indigo-500 text-sm">lightbulb</span> Next Actions
              </h3>
              <div className="space-y-2">
                {((selectedCustomer as any)?.aiRecommendations?.length > 0)
                  ? (selectedCustomer as any).aiRecommendations.map((rec: any, i: number) => (
                    <button key={i} className="w-full text-left p-3 rounded-lg border border-indigo-100 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-900/10 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors group">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">{rec.action}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{rec.reason}</p>
                    </button>
                  ))
                  : <p className="text-xs text-gray-400 dark:text-gray-500 italic">No recommendations yet.</p>
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (customersLoading && customers.length === 0) {
    return (
      <LoadingState
        title="Loading customers"
        message="Fetching canonical customer profiles from Supabase."
      />
    );
  }

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
      <AnimatePresence>
        {isCreateCustomerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          >
            <form
              onSubmit={handleCreateCustomer}
              className="w-full max-w-lg rounded-2xl bg-white dark:bg-card-dark shadow-2xl border border-gray-200 dark:border-gray-700 p-6"
            >
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">New Customer</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Create a real customer record in the active workspace.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateCustomerOpen(false)}
                  className="w-9 h-9 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="text-gray-600 dark:text-gray-300 font-medium">Name</span>
                  <input
                    value={newCustomer.name}
                    onChange={(event) => setNewCustomer((value) => ({ ...value, name: event.target.value }))}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    placeholder="Customer name"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-gray-600 dark:text-gray-300 font-medium">Email</span>
                  <input
                    type="email"
                    value={newCustomer.email}
                    onChange={(event) => setNewCustomer((value) => ({ ...value, email: event.target.value }))}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    placeholder="customer@example.com"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-gray-600 dark:text-gray-300 font-medium">Company</span>
                  <input
                    value={newCustomer.company}
                    onChange={(event) => setNewCustomer((value) => ({ ...value, company: event.target.value }))}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    placeholder="Company name"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-gray-600 dark:text-gray-300 font-medium">Source</span>
                  <select
                    value={newCustomer.source}
                    onChange={(event) => setNewCustomer((value) => ({ ...value, source: event.target.value }))}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  >
                    <option value="manual">Manual</option>
                    <option value="shopify">Shopify</option>
                    <option value="stripe">Stripe</option>
                    <option value="intercom">Intercom</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="text-gray-600 dark:text-gray-300 font-medium">External ID</span>
                  <input
                    value={newCustomer.externalId}
                    onChange={(event) => setNewCustomer((value) => ({ ...value, externalId: event.target.value }))}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                    placeholder="Optional external identifier"
                  />
                </label>
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateCustomerOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingCustomer}
                  className="px-4 py-2 rounded-lg bg-black dark:bg-white text-white dark:text-black text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {isCreatingCustomer ? 'Creating...' : 'Create customer'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
