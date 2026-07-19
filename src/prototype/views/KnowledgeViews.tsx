// ─────────────────────────────────────────────────────────────────────────────
// Knowledge Hub views
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../api/hooks';
import { agentsApi, connectorsApi, knowledgeApi, workspacesApi } from '../../api/client';
import { Dropdown, KH_TYPE_OPTIONS, KnowledgeArticleEditor, KnowledgeConnectAppWizard, KnowledgeExternalSourcePicker, KnowledgeWebsiteSyncWizard, LibraryIcon, TrialBanner, relativeTime, titleCase } from '../sharedUi';
import { parsePath, replaceRoute } from '../router';
import { BrandIcon, brandColor, resolveBrandId } from '../brandIcons';
import gradienteFin from '../media/gradiente3.jpg';
import gradienteCopilot from '../media/gradiente2.jpg';
import gradienteHelp from '../media/gradiente1.jpg';


// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE HUB VIEW (Figma nodes 1:25483, 1:26753, 1:28237, 1:29395, 1:31138)
// ─────────────────────────────────────────────────────────────────────────────

type KnowledgeSubView = 'fuentes' | 'contenido' | 'articulos' | 'gaps' | 'pruebas' | 'centroAyuda' | 'carpeta';
// When sub === 'carpeta' we keep the active domain id in a parallel state so
// the same UI shell renders a single-folder filtered article list.

type KhItem = { provider: string; status: string; action: string; configured: boolean; visibility?: 'public' | 'internal' };
// Clain is the native/first-party source (create articles directly → "Agregar
// artículo"). Every other provider — Intercom included — is an external
// connector you sync/import from → "Sincronizar o importar".
const KH_PUBLIC_ARTICLES: KhItem[] = [
  { provider: 'Clain',    status: '1 artículo',     action: 'Agregar artículo',       configured: true,  visibility: 'public' },
  { provider: 'Intercom', status: 'No configurado', action: 'Sincronizar o importar', configured: false },
  { provider: 'Zendesk',  status: 'No configurado', action: 'Sincronizar o importar', configured: false },
];
const KH_INTERNAL_ARTICLES: KhItem[] = [
  { provider: 'Clain',      status: '2 artículos',    action: 'Agregar artículo',       configured: true,  visibility: 'internal' },
  { provider: 'Intercom',   status: 'No configurado', action: 'Sincronizar o importar', configured: false },
  { provider: 'Guru',       status: 'No configurado', action: 'Sincronizar o importar', configured: false },
  { provider: 'Notion',     status: 'No configurado', action: 'Sincronizar o importar', configured: false },
  { provider: 'Confluence', status: 'No configurado', action: 'Sincronizar o importar', configured: false },
];
const KH_CONVERSATIONS: KhItem[] = [
  { provider: 'Clain',    status: 'No hay suficientes conversaciones', action: 'Administrar', configured: true },
  { provider: 'Intercom', status: 'No configurado', action: 'Sincronizar o importar', configured: false },
  { provider: 'Zendesk',  status: 'Importar los folios de atención (tarda entre 24 y 48 horas)', action: 'Sincronizar o importar', configured: false },
];

// Some brands ship a very light official colour (e.g. Intercom #6AFDEF) that a
// white mark can't sit on. Override the tile background for those so the glyph
// always reads; every other brand uses its official colour from brandIcons.
const KH_TILE_BG: Record<string, string> = {
  Intercom: '#1a1a1a',
};

function KhProviderIcon({ name }: { name: string }) {
  const cls = "w-5 h-5 rounded-[4px] flex items-center justify-center flex-shrink-0";
  if (name === 'Clain') {
    // First-party source → the Clain brand mark.
    return <img src="/logos/clain-favicon.png" alt="Clain" className="w-5 h-5 object-contain flex-shrink-0" draggable={false} />;
  }
  const id = resolveBrandId(name);
  if (!id) {
    // Unknown brand (e.g. Guru) → neutral tile with the initial.
    return (
      <span className={cls} style={{ background: '#646462' }}>
        <span className="text-[10px] font-bold text-white">{name[0]}</span>
      </span>
    );
  }
  const bg = KH_TILE_BG[name] ?? brandColor(name);
  return (
    <span className={cls} style={{ background: bg }}>
      <BrandIcon name={name} size={12} monochrome color="#ffffff" />
    </span>
  );
}

// Polished action pill used for every source row / section action. Picks a
// leading glyph from the action verb so "Agregar…", "Sincronizar o importar" and
// "Administrar" read consistently across the whole Fuentes screen.
function KhActionButton({ label, onClick }: { label: string; onClick?: () => void }) {
  const a = label.toLowerCase();
  const kind: 'add' | 'sync' | 'manage' = /agregar|cargar|añadir/.test(a) ? 'add'
    : /sincroniz|importar/.test(a) ? 'sync'
    : 'manage';
  const Icon = kind === 'add' ? (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
  ) : kind === 'sync' ? (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3"/></svg>
  ) : (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.6"><circle cx="8" cy="8" r="1.6"/><path d="M8 2.5v1.6M8 11.9v1.6M13.5 8h-1.6M4.1 8H2.5M11.9 4.1l-1.1 1.1M5.2 10.8l-1.1 1.1M11.9 11.9l-1.1-1.1M5.2 5.2 4.1 4.1" strokeLinecap="round"/></svg>
  );
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full border border-[#e5e5e2] bg-white text-[12.5px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4] hover:border-[#d4d4d2] active:bg-[#efefec] disabled:opacity-45 disabled:cursor-default transition-colors flex-shrink-0"
    >
      <span className="text-[#646462]">{Icon}</span>
      {label}
    </button>
  );
}

