import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { IntegrationLogo } from './logos';

/**
 * Direct Meta WhatsApp Cloud API connect modal — independent from the
 * Twilio modal. The merchant pastes credentials they get from Meta:
 *   - Phone Number ID    (WhatsApp Manager → Phone numbers)
 *   - WABA ID            (WhatsApp Business Account ID)
 *   - Access Token       (System User token from Meta Business Manager)
 *   - App Secret         (Meta App → Settings → Basic)
 *
 * After validation we hit Graph API GET /{phone-number-id} to confirm,
 * auto-subscribe the app to the WABA so events flow, and surface the
 * webhook callback URL + verify token the merchant must paste in their
 * Meta App webhooks config.
 *
 * Step 2 (after connect): show templates, send a test, and the webhook
 * config they need to paste into Meta App Dashboard → WhatsApp →
 * Configuration.
 */

interface PhoneInfo {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
  code_verification_status?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    phone_number_id?: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    waba_id?: string | null;
    verify_token?: string;
    webhook_callback_url?: string;
    webhook_subscribed?: boolean;
    template_count?: number;
    last_health_check_at?: string | null;
    capabilities?: { sends?: string[]; reads?: string[]; realtime?: string } | null;
  } | null;
}

const SCOPES_HUMAN = [
  { id: 'text', label: 'Texto', icon: 'chat' },
  { id: 'templates', label: 'Plantillas', icon: 'description' },
  { id: 'interactive', label: 'Botones / listas', icon: 'list_alt' },
  { id: 'media', label: 'Imágenes / vídeo / docs', icon: 'image' },
  { id: 'reactions', label: 'Reacciones', icon: 'sentiment_satisfied' },
  { id: 'profile', label: 'Perfil de empresa', icon: 'business' },
];

const WhatsAppConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step2Open, setStep2Open] = useState(false);
  const [connectResult, setConnectResult] = useState<{
    phone_number?: PhoneInfo;
    template_count?: number;
    verify_token?: string;
    webhook_callback_url?: string;
    webhook_subscribed?: boolean;
  } | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    if (open) {
      setPhoneNumberId('');
      setAccessToken('');
      setWabaId('');
      setAppSecret('');
      setVerifyToken('');
      setError(null);
      setSubmitting(false);
      setStep2Open(false);
      setConnectResult(null);
      setTestTo('');
      setTestStatus('idle');
    }
  }, [open]);

  if (!open) return null;
  const isConnected = Boolean(existing?.phone_number_id);

  async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
    return fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token ?? ''}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  async function handleConnect() {
    setError(null);
    if (!phoneNumberId) return setError('Phone Number ID es obligatorio');
    if (!accessToken) return setError('Access Token es obligatorio');
    if (!appSecret) return setError('App Secret es obligatorio (Meta App → Settings → Basic)');

    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/whatsapp/connect', {
        method: 'POST',
        body: JSON.stringify({
          phone_number_id: phoneNumberId.trim(),
          access_token: accessToken.trim(),
          waba_id: wabaId.trim() || undefined,
          app_secret: appSecret.trim(),
          verify_token: verifyToken.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.metaMessage || j.error || `Server error ${res.status}`);
      }
      const json = await res.json();
      setConnectResult({
        phone_number: json.phone_number,
        template_count: json.template_count,
        verify_token: json.verify_token,
        webhook_callback_url: json.webhook_callback_url,
        webhook_subscribed: json.webhook_subscribed,
      });
      setStep2Open(true);
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'No se pudo conectar WhatsApp');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubscribeWebhook() {
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/whatsapp/subscribe-webhook', { method: 'POST' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      onChanged?.();
      setConnectResult((c) => c ? { ...c, webhook_subscribed: true } : c);
    } catch (err: any) {
      setError(err?.message || 'No se pudo suscribir el webhook');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendTest() {
    if (!testTo) return;
    setTestStatus('sending');
    try {
      const res = await authedFetch('/api/integrations/whatsapp/send-test', {
        method: 'POST',
        body: JSON.stringify({
          to: testTo,
          mode: 'template',
          template_name: 'hello_world',
          template_language: 'en_US',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.details || j.error || `${res.status}`);
      }
      setTestStatus('sent');
      setTimeout(() => setTestStatus('idle'), 4000);
    } catch (err: any) {
      setError(err?.message || 'Test failed');
      setTestStatus('error');
      setTimeout(() => setTestStatus('idle'), 4000);
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar WhatsApp? Dejaremos de recibir mensajes y no podremos enviar respuestas.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/whatsapp/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      onChanged?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo desconectar');
    } finally {
      setSubmitting(false);
    }
  }

  const isStep2 = isConnected || step2Open;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#25D366] text-white shadow-sm">
              <IntegrationLogo id="whatsapp" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                Integración
              </p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">WhatsApp Business</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Cloud API · Meta directo</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {!isStep2 ? (
            // ── Step 1: paste credentials ────────────────────────────────
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Conexión directa con la WhatsApp Business Cloud API de Meta. Sin intermediarios.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES_HUMAN.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#25D366]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Cómo obtener las credenciales</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>Crea una <em>Meta App</em> en <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="underline">developers.facebook.com</a> con producto "WhatsApp"</li>
                  <li>WhatsApp Manager → Phone numbers → copia el <strong>Phone Number ID</strong> y <strong>WABA ID</strong></li>
                  <li>Genera un <em>System User Access Token</em> permanente con scopes <code className="rounded bg-white/40 px-1 dark:bg-black/30">whatsapp_business_messaging</code> + <code className="rounded bg-white/40 px-1 dark:bg-black/30">whatsapp_business_management</code></li>
                  <li>App Settings → Basic → copia el <strong>App Secret</strong></li>
                </ol>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Phone Number ID
                  </label>
                  <input
                    autoFocus
                    autoComplete="off"
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    placeholder="123456789012345"
                    className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    WABA ID <span className="ml-1 normal-case text-gray-400">(recomendado, para plantillas + auto-suscripción)</span>
                  </label>
                  <input
                    autoComplete="off"
                    value={wabaId}
                    onChange={(e) => setWabaId(e.target.value)}
                    placeholder="987654321098765"
                    className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Access Token <span className="ml-1 normal-case text-gray-400">(System User permanente)</span>
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="EAAB..."
                    className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    App Secret
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    placeholder="32 chars de Meta App → Settings → Basic"
                    className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Verify Token <span className="ml-1 normal-case text-gray-400">(opcional · te generamos uno si lo dejas vacío)</span>
                  </label>
                  <input
                    autoComplete="off"
                    value={verifyToken}
                    onChange={(e) => setVerifyToken(e.target.value)}
                    placeholder="(autogenerado)"
                    className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                  />
                </div>
              </div>

              {error ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </div>
              ) : null}
            </>
          ) : (
            // ── Step 2: connected — show webhook config + test ─────────────
            <>
              {existing?.display_phone_number ? (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">
                    Conectado a <strong>{existing.display_phone_number}</strong>
                    {existing.verified_name ? <span className="ml-1 opacity-70">· {existing.verified_name}</span> : null}
                  </p>
                  {existing.quality_rating ? (
                    <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100">
                      Calidad: {existing.quality_rating}
                    </span>
                  ) : null}
                </div>
              ) : connectResult?.phone_number ? (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">
                    Conectado a <strong>{connectResult.phone_number.display_phone_number}</strong> · {connectResult.phone_number.verified_name}
                  </p>
                </div>
              ) : null}

              {/* Webhook config block — what merchant must paste in Meta App */}
              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Configuración del webhook en Meta
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      (existing?.webhook_subscribed ?? connectResult?.webhook_subscribed)
                        ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                    }`}
                  >
                    {(existing?.webhook_subscribed ?? connectResult?.webhook_subscribed) ? 'Suscrito' : 'Pendiente'}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  En la consola de Meta App → WhatsApp → Configuration → Webhook, pega:
                </p>
                <div className="mt-3 space-y-2">
                  <CopyRow label="Callback URL" value={existing?.webhook_callback_url ?? connectResult?.webhook_callback_url ?? ''} />
                  <CopyRow label="Verify Token" value={existing?.verify_token ?? connectResult?.verify_token ?? ''} />
                </div>
                <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
                  Después suscríbete a los campos: <code className="rounded bg-gray-100 px-1 dark:bg-white/10">messages</code>, <code className="rounded bg-gray-100 px-1 dark:bg-white/10">message_template_status_update</code>, <code className="rounded bg-gray-100 px-1 dark:bg-white/10">phone_number_quality_update</code>.
                </p>
                {!(existing?.webhook_subscribed ?? connectResult?.webhook_subscribed) ? (
                  <button
                    type="button"
                    onClick={() => void handleSubscribeWebhook()}
                    disabled={submitting}
                    className="mt-3 w-full rounded-full border border-black/10 bg-white px-4 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5"
                  >
                    Re-suscribir el app a la WABA
                  </button>
                ) : null}
              </div>

              {/* Templates summary */}
              <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-black/5 bg-gray-50/50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div>
                  <p className="text-sm font-medium text-gray-950 dark:text-white">
                    {(existing?.template_count ?? connectResult?.template_count ?? 0)} plantillas aprobadas
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Las plantillas son la única forma de iniciar conversación fuera de la ventana 24h.
                  </p>
                </div>
              </div>

              {/* Send test */}
              {isConnected ? (
                <div className="mt-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Enviar plantilla de prueba <code className="ml-1 normal-case text-[10px]">hello_world</code>
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    Funciona si la plantilla <code>hello_world</code> está aprobada en tu WABA.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                      placeholder="+34 612 345 678"
                      className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#171717] dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSendTest()}
                      disabled={!testTo || testStatus === 'sending'}
                      className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/5"
                    >
                      {testStatus === 'sending' ? 'Enviando…' :
                       testStatus === 'sent' ? '✓ Enviado' :
                       testStatus === 'error' ? '⚠ Error' : 'Enviar'}
                    </button>
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-gray-50/50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          {!isStep2 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConnect()}
                disabled={submitting || !phoneNumberId || !accessToken || !appSecret}
                className="flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1eba59] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    Validando…
                  </>
                ) : (
                  'Validar y conectar'
                )}
              </button>
            </>
          ) : (
            <>
              {isConnected ? (
                <button
                  type="button"
                  onClick={() => void handleDisconnect()}
                  disabled={submitting}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                >
                  Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep2Open(false)}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white"
                >
                  ← Atrás
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
              >
                Hecho
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const CopyRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }
  return (
    <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/5">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">{label}</p>
        <p className="truncate text-[12px] font-mono text-gray-800 dark:text-gray-100">{value || '—'}</p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        disabled={!value}
        className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5"
      >
        {copied ? '✓' : 'Copiar'}
      </button>
    </div>
  );
};

export default WhatsAppConnectModal;
