import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { Field, ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    bot_id?: number;
    bot_username?: string;
    bot_name?: string;
    webhook_set?: boolean;
    webhook_callback_url?: string;
    webhook_pending_updates?: number | null;
    webhook_last_error?: string | null;
    last_health_check_at?: string | null;
    capabilities?: { sends?: string[]; reads?: string[] } | null;
  } | null;
}

const SCOPES = [
  { id: 'text', label: 'Texto', icon: 'chat' },
  { id: 'media', label: 'Foto / video / audio', icon: 'image' },
  { id: 'inline', label: 'Botones inline', icon: 'smart_button' },
  { id: 'edit', label: 'Editar / borrar', icon: 'edit' },
  { id: 'commands', label: 'Slash commands', icon: 'terminal' },
];

const TelegramConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [botToken, setBotToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    if (open) {
      setBotToken(''); setSubmitting(false); setError(null);
      setTestTo(''); setTestStatus('idle');
    }
  }, [open]);

  if (!open) return null;
  const isConnected = Boolean(existing?.bot_id);

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
    if (!botToken) return setError('Bot token required');
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/telegram/connect', {
        method: 'POST',
        body: JSON.stringify({ bot_token: botToken.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.telegramMessage || j.error || `Server error ${res.status}`);
      }
      onChanged?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Connect failed');
    } finally { setSubmitting(false); }
  }

  async function handleSendTest() {
    if (!testTo) return;
    setTestStatus('sending');
    try {
      const res = await authedFetch('/api/integrations/telegram/send-test', {
        method: 'POST',
        body: JSON.stringify({ chat_id: /^-?\d+$/.test(testTo) ? Number(testTo) : testTo, text: 'Test desde Clain ✅' }),
      });
      if (!res.ok) throw new Error();
      setTestStatus('sent'); setTimeout(() => setTestStatus('idle'), 3000);
    } catch { setTestStatus('error'); setTimeout(() => setTestStatus('idle'), 3000); }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar el bot? Quitaremos el webhook de Telegram.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/telegram/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.(); onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#229ED9] text-white shadow-sm">
              <IntegrationLogo id="telegram" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Integración</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Telegram</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Bot API · @BotFather</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:hover:bg-white/5 dark:hover:text-white">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {isConnected ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">
                  Bot conectado: <strong>@{existing?.bot_username}</strong>
                  {existing?.bot_name ? <span className="ml-1 opacity-70">· {existing.bot_name}</span> : null}
                </p>
                {existing?.webhook_set ? (
                  <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100">Webhook OK</span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Webhook pendiente</span>
                )}
              </div>

              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Capacidades</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SCOPES.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 dark:bg-white/5 dark:text-gray-200">
                      <span className="material-symbols-outlined text-[14px] text-[#229ED9]">{s.icon}</span>
                      {s.label}
                    </div>
                  ))}
                </div>
                {existing?.webhook_pending_updates !== null && existing?.webhook_pending_updates !== undefined && existing.webhook_pending_updates > 0 ? (
                  <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300">
                    Hay {existing.webhook_pending_updates} updates pendientes en cola.
                  </p>
                ) : null}
                {existing?.webhook_last_error ? (
                  <p className="mt-2 text-[11px] text-red-700 dark:text-red-300">
                    Último error: {existing.webhook_last_error}
                  </p>
                ) : null}
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Mensaje de prueba</p>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Tu propio chat ID o un grupo donde el bot ya esté añadido. El usuario debe haber escrito al bot al menos una vez.
                </p>
                <div className="mt-2 flex gap-2">
                  <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="123456789 ó @canalpublico" className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white" />
                  <button type="button" onClick={() => void handleSendTest()} disabled={!testTo || testStatus === 'sending'} className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5">
                    {testStatus === 'sending' ? 'Enviando…' : testStatus === 'sent' ? '✓ Enviado' : testStatus === 'error' ? '⚠ Error' : 'Enviar'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Crea un bot con <strong>@BotFather</strong> en Telegram y pega su token aquí. Configuraremos el webhook automáticamente.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                    <span className="material-symbols-outlined text-[14px] text-[#229ED9]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Cómo crear un bot en 30 segundos</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>Abre Telegram y escribe a <a href="https://t.me/botfather" target="_blank" rel="noreferrer" className="underline">@BotFather</a></li>
                  <li>Manda <code className="rounded bg-white/40 px-1 dark:bg-black/30">/newbot</code> y elige nombre + username</li>
                  <li>BotFather te devuelve un token tipo <code className="rounded bg-white/40 px-1 dark:bg-black/30">123456:ABC-...</code></li>
                  <li>Pégalo abajo</li>
                </ol>
              </div>
              <div className="mt-4">
                <Field label="Bot Token" value={botToken} onChange={setBotToken} type="password" placeholder="123456:ABC-..." autoFocus />
              </div>
              {error ? <ErrorBox text={error} /> : null}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-gray-50/50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          {isConnected ? (
            <>
              <button type="button" onClick={() => void handleDisconnect()} disabled={submitting} className="rounded-full px-4 py-2 text-[13px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20">Desconectar</button>
              <button type="button" onClick={onClose} className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90">Hecho</button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">Cancelar</button>
              <button type="button" onClick={() => void handleConnect()} disabled={submitting || !botToken} className="flex items-center gap-2 rounded-full bg-[#229ED9] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1c87b8] disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Validando…</> : 'Validar y conectar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TelegramConnectModal;
