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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      if (!data.session) {
        // Email confirmation pending or magic-link flow — nothing else to do here.
        setError('Sign-in did not return a session. Please confirm your email and try again.');
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
      setError(err.message || 'Error signing in');
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
      setError(err.message || 'Invalid authentication code');
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
