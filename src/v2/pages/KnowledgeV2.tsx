// KnowledgeV2 — migrado por agent-knowledge-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Sidebar v2 con sub-vistas: Fuentes, Biblioteca, Brechas, Prueba,
//     Contenido>Artículos, Centro de ayuda
//   • Fuentes: vista con tabs (Todas / AI Agent / Copilot / Centro de ayuda)
//   • Biblioteca: listArticles + filtros (búsqueda, tipo, estado, dominio)
//     + selección múltiple + publicación en bloque
//   • Detalle de artículo: getArticle + editar inline + publicar
//   • Modal crear/editar: createArticle, updateArticle, publishArticle
//   • Brechas: gaps endpoint + stats + gap cards + alertas + artículos problema
//   • Prueba: test endpoint + selector agente (agentsApi.list) + cobertura
// Pending for later iterations:
//   • Importación PDF (requiere pdfjs-dist, omitida — solo markdown/text)
//   • Vista structured-sheet completa del artículo (summary/allowed/blocked/…)
//   • Sub-vista Artículos y Centro de ayuda (placeholder)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useRef, useCallback, type ChangeEvent } from 'react';
import { knowledgeApi, agentsApi } from '../../api/client';
import { useApi, useMutation } from '../../api/hooks';

// ── Types ────────────────────────────────────────────────────────────────────

type KV2Sub = 'fuentes' | 'biblioteca' | 'brechas' | 'prueba' | 'articulos' | 'centroAyuda';
type KArticleType = 'POLICY' | 'ARTICLE' | 'SNIPPET' | 'PLAYBOOK';

interface KArticle {
  id: string;
  type: KArticleType;
  title: string;
  category: string;
  visibility: 'Public' | 'Internal';
  status: 'Published' | 'Draft';
  owner: string;
  ownerInitials: string;
  lastUpdated: string;
  health: 'OK' | 'Stale';
  content?: string;
}

interface KDraft {
  title: string;
  content: string;
  type: KArticleType;
  status: 'Published' | 'Draft';
  domainId: string;
  ownerUserId: string;
  reviewCycleDays: string;
}

