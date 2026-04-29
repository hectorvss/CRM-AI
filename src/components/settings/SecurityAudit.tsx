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
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-3 text-sm text-gray-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-300">
          Workspace context is still settling. Showing safe local defaults until Supabase responds.
        </div>
      )}
      {statusMessage && <div className="rounded-2xl border border-black/5 bg-black/[0.02] px-4 py-3 text-sm text-gray-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-300">{statusMessage}</div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-[24px] border border-black/5 bg-white p-6 dark:border-white/10 dark:bg-[#1b1b1b]">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.03] text-gray-700 dark:bg-white/[0.05] dark:text-gray-300">
                <span className="material-symbols-outlined">key</span>
              </div>
              <h2 className="text-sm font-semibold text-gray-950 dark:text-white uppercase tracking-wider">Access Control</h2>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${ssoEnabled ? 'border-black/10 bg-black/[0.03] text-gray-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300' : 'border-black/10 bg-black/[0.02] text-gray-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-400'}`}>{ssoEnabled ? 'Active' : 'Disabled'}</span>
          </div>
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="mb-1 text-sm font-semibold text-gray-950 dark:text-white">SSO Authentication (SAML 2.0)</h3>
                <p className="text-xs text-gray-500">Enforce single sign-on for all team members.</p>
              </div>
              <button type="button" onClick={() => setSsoEnabled(current => !current)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${ssoEnabled ? 'bg-violet-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${ssoEnabled ? 'translate-x-4' : 'translate-x-1'}`}></span>
              </button>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-700 dark:text-gray-300">Session Timeout</label>
              <select value={sessionTimeout} onChange={e => setSessionTimeout(e.target.value)} className="w-full rounded-full border border-black/5 bg-black/[0.015] px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.03]">
                <option>12 hours</option>
                <option>24 hours</option>
                <option>7 days</option>
              </select>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">IP Allowlist</label>
                <button type="button" onClick={() => setIpAllowlist(current => [...current, ''])} className="text-[10px] font-semibold text-gray-700 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">+ Add IP</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {ipAllowlist.map((ip, index) => (
                  <div key={`${ip}-${index}`} className="flex items-center gap-2 rounded-full border border-black/5 bg-black/[0.015] px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.03]">
                    <input value={ip} onChange={e => setIpAllowlist(current => current.map((item, i) => i === index ? e.target.value : item))} className="w-28 bg-transparent text-xs font-medium outline-none" />
                    <button type="button" onClick={() => setIpAllowlist(current => current.filter((_, i) => i !== index))} className="text-gray-400 transition-colors hover:text-gray-950 dark:hover:text-white"><span className="material-symbols-outlined text-[14px]">close</span></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col rounded-[24px] border border-black/5 bg-white p-6 dark:border-white/10 dark:bg-[#1b1b1b]">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.03] text-gray-700 dark:bg-white/[0.05] dark:text-gray-300">
              <span className="material-symbols-outlined">database</span>
            </div>
            <h2 className="text-sm font-semibold text-gray-950 dark:text-white uppercase tracking-wider">Data Retention</h2>
          </div>
          <div className="space-y-6 flex-1">
            <div>
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-950 dark:text-white">Audit Log Retention Period</h3>
                <span className="rounded-full border border-black/10 bg-black/[0.03] px-2.5 py-1 text-xs font-semibold text-gray-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300">{retentionDays} Days</span>
              </div>
              <input type="range" min={30} max={365} step={15} value={retentionDays} onChange={e => setRetentionDays(Number(e.target.value))} className="w-full accent-violet-500" />
            </div>
            <div className="flex gap-3 rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <span className="material-symbols-outlined text-gray-400 text-sm">info</span>
              <p className="text-[11px] leading-relaxed text-gray-500">Logs older than the retention period can be archived by the backend. The policy is saved in workspace settings.</p>
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between border-t border-black/5 pt-6 dark:border-white/10">
            <div>
              <h4 className="text-xs font-semibold text-gray-950 dark:text-white">Export Audit Logs</h4>
              <p className="text-[10px] text-gray-500">Download full activity history as CSV/JSON.</p>
            </div>
            <button type="button" onClick={() => void handleSave().catch(() => undefined)} disabled={isSaving} className="flex items-center gap-2 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
              <span className="material-symbols-outlined text-sm">download</span>
              Save
            </button>
          </div>
        </section>
      </div>

      {/* ─── ACCESS POLICIES (Manager-only) ─────────────────────── */}
      <section className="overflow-hidden rounded-[24px] border border-black/5 bg-white dark:border-white/10 dark:bg-[#1b1b1b]">
        <div className="flex items-center justify-between gap-4 border-b border-black/5 px-6 py-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.03] text-gray-700 dark:bg-white/[0.05] dark:text-gray-300">
              <span className="material-symbols-outlined">policy</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-950 dark:text-white uppercase tracking-wider">Access Policies</h2>
              <p className="mt-0.5 text-xs text-gray-500">Workspace-level rules enforced on member invitations and authentication.</p>
            </div>
          </div>
          {!canEditPolicies && (
            <span className="rounded-full border border-black/10 bg-black/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase text-gray-500">Owner / Admin only</span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-2">
          {/* Require 2FA */}
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex-1">
              <h3 className="mb-1 text-sm font-semibold text-gray-950 dark:text-white">Require Two-Factor Authentication</h3>
              <p className="text-xs text-gray-500">All members must have 2FA enabled to access this workspace.</p>
            </div>
            <button
              type="button"
              disabled={!canEditPolicies}
              onClick={() => setRequire2fa(c => !c)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${require2fa ? 'bg-violet-500' : 'bg-gray-300 dark:bg-gray-700'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${require2fa ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Default invite role */}
          <div className="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <h3 className="mb-1 text-sm font-semibold text-gray-950 dark:text-white">Default Role for New Invites</h3>
            <p className="text-xs text-gray-500 mb-3">Pre-selected role when inviting a new member.</p>
            <select
              value={defaultInviteRoleId}
              disabled={!canEditPolicies}
              onChange={e => setDefaultInviteRoleId(e.target.value)}
              className="w-full rounded-full border border-black/5 bg-black/[0.015] px-4 py-2.5 text-sm outline-none disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <option value="">No default — manager picks each time</option>
              {rolesList.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {/* Allowed email domains */}
          <div className="col-span-1 rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03] xl:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-950 dark:text-white">Allowed Email Domains</h3>
                <p className="text-xs text-gray-500">Only emails from these domains can be invited. Leave empty to allow any domain.</p>
              </div>
              <button
                type="button"
                disabled={!canEditPolicies}
                onClick={() => setAllowedDomains(c => [...c, ''])}
                className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/5"
              >
                + Add Domain
              </button>
            </div>
            {allowedDomains.length === 0 ? (
              <p className="text-xs text-gray-400 italic mt-3">No restrictions — invitations to any domain are allowed.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-3">
                {allowedDomains.map((domain, index) => (
                  <div key={index} className="flex items-center gap-2 rounded-full border border-black/5 bg-white px-3 py-1.5 dark:border-white/10 dark:bg-[#171717]">
                    <span className="text-gray-400 text-xs">@</span>
                    <input
                      value={domain}
                      disabled={!canEditPolicies}
                      onChange={e => setAllowedDomains(current => current.map((item, i) => i === index ? e.target.value : item))}
                      placeholder="company.com"
                      className="w-32 bg-transparent text-xs font-medium outline-none disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={!canEditPolicies}
                      onClick={() => setAllowedDomains(current => current.filter((_, i) => i !== index))}
                      className="text-gray-400 transition-colors hover:text-gray-950 disabled:opacity-50 dark:hover:text-white"
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

      <section className="overflow-hidden rounded-[24px] border border-black/5 bg-white dark:border-white/10 dark:bg-[#1b1b1b]">
        <div className="flex items-center justify-between gap-4 border-b border-black/5 px-6 py-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-gray-400">history</span>
            <h2 className="text-sm font-semibold text-gray-950 dark:text-white uppercase tracking-wider">Audit Log</h2>
          </div>
          <div className="flex gap-3 items-center">
            <input type="text" placeholder="Search events, users, or IPs..." className="w-64 rounded-full border border-black/5 bg-black/[0.015] px-4 py-2 text-xs outline-none dark:border-white/10 dark:bg-white/[0.03]" />
            <button type="button" className="flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/5">
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
