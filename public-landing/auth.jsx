/* global React */
const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA } = React;

/* =================================================================
   Supabase helpers — wait for /api/public/config bootstrap
   ================================================================= */

function getSupabase() {
  return window.__supabase || null;
}

function useSupabase() {
  const [client, setClient] = useStateA(window.__supabase || null);
  useEffectA(() => {
    if (window.__supabaseReady) {
      setClient(window.__supabase || null);
      return;
    }
    const handler = () => setClient(window.__supabase || null);
    window.addEventListener('supabase-ready', handler, { once: true });
    return () => window.removeEventListener('supabase-ready', handler);
  }, []);
  return client;
}

function authErrorMessage(err, lang) {
  if (!err) return '';
  const msg = (err && err.message) ? String(err.message) : String(err);
  if (/invalid login/i.test(msg)) {
    return lang === 'es' ? 'Email o contraseña incorrectos.' : 'Invalid email or password.';
  }
  if (/email not confirmed/i.test(msg)) {
    return lang === 'es' ? 'Tu email aún no está confirmado. Revisa tu bandeja.' : 'Your email is not confirmed yet. Check your inbox.';
  }
  if (/over_email_send_rate_limit|too many/i.test(msg)) {
    return lang === 'es' ? 'Demasiados intentos. Espera unos minutos.' : 'Too many attempts. Please wait a few minutes.';
  }
  if (/user already registered/i.test(msg)) {
    return lang === 'es' ? 'Ya existe una cuenta con ese email. Inicia sesión.' : 'An account with this email already exists. Sign in instead.';
  }
  return msg;
}

/* =================================================================
   /signin
   ================================================================= */

const SIGNIN_COPY = {
  es: {
    eyebrow: "Iniciar sesión",
    title: "Vuelve a tu bandeja.",
    sub: "Accede a tu workspace de Clain. Si aún no tienes cuenta, crea una gratis o solicita una demo.",
    sso: [
      { id: 'google',    name: 'Continuar con Google',    provider: 'google' },
      { id: 'microsoft', name: 'Continuar con Microsoft', provider: 'azure' },
      { id: 'sso',       name: 'Single sign-on (SAML)',   provider: null },
    ],
    or: "o con email",
    fEmail: "Email de trabajo",
    fEmailPh: "tu@empresa.com",
    fPass: "Contraseña",
    fPassPh: "Mínimo 10 caracteres",
    remember: "Recuérdame en este dispositivo",
    forgot: "¿Olvidaste tu contraseña?",
    submit: "Iniciar sesión",
    submitting: "Entrando…",
    foot: ["¿Aún no tienes cuenta?", "Crea una gratis"],
    mfaTitle: "Verificación en dos pasos",
    mfaSub: "Introduce el código de 6 dígitos de tu app de autenticación.",
    mfaSubmit: "Verificar",
    mfaCancel: "Volver a iniciar sesión",
    samlNotice: "SAML SSO está disponible en el plan Business. Contacta con ventas.",
    asideTitle: "Tu equipo ya está dentro.",
    asideSub: "Cada caso, cada decisión, cada acción del agente — exactamente donde lo dejaste.",
    quote: "Volver a Clain por la mañana es como volver a una mesa ordenada. Todo el contexto sigue ahí, los hilos no se pierden, y los agentes han trabajado durante la noche.",
    who: "Camila Vives · Lead CX, Lúmina",
    stats: [
      { n: "99.99%", l: "uptime últimos 12 meses" },
      { n: "SOC 2", l: "Type II" },
      { n: "0", l: "incidentes de datos" },
    ],
    forgotTitle: "Recuperar contraseña",
    forgotSub: "Te enviaremos un enlace para restablecerla.",
    forgotSubmit: "Enviar enlace",
    forgotBack: "Volver al inicio de sesión",
    forgotSent: "Si existe una cuenta con ese email, te hemos enviado un enlace.",
  },
  en: {
    eyebrow: "Sign in",
    title: "Back to your inbox.",
    sub: "Access your Clain workspace. If you don't have an account yet, create one for free or request a demo.",
    sso: [
      { id: 'google',    name: 'Continue with Google',    provider: 'google' },
      { id: 'microsoft', name: 'Continue with Microsoft', provider: 'azure' },
      { id: 'sso',       name: 'Single sign-on (SAML)',   provider: null },
    ],
    or: "or with email",
    fEmail: "Work email",
    fEmailPh: "you@company.com",
    fPass: "Password",
    fPassPh: "Min 10 characters",
    remember: "Remember me on this device",
    forgot: "Forgot your password?",
    submit: "Sign in",
    submitting: "Signing in…",
    foot: ["No account yet?", "Create one free"],
    mfaTitle: "Two-factor authentication",
    mfaSub: "Enter the 6-digit code from your authenticator app.",
    mfaSubmit: "Verify",
    mfaCancel: "Sign in again",
    samlNotice: "SAML SSO is available on the Business plan. Contact sales.",
    asideTitle: "Your team is already in.",
    asideSub: "Every case, every decision, every agent action — exactly where you left them.",
    quote: "Coming back to Clain in the morning is like coming back to a tidy desk. All the context is still there, threads don't get lost, and the agents have been working overnight.",
    who: "Camila Vives · Lead CX, Lúmina",
    stats: [
      { n: "99.99%", l: "uptime last 12 months" },
      { n: "SOC 2", l: "Type II" },
      { n: "0", l: "data incidents" },
    ],
    forgotTitle: "Reset password",
    forgotSub: "We'll email you a link to reset it.",
    forgotSubmit: "Send reset link",
    forgotBack: "Back to sign in",
    forgotSent: "If an account exists for that email, you'll receive a reset link shortly.",
  },
};

