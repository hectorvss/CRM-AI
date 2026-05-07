import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { iamApi } from '../../api/client';
import { supabase } from '../../api/supabase';
import LoadingState from '../LoadingState';
import { DetailSection, DetailRow } from './sections';

type SaveHandler = (() => Promise<void> | void) | null;

type ProfileTabProps = {
  // Parent (Profile.tsx) does ONE fetch and passes user down — eliminates the
  // duplicate `useApi(iamApi.me)` calls each tab used to do, which were
  // multiplying 401 events into a redirect storm.
  user: any | null;
  userLoading?: boolean;
  refetchUser?: () => void;
  onSaveReady?: (handler: SaveHandler) => void;
};

const FALLBACK_USER = {
  id: 'system',
  email: 'system@crm-ai.local',
  name: 'System',
  avatar_url: '',
  role: 'workspace_admin',
  created_at: new Date().toISOString(),
  memberships: [],
  context: { role_id: 'workspace_admin', permissions: ['*'] },
  preferences: {},
};

function parsePreferences(prefs: any): Record<string, any> {
  if (!prefs) return {};
  if (typeof prefs === 'string') {
    try { return JSON.parse(prefs); } catch { return {}; }
  }
  return prefs;
}

// Reusable inline editable text input that matches the Inbox detail-rail
// style — flat, no border by default, focus shows a 1px Fin border.
function InlineInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  readOnly = false,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full h-7 text-[13px] px-2 rounded-md border border-transparent bg-transparent ${
        readOnly
          ? 'text-[#646462] cursor-not-allowed'
          : 'text-[#1a1a1a] hover:bg-[#f8f8f7] focus:border-[#1a1a1a] focus:bg-white'
      } focus:outline-none`}
    />
  );
}

function InlineSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full h-7 text-[13px] px-2 rounded-md border border-transparent bg-transparent text-[#1a1a1a] hover:bg-[#f8f8f7] focus:border-[#1a1a1a] focus:bg-white focus:outline-none"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

function ToggleRow({
  value,
  onChange,
}: { value: boolean; onChange: (v: boolean) => void }) {
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

const TIMEZONES = [
  '(GMT-08:00) Pacific Time',
  '(GMT-05:00) Eastern Time',
  '(GMT+00:00) UTC',
  '(GMT+01:00) Madrid',
  '(GMT+02:00) Berlin',
];

const LANGUAGES = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'pt', label: 'Português' },
];

const TONES = [
  { value: 'neutral',     label: 'Neutral' },
  { value: 'friendly',    label: 'Cercano' },
  { value: 'professional', label: 'Profesional' },
  { value: 'concise',     label: 'Conciso' },
];

const STYLES = [
  { value: 'short',    label: 'Respuestas cortas' },
  { value: 'detailed', label: 'Respuestas detalladas' },
  { value: 'bullets',  label: 'Viñetas' },
];

export default function ProfileTab({ user, userLoading, onSaveReady }: ProfileTabProps) {
  const loading = Boolean(userLoading);
  const currentUser = user || FALLBACK_USER;
  const preferences = useMemo(() => parsePreferences(currentUser?.preferences), [currentUser]);
  // CRITICAL: must memoise on `preferences` — a bare `preferences.profile || {}`
  // creates a NEW empty object on every render when there are no stored profile
  // prefs. That fresh ref propagates into `handleSave`/`hasChanges` via their
  // dep arrays, which forces parent (Profile.tsx) `setSaveHandler` to fire on
  // every render, re-rendering this tab, which loops forever and looks like a
  // page reload to the user.
  const profilePrefs = useMemo<Record<string, any>>(
    () => preferences.profile || {},
    [preferences],
  );

  const [name, setName]               = useState('');
  const [phone, setPhone]             = useState('');
  const [language, setLanguage]       = useState('es');
  const [timezone, setTimezone]       = useState(TIMEZONES[3]);
  const [bio, setBio]                 = useState('');
  const [jobTitle, setJobTitle]       = useState('');
  const [team, setTeam]               = useState('');
  const [avatarUrl, setAvatarUrl]     = useState('');
  const [aiTone, setAiTone]           = useState('neutral');
  const [aiStyle, setAiStyle]         = useState('short');
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [sessionMeta, setSessionMeta] = useState<any>(null);

  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // Hydrate state from server. parsePreferences is null-safe so this is fine
  // even when preferences is missing entirely.
  useEffect(() => {
    if (!currentUser) return;
    setName(currentUser.name || '');
    setAvatarUrl(currentUser.avatar_url || '');
    setPhone(profilePrefs.phone || '');
    setLanguage(profilePrefs.language || 'es');
    setTimezone(profilePrefs.timezone || TIMEZONES[3]);
    setBio(profilePrefs.bio || '');
    setJobTitle(profilePrefs.jobTitle || '');
    setTeam(profilePrefs.team || currentUser?.memberships?.[0]?.team_name || '');
    setAiTone(profilePrefs.aiTone || 'neutral');
    setAiStyle(profilePrefs.aiStyle || 'short');
    setAutoTranslate(Boolean(profilePrefs.autoTranslate));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSessionMeta(data.session);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleAvatarUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    try {
      // Upload to backend so the avatar URL is real and persisted server-side
      // (the previous implementation only stored the file as a data URL in
      // local state, which got persisted as the avatar_url verbatim).
      const res = await iamApi.uploadAvatar(file);
      setAvatarUrl(res.url);
    } catch {
      // Fallback: if upload fails (e.g. offline), preview as data URL so the
      // user still sees their selection; saved on next "Guardar" via updateMe.
      const reader = new FileReader();
      reader.onload = () => {
        setAvatarUrl(typeof reader.result === 'string' ? reader.result : '');
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleSave = useCallback(async () => {
    await iamApi.updateMe({
      name,
      avatar_url: avatarUrl || null,
      preferences: {
        ...preferences,
        profile: {
          ...profilePrefs,
          phone,
          language,
          timezone,
          bio,
          jobTitle,
          team,
          aiTone,
          aiStyle,
          autoTranslate,
        },
      },
    });
  }, [name, avatarUrl, preferences, profilePrefs, phone, language, timezone, bio, jobTitle, team, aiTone, aiStyle, autoTranslate]);

  // Track whether anything has actually changed so the floating bar only
  // shows on edits, not just on tab open.
  const hasChanges = useMemo(() => {
    return (
      name !== (currentUser.name || '') ||
      avatarUrl !== (currentUser.avatar_url || '') ||
      phone !== (profilePrefs.phone || '') ||
      language !== (profilePrefs.language || 'es') ||
      timezone !== (profilePrefs.timezone || TIMEZONES[3]) ||
      bio !== (profilePrefs.bio || '') ||
      jobTitle !== (profilePrefs.jobTitle || '') ||
      team !== (profilePrefs.team || currentUser?.memberships?.[0]?.team_name || '') ||
      aiTone !== (profilePrefs.aiTone || 'neutral') ||
      aiStyle !== (profilePrefs.aiStyle || 'short') ||
      autoTranslate !== Boolean(profilePrefs.autoTranslate)
    );
  }, [name, avatarUrl, phone, language, timezone, bio, jobTitle, team, aiTone, aiStyle, autoTranslate, currentUser, profilePrefs]);

  useEffect(() => {
    if (hasChanges) {
      onSaveReady?.(handleSave);
    } else {
      onSaveReady?.(null);
    }
    return () => onSaveReady?.(null);
  }, [hasChanges, handleSave, onSaveReady]);

  if (loading) return <LoadingState title="Cargando perfil" message="Recuperando tus datos." compact />;

  const emailVerified = Boolean(sessionMeta?.user?.email_confirmed_at);

  return (
    <div className="py-3">
      {/* ── Información personal ──────────────────────────────────────── */}
      <DetailSection title="Información personal">
        <DetailRow label="Nombre">
          <InlineInput value={name} onChange={setName} placeholder="Tu nombre" />
        </DetailRow>
        <DetailRow label="Email">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[#1a1a1a] truncate">{currentUser.email}</span>
            <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-semibold ${
              emailVerified
                ? 'bg-[#dcfce7] text-[#166534]'
                : 'bg-[#fef3c7] text-[#92400e]'
            }`}>
              {emailVerified ? 'Verificado' : 'Pendiente'}
            </span>
          </div>
        </DetailRow>
        <DetailRow label="Teléfono">
          <InlineInput value={phone} onChange={setPhone} placeholder="+34 600 000 000" />
        </DetailRow>
        <DetailRow label="Idioma">
          <InlineSelect value={language} onChange={setLanguage} options={LANGUAGES} />
        </DetailRow>
        <DetailRow label="Zona horaria">
          <InlineSelect
            value={timezone}
            onChange={setTimezone}
            options={TIMEZONES.map(tz => ({ value: tz, label: tz }))}
          />
        </DetailRow>
        <DetailRow label="Miembro desde" value={currentUser.created_at ? new Date(currentUser.created_at).toLocaleDateString() : '—'} />
      </DetailSection>

      {/* ── Contexto de identidad ─────────────────────────────────────── */}
      <DetailSection title="Contexto de identidad">
        <div className="flex items-start gap-4 py-2">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-[#f8f8f7] border border-[#e9eae6] flex items-center justify-center flex-shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-[#646462]">person</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] text-[#646462] mb-2">Tu foto se mostrará en conversaciones, comentarios y menciones.</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="h-7 px-3 rounded-md border border-[#e9eae6] text-[12px] font-semibold text-[#1a1a1a] hover:bg-[#f8f8f7]"
              >
                Subir nueva
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl('')}
                  className="h-7 px-3 rounded-md text-[12px] font-semibold text-[#646462] hover:text-[#b91c1c]"
                >
                  Quitar
                </button>
              )}
              <input ref={uploadInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </div>
          </div>
        </div>
        <DetailRow label="Cargo">
          <InlineInput value={jobTitle} onChange={setJobTitle} placeholder="Customer Success Manager" />
        </DetailRow>
        <DetailRow label="Equipo">
          <InlineInput value={team} onChange={setTeam} placeholder="Soporte L1" />
        </DetailRow>
        <div className="flex items-start py-1.5 w-full min-w-0">
          <span className="w-[113px] flex-shrink-0 text-[13px] text-[#646462] truncate pt-0.5">Bio</span>
          <div className="flex-1 min-w-0">
            <textarea
              value={bio}
              maxLength={280}
              onChange={e => setBio(e.target.value)}
              placeholder="Escribe una breve presentación (280 caracteres)"
              className="w-full min-h-[60px] text-[13px] px-2 py-1.5 rounded-md border border-[#e9eae6] bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a] resize-none"
            />
            <p className="text-[11px] text-[#646462] mt-1">{bio.length}/280</p>
          </div>
        </div>
      </DetailSection>

      {/* ── Preferencias de IA ─────────────────────────────────────────── */}
      <DetailSection title="Preferencias de IA" helper="Cómo el copilot redacta y traduce respuestas en tu nombre.">
        <DetailRow label="Tono de voz">
          <InlineSelect value={aiTone} onChange={setAiTone} options={TONES} />
        </DetailRow>
        <DetailRow label="Estilo de respuesta">
          <InlineSelect value={aiStyle} onChange={setAiStyle} options={STYLES} />
        </DetailRow>
        <DetailRow label="Auto-traducir">
          <ToggleRow value={autoTranslate} onChange={setAutoTranslate} />
        </DetailRow>
      </DetailSection>
    </div>
  );
}
