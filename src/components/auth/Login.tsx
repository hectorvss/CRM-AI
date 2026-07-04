import React, { useState } from 'react';
import { supabase } from '../../api/supabase';

interface LoginProps {
  onLogin: () => void;
  onShowSignup?: () => void;
}

type Stage = 'credentials' | 'mfa';

const Login: React.FC<LoginProps> = ({ onLogin, onShowSignup }) => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const [stage, setStage]             = useState<Stage>('credentials');
  const [factorId, setFactorId]       = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otpCode, setOtpCode]         = useState('');
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);

  // OAuth sign-in (Google / Apple) via Supabase. Redirects the browser to the
  // provider and back to the app; the session listener then completes login.
  // NOTE: the provider must also be enabled + configured in the Supabase
  // dashboard (client id/secret + redirect URL) — see docs/SUPABASE_PENDING.md.
  const handleOAuth = async (provider: 'google' | 'apple') => {
    setError('');
    setOauthLoading(provider);
    try {
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (oauthError) throw oauthError;
      // On success the browser is redirected away; nothing else to do here.
    } catch (err: any) {
      const raw = String(err?.message || '').toLowerCase();
      if (raw.includes('provider is not enabled') || raw.includes('unsupported provider')) {
        setError(`El inicio de sesión con ${provider === 'google' ? 'Google' : 'Apple'} no está habilitado todavía en Supabase.`);
      } else {
        setError(friendlyAuthError(err));
      }
      setOauthLoading(null);
    }
  };

  // Map cryptic Supabase auth errors to friendly UX strings. We deliberately
  // keep the wording generic for invalid-credential cases to avoid leaking
  // whether an account exists.
  const friendlyAuthError = (err: any): string => {
    const raw = String(err?.message || '').toLowerCase();
    if (raw.includes('invalid login credentials') || raw.includes('invalid_grant')) {
      return 'Email o contraseña incorrectos. Revisa tus credenciales e inténtalo de nuevo.';
    }
    if (raw.includes('email not confirmed')) {
      return 'Tu email aún no ha sido confirmado. Revisa tu bandeja de entrada y haz click en el enlace de confirmación.';
    }
    if (raw.includes('rate limit') || raw.includes('too many')) {
      return 'Demasiados intentos. Espera unos minutos antes de volver a probar.';
    }
    if (raw.includes('network') || raw.includes('fetch')) {
      return 'No pudimos contactar con el servidor. Comprueba tu conexión y vuelve a intentarlo.';
    }
    return err?.message || 'Error al iniciar sesión.';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      if (!data.session) {
        // Email confirmation pending or magic-link flow — nothing else to do here.
        setError('La sesión no se ha iniciado. Confirma tu email e inténtalo de nuevo.');
        return;
      }

      // ── MFA gating ───────────────────────────────────────────────────
      // After password auth succeeds, check whether the user has any
      // verified TOTP factors. If so, require a TOTP challenge BEFORE we
      // mark the app as authenticated.
      const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
      if (factorsErr) throw factorsErr;

      const verifiedTotp = factorsData?.totp?.find((f: any) => f.status === 'verified');
      if (!verifiedTotp) {
        // No MFA enrolled — proceed.
        onLogin();
        return;
      }

      const { data: challengeData, error: chalErr } = await supabase.auth.mfa.challenge({
        factorId: verifiedTotp.id,
      });
      if (chalErr) throw chalErr;

      setFactorId(verifiedTotp.id);
      setChallengeId(challengeData.id);
      setStage('mfa');
    } catch (err: any) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || !challengeId) {
      setError('Missing MFA challenge. Please sign in again.');
      setStage('credentials');
      return;
    }
    if (otpCode.trim().length < 6) {
      setError('Enter the 6-digit code from your authenticator');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: otpCode.trim(),
      });
      if (verifyErr) throw verifyErr;
      onLogin();
    } catch (err: any) {
      const raw = String(err?.message || '').toLowerCase();
      if (raw.includes('invalid totp') || raw.includes('invalid code') || raw.includes('expired')) {
        setError('Código incorrecto o expirado. Genera uno nuevo en tu app de autenticación.');
      } else {
        setError(err?.message || 'No se pudo verificar el código de autenticación.');
      }
    } finally {
      setLoading(false);
    }
  };

  const cancelMfa = async () => {
    setStage('credentials');
    setFactorId(null);
    setChallengeId(null);
    setOtpCode('');
    setError('');
    // Drop the half-authenticated session (AAL1) so a fresh login is required.
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-lg shadow-md">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            {stage === 'credentials' ? 'Sign in to CRM AI' : 'Two-factor authentication'}
          </h2>
          {stage === 'mfa' && (
            <p className="mt-2 text-center text-sm text-gray-500">
              Enter the 6-digit code from your authenticator app.
            </p>
          )}
        </div>

        {stage === 'credentials' && (
          <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            <div className="-space-y-px rounded-md shadow-sm">
              <div>
                <label htmlFor="email-address" className="sr-only">
                  Email address
                </label>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="relative block w-full rounded-t-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="relative block w-full rounded-b-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative flex w-full justify-center rounded-md bg-blue-600 py-2 px-3 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>
        )}

        {stage === 'credentials' && (
          <div className="space-y-3">
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">o continúa con</span></div>
            </div>
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              disabled={oauthLoading !== null || loading}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white py-2 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.06 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.39z"/>
                <path fill="#34A853" d="M12 24c3.1 0 5.7-1.03 7.6-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.88 1.1-2.98 0-5.5-2.01-6.4-4.72H1.76v2.98A11.99 11.99 0 0 0 12 24z"/>
                <path fill="#FBBC05" d="M5.6 14.7A7.2 7.2 0 0 1 5.22 12c0-.94.16-1.85.38-2.7V6.32H1.76A11.99 11.99 0 0 0 .5 12c0 1.94.47 3.77 1.26 5.68l3.84-2.98z"/>
                <path fill="#EA4335" d="M12 4.75c1.68 0 3.19.58 4.38 1.72l3.29-3.29C17.7 1.2 15.1 0 12 0 7.31 0 3.26 2.69 1.76 6.32l3.84 2.98C6.5 6.76 9.02 4.75 12 4.75z"/>
              </svg>
              {oauthLoading === 'google' ? 'Redirigiendo…' : 'Google'}
            </button>
            <button
              type="button"
              onClick={() => handleOAuth('apple')}
              disabled={oauthLoading !== null || loading}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-black py-2 px-3 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M16.36 12.86c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.75 2.28-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.29 1.15-.05 1.58-.74 2.97-.74 1.39 0 1.78.74 3 .72 1.24-.02 2.02-1.12 2.78-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65zM14.13 5.6c.64-.78 1.07-1.85.95-2.93-.92.04-2.04.61-2.7 1.38-.59.69-1.11 1.79-.97 2.85 1.03.08 2.08-.52 2.72-1.3z"/>
              </svg>
              {oauthLoading === 'apple' ? 'Redirigiendo…' : 'Apple'}
            </button>
          </div>
        )}

        {stage === 'mfa' && (
          <form className="mt-8 space-y-6" onSubmit={handleVerifyOtp}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              placeholder="123456"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              className="block w-full rounded-md border-0 py-2 px-3 text-center text-2xl tracking-widest text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600"
            />
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-blue-600 py-2 px-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={cancelMfa}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel and sign in as another user
            </button>
          </form>
        )}

        {stage === 'credentials' && onShowSignup && (
          <p className="text-center text-sm text-gray-600">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={onShowSignup}
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              Sign up
            </button>
          </p>
        )}
      </div>
    </div>
  );
};

export default Login;
