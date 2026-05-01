import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi, workspacesApi } from '../../api/client';
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

export default function PersonalTab({ onSaveReady }: Props) {
  const { data: user, loading: userLoading } = useApi<any>(iamApi.me);
  const { data: workspace, loading: workspaceLoading } = useApi<any>(workspacesApi.currentContext);
  const workspaceRecord = workspace || fallbackWorkspace;
  const workspaceSettings = useMemo(() => parseSettings(workspaceRecord?.settings), [workspaceRecord]);
  const userPreferences = useMemo(() => {
    if (!user?.preferences) return {};
    if (typeof user.preferences === 'string') {
      try {
        return JSON.parse(user.preferences);
      } catch {
        return {};
      }
    }
    return user.preferences;
  }, [user]);
  const [fullName, setFullName] = useState('Hector Smith');
  const [emailAddress, setEmailAddress] = useState('hector.smith@enterprise.co');
  const [timezone, setTimezone] = useState('(GMT-08:00) Pacific Time (US & Canada)');
  const [theme, setTheme] = useState('system');
  const [allowDrafting, setAllowDrafting] = useState(true);
  const [autoSummarize, setAutoSummarize] = useState(true);
  const [showCitations, setShowCitations] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFullName(user?.name || 'Hector Smith');
    setEmailAddress(user?.email || 'hector.smith@enterprise.co');
    setTimezone(userPreferences.profile?.timezone || workspaceSettings.personal?.timezone || '(GMT-08:00) Pacific Time (US & Canada)');
    setTheme(userPreferences.profile?.theme || workspaceSettings.personal?.theme || 'system');
    setAllowDrafting(userPreferences.profile?.allowDrafting ?? workspaceSettings.personal?.allowDrafting ?? true);
    setAutoSummarize(userPreferences.profile?.autoSummarize ?? workspaceSettings.personal?.autoSummarize ?? true);
    setShowCitations(userPreferences.profile?.showCitations ?? workspaceSettings.personal?.showCitations ?? true);
  }, [user, userPreferences, workspaceSettings]);

  const handleSave = useCallback(async () => {
    if (!user?.id) {
      setStatusMessage('Profile is still loading. Please try again in a moment.');
      return;
    }
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await iamApi.updateMe({
        name: fullName,
        preferences: {
          ...userPreferences,
          profile: {
            ...(userPreferences.profile || {}),
            timezone,
            theme,
            allowDrafting,
            autoSummarize,
            showCitations,
          },
        },
      });
      setStatusMessage('Personal preferences saved.');
    } catch (error: any) {
      setStatusMessage(error?.message || 'Unable to save personal preferences.');
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [allowDrafting, autoSummarize, fullName, showCitations, theme, timezone, user?.id, userPreferences]);

  useEffect(() => {
    onSaveReady?.(handleSave);
    return () => onSaveReady?.(null);
  }, [handleSave, onSaveReady]);

  if (userLoading || workspaceLoading) {
    return <LoadingState title="Loading personal settings" message="Fetching your profile and workspace preferences." compact />;
  }

  return (
    <div className="space-y-8">
      {statusMessage && <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">{statusMessage}</div>}

      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Profile</h2>
          <p className="text-xs text-gray-500">Update your photo and personal details.</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Full Name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Email Address</label>
              <input type="email" value={emailAddress} readOnly className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Personal Timezone</label>
            <select value={timezone} onChange={e => setTimezone(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
              <option>(GMT-08:00) Pacific Time (US & Canada)</option>
              <option>(GMT+00:00) UTC</option>
              <option>(GMT+01:00) Europe/Madrid</option>
            </select>
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Interface Preferences</h2>
          <p className="text-xs text-gray-500">Customize your visual experience and shortcuts.</p>
        </div>
        <div className="p-6">
          <div className="mb-8">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-4">Theme</label>
            <div className="grid grid-cols-3 gap-4">
              {[
                { id: 'light', label: 'Light', icon: 'light_mode' },
                { id: 'dark', label: 'Dark', icon: 'dark_mode' },
                { id: 'system', label: 'System', icon: 'desktop_windows' },
              ].map(option => (
                <button key={option.id} type="button" onClick={() => setTheme(option.id)} className={`flex flex-col gap-3 p-4 rounded-xl border-2 transition-all text-left ${theme === option.id ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/10' : 'border-gray-100 dark:border-gray-800 hover:border-gray-200'}`}>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">{option.icon}</span>
                    <span className="text-xs font-bold">{option.label}</span>
                  </div>
                  <div className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden flex flex-col p-2 gap-1">
                    <div className="w-2/3 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
                    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full opacity-50"></div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6">
            {[
              { label: 'Global Search', keys: ['Ctrl', 'K'] },
              { label: 'Quick Reply', keys: ['R'] },
              { label: 'Next Ticket', keys: ['J'] },
              { label: 'Previous Ticket', keys: ['K'] },
            ].map(shortcut => (
              <div key={shortcut.label} className="flex justify-between items-center">
                <span className="text-xs text-gray-500">{shortcut.label}</span>
                <div className="flex gap-1.5">
                  {shortcut.keys.map(key => <span key={key} className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-card text-[10px] font-bold text-gray-400">{key}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card p-6">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">My Notifications</h2>
          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase">Personal Override</span>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          {[
            ['Allow AI drafting by default', allowDrafting, setAllowDrafting],
            ['Auto-summarize cases', autoSummarize, setAutoSummarize],
            ['Show citations', showCitations, setShowCitations],
          ].map(([label, value, setter]) => (
            <label key={String(label)} className="flex items-start gap-3 cursor-pointer bg-gray-50 dark:bg-gray-800/30 rounded-xl p-4 border border-gray-100 dark:border-gray-700/50">
              <input type="checkbox" checked={Boolean(value)} onChange={() => (setter as React.Dispatch<React.SetStateAction<boolean>>)((current) => !current)} className="mt-1 w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
              <div>
                <span className="block text-sm font-medium text-gray-900 dark:text-white">{label as string}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">Saved in your personal preferences.</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{isSaving ? 'Saving personal preferences...' : 'Personal preferences are stored on your profile and use workspace values only as fallback.'}</span>
        <button type="button" onClick={() => void handleSave().catch(() => undefined)} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold">Save preferences</button>
      </div>
    </div>
  );
}