function SsoGlyph({ id }) {
  if (id === 'google') return (
    <span className="auth-sso-glyph">
      <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3v2.6C4.6 19.6 8 22 12 22z"/><path fill="#FBBC04" d="M6.4 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.5H3C2.3 8.9 2 10.4 2 12s.3 3.1 1 4.5l3.4-2.6z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9C16.9 2.9 14.7 2 12 2 8 2 4.6 4.4 3 7.5l3.4 2.6C7.2 7.7 9.4 6 12 6z"/></svg>
    </span>
  );
  if (id === 'microsoft') return (
    <span className="auth-sso-glyph">
      <svg width="18" height="18" viewBox="0 0 24 24"><rect x="2" y="2" width="9" height="9" fill="#F25022"/><rect x="13" y="2" width="9" height="9" fill="#7FBA00"/><rect x="2" y="13" width="9" height="9" fill="#00A4EF"/><rect x="13" y="13" width="9" height="9" fill="#FFB900"/></svg>
    </span>
  );
  return (
    <span className="auth-sso-glyph">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    </span>
  );
}

function AuthError({ children }) {
  if (!children) return null;
  return (
    <div className="auth-error" style={{
      padding: '10px 12px',
      borderRadius: 8,
      background: 'oklch(0.96 0.04 25)',
      color: 'oklch(0.45 0.18 25)',
      fontSize: 13,
      lineHeight: 1.4,
    }}>{children}</div>
  );
}

