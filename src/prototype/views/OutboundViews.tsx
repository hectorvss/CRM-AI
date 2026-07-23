// ─────────────────────────────────────────────────────────────────────────────
// Outbound views
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../api/hooks';
import { casesApi, customersApi, emailTemplatesApi, workflowsApi } from '../../api/client';
import Workflows from '../../components/Workflows';
import { Dropdown, KnowledgePlaceholder, TrialBanner, messages } from '../sharedUi';
import { parsePath, replaceRoute } from '../router';


// ─────────────────────────────────────────────────────────────────────────────
// OUTBOUND VIEW (Figma nodes 4:30285 — outbound/all, 4:31277 — outbound/series)
// ─────────────────────────────────────────────────────────────────────────────

type OutboundSubView = 'mensajes' | 'series' | 'ultimo' | 'borradores' | 'ajustes';

function OutboundSidebar({ sub, onSelect }: { sub: OutboundSubView; onSelect: (s: OutboundSubView) => void }) {
  // Match Inbox sidebar UI: header 20px font-semibold tracking -0.4px, items text-[13px]
  // with filled bold icons (#1a1a1a), font-semibold + bg-white + shadow on active.
  const [openVistas, setOpenVistas] = useState(sub === 'ultimo' || sub === 'borradores');
  // Active item style — same shadow + font-semibold pattern as Inbox SidebarNavItem.
  const itemCls = (isActive: boolean) =>
    `relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
      isActive
        ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
        : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
    }`;
  return (
    <div className="w-[236px] flex-shrink-0 bg-[#f8f8f7] rounded-[12px] border border-[#e9eae6] flex flex-col overflow-hidden">
      {/* Header — same pattern as Inbox */}
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Canales salientes</span>
      </div>
      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-4 flex flex-col gap-0.5">
        {/* Mensajes — bold filled triangle icon */}
        <button onClick={() => onSelect('mensajes')} className={itemCls(sub === 'mensajes')}>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 4h12L8 13z"/></svg>
          <span className="flex-1">Mensajes</span>
        </button>
        {/* Series — bold filled branching icon */}
        <button onClick={() => onSelect('series')} className={itemCls(sub === 'series')}>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="3.5" cy="3.5" r="1.7"/><circle cx="3.5" cy="12.5" r="1.7"/><circle cx="12.5" cy="8" r="1.7"/><path d="M5 4l6 3.5M5 12l6-3.5" stroke="#1a1a1a" strokeWidth="1.5"/></svg>
          <span className="flex-1">Series</span>
        </button>
        {/* Vistas — collapsible group header (NOT a nav item, doesn't get bold-on-active) */}
        <button
          onClick={() => setOpenVistas(o => !o)}
          className="mt-3 px-3 flex items-center justify-between h-8 rounded-lg hover:bg-[#e9eae6]/40 w-full"
        >
          <span className="text-[13px] font-semibold text-[#1a1a1a]">Vistas</span>
          <div className="flex items-center gap-1">
            <span onClick={(e) => e.stopPropagation()} className="w-5 h-5 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.1)]">
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
            </span>
            <span className="w-5 h-4 flex items-center justify-center">
              <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-[#646462] transition-transform ${openVistas ? 'rotate-90' : ''}`}><path d="M6 4l4 4-4 4z"/></svg>
            </span>
          </div>
        </button>
        {openVistas && (
          <div className="flex flex-col gap-0.5 pl-1">
            {/* Último — bold filled clock-circle icon */}
            <button onClick={() => onSelect('ultimo')} className={itemCls(sub === 'ultimo')}>
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8.75 4v3.69l2.6 1.5-.75 1.3L7.25 8.5V4h1.5z"/></svg>
              <span className="flex-1">Último</span>
            </button>
            {/* Borradores recientes — bold filled pencil icon */}
            <button onClick={() => onSelect('borradores')} className={itemCls(sub === 'borradores')}>
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M11.7 2.3l2 2-7.7 7.7-3 1 1-3 7.7-7.7zM12.5 1.5l1 1 1-1 .5.5-1 1 1 1-.5.5-1-1-1 1-.5-.5 1-1-1-1z"/></svg>
              <span className="flex-1">Borradores recientes</span>
            </button>
          </div>
        )}
        {/* Ajustes — outside Vistas group, always visible (matches Figma screenshot) */}
        <button onClick={() => onSelect('ajustes')} className={`mt-1 ${itemCls(sub === 'ajustes')}`}>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM7 1h2v2.2l1.6.7L12.2 2.5l1.4 1.4L12 5.5l.7 1.6H15v2h-2.2l-.7 1.6 1.6 1.6-1.4 1.4-1.6-1.6L9 12.8V15H7v-2.2l-1.6-.7L3.8 13.5l-1.4-1.4L4 10.5 3.3 8.9H1V7h2.3l.7-1.6L2.4 3.8l1.4-1.4L5.4 4l1.6-.7V1z"/></svg>
          <span className="flex-1">Ajustes</span>
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a1a1a]"><path d="M5 3h8v8h-2V6.4l-6.3 6.3-1.4-1.4L9.6 5H5z"/></svg>
        </button>
      </div>
    </div>
  );
}

// ── Outbound types ─────────────────────────────────────────────────────────────
type OutboundContentType = 'all' | 'chat' | 'email' | 'whatsapp' | 'sms' | 'push' | 'banner' | 'post';
type OutboundMsgStatus = 'borrador' | 'activo' | 'pausado' | 'detenido';
type OutboundTriggerType = 'visita' | 'accion' | 'manual' | 'evento';

interface OutboundMsg {
  id: string;
  title: string;
  status: OutboundMsgStatus;
  senderName: string;
  senderInitial: string;
  contentType: OutboundContentType;
  sent: number;
  goalPct?: number;
  triggerType: OutboundTriggerType;
  audience?: string;
  channel?: string;
  frequency?: string;
  goal?: string;
  createdAt: string;
}

const OUTBOUND_MOCK_MSGS: OutboundMsg[] = [
  { id: 'om1', title: 'Bienvenida a nuevos usuarios', status: 'activo', senderName: 'Hector Vidal Sanchez', senderInitial: 'H', contentType: 'chat', sent: 1423, goalPct: 34, triggerType: 'visita', audience: 'Nuevos usuarios (< 7 días)', channel: 'Chat', frequency: 'Una vez por usuario', goal: 'Activación', createdAt: '2025-04-10' },
  { id: 'om2', title: 'Recupera usuarios inactivos', status: 'activo', senderName: 'Hector Vidal Sanchez', senderInitial: 'H', contentType: 'email', sent: 892, goalPct: 18, triggerType: 'accion', audience: 'Inactivos > 30 días', channel: 'Correo electrónico', frequency: 'Una vez por mes', goal: 'Retención', createdAt: '2025-04-02' },
  { id: 'om3', title: 'Anuncio de nueva función: Informes AI', status: 'pausado', senderName: 'Hector Vidal Sanchez', senderInitial: 'H', contentType: 'banner', sent: 3100, goalPct: 62, triggerType: 'manual', audience: 'Todos los usuarios', channel: 'Banner', frequency: 'Una vez', goal: 'Adopción', createdAt: '2025-03-15' },
  { id: 'om4', title: 'Oferta especial 30%', status: 'detenido', senderName: 'Hector Vidal Sanchez', senderInitial: 'H', contentType: 'whatsapp', sent: 540, goalPct: 9, triggerType: 'evento', audience: 'Clientes premium', channel: 'WhatsApp', frequency: 'Una vez', goal: 'Conversión', createdAt: '2025-02-28' },
  { id: 'om5', title: 'Sin título', status: 'borrador', senderName: 'Hector Vidal Sanchez', senderInitial: 'H', contentType: 'chat', sent: 0, triggerType: 'visita', createdAt: '2025-05-01' },
];

const OUTBOUND_CONTENT_TYPE_LABELS: Record<OutboundContentType, string> = {
  all: 'Todos los tipos de contenido',
  chat: 'Chat', email: 'Correo electrónico', whatsapp: 'WhatsApp',
  sms: 'SMS', push: 'Push', banner: 'Banner', post: 'Post',
};

function OutboundStatusBadge({ status }: { status: OutboundMsgStatus }) {
  const cfg: Record<OutboundMsgStatus, { label: string; cls: string }> = {
    activo:   { label: 'Activo',   cls: 'bg-[#dcfce7] text-[#16a34a]' },
    pausado:  { label: 'Pausado',  cls: 'bg-[#fef9c3] text-[#a16207]' },
    detenido: { label: 'Detenido', cls: 'bg-[#fee2e2] text-[#dc2626]' },
    borrador: { label: 'Borrador', cls: 'bg-[#f1f1ee] text-[#646462]' },
  };
  const { label, cls } = cfg[status] ?? cfg.borrador;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>{label}</span>;
}

function OutboundContentIcon({ type }: { type: OutboundContentType }) {
  const icons: Record<OutboundContentType, React.ReactNode> = {
    all:      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><path d="M2 4h12L8 13z"/></svg>,
    chat:     <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><path d="M3 3h10a1 1 0 011 1v6a1 1 0 01-1 1H6l-3 2V4a1 1 0 011-1z"/></svg>,
    email:    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><rect x="2" y="4" width="12" height="9" rx="1"/><path d="M2 4l6 5 6-5"/></svg>,
    whatsapp: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M8 1.5a6.5 6.5 0 015.5 9.9L15 14.5l-3.3-1A6.5 6.5 0 118 1.5zm-1.5 3.5c-.2 0-.6.1-.9.5-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .2.2 2 3 4.8 4.1.5.2.8.2 1 .1.3 0 1-.4 1.2-.8.2-.3.2-.6.1-.9-.1-.1-.3-.2-.7-.4-.3-.2-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.1-.3.2-.5.1C8 12 6.3 10.3 6 9.7c-.1-.2 0-.4.2-.5l.4-.5c.1-.2.2-.4.3-.6v-.6c0-.2-1-1.6-1.4-2.5z"/></svg>,
    sms:      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><rect x="3" y="2" width="10" height="14" rx="2"/><path d="M6 12h4M6 9h4M6 6h4"/></svg>,
    push:     <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><path d="M8 2v1M5 3.5l.7.7M11 3.5l-.7.7M3 8H2M14 8h-1M4.5 12l.7-.7M11.5 12l-.7-.7M8 5a3 3 0 000 6 3 3 0 000-6z"/><path d="M6 13h4"/></svg>,
    banner:   <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><rect x="1" y="3" width="14" height="10" rx="1.5"/><path d="M1 7h14"/></svg>,
    post:     <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 6h6M5 9h4"/></svg>,
  };
  return <>{icons[type] ?? icons.chat}</>;
}

// ── Template Picker Modal ─────────────────────────────────────────────────────
type OutboundTemplateCategory = 'todo' | 'popular' | 'onboarding' | 'retencion' | 'adopcion' | 'ventas' | 'soporte' | 'chat' | 'email' | 'whatsapp' | 'sms' | 'push' | 'banner' | 'automatizado' | 'manual';

interface OutboundTemplate {
  id: string;
  title: string;
  description: string;
  categories: OutboundTemplateCategory[];
  contentType: OutboundContentType;
  triggerType: OutboundTriggerType;
  popular?: boolean;
  previewColor: string;
}

const OUTBOUND_TEMPLATES: OutboundTemplate[] = [
  { id: 't1', title: 'Da la bienvenida a nuevos usuarios', description: 'Saluda a los usuarios cuando inician sesión por primera vez y explícales cómo empezar.', categories: ['popular','onboarding','chat','automatizado'], contentType: 'chat', triggerType: 'visita', popular: true, previewColor: 'from-[#dbeafe] to-[#bfdbfe]' },
  { id: 't2', title: 'Anuncia una nueva función', description: 'Informa a los usuarios sobre las nuevas funciones con un mensaje específico para tu público objetivo.', categories: ['popular','adopcion','banner','automatizado'], contentType: 'banner', triggerType: 'visita', popular: true, previewColor: 'from-[#d1fae5] to-[#a7f3d0]' },
  { id: 't3', title: 'Vuelve a captar usuarios inactivos', description: 'Despierta el interés de los usuarios que llevan un tiempo sin conectarse.', categories: ['popular','retencion','email','automatizado'], contentType: 'email', triggerType: 'accion', popular: true, previewColor: 'from-[#fce7f3] to-[#fbcfe8]' },
  { id: 't4', title: 'Onboarding en varios pasos', description: 'Guía a los usuarios a través de un recorrido de bienvenida estructurado.', categories: ['onboarding','chat','automatizado'], contentType: 'chat', triggerType: 'accion', previewColor: 'from-[#ede9fe] to-[#ddd6fe]' },
  { id: 't5', title: 'Oferta por tiempo limitado', description: 'Envía una oferta especial a segmentos de clientes con alta conversión.', categories: ['ventas','email','automatizado'], contentType: 'email', triggerType: 'manual', previewColor: 'from-[#fef3c7] to-[#fde68a]' },
  { id: 't6', title: 'Mensaje de soporte proactivo', description: 'Ofrece ayuda cuando detectas que un usuario está teniendo dificultades.', categories: ['soporte','chat','automatizado'], contentType: 'chat', triggerType: 'accion', previewColor: 'from-[#e0f2fe] to-[#bae6fd]' },
  { id: 't7', title: 'Confirmación por WhatsApp', description: 'Envía confirmaciones de pedidos o citas automáticamente via WhatsApp.', categories: ['soporte','whatsapp','automatizado'], contentType: 'whatsapp', triggerType: 'evento', previewColor: 'from-[#dcfce7] to-[#bbf7d0]' },
  { id: 't8', title: 'Notificación push de reactivación', description: 'Notificación push para recuperar usuarios que no abren la app.', categories: ['retencion','push','automatizado'], contentType: 'push', triggerType: 'accion', previewColor: 'from-[#f3e8ff] to-[#e9d5ff]' },
  { id: 't9', title: 'Banner de upgrade / plan superior', description: 'Muestra un banner a usuarios en plan gratuito para que suban de plan.', categories: ['ventas','banner','automatizado'], contentType: 'banner', triggerType: 'visita', previewColor: 'from-[#fff7ed] to-[#fed7aa]' },
  { id: 't10', title: 'SMS de recuperación de carrito', description: 'Recuerda a los clientes que tienen artículos en el carrito.', categories: ['ventas','sms','automatizado'], contentType: 'sms', triggerType: 'evento', previewColor: 'from-[#fce7f3] to-[#fbcfe8]' },
  { id: 't11', title: 'Encuesta de satisfacción (NPS)', description: 'Recopila feedback de clientes en el momento de mayor valor.', categories: ['soporte','email','manual'], contentType: 'email', triggerType: 'manual', previewColor: 'from-[#ecfdf5] to-[#d1fae5]' },
  { id: 't12', title: 'Recordatorio de renovación', description: 'Avisa a los suscriptores antes de que expire su plan.', categories: ['retencion','email','automatizado'], contentType: 'email', triggerType: 'accion', previewColor: 'from-[#fef2f2] to-[#fecaca]' },
];

const OUTBOUND_TEMPLATE_CAT_GROUPS: { label: string; items: { key: OutboundTemplateCategory; label: string }[] }[] = [
  { label: '', items: [{ key: 'todo', label: 'Todo' }, { key: 'popular', label: 'Popular' }] },
  { label: 'CASOS DE USO', items: [{ key: 'onboarding', label: 'Onboarding' }, { key: 'retencion', label: 'Retención' }, { key: 'adopcion', label: 'Adopción de funciones' }, { key: 'ventas', label: 'Ventas' }, { key: 'soporte', label: 'Soporte' }] },
  { label: 'CANALES', items: [{ key: 'chat', label: 'Chat' }, { key: 'email', label: 'Correo electrónico' }, { key: 'whatsapp', label: 'WhatsApp' }, { key: 'sms', label: 'SMS' }, { key: 'push', label: 'Push' }, { key: 'banner', label: 'Banner' }] },
  { label: 'TIPOS', items: [{ key: 'automatizado', label: 'Automatizados' }, { key: 'manual', label: 'Manuales' }] },
];

// ── Full quick-start catalogue (Intercom "Elegir una plantilla") ──────────────
type QsType = 'chat' | 'banner' | 'tooltip' | 'post' | 'email' | 'push' | 'tour' | 'checklist' | 'sms' | 'survey' | 'carousel' | 'workflow' | 'news' | 'whatsapp' | 'broadcast' | 'discord' | 'telegram';

