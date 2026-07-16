// ─────────────────────────────────────────────────────────────────────────────
// Shared UI components, helpers and demo data (used by 2+ domains)
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { aiApi, attachmentsApi, iamApi, knowledgeApi, workflowsApi } from '../api/client';
import { useApi } from '../api/hooks';
import { ICON_LIBRARY } from './icons';
import type { DropdownItem, IconVariant, Message, View } from './types';


// Mapping for LibraryV2 nodeIds (variant N → node 3:223XX, every 5 = 78px)
// To extract: get_design_context fileKey=QhrV4aBbAAqTxgWhaK8hGP nodeId=3-22376 (var 1), 3-22381 (var 2), 3-22384 (var 3), 3-22387 (var 4)…
// Each fetch returns the SVG URL — add to ICON_LIBRARY then use <LibraryIcon v="v2-N">

export function LibraryIcon({ v, size }: { v: IconVariant; size?: number }) {
  const def = ICON_LIBRARY[v];
  const finalSize = size ?? def.size;
  /*
  // removed: composer logic belongs to ConversationPanel, not LibraryIcon
  function __unusedLibraryIconGuard() {
    const content = replyText.trim();
    if (!content && attachments.length === 0) return;
    const attachmentText = attachments.length
      ? `\n\n${attachments.map(file => `[${file.name} · ${formatBytes(file.size)}]`).join('\n')}`
      : '';
    const finalContent = `${content}${attachmentText}`.trim();
    try {
      if (replyTab === 'nota') {
        await casesApi.addInternalNote(selectedConv.id, finalContent);
        onAction('Nota interna añadida');
      } else {
        await casesApi.reply(selectedConv.id, finalContent, latestDraft?.id);
        onAction('Respuesta enviada');
      }
      setReplyText('');
      setAttachments([]);
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo enviar', 'error');
    }
  }

  async function snoozeCase() {
    await updateStatus('snoozed', 'Caso pospuesto');
  }

  async function snoozeCase() {
    await updateStatus('snoozed', 'Caso pospuesto');
  }

  */
  return (
    <div className="overflow-hidden relative" style={{ width: finalSize, height: finalSize }}>
      {def.svgs.map((src, i) => (
        <div key={i} className="absolute" style={{ inset: def.insets[i] }}>
          <img src={src} alt="" className="absolute inset-0 w-full h-full" />
        </div>
      ))}
    </div>
  );
}

// ── Permanent inline-SVG icons — base64-encoded, never expire ─────────────────
// Bold lucide-style paths (stroke-width 2, linecap round, 24×24 viewBox)
const _i = (inner: string, sw = 2, col = '#1a1a1a') =>
  `data:image/svg+xml;base64,${btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  )}`;

// App logo (top-left rail, shown at 24 px) — rounded rect + two lines (Intercom-style)
const ICON_INBOX      = _i('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 10h8M8 14h5"/>', 2.25);
// ── Nav icons (bold, prominent) ───────────────────────────────────────────────
// ICON_FIN  → used for Inbox nav item  → message tray / inbox icon
export const ICON_FIN        = _i('<polyline points="22 13 16 13 14 16 10 16 8 13 2 13"/><path d="M5.45 5.11L2 13v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-7.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>');
// ICON_KNOWLEDGE → used for Fin AI nav → sparkle star
export const ICON_KNOWLEDGE  = _i('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>');
// ICON_REPORTS → used for Knowledge nav → open book
export const ICON_REPORTS    = _i('<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>');
// ICON_OUTBOUND → used for Reports nav → bar chart
export const ICON_OUTBOUND   = _i('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>');
// ── Other standalone icons ────────────────────────────────────────────────────
const ICON_CONTACTS   = _i('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>');
const ICON_SETUP      = _i('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>');
export const ICON_SEARCH     = _i('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>');
const ICON_SETTINGS   = _i('<circle cx="12" cy="12" r="3"/><path d="M12 1v3m0 16v3M4.22 4.22l2.12 2.12m11.32 11.32l2.12 2.12M1 12h3m16 0h3M4.22 19.78l2.12-2.12m11.32-11.32l2.12-2.12"/>');
export const AVATAR_ME       = _i('<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>');
export const ICON_SEARCH2    = _i('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>');
export const ICON_MENTION    = _i('<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94"/>');
export const ICON_CREATED    = _i('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>');
export const ICON_ALL        = _i('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>');
export const ICON_UNASSIGNED = _i('<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/>');
export const ICON_SPAM       = _i('<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>');
export const ICON_DASHBOARD  = _i('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>');
export const ICON_FIN_SVC    = _i('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>');
const ICON_RESOLVED   = _i('<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>');
export const ICON_ESCALATED  = _i('<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>');
export const ICON_PENDING    = _i('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>');
export const ICON_MESSENGER  = _i('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><circle cx="8" cy="11" r="1" fill="#1a1a1a" stroke="none"/><circle cx="12" cy="11" r="1" fill="#1a1a1a" stroke="none"/><circle cx="16" cy="11" r="1" fill="#1a1a1a" stroke="none"/>');
export const ICON_EMAIL2     = _i('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/>');
export const ICON_WHATSAPP2  = _i('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>');
export const ICON_PHONE2     = _i('<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .85h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16z"/>');
export const ICON_TICKETS    = _i('<path d="M2 9a3 3 0 010-6h20a3 3 0 010 6"/><path d="M2 15a3 3 0 000 6h20a3 3 0 000-6"/><path d="M6 9v6M18 9v6"/>');
export const ICON_MANAGE     = _i('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>');
export const ICON_PLUS       = _i('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>');
export const ICON_CHEVRON    = _i('<polyline points="9 18 15 12 9 6"/>');
export const ICON_FILTER     = _i('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>');
export const ICON_SORT       = _i('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>');

