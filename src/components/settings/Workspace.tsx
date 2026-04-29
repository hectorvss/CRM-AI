import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi, workspacesApi } from '../../api/client';
import LoadingState from '../LoadingState';

type SaveHandler = (() => Promise<void> | void) | null;

type WorkspaceTabProps = {
  onSaveReady?: (handler: SaveHandler) => void;
};

const fallbackWorkspace = {
  id: 'workspace-local',
  name: 'CRM AI Workspace',
  slug: 'crm-ai',
};

const defaultLanguages = ['English (US)', 'Spanish', 'French', 'German', 'Portuguese'];

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

export default function WorkspaceTab({ onSaveReady }: WorkspaceTabProps) {
  const { data: workspace, loading, error } = useApi<any>(workspacesApi.currentContext);
  const { data: me } = useApi(() => iamApi.me(), [], null as any);
  const [name, setName] = useState(fallbackWorkspace.name);
  const [domain, setDomain] = useState(`${fallbackWorkspace.slug}.helpdesk.com`);
  const [timezone, setTimezone] = useState('(GMT-05:00) Eastern Time');
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(true);
  const [weekdayStart, setWeekdayStart] = useState('09:00 AM');
  const [weekdayEnd, setWeekdayEnd] = useState('06:00 PM');
  const [languages, setLanguages] = useState<string[]>(defaultLanguages);
  const [logoUrl, setLogoUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const workspaceRecord = useMemo(() => (
    workspace
      || me?.workspace
      || me?.membership?.workspace
      || me?.workspaces?.[0]
      || fallbackWorkspace
  ), [me, workspace]);

  const workspaceSettings = useMemo(() => parseSettings(workspaceRecord?.settings), [workspaceRecord]);
  const showFallbackNotice = Boolean(error) || !workspace;

  useEffect(() => {
    if (!workspaceRecord) return;
    setName(workspaceRecord.name || fallbackWorkspace.name);
    setDomain(workspaceSettings.workspace?.primaryDomain || workspaceSettings.primary_domain || `${workspaceRecord.slug || fallbackWorkspace.slug}.helpdesk.com`);
    setTimezone(workspaceSettings.timezone || '(GMT-05:00) Eastern Time');
    setBusinessHoursEnabled(workspaceSettings.businessHoursEnabled ?? true);
    setWeekdayStart(workspaceSettings.businessHours?.weekdayStart || workspaceSettings.businessHoursStart || '09:00 AM');
    setWeekdayEnd(workspaceSettings.businessHours?.weekdayEnd || workspaceSettings.businessHoursEnd || '06:00 PM');
    setLanguages(Array.isArray(workspaceSettings.languages) && workspaceSettings.languages.length > 0 ? workspaceSettings.languages : defaultLanguages);
    setLogoUrl(workspaceSettings.workspace?.logoUrl || workspaceSettings.branding?.logoUrl || '');
  }, [workspaceRecord, workspaceSettings]);

  const handleLogoUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatusMessage('Please choose an image file for the workspace logo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setLogoUrl(typeof reader.result === 'string' ? reader.result : '');
      setStatusMessage(`Workspace logo ready to save: ${file.name}`);
    };
    reader.onerror = () => setStatusMessage('Unable to read the selected workspace logo.');
    reader.readAsDataURL(file);
    event.target.value = '';
  }, []);

  const handleSave = useCallback(async () => {
    if (!workspace?.id) {
      setStatusMessage('Workspace is still loading. Please try again in a moment.');
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    try {
      const normalizedSlug = domain.trim().replace(/\.helpdesk\.com$/i, '').replace(/^https?:\/\//i, '');
      const nextSettings = {
        ...workspaceSettings,
        workspace: {
          ...(workspaceSettings.workspace || {}),
          primaryDomain: domain.trim(),
          logoUrl: logoUrl || null,
        },
        branding: {
          ...(workspaceSettings.branding || {}),
          logoUrl: logoUrl || null,
        },
        timezone,
        businessHoursEnabled,
        businessHours: {
          weekdayStart,
          weekdayEnd,
        },
        languages,
        primary_domain: domain.trim(),
      };

      await workspacesApi.update(workspace.id, {
        name: name.trim(),
        slug: normalizedSlug || workspaceRecord.slug,
        settings: nextSettings,
      });
      setStatusMessage('Workspace changes saved.');
    } catch (saveError: any) {
      setStatusMessage(saveError?.message || 'Unable to save workspace changes.');
      throw saveError;
    } finally {
      setIsSaving(false);
    }
  }, [businessHoursEnabled, domain, languages, logoUrl, name, timezone, weekdayEnd, weekdayStart, workspace?.id, workspaceRecord?.slug, workspaceSettings]);

  useEffect(() => {
    onSaveReady?.(handleSave);
    return () => onSaveReady?.(null);
  }, [handleSave, onSaveReady]);

  if (loading) return <LoadingState title="Loading workspace data" message="Fetching workspace settings and profile data." compact />;

  return (
    <div className="space-y-8">
      {statusMessage && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}

      {/* Workspace Profile */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Workspace Profile</h2>
            {showFallbackNotice && (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/30">
                Showing local defaults
              </span>
            )}
          </div>
          <span className="material-symbols-outlined text-gray-400">domain</span>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              {logoUrl ? (
                <img src={logoUrl} alt="Workspace logo" className="w-20 h-20 rounded-2xl border-2 border-gray-200 dark:border-gray-700 object-cover bg-gray-50 dark:bg-gray-800/50" />
              ) : (
                <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-800/50">
                  <span className="material-symbols-outlined text-gray-400 text-3xl">image</span>
                </div>
              )}
              <button type="button" onClick={() => uploadInputRef.current?.click()} className="absolute -bottom-1 -right-1 w-6 h-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center shadow-card">
                <span className="material-symbols-outlined text-[14px]">edit</span>
              </button>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Workspace Logo</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">This logo will appear on your help center and email notifications.</p>
              <button type="button" onClick={() => uploadInputRef.current?.click()} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Upload new</button>
              <input ref={uploadInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Workspace Name</label>
              <input
                type="text"
                value={name}
                onChange={event => setName(event.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Primary Domain</label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-500 text-sm">https://</span>
                <input
                  type="text"
                  value={domain}
                  onChange={event => setDomain(event.target.value)}
                  className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-r-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Default Timezone</label>
            <select
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none"
              value={timezone}
              onChange={event => setTimezone(event.target.value)}
            >
              <option>(GMT+01:00) Europe/Madrid</option>
              <option>(GMT+00:00) UTC</option>
              <option>(GMT-05:00) Eastern Time</option>
            </select>
            <p className="text-[10px] text-gray-400 mt-2">This timezone will be used for all reporting and business hours calculation.</p>
          </div>
        </div>
      </section>

      {/* Business Hours */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Business Hours</h2>
          <span className="material-symbols-outlined text-gray-400">schedule</span>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-gray-500 dark:text-gray-400">Set your team's availability. Messages received outside these hours will trigger an auto-responder.</p>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Enable Schedule</span>
              <button
                type="button"
                onClick={() => setBusinessHoursEnabled(current => !current)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${businessHoursEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${businessHoursEnabled ? 'translate-x-6' : 'translate-x-1'}`}></span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-indigo-50/30 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl">
              <div className="flex items-center gap-4">
                <div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center text-white">
                  <span className="material-symbols-outlined text-[14px]">check</span>
                </div>
                <div>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">Weekdays</span>
                  <span className="ml-4 text-xs text-gray-500">Mon, Tue, Wed, Thu, Fri</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <select
                  className="flex items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 shadow-card text-xs font-medium"
                  value={weekdayStart}
                  onChange={event => setWeekdayStart(event.target.value)}
                >
                  <option>09:00 AM</option>
                  <option>08:00 AM</option>
                  <option>10:00 AM</option>
                </select>
                <span className="text-gray-400">-</span>
                <select
                  className="flex items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 shadow-card text-xs font-medium"
                  value={weekdayEnd}
                  onChange={event => setWeekdayEnd(event.target.value)}
                >
                  <option>06:00 PM</option>
                  <option>05:00 PM</option>
                  <option>07:00 PM</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700 rounded-xl opacity-60">
              <div className="flex items-center gap-4">
                <div className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600"></div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Saturday</span>
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg">Closed</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700 rounded-xl opacity-60">
              <div className="flex items-center gap-4">
                <div className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600"></div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Sunday</span>
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg">Closed</span>
            </div>
            {showFallbackNotice && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                Workspace data is not available yet, so the form is seeded with safe local defaults.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Supported Languages */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Supported Languages</h2>
          <span className="material-symbols-outlined text-gray-400">translate</span>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap gap-2">
            {languages.map((lang) => (
              <div key={lang} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-xl">
                <span className="text-xs font-medium">{lang}</span>
                <button
                  type="button"
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  onClick={() => setLanguages(current => current.filter(item => item !== lang))}
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            ))}
            <button
              type="button"
              className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 px-3 py-1.5 rounded-xl text-indigo-600 dark:text-indigo-400 hover:border-indigo-500 transition-all"
              onClick={() => setLanguages(current => {
                const nextLanguage = defaultLanguages.find(language => !current.includes(language));
                return nextLanguage ? [...current, nextLanguage] : current;
              })}
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              <span className="text-xs font-bold">Add Language</span>
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{isSaving ? 'Saving workspace changes...' : 'Changes are saved to the workspace record.'}</span>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="hidden"
          aria-hidden="true"
        >
          Save
        </button>
      </div>
    </div>
  );
}