const emptyDraft: KDraft = {
  title: '', content: '', type: 'ARTICLE', status: 'Draft',
  domainId: '', ownerUserId: '', reviewCycleDays: '90',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapApiArticle(a: any): KArticle {
  const name = a.owner_name || 'Unknown';
  return {
    id: a.id,
    type: (['POLICY','ARTICLE','SNIPPET','PLAYBOOK'].includes(a.type?.toUpperCase())
      ? a.type.toUpperCase() : 'ARTICLE') as KArticleType,
    title: a.title || 'Sin título',
    category: a.domain_name || a.domain || a.category || 'General',
    visibility: a.visibility === 'internal' ? 'Internal' : 'Public',
    status: a.status === 'published' ? 'Published' : 'Draft',
    owner: name,
    ownerInitials: name.split(' ').map((n: string) => n[0]).join('').substring(0,2).toUpperCase(),
    lastUpdated: a.updated_at
      ? new Date(a.updated_at).toLocaleDateString('es-ES', { month:'short', day:'numeric' }) : '—',
    health: a.health === 'stale' ? 'Stale' : 'OK',
    content: typeof a.content === 'string' ? a.content : '',
  };
}

function guessTitleFromContent(content: string, fallbackName: string) {
  const heading = content.split(/\r?\n/).find(l => /^#{1,3}\s+\S/.test(l.trim()));
  if (heading) return heading.replace(/^#{1,3}\s+/, '').trim();
  const first = content.split(/\r?\n/).find(l => l.trim());
  if (first && first.length <= 90) return first.replace(/[*_`]/g, '').trim();
  return fallbackName.replace(/\.[^.]+$/, '').replace(/[-_]+/g,' ').trim() || 'Sin título';
}

// ── Knowledge sheet helpers (ported from Knowledge.tsx) ──────────────────────

interface KnowledgeSheet {
  summary: string;
  policy: string;
  allowed: string[];
  blocked: string[];
  escalation: string[];
  evidence: string[];
  agent_notes: string[];
  examples: string[];
  keywords: string[];
}

const sectionAliases: Record<string, keyof KnowledgeSheet> = {
  summary: 'summary', overview: 'summary', context: 'summary',
  policy: 'policy', 'policy statement': 'policy', statement: 'policy',
  allowed: 'allowed', permitted: 'allowed',
  blocked: 'blocked', disallowed: 'blocked',
  escalation: 'escalation', escalations: 'escalation',
  evidence: 'evidence', citations: 'evidence', sources: 'evidence',
  'agent notes': 'agent_notes', notes: 'agent_notes',
  examples: 'examples', example: 'examples',
  keywords: 'keywords', tags: 'keywords',
};

function normalizeSectionKey(heading: string): keyof KnowledgeSheet | null {
  const cleaned = heading.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [needle, section] of Object.entries(sectionAliases)) {
    if (cleaned === needle || cleaned.startsWith(`${needle} `) || cleaned.includes(` ${needle} `)) return section;
  }
  return null;
}

function parseItems(lines: string[], commaSeparated = false): string[] {
  return lines.flatMap(line => {
    const cleaned = line.replace(/^[-*•]+\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
    if (!cleaned) return [];
    if (commaSeparated) return cleaned.split(/[;,]/g).map(i => i.trim()).filter(Boolean);
    return [cleaned];
  });
}

function buildKnowledgeSheetFromNarrative(content: string, fallback?: Partial<KnowledgeSheet> | null): KnowledgeSheet {
  const lines = content.split(/\r?\n/);
  const sections: Record<keyof KnowledgeSheet, string[]> = {
    summary: [], policy: [], allowed: [], blocked: [], escalation: [],
    evidence: [], agent_notes: [], examples: [], keywords: [],
  };
  let current: keyof KnowledgeSheet | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const m = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
    if (m) { current = normalizeSectionKey(m[2]); continue; }
    if (!current) { sections.policy.push(line); continue; }
    sections[current].push(line);
  }
  const paragraphSummary = content.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).find(Boolean) ?? '';
  const summary = sections.summary.join('\n').trim() || fallback?.summary?.trim() || paragraphSummary.slice(0, 220);
  const policy = sections.policy.join('\n').trim() || fallback?.policy?.trim() || content.trim();
  const lists = {
    allowed: parseItems(sections.allowed), blocked: parseItems(sections.blocked),
    escalation: parseItems(sections.escalation), evidence: parseItems(sections.evidence),
    agent_notes: parseItems(sections.agent_notes), examples: parseItems(sections.examples),
    keywords: parseItems(sections.keywords, true),
  };
  return {
    summary, policy,
    allowed: lists.allowed.length ? lists.allowed : (fallback?.allowed ?? []),
    blocked: lists.blocked.length ? lists.blocked : (fallback?.blocked ?? []),
    escalation: lists.escalation.length ? lists.escalation : (fallback?.escalation ?? []),
    evidence: lists.evidence.length ? lists.evidence : (fallback?.evidence ?? []),
    agent_notes: lists.agent_notes.length ? lists.agent_notes : (fallback?.agent_notes ?? []),
    examples: lists.examples.length ? lists.examples : (fallback?.examples ?? []),
    keywords: lists.keywords.length ? lists.keywords : (fallback?.keywords ?? []),
  };
}

function normalizeSheet(value: unknown, content: string): KnowledgeSheet {
  const s = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return {}; } })() : (value ?? {}) as Record<string,any>;
  return {
    summary: String(s.summary ?? s.overview ?? '').trim() || content.slice(0, 220),
    policy: String(s.policy ?? s.policy_statement ?? '').trim() || content,
    allowed: Array.isArray(s.allowed) ? s.allowed.map((i: any) => String(i ?? '').trim()).filter(Boolean) : [],
    blocked: Array.isArray(s.blocked) ? s.blocked.map((i: any) => String(i ?? '').trim()).filter(Boolean) : [],
    escalation: Array.isArray(s.escalation) ? s.escalation.map((i: any) => String(i ?? '').trim()).filter(Boolean) : [],
    evidence: Array.isArray(s.evidence) ? s.evidence.map((i: any) => String(i ?? '').trim()).filter(Boolean) : [],
    agent_notes: Array.isArray(s.agent_notes) ? s.agent_notes.map((i: any) => String(i ?? '').trim()).filter(Boolean) : [],
    examples: Array.isArray(s.examples) ? s.examples.map((i: any) => String(i ?? '').trim()).filter(Boolean) : [],
    keywords: Array.isArray(s.keywords) ? s.keywords.map((i: any) => String(i ?? '').trim()).filter(Boolean) : [],
  };
}

// ── Design helpers ────────────────────────────────────────────────────────────

const itemCls = (active: boolean) =>
  `relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
    active
      ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
      : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
  }`;

const Chev = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-[#646462] transition-transform ${open ? 'rotate-90' : ''}`}>
    <path d="M6 4l4 4-4 4z"/>
  </svg>
);

const Spinner = () => (
  <div className="w-4 h-4 border-2 border-[#e9eae6] border-t-[#1a1a1a] rounded-full animate-spin"/>
);

// ── Sidebar ──────────────────────────────────────────────────────────────────

function KnowledgeSidebar({ sub, onSelect }: { sub: KV2Sub; onSelect: (s: KV2Sub) => void }) {
  const [openContenido, setOpenContenido] = useState(sub === 'articulos');

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Conocimiento</span>
      </div>
      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-4 flex flex-col gap-0.5">

        <button onClick={() => onSelect('fuentes')} className={itemCls(sub === 'fuentes')}>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a] flex-shrink-0">
            <circle cx="8" cy="8" r="6" stroke="#1a1a1a" fill="none" strokeWidth="1.5"/>
            <path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" stroke="#1a1a1a" fill="none" strokeWidth="1.5"/>
          </svg>
          <span className="flex-1">Fuentes</span>
        </button>

        <button onClick={() => onSelect('biblioteca')} className={itemCls(sub === 'biblioteca')}>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a] flex-shrink-0">
            <rect x="2" y="3" width="3" height="10" rx="1"/>
            <rect x="6.5" y="3" width="3" height="10" rx="1"/>
            <rect x="11" y="3" width="3" height="10" rx="1"/>
          </svg>
          <span className="flex-1">Biblioteca</span>
        </button>

        <button onClick={() => onSelect('brechas')} className={itemCls(sub === 'brechas')}>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a] flex-shrink-0">
            <path d="M8 2l1.5 4.5H14l-3.8 2.8 1.5 4.5L8 11l-3.7 2.8 1.5-4.5L2 6.5h4.5z"/>
          </svg>
          <span className="flex-1">Brechas</span>
        </button>

        <button onClick={() => onSelect('prueba')} className={itemCls(sub === 'prueba')}>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a] flex-shrink-0">
            <path d="M5 2h6v5l2 7H3l2-7V2zm-1.5 9h9"/>
          </svg>
          <span className="flex-1">Prueba</span>
        </button>

        <div className="h-px bg-[#e9eae6] my-1" />

        <button
          onClick={() => setOpenContenido(o => !o)}
          className={itemCls(false)}
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a] flex-shrink-0">
            <rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/>
            <path d="M5 6h6M5 9h6M5 11.5h4" stroke="#1a1a1a" fill="none" strokeWidth="1.5"/>
          </svg>
          <span className="flex-1">Contenido</span>
          <Chev open={openContenido} />
        </button>

        {openContenido && (
          <div className="flex flex-col pl-7 mt-0.5 mb-0.5 gap-0.5">
            <button onClick={() => onSelect('articulos')} className={itemCls(sub === 'articulos')}>
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a] flex-shrink-0">
                <path d="M4 2h6l3 3v9H4z" stroke="#1a1a1a" fill="none" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M10 2v3h3M6 9h4M6 11.5h3" stroke="#1a1a1a" fill="none" strokeWidth="1.5"/>
              </svg>
              <span className="flex-1">Artículos</span>
            </button>
          </div>
        )}

        <button onClick={() => onSelect('centroAyuda')} className={itemCls(sub === 'centroAyuda')}>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a] flex-shrink-0">
            <circle cx="8" cy="8" r="6" stroke="#1a1a1a" fill="none" strokeWidth="1.5"/>
            <path d="M8 6a1.5 1.5 0 0 1 0 3v1.5" stroke="#1a1a1a" fill="none" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="12" r=".6" fill="#1a1a1a"/>
          </svg>
          <span className="flex-1">Centro de ayuda</span>
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462] flex-shrink-0">
            <path d="M5 3h8v8h-2V6.4l-6.3 6.3-1.4-1.4L9.6 5H5z"/>
          </svg>
        </button>

      </div>
    </div>
  );
}

// ── Fuentes view ──────────────────────────────────────────────────────────────

type FuentesTab = 'all' | 'ai' | 'copilot' | 'help';