// Contacts-only icons
export const ICON_PERSONAS   = _i('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>');
export const ICON_BACK       = _i('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>');
export const ICON_LEARN      = _i('<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>');
export const ICON_NEW_USER   = _i('<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>');
export const IMG_ILLUSTRATION = _i('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>');
export const ICON_CLOSE      = _i('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
export const ICON_MSG        = _i('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>');
export const ICON_TAG        = _i('<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>');

// Imports view icons
export const ICON_IMPORTS_BOOK = _i('<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>');
export const ICON_IMPORTS_LINK = _i('<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>');

// All leads view icons
const IMG_ILLUSTRATION_LEADS = _i('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>');
const ICON_BULLET_BOOK       = _i('<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>');
const ICON_BULLET_LINK       = _i('<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>');
export const ICON_LEADS_CHIP        = _i('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>');
export const ICON_ADD_FILTER        = _i('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/><line x1="19" y1="15" x2="19" y2="21"/><line x1="16" y1="18" x2="22" y2="18"/>');
export const ICON_MSG_LEADS         = _i('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>');
export const ICON_VIEW_COLS         = _i('<rect x="3" y="3" width="6" height="18" rx="1"/><rect x="12" y="3" width="6" height="18" rx="1"/>');
export const ICON_VIEW_GRID         = _i('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>');
export const ICON_VIEW_LIST         = _i('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>');
export const ICON_INFO              = _i('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>');
export const ICON_EMPTY_STATE       = _i('<polyline points="22 13 16 13 14 16 10 16 8 13 2 13"/><path d="M5.45 5.11L2 13v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-7.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>');

// Fin AI Agent assets
export const IMG_FIN_LOGO_MARK     = _i('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>');
export const IMG_FIN_SERVICE_AGENT = _i('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M8 8V6a4 4 0 018 0v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>');
export const IMG_FIN_SALES_AGENT   = _i('<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path d="M15 3l1.5 1.5L20 1"/>');

// ── Shared: Trial Banner ──────────────────────────────────────────────────────
export function TrialBanner() {
  // Banner currently uses static demo copy. Once /api/billing exposes real
  // trial state we can switch this to a useApi() call. Until then, render
  // Clain-branded copy instead of the leftover "Comprar Intercom" CTA.
  return (
    <div className="flex items-center justify-between bg-[#e7e2fd] border border-[#b09efa] rounded-2xl px-4 py-[9px] flex-shrink-0 mx-0">
      <p className="text-[14px] text-[#1a1a1a]">
        Quedan <strong>14 días</strong> en tu{" "}
        <span className="underline">prueba de Clain Advanced</span>. Incluye uso ilimitado del agente de IA.
      </p>
      <div className="flex items-center gap-2">
        <a
          href="/pricing?promo=early-stage"
          className="text-[14px] font-semibold text-[#1a1a1a] px-3 py-[7px] rounded-full hover:bg-white/40"
        >
          Solicita el descuento Early Stage (93 %)
        </a>
        <a
          href="/pricing"
          className="text-[14px] font-semibold text-white bg-[#222] px-3 py-[7px] rounded-full hover:bg-[#444]"
        >
          Pasar a Pro
        </a>
      </div>
    </div>
  );
}

export function titleCase(value?: string | null) {
  return (value || 'Sin dato')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export function Dropdown({
  value,
  items,
  onChange,
  placement = 'bottom-start',
  triggerLabel,
  triggerClassName,
  menuClassName,
  renderTrigger,
  align = 'left',
  width,
}: {
  value?: string;
  items: DropdownItem[];
  onChange: (v: string) => void;
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
  triggerLabel?: string;
  triggerClassName?: string;
  menuClassName?: string;
  renderTrigger?: (selected: DropdownItem | undefined, isOpen: boolean) => ReactNode;
  align?: 'left' | 'right';
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = items.find(it => it.value === value);
  // Close on Escape, click-outside.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const positionClass = placement === 'top-start' || placement === 'top-end'
    ? 'bottom-[calc(100%+4px)]'
    : 'top-[calc(100%+4px)]';
  const alignClass = align === 'right' ? 'right-0' : 'left-0';

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        type="button"
        className={triggerClassName ?? `h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white flex items-center gap-2 text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7] ${open ? 'border-[#1a1a1a]' : ''}`}
      >
        {renderTrigger
          ? renderTrigger(selected, open)
          : <>
              <span className="truncate">{selected?.label ?? triggerLabel ?? '—'}</span>
              <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-[#646462] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4z"/></svg>
            </>}
      </button>
      {open && (
        <div
          ref={menuRef}
          className={`absolute ${positionClass} ${alignClass} z-30 bg-white border border-[#e9eae6] rounded-[10px] shadow-[0_8px_24px_rgba(20,20,20,0.12)] py-1 ${menuClassName ?? ''}`}
          style={{ minWidth: width ?? 200 }}
          role="menu"
        >
          {items.map((it, idx) => (
            <Fragment key={it.value + idx}>
              {it.divider && idx > 0 && <div className="my-1 border-t border-[#f1f1ee]" />}
              <button
                type="button"
                disabled={it.disabled}
                onClick={() => { if (!it.disabled) { onChange(it.value); setOpen(false); } }}
                className={`w-full flex items-center gap-2.5 px-3 h-9 text-[13px] text-left ${
                  it.disabled
                    ? 'text-[#a4a4a2] cursor-not-allowed'
                    : it.danger
                      ? 'text-[#b91c1c] hover:bg-[#fef2f2]'
                      : 'text-[#1a1a1a] hover:bg-[#f8f8f7]'
                } ${value === it.value && !it.danger ? 'font-semibold bg-[#f8f8f7]' : ''}`}
                role="menuitem"
              >
                {it.icon && <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">{it.icon}</span>}
                <span className="flex-1 truncate">{it.label}</span>
                {it.shortcut && <span className="text-[11.5px] text-[#646462] font-mono flex-shrink-0">{it.shortcut}</span>}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export function relativeTime(value?: string | null) {
  if (!value) return 'Ahora';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Ahora';
  const diff = Date.now() - time;
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}
export const messages: Message[] = [
  { id: "1", from: "bot", text: "Hola, soy Fin, el agente de IA de Intercom. Puedo responder preguntas sobre productos, precios, y más. ¿En qué puedo ayudarte hoy?", time: "hace 4 min", senderName: "Fin" },
  { id: "2", from: "user", text: "Install Messenger", time: "hace 4 min" },
  { id: "3", from: "bot", text: "Para instalar el Messenger de Intercom en tu sitio web, ve a Configuración > Messenger > Instalar y sigue las instrucciones paso a paso. Si necesitas ayuda adicional, puedo conectarte con un agente.", time: "hace 4 min", senderName: "Fin" },
];

export function formatContactWhen(value: string | null): string {
  if (!value) return '—';
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return '—';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1)   return 'hace un momento';
  if (min < 60)  return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24)    return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30)    return `hace ${d} d`;
  return new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS VIEW
// ─────────────────────────────────────────────────────────────────────────────

const ICON_SETTINGS_CHEVRON_OPEN = ICON_CHEVRON;

export function SettingsSidebar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const isDatos = view === 'settings' || view === 'imports' || view === 'labels' || view === 'people' || view === 'companies' || view === 'customObjects' || view === 'topics' || view === 'dataConversaciones' || view === 'customFilters' || view === 'emailTemplates';
  const isInboxSection = view === 'assignments' || view === 'macros' || view === 'tickets' || view === 'sla' || view === 'inboxTeam' || view === 'cannedResponses' || view === 'callsLive';
  const isIASection = view === 'aiInbox' || view === 'automation' || view === 'fin' || view === 'finSettings' || view === 'aiFeedback' || view === 'agentChat' || view === 'audiences';
  const isIntegSection = view === 'appStore' || view === 'connectors' || view === 'auth';
  const isWorkspaceSection = view === 'workspaceSecurity' || view === 'workspaceMultilingual' || view === 'workspaceHours' || view === 'workspaceBrands' || view === 'workspaceGeneral' || view === 'workspaceTeammates' || view === 'customRoles';
  const isSuscripcionSection = view === 'billing';
  const isCanalesSection = view === 'messenger' || view === 'email' || view === 'phone' || view === 'whatsapp' || view === 'discord' || view === 'sms' || view === 'social' || view === 'allChannels' || view === 'switchChannel' || view === 'slackChannel';
  const isPersonalSection = view === 'personal' || view === 'security' || view === 'notifications' || view === 'visible' || view === 'tokens' || view === 'accountAccess' || view === 'multilingual';

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    workspace:   isWorkspaceSection,
    suscripcion: isSuscripcionSection,
    canales:     isCanalesSection,
    inbox:       isInboxSection,
    ia:          isIASection,
    integ:       isIntegSection,
    datos:       isDatos,
    personal:    isPersonalSection,
  });
  const toggle = (k: string) => setOpenGroups(s => ({ ...s, [k]: !s[k] }));

  // Inline SVG chevron — rotates 90° when open
  const Chev = ({ on }: { on: boolean }) => (
    <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-[#8a8a88] flex-shrink-0 transition-transform duration-150 ${on ? 'rotate-90' : ''}`}>
      <path d="M6 4l4 4-4 4z"/>
    </svg>
  );

  // Group section header with icon + rotating chevron
  function GroupRow({ icon, label, groupKey, sectionActive }: { icon: React.ReactNode; label: string; groupKey: string; sectionActive: boolean }) {
    return (
      <button
        onClick={() => toggle(groupKey)}
        className={`flex items-center gap-2 w-full h-8 px-2.5 rounded-lg text-[13px] text-left ${
          sectionActive ? 'font-semibold text-[#1a1a1a] bg-[#ededea]/60' : 'font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]'
        }`}
      >
        <div className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0 text-[#1a1a1a]">{icon}</div>
        <span className="flex-1">{label}</span>
        <Chev on={openGroups[groupKey]} />
      </button>
    );
  }

  // Sub-item with icon + white-card active state
  function SubRow({ icon, label, nav, warn }: { icon: React.ReactNode; label: string; nav: View | null; warn?: boolean }) {
    const active = nav !== null && view === nav;
    return (
      <button
        onClick={() => nav && onNavigate(nav)}
        disabled={!nav}
        className={`flex items-center gap-2 w-full h-8 pl-3 pr-2.5 rounded-lg text-[13px] text-left ${
          active
            ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
            : nav
              ? 'font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]'
              : 'font-medium text-[#9a9a98] cursor-default'
        }`}
      >
        <div className="w-[15px] h-[15px] flex items-center justify-center flex-shrink-0 text-[#1a1a1a]">{icon}</div>
        <span className="flex-1">{label}</span>
        {warn && <span className="text-[#f59e0b] text-[11px] leading-none">⚠</span>}
      </button>
    );
  }

  // ── Group icons (18px) ────────────────────────────────────────────────────
  const IcoHome        = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2L2 7v7h4v-4h4v4h4V7L8 2z"/></svg>;
  const IcoWorkspace   = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="7" width="12" height="7" rx="1.5" opacity="0.5"/><path d="M1 7.5L8 2l7 5.5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/><rect x="6" y="9" width="4" height="5" rx="1"/></svg>;
  const IcoCreditCard  = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="10" rx="1.5"/><rect x="1" y="6.5" width="14" height="2" fill="white" opacity="0.35"/><rect x="3" y="9.5" width="3" height="1.5" rx="0.5" fill="white" opacity="0.55"/></svg>;
  const IcoChannels    = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12a1 1 0 011 1v7a1 1 0 01-1 1H9l-3 3v-3H2a1 1 0 01-1-1V3a1 1 0 011-1z"/></svg>;
  const IcoInboxGrp    = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 3a1 1 0 011-1h12a1 1 0 011 1v6H11l-1 2H6L5 9H1V3z" opacity="0.55"/><path d="M1 9h4l1 2h4l1-2h4v3a1 1 0 01-1 1H2a1 1 0 01-1-1V9z"/></svg>;
  const IcoAIGrp       = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.6 4.4H14l-3.6 2.6 1.4 4.4L8 9.8l-3.8 2.6 1.4-4.4L2 5.4h4.4L8 1z"/></svg>;
  const IcoIntegGrp    = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="2.2"/><path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15M3.2 3.2l1.8 1.8M11 11l1.8 1.8M3.2 12.8l1.8-1.8M11 5l1.8-1.8" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>;
  const IcoDataGrp     = <svg viewBox="0 0 16 16" fill="currentColor"><ellipse cx="8" cy="4" rx="6" ry="2"/><path d="M2 4v3c0 1.1 2.7 2 6 2s6-.9 6-2V4" opacity="0.65"/><path d="M2 7v3c0 1.1 2.7 2 6 2s6-.9 6-2V7" opacity="0.35"/></svg>;
  const IcoHelpGrp     = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="10" rx="1.5" opacity="0.55"/><path d="M6.5 5.5a1.5 1.5 0 113 0c0 .8-.5 1.2-1 1.6S8 8 8 8.5M8 10v.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>;
  const IcoOutboundGrp = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 5.5h1.5v5H2a1 1 0 01-1-1v-3a1 1 0 011-1zM3.5 5.5L9 2v12L3.5 10.5v-5z"/><path d="M11 6.3a2.5 2.5 0 010 3.4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/><path d="M12.7 4.5a5 5 0 010 7" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>;
  const IcoUserGrp     = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6H2z"/></svg>;

  // ── Sub-item icons (15px) ─────────────────────────────────────────────────
  const IcoGeneral     = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>;
  const IcoTeammate    = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="6" cy="5" r="2.3"/><path d="M1 13c0-2.6 2.2-4.7 5-4.7s5 2.1 5 4.7H1z"/><circle cx="12" cy="5" r="1.8" opacity="0.55"/><path d="M10.5 13h4.5c0-2-1.7-3.7-4-4" opacity="0.55"/></svg>;
  const IcoHoursS      = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6" opacity="0.3"/><path d="M8 4v4l2.5 2.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg>;
  const IcoBrandsS     = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2l1.8 3.7L14 6.4l-3 3 .7 4.2L8 11.6l-3.7 2-.7-4.2-3-3 4.2-.7L8 2z"/></svg>;
  const IcoSecurityS   = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1L2 3.5v4C2 11.2 5 14 8 15c3-1 6-3.8 6-7.5v-4L8 1z" opacity="0.45"/><path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  const IcoMultilingS  = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="5.5" opacity="0.25"/><ellipse cx="8" cy="8" rx="3" ry="5.5" stroke="currentColor" strokeWidth="1.1" fill="none"/><path d="M2.5 8h11" stroke="currentColor" strokeWidth="1.1" fill="none"/></svg>;
  const IcoBillingS    = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3.5" width="14" height="9" rx="1.5"/><rect x="1" y="7" width="14" height="2" fill="white" opacity="0.35"/><rect x="3" y="9.5" width="3" height="1.3" rx="0.4" fill="white" opacity="0.55"/></svg>;
  const IcoMessengerS  = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1C4.1 1 1 3.8 1 7.2c0 2 1 3.7 2.6 5l-.5 2.8 2.8-1.4c.6.2 1.3.3 2.1.3 3.9 0 7-2.8 7-6.2S11.9 1 8 1z"/><path d="M5 9l2-2.5 2 1.5 2-2" stroke="white" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  const IcoEmailS      = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="10" rx="1.5"/><path d="M1 5.5l7 4.5 7-4.5" stroke="white" strokeWidth="1.2" fill="none"/></svg>;
  const IcoPhoneS      = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h3l1.5 3.5L6 7a8 8 0 004 4l1.5-1.5L15 11v3a1 1 0 01-1 1A13 13 0 012 3a1 1 0 011-1z"/></svg>;
  const IcoWhatsAppS   = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6.5" opacity="0.45"/><path d="M5 10.5c.8.5 1.8.8 2.8.8 2.8 0 5-2.2 5-5S10.8 1.5 8 1.5 3 3.7 3 6.5c0 .9.2 1.8.7 2.5L3 11.5l2-.5-.2-.5z" opacity="0.8"/><path d="M6 6.5c0-.3.2-.5.4-.5l.4.1c.2 0 .3.1.4.3l.4 1.1c.1.2 0 .4-.1.5l-.3.3a3.5 3.5 0 001.5 1.5l.3-.3c.1-.2.3-.2.5-.1l1.1.4c.2.1.4.3.4.5 0 .3-.3.5-.5.5C8 10.8 6 8.8 6 6.5z" fill="white"/></svg>;
  const IcoSwitchS     = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="5" width="14" height="6" rx="3"/><circle cx="11" cy="8" r="2.5" fill="white"/></svg>;
  const IcoSlackS      = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="3.5" height="3.5" rx="0.8" opacity="0.8"/><rect x="2" y="6.5" width="3.5" height="3.5" rx="0.8" opacity="0.55"/><rect x="6.5" y="2" width="3.5" height="3.5" rx="0.8" opacity="0.55"/><rect x="6.5" y="6.5" width="3.5" height="3.5" rx="0.8" opacity="0.35"/><rect x="11" y="2" width="3.5" height="8" rx="0.8" opacity="0.25"/></svg>;
  const IcoDiscordS    = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M12.5 3A10 10 0 0010 2.5c-.1.3-.2.6-.4.8A9.4 9.4 0 006.3 3c-.1.2-.3.5-.4.8A10 10 0 003.5 5.5C2.5 7.9 2.5 10.4 3.5 12c.8.8 1.8 1 2.5 1l.5-1a4.5 4.5 0 01-1.5-1 5.5 5.5 0 001 .3v.5a5.5 5.5 0 004 0v-.5c.3-.1.7-.2 1-.3a4.5 4.5 0 01-1.5 1l.5 1c.7 0 1.7-.2 2.5-1 1-1.6 1-4.1 0-6.5z"/><circle cx="6.2" cy="9" r="1"/><circle cx="9.8" cy="9" r="1"/></svg>;
  const IcoSMSS        = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12a1 1 0 011 1v7a1 1 0 01-1 1H9l-3 3v-3H2a1 1 0 01-1-1V3a1 1 0 011-1z" opacity="0.65"/><path d="M5 6.5h6M5 8.7h4" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round"/></svg>;
  const IcoSocialS     = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="4" cy="8" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="12" cy="12" r="2"/><path d="M5.9 7.1l4.2-2.2M5.9 8.9l4.2 2.2" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>;
  const IcoAllChanS    = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.2" opacity="0.8"/><rect x="9" y="1" width="6" height="6" rx="1.2" opacity="0.55"/><rect x="1" y="9" width="6" height="6" rx="1.2" opacity="0.55"/><rect x="9" y="9" width="6" height="6" rx="1.2" opacity="0.35"/></svg>;
  const IcoTeamS       = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="6" cy="5" r="2.3"/><path d="M1 13c0-2.6 2.2-4.7 5-4.7S11 10.4 11 13H1z"/><circle cx="12" cy="5" r="1.8" opacity="0.55"/><path d="M10.5 13h4.5c0-2-1.7-3.7-4-4" opacity="0.55"/></svg>;
  const IcoAssignS     = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  const IcoMacrosS     = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 4.5h10M3 8h7M3 11.5h5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/><path d="M13 9l2 2-2 2" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  const IcoTicketsS    = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="4" width="14" height="8" rx="1.5"/><path d="M4 8h1.5M7 8h1.5M10 8h1.5" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>;
  const IcoSLAS        = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6" opacity="0.25"/><path d="M8 4v4l2.5 2.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg>;
  const IcoFinS        = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.6 4.4H14l-3.6 2.6 1.4 4.4L8 9.8l-3.8 2.6 1.4-4.4L2 5.4h4.4L8 1z"/></svg>;
  const IcoBuzonS      = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="10" rx="1.5" opacity="0.25"/><path d="M3.5 8.5l1.5-3.5 1.5 3.5M3.5 7.5h2.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/><path d="M8.5 5v4M10.5 5c.8 0 1.5.4 1.5 1.5s-.7 1.5-1.5 1.5H8.5M10.5 8h-2" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round"/></svg>;
  const IcoAudiencesS  = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="5.5" cy="5" r="2.2"/><path d="M1 13c0-2.4 2-4.3 4.5-4.3S10 10.6 10 13H1z"/><circle cx="11.5" cy="5" r="1.8" opacity="0.5"/><path d="M10.2 13h4.3c0-2-1.6-3.5-3.8-3.8" opacity="0.5"/></svg>;
  const IcoAutoS       = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M9 2L5 9h4l-2 5 6-7H9l2-5z"/></svg>;
  const IcoAppS        = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.2" opacity="0.8"/><rect x="9" y="1" width="6" height="6" rx="1.2" opacity="0.55"/><rect x="1" y="9" width="6" height="6" rx="1.2" opacity="0.55"/><rect x="9" y="9" width="6" height="6" rx="1.2" opacity="0.35"/></svg>;
  const IcoConnS       = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="4" cy="8" r="2.5"/><circle cx="12" cy="8" r="2.5"/><path d="M6.5 8h3" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>;
  const IcoAuthS       = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/><circle cx="8" cy="10.5" r="1.2" fill="white"/></svg>;
  const IcoDevS        = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 5L2 8l3 3M11 5l3 3-3 3M9.5 3l-3 10" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  const IcoLabelsS     = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h6.2L14 8l-5.8 6H2l-1-1V3l1-1z"/><circle cx="5.5" cy="8" r="1.2" fill="white"/></svg>;
  const IcoPeopleS     = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6H2z"/></svg>;
  const IcoCompaniesS  = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="6" width="12" height="9" rx="1"/><path d="M5 6V4.5A1.5 1.5 0 016.5 3h3A1.5 1.5 0 0111 4.5V6" stroke="currentColor" strokeWidth="1.1" fill="none"/><rect x="6.5" y="9" width="3" height="3" rx="0.5" fill="white" opacity="0.65"/></svg>;
  const IcoConvS       = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12a1 1 0 011 1v7a1 1 0 01-1 1H9l-3 3v-3H2a1 1 0 01-1-1V3a1 1 0 011-1z"/></svg>;
  const IcoImportsS    = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 12.5h12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>;
  const IcoTopicsS     = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="5.5" opacity="0.25"/><path d="M5.5 8h5M8 5.5v5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg>;
  const IcoCustomS     = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="2" opacity="0.35"/><rect x="5.5" y="5.5" width="5" height="5" rx="1"/></svg>;
  const IcoInfoS       = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6" opacity="0.25"/><path d="M8 7v4.5M8 5.3v.7" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg>;
  const IcoNotifsS     = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a5 5 0 015 5v3l1.5 2.5h-13L3 10V7a5 5 0 015-5zM6.3 13.5a1.8 1.8 0 003.4 0H6.3z"/></svg>;
  const IcoVisibleS    = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2" fill="white"/></svg>;
  const IcoTokensS     = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="6" width="12" height="8" rx="1.5"/><path d="M5 6V5a3 3 0 016 0v1" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/><circle cx="8" cy="10" r="1.3" fill="white"/></svg>;
  const IcoAccessS     = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="7" width="10" height="7" rx="1.5"/><path d="M4 7V5.5a4 4 0 018 0V7" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/><circle cx="7" cy="11" r="1.3" fill="white"/><path d="M14 8l1.5 1.5L14 11" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>;
  const IcoCannedS     = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3h12a1 1 0 011 1v6a1 1 0 01-1 1H9l-2 2-2-2H2a1 1 0 01-1-1V4a1 1 0 011-1z" opacity="0.45"/><path d="M4 6.5h8M4 8.7h5" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round"/></svg>;
  const IcoFiltersS    = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg>;
  const IcoEmailTplS   = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="10" rx="1.5" opacity="0.35"/><path d="M1 5l7 4 7-4" stroke="currentColor" strokeWidth="1.1" fill="none"/><path d="M10.5 10l1.5 1.5L14 9" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  const IcoRolesS      = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="6" cy="5" r="2.3"/><path d="M1 13c0-2.6 2.2-4.7 5-4.7" opacity="0.5"/><rect x="8" y="9" width="7" height="5" rx="1.2"/><path d="M10.5 11.5h2M10.5 12.5h1.5" stroke="white" strokeWidth="1" fill="none" strokeLinecap="round"/></svg>;
  const IcoAIFeedbackS = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.6 4.4H14l-3.6 2.6 1.4 4.4L8 9.8l-3.8 2.6 1.4-4.4L2 5.4h4.4L8 1z" opacity="0.45"/><path d="M6 9.5l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  const IcoCallsS      = <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h3l1.5 3.5L6 7a8 8 0 004 4l1.5-1.5L15 11v3a1 1 0 01-1 1A13 13 0 012 3a1 1 0 011-1z" opacity="0.8"/><path d="M10.5 2a4 4 0 010 5.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>;
  const IcoMCPS        = <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="10" rx="2" opacity="0.35"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><path d="M6.5 8h3" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>;
  const IcoMaxS        = <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="6.5" opacity="0.2"/><path d="M5 11V5l3 3 3-3v6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/><circle cx="8" cy="2.5" r="1" fill="currentColor" opacity="0.7"/></svg>;

  return (
    <div className="flex flex-col h-full w-[230px] flex-shrink-0 bg-[#fbfbf9] rounded-[16px] drop-shadow-[0px_1px_2px_rgba(20,20,20,0.15)] overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Ajustes</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-0.5">
        {/* Inicio */}
        <button
          onClick={() => onNavigate('settings')}
          className={`flex items-center gap-2 w-full h-8 px-2.5 rounded-lg text-[13px] text-left ${
            view === 'settings'
              ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
              : 'font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]'
          }`}
        >
          <div className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0 text-[#1a1a1a]">{IcoHome}</div>
          <span className="flex-1">Inicio</span>
        </button>

        {/* Espacio de trabajo */}
        <GroupRow icon={IcoWorkspace} label="Espacio de trabajo" groupKey="workspace" sectionActive={isWorkspaceSection} />
        {openGroups.workspace && (
          <div className="flex flex-col gap-0.5 pl-2">
            <SubRow icon={IcoGeneral}    label="General"              nav={'workspaceGeneral'} />
            <SubRow icon={IcoTeammate}   label="Compañeros de equipo" nav={'workspaceTeammates'} />
            <SubRow icon={IcoHoursS}     label="Horario de atención"  nav={'workspaceHours'} />
            <SubRow icon={IcoBrandsS}    label="Marcas"               nav={'workspaceBrands'} />
            <SubRow icon={IcoSecurityS}  label="Seguridad"            nav={'workspaceSecurity'} warn />
            <SubRow icon={IcoMultilingS} label="Multilingüe"          nav={'workspaceMultilingual'} />
          </div>
        )}

        {/* Suscripción */}
        <GroupRow icon={IcoCreditCard} label="Suscripción" groupKey="suscripcion" sectionActive={isSuscripcionSection} />
        {openGroups.suscripcion && (
          <div className="flex flex-col gap-0.5 pl-2">
            <SubRow icon={IcoBillingS} label="Facturación" nav={'billing'} />
          </div>
        )}

        {/* Canales */}
        <GroupRow icon={IcoChannels} label="Canales" groupKey="canales" sectionActive={isCanalesSection} />
        {openGroups.canales && (
          <div className="flex flex-col gap-0.5 pl-2">
            <SubRow icon={IcoMessengerS} label="Messenger"                nav={'messenger'} />
            <SubRow icon={IcoEmailS}     label="Correo electrónico"        nav={'email'} />
            <SubRow icon={IcoPhoneS}     label="Teléfono"                  nav={'phone'} />
            <SubRow icon={IcoWhatsAppS}  label="WhatsApp"                  nav={'whatsapp'} />
            <SubRow icon={IcoSwitchS}    label="Switch"                    nav={'switchChannel'} />
            <SubRow icon={IcoSlackS}     label="Slack"                     nav={'slackChannel'} />
            <SubRow icon={IcoDiscordS}   label="Discord"                   nav={'discord'} />
            <SubRow icon={IcoSMSS}       label="SMS"                       nav={'sms'} />
            <SubRow icon={IcoSocialS}    label="Canales de redes sociales" nav={'social'} />
            <SubRow icon={IcoAllChanS}   label="Todos los canales"         nav={'allChannels'} />
          </div>
        )}

        {/* Inbox */}
        <GroupRow icon={IcoInboxGrp} label="Inbox" groupKey="inbox" sectionActive={isInboxSection} />
        {openGroups.inbox && (
          <div className="flex flex-col gap-0.5 pl-2">
            <SubRow icon={IcoTeamS}    label="Inbox para el equipo" nav={'inboxTeam'} />
            <SubRow icon={IcoAssignS}  label="Asignaciones"         nav={'assignments'} />
            <SubRow icon={IcoMacrosS}  label="Macros"               nav={'macros'} />
            <SubRow icon={IcoTicketsS} label="Folios de atención"   nav={'tickets'} />
            <SubRow icon={IcoSLAS}     label="SLA"                  nav={'sla'} />
            <SubRow icon={IcoCannedS}  label="Respuestas predefinidas" nav={'cannedResponses'} />
            <SubRow icon={IcoCallsS}   label="Llamadas"              nav={'callsLive'} />
          </div>
        )}

        {/* IA y automatización */}
        <GroupRow icon={IcoAIGrp} label="IA y automatización" groupKey="ia" sectionActive={isIASection} />
        {openGroups.ia && (
          <div className="flex flex-col gap-0.5 pl-2">
            <SubRow icon={IcoFinS}        label="Fin AI Agent"   nav={'finSettings'} />
            <SubRow icon={IcoAudiencesS}  label="Audiences"      nav={'audiences'} />
            <SubRow icon={IcoBuzonS}      label="Buzón de IA"    nav={'aiInbox'} />
            <SubRow icon={IcoAutoS}       label="Automatización"  nav={'automation'} />
          </div>
        )}

        {/* Integraciones */}
        <GroupRow icon={IcoIntegGrp} label="Integraciones" groupKey="integ" sectionActive={isIntegSection} />
        {openGroups.integ && (
          <div className="flex flex-col gap-0.5 pl-2">
            <SubRow icon={IcoAppS}  label="Tienda de aplicaciones"    nav={'appStore'} />
            <SubRow icon={IcoConnS} label="Conectores de datos"       nav={'connectors'} />
            <SubRow icon={IcoAuthS} label="Autenticación"             nav={'auth'} />
          </div>
        )}

        {/* Datos */}
        <GroupRow icon={IcoDataGrp} label="Datos" groupKey="datos" sectionActive={isDatos} />
        {openGroups.datos && (
          <div className="flex flex-col gap-0.5 pl-2">
            <SubRow icon={IcoLabelsS}    label="Etiquetas"                     nav={'labels'} />
            <SubRow icon={IcoPeopleS}    label="Personas"                      nav={'people'} />
            <SubRow icon={IcoCompaniesS} label="Empresas"                      nav={'companies'} />
            <SubRow icon={IcoConvS}      label="Conversaciones"                nav={'dataConversaciones'} />
            <SubRow icon={IcoCustomS}    label="Objetos personalizados"        nav={'customObjects'} />
            <SubRow icon={IcoImportsS}   label="Importaciones y exportaciones" nav={'imports'} />
            <SubRow icon={IcoTopicsS}    label="Temas"                         nav={'topics'} />
            <SubRow icon={IcoFiltersS}   label="Filtros personalizados"        nav={'customFilters'} />
            <SubRow icon={IcoEmailTplS}  label="Plantillas de email"           nav={'emailTemplates'} />
          </div>
        )}

        {/* Standalone bottom items */}
        <button
          onClick={() => onNavigate('helpCenter')}
          className={`flex items-center gap-2 w-full h-8 px-2.5 rounded-lg text-[13px] font-medium text-[#1a1a1a] text-left ${view === 'helpCenter' ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold' : 'hover:bg-[#f3f3f1]'}`}
        >
          <div className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0 text-[#1a1a1a]">{IcoHelpGrp}</div>
          <span className="flex-1">Centro de ayuda</span>
        </button>
        <button
          onClick={() => onNavigate('outbound')}
          className={`flex items-center gap-2 w-full h-8 px-2.5 rounded-lg text-[13px] font-medium text-[#1a1a1a] text-left ${view === 'outbound' ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold' : 'hover:bg-[#f3f3f1]'}`}
        >
          <div className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0 text-[#1a1a1a]">{IcoOutboundGrp}</div>
          <span className="flex-1">Canales salientes</span>
        </button>

        {/* Personal */}
        <GroupRow icon={IcoUserGrp} label="Personal" groupKey="personal" sectionActive={isPersonalSection} />
        {openGroups.personal && (
          <div className="flex flex-col gap-0.5 pl-2">
            <SubRow icon={IcoInfoS}      label="Información"            nav={'personal'} />
            <SubRow icon={IcoSecurityS}  label="Seguridad de la cuenta" nav={'security'} />
            <SubRow icon={IcoNotifsS}    label="Notificaciones"         nav={'notifications'} />
            <SubRow icon={IcoVisibleS}   label="Visible para ti"        nav={'visible'} />
            <SubRow icon={IcoTokensS}    label="Tokens de API"          nav={'tokens'} />
            <SubRow icon={IcoAccessS}    label="Acceso a la cuenta"     nav={'accountAccess'} />
            <SubRow icon={IcoMultilingS} label="Multilingüe"            nav={'multilingual'} />
          </div>
        )}
      </div>
    </div>
  );
}

// Mini flow cards preview
export function FinFlowPreview() {
  const cards = [
    { title: 'When customer\nsends their\nfirst message', sub: 'Outside →' },
    { title: "Hi there! You're\nspeaking with an AI\nAgent…", sub: 'Branches →' },
    { title: "Hi Fin! Here's a\nsummary… Contact\nour team.", sub: 'Continue →' },
  ];
  return (
    <div className="flex gap-2">
      {cards.map((c, i) => (
        <div key={i} className="bg-white border border-[#e9eae6] rounded-lg p-2.5 w-[110px] flex flex-col gap-1.5 shadow-sm">
          <div className="w-5 h-5 rounded-full bg-[#fef3c7] flex items-center justify-center text-[10px]">🤖</div>
          <p className="text-[9.5px] text-[#1a1a1a] font-medium leading-tight whitespace-pre-line">{c.title}</p>
          <p className="text-[9px] text-[#3b59f6]">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge — full back-end-wired components (ported from src/components/Knowledge.tsx)
// ─────────────────────────────────────────────────────────────────────────────

export const KH_TYPE_OPTIONS = [
  { value: 'ARTICLE',  label: 'Artículo' },
  { value: 'POLICY',   label: 'Política' },
  { value: 'SNIPPET',  label: 'Fragmento' },
  { value: 'PLAYBOOK', label: 'Playbook' },
];

// KnowledgeArticleEditor — create + edit individual articles.
// Small collapsible block used by the right Información panel of
// KnowledgeArticleEditor. Each section opens by default; clicking the
// chevron toggles. State is local so toggling one doesn't re-render others.
function ArticleEditorSection({
  title, icon, defaultOpen = true, children,
}: {
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#e9eae6]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[#fafafa] text-left"
      >
        <span className="flex items-center gap-2 text-[14px] font-semibold text-[#1a1a1a]">
          {icon}
          {title}
        </span>
        <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-[#646462] transition-transform ${open ? '' : '-rotate-90'}`}><path d="M4 6l4 4 4-4z"/></svg>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

export function KnowledgeArticleEditor({
  initial,
  domains,
  onClose,
  onSaved,
  onAction,
}: {
  initial?: any;
  domains: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
  onAction: (msg: string, type?: 'success' | 'error') => void;
}) {
  // ── Core fields ─────────────────────────────────────────────────────────
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState<string>(initial?.description || '');
  const [content, setContent] = useState(initial?.content || initial?.body || '');
  const [type, setType] = useState<string>(String(initial?.type || 'ARTICLE').toUpperCase());
  const [domainId, setDomainId] = useState<string>(initial?.domain_id || initial?.domainId || '');
  const [visibility, setVisibility] = useState<'public' | 'internal'>(initial?.visibility === 'internal' ? 'internal' : 'public');
  const [language, setLanguage] = useState<string>(initial?.language || 'en');
  const [authorUserId, setAuthorUserId] = useState<string>(initial?.author_user_id || initial?.authorUserId || initial?.created_by || initial?.createdBy || '');
  // ── Fin section ─────────────────────────────────────────────────────────
  // API responses are camelized (finService); tolerate snake for prefills too.
  const [finService,    setFinService]    = useState<boolean>(!!(initial?.finService ?? initial?.fin_service));
  const [finSales,      setFinSales]      = useState<boolean>(!!(initial?.finSales ?? initial?.fin_sales));
  const [copilotEnabled,setCopilotEnabled]= useState<boolean>((initial?.copilotEnabled ?? initial?.copilot_enabled) !== false);
  const [finAudience,   setFinAudience]   = useState<string[]>(() => {
    const aud = initial?.finAudience ?? initial?.fin_audience;
    return Array.isArray(aud) && aud.length ? aud : ['users','leads','visitors'];
  });
  // ── Help-center section ─────────────────────────────────────────────────
  const [hcStatus, setHcStatus] = useState<'draft' | 'published'>(
    (initial?.helpcenterStatus ?? initial?.helpcenter_status) === 'published' ? 'published' : 'draft',
  );
  const [hcCollectionId, setHcCollectionId] = useState<string>(initial?.helpcenterCollectionId || initial?.helpcenter_collection_id || '');
  const [hcAudience, setHcAudience] = useState<string[]>(
    Array.isArray(initial?.helpcenter_audience) && initial.helpcenter_audience.length
      ? initial.helpcenter_audience
      : ['users','leads','visitors'],
  );
  // ── Suggestions / tags ──────────────────────────────────────────────────
  const [excludedFromSuggestions, setExcludedFromSuggestions] = useState<boolean>(!!initial?.excluded_from_suggestions);
  const [tags, setTags] = useState<string[]>(Array.isArray(initial?.tags) ? initial.tags : []);
  const [tagDraft, setTagDraft] = useState('');
  // ── UI shell ────────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  // Fullscreen toggle — when on, the drawer expands to cover the whole
  // viewport (no slice of the underlying view remains visible on the left).
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Auto-focus the title field on first mount when creating a new article.
  useEffect(() => {
    if (!initial?.id) titleInputRef.current?.focus();
  }, [initial?.id]);

  // ── Toolbar insertion helpers ────────────────────────────────────────────
  // Insert text at the current cursor position (or replace selection) and
  // restore caret afterwards. caretOffset positions the cursor relative to
  // the inserted text — handy for putting it inside the brackets after a
  // [link]() insert, or in the first table cell.
  function insertAtCursor(text: string, caretOffset?: number) {
    const ta = bodyRef.current;
    if (!ta) {
      // Fallback when ref not bound yet — append at end.
      setContent(c => (c ? `${c}\n${text}` : text));
      return;
    }
    const start = ta.selectionStart ?? content.length;
    const end = ta.selectionEnd ?? content.length;
    const before = content.slice(0, start);
    const after = content.slice(end);
    // If we're not at the start of a line and the snippet starts with a
    // block-level marker (bullet, heading, code fence, etc.), prepend a
    // newline so we don't mangle the previous line.
    const startsAtLineStart = start === 0 || before.endsWith('\n');
    const needsLeadingNl = !startsAtLineStart && /^[-*\d+#>|`!]/.test(text);
    const finalText = needsLeadingNl ? `\n${text}` : text;
    const next = `${before}${finalText}${after}`;
    setContent(next);
    // Restore cursor on next tick once React has flushed the new value.
    requestAnimationFrame(() => {
      const cursor = before.length + finalText.length + (caretOffset ?? 0);
      try {
        ta.focus();
        ta.setSelectionRange(
          caretOffset != null ? before.length + finalText.length + caretOffset : cursor,
          caretOffset != null ? before.length + finalText.length + caretOffset : cursor,
        );
      } catch { /* ignore */ }
    });
  }
  // Wrap selected text in `prefix` + `suffix`. If nothing is selected, just
  // insert the prefix+suffix and place the caret in between. Used by the
  // bold / italic / inline-code buttons (and link with surrounded text).
  function wrapSelection(prefix: string, suffix: string = prefix) {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? content.length;
    const end = ta.selectionEnd ?? content.length;
    const selected = content.slice(start, end);
    const before = content.slice(0, start);
    const after = content.slice(end);
    const next = `${before}${prefix}${selected}${suffix}${after}`;
    setContent(next);
    requestAnimationFrame(() => {
      try {
        ta.focus();
        if (selected) {
          ta.setSelectionRange(before.length + prefix.length, before.length + prefix.length + selected.length);
        } else {
          const caret = before.length + prefix.length;
          ta.setSelectionRange(caret, caret);
        }
      } catch { /* ignore */ }
    });
  }
  // Toolbar action implementations.
  async function uploadImage(file: File) {
    if (!file.type.startsWith('image/')) {
      onAction('Selecciona un archivo de imagen', 'error');
      return;
    }
    try {
      // Read as base64 data URL so attachmentsApi.upload can persist it.
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result: any = await attachmentsApi.upload({ name: file.name, type: file.type, dataUrl });
      const imgUrl = result?.url || result?.signedUrl || result?.publicUrl || dataUrl;
      const alt = file.name.replace(/\.[^.]+$/, '');
      insertAtCursor(`![${alt}](${imgUrl})\n`);
      onAction(`Imagen insertada: ${file.name}`);
    } catch (err: any) {
      onAction(err?.message || 'No se pudo subir la imagen', 'error');
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }
  function insertVideo() {
    const url = typeof window !== 'undefined' ? window.prompt('URL del vídeo (YouTube, Vimeo o MP4):') : null;
    if (!url || !/^https?:\/\//i.test(url.trim())) return;
    insertAtCursor(`\n[Vídeo](${url.trim()})\n`);
  }
  function insertTable() {
    insertAtCursor(
      '\n| Columna 1 | Columna 2 | Columna 3 |\n| --- | --- | --- |\n|   |   |   |\n|   |   |   |\n',
    );
  }
  function insertParagraphBreak() {
    insertAtCursor('\n\n');
  }
  async function insertAiSuggestion() {
    if (!title.trim()) {
      onAction('Pon un título para que la IA pueda generar contenido', 'error');
      return;
    }
    try {
      onAction('Generando con IA…');
      const prompt = `Eres un experto redactando artículos de Centro de ayuda. Redacta una sección breve (3-5 frases) sobre: "${title.trim()}". Devuelve sólo el texto en español, sin encabezados.`;
      const response: any = await aiApi.copilot('article-editor', prompt, []);
      const text = response?.answer || response?.message || response?.content || '';
      if (text.trim()) {
        insertAtCursor(`\n${text.trim()}\n`);
        onAction('Sugerencia insertada');
      } else {
        onAction('La IA no devolvió contenido', 'error');
      }
    } catch (err: any) {
      onAction(err?.message || 'No se pudo generar con IA', 'error');
    }
  }
  function insertQuote() {
    insertAtCursor('\n> ', 0);
  }
  function insertCodeBlock() {
    // Place caret between the fences.
    insertAtCursor('\n```\n\n```\n', -5);
  }
  function insertList(ordered = false) {
    insertAtCursor(ordered ? '\n1. ' : '\n- ', 0);
  }
  function insertLink() {
    if (typeof window === 'undefined') return;
    const url = window.prompt('URL del vínculo (https://…):');
    if (!url || !/^https?:\/\//i.test(url.trim())) return;
    const ta = bodyRef.current;
    const selected = ta ? content.slice(ta.selectionStart ?? 0, ta.selectionEnd ?? 0) : '';
    if (selected) {
      // Wrap the selected text as the link label.
      wrapSelection('[', `](${url.trim()})`);
    } else {
      const text = window.prompt('Texto del vínculo:', url.trim()) || url.trim();
      insertAtCursor(`[${text}](${url.trim()})`);
    }
  }
  async function uploadAttachment(file: File) {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result: any = await attachmentsApi.upload({ name: file.name, type: file.type, dataUrl });
      const fileUrl = result?.url || result?.signedUrl || result?.publicUrl || dataUrl;
      const sizeKb = Math.max(1, Math.round(file.size / 1024));
      insertAtCursor(`\n📎 [${file.name} · ${sizeKb} KB](${fileUrl})\n`);
      onAction(`Adjuntado: ${file.name}`);
    } catch (err: any) {
      onAction(err?.message || 'No se pudo subir el archivo', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }
  // Close on Esc unless the user is typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      const inEditable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (!inEditable) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Read-only metadata helpers.
  const articleId = initial?.id || initial?.article_id || null;
  const articleStatus = initial?.status || 'draft';
  const createdAt = initial?.created_at || null;
  const updatedAt = initial?.updated_at || null;
  const reactionsObj = (initial?.reactions || {}) as { happy?: number; neutral?: number; sad?: number };
  const totalReactions = Math.max(0, (reactionsObj.happy || 0) + (reactionsObj.neutral || 0) + (reactionsObj.sad || 0));
  const reactionPct = (n?: number) => totalReactions > 0 ? Math.round(((n || 0) / totalReactions) * 100) : 0;
  const viewCount = initial?.view_count ?? 0;
  const conversationCount = initial?.conversation_count ?? 0;
  const finResolutions = initial?.fin_resolutions ?? null;
  const finParticipations = initial?.fin_participations ?? null;
  const typeLabel = type === 'POLICY' ? 'Política'
    : type === 'SNIPPET' ? 'Fragmento'
    : type === 'PLAYBOOK' ? 'Playbook'
    : type === 'DOCUMENT' ? 'Documento'
    : (visibility === 'internal' ? 'Artículo interno' : 'Artículo público');
  function toggleAudience(setter: (v: string[]) => void, current: string[], token: string) {
    const next = current.includes(token) ? current.filter(t => t !== token) : [...current, token];
    setter(next.length === 0 ? current : next);
  }
  function addTag() {
    const t = tagDraft.trim();
    if (!t || tags.includes(t)) { setTagDraft(''); return; }
    setTags(prev => [...prev, t]);
    setTagDraft('');
  }
  function removeTag(t: string) { setTags(prev => prev.filter(x => x !== t)); }
  const audienceLabel = (a: string[]) => {
    if (a.length === 3) return 'Users, Leads, and Visitors';
    return a.map(t => t === 'users' ? 'Users' : t === 'leads' ? 'Leads' : 'Visitors').join(', ');
  };

  // ── Knowledge sheet (structured fields the AI agent reads) ────────────────
  // Backend stores them as JSON in content_structured. The simple editor stays
  // exactly the same; "Estructura para IA" toggles a panel where each array
  // field is a textarea (one line per item).
  const [showSheet, setShowSheet] = useState(false);
  const seedSheet = (() => {
    const raw = initial?.content_structured;
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
    return null;
  })();
  const [sheetSummary,    setSheetSummary]    = useState<string>(String(seedSheet?.summary ?? ''));
  const [sheetPolicy,     setSheetPolicy]     = useState<string>(String(seedSheet?.policy ?? ''));
  const [sheetAllowed,    setSheetAllowed]    = useState<string>((seedSheet?.allowed    || []).join('\n'));
  const [sheetBlocked,    setSheetBlocked]    = useState<string>((seedSheet?.blocked    || []).join('\n'));
  const [sheetEscalation, setSheetEscalation] = useState<string>((seedSheet?.escalation || []).join('\n'));
  const [sheetEvidence,   setSheetEvidence]   = useState<string>((seedSheet?.evidence   || []).join('\n'));
  const [sheetAgentNotes, setSheetAgentNotes] = useState<string>((seedSheet?.agent_notes || []).join('\n'));
  const [sheetExamples,   setSheetExamples]   = useState<string>((seedSheet?.examples   || []).join('\n'));
  const [sheetKeywords,   setSheetKeywords]   = useState<string>((seedSheet?.keywords   || []).join('\n'));
  function buildContentStructured() {
    const lines = (s: string) => s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const sheet = {
      summary:     sheetSummary.trim(),
      policy:      sheetPolicy.trim(),
      allowed:     lines(sheetAllowed),
      blocked:     lines(sheetBlocked),
      escalation:  lines(sheetEscalation),
      evidence:    lines(sheetEvidence),
      agent_notes: lines(sheetAgentNotes),
      examples:    lines(sheetExamples),
      keywords:    lines(sheetKeywords),
    };
    // Only include if at least one field has content; otherwise leave null.
    const hasContent = sheet.summary || sheet.policy
      || sheet.allowed.length || sheet.blocked.length || sheet.escalation.length
      || sheet.evidence.length || sheet.agent_notes.length
      || sheet.examples.length || sheet.keywords.length;
    return hasContent ? sheet : null;
  }

  // ── Advanced metadata (owner / review cycle / linked workflows + policies)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ownerUserId, setOwnerUserId] = useState<string>(initial?.owner_user_id || '');
  const [reviewCycleDays, setReviewCycleDays] = useState<string>(String(initial?.review_cycle_days ?? 90));
  const [linkedWorkflowIds, setLinkedWorkflowIds] = useState<string[]>(
    Array.isArray(initial?.linked_workflow_ids) ? initial.linked_workflow_ids : [],
  );
  const [linkedApprovalPolicyIds, setLinkedApprovalPolicyIds] = useState<string[]>(
    Array.isArray(initial?.linked_approval_policy_ids) ? initial.linked_approval_policy_ids : [],
  );
  const { data: membersData } = useApi(() => iamApi.members(), [], []);
  const { data: workflowsData } = useApi(() => workflowsApi.list(), [], []);
  const { data: policiesData } = useApi(() => knowledgeApi.listPolicies(), [], []);
  const members   = Array.isArray(membersData)   ? membersData   : [];
  const workflows = Array.isArray(workflowsData) ? workflowsData : [];
  const policies  = Array.isArray(policiesData)  ? policiesData  : [];
  function toggleId(arr: string[], setArr: (s: string[]) => void, id: string) {
    setArr(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  }

  // Import a PDF / Markdown / text file and stuff its text into the body.
  async function handleImport(file: File) {
    setImporting(true);
    try {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      let extracted = '';
      if (file.type === 'application/pdf' || ext === 'pdf') {
        const pdfjs: any = await import('pdfjs-dist/build/pdf.mjs');
        const data = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data, disableWorker: true }).promise;
        const pages: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const text = await page.getTextContent();
          const pageText = (text.items as Array<{ str?: string }>)
            .map(it => it.str ?? '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (pageText) pages.push(pageText);
        }
        extracted = pages.join('\n\n').trim();
      } else {
        extracted = (await file.text()).trim();
      }
      if (!extracted) {
        onAction('No se ha podido extraer texto del archivo', 'error');
        return;
      }
      // Append (or replace if body is empty) and use filename as title fallback.
      setContent(prev => prev ? `${prev}\n\n---\n\n${extracted}` : extracted);
      if (!title.trim()) {
        const stem = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
        if (stem) setTitle(stem.replace(/\b\w/g, c => c.toUpperCase()));
      }
      // POLICY heuristic from legacy: filename or first heading hints.
      if (/policy|pol[ií]tica/i.test(file.name) || /^#{1,3}\s+(policy|pol[ií]tica)/i.test(extracted)) {
        setType('POLICY');
      }
      onAction(`Importado: ${file.name} (${extracted.length.toLocaleString('es-ES')} caracteres)`);
    } catch (err: any) {
      onAction(err?.message || 'No se pudo importar el archivo', 'error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function save(publish = false) {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const payload: Record<string, any> = {
        title: title.trim(),
        content: content,
        description: description.trim() || null,
        type: type.toLowerCase(),
        visibility,
        language,
        // Fin
        fin_service: finService,
        fin_sales: finSales,
        copilot_enabled: copilotEnabled,
        fin_audience: finAudience,
        // Help center
        helpcenter_status: hcStatus,
        helpcenter_collection_id: hcCollectionId || null,
        helpcenter_audience: hcAudience,
        // Suggestions / tags
        excluded_from_suggestions: excludedFromSuggestions,
        tags,
      };
      if (domainId) payload.domain_id = domainId;
      if (authorUserId) payload.author_user_id = authorUserId;
      if (ownerUserId) payload.owner_user_id = ownerUserId;
      const cycleNum = Number(reviewCycleDays);
      if (Number.isFinite(cycleNum) && cycleNum > 0) payload.review_cycle_days = cycleNum;
      if (linkedWorkflowIds.length > 0) payload.linked_workflow_ids = linkedWorkflowIds;
      if (linkedApprovalPolicyIds.length > 0) payload.linked_approval_policy_ids = linkedApprovalPolicyIds;
      const structured = buildContentStructured();
      if (structured) payload.content_structured = structured;
      let id = articleId;
      if (id) {
        await knowledgeApi.updateArticle(id, payload);
      } else {
        const created = await knowledgeApi.createArticle(payload);
        id = created?.id;
      }
      if (publish && id) {
        await knowledgeApi.publishArticle(id);
        onAction('Artículo publicado');
      } else {
        onAction(articleId ? 'Artículo actualizado' : 'Borrador guardado');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo guardar', 'error');
    } finally { setBusy(false); }
  }

  // Author lookup for the Datos avatar.
  const authorMember = members.find((m: any) => String(m.id || m.user_id) === String(authorUserId));
  const authorName = authorMember?.name || authorMember?.full_name || authorMember?.email || 'Sin asignar';
  const authorInitial = (authorName[0] || '?').toUpperCase();

  return (
    // Slide-from-right drawer: takes ~70% of the viewport so the LeftNav,
    // Knowledge sidebar, and a slice of the underlying view remain visible
    // and live on the left — matches the Intercom screenshot exactly.
    // Backdrop is transparent (no dimming) and click-outside dismisses.
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className={`absolute top-0 bottom-0 right-0 bg-white border-l border-[#e9eae6] shadow-[-12px_0_36px_rgba(20,20,20,0.14)] flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${
          isFullscreen
            ? 'w-full max-w-none border-l-0 rounded-none'
            : 'w-[70%] min-w-[920px] max-w-[1500px] rounded-l-[14px]'
        }`}
        onClick={e => e.stopPropagation()}
      >
      {/* Header */}
      <div className="flex-shrink-0 h-[60px] border-b border-[#e9eae6] flex items-center px-5 gap-4">
        <div className="flex-1 flex items-center gap-2">
          <h2 className="text-[15px] font-bold text-[#1a1a1a]">{typeLabel}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} disabled={busy} className="h-8 px-4 rounded-full bg-[#f8f8f7] text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#ededea] disabled:opacity-50">Cancelar</button>
          <button onClick={() => save(false)} disabled={busy || !title.trim()} className="h-8 px-4 rounded-full bg-[#f8f8f7] border border-[#e9eae6] text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#ededea] disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar como borrador'}</button>
          <button onClick={() => save(true)} disabled={busy || !title.trim()} className="h-8 px-4 rounded-full bg-[#1a1a1a] text-white text-[13px] font-semibold hover:bg-black disabled:bg-[#a4a4a2]">{busy ? '…' : 'Publicar'}</button>
          <span className="w-px h-6 bg-[#e9eae6]" />
          <button
            onClick={() => setIsFullscreen(v => !v)}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            className="w-8 h-8 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]"
          >
            {isFullscreen ? (
              // "compress" icon — four arrows pointing inward
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5">
                <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              // "expand" icon — four arrows pointing outward
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5">
                <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
          <button onClick={() => setInfoPanelOpen(o => !o)} title={infoPanelOpen ? 'Ocultar Información' : 'Mostrar Información'} className="w-8 h-8 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M11 3v10"/></svg>
          </button>
          <button onClick={onClose} title="Cerrar (Esc)" className="w-8 h-8 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

      {/* Body — center editor + right Información panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Center column */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="max-w-[760px] mx-auto w-full px-12 pt-12 pb-24 flex flex-col gap-4">
              <input
                ref={titleInputRef}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={visibility === 'internal' ? 'Artículo interno sin título' : 'Artículo público sin título'}
                className="w-full text-[32px] font-bold text-[#1a1a1a] tracking-[-0.4px] leading-[40px] placeholder:text-[#a4a4a2] focus:outline-none bg-transparent"
              />
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe tu artículo para que sea más fácil que lo encuentren"
                className="w-full text-[15px] text-[#646462] leading-[22px] placeholder:text-[#a4a4a2] focus:outline-none bg-transparent"
              />
              <textarea
                ref={bodyRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                onKeyDown={e => {
                  // Markdown power-shortcuts that work like Notion/Slack.
                  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
                    const k = e.key.toLowerCase();
                    if (k === 'b') { e.preventDefault(); wrapSelection('**'); return; }
                    if (k === 'i') { e.preventDefault(); wrapSelection('*'); return; }
                    if (k === 'k') { e.preventDefault(); insertLink(); return; }
                  }
                }}
                placeholder="Start writing..."
                className="w-full min-h-[400px] text-[15px] text-[#1a1a1a] leading-[24px] placeholder:text-[#a4a4a2] focus:outline-none bg-transparent resize-none border-none p-0"
              />
            </div>
          </div>
          {/* Bottom toolbar — every button is wired to a real action.
              Image / Attachment upload through attachmentsApi, Link / Video
              prompt for URL, AI sparkle calls aiApi.copilot, Table inserts a
              real markdown table, Quote / List / Code / Lists insert at the
              cursor (not the end). Cmd/Ctrl+B/I/K work as power-shortcuts. */}
          <div className="flex-shrink-0 border-t border-[#e9eae6] bg-white px-5 py-2 flex items-center gap-1">
            <button onClick={() => imageInputRef.current?.click()} title="Insertar imagen" className="w-9 h-9 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.4"><rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="7" r="1"/><path d="M2 11l3-3 3 3 3-3 3 3"/></svg>
            </button>
            <button onClick={insertVideo} title="Insertar vídeo (URL)" className="w-9 h-9 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.4"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M7 6l3 2-3 2z" fill="currentColor"/></svg>
            </button>
            <button onClick={insertTable} title="Tabla 3×3" className="w-9 h-9 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.4"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 7h12M6 3v10M10 3v10"/></svg>
            </button>
            <button onClick={insertParagraphBreak} title="Salto de párrafo" className="w-9 h-9 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.4"><path d="M3 4h10M3 8h6M3 12h10"/></svg>
            </button>
            <button onClick={insertAiSuggestion} title="Sugerir con IA (basado en el título)" className="w-9 h-9 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><path d="M8 1.5l1.4 3.6 3.6 1.4-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4z"/></svg>
            </button>
            <button onClick={insertQuote} title="Cita" className="w-9 h-9 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.4"><path d="M3 4v8M5 4h7M5 8h5M5 12h7"/></svg>
            </button>
            <button onClick={insertCodeBlock} title="Bloque de código" className="w-9 h-9 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.4"><path d="M5 5L2 8l3 3M11 5l3 3-3 3"/></svg>
            </button>
            <button onClick={() => insertList(false)} title="Lista" className="w-9 h-9 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.4"><circle cx="3" cy="4" r="0.8" fill="currentColor"/><circle cx="3" cy="8" r="0.8" fill="currentColor"/><circle cx="3" cy="12" r="0.8" fill="currentColor"/><path d="M6 4h8M6 8h8M6 12h8"/></svg>
            </button>
            <button onClick={() => insertList(true)} title="Lista numerada" className="w-9 h-9 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.4"><path d="M2 3v3M2 9v3M6 4h8M6 8h8M6 12h8"/></svg>
            </button>
            <button onClick={insertLink} title="Insertar vínculo (Cmd/Ctrl+K)" className="w-9 h-9 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.4"><path d="M6 10l4-4M5 8l-1 1a2.5 2.5 0 003.5 3.5L9 11M11 8l1-1a2.5 2.5 0 00-3.5-3.5L7 5"/></svg>
            </button>
            <button onClick={() => fileInputRef.current?.click()} title="Adjuntar archivo" disabled={importing} className="w-9 h-9 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462] disabled:opacity-50">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.4"><path d="M11.5 4.5l-6 6a2.5 2.5 0 003.5 3.5l6-6a4 4 0 00-5.7-5.7L3 8"/></svg>
            </button>
            {/* Hidden file inputs — image (insert via attachmentsApi.upload),
                attachment (insert as link), and the legacy importer kept for
                "Importar PDF / Markdown" via the Avanzado section. */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); }}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                // PDF / markdown / txt → import as body content; anything
                // else → upload + insert as a download link.
                const ext = (f.name.split('.').pop() || '').toLowerCase();
                if (['pdf', 'md', 'markdown', 'txt'].includes(ext) || /pdf|markdown|plain/.test(f.type)) {
                  handleImport(f);
                } else {
                  uploadAttachment(f);
                }
              }}
            />
          </div>
        </div>

        {/* Right Información panel */}
        {infoPanelOpen ? (
          <aside className="w-[360px] flex-shrink-0 border-l border-[#e9eae6] bg-white flex flex-col overflow-hidden">
            <div className="flex-shrink-0 h-[60px] px-5 flex items-center justify-between border-b border-[#e9eae6]">
              <h3 className="text-[15px] font-bold text-[#1a1a1a]">Información</h3>
              <button onClick={() => setInfoPanelOpen(false)} title="Ocultar panel" className="w-7 h-7 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M11 3v10"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* DATOS */}
              <ArticleEditorSection title="Datos" icon={<svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M5 4l-3 4 3 4M11 4l3 4-3 4" strokeLinecap="round"/></svg>}>
                <dl className="text-[13px] grid grid-cols-[110px_1fr] gap-y-2 items-center">
                  <dt className="text-[#646462]">Tipo</dt>
                  <dd>
                    <select value={type} onChange={e => setType(e.target.value)} className="w-full h-7 px-2 rounded-md border border-[#e9eae6] bg-white text-[12.5px]">
                      {KH_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </dd>
                  <dt className="text-[#646462]">Visibilidad</dt>
                  <dd>
                    <select value={visibility} onChange={e => setVisibility(e.target.value as 'public' | 'internal')} className="w-full h-7 px-2 rounded-md border border-[#e9eae6] bg-white text-[12.5px]">
                      <option value="public">Público</option>
                      <option value="internal">Interno</option>
                    </select>
                  </dd>
                  <dt className="text-[#646462]">Estado</dt>
                  <dd className="inline-flex items-center"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${articleStatus === 'published' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#f3f3f1] text-[#646462]'}`}>{articleStatus === 'published' ? 'Publicado' : 'Borrador'}</span></dd>
                  {articleId && (<>
                    <dt className="text-[#646462]">ID del artículo</dt>
                    <dd className="font-mono text-[12px] text-[#1a1a1a] truncate" title={articleId}>{articleId}</dd>
                  </>)}
                  <dt className="text-[#646462]">Idioma</dt>
                  <dd>
                    <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full h-7 px-2 rounded-md border border-[#e9eae6] bg-white text-[12.5px]">
                      <option value="en">English</option>
                      <option value="es">Español</option>
                      <option value="fr">Français</option>
                      <option value="de">Deutsch</option>
                      <option value="pt">Português</option>
                      <option value="it">Italiano</option>
                    </select>
                  </dd>
                  {createdAt && (<>
                    <dt className="text-[#646462]">Creado</dt>
                    <dd className="text-[12.5px] text-[#1a1a1a]">{relativeTime(createdAt)}</dd>
                  </>)}
                  {updatedAt && (<>
                    <dt className="text-[#646462]">Última actualización</dt>
                    <dd className="text-[12.5px] text-[#1a1a1a]">{relativeTime(updatedAt)}</dd>
                  </>)}
                  <dt className="text-[#646462]">Escrito por</dt>
                  <dd>
                    <select value={authorUserId} onChange={e => setAuthorUserId(e.target.value)} className="w-full h-7 px-2 rounded-md border border-[#e9eae6] bg-white text-[12.5px]">
                      <option value="">Sin asignar</option>
                      {members.map((m: any) => (
                        <option key={m.id || m.user_id || m.email} value={m.id || m.user_id || ''}>{m.name || m.full_name || m.email || 'Sin nombre'}</option>
                      ))}
                    </select>
                  </dd>
                </dl>
                {authorUserId && (
                  <div className="mt-3 flex items-center gap-2 text-[12px] text-[#646462]">
                    <span className="w-5 h-5 rounded-full bg-[#f1c5a8] flex items-center justify-center text-[10px] font-bold text-[#1a1a1a]">{authorInitial}</span>
                    <span className="truncate">{authorName}</span>
                  </div>
                )}
                {articleId && initial?.version != null && (
                  <button className="mt-3 text-[12.5px] font-semibold text-[#1a1a1a] hover:underline">Mostrar historial de versiones (v{initial.version})</button>
                )}
              </ArticleEditorSection>

              {/* FIN */}
              <ArticleEditorSection title="Fin" icon={<svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a1a1a]"><path d="M8 2l1.4 4.6L14 8l-4.6 1.4L8 14l-1.4-4.6L2 8l4.6-1.4z"/></svg>}>
                <p className="text-[12.5px] text-[#646462] mb-3">Cuando esté habilitado, Fin usará este contenido para generar respuestas de IA.</p>
                {([
                  { label: 'Servicio', val: finService,    set: setFinService    },
                  { label: 'Ventas',   val: finSales,      set: setFinSales      },
                  { label: 'Copilot',  val: copilotEnabled,set: setCopilotEnabled},
                ] as const).map(row => (
                  <div key={row.label} className="flex items-center justify-between py-1.5">
                    <span className="text-[13px] text-[#1a1a1a]">{row.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-[#646462]">{row.val ? 'Habilitado' : 'Deshabilitado'}</span>
                      <button onClick={() => row.set(!row.val)} className={`relative w-9 h-5 rounded-full transition-colors ${row.val ? 'bg-[#1a1a1a]' : 'bg-[#d4d4d2]'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${row.val ? 'left-[18px]' : 'left-0.5'}`} />
                      </button>
                    </div>
                  </div>
                ))}
                <p className="mt-4 text-[12.5px] font-semibold text-[#1a1a1a] mb-1.5">Audiencia de Fin</p>
                <p className="text-[11.5px] text-[#646462] mb-2">Fin AI Agent y Copilot solo utilizarán este artículo para responder preguntas de las audiencias seleccionadas.</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['users', 'leads', 'visitors'] as const).map(t => {
                    const active = finAudience.includes(t);
                    return (
                      <button key={t} onClick={() => toggleAudience(setFinAudience, finAudience, t)} className={`h-7 px-3 rounded-full text-[12px] font-semibold border ${active ? 'bg-[#1a1a1a] border-[#1a1a1a] text-white' : 'bg-white border-[#e9eae6] text-[#1a1a1a] hover:bg-[#f8f8f7]'}`}>
                        {t === 'users' ? 'Users' : t === 'leads' ? 'Leads' : 'Visitors'}
                      </button>
                    );
                  })}
                </div>
              </ArticleEditorSection>

              {/* CENTRO DE AYUDA */}
              <ArticleEditorSection title="Centro de ayuda" icon={<svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M2.5 3.2v9.6c1.7-.6 3.4-.6 5.5 0 2.1-.6 3.8-.6 5.5 0V3.2c-1.7-.6-3.4-.6-5.5 0C5.9 2.6 4.2 2.6 2.5 3.2z"/></svg>}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] text-[#1a1a1a]">Estado</span>
                  <select value={hcStatus} onChange={e => setHcStatus(e.target.value as 'draft' | 'published')} className="h-7 px-2 rounded-md border border-[#e9eae6] bg-white text-[12.5px]">
                    <option value="draft">No establecer en vivo</option>
                    <option value="published">En vivo</option>
                  </select>
                </div>
                <p className="text-[12.5px] text-[#646462] mb-2">Agregue su artículo a una colección en su Centro de ayuda para que los clientes puedan encontrarlo.</p>
                <select value={hcCollectionId} onChange={e => setHcCollectionId(e.target.value)} className="w-full h-8 px-2 rounded-md border border-[#e9eae6] bg-white text-[12.5px] mb-3">
                  <option value="">Seleccionar colección...</option>
                  {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <p className="text-[12.5px] font-semibold text-[#1a1a1a] mb-1.5">Audiencia del Centro de ayuda</p>
                <p className="text-[11.5px] text-[#646462] mb-2">Controle quién puede encontrar y consultar este artículo en el Centro de ayuda.</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['users', 'leads', 'visitors'] as const).map(t => {
                    const active = hcAudience.includes(t);
                    return (
                      <button key={t} onClick={() => toggleAudience(setHcAudience, hcAudience, t)} className={`h-7 px-3 rounded-full text-[12px] font-semibold border ${active ? 'bg-[#1a1a1a] border-[#1a1a1a] text-white' : 'bg-white border-[#e9eae6] text-[#1a1a1a] hover:bg-[#f8f8f7]'}`}>
                        {t === 'users' ? 'Users' : t === 'leads' ? 'Leads' : 'Visitors'}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-[#646462]">Audiencia activa: {audienceLabel(hcAudience)}.</p>
              </ArticleEditorSection>

              {/* SUGERENCIAS */}
              <ArticleEditorSection title="Sugerencias de artículos" icon={<svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.5M8 11v.01" strokeLinecap="round"/></svg>} defaultOpen={false}>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#1a1a1a]">Excluir de las sugerencias de artículos</span>
                  <button onClick={() => setExcludedFromSuggestions(v => !v)} className={`relative w-9 h-5 rounded-full transition-colors ${excludedFromSuggestions ? 'bg-[#1a1a1a]' : 'bg-[#d4d4d2]'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${excludedFromSuggestions ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </div>
              </ArticleEditorSection>

              {/* INFORMES */}
              <ArticleEditorSection title="Informes" icon={<svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7" strokeLinecap="round"/></svg>} defaultOpen={false}>
                <dl className="text-[13px] grid grid-cols-[1fr_auto] gap-y-2 items-center">
                  <dt className="text-[#646462]">Vistas</dt>
                  <dd className="text-[#1a1a1a] font-mono">{viewCount || '-'}</dd>
                  <dt className="text-[#646462]">Conversaciones</dt>
                  <dd className="text-[#1a1a1a] font-mono">{conversationCount || '-'}</dd>
                  <dt className="text-[#646462]">Reaccionó</dt>
                  <dd className="text-[12.5px] flex items-center gap-2">
                    <span title="Feliz">😀 {reactionPct(reactionsObj.happy)}%</span>
                    <span title="Neutral">😐 {reactionPct(reactionsObj.neutral)}%</span>
                    <span title="Triste">😞 {reactionPct(reactionsObj.sad)}%</span>
                  </dd>
                  <dt className="text-[#646462]">Resoluciones de Fin</dt>
                  <dd className="text-[#1a1a1a] font-mono">{finResolutions ?? '-'}</dd>
                  <dt className="text-[#646462]">Participaciones de Fin</dt>
                  <dd className="text-[#1a1a1a] font-mono">{finParticipations ?? '-'}</dd>
                </dl>
              </ArticleEditorSection>

              {/* ETIQUETAS */}
              <ArticleEditorSection title="Etiquetas" icon={<svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M3 3l5 0L14 9l-5 5-6-6z"/><circle cx="6" cy="6" r="1"/></svg>} defaultOpen={false}>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.length === 0 && <span className="text-[12.5px] text-[#646462] italic">Sin etiquetas todavía.</span>}
                  {tags.map(t => (
                    <span key={t} className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[#f3f3f1] border border-[#e9eae6] text-[11.5px] text-[#1a1a1a]">
                      {t}
                      <button onClick={() => removeTag(t)} className="text-[#646462] hover:text-[#1a1a1a]">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={tagDraft}
                    onChange={e => setTagDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    placeholder="Añadir etiqueta…"
                    className="flex-1 h-7 px-2 rounded-md border border-[#e9eae6] text-[12.5px] focus:outline-none focus:border-[#1a1a1a]"
                  />
                  <button onClick={addTag} disabled={!tagDraft.trim()} className="h-7 px-2 rounded-md bg-[#f8f8f7] border border-[#e9eae6] text-[12px] font-semibold text-[#1a1a1a] disabled:opacity-50">+</button>
                </div>
              </ArticleEditorSection>

              {/* CARPETA */}
              <ArticleEditorSection title="Carpeta" icon={<svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M2 5a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5z"/></svg>} defaultOpen={false}>
                <select value={domainId} onChange={e => setDomainId(e.target.value)} className="w-full h-8 px-2 rounded-md border border-[#e9eae6] bg-white text-[12.5px]">
                  <option value="">Sin carpeta</option>
                  {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </ArticleEditorSection>

              {/* ESTRUCTURA PARA LA IA */}
              <ArticleEditorSection title="Estructura para la IA" icon={<svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M3 3h10v10H3zM3 6h10M6 3v10"/></svg>} defaultOpen={false}>
                <p className="text-[11.5px] text-[#646462] mb-2">Campos que el agente lee directamente. Una entrada por línea en cada lista.</p>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#646462] mb-1">Resumen ejecutivo</label>
                    <textarea value={sheetSummary} onChange={e => setSheetSummary(e.target.value)} className="w-full min-h-[44px] rounded-md border border-[#e9eae6] px-2 py-1 text-[12px] resize-none focus:outline-none focus:border-[#1a1a1a]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#646462] mb-1">Política / regla principal</label>
                    <textarea value={sheetPolicy} onChange={e => setSheetPolicy(e.target.value)} className="w-full min-h-[44px] rounded-md border border-[#e9eae6] px-2 py-1 text-[12px] resize-none focus:outline-none focus:border-[#1a1a1a]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#646462] mb-1">Permitido</label>
                    <textarea value={sheetAllowed} onChange={e => setSheetAllowed(e.target.value)} className="w-full min-h-[44px] rounded-md border border-[#e9eae6] px-2 py-1 text-[12px] resize-none focus:outline-none focus:border-[#1a1a1a]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#646462] mb-1">Bloqueado</label>
                    <textarea value={sheetBlocked} onChange={e => setSheetBlocked(e.target.value)} className="w-full min-h-[44px] rounded-md border border-[#e9eae6] px-2 py-1 text-[12px] resize-none focus:outline-none focus:border-[#1a1a1a]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#646462] mb-1">Escalación</label>
                    <textarea value={sheetEscalation} onChange={e => setSheetEscalation(e.target.value)} className="w-full min-h-[44px] rounded-md border border-[#e9eae6] px-2 py-1 text-[12px] resize-none focus:outline-none focus:border-[#1a1a1a]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#646462] mb-1">Evidencia / fuentes</label>
                    <textarea value={sheetEvidence} onChange={e => setSheetEvidence(e.target.value)} className="w-full min-h-[44px] rounded-md border border-[#e9eae6] px-2 py-1 text-[12px] resize-none focus:outline-none focus:border-[#1a1a1a]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#646462] mb-1">Notas para el agente</label>
                    <textarea value={sheetAgentNotes} onChange={e => setSheetAgentNotes(e.target.value)} className="w-full min-h-[44px] rounded-md border border-[#e9eae6] px-2 py-1 text-[12px] resize-none focus:outline-none focus:border-[#1a1a1a]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#646462] mb-1">Ejemplos de pregunta</label>
                    <textarea value={sheetExamples} onChange={e => setSheetExamples(e.target.value)} className="w-full min-h-[44px] rounded-md border border-[#e9eae6] px-2 py-1 text-[12px] resize-none focus:outline-none focus:border-[#1a1a1a]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#646462] mb-1">Palabras clave</label>
                    <textarea value={sheetKeywords} onChange={e => setSheetKeywords(e.target.value.replace(/,/g,'\n'))} className="w-full min-h-[44px] rounded-md border border-[#e9eae6] px-2 py-1 text-[12px] resize-none focus:outline-none focus:border-[#1a1a1a]" />
                  </div>
                </div>
              </ArticleEditorSection>

              {/* AVANZADO */}
              <ArticleEditorSection title="Avanzado" icon={<svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2"/></svg>} defaultOpen={false}>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#646462] mb-1">Propietario</label>
                    <select value={ownerUserId} onChange={e => setOwnerUserId(e.target.value)} className="w-full h-7 rounded-md border border-[#e9eae6] px-2 text-[12px] focus:outline-none focus:border-[#1a1a1a]">
                      <option value="">Sin asignar</option>
                      {members.map((m: any) => (
                        <option key={m.id || m.user_id || m.email} value={m.id || m.user_id || ''}>{m.name || m.full_name || m.email || 'Sin nombre'}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#646462] mb-1">Ciclo de revisión (días)</label>
                    <input type="number" min={7} max={365} step={7} value={reviewCycleDays} onChange={e => setReviewCycleDays(e.target.value)} className="w-full h-7 rounded-md border border-[#e9eae6] px-2 text-[12px] focus:outline-none focus:border-[#1a1a1a]" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#646462] mb-1">Workflows vinculados ({linkedWorkflowIds.length})</label>
                    <div className="border border-[#e9eae6] rounded-md p-2 max-h-[120px] overflow-y-auto">
                      {workflows.length === 0 && <p className="text-[11.5px] text-[#646462] italic">Sin workflows.</p>}
                      {workflows.map((w: any) => (
                        <label key={w.id} className="flex items-center gap-2 py-0.5 hover:bg-[#f8f8f7] rounded cursor-pointer">
                          <input type="checkbox" checked={linkedWorkflowIds.includes(w.id)} onChange={() => toggleId(linkedWorkflowIds, setLinkedWorkflowIds, w.id)} className="w-3.5 h-3.5 accent-[#1a1a1a]" />
                          <span className="text-[12px] text-[#1a1a1a] truncate flex-1">{w.name || w.id}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#646462] mb-1">Políticas vinculadas ({linkedApprovalPolicyIds.length})</label>
                    <div className="border border-[#e9eae6] rounded-md p-2 max-h-[120px] overflow-y-auto">
                      {policies.length === 0 && <p className="text-[11.5px] text-[#646462] italic">Sin políticas.</p>}
                      {policies.map((p: any) => (
                        <label key={p.id} className="flex items-center gap-2 py-0.5 hover:bg-[#f8f8f7] rounded cursor-pointer">
                          <input type="checkbox" checked={linkedApprovalPolicyIds.includes(p.id)} onChange={() => toggleId(linkedApprovalPolicyIds, setLinkedApprovalPolicyIds, p.id)} className="w-3.5 h-3.5 accent-[#1a1a1a]" />
                          <span className="text-[12px] text-[#1a1a1a] truncate flex-1">{p.title || p.name || p.id}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </ArticleEditorSection>
            </div>
          </aside>
        ) : (
          <button onClick={() => setInfoPanelOpen(true)} title="Mostrar Información" className="w-9 flex-shrink-0 border-l border-[#e9eae6] bg-white hover:bg-[#f8f8f7] flex items-start justify-center pt-4 text-[#646462]">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.4"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 3v10"/></svg>
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KnowledgeWebsiteSyncWizard — 4-step drawer wizard for the
// "Sincronización de sitio web" card. Persists the sync as a knowledge
// article of type='website' so it shows up in the article list and Fin
// can index it like any other piece of content.
// ─────────────────────────────────────────────────────────────────────────────
export function KnowledgeWebsiteSyncWizard({
  onClose,
  onSaved,
  onAction,
}: {
  onClose: () => void;
  onSaved: () => void;
  onAction: (msg: string, type?: 'success' | 'error') => void;
}) {
  type Step = 'connect' | 'pages' | 'segmentation' | 'review';
  const STEPS: { id: Step; label: string }[] = [
    { id: 'connect',      label: 'Conectar' },
    { id: 'pages',        label: 'Páginas' },
    { id: 'segmentation', label: 'Segmentación' },
    { id: 'review',       label: 'Revisar' },
  ];
  const [step, setStep] = useState<Step>('connect');
  const [url, setUrl] = useState('');
  const [pages, setPages] = useState<Array<{ url: string; selected: boolean }>>([]);
  const [audience, setAudience] = useState<string[]>(['users', 'leads', 'visitors']);
  const [busy, setBusy] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  function isValidUrl(u: string) {
    try {
      const x = new URL(u.trim());
      return x.protocol === 'http:' || x.protocol === 'https:';
    } catch { return false; }
  }

  // Heuristic page discovery — produces a sensible list of common
  // help-center routes anchored on the user's URL so the Páginas step
  // is something they can edit before persisting.
  function discoverPages() {
    if (!isValidUrl(url)) return;
    const base = url.replace(/\/+$/, '');
    const guesses = ['', '/faq', '/getting-started', '/account', '/billing', '/troubleshooting', '/api', '/changelog'];
    setPages(guesses.map(p => ({ url: `${base}${p}`, selected: true })));
  }

  function next() {
    if (step === 'connect') {
      if (!isValidUrl(url)) { onAction('Introduce una URL válida (https://…)', 'error'); return; }
      discoverPages();
      setStep('pages');
    } else if (step === 'pages') setStep('segmentation');
    else if (step === 'segmentation') setStep('review');
    else if (step === 'review') void persist();
  }
  function back() {
    if (step === 'pages') setStep('connect');
    else if (step === 'segmentation') setStep('pages');
    else if (step === 'review') setStep('segmentation');
  }
  function toggleAudience(token: string) {
    setAudience(prev => {
      const next = prev.includes(token) ? prev.filter(t => t !== token) : [...prev, token];
      return next.length === 0 ? prev : next;
    });
  }
  function togglePage(idx: number) {
    setPages(prev => prev.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p));
  }
  async function persist() {
    if (busy) return;
    const selectedPages = pages.filter(p => p.selected);
    if (selectedPages.length === 0) {
      onAction('Selecciona al menos una página para sincronizar', 'error');
      return;
    }
    setBusy(true);
    try {
      const lines = ['# Sincronización de sitio web', '', `Origen: ${url}`, '', '## Páginas sincronizadas'];
      for (const p of selectedPages) lines.push(`- ${p.url}`);
      await knowledgeApi.createArticle({
        title: `Sincronización: ${url.replace(/^https?:\/\//, '')}`,
        content: lines.join('\n'),
        description: `Sitio web sincronizado con ${selectedPages.length} página${selectedPages.length === 1 ? '' : 's'}.`,
        type: 'website',
        visibility: 'public',
        helpcenter_status: 'draft',
        helpcenter_audience: audience,
        fin_audience: audience,
        copilot_enabled: true,
        fin_service: true,
        tags: ['website-sync'],
      });
      onAction(`Sincronizado: ${url}`);
      onSaved();
      onClose();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo crear la sincronización', 'error');
    } finally { setBusy(false); }
  }

  // Esc closes when not typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      const inEditable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (!inEditable) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stepIdx = STEPS.findIndex(s => s.id === step);

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className={`absolute top-0 bottom-0 right-0 bg-white border-l border-[#e9eae6] shadow-[-12px_0_36px_rgba(20,20,20,0.14)] flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${
          isFullscreen ? 'w-full max-w-none border-l-0 rounded-none' : 'w-[70%] min-w-[920px] max-w-[1500px] rounded-l-[14px]'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 h-[60px] border-b border-[#e9eae6] flex items-center px-5 gap-4">
          <h2 className="flex-1 text-[15px] font-bold text-[#1a1a1a]">Sincronizar sitio web</h2>
          <a href="#" className="inline-flex items-center gap-1.5 text-[13px] text-[#1a1a1a] hover:underline">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><path d="M2.5 3.2v9.6c1.7-.6 3.4-.6 5.5 0 2.1-.6 3.8-.6 5.5 0V3.2c-1.7-.6-3.4-.6-5.5 0C5.9 2.6 4.2 2.6 2.5 3.2z"/><path d="M8 3.2v9.6"/></svg>
            <span>Más información</span>
          </a>
          <button onClick={() => setIsFullscreen(v => !v)} title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} className="w-8 h-8 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5">
              {isFullscreen
                ? <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" strokeLinecap="round" strokeLinejoin="round"/>
                : <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" strokeLinecap="round" strokeLinejoin="round"/>}
            </svg>
          </button>
          <button onClick={onClose} title="Cerrar (Esc)" className="w-8 h-8 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 border-b border-[#e9eae6] flex items-center px-6 gap-6">
          {STEPS.map((s, idx) => {
            const active = s.id === step;
            const reached = idx <= stepIdx;
            return (
              <button
                key={s.id}
                onClick={() => reached && setStep(s.id)}
                disabled={!reached}
                className={`relative h-[44px] text-[13.5px] ${active ? 'text-[#1a1a1a] font-semibold' : reached ? 'text-[#1a1a1a] hover:text-black' : 'text-[#a4a4a2]'}`}
              >
                {s.label}
                {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#1a1a1a] rounded-full"/>}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {step === 'connect' && (
            <div className="max-w-[620px] mx-auto px-8 py-10 flex flex-col gap-6">
              <div className="rounded-[12px] overflow-hidden bg-gradient-to-br from-[#f9d6e0] via-[#f3e0d6] to-[#e6d4c4] aspect-[16/8] relative p-6 flex items-center justify-center">
                <div className="w-full max-w-[420px] flex flex-col gap-2">
                  <div className="bg-white rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#1a1a1a]" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12"/></svg>
                    <span className="text-[12px] font-mono text-[#1a1a1a]">app.com/help</span>
                  </div>
                  {['/faq', '/account', '/billing'].map(p => (
                    <div key={p} className="ml-8 bg-white/80 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm">
                      <span className="text-[#646462]">↳</span>
                      <span className="text-[12px] font-mono text-[#1a1a1a]">app.com/help{p}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Enlace al sitio web principal</h3>
                <p className="text-[12.5px] text-[#646462] leading-[18px] mb-3">
                  La URL de nivel superior de tu Centro de ayuda o de tu documentación. Se sincronizarán esta página y todas las subpáginas. <a href="#" className="underline">Ver consejos.</a>
                </p>
                <div className="h-10 rounded-lg border border-[#e9eae6] bg-white flex items-center px-3 gap-2 focus-within:border-[#1a1a1a]">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12"/></svg>
                  <input
                    autoFocus
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && isValidUrl(url)) next(); }}
                    placeholder="https://app.com/help"
                    className="flex-1 bg-transparent outline-none text-[13px] text-[#1a1a1a] placeholder:text-[#a4a4a2]"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 'pages' && (
            <div className="max-w-[720px] mx-auto px-8 py-10">
              <h3 className="text-[16px] font-semibold text-[#1a1a1a]">Páginas detectadas</h3>
              <p className="text-[12.5px] text-[#646462] leading-[18px] mt-1 mb-4">
                {pages.length} páginas serán sincronizadas. Desmarca las que no quieras importar.
              </p>
              <div className="bg-white border border-[#e9eae6] rounded-[10px] overflow-hidden">
                {pages.map((p, idx) => (
                  <label key={p.url} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[#fafafa] ${idx > 0 ? 'border-t border-[#f1f1ee]' : ''}`}>
                    <input type="checkbox" checked={p.selected} onChange={() => togglePage(idx)} className="w-4 h-4 accent-[#1a1a1a]"/>
                    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462] flex-shrink-0" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12"/></svg>
                    <span className="text-[13px] font-mono text-[#1a1a1a] truncate">{p.url}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 'segmentation' && (
            <div className="max-w-[620px] mx-auto px-8 py-10">
              <h3 className="text-[16px] font-semibold text-[#1a1a1a]">¿A quién sirve este contenido?</h3>
              <p className="text-[12.5px] text-[#646462] leading-[18px] mt-1 mb-4">
                Fin AI Agent y el Centro de ayuda usarán este sitio web para responder a las audiencias seleccionadas.
              </p>
              <div className="flex flex-wrap gap-2">
                {(['users', 'leads', 'visitors'] as const).map(t => {
                  const active = audience.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggleAudience(t)}
                      className={`h-9 px-4 rounded-full text-[13px] font-semibold border ${active ? 'bg-[#1a1a1a] border-[#1a1a1a] text-white' : 'bg-white border-[#e9eae6] text-[#1a1a1a] hover:bg-[#f8f8f7]'}`}
                    >
                      {t === 'users' ? 'Usuarios' : t === 'leads' ? 'Leads' : 'Visitantes'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="max-w-[620px] mx-auto px-8 py-10">
              <h3 className="text-[16px] font-semibold text-[#1a1a1a]">Revisar y sincronizar</h3>
              <p className="text-[12.5px] text-[#646462] leading-[18px] mt-1 mb-4">Comprueba la configuración antes de iniciar la sincronización.</p>
              <dl className="bg-white border border-[#e9eae6] rounded-[10px] divide-y divide-[#f1f1ee] text-[13px]">
                <div className="flex items-start justify-between px-4 py-3 gap-4">
                  <dt className="text-[#646462]">URL principal</dt>
                  <dd className="text-[#1a1a1a] font-mono truncate">{url}</dd>
                </div>
                <div className="flex items-start justify-between px-4 py-3 gap-4">
                  <dt className="text-[#646462]">Páginas a sincronizar</dt>
                  <dd className="text-[#1a1a1a] font-mono">{pages.filter(p => p.selected).length} de {pages.length}</dd>
                </div>
                <div className="flex items-start justify-between px-4 py-3 gap-4">
                  <dt className="text-[#646462]">Audiencia</dt>
                  <dd className="text-[#1a1a1a]">{audience.length === 3 ? 'Users, Leads, Visitors' : audience.join(', ')}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[#e9eae6] flex items-center justify-between px-6 h-[60px]">
          <button
            onClick={back}
            disabled={step === 'connect' || busy}
            className="h-8 px-4 rounded-full bg-[#f8f8f7] text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#ededea] disabled:opacity-40"
          >Atrás</button>
          <button
            onClick={next}
            disabled={busy || (step === 'connect' && !isValidUrl(url))}
            className="h-8 px-5 rounded-full bg-[#1a1a1a] text-white text-[13px] font-semibold hover:bg-black disabled:bg-[#a4a4a2]"
          >
            {busy ? 'Sincronizando…' : step === 'review' ? 'Sincronizar' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KnowledgeExternalSourcePicker — small centered modal that lists every
// external source provider Fin can ingest. Picking one routes to the
// /connectors flow with that provider pre-selected.
// ─────────────────────────────────────────────────────────────────────────────
export function KnowledgeExternalSourcePicker({
  onClose,
  onAction,
}: {
  onClose: () => void;
  onAction: (msg: string, type?: 'success' | 'error') => void;
}) {
  type Source = { id: string; label: string; icon: ReactNode; provider: string };
  const sources: Source[] = [
    { id: 'zendesk',     label: 'Desde Zendesk',     provider: 'zendesk',     icon: <span className="text-[14px] font-bold text-[#03363d]">Z</span> },
    { id: 'guru',        label: 'Desde Guru',        provider: 'guru',        icon: <span className="w-4 h-4 rounded-full bg-[#ff595a] flex items-center justify-center text-white text-[10px] font-bold">G</span> },
    { id: 'notion',      label: 'Desde Notion',      provider: 'notion',      icon: <span className="text-[14px] font-bold text-[#1a1a1a]">N</span> },
    { id: 'confluence',  label: 'Desde Confluence',  provider: 'confluence',  icon: <span className="w-4 h-4 rounded-sm bg-[#0052cc] flex items-center justify-center text-white text-[9px] font-bold">C</span> },
    { id: 'document',    label: 'Cargar un documento', provider: 'upload',    icon: <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.4"><path d="M4 2h6l3 3v9H4z"/><path d="M10 2v3h3"/><path d="M8 7v4M6 9l2-2 2 2" strokeLinecap="round"/></svg> },
    { id: 'salesforce',  label: 'Desde Salesforce',  provider: 'salesforce',  icon: <span className="text-[12px] text-[#00a1e0] font-bold">SF</span> },
    { id: 'box',         label: 'De Box',            provider: 'box',         icon: <span className="w-4 h-4 rounded-sm bg-[#0061d5] flex items-center justify-center text-white text-[9px] font-bold">B</span> },
    { id: 'document360', label: 'Document360',       provider: 'document360', icon: <span className="w-4 h-4 rounded-full bg-[#ec1944] flex items-center justify-center text-white text-[9px] font-bold">D</span> },
    { id: 'freshdesk',   label: 'De Freshdesk',      provider: 'freshdesk',   icon: <span className="w-4 h-4 rounded-sm bg-[#25c16f] flex items-center justify-center text-white text-[9px] font-bold">F</span> },
    { id: 'shopify',     label: 'Desde Shopify',     provider: 'shopify',     icon: <span className="w-4 h-4 rounded-sm bg-[#95bf47] flex items-center justify-center text-white text-[9px] font-bold">S</span> },
  ];
  function pick(s: Source) {
    onAction(`Conectando con ${s.label.replace(/^Desde |^De /, '')}…`);
    onClose();
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'connectors');
      url.searchParams.set('provider', s.provider);
      window.location.href = url.toString();
    }
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[760px] max-w-[92vw] max-h-[88vh] rounded-2xl bg-white border border-[#e9eae6] shadow-[0px_24px_60px_rgba(20,20,20,0.28)] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between border-b border-[#e9eae6]">
          <h3 className="text-[15px] font-bold text-[#1a1a1a]">Conecte el contenido de la aplicación externa</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#ed621d]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          <div className="grid grid-cols-3 gap-3">
            {sources.map(s => (
              <button
                key={s.id}
                onClick={() => pick(s)}
                className="h-[52px] bg-white border border-[#e9eae6] rounded-[10px] px-4 flex items-center gap-3 hover:bg-[#f8f8f7]/60 hover:border-[#cfd0cb] transition-colors text-left"
              >
                <span className="w-7 h-7 rounded-md bg-[#f8f8f7] border border-[#e9eae6] flex items-center justify-center flex-shrink-0">
                  {s.icon}
                </span>
                <span className="text-[13px] font-semibold text-[#1a1a1a] truncate">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KnowledgeContentLibrary — drawer modal triggered by the "Ver todo" card.
// Shows every piece of content in the workspace (articles, snippets,
// website-syncs, documents) with type / status filters + search; clicking
// a row opens that record in the article editor without leaving Fin.
// ─────────────────────────────────────────────────────────────────────────────
export function KnowledgeContentLibrary({
  domains,
  onOpenArticle,
  onClose,
  onAction,
}: {
  domains: Array<{ id: string; name: string }>;
  onOpenArticle: (article: any) => void;
  onClose: () => void;
  onAction: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: articlesData, loading } = useApi(() => knowledgeApi.listArticles(), [refreshKey], []);
  const articles: any[] = Array.isArray(articlesData) ? articlesData : [];
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'any' | 'article' | 'snippet' | 'policy' | 'website' | 'document'>('any');
  const [statusFilter, setStatusFilter] = useState<'any' | 'draft' | 'published'>('any');
  const [visibilityFilter, setVisibilityFilter] = useState<'any' | 'public' | 'internal'>('any');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return articles.filter((a: any) => {
      if (typeFilter !== 'any' && String(a.type || '').toLowerCase() !== typeFilter) return false;
      if (statusFilter !== 'any' && String(a.status || '').toLowerCase() !== statusFilter) return false;
      if (visibilityFilter !== 'any' && String(a.visibility || '').toLowerCase() !== visibilityFilter) return false;
      if (!q) return true;
      const hay = [a.title, a.description, a.content, a.id].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [articles, search, typeFilter, statusFilter, visibilityFilter]);

  function typeLabel(t?: string) {
    const v = String(t || '').toLowerCase();
    return v === 'article' ? 'Artículo'
      : v === 'snippet' ? 'Fragmento'
      : v === 'policy' ? 'Política'
      : v === 'website' ? 'Sitio web'
      : v === 'document' ? 'Documento'
      : v === 'playbook' ? 'Playbook'
      : v || 'Artículo';
  }
  function domainName(id?: string) {
    if (!id) return '—';
    return domains.find(d => d.id === id)?.name || id.slice(0, 8);
  }
  async function publishOne(id: string) {
    try {
      await knowledgeApi.publishArticle(id);
      onAction('Artículo publicado');
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      onAction(err?.message || 'No se pudo publicar', 'error');
    }
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      const inEditable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (!inEditable) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className={`absolute top-0 bottom-0 right-0 bg-white border-l border-[#e9eae6] shadow-[-12px_0_36px_rgba(20,20,20,0.14)] flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${
          isFullscreen ? 'w-full max-w-none border-l-0 rounded-none' : 'w-[70%] min-w-[920px] max-w-[1500px] rounded-l-[14px]'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 h-[60px] border-b border-[#e9eae6] flex items-center px-5 gap-4">
          <h2 className="flex-1 text-[15px] font-bold text-[#1a1a1a]">Todo el contenido <span className="text-[#646462] font-normal">· {filtered.length}{filtered.length !== articles.length ? ` de ${articles.length}` : ''}</span></h2>
          <button onClick={() => setIsFullscreen(v => !v)} title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} className="w-8 h-8 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5">
              {isFullscreen
                ? <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" strokeLinecap="round" strokeLinejoin="round"/>
                : <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" strokeLinecap="round" strokeLinejoin="round"/>}
            </svg>
          </button>
          <button onClick={onClose} title="Cerrar (Esc)" className="w-8 h-8 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center text-[#646462]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex-shrink-0 border-b border-[#e9eae6] flex items-center px-5 py-3 gap-2 flex-wrap">
          <div className="flex-1 max-w-[360px] h-8 rounded-[8px] border border-[#e9eae6] bg-white flex items-center px-3 gap-2 focus-within:border-[#1a1a1a]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3" strokeLinecap="round"/></svg>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar en todo el contenido…"
              className="flex-1 bg-transparent outline-none text-[13px] text-[#1a1a1a] placeholder:text-[#a4a4a2]"
            />
            {search && <button onClick={() => setSearch('')} title="Limpiar"><svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>}
          </div>
          <Dropdown
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as any)}
            items={[
              { value: 'any',      label: 'Todos los tipos' },
              { value: 'article',  label: 'Artículos' },
              { value: 'snippet',  label: 'Fragmentos' },
              { value: 'policy',   label: 'Políticas' },
              { value: 'website',  label: 'Sitios web' },
              { value: 'document', label: 'Documentos' },
            ]}
          />
          <Dropdown
            value={visibilityFilter}
            onChange={(v) => setVisibilityFilter(v as any)}
            items={[
              { value: 'any',      label: 'Visibilidad' },
              { value: 'public',   label: 'Público' },
              { value: 'internal', label: 'Interno' },
            ]}
          />
          <Dropdown
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as any)}
            items={[
              { value: 'any',       label: 'Cualquier estado' },
              { value: 'published', label: 'Publicados', icon: <span className="w-2 h-2 rounded-full bg-[#15803d]"/> },
              { value: 'draft',     label: 'Borradores', icon: <span className="w-2 h-2 rounded-full bg-[#a4a4a2]"/> },
            ]}
          />
          {(typeFilter !== 'any' || statusFilter !== 'any' || visibilityFilter !== 'any' || search) && (
            <button
              onClick={() => { setSearch(''); setTypeFilter('any'); setStatusFilter('any'); setVisibilityFilter('any'); }}
              className="h-8 px-2.5 rounded-[8px] text-[12px] text-[#b91c1c] hover:bg-[#fef2f2]"
            >Limpiar filtros</button>
          )}
        </div>

        {/* Body — table */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && articles.length === 0 ? (
            <p className="p-8 text-[13px] text-[#646462]">Cargando contenido…</p>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[13px] text-[#646462]">
              {articles.length === 0 ? 'No hay contenido todavía. Crea un artículo desde "Agregar contenido".' : 'Ningún elemento coincide con los filtros.'}
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-[1fr_120px_120px_120px_140px_100px] items-center gap-3 px-5 py-2.5 border-b border-[#e9eae6] text-[11.5px] uppercase tracking-wide font-semibold text-[#646462] sticky top-0 bg-white">
                <span>Título</span>
                <span>Tipo</span>
                <span>Estado</span>
                <span>Visibilidad</span>
                <span>Carpeta</span>
                <span className="text-right">Acción</span>
              </div>
              {filtered.map((a: any) => {
                const status = String(a.status || 'draft').toLowerCase();
                const visibility = String(a.visibility || 'public').toLowerCase();
                return (
                  <button
                    key={a.id}
                    onClick={() => onOpenArticle(a)}
                    className="w-full text-left grid grid-cols-[1fr_120px_120px_120px_140px_100px] items-center gap-3 px-5 py-3 border-b border-[#f1f1ee] hover:bg-[#fafafa]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-[13.5px] font-semibold text-[#1a1a1a] truncate">{a.title || 'Sin título'}</p>
                        {(a.finService ?? a.fin_service) && (
                          <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#eef2ff] text-[#3b59f6] text-[10px] font-semibold" title="En uso por Fin">Fin</span>
                        )}
                      </div>
                      {a.description && <p className="text-[12px] text-[#646462] truncate">{a.description}</p>}
                    </div>
                    <span className="text-[12.5px] text-[#1a1a1a]">{typeLabel(a.type)}</span>
                    <span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${status === 'published' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#f3f3f1] text-[#646462]'}`}>
                        {status === 'published' ? 'Publicado' : 'Borrador'}
                      </span>
                    </span>
                    <span className="text-[12.5px] text-[#646462]">{visibility === 'internal' ? 'Interno' : 'Público'}</span>
                    <span className="text-[12.5px] text-[#646462] truncate">{domainName(a.domainId ?? a.domain_id)}</span>
                    <div className="flex items-center justify-end gap-2">
                      {status !== 'published' && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); publishOne(a.id); }}
                          className="text-[12px] font-semibold text-[#15803d] hover:underline"
                        >Publicar</span>
                      )}
                      <span className="text-[12px] font-semibold text-[#1a1a1a] hover:underline">Editar</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function KnowledgePlaceholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <h1 className="text-[18px] font-bold text-[#1a1a1a]">{title}</h1>
      </div>
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="text-center max-w-[420px]">
          <p className="text-[18px] font-semibold text-[#1a1a1a] mb-1">{title}</p>
          <p className="text-[13.5px] text-[#646462]">{subtitle}</p>
        </div>
      </div>
    </>
  );
}
