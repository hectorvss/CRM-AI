import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { workspacesApi, iamApi } from '../../api/client';
import { usePermissions } from '../../contexts/PermissionsContext';
import LoadingState from '../LoadingState';

type SaveHandler = (() => Promise<void> | void) | null;
type Props = { onSaveReady?: (handler: SaveHandler) => void };

const fallbackWorkspace = {
  id: 'ws_default',
  name: 'CRM AI Workspace',
  slug: 'crm-ai',
  settings: {},
};

function parseSettings(settings: any) {
  if (!settings) return {};
  if (typeof settings === 'string') {
    try { return JSON.parse(settings); } catch { return {}; }
  }
  return settings;
}

export default function SecurityAuditTab({ onSaveReady }: Props) {
  const { isOwner, isSuperAdmin } = usePermissions();
  const { data: workspace, loading, error } = useApi<any>(workspacesApi.currentContext);
  const { data: roles } = useApi<any[]>(iamApi.roles);
  const workspaceRecord = workspace || fallbackWorkspace;
  const workspaceSettings = useMemo(() => parseSettings(workspaceRecord?.settings), [workspaceRecord]);
  const [ssoEnabled, setSsoEnabled] = useState(true);
  const [require2fa, setRequire2fa] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState('12 hours');
  const [ipAllowlist, setIpAllowlist] = useState<string[]>([]);
  const [retentionDays, setRetentionDays] = useState(90);
  // Access policies (Sprint 6)
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [defaultInviteRoleId, setDefaultInviteRoleId] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const canEditPolicies = isOwner || isSuperAdmin;
  const rolesList = roles || [];

  useEffect(() => {
    setSsoEnabled(workspaceSettings.security?.ssoEnabled ?? true);
    setRequire2fa(workspaceSettings.security?.require2fa ?? false);
    setSessionTimeout(workspaceSettings.security?.sessionTimeout ?? '12 hours');
    setIpAllowlist(Array.isArray(workspaceSettings.security?.ipAllowlist) ? workspaceSettings.security.ipAllowlist : ['192.168.1.0/24', '10.0.0.55']);
    setRetentionDays(workspaceSettings.security?.retentionDays ?? 90);
    setAllowedDomains(Array.isArray(workspaceSettings.access?.allowedDomains) ? workspaceSettings.access.allowedDomains : []);
    setDefaultInviteRoleId(workspaceSettings.access?.defaultInviteRoleId || '');
  }, [workspaceSettings]);

  const handleSave = useCallback(async () => {
    if (!workspace?.id) {
      setStatusMessage('Workspace is still loading. Please try again in a moment.');
      return;
    }
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const nextSettings = {
        ...workspaceSettings,
        security: {
          ssoEnabled,
          require2fa,
          sessionTimeout,
          ipAllowlist,
          retentionDays,
        },
        access: {
          allowedDomains: allowedDomains.filter(d => d.trim()),
          defaultInviteRoleId: defaultInviteRoleId || null,
        },
      };
      await workspacesApi.update(workspace.id, { settings: nextSettings });
      setStatusMessage('Security & access policies saved.');
    } catch (error: any) {
      setStatusMessage(error?.message || 'Unable to save security settings.');
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [allowedDomains, defaultInviteRoleId, ipAllowlist, require2fa, retentionDays, sessionTimeout, ssoEnabled, workspace?.id, workspaceSettings]);

  useEffect(() => {
    onSaveReady?.(handleSave);
    return () => onSaveReady?.(null);
  }, [handleSave, onSaveReady]);

  if (loading) return <LoadingState title="Loading security settings" message="Fetching access control and retention policy." compact />;

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-900/15 dark:text-amber-300">
          Workspace context is still settling. Showing safe local defaults until Supabase responds.
        </div>
      )}
      {statusMessage && <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">{statusMessage}</div>}

      <div className="grid grid-cols-2 gap-6">
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400">
                <span className="material-symbols-outlined">key</span>
              </div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Access Control</h2>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${ssoEnabled ? 'bg-green-50 text-green-700 border-green-100' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>{ssoEnabled ? 'Active' : 'Disabled'}</span>
          </div>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">SSO Authentication (SAML 2.0)</h3>
                <p className="text-xs text-gray-500">Enforce single sign-on for all team members.</p>
              </div>
              <button type="button" onClick={() => setSsoEnabled(current => !current)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${ssoEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${ssoEnabled ? 'translate-x-4' : 'translate-x-1'}`}></span>
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Session Timeout</label>
              <select value={sessionTimeout} onChange={e => setSessionTimeout(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm outline-none">
                <option>12 hours</option>
                <option>24 hours</option>
                <option>7 days</option>
              </select>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">IP Allowlist</label>
                <button type="button" onClick={() => setIpAllowlist(current => [...current, ''])} className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">+ Add IP</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {ipAllowlist.map((ip, index) => (
                  <div key={`${ip}-${index}`} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2.5 py-1 rounded-lg">
                    <input value={ip} onChange={e => setIpAllowlist(current => current.map((item, i) => i === index ? e.target.value : item))} className="bg-transparent text-xs font-medium outline-none w-28" />
                    <button type="button" onClick={() => setIpAllowlist(current => current.filter((_, i) => i !== index))} className="text-gray-400 hover:text-red-500 transition-colors"><span className="material-symbols-outlined text-[14px]">close</span></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400">
              <span className="material-symbols-outlined">database</span>
            </div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Data Retention</h2>
          </div>
          <div className="space-y-6 flex-1">
            <div>
              <div className="flex justify-between items-baseline mb-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Audit Log Retention Period</h3>
                <span className="text-xs font-bold bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">{retentionDays} Days</span>
              </div>
              <input type="range" min={30} max={365} step={15} value={retentionDays} onChange={e => setRetentionDays(Number(e.target.value))} className="w-full" />
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-100 dark:border-gray-700/50 flex gap-3">
              <span className="material-symbols-outlined text-gray-400 text-sm">info</span>
              <p className="text-[11px] text-gray-500 leading-relaxed">Logs older than the retention period can be archived by the backend. The policy is saved in workspace settings.</p>
            </div>
          </div>
          <div className="pt-6 mt-auto border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Export Audit Logs</h4>
              <p className="text-[10px] text-gray-500">Download full activity history as CSV/JSON.</p>
            </div>
            <button type="button" onClick={() => void handleSave().catch(() => undefined)} disabled={isSaving} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all shadow-card">
              <span className="material-symbols-outlined text-sm">download</span>
              Save
            </button>
          </div>
        </section>
      </div>

      {/* ─── ACCESS POLICIES (Manager-only) ─────────────────────── */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <span className="material-symbols-outlined">policy</span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Access Policies</h2>
              <p className="text-xs text-gray-500 mt-0.5">Workspace-level rules enforced on member invitations and authentication.</p>
            </div>
          </div>
          {!canEditPolicies && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-gray-100 text-gray-500 border-gray-200 uppercase">Owner / Admin only</span>
          )}
        </div>
        <div className="p-6 grid grid-cols-2 gap-6">
          {/* Require 2FA */}
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/20">
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Require Two-Factor Authentication</h3>
              <p className="text-xs text-gray-500">All members must have 2FA enabled to access this workspace.</p>
            </div>
            <button
              type="button"
              disabled={!canEditPolicies}
              onClick={() => setRequire2fa(c => !c)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${require2fa ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${require2fa ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Default invite role */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/20">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Default Role for New Invites</h3>
            <p className="text-xs text-gray-500 mb-3">Pre-selected role when inviting a new member.</p>
            <select
              value={defaultInviteRoleId}
              disabled={!canEditPolicies}
              onChange={e => setDefaultInviteRoleId(e.target.value)}
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm outline-none disabled:opacity-50"
            >
              <option value="">No default — manager picks each time</option>
              {rolesList.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {/* Allowed email domains */}
          <div className="col-span-2 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/20">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Allowed Email Domains</h3>
                <p className="text-xs text-gray-500">Only emails from these domains can be invited. Leave empty to allow any domain.</p>
              </div>
              <button
                type="button"
                disabled={!canEditPolicies}
                onClick={() => setAllowedDomains(c => [...c, ''])}
                className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold shadow-card hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                + Add Domain
              </button>
            </div>
            {allowedDomains.length === 0 ? (
              <p className="text-xs text-gray-400 italic mt-3">No restrictions — invitations to any domain are allowed.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-3">
                {allowedDomains.map((domain, index) => (
                  <div key={index} className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-lg">
                    <span className="text-gray-400 text-xs">@</span>
                    <input
                      value={domain}
                      disabled={!canEditPolicies}
                      onChange={e => setAllowedDomains(current => current.map((item, i) => i === index ? e.target.value : item))}
                      placeholder="company.com"
                      className="bg-transparent text-xs font-medium outline-none w-32 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={!canEditPolicies}
                      onClick={() => setAllowedDomains(current => current.filter((_, i) => i !== index))}
                      className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-gray-400">history</span>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Audit Log</h2>
          </div>
          <div className="flex gap-3 items-center">
            <input type="text" placeholder="Search events, users, or IPs..." className="pl-4 pr-4 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs outline-none w-64" />
            <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold shadow-card">
              <span className="material-symbols-outlined text-sm">filter_list</span>
              Filter
            </button>
          </div>
        </div>
        <div className="p-6 text-sm text-gray-500">Security events will continue to surface here once the audit feed is wired.</div>
      </section>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{isSaving ? 'Saving security settings...' : 'Security policy is stored with workspace settings.'}</span>
        <button type="button" onClick={() => void handleSave().catch(() => undefined)} className="hidden" aria-hidden="true">Save</button>
      </div>
    </div>
  );
}
