import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { Field, ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

/**
 * Postmark connect modal — paste a Server Token (optional Account Token
 * for cross-server admin like domain DKIM verification). After validate
 * we display server name, sender signatures (if account token present),
 * template count, and a test-send box.
 */

interface Signature {
  id: number;
  email: string;
  domain: string;
  name?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    server_id?: number;
    server_name?: string;
    server_color?: string;
    default_from_address?: string | null;
    default_from_name?: string | null;
    webhook_id?: number | null;
    webhook_url?: string;
    webhook_registered?: boolean;
    webhook_error?: string | null;
    has_account_token?: boolean;
    template_count?: number;
    signatures?: Signature[];
    last_health_check_at?: string | null;
    capabilities?: { sends?: string[]; reads?: string[]; admin?: string[] } | null;
  } | null;
}

const SCOPES = [
  { id: 'send', label: 'Enviar transaccional', icon: 'send' },
  { id: 'templates', label: 'Plantillas dinámicas', icon: 'description' },
  { id: 'tracking', label: 'Open / Click tracking', icon: 'visibility' },
  { id: 'bounces', label: 'Bounces / spam', icon: 'report' },
  { id: 'attachments', label: 'Adjuntos', icon: 'attachment' },
  { id: 'batch', label: 'Envío en lote', icon: 'group' },
];

const PostmarkConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [serverToken, setServerToken] = useState('');
  const [accountToken, setAccountToken] = useState('');
  const [defaultFrom, setDefaultFrom] = useState('');
  const [defaultName, setDefaultName] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testError, setTestError] = useState<string | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultFromEdit, setDefaultFromEdit] = useState('');
  const [defaultNameEdit, setDefaultNameEdit] = useState('');

  useEffect(() => {
    if (open) {
      setServerToken(''); setAccountToken(''); setDefaultFrom(''); setDefaultName('');
      setAdvancedOpen(false); setSubmitting(false); setError(null);
      setTestTo(''); setTestStatus('idle'); setTestError(null);
      setDefaultFromEdit(existing?.default_from_address ?? '');
      setDefaultNameEdit(existing?.default_from_name ?? '');
    }
  }, [open, existing?.default_from_address, existing?.default_from_name]);

  if (!open) return null;
  const isConnected = Boolean(existing?.server_id);

  async function authedFetch(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
    return fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token ?? ''}`,
        ...(init?.body && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  async function handleConnect() {
    setError(null);
    if (!serverToken) return setError('Server Token required');
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/postmark/connect', {
        method: 'POST',
        body: JSON.stringify({
          server_token: serverToken.trim(),
          account_token: accountToken.trim() || undefined,
          default_from_address: defaultFrom.trim() || undefined,
          default_from_name: defaultName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.postmarkMessage || j.error || `Server error ${res.status}`);
      }
      onChanged?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Connect failed');
    } finally { setSubmitting(false); }
  }

  async function handleSendTest() {
    if (!testTo) return;
    setTestStatus('sending'); setTestError(null);
    try {
      const res = await authedFetch('/api/integrations/postmark/send-test', {
        method: 'POST',
        body: JSON.stringify({
          to: testTo,
          subject: 'Test desde Clain ✅',
          text: 'Este es un email transaccional de prueba enviado por Clain a través de Postmark.\n\nSi llega correctamente, la integración está funcionando.\n\n— El equipo',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.details || j.error || `${res.status}`);
      }
      setTestStatus('sent'); setTimeout(() => setTestStatus('idle'), 4000);
    } catch (err: any) {
      setTestError(err?.message || 'Test failed');
      setTestStatus('error'); setTimeout(() => { setTestStatus('idle'); setTestError(null); }, 4500);
    }
  }

  async function handleSaveDefaults() {
    setSavingDefaults(true);
    try {
      const res = await authedFetch('/api/integrations/postmark/defaults', {
        method: 'PATCH',
        body: JSON.stringify({
          default_from_address: defaultFromEdit.trim(),
          default_from_name: defaultNameEdit.trim(),
        }),
      });
      if (!res.ok) throw new Error();
      onChanged?.();
    } finally { setSavingDefaults(false); }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Postmark? Quitaremos el webhook y dejaremos de poder enviar emails.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/postmark/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.(); onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFDE00] text-[#1F2937] shadow-sm">
              <IntegrationLogo id="postmark" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Integración</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Postmark</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Email transaccional · alta deliverability</p>
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
                  Conectado al servidor <strong>{existing?.server_name}</strong>
                </p>
                <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100">
                  {existing?.template_count ?? 0} plantillas
                </span>
              </div>

              {/* Sender signatures */}
              {existing?.signatures && existing.signatures.length > 0 ? (
                <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Sender signatures verificadas</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {existing.signatures.map((s) => (
                      <span key={s.id} className="rounded-full border border-black/5 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                        {s.email}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Default from */}
              <div className="mt-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Remitente por defecto</p>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Lo que sale en el "From:" de cada email automático del agente.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <input
                    value={defaultFromEdit}
                    onChange={(e) => setDefaultFromEdit(e.target.value)}
                    placeholder="soporte@tudominio.com"
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#171717] dark:text-white"
                  />
                  <input
                    value={defaultNameEdit}
                    onChange={(e) => setDefaultNameEdit(e.target.value)}
                    placeholder="Tu Marca · Soporte"
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#171717] dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveDefaults()}
                  disabled={savingDefaults || (defaultFromEdit === (existing?.default_from_address ?? '') && defaultNameEdit === (existing?.default_from_name ?? ''))}
                  className="mt-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/5"
                >
                  {savingDefaults ? 'Guardando…' : 'Guardar'}
                </button>
              </div>

              {/* Webhook */}
              <div className="mt-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Webhook (deliveries / bounces / opens / clicks)</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${existing?.webhook_registered ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
                    {existing?.webhook_registered ? 'Registrado' : 'No registrado'}
                  </span>
                </div>
                {existing?.webhook_error ? (
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">{existing.webhook_error}</p>
                ) : null}
              </div>

              {/* Test send */}
              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Email de prueba</p>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Pega tu email para verificar que el sender está configurado correctamente.
                </p>
                <div className="mt-2 flex gap-2">
                  <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="tu@email.com" className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white" />
                  <button type="button" onClick={() => void handleSendTest()} disabled={!testTo || testStatus === 'sending'} className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5">
                    {testStatus === 'sending' ? 'Enviando…' : testStatus === 'sent' ? '✓ Enviado' : testStatus === 'error' ? '⚠ Error' : 'Enviar'}
                  </button>
                </div>
                {testError ? <ErrorBox text={testError} /> : null}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Conexión vía Server Token. Crea un Server en{' '}
                <a href="https://account.postmarkapp.com/servers" target="_blank" rel="noreferrer" className="underline">postmarkapp.com</a>{' '}
                y copia su API Token.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                    <span className="material-symbols-outlined text-[14px] text-amber-600">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Cómo obtener el Server Token</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>Postmark Dashboard → Servers → tu Server → API Tokens</li>
                  <li>Copia el <strong>Server API Token</strong> (empieza por hex de 36 chars)</li>
                  <li>Verifica un dominio o sender signature en Postmark si aún no lo has hecho</li>
                  <li>Pega aquí abajo</li>
                </ol>
              </div>

              <div className="mt-4 space-y-3">
                <Field label="Server Token" value={serverToken} onChange={setServerToken} type="password" placeholder="abc12345-6789-..." autoFocus />
                <Field label="Default From Address" value={defaultFrom} onChange={setDefaultFrom} placeholder="soporte@tudominio.com" />
                <Field label="Default From Name (opcional)" value={defaultName} onChange={setDefaultName} placeholder="Tu Marca · Soporte" />
              </div>

              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="mt-5 flex w-full items-center justify-between text-left text-[12px] font-medium text-gray-500 transition hover:text-gray-950 dark:hover:text-white"
              >
                <span>Avanzado · añadir Account Token (admin de dominios + DKIM)</span>
                <span className="material-symbols-outlined text-[16px]">
                  {advancedOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {advancedOpen ? (
                <div className="mt-3 space-y-3 rounded-2xl border border-black/5 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Opcional. Sólo si quieres que Clain pueda listar/verificar dominios y sender signatures por API. Sin esto el envío y los webhooks funcionan igual.
                  </p>
                  <Field label="Account API Token" value={accountToken} onChange={setAccountToken} type="password" placeholder="Postmark Account → API Tokens" />
                </div>
              ) : null}

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
              <button type="button" onClick={() => void handleConnect()} disabled={submitting || !serverToken} className="flex items-center gap-2 rounded-full bg-amber-500 px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Validando…</> : 'Validar y conectar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PostmarkConnectModal;
