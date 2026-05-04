import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { IntegrationLogo } from './logos';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    page_id?: string;
    page_name?: string;
    page_category?: string;
    verify_token?: string;
    webhook_callback_url?: string;
    webhook_subscribed?: boolean;
    last_health_check_at?: string | null;
    capabilities?: { sends?: string[]; reads?: string[] } | null;
  } | null;
}

const SCOPES = [
  { id: 'text', label: 'Texto', icon: 'chat' },
  { id: 'quick', label: 'Quick replies', icon: 'list' },
  { id: 'buttons', label: 'Botones', icon: 'smart_button' },
  { id: 'media', label: 'Media', icon: 'image' },
  { id: 'profile', label: 'Perfil usuario', icon: 'person' },
];

const MessengerConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [pageId, setPageId] = useState('');
  const [pageAccessToken, setPageAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step2, setStep2] = useState(false);
  const [connectResult, setConnectResult] = useState<{ verify_token?: string; webhook_callback_url?: string; subscribed?: boolean } | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    if (open) {
      setPageId(''); setPageAccessToken(''); setAppSecret(''); setVerifyToken('');
      setSubmitting(false); setError(null); setStep2(false); setConnectResult(null);
      setTestTo(''); setTestStatus('idle');
    }
  }, [open]);

  if (!open) return null;
  const isConnected = Boolean(existing?.page_id);
  const isStep2 = isConnected || step2;

  async function authedFetch(path: string, init?: RequestInit) {
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
    if (!pageId) return setError('Page ID required');
    if (!pageAccessToken) return setError('Page Access Token required');
    if (!appSecret) return setError('App Secret required');
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/messenger/connect', {
        method: 'POST',
        body: JSON.stringify({
          page_id: pageId.trim(),
          page_access_token: pageAccessToken.trim(),
          app_secret: appSecret.trim(),
          verify_token: verifyToken.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.metaMessage || j.error || `Server error ${res.status}`);
      }
      const json = await res.json();
      setConnectResult({ verify_token: json.verify_token, webhook_callback_url: json.webhook_callback_url, subscribed: json.subscribed });
      setStep2(true);
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Connect failed');
    } finally { setSubmitting(false); }
  }

  async function handleSendTest() {
    if (!testTo) return;
    setTestStatus('sending');
    try {
      const res = await authedFetch('/api/integrations/messenger/send-test', { method: 'POST', body: JSON.stringify({ recipient_id: testTo, text: 'Test desde Clain ✅' }) });
      if (!res.ok) throw new Error();
      setTestStatus('sent'); setTimeout(() => setTestStatus('idle'), 3000);
    } catch { setTestStatus('error'); setTimeout(() => setTestStatus('idle'), 3000); }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Messenger?')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/messenger/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.(); onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0084FF] text-white shadow-sm">
              <IntegrationLogo id="messenger" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Integración</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Facebook Messenger</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Meta Graph · Page Messaging</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:hover:bg-white/5 dark:hover:text-white">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {!isStep2 ? (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Conecta una Página de Facebook para que el agente lea mensajes entrantes y responda en hilos.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                    <span className="material-symbols-outlined text-[14px] text-[#0084FF]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Cómo obtener las credenciales</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li><a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="underline">developers.facebook.com</a> → Create app con producto "Messenger"</li>
                  <li>Messenger → Settings → Generate Page Access Token (long-lived)</li>
                  <li>App Settings → Basic → copia App Secret</li>
                  <li>Selecciona la Page → copia su <strong>Page ID</strong></li>
                </ol>
              </div>

              <div className="mt-4 space-y-3">
                <Field label="Page ID" value={pageId} onChange={setPageId} placeholder="123456789012345" />
                <Field label="Page Access Token" value={pageAccessToken} onChange={setPageAccessToken} placeholder="EAAB..." type="password" />
                <Field label="App Secret" value={appSecret} onChange={setAppSecret} placeholder="32 chars de Meta App → Settings → Basic" type="password" />
                <Field label="Verify Token (opcional · te generamos uno)" value={verifyToken} onChange={setVerifyToken} placeholder="(autogenerado)" />
              </div>

              {error ? <ErrorBox text={error} /> : null}
            </>
          ) : (
            <ConnectedView
              system="messenger"
              header={existing?.page_name || 'Page conectada'}
              subheader={existing?.page_category}
              callbackUrl={existing?.webhook_callback_url ?? connectResult?.webhook_callback_url}
              verifyToken={existing?.verify_token ?? connectResult?.verify_token}
              subscribed={existing?.webhook_subscribed ?? connectResult?.subscribed}
              testValue={testTo}
              testPlaceholder="PSID del usuario (sale en webhooks)"
              setTestValue={setTestTo}
              testStatus={testStatus}
              onSendTest={handleSendTest}
              error={error}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-gray-50/50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          {!isStep2 ? (
            <>
              <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">Cancelar</button>
              <button type="button" onClick={() => void handleConnect()} disabled={submitting || !pageId || !pageAccessToken || !appSecret} className="flex items-center gap-2 rounded-full bg-[#0084FF] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#0070d8] disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Validando…</> : 'Validar y conectar'}
              </button>
            </>
          ) : (
            <>
              {isConnected ? (
                <button type="button" onClick={() => void handleDisconnect()} disabled={submitting} className="rounded-full px-4 py-2 text-[13px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20">Desconectar</button>
              ) : (
                <button type="button" onClick={() => setStep2(false)} className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">← Atrás</button>
              )}
              <button type="button" onClick={onClose} className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90">Hecho</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Shared widgets used across the messaging modals ─────────────────────────

export const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoFocus?: boolean }> = ({ label, value, onChange, placeholder, type = 'text', autoFocus }) => (
  <div>
    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</label>
    <input
      autoFocus={autoFocus}
      type={type}
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
    />
  </div>
);

export const ErrorBox: React.FC<{ text: string }> = ({ text }) => (
  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{text}</div>
);

export const CopyRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }
  return (
    <div className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/5">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">{label}</p>
        <p className="truncate text-[12px] font-mono text-gray-800 dark:text-gray-100">{value || '—'}</p>
      </div>
      <button type="button" onClick={() => void copy()} disabled={!value} className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5">
        {copied ? '✓' : 'Copiar'}
      </button>
    </div>
  );
};

const ConnectedView: React.FC<{
  system: string;
  header: string;
  subheader?: string | null;
  callbackUrl?: string | null;
  verifyToken?: string | null;
  subscribed?: boolean;
  testValue: string;
  testPlaceholder: string;
  setTestValue: (v: string) => void;
  testStatus: 'idle' | 'sending' | 'sent' | 'error';
  onSendTest: () => Promise<void>;
  error: string | null;
}> = ({ header, subheader, callbackUrl, verifyToken, subscribed, testValue, testPlaceholder, setTestValue, testStatus, onSendTest, error }) => (
  <>
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">
        Conectado a <strong>{header}</strong>
        {subheader ? <span className="ml-1 opacity-70">· {subheader}</span> : null}
      </p>
    </div>
    <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Webhook configurado en Meta</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${subscribed ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
          {subscribed ? 'Suscrito' : 'Pendiente'}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
        En Meta App → Webhooks, pega:
      </p>
      <div className="mt-3 space-y-2">
        <CopyRow label="Callback URL" value={callbackUrl ?? ''} />
        <CopyRow label="Verify Token" value={verifyToken ?? ''} />
      </div>
    </div>
    <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Mensaje de prueba</p>
      <div className="mt-2 flex gap-2">
        <input value={testValue} onChange={(e) => setTestValue(e.target.value)} placeholder={testPlaceholder} className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white" />
        <button type="button" onClick={() => void onSendTest()} disabled={!testValue || testStatus === 'sending'} className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5">
          {testStatus === 'sending' ? 'Enviando…' : testStatus === 'sent' ? '✓ Enviado' : testStatus === 'error' ? '⚠ Error' : 'Enviar'}
        </button>
      </div>
    </div>
    {error ? <ErrorBox text={error} /> : null}
  </>
);

export default MessengerConnectModal;
