import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { IntegrationLogo } from './logos';

/**
 * Twilio is API-key based (no OAuth). The modal collects:
 *   1. Account SID (AC...)
 *   2. Auth Token (default) — or API Key + Secret behind "Avanzado"
 *   3. After validation we list owned phone numbers and let the merchant
 *      pick a default SMS sender + (optional) WhatsApp sender.
 *   4. Configure-webhooks button programmatically sets the SmsUrl on the
 *      selected numbers so the merchant doesn't have to do it manually.
 *
 * The connect-then-pick flow is two-step but fast: validate creds in step
 * one shows the user their own account name so they know they pasted the
 * right thing. Step two surfaces real numbers from their account.
 */

interface PhoneNumber {
  sid: string;
  phone_number: string;
  capabilities?: { sms?: boolean; mms?: boolean; voice?: boolean };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    account_sid?: string;
    account_name?: string;
    account_status?: string;
    auth_type?: 'api_key' | 'api_key_pair';
    balance?: { balance: string; currency: string } | null;
    phone_numbers?: PhoneNumber[];
    default_sms_from?: string | null;
    default_whatsapp_from?: string | null;
    last_health_check_at?: string | null;
    capabilities?: { sends?: string[]; reads?: string[] } | null;
  } | null;
}

const SCOPES_HUMAN = [
  { id: 'sms', label: 'SMS', icon: 'sms' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'chat_bubble' },
  { id: 'mms', label: 'MMS / multimedia', icon: 'image' },
  { id: 'numbers', label: 'Números propios', icon: 'dialpad' },
  { id: 'balance', label: 'Saldo y costes', icon: 'account_balance_wallet' },
];

const TwilioConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [apiKeySid, setApiKeySid] = useState('');
  const [apiKeySecret, setApiKeySecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step2NumbersOpen, setStep2NumbersOpen] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [selectedSmsFrom, setSelectedSmsFrom] = useState('');
  const [selectedWhatsappFrom, setSelectedWhatsappFrom] = useState('');
  const [configuring, setConfiguring] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    if (open) {
      setAccountSid('');
      setAuthToken('');
      setApiKeySid('');
      setApiKeySecret('');
      setAdvancedOpen(false);
      setError(null);
      setSubmitting(false);
      setStep2NumbersOpen(false);
      setPhoneNumbers(existing?.phone_numbers ?? []);
      setSelectedSmsFrom(existing?.default_sms_from ?? '');
      setSelectedWhatsappFrom(existing?.default_whatsapp_from ?? '');
      setTestTo('');
      setTestStatus('idle');
    }
  }, [open, existing]);

  if (!open) return null;
  const isConnected = Boolean(existing?.account_sid);

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
    if (!accountSid.startsWith('AC')) {
      setError('Account SID debe empezar por "AC"');
      return;
    }
    if (!authToken && !(apiKeySid && apiKeySecret)) {
      setError('Pega el Auth Token o, en Avanzado, una API Key + Secret');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/twilio/connect', {
        method: 'POST',
        body: JSON.stringify({
          account_sid: accountSid.trim(),
          auth_token: authToken.trim() || undefined,
          api_key_sid: apiKeySid.trim() || undefined,
          api_key_secret: apiKeySecret.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.twilioMessage || j.error || `Server error ${res.status}`);
      }
      const json = await res.json();
      setPhoneNumbers(json.phone_numbers ?? []);
      setStep2NumbersOpen(true);
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'No se pudo conectar Twilio');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfigureWebhooks() {
    if (!selectedSmsFrom) {
      setError('Selecciona al menos un número SMS para recibir mensajes');
      return;
    }
    setConfiguring(true);
    try {
      const sids = phoneNumbers
        .filter((p) => p.phone_number === selectedSmsFrom || p.phone_number === selectedWhatsappFrom)
        .map((p) => p.sid);
      if (!sids.length) {
        setError('No se encontraron SIDs para los números elegidos');
        setConfiguring(false);
        return;
      }
      const res = await authedFetch('/api/integrations/twilio/configure-webhooks', {
        method: 'POST',
        body: JSON.stringify({
          phone_number_sids: sids,
          default_sms_from: selectedSmsFrom,
          default_whatsapp_from: selectedWhatsappFrom || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Server error ${res.status}`);
      }
      onChanged?.();
      setStep2NumbersOpen(false);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudieron configurar los webhooks');
    } finally {
      setConfiguring(false);
    }
  }

  async function handleSendTest() {
    if (!testTo) return;
    setTestStatus('sending');
    try {
      const res = await authedFetch('/api/integrations/twilio/send-test', {
        method: 'POST',
        body: JSON.stringify({
          to: testTo,
          channel: testTo.includes('@') ? 'sms' : 'sms', // SMS always; merchant adds whatsapp: prefix manually if needed
          body: 'Hola desde Clain — test SMS funcionando 🎉',
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setTestStatus('sent');
      setTimeout(() => setTestStatus('idle'), 4000);
    } catch {
      setTestStatus('error');
      setTimeout(() => setTestStatus('idle'), 4000);
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Twilio? Dejaremos de recibir SMS/WhatsApp y no podremos enviar respuestas.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/twilio/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      onChanged?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo desconectar');
    } finally {
      setSubmitting(false);
    }
  }

  const isStep2 = isConnected || step2NumbersOpen;
  const numbersForPicker = isConnected ? (existing?.phone_numbers ?? []) : phoneNumbers;

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
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F22F46] text-white shadow-sm">
              <IntegrationLogo id="twilio" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                Integración
              </p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Twilio</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">SMS · WhatsApp Business · MMS</p>
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
                Pega tus credenciales de Twilio. Las encuentras en{' '}
                <a href="https://console.twilio.com/" target="_blank" rel="noreferrer" className="underline">console.twilio.com</a>{' '}
                → Account → API keys & tokens.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES_HUMAN.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#F22F46]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Account SID
                  </label>
                  <input
                    autoFocus
                    autoComplete="off"
                    value={accountSid}
                    onChange={(e) => setAccountSid(e.target.value)}
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Auth Token
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder="32 caracteres de tu Twilio console"
                    className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="mt-5 flex w-full items-center justify-between text-left text-[12px] font-medium text-gray-500 transition hover:text-gray-950 dark:hover:text-white"
              >
                <span>Avanzado · usar API Key/Secret en lugar de Auth Token</span>
                <span className="material-symbols-outlined text-[16px]">
                  {advancedOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {advancedOpen ? (
                <div className="mt-3 space-y-3 rounded-2xl border border-black/5 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Si has creado una API Key específica para esta app (recomendado en producción), úsala aquí en lugar del Auth Token.
                  </p>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      API Key SID
                    </label>
                    <input
                      autoComplete="off"
                      value={apiKeySid}
                      onChange={(e) => setApiKeySid(e.target.value)}
                      placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      API Key Secret
                    </label>
                    <input
                      type="password"
                      autoComplete="off"
                      value={apiKeySecret}
                      onChange={(e) => setApiKeySecret(e.target.value)}
                      placeholder="Solo se muestra una vez al crear la key"
                      className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                    />
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </div>
              ) : null}
            </>
          ) : (
            // ── Step 2: pick numbers + configure webhooks ──────────────────
            <>
              {existing?.account_name ? (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">
                    Conectado a <strong>{existing.account_name}</strong>
                  </p>
                  {existing.balance ? (
                    <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100">
                      Saldo {existing.balance.balance} {existing.balance.currency}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                  Número SMS por defecto
                </p>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  El número desde el que enviaremos SMS y al que llegarán los webhooks de mensajes entrantes.
                </p>
                <div className="mt-3 max-h-44 overflow-y-auto rounded-xl border border-black/5 dark:border-white/10">
                  {numbersForPicker.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-gray-500">
                      No hay números en la cuenta. Compra uno en la consola de Twilio y vuelve aquí.
                    </div>
                  ) : (
                    numbersForPicker.map((p) => {
                      const checked = selectedSmsFrom === p.phone_number;
                      const smsCapable = p.capabilities?.sms !== false;
                      return (
                        <label
                          key={p.sid}
                          className={`flex items-center justify-between gap-3 border-b border-black/5 px-3 py-2 last:border-b-0 dark:border-white/5 ${smsCapable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5' : 'opacity-50'}`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="sms-from"
                              checked={checked}
                              disabled={!smsCapable}
                              onChange={() => setSelectedSmsFrom(p.phone_number)}
                            />
                            <div>
                              <p className="text-[13px] font-medium text-gray-950 dark:text-white">
                                {p.phone_number}
                              </p>
                              <p className="text-[10px] uppercase tracking-wider text-gray-400">
                                {[
                                  p.capabilities?.sms ? 'SMS' : null,
                                  p.capabilities?.mms ? 'MMS' : null,
                                  p.capabilities?.voice ? 'Voz' : null,
                                ].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                          </div>
                          {!smsCapable ? (
                            <span className="text-[10px] text-gray-400">Sin SMS</span>
                          ) : null}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                  WhatsApp Business <span className="ml-1 normal-case text-gray-400">(opcional)</span>
                </p>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Si tu cuenta tiene un Sender de WhatsApp aprobado por Meta vía Twilio, pégalo aquí (sin el prefijo <code className="text-[10px]">whatsapp:</code>).
                </p>
                <input
                  value={selectedWhatsappFrom}
                  onChange={(e) => setSelectedWhatsappFrom(e.target.value)}
                  placeholder="+14155238886"
                  className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                />
              </div>

              {isConnected ? (
                <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Enviar SMS de prueba
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                      placeholder="+34 612 345 678"
                      className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSendTest()}
                      disabled={!testTo || testStatus === 'sending'}
                      className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5"
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
                disabled={submitting || !accountSid || (!authToken && !(apiKeySid && apiKeySecret))}
                className="flex items-center gap-2 rounded-full bg-[#F22F46] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#d62538] disabled:opacity-50"
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
                  onClick={onClose}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white"
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleConfigureWebhooks()}
                disabled={configuring || !selectedSmsFrom}
                className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-black/90 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
              >
                {configuring ? 'Configurando webhooks…' : isConnected ? 'Guardar cambios' : 'Configurar webhooks y terminar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TwilioConnectModal;
