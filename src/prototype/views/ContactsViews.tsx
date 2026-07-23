// ─────────────────────────────────────────────────────────────────────────────
// Contacts / People / Companies views
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────

import { useApi } from '../../api/hooks';
import { casesApi, companiesApi, customersApi } from '../../api/client';
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { IMG_QUALIFICATION, IMG_USERDATA_BANNER } from '../assets';
import { ICON_BULLET_1, ICON_BULLET_2, ICON_BULLET_3, ICON_BULLET_4 } from '../icons';
import { ICON_ADD_FILTER, ICON_BACK, ICON_CHEVRON, ICON_CLOSE, ICON_EMPTY_STATE, ICON_INFO, ICON_LEADS_CHIP, ICON_LEARN, ICON_MSG, ICON_MSG_LEADS, ICON_NEW_USER, ICON_PERSONAS, ICON_SEARCH, ICON_TAG, ICON_VIEW_COLS, ICON_VIEW_GRID, ICON_VIEW_LIST, IMG_ILLUSTRATION, SettingsSidebar, TrialBanner, formatContactWhen } from '../sharedUi';
import type { View } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Contacts filter bar — the Intercom-style "+ Añadir filtro" system, shared by
// Personas (UsersTable) and Empresas (CompaniesTable). A field catalog drives
// both the add-filter dropdown and the column chooser; each field type picks
// its own operator popover (date → relative/absolute, number, text, select,
// boolean). Identical format for people and companies.
// ─────────────────────────────────────────────────────────────────────────────

type CFType = 'date' | 'number' | 'text' | 'select' | 'boolean';
type CFIcon = 'person' | 'people' | 'calendar' | 'bars' | 'briefcase' | 'owner' | 'swap' | 'smiley'
  | 'mail' | 'globe' | 'phone' | 'id' | 'clock' | 'monitor' | 'pie' | 'tag' | 'block' | 'warn' | 'code' | 'building';
type ContactField = { key: string; label: string; icon: CFIcon; type: CFType; options?: string[]; group?: string };

function CFieldIcon({ kind, className = 'w-3.5 h-3.5' }: { kind: CFIcon; className?: string }) {
  const c = `${className} fill-none stroke-[#646462]`;
  switch (kind) {
    case 'person':    return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><circle cx="8" cy="5.5" r="2.5"/><path d="M3.5 13c.6-2.2 2.3-3.5 4.5-3.5s3.9 1.3 4.5 3.5"/></svg>;
    case 'people':    return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><circle cx="6" cy="6" r="2"/><path d="M2.5 12.5c.4-1.9 1.8-3 3.5-3s3.1 1.1 3.5 3"/><path d="M10.5 5a2 2 0 0 1 0 3.9M11 12.5c-.2-1.3-.8-2.3-1.7-3"/></svg>;
    case 'calendar':  return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/></svg>;
    case 'bars':      return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3" strokeLinecap="round"><path d="M3 13V7M8 13V3M13 13V9"/></svg>;
    case 'briefcase': return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><rect x="2.5" y="5" width="11" height="8" rx="1.2"/><path d="M6 5V4a2 2 0 0 1 4 0v1"/></svg>;
    case 'owner':     return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="6.5" r="1.8"/><path d="M4.8 12.5c.4-1.5 1.6-2.5 3.2-2.5s2.8 1 3.2 2.5"/></svg>;
    case 'swap':      return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h8l-2-2M13 11H5l2 2"/></svg>;
    case 'smiley':    return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><circle cx="8" cy="8" r="6"/><path d="M5.8 9.5c.5.7 1.3 1.1 2.2 1.1s1.7-.4 2.2-1.1" strokeLinecap="round"/><path d="M6 6.5v.1M10 6.5v.1" strokeLinecap="round"/></svg>;
    case 'mail':      return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><rect x="2.5" y="4" width="11" height="8" rx="1.2"/><path d="M2.5 5l5.5 4 5.5-4" strokeLinecap="round"/></svg>;
    case 'globe':     return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c1.8 1.6 2.8 3.8 2.8 6S9.8 12.4 8 14C6.2 12.4 5.2 10.2 5.2 8S6.2 3.6 8 2z"/></svg>;
    case 'phone':     return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3" strokeLinejoin="round"><path d="M3 3h2.5l1.2 3-1.4 1c.7 1.6 2.1 3 3.7 3.7l1-1.4 3 1.2V13c0 .3-.2.5-.5.5C6.5 13.5 2.5 9.5 2.5 3.5 2.5 3.2 2.7 3 3 3z"/></svg>;
    case 'id':        return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><rect x="2" y="4" width="12" height="8" rx="1.2"/><circle cx="6" cy="8" r="1.5"/><path d="M9.5 7h3M9.5 9.5h2"/></svg>;
    case 'clock':     return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.3" strokeLinecap="round"/></svg>;
    case 'monitor':   return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><rect x="2" y="3" width="12" height="8" rx="1.2"/><path d="M6 13.5h4M8 11v2.5"/></svg>;
    case 'pie':       return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><path d="M8 2.5A5.5 5.5 0 1 0 13.5 8H8z"/><path d="M8 2.5V8h5.5"/></svg>;
    case 'tag':       return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3" strokeLinejoin="round"><path d="M2.5 2.5h4.6L14 9.4 9.4 14 2.5 7.1V2.5z"/><circle cx="5" cy="5" r=".8" fill="currentColor" stroke="none"/></svg>;
    case 'block':     return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><circle cx="8" cy="8" r="6"/><path d="M3.8 3.8l8.4 8.4" strokeLinecap="round"/></svg>;
    case 'warn':      return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2l6 11H2z"/><path d="M8 6.5v3M8 11.4v.1"/></svg>;
    case 'code':      return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 5L2.5 8l3 3M10.5 5l3 3-3 3"/></svg>;
    case 'building':  return <svg viewBox="0 0 16 16" className={c} strokeWidth="1.3"><rect x="3" y="2.5" width="10" height="11" rx="1"/><path d="M5.5 5h1.5M9 5h1.5M5.5 7.5h1.5M9 7.5h1.5M5.5 10h1.5M9 10h1.5"/></svg>;
  }
}

const PEOPLE_FILTER_FIELDS: ContactField[] = [
  { key: 'name', label: 'Name', icon: 'person', type: 'text' },
  { key: 'firstSeen', label: 'First Seen', icon: 'calendar', type: 'date' },
  { key: 'signedUp', label: 'Signed up', icon: 'calendar', type: 'date' },
  { key: 'lastSeen', label: 'Last seen', icon: 'calendar', type: 'date' },
  { key: 'webSessions', label: 'Web sessions', icon: 'bars', type: 'number' },
  { key: 'city', label: 'City', icon: 'bars', type: 'text' },
  { key: 'account', label: 'Account', icon: 'briefcase', type: 'text' },
  { key: 'owner', label: 'Owner', icon: 'owner', type: 'text' },
  { key: 'leadCategory', label: 'Lead category', icon: 'swap', type: 'select', options: ['Good fit', 'Bad fit', 'Sin calificar'] },
  { key: 'qualificationStatus', label: 'Qualification status', icon: 'swap', type: 'select', options: ['Automatically qualified', 'Manually qualified', 'Unqualified'] },
  { key: 'conversationRating', label: 'Conversation Rating', icon: 'smiley', type: 'select', options: ['1', '2', '3', '4', '5'] },
  { key: 'email', label: 'Email', icon: 'mail', type: 'text' },
  { key: 'emailDomain', label: 'Email domain', icon: 'globe', type: 'text' },
  { key: 'phone', label: 'Phone', icon: 'phone', type: 'text' },
  { key: 'userId', label: 'User ID', icon: 'id', type: 'text' },
  { key: 'type', label: 'Type', icon: 'person', type: 'select', options: ['Usuario', 'Lead', 'Visitante'] },
  { key: 'country', label: 'Country', icon: 'globe', type: 'text' },
  { key: 'region', label: 'Region', icon: 'globe', type: 'text' },
  { key: 'timezone', label: 'Timezone', icon: 'clock', type: 'text' },
  { key: 'continentCode', label: 'Continent code', icon: 'globe', type: 'text' },
  { key: 'browserLanguage', label: 'Browser Language', icon: 'globe', type: 'text' },
  { key: 'languageOverride', label: 'Language Override', icon: 'globe', type: 'text' },
  { key: 'browser', label: 'Browser', icon: 'monitor', type: 'text' },
  { key: 'browserVersion', label: 'Browser Version', icon: 'monitor', type: 'text' },
  { key: 'os', label: 'OS', icon: 'monitor', type: 'text' },
  { key: 'segment', label: 'Segment', icon: 'pie', type: 'select', options: ['Activos', 'Nuevos', 'En riesgo'] },
  { key: 'personTag', label: 'Person tag', icon: 'tag', type: 'text' },
  { key: 'unsubscribed', label: 'Unsubscribed from Emails', icon: 'block', type: 'boolean' },
  { key: 'markedSpam', label: 'Marked email as spam', icon: 'warn', type: 'boolean' },
  { key: 'hardBounced', label: 'Has hard bounced', icon: 'warn', type: 'boolean' },
  { key: 'utmCampaign', label: 'UTM Campaign', icon: 'code', type: 'text' },
  { key: 'utmContent', label: 'UTM Content', icon: 'code', type: 'text' },
  { key: 'utmMedium', label: 'UTM Medium', icon: 'code', type: 'text' },
];

const COMPANY_FILTER_FIELDS: ContactField[] = [
  { key: 'name', label: 'Company name', icon: 'building', type: 'text' },
  { key: 'companyId', label: 'Company ID', icon: 'id', type: 'text' },
  { key: 'createdAt', label: 'Created at', icon: 'calendar', type: 'date' },
  { key: 'lastSeen', label: 'Last seen', icon: 'calendar', type: 'date' },
  { key: 'userCount', label: 'People', icon: 'people', type: 'number' },
  { key: 'monthlySpend', label: 'Monthly spend', icon: 'bars', type: 'number' },
  { key: 'plan', label: 'Plan', icon: 'swap', type: 'select', options: ['Free', 'Premium', 'Enterprise'] },
  { key: 'size', label: 'Company size', icon: 'people', type: 'number' },
  { key: 'industry', label: 'Industry', icon: 'briefcase', type: 'text' },
  { key: 'website', label: 'Website', icon: 'globe', type: 'text' },
  { key: 'owner', label: 'Owner', icon: 'owner', type: 'text' },
  { key: 'city', label: 'City', icon: 'globe', type: 'text' },
  { key: 'country', label: 'Country', icon: 'globe', type: 'text' },
  { key: 'companyTag', label: 'Company tag', icon: 'tag', type: 'text' },
];

type ActiveFilter = { id: string; fieldKey: string; operator: string; value: string };

function newFilterFor(f: ContactField): ActiveFilter {
  const op = f.type === 'date' ? 'exactly' : f.type === 'number' ? 'is' : f.type === 'select' ? 'is' : f.type === 'boolean' ? 'is true' : 'is';
  const val = f.type === 'select' ? (f.options?.[0] ?? '') : '';
  return { id: `flt_${f.key}_${Math.random().toString(36).slice(2, 7)}`, fieldKey: f.key, operator: op, value: val };
}

function filterChipLabel(f: ContactField, a: ActiveFilter): string {
  if (f.type === 'boolean') return `${f.label} ${a.operator}`;
  if (f.type === 'date') {
    if (a.operator === 'is unknown' || a.operator === 'has any value') return `${f.label} ${a.operator}`;
    if (['more than', 'exactly', 'less than'].includes(a.operator)) return `${f.label} ${a.operator} ${a.value || '…'} days ago`;
    return `${f.label} ${a.operator} ${a.value || '…'}`;
  }
  if (a.operator === 'is unknown' || a.operator === 'has any value') return `${f.label} ${a.operator}`;
  return `${f.label} ${a.operator} ${a.value || '…'}`;
}

