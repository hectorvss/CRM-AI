// CustomersV2 — migrado por agent-customers-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Sidebar Contactos con secciones Personas / Empresas / Conversaciones
//   • Lista de clientes real → customersApi.list()
//   • Filtros: search, segment, source, open tickets, risk, AI handled
//   • Panel detalle completo → customersApi.state(id) + customersApi.activity(id)
//   • Tabs en perfil: All Activity, Conversations, Orders, System Logs
//   • KPI cards: LTV, Open Cases, Next Renewal, Risk Level
//   • AI Executive Summary + Recommended Actions del backend
//   • Acciones: Create Customer → customersApi.create()
//   • Acciones: Update Customer → customersApi.update()
//   • Acciones: Start Refund → paymentsApi.list() + paymentsApi.refund()
//   • Acciones: Create Approval → policyApi.evaluateAndRoute()
// Pending for later iterations (still in src/components/Customers.tsx until migrated):
//   • Merge duplicate modal → casesApi.merge (requiere confirmar ID de destino)
//   • Animaciones motion/react
//   • onNavigate prop (cross-page navigation to inbox/case_graph) — no disponible en v2 routing aún
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useCallback } from 'react';
import type { FormEvent } from 'react';
import { customersApi, paymentsApi, policyApi } from '../../api/client';
import { useApi } from '../../api/hooks';

// ── Local types ───────────────────────────────────────────────────────────────
type CustomerTab = 'all_activity' | 'conversations' | 'orders' | 'system_logs';

