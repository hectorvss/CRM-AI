import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { Field, ErrorBox, CopyRow } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    ig_user_id?: string;
    page_id?: string;
    username?: string;
    name?: string | null;
    profile_picture_url?: string | null;
    followers_count?: number | null;
    verify_token?: string;
    webhook_callback_url?: string;
    webhook_subscribed?: boolean;
    last_health_check_at?: string | null;
    capabilities?: { sends?: string[]; reads?: string[] } | null;
  } | null;
}

const SCOPES = [
  { id: 'text', label: 'DMs', icon: 'chat' },
  { id: 'quick', label: 'Quick replies', icon: 'list' },
  { id: 'media', label: 'Media', icon: 'image' },
  { id: 'comments', label: 'Comentarios', icon: 'comment' },
  { id: 'mentions', label: 'Menciones / Stories', icon: 'alternate_email' },
  { id: 'profile', label: 'Perfil usuario', icon: 'person' },
];

const InstagramConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [igUserId, setIgUserId] = useState('');
  const [pageId, setPageId] = useState('');
  const [pageAccessToken, setPageAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step2, setStep2] = useState(false);
  const [connectResult, setConnectResult] = useState<{ verify_token?: string; webhook_callback_url?: string; subscribed?: boolean; account?: any } | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    if (open) {
      setIgUserId(''); setPageId(''); setPageAccessToken(''); setAppSecret(''); setVerifyToken('');
      setSubmitting(false); setError(null); setStep2(false); setConnectResult(null);
      setTestTo(''); setTestStatus('idle');
    }
  }, [open]);

  if (!open) return null;
  const isConnected = Boolean(existing?.ig_user_id);
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
    if (!igUserId) return setError('IG User ID required');
    if (!pageId) return setError('Page ID required');
    if (!pageAccessToken) return setError('Page Access Token required');
    if (!appSecret) return setError('App Secret required');
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/instagram/connect', {
        method: 'POST',
        body: JSON.stringify({
          ig_user_id: igUserId.trim(),
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
      setConnectResult({ verify_token: json.verify_token, webhook_callback_url: json.webhook_callback_url, subscribed: json.subscribed, account: json.account });
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
      const res = await authedFetch('/api/integrations/instagram/send-test', { method: 'POST', body: JSON.stringify({ recipient_id: testTo, text: 'Test desde Clain ✅' }) });
      if (!res.ok) throw new Error();
      setTestStatus('sent'); setTimeout(() => setTestStatus('idle'), 3000);
    } catch { setTestStatus('error'); setTimeout(() => setTestStatus('idle'), 3000); }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Instagram?')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/instagram/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.(); onClose();
    } finally { setSubmitting(false); }
  }

  const headerLabel = existing?.username ? `@${existing.username}` : connectResult?.account?.username ? `@${connectResult.account.username}` : 'IG conectada';

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: 'linear-gradient(45deg, #FEDA77 0%, #F58529 25%, #DD2A7B 50%, #8134AF 75%, #515BD4 100%)' }}>
              <IntegrationLogo id="instagram" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Integración</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Instagram</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Meta Graph · Direct Messages + Comments</p>
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
                Tu cuenta Instagram debe ser <strong>Business</strong> o <strong>Creator</strong> y estar enlazada a una Página de Facebook.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                    <span className="material-symbols-outlined text-[14px] text-[#DD2A7B]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Cómo obtener las credenciales</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>Meta App con producto <strong>Instagram</strong> y <strong>Messenger</strong></li>
                  <li>Conecta la cuenta IG Business a su Facebook Page (en Meta Business Suite)</li>
                  <li>Graph API Explorer → busca el Page Access Token con scopes <code className="rounded bg-white/40 px-1 dark:bg-black/30">instagram_basic</code> + <code className="rounded bg-white/40 px-1 dark:bg-black/30">instagram_manage_messages</code> + <code className="rounded bg-white/40 px-1 dark:bg-black/30">pages_messaging</code></li>
                  <li>Llama <code className="rounded bg-white/40 px-1 dark:bg-black/30">{`/{page-id}?fields=instagram_business_account`}</code> para obtener el <strong>IG User ID</strong></li>
                </ol>
              </div>

              <div className="mt-4 space-y-3">
                <Field label="IG Business Account ID" value={igUserId} onChange={setIgUserId} placeholder="17841400000000000" autoFocus />
                <Field label="Linked Page ID" value={pageId} onChange={setPageId} placeholder="123456789012345" />
                <Field label="Page Access Token" value={pageAccessToken} onChange={setPageAccessToken} type="password" placeholder="EAAB..." />
                <Field label="App Secret" value={appSecret} onChange={setAppSecret} type="password" placeholder="32 chars" />
                <Field label="Verify Token (opcional)" value={verifyToken} onChange={setVerifyToken} placeholder="(autogenerado)" />
              </div>

              {error ? <ErrorBox text={error} /> : null}
            </>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                {existing?.profile_picture_url || connectResult?.account?.profile_picture_url ? (
                  <img src={existing?.profile_picture_url ?? connectResult?.account?.profile_picture_url} alt="" className="h-8 w-8 rounded-full" />
                ) : <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">
                  Conectado como <strong>{headerLabel}</strong>
                </p>
                {(existing?.followers_count ?? connectResult?.account?.followers_count) ? (
                  <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100">
                    {(existing?.followers_count ?? connectResult?.account?.followers_count)?.toLocaleString()} followers
                  </span>
                ) : null}
              </div>

              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Webhook en Meta</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${(existing?.webhook_subscribed ?? connectResult?.subscribed) ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
                    {(existing?.webhook_subscribed ?? connectResult?.subscribed) ? 'Suscrito' : 'Pendiente'}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  En Meta App → Webhooks → Instagram, pega:
                </p>
                <div className="mt-3 space-y-2">
                  <CopyRow label="Callback URL" value={existing?.webhook_callback_url ?? connectResult?.webhook_callback_url ?? ''} />
                  <CopyRow label="Verify Token" value={existing?.verify_token ?? connectResult?.verify_token ?? ''} />
                </div>
                <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
                  Suscríbete a: <code className="rounded bg-gray-100 px-1 dark:bg-white/10">messages</code>, <code className="rounded bg-gray-100 px-1 dark:bg-white/10">messaging_postbacks</code>, <code className="rounded bg-gray-100 px-1 dark:bg-white/10">comments</code>, <code className="rounded bg-gray-100 px-1 dark:bg-white/10">mentions</code>.
                </p>
              </div>

              {isConnected ? (
                <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Mensaje de prueba</p>
                  <div className="mt-2 flex gap-2">
                    <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="IGSID del usuario (sale en webhooks)" className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white" />
                    <button type="button" onClick={() => void handleSendTest()} disabled={!testTo || testStatus === 'sending'} className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5">
                      {testStatus === 'sending' ? 'Enviando…' : testStatus === 'sent' ? '✓ Enviado' : testStatus === 'error' ? '⚠ Error' : 'Enviar'}
                    </button>
                  </div>
                </div>
              ) : null}

              {error ? <ErrorBox text={error} /> : null}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-gray-50/50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          {!isStep2 ? (
            <>
              <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">Cancelar</button>
              <button type="button" onClick={() => void handleConnect()} disabled={submitting || !igUserId || !pageId || !pageAccessToken || !appSecret} className="flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-semibold text-white transition disabled:opacity-50" style={{ background: 'linear-gradient(45deg, #F58529 0%, #DD2A7B 50%, #8134AF 100%)' }}>
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

export default InstagramConnectModal;
