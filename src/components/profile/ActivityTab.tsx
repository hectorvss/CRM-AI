import React, { useMemo } from 'react';
import { useApi } from '../../api/hooks';
import { auditApi, iamApi, operationsApi } from '../../api/client';
import LoadingState from '../LoadingState';
import { NavigateInput } from '../../types';

type Props = {
  onNavigate?: (target: NavigateInput) => void;
};

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function isWithinLastDays(value: string | null | undefined, days: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= days * 24 * 60 * 60 * 1000;
}

export default function ActivityTab({ onNavigate }: Props) {
  const { data: auditLog, loading } = useApi(() => auditApi.workspaceAll().catch(() => []), [], []);
  const { data: agentRuns } = useApi(() => operationsApi.agentRuns().catch(() => []), [], []);
  const { data: user } = useApi(() => iamApi.me().catch(() => null), [], null);

  const recentEvents = useMemo(() => {
    const auditRows = Array.isArray(auditLog) ? auditLog.slice(0, 6).map((row: any) => ({
      action: row.action || row.event_type || row.change_type || 'Audit event',
      resource: row.entity_type && row.entity_id ? `${row.entity_type} #${row.entity_id}` : row.resource || 'Workspace',
      time: formatDate(row.created_at || row.occurred_at || row.updated_at),
      tone: row.severity === 'error' ? 'red' : row.severity === 'warning' ? 'orange' : 'green',
    })) : [];

    const runRows = Array.isArray(agentRuns) ? agentRuns.slice(0, 4).map((run: any) => ({
      action: run.status === 'failed' ? 'Agent run failed' : 'Agent run completed',
      resource: run.agent_name || run.agent_id || 'Agent',
      time: formatDate(run.started_at || run.created_at || run.finished_at),
      tone: run.status === 'failed' ? 'red' : 'blue',
    })) : [];

    return [...auditRows, ...runRows];
  }, [agentRuns, auditLog]);

  const summaryRows = useMemo(() => {
    const auditRows = Array.isArray(auditLog) ? auditLog : [];
    const runRows = Array.isArray(agentRuns) ? agentRuns : [];
    const audit30d = auditRows.filter((row: any) => isWithinLastDays(row.created_at || row.occurred_at || row.updated_at, 30));
    const agent30d = runRows.filter((run: any) => isWithinLastDays(run.started_at || run.created_at || run.finished_at, 30));

    return [
      ['Audit events', String(audit30d.length)],
      ['Agent runs', String(agent30d.length)],
      ['Sensitive actions', String(audit30d.filter((row: any) => ['high', 'critical'].includes(String(row.risk_level || row.risk))).length)],
      ['Approvals touched', String(audit30d.filter((row: any) => String(row.entity_type).toLowerCase() === 'approval').length)],
      ['Cases touched', String(audit30d.filter((row: any) => String(row.entity_type).toLowerCase() === 'case').length)],
    ];
  }, [agentRuns, auditLog]);

  const accountLog = useMemo(() => {
    const userId = user?.id;
    const userEmail = user?.email;
    const rows = (Array.isArray(auditLog) ? auditLog : []).filter((row: any) => {
      const actorId = row.actor_id || row.user_id || row.created_by;
      const actorEmail = row.actor_email || row.email;
      return (userId && actorId === userId) || (userEmail && actorEmail === userEmail);
    });

    const normalized = rows.slice(0, 6).map((row: any) => ({
      title: row.action || row.event_type || 'Account activity',
      time: formatDate(row.created_at || row.occurred_at || row.updated_at),
      icon: row.actor_type === 'agent' ? 'smart_toy' : row.action?.toLowerCase().includes('login') ? 'login' : 'history',
    }));

    if (normalized.length > 0) {
      return normalized;
    }

    return [
      {
        title: 'Signed in',
        time: 'Current authenticated session',
        icon: 'login',
      },
    ];
  }, [auditLog, user?.email, user?.id]);

  if (loading) return <LoadingState title="Loading recent activity" message="Pulling the latest audit and agent run history." compact />;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-8">
        <div className="col-span-2 space-y-8">
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Operational Activity</h2>
              <span className="material-symbols-outlined text-gray-400">list_alt</span>
            </div>
            <div className="p-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Action</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Resource</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.length === 0 && (
                    <tr>
                      <td className="px-6 py-10 text-sm text-gray-500" colSpan={3}>No recent workspace activity yet.</td>
                    </tr>
                  )}
                  {recentEvents.map((event, index) => (
                    <tr key={`${event.action}-${index}`} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${event.tone === 'red' ? 'bg-red-500' : event.tone === 'orange' ? 'bg-orange-500' : event.tone === 'blue' ? 'bg-blue-500' : 'bg-green-500'}`} />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{event.action}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-sm text-gray-600 dark:text-gray-300">{event.resource}</span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{event.time}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 text-center">
              <button
                type="button"
                onClick={() => onNavigate?.({ page: 'settings', entityType: 'setting', section: 'security_audit', sourceContext: 'profile_activity' })}
                className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                View full audit log
              </button>
            </div>
          </section>
        </div>

        <div className="col-span-1 space-y-8">
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Activity Summary (30d)</h2>
              <span className="material-symbols-outlined text-gray-400">bar_chart</span>
            </div>
            <div className="p-6 space-y-4">
              {summaryRows.map(([label, value]) => (
                <div key={String(label)} className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-gray-800/50">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Account Log</h2>
              <span className="material-symbols-outlined text-gray-400">manage_accounts</span>
            </div>
            <div className="p-0">
              {accountLog.map((entry, index) => (
                <div key={`${entry.title}-${index}`} className={`p-4 flex gap-3 ${index < accountLog.length - 1 ? 'border-b border-gray-50 dark:border-gray-800/50' : ''}`}>
                  <span className="material-symbols-outlined text-gray-400 text-[18px] mt-0.5">{entry.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{entry.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{entry.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
