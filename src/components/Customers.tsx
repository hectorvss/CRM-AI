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


function buildInitialsAvatar(name: string) {
  const initials = name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase() || 'CU';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#F4F4F5"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700" fill="#18181B">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const neutralChipClass = 'inline-flex items-center rounded-full border border-black/10 bg-black/[0.03] px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300';
const neutralDotClass = 'mr-1.5 h-1.5 w-1.5 rounded-full bg-gray-400';

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

  const customerSummary = useMemo(() => {
    const total = customers.length;
    const resolved = customers.reduce((sum, customer) => sum + (customer.aiImpact.resolved || 0), 0);
    const approvals = customers.reduce((sum, customer) => sum + (customer.aiImpact.approvals || 0), 0);
    const escalated = customers.reduce((sum, customer) => sum + (customer.aiImpact.escalated || 0), 0);
    const openTickets = customers.reduce((sum, customer) => sum + customer.openTickets, 0);
    const atRisk = customers.filter(customer => customer.risk && customer.risk !== 'Healthy').length;
    const handledCustomers = customers.filter(customer => customer.aiImpact.resolved > 0).length;
    const resolutionRate = Math.round((resolved / Math.max(resolved + approvals + escalated, 1)) * 100);
    const handledRate = Math.round((handledCustomers / Math.max(total, 1)) * 100);
    return { total, resolved, approvals, escalated, openTickets, atRisk, handledCustomers, resolutionRate, handledRate };
  }, [customers]);

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
      if (page === 'case_graph') {
        onNavigate?.('case_graph');
        return;
      }
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
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white'
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
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-gray-900 dark:border-white'
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
                      <span className={neutralChipClass}>
                        {customer.segment}
                      </span>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap text-center">
                      <span className={`text-sm font-bold ${customer.openTickets > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{customer.openTickets}</span>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className={neutralChipClass}>{customer.aiImpact.resolved} Resolved</span>
                        {customer.aiImpact.approvals && (
                          <span className={neutralChipClass}>{customer.aiImpact.approvals} Approval</span>
                        )}
                        {customer.aiImpact.escalated && (
                          <span className={neutralChipClass}>{customer.aiImpact.escalated} Escalated</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap">
                      <span className={neutralChipClass}>{customer.topIssue}</span>
                    </td>
                    <td className="px-4 py-5 whitespace-nowrap">
                      {customer.risk && (
                        <span className={neutralChipClass}>
                          <span className={neutralDotClass}></span>
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
          <div className="bg-white dark:bg-card-dark rounded-[24px] border border-black/5 dark:border-white/10 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-950 dark:text-white text-sm">AI Impact Overview</h3>
              <span className="text-xs text-gray-400 font-medium">{customerSummary.total} customers</span>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-600 dark:text-gray-400 text-xs font-medium">Resolution Rate</span>
                  <span className="font-semibold text-gray-950 dark:text-white text-xs">{customerSummary.resolutionRate}%</span>
                </div>
                <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-2">
                  <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${customerSummary.resolutionRate}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-gray-600 dark:text-gray-400 text-xs font-medium">AI Handled</span>
                  <span className="font-semibold text-gray-950 dark:text-white text-xs">{customerSummary.handledRate}%</span>
                </div>
                <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-2">
                  <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${customerSummary.handledRate}%` }}></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-black/[0.02] dark:bg-white/[0.04] p-3 rounded-2xl border border-black/5 dark:border-white/10">
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide">Conversations</div>
                  <div className="text-lg font-semibold text-gray-950 dark:text-white mt-1">{customerSummary.openTickets}</div>
                </div>
                <div className="bg-black/[0.02] dark:bg-white/[0.04] p-3 rounded-2xl border border-black/5 dark:border-white/10">
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide">Approvals</div>
                  <div className="text-lg font-semibold text-gray-950 dark:text-white mt-1">{customerSummary.approvals}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-card-dark border border-black/5 dark:border-white/10 rounded-[24px] p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-black/5 dark:bg-white/5 rounded-full text-gray-700 dark:text-gray-200 flex-shrink-0">
                <span className="material-symbols-outlined text-lg">tune</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-950 dark:text-white text-sm">Operational Focus</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                  Filter the customer table by live workspace signals. No mock shortcuts.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => setRiskFilter('risk')} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-black/[0.04] dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.06]">
                    {customerSummary.atRisk} at risk
                  </button>
                  <button onClick={() => setAiHandledFilter('handled')} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-black/[0.04] dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.06]">
                    {customerSummary.handledCustomers} AI handled
                  </button>
                </div>
                        <button onClick={() => openCustomerCase('case_graph')} className="mt-3 text-xs font-bold text-indigo-700 dark:text-indigo-300 transition-colors hover:underline">View analysis →</button>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-card-dark rounded-[24px] border border-black/5 dark:border-white/10 p-5 flex-1 overflow-y-auto">
            <h3 className="font-semibold text-gray-950 dark:text-white mb-4 text-sm">Customer Segments</h3>
            <div className="space-y-2">
              {[
                { label: 'Open tickets', value: customerSummary.openTickets, time: `${customerSummary.openTickets}`, user: 'open', action: () => setOpenTicketsFilter('open') },
                { label: 'Risk flags', value: customerSummary.atRisk, time: `${customerSummary.atRisk}`, user: 'at risk', action: () => setRiskFilter('risk') },
                { label: 'AI resolved', value: customerSummary.resolved, time: `${customerSummary.resolved}`, user: 'resolved', action: () => setAiHandledFilter('handled') },
              ].map((activity, i) => (
                <button key={i} onClick={activity.action} className="w-full rounded-2xl border border-black/5 bg-black/[0.02] px-3 py-3 text-left transition-colors hover:bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{activity.label}</span>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{activity.time} • {activity.user}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Shared card style matching Settings/Upgrade components exactly
  const cardCls = 'bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden';
  const cardHeaderCls = 'px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between';
  const cardTitleCls = 'text-sm font-semibold text-gray-900 dark:text-white';

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

    const churn = selectedCustomer?.risk || 'Healthy';
    const fraud = (selectedCustomer as any)?.fraudRisk || 'low';
    const churnHigh = churn === 'Churn Risk';
    const fraudHigh = fraud === 'high' || fraud === 'critical';
    const recon = selectedCustomer.reconciliation;
    const hasConflict = recon && (recon.status === 'Conflict' || recon.status === 'Warning' || recon.status === 'Blocked');

    return (
      <div className="flex-1 flex flex-col min-w-0 bg-[#fbfbfa] dark:bg-[#121212] overflow-y-auto custom-scrollbar">
        {/* ── Header ───────────────────────────────────────────────── */}
        <header className="sticky top-0 z-10 flex-shrink-0 px-7 py-5 border-b border-black/5 dark:border-white/10 bg-white dark:bg-[#171717] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedCustomerId(null)}
              className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Customers
            </button>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <div className="flex items-center gap-3">
              <img
                alt={selectedCustomer.name}
                className="w-8 h-8 rounded-full object-cover border border-black/5 dark:border-white/10"
                src={selectedCustomer.avatar}
                referrerPolicy="no-referrer"
              />
              <span className="text-[15px] font-semibold text-gray-950 dark:text-white">{selectedCustomer.name}</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                selectedCustomer.segment === 'VIP Enterprise'
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                  : 'bg-black/5 text-gray-600 dark:bg-white/10 dark:text-gray-300'
              }`}>
                {selectedCustomer.segment}
              </span>
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setCustomerActionsOpen((v) => !v)}
              className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">more_horiz</span>
              More
            </button>
            <button
              onClick={() => openCustomerCase('inbox')}
              className="rounded-full px-5 py-2 text-sm font-semibold bg-black text-white dark:bg-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 transition-opacity flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              Open in Inbox
            </button>
            {customerActionsOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-[16px] border border-black/5 dark:border-white/10 bg-white dark:bg-[#1b1b1b] shadow-2xl z-20 p-1.5">
                {[
                  { icon: 'timeline', label: 'View analysis', action: () => openCustomerCase('case_graph') },
                  { icon: 'assignment_turned_in', label: 'Create approval', action: handleCreateApproval },
                  { icon: 'currency_exchange', label: 'Start refund', action: handleStartRefund },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => { item.action(); setCustomerActionsOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px] text-gray-400">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {actionMessage && (
          <div className="px-6 pt-4">
            <div className="rounded-[16px] border border-blue-100 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-950/20 px-4 py-3 text-sm text-blue-800 dark:text-blue-200 flex items-start gap-3">
              <span className="material-symbols-outlined text-lg mt-0.5">info</span>
              <div>
                <div className="font-semibold text-[13px]">Action status</div>
                <div className="text-xs opacity-80 mt-0.5">{actionMessage}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── KPI Strip ─────────────────────────────────────────────
             Layout mirrors the two-column body below it:
             · 3 left KPIs  → flex-1  (matches left content column)
             · Risk Level   → w-[340px] flex-shrink-0 (matches sidebar)
        ──────────────────────────────────────────────────────── */}
        {(() => {
          const kpiCard = (kpi: { label: string; value: string; sub: string; accent: boolean; accentColor?: string }) => (
            <section
              key={kpi.label}
              className={`rounded-2xl border shadow-card overflow-hidden h-full ${
                kpi.accent && kpi.accentColor === 'red'
                  ? 'border-red-200 dark:border-red-800/40 bg-white dark:bg-card-dark'
                  : kpi.accent && kpi.accentColor === 'amber'
                  ? 'border-amber-200 dark:border-amber-800/40 bg-white dark:bg-card-dark'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-card-dark'
              }`}
            >
              <div className="px-5 pt-4 pb-3">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">{kpi.label}</p>
                <p className={`text-[17px] font-bold tracking-tight leading-snug ${
                  kpi.accent && kpi.accentColor === 'red' ? 'text-red-600 dark:text-red-400'
                  : kpi.accent && kpi.accentColor === 'amber' ? 'text-amber-600 dark:text-amber-400'
                  : 'text-gray-900 dark:text-white'
                }`}>{kpi.value}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{kpi.sub}</p>
              </div>
            </section>
          );
          return (
            <div className="px-6 pt-5 pb-1 flex gap-4">
              {/* Left group — flex-1, matches left column */}
              <div className="flex-1 grid grid-cols-3 gap-4">
                {kpiCard({ label: 'Lifetime Value', value: selectedCustomer.ltv, sub: selectedCustomer.plan, accent: false })}
                {kpiCard({ label: 'Open Cases', value: String(selectedCustomer.openTickets), sub: selectedCustomer.openTickets === 1 ? '1 active ticket' : `${selectedCustomer.openTickets} active tickets`, accent: selectedCustomer.openTickets > 0, accentColor: 'amber' })}
                {kpiCard({ label: 'Next Renewal', value: selectedCustomer.nextRenewal, sub: selectedCustomer.plan, accent: false })}
              </div>
              {/* Right — w-[340px], matches sidebar */}
              <div className="w-[340px] flex-shrink-0">
                {kpiCard({ label: 'Risk Level', value: churnHigh ? 'Churn Risk' : churn === 'Watchlist' ? 'Watchlist' : 'Healthy', sub: `Fraud risk: ${fraudHigh ? 'High' : fraud === 'medium' ? 'Medium' : 'Low'}`, accent: churnHigh || fraudHigh, accentColor: 'red' })}
              </div>
            </div>
          );
        })()}

        {/* ── Main Area (two columns) ───────────────────────────────── */}
        <div className="flex gap-4 px-6 pt-4 pb-6 items-start">

          {/* ── Left: AI Summary + Activity Feed ─────────────────── */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">

            {/* AI Executive Summary */}
            <section className={cardCls}>
              <div className={cardHeaderCls}>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-900/20">
                    <span className="material-symbols-outlined text-[17px] text-indigo-600 dark:text-indigo-400">auto_awesome</span>
                  </div>
                  <div>
                    <h3 className={cardTitleCls}>AI Executive Summary</h3>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">From canonical state</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800/30">Live</span>
              </div>
              <div className="p-5">
                {(selectedCustomer as any).aiExecutiveSummary ? (
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{(selectedCustomer as any).aiExecutiveSummary}</p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">No AI summary available for this customer yet.</p>
                )}
                {((selectedCustomer as any).aiRecommendations?.length > 0) && (
                  <div className="mt-4 space-y-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Recommended Actions</p>
                    {(selectedCustomer as any).aiRecommendations.map((rec: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                          rec.priority === 'high' ? 'bg-red-500' : rec.priority === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                        }`} />
                        <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug"><span className="font-semibold">{rec.action}</span> — {rec.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Activity / Tabs */}
            <section className={`flex flex-col ${cardCls}`}>
              <div className="px-5 pt-4 border-b border-gray-100 dark:border-gray-800 flex items-end gap-0 overflow-x-auto no-scrollbar">
                {(['all_activity', 'conversations', 'orders', 'system_logs'] as CustomerTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveProfileTab(tab)}
                    className={`pb-3.5 mr-7 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${
                      activeProfileTab === tab
                        ? 'text-gray-900 dark:text-white border-gray-900 dark:border-white'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-transparent'
                    }`}
                  >
                    {tab.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                  </button>
                ))}
              </div>
              <div className="p-5">
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
                    <div className="relative border-l border-black/10 dark:border-white/10 ml-3 space-y-5 pb-4">
                      {events.map((event: any) => (
                        <div key={event.id} className="relative pl-6">
                          <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full ${dotColor(event.type, event.level)} bg-opacity-20 border-2 border-white dark:border-[#171717] flex items-center justify-center`}>
                            <div className={`w-2 h-2 rounded-full ${dotColor(event.type, event.level)}`}></div>
                          </div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">
                              {new Date(event.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <span className="text-[10px] font-medium text-gray-400 bg-black/[0.03] dark:bg-white/[0.05] px-1.5 py-0.5 rounded-full">{event.source || event.system || ''}</span>
                          </div>
                          <div className="rounded-[16px] border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-3.5">
                            <p className="text-[13px] font-semibold text-gray-950 dark:text-white mb-1">{event.title}</p>
                            <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">{event.content}</p>
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
                        <div key={c.id} className="rounded-[18px] border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors group cursor-pointer p-4" onClick={() => onNavigate?.('inbox', c.id)}>
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400">{c.caseNumber || c.case_number || c.id}</span>
                                <h4 className="text-[13px] font-semibold text-gray-950 dark:text-white">{c.type || 'Case'}</h4>
                              </div>
                            </div>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              c.status === 'open' || c.status === 'escalated'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            }`}>{c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : 'Open'}</span>
                          </div>
                          <div className="flex gap-1.5 items-center mt-1">
                            <span className="material-symbols-outlined text-violet-400 text-[14px]">open_in_new</span>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">Open in Inbox</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {activeProfileTab === 'orders' && (
                  <div className="overflow-hidden rounded-[18px] border border-black/5 dark:border-white/10">
                    <table className="min-w-full divide-y divide-black/5 dark:divide-white/10 text-left text-sm">
                      <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
                        <tr>
                          <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide" scope="col">Order</th>
                          <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide" scope="col">Date</th>
                          <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide" scope="col">Total</th>
                          <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide" scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5 dark:divide-white/10">
                        {selectedCustomer.orders.map(order => (
                          <tr key={order.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3.5 font-semibold text-[13px] text-gray-950 dark:text-white flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[15px] text-gray-300 dark:text-gray-600">receipt</span>
                              {order.id}
                            </td>
                            <td className="px-4 py-3.5 text-[12px] text-gray-500 dark:text-gray-400">{order.date}</td>
                            <td className="px-4 py-3.5 text-[13px] font-semibold text-gray-950 dark:text-white">{order.total}</td>
                            <td className="px-4 py-3.5">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                order.status === 'Processing'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
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
            </section>
          </div>

          {/* ── Right: Identity + Health + Actions ─────────────────── */}
          <div className="w-[340px] flex-shrink-0 flex flex-col gap-3">

            {/* Identity card */}
            <section className={cardCls}>
              <div className={cardHeaderCls}>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                    <span className="material-symbols-outlined text-[15px] text-gray-500 dark:text-gray-400">person</span>
                  </div>
                  <h3 className={cardTitleCls}>Identity</h3>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <img
                    alt={selectedCustomer.name}
                    className="w-11 h-11 rounded-full object-cover border border-gray-200 dark:border-gray-700 shadow-card flex-shrink-0"
                    src={selectedCustomer.avatar}
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{selectedCustomer.name}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{selectedCustomer.email}</p>
                  </div>
                </div>
                <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                  {[
                    { icon: 'work', label: selectedCustomer.role + ' · ' + selectedCustomer.company },
                    { icon: 'location_on', label: selectedCustomer.location + ' · ' + selectedCustomer.timezone },
                    { icon: 'calendar_today', label: 'Customer since ' + selectedCustomer.since },
                  ].map((row) => (
                    <div key={row.icon} className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[14px] text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0">{row.icon}</span>
                      <span className="text-[12px] text-gray-600 dark:text-gray-300 leading-snug">{row.label}</span>
                    </div>
                  ))}
                </div>
                {selectedCustomer.sources.length > 0 && (
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Linked Profiles</span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">98% match</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCustomer.sources.map((source, i) => (
                        <div
                          key={i}
                          title={source.name}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                        >
                          <img alt={source.name} className="w-3.5 h-3.5 object-contain" src={source.icon} referrerPolicy="no-referrer" />
                          <span className="text-[11px] text-gray-600 dark:text-gray-300 font-medium">{source.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Health & Risk card */}
            <section className={cardCls}>
              <div className={cardHeaderCls}>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                    <span className="material-symbols-outlined text-[15px] text-gray-500 dark:text-gray-400">shield</span>
                  </div>
                  <h3 className={cardTitleCls}>Health & Risk</h3>
                </div>
              </div>
              <div className="p-5 space-y-2">
                {[
                  {
                    label: 'Churn Risk',
                    value: churnHigh ? 'High' : churn === 'Watchlist' ? 'Medium' : 'Low',
                    alert: churnHigh,
                    medium: churn === 'Watchlist',
                  },
                  {
                    label: 'Fraud Risk',
                    value: fraudHigh ? 'High' : fraud === 'medium' ? 'Medium' : 'Low',
                    alert: fraudHigh,
                    medium: fraud === 'medium',
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
                      row.alert
                        ? 'bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30'
                        : row.medium
                        ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30'
                        : 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30'
                    }`}
                  >
                    <span className={`text-[12px] font-medium flex items-center gap-2 ${
                      row.alert ? 'text-red-800 dark:text-red-300' : row.medium ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-800 dark:text-emerald-300'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        row.alert ? 'bg-red-500' : row.medium ? 'bg-amber-500' : 'bg-emerald-500'
                      }`} />
                      {row.label}
                    </span>
                    <span className={`text-[11px] font-bold ${
                      row.alert ? 'text-red-700 dark:text-red-400' : row.medium ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
                    }`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Reconciliation — only if not healthy */}
            {hasConflict && recon && (
              <section className={cardCls}>
                <div className={cardHeaderCls}>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                      <span className="material-symbols-outlined text-[15px] text-gray-500 dark:text-gray-400">sync_alt</span>
                    </div>
                    <h3 className={cardTitleCls}>Reconciliation</h3>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    recon.status === 'Conflict' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    recon.status === 'Warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  }`}>{recon.status}</span>
                </div>
                <div className="p-5">
                  <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-3">
                    {recon.mismatches} mismatch{recon.mismatches !== 1 ? 'es' : ''} · Last run {recon.lastChecked}
                  </p>
                  <div className="space-y-2">
                    {recon.domains.slice(0, 3).map((domain, idx) => (
                      <div key={idx} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[12px] font-semibold text-gray-900 dark:text-white truncate">{domain.domain}</p>
                          {domain.severity && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              domain.severity === 'High' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                              domain.severity === 'Medium' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                              'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                            }`}>{domain.severity}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{domain.context}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Quick Actions */}
            <section className={cardCls}>
              <div className={cardHeaderCls}>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
                    <span className="material-symbols-outlined text-[15px] text-gray-500 dark:text-gray-400">bolt</span>
                  </div>
                  <h3 className={cardTitleCls}>Quick Actions</h3>
                </div>
              </div>
              <div className="p-4 space-y-1.5">
                {[
                  { icon: 'timeline', label: 'View Analysis', action: () => openCustomerCase('case_graph') },
                  { icon: 'assignment_turned_in', label: 'Create Approval', action: handleCreateApproval },
                  { icon: 'currency_exchange', label: 'Start Refund', action: handleStartRefund },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    onClick={btn.action}
                    className="w-full flex items-center gap-2.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/30 hover:bg-gray-50 dark:hover:bg-gray-700/50 px-3 py-2.5 text-[12px] font-semibold text-gray-700 dark:text-gray-200 transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px] text-gray-400 dark:text-gray-500">{btn.icon}</span>
                    {btn.label}
                    <span className="material-symbols-outlined text-[14px] text-gray-300 dark:text-gray-600 ml-auto">chevron_right</span>
                  </button>
                ))}
              </div>
            </section>

          </div>{/* end right sidebar */}
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
    <div className="customers-category flex-1 flex flex-col h-full min-w-0 bg-[#fbfbfa] dark:bg-[#121212] p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-[#171717] overflow-hidden rounded-[28px] border border-black/5 dark:border-white/10 shadow-none">
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
