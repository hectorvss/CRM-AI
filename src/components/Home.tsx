import React from 'react';
import { useApi } from '../api/hooks';
import { casesApi, approvalsApi, reportsApi, workspacesApi } from '../api/client';
import type { NavigateFn } from '../types';

interface HomeProps {
  onNavigate?: NavigateFn;
}

const titleCase = (s?: string | null) =>
  s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';

const formatRelative = (value?: string | null) => {
  if (!value) return '—';
  const diff = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / 1440)}d ago`;
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medium:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  low:      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const SLA_COLOR: Record<string, string> = {
  breached: 'text-red-500',
  at_risk:  'text-orange-500',
  on_track: 'text-green-500',
};

export default function Home({ onNavigate }: HomeProps) {
  const navigate = (page: string, entityId?: string | null) => {
    onNavigate?.(entityId ? { page: page as any, entityId } : page as any);
  };

  // ── Data ─────────────────────────────────────────────────────
  const { data: workspace } = useApi(workspacesApi.currentContext, [], null as any);
  const { data: overview }  = useApi(() => reportsApi.overview('7d'), [], null as any);
  const { data: openCases, loading: casesLoading } = useApi(
    () => casesApi.list({ status: 'open', limit: '5' }),
    [], [] as any[]
  );
  const { data: pendingApprovalsPage, loading: approvalsLoading } = useApi(
    () => approvalsApi.list({ status: 'pending', limit: 5 }),
    [], { items: [], total: 0, hasMore: false, limit: 5, offset: 0 } as any
  );
  const pendingApprovals = pendingApprovalsPage?.items ?? [];
  const { data: allOpen } = useApi(
    () => casesApi.list({ status: 'open', limit: '999' }),
    [], [] as any[]
  );

  const openCount      = Array.isArray(allOpen) ? allOpen.length : '—';
  const pendingCount   = pendingApprovalsPage?.total ?? (Array.isArray(pendingApprovals) ? pendingApprovals.length : '—');
  const slaRisk        = Array.isArray(allOpen) ? allOpen.filter((c: any) => c.slaStatus === 'at_risk' || c.slaStatus === 'breached').length : '—';
  const aiResolution   = overview?.kpis?.find((k: any) => k.label?.toLowerCase().includes('resolution'))?.value ?? overview?.aiResolutionRate ?? '—';

  const wsName = workspace?.name || workspace?.workspace?.name || 'Workspace';
  const today  = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const kpis = [
    {
      label: 'Open Cases',
      value: openCount,
      icon: 'inbox',
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      action: () => navigate('inbox'),
    },
    {
      label: 'Pending Approvals',
      value: pendingCount,
      icon: 'check_circle',
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      action: () => navigate('approvals'),
    },
    {
      label: 'SLA at Risk',
      value: slaRisk,
      icon: 'timer',
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20',
      action: () => navigate('inbox'),
    },
    {
      label: 'AI Resolution Rate',
      value: aiResolution,
      icon: 'auto_awesome',
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      action: () => navigate('reports'),
    },
  ];

  const quickActions = [
    { label: 'Open Inbox',       icon: 'inbox',          action: () => navigate('inbox'),              desc: 'View & manage cases' },
    { label: 'Super Agent',      icon: 'auto_awesome',   action: () => navigate('super_agent'),        desc: 'AI command center' },
    { label: 'Run a Workflow',   icon: 'account_tree',   action: () => navigate('workflows'),          desc: 'Automate operations' },
    { label: 'View Reports',     icon: 'bar_chart',      action: () => navigate('reports'),            desc: 'Performance insights' },
    { label: 'Knowledge Base',   icon: 'menu_book',      action: () => navigate('knowledge'),          desc: 'Articles & policies' },
    { label: 'Customers',        icon: 'people',         action: () => navigate('customers'),          desc: 'Customer profiles' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0 overflow-hidden">
      <div className="flex-1 mx-2 my-2 overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{wsName}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{today}</p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {kpis.map((kpi) => (
            <button
              key={kpi.label}
              onClick={kpi.action}
              className="bg-white dark:bg-card-dark rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm text-left hover:shadow-md transition-shadow group"
            >
              <div className={`w-10 h-10 rounded-lg ${kpi.bg} flex items-center justify-center mb-3`}>
                <span className={`material-symbols-outlined text-xl ${kpi.color}`}>{kpi.icon}</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {kpi.value}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{kpi.label}</div>
            </button>
          ))}
        </div>

        {/* Two columns: Recent Cases + Pending Approvals */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Recent Cases */}
          <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-blue-500">inbox</span>
                Recent Open Cases
              </h2>
              <button
                onClick={() => navigate('inbox')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                View all
              </button>
            </div>

            {casesLoading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : !Array.isArray(openCases) || openCases.length === 0 ? (
              <div className="p-8 text-center">
                <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600 block mb-2">inbox</span>
                <p className="text-sm text-gray-500 dark:text-gray-400">No open cases</p>
                <p className="text-xs text-gray-400 mt-1">All caught up!</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                {openCases.slice(0, 5).map((c: any) => (
                  <li key={c.id}>
                    <button
                      onClick={() => navigate('inbox', c.id)}
                      className="w-full px-5 py-3.5 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono text-gray-400">{c.caseNumber || c.id?.slice(0, 8)}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_COLOR[c.priority] || PRIORITY_COLOR.low}`}>
                            {titleCase(c.priority)}
                          </span>
                          {c.slaStatus && c.slaStatus !== 'on_track' && (
                            <span className={`material-symbols-outlined text-[14px] ${SLA_COLOR[c.slaStatus] || ''}`}>timer</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                          {c.aiDiagnosis || titleCase(c.type) || 'Open case'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{c.customerName || 'Unknown'} · {formatRelative(c.createdAt)}</p>
                      </div>
                      <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-lg mt-0.5 flex-shrink-0">chevron_right</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Pending Approvals */}
          <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-orange-500">check_circle</span>
                Pending Approvals
              </h2>
              <button
                onClick={() => navigate('approvals')}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                View all
              </button>
            </div>

            {approvalsLoading ? (
              <div className="p-6 space-y-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : !Array.isArray(pendingApprovals) || pendingApprovals.length === 0 ? (
              <div className="p-8 text-center">
                <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600 block mb-2">check_circle</span>
                <p className="text-sm text-gray-500 dark:text-gray-400">No pending approvals</p>
                <p className="text-xs text-gray-400 mt-1">Queue is clear</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                {pendingApprovals.slice(0, 5).map((a: any) => (
                  <li key={a.id}>
                    <button
                      onClick={() => navigate('approvals', a.id)}
                      className="w-full px-5 py-3.5 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        a.actionType?.includes('refund') ? 'bg-red-50 dark:bg-red-900/20' :
                        a.actionType?.includes('cancel') ? 'bg-orange-50 dark:bg-orange-900/20' :
                        'bg-blue-50 dark:bg-blue-900/20'
                      }`}>
                        <span className={`material-symbols-outlined text-[16px] ${
                          a.actionType?.includes('refund') ? 'text-red-500' :
                          a.actionType?.includes('cancel') ? 'text-orange-500' :
                          'text-blue-500'
                        }`}>
                          {a.actionType?.includes('refund') ? 'currency_exchange' :
                           a.actionType?.includes('cancel') ? 'cancel' :
                           a.actionType?.includes('publish') ? 'publish' : 'pending_actions'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-200 truncate font-medium">
                          {titleCase(a.actionType) || 'Approval needed'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {a.requestedBy || 'System'} · {formatRelative(a.createdAt)}
                        </p>
                      </div>
                      <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-lg mt-0.5 flex-shrink-0">chevron_right</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={action.action}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-200 dark:hover:border-indigo-700 border border-transparent transition-all group"
              >
                <span className="material-symbols-outlined text-2xl text-gray-500 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {action.icon}
                </span>
                <div className="text-center">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 leading-tight">{action.label}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{action.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
