import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { customersApi, paymentsApi, policyApi } from '../api/client';
import { useApi } from '../api/hooks';
import LoadingState from './LoadingState';
import { MinimalButton, MinimalCard, MinimalPill } from './MinimalCategoryShell';
import type { NavigateFn, Page } from '../types';

type CustomerTab = 'overview' | 'all_activity' | 'conversations' | 'orders' | 'system_logs' | 'reconciliation';

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
  const [activeProfileTab, setActiveProfileTab] = useState<CustomerTab>('overview');
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

    const recommendations = (selectedCustomer as any).aiRecommendations || [];
    const churnLevel =
      selectedCustomer.risk === 'Churn Risk'
        ? 'High'
        : selectedCustomer.risk === 'Watchlist'
          ? 'Medium'
          : 'Low';
    const fraudLevel =
      (selectedCustomer as any).fraudRisk === 'high' || (selectedCustomer as any).fraudRisk === 'critical'
        ? 'High'
        : (selectedCustomer as any).fraudRisk === 'medium'
          ? 'Medium'
          : 'Low';
    const activityEvents = Array.isArray(apiActivity) ? apiActivity.filter((event: any) => event.type !== 'system_log') : [];
    const systemLogs = Array.isArray(apiActivity) ? apiActivity.filter((event: any) => event.type === 'system_log') : [];
    const profileTabs: Array<{ id: CustomerTab; label: string }> = [
      { id: 'overview', label: 'Overview' },
      { id: 'all_activity', label: 'All Activity' },
      { id: 'conversations', label: 'Conversations' },
      { id: 'orders', label: 'Orders' },
      { id: 'reconciliation', label: 'Reconciliation' },
      { id: 'system_logs', label: 'System Logs' },
    ];
    const handleReconciliationAction = (actionType: string) => {
      if (actionType === 'approval') {
        handleCreateApproval();
        return;
      }
      if (actionType === 'workflow') {
        openCustomerCase('case_graph');
        return;
      }
      if (actionType === 'log') {
        setActiveProfileTab('system_logs');
        return;
      }
      setActionMessage('Reconciliation action prepared. Review the linked systems and continue from the relevant operational screen.');
    };
    const dotColor = (type: string, level: string) => {
      if (level === 'error') return 'bg-red-500';
      if (level === 'warning') return 'bg-amber-500';
      if (type === 'ai_summary') return 'bg-violet-500';
      if (type === 'agent_note') return 'bg-slate-500';
      if (type === 'payment') return 'bg-emerald-500';
      return 'bg-sky-500';
    };

    return (
      <div className="flex-1 flex flex-col h-full min-w-0 bg-[#fbfbfa] dark:bg-background-dark overflow-hidden">
        <header className="flex-shrink-0 border-b border-black/5 bg-white px-8 py-6 dark:border-white/10 dark:bg-[#171717]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                <button onClick={() => setSelectedCustomerId(null)} className="transition-colors hover:text-gray-950 dark:hover:text-white">Customers</button>
                <span className="material-symbols-outlined text-sm">chevron_right</span>
                <span className="truncate text-gray-900 dark:text-white">{selectedCustomer.name}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <h1 className="text-[30px] font-semibold tracking-tight text-gray-950 dark:text-white">{selectedCustomer.name}</h1>
                <MinimalPill tone="active">{selectedCustomer.segment}</MinimalPill>
                <MinimalPill>{selectedCustomer.company}</MinimalPill>
              </div>
              <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
                Unified customer workspace with lifecycle, conversations, revenue exposure, linked identities and reconciliation status.
              </p>
            </div>

            <div className="relative flex items-center gap-2">
              <MinimalButton onClick={() => setCustomerActionsOpen((value) => !value)} variant="outline">
                <span className="material-symbols-outlined mr-1 text-[18px]">more_horiz</span>
                More
              </MinimalButton>
              <MinimalButton onClick={() => openCustomerCase('inbox')}>
                <span className="material-symbols-outlined mr-1 text-[18px]">open_in_new</span>
                Open in Inbox
              </MinimalButton>
              {customerActionsOpen ? (
                <div className="absolute right-0 top-full z-20 mt-2 w-60 rounded-[20px] border border-black/5 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#171717]">
                  <button
                    onClick={() => openCustomerCase('case_graph')}
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-black/[0.04] hover:text-gray-950 dark:text-gray-200 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  >
                    <span className="material-symbols-outlined text-[18px]">timeline</span>
                    View analysis
                  </button>
                  <button
                    onClick={handleCreateApproval}
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-black/[0.04] hover:text-gray-950 dark:text-gray-200 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  >
                    <span className="material-symbols-outlined text-[18px]">assignment_turned_in</span>
                    Create approval
                  </button>
                  <button
                    onClick={handleStartRefund}
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-black/[0.04] hover:text-gray-950 dark:text-gray-200 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  >
                    <span className="material-symbols-outlined text-[18px]">currency_exchange</span>
                    Start refund
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {actionMessage ? (
          <div className="px-6 pt-5">
            <div className="rounded-[22px] border border-violet-200/70 bg-violet-50/80 px-5 py-4 text-sm text-violet-900 dark:border-violet-800/30 dark:bg-violet-950/20 dark:text-violet-100">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined mt-0.5 text-[18px]">info</span>
                <div>
                  <div className="font-semibold">Customer action status</div>
                  <div className="mt-1 text-xs text-violet-700/90 dark:text-violet-200/90">{actionMessage}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 pt-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_360px]">
            <div className="space-y-4">
              <MinimalCard
                title="Customer overview"
                subtitle="Identity, lifecycle, support load and revenue context in one place."
                icon="person"
                action={<MinimalPill tone="active">{selectedCustomer.role}</MinimalPill>}
              >
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                  <div className="flex items-start gap-4">
                    <img
                      alt={selectedCustomer.name}
                      className="h-16 w-16 rounded-full border border-black/5 object-cover dark:border-white/10"
                      src={selectedCustomer.avatar}
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-gray-950 dark:text-white">{selectedCustomer.name}</h2>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedCustomer.email}</p>
                      <div className="mt-3 grid gap-2 text-sm text-gray-700 dark:text-gray-300 sm:grid-cols-2">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Company</div>
                          <div className="mt-1 font-medium text-gray-950 dark:text-white">{selectedCustomer.company}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Timezone</div>
                          <div className="mt-1 font-medium text-gray-950 dark:text-white">{selectedCustomer.timezone}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Location</div>
                          <div className="mt-1 font-medium text-gray-950 dark:text-white">{selectedCustomer.location}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Customer since</div>
                          <div className="mt-1 font-medium text-gray-950 dark:text-white">{selectedCustomer.since}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { label: 'Open conversations', value: `${selectedCustomer.openTickets}`, meta: 'Active support threads' },
                      { label: 'Revenue at stake', value: selectedCustomer.ltv, meta: `${selectedCustomer.plan} plan` },
                      { label: 'Orders tracked', value: `${selectedCustomer.orders.length}`, meta: 'Across linked systems' },
                      { label: 'Next renewal', value: selectedCustomer.nextRenewal, meta: 'Commercial lifecycle' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-[20px] border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{item.label}</div>
                        <div className="mt-3 text-lg font-semibold text-gray-950 dark:text-white">{item.value}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.meta}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </MinimalCard>

              <MinimalCard title="AI executive summary" subtitle="Canonical summary and recommended next moves." icon="auto_awesome">
                <div className="rounded-[22px] border border-violet-200/70 bg-violet-50/70 p-5 dark:border-violet-800/30 dark:bg-violet-950/20">
                  <p className="text-sm leading-7 text-gray-700 dark:text-gray-300">
                    {(selectedCustomer as any).aiExecutiveSummary || 'No AI summary available for this customer yet.'}
                  </p>
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {(recommendations.length > 0 ? recommendations : [{ action: 'No recommendations yet', priority: 'low', reason: 'The agent has not produced operational guidance for this customer yet.' }]).map((rec: any, index: number) => (
                      <div key={`${rec.action}-${index}`} className="rounded-[18px] border border-black/5 bg-white/80 p-4 dark:border-white/10 dark:bg-black/20">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-gray-950 dark:text-white">{rec.action}</div>
                          <MinimalPill tone={rec.priority === 'high' ? 'active' : 'neutral'}>{rec.priority || 'info'}</MinimalPill>
                        </div>
                        <p className="mt-2 text-xs leading-6 text-gray-600 dark:text-gray-400">{rec.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </MinimalCard>

              <MinimalCard
                title="Customer workspace"
                subtitle="Dive into activity, linked cases, orders and reconciliation from one shared workspace."
                icon="dashboard"
                action={
                  <div className="flex flex-wrap gap-2">
                    {profileTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveProfileTab(tab.id)}
                        className={[
                          'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                          activeProfileTab === tab.id
                            ? 'bg-black text-white dark:bg-white dark:text-black'
                            : 'text-gray-600 hover:bg-black/[0.05] hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white',
                        ].join(' ')}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                }
              >
                {activeProfileTab === 'overview' ? (
                  <div className="space-y-5">
                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="rounded-[22px] border border-black/5 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-950 dark:text-white">Identity graph</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Linked customer footprints and confidence.</div>
                          </div>
                          <MinimalPill>98% confidence</MinimalPill>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {selectedCustomer.sources.map((source, index) => (
                            <div key={`${source.name}-${index}`} className="flex items-center gap-3 rounded-[18px] border border-black/5 bg-white p-3 dark:border-white/10 dark:bg-[#171717]">
                              <img alt={source.name} className="h-9 w-9 rounded-full border border-black/5 object-contain p-2 dark:border-white/10" src={source.icon} referrerPolicy="no-referrer" />
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-950 dark:text-white">{source.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Linked identity available</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-black/5 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="text-sm font-semibold text-gray-950 dark:text-white">Operational signals</div>
                        <div className="mt-4 space-y-3">
                          {[
                            { label: 'Primary issue', value: selectedCustomer.topIssue, meta: 'Most recent canonical conflict' },
                            { label: 'AI resolved', value: `${selectedCustomer.aiImpact.resolved}`, meta: 'Customer-facing cases resolved automatically' },
                            { label: 'Escalations', value: `${selectedCustomer.aiImpact.escalated || 0}`, meta: 'Cases requiring deeper review' },
                            { label: 'Approvals', value: `${selectedCustomer.aiImpact.approvals || 0}`, meta: 'Human approval interventions' },
                          ].map((item) => (
                            <div key={item.label} className="flex items-start justify-between gap-4 rounded-[18px] border border-black/5 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#171717]">
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{item.label}</div>
                                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{item.meta}</div>
                              </div>
                              <div className="text-right text-sm font-semibold text-gray-950 dark:text-white">{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <div className="rounded-[22px] border border-black/5 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-950 dark:text-white">Latest conversations</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Recent customer-facing threads linked to this profile.</div>
                          </div>
                          <MinimalButton onClick={() => setActiveProfileTab('conversations')} variant="ghost">Open tab</MinimalButton>
                        </div>
                        <div className="mt-4 space-y-3">
                          {(selectedCustomer.recentCases || []).slice(0, 3).map((customerCase) => (
                            <button
                              key={customerCase.id}
                              type="button"
                              onClick={() => onNavigate?.('inbox', customerCase.id)}
                              className="w-full rounded-[18px] border border-black/5 bg-white px-4 py-3 text-left transition-colors hover:bg-black/[0.02] dark:border-white/10 dark:bg-[#171717] dark:hover:bg-white/[0.04]"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-gray-950 dark:text-white">{customerCase.type || 'Case'}</div>
                                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{customerCase.caseNumber || customerCase.case_number || customerCase.id}</div>
                                </div>
                                <MinimalPill>{customerCase.status || 'open'}</MinimalPill>
                              </div>
                            </button>
                          ))}
                          {(selectedCustomer.recentCases || []).length === 0 ? (
                            <div className="rounded-[18px] border border-dashed border-black/10 px-4 py-6 text-center text-sm text-gray-400 dark:border-white/10 dark:text-gray-500">
                              No linked conversations yet.
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-black/5 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-950 dark:text-white">Commercial footprint</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Orders, plan exposure and renewal timing.</div>
                          </div>
                          <MinimalButton onClick={() => setActiveProfileTab('orders')} variant="ghost">Open tab</MinimalButton>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-[18px] border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#171717]">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Plan</div>
                            <div className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{selectedCustomer.plan}</div>
                          </div>
                          <div className="rounded-[18px] border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#171717]">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Lifetime value</div>
                            <div className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{selectedCustomer.ltv}</div>
                          </div>
                          <div className="rounded-[18px] border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#171717]">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Renewal</div>
                            <div className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{selectedCustomer.nextRenewal}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeProfileTab === 'all_activity' ? (
                  activityEvents.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No activity recorded yet.</p>
                  ) : (
                    <div className="relative ml-3 space-y-6 border-l border-black/10 pb-4 dark:border-white/10">
                      {activityEvents.map((event: any) => (
                        <div key={event.id} className="relative pl-6">
                          <div className={`absolute -left-[7px] top-2 h-3 w-3 rounded-full ${dotColor(event.type, event.level)}`} />
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(event.occurred_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <MinimalPill>{event.source || event.system || 'canonical'}</MinimalPill>
                          </div>
                          <div className="rounded-[20px] border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                            <p className="text-sm font-semibold text-gray-950 dark:text-white">{event.title}</p>
                            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{event.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : null}

                {activeProfileTab === 'conversations' ? (
                  (selectedCustomer.recentCases || []).length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No linked conversations found.</p>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {(selectedCustomer.recentCases || []).map((customerCase) => (
                        <button
                          key={customerCase.id}
                          type="button"
                          onClick={() => onNavigate?.('inbox', customerCase.id)}
                          className="rounded-[22px] border border-black/5 bg-black/[0.02] p-5 text-left transition-colors hover:bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                {customerCase.caseNumber || customerCase.case_number || customerCase.id}
                              </div>
                              <div className="mt-2 text-base font-semibold text-gray-950 dark:text-white">{customerCase.type || 'Case'}</div>
                            </div>
                            <MinimalPill tone="active">{customerCase.status || 'open'}</MinimalPill>
                          </div>
                          <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                            Open in Inbox with full thread and actions
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                ) : null}

                {activeProfileTab === 'orders' ? (
                  selectedCustomer.orders.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No orders linked to this customer yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedCustomer.orders.map((order) => (
                        <button
                          key={order.id}
                          type="button"
                          onClick={() => onNavigate?.('orders', order.id)}
                          className="w-full rounded-[22px] border border-black/5 bg-black/[0.02] px-5 py-4 text-left transition-colors hover:bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <div className="text-sm font-semibold text-gray-950 dark:text-white">{order.id}</div>
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{order.date} • {order.total}</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <MinimalPill>{order.status}</MinimalPill>
                              <MinimalPill tone="subtle">{selectedCustomer.topIssue}</MinimalPill>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                ) : null}

                {activeProfileTab === 'reconciliation' ? (
                  selectedCustomer.reconciliation ? (
                    <div className="space-y-4">
                      <div className="rounded-[22px] border border-black/5 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-950 dark:text-white">Canonical reconciliation status</div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              Last checked {selectedCustomer.reconciliation.lastChecked}. {selectedCustomer.reconciliation.mismatches} mismatches remain open.
                            </div>
                          </div>
                          <MinimalPill tone="active">{selectedCustomer.reconciliation.status}</MinimalPill>
                        </div>
                      </div>

                      {selectedCustomer.reconciliation.domains.map((domain, index) => (
                        <div key={`${domain.domain}-${index}`} className="rounded-[22px] border border-black/5 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.03]">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-950 dark:text-white">{domain.domain}</div>
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{domain.context}</div>
                            </div>
                            {domain.severity ? <MinimalPill tone="active">{domain.severity}</MinimalPill> : null}
                          </div>
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div className="rounded-[18px] border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#171717]">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">System states</div>
                              <div className="mt-3 space-y-2">
                                {domain.systems.map((system, systemIndex) => (
                                  <div key={`${system.name}-${systemIndex}`} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-gray-500 dark:text-gray-400">{system.name}</span>
                                    <span className="font-medium text-gray-950 dark:text-white">{system.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="rounded-[18px] border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#171717]">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Governance</div>
                              <div className="mt-3 space-y-2 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-gray-500 dark:text-gray-400">Source of truth</span>
                                  <span className="font-medium text-gray-950 dark:text-white">{domain.sourceOfTruth}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-gray-500 dark:text-gray-400">Writeback</span>
                                  <span className="font-medium text-gray-950 dark:text-white">{domain.writebackStatus}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-gray-500 dark:text-gray-400">Open for</span>
                                  <span className="font-medium text-gray-950 dark:text-white">{domain.age}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-4">
                            <MinimalButton onClick={() => handleReconciliationAction(domain.actionType)} variant="outline">
                              {domain.action}
                            </MinimalButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No reconciliation data is available for this customer.</p>
                  )
                ) : null}

                {activeProfileTab === 'system_logs' ? (
                  systemLogs.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No system logs recorded yet.</p>
                  ) : (
                    <div className="space-y-2 font-mono text-[11px]">
                      {systemLogs.map((log: any) => (
                        <div key={log.id} className="grid gap-3 rounded-[18px] border border-black/5 bg-black/[0.02] p-4 md:grid-cols-[120px_90px_120px_minmax(0,1fr)] dark:border-white/10 dark:bg-white/[0.03]">
                          <div className="text-gray-400 dark:text-gray-500">
                            {new Date(log.occurred_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </div>
                          <div className="font-semibold text-gray-700 dark:text-gray-300">{(log.level || 'info').toUpperCase()}</div>
                          <div className="text-gray-500 dark:text-gray-400">{log.system || log.source || 'system'}</div>
                          <div className="break-all text-gray-800 dark:text-gray-300">{log.content}</div>
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
              </MinimalCard>
            </div>

            <div className="space-y-4">
              <MinimalCard title="Risk profile" subtitle="Churn, fraud and operational attention levels." icon="health_and_safety">
                <div className="space-y-3">
                  {[
                    { label: 'Churn risk', value: churnLevel, high: churnLevel === 'High' },
                    { label: 'Fraud risk', value: fraudLevel, high: fraudLevel === 'High' },
                  ].map((riskItem) => (
                    <div key={riskItem.label} className="flex items-center justify-between rounded-[18px] border border-black/5 bg-black/[0.02] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                        <span className={`h-2 w-2 rounded-full ${riskItem.high ? 'bg-red-500' : 'bg-emerald-500'}`} />
                        {riskItem.label}
                      </div>
                      <div className="text-sm font-semibold text-gray-950 dark:text-white">{riskItem.value}</div>
                    </div>
                  ))}
                </div>
              </MinimalCard>

              <MinimalCard title="Next actions" subtitle="Operational entry points for the customer owner." icon="bolt">
                <div className="space-y-3">
                  <MinimalButton onClick={handleCreateApproval} variant="outline">Create approval</MinimalButton>
                  <MinimalButton onClick={handleStartRefund} variant="outline">Start refund</MinimalButton>
                  <MinimalButton onClick={() => openCustomerCase('case_graph')} variant="ghost">Open case analysis</MinimalButton>
                  <MinimalButton onClick={() => setActiveProfileTab('reconciliation')} variant="ghost">Review reconciliation</MinimalButton>
                </div>
              </MinimalCard>

              <MinimalCard title="Linked identities" subtitle="Connected customer records and source systems." icon="hub">
                <div className="space-y-3">
                  {selectedCustomer.sources.map((source, index) => (
                    <div key={`${source.name}-${index}`} className="flex items-center gap-3 rounded-[18px] border border-black/5 bg-black/[0.02] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                      <img alt={source.name} className="h-10 w-10 rounded-full border border-black/5 object-contain p-2 dark:border-white/10" src={source.icon} referrerPolicy="no-referrer" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-950 dark:text-white">{source.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Canonical profile mapped to this source.</div>
                      </div>
                    </div>
                  ))}
                </div>
              </MinimalCard>

              <MinimalCard title="Revenue and plan" subtitle="Commercial context used by support and AI operations." icon="workspace_premium">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Current plan</div>
                    <div className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{selectedCustomer.plan}</div>
                  </div>
                  <div className="rounded-[18px] border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Lifetime value</div>
                    <div className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{selectedCustomer.ltv}</div>
                  </div>
                  <div className="rounded-[18px] border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03] sm:col-span-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Next renewal</div>
                    <div className="mt-2 text-sm font-semibold text-gray-950 dark:text-white">{selectedCustomer.nextRenewal}</div>
                  </div>
                </div>
              </MinimalCard>

              {selectedCustomer.reconciliation ? (
                <MinimalCard title="Reconciliation snapshot" subtitle="Fast view of the cross-system consistency state." icon="sync_alt">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-[18px] border border-black/5 bg-black/[0.02] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                      <div>
                        <div className="text-sm font-medium text-gray-950 dark:text-white">{selectedCustomer.reconciliation.status}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{selectedCustomer.reconciliation.mismatches} mismatches across connected domains</div>
                      </div>
                      <MinimalButton onClick={() => setActiveProfileTab('reconciliation')} variant="ghost">Details</MinimalButton>
                    </div>
                    {selectedCustomer.reconciliation.domains.slice(0, 2).map((domain, index) => (
                      <div key={`${domain.domain}-snapshot-${index}`} className="rounded-[18px] border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-gray-950 dark:text-white">{domain.domain}</div>
                          {domain.severity ? <MinimalPill>{domain.severity}</MinimalPill> : null}
                        </div>
                        <div className="mt-2 text-xs leading-6 text-gray-500 dark:text-gray-400">{domain.context}</div>
                      </div>
                    ))}
                  </div>
                </MinimalCard>
              ) : null}
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
    <div className="customers-category flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
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
