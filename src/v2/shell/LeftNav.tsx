// LeftNav v2 — extracted from prototype, hover-to-expand rail with 6 nav items.
// Connected to the real App's `Page` type (not the prototype's local View type).
import { useState, type ReactNode } from 'react';
import type { Page } from '../../types';

const FIGMA_CDN = 'https://www.figma.com/api/mcp/asset';
const ICON_LOGO     = `${FIGMA_CDN}/210fe23a-321b-4e1f-8a00-dce6a7ba2224`;
const ICON_INBOX    = `${FIGMA_CDN}/570eff6a-8bff-4de1-8840-e6b108abdaef`;
const ICON_FIN      = `${FIGMA_CDN}/39d9a7c0-cb9e-4d44-ab69-82d4a69df5ec`;
const ICON_REPORTS  = `${FIGMA_CDN}/eb0b09a0-b9cb-47d5-a21b-1b8e674f7a07`;
const ICON_OUTBOUND = `${FIGMA_CDN}/4943ae31-0a7f-4f9e-b7f1-531cb824672b`;
const AVATAR_ME     = `${FIGMA_CDN}/c40fa44d-fa70-4b91-9d52-a03d9be33c39`;
const ICON_SEARCH   = `${FIGMA_CDN}/157d21c6-472b-4644-b914-342f6f402379`;
const ICON_SETTINGS = `${FIGMA_CDN}/0c20b532-867a-4850-94e0-76c877557291`;

interface LeftNavProps {
  page: Page;
  onNavigate: (p: Page) => void;
  badge?: { inbox?: number };
}

export default function LeftNav({ page, onNavigate, badge }: LeftNavProps) {
  const [expanded, setExpanded] = useState(false);

  function NavBtn({ nav, icon, label, count }: { nav: Page; icon: string; label: string; count?: number }) {
    const active = page === nav;
    return (
      <button
        onClick={() => onNavigate(nav)}
        title={label}
        className={`w-full h-9 flex items-center rounded-lg relative ${expanded ? 'px-2.5 gap-2' : 'justify-center'} ${
          active ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]' : 'hover:bg-white/60'
        }`}
      >
        <span className="relative flex items-center justify-center flex-shrink-0">
          <img src={icon} alt={label} className="w-4 h-4" />
          {count !== undefined && !expanded && active && (
            <span className="absolute -top-2 -right-2 bg-[#ffccb2] border border-white rounded-full min-w-[15px] h-[15px] flex items-center justify-center text-[11px] font-bold text-[#1a1a1a] px-1">{count}</span>
          )}
        </span>
        {expanded && (
          <span className="flex-1 flex items-center gap-1.5 min-w-0">
            <span className={`text-[13px] truncate ${active ? 'font-semibold text-[#1a1a1a]' : 'font-medium text-[#1a1a1a]'}`}>{label}</span>
            {count !== undefined && (
              <span className="bg-[#ffccb2] rounded-full min-w-[18px] h-[18px] flex items-center justify-center text-[11px] font-bold text-[#1a1a1a] px-1.5 flex-shrink-0">{count}</span>
            )}
          </span>
        )}
      </button>
    );
  }

  function NavBtnSvg({ nav, label, children }: { nav: Page; label: string; children: ReactNode }) {
    const active = page === nav;
    return (
      <button
        onClick={() => onNavigate(nav)}
        title={label}
        className={`w-full h-9 flex items-center rounded-lg relative ${expanded ? 'px-2.5 gap-2' : 'justify-center'} ${
          active ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]' : 'hover:bg-white/60'
        }`}
      >
        <span className="flex items-center justify-center flex-shrink-0">{children}</span>
        {expanded && <span className={`flex-1 text-left text-[13px] truncate ${active ? 'font-semibold text-[#1a1a1a]' : 'font-medium text-[#1a1a1a]'}`}>{label}</span>}
      </button>
    );
  }

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="flex flex-col h-full pt-3 pb-2 bg-[#f3f3f1] rounded-tr-2xl rounded-br-2xl justify-between flex-shrink-0 transition-[width] duration-150"
      style={{ width: expanded ? 210 : 44 }}
    >
      <div className="flex flex-col gap-3">
        <div className={`flex items-center ${expanded ? 'justify-between px-3' : 'justify-center'} h-9 flex-shrink-0`}>
          <img src={ICON_LOGO} alt="" className="w-6 h-6" />
        </div>
        <div className={`flex flex-col gap-0.5 ${expanded ? 'px-2' : 'px-1.5'}`}>
          <NavBtn nav="inbox"             icon={ICON_INBOX}    label="Inbox" count={badge?.inbox} />
          <NavBtn nav="ai_studio"         icon={ICON_FIN}      label="Fin AI Agent" />
          <NavBtn nav="knowledge"         icon={ICON_REPORTS}  label="Conocimiento" />
          <NavBtn nav="reports"           icon={ICON_OUTBOUND} label="Informes" />
          <NavBtnSvg nav="orders" label="Canales salientes">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M14.5 1.5L1.5 6l5 1.5L8 13l3-7z"/></svg>
          </NavBtnSvg>
          <NavBtnSvg nav="customers" label="Contactos">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="6" cy="5" r="2.5"/><path d="M1.8 12.5c.4-2 2.1-3.2 4.2-3.2s3.8 1.2 4.2 3.2v.5H1.8v-.5z"/><circle cx="11.5" cy="6" r="2"/><path d="M9.5 9.4c.6-.2 1.3-.3 2-.3 1.7 0 3 .9 3.4 2.5v.4H10.6c-.1-.9-.4-1.8-1.1-2.6z"/></svg>
          </NavBtnSvg>
        </div>
      </div>

      <div className={`flex flex-col gap-0.5 ${expanded ? 'px-2' : 'px-1.5'} pb-1`}>
        <button className={`w-full h-9 flex items-center rounded-lg hover:bg-white/60 ${expanded ? 'px-2.5 gap-2' : 'justify-center'}`}>
          <img src={ICON_SEARCH} alt="" className="w-4 h-4 flex-shrink-0" />
          {expanded && <span className="text-[13px] font-medium text-[#1a1a1a] flex-1 text-left">Buscar</span>}
        </button>
        <button
          onClick={() => onNavigate('settings')}
          className={`w-full h-9 flex items-center rounded-lg ${expanded ? 'px-2.5 gap-2' : 'justify-center'} ${page === 'settings' ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]' : 'hover:bg-white/60'}`}
        >
          <img src={ICON_SETTINGS} alt="" className="w-4 h-4 flex-shrink-0" />
          {expanded && <span className="text-[13px] font-medium text-[#1a1a1a] flex-1 text-left">Ajustes</span>}
        </button>
        <button
          onClick={() => onNavigate('profile')}
          className={`w-full h-9 flex items-center rounded-lg hover:bg-white/60 ${expanded ? 'px-2.5 gap-2' : 'justify-center'}`}
        >
          <div className="relative w-4 h-4 rounded-lg overflow-hidden bg-[#f8f8f7] flex-shrink-0">
            <img src={AVATAR_ME} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute bottom-[-2px] right-[-2px] w-[7px] h-[7px] bg-[#158613] rounded-[3.6px] border border-white" />
          </div>
          {expanded && <span className="text-[13px] font-medium text-[#1a1a1a] flex-1 text-left">Perfil</span>}
        </button>
      </div>
    </div>
  );
}
