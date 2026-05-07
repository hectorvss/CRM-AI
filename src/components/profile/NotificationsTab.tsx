import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi } from '../../api/client';
import LoadingState from '../LoadingState';
import { DetailSection, DetailRow } from './sections';

type SaveHandler = (() => Promise<void> | void) | null;
type Props = { onSaveReady?: (handler: SaveHandler) => void };

const FALLBACK_USER = { preferences: {}, name: '', email: '' };

function parsePreferences(prefs: any): Record<string, any> {
  if (!prefs) return {};
  if (typeof prefs === 'string') {
    try { return JSON.parse(prefs); } catch { return {}; }
  }
  return prefs;
}

// ── Notifications model ─────────────────────────────────────────────────────
// Per-channel matrix: each channel × each event type has its own boolean.
// This is the shape the backend already accepts under preferences.notifications.
type ChannelKey = 'email' | 'push' | 'sms' | 'slack';
type EventKey = 'assigned' | 'mentioned' | 'sla' | 'daily';

const CHANNELS: { key: ChannelKey; label: string; helper: string }[] = [
  { key: 'email', label: 'Email',   helper: 'Recibirás avisos en tu correo.' },
  { key: 'push',  label: 'Push',    helper: 'Notificaciones en el navegador / móvil.' },
  { key: 'sms',   label: 'SMS',     helper: 'Solo para alertas críticas.' },
  { key: 'slack', label: 'Slack',   helper: 'En tu canal personal de Slack.' },
];

const EVENTS: { key: EventKey; label: string }[] = [
  { key: 'assigned',  label: 'Asignado' },
  { key: 'mentioned', label: 'Mencionado' },
  { key: 'sla',       label: 'SLA en riesgo' },
  { key: 'daily',     label: 'Resumen diario' },
];

function ToggleRow({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-[#1a1a1a]' : 'bg-[#e9eae6]'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}

type Matrix = Record<ChannelKey, Record<EventKey, boolean>>;

const DEFAULT_MATRIX: Matrix = {
  email: { assigned: true,  mentioned: true,  sla: true,  daily: true },
  push:  { assigned: true,  mentioned: true,  sla: true,  daily: false },
  sms:   { assigned: false, mentioned: false, sla: true,  daily: false },
  slack: { assigned: true,  mentioned: true,  sla: false, daily: false },
};

export default function NotificationsTab({ onSaveReady }: Props) {
  const { data: user, loading } = useApi<any>(iamApi.me);
  const currentUser = user || FALLBACK_USER;
  const preferences = useMemo(() => parsePreferences(currentUser?.preferences), [currentUser]);
  // Memoise — `preferences.notifications || {}` creates a new {} every render
  // when no notifications are stored. That fresh ref makes `handleSave` and
  // `hasChanges` unstable, which causes the parent's setSaveHandler to fire on
  // every render and triggers an infinite re-render loop (looks like a reload).
  const stored = useMemo<Record<string, any>>(
    () => preferences.notifications || {},
    [preferences],
  );

  const [matrix, setMatrix] = useState<Matrix>(DEFAULT_MATRIX);
  const [dailyDigestEnabled, setDailyDigestEnabled] = useState(true);
  const [digestHour, setDigestHour] = useState('09:00');

  useEffect(() => {
    const initial: Matrix = JSON.parse(JSON.stringify(DEFAULT_MATRIX));
    for (const c of CHANNELS) {
      for (const e of EVENTS) {
        const v = stored?.[c.key]?.[e.key];
        if (typeof v === 'boolean') initial[c.key][e.key] = v;
      }
    }
    setMatrix(initial);
    if (typeof stored?.dailyDigest?.enabled === 'boolean') setDailyDigestEnabled(stored.dailyDigest.enabled);
    if (typeof stored?.dailyDigest?.hour === 'string') setDigestHour(stored.dailyDigest.hour);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const handleSave = useCallback(async () => {
    await iamApi.updateMe({
      preferences: {
        ...preferences,
        notifications: {
          ...stored,
          ...matrix,
          dailyDigest: { enabled: dailyDigestEnabled, hour: digestHour },
        },
      },
    });
  }, [preferences, stored, matrix, dailyDigestEnabled, digestHour]);

  // Detect drift vs stored to drive the floating Save bar.
  const hasChanges = useMemo(() => {
    for (const c of CHANNELS) {
      for (const e of EVENTS) {
        const cur = matrix[c.key][e.key];
        const orig = (stored?.[c.key]?.[e.key] ?? DEFAULT_MATRIX[c.key][e.key]);
        if (cur !== orig) return true;
      }
    }
    if (dailyDigestEnabled !== (stored?.dailyDigest?.enabled ?? true)) return true;
    if (digestHour !== (stored?.dailyDigest?.hour ?? '09:00')) return true;
    return false;
  }, [matrix, dailyDigestEnabled, digestHour, stored]);

  useEffect(() => {
    onSaveReady?.(hasChanges ? handleSave : null);
    return () => onSaveReady?.(null);
  }, [hasChanges, handleSave, onSaveReady]);

  function toggle(channel: ChannelKey, event: EventKey) {
    setMatrix(prev => ({
      ...prev,
      [channel]: { ...prev[channel], [event]: !prev[channel][event] },
    }));
  }

  if (loading) return <LoadingState title="Cargando notificaciones" message="Recuperando tus preferencias." compact />;

  return (
    <div className="py-3">
      {CHANNELS.map(channel => (
        <DetailSection key={channel.key} title={channel.label} helper={channel.helper}>
          {EVENTS.map(event => (
            <DetailRow key={event.key} label={event.label}>
              <ToggleRow
                value={matrix[channel.key][event.key]}
                onChange={() => toggle(channel.key, event.key)}
              />
            </DetailRow>
          ))}
        </DetailSection>
      ))}

      <DetailSection title="Resumen diario" helper="Un único correo agrupando lo más importante del día.">
        <DetailRow label="Habilitado">
          <ToggleRow value={dailyDigestEnabled} onChange={setDailyDigestEnabled} />
        </DetailRow>
        <DetailRow label="Hora de envío">
          <input
            type="time"
            value={digestHour}
            onChange={e => setDigestHour(e.target.value)}
            disabled={!dailyDigestEnabled}
            className="h-7 text-[13px] px-2 rounded-md border border-[#e9eae6] bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a] disabled:opacity-50"
          />
        </DetailRow>
      </DetailSection>
    </div>
  );
}