function KhSection({ title, description, items, headerAction }: {
  title: string;
  description?: string;
  items: { provider: string; status: string; action: string; configured: boolean }[];
  headerAction?: { label: string };
}) {
  return (
    <div className="bg-white border border-[#e9eae6] rounded-[10px]">
      <div className={`px-5 py-4 ${items.length > 0 ? 'border-b border-[#f1f1ee]' : ''} flex items-start gap-3`}>
        <div className="w-7 h-7 rounded-[6px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5">
            <rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M2.5 5.5h11"/>
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-semibold text-[#1a1a1a]">{title}</p>
          {description && <p className="text-[13px] text-[#646462] mt-0.5">{description}</p>}
        </div>
        {headerAction && (
          <button className="text-[13px] font-medium text-[#1a1a1a] hover:underline flex-shrink-0">
            {headerAction.label}
          </button>
        )}
      </div>
      {items.length > 0 && (
        <div>
          {items.map((it, idx) => (
            <div key={idx} className={`flex items-center gap-4 px-5 py-3 ${idx > 0 ? 'border-t border-[#f1f1ee]' : ''}`}>
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                {it.configured
                  ? <span className="w-4 h-4 rounded-full bg-[#22c55e] flex items-center justify-center">
                      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M3 6l2 2 4-4"/></svg>
                    </span>
                  : <span className="w-4 h-4 rounded-full border border-[#d4d4d2]"/>
                }
              </div>
              <div className="w-5 h-5 rounded-[4px] bg-[#f3f3f1] flex-shrink-0" />
              <span className="flex-1 text-[13px] text-[#1a1a1a]">{it.provider}</span>
              <span className="text-[13px] text-[#646462]">{it.status}</span>
              <button className="text-[13px] font-medium text-[#1a1a1a] hover:underline">{it.action}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const KH_PUBLIC = [
  { provider: 'Intercom', status: 'No hay artículos', action: 'Agregar artículo', configured: false },
  { provider: 'Zendesk', status: 'No configurado', action: 'Sincronizar', configured: false },
];
const KH_INTERNAL = [
  { provider: 'Intercom', status: 'No hay artículos', action: 'Agregar artículo', configured: false },
];
const KH_CONVERSATIONS = [
  { provider: 'Intercom', status: 'Acceso denegado', action: 'Acceder', configured: false },
];

function FuentesView() {
  const [tab, setTab] = useState<FuentesTab>('all');
  const tabs = [
    { id: 'all' as const, label: 'Todas las fuentes' },
    { id: 'ai' as const, label: 'Agente de IA' },
    { id: 'copilot' as const, label: 'Copilot' },
    { id: 'help' as const, label: 'Centro de ayuda' },
  ];

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <h1 className="text-[18px] font-bold text-[#1a1a1a]">Fuentes</h1>
        <button className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
          Nuevo contenido
        </button>
      </div>

      <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
            }`}>{t.label}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 flex flex-col gap-4">
        {tab === 'all' && (
          <>
            <div className="relative bg-white border border-[#e9eae6] rounded-[10px] p-5">
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-3">
                Optimiza tu contenido para Fin AI Agent, Copilot y el centro de ayuda
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { name:'Fin', status:'No establecido en vivo', cta:'Configurar ahora', accent:'#ff5f3f' },
                  { name:'Copilot', status:'En vivo', cta:'Ir a Inbox', accent:'#3b59f6' },
                  { name:'Centro de ayuda', status:'No establecido en vivo', cta:'Configurar ahora', accent:'#646462' },
                ].map(c => (
                  <div key={c.name} className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[10px] overflow-hidden">
                    <div className="h-[80px] bg-gradient-to-br from-[#ededea] to-[#dcdcd8] flex items-center justify-center">
                      <span className="w-8 h-8 rounded-[8px] flex items-center justify-center text-[14px] font-bold text-white" style={{ background: c.accent }}>{c.name[0]}</span>
                    </div>
                    <div className="p-3 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-[#1a1a1a]">{c.name}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${c.status === 'En vivo' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#f3f3f1] text-[#646462]'}`}>{c.status}</span>
                      </div>
                      <a href="#" className="text-[12px] font-medium text-[#1a1a1a] hover:underline">{c.cta} ↗</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <KhSection title="Artículos públicos" description="Permite que Fin AI Agent y Copilot usen artículos públicos." items={KH_PUBLIC}/>
            <KhSection title="Artículos internos" description="Proporcione conocimiento interno solo disponible para tu equipo." items={KH_INTERNAL}/>
            <KhSection title="Conversaciones" description="Deja que Copilot utilice conversaciones de tu equipo de los últimos 4 meses." items={KH_CONVERSATIONS}/>
            <KhSection title="Macros" description="Copilot recomendará macros disponibles para tu equipo." items={[{ provider:'Intercom', status:'4 macros', action:'Administrar', configured:true }]}/>
            <KhSection title="Sitios web" description="Permite que Fin AI Agent y Copilot utilicen sitios web públicos." items={[]} headerAction={{ label:'Sincronizar' }}/>
          </>
        )}

        {tab === 'ai' && (
          <div className="flex flex-col gap-4">
            <KhSection title="Artículos públicos" description="Permite que Fin AI Agent utilice artículos públicos." items={KH_PUBLIC}/>
            <KhSection title="Sitios web" description="Permite que Fin AI Agent utilice cualquier sitio web público." items={[]} headerAction={{ label:'Sincronizar' }}/>
          </div>
        )}

        {tab === 'copilot' && (
          <div className="flex flex-col gap-4">
            <KhSection title="Artículos internos" description="Proporciona a Copilot conocimientos internos de tu equipo." items={KH_INTERNAL}/>
            <KhSection title="Conversaciones" description="Deja que Copilot utilice las conversaciones de los últimos 4 meses." items={KH_CONVERSATIONS}/>
            <KhSection title="Macros" description="Copilot recomendará macros disponibles para tu equipo." items={[{ provider:'Intercom', status:'4 macros para Copilot', action:'Administrar', configured:true }]}/>
            <KhSection title="Artículos públicos" description="Permite que Copilot utilice los artículos del centro de ayuda." items={KH_PUBLIC}/>
          </div>
        )}

        {tab === 'help' && (
          <div className="flex flex-col gap-4">
            <KhSection title="Artículos públicos" description="Comparte artículos en tu Centro de ayuda para autoservicio." items={KH_PUBLIC}/>
          </div>
        )}
      </div>
    </>
  );
}

// ── Biblioteca view ───────────────────────────────────────────────────────────

function BibliotecaView({
  onSelectArticle,
  onCreateArticle,
  selectedArticleId,
}: {
  onSelectArticle: (id: string) => void;
  onCreateArticle: () => void;
  selectedArticleId: string | null;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [healthFilter, setHealthFilter] = useState('All');
  const [domainFilter, setDomainFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: rawArticles, loading, refetch } = useApi(
    () => {
      const p: Record<string,string> = {};
      if (domainFilter) p.domain_id = domainFilter;
      if (typeFilter !== 'All') p.type = typeFilter;
      if (statusFilter !== 'All') p.status = statusFilter.toLowerCase();
      if (search) p.q = search;
      return knowledgeApi.listArticles(Object.keys(p).length ? p : undefined);
    },
    [domainFilter, typeFilter, statusFilter, search],
    [],
  );
  const { data: rawDomains } = useApi(() => knowledgeApi.listDomains(), [], []);
  const publishMut = useMutation((id: string) => knowledgeApi.publishArticle(id));

  const articles = useMemo(() => (Array.isArray(rawArticles) ? rawArticles.map(mapApiArticle) : []), [rawArticles]);
  const domains = Array.isArray(rawDomains) ? rawDomains : [];

  const filtered = useMemo(() =>
    articles.filter(a => healthFilter === 'All' || a.health === healthFilter),
    [articles, healthFilter],
  );

  const allSelected = filtered.length > 0 && filtered.every(a => selectedIds.includes(a.id));
  const anySelected = selectedIds.length > 0;

  const toggleId = (id: string) =>
    setSelectedIds(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);

  const toggleAll = () =>
    setSelectedIds(cur => allSelected ? cur.filter(id => !filtered.some(a => a.id === id))
      : Array.from(new Set([...cur, ...filtered.map(a => a.id)])));

  const handleBulkPublish = async () => {
    const drafts = filtered.filter(a => selectedIds.includes(a.id) && a.status === 'Draft');
    if (!drafts.length) return;
    for (const d of drafts) await publishMut.mutate(d.id);
    setSelectedIds([]);
    refetch();
  };

  const typeColor: Record<string, string> = {
    POLICY: 'bg-[#f5f3ff] text-[#6d28d9]',
    ARTICLE: 'bg-[#eff6ff] text-[#1d4ed8]',
    SNIPPET: 'bg-[#fff7ed] text-[#c2410c]',
    PLAYBOOK: 'bg-[#f0fdf4] text-[#15803d]',
  };

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <h1 className="text-[18px] font-bold text-[#1a1a1a]">Biblioteca</h1>
        <button onClick={onCreateArticle} className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
          Nuevo artículo
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-[#e9eae6] flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2 border border-[#e9eae6] rounded-full px-3 py-1.5 bg-white min-w-[200px]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3"/></svg>
          <input
            type="text"
            placeholder="Buscar artículos…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="outline-none text-[13px] text-[#1a1a1a] placeholder:text-[#646462] flex-1 bg-transparent"
          />
        </div>

        {([
          { label:'Tipo', opts:['All','ARTICLE','POLICY','SNIPPET','PLAYBOOK'], val:typeFilter, set:setTypeFilter },
          { label:'Estado', opts:['All','Published','Draft'], val:statusFilter, set:setStatusFilter },
          { label:'Salud', opts:['All','OK','Stale'], val:healthFilter, set:setHealthFilter },
        ] as const).map(f => (
          <div key={f.label} className="relative group">
            <button className={`flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
              f.val !== 'All' ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-[#1a1a1a] border-[#e9eae6] hover:bg-[#f8f8f7]'
            }`}>
              {f.label}{f.val !== 'All' ? `: ${f.val}` : ''}
              <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-current`}><path d="M4 6l4 4 4-4z"/></svg>
            </button>
            <div className="absolute left-0 top-full mt-1 z-30 hidden group-hover:flex flex-col bg-white border border-[#e9eae6] rounded-xl shadow-lg py-1 min-w-[130px]">
              {f.opts.map(opt => (
                <button key={opt} onClick={() => (f.set as any)(opt)} className={`px-4 py-2 text-[13px] text-left hover:bg-[#f8f8f7] ${f.val === opt ? 'font-semibold text-[#1a1a1a]' : 'text-[#646462]'}`}>{opt}</button>
              ))}
            </div>
          </div>
        ))}

        {domains.length > 0 && (
          <div className="relative group">
            <button className={`flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
              domainFilter ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-[#1a1a1a] border-[#e9eae6] hover:bg-[#f8f8f7]'
            }`}>
              Dominio{domainFilter ? `: ${(domains as any[]).find(d => d.id === domainFilter)?.name ?? ''}` : ''}
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M4 6l4 4 4-4z"/></svg>
            </button>
            <div className="absolute left-0 top-full mt-1 z-30 hidden group-hover:flex flex-col bg-white border border-[#e9eae6] rounded-xl shadow-lg py-1 min-w-[150px]">
              <button onClick={() => setDomainFilter('')} className={`px-4 py-2 text-[13px] text-left hover:bg-[#f8f8f7] ${!domainFilter ? 'font-semibold text-[#1a1a1a]' : 'text-[#646462]'}`}>Todos</button>
              {(domains as any[]).map(d => (
                <button key={d.id} onClick={() => setDomainFilter(d.id)} className={`px-4 py-2 text-[13px] text-left hover:bg-[#f8f8f7] ${domainFilter === d.id ? 'font-semibold text-[#1a1a1a]' : 'text-[#646462]'}`}>{d.name}</button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => { setSearch(''); setTypeFilter('All'); setStatusFilter('All'); setHealthFilter('All'); setDomainFilter(''); }}
          className="text-[13px] text-[#646462] hover:text-[#1a1a1a] ml-auto"
        >Limpiar</button>
      </div>

      {/* Bulk bar */}
      {anySelected && (
        <div className="flex items-center justify-between px-6 py-2 bg-[#f8f8f7] border-b border-[#e9eae6] flex-shrink-0">
          <span className="text-[13px] text-[#1a1a1a]"><span className="font-semibold">{selectedIds.length}</span> seleccionados</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedIds([])} className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] border border-[#e9eae6] hover:bg-[#ededea]">Deseleccionar</button>
            <button
              onClick={handleBulkPublish}
              disabled={publishMut.loading}
              className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black disabled:opacity-50"
            >
              {publishMut.loading ? 'Publicando…' : 'Publicar borradores'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 gap-3">
            <Spinner />
            <span className="text-[13px] text-[#646462]">Cargando artículos…</span>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="bg-white sticky top-0 z-10 border-b border-[#e9eae6]">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-[#d4d4d2] accent-[#1a1a1a]"/>
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#646462] uppercase tracking-wide">Título</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#646462] uppercase tracking-wide">Categoría</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#646462] uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#646462] uppercase tracking-wide">Propietario</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#646462] uppercase tracking-wide">Salud</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#646462] uppercase tracking-wide">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr
                  key={a.id}
                  onClick={() => onSelectArticle(a.id)}
                  className={`border-b border-[#f1f1ee] cursor-pointer hover:bg-[#f8f8f7] transition-colors ${selectedArticleId === a.id ? 'bg-[#f8f8f7]' : ''}`}
                >
                  <td className="w-10 px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggleId(a.id)} className="rounded border-[#d4d4d2] accent-[#1a1a1a]"/>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${typeColor[a.type] ?? 'bg-[#f3f3f1] text-[#646462]'}`}>{a.type}</span>
                      <span className="text-[13px] font-medium text-[#1a1a1a] truncate max-w-[280px]">{a.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#646462]">{a.category}</td>
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-1.5 text-[12px] font-medium ${a.status === 'Published' ? 'text-[#15803d]' : 'text-[#646462]'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.status === 'Published' ? 'bg-[#22c55e]' : 'bg-[#d4d4d2]'}`}/>
                      {a.status === 'Published' ? 'Publicado' : 'Borrador'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#f3f3f1] text-[10px] font-bold text-[#646462] flex items-center justify-center flex-shrink-0">{a.ownerInitials}</span>
                      <span className="text-[13px] text-[#646462]">{a.owner}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[12px] font-medium ${a.health === 'OK' ? 'text-[#15803d]' : 'text-[#dc2626]'}`}>
                      {a.health === 'OK' ? '✓ OK' : '⚠ Obsoleto'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#646462]">{a.lastUpdated}</td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-[13px] text-[#646462]">
                    No se encontraron artículos con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ── Article detail view ───────────────────────────────────────────────────────

function ArticleDetailView({
  articleId,
  onBack,
  onEdit,
  onPublish,
}: {
  articleId: string;
  onBack: () => void;
  onEdit: () => void;
  onPublish: () => void;
}) {
  const { data, loading } = useApi(() => knowledgeApi.getArticle(articleId), [articleId], null);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center flex-1 gap-3">
        <Spinner /><span className="text-[13px] text-[#646462]">Cargando artículo…</span>
      </div>
    );
  }

  const a = data as any;
  const rawContent = typeof a.content === 'string' ? a.content : '';
  const lastUpdated = a.updated_at
    ? new Date(a.updated_at).toLocaleDateString('es-ES', { month:'short', day:'numeric', year:'numeric' }) : '—';

  const fallback = a.content_structured ? normalizeSheet(a.content_structured, rawContent) : null;
  const sheet = buildKnowledgeSheetFromNarrative(rawContent, fallback);

  const SheetSection = ({ title, items, tone }: { title: string; items: string[]; tone?: 'green'|'red'|'amber' }) => {
    const dotCls = tone === 'green' ? 'bg-[#22c55e]' : tone === 'red' ? 'bg-[#ef4444]' : tone === 'amber' ? 'bg-[#f59e0b]' : 'bg-[#d4d4d2]';
    return (
      <div className="border border-[#e9eae6] rounded-[10px] p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462]">{title}</p>
          <span className="text-[11px] text-[#646462]">{items.length}</span>
        </div>
        {items.length > 0
          ? <ul className="space-y-1.5">{items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-[#1a1a1a] leading-[20px]">
                <span className={`mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls}`}/>
                {item}
              </li>
            ))}</ul>
          : <p className="text-[13px] text-[#646462] italic">Sin entradas.</p>
        }
      </div>
    );
  };

  const linkedWorkflows: string[] = Array.isArray(a.linked_workflow_ids) ? a.linked_workflow_ids : [];
  const linkedApprovals: string[] = Array.isArray(a.linked_approval_policy_ids) ? a.linked_approval_policy_ids : [];

  return (
    <>
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-[#646462] hover:text-[#1a1a1a] font-medium">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M10 3L5 8l5 5"/></svg>
          Biblioteca
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462]">Artículo de conocimiento</p>
          <h2 className="text-[15px] font-semibold text-[#1a1a1a] truncate">{a.title || 'Sin título'}</h2>
        </div>
        <button onClick={onEdit} className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] border border-[#e9eae6] hover:bg-[#ededea]">Editar</button>
        <button onClick={onPublish} className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black">Publicar</button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {[a.type?.toUpperCase(), a.status === 'published' ? 'Publicado' : 'Borrador', `Revisión ${a.review_cycle_days ?? 90}d`].map(tag => (
            <span key={tag} className="px-2.5 py-1 rounded-full border border-[#e9eae6] text-[12px] text-[#646462]">{tag}</span>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { label:'Propietario', value: a.owner_name || '—' },
            { label:'Dominio', value: a.domain_name || 'General' },
            { label:'Actualizado', value: lastUpdated },
            { label:'ID', value: `#${a.id?.slice(0,8) || '—'}` },
          ].map(m => (
            <div key={m.label} className="border border-[#e9eae6] rounded-[10px] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462]">{m.label}</p>
              <p className="mt-1.5 text-[13px] font-medium text-[#1a1a1a]">{m.value}</p>
            </div>
          ))}
        </div>

        {/* Summary + Policy */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-[#e9eae6] rounded-[10px] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-2">Resumen</p>
            <p className="text-[13px] text-[#1a1a1a] leading-[20px]">{sheet.summary || '—'}</p>
          </div>
          <div className="border border-[#e9eae6] rounded-[10px] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-2">Política</p>
            <p className="text-[13px] text-[#1a1a1a] leading-[20px] whitespace-pre-wrap">{sheet.policy || '—'}</p>
          </div>
        </div>

        {/* Structured sections */}
        <div className="grid grid-cols-2 gap-3">
          <SheetSection title="Permitido" items={sheet.allowed} tone="green"/>
          <SheetSection title="Bloqueado" items={sheet.blocked} tone="red"/>
          <SheetSection title="Escalación" items={sheet.escalation} tone="amber"/>
          <SheetSection title="Evidencia" items={sheet.evidence}/>
          <SheetSection title="Notas de agente" items={sheet.agent_notes}/>
          <SheetSection title="Ejemplos" items={sheet.examples}/>
        </div>

        {/* Linked workflows + approvals */}
        {(linkedWorkflows.length > 0 || linkedApprovals.length > 0) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-[#e9eae6] rounded-[10px] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-2">Workflows vinculados</p>
              <div className="flex flex-wrap gap-1.5">
                {linkedWorkflows.length
                  ? linkedWorkflows.map(w => <span key={w} className="px-2 py-0.5 rounded border border-[#e9eae6] text-[12px] text-[#646462]">{w}</span>)
                  : <p className="text-[13px] text-[#646462] italic">Ninguno.</p>}
              </div>
            </div>
            <div className="border border-[#e9eae6] rounded-[10px] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-2">Políticas de aprobación</p>
              <div className="flex flex-wrap gap-1.5">
                {linkedApprovals.length
                  ? linkedApprovals.map(p => <span key={p} className="px-2 py-0.5 rounded border border-[#e9eae6] text-[12px] text-[#646462]">{p}</span>)
                  : <p className="text-[13px] text-[#646462] italic">Ninguna.</p>}
              </div>
            </div>
          </div>
        )}

        {/* Raw content */}
        {rawContent && (
          <div className="border border-[#e9eae6] rounded-[10px] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-3">Contenido bruto</p>
            <pre className="whitespace-pre-wrap text-[13px] leading-[22px] text-[#1a1a1a] font-sans">{rawContent}</pre>
          </div>
        )}
      </div>
    </>
  );
}

// ── Brechas (Gaps) view ───────────────────────────────────────────────────────

function BrechasView({ onCreateDraftFromGap, onOpenArticle }: {
  onCreateDraftFromGap: (topic: string) => void;
  onOpenArticle: (id: string) => void;
}) {
  const { data, loading, refetch } = useApi<any>(() => knowledgeApi.gaps(), [], null);
  const stats = data?.stats;

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <h1 className="text-[18px] font-bold text-[#1a1a1a]">Brechas de conocimiento</h1>
        <button onClick={refetch} className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] border border-[#e9eae6] hover:bg-[#ededea]">Actualizar</button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label:'Sin respuesta', value: stats?.unanswered ?? '—' },
            { label:'Escalaciones', value: stats?.escalations ?? '—' },
            { label:'Clústeres obsoletos', value: stats?.staleCoverage ?? '—' },
            { label:'Cobertura', value: stats?.coverageScore != null ? `${stats.coverageScore}%` : '—' },
            { label:'Dominio top', value: stats?.topDemandDomain ?? '—' },
          ].map(s => (
            <div key={s.label} className="border border-[#e9eae6] rounded-[10px] p-4 bg-white">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462]">{s.label}</p>
              <p className="mt-1.5 text-[20px] font-semibold text-[#1a1a1a]">{String(s.value)}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_320px] gap-5">
          {/* Gaps list */}
          <div className="space-y-3">
            <h2 className="text-[14px] font-semibold text-[#1a1a1a]">Demanda sin cobertura</h2>
            {loading && !data ? (
              <div className="flex items-center gap-3 py-8 justify-center">
                <Spinner /><span className="text-[13px] text-[#646462]">Analizando brechas…</span>
              </div>
            ) : (data?.gaps ?? []).length === 0 ? (
              <div className="border border-dashed border-[#e9eae6] rounded-[10px] py-8 text-center">
                <p className="text-[13px] text-[#646462]">No se detectaron brechas críticas en este momento.</p>
              </div>
            ) : (
              (data?.gaps ?? []).map((gap: any) => (
                <div key={gap.topic} className="border border-[#e9eae6] rounded-[10px] bg-white p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-[13px] font-semibold text-[#1a1a1a]">{gap.topic}</h3>
                      <p className="text-[12px] text-[#646462] mt-0.5">{gap.whyItMatters}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#fef2f2] text-[#dc2626] flex-shrink-0">{gap.status}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { label:'Demanda', value: `${gap.frequency} casos` },
                      { label:'Sin resolver', value: gap.unresolvedCases },
                      { label:'Escalaciones', value: gap.escalations },
                      { label:'Dominio sugerido', value: gap.suggestedDomain },
                    ].map(m => (
                      <div key={m.label} className="border border-[#f1f1ee] rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-[#646462]">{m.label}</p>
                        <p className="text-[13px] font-semibold text-[#1a1a1a]">{String(m.value)}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[12px] text-[#646462] mb-3">{gap.recommendedAction}</p>
                  <button
                    onClick={() => onCreateDraftFromGap(gap.topic)}
                    className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black"
                  >Crear borrador</button>
                </div>
              ))
            )}
          </div>

          {/* Right panel: alerts + problem articles */}
          <div className="space-y-4">
            <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-[#f1f1ee]">
                <h3 className="text-[13px] font-semibold text-[#1a1a1a]">Alertas de cobertura</h3>
              </div>
              <div className="p-4 space-y-3">
                {(data?.alerts ?? []).length === 0
                  ? <p className="text-[13px] text-[#646462]">No hay alertas activas.</p>
                  : (data?.alerts ?? []).map((alert: any) => (
                    <div key={alert.id} className="border border-[#f1f1ee] rounded-lg px-3 py-3">
                      <p className="text-[13px] font-semibold text-[#1a1a1a]">{alert.title}</p>
                      <p className="text-[12px] text-[#646462] mt-0.5 leading-[16px]">{alert.detail}</p>
                    </div>
                  ))}
              </div>
            </div>

            <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-[#f1f1ee]">
                <h3 className="text-[13px] font-semibold text-[#1a1a1a]">Artículos problemáticos</h3>
              </div>
              <div className="p-4 space-y-3">
                {(data?.problemArticles ?? []).length === 0
                  ? <p className="text-[13px] text-[#646462]">No hay artículos con problemas.</p>
                  : (data?.problemArticles ?? []).map((art: any) => (
                    <button
                      key={art.id}
                      onClick={() => art.id && onOpenArticle(art.id)}
                      className="w-full border border-[#f1f1ee] rounded-lg px-3 py-3 text-left hover:bg-[#f8f8f7] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[13px] font-semibold text-[#1a1a1a]">{art.title}</p>
                          <p className="text-[12px] text-[#646462]">{art.domain} · {art.citationCount} citas</p>
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f3f3f1] text-[#646462] flex-shrink-0">{art.issue}</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Prueba (Test) view ────────────────────────────────────────────────────────

function PruebaView({ onOpenArticle }: { onOpenArticle: (id: string) => void }) {
  const [query, setQuery] = useState('refund annual plan');
  const [agentId, setAgentId] = useState('all');
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [results, setResults] = useState<any>(null);

  const { data: rawAgents } = useApi(() => agentsApi.list(), [], []);
  const agents = Array.isArray(rawAgents) ? rawAgents : [];

  const runTest = useCallback(async () => {
    if (!query.trim() || running) return;
    setRunning(true);
    try {
      const payload = await knowledgeApi.test({
        query: query.trim(),
        agentId: agentId === 'all' ? null : agentId,
        selectedArticleIds: [],
      });
      setResults(payload);
      setRan(true);
    } catch {
      setResults(null);
    } finally {
      setRunning(false);
    }
  }, [query, agentId, running]);

  const presets = ['Refund outside policy window','Chargeback dispute evidence','Reset 2FA workspace owner','Shipping delay after label'];

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <h1 className="text-[18px] font-bold text-[#1a1a1a]">Prueba de conocimiento</h1>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-5">
        {/* Query input */}
        <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="grid grid-cols-[1fr_220px_auto] gap-3 items-end">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-2">Consulta</label>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void runTest()}
                placeholder="Escribe la pregunta a probar…"
                className="w-full border border-[#e9eae6] rounded-[8px] px-4 py-2.5 text-[13px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-2">Agente</label>
              <select
                value={agentId}
                onChange={e => setAgentId(e.target.value)}
                className="w-full border border-[#e9eae6] rounded-[8px] px-4 py-2.5 text-[13px] text-[#1a1a1a] outline-none bg-white"
              >
                <option value="all">Acceso completo</option>
                {agents.map((ag: any) => <option key={ag.id} value={ag.id}>{ag.name}</option>)}
              </select>
            </div>
            <button
              onClick={() => void runTest()}
              disabled={running || !query.trim()}
              className="px-4 h-10 rounded-[8px] text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black disabled:opacity-50 flex items-center gap-2"
            >
              {running && <Spinner />}
              {running ? 'Ejecutando…' : 'Ejecutar prueba'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {presets.map(p => (
              <button key={p} onClick={() => { setQuery(p); setRan(false); }}
                className="px-3 py-1.5 rounded-full border border-[#e9eae6] text-[12px] text-[#646462] hover:bg-[#f8f8f7] hover:text-[#1a1a1a]">{p}</button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="grid grid-cols-[1fr_300px] gap-5">
          <div className="space-y-4">
            {/* Coverage result */}
            <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-[#f1f1ee]">
                <h2 className="text-[14px] font-semibold text-[#1a1a1a]">Resultado de cobertura</h2>
              </div>
              <div className="p-5">
                {running ? (
                  <div className="flex items-center justify-center py-8 gap-3">
                    <Spinner /><span className="text-[13px] text-[#646462]">Comprobando cobertura…</span>
                  </div>
                ) : !ran || !results ? (
                  <div className="border border-dashed border-[#e9eae6] rounded-[8px] py-8 text-center">
                    <p className="text-[13px] text-[#646462]">Ejecuta una prueba para ver qué puede responder el agente.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label:'Veredicto', value: results.summary?.verdict ?? '—' },
                        { label:'Coinciden', value: results.summary?.matchedSources ?? 0 },
                        { label:'Saludables', value: results.summary?.healthySources ?? 0 },
                        { label:'Bloqueadas', value: results.summary?.blockedSources ?? 0 },
                      ].map(m => (
                        <div key={m.label} className="border border-[#f1f1ee] rounded-lg px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-[#646462]">{m.label}</p>
                          <p className="text-[13px] font-semibold text-[#1a1a1a] capitalize">{String(m.value)}</p>
                        </div>
                      ))}
                    </div>

                    {results.answerPreview && (
                      <div className="border border-[#f1f1ee] rounded-lg px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-2">Vista previa de respuesta</p>
                        <p className="text-[13px] text-[#1a1a1a] leading-[20px]">{results.answerPreview}</p>
                        {results.summary?.suggestedNextStep && (
                          <p className="mt-2 text-[12px] text-[#646462]">{results.summary.suggestedNextStep}</p>
                        )}
                      </div>
                    )}

                    {(results.accessibleResults ?? []).map((r: any) => (
                      <button key={r.id} onClick={() => onOpenArticle(r.id)}
                        className="w-full flex items-start justify-between border border-[#f1f1ee] rounded-lg px-4 py-3 text-left hover:bg-[#f8f8f7] transition-colors">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{r.title}</p>
                          <p className="text-[12px] text-[#646462]">{r.domain_name ?? 'General'} · {r.status}</p>
                          {r.whyMatched && <p className="text-[12px] text-[#646462] mt-1">{r.whyMatched}</p>}
                        </div>
                        <span className="text-[12px] font-semibold text-[#646462] ml-3 flex-shrink-0">{r.relevance_score}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="space-y-4">
            {/* Agent health */}
            <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-[#f1f1ee]">
                <h3 className="text-[13px] font-semibold text-[#1a1a1a]">Estado del agente</h3>
              </div>
              <div className="p-4">
                {results?.agent ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[13px] font-semibold text-[#1a1a1a]">{results.agent.name}</p>
                      <p className="text-[12px] text-[#646462]">{results.agent.slug} · {results.agent.isActive ? 'activo' : 'inactivo'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="border border-[#f1f1ee] rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-[#646462]">Accesibles</p>
                        <p className="text-[13px] font-semibold text-[#1a1a1a]">{results.agentHealth?.accessibleDocuments ?? 0}</p>
                      </div>
                      <div className="border border-[#f1f1ee] rounded-lg px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-[#646462]">Bloqueadas</p>
                        <p className="text-[13px] font-semibold text-[#1a1a1a]">{results.agentHealth?.blockedDocuments ?? 0}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-[#646462]">Selecciona un agente para ver su perímetro de conocimiento.</p>
                )}
              </div>
            </div>

            {/* Citations */}
            <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-[#f1f1ee]">
                <h3 className="text-[13px] font-semibold text-[#1a1a1a]">Citas</h3>
              </div>
              <div className="p-4 space-y-2">
                {(results?.citations ?? []).length === 0
                  ? <p className="text-[13px] text-[#646462]">Sin citas para esta ejecución.</p>
                  : (results.citations ?? []).map((c: any) => (
                    <button key={c.id} onClick={() => onOpenArticle(c.id)}
                      className="w-full flex items-center justify-between border border-[#f1f1ee] rounded-lg px-3 py-2.5 text-left hover:bg-[#f8f8f7] transition-colors">
                      <div>
                        <p className="text-[13px] font-semibold text-[#1a1a1a]">{c.title}</p>
                        <p className="text-[12px] text-[#646462]">{c.domain_name ?? 'General'}</p>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Editor Modal ──────────────────────────────────────────────────────────────

function EditorModal({
  open,
  mode,
  draft,
  domains,
  loading,
  onChange,
  onSave,
  onClose,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  draft: KDraft;
  domains: any[];
  loading: boolean;
  onChange: (d: Partial<KDraft>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const title = guessTitleFromContent(text, file.name);
      onChange({ title, content: text });
    } catch { /* noop */ }
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="w-full max-w-[900px] rounded-[12px] border border-[#e9eae6] bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e9eae6] px-6 py-4 flex-shrink-0">
          <div>
            <h3 className="text-[16px] font-semibold text-[#1a1a1a]">
              {mode === 'create' ? 'Crear artículo de conocimiento' : 'Editar artículo de conocimiento'}
            </h3>
            <p className="text-[12px] text-[#646462] mt-0.5">Escribe como narrativa. El agente leerá este texto directamente.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fileRef.current?.click()} className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] border border-[#e9eae6] hover:bg-[#ededea] flex items-center gap-1.5">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a1a1a]"><path d="M8 2v8M5 7l3 3 3-3M3 12h10" stroke="#1a1a1a" fill="none" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Importar
            </button>
            <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" className="hidden" onChange={handleFile}/>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-1.5">Título</label>
              <input value={draft.title} onChange={e => onChange({ title: e.target.value })}
                className="w-full border border-[#e9eae6] rounded-[8px] px-4 py-2.5 text-[13px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a]"/>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-1.5">Tipo</label>
              <select value={draft.type} onChange={e => onChange({ type: e.target.value as KArticleType })}
                className="border border-[#e9eae6] rounded-[8px] px-4 py-2.5 text-[13px] text-[#1a1a1a] outline-none bg-white">
                <option value="ARTICLE">Article</option>
                <option value="POLICY">Policy</option>
                <option value="SNIPPET">Snippet</option>
                <option value="PLAYBOOK">Playbook</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-1.5">Dominio</label>
              <select value={draft.domainId} onChange={e => onChange({ domainId: e.target.value })}
                className="w-full border border-[#e9eae6] rounded-[8px] px-4 py-2.5 text-[13px] text-[#1a1a1a] outline-none bg-white">
                <option value="">General</option>
                {domains.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-1.5">Owner User ID</label>
              <input value={draft.ownerUserId} onChange={e => onChange({ ownerUserId: e.target.value })}
                placeholder="user_alex"
                className="w-full border border-[#e9eae6] rounded-[8px] px-4 py-2.5 text-[13px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a]"/>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-1.5">Revisión (días)</label>
              <input type="number" min="7" value={draft.reviewCycleDays} onChange={e => onChange({ reviewCycleDays: e.target.value })}
                className="w-full border border-[#e9eae6] rounded-[8px] px-4 py-2.5 text-[13px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a]"/>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-1.5">Contenido narrativo</label>
            <textarea value={draft.content} onChange={e => onChange({ content: e.target.value })}
              rows={16}
              placeholder="Escribe el contenido como narrativa. Puedes usar headings (## Sección) para estructurar."
              className="w-full border border-[#e9eae6] rounded-[8px] px-4 py-4 text-[13px] leading-[22px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] resize-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-1.5">Estado</label>
            <select value={draft.status} onChange={e => onChange({ status: e.target.value as 'Published'|'Draft' })}
              className="border border-[#e9eae6] rounded-[8px] px-4 py-2.5 text-[13px] text-[#1a1a1a] outline-none bg-white">
              <option value="Draft">Borrador</option>
              <option value="Published">Publicado</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[#e9eae6] px-6 py-4 flex-shrink-0">
          <button onClick={onClose} className="px-4 h-9 rounded-full text-[13px] font-medium text-[#646462] hover:text-[#1a1a1a]">Cancelar</button>
          <button onClick={onSave} disabled={loading || !draft.title.trim() || !draft.content.trim()}
            className="px-4 h-9 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black disabled:opacity-50 flex items-center gap-2">
            {loading && <Spinner />}
            {mode === 'create' ? 'Crear artículo' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function KnowledgeV2() {
  const [sub, setSub] = useState<KV2Sub>('fuentes');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [draft, setDraft] = useState<KDraft>(emptyDraft);

  const { data: rawDomains } = useApi(() => knowledgeApi.listDomains(), [], []);
  const domains = Array.isArray(rawDomains) ? rawDomains : [];

  const createMut = useMutation((p: Record<string,any>) => knowledgeApi.createArticle(p));
  const updateMut = useMutation((p: { id: string; body: Record<string,any> }) => knowledgeApi.updateArticle(p.id, p.body));
  const publishMut = useMutation((id: string) => knowledgeApi.publishArticle(id));

  const { data: selectedArticle } = useApi(
    () => selectedArticleId ? knowledgeApi.getArticle(selectedArticleId) : Promise.resolve(null),
    [selectedArticleId],
    null,
  );

  // Sync draft when article loaded for edit
  useEffect(() => {
    if (editorMode === 'edit' && selectedArticle) {
      const a = selectedArticle as any;
      setDraft({
        title: a.title || '',
        content: typeof a.content === 'string' ? a.content : '',
        type: (['POLICY','ARTICLE','SNIPPET','PLAYBOOK'].includes(a.type?.toUpperCase())
          ? a.type.toUpperCase() : 'ARTICLE') as KArticleType,
        status: a.status === 'published' ? 'Published' : 'Draft',
        domainId: a.domain_id || '',
        ownerUserId: a.owner_user_id || '',
        reviewCycleDays: String(a.review_cycle_days ?? 90),
      });
    }
  }, [editorMode, selectedArticle]);

  const openCreateEditor = (title = '') => {
    setEditorMode('create');
    setDraft({ ...emptyDraft, title });
    setEditorOpen(true);
  };

  const openEditEditor = () => {
    setEditorMode('edit');
    setEditorOpen(true);
  };

  const handleSave = async () => {
    const contentStructured = buildKnowledgeSheetFromNarrative(draft.content);
    const existing = selectedArticle as any;
    const payload: Record<string, any> = {
      title: draft.title,
      content: draft.content,
      content_structured: contentStructured,
      type: draft.type.toLowerCase(),
      status: draft.status === 'Published' ? 'published' : 'draft',
      domain_id: draft.domainId || null,
      owner_user_id: draft.ownerUserId || null,
      review_cycle_days: Number(draft.reviewCycleDays) || 90,
    };
    if (editorMode === 'edit' && existing) {
      if (Array.isArray(existing.linked_workflow_ids)) payload.linked_workflow_ids = existing.linked_workflow_ids;
      if (Array.isArray(existing.linked_approval_policy_ids)) payload.linked_approval_policy_ids = existing.linked_approval_policy_ids;
    }
    if (editorMode === 'create') {
      const created = await createMut.mutate(payload);
      if ((created as any)?.id) setSelectedArticleId((created as any).id);
    } else if (selectedArticleId) {
      await updateMut.mutate({ id: selectedArticleId, body: payload });
    }
    setEditorOpen(false);
  };

  const handlePublish = async () => {
    if (!selectedArticleId) return;
    await publishMut.mutate(selectedArticleId);
  };

  function renderContent() {
    // Article detail overlay (takes over from biblioteca)
    if (selectedArticleId && sub === 'biblioteca') {
      return (
        <ArticleDetailView
          articleId={selectedArticleId}
          onBack={() => setSelectedArticleId(null)}
          onEdit={openEditEditor}
          onPublish={handlePublish}
        />
      );
    }

    switch (sub) {
      case 'fuentes':     return <FuentesView />;
      case 'biblioteca':  return (
        <BibliotecaView
          onSelectArticle={id => { setSelectedArticleId(id); setSub('biblioteca'); }}
          onCreateArticle={() => openCreateEditor()}
          selectedArticleId={selectedArticleId}
        />
      );
      case 'brechas':     return <BrechasView onCreateDraftFromGap={topic => openCreateEditor(topic)} onOpenArticle={id => { setSelectedArticleId(id); setSub('biblioteca'); }} />;
      case 'prueba':      return <PruebaView onOpenArticle={id => { setSelectedArticleId(id); setSub('biblioteca'); }} />;
      case 'articulos':
        // Redirect to biblioteca which is the canonical article list view
        setSub('biblioteca');
        return null;
      case 'centroAyuda': return (
        <>
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[18px] font-bold text-[#1a1a1a]">Centro de ayuda</h1>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[13px] text-[#646462]">Centro de ayuda — pendiente de configuración.</p>
          </div>
        </>
      );
    }
  }

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden">
      <KnowledgeSidebar sub={sub} onSelect={s => { setSub(s); setSelectedArticleId(null); }} />

      <div className="flex-1 bg-white flex flex-col min-h-0 overflow-hidden">
        {renderContent()}
      </div>

      <EditorModal
        open={editorOpen}
        mode={editorMode}
        draft={draft}
        domains={domains}
        loading={createMut.loading || updateMut.loading}
        onChange={partial => setDraft(prev => ({ ...prev, ...partial }))}
        onSave={() => void handleSave()}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
}
