import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi } from '../../api/client';
import { supabase } from '../../api/supabase';
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
  const { data: enforcement } = useApi<any>(iamApi.securityEnforcement, []);
  const currentUser = user || FALLBACK_USER;
  const preferences = useMemo(() => parsePreferences(currentUser?.preferences), [currentUser]);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState('12 hours');
  const [alertOnNewLogin, setAlertOnNewLogin] = useState(true);
  const [trustedDevicesOnly, setTrustedDevicesOnly] = useState(false);
  const [sessionMeta, setSessionMeta] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ── TOTP 2FA enrollment state ──────────────────────────────────────────────
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [totpModal, setTotpModal] = useState<{
    factorId: string;
    uri: string;
    secret: string;
  } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);
  const [totpLoading, setTotpLoading] = useState(false);
  const policyStates = enforcement?.policy?.states || {};
  const stateLabel = (state?: string) => state === 'enforced' ? 'Enforced' : state === 'needs_setup' ? 'Needs setup' : state === 'configured_only' ? 'Configured only' : 'Disabled';

  useEffect(() => {
    setTwoFactorEnabled(preferences.security?.twoFactorEnabled ?? true);
    setSessionTimeout(preferences.security?.sessionTimeout ?? '12 hours');
    setAlertOnNewLogin(preferences.security?.alertOnNewLogin ?? true);
    setTrustedDevicesOnly(preferences.security?.trustedDevicesOnly ?? false);
  }, [preferences]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSessionMeta(data.session);
    }).catch(() => {
      if (!cancelled) setSessionMeta(null);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Load actual TOTP enrollment status from Supabase ──────────────────────
  useEffect(() => {
    let cancelled = false;
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (cancelled) return;
      const verified = data?.totp?.find((f: any) => f.status === 'verified');
      if (verified) {
        setTotpFactorId(verified.id);
        setTwoFactorEnabled(true);
      } else {
        setTotpFactorId(null);
        setTwoFactorEnabled(false);
      }
    }).catch(() => {/* non-fatal — Supabase MFA may not be enabled in project */});
    return () => { cancelled = true; };
  }, []);

  // ── Start TOTP enrollment (shows QR modal) ────────────────────────────────
  async function handleEnroll2FA() {
    setTotpError(null);
    setTotpLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setTotpModal({
        factorId: data.id,
        uri:      data.totp.uri,
        secret:   data.totp.secret,
      });
    } catch (err: any) {
      setTotpError(err?.message ?? 'Could not start 2FA setup. Check Supabase MFA settings.');
    } finally {
      setTotpLoading(false);
    }
  }

  // ── Verify OTP code to confirm enrollment ─────────────────────────────────
  async function handleVerifyTotp() {
    if (!totpModal || !totpCode.trim()) return;
    setTotpError(null);
    setTotpLoading(true);
    try {
      const { data: challengeData, error: challengeErr } =
        await supabase.auth.mfa.challenge({ factorId: totpModal.factorId });
      if (challengeErr) throw challengeErr;

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId:    totpModal.factorId,
        challengeId: challengeData.id,
        code:        totpCode.trim(),
      });
      if (verifyErr) throw verifyErr;

      setTotpFactorId(totpModal.factorId);
      setTwoFactorEnabled(true);
      setTotpModal(null);
      setTotpCode('');
      setStatusMessage('Two-factor authentication enabled.');
    } catch (err: any) {
      setTotpError(err?.message ?? 'Invalid code — check your authenticator app.');
    } finally {
      setTotpLoading(false);
    }
  }

  // ── Unenroll TOTP ─────────────────────────────────────────────────────────
  async function handleUnenroll2FA() {
    if (!totpFactorId) return;
    setTotpLoading(true);
    setTotpError(null);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: totpFactorId });
      if (error) throw error;
      setTotpFactorId(null);
      setTwoFactorEnabled(false);
      setStatusMessage('Two-factor authentication disabled.');
    } catch (err: any) {
      setTotpError(err?.message ?? 'Could not disable 2FA.');
    } finally {
      setTotpLoading(false);
    }
  }

  const authProvider = sessionMeta?.user?.app_metadata?.provider || sessionMeta?.user?.app_metadata?.providers?.[0] || 'local';
  const emailVerified = Boolean(sessionMeta?.user?.email_confirmed_at);
  const sessionLastSignIn = sessionMeta?.user?.last_sign_in_at ? new Date(sessionMeta.user.last_sign_in_at).toLocaleString() : null;

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
                  <p className="text-xs text-gray-500 dark:text-gray-400">Managed by {String(authProvider).replace(/_/g, ' ')} authentication.</p>
                </div>
                <span className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Provider managed
                </span>
              </div>

              <div className="flex items-center justify-between pb-6 border-b border-gray-100 dark:border-gray-800">
                <div className="flex-1 min-w-0 mr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Two-Factor Authentication (2FA)</h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${twoFactorEnabled ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-800/30' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Authenticator app (TOTP). Workspace enforcement: {stateLabel(policyStates.mfa)}.
                  </p>
                  {totpError && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{totpError}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={totpLoading}
                  onClick={twoFactorEnabled ? handleUnenroll2FA : handleEnroll2FA}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${twoFactorEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${twoFactorEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Session Timeout</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Preference saved on profile. Workspace enforcement: {stateLabel(policyStates.session)}.</p>
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
              <div className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <span className="material-symbols-outlined">devices</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white capitalize">{String(authProvider).replace(/_/g, ' ')} session</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-100 dark:border-blue-800/30">Current Session</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{sessionLastSignIn ? `Last sign-in ${sessionLastSignIn}` : 'Authenticated session is active.'}</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">Provider managed</span>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Session inventory and revocation are handled by the authentication provider; this view reflects the current authenticated session only.
              </p>
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
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{stateLabel(policyStates.mfa)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">Email Verified</span>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{emailVerified ? 'Verified' : 'Pending'}</span>
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
                  <span className="text-sm font-medium">{Object.values(policyStates).includes('needs_setup') ? 'Security setup needs attention' : 'Security policy evaluated'}</span>
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

      {/* ── TOTP setup modal ────────────────────────────────────────────────── */}
      {totpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 mx-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
              Set up authenticator app
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Scan the QR code with Google Authenticator, Authy, or any TOTP app.
              Then enter the 6-digit code to confirm.
            </p>

            {/* QR code via public image API — no extra dependency */}
            <div className="flex justify-center mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(totpModal.uri)}`}
                alt="TOTP QR code"
                width={180}
                height={180}
                className="rounded-xl border border-gray-100 dark:border-gray-700"
              />
            </div>

            {/* Manual secret fallback */}
            <details className="mb-4">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                Can&apos;t scan? Enter key manually
              </summary>
              <code className="mt-2 block text-xs bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-300 break-all select-all">
                {totpModal.secret}
              </code>
            </details>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={totpCode}
              onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && void handleVerifyTotp()}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-center text-xl font-mono tracking-widest text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
            />

            {totpError && (
              <p className="text-xs text-red-600 dark:text-red-400 mb-3 text-center">{totpError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setTotpModal(null); setTotpCode(''); setTotpError(null); }}
                className="flex-1 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={totpCode.length !== 6 || totpLoading}
                onClick={() => void handleVerifyTotp()}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {totpLoading ? 'Verifying…' : 'Enable 2FA'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