function AuthAside({ c, lang }) {
  return (
    <aside className="auth-aside">
      <div className="auth-aside-head">
        <span className="eyebrow">Clain</span>
        <h2>{c.asideTitle}</h2>
        <p>{c.asideSub}</p>
      </div>
      <div className="auth-aside-card">
        <div className="auth-aside-card-head">
          <span style={{display:'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.65 0.15 145)'}} />
          <span>{lang === 'es' ? 'En vivo · cliente' : 'Live · customer'}</span>
        </div>
        <p className="auth-aside-card-quote">"{c.quote}"</p>
        <div className="auth-aside-card-who">{c.who}</div>
      </div>
      <div className="auth-aside-stats">
        {c.stats.map((s, i) => (
          <div key={i} className="auth-aside-stat">
            <div className="auth-aside-stat-num">{s.n}</div>
            <div className="auth-aside-stat-lab">{s.l}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* =================================================================
   SignInPage
   ================================================================= */

function SignInPage({ lang, navigate }) {
  const c = SIGNIN_COPY[lang] || SIGNIN_COPY.es;
  const supabase = useSupabase();

  const [stage, setStage]             = useStateA('credentials');
  const [email, setEmail]             = useStateA('');
  const [pwd, setPwd]                 = useStateA('');
  const [remember, setRemember]       = useStateA(true);
  const [loading, setLoading]         = useStateA(false);
  const [error, setError]             = useStateA('');
  const [factorId, setFactorId]       = useStateA(null);
  const [challengeId, setChallengeId] = useStateA(null);
  const [otp, setOtp]                 = useStateA('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!supabase) {
      setError(lang === 'es' ? 'Auth no disponible. Recarga la página.' : 'Auth unavailable. Reload the page.');
      return;
    }
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password: pwd });
      if (signInError) throw signInError;
      if (!data.session) {
        setError(lang === 'es' ? 'Confirma tu email antes de iniciar sesión.' : 'Confirm your email before signing in.');
        return;
      }
      const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
      if (factorsErr) throw factorsErr;
      const verifiedTotp = factorsData?.totp?.find((f) => f.status === 'verified');
      if (!verifiedTotp) {
        window.location.href = '/app';
        return;
      }
      const { data: challengeData, error: chalErr } = await supabase.auth.mfa.challenge({ factorId: verifiedTotp.id });
      if (chalErr) throw chalErr;
      setFactorId(verifiedTotp.id);
      setChallengeId(challengeData.id);
      setStage('mfa');
    } catch (err) {
      setError(authErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    if (!supabase || !factorId || !challengeId) {
      setError(lang === 'es' ? 'Reto MFA caducado. Inicia sesión de nuevo.' : 'MFA challenge expired. Sign in again.');
      setStage('credentials');
      return;
    }
    if (otp.trim().length < 6) {
      setError(lang === 'es' ? 'Introduce el código de 6 dígitos.' : 'Enter the 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId, challengeId, code: otp.trim() });
      if (verifyErr) throw verifyErr;
      window.location.href = '/app';
    } catch (err) {
      setError(authErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  };

  const onSso = async (provider) => {
    setError('');
    if (!provider) { setError(c.samlNotice); return; }
    if (!supabase) { setError(lang === 'es' ? 'Auth no disponible.' : 'Auth unavailable.'); return; }
    try {
      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + '/app' },
      });
    } catch (err) {
      setError(authErrorMessage(err, lang));
    }
  };

  const cancelMfa = async () => {
    setStage('credentials');
    setFactorId(null); setChallengeId(null); setOtp(''); setError('');
    try { if (supabase) await supabase.auth.signOut(); } catch (_) { /* ignore */ }
  };

  const onForgotSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!supabase) { setError(lang === 'es' ? 'Auth no disponible.' : 'Auth unavailable.'); return; }
    setLoading(true);
    try {
      const { error: rpErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (rpErr) throw rpErr;
      setStage('forgotSent');
    } catch (err) {
      setError(authErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <div className="auth-shell">
        <section className="auth-form-side">
          <div className="auth-form-card">

            {stage === 'credentials' && (<>
              <div className="auth-form-head">
                <span className="eyebrow">{c.eyebrow}</span>
                <h1>{c.title}</h1>
                <p>{c.sub}</p>
              </div>

              <div className="auth-sso">
                {c.sso.map((s) => (
                  <button key={s.id} type="button" className="auth-sso-btn" onClick={() => onSso(s.provider)}>
                    <SsoGlyph id={s.id} />
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>

              <div className="auth-divider"><span>{c.or}</span></div>

              <form className="auth-fields" onSubmit={onSubmit}>
                <div className="auth-field">
                  <label htmlFor="auth-email">{c.fEmail}</label>
                  <input id="auth-email" type="email" required className="auth-input" placeholder={c.fEmailPh}
                    value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="auth-field">
                  <label htmlFor="auth-pwd">{c.fPass}</label>
                  <input id="auth-pwd" type="password" required className="auth-input" placeholder={c.fPassPh}
                    value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" />
                </div>
                <div className="auth-row">
                  <label className="auth-checkbox">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    <span>{c.remember}</span>
                  </label>
                  <a href="#/forgot" onClick={(e) => { e.preventDefault(); setError(''); setStage('forgot'); }}>{c.forgot}</a>
                </div>
                <AuthError>{error}</AuthError>
                <button type="submit" disabled={loading} className="auth-submit">
                  {loading ? c.submitting : c.submit}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                </button>
              </form>

              <div className="auth-foot">
                {c.foot[0]}{' '}
                <a href="#/signup" onClick={(e) => { e.preventDefault(); navigate && navigate('/signup'); }}>{c.foot[1]}</a>
              </div>
            </>)}

            {stage === 'mfa' && (
              <form className="auth-fields" onSubmit={onVerifyOtp}>
                <div className="auth-form-head">
                  <span className="eyebrow">{c.eyebrow}</span>
                  <h1>{c.mfaTitle}</h1>
                  <p>{c.mfaSub}</p>
                </div>
                <div className="auth-field">
                  <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*"
                    maxLength={6} required autoFocus placeholder="123456" className="auth-input"
                    style={{textAlign:'center', fontSize: 22, letterSpacing: 8}}
                    value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
                </div>
                <AuthError>{error}</AuthError>
                <button type="submit" disabled={loading} className="auth-submit">
                  {loading ? c.submitting : c.mfaSubmit}
                </button>
                <button type="button" onClick={cancelMfa}
                  style={{background:'none', border:0, color:'var(--fg-faint)', cursor:'pointer', fontSize: 13}}>
                  {c.mfaCancel}
                </button>
              </form>
            )}

            {stage === 'forgot' && (
              <form className="auth-fields" onSubmit={onForgotSubmit}>
                <div className="auth-form-head">
                  <span className="eyebrow">{c.eyebrow}</span>
                  <h1>{c.forgotTitle}</h1>
                  <p>{c.forgotSub}</p>
                </div>
                <div className="auth-field">
                  <label htmlFor="auth-femail">{c.fEmail}</label>
                  <input id="auth-femail" type="email" required className="auth-input" placeholder={c.fEmailPh}
                    value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <AuthError>{error}</AuthError>
                <button type="submit" disabled={loading} className="auth-submit">
                  {loading ? c.submitting : c.forgotSubmit}
                </button>
                <button type="button" onClick={() => { setStage('credentials'); setError(''); }}
                  style={{background:'none', border:0, color:'var(--fg-faint)', cursor:'pointer', fontSize: 13}}>
                  {c.forgotBack}
                </button>
              </form>
            )}

            {stage === 'forgotSent' && (
              <div className="auth-fields">
                <div className="auth-form-head">
                  <span className="eyebrow">{c.eyebrow}</span>
                  <h1>{c.forgotTitle}</h1>
                  <p>{c.forgotSent}</p>
                </div>
                <button type="button" onClick={() => { setStage('credentials'); setError(''); }} className="auth-submit">
                  {c.forgotBack}
                </button>
              </div>
            )}

          </div>
        </section>
        <AuthAside c={c} lang={lang} />
      </div>
    </main>
  );
}

window.SignInPage = SignInPage;

/* =================================================================
   /signup
   ================================================================= */

const SIGNUP_COPY = {
  es: {
    eyebrow: "Crear cuenta",
    title: "Empieza con Clain.",
    sub: "Crea tu cuenta gratis. Sin tarjeta, sin compromisos. Tu workspace está listo en 2 minutos.",
    sso: [
      { id: 'google',    name: 'Registrarse con Google',    provider: 'google' },
      { id: 'microsoft', name: 'Registrarse con Microsoft', provider: 'azure' },
    ],
    or: "o con email",
    fName: "Nombre completo",
    fCompany: "Empresa",
    fEmail: "Email de trabajo",
    fEmailPh: "tu@empresa.com",
    fPass: "Contraseña",
    fPassPh: "Mínimo 10 caracteres",
    fPass2: "Confirma la contraseña",
    submit: "Crear cuenta",
    submitting: "Creando…",
    foot: ["¿Ya tienes cuenta?", "Inicia sesión"],
    confirmTitle: "Confirma tu email",
    confirmSub: "Te hemos enviado un enlace de confirmación. Ábrelo desde tu bandeja para activar la cuenta.",
    confirmBack: "Volver al inicio de sesión",
    planLabel: "Plan elegido",
  },
  en: {
    eyebrow: "Create account",
    title: "Get started with Clain.",
    sub: "Create your account for free. No card, no commitments. Your workspace is ready in 2 minutes.",
    sso: [
      { id: 'google',    name: 'Sign up with Google',    provider: 'google' },
      { id: 'microsoft', name: 'Sign up with Microsoft', provider: 'azure' },
    ],
    or: "or with email",
    fName: "Full name",
    fCompany: "Company",
    fEmail: "Work email",
    fEmailPh: "you@company.com",
    fPass: "Password",
    fPassPh: "Min 10 characters",
    fPass2: "Confirm password",
    submit: "Create account",
    submitting: "Creating…",
    foot: ["Already have an account?", "Sign in"],
    confirmTitle: "Confirm your email",
    confirmSub: "We've sent you a confirmation link. Open it from your inbox to activate your account.",
    confirmBack: "Back to sign in",
    planLabel: "Selected plan",
  },
};

function SignUpPage({ lang, navigate }) {
  const c = SIGNUP_COPY[lang] || SIGNUP_COPY.es;
  const aside = SIGNIN_COPY[lang] || SIGNIN_COPY.es;
  const supabase = useSupabase();

  const planFromUrl = useMemoA(() => {
    const m = (window.location.hash || '').match(/[?&]plan=([a-z0-9_-]+)/i);
    return m ? m[1] : null;
  }, []);

  const [name, setName]       = useStateA('');
  const [company, setCompany] = useStateA('');
  const [email, setEmail]     = useStateA('');
  const [pwd, setPwd]         = useStateA('');
  const [pwd2, setPwd2]       = useStateA('');
  const [loading, setLoading] = useStateA(false);
  const [error, setError]     = useStateA('');
  const [stage, setStage]     = useStateA('form');

  const onSso = async (provider) => {
    setError('');
    if (!supabase) { setError('Auth unavailable.'); return; }
    try {
      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + '/app' },
      });
    } catch (err) {
      setError(authErrorMessage(err, lang));
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (pwd.length < 10) {
      setError(lang === 'es' ? 'La contraseña debe tener al menos 10 caracteres.' : 'Password must be at least 10 characters.');
      return;
    }
    if (pwd !== pwd2) {
      setError(lang === 'es' ? 'Las contraseñas no coinciden.' : 'Passwords do not match.');
      return;
    }
    if (!supabase) {
      setError(lang === 'es' ? 'Auth no disponible.' : 'Auth unavailable.');
      return;
    }
    setLoading(true);
    try {
      const { data, error: suErr } = await supabase.auth.signUp({
        email,
        password: pwd,
        options: {
          emailRedirectTo: window.location.origin + '/app',
          data: { full_name: name, company_name: company, plan_intent: planFromUrl },
        },
      });
      if (suErr) throw suErr;
      if (data?.session) {
        window.location.href = '/app';
        return;
      }
      setStage('confirm');
    } catch (err) {
      setError(authErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <div className="auth-shell">
        <section className="auth-form-side">
          <div className="auth-form-card">

            {stage === 'form' && (<>
              <div className="auth-form-head">
                <span className="eyebrow">{c.eyebrow}</span>
                <h1>{c.title}</h1>
                <p>{c.sub}</p>
                {planFromUrl && (
                  <div style={{marginTop: 8, fontSize: 12, color: 'var(--fg-faint)'}}>
                    {c.planLabel}: <strong style={{textTransform:'capitalize'}}>{planFromUrl}</strong>
                  </div>
                )}
              </div>

              <div className="auth-sso">
                {c.sso.map((s) => (
                  <button key={s.id} type="button" className="auth-sso-btn" onClick={() => onSso(s.provider)}>
                    <SsoGlyph id={s.id} />
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>

              <div className="auth-divider"><span>{c.or}</span></div>

              <form className="auth-fields" onSubmit={onSubmit}>
                <div className="auth-field">
                  <label htmlFor="su-name">{c.fName}</label>
                  <input id="su-name" type="text" required className="auth-input"
                    value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </div>
                <div className="auth-field">
                  <label htmlFor="su-company">{c.fCompany}</label>
                  <input id="su-company" type="text" required className="auth-input"
                    value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
                </div>
                <div className="auth-field">
                  <label htmlFor="su-email">{c.fEmail}</label>
                  <input id="su-email" type="email" required className="auth-input" placeholder={c.fEmailPh}
                    value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="auth-field">
                  <label htmlFor="su-pwd">{c.fPass}</label>
                  <input id="su-pwd" type="password" required minLength={10} className="auth-input" placeholder={c.fPassPh}
                    value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
                </div>
                <div className="auth-field">
                  <label htmlFor="su-pwd2">{c.fPass2}</label>
                  <input id="su-pwd2" type="password" required minLength={10} className="auth-input"
                    value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
                </div>
                <AuthError>{error}</AuthError>
                <button type="submit" disabled={loading} className="auth-submit">
                  {loading ? c.submitting : c.submit}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
                </button>
              </form>

              <div className="auth-foot">
                {c.foot[0]}{' '}
                <a href="#/signin" onClick={(e) => { e.preventDefault(); navigate && navigate('/signin'); }}>{c.foot[1]}</a>
              </div>
            </>)}

            {stage === 'confirm' && (
              <div className="auth-fields">
                <div className="auth-form-head">
                  <span className="eyebrow">{c.eyebrow}</span>
                  <h1>{c.confirmTitle}</h1>
                  <p>{c.confirmSub}</p>
                </div>
                <button type="button" className="auth-submit"
                  onClick={() => navigate && navigate('/signin')}>
                  {c.confirmBack}
                </button>
              </div>
            )}

          </div>
        </section>
        <AuthAside c={aside} lang={lang} />
      </div>
    </main>
  );
}

window.SignUpPage = SignUpPage;

/* =================================================================
   /reset-password
   ================================================================= */

const RESET_COPY = {
  es: {
    eyebrow: "Restablecer contraseña",
    title: "Define tu nueva contraseña.",
    sub: "Mínimo 10 caracteres. Después podrás iniciar sesión con normalidad.",
    fPass: "Nueva contraseña",
    fPass2: "Confirma la nueva contraseña",
    submit: "Guardar contraseña",
    submitting: "Guardando…",
    done: "Contraseña actualizada.",
    backSignin: "Ir a iniciar sesión",
    invalidLink: "El enlace no es válido o ha caducado. Solicita uno nuevo.",
  },
  en: {
    eyebrow: "Reset password",
    title: "Set your new password.",
    sub: "At least 10 characters. After that you can sign in normally.",
    fPass: "New password",
    fPass2: "Confirm new password",
    submit: "Save password",
    submitting: "Saving…",
    done: "Password updated.",
    backSignin: "Go to sign in",
    invalidLink: "The link is invalid or has expired. Request a new one.",
  },
};

function ResetPasswordPage({ lang, navigate }) {
  const c = RESET_COPY[lang] || RESET_COPY.es;
  const supabase = useSupabase();
  const [pwd, setPwd]     = useStateA('');
  const [pwd2, setPwd2]   = useStateA('');
  const [loading, setLoading] = useStateA(false);
  const [error, setError]     = useStateA('');
  const [done, setDone]       = useStateA(false);
  const [hasSession, setHasSession] = useStateA(null);

  useEffectA(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setHasSession(Boolean(data?.session));
    });
    return () => { cancelled = true; };
  }, [supabase]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (pwd.length < 10) { setError(lang === 'es' ? 'Mínimo 10 caracteres.' : 'Minimum 10 characters.'); return; }
    if (pwd !== pwd2)    { setError(lang === 'es' ? 'Las contraseñas no coinciden.' : 'Passwords do not match.'); return; }
    if (!supabase)       { setError('Auth unavailable.'); return; }
    setLoading(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password: pwd });
      if (upErr) throw upErr;
      setDone(true);
    } catch (err) {
      setError(authErrorMessage(err, lang));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <div className="auth-shell">
        <section className="auth-form-side">
          <div className="auth-form-card">
            <div className="auth-form-head">
              <span className="eyebrow">{c.eyebrow}</span>
              <h1>{c.title}</h1>
              <p>{c.sub}</p>
            </div>

            {done ? (
              <div className="auth-fields">
                <AuthError>{c.done}</AuthError>
                <button type="button" className="auth-submit"
                  onClick={() => navigate ? navigate('/signin') : (window.location.hash = '#/signin')}>
                  {c.backSignin}
                </button>
              </div>
            ) : hasSession === false ? (
              <div className="auth-fields">
                <AuthError>{c.invalidLink}</AuthError>
                <button type="button" className="auth-submit"
                  onClick={() => navigate ? navigate('/signin') : (window.location.hash = '#/signin')}>
                  {c.backSignin}
                </button>
              </div>
            ) : (
              <form className="auth-fields" onSubmit={onSubmit}>
                <div className="auth-field">
                  <label htmlFor="rp-pwd">{c.fPass}</label>
                  <input id="rp-pwd" type="password" required minLength={10} className="auth-input"
                    value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
                </div>
                <div className="auth-field">
                  <label htmlFor="rp-pwd2">{c.fPass2}</label>
                  <input id="rp-pwd2" type="password" required minLength={10} className="auth-input"
                    value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
                </div>
                <AuthError>{error}</AuthError>
                <button type="submit" disabled={loading} className="auth-submit">
                  {loading ? c.submitting : c.submit}
                </button>
              </form>
            )}

          </div>
        </section>
        <AuthAside c={SIGNIN_COPY[lang] || SIGNIN_COPY.es} lang={lang} />
      </div>
    </main>
  );
}

window.ResetPasswordPage = ResetPasswordPage;

/* =================================================================
   /demo — Request demo (lead capture wired to /api/public/leads)
   ================================================================= */

const DEMO_COPY = {
  es: {
    eyebrow: "Solicita demo",
    title: ["Una llamada de 30 minutos.", { em: " Cero comerciales." }],
    sub: "Te enseña el producto un fundador. Trae tu setup actual y un caso real difícil — te enseñamos cómo lo resolvería Clain en vivo, con tus datos.",
    bullets: [
      { t: "Un fundador, no un SDR", d: "Te atiende quien escribió el producto. Sin libreto, sin pipeline." },
      { t: "Caso real, no slides", d: "Trae un caso difícil de tu helpdesk. Lo resolvemos juntos en la llamada." },
      { t: "Plan claro al final", d: "Sales por 30 minutos con próximos pasos concretos. O sin ellos — también vale." },
    ],
    trustLabel: "Confían en Clain",
    trust: ["Lúmina", "Mareva", "Quintela", "Brisa", "Atlàntica", "Sòl"],
    fName: "Nombre completo",
    fEmail: "Email de trabajo",
    fEmailPh: "tu@empresa.com",
    fCompany: "Empresa",
    fRole: "Puesto",
    fVolume: "Volumen mensual de tickets",
    fStack: "Helpdesk actual",
    fStackPh: "Zendesk, Front, email, Notion…",
    fNote: "¿Qué te gustaría enseñarnos?",
    fNotePh: "Cuéntanos un caso real difícil — refunds duplicados, fraude, devolución internacional, lo que sea. Cuanto más concreto, mejor llamada.",
    consent: ["Al enviar, aceptas nuestra ", "política de privacidad", " y que un fundador te escriba en menos de 24h."],
    submit: "Reservar la llamada",
    submitting: "Enviando…",
    formHead: { t: "Cuéntanos lo justo.", s: "8 campos. Lo lee un humano, no un bot." },
    volumes: ["<1k / mes", "1-5k / mes", "5-20k / mes", "20k+ / mes"],
    successTitle: "Recibido. Gracias.",
    successSub: "Te contactamos en menos de 24h al email que has indicado.",
    errorGeneric: "No hemos podido enviar el formulario. Inténtalo de nuevo en un momento.",
  },
  en: {
    eyebrow: "Request demo",
    title: ["A 30-minute call.", { em: " Zero sales reps." }],
    sub: "A founder shows you the product. Bring your current setup and a real hard case — we'll show you how Clain handles it live, with your data.",
    bullets: [
      { t: "A founder, not an SDR", d: "You'll be talking to someone who wrote the product. No script, no pipeline." },
      { t: "Real case, not slides", d: "Bring a hard case from your helpdesk. We'll solve it together on the call." },
      { t: "Clear plan at the end", d: "Out in 30 minutes with concrete next steps. Or without them — also fine." },
    ],
    trustLabel: "Trusted by",
    trust: ["Lúmina", "Mareva", "Quintela", "Brisa", "Atlàntica", "Sòl"],
    fName: "Full name",
    fEmail: "Work email",
    fEmailPh: "you@company.com",
    fCompany: "Company",
    fRole: "Role",
    fVolume: "Monthly ticket volume",
    fStack: "Current helpdesk",
    fStackPh: "Zendesk, Front, email, Notion…",
    fNote: "What would you like to show us?",
    fNotePh: "Tell us a real hard case — duplicated refunds, fraud, international returns, whatever. The more specific, the better the call.",
    consent: ["By submitting, you agree to our ", "privacy policy", " and to a founder reaching out within 24h."],
    submit: "Book the call",
    submitting: "Sending…",
    formHead: { t: "Tell us just enough.", s: "8 fields. A human reads it, not a bot." },
    volumes: ["<1k / mo", "1-5k / mo", "5-20k / mo", "20k+ / mo"],
    successTitle: "Got it. Thanks.",
    successSub: "We'll reach out within 24h at the email you provided.",
    errorGeneric: "We couldn't submit the form. Please try again in a moment.",
  },
};

function DemoPage({ lang }) {
  const c = DEMO_COPY[lang] || DEMO_COPY.es;
  const renderTitleParts = window.renderTitleParts;
  const [vol, setVol] = useStateA(1);
  const [form, setForm] = useStateA({ name: '', email: '', company: '', role: '', stack: '', note: '' });
  const [loading, setLoading] = useStateA(false);
  const [error, setError]     = useStateA('');
  const [success, setSuccess] = useStateA(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.email.trim()) {
      setError(lang === 'es' ? 'Nombre y email son obligatorios.' : 'Name and email are required.');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        company: form.company.trim(),
        role: form.role.trim(),
        volume: c.volumes[vol] || '',
        stack: form.stack.trim(),
        note: form.note.trim(),
        source: 'landing/demo',
      };
      const res = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || c.errorGeneric);
      }
      setSuccess(true);
    } catch (err) {
      setError(err && err.message ? err.message : c.errorGeneric);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main>
        <div className="req-shell">
          <section className="req-form-side" style={{margin: '0 auto'}}>
            <div className="req-form" style={{textAlign: 'center'}}>
              <div className="req-form-head">
                <span className="eyebrow">{c.eyebrow}</span>
                <h2>{c.successTitle}</h2>
                <p>{c.successSub}</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="req-shell">
        <section className="req-info">
          <div className="req-info-head">
            <span className="eyebrow">{c.eyebrow}</span>
            <h1>{renderTitleParts(c.title)}</h1>
            <p>{c.sub}</p>
          </div>

          <div className="req-bullets">
            {c.bullets.map((b, i) => (
              <div key={i} className="req-bullet">
                <span className="req-bullet-mark" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                </span>
                <div>
                  <h5>{b.t}</h5>
                  <p>{b.d}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="req-trust">
            <span className="req-trust-label">{c.trustLabel}</span>
            <div className="req-trust-logos">
              {c.trust.map((n, i) => <span key={i}>{n}</span>)}
            </div>
          </div>
        </section>

        <section className="req-form-side">
          <form className="req-form" onSubmit={onSubmit}>
            <div className="req-form-head">
              <h2>{c.formHead.t}</h2>
              <p>{c.formHead.s}</p>
            </div>

            <div className="req-row">
              <div className="auth-field">
                <label htmlFor="d-name">{c.fName}</label>
                <input id="d-name" required className="auth-input" value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div className="auth-field">
                <label htmlFor="d-email">{c.fEmail}</label>
                <input id="d-email" type="email" required className="auth-input" placeholder={c.fEmailPh} value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
            </div>

            <div className="req-row">
              <div className="auth-field">
                <label htmlFor="d-company">{c.fCompany}</label>
                <input id="d-company" className="auth-input" value={form.company} onChange={(e) => set('company', e.target.value)} />
              </div>
              <div className="auth-field">
                <label htmlFor="d-role">{c.fRole}</label>
                <input id="d-role" className="auth-input" value={form.role} onChange={(e) => set('role', e.target.value)} />
              </div>
            </div>

            <div className="auth-field">
              <label>{c.fVolume}</label>
              <div className="req-volume">
                {c.volumes.map((v, i) => (
                  <button type="button" key={i}
                    className={`req-volume-opt ${vol === i ? 'is-active' : ''}`}
                    onClick={() => setVol(i)}>{v}</button>
                ))}
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="d-stack">{c.fStack}</label>
              <input id="d-stack" className="auth-input" placeholder={c.fStackPh} value={form.stack} onChange={(e) => set('stack', e.target.value)} />
            </div>

            <div className="auth-field">
              <label htmlFor="d-note">{c.fNote}</label>
              <textarea id="d-note" className="req-textarea" placeholder={c.fNotePh} value={form.note} onChange={(e) => set('note', e.target.value)} />
            </div>

            <div className="req-consent">
              {c.consent[0]}<a href="#">{c.consent[1]}</a>{c.consent[2]}
            </div>

            <AuthError>{error}</AuthError>

            <button type="submit" disabled={loading} className="req-submit">
              {loading ? c.submitting : c.submit}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

window.DemoPage = DemoPage;

/* =================================================================
   Pricing CTA helpers — exposed on window.ClainAuth for app.jsx Pricing
   ================================================================= */

window.ClainAuth = {
  getSupabase: getSupabase,
  getSession: async function () {
    const sb = getSupabase();
    if (!sb) return null;
    try {
      const { data } = await sb.auth.getSession();
      return data && data.session ? data.session : null;
    } catch (_) { return null; }
  },
  // plan: 'starter' | 'growth' | 'scale'
  checkoutPlan: async function (plan) {
    const session = await window.ClainAuth.getSession();
    if (!session) {
      window.location.hash = '#/signup?plan=' + encodeURIComponent(plan);
      return;
    }
    try {
      const r = await fetch('/api/onboarding/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ orgName: 'My Workspace' }),
      });
      const data = await r.json();
      const orgId = data && (data.orgId || data.org_id);
      if (!orgId) throw new Error('No org found');

      const cs = await fetch('/api/billing/' + orgId + '/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
          'x-tenant-id': data.tenantId || data.tenant_id || orgId,
          'x-workspace-id': data.workspaceId || data.workspace_id || '',
          'x-user-id': (session.user && session.user.id) || '',
        },
        body: JSON.stringify({ plan: plan }),
      });
      const csData = await cs.json();
      if (csData && csData.url) {
        window.location.href = csData.url;
      } else {
        alert((csData && csData.error && csData.error.message) || 'Could not start checkout');
      }
    } catch (e) {
      console.error(e);
      alert('Checkout error: ' + (e.message || e));
    }
  },
  // credits: integer (5000, 20000, 50000)
  topupPack: async function (credits) {
    const session = await window.ClainAuth.getSession();
    if (!session) {
      window.location.hash = '#/signup?plan=topup';
      return;
    }
    try {
      const r = await fetch('/api/onboarding/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({ orgName: 'My Workspace' }),
      });
      const data = await r.json();
      const orgId = data && (data.orgId || data.org_id);
      if (!orgId) throw new Error('No org found');

      const tu = await fetch('/api/billing/' + orgId + '/top-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
          'x-tenant-id': data.tenantId || data.tenant_id || orgId,
          'x-workspace-id': data.workspaceId || data.workspace_id || '',
          'x-user-id': (session.user && session.user.id) || '',
        },
        body: JSON.stringify({ credits: credits, description: 'Top-up pack ' + credits + ' credits' }),
      });
      const tuData = await tu.json();
      if (tu.ok) {
        alert('Pack added: ' + credits + ' credits');
      } else {
        alert((tuData && tuData.error && tuData.error.message) || 'Top-up failed');
      }
    } catch (e) {
      console.error(e);
      alert('Top-up error: ' + (e.message || e));
    }
  },
};
