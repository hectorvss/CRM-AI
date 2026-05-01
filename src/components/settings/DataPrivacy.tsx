import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { workspacesApi } from '../../api/client';
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
    try {
      return JSON.parse(settings);
    } catch {
      return {};
    }
  }
  return settings;
}

export default function DataPrivacyTab({ onSaveReady }: Props) {
  const { data: workspace, loading, error } = useApi(workspacesApi.currentContext);
  const workspaceRecord = workspace || fallbackWorkspace;
  const workspaceSettings = useMemo(() => parseSettings(workspaceRecord?.settings), [workspaceRecord]);
  const [exportApprovals, setExportApprovals] = useState('Security Team only');
  const [deletionApprovals, setDeletionApprovals] = useState('Security Team only');
  const [maskSensitiveLogs, setMaskSensitiveLogs] = useState(true);
  const [redactCreditCards, setRedactCreditCards] = useState(true);
  const [voicePiiRedaction, setVoicePiiRedaction] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const redactionEnforced = maskSensitiveLogs || redactCreditCards || voicePiiRedaction;
  const approvalPolicyConfigured = Boolean(exportApprovals || deletionApprovals);

  useEffect(() => {
    setExportApprovals(workspaceSettings.privacy?.exportApprovals || 'Security Team only');
    setDeletionApprovals(workspaceSettings.privacy?.deletionApprovals || 'Security Team only');
    setMaskSensitiveLogs(workspaceSettings.privacy?.maskSensitiveLogs ?? true);
    setRedactCreditCards(workspaceSettings.privacy?.redactCreditCards ?? true);
    setVoicePiiRedaction(workspaceSettings.privacy?.voicePiiRedaction ?? false);
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
        privacy: {
          exportApprovals,
          deletionApprovals,
          maskSensitiveLogs,
          redactCreditCards,
          voicePiiRedaction,
        },
      };
      await workspacesApi.update(workspace.id, { settings: nextSettings });
      setStatusMessage('Privacy controls saved.');
    } catch (error: any) {
      setStatusMessage(error?.message || 'Unable to save privacy controls.');
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [deletionApprovals, exportApprovals, maskSensitiveLogs, redactCreditCards, voicePiiRedaction, workspace?.id, workspaceSettings]);

  useEffect(() => {
    onSaveReady?.(handleSave);
    return () => onSaveReady?.(null);
  }, [handleSave, onSaveReady]);

  if (loading) return <LoadingState title="Loading privacy settings" message="Fetching workspace privacy rules." compact />;

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/30 dark:bg-amber-900/15 dark:text-amber-300">
          Workspace context is still settling. Showing safe local defaults until Supabase responds.
        </div>
      )}
      {statusMessage && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}

      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-gray-400">gavel</span>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Data Request Workflows</h2>
              <p className="text-xs text-gray-500">Define approval paths for exports and permanent deletions.</p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-50 text-gray-700 border border-gray-100 uppercase">{approvalPolicyConfigured ? 'Approvals enforced' : 'Needs setup'}</span>
        </div>
        <div className="p-6 grid grid-cols-2 gap-8">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Data Export Approvals</label>
            <select value={exportApprovals} onChange={event => setExportApprovals(event.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
              <option>Security Team only</option>
              <option>Any Admin</option>
              <option>Two-factor required</option>
            </select>
            <p className="text-[10px] text-gray-400 mt-2">Who must approve a full customer data dump request.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Account Deletion Approvals</label>
            <select value={deletionApprovals} onChange={event => setDeletionApprovals(event.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
              <option>Security Team only</option>
              <option>Any Admin</option>
              <option>Two-factor required</option>
            </select>
            <p className="text-[10px] text-gray-400 mt-2">Required authorization for right-to-be-forgotten requests.</p>
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
          <span className="material-symbols-outlined text-gray-400">visibility_off</span>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">PII & Redaction</h2>
            <p className="text-xs text-gray-500">Control how we mask sensitive data in logs and agent views.</p>
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {[
            {
              title: 'Auto-mask sensitive fields in logs',
              description: 'Automatically detects and hashes emails, phone numbers, and IP addresses in audit logs before storage.',
              value: maskSensitiveLogs,
              setValue: setMaskSensitiveLogs,
            },
            {
              title: 'Redact credit card numbers in chat',
              description: 'Replaces 16-digit sequences with masked values in agent views.',
              value: redactCreditCards,
              setValue: setRedactCreditCards,
            },
            {
              title: 'Voice PII redaction',
              description: 'Scrub audio recordings for sensitive data before archival.',
              value: voicePiiRedaction,
              setValue: setVoicePiiRedaction,
              muted: true,
            },
          ].map(item => (
            <div key={item.title} className={`p-6 flex items-center justify-between group hover:bg-gray-50/50 transition-colors ${item.muted ? 'opacity-70' : ''}`}>
              <div className="flex-1 pr-8">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">{item.title}</h3>
                <p className="text-xs text-gray-500">{item.description}</p>
              </div>
              <button
                type="button"
                onClick={() => item.setValue(current => !current)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${item.value ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.value ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 p-6 flex gap-4 items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 mb-1">{redactionEnforced ? 'Privacy enforcement active' : 'Privacy enforcement disabled'}</h3>
          <p className="text-[10px] text-indigo-800/70 dark:text-indigo-300/70 leading-relaxed">
            Audit writes are redacted by backend policy, and export/delete requests create security approvals.
          </p>
        </div>
        <button type="button" onClick={() => void handleSave().catch(() => undefined)} disabled={isSaving} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold">
          Save preferences
        </button>
      </div>
    </div>
  );
}
