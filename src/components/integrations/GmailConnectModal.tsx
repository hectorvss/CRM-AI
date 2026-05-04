import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { IntegrationLogo } from './logos';

/**
 * Gmail uses a single track — Google OAuth. There's no manual-API-key
 * fallback like Shopify/Stripe because Gmail doesn't issue static API
 * keys; everything goes through OAuth + refresh tokens. So this modal
 * is simpler than the others.
 *
 * Shows real-time mode after install: 'pubsub' (push notifications,
 * sub-second latency) vs 'polling' (1-min cron). The merchant doesn't
 * choose — we use Pub/Sub if `GMAIL_PUBSUB_TOPIC` is configured, fall
 * back to polling otherwise.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    email?: string;
    display_name?: string | null;
    scope?: string;
    realtime_mode?: 'pubsub' | 'polling';
    watch_expiration?: string | null;
    history_id?: string | null;
    last_health_check_at?: string | null;
    capabilities?: { reads?: string[]; writes?: string[]; realtime?: string } | null;
  } | null;
}

const SCOPES_HUMAN = [
  { id: 'read', label: 'Leer mensajes', icon: 'mark_email_read' },
  { id: 'send', label: 'Enviar respuestas', icon: 'send' },
  { id: 'labels', label: 'Etiquetas', icon: 'label' },
  { id: 'attachments', label: 'Adjuntos', icon: 'attachment' },
  { id: 'threads', label: 'Hilos', icon: 'forum' },
  { id: 'drafts', label: 'Borradores', icon: 'drafts' },
];

const GmailConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
      setSyncStatus('idle');
    }
  }, [open]);

  if (!open) return null;
  const isConnected = Boolean(existing?.email);

  async function handleOAuthInstall(loginHint?: string) {
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError('Sesión expirada — vuelve a iniciar sesión.');
        setSubmitting(false);
        return;
      }
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const url = new URL(`${apiBase}/api/integrations/gmail/install`, window.location.origin);
      if (loginHint) url.searchParams.set('email', loginHint);
      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Server error ${res.status}`);
      }
      const { url: redirectUrl } = await res.json();
      window.location.assign(redirectUrl);
    } catch (err: any) {
      setError(err?.message || 'No se pudo iniciar la conexión con Gmail');
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Gmail? Dejaremos de recibir emails entrantes y no podremos enviar respuestas.')) return;
    setSubmitting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/gmail/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      onChanged?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo desconectar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleManualSync() {
    setSyncStatus('running');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/gmail/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) {
        setSyncStatus('error');
        return;
      }
      setSyncStatus('done');
      onChanged?.();
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch {
      setSyncStatus('error');
    }
  }

  const realtime = existing?.realtime_mode ?? 'polling';

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
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-[#1b1b1b] dark:ring-white/10">
              {/* Gmail-style envelope rendered as SVG so we keep the brand colors */}
              <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true">
                <path fill="#4285F4" d="M24 9.5L4 24v15a3 3 0 0 0 3 3h6V26.5L24 18l11 8.5V42h6a3 3 0 0 0 3-3V24z"/>
                <path fill="#34A853" d="M13 42V26.5L4 24v15a3 3 0 0 0 3 3z"/>
                <path fill="#FBBC04" d="M35 42h6a3 3 0 0 0 3-3V24l-9 2.5z"/>
                <path fill="#EA4335" d="M44 24v-2.5L24 9.5 4 21.5V24l9 2.5L24 18l11 8.5z"/>
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Integración</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Gmail</h2>
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
        <div className="px-6 py-5">
          {isConnected ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">
                  Conectado a <strong>{existing?.email}</strong>
                  {existing?.display_name ? <span className="ml-1 opacity-70">· {existing.display_name}</span> : null}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    realtime === 'pubsub'
                      ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                  }`}
                >
                  {realtime === 'pubsub' ? 'Tiempo real' : 'Polling'}
                </span>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                  Permisos concedidos
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SCOPES_HUMAN.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded-xl bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 dark:bg-white/5 dark:text-gray-200"
                    >
                      <span className="material-symbols-outlined text-[14px] text-gray-500">{s.icon}</span>
                      {s.label}
                    </div>
                  ))}
                </div>
                {existing?.last_health_check_at ? (
                  <p className="mt-3 text-[11px] text-gray-400">
                    Última verificación: {new Date(existing.last_health_check_at).toLocaleString()}
                  </p>
                ) : null}
                {realtime === 'polling' ? (
                  <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    <span className="material-symbols-outlined text-[14px]">info</span>
                    <span>
                      Pub/Sub no configurado en tu workspace — usamos polling cada minuto. Para tiempo real, define <code className="rounded bg-white/60 px-1 text-[10px] dark:bg-black/30">GMAIL_PUBSUB_TOPIC</code> en el servidor.
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-black/5 bg-gray-50/50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div>
                  <p className="text-sm font-medium text-gray-950 dark:text-white">Sincronización manual</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Trae los mensajes nuevos desde el último <code className="text-[10px]">historyId</code>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleManualSync()}
                  disabled={syncStatus === 'running'}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5"
                >
                  {syncStatus === 'running' ? 'Sincronizando…' : syncStatus === 'done' ? '✓ Sincronizado' : 'Sincronizar ahora'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Conecta tu bandeja de Gmail para que el agente lea emails entrantes, abra cases automáticamente y responda en hilos existentes.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES_HUMAN.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#4285F4]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Lo que sí pediremos</p>
                <p className="mt-1 leading-relaxed">
                  Acceso de lectura/escritura sólo a la cuenta que conectes. No leemos ni accedemos a otras cuentas de tu organización aunque uses Google Workspace.
                </p>
              </div>

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
          {isConnected ? (
            <>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                disabled={submitting}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
              >
                Desconectar
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleOAuthInstall(existing?.email)}
                  disabled={submitting}
                  className="rounded-full border border-black/10 px-4 py-2 text-[13px] font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
                >
                  Reconectar
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
                >
                  Hecho
                </button>
              </div>
            </>
          ) : (
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
                onClick={() => void handleOAuthInstall()}
                disabled={submitting}
                className="flex items-center gap-2 rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-gray-950 shadow-sm ring-1 ring-black/10 transition hover:bg-gray-50 disabled:opacity-50 dark:bg-[#1b1b1b] dark:text-white dark:ring-white/10 dark:hover:bg-white/5"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    Abriendo Google…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
                      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.61z"/>
                      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z"/>
                      <path fill="#FBBC04" d="M3.97 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08z"/>
                      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
                    </svg>
                    Conectar con Google
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GmailConnectModal;