interface CustomerOrder {
  id: string;
  date: string;
  total: string;
  status: 'Processing' | 'Fulfilled' | 'Delivered';
  items: { name: string; sku: string; price: string }[];
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
  ltv: string;
  openTickets: number;
  problemsResolved: number;
  problemsUnresolved: number;
  aiImpact: { resolved: number; approvals?: number; escalated?: number };
  topIssue: string;
  risk?: 'Churn Risk' | 'Healthy' | 'Watchlist' | 'Refund Abuse';
  fraudRisk?: string;
  sources: { name: string; icon: string }[];
  plan: string;
  nextRenewal: string;
  orders: CustomerOrder[];
  recentCases?: Array<{ id: string; caseNumber?: string; type?: string; status?: string }>;
  aiExecutiveSummary?: string | null;
  aiRecommendations?: Array<{ action: string; priority: string; reason: string }>;
  reconciliation?: { status: string; mismatches: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildInitialsAvatar(name: string): string {
  const initials = name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || 'CU';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#E9EAE6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700" fill="#1a1a1a">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function normalizeSource(name?: string | null, externalId?: string | null) {
  const safeName = name?.trim() || 'Unknown';
  return { name: safeName, icon: buildInitialsAvatar(safeName), externalId };
}

function mapApiCustomer(c: any): Customer {
  const name = c.canonicalName || c.name || 'Unknown';
  const email = c.canonicalEmail || c.email || '';
  const ltv = c.lifetimeValue ?? c.ltv ?? 0;
  const segment = c.segment || 'regular';
  const linkedIdentities = Array.isArray(c.linkedIdentities) ? c.linkedIdentities : [];
  const sources = linkedIdentities.length > 0
    ? linkedIdentities.map((id: any) => normalizeSource(id.system, id.externalId))
    : [normalizeSource(c.company || name)];
  return {
    id: c.id,
    name,
    email,
    avatar: c.avatarUrl || buildInitialsAvatar(name),
    role: c.role || 'Customer',
    company: c.company || 'Personal',
    location: c.location || 'N/A',
    timezone: c.timezone || 'N/A',
    since: c.createdAt ? new Date(c.createdAt).getFullYear().toString() : 'N/A',
    segment: (segment === 'vip' ? 'VIP Enterprise' : 'Standard') as 'VIP Enterprise' | 'Standard',
    ltv: `$${Number(ltv).toLocaleString()}`,
    openTickets: Number(c.openCases || 0),
    problemsResolved: Number(c.problemsResolved ?? 0),
    problemsUnresolved: Number(c.problemsUnresolved ?? c.openCases ?? 0),
    aiImpact: {
      resolved: Number(c.aiImpactResolved ?? 0),
      approvals: Number(c.aiImpactApprovals ?? 0) || undefined,
      escalated: Number(c.aiImpactEscalated ?? 0) || undefined,
    },
    topIssue: c.topIssue || 'N/A',
    risk: (c.riskLevel === 'high' || c.riskLevel === 'critical') ? 'Churn Risk'
        : c.riskLevel === 'medium' ? 'Watchlist' : 'Healthy',
    sources,
    plan: c.plan || 'Standard',
    nextRenewal: c.nextRenewal ? new Date(c.nextRenewal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A',
    orders: [],
  };
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
type SidebarItem = 'allUsers' | 'allLeads' | 'active' | 'new' | 'empresas' | 'conversaciones';

function CustomersSidebar({ active, onSelect }: { active: SidebarItem; onSelect: (id: SidebarItem) => void }) {
  const itemCls = (id: SidebarItem) =>
    `flex items-center justify-between w-full pl-3 pr-4 py-[5px] rounded-[8px] transition-colors ${
      active === id
        ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] border-l-2 border-[#fa7938]'
        : 'hover:bg-white/60 border-l-2 border-transparent'
    }`;

  return (
    <div className="flex flex-col h-full w-[236px] flex-shrink-0 bg-[#f8f8f7] border-r border-[#e9eae6] pt-3 pb-3 px-3 gap-1 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 mb-1">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Contactos</span>
        <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#e9eae6]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M2 4.5a2 2 0 100 3 2 2 0 000-3zm6 0a2 2 0 100 3 2 2 0 000-3zm6 0a2 2 0 100 3 2 2 0 000-3z"/></svg>
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 px-2 py-1">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462] opacity-60"><circle cx="8" cy="5" r="3"/><path d="M2.5 13c.5-2.5 2.8-4 5.5-4s5 1.5 5.5 4v.5h-11V13z"/></svg>
          <span className="text-[12px] font-medium text-[#646462]">Personas:</span>
        </div>
        {([
          { id: 'allUsers' as SidebarItem, label: 'All users' },
          { id: 'allLeads' as SidebarItem, label: 'All leads' },
          { id: 'active' as SidebarItem, label: 'Active' },
          { id: 'new' as SidebarItem, label: 'New' },
        ]).map(it => (
          <button key={it.id} onClick={() => onSelect(it.id)} className={itemCls(it.id)}>
            <span className={`text-[13px] text-[#1a1a1a] ${active === it.id ? 'font-semibold' : ''}`}>{it.label}</span>
          </button>
        ))}
      </div>

      <div className="h-px bg-[#e9eae6] mx-2 my-1" />

      <div className="flex flex-col gap-0.5">
        <button
          onClick={() => onSelect('empresas')}
          className={`flex items-center justify-between w-full px-2 py-1 rounded-[8px] transition-colors ${
            active === 'empresas' ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]' : 'hover:bg-white/60'
          }`}
        >
          <span className={`text-[12px] font-medium ${active === 'empresas' ? 'font-semibold text-[#1a1a1a]' : 'text-[#646462]'}`}>Empresas:</span>
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462] opacity-40"><path d="M6 4l4 4-4 4z"/></svg>
        </button>
      </div>

      <div className="h-px bg-[#e9eae6] mx-2 my-1" />

      <button
        onClick={() => onSelect('conversaciones')}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-[8px] w-full transition-colors ${
          active === 'conversaciones' ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]' : 'hover:bg-white/60'
        }`}
      >
        <span className={`text-[13px] text-[#1a1a1a] ${active === 'conversaciones' ? 'font-semibold' : ''}`}>Conversaciones</span>
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CustomersV2() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<CustomerTab>('all_activity');
  const [sidebarActive, setSidebarActive] = useState<SidebarItem>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<'all' | 'vip' | 'standard'>('all');
  const [openTicketsFilter, setOpenTicketsFilter] = useState<'all' | 'open'>('all');
  const [riskFilter, setRiskFilter] = useState<'all' | 'risk'>('all');
  const [aiHandledFilter, setAiHandledFilter] = useState<'all' | 'handled'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', company: '', source: 'manual' });
  const [editForm, setEditForm] = useState({ canonicalName: '', canonicalEmail: '', phone: '', segment: '', riskLevel: '', preferredChannel: '' });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  // ── API ────────────────────────────────────────────────────────────────────
  const { data: apiCustomers, loading: customersLoading, error: customersError } = useApi(
    () => customersApi.list(), [], []
  );
  const { data: apiSelectedState, loading: stateLoading } = useApi(
    () => selectedCustomerId ? customersApi.state(selectedCustomerId) : Promise.resolve(null),
    [selectedCustomerId]
  );
  const { data: apiActivity } = useApi(
    () => selectedCustomerId ? customersApi.activity(selectedCustomerId) : Promise.resolve([]),
    [selectedCustomerId]
  );

  // ── Derived state ──────────────────────────────────────────────────────────
  const customers: Customer[] = useMemo(
    () => (apiCustomers ?? []).map(mapApiCustomer),
    [apiCustomers]
  );

  const selectedCustomer: Customer | null = useMemo(() => {
    const listItem = customers.find(c => c.id === selectedCustomerId) || null;
    if (!apiSelectedState) return listItem;

    const c = apiSelectedState.customer || {};
    const linkedIdentities = apiSelectedState.linkedIdentities || [];
    const unresolvedConflicts = apiSelectedState.unresolvedConflicts || [];
    const recentCases = (apiSelectedState.recentCases || []).map((rc: any) => ({
      id: rc.id || rc.caseNumber,
      caseNumber: rc.caseNumber || rc.id,
      type: rc.type || 'Case',
      status: rc.status || 'open',
    }));
    const orderNodes = apiSelectedState.systems?.orders?.nodes || [];
    const orders: CustomerOrder[] = orderNodes.map((node: any) => ({
      id: node.label || node.id,
      date: node.timestamp ? new Date(node.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A',
      total: node.total != null ? `$${Number(node.total).toLocaleString()}` : 'N/A',
      status: (['in_transit', 'packed', 'processing'].includes(node.value) ? 'Processing' : 'Delivered') as CustomerOrder['status'],
      items: (node.lineItems || []).map((li: any) => ({ name: li.name, sku: li.sku || '', price: li.price != null ? `$${Number(li.price).toFixed(2)}` : 'N/A' })),
    }));

    const aiRecs = Array.isArray(c.aiRecommendations) ? c.aiRecommendations : [];
    return {
      id: c.id || listItem?.id || '',
      name: c.canonicalName || listItem?.name || 'Unknown',
      email: c.canonicalEmail || listItem?.email || '',
      avatar: c.avatarUrl || buildInitialsAvatar(c.canonicalName || listItem?.name || 'Unknown'),
      role: c.role || listItem?.role || 'Customer',
      company: c.company || listItem?.company || 'Personal',
      location: c.location || listItem?.location || 'N/A',
      timezone: c.timezone || listItem?.timezone || 'N/A',
      since: c.createdAt ? new Date(c.createdAt).getFullYear().toString() : (listItem?.since || 'N/A'),
      segment: (c.segment === 'vip' ? 'VIP Enterprise' : 'Standard') as 'VIP Enterprise' | 'Standard',
      ltv: `$${Number(apiSelectedState.metrics?.lifetimeValue || c.lifetimeValue || 0).toLocaleString()}`,
      openTickets: apiSelectedState.metrics?.openCases ?? 0,
      problemsResolved: Number(c.problemsResolved ?? 0),
      problemsUnresolved: Number(unresolvedConflicts.length),
      aiImpact: {
        resolved: Number(c.aiImpactResolved ?? 0),
        approvals: Number(c.aiImpactApprovals ?? 0) || undefined,
        escalated: Number(c.aiImpactEscalated ?? 0) || undefined,
      },
      topIssue: unresolvedConflicts[0]?.conflictType || c.topIssue || listItem?.topIssue || 'N/A',
      risk: (c.riskLevel === 'high' || c.riskLevel === 'critical') ? 'Churn Risk'
          : c.riskLevel === 'medium' ? 'Watchlist' : 'Healthy',
      fraudRisk: c.fraudRisk || 'low',
      sources: linkedIdentities.length > 0
        ? linkedIdentities.map((id: any) => normalizeSource(id.system, id.externalId))
        : (listItem?.sources || []),
      plan: c.plan || listItem?.plan || 'Standard',
      nextRenewal: c.nextRenewal
        ? new Date(c.nextRenewal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : (listItem?.nextRenewal || 'N/A'),
      recentCases,
      orders,
      aiExecutiveSummary: c.aiExecutiveSummary || null,
      aiRecommendations: aiRecs,
      reconciliation: unresolvedConflicts.length > 0 ? { status: 'Conflict', mismatches: unresolvedConflicts.length } : { status: 'Healthy', mismatches: 0 },
    };
  }, [apiSelectedState, customers, selectedCustomerId]);

  // Summary stats
  const summary = useMemo(() => {
    const total = customers.length;
    const resolved = customers.reduce((s, c) => s + (c.aiImpact.resolved || 0), 0);
    const approvals = customers.reduce((s, c) => s + (c.aiImpact.approvals || 0), 0);
    const escalated = customers.reduce((s, c) => s + (c.aiImpact.escalated || 0), 0);
    const openTickets = customers.reduce((s, c) => s + c.openTickets, 0);
    const atRisk = customers.filter(c => c.risk && c.risk !== 'Healthy').length;
    const handledCustomers = customers.filter(c => c.aiImpact.resolved > 0).length;
    const resolutionRate = Math.round((resolved / Math.max(resolved + approvals + escalated, 1)) * 100);
    const handledRate = Math.round((handledCustomers / Math.max(total, 1)) * 100);
    return { total, resolved, approvals, escalated, openTickets, atRisk, handledCustomers, resolutionRate, handledRate };
  }, [customers]);

  // Filtered list
  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customers.filter(c => {
      const hay = [c.name, c.email, c.company, c.plan, c.segment, c.topIssue, c.risk || '', ...c.sources.map(s => s.name)].join(' ').toLowerCase();
      return (!q || hay.includes(q))
        && (segmentFilter === 'all' || (segmentFilter === 'vip' && c.segment === 'VIP Enterprise') || (segmentFilter === 'standard' && c.segment === 'Standard'))
        && (openTicketsFilter === 'all' || c.openTickets > 0)
        && (riskFilter === 'all' || (c.risk && c.risk !== 'Healthy'))
        && (aiHandledFilter === 'all' || c.aiImpact.resolved > 0);
    });
  }, [customers, searchQuery, segmentFilter, openTicketsFilter, riskFilter, aiHandledFilter]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const openEditCustomer = useCallback(() => {
    if (!selectedCustomer) return;
    const raw = (apiSelectedState as any)?.customer ?? {};
    setEditForm({
      canonicalName: raw.canonicalName ?? selectedCustomer.name ?? '',
      canonicalEmail: raw.canonicalEmail ?? selectedCustomer.email ?? '',
      phone: raw.phone ?? '',
      segment: raw.segment ?? (selectedCustomer.segment === 'VIP Enterprise' ? 'vip' : 'standard'),
      riskLevel: raw.riskLevel ?? 'low',
      preferredChannel: raw.preferredChannel ?? 'email',
    });
    setIsEditOpen(true);
    setActionsOpen(false);
  }, [selectedCustomer, apiSelectedState]);

  const handleCreateCustomer = async (e: FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const created = await customersApi.create({
        displayName: newCustomer.name.trim() || newCustomer.email.trim() || 'New Customer',
        email: newCustomer.email.trim(),
        source: newCustomer.source,
        company: newCustomer.company.trim() || undefined,
      });
      showToast(`Customer created: ${created?.canonicalName || newCustomer.name || 'New Customer'}`);
      setIsCreateOpen(false);
      setNewCustomer({ name: '', email: '', company: '', source: 'manual' });
      if (created?.id) setSelectedCustomerId(created.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create customer.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    setIsUpdating(true);
    try {
      const payload: Record<string, any> = {};
      if (editForm.canonicalName.trim()) payload.canonicalName = editForm.canonicalName.trim();
      if (editForm.canonicalEmail.trim()) payload.canonicalEmail = editForm.canonicalEmail.trim();
      if (editForm.phone.trim()) payload.phone = editForm.phone.trim();
      if (editForm.segment) payload.segment = editForm.segment;
      if (editForm.riskLevel) payload.riskLevel = editForm.riskLevel;
      if (editForm.preferredChannel) payload.preferredChannel = editForm.preferredChannel;
      await customersApi.update(selectedCustomerId, payload);
      showToast('Customer profile updated.');
      setIsEditOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update customer.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStartRefund = async () => {
    if (!selectedCustomer) return;
    setActionsOpen(false);
    try {
      const payments = await paymentsApi.list(selectedCustomer.email ? { q: selectedCustomer.email } : {});
      const payment = payments[0];
      if (!payment) { showToast('No refundable payment found.'); return; }
      const refund = await paymentsApi.refund(payment.id, { reason: `Refund from customer profile for ${selectedCustomer.name}` });
      showToast(`Refund created for payment ${payment.id}${refund?.id ? ` (${refund.id})` : ''}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to start refund.');
    }
  };

  const handleCreateApproval = async () => {
    if (!selectedCustomer) return;
    setActionsOpen(false);
    try {
      const caseId = selectedCustomer.recentCases?.[0]?.id;
      if (!caseId) { showToast('No linked case found for approval.'); return; }
      const result = await policyApi.evaluateAndRoute({
        entityType: 'case',
        actionType: 'customer_profile_action',
        caseId,
        requestedBy: 'user_alex',
        requestedByType: 'human',
        context: {
          customerId: selectedCustomer.id,
          customerEmail: selectedCustomer.email,
          customerName: selectedCustomer.name,
          riskLevel: selectedCustomer.risk === 'Churn Risk' ? 'high' : selectedCustomer.risk === 'Watchlist' ? 'medium' : 'low',
        },
      });
      showToast(result?.approvalRequestId ? `Approval request created for ${caseId}` : `Policy evaluated: ${result?.decision || 'approved'}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create approval.');
    }
  };

  // ── List View ──────────────────────────────────────────────────────────────
  const renderListView = () => (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 flex-shrink-0">
        <div className="bg-white rounded-xl border border-[#e9eae6]">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Customers</h1>
              <p className="text-[12px] text-[#646462] mt-0.5">Unified customer records with AI insights</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg viewBox="0 0 16 16" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 fill-[#646462]"><path d="M6.5 1a5.5 5.5 0 014.4 8.79L14 13l-1 1-3.22-3.1A5.5 5.5 0 116.5 1zm0 1.5a4 4 0 100 8 4 4 0 000-8z"/></svg>
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 w-60 bg-[#f8f8f7] border border-[#e9eae6] rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a] text-[#1a1a1a]"
                />
              </div>
              <button
                onClick={() => setIsCreateOpen(true)}
                className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black flex items-center gap-1.5"
              >
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-white"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
                New Customer
              </button>
            </div>
          </div>
          {/* Filter bar */}
          <div className="px-6 flex items-center gap-2 border-t border-[#e9eae6] pt-3 pb-3 overflow-x-auto">
            {[
              { label: 'Segment', active: segmentFilter !== 'all', toggle: () => setSegmentFilter(p => p === 'all' ? 'vip' : 'all') },
              { label: 'Has open tickets', active: openTicketsFilter === 'open', toggle: () => setOpenTicketsFilter(p => p === 'all' ? 'open' : 'all') },
              { label: 'VIP', active: segmentFilter === 'vip', toggle: () => setSegmentFilter(p => p === 'vip' ? 'all' : 'vip') },
              { label: 'Risk flags', active: riskFilter === 'risk', toggle: () => setRiskFilter(p => p === 'all' ? 'risk' : 'all') },
              { label: 'AI handled', active: aiHandledFilter === 'handled', toggle: () => setAiHandledFilter(p => p === 'all' ? 'handled' : 'all') },
            ].map(f => (
              <button
                key={f.label}
                onClick={f.toggle}
                className={`flex-shrink-0 px-3 h-7 text-[12px] font-medium rounded-lg border transition-all ${
                  f.active
                    ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                    : 'bg-white text-[#646462] border-[#e9eae6] hover:border-[#d0d0ce]'
                }`}
              >
                {f.label}
              </button>
            ))}
            <div className="w-px h-4 bg-[#e9eae6] mx-1"></div>
            <button
              onClick={() => { setSegmentFilter('all'); setOpenTicketsFilter('all'); setRiskFilter('all'); setAiHandledFilter('all'); setSearchQuery(''); }}
              className="text-[12px] text-[#646462] hover:text-[#1a1a1a] font-medium"
            >
              Clear all
            </button>
          </div>
        </div>
      </div>

      {/* Error / Toast */}
      {customersError && (
        <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800 flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-red-600 flex-shrink-0"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.5h1.5l-.25 5h-1l-.25-5zM8 11.5a1 1 0 110-2 1 1 0 010 2z"/></svg>
          {customersError}
        </div>
      )}
      {toast && (
        <div className="mx-6 mt-4 rounded-xl border border-[#e9eae6] bg-white px-4 py-3 text-[13px] text-[#1a1a1a] flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-green-600 flex-shrink-0"><path d="M13 4L6 11 3 8l-1 1 4 4 8-8z"/></svg>
          {toast}
        </div>
      )}

      {/* Content: table + right panel */}
      <div className="flex-1 flex gap-4 overflow-hidden min-h-0 px-6 py-4">
        {/* Table */}
        <div className="flex-1 bg-white rounded-xl border border-[#e9eae6] overflow-hidden flex flex-col">
          {customersLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-[13px] text-[#646462]">Loading customers…</div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#f8f8f7] sticky top-0 z-10">
                  <tr>
                    {['Customer', 'Segment', 'Open', 'AI Impact (30d)', 'Top Issue', 'Risk', 'Problems'].map(h => (
                      <th key={h} className="px-5 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider border-b border-[#e9eae6]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e9eae6]/60">
                  {visible.length > 0 ? visible.map(c => (
                    <tr
                      key={c.id}
                      className={`group cursor-pointer transition-colors ${selectedCustomerId === c.id ? 'bg-[#f8f8f7]' : 'hover:bg-[#f8f8f7]'}`}
                      onClick={() => { setSelectedCustomerId(c.id); setActiveProfileTab('all_activity'); }}
                    >
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <img alt="" className="w-8 h-8 rounded-full object-cover border border-[#e9eae6]" src={c.avatar} referrerPolicy="no-referrer" />
                          <div>
                            <div className="text-[13px] font-semibold text-[#1a1a1a]">{c.name}</div>
                            <div className="text-[12px] text-[#646462]">{c.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full border border-[#e9eae6] bg-[#f8f8f7] px-2.5 py-0.5 text-[11px] font-semibold text-[#646462]">
                          {c.segment}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`text-[13px] font-bold ${c.openTickets > 0 ? 'text-[#1a1a1a]' : 'text-[#646462]'}`}>{c.openTickets}</span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="inline-flex items-center rounded-full border border-[#e9eae6] bg-[#f8f8f7] px-2 py-0.5 text-[11px] font-semibold text-[#646462]">{c.aiImpact.resolved} Resolved</span>
                          {c.aiImpact.approvals ? <span className="inline-flex items-center rounded-full border border-[#e9eae6] bg-[#f8f8f7] px-2 py-0.5 text-[11px] font-semibold text-[#646462]">{c.aiImpact.approvals} Approval</span> : null}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full border border-[#e9eae6] bg-[#f8f8f7] px-2.5 py-0.5 text-[11px] font-semibold text-[#646462]">{c.topIssue}</span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {c.risk && (
                          <span className="inline-flex items-center rounded-full border border-[#e9eae6] bg-[#f8f8f7] px-2.5 py-0.5 text-[11px] font-semibold text-[#646462]">
                            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${c.risk === 'Churn Risk' ? 'bg-red-500' : c.risk === 'Watchlist' ? 'bg-orange-400' : 'bg-green-500'}`}></span>
                            {c.risk}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${c.problemsUnresolved > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-[#f8f8f7] text-[#646462] border-[#e9eae6]'}`}>
                            <span className={`mr-1 h-1.5 w-1.5 rounded-full ${c.problemsUnresolved > 0 ? 'bg-red-500' : 'bg-[#646462]'}`}></span>
                            {c.problemsUnresolved} open
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${c.problemsResolved > 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-[#f8f8f7] text-[#646462] border-[#e9eae6]'}`}>
                            <span className={`mr-1 h-1.5 w-1.5 rounded-full ${c.problemsResolved > 0 ? 'bg-green-500' : 'bg-[#646462]'}`}></span>
                            {c.problemsResolved} solved
                          </span>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-[13px] text-[#646462]">No customers match your search.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right stats panel */}
        <div className="w-72 flex flex-col gap-3 flex-shrink-0">
          <div className="bg-white rounded-xl border border-[#e9eae6] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold text-[#1a1a1a]">AI Impact Overview</h3>
              <span className="text-[12px] text-[#646462]">{summary.total} customers</span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-[#646462]">Resolution Rate</span>
                  <span className="font-semibold text-[#1a1a1a]">{summary.resolutionRate}%</span>
                </div>
                <div className="w-full bg-[#e9eae6] rounded-full h-1.5">
                  <div className="bg-[#1a1a1a] h-1.5 rounded-full" style={{ width: `${summary.resolutionRate}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-[#646462]">AI Handled</span>
                  <span className="font-semibold text-[#1a1a1a]">{summary.handledRate}%</span>
                </div>
                <div className="w-full bg-[#e9eae6] rounded-full h-1.5">
                  <div className="bg-[#1a1a1a] h-1.5 rounded-full" style={{ width: `${summary.handledRate}%` }}></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[
                  { label: 'Conversations', value: summary.openTickets },
                  { label: 'Approvals', value: summary.approvals },
                ].map(stat => (
                  <div key={stat.label} className="bg-[#f8f8f7] p-3 rounded-xl border border-[#e9eae6]">
                    <div className="text-[10px] text-[#646462] font-semibold uppercase tracking-wide">{stat.label}</div>
                    <div className="text-[17px] font-semibold text-[#1a1a1a] mt-1">{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#e9eae6] p-5">
            <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-3">Customer Segments</h3>
            <div className="space-y-2">
              {[
                { label: 'Open tickets', value: summary.openTickets, action: () => setOpenTicketsFilter('open') },
                { label: 'Risk flags', value: summary.atRisk, action: () => setRiskFilter('risk') },
                { label: 'AI resolved', value: summary.resolved, action: () => setAiHandledFilter('handled') },
              ].map(seg => (
                <button key={seg.label} onClick={seg.action} className="w-full rounded-xl border border-[#e9eae6] bg-[#f8f8f7] px-3 py-3 text-left transition-colors hover:bg-[#ededea]">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[#1a1a1a]">{seg.label}</span>
                    <span className="text-[12px] text-[#646462]">{seg.value}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Profile View ───────────────────────────────────────────────────────────
  const renderProfileView = () => {
    if (stateLoading && !selectedCustomer) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[13px] text-[#646462]">Loading customer…</div>
        </div>
      );
    }
    if (!selectedCustomer) return null;

    const churnHigh = selectedCustomer.risk === 'Churn Risk';
    const fraudHigh = selectedCustomer.fraudRisk === 'high' || selectedCustomer.fraudRisk === 'critical';

    return (
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-[#f8f8f7]">
        {/* Profile header */}
        <header className="flex-shrink-0 px-6 py-4 border-b border-[#e9eae6] bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedCustomerId(null)}
              className="flex items-center gap-1.5 text-[13px] text-[#646462] hover:text-[#1a1a1a] transition-colors"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M10 3L4 8l6 5V3z"/></svg>
              Customers
            </button>
            <span className="text-[#e9eae6]">/</span>
            <div className="flex items-center gap-2">
              <img alt={selectedCustomer.name} className="w-7 h-7 rounded-full object-cover border border-[#e9eae6]" src={selectedCustomer.avatar} referrerPolicy="no-referrer" />
              <span className="text-[14px] font-semibold text-[#1a1a1a]">{selectedCustomer.name}</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                selectedCustomer.segment === 'VIP Enterprise'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-[#f8f8f7] text-[#646462] border-[#e9eae6]'
              }`}>{selectedCustomer.segment}</span>
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setActionsOpen(v => !v)}
              className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea] border border-[#e9eae6] flex items-center gap-1.5"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M4 8a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm5.5 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm4 1.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/></svg>
              More
            </button>
            {actionsOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-[14px] border border-[#e9eae6] bg-white shadow-[0px_4px_16px_rgba(20,20,20,0.12)] z-20 p-1.5">
                {[
                  { label: 'Edit profile', action: openEditCustomer },
                  { label: 'Create approval', action: handleCreateApproval },
                  { label: 'Start refund', action: handleStartRefund },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="w-full flex items-center px-3 py-2.5 text-[13px] text-[#1a1a1a] rounded-xl hover:bg-[#f8f8f7] transition-colors text-left"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {toast && (
          <div className="mx-6 mt-4 rounded-xl border border-[#e9eae6] bg-white px-4 py-3 text-[13px] text-[#1a1a1a] flex items-center gap-2">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-green-600 flex-shrink-0"><path d="M13 4L6 11 3 8l-1 1 4 4 8-8z"/></svg>
            {toast}
          </div>
        )}

        {/* KPI cards */}
        <div className="px-6 pt-5 grid grid-cols-4 gap-3">
          {[
            { label: 'Lifetime Value', value: selectedCustomer.ltv, sub: selectedCustomer.plan, accent: false },
            { label: 'Open Cases', value: String(selectedCustomer.openTickets), sub: `${selectedCustomer.openTickets} active`, accent: selectedCustomer.openTickets > 0, color: 'amber' },
            { label: 'Next Renewal', value: selectedCustomer.nextRenewal, sub: selectedCustomer.plan, accent: false },
            { label: 'Risk Level', value: churnHigh ? 'Churn Risk' : selectedCustomer.risk || 'Healthy', sub: `Fraud: ${fraudHigh ? 'High' : 'Low'}`, accent: churnHigh || fraudHigh, color: 'red' },
          ].map(kpi => (
            <div key={kpi.label} className={`bg-white rounded-xl border p-4 ${kpi.accent && kpi.color === 'red' ? 'border-red-200' : kpi.accent && kpi.color === 'amber' ? 'border-orange-200' : 'border-[#e9eae6]'}`}>
              <p className="text-[10px] font-semibold text-[#646462] uppercase tracking-widest mb-1">{kpi.label}</p>
              <p className={`text-[16px] font-bold ${kpi.accent && kpi.color === 'red' ? 'text-red-600' : kpi.accent && kpi.color === 'amber' ? 'text-orange-600' : 'text-[#1a1a1a]'}`}>{kpi.value}</p>
              <p className="text-[11px] text-[#646462] mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Body: main + sidebar */}
        <div className="px-6 pt-4 pb-6 grid grid-cols-4 gap-4">
          {/* col-span-3 */}
          <div className="col-span-3 flex flex-col gap-4">
            {/* AI Summary */}
            <div className="bg-white rounded-xl border border-[#e9eae6] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#e9eae6] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1l1.4 4.6L14 7l-4.6 1.4L8 13l-1.4-4.6L2 7l4.6-1.4L8 1z"/></svg>
                  <h3 className="text-[13px] font-semibold text-[#1a1a1a]">AI Executive Summary</h3>
                </div>
                <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Live</span>
              </div>
              <div className="p-5">
                {selectedCustomer.aiExecutiveSummary ? (
                  <p className="text-[13px] text-[#646462] leading-relaxed">{selectedCustomer.aiExecutiveSummary}</p>
                ) : (
                  <p className="text-[13px] text-[#646462] italic">No AI summary available for this customer yet.</p>
                )}
                {(selectedCustomer.aiRecommendations?.length ?? 0) > 0 && (
                  <div className="mt-4 pt-4 border-t border-[#e9eae6] space-y-2">
                    <p className="text-[10px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Recommended Actions</p>
                    {selectedCustomer.aiRecommendations!.map((rec, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-[#f8f8f7] rounded-xl border border-[#e9eae6]">
                        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${rec.priority === 'high' ? 'bg-red-500' : rec.priority === 'medium' ? 'bg-orange-400' : 'bg-green-500'}`} />
                        <p className="text-[12px] text-[#646462] leading-snug"><span className="font-semibold text-[#1a1a1a]">{rec.action}</span> — {rec.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Activity tabs */}
            <div className="bg-white rounded-xl border border-[#e9eae6] overflow-hidden">
              <div className="px-5 pt-4 border-b border-[#e9eae6] flex items-end gap-0 overflow-x-auto">
                {(['all_activity', 'conversations', 'orders', 'system_logs'] as CustomerTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveProfileTab(tab)}
                    className={`pb-3 mr-6 text-[13px] whitespace-nowrap transition-all border-b-2 ${
                      activeProfileTab === tab
                        ? 'font-semibold text-[#1a1a1a] border-[#1a1a1a]'
                        : 'text-[#646462] border-transparent hover:text-[#1a1a1a]'
                    }`}
                  >
                    {tab.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </button>
                ))}
              </div>
              <div className="p-5">
                {activeProfileTab === 'all_activity' && (() => {
                  const events = Array.isArray(apiActivity) ? (apiActivity as any[]).filter(e => e.type !== 'system_log') : [];
                  if (events.length === 0) return <p className="text-[13px] text-[#646462] text-center py-8">No activity recorded yet.</p>;
                  return (
                    <div className="relative border-l border-[#e9eae6] ml-3 space-y-5">
                      {events.map((ev: any) => (
                        <div key={ev.id} className="relative pl-6">
                          <div className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-[#1a1a1a] border-2 border-white"></div>
                          <p className="text-[11px] text-[#646462] mb-1">
                            {new Date(ev.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <div className="rounded-xl border border-[#e9eae6] bg-[#f8f8f7] p-3">
                            <p className="text-[13px] font-semibold text-[#1a1a1a] mb-0.5">{ev.title}</p>
                            <p className="text-[12px] text-[#646462] leading-relaxed">{ev.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {activeProfileTab === 'conversations' && (() => {
                  const cases = selectedCustomer.recentCases || [];
                  if (cases.length === 0) return <p className="text-[13px] text-[#646462] text-center py-8">No linked conversations.</p>;
                  return (
                    <div className="space-y-3">
                      {cases.map(c => (
                        <div key={c.id} className="rounded-xl border border-[#e9eae6] bg-[#f8f8f7] p-4 hover:bg-[#ededea] transition-colors cursor-pointer">
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="text-[11px] font-semibold text-purple-600">{c.caseNumber || c.id}</span>
                              <h4 className="text-[13px] font-semibold text-[#1a1a1a] mt-0.5">{c.type || 'Case'}</h4>
                            </div>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              c.status === 'open' || c.status === 'escalated' ? 'bg-orange-50 text-orange-700 border border-orange-200' : 'bg-green-50 text-green-700 border border-green-200'
                            }`}>{c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : 'Open'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {activeProfileTab === 'orders' && (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#e9eae6]">
                        {['Order', 'Date', 'Total', 'Status'].map(h => (
                          <th key={h} className="pb-2 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e9eae6]">
                      {selectedCustomer.orders.length === 0 ? (
                        <tr><td colSpan={4} className="py-8 text-center text-[13px] text-[#646462]">No orders.</td></tr>
                      ) : selectedCustomer.orders.map(o => (
                        <tr key={o.id} className="hover:bg-[#f8f8f7] transition-colors">
                          <td className="py-3 text-[13px] font-semibold text-[#1a1a1a]">{o.id}</td>
                          <td className="py-3 text-[12px] text-[#646462]">{o.date}</td>
                          <td className="py-3 text-[13px] font-semibold text-[#1a1a1a]">{o.total}</td>
                          <td className="py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${o.status === 'Processing' ? 'bg-orange-50 text-orange-700 border border-orange-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {activeProfileTab === 'system_logs' && (() => {
                  const logs = Array.isArray(apiActivity) ? (apiActivity as any[]).filter(e => e.type === 'system_log') : [];
                  if (logs.length === 0) return <p className="text-[13px] text-[#646462] text-center py-8">No system logs.</p>;
                  return (
                    <div className="font-mono text-[11px] space-y-0.5">
                      {logs.map((log: any) => (
                        <div key={log.id} className="flex items-start gap-4 py-2 border-b border-[#e9eae6]">
                          <span className="w-24 flex-shrink-0 text-[#646462]">{new Date(log.occurredAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                          <span className={`w-14 flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${log.level === 'error' ? 'bg-red-50 text-red-600' : log.level === 'warning' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>{(log.level || 'info').toUpperCase()}</span>
                          <span className="flex-1 text-[#646462] break-all">{log.content}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* col-span-1 right */}
          <div className="col-span-1 flex flex-col gap-3">
            {/* Identity */}
            <div className="bg-white rounded-xl border border-[#e9eae6] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#e9eae6]">
                <h3 className="text-[13px] font-semibold text-[#1a1a1a]">Identity</h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <img alt={selectedCustomer.name} className="w-10 h-10 rounded-full object-cover border border-[#e9eae6] flex-shrink-0" src={selectedCustomer.avatar} referrerPolicy="no-referrer" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{selectedCustomer.name}</p>
                    <p className="text-[12px] text-[#646462] truncate">{selectedCustomer.email}</p>
                  </div>
                </div>
                <div className="space-y-2 pt-3 border-t border-[#e9eae6]">
                  {[
                    { icon: 'M3 4a1 1 0 011-1h8a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4z', label: `${selectedCustomer.role} · ${selectedCustomer.company}` },
                    { icon: 'M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z', label: `${selectedCustomer.location} · ${selectedCustomer.timezone}` },
                    { icon: 'M2 3.5h12v1.5H2zm0 4h12V9H2zm0 4h12V13H2z', label: `Customer since ${selectedCustomer.since}` },
                  ].map((row, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462] mt-0.5 flex-shrink-0"><path d={row.icon}/></svg>
                      <span className="text-[12px] text-[#646462] leading-snug">{row.label}</span>
                    </div>
                  ))}
                </div>
                {selectedCustomer.sources.length > 0 && (
                  <div className="pt-3 border-t border-[#e9eae6]">
                    <p className="text-[10px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Linked Profiles</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCustomer.sources.map((src, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[#e9eae6] bg-[#f8f8f7]">
                          <img alt={src.name} className="w-3.5 h-3.5 object-contain" src={src.icon} referrerPolicy="no-referrer" />
                          <span className="text-[11px] text-[#646462] font-medium">{src.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Risk */}
            <div className="bg-white rounded-xl border border-[#e9eae6] p-4">
              <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-3">Health & Risk</h3>
              <div className="space-y-2">
                {[
                  { label: 'Churn Risk', value: selectedCustomer.risk || 'Healthy', alert: churnHigh },
                  { label: 'Fraud Risk', value: selectedCustomer.fraudRisk || 'low', alert: fraudHigh },
                  { label: 'Conflicts', value: String(selectedCustomer.reconciliation?.mismatches ?? 0), alert: (selectedCustomer.reconciliation?.mismatches ?? 0) > 0 },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-[#e9eae6] last:border-0">
                    <span className="text-[12px] text-[#646462]">{row.label}</span>
                    <span className={`text-[12px] font-semibold ${row.alert ? 'text-red-600' : 'text-[#1a1a1a]'}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Modals ─────────────────────────────────────────────────────────────────
  const renderCreateModal = () => !isCreateOpen ? null : (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-[#e9eae6] shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-[#e9eae6] flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#1a1a1a]">New Customer</h2>
          <button onClick={() => setIsCreateOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f8f8f7]">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M4.7 4.7l6.6 6.6M11.3 4.7l-6.6 6.6" stroke="#646462" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
          {[
            { label: 'Name', key: 'name' as const, placeholder: 'Full name' },
            { label: 'Email', key: 'email' as const, placeholder: 'customer@company.com', type: 'email' },
            { label: 'Company', key: 'company' as const, placeholder: 'Company name (optional)' },
          ].map(field => (
            <div key={field.key}>
              <label className="block text-[12px] font-semibold text-[#646462] mb-1">{field.label}</label>
              <input
                type={field.type || 'text'}
                placeholder={field.placeholder}
                value={newCustomer[field.key]}
                onChange={e => setNewCustomer(c => ({ ...c, [field.key]: e.target.value }))}
                className="w-full px-3 py-2 text-[13px] bg-[#f8f8f7] border border-[#e9eae6] rounded-lg text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setIsCreateOpen(false)} className="flex-1 px-3 h-9 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea] border border-[#e9eae6]">Cancel</button>
            <button type="submit" disabled={isCreating} className="flex-1 px-3 h-9 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black disabled:opacity-60">
              {isCreating ? 'Creating…' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderEditModal = () => !isEditOpen ? null : (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-[#e9eae6] shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-[#e9eae6] flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#1a1a1a]">Edit Customer</h2>
          <button onClick={() => setIsEditOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f8f8f7]">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M4.7 4.7l6.6 6.6M11.3 4.7l-6.6 6.6" stroke="#646462" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <form onSubmit={handleUpdateCustomer} className="p-6 space-y-4">
          {[
            { label: 'Name', key: 'canonicalName' as const },
            { label: 'Email', key: 'canonicalEmail' as const },
            { label: 'Phone', key: 'phone' as const },
          ].map(field => (
            <div key={field.key}>
              <label className="block text-[12px] font-semibold text-[#646462] mb-1">{field.label}</label>
              <input
                type="text"
                value={editForm[field.key]}
                onChange={e => setEditForm(f => ({ ...f, [field.key]: e.target.value }))}
                className="w-full px-3 py-2 text-[13px] bg-[#f8f8f7] border border-[#e9eae6] rounded-lg text-[#1a1a1a] focus:outline-none focus:ring-1 focus:ring-[#1a1a1a]"
              />
            </div>
          ))}
          <div>
            <label className="block text-[12px] font-semibold text-[#646462] mb-1">Segment</label>
            <select value={editForm.segment} onChange={e => setEditForm(f => ({ ...f, segment: e.target.value }))} className="w-full px-3 py-2 text-[13px] bg-[#f8f8f7] border border-[#e9eae6] rounded-lg text-[#1a1a1a] focus:outline-none">
              <option value="standard">Standard</option>
              <option value="vip">VIP Enterprise</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setIsEditOpen(false)} className="flex-1 px-3 h-9 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea] border border-[#e9eae6]">Cancel</button>
            <button type="submit" disabled={isUpdating} className="flex-1 px-3 h-9 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black disabled:opacity-60">
              {isUpdating ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden">
      <CustomersSidebar active={sidebarActive} onSelect={setSidebarActive} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#f8f8f7]">
        {selectedCustomerId ? renderProfileView() : renderListView()}
      </div>
      {renderCreateModal()}
      {renderEditModal()}
    </div>
  );
}
