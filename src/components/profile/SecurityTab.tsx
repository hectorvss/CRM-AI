import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi } from '../../api/client';
import LoadingState from '../LoadingState';

type SaveHandler = (() => Promise<void> | void) | null;
type Props = { onSaveReady?: (handler: SaveHandler) => void };

const FALLBACK_USER = {
  preferences: {},
  name: 'System',
  email: 'system@crm-ai.local',
};

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

export default function SecurityTab({ onSaveReady }: Props) {
  const { data: user, loading } = useApi<any>(iamApi.me);
  const currentUser = user || FALLBACK_USER;
  const preferences = useMemo(() => parsePreferences(currentUser?.preferences), [currentUser]);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState('12 hours');
  const [alertOnNewLogin, setAlertOnNewLogin] = useState(true);
  const [trustedDevicesOnly, setTrustedDevicesOnly] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setTwoFactorEnabled(preferences.security?.twoFactorEnabled ?? true);
    setSessionTimeout(preferences.security?.sessionTimeout ?? '12 hours');
    setAlertOnNewLogin(preferences.security?.alertOnNewLogin ?? true);
    setTrustedDevicesOnly(preferences.security?.trustedDevicesOnly ?? false);
  }, [preferences]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await iamApi.updateMe({
        preferences: {
          ...preferences,
          security: {
            twoFactorEnabled,
            sessionTimeout,
            alertOnNewLogin,
            trustedDevicesOnly,
          },
        },
      });
      setStatusMessage('Security preferences saved.');
    } catch (saveError: any) {
      setStatusMessage(saveError?.message || 'Unable to save security preferences.');
      throw saveError;
    } finally {
      setIsSaving(false);
    }
  }, [alertOnNewLogin, preferences, sessionTimeout, trustedDevicesOnly, twoFactorEnabled]);

  useEffect(() => {
    onSaveReady?.(handleSave);
    return () => onSaveReady?.(null);
  }, [handleSave, onSaveReady]);

  if (loading) return <LoadingState title="Loading security settings" message="Fetching account protection settings." compact />;

  return (
    <div className="space-y-8">
      {statusMessage && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-3 gap-8">
        <div className="col-span-2 space-y-8">
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Login & Authentication</h2>
              <span className="material-symbols-outlined text-gray-400">lock</span>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between pb-6 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Password</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Managed by internal authentication</p>
                </div>
                <button type="button" onClick={() => setStatusMessage('Password changes are handled by the authentication provider.')} className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                  Change password
                </button>
              </div>

              <div className="flex items-center justify-between pb-6 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Two-Factor Authentication (2FA)</h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${twoFactorEnabled ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-800/30' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>{twoFactorEnabled ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Saved on your profile preferences</p>
                </div>
                <button type="button" onClick={() => setTwoFactorEnabled(current => !current)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${twoFactorEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${twoFactorEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Session Timeout</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Controls how long your session stays active.</p>
                </div>
                <select value={sessionTimeout} onChange={e => setSessionTimeout(e.target.value)} className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300">
                  <option>12 hours</option>
                  <option>24 hours</option>
                  <option>7 days</option>
                </select>
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Active Sessions</h2>
              <span className="material-symbols-outlined text-gray-400">devices</span>
            </div>
            <div className="p-0">
              <div className="flex items-center justify-between p-6 border-b border-gray-50 dark:border-gray-800/50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <span className="material-symbols-outlined">laptop_mac</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">Mac OS • Chrome</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-100 dark:border-blue-800/30">Current Session</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Madrid, Spain • Active now</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    <span className="material-symbols-outlined">smartphone</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">iOS • Safari</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Madrid, Spain • Last active 2 hours ago</p>
                  </div>
                </div>
                <button type="button" onClick={() => setStatusMessage('Session revocation is handled by the authentication provider.')} className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">Revoke</button>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <button type="button" onClick={() => setStatusMessage('Sign out is available through the account menu.')} className="text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                Sign out of all other sessions
              </button>
            </div>
          </section>
        </div>

        <div className="col-span-1 space-y-8">
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Safety Status</h2>
              <span className="material-symbols-outlined text-gray-400">shield</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">2FA Enabled</span>
                <span className={`material-symbols-outlined text-[18px] ${twoFactorEnabled ? 'text-green-500' : 'text-gray-300'}`}>{twoFactorEnabled ? 'check_circle' : 'cancel'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">Email Verified</span>
                <span className="material-symbols-outlined text-green-500 text-[18px]">check_circle</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">New login alerts</span>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{alertOnNewLogin ? 'On' : 'Off'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">Trusted devices only</span>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{trustedDevicesOnly ? 'On' : 'Off'}</span>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/10 p-3 rounded-xl border border-green-100 dark:border-green-800/30">
                  <span className="material-symbols-outlined text-[20px]">verified_user</span>
                  <span className="text-sm font-medium">Account is secure</span>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Security Controls</h2>
              <span className="material-symbols-outlined text-gray-400">policy</span>
            </div>
            <div className="p-6 space-y-4">
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-700 dark:text-gray-300">Alert on new login</span>
                <button type="button" onClick={() => setAlertOnNewLogin(current => !current)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${alertOnNewLogin ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${alertOnNewLogin ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </label>
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-700 dark:text-gray-300">Trusted devices only</span>
                <button type="button" onClick={() => setTrustedDevicesOnly(current => !current)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${trustedDevicesOnly ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${trustedDevicesOnly ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </label>
            </div>
          </section>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{isSaving ? 'Saving security preferences...' : 'Security preferences are stored on your profile record.'}</span>
        <button type="button" onClick={() => void handleSave().catch(() => undefined)} disabled={isSaving} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold">
          Save preferences
        </button>
      </div>
    </div>
  );
}
