import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi } from '../../api/client';
import { supabase } from '../../api/supabase';
import LoadingState from '../LoadingState';
import { DetailSection } from './sections';

type SaveHandler = (() => Promise<void> | void) | null;
type Props = {
  // Parent does the single iamApi.me fetch — see Profile.tsx.
  user: any | null;
  userLoading?: boolean;
  onSaveReady?: (handler: SaveHandler) => void;
};

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '—', color: '#e9eae6' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte', 'Excelente'];
  const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#16a34a'];
  return { score, label: labels[score], color: colors[score] };
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return String(iso);
  const diff = Date.now() - d;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'Hace unos segundos';
  const min = Math.floor(sec / 60);
  if (min < 60) return `Hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Hace ${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `Hace ${days} d`;
  return new Date(iso).toLocaleDateString();
}

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Inicio de sesión',
  'auth.logout': 'Cierre de sesión',
  'auth.password_changed': 'Contraseña actualizada',
  'auth.session_revoked': 'Sesión revocada',
  'profile.avatar_updated': 'Avatar actualizado',
  'profile.updated': 'Perfil actualizado',
};

export default function SecurityTab({ user, userLoading: userLoadingProp, onSaveReady }: Props) {
  // `user` is just used for fallback display; SecurityTab only really needs
  // sessions + activity, both of which it fetches directly.
  void user;
  const userLoading = Boolean(userLoadingProp);
  const { data: sessionsRaw, refetch: refetchSessions } = useApi<any[]>(iamApi.mySessions, []);
  const { data: activityRaw, refetch: refetchActivity } = useApi<any[]>(() => iamApi.myActivity(10), []);
  const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];
  const activity = Array.isArray(activityRaw) ? activityRaw : [];

  // Password change state
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState<string | null>(null);

  // 2FA / TOTP enrollment state (preserved from previous tab)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [totpFactorId, setTotpFactorId] = useState<string | null>(null);
  const [totpModal, setTotpModal] = useState<{ factorId: string; uri: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);
  const [totpLoading, setTotpLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (cancelled) return;
      const verified = data?.totp?.find((f: any) => f.status === 'verified');
      if (verified) { setTotpFactorId(verified.id); setTwoFactorEnabled(true); }
      else { setTotpFactorId(null); setTwoFactorEnabled(false); }
    }).catch(() => {/* MFA may not be enabled */});
    return () => { cancelled = true; };
  }, []);

  const dirty = current.length > 0 || next.length > 0 || confirm.length > 0;
  const strength = useMemo(() => passwordStrength(next), [next]);

  const handleChangePassword = useCallback(async () => {
    setPwError(null);
    setPwOk(null);
    if (!current) { setPwError('Indica tu contraseña actual'); return; }
    if (next.length < 8) { setPwError('La nueva contraseña debe tener al menos 8 caracteres'); return; }
    if (next !== confirm) { setPwError('La confirmación no coincide'); return; }
    setPwSaving(true);
    try {
      await iamApi.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setPwOk('Contraseña actualizada');
      setToast({ tone: 'success', message: 'Contraseña actualizada' });
      try { refetchActivity(); } catch { /* */ }
    } catch (err: any) {
      const msg = err?.message || 'No se pudo cambiar la contraseña';
      setPwError(msg);
      setToast({ tone: 'error', message: msg });
    } finally {
      setPwSaving(false);
    }
  }, [current, next, confirm, refetchActivity]);

  // Save handler — only password section is dirty-tracked at the top level.
  useEffect(() => {
    if (!onSaveReady) return;
    if (dirty) onSaveReady(handleChangePassword);
    else onSaveReady(null);
    return () => onSaveReady(null);
  }, [dirty, handleChangePassword, onSaveReady]);

  // 2FA handlers
  async function handleEnroll2FA() {
    setTotpError(null); setTotpLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setTotpModal({ factorId: data.id, uri: data.totp.uri, secret: data.totp.secret });
    } catch (err: any) {
      setTotpError(err?.message ?? 'No se pudo iniciar la configuración 2FA.');
    } finally { setTotpLoading(false); }
  }
  async function handleVerifyTotp() {
    if (!totpModal || !totpCode.trim()) return;
    setTotpError(null); setTotpLoading(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totpModal.factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: totpModal.factorId, challengeId: ch.id, code: totpCode.trim(),
      });
      if (vErr) throw vErr;
      setTotpFactorId(totpModal.factorId);
      setTwoFactorEnabled(true);
      setTotpModal(null); setTotpCode('');
      setToast({ tone: 'success', message: '2FA activado' });
    } catch (err: any) {
      setTotpError(err?.message ?? 'Código inválido — revisa tu app.');
    } finally { setTotpLoading(false); }
  }
  async function handleUnenroll2FA() {
    if (!totpFactorId) return;
    setTotpLoading(true); setTotpError(null);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: totpFactorId });
      if (error) throw error;
      setTotpFactorId(null); setTwoFactorEnabled(false);
      setToast({ tone: 'success', message: '2FA desactivado' });
    } catch (err: any) {
      setTotpError(err?.message ?? 'No se pudo desactivar 2FA.');
    } finally { setTotpLoading(false); }
  }

  async function handleRevoke(id: string) {
    try {
      await iamApi.revokeSession(id);
      setToast({ tone: 'success', message: 'Sesión cerrada' });
      refetchSessions();
    } catch (err: any) {
      setToast({ tone: 'error', message: err?.message || 'No se pudo cerrar la sesión' });
    }
  }

  if (userLoading) return <LoadingState title="Cargando seguridad" message="Recuperando ajustes de seguridad" compact />;

  return (
    <div>
      {toast && (
        <div className={`mx-6 mt-4 mb-2 px-3 py-2 rounded-md text-[12.5px] font-medium ${
          toast.tone === 'error' ? 'bg-[#fee2e2] text-[#b91c1c] border border-[#fecaca]' : 'bg-[#dcfce7] text-[#166534] border border-[#bbf7d0]'
        }`}>{toast.message}</div>
      )}

      {/* Cambiar contraseña */}
      <DetailSection title="Cambiar contraseña" helper="Usa al menos 8 caracteres con mayúsculas, números y símbolos.">
        <div className="space-y-3 py-3">
          <div>
            <label className="block text-[12px] text-[#646462] mb-1">Contraseña actual</label>
            <input
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              autoComplete="current-password"
              className="w-full max-w-md h-9 px-3 rounded-lg border border-[#e9eae6] text-[13px] focus:outline-none focus:border-[#1a1a1a]"
            />
          </div>
          <div>
            <label className="block text-[12px] text-[#646462] mb-1">Nueva contraseña</label>
            <input
              type="password"
              value={next}
              onChange={e => setNext(e.target.value)}
              autoComplete="new-password"
              className="w-full max-w-md h-9 px-3 rounded-lg border border-[#e9eae6] text-[13px] focus:outline-none focus:border-[#1a1a1a]"
            />
            {next && (
              <div className="mt-2 max-w-md">
                <div className="h-1.5 w-full rounded-full bg-[#f0f0ee] overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${(strength.score / 5) * 100}%`, backgroundColor: strength.color }}
                  />
                </div>
                <p className="text-[11px] text-[#646462] mt-1">Fortaleza: <span style={{ color: strength.color }}>{strength.label}</span></p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-[12px] text-[#646462] mb-1">Confirmar nueva contraseña</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full max-w-md h-9 px-3 rounded-lg border border-[#e9eae6] text-[13px] focus:outline-none focus:border-[#1a1a1a]"
            />
          </div>
          {pwError && <p className="text-[12px] text-[#b91c1c]">{pwError}</p>}
          {pwOk && <p className="text-[12px] text-[#166534]">{pwOk}</p>}
          <div>
            <button
              type="button"
              disabled={pwSaving || !dirty}
              onClick={() => void handleChangePassword()}
              className="h-9 px-4 rounded-md bg-[#1a1a1a] text-white text-[13px] font-semibold disabled:opacity-50 hover:bg-black"
            >
              {pwSaving ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </div>
        </div>
      </DetailSection>

      {/* 2FA */}
      <DetailSection title="Verificación en dos pasos (2FA)" helper="Añade una capa adicional con una app autenticadora (TOTP).">
        <div className="py-3 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold ${
                twoFactorEnabled
                  ? 'bg-[#dcfce7] text-[#166534] border border-[#bbf7d0]'
                  : 'bg-[#f4f4f3] text-[#646462] border border-[#e9eae6]'
              }`}>
                {twoFactorEnabled ? 'Activo' : 'Desactivado'}
              </span>
              {totpFactorId && <span className="text-[11px] text-[#646462]">Factor: {totpFactorId.slice(0, 8)}…</span>}
            </div>
            {totpError && <p className="text-[12px] text-[#b91c1c] mt-2">{totpError}</p>}
          </div>
          <div className="flex gap-2">
            {twoFactorEnabled ? (
              <>
                <button
                  type="button"
                  disabled={totpLoading}
                  onClick={handleEnroll2FA}
                  className="h-8 px-3 rounded-md border border-[#e9eae6] text-[12.5px] font-medium hover:bg-[#f8f8f7] disabled:opacity-50"
                >
                  Reconfigurar
                </button>
                <button
                  type="button"
                  disabled={totpLoading}
                  onClick={() => void handleUnenroll2FA()}
                  className="h-8 px-3 rounded-md border border-[#fecaca] text-[12.5px] font-medium text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-50"
                >
                  Desactivar
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={totpLoading}
                onClick={handleEnroll2FA}
                className="h-8 px-3 rounded-md bg-[#1a1a1a] text-white text-[12.5px] font-semibold hover:bg-black disabled:opacity-50"
              >
                Configurar
              </button>
            )}
          </div>
        </div>
      </DetailSection>

      {/* Sesiones activas */}
      <DetailSection title="Sesiones activas" helper="Revisa los dispositivos conectados y cierra los que no reconozcas.">
        <div className="py-2">
          {sessions.length === 0 ? (
            <p className="text-[12.5px] text-[#646462] py-3">Solo tu sesión actual está activa.</p>
          ) : (
            <ul className="divide-y divide-[#f0f0ee]">
              {sessions.map((s: any) => (
                <li key={s.id} className="py-3 flex items-start gap-3">
                  <span className="material-symbols-outlined text-[#646462] text-[18px] mt-0.5">
                    {s.current ? 'verified_user' : 'devices'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium text-[#1a1a1a] truncate">{s.device || 'Dispositivo desconocido'}</p>
                      {s.current && (
                        <span className="inline-flex items-center h-5 px-2 rounded-full bg-[#f4f4ff] border border-[#dadbf3] text-[10.5px] font-semibold text-[#3b59f6]">Esta sesión</span>
                      )}
                    </div>
                    <p className="text-[11.5px] text-[#646462]">{s.ip ? `IP ${s.ip} · ` : ''}Última actividad: {relTime(s.last_seen)}</p>
                  </div>
                  {!s.current && (
                    <button
                      type="button"
                      onClick={() => void handleRevoke(s.id)}
                      className="h-7 px-2 rounded-md border border-[#e9eae6] text-[11.5px] font-medium hover:bg-[#f8f8f7]"
                    >
                      Cerrar sesión
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DetailSection>

      {/* Auditoría reciente */}
      <DetailSection title="Auditoría reciente" helper="Últimos eventos de tu cuenta.">
        <div className="py-2">
          {activity.length === 0 ? (
            <p className="text-[12.5px] text-[#646462] py-3">No hay eventos recientes.</p>
          ) : (
            <ul className="divide-y divide-[#f0f0ee]">
              {activity.map((ev: any) => (
                <li key={ev.id} className="py-2.5 flex items-center gap-3">
                  <span className="text-[11.5px] text-[#646462] w-32 flex-shrink-0">{relTime(ev.created_at)}</span>
                  <span className="inline-flex items-center h-5 px-2 rounded-full bg-[#f4f4f3] border border-[#e9eae6] text-[10.5px] font-semibold text-[#1a1a1a] uppercase tracking-wide flex-shrink-0">
                    {(ev.type || '').split('.')[0] || 'event'}
                  </span>
                  <span className="text-[12.5px] text-[#1a1a1a] truncate">{ACTION_LABELS[ev.type] || ev.message || ev.type}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DetailSection>

      {/* TOTP setup modal */}
      {totpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 mx-4">
            <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Configura tu app autenticadora</h3>
            <p className="text-[12px] text-[#646462] mb-4">
              Escanea el código QR con Google Authenticator, Authy o cualquier app TOTP. Después introduce el código de 6 dígitos.
            </p>
            <div className="flex justify-center mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(totpModal.uri)}`}
                alt="TOTP QR"
                width={180}
                height={180}
                className="rounded-xl border border-[#e9eae6]"
              />
            </div>
            <details className="mb-4">
              <summary className="text-[11.5px] text-[#646462] cursor-pointer hover:text-[#1a1a1a]">¿No puedes escanear? Introduce la clave manualmente</summary>
              <code className="mt-2 block text-[11.5px] bg-[#f8f8f7] rounded-lg px-3 py-2 text-[#1a1a1a] break-all select-all">{totpModal.secret}</code>
            </details>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Código de 6 dígitos"
              value={totpCode}
              onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && void handleVerifyTotp()}
              className="w-full rounded-lg border border-[#e9eae6] bg-[#f8f8f7] px-3 py-2 text-center text-xl font-mono tracking-widest text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a] mb-3"
            />
            {totpError && <p className="text-[12px] text-[#b91c1c] mb-3 text-center">{totpError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setTotpModal(null); setTotpCode(''); setTotpError(null); }}
                className="flex-1 h-9 text-[13px] text-[#646462] border border-[#e9eae6] rounded-md hover:bg-[#f8f8f7]"
              >Cancelar</button>
              <button
                type="button"
                disabled={totpCode.length !== 6 || totpLoading}
                onClick={() => void handleVerifyTotp()}
                className="flex-1 h-9 text-[13px] font-semibold bg-[#1a1a1a] text-white rounded-md hover:bg-black disabled:opacity-50"
              >{totpLoading ? 'Verificando…' : 'Activar 2FA'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
