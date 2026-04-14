import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi } from '../../api/client';

type SaveHandler = (() => Promise<void> | void) | null;
type Props = { onSaveReady?: (handler: SaveHandler) => void };

function parsePreferences(preferences: any) {
  if (!preferences) return {};
  if (typeof preferences === 'string') {
    try {
      return JSON.parse(preferences);
    } catch {
      return {};
    }
  }
  return preferences;
}

export default function PreferencesTab({ onSaveReady }: Props) {
  const { data: user, loading, error } = useApi<any>(iamApi.me);
  const preferences = useMemo(() => parsePreferences(user?.preferences), [user]);
  const [language, setLanguage] = useState('English (US)');
  const [timezone, setTimezone] = useState('(GMT-05:00) Eastern Time');
  const [dateFormat, setDateFormat] = useState('MMM DD, YYYY');
  const [timeFormat, setTimeFormat] = useState('12-hour (AM/PM)');
  const [startOfWeek, setStartOfWeek] = useState('Monday');
  const [displayDensity, setDisplayDensity] = useState('Comfortable');
  const [theme, setTheme] = useState('system');
  const [defaultLandingPage, setDefaultLandingPage] = useState('Case Graph (Home)');
  const [defaultInboxView, setDefaultInboxView] = useState('Assigned to Me');
  const [quietStart, setQuietStart] = useState('10:00 PM');
  const [quietEnd, setQuietEnd] = useState('07:00 AM');
  const [allowDrafting, setAllowDrafting] = useState(true);
  const [autoSummarize, setAutoSummarize] = useState(true);
  const [showCitations, setShowCitations] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLanguage(preferences.profile?.language || 'English (US)');
    setTimezone(preferences.profile?.timezone || '(GMT-05:00) Eastern Time');
    setDateFormat(preferences.profile?.dateFormat || 'MMM DD, YYYY');
    setTimeFormat(preferences.profile?.timeFormat || '12-hour (AM/PM)');
    setStartOfWeek(preferences.profile?.startOfWeek || 'Monday');
    setDisplayDensity(preferences.profile?.displayDensity || 'Comfortable');
    setTheme(preferences.profile?.theme || 'system');
    setDefaultLandingPage(preferences.profile?.defaultLandingPage || 'Case Graph (Home)');
    setDefaultInboxView(preferences.profile?.defaultInboxView || 'Assigned to Me');
    setQuietStart(preferences.profile?.quietHours?.start || '10:00 PM');
    setQuietEnd(preferences.profile?.quietHours?.end || '07:00 AM');
    setAllowDrafting(preferences.profile?.allowDrafting ?? true);
    setAutoSummarize(preferences.profile?.autoSummarize ?? true);
    setShowCitations(preferences.profile?.showCitations ?? true);
  }, [preferences]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await iamApi.updateMe({
        preferences: {
          ...preferences,
          profile: {
            language,
            timezone,
            dateFormat,
            timeFormat,
            startOfWeek,
            displayDensity,
            theme,
            defaultLandingPage,
            defaultInboxView,
            quietHours: { start: quietStart, end: quietEnd },
            allowDrafting,
            autoSummarize,
            showCitations,
          },
        },
      });
      setStatusMessage('Interface preferences saved.');
    } catch (saveError: any) {
      setStatusMessage(saveError?.message || 'Unable to save interface preferences.');
      throw saveError;
    } finally {
      setIsSaving(false);
    }
  }, [
    allowDrafting,
    autoSummarize,
    dateFormat,
    defaultInboxView,
    defaultLandingPage,
    displayDensity,
    language,
    preferences,
    quietEnd,
    quietStart,
    showCitations,
    startOfWeek,
    theme,
    timeFormat,
    timezone,
  ]);

  useEffect(() => {
    onSaveReady?.(handleSave);
    return () => onSaveReady?.(null);
  }, [handleSave, onSaveReady]);

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading preferences...</div>;
  if (error || !user) return <div className="p-6 text-sm text-red-500">Error loading preferences.</div>;

  return (
    <div className="space-y-8">
      {statusMessage && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-8">
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Display Preferences</h2>
              <span className="material-symbols-outlined text-gray-400">desktop_windows</span>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Language</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
                    <option>English (US)</option>
                    <option>Spanish</option>
                    <option>French</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Timezone</label>
                  <select value={timezone} onChange={e => setTimezone(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
                    <option>(GMT-05:00) Eastern Time</option>
                    <option>(GMT+00:00) UTC</option>
                    <option>(GMT+01:00) Europe/Madrid</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Date Format</label>
                  <select value={dateFormat} onChange={e => setDateFormat(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
                    <option>MMM DD, YYYY</option>
                    <option>DD/MM/YYYY</option>
                    <option>MM/DD/YYYY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Time Format</label>
                  <select value={timeFormat} onChange={e => setTimeFormat(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
                    <option>12-hour (AM/PM)</option>
                    <option>24-hour</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Start of Week</label>
                  <select value={startOfWeek} onChange={e => setStartOfWeek(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
                    <option>Monday</option>
                    <option>Sunday</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Display Density</label>
                  <select value={displayDensity} onChange={e => setDisplayDensity(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
                    <option>Comfortable</option>
                    <option>Compact</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Theme</label>
                <select value={theme} onChange={e => setTheme(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
                  <option>system</option>
                  <option>light</option>
                  <option>dark</option>
                </select>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-8">
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Working Preferences</h2>
              <span className="material-symbols-outlined text-gray-400">work</span>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Default Landing Page</label>
                <select value={defaultLandingPage} onChange={e => setDefaultLandingPage(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
                  <option>Case Graph (Home)</option>
                  <option>Inbox</option>
                  <option>Approvals</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Default Inbox View</label>
                <select value={defaultInboxView} onChange={e => setDefaultInboxView(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
                  <option>Assigned to Me</option>
                  <option>Unassigned</option>
                  <option>High Risk</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Notification Quiet Hours</label>
                <div className="flex items-center gap-2">
                  <select value={quietStart} onChange={e => setQuietStart(e.target.value)} className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
                    <option>10:00 PM</option>
                    <option>09:00 PM</option>
                  </select>
                  <span className="text-gray-500">to</span>
                  <select value={quietEnd} onChange={e => setQuietEnd(e.target.value)} className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
                    <option>07:00 AM</option>
                    <option>08:00 AM</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Personal AI Preferences</h2>
              <span className="material-symbols-outlined text-gray-400">auto_awesome</span>
            </div>
            <div className="p-6 space-y-4">
              {[
                ['Allow AI drafting by default', 'AI will pre-draft responses when you open a case', allowDrafting, setAllowDrafting],
                ['Auto-summarize cases', 'Show a brief summary at the top of long threads', autoSummarize, setAutoSummarize],
                ['Show citations', 'Display knowledge base links used by AI', showCitations, setShowCitations],
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

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{isSaving ? 'Saving personal preferences...' : 'Personal preferences are stored in your profile record.'}</span>
        <button type="button" onClick={() => void handleSave().catch(() => undefined)} disabled={isSaving} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold">
          Save preferences
        </button>
      </div>
    </div>
  );
}
