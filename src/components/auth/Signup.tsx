import React, { useState } from 'react';
import { supabase } from '../../api/supabase';

interface SignupProps {
  onSignup: (tenantId: string, workspaceId: string) => void;
  onShowLogin: () => void;
}

type Step = 'credentials' | 'org' | 'done';

const Signup: React.FC<SignupProps> = ({ onSignup, onShowLogin }) => {
  const [step, setStep] = useState<Step>('credentials');

  // Step 1
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [userName, setUserName] = useState('');

  // Step 2
  const [orgName, setOrgName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // ── Step 1: Create Supabase auth account ─────────────────────────────────────
  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;
      setStep('org');
    } catch (err: any) {
      setError(err.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Create org + workspace via onboarding endpoint ───────────────────
  const handleOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) {
      setError('Organisation name is required');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/onboarding/setup`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orgName: orgName.trim(), userName: userName.trim() || undefined }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as any;
        throw new Error(body?.message ?? `Setup failed (${res.status})`);
      }

      const { tenantId, workspaceId } = await res.json() as {
        tenantId: string;
        workspaceId: string;
      };

      setStep('done');
      // Small delay so user sees the "done" state before the app navigates
      setTimeout(() => onSignup(tenantId, workspaceId), 800);
    } catch (err: any) {
      setError(err.message || 'Organisation setup failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-lg shadow-md">

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          {(['credentials', 'org'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold
                  ${step === s || step === 'done'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500'}`}
              >
                {i + 1}
              </div>
              {i < 1 && <div className="flex-1 h-px bg-gray-200" />}
            </React.Fragment>
          ))}
        </div>

        {step === 'credentials' && (
          <>
            <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">
              Create your account
            </h2>
            <form className="mt-8 space-y-4" onSubmit={handleCredentials}>
              <input
                type="text"
                placeholder="Your name"
                required
                value={userName}
                onChange={e => setUserName(e.target.value)}
                className="block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 px-3"
              />
              <input
                type="email"
                placeholder="Email address"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 px-3"
              />
              <input
                type="password"
                placeholder="Password (min 8 characters)"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 px-3"
              />
              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-blue-600 py-2 px-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? 'Creating account...' : 'Continue'}
              </button>
            </form>
          </>
        )}

        {step === 'org' && (
          <>
            <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">
              Name your organisation
            </h2>
            <p className="text-center text-sm text-gray-500">
              This will be the name of your CRM workspace.
            </p>
            <form className="mt-8 space-y-4" onSubmit={handleOrg}>
              <input
                type="text"
                placeholder="Organisation name"
                required
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                className="block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 px-3"
              />
              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-blue-600 py-2 px-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? 'Setting up...' : 'Create workspace'}
              </button>
            </form>
          </>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900">You&apos;re all set!</h3>
            <p className="text-sm text-gray-500">Taking you to your workspace…</p>
          </div>
        )}

        {step !== 'done' && (
          <p className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <button
              type="button"
              onClick={onShowLogin}
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
};

export default Signup;
