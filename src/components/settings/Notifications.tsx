import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { workspacesApi } from '../../api/client';
import LoadingState from '../LoadingState';

type SaveHandler = (() => Promise<void> | void) | null;
type Props = { onSaveReady?: (handler: SaveHandler) => void };

function parseSettings(settings: any) {
  if (!settings) return {};
  if (typeof settings === 'string') {
    try { return JSON.parse(settings); } catch { return {}; }
  }
  return settings;
}

export default function NotificationsTab({ onSaveReady }: Props) {
  const { data: workspaces, loading, error } = useApi<any[]>(workspacesApi.list);
  const workspace = workspaces?.[0] || null;
  const workspaceSettings = useMemo(() => parseSettings(workspace?.settings), [workspace]);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [inAppNotifications, setInAppNotifications] = useState(true);
  const [approvalRequests, setApprovalRequests] = useState(true);
  const [caseEscalations, setCaseEscalations] = useState(true);
  const [mentions, setMentions] = useState(true);
  const [workflowFailures, setWorkflowFailures] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [emailDigest, setEmailDigest] = useState('Real-time (Immediate)');
  const [notifyAssignedCases, setNotifyAssignedCases] = useState(true);
  const [notifyApprovals, setNotifyApprovals] = useState(true);
  const [notifyAIFailures, setNotifyAIFailures] = useState(false);
  const [quietStart, setQuietStart] = useState('10:00 PM');
  const [quietEnd, setQuietEnd] = useState('07:00 AM');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setEmailNotifications(workspaceSettings.notifications?.email ?? true);
    setInAppNotifications(workspaceSettings.notifications?.inApp ?? true);
    setApprovalRequests(workspaceSettings.notifications?.approvalRequests ?? true);
    setCaseEscalations(workspaceSettings.notifications?.caseEscalations ?? true);
    setMentions(workspaceSettings.notifications?.mentions ?? true);
    setWorkflowFailures(workspaceSettings.notifications?.workflowFailures ?? false);
    setSecurityAlerts(workspaceSettings.notifications?.securityAlerts ?? true);
    setEmailDigest(workspaceSettings.notifications?.emailDigest ?? 'Real-time (Immediate)');
    setNotifyAssignedCases(workspaceSettings.notifications?.personal?.assignedCases ?? true);
    setNotifyApprovals(workspaceSettings.notifications?.personal?.approvals ?? true);
    setNotifyAIFailures(workspaceSettings.notifications?.personal?.aiFailures ?? false);
    setQuietStart(workspaceSettings.notifications?.quietHours?.start ?? '10:00 PM');
    setQuietEnd(workspaceSettings.notifications?.quietHours?.end ?? '07:00 AM');
  }, [workspaceSettings]);

  const handleSave = useCallback(async () => {
    if (!workspace?.id) throw new Error('Workspace not loaded');
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const nextSettings = {
        ...workspaceSettings,
        notifications: {
          email: emailNotifications,
          inApp: inAppNotifications,
          approvalRequests,
          caseEscalations,
          mentions,
          workflowFailures,
          securityAlerts,
          emailDigest,
          quietHours: { start: quietStart, end: quietEnd },
          personal: {
            assignedCases: notifyAssignedCases,
            approvals: notifyApprovals,
            aiFailures: notifyAIFailures,
          },
        },
      };
      await workspacesApi.update(workspace.id, { settings: nextSettings });
      setStatusMessage('Notification preferences saved.');
    } catch (error: any) {
      setStatusMessage(error?.message || 'Unable to save notification preferences.');
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [approvalRequests, caseEscalations, quietEnd, quietStart, emailDigest, emailNotifications, inAppNotifications, mentions, notifyAIFailures, notifyApprovals, notifyAssignedCases, securityAlerts, workflowFailures, workspace?.id, workspaceSettings]);

  useEffect(() => {
    onSaveReady?.(handleSave);
    return () => onSaveReady?.(null);
  }, [handleSave, onSaveReady]);

  if (loading) return <LoadingState title="Loading notification settings" message="Fetching your workspace notification preferences." compact />;
  if (error) return <div className="p-6 text-sm text-red-500">Error loading notification settings.</div>;

  return (
    <div className="space-y-8">
      {statusMessage && <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">{statusMessage}</div>}

      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Channel Preferences</h2>
          <span className="material-symbols-outlined text-gray-400">notifications</span>
        </div>
        <div className="p-6 space-y-6">
          {[
            ['Email Notifications', 'Receive alerts and digests via email', emailNotifications, setEmailNotifications],
            ['In-App Notifications', 'Show badges and toasts while using the app', inAppNotifications, setInAppNotifications],
          ].map(([label, desc, value, setter]) => (
            <div key={String(label)} className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">{label as string}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{desc as string}</p>
              </div>
              <button type="button" onClick={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)((current) => !current)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`}></span>
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-8">
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Alert Types</h2>
            <span className="material-symbols-outlined text-gray-400">tune</span>
          </div>
          <div className="p-6 space-y-6">
            {[
              ['Approval Requests', approvalRequests, setApprovalRequests],
              ['Case Escalations', caseEscalations, setCaseEscalations],
              ['Mentions (@alex)', mentions, setMentions],
              ['Workflow Failures', workflowFailures, setWorkflowFailures],
              ['Security Alerts', securityAlerts, setSecurityAlerts],
            ].map(([label, value, setter]) => (
              <div key={String(label)} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">{label as string}</span>
                <button type="button" onClick={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)((current) => !current)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`}></span>
                </button>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-8">
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Email Digest</h2>
              <span className="material-symbols-outlined text-gray-400">mail</span>
            </div>
            <div className="p-6">
              <select value={emailDigest} onChange={e => setEmailDigest(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm appearance-none">
                <option>Real-time (Immediate)</option>
                <option>Daily Digest (Morning)</option>
                <option>Important Only</option>
                <option>Off</option>
              </select>
            </div>
          </section>

          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Personal Escalations</h2>
              <span className="material-symbols-outlined text-gray-400">priority_high</span>
            </div>
            <div className="p-6 space-y-4">
              {[
                ['Notify me on assigned cases', 'When a case is directly assigned to you', notifyAssignedCases, setNotifyAssignedCases],
                ['Notify me on my approvals', 'When an approval requires your specific review', notifyApprovals, setNotifyApprovals],
                ['Notify me on AI action failures', 'When an automated AI action fails on your cases', notifyAIFailures, setNotifyAIFailures],
              ].map(([label, desc, value, setter]) => (
                <label key={String(label)} className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={Boolean(value)} onChange={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)((current) => !current)} className="mt-1 w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                  <div>
                    <span className="block text-sm font-medium text-gray-900 dark:text-white">{label as string}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc as string}</span>
                  </div>
                </label>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 p-6 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 mb-1">Workspace Notification Policy</h3>
          <p className="text-xs text-indigo-800/70 dark:text-indigo-300/70">Changes apply to the workspace notification defaults and personal overrides are preserved in settings.</p>
        </div>
        <button type="button" onClick={() => void handleSave().catch(() => undefined)} disabled={isSaving} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold">
          Save preferences
        </button>
      </div>
    </div>
  );
}