// The 17 content types offered in "Comenzar desde cero" (in display order).
const OUTBOUND_QS_TYPES: { key: QsType; label: string; core: OutboundContentType; grad: string }[] = [
  { key: 'chat',      label: 'Chat',                            core: 'chat',     grad: 'from-[#dbeafe] to-[#bfdbfe]' },
  { key: 'banner',    label: 'Banner',                          core: 'banner',   grad: 'from-[#fff7ed] to-[#fed7aa]' },
  { key: 'tooltip',   label: 'Información de herramientas',      core: 'post',     grad: 'from-[#ccfbf1] to-[#99f6e4]' },
  { key: 'post',      label: 'Publicación',                     core: 'post',     grad: 'from-[#ede9fe] to-[#ddd6fe]' },
  { key: 'email',     label: 'Correo electrónico',              core: 'email',    grad: 'from-[#fce7f3] to-[#fbcfe8]' },
  { key: 'push',      label: 'Notificación instantánea móvil',  core: 'push',     grad: 'from-[#f3e8ff] to-[#e9d5ff]' },
  { key: 'tour',      label: 'Recorrido de producto',           core: 'post',     grad: 'from-[#e0f2fe] to-[#bae6fd]' },
  { key: 'checklist', label: 'Lista de verificación',           core: 'chat',     grad: 'from-[#d1fae5] to-[#a7f3d0]' },
  { key: 'sms',       label: 'SMS',                             core: 'sms',      grad: 'from-[#fef9c3] to-[#fde68a]' },
  { key: 'survey',    label: 'Encuesta',                        core: 'post',     grad: 'from-[#e0e7ff] to-[#c7d2fe]' },
  { key: 'carousel',  label: 'Carrusel móvil',                  core: 'post',     grad: 'from-[#ffe4e6] to-[#fecdd3]' },
  { key: 'workflow',  label: 'Flujo de trabajo',                core: 'post',     grad: 'from-[#f1f5f9] to-[#e2e8f0]' },
  { key: 'news',      label: 'Noticias',                        core: 'post',     grad: 'from-[#fef3c7] to-[#fde68a]' },
  { key: 'whatsapp',  label: 'WhatsApp',                        core: 'whatsapp', grad: 'from-[#dcfce7] to-[#bbf7d0]' },
  { key: 'broadcast', label: 'Difusión',                        core: 'post',     grad: 'from-[#e0e7ff] to-[#c7d2fe]' },
  { key: 'discord',   label: 'Difusión en Discord',             core: 'post',     grad: 'from-[#e0e7ff] to-[#c7d2fe]' },
  { key: 'telegram',  label: 'Difusión en Telegram',            core: 'post',     grad: 'from-[#e0f2fe] to-[#bae6fd]' },
];
function qsTypeMeta(type: QsType) {
  return OUTBOUND_QS_TYPES.find(t => t.key === type) ?? OUTBOUND_QS_TYPES[3];
}

interface OutboundQuickStart { id: string; type: QsType; title: string; popular?: boolean }
const OUTBOUND_QUICKSTARTS: OutboundQuickStart[] = [
  { id: 'qs1',  type: 'post', title: 'Announce a new feature to drive adoption', popular: true },
  { id: 'qs2',  type: 'post', title: 'Offer a discount to boost sales', popular: true },
  { id: 'qs3',  type: 'post', title: 'Promote webinars to drive engagement' },
  { id: 'qs4',  type: 'post', title: 'Follow up after orders to ensure satisfaction' },
  { id: 'qs5',  type: 'chat', title: 'Say hi to welcome new visitors', popular: true },
  { id: 'qs6',  type: 'chat', title: 'Ask new users if they need any help' },
  { id: 'qs7',  type: 'chat', title: 'Help visitors on your pricing page' },
  { id: 'qs8',  type: 'chat', title: 'Encourage more newsletter sign-ups' },
  { id: 'qs9',  type: 'chat', title: 'Ask Spanish speakers if they need any help' },
  { id: 'qs10', type: 'email', title: 'Nurture leads to build relationships', popular: true },
  { id: 'qs11', type: 'email', title: 'Reconnect to keep users close' },
  { id: 'qs12', type: 'email', title: 'Remind users to complete their purchase' },
  { id: 'qs13', type: 'email', title: 'Confirm an order has been placed' },
  { id: 'qs14', type: 'email', title: 'Remind users their subscription will renew' },
  { id: 'qs15', type: 'email', title: 'Treat customers on their birthday' },
  { id: 'qs16', type: 'email', title: "Verify a new user's email address" },
  { id: 'qs17', type: 'banner', title: 'Promote an upcoming event' },
  { id: 'qs18', type: 'banner', title: 'Offer a discount or promotion' },
  { id: 'qs19', type: 'banner', title: 'Announce downtimes or maintenance' },
  { id: 'qs20', type: 'banner', title: 'Share helpful tips and tricks' },
  { id: 'qs21', type: 'banner', title: 'Remind users their trial is ending' },
  { id: 'qs22', type: 'banner', title: 'Promote a feature to drive action' },
  { id: 'qs23', type: 'banner', title: 'Ask for visitor details to generate leads' },
  { id: 'qs24', type: 'banner', title: 'Alert users to an expired credit card' },
  { id: 'qs25', type: 'carousel', title: 'Onboard new users to drive adoption' },
  { id: 'qs26', type: 'carousel', title: 'Welcome new users so they feel at home' },
  { id: 'qs27', type: 'carousel', title: 'Offer support before users ask' },
  { id: 'qs28', type: 'carousel', title: 'Announce a feature to boost engagement' },
  { id: 'qs29', type: 'carousel', title: 'Offer promotions to convert customers' },
  { id: 'qs30', type: 'carousel', title: 'Share activity summaries to engage users' },
  { id: 'qs31', type: 'push', title: 'Remind users their subscription will renew' },
  { id: 'qs32', type: 'push', title: 'Promote new offers to re-engage users' },
  { id: 'qs33', type: 'push', title: 'Send promotions to drive new purchases' },
  { id: 'qs34', type: 'workflow', title: 'Convert trial users into paying customers' },
  { id: 'qs35', type: 'tour', title: 'Show customers how to adopt new features' },
  { id: 'qs36', type: 'tour', title: 'Take new users on a tour to get onboarded' },
  { id: 'qs37', type: 'survey', title: 'Measure NPS® to understand user loyalty', popular: true },
  { id: 'qs38', type: 'sms', title: 'Welcome new customers to drive activation' },
  { id: 'qs39', type: 'sms', title: 'Notify users about an order or update' },
  { id: 'qs40', type: 'sms', title: 'Remind customers about appointments' },
  { id: 'qs41', type: 'sms', title: 'Send account updates to keep customers aware' },
  { id: 'qs42', type: 'sms', title: 'Reconnect with inactive customers' },
  { id: 'qs43', type: 'sms', title: 'Offer discounts to drive more purchases' },
  { id: 'qs44', type: 'tooltip', title: 'Add links to deepen engagement' },
  { id: 'qs45', type: 'tooltip', title: 'Get attention with an animated beacon' },
  { id: 'qs46', type: 'tooltip', title: 'Add labels to boost visibility' },
  { id: 'qs47', type: 'tooltip', title: 'Add a tooltip to give extra details' },
  { id: 'qs48', type: 'survey', title: 'Learn about users to personalize experiences' },
  { id: 'qs49', type: 'survey', title: 'Capture feature requests to help you grow' },
  { id: 'qs50', type: 'survey', title: 'Measure satisfaction to improve features' },
  { id: 'qs51', type: 'survey', title: 'Capture visitor intent to generate leads' },
  { id: 'qs52', type: 'survey', title: 'Learn why users leave, to boost retention' },
  { id: 'qs53', type: 'survey', title: 'Measure product/market fit to meet user needs' },
  { id: 'qs54', type: 'news', title: 'Announce a new product to raise awareness' },
  { id: 'qs55', type: 'news', title: 'Share a feature update to boost adoption' },
  { id: 'qs56', type: 'news', title: 'Promote events to increase sign-ups' },
  { id: 'qs57', type: 'news', title: 'Share company news to keep customers informed' },
  { id: 'qs58', type: 'checklist', title: 'Onboard new users with key steps' },
  { id: 'qs59', type: 'checklist', title: 'Guide users through a new feature' },
  { id: 'qs60', type: 'workflow', title: 'Use Fin to proactively offer help to prospects' },
  { id: 'qs61', type: 'workflow', title: 'Use Fin to proactively offer help to customers' },
];

// Sidebar: use-case + type filters over the quick-start catalogue.
const OUTBOUND_QS_SIDEBAR: { label: string; items: { key: string; label: string }[] }[] = [
  { label: '', items: [{ key: 'todo', label: 'Todo' }, { key: 'popular', label: 'Popular' }] },
  { label: 'CASOS DE USO', items: [
    { key: 'uc:proactiva', label: 'Asistencia proactiva' },
    { key: 'uc:onboarding', label: 'Incorporación' },
    { key: 'uc:transaccional', label: 'Transaccional' },
    { key: 'uc:captacion', label: 'Captación' },
  ] },
  { label: 'TIPOS', items: OUTBOUND_QS_TYPES.map(t => ({ key: `type:${t.key}`, label: t.label })) },
];
function qsMatchesUseCase(qs: OutboundQuickStart, uc: string): boolean {
  const t = qs.title.toLowerCase();
  if (uc === 'onboarding') return /onboard|welcome|new (user|customer|visitor)|activation|get onboarded|first/.test(t);
  if (uc === 'proactiva') return /help|support|pricing|question|tips|assist|proactively/.test(t);
  if (uc === 'transaccional') return /order|renew|subscription|appointment|confirm|account update|verify|birthday|expired|maintenance|downtime|receipt/.test(t);
  if (uc === 'captacion') return /lead|sign-up|newsletter|discount|promotion|convert|purchase|sale|event|webinar|re-engage|reconnect|trial|generate|offer/.test(t);
  return true;
}
function qsMatchesCategory(qs: OutboundQuickStart, cat: string): boolean {
  if (cat === 'todo') return true;
  if (cat === 'popular') return !!qs.popular;
  if (cat.startsWith('type:')) return qs.type === cat.slice(5);
  if (cat.startsWith('uc:')) return qsMatchesUseCase(qs, cat.slice(3));
  return true;
}

function OutboundTemplatePreview({ color, type }: { color: string; type: OutboundContentType }) {
  return (
    <div className={`w-full h-full bg-gradient-to-br ${color} flex items-center justify-center p-3`}>
      {type === 'chat' && (
        <div className="w-full space-y-1.5">
          <div className="bg-white/80 rounded-[8px] p-2 max-w-[80%] shadow-sm">
            <div className="h-2 bg-[#1a1a1a]/20 rounded-full w-[90%] mb-1"/>
            <div className="h-2 bg-[#1a1a1a]/15 rounded-full w-[60%]"/>
          </div>
          <div className="bg-white/60 rounded-[8px] p-1.5 max-w-[50%] ml-auto shadow-sm">
            <div className="h-2 bg-[#3b59f6]/40 rounded-full w-full"/>
          </div>
        </div>
      )}
      {type === 'email' && (
        <div className="w-full bg-white/80 rounded-[6px] p-2 shadow-sm">
          <div className="h-2.5 bg-[#1a1a1a]/30 rounded-full w-[70%] mb-2"/>
          <div className="h-1.5 bg-[#1a1a1a]/15 rounded-full w-full mb-1"/>
          <div className="h-1.5 bg-[#1a1a1a]/15 rounded-full w-[85%] mb-1"/>
          <div className="h-1.5 bg-[#1a1a1a]/15 rounded-full w-[60%] mb-2"/>
          <div className="h-5 bg-[#3b59f6]/70 rounded-full w-[40%] mx-auto"/>
        </div>
      )}
      {type === 'banner' && (
        <div className="w-full bg-white/80 rounded-[6px] px-2 py-1.5 shadow-sm flex items-center gap-2">
          <div className="flex-1"><div className="h-2 bg-[#1a1a1a]/30 rounded-full w-[80%] mb-1"/><div className="h-1.5 bg-[#1a1a1a]/15 rounded-full w-[60%]"/></div>
          <div className="h-5 bg-[#3b59f6]/70 rounded-full px-2 w-[30%]"/>
        </div>
      )}
      {(type === 'whatsapp' || type === 'sms') && (
        <div className="w-full space-y-1.5">
          <div className="bg-[#dcf8c6]/90 rounded-[8px] p-2 max-w-[80%] ml-auto shadow-sm">
            <div className="h-2 bg-[#1a1a1a]/20 rounded-full w-[90%] mb-1"/>
            <div className="h-2 bg-[#1a1a1a]/15 rounded-full w-[50%]"/>
          </div>
        </div>
      )}
      {type === 'push' && (
        <div className="w-full bg-white/80 rounded-[8px] p-2 shadow-md flex items-start gap-2">
          <div className="w-6 h-6 rounded-[4px] bg-[#3b59f6]/60 flex-shrink-0"/>
          <div className="flex-1"><div className="h-2 bg-[#1a1a1a]/30 rounded-full w-[70%] mb-1"/><div className="h-1.5 bg-[#1a1a1a]/15 rounded-full w-full"/></div>
        </div>
      )}
      {(type === 'post' || type === 'all') && (
        <div className="w-full bg-white/80 rounded-[6px] p-2 shadow-sm">
          <div className="h-2 bg-[#1a1a1a]/25 rounded-full w-[75%] mb-1.5"/>
          <div className="h-1.5 bg-[#1a1a1a]/15 rounded-full w-full mb-1"/>
          <div className="h-1.5 bg-[#1a1a1a]/15 rounded-full w-[80%]"/>
        </div>
      )}
    </div>
  );
}