function KhSection({
  title, description, items, headerAction,
}: {
  title: string;
  description?: string;
  items: { provider: string; status: string; action: string; configured: boolean; icon?: ReactNode; onClick?: () => void }[];
  headerAction?: { label: string; onClick?: () => void };
}) {
  const hasItems = items.length > 0;
  return (
    <div className="bg-white border border-[#e9eae6] rounded-[10px]">
      <div className={`px-5 py-4 ${hasItems ? 'border-b border-[#f1f1ee]' : ''} flex items-start gap-3`}>
        <div className="w-7 h-7 rounded-[6px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5">
            <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
            <path d="M2.5 5.5h11" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-semibold text-[#1a1a1a]">{title}</p>
          {description && <p className="text-[13px] text-[#646462] mt-0.5">{description}</p>}
        </div>
        {headerAction && (
          <div className="flex-shrink-0 mt-0.5">
            <KhActionButton label={headerAction.label} onClick={headerAction.onClick} />
          </div>
        )}
      </div>
      {hasItems && (
        <div>
          {items.map((it, idx) => (
            <div key={`${it.provider}-${idx}`} className={`flex items-center gap-4 px-5 py-3 ${idx > 0 ? 'border-t border-[#f1f1ee]' : ''}`}>
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                {it.configured
                  ? <span className="w-4 h-4 rounded-full bg-[#22c55e] flex items-center justify-center"><svg viewBox="0 0 12 12" className="w-2.5 h-2.5 fill-white"><path d="M3 6l2 2 4-4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/></svg></span>
                  : <span className="w-4 h-4 rounded-full border border-[#d4d4d2]" />
                }
              </div>
              {it.icon ?? <KhProviderIcon name={it.provider} />}
              <span className="flex-shrink-0 text-[13px] font-medium text-[#1a1a1a]">{it.provider}</span>
              <span className="flex-1 text-[13px] text-[#646462] truncate">{it.status}</span>
              <KhActionButton label={it.action} onClick={it.onClick} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Icons reused by the folder kebab menu.
const KH_MENU_ICONS = {
  subfolder: <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.75 6.5A1.75 1.75 0 0 1 4.5 4.75h3l1.5 1.75h6.5a1.75 1.75 0 0 1 1.75 1.75V14a1.75 1.75 0 0 1-1.75 1.75h-11A1.75 1.75 0 0 1 2.75 14z"/><path d="M10 8.75v3.5M8.25 10.5h3.5"/></svg>,
  edit: <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M13.4 3.6a1.6 1.6 0 0 1 2.3 0l.7.7a1.6 1.6 0 0 1 0 2.3L7.9 15.1l-3.4.9.9-3.4z"/><path d="M12.4 4.6l3 3"/></svg>,
  move: <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.75 6A1.75 1.75 0 0 1 4.5 4.25h3L9 6h6.5A1.75 1.75 0 0 1 17.25 7.75V14a1.75 1.75 0 0 1-1.75 1.75h-11A1.75 1.75 0 0 1 2.75 14z"/><path d="M10 12.5l2.25-2.25L10 8M12 10.25H7.5"/></svg>,
  trash: <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h12"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6"/><path d="M5.5 6l.6 9a1.5 1.5 0 0 0 1.5 1.4h4.8A1.5 1.5 0 0 0 13.9 15l.6-9"/><path d="M8.5 9v4.5M11.5 9v4.5"/></svg>,
};

// Recursive folder/subfolder row for the Knowledge sidebar tree.
function SidebarFolderNode({
  folder, depth, childrenOf, expanded, toggleExpand, activeFolderId, sub, itemCls,
  onSelectFolder, onCreateSubfolder, onEditFolder, onMoveFolder, onDeleteFolder,
}: {
  folder: any;
  depth: number;
  childrenOf: (id: string) => any[];
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  activeFolderId?: string | null;
  sub: KnowledgeSubView;
  itemCls: (isActive: boolean) => string;
  onSelectFolder?: (id: string) => void;
  onCreateSubfolder?: (parent: { id: string; name: string }) => void;
  onEditFolder?: (folder: { id: string; name: string; description?: string; icon?: string }) => void;
  onMoveFolder?: (folder: any) => void;
  onDeleteFolder?: (folder: { id: string; name: string }) => void;
}) {
  const kids = childrenOf(folder.id);
  const isOpen = expanded.has(folder.id);
  const active = sub === 'carpeta' && activeFolderId === folder.id;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const MenuItem = ({ icon, label, danger, onClick }: { icon: ReactNode; label: string; danger?: boolean; onClick: () => void }) => (
    <button
      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onClick(); }}
      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium ${danger ? 'text-[#dc2626] hover:bg-[#fdecec]' : 'text-[#1a1a1a] hover:bg-[#f3f3f1]'}`}
    >
      <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">{icon}</span>
      {label}
    </button>
  );

  return (
    <>
      <div className="group relative" ref={menuRef}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectFolder?.(folder.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectFolder?.(folder.id); } }}
          className={itemCls(active)}
          style={{ paddingLeft: 12 + depth * 14 }}
        >
          {kids.length > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(folder.id); }}
              className="w-3.5 h-3.5 -ml-0.5 flex items-center justify-center flex-shrink-0 text-[#646462] hover:text-[#1a1a1a]"
            >
              <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-current transition-transform ${isOpen ? 'rotate-90' : ''}`}><path d="M6 4l4 4-4 4z"/></svg>
            </button>
          ) : (
            <span className="w-3 flex-shrink-0" />
          )}
          <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 leading-none">
            {folder.icon
              ? <span className="text-[13px] leading-none">{folder.icon}</span>
              : <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M2 5a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" /></svg>}
          </span>
          <span className="flex-1 truncate pr-8">{folder.name}</span>
        </div>

        {/* Kebab trigger — visible on hover or while its menu is open. */}
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
          title="Opciones"
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-[#646462] hover:text-[#1a1a1a] hover:bg-[#e9eae6] transition-opacity ${menuOpen ? 'opacity-100 bg-[#e9eae6]' : 'opacity-0 group-hover:opacity-100'}`}
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg>
        </button>

        {menuOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-1 top-[calc(100%-2px)] z-30 w-[184px] rounded-xl bg-white border border-[#e9eae6] shadow-[0px_12px_32px_rgba(20,20,20,0.18)] p-1"
          >
            {!folder.parentId && onCreateSubfolder && (
              <MenuItem icon={KH_MENU_ICONS.subfolder} label="Crear subcarpeta" onClick={() => onCreateSubfolder({ id: folder.id, name: folder.name })} />
            )}
            {onEditFolder && (
              <MenuItem icon={KH_MENU_ICONS.edit} label="Editar carpeta" onClick={() => onEditFolder({ id: folder.id, name: folder.name, description: folder.description, icon: folder.icon })} />
            )}
            {onMoveFolder && (
              <MenuItem icon={KH_MENU_ICONS.move} label="Mover a carpeta" onClick={() => onMoveFolder(folder)} />
            )}
            {onDeleteFolder && (
              <MenuItem icon={KH_MENU_ICONS.trash} label="Eliminar carpeta" danger onClick={() => onDeleteFolder({ id: folder.id, name: folder.name })} />
            )}
          </div>
        )}
      </div>
      {isOpen && kids.map((k: any) => (
        <SidebarFolderNode
          key={k.id} folder={k} depth={depth + 1} childrenOf={childrenOf} expanded={expanded} toggleExpand={toggleExpand}
          activeFolderId={activeFolderId} sub={sub} itemCls={itemCls}
          onSelectFolder={onSelectFolder} onCreateSubfolder={onCreateSubfolder} onEditFolder={onEditFolder} onMoveFolder={onMoveFolder} onDeleteFolder={onDeleteFolder}
        />
      ))}
    </>
  );
}

function KnowledgeSidebar({ sub, onSelect, activeFolderId, onSelectFolder, onCreateFolder, onCreateSubfolder, onEditFolder, onMoveFolder, onDeleteFolder, refreshKey }: {
  sub: KnowledgeSubView;
  onSelect: (s: KnowledgeSubView) => void;
  activeFolderId?: string | null;
  onSelectFolder?: (id: string) => void;
  onCreateFolder?: () => void;
  onCreateSubfolder?: (parent: { id: string; name: string }) => void;
  onEditFolder?: (folder: { id: string; name: string; description?: string; icon?: string }) => void;
  onMoveFolder?: (folder: any) => void;
  onDeleteFolder?: (folder: { id: string; name: string }) => void;
  refreshKey?: number;
}) {
  // Match Inbox sidebar UI: w-236, header 20px font-semibold tracking -0.4px, items text-13.
  const [openContenido, setOpenContenido] = useState(sub === 'contenido' || sub === 'articulos' || sub === 'gaps' || sub === 'pruebas' || sub === 'carpeta');
  const [openArticulos, setOpenArticulos] = useState(true);
  const { data: domainsData } = useApi(() => knowledgeApi.listDomains(), [refreshKey ?? 0], []);
  const domains = Array.isArray(domainsData) ? domainsData : [];
  // Folder tree: top-level folders (no parent) + their children.
  // NB: the API client camelCases responses → `parent_id` becomes `parentId`.
  const rootFolders = domains.filter((d: any) => !d.parentId);
  const childrenOf = (id: string) => domains.filter((d: any) => d.parentId === id);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // Auto-expand the ancestor of the active subfolder so it stays visible.
  useEffect(() => {
    const active = domains.find((d: any) => d.id === activeFolderId);
    if (active?.parentId) setExpanded(s => new Set(s).add(active.parentId));
  }, [activeFolderId, domainsData]);
  const itemCls = (isActive: boolean) =>
    `relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
      isActive
        ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
        : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
    }`;
  const Chev = ({ open }: { open: boolean }) => (
    <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-[#646462] transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M6 4l4 4-4 4z"/>
    </svg>
  );
  return (
    <div className="w-[236px] flex-shrink-0 bg-[#f8f8f7] rounded-[12px] border border-[#e9eae6] flex flex-col overflow-hidden">
      {/* Header — 20px font-semibold tracking -0.4px (matches Inbox) */}
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Conocimiento</span>
      </div>
      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-4 flex flex-col gap-0.5">
        <button onClick={() => onSelect('fuentes')} className={itemCls(sub === 'fuentes')}>
          <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
            {/* Fuentes — solid 2×2 grid */}
            <svg viewBox="0 0 16 16" className="w-[15px] h-[15px] fill-[#1a1a1a]"><rect x="1.5" y="1.5" width="5.6" height="5.6" rx="1.6"/><rect x="8.9" y="1.5" width="5.6" height="5.6" rx="1.6"/><rect x="1.5" y="8.9" width="5.6" height="5.6" rx="1.6"/><rect x="8.9" y="8.9" width="5.6" height="5.6" rx="1.6"/></svg>
          </span>
          <span className="flex-1">Fuentes</span>
        </button>
        {/* Contenido — expandable group, with new sub-items */}
        <button onClick={() => setOpenContenido(o => !o)} className={itemCls(false)}>
          <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
            {/* Contenido — solid document */}
            <svg viewBox="0 0 16 16" className="w-[15px] h-[15px]"><path fill="#1a1a1a" d="M4 1.4h4.7L13.2 6v8A1.6 1.6 0 0 1 11.6 15.6H4.4A1.6 1.6 0 0 1 2.8 14V3A1.6 1.6 0 0 1 4.4 1.4z"/><path fill="#fff" d="M8.4 1.6v3.8a.8.8 0 0 0 .8.8h3.6zM5.4 8.2h5.2v1.2H5.4zM5.4 10.7h5.2v1.2H5.4z"/></svg>
          </span>
          <span className="flex-1">Contenido</span>
          <Chev open={openContenido} />
        </button>
        {openContenido && (
          <div className="flex flex-col mt-0.5 mb-0.5 gap-0.5">
            {/* Artículos — navegable + expandible; contiene el árbol de carpetas */}
            <div className="group relative">
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect('articulos')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect('articulos'); } }}
                className={itemCls(sub === 'articulos')}
                style={{ paddingLeft: 26 }}
              >
                {rootFolders.length > 0 ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenArticulos(o => !o); }}
                    className="w-3.5 h-3.5 -ml-0.5 flex items-center justify-center flex-shrink-0 text-[#646462] hover:text-[#1a1a1a]"
                  >
                    <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-current transition-transform ${openArticulos ? 'rotate-90' : ''}`}><path d="M6 4l4 4-4 4z"/></svg>
                  </button>
                ) : (
                  <span className="w-3 flex-shrink-0" />
                )}
                <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  {/* Artículos — documento con texto */}
                  <svg viewBox="0 0 16 16" className="w-[15px] h-[15px] fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2h5l3 3v8.5A1.5 1.5 0 0 1 10.5 15h-6A1.5 1.5 0 0 1 3 13.5v-10A1.5 1.5 0 0 1 4.5 2z"/><path d="M9 2v3h3M5.5 8h5M5.5 10.5h3.5"/></svg>
                </span>
                <span className="flex-1 truncate pr-8">Artículos</span>
              </div>
              {onCreateFolder && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCreateFolder(); }}
                  title="Nueva carpeta"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-[#646462] hover:text-[#1a1a1a] hover:bg-[#e9eae6] opacity-0 group-hover:opacity-100"
                >
                  <svg viewBox="0 0 20 20" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2.75 6.5A1.75 1.75 0 0 1 4.5 4.75h3l1.5 1.75h6.5a1.75 1.75 0 0 1 1.75 1.75V14a1.75 1.75 0 0 1-1.75 1.75h-11A1.75 1.75 0 0 1 2.75 14z"/><path d="M10 8.75v3.5M8.25 10.5h3.5"/></svg>
                </button>
              )}
            </div>
            {openArticulos && (
              <>
                {rootFolders.length === 0 && (
                  <p className="py-1 text-[12px] text-[#646462] italic" style={{ paddingLeft: 40 }}>Sin carpetas todavía.</p>
                )}
                {rootFolders.map((d: any) => (
                  <SidebarFolderNode
                    key={d.id} folder={d} depth={2} childrenOf={childrenOf} expanded={expanded} toggleExpand={toggleExpand}
                    activeFolderId={activeFolderId} sub={sub} itemCls={itemCls}
                    onSelectFolder={onSelectFolder} onCreateSubfolder={onCreateSubfolder} onEditFolder={onEditFolder} onMoveFolder={onMoveFolder} onDeleteFolder={onDeleteFolder}
                  />
                ))}
              </>
            )}
          </div>
        )}
        <button onClick={() => onSelect('centroAyuda')} className={`mt-2 ${itemCls(sub === 'centroAyuda')}`}>
          <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
            {/* Centro de ayuda — solid life-ring */}
            <svg viewBox="0 0 16 16" className="w-[15px] h-[15px]" fill="#1a1a1a" fillRule="evenodd" clipRule="evenodd"><path d="M8 .8a7.2 7.2 0 1 0 0 14.4A7.2 7.2 0 0 0 8 .8zm0 4.1a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2z"/><path d="M11.9 2.5l-1.8 2.2a3.6 3.6 0 0 0-1.3-.7l.8-2.7zM2.5 4.1l2.2 1.8c-.3.4-.5.8-.7 1.3l-2.7-.8zm11 .1l-.8 2.7c-.5-.2-.9-.4-1.3-.5l.6-2.8zM4.2 11.4l-2.8.6.9-2.6c.3.4.6.8 1 1.1zm7.6.1l1.1 1.9-2.7-.8c.3-.3.6-.7.8-1.1zm-4.9 1.2l.9 2.7-2.2-1.8c.4-.3.8-.6 1.3-.9z"/></svg>
          </span>
          <span className="flex-1">Centro de ayuda</span>
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 flex-shrink-0 fill-none stroke-[#646462]" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 10.5l5-5M6 5.5h4.5V10"/></svg>
        </button>
      </div>
    </div>
  );
}

type KhTab = 'all' | 'ai' | 'copilot' | 'help';

function KhProductHero({ tab }: { tab: 'ai' | 'copilot' | 'help' }) {
  if (tab === 'ai') {
    return (
      <div className="relative bg-white border border-[#e9eae6] rounded-[10px] flex overflow-hidden">
        <div className="flex-1 p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[14px] font-bold text-[#1a1a1a]">Fin AI Agent</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f3f3f1] text-[#646462]">No establecido en vivo</span>
          </div>
          <p className="text-[13px] text-[#646462] leading-[19px] max-w-[520px]">Fin utiliza tu contenido de asistencia para responder preguntas a través de Messenger y correo electrónico, para así mejorar la asistencia de autoservicio, la experiencia del cliente y las puntuaciones CSAT.</p>
          <div className="mt-3 flex items-center gap-4 text-[12.5px] font-medium text-[#1a1a1a]">
            <a href="#" className="inline-flex items-center gap-1 hover:underline">↗ Configurar ahora</a>
            <a href="#" className="inline-flex items-center gap-1 hover:underline"><svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.4"><path d="M2.5 3.2v9.6c1.7-.6 3.4-.6 5.5 0 2.1-.6 3.8-.6 5.5 0V3.2c-1.7-.6-3.4-.6-5.5 0C5.9 2.6 4.2 2.6 2.5 3.2z"/></svg> Más información</a>
          </div>
        </div>
        <div className="w-[260px] h-[140px] flex-shrink-0 bg-gradient-to-br from-[#a98a6c] via-[#7a5a3a] to-[#5a4a3a] flex items-center justify-center relative">
          <div className="bg-white rounded-[10px] shadow p-2.5 max-w-[180px]">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-5 h-5 rounded-[5px] bg-[#1a1a1a] flex items-center justify-center">
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#ed621d]"><path d="M8 2l1.4 4.6L14 8l-4.6 1.4L8 14l-1.4-4.6L2 8l4.6-1.4z"/></svg>
              </span>
              <span className="text-[10px] font-semibold text-[#1a1a1a]">Fin · AI Agent</span>
            </div>
            <p className="text-[10px] text-[#1a1a1a] leading-[12px] mb-1.5">Hello, Marina.<br/>We're here to help.</p>
            <div className="bg-[#ff5f3f] text-white rounded-[6px] px-2 py-1 text-[8.5px]">How many API calls can I make per month?</div>
          </div>
        </div>
        <button className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-full bg-[#1a1a1a]/40 hover:bg-[#1a1a1a]/60 text-white">
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.6"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
        </button>
      </div>
    );
  }
  if (tab === 'copilot') {
    return (
      <div className="relative bg-white border border-[#e9eae6] rounded-[10px] flex overflow-hidden">
        <div className="flex-1 p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[14px] font-bold text-[#1a1a1a]">Copilot</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#15803d]">En vivo</span>
          </div>
          <p className="text-[13px] text-[#646462] leading-[19px] max-w-[520px]">Copilot utiliza tu contenido de asistencia para encontrar respuestas rápidamente, dando a cada miembro del equipo un asistente de IA que mejora la eficiencia del equipo y la experiencia del cliente.</p>
          <div className="mt-3 flex items-center gap-4 text-[12.5px] font-medium text-[#1a1a1a]">
            <a href="#" className="inline-flex items-center gap-1 hover:underline">↗ Ir a Inbox</a>
            <a href="#" className="inline-flex items-center gap-1 hover:underline"><svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.4"><rect x="3" y="2.5" width="10" height="11" rx="1.2"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3"/></svg> Ver guía</a>
            <a href="#" className="inline-flex items-center gap-1 hover:underline"><svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.4"><path d="M2.5 3.2v9.6c1.7-.6 3.4-.6 5.5 0 2.1-.6 3.8-.6 5.5 0V3.2c-1.7-.6-3.4-.6-5.5 0C5.9 2.6 4.2 2.6 2.5 3.2z"/></svg> Más información</a>
          </div>
        </div>
        <div className="w-[260px] h-[140px] flex-shrink-0 bg-gradient-to-br from-[#bcd9c8] via-[#dcdcc4] to-[#c4a8e0] flex items-center justify-center p-2 relative">
          <div className="bg-white rounded-[8px] shadow w-full h-full p-2">
            <p className="text-[10px] font-semibold text-[#1a1a1a] mb-1">What do I do when a customer has a refund request?</p>
            <div className="text-[9px] text-[#646462] mb-1.5 leading-[11px]">We understand that sometimes a purchase may not me…</div>
            <div className="border-t border-[#e9eae6] pt-1">
              <p className="text-[9px] font-semibold text-[#1a1a1a]">Issuing a refund</p>
              <p className="text-[8.5px] text-[#646462] leading-[10px]">📄 Public article · Amy Adams · 1d ago</p>
              <p className="text-[8.5px] text-[#1a1a1a] leading-[10px] mt-1">To process a refund request, follow these steps: 1. Determine Refund Eligibility…</p>
            </div>
          </div>
        </div>
        <button className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-full bg-[#1a1a1a]/40 hover:bg-[#1a1a1a]/60 text-white">
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.6"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
        </button>
      </div>
    );
  }
  // help
  return (
    <div className="relative bg-white border border-[#e9eae6] rounded-[10px] flex overflow-hidden">
      <div className="flex-1 p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[14px] font-bold text-[#1a1a1a]">Centro de ayuda</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f3f3f1] text-[#646462]">No establecido en vivo</span>
        </div>
        <p className="text-[13px] text-[#646462] leading-[19px] max-w-[520px]">El centro de ayuda te permite crear artículos y organizarlos en colecciones para que los clientes encuentren respuestas a preguntas frecuentes rápidamente en tu sitio web o aplicación.</p>
        <div className="mt-3 flex items-center gap-4 text-[12.5px] font-medium text-[#1a1a1a]">
          <a href="#" className="inline-flex items-center gap-1 hover:underline">↗ Configurar ahora</a>
          <a href="#" className="inline-flex items-center gap-1 hover:underline"><svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.4"><path d="M2.5 3.2v9.6c1.7-.6 3.4-.6 5.5 0 2.1-.6 3.8-.6 5.5 0V3.2c-1.7-.6-3.4-.6-5.5 0C5.9 2.6 4.2 2.6 2.5 3.2z"/></svg> Más información</a>
        </div>
      </div>
      <div className="w-[300px] h-[150px] flex-shrink-0 bg-gradient-to-br from-[#a3c4a3] via-[#e0c8a0] to-[#c79a7a] flex items-center justify-center p-3 relative">
        <div className="grid grid-cols-2 gap-2 w-full h-full">
          <div className="bg-white rounded-[6px] p-1.5">
            <div className="h-1.5 w-3/4 bg-[#1a1a1a]/15 rounded mb-1" />
            <div className="h-1 w-full bg-[#1a1a1a]/10 rounded" />
            <div className="h-1 w-2/3 bg-[#1a1a1a]/10 rounded mt-0.5" />
          </div>
          <div className="bg-white rounded-[6px] p-1.5">
            <div className="h-1.5 w-3/4 bg-[#ff5f3f]/30 rounded mb-1" />
            <div className="h-1 w-full bg-[#1a1a1a]/10 rounded" />
            <div className="h-1 w-2/3 bg-[#1a1a1a]/10 rounded mt-0.5" />
          </div>
          <div className="bg-white rounded-[6px] p-1.5 col-span-2">
            <div className="h-1.5 w-1/3 bg-[#1a1a1a]/15 rounded" />
          </div>
        </div>
      </div>
      <button className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-full bg-[#1a1a1a]/40 hover:bg-[#1a1a1a]/60 text-white">
        <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.6"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
      </button>
    </div>
  );
}

function KhChecklist({ title, items }: { title: string; items: { label: string; done?: boolean }[] }) {
  return (
    <div className="relative bg-white border border-[#e9eae6] rounded-[10px] p-4">
      <button className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded-full hover:bg-[#ededea]">
        <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
      </button>
      <p className="text-[13px] font-semibold text-[#1a1a1a] mb-3">{title}</p>
      <div className="flex flex-col gap-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-start gap-2">
            {it.done ? (
              <span className="w-4 h-4 rounded-full bg-[#1a1a1a] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 fill-none stroke-white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6l2 2 4-4"/></svg>
              </span>
            ) : (
              <span className="w-4 h-4 rounded-full border border-[#d4d4d2] flex-shrink-0 mt-0.5" />
            )}
            <span className={`text-[12.5px] leading-[16px] ${it.done ? 'line-through text-[#646462]' : 'text-[#1a1a1a]'}`}>{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KnowledgeFuentes({
  onCreate,
  onNavigate,
  onAction,
  onOpenView,
  onOpenWebsiteSync,
  onOpenExternalPicker,
  onConnectApp,
}: {
  onCreate: (opts: { type?: string; visibility?: 'public' | 'internal' }) => void;
  onNavigate: (sub: KnowledgeSubView) => void;
  onAction: (msg: string, type?: 'success' | 'error') => void;
  // Top-level CRM views (e.g. 'fin', 'inbox', 'connectors') for "Configurar ahora" / "Ir a Inbox".
  onOpenView?: (view: string) => void;
  // Open the real ingestion flows (mounted once in KnowledgeView).
  onOpenWebsiteSync: () => void;
  onOpenExternalPicker: () => void;
  // "Sincronizar o importar" on a connector row → per-app connect wizard.
  onConnectApp: (provider: string) => void;
}) {
  const [tab, setTab] = useState<KhTab>('all');
  // Real connector status. We don't replace the static catalog (it's the
  // canonical product list shown in Figma), we just enrich each row with
  // live "configured" + "status" info when the user has actually wired the
  // matching connector to Clain.
  const { data: connectorsData } = useApi(() => connectorsApi.list(), [], []);
  // Anti-flicker: useApi blanks `data` to its fallback ([]) on every refetch
  // (incl. the global `crm-data-changed` event the agent fires on writes), and a
  // refetch can also return a list that momentarily omits a provider. Reading it
  // directly makes the action buttons flip "Administrar" ↔ "Agregar artículo".
  // Accumulate connectors into a provider→row map that only ever adds/updates —
  // never removes — so a configured source never downgrades on a transient fetch.
  const [connectorsByProvider, setConnectorsByProvider] = useState<Map<string, any>>(new Map());
  useEffect(() => {
    if (!Array.isArray(connectorsData) || connectorsData.length === 0) return;
    setConnectorsByProvider(prev => {
      const map = new Map(prev);
      connectorsData.forEach((c: any) => {
        const key = String(c.provider || c.name || c.type || '').toLowerCase();
        if (key) map.set(key, c);
      });
      return map;
    });
  }, [connectorsData]);
  // Default per-action handler — keeps the "Agregar artículo / Sincronizar o
  // importar / Administrar" buttons clickable even when the row is the static
  // catalog. Reads the item's visibility so "Agregar artículo" opens the picker
  // pre-scoped to público vs interno.
  function actionHandler(it: { action: string; provider?: string; visibility?: 'public' | 'internal' }): (() => void) | undefined {
    const a = String(it.action || '').toLowerCase();
    if (a.includes('agregar artículo') || a.includes('agregar articulo')) return () => onCreate({ type: 'ARTICLE', visibility: it.visibility || 'public' });
    if (a.includes('fragmento'))       return () => onCreate({ type: 'SNIPPET' });
    if (a.includes('cargar documento')) return () => onCreate({ type: 'DOCUMENT' });
    // A connector row (Zendesk/Guru/Notion/Confluence…) → open that app's
    // connect wizard. Rows without a provider fall back to the source picker.
    if (a.includes('sincronizar') || a.includes('importar')) {
      return it.provider ? () => onConnectApp(it.provider!) : () => onOpenExternalPicker();
    }
    if (a.includes('administrar') || a.includes('reconectar')) return () => onOpenView?.('connectors');
    return undefined;
  }
  // Attach default click handlers to any item (for inline static lists).
  function withHandlers<T extends { provider: string; action: string; visibility?: 'public' | 'internal' }>(items: T[]): (T & { onClick?: () => void })[] {
    return items.map(it => ({ ...it, onClick: actionHandler(it) }));
  }
  function enrich(items: KhItem[]) {
    return items.map(it => {
      const live = connectorsByProvider.get(it.provider.toLowerCase());
      // A live connector updates the row's STATUS + checkmark, but NEVER the
      // action label: Intercom keeps "Agregar artículo", externals keep
      // "Sincronizar o importar". (Switching to "Administrar" here was the bug.)
      const base = !live ? it : {
        ...it,
        configured: true,
        status: live.status === 'connected' || live.status === 'active'
          ? `Conectado · ${live.last_synced_at ? `actualizado ${relativeTime(live.last_synced_at)}` : 'sin sincronizar todavía'}`
          : live.status === 'error' ? `Error: ${live.last_error || 'revisar configuración'}`
          : it.status,
      };
      return { ...base, onClick: actionHandler(base) };
    });
  }
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><circle cx="8" cy="8" r="6.2"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Fuentes</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M3 4h10v2.5l-3 .5-2 4H6l-3-2.5z"/></svg>
            Aprender
            <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
          </button>
          <button onClick={() => onCreate({ type: 'ARTICLE', visibility: 'public' })} className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-3 py-[6px] text-[13px] font-semibold hover:bg-black">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
            Nuevo contenido
          </button>
        </div>
      </div>
      <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
        {([
          { id: 'all',     label: 'Todas las fuentes' },
          { id: 'ai',      label: 'Agente de IA' },
          { id: 'copilot', label: 'Copilot' },
          { id: 'help',    label: 'Centro de ayuda' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 flex flex-col gap-4">
        {tab === 'all' && (
        <>
        {/* Promo card */}
        <div className="relative bg-white border border-[#e9eae6] rounded-[10px] p-5">
          <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
          </button>
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-3">Optimiza tu contenido para Fin AI Agent, Copilot y el centro de ayuda</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { name: 'Fin',     status: 'No establecido en vivo', desc: 'Fin utiliza tu conocimiento para generar respuestas precisas para los clientes.', cta: 'Configurar ahora', accent: '#ff5f3f', image: gradienteFin,     onClick: () => onOpenView?.('fin') },
              { name: 'Copilot', status: 'En vivo',                desc: 'Copilot utiliza tus conocimientos para dar a tus compañeros de equipo las respuestas que necesitan.', cta: 'Ir a Inbox',         accent: '#3b59f6', image: gradienteCopilot, onClick: () => onOpenView?.('inbox') },
              { name: 'Centro de ayuda', status: 'No establecido en vivo', desc: 'Los clientes utilizan tu conocimiento para encontrar respuestas precisas por sí mismos.', cta: 'Configurar ahora', accent: '#646462', image: gradienteHelp, onClick: () => onNavigate('centroAyuda') },
            ].map(c => (
              <div key={c.name} className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[10px] overflow-hidden">
                <div className="h-[100px] overflow-hidden">
                  <img src={c.image} alt="" aria-hidden className="w-full h-full object-cover" draggable={false} />
                </div>
                <div className="p-3 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#1a1a1a]">{c.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${c.status === 'En vivo' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#f3f3f1] text-[#646462]'}`}>{c.status}</span>
                  </div>
                  <p className="text-[12px] text-[#646462] leading-[16px]">{c.desc}</p>
                  <button onClick={c.onClick} className="text-left text-[12px] font-medium text-[#1a1a1a] hover:underline mt-1">{c.cta} ↗</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <KhSection
          title="Artículos públicos"
          description="Permite que Fin AI Agent y Copilot usen artículos públicos de tu centro de ayuda."
          items={enrich(KH_PUBLIC_ARTICLES)}
        />
        <KhSection
          title="Artículos internos"
          description="Proporcione a Fin AI Agent y Copilot el conocimiento interno que solo está disponible para usted y su equipo."
          items={enrich(KH_INTERNAL_ARTICLES)}
        />
        <KhSection
          title="Conversaciones"
          description="Deja que Copilot utilice las conversaciones de tu equipo y los folios de atención de los clientes de los últimos 4 meses."
          items={enrich(KH_CONVERSATIONS)}
        />
        <KhSection
          title="Macros"
          description="Copilot recomendará macros que estén disponibles para tus compañeros de equipo."
          items={withHandlers([{ provider: 'Clain', status: '4 macros', action: 'Administrar', configured: true }])}
        />
        <KhSection
          title="Sitios web"
          description="Permite que Fin AI Agent y Copilot utilicen cualquier sitio web público."
          items={[]}
          headerAction={{ label: 'Sincronizar o importar', onClick: onOpenWebsiteSync }}
        />
        <KhSection
          title="Más fuentes de contenido"
          description="Proporcione a Fin AI Agent y a Copilot AI fuentes que tus clientes no puedan ver."
          items={withHandlers([
            {
              provider: 'Fragmentos de texto',
              status: 'No hay fragmentos de texto',
              action: 'Agregar fragmento de código',
              configured: false,
              icon: (
                <span className="w-5 h-5 rounded-[4px] bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-white" strokeWidth="1.6"><path d="M5 5L3 8l2 3M11 5l2 3-2 3M9 4l-2 8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              ),
            },
            {
              provider: 'Documentos',
              status: 'Ningún documento',
              action: 'Cargar documento',
              configured: false,
              icon: (
                <span className="w-5 h-5 rounded-[4px] bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-white" strokeWidth="1.6"><path d="M4 2h6l3 3v9H4z" strokeLinejoin="round"/><path d="M10 2v3h3M6 9h4M6 11.5h3"/></svg>
                </span>
              ),
            },
          ])}
        />
        </>
        )}

        {tab === 'ai' && (
          <>
            <KhProductHero tab="ai" />
            <div className="grid grid-cols-[1fr_280px] gap-4">
              <div className="flex flex-col gap-4">
                <KhSection
                  title="Artículos públicos"
                  description="Permite que Fin AI Agent utilice artículos públicos de tu centro de ayuda."
                  items={withHandlers<KhItem>([
                    { provider: 'Clain',    status: 'No hay artículos…', action: 'Agregar artículo',       configured: false, visibility: 'public' },
                    { provider: 'Intercom', status: 'No configurado',    action: 'Sincronizar o importar', configured: false },
                    { provider: 'Zendesk',  status: 'No configurado',    action: 'Sincronizar o importar', configured: false },
                  ])}
                />
                <KhSection
                  title="Sitios web"
                  description="Permite que Fin AI Agent utilice cualquier sitio web público."
                  items={[]}
                  headerAction={{ label: 'Sincronizar o importar', onClick: onOpenWebsiteSync }}
                />
                <KhSection
                  title="Más fuentes de contenido"
                  description="Ofrece a Fin AI Agent fuentes que tus clientes no puedan ver."
                  items={[]}
                />
              </div>
              <KhChecklist
                title="Empezar con Fin AI Agent"
                items={[
                  { label: 'Añade al menos una fuente de conocimiento' },
                  { label: 'Configura Fin AI Agent y actívalo' },
                  { label: 'Optimiza Fin AI Agent agregando más fuentes' },
                  { label: 'Configura la asistencia multilingüe de Fin', done: true },
                ]}
              />
            </div>
          </>
        )}

        {tab === 'copilot' && (
          <>
            <KhProductHero tab="copilot" />
            <div className="grid grid-cols-[1fr_280px] gap-4">
              <div className="flex flex-col gap-4">
                <KhSection
                  title="Artículos internos"
                  description="Proporciona a Copilot conocimientos internos que solo están disponibles para ti y tu equipo."
                  items={withHandlers(KH_INTERNAL_ARTICLES as any)}
                />
                <KhSection
                  title="Conversaciones"
                  description="Deja que Copilot utilice las conversaciones de tu equipo y los folios de atención de los clientes de los últimos 4 meses."
                  items={withHandlers(KH_CONVERSATIONS as any)}
                />
                <KhSection
                  title="Macros"
                  description="Copilot recomendará macros que estén disponibles para tus compañeros de equipo."
                  items={withHandlers([{ provider: 'Clain', status: '4 macros para Copilot', action: 'Administrar', configured: true }])}
                />
                <KhSection
                  title="Artículos públicos"
                  description="Permite que Copilot utilice los artículos públicos del centro de ayuda."
                  items={withHandlers<KhItem>([
                    { provider: 'Clain',    status: 'No hay artículos…', action: 'Agregar artículo',       configured: false, visibility: 'public' },
                    { provider: 'Intercom', status: 'No configurado',    action: 'Sincronizar o importar', configured: false },
                    { provider: 'Zendesk',  status: 'No configurado',    action: 'Sincronizar o importar', configured: false },
                  ])}
                />
                <KhSection
                  title="Sitios web"
                  description="Permite que Copilot utilice cualquier sitio web público."
                  items={[]}
                  headerAction={{ label: 'Sincronizar o importar', onClick: onOpenWebsiteSync }}
                />
                <KhSection
                  title="Más fuentes de contenido"
                  description="Proporciona a Copilot fuentes que tus clientes no puedan ver."
                  items={withHandlers([
                    {
                      provider: 'Fragmentos de texto',
                      status: 'No hay…',
                      action: 'Agregar fragmento de código',
                      configured: false,
                      icon: (
                        <span className="w-5 h-5 rounded-[4px] bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
                          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-white" strokeWidth="1.6"><path d="M5 5L3 8l2 3M11 5l2 3-2 3M9 4l-2 8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </span>
                      ),
                    },
                    {
                      provider: 'Documentos',
                      status: 'Ningún documento…',
                      action: 'Cargar documento',
                      configured: false,
                      icon: (
                        <span className="w-5 h-5 rounded-[4px] bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
                          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-white" strokeWidth="1.6"><path d="M4 2h6l3 3v9H4z" strokeLinejoin="round"/><path d="M10 2v3h3M6 9h4M6 11.5h3"/></svg>
                        </span>
                      ),
                    },
                  ])}
                />
              </div>
              <KhChecklist
                title="Comienza a utilizar Copilot"
                items={[
                  { label: 'Añade al menos una fuente de conocimiento' },
                  { label: 'Comienza a utilizar Copilot en el buzón', done: true },
                  { label: 'Optimiza Copilot agregando más fuentes' },
                ]}
              />
            </div>
          </>
        )}

        {tab === 'help' && (
          <>
            <KhProductHero tab="help" />
            <div className="grid grid-cols-[1fr_280px] gap-4">
              <div className="flex flex-col gap-4">
                <KhSection
                  title="Artículos públicos"
                  description="Comparte artículos públicos en tu Centro de ayuda donde los clientes puedan recibir ayuda por cuenta propia."
                  items={withHandlers<KhItem>([
                    { provider: 'Clain',    status: 'No hay artículos…', action: 'Agregar artículo',       configured: false, visibility: 'public' },
                    { provider: 'Intercom', status: 'No configurado',    action: 'Sincronizar o importar', configured: false },
                    { provider: 'Zendesk',  status: 'No configurado',    action: 'Sincronizar o importar', configured: false },
                  ])}
                />
              </div>
              <KhChecklist
                title="Empezar con el Centro de ayuda"
                items={[
                  { label: 'Crea tu primera colección', done: true },
                  { label: 'Publicar un artículo en una colección' },
                  { label: 'Activar tu centro de ayuda' },
                ]}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}

function KnowledgeContenido({
  onCreate,
  onNavigate,
  onAction,
  onSearch,
  onOpenWebsiteSync,
}: {
  onCreate: (opts: { type?: string; visibility?: 'public' | 'internal' }) => void;
  onNavigate: (sub: KnowledgeSubView) => void;
  onAction: (msg: string, type?: 'success' | 'error') => void;
  onSearch: (q: string) => void;
  onOpenWebsiteSync: () => void;
}) {
  // Live data — counts feed both the cards (Recomendaciones) and the table.
  const { data: articlesData } = useApi(() => knowledgeApi.listArticles(), [], []);
  const articles = Array.isArray(articlesData) ? articlesData : [];
  const { data: gapsData } = useApi(() => knowledgeApi.gaps(), [], { gaps: [], alerts: [] });
  const gaps = Array.isArray((gapsData as any)?.gaps) ? (gapsData as any).gaps : [];

  const counts = useMemo(() => {
    let pub = 0, internal = 0, snippet = 0, doc = 0, published = 0;
    let pubService = 0, internalService = 0, snippetService = 0, docService = 0;
    let pubSales = 0, internalSales = 0, snippetSales = 0, docSales = 0;
    for (const a of articles) {
      const visibility = String((a as any).visibility || 'public').toLowerCase();
      const type = String((a as any).type || 'ARTICLE').toUpperCase();
      const status = String((a as any).status || (a as any).state || '').toLowerCase();
      const hasService = !!(a as any).fin_service;
      const hasSales = !!(a as any).fin_sales;
      if (status === 'published' || status === 'active' || status === 'live') published++;
      if (type === 'SNIPPET') {
        snippet++;
        if (hasService) snippetService++;
        if (hasSales) snippetSales++;
      } else if (type === 'DOCUMENT') {
        doc++;
        if (hasService) docService++;
        if (hasSales) docSales++;
      } else if (visibility === 'internal') {
        internal++;
        if (hasService) internalService++;
        if (hasSales) internalSales++;
      } else {
        pub++;
        if (hasService) pubService++;
        if (hasSales) pubSales++;
      }
    }
    return {
      pub, internal, snippet, doc, published, total: articles.length,
      pubService, internalService, snippetService, docService,
      pubSales,   internalSales,   snippetSales,   docSales,
    };
  }, [articles]);

  const [search, setSearch] = useState('');
  function submitSearch() {
    // Carry the query into Artículos, which runs it as a server-side `q` filter.
    onSearch(search.trim());
  }

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M5 6h6M5 9h6M5 11.5h4"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Contenido</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onNavigate('pruebas')} className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
            Probar <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
          </button>
          <button onClick={() => onNavigate('articulos')} className="border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Vista previa</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 border border-[#e9eae6] rounded-full px-4 py-[7px] bg-white">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3"/></svg>
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitSearch(); }}
              className="flex-1 outline-none text-[13px] text-[#1a1a1a] placeholder:text-[#646462]"
            />
            {search && (
              <button onClick={() => setSearch('')} title="Limpiar">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
              </button>
            )}
          </div>
          <button onClick={() => onNavigate('articulos')} className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[7px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="8" cy="6" r="2.5"/><path d="M3 13c0-2 2.5-3 5-3s5 1 5 3"/></svg>
            Audiencia
            <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
          </button>
          <button onClick={() => onNavigate('articulos')} className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[7px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
            <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
            Filtros
          </button>
        </div>

        <div>
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-3">Agregar contenido</h3>
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'Artículo público',         icon: 'doc',     onClick: () => onCreate({ type: 'ARTICLE', visibility: 'public' }) },
              { label: 'Artículo interno',         icon: 'lock',    onClick: () => onCreate({ type: 'ARTICLE', visibility: 'internal' }) },
              { label: 'Fragmento de texto',       icon: 'snippet', onClick: () => onCreate({ type: 'SNIPPET' }) },
              { label: 'Sincronización de sitio web', icon: 'web',  onClick: onOpenWebsiteSync },
              { label: 'Ver todo',                 icon: 'more',    onClick: () => onNavigate('articulos') },
            ].map(c => (
              <button key={c.label} onClick={c.onClick} className="border border-[#e9eae6] rounded-[10px] p-4 flex flex-col items-start gap-2 hover:border-[#c8c9c4] bg-white text-left">
                <div className="w-8 h-8 rounded-[6px] bg-[#f3f3f1] flex items-center justify-center">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.4">
                    {c.icon === 'doc' && <path d="M3.5 2h6l3 3v9a0.5 0.5 0 0 1-.5.5h-8.5A0.5 0.5 0 0 1 3 14V2.5z"/>}
                    {c.icon === 'lock' && <><rect x="3.5" y="6.5" width="9" height="7" rx="1.5"/><path d="M5.5 6.5V5a2.5 2.5 0 0 1 5 0v1.5"/></>}
                    {c.icon === 'snippet' && <><rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/><path d="M5 7l-1.5 1L5 9M11 7l1.5 1-1.5 1M9 5l-2 6"/></>}
                    {c.icon === 'web' && <><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></>}
                    {c.icon === 'more' && <><circle cx="4" cy="8" r="1" fill="#646462" stroke="none"/><circle cx="8" cy="8" r="1" fill="#646462" stroke="none"/><circle cx="12" cy="8" r="1" fill="#646462" stroke="none"/></>}
                  </svg>
                </div>
                <span className="text-[13px] font-medium text-[#1a1a1a]">{c.label}</span>
              </button>
            ))}
            <button onClick={() => onNavigate('gaps')} className="border border-[#e9eae6] rounded-[10px] p-4 flex flex-col items-start gap-2 hover:border-[#c8c9c4] bg-white relative text-left">
              <div className="w-8 h-8 rounded-[6px] bg-[#f3f3f1] flex items-center justify-center">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M3 8h10M8 3v10M5 5l1.5-2M11 5l-1.5-2M5 11l1.5 2M11 11l-1.5 2"/></svg>
              </div>
              <span className="text-[13px] font-medium text-[#1a1a1a]">Recomendaciones <span className="ml-1 text-[#646462] font-normal">{gaps.length}</span></span>
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462] absolute top-3 right-3"><path d="M5 3h8v8h-2V6.4l-6.3 6.3-1.4-1.4L9.6 5H5z"/></svg>
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-3">Fuente de contenido</h3>
          <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
            <div className="grid grid-cols-[1fr_140px_140px_80px_80px_80px] px-5 py-3 border-b border-[#f1f1ee] text-[12px] font-medium text-[#646462]">
              <div className="flex items-center gap-1">Título</div>
              <div>Estado</div>
              <div>Centro de ayuda</div>
              <div>Copilot</div>
              <div>Servicio</div>
              <div>Ventas</div>
            </div>
            {[
              { label: 'Artículos públicos',  desc: 'Visibles en el centro de ayuda', n: counts.pub,      nSvc: counts.pubService,      nSal: counts.pubSales,      sub: 'articulos' as const },
              { label: 'Artículos internos',  desc: 'Sólo para Copilot y el equipo',  n: counts.internal, nSvc: counts.internalService, nSal: counts.internalSales, sub: 'articulos' as const },
              { label: 'Fragmentos de texto', desc: 'Bloques reutilizables',           n: counts.snippet,  nSvc: counts.snippetService,  nSal: counts.snippetSales,  sub: 'articulos' as const },
              { label: 'Documentos',          desc: 'PDFs y archivos importados',      n: counts.doc,      nSvc: counts.docService,      nSal: counts.docSales,      sub: 'articulos' as const },
            ].map((row, idx) => (
              <button
                key={row.label}
                onClick={() => onNavigate(row.sub)}
                className={`w-full text-left grid grid-cols-[1fr_140px_140px_80px_80px_80px] px-5 py-3 items-center hover:bg-[#fafaf9] ${idx > 0 ? 'border-t border-[#f1f1ee]' : ''}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462] flex-shrink-0" strokeWidth="1.4"><path d="M3.5 2h6l3 3v9a0.5 0.5 0 0 1-.5.5h-8.5A0.5 0.5 0 0 1 3 14V2.5z"/></svg>
                  <span className="text-[13px] text-[#1a1a1a] font-medium">{row.label}</span>
                  <span className="text-[12px] text-[#646462] truncate">· {row.desc}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${row.n > 0 ? 'bg-[#22c55e]' : 'bg-[#d4d4d2]'}`} />
                  <span className="text-[12px] text-[#1a1a1a]">{row.n} {row.n === 1 ? 'activo' : 'activos'}</span>
                </div>
                <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${row.n > 0 ? 'bg-[#22c55e]' : 'bg-[#d4d4d2]'}`}/><span className="text-[12px] text-[#646462]">{row.n > 0 ? 'Activo' : '—'}</span></div>
                <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${row.n > 0 ? 'bg-[#22c55e]' : 'bg-[#d4d4d2]'}`}/><span className="text-[12px] text-[#646462]">{row.n > 0 ? 'Activo' : '—'}</span></div>
                <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${row.nSvc > 0 ? 'bg-[#22c55e]' : 'bg-[#d4d4d2]'}`}/><span className="text-[12px] text-[#646462]">{row.nSvc > 0 ? 'Activo' : '—'}</span></div>
                <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${row.nSal > 0 ? 'bg-[#22c55e]' : 'bg-[#d4d4d2]'}`}/><span className="text-[12px] text-[#646462]">{row.nSal > 0 ? 'Activo' : '—'}</span></div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// Curated emoji set for folder icons (matches the Intercom folder-icon vibe).
const KH_FOLDER_EMOJIS = ['📁','📂','🗂️','📚','📖','📝','💬','🛟','💳','📦','🚚','⚙️','🔧','🏷️','⭐','🎯','🧾','🔒','🧠','👋','😎','🚀','💡','✅','❤️','🌎'];

// KnowledgeFolderModal — create/edit a domain (carpeta) or subfolder via knowledgeApi.
function KnowledgeFolderModal({
  initial,
  parent,
  onClose,
  onSaved,
  onAction,
}: {
  // Pass a domain to enter edit mode; omit for create mode.
  initial?: { id: string; name: string; description?: string; icon?: string } | null;
  // Pass a parent to create a subfolder under it.
  parent?: { id: string; name: string } | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  onAction: (msg: string, type?: 'success' | 'error') => void;
}) {
  const editing = !!initial?.id;
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [icon, setIcon] = useState(initial?.icon || '');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      if (editing && initial?.id) {
        await knowledgeApi.updateDomain(initial.id, { name: trimmed, description: description.trim() || null, icon: icon || null });
        onAction('Carpeta actualizada');
        onSaved(initial.id);
      } else {
        const created = await knowledgeApi.createDomain({ name: trimmed, description: description.trim() || undefined, icon: icon || null, parent_id: parent?.id ?? null });
        const id = created?.id || created?.domain?.id;
        if (id) onSaved(String(id));
        else { onAction(parent ? 'Subcarpeta creada' : 'Carpeta creada'); onClose(); }
      }
    } catch (err: any) {
      onAction(err?.message || (editing ? 'No se pudo actualizar' : 'No se pudo crear la carpeta'), 'error');
    } finally { setBusy(false); }
  }
  const title = editing ? 'Editar carpeta' : parent ? `Nueva subcarpeta` : 'Nueva carpeta de conocimiento';
  return (
    <div className="fixed inset-0 z-50 bg-black/25 flex items-center justify-center" onClick={onClose}>
      <div
        className="relative w-[460px] rounded-2xl bg-white border border-[#e9eae6] shadow-[0px_16px_40px_rgba(20,20,20,0.22)] p-5"
        onClick={e => { setEmojiOpen(false); e.stopPropagation(); }}
      >
        {/* Emoji dropdown — opens to the LEFT of the modal card. */}
        {emojiOpen && (
          <div
            onClick={e => e.stopPropagation()}
            className="absolute top-0 right-full mr-3 w-[212px] rounded-2xl bg-white border border-[#e9eae6] shadow-[0px_16px_40px_rgba(20,20,20,0.22)] p-3 z-10"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462] px-1 mb-2">Elige un icono</p>
            <div className="grid grid-cols-5 gap-1 max-h-[220px] overflow-y-auto">
              <button
                onClick={() => { setIcon(''); setEmojiOpen(false); }}
                title="Sin icono"
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-[13px] text-[#646462] border ${!icon ? 'border-[#1a1a1a] bg-[#f3f3f1]' : 'border-transparent hover:bg-[#f3f3f1]'}`}
              >—</button>
              {KH_FOLDER_EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => { setIcon(e); setEmojiOpen(false); }}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-[19px] leading-none border ${icon === e ? 'border-[#1a1a1a] bg-[#f3f3f1]' : 'border-transparent hover:bg-[#f3f3f1]'}`}
                >{e}</button>
              ))}
            </div>
          </div>
        )}

        <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">{title}</h3>
        <p className="text-[12.5px] text-[#646462] mb-4">
          {parent
            ? <>Subcarpeta dentro de <span className="font-medium text-[#1a1a1a]">{parent.name}</span>. Agrupa artículos y políticas.</>
            : <>Las carpetas agrupan artículos y políticas. Fin y Copilot pueden filtrar por carpeta.</>}
        </p>

        {/* Icono (abre el desplegable) + nombre */}
        <label className="block text-[12px] font-semibold text-[#646462] mb-1.5">Icono y nombre</label>
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEmojiOpen(o => !o); }}
            title="Elegir icono"
            className={`w-9 h-9 rounded-lg border flex items-center justify-center text-[18px] leading-none flex-shrink-0 transition-colors ${emojiOpen ? 'border-[#1a1a1a] bg-[#f3f3f1]' : 'border-[#e9eae6] bg-[#f8f8f7] hover:bg-[#f3f3f1]'}`}
          >
            {icon || <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M2 5a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" /></svg>}
          </button>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) submit(); }}
            placeholder="Reembolsos, Envíos, Facturación…"
            className="flex-1 h-9 rounded-lg border border-[#e9eae6] px-3 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
          />
        </div>

        <label className="block text-[12px] font-semibold text-[#646462] mb-1">Descripción (opcional)</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Política y artículos relacionados con…"
          className="w-full min-h-[60px] rounded-lg border border-[#e9eae6] px-3 py-2 text-[13px] resize-none focus:outline-none focus:border-[#1a1a1a]"
        />
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={busy} className="h-8 px-4 rounded-full bg-[#f8f8f7] text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#ededea]">Cancelar</button>
          <button onClick={submit} disabled={busy || !name.trim()} className="h-8 px-4 rounded-full bg-[#1a1a1a] text-white text-[13px] font-semibold disabled:bg-[#e9eae6] disabled:text-[#646462]">{busy ? (editing ? 'Guardando…' : 'Creando…') : (editing ? 'Guardar' : parent ? 'Crear subcarpeta' : 'Crear carpeta')}</button>
        </div>
      </div>
    </div>
  );
}

// KnowledgeMoveFolderModal — move a folder to another parent (or to the top
// level). Same chrome as KnowledgeFolderModal. NB: responses are camelCased.
function KnowledgeMoveFolderModal({
  folder,
  onClose,
  onMoved,
  onAction,
}: {
  folder: any;
  onClose: () => void;
  onMoved: () => void;
  onAction: (msg: string, type?: 'success' | 'error') => void;
}) {
  const { data: domainsData } = useApi(() => knowledgeApi.listDomains(), [], []);
  const domains = (Array.isArray(domainsData) ? domainsData : []) as any[];
  const childIds = new Set(domains.filter((d: any) => d.parentId === folder.id).map((d: any) => d.id));
  // Valid destinations: top-level folders that aren't this folder or its children.
  const targets = domains.filter((d: any) => !d.parentId && d.id !== folder.id && !childIds.has(d.id));
  const [busy, setBusy] = useState(false);
  async function moveTo(parentId: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      await knowledgeApi.updateDomain(folder.id, { parent_id: parentId });
      onAction(parentId ? 'Carpeta movida' : 'Movida al nivel superior');
      onMoved();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo mover la carpeta', 'error');
    } finally { setBusy(false); }
  }
  const Row = ({ icon, label, selected, onClick }: { icon: ReactNode; label: string; selected?: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      disabled={busy}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-left ${selected ? 'bg-[#f3f3f1] font-semibold text-[#1a1a1a]' : 'text-[#1a1a1a] hover:bg-[#f5f5f4]'}`}
    >
      <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {selected && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#1a1a1a]" strokeWidth="2" strokeLinecap="round"><path d="M3 8l3.5 3.5L13 5"/></svg>}
    </button>
  );
  return (
    <div className="fixed inset-0 z-50 bg-black/25 flex items-center justify-center" onClick={onClose}>
      <div className="w-[440px] rounded-2xl bg-white border border-[#e9eae6] shadow-[0px_16px_40px_rgba(20,20,20,0.22)] p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">Mover carpeta</h3>
        <p className="text-[12.5px] text-[#646462] mb-4">Elige dónde colocar <span className="font-medium text-[#1a1a1a]">{folder.name}</span>.</p>
        <div className="flex flex-col gap-0.5 max-h-[280px] overflow-y-auto -mx-1 px-1">
          <Row
            icon={<svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v8M4.5 6.5L8 3l3.5 3.5M3 13h10"/></svg>}
            label="Nivel superior (sin carpeta padre)"
            selected={!folder.parentId}
            onClick={() => moveTo(null)}
          />
          {targets.length > 0 && <div className="border-t border-[#f1f1ee] my-1" />}
          {targets.map((d: any) => (
            <Row
              key={d.id}
              icon={d.icon ? <span className="text-[15px] leading-none">{d.icon}</span> : <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M2 5a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5z"/></svg>}
              label={d.name}
              selected={folder.parentId === d.id}
              onClick={() => moveTo(d.id)}
            />
          ))}
          {targets.length === 0 && !folder.parentId && (
            <p className="px-3 py-3 text-[12.5px] text-[#646462] italic">No hay otras carpetas de nivel superior a las que mover.</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={busy} className="h-8 px-4 rounded-full bg-[#f8f8f7] text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#ededea]">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// Type badge with a leading glyph (Carpeta / Artículo público / interno / …),
// mirroring Intercom's article-type chips.
function KhTypeBadge({ kind }: { kind: string }) {
  const folderIcon = <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M2 5a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5z"/></svg>;
  const bookIcon   = <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M2.5 3.2v9.6c1.7-.6 3.4-.6 5.5 0 2.1-.6 3.8-.6 5.5 0V3.2c-1.7-.6-3.4-.6-5.5 0C5.9 2.6 4.2 2.6 2.5 3.2z"/><path d="M8 3.2v9.6"/></svg>;
  const lockIcon   = <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5.5a2.5 2.5 0 015 0V7" strokeLinecap="round"/></svg>;
  const docIcon    = <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M4 2h6l3 3v9H4z" strokeLinejoin="round"/><path d="M10 2v3h3"/></svg>;
  const codeIcon   = <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M5 5L3 8l2 3M11 5l2 3-2 3M9 4l-2 8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  const globeIcon  = <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg>;
  const K: Record<string, { label: string; cls: string; icon: ReactNode }> = {
    folder:   { label: 'Carpeta',          cls: 'bg-[#eef1f6] text-[#3f5170]', icon: folderIcon },
    public:   { label: 'Artículo público', cls: 'bg-[#e9f2ec] text-[#2f6b4f]', icon: bookIcon },
    internal: { label: 'Artículo interno', cls: 'bg-[#fbf1e3] text-[#9a6a24]', icon: lockIcon },
    snippet:  { label: 'Fragmento',        cls: 'bg-[#f3f3f1] text-[#646462]', icon: codeIcon },
    document: { label: 'Documento',        cls: 'bg-[#f3f3f1] text-[#646462]', icon: docIcon },
    website:  { label: 'Sitio web',        cls: 'bg-[#f3f3f1] text-[#646462]', icon: globeIcon },
    policy:   { label: 'Política',         cls: 'bg-[#f3f3f1] text-[#646462]', icon: docIcon },
  };
  const m = K[kind] ?? { label: titleCase(kind), cls: 'bg-[#f3f3f1] text-[#646462]', icon: docIcon };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-medium ${m.cls}`}>
      {m.icon}<span>{m.label}</span>
    </span>
  );
}
function articleKind(a: any): string {
  const t = String(a.type || 'article').toLowerCase();
  if (t === 'article') return String(a.visibility || 'public') === 'internal' ? 'internal' : 'public';
  return t;
}

// KnowledgeArticulos — list + filter + create + publish, optionally scoped to a folder.
function KnowledgeArticulos({
  onAction,
  onRefresh,
  domainFilter,
  externalDraft,
  onConsumeDraft,
  initialSearch,
  onOpenFolder,
  onCreateSubfolder,
}: {
  onAction: (msg: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
  domainFilter: string | null;
  // When another sub-view sends the user here with a pre-filled draft
  // ("Crear borrador desde vacío") or an existing article picked in the
  // "Agregar artículo" modal, open the editor automatically with this payload,
  // then call onConsumeDraft to clear the parent. An `id` means edit mode.
  externalDraft?: Record<string, any> | null;
  onConsumeDraft?: () => void;
  // Seed the search box when arriving from the Contenido search bar.
  initialSearch?: string;
  // Folder navigation (only meaningful inside a folder view).
  onOpenFolder?: (id: string) => void;
  onCreateSubfolder?: (parent: { id: string; name: string }) => void;
}) {
  const [search, setSearch] = useState(initialSearch ?? '');
  // Adopt a new query handed in from Contenido (server-side `q` filter below).
  useEffect(() => { if (initialSearch !== undefined) setSearch(initialSearch); }, [initialSearch]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<'all' | 'ok' | 'stale'>('all');
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  // Bulk-select state for the publish-multi flow.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Pop the editor when an external draft (from Vacíos) is handed in.
  useEffect(() => {
    if (externalDraft) {
      // Spread the full payload so an existing article keeps its id/body/etc.
      // (→ editor opens in edit mode). id-less drafts stay in create mode.
      setEditing({
        ...externalDraft,
        title: externalDraft.title ?? '',
        content: externalDraft.content ?? externalDraft.body ?? '',
        type: (externalDraft.type || 'ARTICLE'),
        visibility: externalDraft.visibility || 'public',
        domain_id: externalDraft.domain_id || domainFilter || '',
      });
      onConsumeDraft?.();
    }
  }, [externalDraft, domainFilter, onConsumeDraft]);

  const { data: domainsData } = useApi(() => knowledgeApi.listDomains(), [refreshKey, domainFilter], []);
  const domains = (Array.isArray(domainsData) ? domainsData : []) as any[];
  // Subfolders of the folder we're currently viewing (shown as rows on top).
  // NB: the API client camelCases responses → `parent_id` becomes `parentId`.
  const subfolders = domainFilter ? domains.filter((d: any) => d.parentId === domainFilter) : [];

  const { data: articlesData, loading } = useApi(
    () => {
      const params: Record<string, string> = {};
      if (domainFilter) params.domain_id = domainFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all')   params.type   = typeFilter.toLowerCase();
      if (search.trim())          params.q      = search.trim();
      return knowledgeApi.listArticles(Object.keys(params).length ? params : undefined);
    },
    [domainFilter, statusFilter, typeFilter, search, refreshKey],
    [],
  );
  const allArticles = Array.isArray(articlesData) ? articlesData : [];
  // Health is returned per-row by the backend ('ok' | 'stale'). Client-side
  // filter so we don't have to round-trip on each toggle.
  const articles = healthFilter === 'all'
    ? allArticles
    : allArticles.filter((a: any) => String(a.health || 'ok').toLowerCase() === healthFilter);
  const currentFolder = domainFilter ? domains.find((d: any) => d.id === domainFilter) : null;
  const folderName = domainFilter ? (currentFolder?.name || 'Carpeta') : null;

  // Reset selection when filters change to avoid leaking ids the user can no
  // longer see in the list.
  useEffect(() => { setSelectedIds(new Set()); }, [domainFilter, statusFilter, typeFilter, search, healthFilter, refreshKey]);

  function toggleSelect(id: string) {
    setSelectedIds(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds(s => {
      const visible = articles.map((a: any) => a.id);
      const allSelected = visible.length > 0 && visible.every((id: string) => s.has(id));
      if (allSelected) {
        const next = new Set(s);
        visible.forEach((id: string) => next.delete(id));
        return next;
      }
      const next = new Set(s);
      visible.forEach((id: string) => next.add(id));
      return next;
    });
  }
  const draftSelectedCount = articles.filter((a: any) => selectedIds.has(a.id) && a.status !== 'published').length;

  async function publish(id: string) {
    try {
      await knowledgeApi.publishArticle(id);
      onAction('Artículo publicado');
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      onAction(err?.message || 'No se pudo publicar', 'error');
    }
  }
  async function bulkPublish() {
    if (bulkBusy || draftSelectedCount === 0) return;
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const a of articles) {
      if (!selectedIds.has(a.id) || a.status === 'published') continue;
      try { await knowledgeApi.publishArticle(a.id); ok++; }
      catch { fail++; }
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
    setRefreshKey(k => k + 1);
    onAction(fail === 0 ? `${ok} artículo${ok === 1 ? '' : 's'} publicado${ok === 1 ? '' : 's'}` : `${ok} publicados, ${fail} fallaron`, fail === 0 ? 'success' : 'error');
  }

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {folderName && (
            currentFolder?.icon
              ? <span className="text-[18px] leading-none flex-shrink-0">{currentFolder.icon}</span>
              : <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a] flex-shrink-0" strokeWidth="1.5">
                  <path d="M2 5a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5z"/>
                </svg>
          )}
          <h1 className="text-[18px] font-bold text-[#1a1a1a] truncate">{folderName || 'Artículos'}</h1>
          <span className="text-[12.5px] text-[#646462]">· {articles.length + subfolders.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {domainFilter && onCreateSubfolder && (
            <button
              onClick={() => onCreateSubfolder({ id: domainFilter, name: folderName || 'Carpeta' })}
              className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]"
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M2 5a1 1 0 011-1h3.5l1.5 1.5H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5z"/><path d="M8 8v3M6.5 9.5h3" strokeLinecap="round"/></svg>
              Nueva subcarpeta
            </button>
          )}
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-3 py-[6px] text-[13px] font-semibold hover:bg-black"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
            Nuevo artículo
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 px-6 py-3 border-b border-[#f1f1ee] flex-shrink-0">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por título o contenido…"
          className="flex-1 h-9 rounded-lg border border-[#e9eae6] px-3 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
        />
        <Dropdown
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as any)}
          triggerClassName="h-9 px-3 rounded-lg border border-[#e9eae6] bg-white flex items-center gap-2 text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
          items={[
            { value: 'all',       label: 'Estado: cualquiera' },
            { value: 'published', label: 'Publicado',          icon: <span className="w-2 h-2 rounded-full bg-[#15803d]"/> },
            { value: 'draft',     label: 'Borrador',           icon: <span className="w-2 h-2 rounded-full bg-[#a4a4a2]"/> },
          ]}
        />
        <Dropdown
          value={typeFilter}
          onChange={setTypeFilter}
          triggerClassName="h-9 px-3 rounded-lg border border-[#e9eae6] bg-white flex items-center gap-2 text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
          items={[
            { value: 'all', label: 'Tipo: cualquiera' },
            ...KH_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label })),
          ]}
        />
        <Dropdown
          value={healthFilter}
          onChange={(v) => setHealthFilter(v as any)}
          triggerClassName="h-9 px-3 rounded-lg border border-[#e9eae6] bg-white flex items-center gap-2 text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
          items={[
            { value: 'all',   label: 'Salud: cualquiera' },
            { value: 'ok',    label: 'Al día',           icon: <span className="w-2 h-2 rounded-full bg-[#15803d]"/> },
            { value: 'stale', label: 'Desactualizados',  icon: <span className="w-2 h-2 rounded-full bg-[#dc2626]"/> },
          ]}
        />
      </div>
      {/* Bulk-action bar — appears as soon as one or more rows are selected. */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-6 py-2 bg-[#f4f4ff] border-b border-[#dadbf3]">
          <span className="text-[12.5px] text-[#1a1a1a]">
            <strong>{selectedIds.size}</strong> seleccionado{selectedIds.size === 1 ? '' : 's'} · {draftSelectedCount} borrador{draftSelectedCount === 1 ? '' : 'es'}
          </span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setSelectedIds(new Set())} className="text-[12px] font-semibold text-[#646462] hover:text-[#1a1a1a]">Limpiar</button>
            <button
              onClick={bulkPublish}
              disabled={bulkBusy || draftSelectedCount === 0}
              className="h-7 px-3 rounded-full bg-[#1a1a1a] text-white text-[12px] font-semibold disabled:bg-[#e9eae6] disabled:text-[#646462]"
            >
              {bulkBusy ? 'Publicando…' : `Publicar ${draftSelectedCount} borrador${draftSelectedCount === 1 ? '' : 'es'}`}
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && <div className="px-6 py-8 text-[13px] text-[#646462]">Cargando artículos…</div>}
        {!loading && articles.length === 0 && subfolders.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Sin artículos todavía</p>
            <p className="text-[13px] text-[#646462] mb-4">Crea el primer artículo {folderName ? `en "${folderName}"` : ''} para que Fin y Copilot puedan responder con tu conocimiento.</p>
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-2 text-[13px] font-semibold hover:bg-black"
            >+ Crear artículo</button>
          </div>
        )}
        {!loading && (articles.length > 0 || subfolders.length > 0) && (
          <table className="w-full">
            <thead className="bg-[#f8f8f7] sticky top-0">
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-[#646462]">
                <th className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={articles.length > 0 && articles.every((a: any) => selectedIds.has(a.id))}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 accent-[#1a1a1a] cursor-pointer"
                    title="Seleccionar todo"
                  />
                </th>
                <th className="text-left px-3 py-2.5">Título</th>
                <th className="text-left px-3 py-2.5">Tipo</th>
                <th className="text-left px-3 py-2.5">Carpeta</th>
                <th className="text-left px-3 py-2.5">Estado</th>
                <th className="text-left px-3 py-2.5">Salud</th>
                <th className="text-left px-3 py-2.5">Actualizado</th>
                <th className="text-right px-6 py-2.5">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {/* Subfolders first — rows of type "Carpeta" that drill in on click. */}
              {subfolders.map((f: any) => (
                <tr
                  key={f.id}
                  onClick={() => onOpenFolder?.(f.id)}
                  className="border-t border-[#f1f1ee] hover:bg-[#f8f8f7] cursor-pointer"
                >
                  <td className="px-3 py-3 w-8" />
                  <td className="px-3 py-3 text-[13px] text-[#1a1a1a] font-medium max-w-[300px] truncate">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-[15px] leading-none">{f.icon || '📁'}</span>
                      {f.name}
                    </span>
                  </td>
                  <td className="px-3 py-3"><KhTypeBadge kind="folder" /></td>
                  <td className="px-3 py-3 text-[12.5px] text-[#646462] truncate max-w-[140px]">{folderName || '—'}</td>
                  <td className="px-3 py-3 text-[12px] text-[#646462]">—</td>
                  <td className="px-3 py-3 text-[12px] text-[#646462]">—</td>
                  <td className="px-3 py-3 text-[12px] text-[#646462]">{relativeTime(f.createdAt || f.created_at)}</td>
                  <td className="px-6 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#646462]">
                      Abrir
                      <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M6 4l4 4-4 4z"/></svg>
                    </span>
                  </td>
                </tr>
              ))}
              {articles.map((a: any) => {
                const isStale = String(a.health || 'ok').toLowerCase() === 'stale';
                return (
                  <tr key={a.id} className={`border-t border-[#f1f1ee] hover:bg-[#f8f8f7] ${selectedIds.has(a.id) ? 'bg-[#f4f4ff]' : ''}`}>
                    <td className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        className="w-3.5 h-3.5 accent-[#1a1a1a] cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-3 text-[13px] text-[#1a1a1a] font-medium max-w-[300px] truncate">{a.title || 'Sin título'}</td>
                    <td className="px-3 py-3"><KhTypeBadge kind={articleKind(a)} /></td>
                    <td className="px-3 py-3 text-[12.5px] text-[#646462] truncate max-w-[140px]">{a.domain_name || a.domain || '—'}</td>
                    <td className="px-3 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${a.status === 'published' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#f3f3f1] text-[#646462]'}`}>
                        {a.status === 'published' ? 'Publicado' : 'Borrador'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${isStale ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-[#dcfce7] text-[#15803d]'}`}>
                        {isStale ? 'Desactualizado' : 'Al día'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-[#646462]">{relativeTime(a.updated_at || a.created_at)}</td>
                    <td className="px-6 py-3 text-right">
                      <button onClick={() => setEditing(a)} className="text-[12px] font-semibold text-[#1a1a1a] hover:underline mr-3">Editar</button>
                      {a.status !== 'published' && (
                        <button onClick={() => publish(a.id)} className="text-[12px] font-semibold text-[#15803d] hover:underline">Publicar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {(creating || editing) && (
        <KnowledgeArticleEditor
          initial={editing || (domainFilter ? { domain_id: domainFilter } : undefined)}
          domains={domains}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setRefreshKey(k => k + 1); onRefresh(); }}
          onAction={onAction}
        />
      )}
    </>
  );
}

// KnowledgeGaps — surfaces missing/stale topics so the agent can fill them.
function KnowledgeGaps({ onAction, onDraftFromGap }: {
  onAction: (msg: string, type?: 'success' | 'error') => void;
  onDraftFromGap?: (gap: any) => void;
}) {
  const { data: gapsData, loading, error } = useApi(() => knowledgeApi.gaps(), [], null);
  const stats = gapsData?.stats || {};
  const gaps: any[] = Array.isArray(gapsData?.gaps) ? gapsData.gaps : [];
  const problems: any[] = Array.isArray(gapsData?.problemArticles) ? gapsData.problemArticles : [];
  const alerts: any[] = Array.isArray(gapsData?.alerts) ? gapsData.alerts : [];

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><path d="M8 1.5l7 13H1z"/><path d="M8 6v3M8 11v.5"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Vacíos de conocimiento</h1>
        </div>
        <button
          onClick={() => onAction('Listo para crear artículos a partir de los vacíos')}
          className="text-[13px] font-medium text-[#1a1a1a] hover:underline"
        >Aprender ↗</button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 flex flex-col gap-4">
        {loading && <p className="text-[13px] text-[#646462]">Calculando vacíos…</p>}
        {error && <p className="text-[13px] text-[#b91c1c]">No se pudo cargar el análisis.</p>}
        {!loading && gapsData && (
          <>
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-white border border-[#e9eae6] rounded-[10px] p-3">
                <p className="text-[11px] uppercase tracking-wide text-[#646462] font-semibold">Sin respuesta</p>
                <p className="text-[20px] font-semibold text-[#1a1a1a] mt-1">{stats.unanswered ?? 0}</p>
              </div>
              <div className="bg-white border border-[#e9eae6] rounded-[10px] p-3">
                <p className="text-[11px] uppercase tracking-wide text-[#646462] font-semibold">Escalados</p>
                <p className="text-[20px] font-semibold text-[#1a1a1a] mt-1">{stats.escalations ?? 0}</p>
              </div>
              <div className="bg-white border border-[#e9eae6] rounded-[10px] p-3">
                <p className="text-[11px] uppercase tracking-wide text-[#646462] font-semibold">Cobertura desactualizada</p>
                <p className="text-[20px] font-semibold text-[#1a1a1a] mt-1">{stats.staleCoverage ?? 0}</p>
              </div>
              <div className="bg-white border border-[#e9eae6] rounded-[10px] p-3">
                <p className="text-[11px] uppercase tracking-wide text-[#646462] font-semibold">Score cobertura</p>
                <p className="text-[20px] font-semibold text-[#1a1a1a] mt-1">{stats.coverageScore ?? '—'}</p>
              </div>
            </div>

            {alerts.length > 0 && (
              <div>
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-2">Alertas de cobertura ({alerts.length})</h3>
                <div className="flex flex-col gap-2">
                  {alerts.map((a: any) => (
                    <div key={a.id} className="bg-[#fef7f7] border border-[#fde2e2] rounded-[10px] p-3 flex items-start gap-2">
                      <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#b91c1c] flex-shrink-0 mt-0.5"><path d="M8 1.5l7 13H1z"/><path d="M8 6v3" stroke="white" strokeWidth="1.4"/><circle cx="8" cy="11.5" r="0.6" fill="white"/></svg>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#1a1a1a]">{a.title}</p>
                        {a.detail && <p className="text-[12px] text-[#646462] leading-[18px] mt-0.5">{a.detail}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-2">Vacíos detectados ({gaps.length})</h3>
              {gaps.length === 0 && <p className="text-[12.5px] text-[#646462]">Todo cubierto. La IA ha podido responder a las preguntas recientes.</p>}
              <div className="flex flex-col gap-2">
                {gaps.slice(0, 12).map((g: any, i: number) => (
                  <div key={`${g.topic}-${i}`} className="bg-white border border-[#e9eae6] rounded-[10px] p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-[13px] font-semibold text-[#1a1a1a]">{g.topic}</p>
                      <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
                        g.status === 'missing' ? 'bg-[#fee2e2] text-[#b91c1c]' :
                        g.status === 'stale'   ? 'bg-[#fef3c7] text-[#92400e]' :
                        g.status === 'weak'    ? 'bg-[#dbeafe] text-[#1e40af]' :
                                                 'bg-[#dcfce7] text-[#15803d]'
                      }`}>
                        {g.status === 'missing' ? 'Falta' : g.status === 'stale' ? 'Desactualizado' : g.status === 'weak' ? 'Débil' : 'Cubierto'}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#646462] mb-1.5">{g.whyItMatters || g.recommendedAction}</p>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 text-[11px] text-[#646462] min-w-0">
                        <span>{g.frequency || 0} preguntas</span>
                        {g.unresolvedCases > 0 && <span>· {g.unresolvedCases} sin resolver</span>}
                        {g.escalations > 0 && <span>· {g.escalations} escalados</span>}
                        {g.suggestedDomain && <span className="truncate">· Sugerido: {g.suggestedDomain}</span>}
                      </div>
                      {onDraftFromGap && (
                        <button
                          onClick={() => onDraftFromGap(g)}
                          className="flex-shrink-0 h-7 px-3 rounded-full bg-[#1a1a1a] text-white text-[11.5px] font-semibold hover:bg-black"
                          title="Crear un artículo borrador a partir de este vacío"
                        >
                          Crear borrador
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {problems.length > 0 && (
              <div>
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-2">Artículos con problemas ({problems.length})</h3>
                <div className="flex flex-col gap-2">
                  {problems.slice(0, 8).map((p: any) => (
                    <div key={p.id} className="bg-white border border-[#e9eae6] rounded-[10px] p-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{p.title}</p>
                        <p className="text-[12px] text-[#646462]">{p.issue} · {p.citationCount || 0} citas</p>
                      </div>
                      <span className="text-[11px] text-[#646462] flex-shrink-0">{p.domain}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// KnowledgePruebas — query playground that calls /knowledge/test.
function KnowledgePruebas({ onAction }: { onAction: (msg: string, type?: 'success' | 'error') => void }) {
  const [query, setQuery] = useState('Política de reembolso de plan anual');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [agentId, setAgentId] = useState<string>('all');
  // Optional scope: pick specific articles to constrain the search to.
  const [articleScope, setArticleScope] = useState<Set<string>>(new Set());
  const [showArticlePicker, setShowArticlePicker] = useState(false);

  // Load agents + articles once for the selectors. Agents endpoint is shared
  // with Fin AI Studio so the same dropdown semantics apply here.
  const { data: agentsData } = useApi(() => agentsApi.list(), [], []);
  const { data: articlesData } = useApi(() => knowledgeApi.listArticles(), [], []);
  const agents = Array.isArray(agentsData) ? agentsData : [];
  const articles = Array.isArray(articlesData) ? articlesData : [];

  async function run() {
    if (!query.trim() || running) return;
    setRunning(true);
    try {
      const payload = await knowledgeApi.test({
        query: query.trim(),
        agentId: agentId === 'all' ? null : agentId,
        selectedArticleIds: Array.from(articleScope),
      });
      setResult(payload);
    } catch (err: any) {
      onAction(err?.message || 'No se pudo ejecutar la prueba', 'error');
      setResult(null);
    } finally { setRunning(false); }
  }
  function toggleArticleInScope(id: string) {
    setArticleScope(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const verdict = result?.summary?.verdict;
  const verdictClass = verdict === 'strong' ? 'bg-[#dcfce7] text-[#15803d]'
                     : verdict === 'partial' ? 'bg-[#fef3c7] text-[#92400e]'
                     : verdict === 'missing' ? 'bg-[#fee2e2] text-[#b91c1c]'
                     : 'bg-[#f3f3f1] text-[#646462]';

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Probar conocimiento</h1>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && query.trim()) run(); }}
            placeholder="Pregunta como un cliente: «¿cómo cancelo mi plan anual?»"
            className="flex-1 h-9 rounded-lg border border-[#e9eae6] px-3 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
          />
          <select
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            className="h-9 rounded-lg border border-[#e9eae6] px-2 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
            title="Limita la prueba al conocimiento que ve un agente concreto"
          >
            <option value="all">Todos los agentes</option>
            {agents.map((a: any) => (
              <option key={a.id || a.slug} value={a.id || a.slug}>{a.name || a.slug}</option>
            ))}
          </select>
          <button
            onClick={() => setShowArticlePicker(s => !s)}
            className={`h-9 px-3 rounded-lg border text-[12.5px] font-semibold ${articleScope.size > 0 ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-[#1a1a1a] border-[#e9eae6] hover:bg-[#f8f8f7]'}`}
            title="Limita la prueba a un subconjunto de artículos"
          >
            {articleScope.size > 0 ? `${articleScope.size} artículo${articleScope.size === 1 ? '' : 's'}` : 'Artículos: todos'}
          </button>
          <button
            onClick={run}
            disabled={!query.trim() || running}
            className="h-9 px-4 rounded-full bg-[#1a1a1a] text-white text-[13px] font-semibold disabled:bg-[#e9eae6] disabled:text-[#646462]"
          >{running ? 'Probando…' : 'Probar'}</button>
        </div>

        {showArticlePicker && (
          <div className="bg-white border border-[#e9eae6] rounded-[10px] p-3 max-h-[260px] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12.5px] font-semibold text-[#1a1a1a]">Limitar a artículos seleccionados ({articleScope.size}/{articles.length})</p>
              {articleScope.size > 0 && (
                <button onClick={() => setArticleScope(new Set())} className="text-[11.5px] font-semibold text-[#646462] hover:text-[#1a1a1a]">Limpiar</button>
              )}
            </div>
            {articles.length === 0 && <p className="text-[12px] text-[#646462]">Aún no hay artículos publicados.</p>}
            <div className="flex flex-col gap-0.5">
              {articles.map((a: any) => (
                <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#f8f8f7] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={articleScope.has(a.id)}
                    onChange={() => toggleArticleInScope(a.id)}
                    className="w-3.5 h-3.5 accent-[#1a1a1a]"
                  />
                  <span className="text-[12.5px] text-[#1a1a1a] truncate flex-1">{a.title || 'Sin título'}</span>
                  <span className="text-[11px] text-[#646462] flex-shrink-0">{a.domain_name || a.domain || '—'}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {!result && !running && (
          <div className="bg-white border border-[#e9eae6] rounded-[10px] p-5 text-center">
            <p className="text-[13.5px] font-semibold text-[#1a1a1a] mb-1">Lanza una consulta de prueba</p>
            <p className="text-[12.5px] text-[#646462]">Te dirá qué artículos cubren la pregunta, qué se le bloquea por permisos, y qué falta.</p>
          </div>
        )}

        {result && (
          <>
            <div className="bg-white border border-[#e9eae6] rounded-[10px] p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[13px] font-semibold text-[#1a1a1a]">Veredicto</p>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${verdictClass}`}>
                  {verdict || 'desconocido'}
                </span>
              </div>
              <p className="text-[12.5px] text-[#1a1a1a] leading-5">{result.summary?.suggestedNextStep || 'Sin sugerencia.'}</p>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-[#646462]">
                <span>{result.summary?.matchedSources ?? 0} fuentes encontradas</span>
                <span>· {result.summary?.healthySources ?? 0} accesibles</span>
                <span>· {result.summary?.blockedSources ?? 0} bloqueadas</span>
              </div>
            </div>

            {result.answerPreview && (
              <div className="bg-[#f4f4ff] border border-[#dadbf3] rounded-[10px] p-4">
                <p className="text-[11px] uppercase tracking-wide text-[#646462] font-semibold mb-1">Respuesta sugerida</p>
                <p className="text-[12.5px] text-[#1a1a1a] leading-5 whitespace-pre-wrap">{result.answerPreview}</p>
              </div>
            )}

            {Array.isArray(result.accessibleResults) && result.accessibleResults.length > 0 && (
              <div>
                <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-2">Artículos accesibles ({result.accessibleResults.length})</h3>
                <div className="flex flex-col gap-2">
                  {result.accessibleResults.map((r: any) => (
                    <div key={r.id} className="bg-white border border-[#e9eae6] rounded-[10px] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold text-[#1a1a1a]">{r.title}</p>
                        <span className="text-[11px] text-[#646462] flex-shrink-0">{Math.round((r.relevance_score || 0) * 100)}%</span>
                      </div>
                      <p className="text-[12px] text-[#646462] mt-1">{r.excerpt || r.whyMatched}</p>
                      <p className="text-[11px] text-[#646462] mt-1">{r.domain_name || '—'} · {r.status}{r.outdated_flag ? ' · desactualizado' : ''}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(result.blockedResults) && result.blockedResults.length > 0 && (
              <div>
                <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-2">Bloqueado por permisos ({result.blockedResults.length})</h3>
                <div className="flex flex-col gap-2">
                  {result.blockedResults.map((r: any) => (
                    <div key={r.id} className="bg-[#fef7f7] border border-[#fde2e2] rounded-[10px] p-3">
                      <p className="text-[13px] font-semibold text-[#1a1a1a]">{r.title}</p>
                      <p className="text-[12px] text-[#b91c1c] mt-0.5">{r.blocked_reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge — Help Center (Centro de ayuda) — collections + article stats
// ─────────────────────────────────────────────────────────────────────────────
function KnowledgeCentroAyuda({
  onAction,
  onNavigate,
}: {
  onAction: (msg: string, type?: 'success' | 'error') => void;
  onNavigate: (sub: KnowledgeSubView) => void;
}) {
  const { data: domainsRaw, loading: domainsLoading } = useApi(() => knowledgeApi.listDomains(), [], []);
  const domains: Array<{ id: string; name: string; description?: string }> =
    Array.isArray(domainsRaw) ? (domainsRaw as any[]) : [];

  const { data: articlesRaw } = useApi(() => knowledgeApi.listArticles(), [], []);
  const articles: any[] = Array.isArray(articlesRaw) ? articlesRaw : [];

  // Workspace context — the public help-center on/off flag persists here via the
  // settings blob (help_center_published), shared with HelpCenterSettingsView.
  const { data: wsCtx } = useApi<any>(() => workspacesApi.currentContext(), [], null);

  // HC-published articles (helpcenter_status === 'published' or status === 'published' / 'live')
  const hcLive = articles.filter(a =>
    a.helpcenter_status === 'published' ||
    ['published', 'active', 'live'].includes(String(a.status || '').toLowerCase()),
  );

  // Count articles per domain
  const countByDomain = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of hcLive) {
      const did = a.domain_id || a.domainId || '';
      map[did] = (map[did] || 0) + 1;
    }
    return map;
  }, [hcLive]);

  const [hcEnabled, setHcEnabled] = useState(true);
  const [hcSaving, setHcSaving] = useState(false);
  const [folderModal, setFolderModal] = useState<null | 'create' | { id: string; name: string; description?: string }>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Hydrate the toggle from the persisted workspace setting (default: enabled).
  useEffect(() => {
    const s = (wsCtx as any)?.settings;
    if (s && s.help_center_published !== undefined) setHcEnabled(!!s.help_center_published);
  }, [wsCtx]);

  // Persist the public help-center flag via the workspace settings blob.
  async function toggleHelpCenter() {
    const next = !hcEnabled;
    const wsId = (wsCtx as any)?.id ?? (wsCtx as any)?.workspace?.id ?? (wsCtx as any)?.workspace_id;
    setHcEnabled(next); // optimistic
    if (!wsId) { onAction('No se pudo identificar el workspace', 'error'); return; }
    setHcSaving(true);
    try {
      await workspacesApi.updateSettings(wsId, { help_center_published: next });
      onAction(next ? 'Centro de ayuda habilitado' : 'Centro de ayuda deshabilitado');
    } catch (err: any) {
      setHcEnabled(!next); // revert on failure
      onAction(err?.message || 'No se pudo guardar', 'error');
    } finally {
      setHcSaving(false);
    }
  }

  async function deleteCollection(d: { id: string; name: string }) {
    if (typeof window !== 'undefined' && !window.confirm(`¿Eliminar la colección "${d.name}"?`)) return;
    try {
      await knowledgeApi.deleteDomain(d.id);
      setRefreshKey(k => k + 1);
      onAction('Colección eliminada');
    } catch (err: any) {
      onAction(err?.message || 'No se pudo eliminar', 'error');
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><path d="M2.5 3.2v9.6c1.7-.6 3.4-.6 5.5 0 2.1-.6 3.8-.6 5.5 0V3.2c-1.7-.6-3.4-.6-5.5 0C5.9 2.6 4.2 2.6 2.5 3.2z"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Centro de ayuda</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFolderModal('create')}
            className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
            Nueva colección
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 flex flex-col gap-6">
        {/* Status card */}
        <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-center justify-between bg-white">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center ${hcEnabled ? 'bg-[#dcfce7]' : 'bg-[#f3f3f1]'}`}>
              <svg viewBox="0 0 16 16" className={`w-5 h-5 fill-none stroke-current ${hcEnabled ? 'text-[#15803d]' : 'text-[#646462]'}`} strokeWidth="1.5"><path d="M2.5 3.2v9.6c1.7-.6 3.4-.6 5.5 0 2.1-.6 3.8-.6 5.5 0V3.2c-1.7-.6-3.4-.6-5.5 0C5.9 2.6 4.2 2.6 2.5 3.2z"/></svg>
            </div>
            <div>
              <p className="text-[14px] font-semibold text-[#1a1a1a]">Centro de ayuda público</p>
              <p className="text-[12.5px] text-[#646462] mt-0.5">
                {hcEnabled
                  ? `${hcLive.length} artículo${hcLive.length !== 1 ? 's' : ''} en vivo · accesible por los clientes`
                  : 'Deshabilitado · no visible para los clientes'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-[#646462]">{hcSaving ? 'Guardando…' : hcEnabled ? 'Activo' : 'Inactivo'}</span>
            <button
              onClick={toggleHelpCenter}
              disabled={hcSaving}
              className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${hcEnabled ? 'bg-[#1a1a1a]' : 'bg-[#d4d4d2]'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${hcEnabled ? 'left-[26px]' : 'left-1'}`} />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Artículos en vivo', value: hcLive.length },
            { label: 'Colecciones', value: domains.length },
            { label: 'Sin colección', value: hcLive.filter(a => !a.domain_id && !a.domainId).length },
          ].map(s => (
            <div key={s.label} className="border border-[#e9eae6] rounded-[10px] p-4 bg-white">
              <p className="text-[26px] font-bold text-[#1a1a1a]">{s.value}</p>
              <p className="text-[12.5px] text-[#646462] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Collections table */}
        <div>
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-3">Colecciones</h3>
          <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_40px] px-5 py-2.5 border-b border-[#f1f1ee] text-[12px] font-medium text-[#646462]">
              <div>Nombre</div>
              <div>Artículos</div>
              <div />
            </div>
            {domainsLoading && (
              <div className="px-5 py-8 text-center text-[13px] text-[#646462]">Cargando…</div>
            )}
            {!domainsLoading && domains.length === 0 && (
              <div className="px-5 py-8 text-center">
                <p className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Sin colecciones</p>
                <p className="text-[13px] text-[#646462] mb-4">Organiza tus artículos del Centro de ayuda en colecciones para que los clientes puedan encontrarlos fácilmente.</p>
                <button
                  onClick={() => setFolderModal('create')}
                  className="bg-[#1a1a1a] text-white rounded-full px-4 py-2 text-[13px] font-semibold hover:bg-[#444]"
                >
                  Crear primera colección
                </button>
              </div>
            )}
            {!domainsLoading && domains.map((d, idx) => {
              const count = countByDomain[d.id] || 0;
              return (
                <div
                  key={d.id}
                  className={`grid grid-cols-[1fr_120px_40px] px-5 py-3 items-center hover:bg-[#fafaf9] ${idx > 0 ? 'border-t border-[#f1f1ee]' : ''}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-[6px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M2.5 3.2v9.6c1.7-.6 3.4-.6 5.5 0 2.1-.6 3.8-.6 5.5 0V3.2c-1.7-.6-3.4-.6-5.5 0C5.9 2.6 4.2 2.6 2.5 3.2z"/></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#1a1a1a] truncate">{d.name}</p>
                      {d.description && <p className="text-[12px] text-[#646462] truncate">{d.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${count > 0 ? 'bg-[#22c55e]' : 'bg-[#d4d4d2]'}`} />
                    <span className="text-[13px] text-[#646462]">{count} artículo{count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setFolderModal({ id: d.id, name: d.name, description: d.description })}
                      title="Editar"
                      className="w-7 h-7 rounded-full hover:bg-[#f3f3f1] flex items-center justify-center"
                    >
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M11 2l3 3-9 9-4 1 1-4 9-9z"/></svg>
                    </button>
                    <button
                      onClick={() => deleteCollection(d)}
                      title="Eliminar"
                      className="w-7 h-7 rounded-full hover:bg-[#fee2e2] flex items-center justify-center"
                    >
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#b91c1c]" strokeWidth="1.4"><path d="M3 4h10M6 4V3h4v1M5 4v9h6V4H5z"/></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate('articulos')}
            className="border border-[#e9eae6] rounded-[10px] p-4 text-left hover:border-[#c8c9c4] bg-white flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-[6px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M3.5 2h6l3 3v9a0.5 0.5 0 0 1-.5.5h-8.5A0.5 0.5 0 0 1 3 14V2.5z"/></svg>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#1a1a1a]">Ver todos los artículos</p>
              <p className="text-[12px] text-[#646462] mt-0.5">Gestiona y publica artículos del Centro de ayuda</p>
            </div>
          </button>
          <button
            onClick={() => onNavigate('contenido')}
            className="border border-[#e9eae6] rounded-[10px] p-4 text-left hover:border-[#c8c9c4] bg-white flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-[6px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M5 6h6M5 9h6M5 11.5h4"/></svg>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#1a1a1a]">Resumen de contenido</p>
              <p className="text-[12px] text-[#646462] mt-0.5">Ver el estado de todo el contenido de conocimiento</p>
            </div>
          </button>
        </div>
      </div>

      {/* Reuse the existing folder modal for collections */}
      {folderModal && (
        <KnowledgeFolderModal
          initial={folderModal === 'create' ? null : folderModal}
          onClose={() => setFolderModal(null)}
          onSaved={(_id) => {
            setFolderModal(null);
            setRefreshKey(k => k + 1);
            // toast already emitted by the modal via onAction
          }}
          onAction={onAction}
        />
      )}
    </>
  );
}

function readInitialKnowledgeSubFromUrl(): KnowledgeSubView {
  if (typeof window === 'undefined') return 'fuentes';
  const { view, sub: s } = parsePath();
  if (view !== 'knowledge' || !s) return 'fuentes';
  const known: KnowledgeSubView[] = ['fuentes','contenido','articulos','gaps','pruebas','centroAyuda','carpeta'];
  return (known as string[]).includes(s) ? (s as KnowledgeSubView) : 'fuentes';
}

export function KnowledgeView() {
  const [sub, setSub] = useState<KnowledgeSubView>(() => readInitialKnowledgeSubFromUrl());
  // Sync /knowledge/:sub so deep-links + reload land on the right sub-view.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    replaceRoute({ view: 'knowledge', sub });
  }, [sub]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  // Folder modal: closed | new root folder | new subfolder under a parent | edit.
  type FolderModalState =
    | null
    | { mode: 'create' }
    | { mode: 'sub'; parent: { id: string; name: string } }
    | { mode: 'edit'; folder: { id: string; name: string; description?: string; icon?: string } };
  const [folderModal, setFolderModal] = useState<FolderModalState>(null);
  const [moveFolder, setMoveFolder] = useState<any | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  async function deleteFolder(folder: { id: string; name: string }) {
    if (typeof window !== 'undefined' && !window.confirm(`¿Borrar la carpeta "${folder.name}"? Se borrarán también sus subcarpetas y los artículos quedarán sin carpeta.`)) return;
    try {
      await knowledgeApi.deleteDomain(folder.id);
      showToast('Carpeta borrada');
      setRefreshKey(k => k + 1);
      if (activeFolderId === folder.id) {
        setActiveFolderId(null);
        setSub('articulos');
      }
    } catch (err: any) {
      showToast(err?.message || 'No se pudo borrar la carpeta', 'error');
    }
  }
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  // Article editor opened from OUTSIDE the Articulos view (Fuentes, Resumen,
  // Vacíos). Mounted as an overlay at this level so closing it returns to the
  // view the user was on — it does NOT switch the sidebar to Contenido.
  const [articleEditor, setArticleEditor] = useState<Record<string, any> | null>(null);
  const { data: kvDomainsData } = useApi(() => knowledgeApi.listDomains(), [refreshKey], []);
  const kvDomains = (Array.isArray(kvDomainsData) ? kvDomainsData : []).map((d: any) => ({ id: d.id, name: d.name }));
  // Query handed from the Contenido search bar into Artículos (server-side `q`).
  const [articleSearch, setArticleSearch] = useState('');
  // Real ingestion flows, opened from Fuentes/Contenido and mounted once below.
  const [websiteSyncOpen, setWebsiteSyncOpen] = useState(false);
  const [externalPickerOpen, setExternalPickerOpen] = useState(false);
  // Per-app connect wizard ("Sincronizar o importar"). Holds the provider name.
  const [connectApp, setConnectApp] = useState<string | null>(null);
  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2500);
  }
  // Open the editor in create mode from outside the Articulos view — as an
  // overlay, WITHOUT navigating away from the current sub-view.
  function startCreate(opts: { type?: string; visibility?: 'public' | 'internal' } = {}) {
    setArticleEditor({
      title: '',
      content: '',
      type: opts.type || 'ARTICLE',
      visibility: opts.visibility || 'public',
    });
  }
  function draftFromGap(g: any) {
    const title = String(g?.topic || 'Nuevo artículo').trim();
    const lines = [
      `# ${title}`,
      '',
      '## Resumen',
      String(g?.whyItMatters || 'Por qué importa este tema para el cliente y el agente.'),
      '',
      '## Política / Acción recomendada',
      String(g?.recommendedAction || 'Pasos concretos que el agente debe seguir.'),
      '',
      '## Evidencia',
      ...(Array.isArray(g?.sampleCases) && g.sampleCases.length > 0
          ? g.sampleCases.map((c: string) => `- Caso ${c}`)
          : ['- Añadir IDs de casos donde apareció esta pregunta.']),
      '',
      '## Notas para el agente',
      `- Dominio sugerido: ${g?.suggestedDomain || 'Sin clasificar'}`,
      `- Aprobaciones pendientes vinculadas: ${g?.pendingApprovals ?? 0}`,
    ];
    setArticleEditor({ title, content: lines.join('\n'), type: 'ARTICLE' });
    showToast('Borrador preparado, revísalo antes de publicar');
  }
  function openCrmView(v: string) {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', v);
      // Full reload — top-level view switching lives in PrototypeApp, which is
      // outside this component's tree, so a navigation is the simplest path.
      window.location.href = url.toString();
    }
  }
  function renderSub() {
    switch (sub) {
      case 'fuentes':     return <KnowledgeFuentes onCreate={startCreate} onNavigate={setSub} onAction={showToast} onOpenView={openCrmView} onOpenWebsiteSync={() => setWebsiteSyncOpen(true)} onOpenExternalPicker={() => setExternalPickerOpen(true)} onConnectApp={(p) => setConnectApp(p)} />;
      case 'contenido':   return <KnowledgeContenido onCreate={startCreate} onNavigate={setSub} onAction={showToast} onSearch={(q) => { setArticleSearch(q); setSub('articulos'); }} onOpenWebsiteSync={() => setWebsiteSyncOpen(true)} />;
      case 'articulos':   return <KnowledgeArticulos onAction={showToast} onRefresh={() => setRefreshKey(k => k + 1)} domainFilter={null} initialSearch={articleSearch} />;
      case 'carpeta':     return <KnowledgeArticulos onAction={showToast} onRefresh={() => setRefreshKey(k => k + 1)} domainFilter={activeFolderId} onOpenFolder={(id) => { setActiveFolderId(id); setSub('carpeta'); }} onCreateSubfolder={(parent) => setFolderModal({ mode: 'sub', parent })} />;
      case 'gaps':        return <KnowledgeGaps    onAction={showToast} onDraftFromGap={draftFromGap} />;
      case 'pruebas':     return <KnowledgePruebas onAction={showToast} />;
      case 'centroAyuda': return <KnowledgeCentroAyuda onAction={showToast} onNavigate={setSub} />;
    }
  }
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <KnowledgeSidebar
          sub={sub}
          onSelect={(s) => { setSub(s); if (s !== 'carpeta') setActiveFolderId(null); }}
          activeFolderId={activeFolderId}
          onSelectFolder={(id) => { setActiveFolderId(id); setSub('carpeta'); }}
          onCreateFolder={() => setFolderModal({ mode: 'create' })}
          onCreateSubfolder={(parent) => setFolderModal({ mode: 'sub', parent })}
          onEditFolder={(folder) => setFolderModal({ mode: 'edit', folder })}
          onMoveFolder={(folder) => setMoveFolder(folder)}
          onDeleteFolder={(folder) => deleteFolder(folder)}
          refreshKey={refreshKey}
        />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {renderSub()}
        </div>
      </div>
      {folderModal && (
        <KnowledgeFolderModal
          initial={folderModal.mode === 'edit' ? folderModal.folder : null}
          parent={folderModal.mode === 'sub' ? folderModal.parent : null}
          onClose={() => setFolderModal(null)}
          onSaved={(id) => {
            setRefreshKey(k => k + 1);
            // On create/subfolder, deep-link into the new folder. On edit, close.
            if (folderModal.mode === 'edit') {
              setFolderModal(null);
            } else {
              setActiveFolderId(id);
              setSub('carpeta');
              showToast(folderModal.mode === 'sub' ? 'Subcarpeta creada' : 'Carpeta creada');
            }
          }}
          onAction={showToast}
        />
      )}
      {moveFolder && (
        <KnowledgeMoveFolderModal
          folder={moveFolder}
          onClose={() => setMoveFolder(null)}
          onMoved={() => { setRefreshKey(k => k + 1); setMoveFolder(null); }}
          onAction={showToast}
        />
      )}
      {articleEditor && (
        <KnowledgeArticleEditor
          initial={articleEditor}
          domains={kvDomains}
          onClose={() => setArticleEditor(null)}
          onSaved={() => { setRefreshKey(k => k + 1); setArticleEditor(null); }}
          onAction={showToast}
        />
      )}
      {connectApp && (
        <KnowledgeConnectAppWizard
          provider={connectApp}
          onClose={() => setConnectApp(null)}
          onSaved={() => { setRefreshKey(k => k + 1); }}
          onAction={showToast}
        />
      )}
      {websiteSyncOpen && (
        <KnowledgeWebsiteSyncWizard
          onClose={() => setWebsiteSyncOpen(false)}
          onSaved={() => { setRefreshKey(k => k + 1); }}
          onAction={showToast}
        />
      )}
      {externalPickerOpen && (
        <KnowledgeExternalSourcePicker
          onClose={() => setExternalPickerOpen(false)}
          onAction={showToast}
        />
      )}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-[13px] font-semibold shadow-lg ${
          toast.type === 'success' ? 'bg-[#222] text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
