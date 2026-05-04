import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { IntegrationLogo } from './logos';

/**
 * Outlook / Microsoft 365 mail. OAuth-only (Microsoft Identity v2);
 * mirror of GmailConnectModal so merchants on either provider get the
 * same one-click feel.
 *
 * Real-time mode is determined by whether Microsoft Graph accepted our
 * subscription. Subscriptions max out at 70 hours so a cron renews them.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    email?: string;
    display_name?: string | null;
    scope?: string;
    realtime_mode?: 'webhook' | 'polling';
    subscription_id?: string | null;
    subscription_expires_at?: string | null;
    last_health_check_at?: string | null;
    capabilities?: { reads?: string[]; writes?: string[]; realtime?: string } | null;
  } | null;
}

const SCOPES_HUMAN = [
  { id: 'read', label: 'Leer mensajes', icon: 'mark_email_read' },
  { id: 'send', label: 'Enviar respuestas', icon: 'send' },
  { id: 'reply', label: 'Responder en hilo', icon: 'reply' },
  { id: 'forward', label: 'Reenviar', icon: 'forward' },
  { id: 'folders', label: 'Carpetas', icon: 'folder' },
  { id: 'attachments', label: 'Adjuntos', icon: 'attachment' },
];

const OutlookConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
      setSyncStatus('idle');
      setUnreadCount(null);
    }
  }, [open]);

  if (!open) return null;
  const isConnected = Boolean(existing?.email);
  const realtime = existing?.realtime_mode ?? 'polling';

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
      const url = new URL(`${apiBase}/api/integrations/outlook/install`, window.location.origin);
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
      setError(err?.message || 'No se pudo iniciar la conexión con Microsoft');
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Outlook? Dejaremos de recibir emails entrantes y no podremos enviar respuestas.')) return;
    setSubmitting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/outlook/disconnect`, {
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
      const res = await fetch(`${apiBase}/api/integrations/outlook/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) {
        setSyncStatus('error');
        return;
      }
      const json = await res.json();
      setUnreadCount(json.unread_count ?? null);
      setSyncStatus('done');
      onChanged?.();
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch {
      setSyncStatus('error');
    }
  }

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
              {/* Outlook envelope SVG */}
              <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
                <path d="M28 8H14a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V10a2 2 0 00-2-2z" fill="#0078D4"/>
                <path d="M28 8L21 13.5 14 8" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
                <path d="M2 7l11-2v22L2 25V7z" fill="#0078D4"/>
                <text x="7.5" y="20" fill="#fff" fontFamily="Segoe UI, sans-serif" fontSize="9" fontWeight="700" textAnchor="middle">O</text>
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Integración</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Outlook</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Microsoft 365 · Microsoft Graph</p>
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
                    realtime === 'webhook'
                      ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                  }`}
                >
                  {realtime === 'webhook' ? 'Tiempo real' : 'Polling'}
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
                {existing?.subscription_expires_at ? (
                  <p className="mt-3 text-[11px] text-gray-400">
                    Suscripción Graph caduca: {new Date(existing.subscription_expires_at).toLocaleString()}{' '}
                    <span className="opacity-60">(se renueva automáticamente)</span>
                  </p>
                ) : null}
                {existing?.last_health_check_at ? (
                  <p className="mt-1 text-[11px] text-gray-400">
                    Última verificación: {new Date(existing.last_health_check_at).toLocaleString()}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-black/5 bg-gray-50/50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div>
                  <p className="text-sm font-medium text-gray-950 dark:text-white">Sincronización manual</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Lista los mensajes no leídos del Inbox para verificar acceso.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleManualSync()}
                  disabled={syncStatus === 'running'}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5"
                >
                  {syncStatus === 'running' ? 'Sincronizando…' :
                   syncStatus === 'done' ? `✓ ${unreadCount ?? 0} sin leer` :
                   syncStatus === 'error' ? '⚠ Error' : 'Sincronizar ahora'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Conecta tu bandeja de Outlook (Microsoft 365 personal o de empresa) para que el agente lea emails entrantes, abra cases automáticamente y responda en hilos existentes.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES_HUMAN.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#0078D4]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Lo que sí pediremos</p>
                <p className="mt-1 leading-relaxed">
                  Acceso de lectura/escritura sólo a la cuenta que conectes. Si tu organización requiere consentimiento del administrador para apps externas, te lo pedirá Microsoft directamente.
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
                className="flex items-center gap-2 rounded-full bg-[#0078D4] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#106ebe] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    Abriendo Microsoft…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 23 23" width="16" height="16" aria-hidden="true">
                      <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                      <rect x="12" y="1" width="10" height="10" fill="#7FBA00"/>
                      <rect x="1" y="12" width="10" height="10" fill="#00A4EF"/>
                      <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
                    </svg>
                    Conectar con Microsoft
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

export default OutlookConnectModal;
