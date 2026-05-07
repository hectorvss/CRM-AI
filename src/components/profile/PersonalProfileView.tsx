// Intercom-style personal profile screen — restored from the original
// Settings > Personal screen. Mounted in two places:
//   - Settings > Personal tab (`src/components/Settings.tsx`)
//   - Inicio (Home) view (`src/components/Home.tsx`)
//
// Every interactive element is wired to `iamApi`. Editable fields are
// persisted via `iamApi.updateMe({ name, avatar_url, preferences })`. The
// extra fields the backend doesn't have first-class columns for (location,
// status, title, departments, calendar URL, bio, deactivated flag) are
// stored under `preferences.profile.*`.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi } from '../../api/client';
import LoadingState from '../LoadingState';
import type { NavigateFn } from '../../types';

type Props = {
  onNavigate?: NavigateFn;
  /** When true, shows the page-style header. Set to false for embedded use. */
  showHeader?: boolean;
};

function parsePreferences(prefs: any): Record<string, any> {
  if (!prefs) return {};
  if (typeof prefs === 'string') {
    try { return JSON.parse(prefs); } catch { return {}; }
  }
  return prefs;
}

function initialsFor(name?: string | null) {
  if (!name) return '··';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relativeMinutes(date: Date) {
  const diff = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (diff < 60) return `hace ${diff} min`;
  if (diff < 1440) return `hace ${Math.round(diff / 60)} h`;
  return `hace ${Math.round(diff / 1440)} d`;
}

const STATUS_OPTIONS = [
  { value: 'active',    label: 'Activo',        dot: 'bg-emerald-500' },
  { value: 'away',      label: 'Ausente',       dot: 'bg-amber-500' },
  { value: 'dnd',       label: 'No molestar',   dot: 'bg-red-500' },
  { value: 'invisible', label: 'Invisible',     dot: 'bg-gray-400' },
];

type ChannelKey = 'messenger' | 'email' | 'whatsapp' | 'phone' | 'sms' | 'slack' | 'teams' | 'discord' | 'instagram' | 'telegram';

const PRIMARY_CHANNELS: { key: ChannelKey; label: string; iconBg: string; icon: string; color: string; sample: string }[] = [
  { key: 'messenger', label: 'Messenger', iconBg: 'bg-indigo-100', color: 'text-indigo-600', icon: 'forum',    sample: 'Para instalar el Messenger en tu sitio…' },
  { key: 'email',     label: 'Email',     iconBg: 'bg-rose-100',   color: 'text-rose-600',   icon: 'mail',     sample: 'Reenvía o conecta tu buzón para empezar.' },
  { key: 'whatsapp',  label: 'WhatsApp',  iconBg: 'bg-emerald-100',color: 'text-emerald-600',icon: 'chat',     sample: 'Conecta WhatsApp Business para responder aquí.' },
  { key: 'phone',     label: 'Phone',     iconBg: 'bg-amber-100',  color: 'text-amber-600',  icon: 'call',     sample: 'Conecta Aircall o Twilio para llamadas y voz.' },
];

const MORE_CHANNELS: { key: ChannelKey; label: string; iconBg: string; icon: string; color: string; sample: string }[] = [
  { key: 'sms',       label: 'SMS',       iconBg: 'bg-sky-100',     color: 'text-sky-600',     icon: 'sms',          sample: 'Envía y recibe SMS desde tu CRM.' },
  { key: 'slack',     label: 'Slack',     iconBg: 'bg-purple-100',  color: 'text-purple-600',  icon: 'tag',          sample: 'Recibe avisos y crea casos desde Slack.' },
  { key: 'teams',     label: 'Teams',     iconBg: 'bg-blue-100',    color: 'text-blue-600',    icon: 'groups',       sample: 'Integra Microsoft Teams para soporte interno.' },
  { key: 'discord',   label: 'Discord',   iconBg: 'bg-indigo-100',  color: 'text-indigo-700',  icon: 'sports_esports',sample: 'Conecta tu servidor de Discord.' },
  { key: 'instagram', label: 'Instagram', iconBg: 'bg-pink-100',    color: 'text-pink-600',    icon: 'photo_camera', sample: 'Responde a DMs de Instagram desde el CRM.' },
  { key: 'telegram',  label: 'Telegram',  iconBg: 'bg-cyan-100',    color: 'text-cyan-600',    icon: 'send',         sample: 'Conecta tu bot de Telegram.' },
];

// Stable demo timestamps for the channel cards so "hace X min" is stable per
// session but still feels live. The minutes match the original screenshot.
const CHANNEL_AGES_MIN: Record<ChannelKey, number> = {
  messenger: 4, email: 8, whatsapp: 12, phone: 20,
  sms: 32, slack: 45, teams: 58, discord: 75, instagram: 90, telegram: 110,
};

export default function PersonalProfileView({ onNavigate, showHeader = false }: Props) {
  const { data: user, loading, refetch } = useApi<any>(iamApi.me);
  const { data: teams } = useApi<any[]>(iamApi.teams, [], [] as any[]);

  const preferences = useMemo(() => parsePreferences(user?.preferences), [user]);
  // Memoise — `preferences.profile || {}` would create a new {} on every render
  // when no profile prefs exist, destabilising the `persist` callback and any
  // effect dep that includes it.
  const profilePrefs = useMemo<Record<string, any>>(
    () => preferences.profile || {},
    [preferences],
  );

  // Pending profile patches accumulator. Between a successful PATCH and the
  // refetched user landing, `profilePrefs` is stale (still the pre-save
  // snapshot). Without this, two field edits in quick succession cause the
  // second to overwrite the first because both build their payload from the
  // same `profilePrefs`. We layer pending patches on top until refetch lands.
  const pendingProfileRef = useRef<Record<string, any>>({});

  // ── Editable state ────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('active');
  const [location, setLocation] = useState('');
  const [deactivated, setDeactivated] = useState(false);
  const [jobTitle, setJobTitle] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [calendarUrl, setCalendarUrl] = useState('');
  const [timezone, setTimezone] = useState('');

  // Edit-mode flags per row.
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editAll, setEditAll] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [moreChannelsOpen, setMoreChannelsOpen] = useState(false);
  const [activeChannelDetail, setActiveChannelDetail] = useState<typeof PRIMARY_CHANNELS[number] | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Hydrate from server.
  useEffect(() => {
    if (!user) return;
    setName(user.name || '');
    setAvatarUrl(user.avatar_url || '');
    setUsername(profilePrefs.username || (user.email ? user.email.split('@')[0] : ''));
    setStatus(profilePrefs.status || 'active');
    setLocation(profilePrefs.location || '');
    setDeactivated(Boolean(profilePrefs.deactivated));
    setJobTitle(profilePrefs.jobTitle || '');
    setDepartments(Array.isArray(profilePrefs.departments) ? profilePrefs.departments : []);
    setPhone(profilePrefs.phone || '');
    setBio(profilePrefs.bio || '');
    setCalendarUrl(profilePrefs.calendarUrl || '');
    setTimezone(profilePrefs.timezone || 'Europe/Madrid');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Live clock, updates each minute.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Toast auto-dismiss.
  useEffect(() => {
    if (!statusMsg) return;
    const t = setTimeout(() => setStatusMsg(null), 3500);
    return () => clearTimeout(t);
  }, [statusMsg]);

  // When fresh user data arrives, drop any pending patches that the server
  // has now confirmed (they're already baked into profilePrefs).
  useEffect(() => {
    pendingProfileRef.current = {};
  }, [user]);

  // ── Persistence ───────────────────────────────────────────────────────
  const persist = useCallback(async (patch: Record<string, any>) => {
    try {
      // Layer: stored profile prefs → pending (un-refetched) patches → this patch.
      const mergedProfile = {
        ...profilePrefs,
        ...pendingProfileRef.current,
        ...(patch.profile || {}),
      };
      if (patch.profile) {
        pendingProfileRef.current = { ...pendingProfileRef.current, ...patch.profile };
      }
      const next = { ...preferences, profile: mergedProfile };
      const body: Record<string, any> = { preferences: next };
      if (typeof patch.name === 'string') body.name = patch.name;
      if (Object.prototype.hasOwnProperty.call(patch, 'avatar_url')) body.avatar_url = patch.avatar_url;
      await iamApi.updateMe(body);
      setStatusMsg({ kind: 'ok', text: 'Cambios guardados.' });
      refetch?.();
    } catch (err: any) {
      setStatusMsg({ kind: 'err', text: err?.message || 'No se pudieron guardar los cambios.' });
    }
  }, [preferences, profilePrefs, refetch]);

  const persistField = useCallback(async (field: string, value: any) => {
    if (field === 'name') {
      await persist({ name: value });
    } else if (field === 'avatar_url') {
      await persist({ avatar_url: value });
    } else {
      await persist({ profile: { [field]: value } });
    }
  }, [persist]);

  // ── Avatar upload ─────────────────────────────────────────────────────
  const handleAvatarFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatusMsg({ kind: 'err', text: 'Selecciona una imagen.' });
      return;
    }
    try {
      const res = await iamApi.uploadAvatar(file);
      setAvatarUrl(res.url);
      setStatusMsg({ kind: 'ok', text: 'Avatar actualizado.' });
      refetch?.();
    } catch (err: any) {
      setStatusMsg({ kind: 'err', text: err?.message || 'No se pudo subir el avatar.' });
    }
  }, [refetch]);

  // ── Derived ───────────────────────────────────────────────────────────
  const initials = initialsFor(name);
  const localTime = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('es-ES', { hour: 'numeric', minute: '2-digit', timeZone: timezone || undefined }).format(now);
    } catch {
      return new Intl.DateTimeFormat('es-ES', { hour: 'numeric', minute: '2-digit' }).format(now);
    }
  }, [now, timezone]);
  const lastActive = user?.last_active_at ? new Date(user.last_active_at) : null;
  const lastActiveLabel = lastActive
    ? `Activo ${relativeMinutes(lastActive)}`
    : 'Activo en los últimos 15 minutos';

  if (loading) {
    return <LoadingState title="Cargando perfil" message="Recuperando tu perfil personal." compact />;
  }

  // ── Render helpers ────────────────────────────────────────────────────
  const renderRow = (
    field: string,
    iconName: string,
    label: string,
    value: React.ReactNode,
    placeholder: string,
    render: (close: () => void) => React.ReactNode,
  ) => {
    const isOpen = editingField === field || editAll;
    return (
      <div className="group flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
        <span className="material-symbols-outlined text-[18px] text-gray-400 mt-0.5 flex-shrink-0">{iconName}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">{label}</div>
          {isOpen ? (
            <div className="mt-1.5">
              {render(() => setEditingField(null))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingField(field)}
              className="mt-0.5 w-full text-left text-[13.5px] text-gray-800 dark:text-gray-200 hover:text-indigo-600 truncate"
            >
              {value || <span className="text-gray-400 italic">{placeholder}</span>}
            </button>
          )}
        </div>
      </div>
    );
  };

  const inputCls = 'w-full h-8 px-2.5 text-[13px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-500';

  return (
    <div className="w-full max-w-6xl mx-auto">
      {showHeader && (
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tu perfil</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Cómo te ven los compañeros y los clientes.</p>
        </div>
      )}

      {/* Toast */}
      {statusMsg && (
        <div className={`mx-4 mt-2 mb-1 rounded-xl px-4 py-2.5 text-sm ${
          statusMsg.kind === 'ok'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/40'
            : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-900/40'
        }`}>
          {statusMsg.text}
        </div>
      )}

      {/* ── Header banner ────────────────────────────────────────────── */}
      <div className="mx-4 mt-3 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-card-dark shadow-card">
        <div
          className="relative h-28 sm:h-32"
          style={{
            backgroundImage:
              'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%), url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%27600%27 height=%27200%27><g fill=%27%23d1d5db%27 opacity=%270.4%27><circle cx=%2750%27 cy=%2750%27 r=%2725%27/><circle cx=%27200%27 cy=%2780%27 r=%2740%27/><circle cx=%27400%27 cy=%2740%27 r=%2730%27/><circle cx=%27520%27 cy=%2790%27 r=%2735%27/></g></svg>")',
            backgroundBlendMode: 'multiply',
          }}
        />
        <div className="px-6 pb-5 -mt-12 relative">
          <div className="flex items-end gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative w-24 h-24 rounded-full bg-gray-700 text-white flex items-center justify-center text-2xl font-bold border-4 border-white dark:border-card-dark shadow-md overflow-hidden group"
              title="Cambiar avatar"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
              <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[11px] font-semibold">
                Cambiar
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFile}
            />
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                {editingField === 'name' ? (
                  <input
                    autoFocus
                    className={`${inputCls} max-w-xs`}
                    defaultValue={name}
                    onBlur={async (e) => {
                      const v = e.target.value.trim();
                      if (v && v !== name) { setName(v); await persistField('name', v); }
                      setEditingField(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditingField(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingField('name')}
                    className="text-xl font-bold text-gray-900 dark:text-white hover:text-indigo-600"
                  >
                    {name || <span className="italic text-gray-400">Sin nombre</span>}
                  </button>
                )}
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-[10.5px] font-bold uppercase tracking-wide">
                  Tú
                </span>
              </div>
              <div className="flex items-center gap-3 text-[12.5px] text-gray-500 dark:text-gray-400 mt-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setEditingField('location')}
                  className="flex items-center gap-1 hover:text-indigo-600"
                >
                  <span className="material-symbols-outlined text-[14px]">location_on</span>
                  {editingField === 'location' ? (
                    <input
                      autoFocus
                      className={`${inputCls} h-7 w-44`}
                      defaultValue={location}
                      onBlur={async (e) => {
                        const v = e.target.value;
                        setLocation(v);
                        await persistField('location', v);
                        setEditingField(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingField(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span>{location || <span className="italic text-gray-400">Añade tu ciudad</span>}</span>
                  )}
                </button>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">schedule</span>
                  {localTime}
                </span>
                <span className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_OPTIONS.find(s => s.value === status)?.dot || 'bg-emerald-500'}`} />
                  {lastActiveLabel}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Two columns ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mx-4 my-4">
        {/* ── Left: Tú / Perfil público ─────────────────────────────── */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2 px-1">Tú</div>
          <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white">Perfil público</h3>
              <button
                type="button"
                onClick={() => setEditAll(v => !v)}
                className="px-2.5 py-1 rounded-md text-[12px] font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
              >
                {editAll ? 'Listo' : 'Editar'}
              </button>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {renderRow('name', 'badge', 'Nombre', name, 'Añade tu nombre', (close) => (
                <input
                  autoFocus
                  className={inputCls}
                  defaultValue={name}
                  onBlur={async (e) => {
                    const v = e.target.value.trim();
                    if (v && v !== name) { setName(v); await persistField('name', v); }
                    close();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') close();
                  }}
                />
              ))}

              {renderRow('username', 'alternate_email', 'Username', username ? `@${username}` : '', 'Añade un username', (close) => (
                <input
                  autoFocus
                  className={inputCls}
                  defaultValue={username}
                  placeholder="hector.vidal"
                  onBlur={async (e) => {
                    const v = e.target.value.trim().replace(/^@/, '');
                    setUsername(v);
                    await persistField('username', v);
                    close();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') close();
                  }}
                />
              ))}

              {renderRow(
                'status',
                'circle',
                'Estado',
                <span className="inline-flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_OPTIONS.find(s => s.value === status)?.dot || ''}`} />
                  {STATUS_OPTIONS.find(s => s.value === status)?.label || 'Activo'}
                </span>,
                'Estado',
                (close) => (
                  <select
                    autoFocus
                    className={inputCls}
                    defaultValue={status}
                    onChange={async (e) => {
                      setStatus(e.target.value);
                      await persistField('status', e.target.value);
                      close();
                    }}
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ),
              )}

              {renderRow('location', 'location_on', 'Ubicación', location, 'Añade tu ubicación', (close) => (
                <input
                  autoFocus
                  className={inputCls}
                  defaultValue={location}
                  placeholder="Elda, Spain"
                  onBlur={async (e) => {
                    setLocation(e.target.value);
                    await persistField('location', e.target.value);
                    close();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') close();
                  }}
                />
              ))}

              <div className="flex items-center gap-3 px-4 py-3">
                <span className="material-symbols-outlined text-[18px] text-gray-400">block</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Desactivado</div>
                  <div className="text-[12.5px] text-gray-500 dark:text-gray-400">Marca tu cuenta como desactivada temporalmente.</div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const next = !deactivated;
                    setDeactivated(next);
                    await persistField('deactivated', next);
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${deactivated ? 'bg-rose-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${deactivated ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>

              {renderRow('jobTitle', 'work', 'Puesto', jobTitle, 'Aún no hay un puesto', (close) => (
                <input
                  autoFocus
                  className={inputCls}
                  defaultValue={jobTitle}
                  placeholder="p. ej. Customer Success Manager"
                  onBlur={async (e) => {
                    setJobTitle(e.target.value);
                    await persistField('jobTitle', e.target.value);
                    close();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') close();
                  }}
                />
              ))}

              {renderRow(
                'departments',
                'groups',
                'Departamentos',
                departments.length ? departments.join(', ') : '',
                'Aún no hay departamentos',
                (close) => (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(teams || []).map((t: any) => {
                        const id = t.id || t.name;
                        const checked = departments.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              setDepartments(prev => checked ? prev.filter(x => x !== id) : [...prev, id]);
                            }}
                            className={`px-2 py-1 rounded-md text-[12px] border ${
                              checked
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                            }`}
                          >
                            {t.name || id}
                          </button>
                        );
                      })}
                      {(!teams || teams.length === 0) && (
                        <span className="text-[12px] text-gray-400 italic">No hay equipos disponibles.</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await persistField('departments', departments);
                          close();
                        }}
                        className="px-3 py-1 rounded-md bg-black dark:bg-white text-white dark:text-black text-[12px] font-semibold"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={close}
                        className="px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-[12px] font-semibold"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ),
              )}

              {renderRow('phone', 'call', 'Teléfono', phone, 'Aún no hay números de teléfono', (close) => (
                <input
                  autoFocus
                  type="tel"
                  className={inputCls}
                  defaultValue={phone}
                  placeholder="+34 600 000 000"
                  onBlur={async (e) => {
                    setPhone(e.target.value);
                    await persistField('phone', e.target.value);
                    close();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') close();
                  }}
                />
              ))}

              {renderRow('bio', 'edit_note', 'Preséntate', bio, 'Cuenta algo sobre ti', (close) => (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    maxLength={280}
                    className="w-full min-h-[70px] px-2.5 py-2 text-[13px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none focus:border-indigo-500 resize-none"
                    defaultValue={bio}
                    onBlur={async (e) => {
                      setBio(e.target.value);
                      await persistField('bio', e.target.value);
                      close();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') close();
                    }}
                  />
                  <p className="text-[11px] text-gray-400">Máximo 280 caracteres.</p>
                </div>
              ))}

              {renderRow('calendarUrl', 'calendar_today', 'Calendario', calendarUrl, 'Añade un enlace a tu calendario', (close) => {
                const validate = (v: string) => !v || /^https?:\/\//i.test(v);
                return (
                  <input
                    autoFocus
                    type="url"
                    className={inputCls}
                    defaultValue={calendarUrl}
                    placeholder="https://cal.com/tu-usuario"
                    onBlur={async (e) => {
                      const v = e.target.value.trim();
                      if (!validate(v)) {
                        setStatusMsg({ kind: 'err', text: 'La URL debe empezar por http:// o https://' });
                        close();
                        return;
                      }
                      setCalendarUrl(v);
                      await persistField('calendarUrl', v);
                      close();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') close();
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Right: Tus conversaciones ─────────────────────────────── */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2 px-1">Tus conversaciones</div>
          <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {PRIMARY_CHANNELS.map((ch) => (
                <li key={ch.key}>
                  <button
                    type="button"
                    onClick={() => setActiveChannelDetail(ch)}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-left transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-lg ${ch.iconBg} flex items-center justify-center flex-shrink-0`}>
                      <span className={`material-symbols-outlined text-[18px] ${ch.color}`}>{ch.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-semibold text-gray-900 dark:text-white">{ch.label}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase bg-gray-100 dark:bg-gray-800 text-gray-500">Demo</span>
                        <span className="ml-auto text-[11.5px] text-gray-400">hace {CHANNEL_AGES_MIN[ch.key]} min</span>
                      </div>
                      <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{ch.sample}</p>
                    </div>
                  </button>
                </li>
              ))}
              {moreChannelsOpen && MORE_CHANNELS.map((ch) => (
                <li key={ch.key}>
                  <button
                    type="button"
                    onClick={() => setActiveChannelDetail(ch)}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 text-left transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-lg ${ch.iconBg} flex items-center justify-center flex-shrink-0`}>
                      <span className={`material-symbols-outlined text-[18px] ${ch.color}`}>{ch.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13.5px] font-semibold text-gray-900 dark:text-white">{ch.label}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase bg-gray-100 dark:bg-gray-800 text-gray-500">Demo</span>
                        <span className="ml-auto text-[11.5px] text-gray-400">hace {CHANNEL_AGES_MIN[ch.key]} min</span>
                      </div>
                      <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{ch.sample}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setMoreChannelsOpen(v => !v)}
              className="w-full px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 text-[12.5px] font-semibold text-indigo-600 hover:bg-gray-50 dark:hover:bg-gray-800/40"
            >
              {moreChannelsOpen ? 'Mostrar menos canales' : 'Mostrar más canales'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Channel detail modal ───────────────────────────────────── */}
      {activeChannelDetail && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setActiveChannelDetail(null)}
        >
          <div
            className="bg-white dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${activeChannelDetail.iconBg} flex items-center justify-center`}>
                <span className={`material-symbols-outlined ${activeChannelDetail.color}`}>{activeChannelDetail.icon}</span>
              </div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold text-gray-900 dark:text-white">{activeChannelDetail.label}</h3>
                <p className="text-[12px] text-gray-500">Modo demo · sin desplegar</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveChannelDetail(null)}
                className="material-symbols-outlined text-gray-400 hover:text-gray-700"
              >
                close
              </button>
            </div>
            <div className="p-5 space-y-3 text-[13.5px] text-gray-700 dark:text-gray-300">
              <p>{activeChannelDetail.sample}</p>
              <p className="text-[12.5px] text-gray-500">
                Configura este canal desde Tools & Integrations para empezar a recibir conversaciones reales.
              </p>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveChannelDetail(null)}
                className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  const ch = activeChannelDetail;
                  setActiveChannelDetail(null);
                  if (onNavigate) {
                    onNavigate({
                      page: 'tools_integrations',
                      section: ch.key,
                      sourceContext: 'personal_profile_channel',
                    });
                  }
                }}
                className="px-3 py-1.5 rounded-md bg-black dark:bg-white text-white dark:text-black text-[12.5px] font-semibold"
              >
                Configurar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
