import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    team_id?: string;
    team_name?: string | null;
    bot_user_id?: string | null;
    app_id?: string | null;
    is_enterprise_install?: boolean;
    enterprise_name?: string | null;
    scopes?: string[];
    capabilities?: { reads?: string[]; writes?: string[]; events?: string[] } | null;
  } | null;
}

const SCOPES = [
  { id: 'msg',     label: 'Post messages, threads y replies',           icon: 'chat' },
  { id: 'users',   label: 'Lookup users · email · profile',             icon: 'group' },
  { id: 'channels',label: 'Channels · groups · DMs',                    icon: 'tag' },
  { id: 'reaction',label: 'Reacciones + status updates',                icon: 'sentiment_satisfied' },
  { id: 'files',   label: 'Subir archivos / screenshots',               icon: 'attach_file' },
  { id: 'cmd',     label: 'Slash commands · Block Kit modals',          icon: 'terminal' },
  { id: 'home',    label: 'App Home tab + interactividad',              icon: 'home' },
  { id: 'events',  label: 'Events API: message, mention, reactions',    icon: 'graph_2' },
];

const SlackConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testError, setTestError] = useState<string | null>(null);
  const [testChannel, setTestChannel] = useState('');
  const [testText, setTestText] = useState('Hola desde Clain · prueba de integración Slack ✓');
  const [channels, setChannels] = useState<Array<{ id: string; name: string; is_private: boolean; num_members?: number }>>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setSubmitting(false); setError(null);
      setTestStatus('idle'); setTestError(null);
      setTestChannel(''); setCopied(false);
      if (existing?.team_id) void loadChannels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.team_id]);

  if (!open) return null;
  const isConnected = Boolean(existing?.team_id);

  async function authedFetch(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
    return fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token ?? ''}`,
        Accept: 'application/json',
        ...(init?.body && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  async function handleInstall() {
    setError(null); setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/slack/install');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Error ${res.status}`);
      }
      const j = await res.json();
      if (j.url) window.location.href = j.url;
    } catch (err: any) {
      setError(err?.message || 'No se pudo iniciar el install de Slack');
      setSubmitting(false);
    }
  }

  async function loadChannels() {
    setLoadingChannels(true);
    try {
      const res = await authedFetch('/api/integrations/slack/channels');
      const j = await res.json();
      if (res.ok && Array.isArray(j.channels)) setChannels(j.channels);
    } finally { setLoadingChannels(false); }
  }

  async function handlePostTest() {
    if (!testChannel) return;
    setTestStatus('sending'); setTestError(null);
    try {
      const res = await authedFetch('/api/integrations/slack/post-test', {
        method: 'POST',
        body: JSON.stringify({ channel: testChannel, text: testText }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.details || j.slack_error || j.error || `${res.status}`);
      setTestStatus('sent'); setTimeout(() => setTestStatus('idle'), 4000);
    } catch (err: any) {
      setTestError(err?.message || 'Test failed'); setTestStatus('error');
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Slack? Revocaremos el bot token y dejaremos de procesar eventos.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/slack/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.(); onClose();
    } finally { setSubmitting(false); }
  }

  const eventsUrl = `${window.location.origin}/webhooks/slack`;
  const interactivityUrl = `${window.location.origin}/webhooks/slack/interactivity`;
  const commandsUrl = `${window.location.origin}/webhooks/slack/commands`;

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#4A154B] text-white shadow-sm">
              <IntegrationLogo id="slack" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Comunicación</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Slack</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Inbox + AI Agent dentro de Slack</p>
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
                  Conectado a workspace <strong>{existing?.team_name || existing?.team_id}</strong>
                  {existing?.is_enterprise_install ? <> · Enterprise Grid {existing?.enterprise_name ? `(${existing.enterprise_name})` : ''}</> : null}
                </p>
              </div>

              {/* Webhook URLs */}
              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Endpoints para Slack App config</p>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  En api.slack.com/apps → tu App → pega cada URL en su sección.
                </p>
                {[
                  { label: 'Event Subscriptions → Request URL', url: eventsUrl },
                  { label: 'Interactivity & Shortcuts → Request URL', url: interactivityUrl },
                  { label: 'Slash Commands → Request URL', url: commandsUrl },
                ].map((row, i) => (
                  <div key={i} className="mt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{row.label}</span>
                      <button type="button" onClick={() => copy(row.url)} className="text-[11px] font-medium text-[#4A154B] hover:underline dark:text-[#E0B0FF]">
                        {copied ? '✓ Copiado' : 'Copiar'}
                      </button>
                    </div>
                    <code className="mt-1 block break-all rounded-xl bg-gray-50 px-2.5 py-2 text-[11px] text-gray-700 dark:bg-white/5 dark:text-gray-200">{row.url}</code>
                  </div>
                ))}
              </div>

              {/* Channels picker + test */}
              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar post a un channel</p>
                  <button type="button" onClick={() => void loadChannels()} disabled={loadingChannels} className="text-[11px] font-medium text-gray-500 hover:text-gray-950 dark:hover:text-white disabled:opacity-50">
                    {loadingChannels ? 'Cargando…' : 'Refrescar'}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  El bot debe estar invitado al channel (`/invite @Clain`) para que pueda postear.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <select value={testChannel} onChange={(e) => setTestChannel(e.target.value)} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white">
                    <option value="">Elige un channel…</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.is_private ? '🔒 ' : '# '}{c.name}{c.num_members ? ` · ${c.num_members}` : ''}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void handlePostTest()} disabled={!testChannel || testStatus === 'sending'} className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5">
                    {testStatus === 'sending' ? 'Enviando…' : testStatus === 'sent' ? '✓ Posted' : testStatus === 'error' ? '⚠ Error' : 'Postear'}
                  </button>
                </div>
                <textarea
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  rows={2}
                  className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white"
                />
                {testError ? <ErrorBox text={testError} /> : null}
              </div>

              {/* Capabilities */}
              <div className="mt-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Capacidades activas</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(existing?.capabilities?.reads ?? []).map((c) => (
                    <span key={`r-${c}`} className="rounded-full border border-black/5 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">{c}</span>
                  ))}
                  {(existing?.capabilities?.writes ?? []).map((c) => (
                    <span key={`w-${c}`} className="rounded-full border border-purple-300/60 bg-purple-50 px-2 py-0.5 text-[10px] text-purple-800 dark:border-purple-700/50 dark:bg-purple-900/20 dark:text-purple-200">{c}</span>
                  ))}
                </div>
                {existing?.scopes?.length ? (
                  <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-400">
                    Scopes: <code className="break-all">{existing.scopes.join(', ')}</code>
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Conexión vía OAuth a tu workspace de Slack. El bot de Clain entra en cualquier channel donde lo invites y el AI Agent puede responder en threads.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                    <span className="material-symbols-outlined text-[14px] text-[#4A154B]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Antes de instalar</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>Necesitas ser admin del workspace o que el admin apruebe la app</li>
                  <li>Tras instalar, invita al bot al channel (`/invite @Clain`) para que reciba mensajes</li>
                  <li>Para slash commands + interactividad, copia los URLs del paso siguiente en tu Slack App config</li>
                </ol>
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
              <button type="button" onClick={() => void handleInstall()} disabled={submitting} className="flex items-center gap-2 rounded-full bg-[#4A154B] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3a103b] disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Redirigiendo…</> : 'Instalar en Slack'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SlackConnectModal;
