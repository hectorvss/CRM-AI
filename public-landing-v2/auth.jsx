/* global React, ClainV2 */
/* Auth pages for landing v2 — design ported from v1 (two-column layout).
   Uses window.__supabase set up by the bootstrap script in index.html. */
(function () {
  const { useState, useEffect, useMemo } = React;

  function useSupabase() {
    const [client, setClient] = useState(window.__supabase || null);
    useEffect(() => {
      if (window.__supabaseReady) { setClient(window.__supabase || null); return; }
      const h = () => setClient(window.__supabase || null);
      window.addEventListener('supabase-ready', h, { once: true });
      return () => window.removeEventListener('supabase-ready', h);
    }, []);
    return client;
  }

  function authErr(err) {
    if (!err) return '';
    const msg = err.message ? String(err.message) : String(err);
    if (/invalid login/i.test(msg))                         return 'Invalid email or password.';
    if (/email not confirmed/i.test(msg))                   return 'Your email is not confirmed yet. Check your inbox.';
    if (/over_email_send_rate_limit|too many/i.test(msg))   return 'Too many attempts. Wait a few minutes.';
    if (/user already registered/i.test(msg))               return 'An account with this email already exists. Sign in instead.';
    return msg;
  }

  function AuthError({ children }) {
    if (!children) return null;
    return <div className="auth-error">{children}</div>;
  }

  function SsoGlyph({ id }) {
    if (id === 'google') return (
      <span className="auth-sso-glyph">
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/>
          <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3v2.6C4.6 19.6 8 22 12 22z"/>
          <path fill="#FBBC04" d="M6.4 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.5H3C2.3 8.9 2 10.4 2 12s.3 3.1 1 4.5l3.4-2.6z"/>
          <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9C16.9 2.9 14.7 2 12 2 8 2 4.6 4.4 3 7.5l3.4 2.6C7.2 7.7 9.4 6 12 6z"/>
        </svg>
      </span>
    );
    if (id === 'microsoft') return (
      <span className="auth-sso-glyph">
        <svg width="18" height="18" viewBox="0 0 24 24">
          <rect x="2"  y="2"  width="9" height="9" fill="#F25022"/>
          <rect x="13" y="2"  width="9" height="9" fill="#7FBA00"/>
          <rect x="2"  y="13" width="9" height="9" fill="#00A4EF"/>
          <rect x="13" y="13" width="9" height="9" fill="#FFB900"/>
        </svg>
      </span>
    );
    return (
      <span className="auth-sso-glyph">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </span>
    );
  }

  const ASIDE = {
    title: "Your team is already in.",
    sub:   "Every case, every decision, every agent action — exactly where you left them.",
    quote: "Coming back to Clain in the morning is like coming back to a tidy desk. All the context is still there, threads don't get lost, and the agents have been working overnight.",
    who:   "Camila Vives · Lead CX, Lúmina",
    stats: [
      { n: "99.99%", l: "uptime last 12 months" },
      { n: "SOC 2",  l: "Type II" },
      { n: "0",      l: "data incidents" },
    ],
  };

  function AuthAside() {
    return (
      <aside className="auth-aside">
        <div className="auth-aside-head">
          <span className="eyebrow">Clain</span>
          <h2>{ASIDE.title}</h2>
          <p>{ASIDE.sub}</p>
        </div>
        <div className="auth-aside-card">
          <div className="auth-aside-card-head">
            <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'oklch(0.65 0.15 145)' }} />
            <span>Live · customer</span>
          </div>
          <p className="auth-aside-card-quote">"{ASIDE.quote}"</p>
          <div className="auth-aside-card-who">{ASIDE.who}</div>
        </div>
        <div className="auth-aside-stats">
          {ASIDE.stats.map((s, i) => (
            <div key={i} className="auth-aside-stat">
              <div className="auth-aside-stat-num">{s.n}</div>
              <div className="auth-aside-stat-lab">{s.l}</div>
            </div>
          ))}
        </div>
      </aside>
    );
  }

  const SSO_OPTIONS = [
    { id: 'google',    label: 'Continue with Google',    provider: 'google' },
    { id: 'microsoft', label: 'Continue with Microsoft', provider: 'azure' },
    { id: 'sso',       label: 'Single sign-on (SAML)',   provider: null },
  ];

  // ── /signin ──────────────────────────────────────────────────────
  function SigninPage() {
    const supa = useSupabase();
    const [stage, setStage]         = useState('credentials');
    const [email, setEmail]         = useState('');
    const [pwd, setPwd]             = useState('');
    const [remember, setRemember]   = useState(true);
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState('');
    const [factorId, setFactorId]   = useState(null);
    const [chalId, setChalId]       = useState(null);
    const [otp, setOtp]             = useState('');

    const onSubmit = async (e) => {
      e.preventDefault(); setError('');
      if (!supa) { setError('Auth unavailable. Reload the page.'); return; }
      setLoading(true);
      try {
        const { data, error: err } = await supa.auth.signInWithPassword({ email, password: pwd });
        if (err) throw err;
        if (!data.session) { setError('Confirm your email before signing in.'); return; }
        const { data: fd } = await supa.auth.mfa.listFactors();
        const totp = fd?.totp?.find(f => f.status === 'verified');
        if (!totp) { window.location.href = '/app'; return; }
        const { data: cd, error: ce } = await supa.auth.mfa.challenge({ factorId: totp.id });
        if (ce) throw ce;
        setFactorId(totp.id); setChalId(cd.id); setStage('mfa');
      } catch (err) { setError(authErr(err)); }
      finally { setLoading(false); }
    };

    const onVerifyOtp = async (e) => {
      e.preventDefault(); setError('');
      if (!supa || !factorId || !chalId) { setError('MFA challenge expired. Sign in again.'); setStage('credentials'); return; }
      setLoading(true);
      try {
        const { error: err } = await supa.auth.mfa.verify({ factorId, challengeId: chalId, code: otp.trim() });
        if (err) throw err;
        window.location.href = '/app';
      } catch (err) { setError(authErr(err)); }
      finally { setLoading(false); }
    };

    const onSso = async (provider) => {
      setError('');
      if (!provider) { setError('SAML SSO is available on the Business plan. Contact sales.'); return; }
      if (!supa) { setError('Auth unavailable.'); return; }
      try { await supa.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin + '/app' } }); }
      catch (err) { setError(authErr(err)); }
    };

    const onForgot = async (e) => {
      e.preventDefault(); setError('');
      if (!supa) { setError('Auth unavailable.'); return; }
      setLoading(true);
      try {
        const { error: err } = await supa.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' });
        if (err) throw err;
        setStage('forgotSent');
      } catch (err) { setError(authErr(err)); }
      finally { setLoading(false); }
    };

    return (
      <ClainV2.PageShell>
        <main>
          <div className="auth-shell">
            <section className="auth-form-side">
              <div className="auth-form-card">

                {stage === 'credentials' && (<>
                  <div className="auth-form-head">
                    <span className="eyebrow">Sign in</span>
                    <h1>Back to your inbox.</h1>
                    <p>Access your Clain workspace. If you don't have an account yet, create one for free or request a demo.</p>
                  </div>
                  <div className="auth-sso">
                    {SSO_OPTIONS.map(s => (
                      <button key={s.id} type="button" className="auth-sso-btn" onClick={() => onSso(s.provider)}>
                        <SsoGlyph id={s.id} /><span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="auth-divider"><span>or with email</span></div>
                  <form className="auth-fields" onSubmit={onSubmit}>
                    <div className="auth-field">
                      <label htmlFor="si-email">Work email</label>
                      <input id="si-email" type="email" required className="auth-input" placeholder="you@company.com"
                        value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                    </div>
                    <div className="auth-field">
                      <label htmlFor="si-pwd">Password</label>
                      <input id="si-pwd" type="password" required className="auth-input" placeholder="Min 10 characters"
                        value={pwd} onChange={e => setPwd(e.target.value)} autoComplete="current-password" />
                    </div>
                    <div className="auth-row">
                      <label className="auth-checkbox">
                        <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                        <span>Remember me on this device</span>
                      </label>
                      <a href="/reset-password" onClick={e => { e.preventDefault(); setError(''); setStage('forgot'); }}>Forgot your password?</a>
                    </div>
                    <AuthError>{error}</AuthError>
                    <button type="submit" disabled={loading} className="auth-submit">
                      {loading ? 'Signing in…' : 'Sign in'}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                    </button>
                  </form>
                  <div className="auth-foot">No account yet? <a href="/signup" data-spa onClick={e => { e.preventDefault(); ClainV2.navigate('/signup'); }}>Create one free</a></div>
                </>)}

                {stage === 'mfa' && (
                  <form className="auth-fields" onSubmit={onVerifyOtp}>
                    <div className="auth-form-head">
                      <span className="eyebrow">Sign in</span>
                      <h1>Two-factor authentication</h1>
                      <p>Enter the 6-digit code from your authenticator app.</p>
                    </div>
                    <div className="auth-field">
                      <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*"
                        maxLength={6} required autoFocus placeholder="123456" className="auth-input"
                        style={{ textAlign:'center', fontSize:22, letterSpacing:8 }}
                        value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} />
                    </div>
                    <AuthError>{error}</AuthError>
                    <button type="submit" disabled={loading} className="auth-submit">{loading ? 'Verifying…' : 'Verify'}</button>
                    <button type="button" onClick={() => { setStage('credentials'); setFactorId(null); setChalId(null); setOtp(''); setError(''); if (supa) supa.auth.signOut(); }}
                      style={{ background:'none', border:0, color:'var(--fg-faint)', cursor:'pointer', fontSize:13, textAlign:'center' }}>
                      Sign in again
                    </button>
                  </form>
                )}

                {stage === 'forgot' && (
                  <form className="auth-fields" onSubmit={onForgot}>
                    <div className="auth-form-head">
                      <span className="eyebrow">Sign in</span>
                      <h1>Reset password</h1>
                      <p>We'll email you a link to reset it.</p>
                    </div>
                    <div className="auth-field">
                      <label htmlFor="fg-email">Work email</label>
                      <input id="fg-email" type="email" required className="auth-input" placeholder="you@company.com"
                        value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                    </div>
                    <AuthError>{error}</AuthError>
                    <button type="submit" disabled={loading} className="auth-submit">{loading ? 'Sending…' : 'Send reset link'}</button>
                    <button type="button" onClick={() => { setStage('credentials'); setError(''); }}
                      style={{ background:'none', border:0, color:'var(--fg-faint)', cursor:'pointer', fontSize:13, textAlign:'center' }}>
                      Back to sign in
                    </button>
                  </form>
                )}

                {stage === 'forgotSent' && (
                  <div className="auth-fields">
                    <div className="auth-form-head">
                      <span className="eyebrow">Sign in</span>
                      <h1>Reset password</h1>
                      <p>If an account exists for that email, you'll receive a reset link shortly.</p>
                    </div>
                    <button type="button" className="auth-submit" onClick={() => { setStage('credentials'); setError(''); }}>Back to sign in</button>
                  </div>
                )}

              </div>
            </section>
            <AuthAside />
          </div>
        </main>
      </ClainV2.PageShell>
    );
  }

  // ── /signup ───────────────────────────────────────────────────────
  function SignupPage() {
    const supa = useSupabase();
    const planFromUrl = useMemo(() => {
      const p = new URLSearchParams(window.location.search);
      const plan = (p.get('plan') || '').toLowerCase();
      return ['starter', 'growth', 'scale'].includes(plan) ? plan : null;
    }, []);
    const intervalFromUrl = useMemo(() => {
      const p = new URLSearchParams(window.location.search);
      const i = (p.get('interval') || '').toLowerCase();
      return ['month', 'year'].includes(i) ? i : 'year';
    }, []);

    const [name,    setName]    = useState('');
    const [company, setCompany] = useState('');
    const [email,   setEmail]   = useState('');
    const [pwd,     setPwd]     = useState('');
    const [pwd2,    setPwd2]    = useState('');
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');
    const [stage,   setStage]   = useState('form');

    const onSso = async (provider) => {
      setError('');
      if (!supa) { setError('Auth unavailable.'); return; }
      try { await supa.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin + '/app' } }); }
      catch (err) { setError(authErr(err)); }
    };

    const onSubmit = async (e) => {
      e.preventDefault(); setError('');
      if (pwd.length < 10) { setError('Password must be at least 10 characters.'); return; }
      if (pwd !== pwd2)    { setError('Passwords do not match.'); return; }
      if (!supa)           { setError('Auth unavailable.'); return; }
      setLoading(true);
      try {
        const { data, error: err } = await supa.auth.signUp({
          email, password: pwd,
          options: {
            emailRedirectTo: window.location.origin + '/app',
            data: {
              full_name: name, company_name: company,
              ...(planFromUrl ? { plan_intent: planFromUrl, plan_interval: intervalFromUrl } : {}),
            },
          },
        });
        if (err) throw err;
        if (planFromUrl) {
          try { localStorage.setItem('clain_pending_plan', JSON.stringify({ plan: planFromUrl, interval: intervalFromUrl })); } catch (_) {}
        }
        if (data?.session) { window.location.href = '/app'; return; }
        setStage('confirm');
      } catch (err) { setError(authErr(err)); }
      finally { setLoading(false); }
    };

    const SIGNUP_SSO = [
      { id: 'google',    label: 'Sign up with Google',    provider: 'google' },
      { id: 'microsoft', label: 'Sign up with Microsoft', provider: 'azure' },
    ];

    if (stage === 'confirm') {
      return (
        <ClainV2.PageShell>
          <main>
            <div className="auth-shell">
              <section className="auth-form-side">
                <div className="auth-form-card">
                  <div className="auth-form-head">
                    <span className="eyebrow">Create account</span>
                    <h1>Confirm your email</h1>
                    <p>We've sent you a confirmation link. Open it from your inbox to activate your account.</p>
                  </div>
                  <button type="button" className="auth-submit" onClick={() => ClainV2.navigate('/signin')}>Back to sign in</button>
                </div>
              </section>
              <AuthAside />
            </div>
          </main>
        </ClainV2.PageShell>
      );
    }

    return (
      <ClainV2.PageShell>
        <main>
          <div className="auth-shell">
            <section className="auth-form-side">
              <div className="auth-form-card">
                <div className="auth-form-head">
                  <span className="eyebrow">{planFromUrl ? `Create account · ${planFromUrl.charAt(0).toUpperCase() + planFromUrl.slice(1)} plan` : 'Create account'}</span>
                  <h1>Get started with Clain.</h1>
                  <p>{planFromUrl
                    ? `14-day free trial of the ${planFromUrl.charAt(0).toUpperCase() + planFromUrl.slice(1)} plan. No credit card required.`
                    : 'Create your account for free. No card, no commitments. Your workspace is ready in 2 minutes.'}</p>
                </div>
                <div className="auth-sso">
                  {SIGNUP_SSO.map(s => (
                    <button key={s.id} type="button" className="auth-sso-btn" onClick={() => onSso(s.provider)}>
                      <SsoGlyph id={s.id} /><span>{s.label}</span>
                    </button>
                  ))}
                </div>
                <div className="auth-divider"><span>or with email</span></div>
                <form className="auth-fields" onSubmit={onSubmit}>
                  <div className="auth-field">
                    <label htmlFor="su-name">Full name</label>
                    <input id="su-name" type="text" required className="auth-input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
                  </div>
                  <div className="auth-field">
                    <label htmlFor="su-company">Company</label>
                    <input id="su-company" type="text" required className="auth-input" value={company} onChange={e => setCompany(e.target.value)} autoComplete="organization" />
                  </div>
                  <div className="auth-field">
                    <label htmlFor="su-email">Work email</label>
                    <input id="su-email" type="email" required className="auth-input" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                  </div>
                  <div className="auth-field">
                    <label htmlFor="su-pwd">Password</label>
                    <input id="su-pwd" type="password" required minLength={10} className="auth-input" placeholder="Min 10 characters" value={pwd} onChange={e => setPwd(e.target.value)} autoComplete="new-password" />
                  </div>
                  <div className="auth-field">
                    <label htmlFor="su-pwd2">Confirm password</label>
                    <input id="su-pwd2" type="password" required minLength={10} className="auth-input" value={pwd2} onChange={e => setPwd2(e.target.value)} autoComplete="new-password" />
                  </div>
                  <AuthError>{error}</AuthError>
                  <button type="submit" disabled={loading} className="auth-submit">
                    {loading ? 'Creating…' : 'Create account'}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                  </button>
                </form>
                <div className="auth-foot">Already have an account? <a href="/signin" data-spa onClick={e => { e.preventDefault(); ClainV2.navigate('/signin'); }}>Sign in</a></div>
              </div>
            </section>
            <AuthAside />
          </div>
        </main>
      </ClainV2.PageShell>
    );
  }

  // ── /reset-password ───────────────────────────────────────────────
  function ResetPasswordPage() {
    const supa = useSupabase();
    const [pwd,        setPwd]        = useState('');
    const [pwd2,       setPwd2]       = useState('');
    const [loading,    setLoading]    = useState(false);
    const [error,      setError]      = useState('');
    const [done,       setDone]       = useState(false);
    const [hasSession, setHasSession] = useState(null);

    useEffect(() => {
      if (!supa) return;
      supa.auth.getSession().then(({ data }) => setHasSession(Boolean(data?.session)));
    }, [supa]);

    const onSubmit = async (e) => {
      e.preventDefault(); setError('');
      if (pwd.length < 10) { setError('Minimum 10 characters.'); return; }
      if (pwd !== pwd2)    { setError('Passwords do not match.'); return; }
      if (!supa)           { setError('Auth unavailable.'); return; }
      setLoading(true);
      try {
        const { error: err } = await supa.auth.updateUser({ password: pwd });
        if (err) throw err;
        setDone(true);
      } catch (err) { setError(authErr(err)); }
      finally { setLoading(false); }
    };

    return (
      <ClainV2.PageShell>
        <main>
          <div className="auth-shell">
            <section className="auth-form-side">
              <div className="auth-form-card">
                <div className="auth-form-head">
                  <span className="eyebrow">Reset password</span>
                  <h1>Set your new password.</h1>
                  <p>At least 10 characters. After that you can sign in normally.</p>
                </div>
                {done ? (
                  <div className="auth-fields">
                    <div style={{ padding:'10px 12px', borderRadius:8, background:'#f0fdf4', border:'1px solid #bbf7d0', fontSize:13, color:'#166534' }}>Password updated successfully.</div>
                    <button type="button" className="auth-submit" onClick={() => ClainV2.navigate('/signin')}>Go to sign in</button>
                  </div>
                ) : hasSession === false ? (
                  <div className="auth-fields">
                    <AuthError>The link is invalid or has expired. Request a new one.</AuthError>
                    <button type="button" className="auth-submit" onClick={() => ClainV2.navigate('/signin')}>Go to sign in</button>
                  </div>
                ) : (
                  <form className="auth-fields" onSubmit={onSubmit}>
                    <div className="auth-field">
                      <label htmlFor="rp-pwd">New password</label>
                      <input id="rp-pwd" type="password" required minLength={10} className="auth-input" value={pwd} onChange={e => setPwd(e.target.value)} autoComplete="new-password" />
                    </div>
                    <div className="auth-field">
                      <label htmlFor="rp-pwd2">Confirm new password</label>
                      <input id="rp-pwd2" type="password" required minLength={10} className="auth-input" value={pwd2} onChange={e => setPwd2(e.target.value)} autoComplete="new-password" />
                    </div>
                    <AuthError>{error}</AuthError>
                    <button type="submit" disabled={loading} className="auth-submit">{loading ? 'Saving…' : 'Save password'}</button>
                  </form>
                )}
              </div>
            </section>
            <AuthAside />
          </div>
        </main>
      </ClainV2.PageShell>
    );
  }

  // ── /demo ─────────────────────────────────────────────────────────
  function DemoPage() {
    const [vol,     setVol]     = useState(1);
    const [form,    setForm]    = useState({ name:'', email:'', company:'', role:'', stack:'', note:'' });
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');
    const [success, setSuccess] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const VOLUMES = ['<1k / mo', '1-5k / mo', '5-20k / mo', '20k+ / mo'];

    const onSubmit = async (e) => {
      e.preventDefault(); setError('');
      if (!form.name.trim() || !form.email.trim()) { setError('Name and email are required.'); return; }
      setLoading(true);
      try {
        const res = await fetch('/api/public/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(), email: form.email.trim(),
            company: form.company.trim(), role: form.role.trim(),
            volume: VOLUMES[vol] || '', stack: form.stack.trim(), note: form.note.trim(),
            source: 'landing-v2/demo',
          }),
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error?.message || "Couldn't submit. Try again."); }
        setSuccess(true);
      } catch (err) { setError(err.message || "Couldn't submit. Try again."); }
      finally { setLoading(false); }
    };

    if (success) {
      return (
        <ClainV2.PageShell>
          <main>
            <div className="req-shell">
              <section className="req-form-side" style={{ gridColumn:'1/-1', margin:'0 auto' }}>
                <div className="req-form" style={{ textAlign:'center' }}>
                  <div className="req-form-head">
                    <h2>Got it. Thanks.</h2>
                    <p>We'll reach out within 24h at the email you provided.</p>
                  </div>
                  <button type="button" className="auth-submit" style={{ marginTop:8 }} onClick={() => ClainV2.navigate('/')}>Back to home</button>
                </div>
              </section>
            </div>
          </main>
        </ClainV2.PageShell>
      );
    }

    return (
      <ClainV2.PageShell>
        <main>
          <div className="req-shell">
            <section className="req-info">
              <div className="req-info-head">
                <span className="eyebrow">Request demo</span>
                <h1>A 30-minute call. <em>Zero sales reps.</em></h1>
                <p>A founder shows you the product. Bring your current setup and a real hard case — we'll show you how Clain handles it live, with your data.</p>
              </div>
              <div className="req-bullets">
                {[
                  { t: 'A founder, not an SDR',   d: "You'll be talking to someone who wrote the product. No script, no pipeline." },
                  { t: 'Real case, not slides',    d: "Bring a hard case from your helpdesk. We'll solve it together on the call." },
                  { t: 'Clear plan at the end',    d: "Out in 30 minutes with concrete next steps. Or without them — also fine." },
                ].map((b, i) => (
                  <div key={i} className="req-bullet">
                    <span className="req-bullet-mark">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                    </span>
                    <div><h5>{b.t}</h5><p>{b.d}</p></div>
                  </div>
                ))}
              </div>
              <div className="req-trust">
                <span className="req-trust-label">Trusted by</span>
                <div className="req-trust-logos">
                  {['Lúmina','Mareva','Quintela','Brisa','Atlàntica','Sòl'].map((n, i) => <span key={i}>{n}</span>)}
                </div>
              </div>
            </section>

            <section className="req-form-side">
              <form className="req-form" onSubmit={onSubmit}>
                <div className="req-form-head">
                  <h2>Tell us just enough.</h2>
                  <p>8 fields. A human reads it, not a bot.</p>
                </div>
                <div className="req-row">
                  <div className="auth-field"><label htmlFor="d-name">Full name</label><input id="d-name" required className="auth-input" value={form.name} onChange={e => set('name', e.target.value)} /></div>
                  <div className="auth-field"><label htmlFor="d-email">Work email</label><input id="d-email" type="email" required className="auth-input" placeholder="you@company.com" value={form.email} onChange={e => set('email', e.target.value)} /></div>
                </div>
                <div className="req-row">
                  <div className="auth-field"><label htmlFor="d-company">Company</label><input id="d-company" className="auth-input" value={form.company} onChange={e => set('company', e.target.value)} /></div>
                  <div className="auth-field"><label htmlFor="d-role">Role</label><input id="d-role" className="auth-input" value={form.role} onChange={e => set('role', e.target.value)} /></div>
                </div>
                <div className="auth-field">
                  <label>Monthly ticket volume</label>
                  <div className="req-volume">
                    {VOLUMES.map((v, i) => (
                      <button type="button" key={i} className={`req-volume-opt${vol === i ? ' is-active' : ''}`} onClick={() => setVol(i)}>{v}</button>
                    ))}
                  </div>
                </div>
                <div className="auth-field"><label htmlFor="d-stack">Current helpdesk</label><input id="d-stack" className="auth-input" placeholder="Zendesk, Front, email, Notion…" value={form.stack} onChange={e => set('stack', e.target.value)} /></div>
                <div className="auth-field">
                  <label htmlFor="d-note">What would you like to show us?</label>
                  <textarea id="d-note" className="req-textarea" placeholder="Tell us a real hard case — duplicated refunds, fraud, international returns, whatever. The more specific, the better the call." value={form.note} onChange={e => set('note', e.target.value)} />
                </div>
                <div className="req-consent">By submitting, you agree to our <a href="#">privacy policy</a> and to a founder reaching out within 24h.</div>
                <AuthError>{error}</AuthError>
                <button type="submit" disabled={loading} className="req-submit">
                  {loading ? 'Sending…' : 'Book the call'}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                </button>
              </form>
            </section>
          </div>
        </main>
      </ClainV2.PageShell>
    );
  }

  window.SigninPage        = SigninPage;
  window.SignupPage        = SignupPage;
  window.ResetPasswordPage = ResetPasswordPage;
  window.DemoPage          = DemoPage;
})();