/** Operator popover, shaped by the field type (mirrors the reference exactly). */
function ContactFilterPopover({ field, filter, onChange, onClose }: {
  field: ContactField;
  filter: ActiveFilter;
  onChange: (patch: Partial<ActiveFilter>) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const Radio = ({ on, label, children }: { on: boolean; label: string; children?: ReactNode }) => (
    <button onClick={() => onChange({ operator: label })} className="w-full flex items-center gap-2.5 text-left py-1.5">
      <span className={`w-[15px] h-[15px] rounded-full border flex items-center justify-center flex-shrink-0 ${on ? 'border-[#3b59f6]' : 'border-[#c8c9c4]'}`}>
        {on && <span className="w-[7px] h-[7px] rounded-full bg-[#3b59f6]" />}
      </span>
      <span className="text-[13px] text-[#1a1a1a]">{label}</span>
      {on && children}
    </button>
  );

  return (
    <div ref={ref} className="absolute left-0 top-[calc(100%+8px)] z-40 w-[300px] bg-white rounded-[10px] border border-[#e9eae6] shadow-[0_10px_36px_rgba(20,20,20,0.18)] overflow-hidden">
      <div className="px-4 py-3 max-h-[320px] overflow-y-auto">
        {field.type === 'date' && (
          <>
            <p className="text-[12px] font-semibold text-[#646462] mb-1">Relative</p>
            {['more than', 'exactly', 'less than'].map(op => (
              <Fragment key={op}><Radio on={filter.operator === op} label={op}>
                <span className="ml-2 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  <input type="number" min={0} value={filter.value} onChange={e => onChange({ value: e.target.value })} className="w-[70px] h-7 px-2 rounded-[6px] border border-[#e9eae6] text-[12.5px] focus:outline-none focus:border-[#1a1a1a]" />
                  <span className="text-[12.5px] text-[#646462]">days ago</span>
                </span>
              </Radio></Fragment>
            ))}
            <p className="text-[12px] font-semibold text-[#646462] mt-2 mb-1">Absolute</p>
            {['after', 'on', 'before', 'is unknown', 'has any value'].map(op => (
              <Fragment key={op}><Radio on={filter.operator === op} label={op}>
                {['after', 'on', 'before'].includes(op) && (
                  <input type="date" value={filter.value} onClick={e => e.stopPropagation()} onChange={e => onChange({ value: e.target.value })} className="ml-2 h-7 px-2 rounded-[6px] border border-[#e9eae6] text-[12.5px] focus:outline-none focus:border-[#1a1a1a]" />
                )}
              </Radio></Fragment>
            ))}
          </>
        )}
        {field.type === 'number' && (
          <>
            {['is less than', 'is', 'is greater than', 'is unknown', 'has any value'].map(op => (
              <Fragment key={op}><Radio on={filter.operator === op} label={op}>
                {['is less than', 'is', 'is greater than'].includes(op) && (
                  <input type="number" value={filter.value} onClick={e => e.stopPropagation()} onChange={e => onChange({ value: e.target.value })} className="ml-2 w-[80px] h-7 px-2 rounded-[6px] border border-[#e9eae6] text-[12.5px] focus:outline-none focus:border-[#1a1a1a]" />
                )}
              </Radio></Fragment>
            ))}
          </>
        )}
        {field.type === 'text' && (
          <>
            {['is', 'is not', 'contains', 'does not contain', 'starts with', 'is unknown', 'has any value'].map(op => (
              <Fragment key={op}><Radio on={filter.operator === op} label={op}>
                {!['is unknown', 'has any value'].includes(op) && (
                  <input value={filter.value} onClick={e => e.stopPropagation()} onChange={e => onChange({ value: e.target.value })} placeholder="valor" className="ml-2 flex-1 min-w-0 h-7 px-2 rounded-[6px] border border-[#e9eae6] text-[12.5px] focus:outline-none focus:border-[#1a1a1a]" />
                )}
              </Radio></Fragment>
            ))}
          </>
        )}
        {field.type === 'select' && (
          <>
            <p className="text-[12px] font-semibold text-[#646462] mb-1">is</p>
            {(field.options ?? []).map(o => (
              <button key={o} onClick={() => onChange({ operator: 'is', value: o })} className="w-full flex items-center gap-2.5 text-left py-1.5">
                <span className={`w-[15px] h-[15px] rounded-full border flex items-center justify-center flex-shrink-0 ${filter.value === o ? 'border-[#3b59f6]' : 'border-[#c8c9c4]'}`}>
                  {filter.value === o && <span className="w-[7px] h-[7px] rounded-full bg-[#3b59f6]" />}
                </span>
                <span className="text-[13px] text-[#1a1a1a]">{o}</span>
              </button>
            ))}
            <div className="mt-1 pt-1 border-t border-[#f1f1ee]">
              <Radio on={filter.operator === 'is unknown'} label="is unknown" />
              <Radio on={filter.operator === 'has any value'} label="has any value" />
            </div>
          </>
        )}
        {field.type === 'boolean' && (
          <>
            {['is true', 'is false', 'has any value'].map(op => (
              <Fragment key={op}><Radio on={filter.operator === op} label={op} /></Fragment>
            ))}
          </>
        )}
      </div>
      <button onClick={onClose} className="w-full h-10 border-t border-[#e9eae6] text-[13.5px] font-medium text-[#f4643f] hover:bg-[#fdf6f3]">Done</button>
    </div>
  );
}

/** The "+ Añadir filtro" dropdown: searchable field list + Nuevo atributo + CSV. */
function AddFilterDropdown({ fields, onPick, onClose }: { fields: ContactField[]; onPick: (f: ContactField) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const matches = fields.filter(f => f.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div ref={ref} className="absolute left-0 top-[calc(100%+6px)] z-40 w-[300px] bg-white rounded-[12px] border border-[#e9eae6] shadow-[0_10px_36px_rgba(20,20,20,0.18)] overflow-hidden">
      <div className="p-2 border-b border-[#f1f1ee]">
        <div className="flex items-center gap-2 h-9 px-2.5 rounded-[8px] border border-[#1a1a1a]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14" strokeLinecap="round"/></svg>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar personas y datos de la empresa" className="flex-1 min-w-0 text-[13px] text-[#1a1a1a] placeholder:text-[#a4a4a2] focus:outline-none" />
        </div>
      </div>
      <div className="max-h-[300px] overflow-y-auto py-1">
        {q === '' && <div className="px-3 pt-1.5 pb-1 text-[12.5px] font-semibold text-[#646462]">Datos de personas</div>}
        {matches.map(f => (
          <button key={f.key} onClick={() => onPick(f)} className="w-full h-9 px-3 flex items-center gap-2.5 text-left text-[13.5px] text-[#1a1a1a] hover:bg-[#f8f8f7]">
            <span className="w-4 h-4 flex items-center justify-center flex-shrink-0"><CFieldIcon kind={f.icon} /></span>
            <span className="flex-1 truncate">{f.label}</span>
          </button>
        ))}
        {matches.length === 0 && <p className="px-3 py-3 text-[13px] text-[#a4a4a2]">Sin resultados.</p>}
      </div>
      <div className="border-t border-[#f1f1ee]">
        <button className="w-full h-10 px-3 flex items-center gap-2.5 text-left text-[13.5px] text-[#f4643f] font-medium hover:bg-[#fdf6f3]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.6"><path d="M3 8h10M8 3v10" strokeLinecap="round"/></svg>
          Nuevo atributo
        </button>
        <button className="w-full h-10 px-3 flex items-center gap-2.5 text-left text-[13px] text-[#646462] hover:bg-[#f8f8f7] border-t border-[#f1f1ee]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.3"><path d="M4.5 12a3 3 0 0 1 .5-5.96 4 4 0 0 1 7.6-.9A2.75 2.75 0 0 1 12 12z" strokeLinejoin="round"/><path d="M8 7v4M6.3 8.7L8 7l1.7 1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span className="flex-1">Filter audience from CSV</span>
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.2"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v4M8 11v.1" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
}

/** The full filter bar: a base segment chip, active-filter chips (each with its
 *  operator popover) and the "+ Añadir filtro" trigger. Reports active filters. */
function ContactsFilterBar({ fields, baseChip, filters, setFilters }: {
  fields: ContactField[];
  baseChip: { icon: CFIcon; label: string };
  filters: ActiveFilter[];
  setFilters: (updater: (prev: ActiveFilter[]) => ActiveFilter[]) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [openChip, setOpenChip] = useState<string | null>(null);
  const byKey = (k: string) => fields.find(f => f.key === k)!;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-2 h-8 px-3 rounded-full border border-[#e9eae6] bg-white text-[13px] text-[#1a1a1a]">
        <CFieldIcon kind={baseChip.icon} /> {baseChip.label}
      </span>
      {filters.map(a => {
        const field = byKey(a.fieldKey);
        if (!field) return null;
        return (
          <div key={a.id} className="relative">
            <span className={`inline-flex items-center gap-2 h-8 pl-3 pr-1.5 rounded-full border bg-white text-[13px] text-[#1a1a1a] ${openChip === a.id ? 'border-[#1a1a1a]' : 'border-[#e9eae6]'}`}>
              <CFieldIcon kind={field.icon} />
              <button onClick={() => setOpenChip(o => o === a.id ? null : a.id)} className="max-w-[220px] truncate">{filterChipLabel(field, a)}</button>
              <button
                onClick={() => { setOpenChip(null); setFilters(prev => prev.filter(x => x.id !== a.id)); }}
                title="Quitar filtro"
                className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${openChip === a.id ? 'bg-[#1a1a1a] text-white' : 'text-[#646462] hover:bg-[#f1f1ee]'}`}
              >
                <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 fill-none stroke-current" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
              </button>
            </span>
            {openChip === a.id && (
              <ContactFilterPopover
                field={field}
                filter={a}
                onChange={patch => setFilters(prev => prev.map(x => x.id === a.id ? { ...x, ...patch } : x))}
                onClose={() => setOpenChip(null)}
              />
            )}
          </div>
        );
      })}
      <div className="relative">
        <button onClick={() => setAddOpen(o => !o)} className="inline-flex items-center gap-1.5 h-8 px-2 text-[13px] text-[#f4643f] font-medium hover:underline">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.6"><path d="M3 8h10M8 3v10" strokeLinecap="round"/></svg>
          Añadir filtro
        </button>
        {addOpen && (
          <AddFilterDropdown
            fields={fields}
            onPick={f => { setFilters(prev => [...prev, newFilterFor(f)]); setAddOpen(false); setOpenChip(null); }}
            onClose={() => setAddOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

/** "Más" dropdown — Exportar / Archivar / Anular suscripción / Suscribir. */
function ContactsMoreMenu({ entity, onAction }: { entity: 'usuarios' | 'empresas'; onAction: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, [open]);
  const items = [
    { key: 'export', label: `Exportar ${entity}`, danger: false, icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.3"><path d="M4.5 12a3 3 0 0 1 .5-5.96 4 4 0 0 1 7.6-.9A2.75 2.75 0 0 1 12 12z" strokeLinejoin="round"/><path d="M8 11V7M6.3 8.7L8 7l1.7 1.7" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    { key: 'archive', label: `${entity === 'usuarios' ? 'Usuarios' : 'Empresas'} del archivo`, danger: true, icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.3"><circle cx="8" cy="8" r="6"/><path d="M3.8 3.8l8.4 8.4" strokeLinecap="round"/></svg> },
    { key: 'unsub', label: `Anular suscripción de ${entity}`, danger: false, icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.3"><circle cx="8" cy="8" r="6"/><path d="M5.5 8h5" strokeLinecap="round"/></svg> },
    { key: 'sub', label: `Suscribir ${entity}`, danger: false, icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  ];
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#1a1a1a] hover:bg-[#efefed]">
        <span>Más</span>
        <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-40 w-[260px] bg-white rounded-[10px] border border-[#e9eae6] shadow-[0_10px_36px_rgba(20,20,20,0.18)] py-1.5">
          {items.map(it => (
            <button key={it.key} onClick={() => { setOpen(false); onAction(it.label); }} className={`w-full h-9 px-3 flex items-center gap-2.5 text-left text-[13.5px] hover:bg-[#f8f8f7] ${it.danger ? 'text-[#e5484d]' : 'text-[#1a1a1a]'}`}>
              <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Column chooser ("|||" button) — the "Atributos … mostrados" checklist. */
function ContactsColumnChooser({ entity, columns, visible, onToggle, lockedKey }: {
  entity: 'usuario' | 'empresa';
  columns: ContactField[];
  visible: Set<string>;
  onToggle: (key: string) => void;
  lockedKey: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 border border-[#e9eae6] rounded-[8px] px-2.5 h-8 bg-white hover:bg-[#f8f8f7]" title="Columnas">
        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.3"><path d="M4 3v10M8 3v10M12 3v10"/></svg>
        <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-40 w-[280px] bg-white rounded-[10px] border border-[#e9eae6] shadow-[0_10px_36px_rgba(20,20,20,0.18)] py-1.5 max-h-[360px] overflow-y-auto">
          <div className="px-3 pt-1 pb-1.5 text-[12.5px] font-semibold text-[#a4a4a2]">Atributos de {entity} mostrados</div>
          {columns.map(c => {
            const locked = c.key === lockedKey;
            const on = visible.has(c.key) || locked;
            return (
              <button key={c.key} disabled={locked} onClick={() => onToggle(c.key)} className={`w-full h-9 px-3 flex items-center gap-2.5 text-left text-[13.5px] ${locked ? 'cursor-default' : 'hover:bg-[#f8f8f7]'}`}>
                <span className={`w-[15px] h-[15px] rounded-[3px] border flex items-center justify-center flex-shrink-0 ${on ? (locked ? 'bg-[#c8c9c4] border-[#c8c9c4]' : 'bg-[#3b59f6] border-[#3b59f6]') : 'bg-white border-[#c8c9c4]'}`}>
                  {on && <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 fill-none stroke-white" strokeWidth="2.4"><path d="M3 8.5l3.3 3.3L13 4.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </span>
                <span className="w-4 h-4 flex items-center justify-center flex-shrink-0"><CFieldIcon kind={c.icon} /></span>
                <span className="flex-1 truncate text-[#1a1a1a]">{c.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}



// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS VIEW — connected to customersApi (live data, no mocks)
// ─────────────────────────────────────────────────────────────────────────────

// Canonical contact shape used by every Contacts-side component below.
type ContactRow = {
  id: string;
  name: string;
  email: string;
  initial: string;
  color: string;
  channel: string;
  city: string;
  type: 'Usuario' | 'Lead';
  openCases: number;
  segment: 'vip' | 'standard' | 'regular';
  createdAt: string | null;
  lastSeenAt: string | null;
  webSessions: number;
};

const CONTACT_AVATAR_COLORS = ['#61d65c', '#85e0d9', '#b09efa', '#fa7938', '#f5b769', '#7c89ff'];
function pickContactColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return CONTACT_AVATAR_COLORS[h % CONTACT_AVATAR_COLORS.length];
}

function mapContactRow(c: any): ContactRow {
  const name  = c.canonicalName || c.name || c.canonicalEmail || c.email || 'Contacto';
  const email = c.canonicalEmail || c.email || '';
  const initial = (name.trim()[0] || '?').toUpperCase();
  const isLead = (c.kind === 'lead') || (Number(c.openCases ?? 0) === 0 && Number(c.problemsResolved ?? 0) === 0);
  return {
    id:        c.id,
    name,
    email,
    initial,
    color:     pickContactColor(c.id || name),
    channel:   c.preferredChannel || c.role || c.company || (email ? `en ${email.split('@')[1] || 'web'}` : 'en web'),
    city:      c.location || c.city || 'Desconocido',
    type:      isLead ? 'Lead' : 'Usuario',
    openCases: Number(c.openCases ?? 0),
    segment:   (c.segment === 'vip' ? 'vip' : c.segment === 'standard' ? 'standard' : 'regular'),
    createdAt: c.createdAt || null,
    lastSeenAt: c.lastInteractionAt || c.lastSeenAt || c.updatedAt || c.createdAt || null,
    webSessions: Number(c.webSessions ?? 0),
  };
}

function useContactsData() {
  const { data, loading, error, refetch } = useApi<any[]>(() => customersApi.list(), [], []);
  const all = useMemo<ContactRow[]>(() => Array.isArray(data) ? data.map(mapContactRow) : [], [data]);
  const thirtyDaysAgo = Date.now() - 30 * 86400000;
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const active = useMemo(() => all.filter(c => c.openCases > 0 || (c.lastSeenAt && new Date(c.lastSeenAt).getTime() > thirtyDaysAgo)), [all, thirtyDaysAgo]);
  const fresh  = useMemo(() => all.filter(c => c.createdAt && new Date(c.createdAt).getTime() > sevenDaysAgo), [all, sevenDaysAgo]);
  const leads  = useMemo(() => all.filter(c => c.type === 'Lead'), [all]);
  const users  = useMemo(() => all.filter(c => c.type === 'Usuario'), [all]);
  return { all, users, active, fresh, leads, loading, error, refetch };
}

// ── New Message Template Picker ───────────────────────────────────────────────
const MSG_CATEGORIES_LIST = ['Todo', 'Recuperar la interacción', 'Generación de prospectos', 'Transaccional', 'Incorporación', 'Asistencia a clientes', 'Interacción'];
const MSG_TYPES_LIST = [
  { icon: '💬', label: 'Chat',                          contentType: 'chat'      },
  { icon: '📢', label: 'Banner',                        contentType: 'banner'    },
  { icon: '📋', label: 'Publicar',                      contentType: 'post'      },
  { icon: '✉️',  label: 'Correo electrónico',            contentType: 'email'     },
  { icon: '🔔', label: 'Notificación instantánea móvil', contentType: 'push'      },
  { icon: '🧭', label: 'Recorrido de producto',          contentType: 'chat'      },
  { icon: '✅', label: 'Lista de verificación',          contentType: 'chat'      },
  { icon: '📱', label: 'SMS',                           contentType: 'sms'       },
  { icon: '📊', label: 'Encuesta',                      contentType: 'chat'      },
  { icon: '🎠', label: 'Carrusel móvil',                contentType: 'push'      },
  { icon: '⚡', label: 'Flujo de trabajo',               contentType: 'all'       },
  { icon: '📰', label: 'Noticias',                      contentType: 'post'      },
  { icon: '💚', label: 'WhatsApp',                      contentType: 'whatsapp'  },
  { icon: '📡', label: 'Difusión',                      contentType: 'all'       },
  { icon: '🎮', label: 'Difusión en Discord',           contentType: 'chat'      },
];
const QUICK_TPLS = [
  { icon: '📢', kind: 'Post', title: 'Announce a new feature to drive adoption', preview: "Hey ✨FirstName✨ 🚀\nWe just released a new feature\nTake a look" },
  { icon: '📢', kind: 'Post', title: 'Offer a discount to boost sales',          preview: "See something you like? ✨\nEnjoy 10% off with this code:\nSUMMER10"  },
  { icon: '📢', kind: 'Post', title: 'Become a power user',                      preview: "Become a ✨AppName✨ pro\nWatch and learn online today 💪"            },
  { icon: '💬', kind: 'Chat', title: 'Ask for feedback after a purchase',        preview: "Hey ✨FirstName✨ 👋 what did\nyou think of your recent purchase?"      },
];
function NewMessageTemplateModal({ onClose, onSelect }: {
  onClose: () => void;
  onSelect: (contentType: string, title: string) => void;
}) {
  const [cat, setCat] = useState('Todo');
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,.45)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-[16px] shadow-2xl w-[780px] max-h-[84vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6]">
          <h2 className="text-[18px] font-semibold text-[#1a1a1a]">Elegir una plantilla</h2>
          <div className="flex items-center gap-3">
            <button className="px-4 py-1.5 text-[13px] font-medium border border-[#e9eae6] rounded-full text-[#1a1a1a] hover:bg-[#f5f5f4]">Probar una demostración</button>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f5f5f4] text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.6"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-[180px] flex-shrink-0 border-r border-[#e9eae6] py-3 px-2 overflow-y-auto">
            {MSG_CATEGORIES_LIST.map(c => (
              <button key={c} onClick={() => setCat(c)} className={`w-full text-left px-3 py-2 rounded-[8px] text-[13px] font-medium mb-0.5 transition-colors ${cat === c ? 'bg-[#f0f0ee] text-[#1a1a1a]' : 'text-[#646462] hover:bg-[#f8f8f7] hover:text-[#1a1a1a]'}`}>{c}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <p className="text-[13px] font-semibold text-[#1a1a1a] mb-3">Comenzar desde cero</p>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {MSG_TYPES_LIST.map(t => (
                <button key={t.label} onClick={() => onSelect(t.contentType, t.label)} className="flex items-center gap-2.5 px-3 py-3 border border-[#e9eae6] rounded-[10px] hover:border-[#3b59f6] hover:bg-[#eff3ff] transition-colors text-left group">
                  <span className="text-[18px] flex-shrink-0">{t.icon}</span>
                  <span className="text-[12.5px] font-medium text-[#1a1a1a] group-hover:text-[#3b59f6] leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
            <p className="text-[13px] font-semibold text-[#1a1a1a] mb-3">O elige un inicio rápido</p>
            <div className="grid grid-cols-2 gap-3 pb-4">
              {QUICK_TPLS.map(t => (
                <button key={t.title} onClick={() => onSelect('chat', t.title)} className="border border-[#e9eae6] rounded-[10px] overflow-hidden hover:border-[#3b59f6] hover:shadow-md transition-all text-left">
                  <div className="bg-[#f8f8f7] px-4 py-3 border-b border-[#e9eae6] min-h-[80px] flex flex-col justify-center">
                    <p className="text-[11.5px] text-[#646462] whitespace-pre-line leading-relaxed">{t.preview}</p>
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[10.5px] text-[#646462] font-medium mb-0.5">{t.icon} {t.kind}</p>
                    <p className="text-[12px] font-semibold text-[#1a1a1a] leading-tight">{t.title}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Contacts Map View ─────────────────────────────────────────────────────────
// City name → [lat, lng] used to resolve the "City, Country" location field
const CITY_COORDS: Record<string, [number, number]> = {
  // Europe
  'London': [51.5074, -0.1278], 'Madrid': [40.4168, -3.7038], 'Barcelona': [41.3851, 2.1734],
  'Paris': [48.8566, 2.3522], 'Berlin': [52.52, 13.405], 'Amsterdam': [52.3676, 4.9041],
  'Rome': [41.9028, 12.4964], 'Vienna': [48.2082, 16.3738], 'Lisbon': [38.7223, -9.1393],
  'Brussels': [50.8503, 4.3517], 'Stockholm': [59.3293, 18.0686], 'Zurich': [47.3769, 8.5417],
  'Munich': [48.1351, 11.582], 'Milan': [45.4654, 9.1859], 'Warsaw': [52.2297, 21.0122],
  'Prague': [50.0755, 14.4378], 'Budapest': [47.4979, 19.0402], 'Athens': [37.9838, 23.7275],
  'Helsinki': [60.1699, 24.9384], 'Bucharest': [44.4268, 26.1025], 'Hamburg': [53.5753, 10.0153],
  'Valencia': [39.4699, -0.3763], 'Seville': [37.3891, -5.9845], 'Bilbao': [43.263, -2.935],
  // Americas
  'New York': [40.7128, -74.006], 'Los Angeles': [34.0522, -118.2437], 'Chicago': [41.8781, -87.6298],
  'Toronto': [43.6532, -79.3832], 'São Paulo': [-23.5505, -46.6333], 'Buenos Aires': [-34.6037, -58.3816],
  'Mexico City': [19.4326, -99.1332], 'Miami': [25.7617, -80.1918], 'San Francisco': [37.7749, -122.4194],
  'Boston': [42.3601, -71.0589], 'Seattle': [47.6062, -122.3321], 'Montreal': [45.5017, -73.5673],
  'Lima': [-12.0464, -77.0428], 'Bogotá': [4.711, -74.0721], 'Santiago': [-33.4489, -70.6693],
  // Asia & Pacific
  'Tokyo': [35.6762, 139.6503], 'Shanghai': [31.2304, 121.4737], 'Beijing': [39.9042, 116.4074],
  'Seoul': [37.5665, 126.978], 'Singapore': [1.3521, 103.8198], 'Mumbai': [19.076, 72.8777],
  'Dubai': [25.2048, 55.2708], 'Hong Kong': [22.3193, 114.1694], 'Bangkok': [13.7563, 100.5018],
  'Sydney': [-33.8688, 151.2093], 'Melbourne': [-37.8136, 144.9631], 'Bangalore': [12.9716, 77.5946],
  'Jakarta': [-6.2088, 106.8456], 'Kuala Lumpur': [3.1390, 101.6869], 'Tel Aviv': [32.0853, 34.7818],
  'Taipei': [25.0330, 121.5654], 'Osaka': [34.6937, 135.5023], 'Riyadh': [24.7136, 46.6753],
  // Africa
  'Cairo': [30.0444, 31.2357], 'Lagos': [6.5244, 3.3792], 'Nairobi': [-1.2921, 36.8219],
  'Johannesburg': [-26.2041, 28.0473], 'Casablanca': [33.5731, -7.5898],
  // Russia
  'Moscow': [55.7558, 37.6173], 'Saint Petersburg': [59.9343, 30.3351],
};

function parseLocationCity(locationStr: string): string {
  // Parse "Madrid, ES" → "Madrid",  "New York, US" → "New York"
  if (!locationStr) return '';
  const parts = locationStr.split(',');
  return parts[0].trim();
}

// Country centroids (names + ISO2) so a contact with only a country still maps.
const COUNTRY_COORDS: Record<string, [number, number]> = {
  'Spain': [40.4, -3.7], 'ES': [40.4, -3.7],
  'United States': [39.8, -98.6], 'USA': [39.8, -98.6], 'US': [39.8, -98.6],
  'United Kingdom': [54.0, -2.0], 'UK': [54.0, -2.0], 'GB': [54.0, -2.0],
  'France': [46.6, 2.2], 'FR': [46.6, 2.2],
  'Germany': [51.1, 10.4], 'DE': [51.1, 10.4],
  'Italy': [42.8, 12.8], 'IT': [42.8, 12.8],
  'Portugal': [39.5, -8.0], 'PT': [39.5, -8.0],
  'Netherlands': [52.1, 5.3], 'NL': [52.1, 5.3],
  'Ireland': [53.4, -8.2], 'IE': [53.4, -8.2],
  'Canada': [56.1, -106.3], 'CA': [56.1, -106.3],
  'Mexico': [23.6, -102.5], 'MX': [23.6, -102.5],
  'Brazil': [-14.2, -51.9], 'BR': [-14.2, -51.9],
  'Argentina': [-38.4, -63.6], 'AR': [-38.4, -63.6],
  'Colombia': [4.6, -74.3], 'CO': [4.6, -74.3],
  'Chile': [-35.7, -71.5], 'CL': [-35.7, -71.5],
  'Japan': [36.2, 138.3], 'JP': [36.2, 138.3],
  'China': [35.9, 104.2], 'CN': [35.9, 104.2],
  'India': [20.6, 78.9], 'IN': [20.6, 78.9],
  'Australia': [-25.3, 133.8], 'AU': [-25.3, 133.8],
  'Singapore': [1.35, 103.8], 'SG': [1.35, 103.8],
  'United Arab Emirates': [23.4, 53.8], 'AE': [23.4, 53.8],
  'South Africa': [-30.6, 22.9], 'ZA': [-30.6, 22.9],
  'Nigeria': [9.1, 8.7], 'NG': [9.1, 8.7],
  'Egypt': [26.8, 30.8], 'EG': [26.8, 30.8],
  'Russia': [61.5, 105.3], 'RU': [61.5, 105.3],
  'Sweden': [60.1, 18.6], 'SE': [60.1, 18.6],
  'Poland': [51.9, 19.1], 'PL': [51.9, 19.1],
  'Switzerland': [46.8, 8.2], 'CH': [46.8, 8.2],
  'Belgium': [50.5, 4.5], 'BE': [50.5, 4.5],
};

export type ContactMapPoint = { id: string; label: string; sublabel: string; lat: number; lng: number; color: string };

/** Resolve coordinates for a record from explicit lat/lng, then city, then country. */
function geoForRecord(o: any): [number, number] | null {
  const lat = Number(o.lat ?? o.latitude), lng = Number(o.lng ?? o.longitude);
  if (!Number.isNaN(lat) && !Number.isNaN(lng) && (lat !== 0 || lng !== 0)) return [lat, lng];
  const city = parseLocationCity(o.location || o.city || '');
  if (city && CITY_COORDS[city]) return CITY_COORDS[city];
  const country = String(o.country || '').trim();
  if (country && COUNTRY_COORDS[country]) return COUNTRY_COORDS[country];
  const cc = String(o.location || '').split(',')[1]?.trim();
  if (cc && COUNTRY_COORDS[cc]) return COUNTRY_COORDS[cc];
  return null;
}

/**
 * Reusable inline map panel (no page chrome). Opens at world zoom, drops a
 * marker per located record, and offers a "Mi ubicación" control that uses the
 * browser geolocation to mark and centre on the operator.
 */
function ContactsMapPanel({ points, emptyText, height = 'h-[calc(100vh-320px)] min-h-[440px]' }: {
  points: ContactMapPoint[];
  emptyText: string;
  height?: string;
}) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const meLayerRef = useRef<any>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!mapDivRef.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    let cancelled = false;
    import('leaflet').then(({ default: L }) => {
      if (cancelled || !mapDivRef.current) return;
      const map = L.map(mapDivRef.current, {
        center: [30, 0], zoom: 1.6, minZoom: 1, maxZoom: 16,
        zoomControl: true, worldCopyJump: true, scrollWheelZoom: true,
      });
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);
      points.forEach(p => {
        L.circleMarker([p.lat, p.lng] as [number, number], {
          radius: 8, fillColor: p.color, color: '#ffffff', weight: 2, opacity: 1, fillOpacity: 0.85,
        })
          .addTo(map)
          .bindTooltip(
            `<strong style="font-size:12px">${p.label}</strong><br/><span style="color:#646462">${p.sublabel}</span>`,
            { direction: 'top', className: 'leaflet-crm-tooltip' },
          );
      });
    });
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [points]);

  function locateMe() {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        import('leaflet').then(({ default: L }) => {
          const map = mapRef.current;
          if (!map) return;
          if (meLayerRef.current) map.removeLayer(meLayerRef.current);
          meLayerRef.current = L.circleMarker([latitude, longitude], {
            radius: 9, fillColor: '#0ea5e9', color: '#ffffff', weight: 3, opacity: 1, fillOpacity: 0.95,
          }).addTo(map).bindTooltip('Tu ubicación', { direction: 'top', className: 'leaflet-crm-tooltip' });
          map.setView([latitude, longitude], 6);
        });
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <div className={`relative w-full ${height} rounded-[10px] overflow-hidden border border-[#e9eae6]`} style={{ background: '#e8f4f8' }}>
      <div ref={mapDivRef} className="absolute inset-0 z-0" />
      {/* Legend overlay */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-white/95 border border-[#e9eae6] rounded-full px-3 h-8 flex items-center gap-3 shadow-sm">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-[#646462]"><span className="w-2.5 h-2.5 rounded-full" style={{ background: points[0]?.color || '#3b59f6' }} />{points.length} ubicad{points.length === 1 ? 'o' : 'os'}</span>
      </div>
      {/* Geolocation control */}
      <button
        onClick={locateMe}
        disabled={locating}
        className="absolute top-3 right-3 z-[500] h-8 px-3 rounded-full bg-white border border-[#e9eae6] shadow-sm text-[12.5px] font-medium text-[#1a1a1a] hover:bg-[#f8f8f7] inline-flex items-center gap-1.5 disabled:opacity-60"
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#1a1a1a]" strokeWidth="1.4"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2" strokeLinecap="round"/></svg>
        {locating ? 'Localizando…' : 'Mi ubicación'}
      </button>
      {points.length === 0 && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center pointer-events-none">
          <div className="bg-white border border-[#e9eae6] rounded-[10px] px-6 py-4 shadow-sm text-center pointer-events-auto">
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-none stroke-[#d4d4d2] mx-auto mb-2" strokeWidth="1.3"><circle cx="12" cy="10" r="5"/><path d="M12 3C8.1 3 5 6.1 5 10c0 5.2 7 11 7 11s7-5.8 7-11c0-3.9-3.1-7-7-7z"/></svg>
            <p className="text-[13px] text-[#646462] font-medium">{emptyText}</p>
            <p className="text-[12px] text-[#a4a4a2] mt-1">Añade una ubicación (ciudad o país) a tus registros</p>
          </div>
        </div>
      )}
      <style>{`
        .leaflet-crm-tooltip { background: white; border: 1px solid #e9eae6; border-radius: 8px; padding: 6px 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); font-family: inherit; font-size: 12px; line-height: 1.4; white-space: nowrap; }
        .leaflet-crm-tooltip::before { border-top-color: #e9eae6 !important; }
      `}</style>
    </div>
  );
}

/** Full-screen customers map (kept for the sidebar "mapa" route). */
function ContactsMapView({ customers }: { customers: any[] }) {
  const points = useMemo<ContactMapPoint[]>(() => {
    const out: ContactMapPoint[] = [];
    for (const c of customers) {
      const g = geoForRecord(c);
      if (!g) continue;
      out.push({ id: String(c.id ?? out.length), label: c.name || c.email || 'Contacto', sublabel: parseLocationCity(c.location || c.city || '') || String(c.country || ''), lat: g[0] + (Math.sin(out.length) * 0.05), lng: g[1] + (Math.cos(out.length) * 0.05), color: '#3b59f6' });
    }
    return out;
  }, [customers]);
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-white">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#e9eae6] flex-shrink-0 bg-white">
        <span className="text-[13px] font-semibold text-[#1a1a1a]">Mapa de clientes</span>
        <div className="ml-auto text-[12px] text-[#646462]"><span className="font-medium text-[#1a1a1a]">{points.length}</span> clientes ubicados</div>
      </div>
      <div className="flex-1 min-h-0 p-4">
        <ContactsMapPanel points={points} emptyText="Sin datos de ubicación" height="h-full" />
      </div>
    </div>
  );
}


function ContactsSidebar({
  view, onNavigate, counts, onNewMessage, onEmpresasView,
}: {
  view: View;
  onNavigate: (v: View) => void;
  counts?: { allUsers: number; allLeads: number; active: number; fresh: number };
  onNewMessage?: () => void;
  onEmpresasView?: (segment: 'all' | 'active' | 'new') => void;
}) {
  type ItemId = 'allUsers' | 'allLeads' | 'active' | 'new' | 'empresas' | 'empresasAll' | 'empresasActive' | 'empresasNew' | 'conversaciones' | 'mapa';
  const initialItem: ItemId = view === 'allLeads' ? 'allLeads' : 'active';
  const [activeItem, setActiveItem] = useState<ItemId>(initialItem);
  const [empresasOpen, setEmpresasOpen] = useState(true);
  const [showSegmentDrop, setShowSegmentDrop] = useState(false);
  const [segSearch, setSegSearch] = useState('');
  const segDropRef = useRef<HTMLDivElement>(null);

  // Load companies for counts
  const { data: companiesData } = useApi<any[]>(() => companiesApi.list(), [], []);
  const companiesAll    = Array.isArray(companiesData) ? companiesData.length : 0;
  const companiesActive = Array.isArray(companiesData) ? companiesData.filter((c: any) => c.status === 'active').length : 0;
  const companiesNew    = Array.isArray(companiesData) ? companiesData.filter((c: any) => {
    const d = new Date(c.created_at); return (Date.now() - d.getTime()) < 7 * 24 * 3600 * 1000;
  }).length : 0;

  const segments = [
    { label: 'All',    count: companiesAll,    id: 'empresasAll'    },
    { label: 'Active', count: companiesActive, id: 'empresasActive' },
    { label: 'New',    count: companiesNew,    id: 'empresasNew'    },
  ].filter(s => !segSearch || s.label.toLowerCase().includes(segSearch.toLowerCase()));

  function SidebarItem({ id, label, count, itemView, opacity50Count = false }: {
    id: ItemId; label: string; count: number; itemView: View; opacity50Count?: boolean;
  }) {
    const isActive = activeItem === id;
    return (
      <button
        onClick={() => { setActiveItem(id); onNavigate(itemView); }}
        className={`flex items-center justify-between w-full pl-3 pr-4 py-[5px] rounded-[8px] mx-2 ${
          isActive
            ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] border-l border-[#fa7938]"
            : "hover:bg-white/60 border-l border-[#e9eae6]"
        }`}
      >
        <span className={`text-[13px] text-[#1a1a1a] ${isActive ? "font-semibold" : ""}`}>{label}</span>
        <span className={`text-[12px] text-[#646462] ${opacity50Count ? "opacity-50" : ""}`}>{count}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col h-full w-[236px] flex-shrink-0 bg-[#f8f8f7] rounded-[12px] border border-[#e9eae6] pt-3 pb-3 px-2 gap-1" onClick={() => setShowSegmentDrop(false)}>
      <div className="flex items-center justify-between px-2 py-1 mb-1">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a] leading-tight">Contactos</span>
        <button className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#f8f8f7] hover:bg-white/60">
          <img src={ICON_SEARCH} alt="" className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Personas section */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 px-2 py-1">
          <img src={ICON_PERSONAS} alt="" className="w-3.5 h-3.5 opacity-50" />
          <span className="text-[12px] font-medium text-[#646462]">Personas:</span>
          <button onClick={e => { e.stopPropagation(); onNewMessage?.(); }} className="ml-auto w-5 h-5 flex items-center justify-center rounded-[4px] hover:bg-[#e9eae6] text-[#646462]" title="Nuevo mensaje">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.6"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z" fill="currentColor" stroke="none"/></svg>
          </button>
          <button className="w-5 h-5 flex items-center justify-center rounded-[4px] hover:bg-[#e9eae6] text-[#646462]" title="Expandir">
            <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current opacity-40"><path d="M6 4l4 4-4 4z"/></svg>
          </button>
        </div>
        <SidebarItem id="allUsers" label="All users" count={counts?.allUsers ?? 0} itemView="contacts"  opacity50Count={(counts?.allUsers ?? 0) === 0} />
        <SidebarItem id="allLeads" label="All leads" count={counts?.allLeads ?? 0} itemView="allLeads"  opacity50Count={(counts?.allLeads ?? 0) === 0} />
        <SidebarItem id="active"   label="Active"    count={counts?.active   ?? 0} itemView="contacts"  opacity50Count={(counts?.active   ?? 0) === 0} />
        <SidebarItem id="new"      label="New"       count={counts?.fresh    ?? 0} itemView="contacts"  opacity50Count={(counts?.fresh    ?? 0) === 0} />
      </div>

      <div className="h-px bg-[#e9eae6] mx-2 my-1" />

      {/* Empresas section */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1 px-2 py-1">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462] opacity-50 flex-shrink-0" strokeWidth="1.3"><rect x="2" y="5" width="12" height="9" rx="1"/><path d="M5 5V4a3 3 0 016 0v1"/><path d="M8 9v2"/></svg>
          <button onClick={() => { setActiveItem('empresas'); onNavigate('people' as View); setEmpresasOpen(v => !v); }} className="flex-1 text-left text-[12px] font-medium text-[#646462] hover:text-[#1a1a1a]">Empresas</button>
          {/* + adds a segment */}
          <div className="relative" ref={segDropRef}>
            <button onClick={e => { e.stopPropagation(); setShowSegmentDrop(v => !v); }} className="w-5 h-5 flex items-center justify-center rounded-[4px] hover:bg-[#e9eae6] text-[#646462]" title="Segmentos">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
            </button>
            {showSegmentDrop && (
              <div onClick={e => e.stopPropagation()} className="absolute left-0 top-full mt-1 bg-white border border-[#e9eae6] rounded-[10px] shadow-lg z-40 w-[220px] overflow-hidden">
                <div className="px-3 py-2 border-b border-[#f1f1ee]">
                  <div className="flex items-center gap-2 bg-[#f5f5f4] rounded-[6px] px-2 py-1.5">
                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="7" cy="7" r="4"/><path d="M11 11l3 3"/></svg>
                    <input autoFocus value={segSearch} onChange={e => setSegSearch(e.target.value)} placeholder="Buscar segmentos" className="flex-1 text-[12px] bg-transparent outline-none text-[#1a1a1a] placeholder:text-[#a4a4a2]"/>
                  </div>
                </div>
                <div className="py-1">
                  {segments.map(seg => (
                    <button key={seg.id} onClick={() => { setActiveItem(seg.id as ItemId); setShowSegmentDrop(false); onNavigate('people' as View); }} className="w-full flex items-center justify-between px-4 py-2 hover:bg-[#f5f5f4] text-left">
                      <span className={`text-[13px] font-medium ${activeItem === seg.id ? 'text-[#fa7938]' : 'text-[#1a1a1a]'}`}>{seg.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-[#646462]">{seg.count}</span>
                        <button className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#e9eae6] opacity-50 hover:opacity-100">
                          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>
                        </button>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="border-t border-[#f1f1ee] px-4 py-2.5">
                  <button className="text-[12.5px] font-semibold text-[#1a1a1a] hover:underline">Administrar segmentos</button>
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setEmpresasOpen(v => !v)} className="w-5 h-5 flex items-center justify-center rounded-[4px] hover:bg-[#e9eae6] text-[#646462]">
            <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-current opacity-40 transition-transform ${empresasOpen ? 'rotate-90' : ''}`}><path d="M6 4l4 4-4 4z"/></svg>
          </button>
        </div>
        {empresasOpen && (
          <div className="flex flex-col gap-0.5 pl-1">
            {[
              { id: 'empresasAll',    label: 'All',    count: companiesAll,    seg: 'all'    as const },
              { id: 'empresasActive', label: 'Active', count: companiesActive, seg: 'active' as const },
              { id: 'empresasNew',    label: 'New',    count: companiesNew,    seg: 'new'    as const },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveItem(item.id as ItemId); onEmpresasView?.(item.seg); }}
                className={`flex items-center justify-between w-full pl-3 pr-4 py-[5px] rounded-[8px] mx-2 ${activeItem === item.id ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] border-l border-[#fa7938]' : 'hover:bg-white/60 border-l border-[#e9eae6]'}`}
              >
                <span className={`text-[13px] text-[#1a1a1a] ${activeItem === item.id ? 'font-semibold' : ''}`}>{item.label}</span>
                <span className="text-[12px] text-[#646462]">{item.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-px bg-[#e9eae6] mx-2 my-1" />

      <button
        onClick={() => { setActiveItem('conversaciones'); }}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-[8px] w-full ${activeItem === 'conversaciones' ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]' : 'hover:bg-white/60'}`}
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462] opacity-50" strokeWidth="1.3"><rect x="1.5" y="2.5" width="13" height="9" rx="1.5"/><path d="M5 14l3-2.5h5"/></svg>
        <span className={`text-[13px] text-[#1a1a1a] ${activeItem === 'conversaciones' ? 'font-semibold' : ''}`}>Conversaciones</span>
      </button>

      {/* Mapa de clientes */}
      <button
        onClick={() => { setActiveItem('mapa'); onNavigate('mapa' as unknown as View); }}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-[8px] w-full ${activeItem === 'mapa' ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]' : 'hover:bg-white/60'}`}
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462] opacity-50" strokeWidth="1.3"><circle cx="8" cy="8" r="6"/><path d="M8 2c0 0-3 2.5-3 6s3 6 3 6M8 2c0 0 3 2.5 3 6s-3 6-3 6M2 8h12"/></svg>
        <span className={`text-[13px] text-[#1a1a1a] ${activeItem === 'mapa' ? 'font-semibold' : ''}`}>Mapa de clientes</span>
      </button>
    </div>
  );
}

function ContactsPageHeader({
  onBack, title = 'Active', onCreate, onNewMessage,
}: {
  onBack: () => void;
  title?: string;
  onCreate?: () => void;
  onNewMessage?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#f8f8f7] hover:bg-[#efefed]">
          <img src={ICON_BACK} alt="" className="w-4 h-4" />
        </button>
        <span className="text-[20px] font-semibold text-[#1a1a1a] tracking-[-0.4px]">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full pl-[12px] pr-[6px] py-[8px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#efefed]">
          <img src={ICON_LEARN} alt="" className="w-3.5 h-3.5" />
          <span>Aprender</span>
          <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-40" />
        </button>
        <button
          onClick={onNewMessage}
          className="flex items-center gap-1.5 bg-[#f8f8f7] border border-[#e9eae6] rounded-full pl-[12px] pr-[14px] py-[8px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#efefed]"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M2 4h12L8 13z"/></svg>
          <span>Nuevo mensaje</span>
        </button>
        <button
          onClick={onCreate}
          className="flex items-center gap-1.5 bg-[#222] rounded-full pl-[12px] pr-[6px] py-[8px] text-[13px] font-medium text-[#f8f8f7] hover:bg-[#333]"
        >
          <img src={ICON_NEW_USER} alt="" className="w-3.5 h-3.5" />
          <span>Nuevos usuarios o leads</span>
          <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-60" />
        </button>
      </div>
    </div>
  );
}

// ── New contact modal — calls customersApi.create() ─────────────────────────
function NewContactModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [kind, setKind] = useState<'user' | 'lead'>('user');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setName(''); setEmail(''); setCompany(''); setKind('user'); setErrMsg(null); }
  }, [open]);

  if (!open) return null;
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      await customersApi.create({
        canonical_name:  name.trim() || email.trim() || 'Nuevo contacto',
        canonical_email: email.trim() || null,
        company:         company.trim() || null,
        kind,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setErrMsg(err?.message || 'No se pudo crear el contacto');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-[440px] bg-white rounded-[12px] border border-[#e9eae6] shadow-[0px_16px_40px_rgba(20,20,20,0.22)] p-5"
      >
        <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">Nuevo contacto</h3>
        <p className="text-[12.5px] text-[#646462] mb-4">Crea un usuario o lead manualmente. Podrás enriquecerlo después con los datos canónicos.</p>
        <div className="flex gap-2 mb-4">
          {(['user', 'lead'] as const).map(k => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              className={`h-8 px-3 rounded-full text-[13px] font-semibold border ${
                kind === k ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-[#1a1a1a] border-[#e9eae6] hover:bg-[#f8f8f7]'
              }`}
            >
              {k === 'user' ? 'Usuario' : 'Lead'}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[#646462]">Nombre</span>
            <input value={name} onChange={e => setName(e.target.value)} className="h-9 px-3 border border-[#e9eae6] rounded-[8px] text-[13px] focus:outline-none focus:border-[#1a1a1a]" placeholder="Ada Lovelace" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[#646462]">Email</span>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="h-9 px-3 border border-[#e9eae6] rounded-[8px] text-[13px] focus:outline-none focus:border-[#1a1a1a]" placeholder="ada@example.com" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[#646462]">Empresa (opcional)</span>
            <input value={company} onChange={e => setCompany(e.target.value)} className="h-9 px-3 border border-[#e9eae6] rounded-[8px] text-[13px] focus:outline-none focus:border-[#1a1a1a]" placeholder="Acme Corp" />
          </label>
        </div>
        {errMsg && <p className="mt-3 text-[12.5px] text-[#b91c1c]">{errMsg}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-8 px-3 rounded-[8px] text-[13px] font-semibold text-[#646462] hover:bg-[#f8f8f7]">Cancelar</button>
          <button type="submit" disabled={submitting || (!name.trim() && !email.trim())} className="h-8 px-3 rounded-[8px] bg-[#1a1a1a] text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50">
            {submitting ? 'Creando…' : 'Crear contacto'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Profile screen — full customer detail; renders inline replacing the list.
// Mirrors every section of the legacy Customers profile (segment, risk, AI
// impact, LTV, plan, renewal, linked identities, reconciliation, top issues,
// open cases) re-skinned to the Clain card system. Back button top-left, Esc
// also returns to the list.
function ContactProfileScreen({
  contactId, onBack, onUpdated,
}: {
  contactId: string;
  onBack: () => void;
  onUpdated?: () => void;
}) {
  const { data: state, loading: stateLoading, refetch: refetchState } = useApi<any>(
    () => customersApi.state(contactId),
    [contactId],
    null,
  );
  const { data: activity } = useApi<any[]>(
    () => customersApi.activity(contactId),
    [contactId],
    [],
  );
  const [tab, setTab] = useState<'all_activity' | 'conversations' | 'orders' | 'system_logs'>('all_activity');
  const [savingSegment, setSavingSegment] = useState(false);
  const [savingRisk, setSavingRisk] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  // Reset tab + transient state whenever a different contact opens
  useEffect(() => { setTab('all_activity'); setLocalMsg(null); }, [contactId]);

  // Esc-to-close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inEditable = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === 'Escape' && !inEditable) onBack();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);
  const customer: any = state?.customer || state || {};
  const name  = customer.canonicalName || customer.name || 'Contacto';
  const email = customer.canonicalEmail || customer.email || '';
  const phone = customer.phone || '';
  const initial = (name.trim()[0] || '?').toUpperCase();
  const color = pickContactColor(contactId);
  const segment = customer.segment === 'vip' ? 'VIP' : customer.segment === 'standard' ? 'Standard' : 'Regular';
  const riskRaw = (customer.riskLevel || 'low').toString();
  const risk =
    riskRaw === 'high' || riskRaw === 'critical' ? 'Riesgo de fuga' :
    riskRaw === 'medium' ? 'Vigilar' : 'Healthy';
  const ltv = customer.lifetimeValue ?? customer.ltv;
  const ltvLabel = (ltv ?? null) === null ? '—' : `$${Number(ltv).toLocaleString()}`;
  const linkedIdentities: Array<{ system?: string; externalId?: string }> = Array.isArray(customer.linkedIdentities) ? customer.linkedIdentities : [];
  const recentCases: any[] = Array.isArray(customer.recentCases) ? customer.recentCases : Array.isArray(state?.recentCases) ? state.recentCases : [];
  const recon = state?.reconciliation || customer.reconciliation;
  const reconUnhealthy = recon && recon.status && recon.status !== 'Healthy';
  const allActivity: any[] = Array.isArray(activity) ? activity : [];
  const filteredActivity = (() => {
    if (tab === 'all_activity') return allActivity;
    if (tab === 'conversations') return allActivity.filter(a => /conv|message|reply|note/i.test(a.type || a.kind || ''));
    if (tab === 'orders')        return allActivity.filter(a => /order|payment|refund|return|cancel/i.test(a.type || a.kind || ''));
    if (tab === 'system_logs')   return allActivity.filter(a => /system|webhook|sync|reconciliation|writeback/i.test(a.type || a.kind || ''));
    return allActivity;
  })();

  async function changeSegment(next: 'vip' | 'standard' | 'regular') {
    if (savingSegment || customer.segment === next) return;
    setSavingSegment(true);
    setLocalMsg(null);
    try {
      await customersApi.update(contactId!, { segment: next });
      setLocalMsg(`Segmento actualizado a ${next}`);
      refetchState();
      onUpdated?.();
    } catch (err: any) {
      setLocalMsg(err?.message || 'No se pudo actualizar el segmento');
    } finally {
      setSavingSegment(false);
    }
  }
  async function changeRisk(next: 'low' | 'medium' | 'high' | 'critical') {
    if (savingRisk || customer.riskLevel === next) return;
    setSavingRisk(true);
    setLocalMsg(null);
    try {
      await customersApi.update(contactId!, { risk_level: next });
      setLocalMsg(`Nivel de riesgo: ${next}`);
      refetchState();
      onUpdated?.();
    } catch (err: any) {
      setLocalMsg(err?.message || 'No se pudo actualizar el riesgo');
    } finally {
      setSavingRisk(false);
    }
  }

  const tabs: Array<{ id: typeof tab; label: string }> = [
    { id: 'all_activity',  label: 'Actividad' },
    { id: 'conversations', label: 'Conversaciones' },
    { id: 'orders',        label: 'Pedidos' },
    { id: 'system_logs',   label: 'Logs del sistema' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
      {/* Header — back button top-left, then identity + segment / risk badges */}
      <div className="flex items-start justify-between px-6 pt-4 pb-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <button
            onClick={onBack}
            title="Volver (Esc)"
            className="w-8 h-8 mt-1 flex items-center justify-center rounded-lg bg-[#f8f8f7] hover:bg-[#efefed] flex-shrink-0"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.6"><path d="M10 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-semibold text-white flex-shrink-0" style={{ backgroundColor: color }}>{initial}</div>
          <div className="min-w-0">
            <div className="text-[20px] font-bold text-[#1a1a1a] tracking-[-0.4px] truncate" title={name}>{name}</div>
            {email && <div className="text-[13px] text-[#646462] truncate" title={email}>{email}</div>}
            {phone && <div className="text-[12.5px] text-[#646462] truncate">{phone}</div>}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className={`px-2 py-[2px] rounded-full text-[11px] font-semibold border ${segment === 'VIP' ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-[#f8f8f7] text-[#1a1a1a] border-[#e9eae6]'}`}>{segment}</span>
              <span className={`px-2 py-[2px] rounded-full text-[11px] font-semibold border ${risk === 'Healthy' ? 'bg-[#f8f8f7] text-[#1a1a1a] border-[#e9eae6]' : 'bg-white text-[#b91c1c] border-[#fcc]'}`}>{risk}</span>
              {customer.company && <span className="px-2 py-[2px] rounded-full text-[11px] font-medium bg-[#f8f8f7] text-[#646462] border border-[#e9eae6]">{customer.company}</span>}
            </div>
          </div>
        </div>
      </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {stateLoading && <p className="px-6 py-5 text-[13px] text-[#646462]">Cargando datos del contacto…</p>}
          {!stateLoading && (
            <div className="flex flex-col gap-5 px-6 py-5">
              {/* KPI grid */}
              <div className="grid grid-cols-4 gap-3">
                <KpiCard label="Casos abiertos" value={String(customer.openCases ?? 0)} />
                <KpiCard label="Resueltos"      value={String(customer.problemsResolved ?? customer.problems_resolved ?? 0)} />
                <KpiCard label="AI resueltos"   value={String(customer.aiImpactResolved ?? 0)} />
                <KpiCard label="LTV"            value={ltvLabel} />
              </div>

              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
                <MetaRow label="Plan"            value={customer.plan || '—'} />
                <MetaRow label="Próx. renovación" value={customer.nextRenewal ? new Date(customer.nextRenewal).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
                <MetaRow label="Empresa"         value={customer.company || '—'} />
                <MetaRow label="Localización"    value={customer.location || '—'} />
                <MetaRow label="Zona horaria"    value={customer.timezone || '—'} />
                <MetaRow label="Cliente desde"   value={customer.createdAt ? new Date(customer.createdAt).getFullYear().toString() : '—'} />
                <MetaRow label="Top issue"       value={customer.topIssue || '—'} />
                <MetaRow label="Canal preferido" value={customer.preferredChannel || '—'} />
              </div>

              {/* Linked identities (Stripe / Shopify / OMS / …) */}
              {linkedIdentities.length > 0 && (
                <div>
                  <h3 className="text-[12px] font-mono uppercase tracking-[0.6px] text-[#646462] mb-2">Identidades vinculadas</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {linkedIdentities.map((id, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f8f8f7] border border-[#e9eae6] text-[12px] text-[#1a1a1a]">
                        <span className="font-semibold capitalize">{id.system || 'sistema'}</span>
                        {id.externalId && <span className="font-mono text-[#646462]">{id.externalId}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Reconciliation panel — only when not Healthy */}
              {reconUnhealthy && (
                <div className="border border-[#e9eae6] rounded-[10px] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[13px] font-bold text-[#1a1a1a]">Reconciliación · {recon.status}</h3>
                    <span className="text-[11px] text-[#646462]">Revisado {recon.lastChecked || '—'}</span>
                  </div>
                  <p className="text-[12.5px] text-[#646462] mb-3">{recon.mismatches || 0} discrepancias detectadas entre los sistemas conectados.</p>
                  {Array.isArray(recon.domains) && recon.domains.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {recon.domains.slice(0, 4).map((d: any, idx: number) => (
                        <li key={idx} className="bg-[#f8f8f7] rounded-[8px] p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[12.5px] font-semibold text-[#1a1a1a]">{d.domain || 'dominio'}</span>
                            <span className="text-[11px] text-[#646462]">{d.severity || 'low'} · fuente: {d.sourceOfTruth || '—'}</span>
                          </div>
                          {d.context && <p className="text-[12px] text-[#646462] mt-1">{d.context}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Recent cases */}
              {recentCases.length > 0 && (
                <div>
                  <h3 className="text-[12px] font-mono uppercase tracking-[0.6px] text-[#646462] mb-2">Casos recientes</h3>
                  <ul className="flex flex-col gap-1.5">
                    {recentCases.slice(0, 5).map((c: any, idx: number) => (
                      <li key={c.id || idx} className="border border-[#e9eae6] rounded-[8px] px-3 py-2 flex items-center justify-between">
                        <div className="min-w-0">
                          <span className="text-[13px] font-medium text-[#1a1a1a]">{c.caseNumber || c.id || `Caso ${idx + 1}`}</span>
                          {c.type && <span className="ml-2 text-[12px] text-[#646462]">{c.type}</span>}
                        </div>
                        {c.status && <span className="text-[11px] font-semibold text-[#646462] uppercase">{c.status}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Quick actions: change segment / risk via customersApi.update */}
              <div>
                <h3 className="text-[12px] font-mono uppercase tracking-[0.6px] text-[#646462] mb-2">Cambiar segmento</h3>
                <div className="flex gap-1.5 flex-wrap">
                  {(['vip', 'standard', 'regular'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => changeSegment(s)}
                      disabled={savingSegment || customer.segment === s}
                      className={`h-7 px-2.5 rounded-full text-[12px] font-semibold border ${
                        customer.segment === s ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-[#1a1a1a] border-[#e9eae6] hover:bg-[#f8f8f7]'
                      } disabled:opacity-50`}
                    >
                      {s === 'vip' ? 'VIP' : s === 'standard' ? 'Standard' : 'Regular'}
                    </button>
                  ))}
                </div>
                <h3 className="text-[12px] font-mono uppercase tracking-[0.6px] text-[#646462] mt-4 mb-2">Cambiar riesgo</h3>
                <div className="flex gap-1.5 flex-wrap">
                  {(['low', 'medium', 'high', 'critical'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => changeRisk(r)}
                      disabled={savingRisk || customer.riskLevel === r}
                      className={`h-7 px-2.5 rounded-full text-[12px] font-semibold border ${
                        customer.riskLevel === r ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-[#1a1a1a] border-[#e9eae6] hover:bg-[#f8f8f7]'
                      } disabled:opacity-50 capitalize`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {localMsg && <p className="mt-3 text-[12px] text-[#646462]">{localMsg}</p>}
              </div>

              {/* Activity tabs (matches the legacy Customers detail) */}
              <div>
                <div className="flex items-center gap-1 border-b border-[#e9eae6] mb-3">
                  {tabs.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`text-[13px] h-8 px-3 -mb-px ${tab === t.id ? 'font-semibold text-[#1a1a1a] border-b-2 border-[#1a1a1a]' : 'text-[#646462] hover:text-[#1a1a1a]'}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {filteredActivity.length === 0 ? (
                  <p className="text-[13px] text-[#646462]">Sin actividad en esta categoría.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {filteredActivity.slice(0, 50).map((a: any, idx: number) => (
                      <li key={a.id || idx} className="border border-[#e9eae6] rounded-[8px] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[13px] font-medium text-[#1a1a1a]">{a.title || a.type || a.kind || 'Evento'}</p>
                          <span className="text-[11px] text-[#a4a4a2] flex-shrink-0">{formatContactWhen(a.timestamp || a.createdAt || a.at || null)}</span>
                        </div>
                        {(a.summary || a.description || a.message) && (
                          <p className="text-[12px] text-[#646462] mt-1">{a.summary || a.description || a.message}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[10px] p-3">
      <p className="text-[10px] font-mono uppercase tracking-[0.6px] text-[#646462]">{label}</p>
      <p className="text-[20px] font-bold text-[#1a1a1a] leading-none mt-1.5 truncate" title={value}>{value}</p>
    </div>
  );
}
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[12px] text-[#646462] flex-shrink-0">{label}</span>
      <span className="text-[13px] font-medium text-[#1a1a1a] truncate" title={value}>{value}</span>
    </div>
  );
}

// Toast for action feedback
function ContactsToast({ message, type }: { message: string | null; type: 'success' | 'error' }) {
  if (!message) return null;
  return (
    <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-[8px] text-[13px] font-medium shadow-[0px_4px_12px_rgba(20,20,20,0.15)] ${
      type === 'error' ? 'bg-[#1a1a1a] text-white border border-[#b91c1c]' : 'bg-[#1a1a1a] text-white'
    }`}>{message}</div>
  );
}

// ── Bulk tag modal — appends tags to N selected contacts. Reads each
// customer's existing tags via customersApi.get(id) and PATCHes the merged
// set so we never overwrite tags applied elsewhere. Best-effort: continues
// past per-row failures and reports the count of successes.
function BulkTagModal({
  ids, onClose, onApplied,
}: {
  ids: string[] | null;
  onClose: () => void;
  onApplied: (count: number) => void;
}) {
  const [input, setInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ids) { setInput(''); setTags([]); setErrMsg(null); setProgressLabel(null); }
  }, [ids]);

  if (!ids) return null;

  function commitInput() {
    const v = input.trim().replace(/^#/, '');
    if (!v) return;
    setTags(t => t.includes(v) ? t : [...t, v]);
    setInput('');
  }
  function removeTag(t: string) {
    setTags(prev => prev.filter(x => x !== t));
  }

  async function applyTags() {
    if (submitting || tags.length === 0 || ids.length === 0) return;
    setSubmitting(true);
    setErrMsg(null);
    let success = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        setProgressLabel(`${i + 1} / ${ids.length}`);
        try {
          const existing = await customersApi.get(id).catch(() => null) as any;
          const current: string[] = Array.isArray(existing?.tags) ? existing.tags : [];
          const merged = Array.from(new Set([...current, ...tags]));
          await customersApi.update(id, { tags: merged });
          success += 1;
        } catch (err: any) {
          setErrMsg(err?.message || 'No se pudo etiquetar a alguno de los contactos');
        }
      }
      onApplied(success);
      onClose();
    } finally {
      setSubmitting(false);
      setProgressLabel(null);
    }
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-[440px] bg-white rounded-[12px] border border-[#e9eae6] shadow-[0px_16px_40px_rgba(20,20,20,0.22)] p-5">
        <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">Añadir etiquetas</h3>
        <p className="text-[12.5px] text-[#646462] mb-4">Las etiquetas se añadirán a {ids.length} contacto{ids.length === 1 ? '' : 's'}. No sobreescribimos las existentes.</p>
        <div className="flex flex-wrap gap-1.5 min-h-[36px] border border-[#e9eae6] rounded-[8px] p-2 mb-3">
          {tags.map(t => (
            <span key={t} className="inline-flex items-center gap-1.5 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-2 py-[2px] text-[12px]">
              {t}
              <button type="button" onClick={() => removeTag(t)} className="text-[#646462] hover:text-[#1a1a1a]">×</button>
            </span>
          ))}
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
                e.preventDefault(); commitInput();
              } else if (e.key === 'Backspace' && !input && tags.length > 0) {
                setTags(prev => prev.slice(0, -1));
              }
            }}
            placeholder={tags.length === 0 ? 'Escribe una etiqueta y pulsa Enter…' : ''}
            className="flex-1 min-w-[140px] outline-none text-[13px] bg-transparent"
          />
        </div>
        {errMsg && <p className="text-[12.5px] text-[#b91c1c] mb-2">{errMsg}</p>}
        <div className="flex justify-between items-center">
          <span className="text-[12px] text-[#646462]">{progressLabel ? `Aplicando ${progressLabel}…` : ''}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-8 px-3 rounded-[8px] text-[13px] font-semibold text-[#646462] hover:bg-[#f8f8f7]">Cancelar</button>
            <button
              onClick={applyTags}
              disabled={submitting || tags.length === 0}
              className="h-8 px-3 rounded-[8px] bg-[#1a1a1a] text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50"
            >
              {submitting ? 'Aplicando…' : `Aplicar a ${ids.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bulk message modal — opens an outbound case + initial reply per selected
// contact. Uses casesApi.create + casesApi.reply.
function BulkMessageModal({
  ids, onClose, onSent,
}: {
  ids: string[] | null;
  onClose: () => void;
  onSent: (count: number) => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ids) { setSubject(''); setBody(''); setErrMsg(null); setProgressLabel(null); }
  }, [ids]);

  if (!ids) return null;

  async function send() {
    if (submitting || !body.trim() || ids.length === 0) return;
    setSubmitting(true);
    setErrMsg(null);
    let success = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const customerId = ids[i];
        setProgressLabel(`${i + 1} / ${ids.length}`);
        try {
          const created = await casesApi.create({
            customer_id:    customerId,
            type:           'message',
            priority:       'medium',
            status:         'open',
            source_channel: 'manual_outbound',
            tags:           subject.trim() ? ['outbound', `subject:${subject.trim().slice(0, 64)}`] : ['outbound'],
          });
          if (created?.id) {
            await casesApi.reply(created.id, body.trim()).catch(err => {
              console.warn('[bulk-message] reply failed for case', created.id, err);
            });
          }
          success += 1;
        } catch (err: any) {
          setErrMsg(err?.message || 'No se pudo crear alguno de los casos');
        }
      }
      onSent(success);
      onClose();
    } finally {
      setSubmitting(false);
      setProgressLabel(null);
    }
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-[520px] bg-white rounded-[12px] border border-[#e9eae6] shadow-[0px_16px_40px_rgba(20,20,20,0.22)] p-5">
        <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">Nuevo mensaje · {ids.length} contacto{ids.length === 1 ? '' : 's'}</h3>
        <p className="text-[12.5px] text-[#646462] mb-4">Crea un caso saliente por cada contacto y envía la respuesta inicial. Tipo: outbound · canal: manual_outbound.</p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[#646462]">Asunto (opcional)</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="h-9 px-3 border border-[#e9eae6] rounded-[8px] text-[13px] focus:outline-none focus:border-[#1a1a1a]" placeholder="Lanzamiento Q3" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-[#646462]">Mensaje</span>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} className="px-3 py-2 border border-[#e9eae6] rounded-[8px] text-[13px] focus:outline-none focus:border-[#1a1a1a] resize-y" placeholder="Hola, te escribimos porque…" />
          </label>
        </div>
        {errMsg && <p className="text-[12.5px] text-[#b91c1c] mt-2">{errMsg}</p>}
        <div className="mt-4 flex justify-between items-center">
          <span className="text-[12px] text-[#646462]">{progressLabel ? `Enviando ${progressLabel}…` : ''}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-8 px-3 rounded-[8px] text-[13px] font-semibold text-[#646462] hover:bg-[#f8f8f7]">Cancelar</button>
            <button
              onClick={send}
              disabled={submitting || !body.trim()}
              className="h-8 px-3 rounded-[8px] bg-[#1a1a1a] text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50"
            >
              {submitting ? 'Enviando…' : `Enviar a ${ids.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportHero() {
  const bullets = [
    { icon: ICON_BULLET_1, label: "Comienza a usar los contactos" },
    { icon: ICON_BULLET_2, label: "Seguimiento y agrupación de tus clientes" },
    { icon: ICON_BULLET_3, label: "Uso de aplicaciones e integraciones" },
    { icon: ICON_BULLET_4, label: "Visita nuestra tienda de aplicaciones" },
  ];
  return (
    <div className="mx-4 mb-4">
      <div className="relative bg-[#f8f8f7] rounded-[12px] overflow-hidden h-[288px] flex">
        <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/5 z-10">
          <img src={ICON_CLOSE} alt="" className="w-3 h-3" />
        </button>
        <div className="flex flex-col justify-center px-8 py-6 flex-1 gap-4">
          <h2 className="text-[20px] font-semibold text-[#1a1a1a] leading-[1.3] max-w-[280px]">
            Importa tus contactos para una experiencia personalizada
          </h2>
          <p className="text-[13px] text-[#646462] leading-[1.5] max-w-[280px]">
            Crea y gestiona perfiles de contacto detallados para personalizar las interacciones con los clientes.
          </p>
          <div className="flex flex-col gap-2">
            {bullets.map((b, i) => (
              <button key={i} className="flex items-center gap-2 text-left group">
                <img src={b.icon} alt="" className="w-4 h-4 flex-shrink-0" />
                <span className="text-[13px] text-[#1a1a1a] underline underline-offset-2 group-hover:text-[#646462]">{b.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-shrink-0 flex items-end justify-end">
          <img src={IMG_ILLUSTRATION} alt="" className="h-[240px] w-[388px] object-cover object-left-top" />
        </div>
      </div>
    </div>
  );
}

// Column catalog for the Personas table (drives the "|||" column chooser).
const PEOPLE_COLUMNS: ContactField[] = [
  { key: 'type', label: 'Type', icon: 'person', type: 'select' },
  { key: 'name', label: 'Name', icon: 'person', type: 'text' },
  { key: 'account', label: 'Account', icon: 'briefcase', type: 'text' },
  { key: 'owner', label: 'Owner', icon: 'owner', type: 'text' },
  { key: 'leadCategory', label: 'Lead category', icon: 'swap', type: 'select' },
  { key: 'qualificationStatus', label: 'Qualification status', icon: 'swap', type: 'select' },
  { key: 'conversationRating', label: 'Conversation rating', icon: 'smiley', type: 'select' },
  { key: 'email', label: 'Email', icon: 'mail', type: 'text' },
  { key: 'emailDomain', label: 'Email domain', icon: 'globe', type: 'text' },
  { key: 'phone', label: 'Phone', icon: 'phone', type: 'text' },
  { key: 'lastSeen', label: 'Last seen', icon: 'calendar', type: 'date' },
  { key: 'firstSeen', label: 'First seen', icon: 'calendar', type: 'date' },
  { key: 'signedUp', label: 'Signed up', icon: 'calendar', type: 'date' },
  { key: 'webSessions', label: 'Web sessions', icon: 'bars', type: 'number' },
  { key: 'openCases', label: 'Open cases', icon: 'bars', type: 'number' },
  { key: 'country', label: 'Country', icon: 'globe', type: 'text' },
  { key: 'region', label: 'Region', icon: 'globe', type: 'text' },
  { key: 'city', label: 'City', icon: 'globe', type: 'text' },
  { key: 'personTag', label: 'Person tag', icon: 'tag', type: 'text' },
  { key: 'unsubscribed', label: 'Unsubscribed from emails', icon: 'block', type: 'boolean' },
  { key: 'markedSpam', label: 'Marked email as spam', icon: 'warn', type: 'boolean' },
  { key: 'hardBounced', label: 'Has hard bounced', icon: 'warn', type: 'boolean' },
];

/** Cell value for a Personas column, given the live row. */
function peopleCellValue(row: ContactRow, key: string): string {
  switch (key) {
    case 'type': return row.type;
    case 'lastSeen': return formatContactWhen(row.lastSeenAt);
    case 'firstSeen':
    case 'signedUp': return formatContactWhen(row.createdAt);
    case 'webSessions': return String(row.webSessions ?? 0);
    case 'openCases': return String(row.openCases ?? 0);
    case 'city': return row.city || 'Desconocido';
    case 'email': return row.email || '—';
    case 'emailDomain': return row.email?.split('@')[1] || 'Desconocido';
    default: return 'Desconocido';
  }
}

/** Apply one active filter to a row where the field maps to real data. */
function rowMatchesFilter(getVal: (key: string) => string | number | null, f: ContactField, a: ActiveFilter): boolean {
  const raw = getVal(a.fieldKey);
  if (raw == null && a.operator !== 'is unknown') {
    // Unmapped/unknown fields: only exclude on strict equality-style operators.
    return !['is', 'contains', 'starts with', 'is true'].includes(a.operator);
  }
  if (f.type === 'number') {
    const n = Number(raw ?? 0), v = Number(a.value);
    if (Number.isNaN(v)) return true;
    if (a.operator === 'is') return n === v;
    if (a.operator === 'is less than') return n < v;
    if (a.operator === 'is greater than') return n > v;
    return true;
  }
  if (f.type === 'select' || f.type === 'text') {
    const s = String(raw ?? '').toLowerCase(), v = a.value.toLowerCase();
    if (a.operator === 'is unknown') return !raw;
    if (a.operator === 'has any value') return !!raw;
    if (!v) return true;
    if (a.operator === 'is') return s === v;
    if (a.operator === 'is not') return s !== v;
    if (a.operator === 'contains') return s.includes(v);
    if (a.operator === 'does not contain') return !s.includes(v);
    if (a.operator === 'starts with') return s.startsWith(v);
    return true;
  }
  return true; // date / boolean: chip shown, no client-side filtering
}

function UsersTable({
  rows, loading, error, totalLabel, onRowClick, onAction, onRefresh, onBulkTag, onBulkMessage,
}: {
  rows: ContactRow[];
  loading: boolean;
  error: string | null;
  totalLabel: string;
  onRowClick: (id: string) => void;
  onAction: (msg: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
  onBulkTag: (ids: string[]) => void;
  onBulkMessage: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [showVerifyBanner, setShowVerifyBanner] = useState(true);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(['type', 'lastSeen', 'firstSeen', 'signedUp', 'openCases', 'city']),
  );

  useEffect(() => { setSelected(new Set()); }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows;
    if (q) out = out.filter(r => `${r.name} ${r.email} ${r.channel} ${r.city}`.toLowerCase().includes(q));
    if (filters.length > 0) {
      out = out.filter(r => filters.every(a => {
        const field = PEOPLE_FILTER_FIELDS.find(f => f.key === a.fieldKey);
        if (!field) return true;
        return rowMatchesFilter(k => {
          if (k === 'name') return r.name;
          if (k === 'email') return r.email;
          if (k === 'city') return r.city;
          if (k === 'type') return r.type;
          if (k === 'webSessions') return r.webSessions;
          return null;
        }, field, a);
      }));
    }
    return out;
  }, [rows, search, filters]);

  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.id)));
  }
  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleCol(key: string) {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Optional columns to render (name is the fixed first column, always shown).
  const shownCols = PEOPLE_COLUMNS.filter(c => c.key !== 'name' && visibleCols.has(c.key));

  // Map points from located rows (city/country → coords), for the map view.
  const mapPoints = useMemo<ContactMapPoint[]>(() => {
    const out: ContactMapPoint[] = [];
    for (const r of filtered) {
      const g = geoForRecord(r);
      if (!g) continue;
      out.push({ id: r.id, label: r.name, sublabel: r.city || r.email || '', lat: g[0] + Math.sin(out.length) * 0.05, lng: g[1] + Math.cos(out.length) * 0.05, color: '#3b59f6' });
    }
    return out;
  }, [filtered]);

  const selectionCount = selected.size;
  const headerLabel = selectionCount > 0
    ? `${selectionCount} seleccionado${selectionCount === 1 ? '' : 's'}`
    : view === 'map'
      ? (mapPoints.length > 0 ? `${mapPoints.length} usuario${mapPoints.length === 1 ? '' : 's'} en el mapa` : 'No hay usuarios con datos de ubicación')
      : totalLabel;
  return (
    <div className="mx-4 flex flex-col gap-3">
      {/* Filter bar — identical format to the audience filter used elsewhere */}
      <div className="pt-1">
        <ContactsFilterBar
          fields={PEOPLE_FILTER_FIELDS}
          baseChip={{ icon: 'people', label: 'Usuarios' }}
          filters={filters}
          setFilters={setFilters}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[18px] font-semibold text-[#1a1a1a]">{headerLabel}</span>
          <div className="flex items-center gap-1">
            <button
              disabled={selectionCount === 0}
              onClick={() => onBulkMessage(Array.from(selected))}
              className="flex items-center gap-1.5 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#1a1a1a] hover:bg-[#efefed] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <img src={ICON_MSG} alt="" className="w-3.5 h-3.5" /><span>Nuevo mensaje</span>
            </button>
            <button
              disabled={selectionCount === 0}
              onClick={() => onBulkTag(Array.from(selected))}
              className="flex items-center gap-1.5 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#1a1a1a] hover:bg-[#efefed] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <img src={ICON_TAG} alt="" className="w-3.5 h-3.5" /><span>Añadir etiqueta</span>
            </button>
            <ContactsMoreMenu
              entity="usuarios"
              onAction={label => {
                const n = selectionCount || filtered.length;
                onAction(`${label} · ${n} usuario${n === 1 ? '' : 's'}`);
              }}
            />
            <button
              onClick={onRefresh}
              className="flex items-center gap-1 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#1a1a1a] hover:bg-[#efefed]"
              title="Recargar"
            >
              <span>Actualizar</span>
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M8 3V1L4 5l4 4V7a4 4 0 11-4 4H2.5A5.5 5.5 0 108 3z"/></svg>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg viewBox="0 0 16 16" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L13 13"/></svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar contactos…"
              className="h-8 w-[220px] pl-8 pr-3 border border-[#e9eae6] rounded-[8px] text-[13px] focus:outline-none focus:border-[#1a1a1a]"
            />
          </div>
          <ContactsColumnChooser entity="usuario" columns={PEOPLE_COLUMNS} visible={visibleCols} onToggle={toggleCol} lockedKey="name" />
          <div className="flex items-center border border-[#e9eae6] rounded-[8px] overflow-hidden">
            <button onClick={() => setView('list')} className={`px-2 py-1.5 ${view === 'list' ? 'bg-[#f8f8f7]' : 'bg-white hover:bg-[#f8f8f7]'} border-r border-[#e9eae6]`} title="Vista de lista">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="#1a1a1a" opacity={view === 'list' ? '0.9' : '0.5'}/>
                <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="#1a1a1a" opacity={view === 'list' ? '0.9' : '0.5'}/>
                <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="#1a1a1a" opacity={view === 'list' ? '0.9' : '0.5'}/>
              </svg>
            </button>
            <button onClick={() => setView('map')} className={`px-2 py-1.5 ${view === 'map' ? 'bg-[#f8f8f7]' : 'bg-white hover:bg-[#f8f8f7]'}`} title="Vista de mapa">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="stroke-[#1a1a1a]" strokeWidth="1.3" opacity={view === 'map' ? '0.9' : '0.5'}>
                <circle cx="8" cy="8" r="6.5"/><ellipse cx="8" cy="8" rx="2.6" ry="6.5"/><path d="M1.6 8h12.8"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {showVerifyBanner && (
        <div className="flex items-center justify-between bg-[#f8f8f7] rounded-[6px] px-[15px] py-[10px] border border-[#e9eae6]">
          <span className="text-[13px] text-[#1a1a1a]">
            Exige la verificación de identidad para proteger los datos de tus usuarios.{" "}
            <span className="underline cursor-pointer">Configurar verificación de identidad.</span>
          </span>
          <button onClick={() => setShowVerifyBanner(false)} className="text-[13px] text-[#646462] ml-4 hover:text-[#1a1a1a] flex-shrink-0">✕</button>
        </div>
      )}

      {view === 'map' ? (
        <ContactsMapPanel points={mapPoints} emptyText="No hay usuarios con datos de ubicación" />
      ) : (
      <div className="w-full overflow-x-auto">
        <div className="min-w-max">
          <div className="flex items-center border-b border-[#e9eae6] pb-2 text-[12px] font-medium text-[#646462]">
            <div className="w-7 flex-shrink-0">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-3.5 h-3.5 rounded border-[#e9eae6]" />
            </div>
            <div className="w-[240px] flex-shrink-0">Nombre</div>
            {shownCols.map(c => (
              <div key={c.key} className="w-[130px] flex-shrink-0 flex items-center gap-1">
                <span className={c.key === 'lastSeen' ? 'text-[#e35712]' : ''}>{c.label}</span>
                {c.key === 'lastSeen' && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-60"><path d="M5 2L7 5H3L5 2Z" fill="#e35712"/><path d="M5 8L3 5H7L5 8Z" fill="#e35712" opacity="0.4"/></svg>
                )}
              </div>
            ))}
          </div>
          {loading && rows.length === 0 && (
            <div className="py-12 text-center text-[13px] text-[#646462]">Cargando contactos…</div>
          )}
          {error && (
            <div className="py-12 text-center text-[13px] text-[#b91c1c]">No se pudo cargar la lista de contactos.</div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="py-12 text-center text-[13px] text-[#646462]">
              {search || filters.length ? 'Ningún usuario coincide con los filtros' : 'No hay contactos en este filtro.'}
            </div>
          )}
          {filtered.map(row => (
            <div
              key={row.id}
              onClick={() => onRowClick(row.id)}
              className="flex items-center border-b border-[#e9eae6] py-[10px] hover:bg-[#f8f8f7] cursor-pointer"
            >
              <div className="w-7 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={() => toggleOne(row.id)}
                  className="w-3.5 h-3.5 rounded border-[#e9eae6]"
                />
              </div>
              <div className="w-[240px] flex-shrink-0 flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold text-white flex-shrink-0" style={{ backgroundColor: row.color }}>
                  {row.initial}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-medium text-[#1a1a1a] truncate" title={row.name}>{row.name}</span>
                  <span className="text-[12px] text-[#646462] truncate" title={row.email || row.channel}>{row.email || row.channel}</span>
                </div>
              </div>
              {shownCols.map(c => (
                <div key={c.key} className={`w-[130px] flex-shrink-0 text-[13px] truncate ${peopleCellValue(row, c.key) === 'Desconocido' ? 'text-[#a4a4a2]' : 'text-[#1a1a1a]'}`}>
                  {peopleCellValue(row, c.key)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}


// ── Companies Table ───────────────────────────────────────────────────────────
// Derives company records from the customers list (grouped by customer.company)
// so we don't need a separate companies backend route.
interface CompanyRow {
  id: string;          // slugified company name
  name: string;
  initial: string;
  color: string;
  customerCount: number;
  location: string;
  plan: string;
  lastActivity: string;  // ISO date string
  openCases: number;
}


// Column catalog for the Empresas table.
const COMPANY_COLUMNS: ContactField[] = [
  { key: 'name', label: 'Company name', icon: 'building', type: 'text' },
  { key: 'lastSeen', label: 'Last seen', icon: 'calendar', type: 'date' },
  { key: 'userCount', label: 'People', icon: 'people', type: 'number' },
  { key: 'monthlySpend', label: 'Monthly spend', icon: 'bars', type: 'number' },
  { key: 'plan', label: 'Plan', icon: 'swap', type: 'select' },
  { key: 'industry', label: 'Industry', icon: 'briefcase', type: 'text' },
  { key: 'website', label: 'Website', icon: 'globe', type: 'text' },
  { key: 'owner', label: 'Owner', icon: 'owner', type: 'text' },
  { key: 'country', label: 'Country', icon: 'globe', type: 'text' },
  { key: 'city', label: 'City', icon: 'globe', type: 'text' },
  { key: 'companyTag', label: 'Company tag', icon: 'tag', type: 'text' },
];
function companyCellValue(row: any, key: string): string {
  switch (key) {
    case 'lastSeen': return formatContactWhen(row.lastActivity);
    case 'userCount': return row.employees != null ? String(row.employees) : 'Desconocido';
    case 'industry': return row.industry && row.industry !== '—' ? row.industry : 'Desconocido';
    case 'country': return row.country && row.country !== '—' ? row.country : 'Desconocido';
    case 'website': return row.domain || 'Desconocido';
    default: return 'Desconocido';
  }
}

function CompaniesTable({
  companies, segment, loading, error, onRefresh, onCreate, onDelete, creating, setCreating, onAction,
}: {
  companies: any[];
  segment: 'all' | 'active' | 'new';
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onCreate: (name: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
  creating: boolean;
  setCreating: (b: boolean) => void;
  onAction: (msg: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => new Set(['lastSeen', 'userCount', 'country', 'industry']));
  const [showVerifyBanner, setShowVerifyBanner] = useState(true);
  function toggleCol(key: string) {
    setVisibleCols(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }
  const shownCols = COMPANY_COLUMNS.filter(c => c.key !== 'name' && visibleCols.has(c.key));

  // Map real company records onto the display-row shape the table renders.
  const rows = useMemo(() => {
    const colors = ['#3b59f6','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#c026d3'];
    const now = Date.now();
    const sevenDays = 7 * 24 * 3600 * 1000, thirtyDays = 30 * 24 * 3600 * 1000;
    const mapped = (companies || []).map((c: any) => {
      const name = c.name || c.canonical_name || 'Sin nombre';
      return {
        id: String(c.id),
        name,
        initial: name[0]?.toUpperCase() || '?',
        color: colors[name.charCodeAt(0) % colors.length],
        domain: c.domain || '',
        industry: c.industry || '—',
        country: c.country || '—',
        employees: typeof c.employee_count === 'number' ? c.employee_count : null,
        lastActivity: c.updated_at || c.created_at || '',
      };
    });
    if (segment === 'new') return mapped.filter(r => r.lastActivity && (now - new Date(r.lastActivity).getTime()) < sevenDays);
    if (segment === 'active') return mapped.filter(r => r.lastActivity && (now - new Date(r.lastActivity).getTime()) < thirtyDays);
    return mapped;
  }, [companies, segment]);

  async function confirmCreate() {
    if (busy) return;
    setBusy(true);
    const ok = await onCreate(newName);
    setBusy(false);
    if (ok) { setNewName(''); setCreating(false); }
  }
  async function handleDeleteRow(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    try { await onDelete(id); } finally { setDeletingId(null); }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows;
    if (q) out = out.filter(r => `${r.name} ${r.country} ${r.industry} ${r.domain}`.toLowerCase().includes(q));
    if (filters.length > 0) {
      out = out.filter(r => filters.every(a => {
        const field = COMPANY_FILTER_FIELDS.find(f => f.key === a.fieldKey);
        if (!field) return true;
        return rowMatchesFilter(k => {
          if (k === 'name') return r.name;
          if (k === 'country') return r.country;
          if (k === 'industry') return r.industry;
          if (k === 'website') return r.domain;
          if (k === 'userCount' || k === 'size') return r.employees;
          return null;
        }, field, a);
      }));
    }
    return out;
  }, [rows, search, filters]);

  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const mapPoints = useMemo<ContactMapPoint[]>(() => {
    const out: ContactMapPoint[] = [];
    for (const r of filtered) {
      const g = geoForRecord(r);
      if (!g) continue;
      out.push({ id: r.id, label: r.name, sublabel: r.country && r.country !== '—' ? r.country : (r.domain || ''), lat: g[0] + Math.sin(out.length) * 0.05, lng: g[1] + Math.cos(out.length) * 0.05, color: '#ef4444' });
    }
    return out;
  }, [filtered]);

  const selCount = selected.size;
  const headerLabel = selCount > 0
    ? `${selCount} seleccionada${selCount === 1 ? '' : 's'}`
    : viewMode === 'map'
      ? (mapPoints.length > 0 ? `${mapPoints.length} empresa${mapPoints.length === 1 ? '' : 's'} en el mapa` : 'No hay empresas con datos de ubicación')
      : `${rows.length} empresa${rows.length === 1 ? '' : 's'}`;

  return (
    <div className="mx-4 flex flex-col gap-3 relative">
      {/* Filter bar — identical format to the audience filter used elsewhere */}
      <div className="pt-1">
        <ContactsFilterBar
          fields={COMPANY_FILTER_FIELDS}
          baseChip={{ icon: 'building', label: 'Empresas' }}
          filters={filters}
          setFilters={setFilters}
        />
      </div>
      {/* Toolbar — identical to Personas */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[18px] font-semibold text-[#1a1a1a]">{headerLabel}</span>
          <div className="flex items-center gap-1">
            <button
              disabled={selCount === 0}
              onClick={() => onAction(`Nuevo mensaje · ${selCount} empresa${selCount === 1 ? '' : 's'}`)}
              className="flex items-center gap-1.5 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#1a1a1a] hover:bg-[#efefed] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <img src={ICON_MSG} alt="" className="w-3.5 h-3.5" /><span>Nuevo mensaje</span>
            </button>
            <button
              disabled={selCount === 0}
              onClick={() => onAction(`Etiqueta añadida · ${selCount} empresa${selCount === 1 ? '' : 's'}`)}
              className="flex items-center gap-1.5 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#1a1a1a] hover:bg-[#efefed] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <img src={ICON_TAG} alt="" className="w-3.5 h-3.5" /><span>Añadir etiqueta</span>
            </button>
            <ContactsMoreMenu entity="empresas" onAction={label => { const n = selCount || filtered.length; onAction(`${label} · ${n} empresa${n === 1 ? '' : 's'}`); }} />
            <button
              onClick={onRefresh}
              className="flex items-center gap-1 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#1a1a1a] hover:bg-[#efefed]"
              title="Recargar"
            >
              <span>Actualizar</span>
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M8 3V1L4 5l4 4V7a4 4 0 11-4 4H2.5A5.5 5.5 0 108 3z"/></svg>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg viewBox="0 0 16 16" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L13 13"/></svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar empresas…"
              className="h-8 w-[220px] pl-8 pr-3 border border-[#e9eae6] rounded-[8px] text-[13px] focus:outline-none focus:border-[#1a1a1a]"
            />
          </div>
          <ContactsColumnChooser entity="empresa" columns={COMPANY_COLUMNS} visible={visibleCols} onToggle={toggleCol} lockedKey="name" />
          <div className="flex items-center border border-[#e9eae6] rounded-[8px] overflow-hidden">
            <button onClick={() => setViewMode('list')} className={`px-2 py-1.5 ${viewMode === 'list' ? 'bg-[#f8f8f7]' : 'bg-white hover:bg-[#f8f8f7]'} border-r border-[#e9eae6]`} title="Vista de lista">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="#1a1a1a" opacity={viewMode === 'list' ? '0.9' : '0.5'}/>
                <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="#1a1a1a" opacity={viewMode === 'list' ? '0.9' : '0.5'}/>
                <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="#1a1a1a" opacity={viewMode === 'list' ? '0.9' : '0.5'}/>
              </svg>
            </button>
            <button onClick={() => setViewMode('map')} className={`px-2 py-1.5 ${viewMode === 'map' ? 'bg-[#f8f8f7]' : 'bg-white hover:bg-[#f8f8f7]'}`} title="Vista de mapa">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="stroke-[#1a1a1a]" strokeWidth="1.3" opacity={viewMode === 'map' ? '0.9' : '0.5'}>
                <circle cx="8" cy="8" r="6.5"/><ellipse cx="8" cy="8" rx="2.6" ry="6.5"/><path d="M1.6 8h12.8"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {showVerifyBanner && (
        <div className="flex items-center justify-between bg-[#f8f8f7] rounded-[6px] px-[15px] py-[10px] border border-[#e9eae6]">
          <span className="text-[13px] text-[#1a1a1a]">
            Exige la verificación de identidad para proteger los datos de tus empresas.{" "}
            <span className="underline cursor-pointer">Configurar verificación de identidad.</span>
          </span>
          <button onClick={() => setShowVerifyBanner(false)} className="text-[13px] text-[#646462] ml-4 hover:text-[#1a1a1a] flex-shrink-0">✕</button>
        </div>
      )}

      {/* States */}
      {loading && rows.length === 0 && (
        <div className="py-12 text-center text-[13px] text-[#646462]">Cargando empresas…</div>
      )}
      {error && (
        <div className="py-12 text-center text-[13px] text-[#b91c1c]">No se pudo cargar la lista.</div>
      )}

      {/* Map view */}
      {viewMode === 'map' && !loading && !error && (
        <ContactsMapPanel points={mapPoints} emptyText="No hay empresas con datos de ubicación" />
      )}

      {/* List view */}
      {viewMode === 'list' && !loading && !error && (
        <div className="w-full overflow-x-auto">
         <div className="min-w-max">
          <div className="flex items-center border-b border-[#e9eae6] pb-2 text-[12px] font-medium text-[#646462]">
            <div className="w-7 flex-shrink-0">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-3.5 h-3.5 rounded border-[#e9eae6]"/>
            </div>
            <div className="w-[240px] flex-shrink-0">Empresa</div>
            {shownCols.map(c => (
              <div key={c.key} className="w-[130px] flex-shrink-0 flex items-center gap-1">
                <span className={c.key === 'lastSeen' ? 'text-[#e35712]' : ''}>{c.label}</span>
                {c.key === 'lastSeen' && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-60"><path d="M5 2L7 5H3L5 2Z" fill="#e35712"/><path d="M5 8L3 5H7L5 8Z" fill="#e35712" opacity="0.4"/></svg>
                )}
              </div>
            ))}
            <div className="w-[90px] flex-shrink-0"></div>
          </div>
          {creating && (
            <div className="flex items-center border-b border-[#e9eae6] py-[10px] bg-[#fafaf9]">
              <div className="w-7 flex-shrink-0" />
              <div className="flex-1 min-w-[180px] flex items-center gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') setCreating(false); }}
                  placeholder="Nombre de la empresa"
                  className="border border-[#3b59f6] rounded-[6px] px-2 py-1 text-[13px] outline-none w-[240px]"
                />
                <button onClick={confirmCreate} disabled={busy || newName.trim().length < 2} className="text-[12px] font-semibold text-white bg-[#1a1a1a] rounded-full px-3 py-1 hover:bg-[#444] disabled:opacity-40">{busy ? 'Creando…' : 'Crear'}</button>
                <button onClick={() => setCreating(false)} className="text-[12px] text-[#646462] hover:text-[#1a1a1a]">Cancelar</button>
              </div>
            </div>
          )}
          {filtered.length === 0 && !creating && (
            <div className="py-12 text-center text-[13px] text-[#646462]">
              {search ? 'Ninguna empresa coincide con la búsqueda.' : 'No hay empresas todavía. Crea la primera con "+ Nueva empresa".'}
            </div>
          )}
          {filtered.map(row => (
            <div
              key={row.id}
              className="flex items-center border-b border-[#e9eae6] py-[10px] hover:bg-[#f8f8f7] cursor-pointer"
            >
              <div className="w-7 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)} className="w-3.5 h-3.5 rounded border-[#e9eae6]"/>
              </div>
              <div className="w-[240px] flex-shrink-0 flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-[6px] flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0" style={{ backgroundColor: row.color }}>
                  {row.initial}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-medium text-[#1a1a1a] truncate">{row.name}</span>
                  <span className="text-[12px] text-[#646462] truncate">{row.domain}</span>
                </div>
              </div>
              {shownCols.map(c => (
                <div key={c.key} className={`w-[130px] flex-shrink-0 text-[13px] truncate ${companyCellValue(row, c.key) === 'Desconocido' ? 'text-[#a4a4a2]' : 'text-[#1a1a1a]'}`}>
                  {companyCellValue(row, c.key)}
                </div>
              ))}
              <div className="w-[90px] flex-shrink-0 text-[13px]" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => handleDeleteRow(row.id)}
                  disabled={deletingId === row.id}
                  className="text-[12px] font-medium text-[#dc2626] hover:underline disabled:opacity-40">
                  {deletingId === row.id ? '…' : 'Eliminar'}
                </button>
              </div>
            </div>
          ))}
         </div>
        </div>
      )}
    </div>
  );
}

// Shared body for ContactsView / AllLeadsView. The user's spec: all 4 sidebar
// tabs (All users / All leads / Active / New) show the same full list of
// contacts; the only thing that changes is the title in the page header.
function ContactsCommon({
  view, onNavigate, onBack,
}: {
  view: View;
  onNavigate: (v: View) => void;
  onBack: () => void;
}) {
  const { all, users, active, fresh, leads, loading, error, refetch } = useContactsData();
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkTagIds, setBulkTagIds] = useState<string[] | null>(null);
  const [bulkMsgIds, setBulkMsgIds] = useState<string[] | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showNewMsgModal, setShowNewMsgModal] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [trialDismissed, setTrialDismissed] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const counts = {
    allUsers: users.length,
    allLeads: leads.length,
    active:   active.length,
    fresh:    fresh.length,
  };

  // ── Companies mode state ──────────────────────────────────────────────────
  const [contactMode, setContactMode] = useState<'personas' | 'empresas'>('personas');
  const [empresaSegment, setEmpresaSegment] = useState<'all' | 'active' | 'new'>('all');
  const [empresaCreating, setEmpresaCreating] = useState(false);
  // Real companies from the companies table (companiesApi CRUD) — replaces the
  // previous "derive companies from the customers list" behaviour.
  const { data: companies, loading: companiesLoading, error: companiesError, refetch: refetchCompanies } =
    useApi<any[]>(() => companiesApi.list(), [], []);
  async function createCompany(name: string): Promise<boolean> {
    const trimmed = name.trim();
    if (trimmed.length < 2) return false;
    try {
      await companiesApi.create({ name: trimmed });
      refetchCompanies();
      setToast({ msg: 'Empresa creada', type: 'success' });
      return true;
    } catch {
      setToast({ msg: 'No se pudo crear la empresa', type: 'error' });
      return false;
    }
  }
  async function deleteCompany(id: string): Promise<void> {
    try {
      await companiesApi.delete(id);
      refetchCompanies();
      setToast({ msg: 'Empresa eliminada', type: 'success' });
    } catch {
      setToast({ msg: 'No se pudo eliminar la empresa', type: 'error' });
    }
  }

  const title = view === 'allLeads' ? 'All leads' : contactMode === 'empresas' ? 'Empresas' : 'Active';
  const totalLabel = `${all.length} ${all.length === 1 ? 'contacto' : 'contactos'}`;

  return (
    <div className="relative flex flex-1 min-w-0 h-full overflow-hidden">
      {showNewMsgModal && (
        <NewMessageTemplateModal
          onClose={() => setShowNewMsgModal(false)}
          onSelect={(_ct, _tpl) => { setShowNewMsgModal(false); onNavigate('outbound'); }}
        />
      )}

      <div className="h-full flex-shrink-0 pt-3 pb-3 pl-1">
        <div className="h-full rounded-[12px] overflow-hidden w-[236px]">
          <ContactsSidebar
            view={view}
            onNavigate={(v) => {
              if ((v as string) === 'mapa') { setShowMap(true); setContactMode('personas'); }
              else { setShowMap(false); setContactMode('personas'); onNavigate(v); }
            }}
            counts={counts}
            onNewMessage={() => setShowNewMsgModal(true)}
            onEmpresasView={(seg) => { setContactMode('empresas'); setEmpresaSegment(seg); setShowMap(false); }}
          />
        </div>
      </div>

      {openProfileId ? (
        <ContactProfileScreen
          contactId={openProfileId}
          onBack={() => setOpenProfileId(null)}
          onUpdated={refetch}
        />
      ) : showMap ? (
        <ContactsMapView customers={all} />
      ) : contactMode === 'empresas' ? (
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {!trialDismissed && (
            <div className="flex items-center gap-3 px-4 py-2 bg-[#e7e2fd] border border-[#b09efa] rounded-[10px] mx-4 mt-3 flex-shrink-0">
              <span className="text-[13px] text-[#1a1a1a] flex-shrink-0">
                Quedan <strong>8 días</strong> en tu <span className="underline cursor-pointer font-medium">prueba de Advanced</span>. Incluye uso ilimitado de Fin.
              </span>
              <button className="text-[12.5px] font-semibold text-[#1a1a1a] underline hover:no-underline whitespace-nowrap ml-auto">Obtenga un 93% de descuento con Early Stage</button>
              <button className="px-3 py-1 bg-[#1a1a1a] text-white text-[12.5px] font-semibold rounded-full hover:bg-black whitespace-nowrap">Comprar Intercom</button>
              <button onClick={() => setTrialDismissed(true)} className="text-[13px] text-[#646462] hover:text-[#1a1a1a] flex-shrink-0">✕</button>
            </div>
          )}
          {/* Empresas header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#e9eae6] flex-shrink-0 bg-white">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.3"><rect x="2" y="5" width="12" height="9" rx="1"/><path d="M5 5V4a3 3 0 016 0v1"/><path d="M8 9v2"/></svg>
              <h1 className="text-[18px] font-semibold text-[#1a1a1a] tracking-tight">Empresas</h1>
            </div>
            <div className="flex items-center gap-1.5">
              {(['all', 'active', 'new'] as const).map(seg => (
                <button
                  key={seg}
                  onClick={() => setEmpresaSegment(seg)}
                  className={`px-3 py-1 rounded-full text-[12.5px] font-medium border transition-colors ${empresaSegment === seg ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'border-[#e9eae6] text-[#646462] hover:bg-[#f5f5f4]'}`}
                >
                  {seg === 'all' ? 'Todas' : seg === 'active' ? 'Activas' : 'Nuevas'}
                </button>
              ))}
              <div className="w-px h-5 bg-[#e9eae6] mx-1" />
              <button
                onClick={() => setEmpresaCreating(true)}
                className="flex items-center gap-1 bg-[#1a1a1a] text-white rounded-full px-3.5 py-[6px] text-[13px] font-semibold hover:bg-[#444]"
              >
                + Nueva empresa
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 pt-4">
            <CompaniesTable
              companies={Array.isArray(companies) ? companies : []}
              segment={empresaSegment}
              loading={companiesLoading}
              error={companiesError}
              onRefresh={() => { refetchCompanies(); setToast({ msg: 'Lista actualizada', type: 'success' }); }}
              onCreate={createCompany}
              onDelete={deleteCompany}
              creating={empresaCreating}
              setCreating={setEmpresaCreating}
              onAction={(msg) => setToast({ msg, type: 'success' })}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {!trialDismissed && (
            <div className="flex items-center gap-3 px-4 py-2 bg-[#e7e2fd] border border-[#b09efa] rounded-[10px] mx-4 mt-3 flex-shrink-0">
              <span className="text-[13px] text-[#1a1a1a] flex-shrink-0">
                Quedan <strong>8 días</strong> en tu <span className="underline cursor-pointer font-medium">prueba de Advanced</span>. Incluye uso ilimitado de Fin.
              </span>
              <button className="text-[12.5px] font-semibold text-[#1a1a1a] underline hover:no-underline whitespace-nowrap ml-auto">Obtenga un 93% de descuento con Early Stage</button>
              <button className="px-3 py-1 bg-[#1a1a1a] text-white text-[12.5px] font-semibold rounded-full hover:bg-black whitespace-nowrap">Comprar Intercom</button>
              <button onClick={() => setTrialDismissed(true)} className="text-[13px] text-[#646462] hover:text-[#1a1a1a] flex-shrink-0">✕</button>
            </div>
          )}
          <ContactsPageHeader
            onBack={onBack}
            title={title}
            onCreate={() => setCreateOpen(true)}
            onNewMessage={() => onNavigate('outbound')}
          />
          <div className="flex-1 overflow-y-auto min-h-0">
            {!loading && all.length === 0 && <ImportHero />}
            <UsersTable
              rows={all}
              loading={loading}
              error={error}
              totalLabel={totalLabel}
              onRowClick={setOpenProfileId}
              onAction={(msg, type = 'success') => setToast({ msg, type })}
              onRefresh={() => { refetch(); setToast({ msg: 'Lista actualizada', type: 'success' }); }}
              onBulkTag={(ids) => setBulkTagIds(ids)}
              onBulkMessage={(ids) => setBulkMsgIds(ids)}
            />
          </div>
        </div>
      )}

      <NewContactModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { refetch(); setToast({ msg: 'Contacto creado', type: 'success' }); }}
      />
      <BulkTagModal
        ids={bulkTagIds}
        onClose={() => setBulkTagIds(null)}
        onApplied={(n) => { refetch(); setToast({ msg: `Etiquetas aplicadas a ${n} contacto${n === 1 ? '' : 's'}`, type: 'success' }); }}
      />
      <BulkMessageModal
        ids={bulkMsgIds}
        onClose={() => setBulkMsgIds(null)}
        onSent={(n) => { setToast({ msg: `Mensaje enviado a ${n} contacto${n === 1 ? '' : 's'}`, type: 'success' }); }}
      />
      <ContactsToast message={toast?.msg ?? null} type={toast?.type ?? 'success'} />
    </div>
  );
}

export function ContactsView({ view, onNavigate, onBack }: { view: View; onNavigate: (v: View) => void; onBack: () => void }) {
  return <ContactsCommon view={view} onNavigate={onNavigate} onBack={onBack} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// ALL LEADS VIEW — same shell as Contacts; the sidebar sets the title.
// (Legacy AllLeadsHero / AllLeadsTableSection mocks removed once the live
// Customers list took over both routes.)
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _AllLeadsTableSection_REMOVED() {
  return (
    <div className="flex flex-col">
      {/* Filter row */}
      <div className="flex items-center gap-2 px-[30px] py-[8px]">
        <div className="flex items-center gap-2 bg-white border border-[#e9eae6] rounded-full px-[13px] py-[7px]">
          <img src={ICON_LEADS_CHIP} alt="" className="w-4 h-4" />
          <span className="text-[14px] font-medium text-[#1a1a1a]">Leads</span>
        </div>
        <div className="w-px h-6 bg-[#e9eae6]" />
        <button className="flex items-center gap-1.5 text-[#e35712] text-[14px] font-medium hover:opacity-80">
          <img src={ICON_ADD_FILTER} alt="" className="w-3 h-3" />
          <span>Añadir filtro</span>
        </button>
      </div>

      {/* Table header */}
      <div className="flex flex-col pt-[15px] pb-[10px] px-[30px] border-t border-[rgba(0,0,0,0.1)] mt-1">
        <div className="flex items-center justify-between h-[34px]">
          <div className="flex items-center gap-3">
            <span className="text-[18px] font-semibold text-[#1a1a1a]">Ningún lead coincide</span>
            <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full pl-[12px] pr-[6px] py-[8px] text-[14px] font-semibold text-[#1a1a1a] hover:bg-[#efefed]">
              <img src={ICON_MSG_LEADS} alt="" className="w-4 h-4" />
              <span>Nuevo mensaje</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* Columns/view toggle */}
            <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full px-[12px] py-[8px] text-[14px] font-semibold text-[#1a1a1a] hover:bg-[#efefed]">
              <img src={ICON_VIEW_COLS} alt="" className="w-4 h-4" />
              <img src={ICON_CHEVRON} alt="" className="w-3 h-3 opacity-40" />
            </button>
            {/* Grid / list toggle */}
            <div className="flex items-center border border-[#e9eae6] rounded-full overflow-hidden">
              <button className="px-3 py-[6px] bg-[#f0f1ef] hover:bg-[#e9eae6]">
                <img src={ICON_VIEW_GRID} alt="" className="w-4 h-4" />
              </button>
              <button className="px-3 py-[6px] hover:bg-[#f8f8f7]">
                <img src={ICON_VIEW_LIST} alt="" className="w-4 h-4" />
              </button>
            </div>
            {/* Globe / filter icon */}
            <button className="w-8 h-8 flex items-center justify-center rounded-full border border-[#e9eae6] hover:bg-[#f8f8f7]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="#1a1a1a" strokeWidth="1.3"/>
                <ellipse cx="8" cy="8" rx="2.5" ry="6.5" stroke="#1a1a1a" strokeWidth="1.3"/>
                <path d="M1.5 8h13" stroke="#1a1a1a" strokeWidth="1.3"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Identity verification banner */}
      <div className="mx-[20px] mb-3">
        <div className="flex items-center bg-[#f8f8f7] rounded-[6px] px-[15px] py-[10px] border border-[#e9eae6]">
          <img src={ICON_INFO} alt="" className="w-4 h-4 flex-shrink-0 mr-[10px]" />
          <span className="text-[14px] font-medium text-[#1a1a1a] flex-1">
            Exige la verificación de identidad para proteger las conversaciones con los clientes y evitar la suplantación de identidad.{" "}
            <span className="underline cursor-pointer">Configurar verificación de identidad.</span>
          </span>
        </div>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-24 gap-5">
        <img src={ICON_EMPTY_STATE} alt="" className="w-10 h-10 opacity-60" />
        <span className="text-[18px] font-semibold text-[#646462]">Ningún usuario coincide con los filtros</span>
      </div>
    </div>
  );
}

export function AllLeadsView({ view, onNavigate, onBack }: { view: View; onNavigate: (v: View) => void; onBack: () => void }) {
  return <ContactsCommon view={view} onNavigate={onNavigate} onBack={onBack} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// WORK IN PROGRESS PLACEHOLDER
// ─────────────────────────────────────────────────────────────────────────────

function WIPView({ label }: { label: string }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 items-center justify-center gap-4">
      <div className="flex flex-col items-center gap-3 bg-white rounded-2xl shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] px-16 py-14">
        <div className="w-12 h-12 rounded-2xl bg-[#f3f3f1] flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="4" stroke="#646462" strokeWidth="1.5" strokeDasharray="3 2"/>
            <path d="M9 12h6M12 9v6" stroke="#646462" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="text-center">
          <p className="text-[18px] font-semibold text-[#1a1a1a] mb-1">{label}</p>
          <p className="text-[14px] text-[#646462]">Esta pantalla está en construcción</p>
        </div>
        <div className="bg-[#f3f3f1] rounded-full px-4 py-1.5 text-[12px] font-medium text-[#646462]">
          Work in progress
        </div>
      </div>
    </div>
  );
}

// ── PeopleView (with 6 tabs) ──────────────────────────────────────────────────

const PEOPLE_ATTRS = [
  { icon: '👥', name: 'Name',                        desc: "A person's full name",                                         protect: 'Deshabilitado', format: 'Texto' },
  { icon: '🏢', name: 'Account',                     desc: 'The account that owns a lead or user in Intercom',             protect: '',              format: 'Cuenta' },
  { icon: '🏢', name: 'Account name',                desc: 'The name of the account that owns a lead or user in Intercom', protect: '',              format: 'Texto' },
  { icon: '👤', name: 'Owner',                       desc: 'The teammate that owns a lead or user in Intercom',            protect: '',              format: 'Compañero de equipo' },
  { icon: '👤', name: 'Owner name',                  desc: 'The name of the teammate that owns a lead or user in Intercom',protect: '',              format: 'Texto' },
  { icon: '🔗', name: 'UTM Term',                    desc: 'The product promotion or campaign that directed a person to your app or website', protect: '', format: 'Texto' },
  { icon: '🔗', name: 'Referral URL',                desc: 'The previous page the person was on',                          protect: '',              format: 'Texto' },
  { icon: '📋', name: 'Subscription type opt-outs',  desc: 'The subscription types a person has opted-out from',           protect: '',              format: 'Desconocido' },
  { icon: '📋', name: 'Subscription type opt-ins',   desc: 'The subscription types a person has opted-in to',              protect: '',              format: 'Desconocido' },
  { icon: '📅', name: 'Last Survey received',        desc: 'The last day a person received a Survey',                      protect: '',              format: 'Fecha' },
  { icon: '💬', name: 'WhatsApp number',             desc: "A person's WhatsApp number",                                   protect: '',              format: 'Texto' },
  { icon: '🏢', name: 'Companies',                   desc: 'The Companies the person is a member of',                      protect: 'Deshabilitado', format: 'Texto' },
  { icon: '📱', name: 'Phone Number Country',        desc: "The ISO country code of the person's phone number",            protect: '',              format: 'Texto' },
  { icon: '💬', name: 'Slack Email',                 desc: "A person's Slack email",                                       protect: '',              format: 'Texto' },
];

export function PeopleView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'atributos' | 'segmentos' | 'eventos' | 'bot' | 'eliminar' | 'bloqueado'>('atributos');
  const [showModal, setShowModal] = useState(false);
  const [attrFormat, setAttrFormat] = useState('Texto');
  const [attrName, setAttrName] = useState('');
  const [attrDesc, setAttrDesc] = useState('');
  const [attrVerified, setAttrVerified] = useState(true);
  const [attrSearch, setAttrSearch] = useState('');
  const [customAttrs, setCustomAttrs] = useState<typeof PEOPLE_ATTRS>([]);
  const [botFields, setBotFields] = useState<Array<{name: string; desc: string}>>([
    { name: 'Name', desc: "A person's full name" },
    { name: 'Email', desc: 'The email address assigned to a user or lead' },
    { name: 'Phone', desc: "A person's phone number" },
    { name: 'Company name', desc: 'The name of a company' },
    { name: 'Company size', desc: 'The number of people employed in this company, expressed as a single number' },
    { name: 'Company website', desc: "The web address for the company's primary marketing site" },
    { name: 'Company industry', desc: "The category or domain this company belongs to e.g. 'ecommerce' or 'SaaS'" },
  ]);
  const [showAddPopover, setShowAddPopover] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const addBtnRef = useRef<HTMLButtonElement>(null);

  function saveAttr() {
    if (!attrName.trim()) return;
    setCustomAttrs(prev => [...prev, { icon: '📝', name: attrName.trim(), desc: attrDesc.trim(), protect: '', format: attrFormat }]);
    setShowModal(false); setAttrName(''); setAttrDesc(''); setAttrFormat('Texto'); setAttrVerified(true);
  }

  const allAttrs = [...customAttrs, ...PEOPLE_ATTRS].filter(a =>
    a.name.toLowerCase().includes(attrSearch.toLowerCase()) || a.desc.toLowerCase().includes(attrSearch.toLowerCase())
  );

  const tabs = [
    { id: 'atributos'  as const, label: 'Atributos' },
    { id: 'segmentos'  as const, label: 'Segmentos' },
    { id: 'eventos'    as const, label: 'Eventos' },
    { id: 'bot'        as const, label: 'Bot de clasificación de clientes potenciales' },
    { id: 'eliminar'   as const, label: 'Eliminar datos' },
    { id: 'bloqueado'  as const, label: 'Bloqueado' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Personas:</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
              </button>
              {tab === 'atributos' && <button onClick={() => setShowModal(true)} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Crear atributo</button>}
            </div>
          </div>
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0 overflow-x-auto">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  tab === t.id ? 'border-[#fa7938] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Modal — Crear atributo */}
          {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
              <div className="bg-white rounded-[12px] shadow-xl w-[500px] max-w-[95vw] p-6 relative">
                <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]">
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
                </button>
                <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-5">Crear un nuevo atributo de persona</h2>

                <div className="mb-4">
                  <label className="block text-[13px] font-semibold text-[#1a1a1a] mb-2">Formato</label>
                  <div className="relative inline-block">
                    <select value={attrFormat} onChange={e => setAttrFormat(e.target.value)}
                      className="appearance-none border border-[#e9eae6] rounded-[8px] pl-3 pr-8 py-2 text-[13px] text-[#1a1a1a] bg-white focus:outline-none focus:border-[#3b59f6] cursor-pointer">
                      {['Texto', 'Número', 'Booleano', 'Fecha', 'Lista', 'URL', 'Email'].map(f => <option key={f}>{f}</option>)}
                    </select>
                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"><path d="M4 6l4 4 4-4"/></svg>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-[13px] font-semibold text-[#1a1a1a] mb-2">Nombre</label>
                  <input
                    value={attrName} onChange={e => setAttrName(e.target.value)}
                    placeholder="Por ejemplo, tipo de plan"
                    className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3b59f6]"
                  />
                  <p className="text-[12px] text-[#646462] mt-1.5">Este nombre podría aparecer en conversaciones con los clientes si alguna vez le pides al operador que recopile estos datos.</p>
                </div>

                <div className="mb-5">
                  <label className="block text-[13px] font-semibold text-[#1a1a1a] mb-2">Descripción opcional</label>
                  <input
                    value={attrDesc} onChange={e => setAttrDesc(e.target.value)}
                    placeholder="Por ejemplo, el color favorito del cliente"
                    className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3b59f6]"
                  />
                </div>

                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[13px] font-semibold text-[#1a1a1a]">Actualizaciones de atributos</span>
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#9ca3af]"><path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 6zm0-2a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd"/></svg>
                  </div>
                  <div className="flex items-start gap-3">
                    <button onClick={() => setAttrVerified(v => !v)}
                      style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0, border: 'none', cursor: 'pointer', padding: 0, background: attrVerified ? '#f97316' : '#d1d5db', transition: 'background 0.2s', marginTop: 2 }}>
                      <span style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s', left: attrVerified ? 18 : 2 }} />
                    </button>
                    <div>
                      <p className="text-[13px] font-semibold text-[#1a1a1a]">Requerir actualizaciones verificadas</p>
                      <p className="text-[12px] text-[#646462] mt-0.5 leading-relaxed">Las escrituras a este atributo solo se aceptarán si provienen de una solicitud autenticada (a través de <span className="text-[#3b59f6]">API REST</span> o <span className="text-[#3b59f6]">Token web JSON en Messenger</span>). Las solicitudes no autenticadas serán ignoradas.</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowModal(false)} className="px-4 py-2 text-[13px] font-medium text-[#646462] hover:text-[#1a1a1a]">Cancelar</button>
                  <button onClick={saveAttr} className="px-5 py-2 text-[13px] font-semibold bg-[#1a1a1a] text-white rounded-full hover:bg-[#444]">Guardar</button>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === 'atributos' && <>
              <div className="m-6 bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-6 flex items-start gap-6 relative">
                <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
                <div className="flex-1">
                  <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2">Envíe datos de clientes para rastrear, segmentar y personalizar la experiencia de sus clientes</h2>
                  <p className="text-[13px] text-[#646462] mb-3">Puedes usar estos datos como contexto en el buzón, como reglas para automatizaciones, audiencia para mensajes salientes y mucho más.</p>
                  <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><rect x="2" y="4" width="12" height="9" rx="1.5"/></svg>Cómo enviar atributos de usuario personalizados</button>
                </div>
                <div className="w-[508px] flex-shrink-0 flex items-center justify-center">
                  <img src={IMG_USERDATA_BANNER} alt="People data banner" className="w-[508px] h-[251px]" data-node-id="1:34193" />
                </div>
              </div>
              <div className="px-6 pb-6">
                <input value={attrSearch} onChange={e => setAttrSearch(e.target.value)} placeholder="🔍  Nombre del campo..." className="w-full max-w-[380px] border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] mb-3 focus:outline-none focus:border-[#3b59f6]" />
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[#e9eae6]">
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Nombre del atributo</th>
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Protecciones de atributos</th>
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Formato</th>
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Creado</th>
                    <th className="w-[40px]"></th>
                  </tr></thead>
                  <tbody>
                    {allAttrs.map(r => (
                      <tr key={r.name} className="border-b border-[#f3f3f1] hover:bg-[#fafaf9]">
                        <td className="px-4 py-3"><div className="flex items-start gap-2"><span>{r.icon}</span><div><p className="font-medium text-[#1a1a1a]">{r.name}</p><p className="text-[12px] text-[#646462]">{r.desc}</p></div></div></td>
                        <td className="px-4 py-3">{r.protect && <span className="bg-[#fef3c7] text-[#92400e] text-[11px] px-2 py-0.5 rounded-full font-medium">{r.protect}</span>}</td>
                        <td className="px-4 py-3 text-[#646462]">{r.format}</td>
                        <td className="px-4 py-3 text-[#646462]">7 días atrás</td>
                        <td className="px-4 py-3"><button className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]"><svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M11 2l3 3-9 9-4 1 1-4 9-9z"/></svg></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>}

            {tab === 'segmentos' && (
              <div className="px-6 py-4">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[#e9eae6]"><th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Nombre del segmento <span className="text-[#ccc]">↕</span></th><th className="text-right px-4 py-2 font-medium text-[#646462] text-[12px]">Usuarios <span className="text-[#ccc]">↕</span></th></tr></thead>
                  <tbody>
                    {[['Active', 4], ['All Leads', 0], ['All Users', 2], ['New', 0]].map(([name, count]) => (
                      <tr key={name as string} className="border-b border-[#f3f3f1] hover:bg-[#fafaf9]">
                        <td className="px-4 py-3"><span className="text-[#1a1a1a] font-medium">{name}</span> <span className="text-[#646462]">(Segmento predefinido)</span></td>
                        <td className="px-4 py-3 text-right"><a href="#" className="text-[#3b59f6] hover:underline">Ver {count} usuarios</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'eventos' && (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <svg viewBox="0 0 40 40" className="w-10 h-10 fill-none stroke-[#ccc]" strokeWidth="1.5"><rect x="6" y="9" width="28" height="25" rx="2"/><path d="M6 16h28M14 5v8M26 5v8M14 23l4 4 8-8"/></svg>
                <p className="text-[14px] font-semibold text-[#1a1a1a]">Aún no hay eventos</p>
                <a href="#" className="text-[13px] text-[#3b59f6] underline">Aprende a crear eventos con nuestra documentación</a>
              </div>
            )}

            {tab === 'bot' && (() => {
              const USER_FIELDS = [
                { name: 'Name', desc: "A person's full name" },
                { name: 'Email', desc: 'The email address assigned to a user or lead' },
                { name: 'Phone', desc: "A person's phone number" },
              ];
              const COMPANY_FIELDS = [
                { name: 'Company name', desc: 'The name of a company' },
                { name: 'Company size', desc: 'The number of people employed in this company, expressed as a single number' },
                { name: 'Company website', desc: "The web address for the company's primary marketing site" },
                { name: 'Company industry', desc: "The category or domain this company belongs to e.g. 'ecommerce' or 'SaaS'" },
              ];
              const filteredUser = USER_FIELDS.filter(f => !botFields.some(b => b.name === f.name) && f.name.toLowerCase().includes(addSearch.toLowerCase()));
              const filteredCompany = COMPANY_FIELDS.filter(f => !botFields.some(b => b.name === f.name) && f.name.toLowerCase().includes(addSearch.toLowerCase()));
              return (
                <div className="px-6 py-4 flex gap-6 relative">
                  <div className="flex-1">
                    <p className="text-[13px] text-[#646462] mb-2">Elige los datos que deseas usar para calificar a los clientes potenciales. Estos datos aparecerán en los perfiles de los clientes en Inbox, y también puedes recopilarlos con Automatización.</p>
                    <a href="#" className="text-[13px] text-[#3b59f6] underline">Ver el Bot de Tareas de cualificación básica</a>
                    <div className="mt-4 flex flex-col">
                      {botFields.map(f => (
                        <div key={f.name} className="flex items-center justify-between py-2.5 px-0 border-b border-[#f3f3f1] text-[13px]">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-[#1a1a1a] w-[130px]">{f.name}</span>
                            <span className="text-[#646462]">{f.desc}</span>
                          </div>
                          <button onClick={() => setBotFields(prev => prev.filter(b => b.name !== f.name))} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#f3f3f1] ml-2 flex-shrink-0">
                            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="relative mt-4">
                      <button ref={addBtnRef} onClick={() => { setShowAddPopover(v => !v); setAddSearch(''); }} className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">Agregar datos</button>
                      {showAddPopover && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowAddPopover(false)} />
                          <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[280px] bg-white rounded-[10px] shadow-[0_4px_24px_rgba(0,0,0,0.15)] border border-[#e9eae6] overflow-hidden">
                            <div className="px-3 py-2 border-b border-[#f3f3f1]">
                              <input autoFocus value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Search data..." className="w-full text-[13px] px-2 py-1.5 rounded-[6px] bg-[#f7f7f5] border border-transparent focus:outline-none focus:border-[#3b59f6] placeholder:text-[#aaa]" />
                            </div>
                            <div className="max-h-[280px] overflow-y-auto">
                              {filteredUser.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-semibold text-[#aaa] uppercase tracking-wide px-3 pt-2 pb-1">Datos del usuario</p>
                                  {filteredUser.map(f => (
                                    <button key={f.name} onClick={() => { setBotFields(prev => [...prev, f]); setShowAddPopover(false); setAddSearch(''); }} className="w-full text-left px-3 py-2 text-[13px] text-[#1a1a1a] hover:bg-[#f7f7f5] flex flex-col gap-0.5">
                                      <span className="font-medium">{f.name}</span>
                                      <span className="text-[11px] text-[#aaa] line-clamp-1">{f.desc}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {filteredCompany.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-semibold text-[#aaa] uppercase tracking-wide px-3 pt-2 pb-1">Datos de la empresa</p>
                                  {filteredCompany.map(f => (
                                    <button key={f.name} onClick={() => { setBotFields(prev => [...prev, f]); setShowAddPopover(false); setAddSearch(''); }} className="w-full text-left px-3 py-2 text-[13px] text-[#1a1a1a] hover:bg-[#f7f7f5] flex flex-col gap-0.5">
                                      <span className="font-medium">{f.name}</span>
                                      <span className="text-[11px] text-[#aaa] line-clamp-1">{f.desc}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {filteredUser.length === 0 && filteredCompany.length === 0 && (
                                <p className="text-[13px] text-[#aaa] px-3 py-3">No se encontraron datos</p>
                              )}
                            </div>
                            <div className="border-t border-[#f3f3f1] px-3 py-2">
                              <button className="text-[13px] text-[#3b59f6] hover:underline w-full text-left">+ Crear nuevos datos</button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <p className="text-[12px] text-[#646462] mt-3">Cambiar esta configuración modificará los datos de calificación visibles en todos los perfiles de usuarios y leads.</p>
                  </div>
                  <div className="w-[208px] flex-shrink-0 flex items-center justify-center">
                    <img src={IMG_QUALIFICATION} alt="Vista previa del perfil de calificación" className="w-[208px] h-[299px]" data-node-id="1:37921" />
                  </div>
                </div>
              );
            })()}

            {tab === 'eliminar' && (
              <div className="px-6 py-6">
                <p className="text-[13px] text-[#646462] mb-4">Elimina permanentemente a cualquier usuario o lead y su historial de conversaciones de Intercom para cumplir con las leyes europeas de protección de datos (RGPD). Puedes buscar usuarios activos, leads o personas archivadas de tu lista de personas.</p>
                <p className="text-[13px] font-semibold text-[#1a1a1a] mb-2">Encontrar un usuario o lead</p>
                <p className="text-[12px] text-[#646462] mb-2">Ingresa tu ID de usuario o dirección de correo electrónico</p>
                <div className="flex items-center gap-2">
                  <input placeholder="P. ej.: 23452 o john@theircompany.com" className="flex-1 max-w-[400px] border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3b59f6]" />
                  <button className="border border-[#e9eae6] rounded-[8px] px-4 py-2 text-[13px] text-[#646462] cursor-not-allowed">Encontrar usuario o lead</button>
                </div>
              </div>
            )}

            {tab === 'bloqueado' && (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <svg viewBox="0 0 40 40" className="w-12 h-12 fill-none stroke-[#ccc]" strokeWidth="1.5"><circle cx="14" cy="15" r="5"/><circle cx="26" cy="15" r="5"/><path d="M5 32c0-4 4-7 9-7s9 3 9 7M19 32c0-4 4-7 9-7s7 3 7 7"/></svg>
                <p className="text-[14px] font-semibold text-[#1a1a1a]">No hay personas bloqueadas</p>
                <p className="text-[13px] text-[#646462] max-w-[600px] text-center">Para impedir que una persona envíe mensajes, haz clic en el botón Bloquear en el menú desplegable junto al perfil de la persona.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EmpresasView (1-41345 + 1-42522) ──────────────────────────────────────────

export function EmpresasView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'atributos' | 'segmentos'>('atributos');
  const tabs = [
    { id: 'atributos' as const, label: 'Atributos' },
    { id: 'segmentos' as const, label: 'Segmentos' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Empresas</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
              </button>
              {tab === 'atributos' && <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Crear atributo</button>}
            </div>
          </div>
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  tab === t.id ? 'border-[#fa7938] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === 'atributos' && (
              <div className="px-6 py-4">
                <input placeholder="🔍  Nombre del campo..." className="w-full max-w-[380px] border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] mb-3 focus:outline-none focus:border-[#3b59f6]" />
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[#e9eae6]">
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Nombre del atributo</th>
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Formato</th>
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Creado</th>
                  </tr></thead>
                  <tbody>
                    {[
                      { icon: '🏢', name: 'Company name', desc: 'The name of a company', format: 'Texto' },
                      { icon: '🔢', name: 'Company ID', desc: 'A number identifying a company', format: 'Texto' },
                      { icon: '📅', name: 'Company last seen', desc: 'The last day anyone from a company visited your site or app', format: 'Fecha' },
                      { icon: '📅', name: 'Company created at', desc: 'The day a company was added to Intercom', format: 'Fecha' },
                      { icon: '👥', name: 'People', desc: 'The number of people in a company', format: 'Número' },
                      { icon: '📊', name: 'Company web sessions', desc: 'All visits from anyone in a company to your product\'s site or app', format: 'Número' },
                      { icon: '💼', name: 'Plan', desc: 'A specific plan or level within your product that companies have signed up t', format: 'Texto' },
                      { icon: '💰', name: 'Monthly Spend', desc: 'The monthly revenue you receive from a company', format: 'Número decimal' },
                    ].map(r => (
                      <tr key={r.name} className="border-b border-[#f3f3f1] hover:bg-[#fafaf9]">
                        <td className="px-4 py-3"><div className="flex items-start gap-2"><span>{r.icon}</span><div><p className="font-medium text-[#1a1a1a]">{r.name}</p><p className="text-[12px] text-[#646462]">{r.desc}</p></div></div></td>
                        <td className="px-4 py-3 text-[#646462] align-top">{r.format}</td>
                        <td className="px-4 py-3 text-[#646462] align-top">1 hora atrás</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === 'segmentos' && (
              <div className="px-6 py-4">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[#e9eae6]">
                    <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Nombre del segmento <span className="text-[#ccc]">↕</span></th>
                    <th className="text-right px-4 py-2 font-medium text-[#646462] text-[12px]">Empresas <span className="text-[#ccc]">↕</span></th>
                  </tr></thead>
                  <tbody>
                    {[['Active', 0], ['All', 0], ['New', 0]].map(([name, count]) => (
                      <tr key={name as string} className="border-b border-[#f3f3f1] hover:bg-[#fafaf9]">
                        <td className="px-4 py-3"><span className="text-[#1a1a1a] font-medium">{name}</span> <span className="text-[#646462]">(Segmento predefinido)</span></td>
                        <td className="px-4 py-3 text-right"><a href="#" className="text-[#3b59f6] hover:underline">Ver {count} empresas</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