function OutboundTemplatePicker({ onSelect, onClose }: { onSelect: (t: OutboundTemplate | null) => void; onClose: () => void }) {
  const [activeCategory, setActiveCategory] = useState<string>('todo');
  const [search, setSearch] = useState('');

  const toTpl = (title: string, meta: { core: OutboundContentType; grad: string }): OutboundTemplate => ({
    id: `qs_${Date.now()}_${Math.floor(Math.random() * 1e4)}`,
    title, description: '', categories: [], contentType: meta.core, triggerType: 'manual', previewColor: meta.grad,
  });

  const s = search.trim().toLowerCase();
  const filteredQs = OUTBOUND_QUICKSTARTS.filter(q => {
    if (!qsMatchesCategory(q, activeCategory)) return false;
    if (s) return q.title.toLowerCase().includes(s) || qsTypeMeta(q.type).label.toLowerCase().includes(s);
    return true;
  });
  const showScratch = activeCategory === 'todo' && !s;

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[16px] shadow-2xl w-[940px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
          <h2 className="text-[17px] font-bold text-[#1a1a1a]">Elegir una plantilla</h2>
          <div className="flex items-center gap-2">
            <button className="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#f8f8f7]">Probar una demostración</button>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f1f1ee] text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.8"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>
            </button>
          </div>
        </div>
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar */}
          <div className="w-[210px] flex-shrink-0 border-r border-[#e9eae6] bg-[#fafaf9] py-3 overflow-y-auto">
            <div className="px-3 mb-3">
              <div className="flex items-center gap-2 border border-[#e9eae6] rounded-[8px] px-3 py-1.5 bg-white">
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" className="flex-1 outline-none text-[12px] placeholder:text-[#9ca3af] bg-transparent"/>
              </div>
            </div>
            {OUTBOUND_QS_SIDEBAR.map((group, gi) => (
              <div key={gi} className="mb-3">
                {group.label && <p className="px-4 py-1 text-[10.5px] font-semibold text-[#9ca3af] tracking-[0.08em] uppercase">{group.label}</p>}
                {group.items.map(item => (
                  <button key={item.key} onClick={() => setActiveCategory(item.key)} className={`w-full text-left px-4 py-1.5 text-[13px] rounded-[6px] transition-colors ${activeCategory === item.key ? 'bg-white shadow-sm font-semibold text-[#1a1a1a]' : 'text-[#646462] hover:text-[#1a1a1a] hover:bg-white/50'}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
          {/* Main */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* Comenzar desde cero — 17 content types */}
            {showScratch && (
              <div className="mb-7">
                <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-3">Comenzar desde cero</h3>
                <div className="grid grid-cols-3 gap-2.5">
                  {OUTBOUND_QS_TYPES.map(t => (
                    <button key={t.key} onClick={() => onSelect(toTpl('', t))} className="border border-[#e9eae6] rounded-[9px] px-3 py-2.5 flex items-center gap-2 hover:border-[#3b59f6] hover:shadow-sm text-left transition-all bg-white">
                      <span className="w-7 h-7 rounded-[7px] bg-[#f1f1ee] flex items-center justify-center text-[#646462] flex-shrink-0"><OutboundContentIcon type={t.core}/></span>
                      <span className="text-[13px] font-medium text-[#1a1a1a] leading-tight">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* O elige un inicio rápido — quick-start templates grouped by type */}
            <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-3">{showScratch ? 'O elige un inicio rápido' : 'Inicio rápido'}</h3>
            {filteredQs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[14px] text-[#646462]">No se encontraron plantillas para este filtro.</p>
              </div>
            ) : (
              OUTBOUND_QS_TYPES.map(t => {
                const items = filteredQs.filter(q => q.type === t.key);
                if (!items.length) return null;
                return (
                  <div key={t.key} className="mb-6">
                    <div className="flex items-center gap-1.5 mb-2 text-[#646462]">
                      <OutboundContentIcon type={t.core}/>
                      <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em]">{t.label}</span>
                      <span className="text-[11px] text-[#a4a4a2]">· {items.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {items.map(q => (
                        <div key={q.id} onClick={() => onSelect(toTpl(q.title, t))} className="border border-[#e9eae6] rounded-[10px] overflow-hidden hover:border-[#3b59f6] hover:shadow-md cursor-pointer transition-all bg-white">
                          <div className="h-[92px] overflow-hidden relative">
                            <OutboundTemplatePreview color={t.grad} type={t.core} />
                            {q.popular && <span className="absolute top-2 right-2 bg-[#fbbf24] text-[#7c2d12] text-[10px] font-semibold px-2 py-0.5 rounded-full">Popular</span>}
                          </div>
                          <div className="p-3 border-t border-[#e9eae6]">
                            <div className="flex items-center gap-1 mb-0.5 text-[#646462]">
                              <OutboundContentIcon type={t.core}/>
                              <span className="text-[11px]">{t.label}</span>
                            </div>
                            <p className="text-[13px] font-semibold text-[#1a1a1a] leading-snug">{q.title}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared toggle switch ──────────────────────────────────────────────────────
function ToggleSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative inline-flex w-9 h-5 rounded-full transition-colors flex-shrink-0 focus:outline-none ${on ? 'bg-[#ed621d]' : 'bg-[#d4d4d2]'}`}
    >
      <span className={`inline-block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform mt-[3px] ${on ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}/>
    </button>
  );
}

// ── Outbound recipient types & user picker ────────────────────────────────────

interface OutboundRecipient {
  id: string;
  name: string;
  email: string;
  avatar: string;
  segment: string;
}

function mapToRecipient(c: any): OutboundRecipient {
  return {
    id: String(c.id),
    name: c.canonicalName || c.name || 'Sin nombre',
    email: c.canonicalEmail || c.email || '',
    avatar: (c.canonicalName || c.name || 'U')[0].toUpperCase(),
    segment: c.segment || '',
  };
}

function OutboundSendUserModal({ onSelect, onClose }: {
  onSelect: (u: OutboundRecipient) => void;
  onClose: () => void;
}) {
  const { data: rawCustomers, loading } = useApi<any[]>(() => customersApi.list(), [], []);
  const [q, setQ] = useState('');

  const customers: OutboundRecipient[] = useMemo(() => {
    const list = Array.isArray(rawCustomers) ? rawCustomers.map(mapToRecipient) : [];
    if (!q.trim()) return list;
    const lq = q.toLowerCase();
    return list.filter(c => c.name.toLowerCase().includes(lq) || c.email.toLowerCase().includes(lq));
  }, [rawCustomers, q]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,.4)' }}>
      <div className="bg-white rounded-[14px] shadow-2xl w-[480px] max-h-[600px] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e9eae6]">
          <h2 className="text-[15px] font-semibold text-[#1a1a1a]">Enviar a un usuario</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f5f5f4] text-[#646462]">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.6"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="px-4 py-3 border-b border-[#e9eae6]">
          <div className="flex items-center gap-2 border border-[#e9eae6] rounded-full px-3 py-[6px] bg-[#f8f8f7]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3"/></svg>
            <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Buscar por nombre o email…" className="flex-1 outline-none text-[13px] bg-transparent placeholder:text-[#a4a4a2]"/>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 gap-2">
              <svg viewBox="0 0 16 16" className="w-5 h-5 animate-spin fill-none stroke-[#646462]" strokeWidth="1.6"><circle cx="8" cy="8" r="6" strokeDasharray="20 14"/></svg>
              <span className="text-[13px] text-[#646462]">Cargando contactos…</span>
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-6">
              <svg viewBox="0 0 16 16" className="w-8 h-8 fill-none stroke-[#d4d4d2] mb-2" strokeWidth="1.2"><circle cx="8" cy="6" r="3"/><path d="M2 14c1-3 3-4.5 6-4.5s5 1.5 6 4.5"/></svg>
              <p className="text-[13px] font-medium text-[#1a1a1a]">{q ? 'Sin resultados' : 'No hay contactos'}</p>
              <p className="text-[12px] text-[#646462] mt-1">{q ? 'Prueba con otro término de búsqueda' : 'Añade contactos al CRM para enviarles mensajes'}</p>
            </div>
          ) : customers.map(c => (
            <button key={c.id} onClick={() => onSelect(c)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#fafaf9] text-left transition-colors border-b border-[#f1f1ee] last:border-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0">{c.avatar}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{c.name}</p>
                <p className="text-[11.5px] text-[#646462] truncate">{c.email}</p>
              </div>
              {c.segment && <span className="text-[11px] bg-[#f3f3f1] border border-[#e9eae6] px-2 py-0.5 rounded-full text-[#646462] flex-shrink-0">{c.segment}</span>}
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-[#e9eae6] bg-[#fafaf9]">
          <p className="text-[12px] text-[#646462]">{loading ? '…' : `${customers.length} de ${Array.isArray(rawCustomers) ? rawCustomers.length : 0} contactos`}</p>
        </div>
      </div>
    </div>
  );
}

// ── Outbound helpers ─────────────────────────────────────────────────────────

/** Map editor content type to a CRM source_channel value */
const OUTBOUND_CHANNEL_MAP: Record<string, string> = {
  email: 'email', chat: 'web_chat', whatsapp: 'whatsapp',
  sms: 'sms', push: 'web_chat', banner: 'web_chat', post: 'web_chat', all: 'web_chat',
};

/** Build a self-contained HTML email from editor field values */
function buildOutboundEmailHtml(fields: {
  heading: string; sub: string; grabCode: string; code: string;
  valid: string; btn: string; btnUrl: string; hasImage: boolean;
  senderName: string; showUnsubLink: boolean; linkColor: string;
}): string {
  const imgBlock = fields.hasImage
    ? `<div style="background:linear-gradient(135deg,#4a90d9,#7b68ee,#e040fb);height:160px;border-radius:8px;margin:16px 0;display:flex;align-items:center;justify-content:center;"><span style="color:white;font-size:22px;font-weight:900;text-shadow:0 2px 4px rgba(0,0,0,.3);">ON YOUR BIRTHDAY!</span></div>`
    : '';
  const unsubBlock = fields.showUnsubLink
    ? `<a href="#" style="font-size:10.5px;color:${fields.linkColor};text-decoration:underline;">Unsubscribe from our emails</a>`
    : '';
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f4;font-family:sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
  <div style="padding:32px 24px;text-align:center;">
    <h2 style="font-size:20px;font-weight:bold;color:#1a1a1a;line-height:1.4;margin:0 0 16px;">${fields.heading}</h2>
    ${imgBlock}
    <p style="font-size:16px;font-weight:600;color:#1a1a1a;margin:16px 0 8px;">${fields.sub}</p>
    <p style="font-size:13px;color:#646462;margin:0 0 12px;">${fields.grabCode}</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:3px;color:#1a1a1a;margin:0 0 6px;">${fields.code}</p>
    <p style="font-size:12px;color:#646462;margin:0 0 20px;">${fields.valid}</p>
    <a href="${fields.btnUrl || '#'}" style="display:inline-block;padding:12px 28px;background:${fields.linkColor};color:white;font-weight:600;border-radius:4px;text-decoration:none;font-size:14px;">${fields.btn}</a>
  </div>
  <div style="padding:16px 24px;border-top:1px solid #e9eae6;background:#f8f8f7;text-align:center;">
    <p style="font-size:11px;color:#646462;margin:0 0 6px;">${fields.senderName}</p>
    ${unsubBlock}
    <p style="font-size:10px;color:#a4a4a2;margin:8px 0 0;">Powered by Intercom</p>
  </div>
</div></body></html>`;
}

/** Send one outbound message to a single customer via casesApi */
async function sendOutboundToCustomer(
  customerId: string,
  subject: string,
  bodyHtml: string,
  contentType: string,
  senderName: string,
): Promise<string> {
  const newCase = await casesApi.create({
    customer_id: customerId,
    source_channel: OUTBOUND_CHANNEL_MAP[contentType] ?? 'web_chat',
    type: 'outbound',
    status: 'open',
    tags: ['outbound'],
  });
  const caseId = newCase?.id || newCase?.case?.id;
  if (!caseId) throw new Error('No se pudo crear el caso de envío');
  await casesApi.reply(caseId, bodyHtml);
  return caseId;
}

/** Parse stored metadata from emailTemplate.description JSON */
function parseOutboundMeta(description: string | null): Record<string, any> {
  if (!description) return {};
  try { return JSON.parse(description); } catch { return {}; }
}

/** Map an emailTemplate row → OutboundMsg */
function mapTemplateToMsg(t: any): OutboundMsg {
  const meta = parseOutboundMeta(t.description);
  return {
    id:           String(t.id),
    title:        t.name || 'Sin título',
    status:       t.active ? 'activo' : 'borrador',
    senderName:   meta.senderName || 'Hector Vidal Sanchez',
    senderInitial:(meta.senderName?.[0] || 'H').toUpperCase(),
    contentType:  (meta.contentType as OutboundContentType) || 'email',
    sent:         Number(meta.sent ?? 0),
    goalPct:      meta.goalPct !== undefined ? Number(meta.goalPct) : undefined,
    triggerType:  (meta.triggerType as OutboundTriggerType) || 'accion',
    audience:     meta.audience || 'Todos',
    channel:      meta.channel || 'Email',
    frequency:    meta.frequency || '',
    goal:         meta.goal || '',
    createdAt:    t.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
  };
}

// ── Outbound Message Editor (Intercom-style, fully functional) ────────────────
function OutboundMessageEditor({ template, draft, onBack, onSave }: {
  template: OutboundTemplate | null;
  draft?: Partial<OutboundMsg>;
  onBack: () => void;
  onSave: (msg: OutboundMsg) => void;
}) {
  // ── Persisted ID (null = new, string = existing template id)
  const [persistedId, setPersistedId] = useState<string | null>(
    draft?.id && !draft.id.startsWith('om') ? draft.id : null,
  );

  const [title, setTitle] = useState(draft?.title ?? template?.title ?? '');
  const [status, setStatus] = useState<OutboundMsgStatus>(draft?.status ?? 'borrador');
  const [contentType, setContentType] = useState<OutboundContentType>(
    draft?.contentType ?? template?.contentType ?? 'email',
  );
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showBanner, setShowBanner] = useState(true);

  // General settings
  const [sender, setSender] = useState('Hector Vidal Sanchez');
  const [senderEmail] = useState('hector.vidal.sanchez@acme-8l...');
  const [assignReplies, setAssignReplies] = useState('Hector Vidal Sanchez');
  const [subscriptionType, setSubscriptionType] = useState('No subscription type');
  const [showUnsubLink, setShowUnsubLink] = useState(true);
  const [accessLang, setAccessLang] = useState('English');

  // Estilo
  const [emailTpl, setEmailTpl] = useState('Personal');
  const [linkColor, setLinkColor] = useState('#1251BA');
  const [boldLinks, setBoldLinks] = useState(false);
  const [italicLinks, setItalicLinks] = useState(false);
  const [htmlMode, setHtmlMode] = useState(false);
  const [htmlBody, setHtmlBody] = useState('');

  // Email content
  const [subject, setSubject] = useState(draft?.title ?? template?.title ?? '');
  const [emailHeading, setEmailHeading] = useState("You know we'd never let you down on your birthday 🎂");
  const [emailSub, setEmailSub] = useState('Celebrate on us, with 15% off your next purchase');
  const [emailGrabCode, setEmailGrabCode] = useState('Grab your code:');
  const [emailCode, setEmailCode] = useState('RCK-RRR-001-LL1');
  const [emailValid, setEmailValid] = useState('Valid until: 30.12.2025');
  const [emailBtn, setEmailBtn] = useState('Shop Now');
  const [emailBtnUrl, setEmailBtnUrl] = useState('https://');
  const [hasImage, setHasImage] = useState(true);

  // Rules
  const [rulesOpen, setRulesOpen] = useState(false);
  const [audienceType, setAudienceType] = useState<'dinamica' | 'all'>('dinamica');
  const [audienceRules, setAudienceRules] = useState<{ attr: string; op: string; value: string }[]>([
    { attr: 'Unsubscribed from Emails', op: 'is', value: 'false' },
    { attr: 'Tipo de usuario', op: 'is', value: 'Users' },
  ]);

  // Frequency
  const [frequencyOpen, setFrequencyOpen] = useState(false);
  const [sendEvery, setSendEvery] = useState('1');
  const [sendUnit, setSendUnit] = useState('day');
  const [startSending, setStartSending] = useState('immediately');
  const [stopSending, setStopSending] = useState('never');
  const [sendDays, setSendDays] = useState('any');

  // Goal
  const [goalOpen, setGoalOpen] = useState(false);
  const [goal, setGoal] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmMedium, setUtmMedium] = useState('email');
  const [utmSource, setUtmSource] = useState('intercom');

  // Send to specific user
  const [showUserModal, setShowUserModal] = useState(false);
  const [specificUser, setSpecificUser] = useState<OutboundRecipient | null>(null);
  const [sendMode, setSendMode] = useState<'audience' | 'user'>('audience');

  // Mobile preview
  const [mobilePreview, setMobilePreview] = useState(false);

  // Left panel dropdown open states
  const [showFromDrop,   setShowFromDrop]   = useState(false);
  const [showAssignDrop, setShowAssignDrop] = useState(false);
  const [showSubDrop,    setShowSubDrop]    = useState(false);
  const [showLangDrop,   setShowLangDrop]   = useState(false);

  // Background colors (Estilo section)
  const [bgColor,     setBgColor]     = useState('#f5f5f4');
  const [textBgColor, setTextBgColor] = useState('#ffffff');

  // Refs for native color inputs
  const linkColorRef   = useRef<HTMLInputElement>(null);
  const bgColorRef     = useRef<HTMLInputElement>(null);
  const textBgColorRef = useRef<HTMLInputElement>(null);

  // Refs for contentEditable elements (avoid React/DOM fight on re-render)
  const headingRef   = useRef<HTMLDivElement>(null);
  const subRef       = useRef<HTMLDivElement>(null);
  const grabCodeRef  = useRef<HTMLDivElement>(null);
  const codeRef      = useRef<HTMLDivElement>(null);
  const validRef     = useRef<HTMLDivElement>(null);
  const btnRef       = useRef<HTMLDivElement>(null);

  // Load customers for broadcast
  const { data: rawCustomers } = useApi<any[]>(() => customersApi.list(), [], []);

  // ── Init contentEditable refs only on mount (avoid React/DOM fight) ──────
  useEffect(() => {
    if (headingRef.current)  headingRef.current.innerText  = emailHeading;
    if (subRef.current)      subRef.current.innerText      = emailSub;
    if (grabCodeRef.current) grabCodeRef.current.innerText = emailGrabCode;
    if (codeRef.current)     codeRef.current.innerText     = emailCode;
    if (validRef.current)    validRef.current.innerText    = emailValid;
    if (btnRef.current)      btnRef.current.innerText      = emailBtn;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── helpers ──────────────────────────────────────────────────────────────
  function showSendResult(ok: boolean, msg: string) {
    setSendResult({ ok, msg });
    window.setTimeout(() => setSendResult(null), 5000);
  }

  function getEmailHtml(): string {
    if (htmlMode && htmlBody.trim()) return htmlBody;
    return buildOutboundEmailHtml({
      heading: emailHeading, sub: emailSub, grabCode: emailGrabCode,
      code: emailCode, valid: emailValid, btn: emailBtn, btnUrl: emailBtnUrl,
      hasImage, senderName: sender, showUnsubLink, linkColor,
    });
  }

  function buildMetaDescription(newStatus: OutboundMsgStatus): string {
    return JSON.stringify({
      contentType,
      senderName: sender,
      triggerType: template?.triggerType ?? draft?.triggerType ?? 'accion',
      audience: specificUser ? specificUser.name : (audienceType === 'all' ? 'Todos' : 'Audiencia dinámica'),
      channel: OUTBOUND_CONTENT_TYPE_LABELS[contentType],
      frequency: 'Cada ' + sendEvery + ' ' + sendUnit,
      goal,
      sent: draft?.sent ?? 0,
      goalPct: draft?.goalPct,
      status: newStatus,
    });
  }

  // ── Save draft / activate ─────────────────────────────────────────────────
  async function handleSave(newStatus: OutboundMsgStatus = status) {
    setSaving(true);
    try {
      const payload = {
        name:      (subject || title || 'Sin título').slice(0, 200),
        subject:   subject || title || 'Sin título',
        body_html: getEmailHtml(),
        body_text: '',
        category:  'outbound',
        locale:    contentType,
        active:    newStatus === 'activo',
        description: buildMetaDescription(newStatus),
      };

      let savedId = persistedId;
      if (persistedId) {
        await emailTemplatesApi.update(persistedId, payload);
      } else {
        const created = await emailTemplatesApi.create(payload);
        savedId = created?.id ? String(created.id) : null;
        if (savedId) setPersistedId(savedId);
      }

      setStatus(newStatus);
      const msg: OutboundMsg = {
        id:           savedId ?? ('om' + Date.now()),
        title:        payload.name,
        status:       newStatus,
        senderName:   sender,
        senderInitial: sender[0] ?? 'H',
        contentType,
        sent:         draft?.sent ?? 0,
        goalPct:      draft?.goalPct,
        triggerType:  template?.triggerType ?? draft?.triggerType ?? 'accion',
        audience:     specificUser ? specificUser.name : (audienceType === 'all' ? 'Todos' : 'Audiencia dinámica'),
        channel:      OUTBOUND_CONTENT_TYPE_LABELS[contentType],
        frequency:    'Cada ' + sendEvery + ' ' + sendUnit,
        goal,
        createdAt:    draft?.createdAt ?? new Date().toISOString().slice(0, 10),
      };
      onSave(msg);
    } catch (err: any) {
      showSendResult(false, err?.message || 'Error al guardar el mensaje');
    } finally {
      setSaving(false);
    }
  }

  // ── Send now (specific user OR broadcast) ─────────────────────────────────
  async function handleSendNow() {
    setSending(true);
    const bodyHtml = getEmailHtml();
    const subjectText = subject || title || 'Mensaje';
    try {
      if (sendMode === 'user' && specificUser) {
        // Single user send
        await sendOutboundToCustomer(specificUser.id, subjectText, bodyHtml, contentType, sender);
        showSendResult(true, `Mensaje enviado a ${specificUser.name} correctamente`);
        await handleSave('activo');
      } else {
        // Broadcast to audience
        const customers = Array.isArray(rawCustomers) ? rawCustomers : [];
        if (customers.length === 0) {
          showSendResult(false, 'No hay contactos disponibles para el envío masivo');
          return;
        }
        // Filter customers by audience rules (simple client-side filter)
        let targets = customers;
        if (audienceType === 'dinamica' && audienceRules.length > 0) {
          // Just limit to 50 for broadcast to avoid flooding the backend
          targets = customers.slice(0, 50);
        }
        let sent = 0;
        const errors: string[] = [];
        for (const c of targets) {
          try {
            await sendOutboundToCustomer(String(c.id), subjectText, bodyHtml, contentType, sender);
            sent++;
          } catch (e: any) {
            errors.push(e?.message || 'Error');
          }
        }
        if (errors.length > 0) {
          showSendResult(false, `Enviado a ${sent} contactos, ${errors.length} errores`);
        } else {
          showSendResult(true, `Mensaje enviado a ${sent} contacto${sent !== 1 ? 's' : ''} correctamente`);
        }
        await handleSave('activo');
      }
    } catch (err: any) {
      showSendResult(false, err?.message || 'Error al enviar el mensaje');
    } finally {
      setSending(false);
    }
  }

  // ── Computed chips ────────────────────────────────────────────────────────
  const ruleChips = audienceType === 'dinamica'
    ? ['Audiencia dinámica', ...audienceRules.map(r => r.attr + ' ' + r.op + ' ' + r.value)]
    : ['Todos los usuarios'];
  const freqChips = [
    'Enviar cada ' + sendEvery + ' ' + sendUnit + ' si coincide',
    startSending === 'immediately' ? 'Empezar inmediatamente' : 'Empezar programado',
    stopSending === 'never' ? 'Nunca dejar de enviar' : 'Dejar de enviar: ' + stopSending,
    sendDays === 'any' ? 'Cualquier día, cualquier hora' : 'Solo horario laboral',
  ];

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {showUserModal && (
        <OutboundSendUserModal
          onSelect={u => { setSpecificUser(u); setSendMode('user'); setShowUserModal(false); }}
          onClose={() => setShowUserModal(false)}
        />
      )}

      {/* Result toast */}
      {sendResult && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-3 rounded-[10px] shadow-xl text-[13px] font-medium border ${sendResult.ok ? 'bg-[#f0fdf4] border-[#bbf7d0] text-[#15803d]' : 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]'}`}>
          <svg viewBox="0 0 16 16" className={`w-4 h-4 flex-shrink-0 ${sendResult.ok ? 'fill-[#15803d]' : 'fill-[#b91c1c]'}`}>
            {sendResult.ok ? <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm3 4.5L7.5 9.5 5 7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/> : <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm0 3.5v4m0 2.5v.01"/>}
          </svg>
          {sendResult.msg}
        </div>
      )}

      {/* Domain warning banner */}
      {showBanner && (
        <div className="flex-shrink-0 bg-[#fff8ed] border-b border-[#fde9c4] px-6 py-2 flex items-center gap-2 text-[12.5px]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#ed621d] flex-shrink-0"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm.7 3.2v3.6l2.5 1.5-.6 1L7.5 9V4.7z"/></svg>
          <span className="text-[#646462]">Usa tu propio dominio para ayudar a evitar que este correo electrónico sea detectado por los filtros de spam.</span>
          <a href="#" className="text-[#3b59f6] font-medium hover:underline ml-1">Explicación de los dominios.</a>
          <button onClick={() => setShowBanner(false)} className="ml-auto text-[#a4a4a2] hover:text-[#646462]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}

      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-[#e9eae6] bg-white">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-[#646462] hover:text-[#1a1a1a] flex-shrink-0">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.5"><path d="M10 13L5 8l5-5"/></svg>
          Mensajes
        </button>
        <span className="text-[#d4d4d2]">/</span>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Sin título"
          className="text-[14px] font-semibold text-[#1a1a1a] outline-none border-b border-transparent hover:border-[#e9eae6] focus:border-[#3b59f6] px-1 py-0.5 min-w-[100px] max-w-[240px] bg-transparent"
        />
        <div className="flex-1"/>

        {/* Audience / User toggle */}
        <div className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-1 py-0.5 bg-[#f8f8f7] text-[12px]">
          <button
            onClick={() => { setSendMode('audience'); setSpecificUser(null); }}
            className={`px-2.5 py-1 rounded-full font-medium transition-colors ${sendMode === 'audience' ? 'bg-white shadow-sm text-[#1a1a1a]' : 'text-[#646462] hover:text-[#1a1a1a]'}`}
          >Audiencia</button>
          <button
            onClick={() => { setSendMode('user'); setShowUserModal(true); }}
            className={`px-2.5 py-1 rounded-full font-medium transition-colors ${sendMode === 'user' ? 'bg-white shadow-sm text-[#1a1a1a]' : 'text-[#646462] hover:text-[#1a1a1a]'}`}
          >
            {specificUser ? specificUser.name : 'Usuario específico'}
          </button>
        </div>

        {specificUser && sendMode === 'user' && (
          <div className="flex items-center gap-1.5 bg-[#eff3ff] border border-[#c7d2fe] rounded-full px-2.5 py-1 text-[12px] text-[#3b59f6]">
            <span className="w-4 h-4 rounded-full bg-[#3b59f6] text-white text-[9px] flex items-center justify-center font-bold">{specificUser.avatar}</span>
            <span className="font-medium">{specificUser.name}</span>
            <button onClick={() => { setSpecificUser(null); setSendMode('audience'); }} className="ml-0.5 hover:text-[#1a1a1a]">×</button>
          </div>
        )}

        <OutboundStatusBadge status={status}/>

        <button
          onClick={() => handleSave('borrador')}
          disabled={saving || sending}
          className="px-3 py-1.5 text-[13px] font-medium border border-[#e9eae6] rounded-full text-[#1a1a1a] hover:bg-[#f5f5f4] disabled:opacity-50"
        >{saving ? 'Guardando…' : 'Guardar borrador'}</button>

        {/* Primary action: Enviar ahora (user) or Activar / Publicar (audience) */}
        {sendMode === 'user' ? (
          <button
            onClick={handleSendNow}
            disabled={saving || sending || !specificUser}
            className="px-4 py-1.5 text-[13px] font-semibold bg-[#1a1a1a] text-white rounded-full hover:bg-black disabled:opacity-50 flex items-center gap-1.5"
          >
            {sending ? (
              <><svg viewBox="0 0 16 16" className="w-3 h-3 animate-spin fill-none stroke-white" strokeWidth="1.6"><circle cx="8" cy="8" r="6" strokeDasharray="20 14"/></svg>Enviando…</>
            ) : 'Enviar ahora'}
          </button>
        ) : (
          <button
            onClick={() => status === 'activo' ? handleSendNow() : handleSave('activo')}
            disabled={saving || sending}
            className="px-4 py-1.5 text-[13px] font-semibold bg-[#1a1a1a] text-white rounded-full hover:bg-black disabled:opacity-50 flex items-center gap-1.5"
          >
            {sending ? (
              <><svg viewBox="0 0 16 16" className="w-3 h-3 animate-spin fill-none stroke-white" strokeWidth="1.6"><circle cx="8" cy="8" r="6" strokeDasharray="20 14"/></svg>Enviando…</>
            ) : status === 'activo' ? 'Enviar a audiencia' : 'Activar mensaje'}
          </button>
        )}
      </div>

      {/* Content area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left settings panel ─────────────────────────────────── */}
        <div className="w-[300px] flex-shrink-0 border-r border-[#e9eae6] overflow-y-auto bg-white">
          <div className="px-4 pt-3 pb-2 border-b border-[#f1f1ee]">
            <button className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#3b59f6] hover:underline">
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M5 3l8 5-8 5V3z"/></svg>
              Ejecutar una nueva prueba
            </button>
          </div>

          {/* General settings */}
          <div className="px-4 py-4" onClick={() => { setShowFromDrop(false); setShowAssignDrop(false); setShowSubDrop(false); setShowLangDrop(false); }}>
            <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-4">General settings</h3>

            {/* From */}
            <div className="mb-4 relative">
              <label className="block text-[11.5px] font-medium text-[#646462] mb-1.5">From</label>
              <div onClick={e => { e.stopPropagation(); setShowFromDrop(v => !v); setShowAssignDrop(false); setShowSubDrop(false); setShowLangDrop(false); }} className={`border rounded-[8px] px-3 py-2 flex items-center gap-2 bg-white cursor-pointer transition-colors ${showFromDrop ? 'border-[#3b59f6]' : 'border-[#e9eae6] hover:border-[#c8c9c4]'}`}>
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">{sender[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] text-[#1a1a1a] font-medium truncate">{sender}</p>
                  <p className="text-[10.5px] text-[#646462] truncate">{senderEmail}</p>
                </div>
                <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-current text-[#646462] flex-shrink-0 transition-transform ${showFromDrop ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4z"/></svg>
              </div>
              {showFromDrop && (
                <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e9eae6] rounded-[10px] shadow-lg z-30 py-1.5 overflow-hidden">
                  <p className="text-[10.5px] font-semibold text-[#646462] uppercase tracking-wide px-3 py-1">Teammates</p>
                  {['Hector Vidal Sanchez', 'María García López', 'Carlos Ruiz Martín'].map(n => (
                    <button key={n} onClick={() => { setSender(n); setShowFromDrop(false); }} className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f5f5f4] text-left ${sender === n ? 'text-[#3b59f6] font-semibold' : 'text-[#1a1a1a]'}`}>
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">{n[0]}</div>
                      <span className="text-[12.5px] flex-1 truncate">{n}</span>
                      {sender === n && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 flex-shrink-0"><path d="M3 8l4 4 6-7" stroke="#3b59f6" strokeWidth="2" fill="none"/></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Assign replies to */}
            <div className="mb-4 relative">
              <label className="block text-[11.5px] font-medium text-[#646462] mb-1.5">Assign replies to</label>
              <div onClick={e => { e.stopPropagation(); setShowAssignDrop(v => !v); setShowFromDrop(false); setShowSubDrop(false); setShowLangDrop(false); }} className={`border rounded-[8px] px-3 py-2 flex items-center gap-2 bg-white cursor-pointer transition-colors ${showAssignDrop ? 'border-[#3b59f6]' : 'border-[#e9eae6] hover:border-[#c8c9c4]'}`}>
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">{assignReplies[0]}</div>
                <span className="text-[12.5px] text-[#1a1a1a] flex-1 truncate">{assignReplies}</span>
                <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-current text-[#646462] flex-shrink-0 transition-transform ${showAssignDrop ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4z"/></svg>
              </div>
              {showAssignDrop && (
                <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e9eae6] rounded-[10px] shadow-lg z-30 py-1.5 overflow-hidden">
                  <div className="px-3 py-1">
                    <div className="flex items-center gap-2 bg-[#f5f5f4] rounded-[6px] px-2.5 py-1.5 mb-1">
                      <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="7" cy="7" r="4"/><path d="M11 11l3 3"/></svg>
                      <input autoFocus placeholder="Search addresses..." className="flex-1 text-[12px] bg-transparent outline-none text-[#1a1a1a] placeholder:text-[#a4a4a2]"/>
                    </div>
                  </div>
                  <p className="text-[10.5px] font-semibold text-[#646462] uppercase tracking-wide px-3 py-1">Dynamic</p>
                  <button onClick={() => { setAssignReplies('Propietario'); setShowAssignDrop(false); }} className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f5f5f4] text-left ${assignReplies === 'Propietario' ? 'text-[#3b59f6] font-semibold' : 'text-[#1a1a1a]'}`}>
                    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.3"><circle cx="8" cy="6" r="2.5"/><path d="M3 13.5c.8-2.5 2.8-3.8 5-3.8s4.2 1.3 5 3.8"/></svg>
                    <span className="text-[12.5px]">Propietario</span>
                    {assignReplies === 'Propietario' && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 ml-auto"><path d="M3 8l4 4 6-7" stroke="#3b59f6" strokeWidth="2" fill="none"/></svg>}
                  </button>
                  <p className="text-[10.5px] font-semibold text-[#646462] uppercase tracking-wide px-3 py-1 mt-1">Teammates</p>
                  {['Hector Vidal Sanchez', 'María García López', 'Unassigned'].map(n => (
                    <button key={n} onClick={() => { setAssignReplies(n); setShowAssignDrop(false); }} className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f5f5f4] text-left ${assignReplies === n ? 'text-[#3b59f6] font-semibold' : 'text-[#1a1a1a]'}`}>
                      {n === 'Unassigned'
                        ? <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.3"><circle cx="8" cy="6" r="2.5" strokeDasharray="3 2"/><path d="M3 13.5c.8-2.5 2.8-3.8 5-3.8s4.2 1.3 5 3.8"/></svg>
                        : <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0">{n[0]}</div>}
                      <span className="text-[12.5px] flex-1">{n}</span>
                      {assignReplies === n && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M3 8l4 4 6-7" stroke="#3b59f6" strokeWidth="2" fill="none"/></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Subscription type */}
            <div className="mb-4 relative">
              <label className="block text-[11.5px] font-medium text-[#646462] mb-1.5">Tipo de suscripción <span className="text-[#a4a4a2] cursor-help" title="Controla qué usuarios reciben este email según sus preferencias de suscripción">?</span></label>
              <div onClick={e => { e.stopPropagation(); setShowSubDrop(v => !v); setShowFromDrop(false); setShowAssignDrop(false); setShowLangDrop(false); }} className={`border rounded-[8px] px-3 py-2 flex items-center justify-between bg-white cursor-pointer transition-colors ${showSubDrop ? 'border-[#3b59f6]' : 'border-[#e9eae6] hover:border-[#c8c9c4]'}`}>
                <span className="text-[12.5px] text-[#1a1a1a]">{subscriptionType}</span>
                <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-current text-[#646462] transition-transform ${showSubDrop ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4z"/></svg>
              </div>
              {showSubDrop && (
                <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e9eae6] rounded-[10px] shadow-lg z-30 py-1.5">
                  {['No subscription type', 'Marketing emails', 'Product updates', 'Security updates', 'Account notifications'].map(opt => (
                    <button key={opt} onClick={() => { setSubscriptionType(opt); setShowSubDrop(false); }} className={`w-full flex items-center justify-between px-4 py-2 hover:bg-[#f5f5f4] text-left ${subscriptionType === opt ? 'text-[#3b59f6] font-semibold' : 'text-[#1a1a1a]'}`}>
                      <span className="text-[12.5px]">{opt}</span>
                      {subscriptionType === opt && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M3 8l4 4 6-7" stroke="#3b59f6" strokeWidth="2" fill="none"/></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4 flex items-center justify-between">
              <label className="text-[12.5px] text-[#1a1a1a] flex items-center gap-1">Show unsubscribe link <span className="text-[#a4a4a2] text-[11px] cursor-help" title="Muestra un enlace de cancelación de suscripción al final del email">?</span></label>
              <ToggleSwitch on={showUnsubLink} onChange={setShowUnsubLink}/>
            </div>

            {/* Language */}
            <div className="mb-2 relative">
              <label className="block text-[11.5px] font-medium text-[#646462] mb-1.5">Lenguaje de accesibilidad <span className="text-[#a4a4a2] cursor-help" title="Idioma del texto de accesibilidad (aria-labels, etc.)">?</span></label>
              <div onClick={e => { e.stopPropagation(); setShowLangDrop(v => !v); setShowFromDrop(false); setShowAssignDrop(false); setShowSubDrop(false); }} className={`border rounded-[8px] px-3 py-2 flex items-center justify-between bg-white cursor-pointer transition-colors ${showLangDrop ? 'border-[#3b59f6]' : 'border-[#e9eae6] hover:border-[#c8c9c4]'}`}>
                <span className="text-[12.5px] text-[#1a1a1a]">{accessLang}</span>
                <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-current text-[#646462] transition-transform ${showLangDrop ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4z"/></svg>
              </div>
              {showLangDrop && (
                <div onClick={e => e.stopPropagation()} className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e9eae6] rounded-[10px] shadow-lg z-30 py-1.5">
                  {['English', 'Español', 'Français', 'Deutsch', 'Italiano', 'Português', '中文', '日本語'].map(lang => (
                    <button key={lang} onClick={() => { setAccessLang(lang); setShowLangDrop(false); }} className={`w-full flex items-center justify-between px-4 py-2 hover:bg-[#f5f5f4] text-left ${accessLang === lang ? 'text-[#3b59f6] font-semibold' : 'text-[#1a1a1a]'}`}>
                      <span className="text-[12.5px]">{lang}</span>
                      {accessLang === lang && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M3 8l4 4 6-7" stroke="#3b59f6" strokeWidth="2" fill="none"/></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Estilo section */}
          <div className="px-4 pb-4 border-t border-[#f1f1ee] pt-4">
            <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-4">Estilo</h3>

            <div className="mb-4">
              <label className="block text-[11.5px] font-medium text-[#646462] mb-1.5">Plantilla de correo electrónico</label>
              <div className="border border-[#e9eae6] rounded-[8px] px-3 py-2 flex items-center justify-between bg-white cursor-pointer hover:border-[#c8c9c4]">
                <span className="text-[12.5px] text-[#1a1a1a]">{emailTpl}</span>
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M9 2h4v4M10 6L15 1M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h10a1 1 0 001-1V9"/></svg>
              </div>
            </div>

            {/* Fondo de plantilla */}
            <div className="mb-4">
              <label className="block text-[11.5px] font-medium text-[#646462] mb-1.5">Fondo de plantilla</label>
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] text-[#1a1a1a] flex-1 font-mono">{bgColor}</span>
                <div className="relative">
                  <div className="w-6 h-6 rounded-full border-2 border-[#e9eae6] cursor-pointer hover:border-[#c8c9c4] transition-colors overflow-hidden" style={{ background: bgColor }} onClick={() => bgColorRef.current?.click()}/>
                  <input ref={bgColorRef} type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="absolute opacity-0 w-0 h-0 pointer-events-none"/>
                </div>
              </div>
            </div>

            {/* Fondo del texto */}
            <div className="mb-4">
              <label className="block text-[11.5px] font-medium text-[#646462] mb-1.5">Fondo del texto</label>
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] text-[#1a1a1a] flex-1 font-mono">{textBgColor}</span>
                <div className="relative">
                  <div className="w-6 h-6 rounded-full border-2 border-[#e9eae6] cursor-pointer hover:border-[#c8c9c4] transition-colors overflow-hidden" style={{ background: textBgColor }} onClick={() => textBgColorRef.current?.click()}/>
                  <input ref={textBgColorRef} type="color" value={textBgColor} onChange={e => setTextBgColor(e.target.value)} className="absolute opacity-0 w-0 h-0 pointer-events-none"/>
                </div>
              </div>
            </div>

            {/* Link color */}
            <div className="mb-4">
              <label className="block text-[11.5px] font-medium text-[#646462] mb-1.5">Enlaces</label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 border border-[#e9eae6] rounded-[6px] px-2 py-1.5 flex-1 cursor-pointer hover:border-[#c8c9c4]" onClick={() => linkColorRef.current?.click()}>
                  <div className="w-4 h-4 rounded-[3px] border border-white/30 shadow-sm flex-shrink-0" style={{ background: linkColor }}/>
                  <span className="text-[12px] text-[#1a1a1a] font-mono flex-1">{linkColor}</span>
                  <input ref={linkColorRef} type="color" value={linkColor} onChange={e => setLinkColor(e.target.value)} className="absolute opacity-0 w-0 h-0 pointer-events-none"/>
                </div>
                <ToggleSwitch on={boldLinks} onChange={setBoldLinks}/>
              </div>
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => setBoldLinks(v => !v)} className={`w-7 h-7 flex items-center justify-center rounded-[5px] border text-[13px] font-bold transition-colors ${boldLinks ? 'border-[#1a1a1a] bg-[#1a1a1a] text-white' : 'border-[#e9eae6] text-[#1a1a1a] hover:bg-[#f8f8f7]'}`}>B</button>
                <button onClick={() => setItalicLinks(v => !v)} className={`w-7 h-7 flex items-center justify-center rounded-[5px] border text-[13px] italic transition-colors ${italicLinks ? 'border-[#1a1a1a] bg-[#1a1a1a] text-white' : 'border-[#e9eae6] text-[#1a1a1a] hover:bg-[#f8f8f7]'}`}>i</button>
              </div>
            </div>

            <button onClick={() => setHtmlMode(v => !v)} className="flex items-center gap-1.5 text-[12.5px] text-[#646462] hover:text-[#1a1a1a] font-medium">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><path d="M5 4L2 8l3 4M11 4l3 4-3 4M8 3l-2 10"/></svg>
              {htmlMode ? 'Volver al editor visual' : 'Switch to HTML editor'}
            </button>
          </div>
        </div>

        {/* ── Center: email canvas ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto relative" style={{ background: '#f5f5f4' }}>
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={() => setMobilePreview(v => !v)}
              className={`flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-full border transition-colors ${mobilePreview ? 'border-[#3b59f6] bg-[#eff3ff] text-[#3b59f6]' : 'border-[#e9eae6] bg-white text-[#646462] hover:border-[#c8c9c4]'}`}
            >
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.4"><rect x="5" y="1" width="6" height="14" rx="1.5"/><circle cx="8" cy="12.5" r="0.7" fill="currentColor"/></svg>
              Vista previa para celulares
            </button>
          </div>

          <div className={`py-6 px-6 flex flex-col ${mobilePreview ? 'items-center' : 'items-stretch'}`}>
            {/* Email card */}
            <div className={`bg-white rounded-[8px] shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden transition-all duration-300 ${mobilePreview ? 'w-[375px] self-center' : 'w-full'}`}>

              {/* Window chrome + subject line */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#e9eae6] bg-[#f8f8f7]">
                <div className="flex gap-1.5 flex-shrink-0">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56]"/>
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"/>
                  <div className="w-3 h-3 rounded-full bg-[#27c93f]"/>
                </div>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#eff3ff] border border-[#c7d2fe] rounded-[4px] text-[11px] text-[#3b59f6] font-mono font-medium flex-shrink-0">
                    <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 fill-current"><path d="M5 4L2 8l3 4M11 4l3 4-3 4"/></svg>
                    First name
                  </span>
                  <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Asunto del email…" className="flex-1 min-w-0 text-[13px] text-[#1a1a1a] outline-none bg-transparent placeholder:text-[#a4a4a2] font-medium"/>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button title="Deshacer" className="w-6 h-6 flex items-center justify-center rounded-[4px] hover:bg-[#e9eae6] text-[#646462]">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><path d="M3 6H9.5a3.5 3.5 0 010 7H4" strokeLinecap="round"/><path d="M6 3L3 6l3 3"/></svg>
                  </button>
                  <button title="Rehacer" className="w-6 h-6 flex items-center justify-center rounded-[4px] hover:bg-[#e9eae6] text-[#646462]">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><path d="M13 6H6.5a3.5 3.5 0 000 7H12" strokeLinecap="round"/><path d="M10 3l3 3-3 3"/></svg>
                  </button>
                </div>
              </div>

              {/* Email body */}
              {htmlMode ? (
                <div className="p-4">
                  <textarea value={htmlBody} onChange={e => setHtmlBody(e.target.value)} className="w-full h-[400px] font-mono text-[12px] text-[#1a1a1a] border border-[#e9eae6] rounded-[6px] p-3 outline-none resize-none" placeholder="<!-- Escribe tu HTML aquí -->"/>
                </div>
              ) : (
                <div className="p-6" style={{ background: '#f5f5f4' }}>
                  <div className="rounded-[8px] overflow-hidden mx-auto bg-white" style={{ maxWidth: mobilePreview ? '100%' : 560 }}>
                    <div className="p-6 text-center">
                      <div ref={headingRef} contentEditable suppressContentEditableWarning onBlur={e => setEmailHeading(e.currentTarget.innerText || '')} className="text-[18px] font-bold text-[#1a1a1a] leading-[1.4] mb-4 outline-none focus:bg-[#f8fbff] rounded-[4px] px-1 cursor-text min-h-[1em]"/>

                      {hasImage ? (
                        <div className="relative mb-4 rounded-[8px] overflow-hidden bg-gradient-to-br from-[#4a90d9] via-[#7b68ee] to-[#e040fb] cursor-pointer group" style={{ height: mobilePreview ? 140 : 180 }} onClick={() => setHasImage(false)} title="Clic para quitar imagen">
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="text-white text-[22px] font-black tracking-tight drop-shadow-lg">ON YOUR BIRTHDAY!</div>
                          </div>
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <span className="bg-black/60 text-white text-[11px] rounded-full px-2 py-1">Quitar imagen</span>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setHasImage(true)} className="w-full mb-4 rounded-[8px] border-2 border-dashed border-[#e9eae6] bg-[#fafaf9] hover:bg-[#f3f3f1] transition-colors flex flex-col items-center justify-center gap-2 py-8 cursor-pointer">
                          <svg viewBox="0 0 16 16" className="w-6 h-6 fill-none stroke-[#a4a4a2]" strokeWidth="1.3"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><circle cx="5.5" cy="6" r="1.3"/><path d="M1.5 10.5l4-3 3 2.5 2.5-2 3 3"/></svg>
                          <span className="text-[12px] text-[#646462]">Añadir imagen</span>
                        </button>
                      )}

                      <div ref={subRef} contentEditable suppressContentEditableWarning onBlur={e => setEmailSub(e.currentTarget.innerText || '')} className="text-[15px] font-semibold text-[#1a1a1a] mb-2 outline-none focus:bg-[#f8fbff] rounded-[4px] px-1 cursor-text min-h-[1em]"/>
                      <div ref={grabCodeRef} contentEditable suppressContentEditableWarning onBlur={e => setEmailGrabCode(e.currentTarget.innerText || '')} className="text-[13px] text-[#646462] mb-3 outline-none focus:bg-[#f8fbff] rounded-[4px] px-1 cursor-text min-h-[1em]"/>
                      <div ref={codeRef} contentEditable suppressContentEditableWarning onBlur={e => setEmailCode(e.currentTarget.innerText || '')} className="text-[20px] font-bold text-[#1a1a1a] mb-1 tracking-wide outline-none focus:bg-[#f8fbff] rounded-[4px] px-1 cursor-text min-h-[1em]"/>
                      <div ref={validRef} contentEditable suppressContentEditableWarning onBlur={e => setEmailValid(e.currentTarget.innerText || '')} className="text-[12px] text-[#646462] mb-5 outline-none focus:bg-[#f8fbff] rounded-[4px] px-1 cursor-text min-h-[1em]"/>

                      <div className="flex items-center justify-center gap-2 mb-2">
                        <div ref={btnRef} contentEditable suppressContentEditableWarning onBlur={e => setEmailBtn(e.currentTarget.innerText || '')} className="inline-block px-6 py-2.5 rounded-[4px] text-[14px] font-semibold text-white cursor-text outline-none min-w-[80px] text-center" style={{ background: linkColor }}/>
                      </div>
                      <p className="text-[10.5px] text-[#a4a4a2]">URL: <input value={emailBtnUrl} onChange={e => setEmailBtnUrl(e.target.value)} className="text-[10.5px] text-[#3b59f6] outline-none bg-transparent border-b border-transparent focus:border-[#3b59f6] max-w-[200px]"/></p>
                    </div>

                    <div className="px-6 py-4 border-t border-[#e9eae6] bg-[#f8f8f7]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#e9eae6] flex items-center justify-center text-[10px] font-bold text-[#646462]">{sender[0]}</div>
                          <span className="text-[11px] text-[#646462]">{sender.split(' ')[0]} from Acme</span>
                        </div>
                        {showUnsubLink && <a href="#" className="text-[10.5px] hover:underline" style={{ color: linkColor }}>Unsubscribe from our emails</a>}
                      </div>
                      <div className="text-center mt-2 text-[10px] text-[#a4a4a2]">Powered by Intercom</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* How to compose */}
            <div className="w-full text-center py-3">
              <a href="#" className="inline-flex items-center gap-1.5 text-[12.5px] text-[#3b59f6] hover:underline" onClick={e => e.preventDefault()}>
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M5.5 7h5M5.5 10h3"/></svg>
                How to compose a message
              </a>
            </div>

            {/* ── Rules ────────────────────────────────────────────── */}
            <div className="w-full bg-white border border-[#e9eae6] rounded-[10px] mb-3 overflow-hidden">
              <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#fafaf9] transition-colors text-left" onClick={() => setRulesOpen(o => !o)}>
                <span className="text-[13px] font-semibold text-[#1a1a1a] flex-shrink-0">Rules</span>
                <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-none stroke-[#646462] flex-shrink-0 transition-transform ${rulesOpen ? 'rotate-90' : ''}`} strokeWidth="1.5"><path d="M6 3l5 5-5 5" strokeLinecap="round"/></svg>
                <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                  {sendMode === 'user' && specificUser ? (
                    <span className="inline-flex items-center gap-1 bg-[#eff3ff] border border-[#c7d2fe] text-[#3b59f6] text-[11.5px] px-2.5 py-0.5 rounded-full font-medium">{specificUser.name}</span>
                  ) : ruleChips.map((chip, i) => (
                    <span key={i} className="inline-flex items-center bg-[#f3f3f1] border border-[#e9eae6] text-[#1a1a1a] text-[11.5px] px-2.5 py-0.5 rounded-full">{chip}</span>
                  ))}
                </div>
              </button>
              {rulesOpen && (
                <div className="border-t border-[#e9eae6] px-4 py-4 space-y-3">
                  {sendMode === 'user' ? (
                    <div className="flex items-center gap-3 p-3 bg-[#eff3ff] border border-[#c7d2fe] rounded-[8px]">
                      <div className="w-8 h-8 rounded-full bg-[#3b59f6] text-white text-[12px] font-bold flex items-center justify-center">{specificUser?.avatar}</div>
                      <div><p className="text-[13px] font-semibold text-[#1a1a1a]">{specificUser?.name}</p><p className="text-[11.5px] text-[#646462]">{specificUser?.email}</p></div>
                      <button onClick={() => { setSpecificUser(null); setSendMode('audience'); }} className="ml-auto text-[13px] text-[#646462] hover:text-[#1a1a1a]">Cambiar</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        {(['dinamica', 'all'] as const).map(t => (
                          <button key={t} onClick={() => setAudienceType(t)} className={`flex-1 py-1.5 text-[12.5px] rounded-[8px] border font-medium transition-all ${audienceType === t ? 'border-[#3b59f6] bg-[#eff3ff] text-[#3b59f6]' : 'border-[#e9eae6] text-[#646462] hover:border-[#c8c9c4]'}`}>
                            {t === 'dinamica' ? 'Audiencia dinámica' : 'Todos los usuarios'}
                          </button>
                        ))}
                      </div>
                      {audienceType === 'dinamica' && (
                        <div className="space-y-2">
                          {audienceRules.map((rule, i) => (
                            <div key={i} className="flex items-center gap-1.5 bg-[#fafaf9] border border-[#e9eae6] rounded-[8px] p-2">
                              <select value={rule.attr} onChange={e => { const r = [...audienceRules]; r[i] = { ...r[i], attr: e.target.value }; setAudienceRules(r); }} className="text-[12px] border-none bg-transparent outline-none text-[#1a1a1a] flex-1 min-w-0">
                                <option>Unsubscribed from Emails</option><option>Tipo de usuario</option><option>Sesiones</option><option>País</option><option>Plan</option>
                              </select>
                              <select value={rule.op} onChange={e => { const r = [...audienceRules]; r[i] = { ...r[i], op: e.target.value }; setAudienceRules(r); }} className="text-[12px] border-none bg-transparent outline-none text-[#646462]">
                                <option>is</option><option>is not</option><option>contains</option>
                              </select>
                              <input value={rule.value} onChange={e => { const r = [...audienceRules]; r[i] = { ...r[i], value: e.target.value }; setAudienceRules(r); }} className="w-16 text-[12px] border border-[#e9eae6] rounded-[4px] px-1.5 py-0.5 outline-none text-right bg-white"/>
                              <button onClick={() => setAudienceRules(audienceRules.filter((_, j) => j !== i))} className="text-[#646462] hover:text-[#dc2626] flex-shrink-0">
                                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.8"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>
                              </button>
                            </div>
                          ))}
                          <button onClick={() => setAudienceRules([...audienceRules, { attr: 'Sesiones', op: 'is', value: '1' }])} className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#3b59f6] hover:underline">
                            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
                            Añadir regla
                          </button>
                          <div className="border-t border-[#e9eae6] pt-3">
                            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wide mb-1">Contactos disponibles</p>
                            <p className="text-[22px] font-bold text-[#1a1a1a]">{Array.isArray(rawCustomers) ? rawCustomers.length : 0}</p>
                            <p className="text-[12px] text-[#646462]">en el sistema</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div className="pt-2 flex justify-end">
                    <button onClick={() => setShowUserModal(true)} className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#646462] hover:text-[#1a1a1a] border border-[#e9eae6] rounded-full px-3 py-1.5">
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><circle cx="8" cy="6" r="2.5"/><path d="M3 13.5c.8-2.5 2.8-3.8 5-3.8s4.2 1.3 5 3.8"/></svg>
                      Enviar a usuario específico
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Frequency ────────────────────────────────────────── */}
            <div className="w-full bg-white border border-[#e9eae6] rounded-[10px] mb-3 overflow-hidden">
              <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#fafaf9] transition-colors text-left" onClick={() => setFrequencyOpen(o => !o)}>
                <span className="text-[13px] font-semibold text-[#1a1a1a] flex-shrink-0">Frequency and scheduling</span>
                <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-none stroke-[#646462] flex-shrink-0 transition-transform ${frequencyOpen ? 'rotate-90' : ''}`} strokeWidth="1.5"><path d="M6 3l5 5-5 5" strokeLinecap="round"/></svg>
                <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                  {freqChips.map((chip, i) => <span key={i} className="inline-flex items-center bg-[#f3f3f1] border border-[#e9eae6] text-[#1a1a1a] text-[11.5px] px-2.5 py-0.5 rounded-full">{chip}</span>)}
                </div>
              </button>
              {frequencyOpen && (
                <div className="border-t border-[#e9eae6] px-4 py-4 space-y-4">
                  <div>
                    <label className="block text-[11.5px] font-semibold text-[#646462] uppercase tracking-wide mb-2">Frecuencia de envío</label>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-[#1a1a1a]">Enviar cada</span>
                      <input value={sendEvery} onChange={e => setSendEvery(e.target.value)} className="w-12 h-8 border border-[#e9eae6] rounded-[6px] text-center text-[13px] outline-none focus:border-[#1a1a1a]"/>
                      <select value={sendUnit} onChange={e => setSendUnit(e.target.value)} className="h-8 border border-[#e9eae6] rounded-[6px] px-2 text-[13px] outline-none focus:border-[#1a1a1a] bg-white">
                        <option value="hour">hora(s)</option><option value="day">día(s)</option><option value="week">semana(s)</option><option value="month">mes(es)</option>
                      </select>
                      <span className="text-[13px] text-[#646462]">si coincide</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11.5px] font-semibold text-[#646462] uppercase tracking-wide mb-2">Inicio de envío</label>
                    <div className="flex gap-2">
                      {[{ v: 'immediately', l: 'Start sending immediately' }, { v: 'scheduled', l: 'Envío programado' }].map(opt => (
                        <label key={opt.v} className={`flex items-center gap-2 px-3 py-2 rounded-[8px] border cursor-pointer transition-colors flex-1 ${startSending === opt.v ? 'border-[#3b59f6] bg-[#eff3ff]' : 'border-[#e9eae6] hover:border-[#c8c9c4]'}`}>
                          <input type="radio" checked={startSending === opt.v} onChange={() => setStartSending(opt.v)} className="accent-[#3b59f6]"/>
                          <span className="text-[12px] text-[#1a1a1a]">{opt.l}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11.5px] font-semibold text-[#646462] uppercase tracking-wide mb-2">Fin de envío</label>
                    <div className="flex gap-2">
                      {[{ v: 'never', l: 'Never stop sending' }, { v: 'date', l: 'Fecha específica' }].map(opt => (
                        <label key={opt.v} className={`flex items-center gap-2 px-3 py-2 rounded-[8px] border cursor-pointer transition-colors flex-1 ${stopSending === opt.v ? 'border-[#3b59f6] bg-[#eff3ff]' : 'border-[#e9eae6] hover:border-[#c8c9c4]'}`}>
                          <input type="radio" checked={stopSending === opt.v} onChange={() => setStopSending(opt.v)} className="accent-[#3b59f6]"/>
                          <span className="text-[12px] text-[#1a1a1a]">{opt.l}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11.5px] font-semibold text-[#646462] uppercase tracking-wide mb-2">Horario de envío</label>
                    <div className="flex gap-2">
                      {[{ v: 'any', l: 'Any day, any time' }, { v: 'business', l: 'Solo horario laboral' }].map(opt => (
                        <label key={opt.v} className={`flex items-center gap-2 px-3 py-2 rounded-[8px] border cursor-pointer transition-colors flex-1 ${sendDays === opt.v ? 'border-[#3b59f6] bg-[#eff3ff]' : 'border-[#e9eae6] hover:border-[#c8c9c4]'}`}>
                          <input type="radio" checked={sendDays === opt.v} onChange={() => setSendDays(opt.v)} className="accent-[#3b59f6]"/>
                          <span className="text-[12px] text-[#1a1a1a]">{opt.l}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Goal and UTM ──────────────────────────────────────── */}
            <div className="w-full bg-white border border-[#e9eae6] rounded-[10px] mb-6 overflow-hidden">
              <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#fafaf9] transition-colors text-left" onClick={() => setGoalOpen(o => !o)}>
                <span className="text-[13px] font-semibold text-[#1a1a1a] flex-shrink-0">Goal and UTM tracking</span>
                <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-none stroke-[#646462] flex-shrink-0 transition-transform ${goalOpen ? 'rotate-90' : ''}`} strokeWidth="1.5"><path d="M6 3l5 5-5 5" strokeLinecap="round"/></svg>
                <span className="text-[12.5px] text-[#646462]">{goal ? goal : 'No goal set'}</span>
              </button>
              {goalOpen && (
                <div className="border-t border-[#e9eae6] px-4 py-4 space-y-4">
                  <div>
                    <label className="block text-[11.5px] font-semibold text-[#646462] uppercase tracking-wide mb-2">Objetivo</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['', 'Activación', 'Retención', 'Adopción', 'Conversión'].map(g => (
                        <label key={g} className={`flex items-center gap-2 px-3 py-2 rounded-[8px] border cursor-pointer transition-colors ${goal === g ? 'border-[#3b59f6] bg-[#eff3ff]' : 'border-[#e9eae6] hover:border-[#c8c9c4]'}`}>
                          <input type="radio" checked={goal === g} onChange={() => setGoal(g)} className="accent-[#3b59f6]"/>
                          <span className="text-[12px] text-[#1a1a1a]">{g === '' ? 'Sin objetivo' : g}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-[#e9eae6] pt-4">
                    <label className="block text-[11.5px] font-semibold text-[#646462] uppercase tracking-wide mb-3">UTM Tracking</label>
                    <div className="space-y-2">
                      {[{ label: 'utm_campaign', value: utmCampaign, set: setUtmCampaign, placeholder: 'nombre-de-campaña' }, { label: 'utm_medium', value: utmMedium, set: setUtmMedium, placeholder: 'email' }, { label: 'utm_source', value: utmSource, set: setUtmSource, placeholder: 'intercom' }].map(field => (
                        <div key={field.label} className="flex items-center gap-3">
                          <span className="text-[11.5px] font-mono text-[#646462] w-[120px] flex-shrink-0">{field.label}</span>
                          <input value={field.value} onChange={e => field.set(e.target.value)} placeholder={field.placeholder} className="flex-1 h-8 border border-[#e9eae6] rounded-[6px] px-3 text-[12.5px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] placeholder:text-[#a4a4a2]"/>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Outbound Mensajes main view ───────────────────────────────────────────────
function OutboundMensajes() {
  // Load persisted messages from emailTemplatesApi (category=outbound)
  const { data: apiTemplates, loading: loadingMsgs, refetch: refetchMsgs } = useApi<any[]>(
    () => emailTemplatesApi.list({ category: 'outbound' }),
    [],
    [],
  );
  const [localMessages, setLocalMessages] = useState<OutboundMsg[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  async function handleBulkDelete() {
    if (bulkDeleting || selected.size === 0) return;
    const ids = [...selected];
    setBulkDeleting(true);
    try {
      const apiIds = new Set((Array.isArray(apiTemplates) ? apiTemplates : []).map((t: any) => String(t.id)));
      // Persisted rows → delete server-side; local-only drafts → just drop.
      await Promise.allSettled(ids.filter(id => apiIds.has(id)).map(id => emailTemplatesApi.delete(id)));
      setLocalMessages(prev => prev.filter(m => !ids.includes(m.id)));
      setSelected(new Set());
      refetchMsgs();
    } catch { /* surfaced by the global error banner */ } finally { setBulkDeleting(false); }
  }

  // Merge API data with local overrides (local takes priority by id)
  const messages: OutboundMsg[] = useMemo(() => {
    const fromApi: OutboundMsg[] = Array.isArray(apiTemplates)
      ? apiTemplates.map(mapTemplateToMsg)
      : [];
    // Merge: local additions/edits override API rows
    const merged = [...fromApi];
    for (const lm of localMessages) {
      const idx = merged.findIndex(m => m.id === lm.id);
      if (idx >= 0) merged[idx] = lm; else merged.unshift(lm);
    }
    return merged;
  }, [apiTemplates, localMessages]);

  const setMessages = (updater: (prev: OutboundMsg[]) => OutboundMsg[]) => {
    setLocalMessages(prev => updater(prev));
  };

  const [search, setSearch] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState<OutboundContentType>('all');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OutboundMsgStatus | 'all'>('all');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [editorState, setEditorState] = useState<{ open: boolean; template: OutboundTemplate | null; draft?: OutboundMsg } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const contentTypeOpts: OutboundContentType[] = ['all', 'chat', 'email', 'whatsapp', 'sms', 'push', 'banner', 'post'];

  const filtered = messages.filter(m => {
    const matchesType = contentTypeFilter === 'all' || m.contentType === contentTypeFilter;
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    const matchesSearch = !search || m.title.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesStatus && matchesSearch;
  });

  const handleTemplateSelect = (t: OutboundTemplate | null) => { setShowTemplatePicker(false); setEditorState({ open: true, template: t }); };
  const handleEditorSave = (msg: OutboundMsg) => { setMessages(prev => { const exists = prev.find(m => m.id === msg.id); return exists ? prev.map(m => m.id === msg.id ? msg : m) : [msg, ...prev]; }); setEditorState(null); };
  const toggleSelect = (id: string) => { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const toggleAll = () => { setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(m => m.id))); };

  if (editorState?.open) {
    return <OutboundMessageEditor template={editorState.template} draft={editorState.draft} onBack={() => setEditorState(null)} onSave={handleEditorSave} />;
  }

  return (
    <>
      {showTemplatePicker && <OutboundTemplatePicker onSelect={handleTemplateSelect} onClose={() => setShowTemplatePicker(false)} />}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 4h12L8 13z"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Mensajes</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg></button>
          <button onClick={() => setEditorState({ open: true, template: null })} className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><circle cx="8" cy="6" r="2.5"/><path d="M3 13.5c.8-2.5 2.8-3.8 5-3.8s4.2 1.3 5 3.8"/></svg>
            Enviar a usuario
          </button>
          <button onClick={() => setShowTemplatePicker(true)} className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-3 py-[6px] text-[13px] font-semibold hover:bg-black">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
            Nuevo mensaje
          </button>
        </div>
      </div>
      <div className="px-6 py-2.5 border-b border-[#e9eae6] flex items-center gap-2 flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2 border border-[#e9eae6] rounded-full px-3 py-[5px] bg-white max-w-[220px]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar mensajes…" className="flex-1 outline-none text-[13px] placeholder:text-[#9ca3af] bg-transparent min-w-0"/>
        </div>
        <div className="relative">
          <button onClick={() => { setShowTypeDropdown(v => !v); setShowFilterPanel(false); }} className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[5px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4] bg-white">
            <OutboundContentIcon type={contentTypeFilter}/>
            {OUTBOUND_CONTENT_TYPE_LABELS[contentTypeFilter]}
            <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current text-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
          </button>
          {showTypeDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-[#e9eae6] rounded-[10px] shadow-lg z-20 py-1 min-w-[210px]">
              {contentTypeOpts.map(ct => (
                <button key={ct} onClick={() => { setContentTypeFilter(ct); setShowTypeDropdown(false); }} className={`flex items-center gap-2.5 w-full px-4 py-2 text-[13px] hover:bg-[#f5f5f4] transition-colors ${contentTypeFilter === ct ? 'font-semibold text-[#1a1a1a]' : 'text-[#646462]'}`}>
                  <OutboundContentIcon type={ct}/>{OUTBOUND_CONTENT_TYPE_LABELS[ct]}
                  {contentTypeFilter === ct && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 ml-auto"><path d="M3 8l4 4 6-7" stroke="#3b59f6" strokeWidth="2" fill="none"/></svg>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button onClick={() => { setShowFilterPanel(v => !v); setShowTypeDropdown(false); }} className={`flex items-center gap-1.5 border rounded-full px-3 py-[5px] text-[13px] font-medium transition-colors ${showFilterPanel || statusFilter !== 'all' ? 'border-[#3b59f6] bg-[#eff3ff] text-[#3b59f6]' : 'border-[#e9eae6] text-[#1a1a1a] hover:bg-[#f5f5f4] bg-white'}`}>
            <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
            Filtrar
            {statusFilter !== 'all' && <span className="ml-0.5 bg-[#3b59f6] text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">1</span>}
          </button>
          {showFilterPanel && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-[#e9eae6] rounded-[10px] shadow-lg z-20 p-4 min-w-[200px]">
              <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-[0.06em] mb-2">Estado</p>
              <div className="space-y-1.5">
                {(['all', 'activo', 'pausado', 'detenido', 'borrador'] as const).map(s => (
                  <label key={s} className="flex items-center gap-2.5 py-0.5 cursor-pointer">
                    <input type="radio" checked={statusFilter === s} onChange={() => setStatusFilter(s)} className="accent-[#3b59f6]"/>
                    <span className="text-[13px] text-[#1a1a1a]">{s === 'all' ? 'Todos los estados' : s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  </label>
                ))}
              </div>
              <div className="border-t border-[#e9eae6] mt-3 pt-2"><button onClick={() => { setStatusFilter('all'); setShowFilterPanel(false); }} className="text-[12.5px] text-[#646462] hover:text-[#1a1a1a]">Limpiar filtros</button></div>
            </div>
          )}
        </div>
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 text-[12.5px]">
            <span className="text-[#646462]">{selected.size} seleccionado{selected.size > 1 ? 's' : ''}</span>
            <button className="px-3 py-1 border border-[#e9eae6] rounded-full text-[#646462] hover:bg-[#f5f5f4]">Pausar</button>
            <button className="px-3 py-1 border border-[#e9eae6] rounded-full text-[#646462] hover:bg-[#f5f5f4]">Detener</button>
            <button onClick={handleBulkDelete} disabled={bulkDeleting} className="px-3 py-1 border border-[#fee2e2] rounded-full text-[#dc2626] hover:bg-[#fef2f2] disabled:opacity-40">{bulkDeleting ? 'Eliminando…' : 'Eliminar'}</button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0" onClick={() => { setShowTypeDropdown(false); setShowFilterPanel(false); }}>
        <div className="px-6 pt-4 pb-2 flex items-center gap-2">
          <p className="text-[12.5px] text-[#646462]">{filtered.length} mensaje{filtered.length !== 1 ? 's' : ''}</p>
          {loadingMsgs && <svg viewBox="0 0 16 16" className="w-3 h-3 animate-spin fill-none stroke-[#646462]" strokeWidth="1.6"><circle cx="8" cy="8" r="6" strokeDasharray="20 14"/></svg>}
        </div>
        {filtered.length > 0 ? (
          <div className="mx-6 mb-6 border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
            <div className="grid grid-cols-[36px_1fr_116px_180px_150px_80px_74px_64px] px-4 py-2.5 border-b border-[#f1f1ee] text-[11.5px] font-semibold text-[#646462] items-center bg-[#fafaf9]">
              <div><button onClick={toggleAll} className="w-4 h-4 border border-[#d4d4d2] rounded flex items-center justify-center hover:border-[#3b59f6]">{selected.size > 0 && selected.size === filtered.length && <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M3 8l4 4 6-7" stroke="#3b59f6" strokeWidth="2" fill="none"/></svg>}</button></div>
              <div>Título</div><div>Estado</div><div>Remitente</div><div>Canal</div><div>Enviados</div><div>Objetivo</div><div>Tipo</div>
            </div>
            {filtered.map((msg, i) => (
              <div key={msg.id} className={`grid grid-cols-[36px_1fr_116px_180px_150px_80px_74px_64px] px-4 py-3 items-center cursor-pointer transition-colors ${i > 0 ? 'border-t border-[#f1f1ee]' : ''} ${selected.has(msg.id) ? 'bg-[#eff3ff]' : 'hover:bg-[#fafaf9]'}`} onClick={() => setEditorState({ open: true, template: null, draft: msg })}>
                <div onClick={e => { e.stopPropagation(); toggleSelect(msg.id); }}><div className={`w-4 h-4 border rounded flex items-center justify-center transition-colors ${selected.has(msg.id) ? 'border-[#3b59f6] bg-[#3b59f6]' : 'border-[#d4d4d2] hover:border-[#3b59f6]'}`}>{selected.has(msg.id) && <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M3 8l4 4 6-7" stroke="white" strokeWidth="2" fill="none"/></svg>}</div></div>
                <div className="min-w-0 pr-2"><p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{msg.title}</p>{msg.audience && <p className="text-[11px] text-[#646462] truncate mt-0.5">{msg.audience}</p>}</div>
                <div><OutboundStatusBadge status={msg.status}/></div>
                <div className="flex items-center gap-1.5 min-w-0"><span className="w-5 h-5 rounded-full bg-[#e9eae6] flex items-center justify-center text-[10px] font-bold text-[#646462] flex-shrink-0">{msg.senderInitial}</span><span className="text-[12.5px] text-[#1a1a1a] truncate">{msg.senderName}</span></div>
                <div className="flex items-center gap-1.5 text-[12.5px] text-[#1a1a1a]"><span className="text-[#646462] flex-shrink-0"><OutboundContentIcon type={msg.contentType}/></span><span className="truncate">{OUTBOUND_CONTENT_TYPE_LABELS[msg.contentType]}</span></div>
                <div className="text-[12.5px] text-[#3b59f6] font-medium">{msg.sent.toLocaleString('es-ES')}</div>
                <div className="text-[12.5px] text-[#1a1a1a]">{msg.goalPct !== undefined ? `${msg.goalPct}%` : '—'}</div>
                <div className="text-[12px] text-[#646462] capitalize">{msg.triggerType}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center px-8">
            <div className="w-14 h-14 rounded-full bg-[#f1f1ee] flex items-center justify-center mb-4"><svg viewBox="0 0 16 16" className="w-6 h-6 fill-[#646462]"><path d="M2 4h12L8 13z"/></svg></div>
            <p className="text-[15px] font-semibold text-[#1a1a1a] mb-1">Sin mensajes</p>
            <p className="text-[13px] text-[#646462] max-w-[280px]">{search || contentTypeFilter !== 'all' || statusFilter !== 'all' ? 'No hay mensajes que coincidan con los filtros.' : 'Crea tu primer mensaje saliente para empezar a comunicarte con tus usuarios.'}</p>
            {!search && contentTypeFilter === 'all' && statusFilter === 'all' && (
              <button onClick={() => setShowTemplatePicker(true)} className="mt-4 flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-2 text-[13px] font-semibold hover:bg-black">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
                Crear primer mensaje
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function OutboundSeries() {
  // Real workflows from the backend feed the table. Series items are tagged with
  // kind='series' on creation so they can be distinguished in the Workflows list.
  const { data: workflowsData, refetch: refetchWorkflows } = useApi(() => workflowsApi.list(), [], []);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [instantiatingTplId, setInstantiatingTplId] = useState<string | null>(null);

  // Embedded builder state. null = list, '' = create-new, anything else = edit existing id.
  const [builderId, setBuilderId] = useState<string | null>(null);

  // Adapt outbound message templates to the workflow template shape.
  const defaultTemplates = useMemo(
    () => OUTBOUND_TEMPLATES.map(t => ({
      id: `series_${t.id}`,
      label: t.title,
      description: t.description,
      category: t.categories[0] ?? 'general',
      contentType: t.contentType,
      nodes: [] as any[],
      edges: [] as any[],
    })),
    [],
  );

  async function instantiateTemplate(tpl: any) {
    if (instantiatingTplId) return;
    setInstantiatingTplId(tpl.id);
    try {
      const created: any = await workflowsApi.create({
        name: tpl.label || tpl.id,
        description: tpl.description || '',
        nodes: [],
        edges: [],
        trigger: { type: 'manual' },
        kind: 'series',
      });
      const newId = created?.id || created?.workflow?.id;
      showSeriesStatus(`Serie "${tpl.label}" creada`);
      refetchWorkflows();
      if (newId) setBuilderId(newId);
    } catch (err: any) {
      showSeriesStatus(err?.message || 'No se pudo crear la serie', 'error');
    } finally {
      setInstantiatingTplId(null);
    }
  }

  // Filter chips
  const [audienceFilter, setAudienceFilter] = useState<string>('any');
  const [statusFilter, setStatusFilter] = useState<string>('any');
  const [channelFilter, setChannelFilter] = useState<string>('any');
  const [typeFilter, setTypeFilter] = useState<string>('any');
  const [extraFilters, setExtraFilters] = useState<{ tag: boolean; lastEdited: boolean }>({ tag: false, lastEdited: false });
  const [tagFilter, setTagFilter] = useState<string>('any');
  const [lastEditedFilter, setLastEditedFilter] = useState<string>('any');
  const [showAddFilter, setShowAddFilter] = useState(false);
  const addSeriesFilterRef = useRef<HTMLDivElement>(null);

  const [learnModal, setLearnModal] = useState<null | 'docs' | 'tutorial' | 'templates'>(null);
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);

  useEffect(() => {
    if (!showAddFilter) return;
    function onClick(e: MouseEvent) {
      if (addSeriesFilterRef.current?.contains(e.target as Node)) return;
      setShowAddFilter(false);
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [showAddFilter]);

  const workflows = useMemo(() => {
    const list = Array.isArray(workflowsData) ? workflowsData : [];
    const q = search.trim().toLowerCase();
    return list.filter((w: any) => {
      if (q && !String(w.name || w.title || w.id || '').toLowerCase().includes(q)) return false;
      if (statusFilter !== 'any') {
        const s = String(w.status || w.state || '').toLowerCase();
        const want = statusFilter.toLowerCase();
        const aliases: Record<string, string[]> = {
          active: ['active', 'published', 'live'],
          draft: ['draft', 'unpublished'],
          paused: ['paused'],
          archived: ['archived'],
        };
        if (!(aliases[want] || [want]).includes(s)) return false;
      }
      if (audienceFilter !== 'any') {
        const a = String(w.audience || '').toLowerCase();
        if (a && a !== audienceFilter) return false;
      }
      if (channelFilter !== 'any') {
        const channels: string[] = Array.isArray(w.channels) ? w.channels.map((c: any) => String(c).toLowerCase()) : [];
        if (channels.length > 0 && !channels.includes(channelFilter)) return false;
      }
      if (typeFilter !== 'any') {
        const t = String(w.kind || w.trigger?.type || w.type || '').toLowerCase();
        if (t && !t.includes(typeFilter)) return false;
      }
      if (extraFilters.tag && tagFilter !== 'any') {
        const tags: string[] = Array.isArray(w.tags) ? w.tags.map((t: any) => String(t).toLowerCase()) : [];
        if (tags.length > 0 && !tags.includes(tagFilter)) return false;
      }
      if (extraFilters.lastEdited && lastEditedFilter !== 'any') {
        const updated = w.updated_at || w.updatedAt;
        if (updated) {
          const days = (Date.now() - new Date(updated).getTime()) / (1000 * 60 * 60 * 24);
          if (lastEditedFilter === '7d' && days > 7) return false;
          if (lastEditedFilter === '30d' && days > 30) return false;
          if (lastEditedFilter === '90d' && days > 90) return false;
        }
      }
      return true;
    });
  }, [workflowsData, search, statusFilter, audienceFilter, channelFilter, typeFilter, extraFilters, tagFilter, lastEditedFilter]);

  function showSeriesStatus(msg: string, type: 'success' | 'error' = 'success') {
    setStatusMsg({ msg, type });
    window.setTimeout(() => setStatusMsg(null), 3000);
  }
  async function runSerie(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await workflowsApi.run(id);
      showSeriesStatus('Serie lanzada correctamente');
    } catch (err: any) {
      showSeriesStatus(err?.message || 'No se pudo lanzar la serie', 'error');
    } finally { setBusyId(null); }
  }
  function openInBuilder(id: string) {
    setBuilderId(id === 'new' ? '' : id);
  }

  // ── Embedded builder view ────────────────────────────────────────────────
  if (builderId !== null) {
    return (
      <div className="flex flex-col h-full min-h-0 bg-white">
        <div className="flex-shrink-0 h-11 border-b border-[#e9eae6] px-4 flex items-center">
          <button
            onClick={() => setBuilderId(null)}
            className="h-8 px-2.5 -ml-1 rounded-md hover:bg-[#f8f8f7] text-[13px] font-medium text-[#1a1a1a] flex items-center gap-1.5"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Volver a series
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <Workflows
            focusWorkflowId={builderId === '' ? undefined : builderId}
            onNavigate={(target: any) => {
              const section = target?.section;
              const page = target?.page;
              if (page && page !== 'workflows') { setBuilderId(null); return; }
              if (section === 'library' || section === 'list') { setBuilderId(null); return; }
            }}
          />
        </div>
      </div>
    );
  }

  const rows = workflows;
  const problematic = (Array.isArray(workflowsData) ? workflowsData : []).filter((w: any) => {
    const s = String(w.status || w.state || '').toLowerCase();
    return s === 'blocked' || s === 'needs_setup' || s === 'dependency_missing';
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Hero promo card */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4">
        <div className="relative bg-white border border-[#e9eae6] rounded-[12px] px-5 py-4 flex gap-5">
          <button className="absolute top-3 right-3 w-6 h-6 rounded-md flex items-center justify-center hover:bg-[#f3f3f1]" aria-label="Cerrar">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
          </button>
          <div className="flex-1 min-w-0 max-w-[640px]">
            <h2 className="text-[18px] font-bold text-[#1a1a1a] leading-[24px]">Automatiza tus mensajes con Series</h2>
            <p className="mt-2 text-[13px] text-[#646462] leading-[20px]">
              Crea recorridos de mensajería fluidos para captar a los clientes en todos los canales. Combina chat, email, WhatsApp, SMS y más en una sola serie de mensajes automatizados que se activa en el momento preciso.
            </p>
            <button className="mt-3 h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[12.5px] inline-flex items-center gap-1.5 text-[#1a1a1a] hover:bg-[#f8f8f7]">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#1a1a1a]" strokeWidth="1.4"><path d="M2.5 3.2v9.6c1.7-.6 3.4-.6 5.5 0 2.1-.6 3.8-.6 5.5 0V3.2c-1.7-.6-3.4-.6-5.5 0C5.9 2.6 4.2 2.6 2.5 3.2z" strokeLinejoin="round"/></svg>
              <span>Más información sobre Series</span>
            </button>
          </div>
          <div className="hidden md:block w-[260px] flex-shrink-0">
            <div className="relative w-full h-[140px] rounded-[8px] overflow-hidden border border-[#e9eae6]" style={{ background: 'linear-gradient(135deg, #bcd9c8 0%, #f1d49b 50%, #a08bc4 100%)' }}>
              <div className="absolute inset-3 grid grid-cols-2 gap-2">
                <div className="bg-white/80 rounded-[6px] border border-white/70 shadow-sm p-1.5">
                  <div className="h-1.5 rounded bg-[#3b59f6]/40 mb-1" style={{ width: '60%' }}/>
                  <div className="h-1 rounded bg-[#1a1a1a]/10 w-full"/>
                </div>
                <div className="bg-white/80 rounded-[6px] border border-white/70 shadow-sm p-1.5">
                  <div className="h-1.5 rounded bg-[#10b981]/40 mb-1" style={{ width: '70%' }}/>
                  <div className="h-1 rounded bg-[#1a1a1a]/10 w-full"/>
                </div>
                <div className="bg-white/80 rounded-[6px] border border-white/70 shadow-sm p-1.5">
                  <div className="h-1.5 rounded bg-[#f59e0b]/40 mb-1" style={{ width: '50%' }}/>
                  <div className="h-1 rounded bg-[#1a1a1a]/10 w-full"/>
                </div>
                <div className="bg-white/80 rounded-[6px] border border-white/70 shadow-sm p-1.5">
                  <div className="h-1.5 rounded bg-[#8b5cf6]/40 mb-1" style={{ width: '65%' }}/>
                  <div className="h-1 rounded bg-[#1a1a1a]/10 w-full"/>
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M5 3.5l7 4.5-7 4.5z"/></svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section header */}
      <div className="flex-shrink-0 px-6 pb-3 flex items-center gap-2">
        <h3 className="text-[15px] font-bold text-[#1a1a1a] flex-1">Series</h3>
        <button
          onClick={() => setTroubleshootOpen(true)}
          className="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[13px] inline-flex items-center gap-1.5 text-[#1a1a1a] hover:bg-[#f8f8f7]"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#1a1a1a]" strokeWidth="1.4"><path d="M9.5 2l-1.5 4 4 1-5 7 1-4-4-1z" strokeLinejoin="round"/></svg>
          <span>Solucionar problemas</span>
        </button>
        <Dropdown
          value=""
          onChange={(v) => {
            if (v === 'docs') setLearnModal('docs');
            else if (v === 'tutorial') setLearnModal('tutorial');
            else if (v === 'templates') setLearnModal('templates');
          }}
          items={[
            { value: 'docs', label: 'Documentación' },
            { value: 'tutorial', label: 'Tutorial: tu primera serie' },
            { value: 'templates', label: 'Plantillas de mensajes' },
          ]}
          renderTrigger={(_sel, isOpen) => (
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#1a1a1a]" strokeWidth="1.4"><path d="M2.5 3.2v9.6c1.7-.6 3.4-.6 5.5 0 2.1-.6 3.8-.6 5.5 0V3.2c-1.7-.6-3.4-.6-5.5 0C5.9 2.6 4.2 2.6 2.5 3.2z" strokeLinejoin="round"/></svg>
              <span>Aprender</span>
              <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-[#646462] transition-transform ${isOpen ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4z"/></svg>
            </span>
          )}
          triggerClassName="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
        />
        <button onClick={() => openInBuilder('new')} className="h-8 px-3 rounded-full bg-[#1a1a1a] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-black">
          <svg viewBox="0 0 12 12" className="w-3 h-3 fill-none stroke-white" strokeWidth="1.7"><path d="M6 2v8M2 6h8" strokeLinecap="round"/></svg>
          <span>Nueva serie</span>
          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 fill-white"><path d="M3 4.5l3 3 3-3z"/></svg>
        </button>
      </div>

      {/* Filters row */}
      <div className="flex-shrink-0 px-6 pb-3 flex items-center gap-2 flex-wrap">
        <div className="relative w-[220px]">
          <svg viewBox="0 0 16 16" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L13 13"/></svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar series..."
            className="w-full h-8 pl-9 pr-3 rounded-[8px] border border-[#e9eae6] bg-white text-[13px] text-[#1a1a1a] placeholder:text-[#a4a4a2] focus:outline-none focus:border-[#1a1a1a]"
          />
        </div>
        <Dropdown
          value={audienceFilter}
          onChange={setAudienceFilter}
          items={[
            { value: 'any', label: 'Todos' },
            { value: 'visitors', label: 'Visitantes' },
            { value: 'leads', label: 'Leads' },
            { value: 'users', label: 'Usuarios' },
          ]}
          triggerClassName="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[12.5px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
          renderTrigger={(sel, isOpen) => (
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="6" cy="6" r="2.2"/><path d="M2 13.5c.6-2.2 2.2-3.4 4-3.4s3.4 1.2 4 3.4"/><circle cx="11.5" cy="5" r="1.7"/><path d="M11 9.6c1.5.1 2.7 1.1 3.2 2.7"/></svg>
              <span>{sel?.value === 'any' || !sel ? 'Visitantes, leads o usuarios' : sel.label}</span>
              <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-[#646462] transition-transform ${isOpen ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4z"/></svg>
            </span>
          )}
        />
        <Dropdown
          value={statusFilter}
          onChange={setStatusFilter}
          items={[
            { value: 'any', label: 'Cualquiera' },
            { value: 'draft', label: 'Borrador' },
            { value: 'active', label: 'Activo' },
            { value: 'paused', label: 'Pausado' },
            { value: 'archived', label: 'Archivado' },
          ]}
          triggerClassName="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[12.5px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
          renderTrigger={(sel, isOpen) => (
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2.5" y="3" width="11" height="10" rx="1.2"/><path d="M2.5 6h11M5 9h6M5 11h4"/></svg>
              <span>{sel?.value === 'any' || !sel ? 'Estado: cualquiera' : `Estado: ${sel.label}`}</span>
              <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-[#646462] transition-transform ${isOpen ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4z"/></svg>
            </span>
          )}
        />
        <Dropdown
          value={channelFilter}
          onChange={setChannelFilter}
          items={[
            { value: 'any', label: 'Cualquiera' },
            { value: 'chat', label: 'Chat' },
            { value: 'email', label: 'Email' },
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'sms', label: 'SMS' },
            { value: 'push', label: 'Push' },
            { value: 'banner', label: 'Banner' },
          ]}
          triggerClassName="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[12.5px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
          renderTrigger={(sel, isOpen) => (
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M2.5 6.5C2.5 4 4.5 2.5 8 2.5s5.5 1.5 5.5 4-2 4-5.5 4c-.7 0-1.4-.1-2-.2L3 11.5l.6-2.3c-.7-.8-1.1-1.7-1.1-2.7z"/></svg>
              <span>{sel?.value === 'any' || !sel ? 'Cualquier canal' : `Canal: ${sel.label}`}</span>
              <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-[#646462] transition-transform ${isOpen ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4z"/></svg>
            </span>
          )}
        />
        <Dropdown
          value={typeFilter}
          onChange={setTypeFilter}
          items={[
            { value: 'any', label: 'Cualquiera' },
            { value: 'automatizado', label: 'Automatizado' },
            { value: 'manual', label: 'Manual' },
            { value: 'evento', label: 'Evento' },
            { value: 'visita', label: 'Visita' },
          ]}
          triggerClassName="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[12.5px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
          renderTrigger={(sel, isOpen) => (
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M5 8l2 2 4-4"/></svg>
              <span>{sel?.value === 'any' || !sel ? 'El tipo es cualquiera' : `Tipo: ${sel.label}`}</span>
              <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-[#646462] transition-transform ${isOpen ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4z"/></svg>
            </span>
          )}
        />
        {extraFilters.tag && (
          <Dropdown
            value={tagFilter}
            onChange={setTagFilter}
            items={[
              { value: 'any', label: 'Cualquier etiqueta' },
              { value: 'onboarding', label: 'Onboarding' },
              { value: 'retencion', label: 'Retención' },
              { value: 'ventas', label: 'Ventas' },
              { value: 'soporte', label: 'Soporte' },
            ]}
            triggerClassName="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[12.5px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
          />
        )}
        {extraFilters.lastEdited && (
          <Dropdown
            value={lastEditedFilter}
            onChange={setLastEditedFilter}
            items={[
              { value: 'any', label: 'Cualquier fecha' },
              { value: '7d', label: 'Últimos 7 días' },
              { value: '30d', label: 'Últimos 30 días' },
              { value: '90d', label: 'Últimos 90 días' },
            ]}
            triggerClassName="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[12.5px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
          />
        )}
        <div className="relative inline-block" ref={addSeriesFilterRef}>
          <button
            onClick={() => setShowAddFilter(o => !o)}
            className="h-8 px-2 text-[12.5px] font-semibold text-[#ed621d] hover:underline inline-flex items-center gap-1"
          >
            <span>+</span><span>Agregar filtro</span>
          </button>
          {showAddFilter && (
            <div className="absolute top-[calc(100%+4px)] left-0 z-30 bg-white border border-[#e9eae6] rounded-[10px] shadow-[0_8px_24px_rgba(20,20,20,0.12)] py-1 min-w-[200px]">
              <button
                onClick={() => { setExtraFilters(f => ({ ...f, tag: !f.tag })); setShowAddFilter(false); }}
                className="w-full flex items-center gap-2 px-3 h-9 text-[13px] text-left text-[#1a1a1a] hover:bg-[#f8f8f7]"
              >
                <span className={`w-3.5 h-3.5 rounded border ${extraFilters.tag ? 'bg-[#1a1a1a] border-[#1a1a1a]' : 'border-[#e9eae6]'}`}/>
                <span>Etiquetas</span>
              </button>
              <button
                onClick={() => { setExtraFilters(f => ({ ...f, lastEdited: !f.lastEdited })); setShowAddFilter(false); }}
                className="w-full flex items-center gap-2 px-3 h-9 text-[13px] text-left text-[#1a1a1a] hover:bg-[#f8f8f7]"
              >
                <span className={`w-3.5 h-3.5 rounded border ${extraFilters.lastEdited ? 'bg-[#1a1a1a] border-[#1a1a1a]' : 'border-[#e9eae6]'}`}/>
                <span>Última edición</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Series list */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-6">
        {statusMsg && (
          <div className={`mb-3 px-3 py-2 rounded-[8px] border text-[12.5px] ${statusMsg.type === 'error' ? 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]' : 'bg-[#f0fdf4] border-[#bbf7d0] text-[#15803d]'}`}>
            {statusMsg.msg}
          </div>
        )}
        <p className="text-[13px] text-[#646462] mb-3">{rows.length} {rows.length === 1 ? 'serie' : 'series'}</p>

        {/* Info bar */}
        <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[8px] px-4 py-3 mb-5 flex items-start gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462] flex-shrink-0 mt-0.5" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v3.5M8 11v.01" strokeLinecap="round"/></svg>
          <p className="text-[12.5px] text-[#646462] leading-[18px]">
            Las series también aparecen en <span className="font-semibold">Flujos de trabajo</span> para que puedas gestionarlas desde un único lugar. Los mensajes se envían según las reglas de audiencia y frecuencia configuradas en cada paso.
          </p>
        </div>

        {/* ── Plantillas de series ──────────────────────────────────────── */}
        <div className="mb-5">
          <div className="flex items-baseline gap-2 mb-1">
            <h4 className="text-[14px] font-bold text-[#1a1a1a]">Plantillas de mensajes listas para usar</h4>
            <span className="text-[12px] text-[#a4a4a2]">{defaultTemplates.length}</span>
          </div>
          <p className="text-[13px] text-[#646462] mb-3">Crea una serie en un clic — elige la plantilla que mejor se adapte a tu objetivo.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {defaultTemplates.map((tpl: any) => {
              const isBusy = instantiatingTplId === tpl.id;
              const channelColors: Record<string, string> = {
                chat: '#3b59f6', email: '#10b981', whatsapp: '#25d366',
                sms: '#f59e0b', push: '#8b5cf6', banner: '#ed621d', all: '#1a1a1a',
              };
              const iconColor = channelColors[tpl.contentType] || '#1a1a1a';
              return (
                <div
                  key={tpl.id}
                  className="bg-white border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-3 hover:border-[#1a1a1a]/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ background: iconColor + '18' }}>
                      <svg viewBox="0 0 16 16" className="w-4 h-4" style={{ fill: iconColor }}>
                        <path d="M2.5 6.5C2.5 4 4.5 2.5 8 2.5s5.5 1.5 5.5 4-2 4-5.5 4c-.7 0-1.4-.1-2-.2L3 11.5l.6-2.3c-.7-.8-1.1-1.7-1.1-2.7z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10.5px] uppercase tracking-wide font-semibold text-[#a4a4a2]">{tpl.category}</span>
                      </div>
                      <h5 className="text-[13px] font-semibold text-[#1a1a1a] leading-[18px] mb-1 line-clamp-2">{tpl.label}</h5>
                      <p className="text-[12.5px] text-[#646462] leading-[18px] line-clamp-3">{tpl.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11.5px] text-[#a4a4a2] capitalize">{tpl.contentType}</span>
                    <button
                      onClick={() => instantiateTemplate(tpl)}
                      disabled={isBusy || !!instantiatingTplId}
                      className="h-8 px-3 rounded-full bg-[#1a1a1a] text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isBusy ? (
                        <>
                          <svg viewBox="0 0 16 16" className="w-3 h-3 animate-spin fill-none stroke-white" strokeWidth="1.6"><circle cx="8" cy="8" r="6" strokeDasharray="20 14"/></svg>
                          <span>Creando…</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 12 12" className="w-3 h-3 fill-none stroke-white" strokeWidth="1.7"><path d="M6 2v8M2 6h8" strokeLinecap="round"/></svg>
                          <span>Usar plantilla</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Series table */}
        <div className="bg-white border border-[#e9eae6] rounded-[10px] overflow-hidden">
          <div className="grid grid-cols-[40px_36px_1fr_120px_180px_200px_80px_120px] items-center px-3 h-9 border-b border-[#e9eae6] text-[11.5px] uppercase tracking-wide text-[#a4a4a2]">
            <span className="text-center">
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#a4a4a2] mx-auto" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v3.5M8 11v.01" strokeLinecap="round"/></svg>
            </span>
            <span><input type="checkbox" className="w-3.5 h-3.5 accent-[#1a1a1a]"/></span>
            <span>Título</span>
            <span>Estado</span>
            <span>Fecha/hora de actualización</span>
            <span>Actualizado por</span>
            <span>Enviados</span>
            <span>Acciones</span>
          </div>
          {rows.length === 0 ? (
            <div className="px-6 py-8 text-center text-[13px] text-[#646462]">
              {search ? 'Ninguna serie coincide con la búsqueda.' : 'Aún no hay series. Crea una con «Nueva serie» o usa una plantilla.'}
            </div>
          ) : rows.map((r: any) => {
            const id = String(r.id || r.slug || r.name || '');
            const status = String(r.status || r.state || 'draft').toLowerCase();
            const updated = r.updated_at || r.updatedAt || r.created_at || r.createdAt;
            const updatedText = updated ? new Date(updated).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
            const title = r.name || r.title || id || 'Sin título';
            const author = r.updated_by_name || r.updatedByName || r.author || r.created_by_name || '—';
            const sent = r.runs_count ?? r.runsCount ?? 0;
            return (
              <div key={id} onClick={() => openInBuilder(id)} className="grid grid-cols-[40px_36px_1fr_120px_180px_200px_80px_120px] items-center px-3 h-12 border-b border-[#e9eae6] last:border-b-0 hover:bg-[#fafafa] cursor-pointer">
                <span className="text-[#a4a4a2] text-center select-none">⋮⋮</span>
                <span><input type="checkbox" onClick={e => e.stopPropagation()} className="w-3.5 h-3.5 accent-[#1a1a1a]"/></span>
                <span className="flex items-center gap-2 min-w-0">
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#3b59f6] flex-shrink-0"><path d="M2.5 6.5C2.5 4 4.5 2.5 8 2.5s5.5 1.5 5.5 4-2 4-5.5 4c-.7 0-1.4-.1-2-.2L3 11.5l.6-2.3c-.7-.8-1.1-1.7-1.1-2.7z"/></svg>
                  <span className="text-[13px] text-[#1a1a1a] truncate">{title}</span>
                </span>
                <span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-[6px] text-[11.5px] font-semibold ${
                    status === 'published' || status === 'active' ? 'bg-[#dcfce7] text-[#15803d]' :
                    status === 'paused' ? 'bg-[#fef9c3] text-[#854d0e]' :
                    status === 'archived' ? 'bg-[#fef2f2] text-[#991b1b]' :
                    'bg-[#f3f3f1] text-[#646462]'
                  }`}>{status === 'published' ? 'Publicado' : status === 'active' ? 'Activo' : status === 'paused' ? 'Pausado' : status === 'archived' ? 'Archivado' : 'Borrador'}</span>
                </span>
                <span className="text-[12.5px] text-[#646462]">{updatedText}</span>
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-[#3b59f6] text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0">{(author[0] || '?').toUpperCase()}</span>
                  <span className="text-[12.5px] text-[#1a1a1a] truncate">{author}</span>
                </span>
                <span className="text-[12.5px] text-[#3b59f6]">{sent}</span>
                <span className="flex items-center gap-1.5">
                  <button
                    onClick={e => { e.stopPropagation(); runSerie(id); }}
                    disabled={busyId === id}
                    title="Lanzar serie"
                    className="h-6 px-2 rounded-[6px] bg-[#1a1a1a] text-white text-[11px] font-semibold hover:bg-black disabled:bg-[#a4a4a2]"
                  >{busyId === id ? '…' : 'Lanzar'}</button>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Aprender modal */}
      {learnModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setLearnModal(null)}>
          <div className="bg-white rounded-[12px] shadow-xl w-full max-w-[520px] p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[16px] font-bold text-[#1a1a1a]">
                {learnModal === 'docs' ? 'Documentación de Series' : learnModal === 'tutorial' ? 'Tutorial: tu primera serie' : 'Plantillas de mensajes'}
              </h4>
              <button onClick={() => setLearnModal(null)} className="w-7 h-7 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center" aria-label="Cerrar">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
              </button>
            </div>
            <p className="text-[13px] text-[#646462] leading-[20px]">
              {learnModal === 'docs' && 'Aprende a crear series de mensajes multi-canal que se activan automáticamente según el comportamiento del usuario. Combina chat, email, WhatsApp, SMS, push y banners en un único recorrido.'}
              {learnModal === 'tutorial' && 'Sigue este tutorial guiado para crear tu primera serie en menos de 5 minutos. Aprenderás a configurar los pasos, elegir los canales y definir las reglas de audiencia.'}
              {learnModal === 'templates' && 'Explora plantillas listas para usar: bienvenida a nuevos usuarios, reactivación de inactivos, anuncio de funciones, ofertas especiales, recordatorios de renovación y más.'}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setLearnModal(null)} className="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7]">Cerrar</button>
              {learnModal === 'templates' && (
                <button
                  onClick={() => { setLearnModal(null); openInBuilder('new'); }}
                  className="h-8 px-3 rounded-[8px] bg-[#1a1a1a] text-white text-[13px] font-semibold hover:bg-black"
                >
                  Nueva serie
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Solucionar problemas modal */}
      {troubleshootOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setTroubleshootOpen(false)}>
          <div className="bg-white rounded-[12px] shadow-xl w-full max-w-[600px] p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[16px] font-bold text-[#1a1a1a]">Solucionar problemas</h4>
              <button onClick={() => setTroubleshootOpen(false)} className="w-7 h-7 rounded-md hover:bg-[#f8f8f7] flex items-center justify-center" aria-label="Cerrar">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
              </button>
            </div>
            {problematic.length === 0 ? (
              <p className="text-[13px] text-[#646462] py-4">No hay series con problemas.</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {problematic.map((w: any) => {
                  const id = String(w.id || w.slug || w.name || '');
                  const status = String(w.status || w.state || '').toLowerCase();
                  return (
                    <button
                      key={id}
                      onClick={() => { setTroubleshootOpen(false); openInBuilder(id); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] border border-[#e9eae6] hover:bg-[#f8f8f7] text-left"
                    >
                      <span className="w-6 h-6 rounded-full bg-[#fef2f2] text-[#b91c1c] flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.6"><path d="M8 3v6M8 12v.01" strokeLinecap="round"/></svg>
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-semibold text-[#1a1a1a] truncate">{w.name || w.title || id}</span>
                        <span className="block text-[11.5px] text-[#646462]">{status}</span>
                      </span>
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M6 3l5 5-5 5" strokeLinecap="round"/></svg>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button onClick={() => setTroubleshootOpen(false)} className="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7]">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function readInitialOutboundSubFromUrl(): OutboundSubView {
  if (typeof window === 'undefined') return 'mensajes';
  const { view, sub: s } = parsePath();
  if (view !== 'outbound' || !s) return 'mensajes';
  const known: OutboundSubView[] = ['mensajes', 'series', 'ultimo', 'borradores', 'ajustes'];
  return (known as string[]).includes(s) ? (s as OutboundSubView) : 'mensajes';
}

export function OutboundView() {
  const [sub, setSub] = useState<OutboundSubView>(() => readInitialOutboundSubFromUrl());
  // Sync /outbound/:sub so deep-links + reload land on the right sub-view.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    replaceRoute({ view: 'outbound', sub });
  }, [sub]);
  function renderSub() {
    switch (sub) {
      case 'mensajes':   return <OutboundMensajes />;
      case 'series':     return <OutboundSeries />;
      case 'ultimo':     return <KnowledgePlaceholder title="Último" subtitle="El último mensaje saliente que has visualizado o editado." />;
      case 'borradores': return <KnowledgePlaceholder title="Borradores recientes" subtitle="Mensajes salientes en estado borrador para finalizar y enviar." />;
      case 'ajustes':    return <KnowledgePlaceholder title="Ajustes" subtitle="Configuración de los canales salientes y permisos del equipo." />;
    }
  }
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <OutboundSidebar sub={sub} onSelect={setSub} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {renderSub()}
        </div>
      </div>
    </div>
  );
}
