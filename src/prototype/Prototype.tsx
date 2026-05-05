// ─────────────────────────────────────────────────────────────────────────────
// Unified prototype – Inbox + Contacts (connected screens)
// Navigate via the left-nav icons. All assets from Figma CDN (7-day TTL).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';

type View = 'inbox' | 'contacts' | 'allLeads' | 'settings' | 'imports' | 'personal' | 'security' | 'notifications' | 'visible' | 'tokens' | 'accountAccess' | 'multilingual' | 'assignments' | 'macros' | 'tickets' | 'sla' | 'aiInbox' | 'automation' | 'appStore' | 'connectors' | 'labels' | 'people' | 'fin' | 'knowledge' | 'reports' | 'outbound';

// ── Shared icon constants ─────────────────────────────────────────────────────
// Figma desktop MCP assets (extracted node-by-node for 100% fidelity)
const IMG_SLA_BANNER     = "http://localhost:3845/assets/b19e591362b8c4de77f19587d881d94b1042678b.png";
const IMG_TICKETS_PORTAL = "http://localhost:3845/assets/6971188673fd3013af5484de1fa365316c0b94cc.png";

const ICON_INBOX      = "https://www.figma.com/api/mcp/asset/210fe23a-321b-4e1f-8a00-dce6a7ba2224";
const ICON_FIN        = "https://www.figma.com/api/mcp/asset/570eff6a-8bff-4de1-8840-e6b108abdaef";
const ICON_KNOWLEDGE  = "https://www.figma.com/api/mcp/asset/39d9a7c0-cb9e-4d44-ab69-82d4a69df5ec";
const ICON_REPORTS    = "https://www.figma.com/api/mcp/asset/eb0b09a0-b9cb-47d5-a21b-1b8e674f7a07";
const ICON_OUTBOUND   = "https://www.figma.com/api/mcp/asset/4943ae31-0a7f-4f9e-b7f1-531cb824672b";
const ICON_CONTACTS   = "https://www.figma.com/api/mcp/asset/ac85e608-1800-4a92-888b-a0736c0ad1cb";
const ICON_SETUP      = "https://www.figma.com/api/mcp/asset/03ddd5ca-ae84-45f0-b396-13623cda163d";
const ICON_SEARCH     = "https://www.figma.com/api/mcp/asset/157d21c6-472b-4644-b914-342f6f402379";
const ICON_SETTINGS   = "https://www.figma.com/api/mcp/asset/0c20b532-867a-4850-94e0-76c877557291";
const AVATAR_ME       = "https://www.figma.com/api/mcp/asset/fdbcb0bb-66a3-46e8-8cef-98ab237005fb";
const ICON_SEARCH2    = "https://www.figma.com/api/mcp/asset/7ae31e0e-7c64-4d74-88eb-26fec615c318";
const ICON_MENTION    = "https://www.figma.com/api/mcp/asset/5cdb4ac9-f6f6-429c-9e37-1b69d5354f61";
const ICON_CREATED    = "https://www.figma.com/api/mcp/asset/6d8fae1a-f24a-4f06-b7f6-e9a13607c786";
const ICON_ALL        = "https://www.figma.com/api/mcp/asset/a8ea4e88-c431-466f-aeaa-409fbd2d279b";
const ICON_UNASSIGNED = "https://www.figma.com/api/mcp/asset/d4ce9938-4911-4591-b203-51c5e9f5e29a";
const ICON_SPAM       = "https://www.figma.com/api/mcp/asset/670c2105-4750-43a3-92ca-4a987cd622b9";
const ICON_DASHBOARD  = "https://www.figma.com/api/mcp/asset/52a63b14-d63b-40b9-ac9e-c938980a6422";
const ICON_FIN_SVC    = "https://www.figma.com/api/mcp/asset/a6fd2023-c8b4-4e74-ba64-68f8d2ead3eb";
const ICON_RESOLVED   = "https://www.figma.com/api/mcp/asset/b3e474e4-d852-436a-851e-ac6b02f7a31e";
const ICON_ESCALATED  = "https://www.figma.com/api/mcp/asset/3378a1db-91fb-4b6c-ad65-90f00593a553";
const ICON_PENDING    = "https://www.figma.com/api/mcp/asset/dce15ce7-404d-42aa-8379-335096edcd6d";
const ICON_MESSENGER  = "https://www.figma.com/api/mcp/asset/58cb798a-ce4d-44df-b7a5-810ba9c4b86f";
const ICON_EMAIL2     = "https://www.figma.com/api/mcp/asset/d5136408-62d4-4975-a210-37e8ef5fd8f8";
const ICON_WHATSAPP2  = "https://www.figma.com/api/mcp/asset/9b827e1b-1423-4423-8fa2-384c229ddaee";
const ICON_PHONE2     = "https://www.figma.com/api/mcp/asset/9d438d3d-3f29-4cdc-9f7b-dc978c121c27";
const ICON_TICKETS    = "https://www.figma.com/api/mcp/asset/1920c81c-1015-4c31-ba53-88064a8b4b07";
const ICON_MANAGE     = "https://www.figma.com/api/mcp/asset/db6eb72f-0b7e-4dfc-a3f8-fa9575c751bf";
const ICON_PLUS       = "https://www.figma.com/api/mcp/asset/ec56a3b5-5680-4188-b2a6-79d8a7f39557";
const ICON_CHEVRON    = "https://www.figma.com/api/mcp/asset/9840147a-dd4b-40b5-86c8-666ae1fec2be";
const ICON_FILTER     = "https://www.figma.com/api/mcp/asset/fa2f16b4-f842-4096-9371-1423c279eaf7";
const ICON_SORT       = "https://www.figma.com/api/mcp/asset/e18e5357-7864-43c2-8a2f-46d5aad4d937";

// Contacts-only icons
const ICON_PERSONAS   = "https://www.figma.com/api/mcp/asset/9944ae63-0c70-40e0-a9c4-d91a3113c832";
const ICON_BACK       = "https://www.figma.com/api/mcp/asset/7dc3bd9c-a229-4a26-b8e9-f08d905b4a47";
const ICON_LEARN      = "https://www.figma.com/api/mcp/asset/33253a6c-8a27-43f1-bc06-f9148e9032c6";
const ICON_NEW_USER   = "https://www.figma.com/api/mcp/asset/7fa3313c-824f-4246-b2fe-0c4f34180fcf";
const ICON_BULLET_1   = "https://www.figma.com/api/mcp/asset/9d0a580a-7c6e-4fe1-8318-746ec83f4737";
const ICON_BULLET_2   = "https://www.figma.com/api/mcp/asset/751ec081-7354-4359-bec0-73ce5e1d3390";
const ICON_BULLET_3   = "https://www.figma.com/api/mcp/asset/5b02e022-8147-4a69-94bf-162a04fcc08e";
const ICON_BULLET_4   = "https://www.figma.com/api/mcp/asset/19e88eef-a848-4b2c-8e39-722bd297d0a1";
const IMG_ILLUSTRATION = "https://www.figma.com/api/mcp/asset/47dae20e-791e-4f5e-a746-2149e4c4ff84";
const ICON_CLOSE      = "https://www.figma.com/api/mcp/asset/d8062253-7355-45d3-aeb0-c11e1433034b";
const ICON_MSG        = "https://www.figma.com/api/mcp/asset/5e9fa183-e5d4-4784-9632-1c8129c585eb";
const ICON_TAG        = "https://www.figma.com/api/mcp/asset/672fd307-8130-4af8-b8bc-a6c4f962f18e";

// Imports view icons
const ICON_IMPORTS_BOOK = "https://www.figma.com/api/mcp/asset/178d55cb-4ebc-49fb-9baa-a49414740a8b";
const ICON_IMPORTS_LINK = "https://www.figma.com/api/mcp/asset/f1221654-f82e-48c1-b815-c76b92533d41";

// All leads view icons (from Figma node 1-129614)
const IMG_ILLUSTRATION_LEADS = "https://www.figma.com/api/mcp/asset/9992260d-fc93-45da-8041-9bf492e2a91e";
const ICON_BULLET_BOOK       = "https://www.figma.com/api/mcp/asset/ade3351e-410d-49bc-a239-4761e066cfd1";
const ICON_BULLET_LINK       = "https://www.figma.com/api/mcp/asset/5d719730-7650-470e-b0aa-05bdda0aaa75";
const ICON_LEADS_CHIP        = "https://www.figma.com/api/mcp/asset/4ae1f85e-c01e-492a-9d98-e38d78a18fd5";
const ICON_ADD_FILTER        = "https://www.figma.com/api/mcp/asset/5ad40e54-9835-4f98-8a23-34acbdd98f50";
const ICON_MSG_LEADS         = "https://www.figma.com/api/mcp/asset/eaa1e146-6d33-4f6a-a98f-64d387704809";
const ICON_VIEW_COLS         = "https://www.figma.com/api/mcp/asset/b51e7d69-dce1-476a-a20c-b1fde9362e56";
const ICON_VIEW_GRID         = "https://www.figma.com/api/mcp/asset/eb711871-a7d7-4820-b23b-15f2f95a5b45";
const ICON_VIEW_LIST         = "https://www.figma.com/api/mcp/asset/9924fb9d-460f-41ea-bd60-3ab95a56d81a";
const ICON_INFO              = "https://www.figma.com/api/mcp/asset/fad4bccf-740b-4bc6-a4d4-3de338b2f2ff";
const ICON_EMPTY_STATE       = "https://www.figma.com/api/mcp/asset/29703bc6-2e1c-4a25-9fd1-6d65c5544121";

// ── Shared: Left Nav ──────────────────────────────────────────────────────────
function LeftNav({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const isContacts = view === 'contacts' || view === 'allLeads';
  const isSettings = view === 'settings' || view === 'imports' || view === 'personal' || view === 'security' || view === 'notifications' || view === 'visible' || view === 'tokens' || view === 'accountAccess' || view === 'multilingual' || view === 'assignments' || view === 'macros' || view === 'tickets' || view === 'sla' || view === 'aiInbox' || view === 'automation' || view === 'appStore' || view === 'connectors' || view === 'labels' || view === 'people';
  const isActive = (v: View) => view === v;

  function NavBtn({ nav, icon, label, badge }: { nav: View; icon: string; label: string; badge?: number }) {
    const active = nav === 'contacts' ? isContacts : nav === 'settings' ? isSettings : isActive(nav);
    return (
      <div className="relative w-full">
        <button
          onClick={() => onNavigate(nav)}
          title={label}
          className={`w-full h-8 flex items-center justify-center rounded-lg relative ${
            active ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]" : "hover:bg-white/60"
          }`}
        >
          <img src={icon} alt={label} className="w-4 h-4" />
          {badge !== undefined && active && (
            <span className="absolute -top-2 -right-2 bg-[#ffccb2] border border-white rounded-full min-w-[15px] h-[15px] flex items-center justify-center text-[11px] font-bold text-[#1a1a1a] px-1">
              {badge}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-[44px] pt-5 pb-2 bg-[#f3f3f1] rounded-tr-2xl rounded-br-2xl justify-between flex-shrink-0">
      <div className="flex flex-col gap-4 items-center">
        <div className="flex items-center justify-center w-9 h-9 mb-1">
          <img src={ICON_INBOX} alt="" className="w-6 h-6" />
        </div>
        <div className="flex flex-col gap-1 items-start w-full px-1.5">
          <NavBtn nav="inbox"     icon={ICON_INBOX}    label="Inbox"       badge={4} />
          <NavBtn nav="fin"       icon={ICON_FIN}      label="Fin" />
          <NavBtn nav="knowledge" icon={ICON_KNOWLEDGE} label="Knowledge" />
          <NavBtn nav="reports"   icon={ICON_REPORTS}  label="Reports" />
          <NavBtn nav="outbound"  icon={ICON_OUTBOUND} label="Outbound" />
          <NavBtn nav="contacts"  icon={ICON_CONTACTS} label="Contactos" />
          <NavBtn nav="settings"  icon={ICON_SETUP}    label="Ajustes" />
        </div>
      </div>

      <div className="flex flex-col gap-1 items-start w-full px-1.5 pb-1">
        <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60">
          <img src={ICON_SEARCH} alt="" className="w-4 h-4" />
        </button>
        <button
          onClick={() => onNavigate('settings')}
          className={`w-full h-8 flex items-center justify-center rounded-lg ${isSettings ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]" : "hover:bg-white/60"}`}
        >
          <img src={ICON_SETTINGS} alt="" className="w-4 h-4" />
        </button>
        <button
          onClick={() => onNavigate('personal')}
          className="w-full h-8 flex items-center justify-center"
        >
          <div className="relative w-4 h-4 rounded-lg overflow-hidden bg-[#f8f8f7]">
            <img src={AVATAR_ME} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute bottom-[-2px] right-[-2px] w-[7px] h-[7px] bg-[#158613] rounded-[3.6px] border border-white" />
          </div>
        </button>
      </div>
    </div>
  );
}

// ── Shared: Trial Banner ──────────────────────────────────────────────────────
function TrialBanner() {
  return (
    <div className="flex items-center justify-between bg-[#e7e2fd] border border-[#b09efa] rounded-2xl px-4 py-[9px] flex-shrink-0 mx-0">
      <p className="text-[14px] text-[#1a1a1a]">
        Quedan <strong>14 días</strong> en tu{" "}
        <span className="underline">prueba de Advanced</span>. Incluye uso ilimitado de Fin.
      </p>
      <div className="flex items-center gap-2">
        <button className="text-[14px] font-semibold text-[#1a1a1a] px-3 py-[7px] rounded-full hover:bg-white/40">
          Solicita un descuento del 93 % en la Early Stage.
        </button>
        <button className="text-[14px] font-semibold text-white bg-[#222] px-3 py-[7px] rounded-full hover:bg-[#444]">
          Comprar Intercom
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INBOX VIEW
// ─────────────────────────────────────────────────────────────────────────────

function SidebarNavItem({
  icon, label, count, active = false, onClick,
}: { icon: string; label: string; count?: number; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left ${
        active
          ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]"
          : "hover:bg-[#e9eae6]/40 text-[#1a1a1a]"
      }`}
    >
      <div className="flex items-center justify-center w-[18px] h-[18px] flex-shrink-0">
        <img src={icon} alt="" className="w-4 h-4" />
      </div>
      <span className="flex-1 leading-4">{label}</span>
      {count !== undefined && (
        <span className="text-[#646462] text-[13px]">{count}</span>
      )}
    </button>
  );
}

function InboxSidebar() {
  const [active, setActive] = useState('inbox');
  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Inbox</span>
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]">
          <img src={ICON_PLUS} alt="+" className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pl-3 pr-0 pb-4">
        <div className="flex flex-col gap-0.5">
          <SidebarNavItem icon={ICON_SEARCH2} label="Buscar" active={active === 'search'} onClick={() => setActive('search')} />
          <SidebarNavItem icon={AVATAR_ME} label="Tu bandeja de entrada" count={4} active={active === 'inbox'} onClick={() => setActive('inbox')} />
          <SidebarNavItem icon={ICON_MENTION} label="Menciones" count={0} active={active === 'mentions'} onClick={() => setActive('mentions')} />
          <SidebarNavItem icon={ICON_CREATED} label="Creado por ti" count={0} active={active === 'created'} onClick={() => setActive('created')} />
          <SidebarNavItem icon={ICON_ALL} label="Todo" count={4} active={active === 'all'} onClick={() => setActive('all')} />
          <SidebarNavItem icon={ICON_UNASSIGNED} label="Sin asignar" count={0} active={active === 'unassigned'} onClick={() => setActive('unassigned')} />
          <SidebarNavItem icon={ICON_SPAM} label="Correo no deseado" count={0} active={active === 'spam'} onClick={() => setActive('spam')} />
          <SidebarNavItem icon={ICON_DASHBOARD} label="Tablero" active={active === 'dashboard'} onClick={() => setActive('dashboard')} />
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between h-8 px-3 cursor-pointer">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Fin para servicio</span>
            <div className="flex items-center gap-1">
              <button className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)]">
                <img src={ICON_PLUS} alt="+" className="w-4 h-4" />
              </button>
              <button className="w-5 h-4 flex items-center justify-center">
                <img src={ICON_CHEVRON} alt="" className="w-4 h-4 rotate-90" />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 pl-1">
            <SidebarNavItem icon={ICON_FIN_SVC} label="Todas las conversaciones" active={active === 'fin-all'} onClick={() => setActive('fin-all')} />
            <SidebarNavItem icon={ICON_RESOLVED} label="Resuelto" active={active === 'fin-resolved'} onClick={() => setActive('fin-resolved')} />
            <SidebarNavItem icon={ICON_ESCALATED} label="Escalado y transferencia" active={active === 'fin-escalated'} onClick={() => setActive('fin-escalated')} />
            <SidebarNavItem icon={ICON_PENDING} label="Pendiente" active={active === 'fin-pending'} onClick={() => setActive('fin-pending')} />
            <SidebarNavItem icon={ICON_SPAM} label="Correo no deseado" active={active === 'fin-spam'} onClick={() => setActive('fin-spam')} />
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between h-8 px-3 cursor-pointer group">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Inbox para el equipo</span>
            <div className="flex items-center gap-1">
              <button className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)] hover:bg-[#f8f8f7]">
                <img src={ICON_PLUS} alt="+" className="w-4 h-4" />
              </button>
              <button className="w-5 h-4 flex items-center justify-center opacity-20">
                <img src={ICON_CHEVRON} alt="" className="w-4 h-4 rotate-90" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-1">
          <div className="flex items-center justify-between h-8 px-3 cursor-pointer group">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Compañeros de equipo</span>
            <div className="flex items-center gap-1">
              <button className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)] hover:bg-[#f8f8f7]">
                <img src={ICON_PLUS} alt="+" className="w-4 h-4" />
              </button>
              <button className="w-5 h-4 flex items-center justify-center opacity-20">
                <img src={ICON_CHEVRON} alt="" className="w-4 h-4 rotate-90" />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-1">
          <div className="flex items-center justify-between h-8 px-3 cursor-pointer">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Vistas</span>
            <button className="w-5 h-4 flex items-center justify-center">
              <img src={ICON_CHEVRON} alt="" className="w-4 h-4 rotate-90" />
            </button>
          </div>
          <div className="flex flex-col gap-0.5 pl-1">
            <SidebarNavItem icon={ICON_MESSENGER} label="Messenger" count={1} active={active === 'v-messenger'} onClick={() => setActive('v-messenger')} />
            <SidebarNavItem icon={ICON_EMAIL2} label="Email" count={1} active={active === 'v-email'} onClick={() => setActive('v-email')} />
            <SidebarNavItem icon={ICON_WHATSAPP2} label="WhatsApp & Social" count={1} active={active === 'v-whatsapp'} onClick={() => setActive('v-whatsapp')} />
            <SidebarNavItem icon={ICON_PHONE2} label="Phone & SMS" count={1} active={active === 'v-phone'} onClick={() => setActive('v-phone')} />
            <SidebarNavItem icon={ICON_TICKETS} label="Tickets" count={0} active={active === 'v-tickets'} onClick={() => setActive('v-tickets')} />
          </div>
        </div>

        <div className="mt-4 border-t border-[#e9eae6] pt-2">
          <button className="flex items-center gap-2 h-8 px-3 rounded-lg hover:bg-[#e9eae6]/40 w-full cursor-pointer">
            <img src={ICON_MANAGE} alt="" className="w-4 h-4" />
            <span className="text-[14px] font-semibold text-[#1a1a1a]">Administrar</span>
          </button>
        </div>
      </div>
    </div>
  );
}

type Conversation = { id: string; channel: string; preview: string; time: string; avatarColor: string; avatarLetter: string; active?: boolean };
const conversations: Conversation[] = [
  { id: "1", channel: "Messenger · [Demo]", preview: "Install Messenger", time: "4 min", avatarColor: "#9ec5fa", avatarLetter: "M", active: true },
  { id: "2", channel: "Email · [Demo]", preview: "This is a demo email. It", time: "4 min", avatarColor: "#85e0d9", avatarLetter: "E" },
  { id: "3", channel: "WhatsApp · [Demo]", preview: "Set up WhatsApp or so", time: "4 min", avatarColor: "#61d65c", avatarLetter: "W" },
  { id: "4", channel: "Phone · [Demo]", preview: "Set up phone or SMS", time: "4 min", avatarColor: "#85e0d9", avatarLetter: "P" },
];

function ConversationCard({ conv, isSelected, onSelect }: { conv: Conversation; isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`relative flex items-start gap-2 px-3 py-3 rounded-xl cursor-pointer w-full text-left ${
        isSelected ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]" : "hover:bg-white/60"
      }`}
    >
      <div className="w-6 h-6 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: conv.avatarColor }}>
        <span className="text-[12px] font-semibold text-[#1a1a1a] uppercase">{conv.avatarLetter}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[13px] truncate ${isSelected ? "font-semibold text-[#646462]" : "font-bold text-[#1a1a1a]"}`}>
            {conv.channel}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-[13px] truncate ${isSelected ? "text-[#646462]" : "text-[#1a1a1a]"}`}>{conv.preview}</span>
          <span className="text-[13px] text-[#646462] flex-shrink-0 ml-2">{conv.time}</span>
        </div>
      </div>
    </button>
  );
}

function ConversationList({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col h-full w-[271px] border-l border-[#e9eae6] bg-[#f8f8f7] flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-4 h-16 sticky top-0">
        <div className="flex items-center gap-2">
          <div className="relative w-4 h-4 rounded-lg overflow-hidden bg-[#f8f8f7]">
            <img src={AVATAR_ME} alt="" className="absolute inset-0 w-full h-full object-cover" />
          </div>
          <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Hector Vidal Sanchez</span>
        </div>
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]">
          <img src={ICON_SEARCH2} alt="" className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0">
        <button className="bg-white border border-[#e9eae6] text-[13px] font-semibold text-[#1a1a1a] px-[9px] py-[5px] rounded-full">
          4 Abierta
        </button>
        <div className="flex items-center gap-1">
          <button className="bg-white border border-[#e9eae6] text-[13px] font-semibold text-[#1a1a1a] px-[9px] py-[5px] rounded-full">
            Última actividad
          </button>
          <button className="bg-white border border-[#e9eae6] w-6 h-6 flex items-center justify-center rounded-full">
            <img src={ICON_FILTER} alt="" className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-16 flex flex-col gap-0">
        {conversations.map((conv, i) => (
          <div key={conv.id}>
            {i > 0 && <div className="flex justify-center py-0.5"><div className="w-[222px] h-[1px] bg-[#f8f8f7]" /></div>}
            <ConversationCard conv={conv} isSelected={conv.id === selectedId} onSelect={() => onSelect(conv.id)} />
          </div>
        ))}
      </div>

      <div className="absolute bottom-4 left-6 bg-white border border-[#e9eae6] rounded-full shadow-[0px_8px_8px_rgba(20,20,20,0.15)] flex items-center gap-1 p-[5px]">
        <button className="bg-[#f8f8f7] rounded-full px-3 py-2"><img src={ICON_FILTER} alt="" className="w-4 h-4" /></button>
        <button className="rounded-full px-3 py-2"><img src={ICON_SORT} alt="" className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

type Message = { id: string; from: "user" | "agent" | "bot"; text: string; time: string; senderName?: string };
const messages: Message[] = [
  { id: "1", from: "bot", text: "Hola, soy Fin, el agente de IA de Intercom. Puedo responder preguntas sobre productos, precios, y más. ¿En qué puedo ayudarte hoy?", time: "hace 4 min", senderName: "Fin" },
  { id: "2", from: "user", text: "Install Messenger", time: "hace 4 min" },
  { id: "3", from: "bot", text: "Para instalar el Messenger de Intercom en tu sitio web, ve a Configuración > Messenger > Instalar y sigue las instrucciones paso a paso. Si necesitas ayuda adicional, puedo conectarte con un agente.", time: "hace 4 min", senderName: "Fin" },
];

function ChatMessage({ msg }: { msg: Message }) {
  const isUser = msg.from === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "items-end gap-2"} mb-3`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-xl bg-[#9ec5fa] flex items-center justify-center flex-shrink-0">
          <span className="text-[12px] font-semibold text-[#1a1a1a]">F</span>
        </div>
      )}
      <div className={`max-w-[380px] px-4 py-4 rounded-xl text-[14px] leading-[20px] bg-[#f8f8f7] text-[#1a1a1a] ${isUser ? "rounded-br-sm" : "rounded-bl-sm"}`}>
        {msg.senderName && <p className="text-[12px] font-semibold text-[#646462] mb-1">{msg.senderName}</p>}
        <p>{msg.text}</p>
        <p className="text-[11px] text-[#646462] mt-2 text-right">{msg.time}</p>
      </div>
    </div>
  );
}

function ConversationPanel({ selectedConv }: { selectedConv: Conversation }) {
  const [replyTab, setReplyTab] = useState<'responder' | 'nota' | 'datosIA'>('responder');
  const [replyText, setReplyText] = useState('');

  const channelLabel = selectedConv.channel.split('·')[0].trim();

  return (
    <div className="flex flex-col h-full flex-1 min-w-[400px] bg-white rounded-2xl shadow-[0px_1px_2px_rgba(20,20,20,0.15)] overflow-hidden">
      <div className="flex flex-col gap-4 pt-4 flex-shrink-0">
        <div className="flex items-center px-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a] truncate">{channelLabel}</h2>
          </div>
          <div className="flex items-center gap-1">
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]">
              <img src={ICON_SEARCH2} alt="" className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#e7e2fd] border border-[#c6c9c0] hover:bg-[#d4cffb]">
              <img src={ICON_FIN} alt="" className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]">
              <img src={ICON_KNOWLEDGE} alt="" className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]">
              <img src={ICON_REPORTS} alt="" className="w-4 h-4" />
            </button>
            <button className="h-8 px-4 bg-[#222] text-white text-[13px] font-semibold rounded-full hover:bg-[#444] flex items-center gap-1">
              <img src={ICON_RESOLVED} alt="" className="w-4 h-4 invert" />
              <span>Resolver</span>
            </button>
          </div>
        </div>
        <div className="h-[1px] bg-[#e9eae6]" />
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-4">
        {messages.map((msg) => <ChatMessage key={msg.id} msg={msg} />)}
        <div className="bg-[#f8f8f7] rounded-2xl p-4 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-[#9ec5fa] flex items-center justify-center">
              <span className="text-[10px] font-bold text-[#1a1a1a]">F</span>
            </div>
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Fin</span>
            <span className="text-[12px] text-[#646462]">· Resumen de la IA</span>
          </div>
          <p className="text-[13px] text-[#1a1a1a] leading-5">
            El cliente quiere instalar el Messenger de Intercom en su sitio web. Fin proporcionó instrucciones de instalación estándar.
          </p>
        </div>
      </div>

      <div className="border-t border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-4 px-4 pt-3">
          {([['responder', 'Responder'], ['nota', 'Nota interna'], ['datosIA', 'Datos de la IA']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setReplyTab(id)}
              className={`text-[13px] pb-1 ${replyTab === id ? 'font-semibold text-[#1a1a1a] border-b-2 border-[#1a1a1a]' : 'text-[#646462] hover:text-[#1a1a1a]'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="px-4 py-3">
          {replyTab === 'datosIA' ? (
            <div className="border border-[#e9eae6] rounded-2xl p-4 text-[13px] text-[#646462]">
              <p className="font-semibold text-[#1a1a1a] mb-2">Datos de IA de esta conversación</p>
              <p>Canal: {channelLabel}</p>
              <p className="mt-1">Resolución estimada: 2 min</p>
              <p className="mt-1">Intención detectada: Instalación de producto</p>
            </div>
          ) : (
            <div className={`border rounded-2xl overflow-hidden ${replyTab === 'nota' ? 'border-[#fde68a] bg-[#fffbeb]' : 'border-[#e9eae6]'}`}>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={replyTab === 'nota' ? 'Escribe una nota interna…' : `Escribe un mensaje a ${selectedConv.avatarLetter}ector...`}
                className="w-full px-4 py-3 min-h-[80px] text-[14px] text-[#1a1a1a] bg-transparent resize-none focus:outline-none placeholder:text-[#646462]"
              />
              <div className="flex items-center justify-between px-3 py-2 border-t border-[#e9eae6]">
                <div className="flex items-center gap-1">
                  {[ICON_FIN, ICON_KNOWLEDGE, ICON_REPORTS, ICON_OUTBOUND, ICON_CONTACTS].map((icon, i) => (
                    <button key={i} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f8f8f7]">
                      <img src={icon} alt="" className="w-4 h-4" />
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setReplyText('')}
                  className="h-7 px-4 bg-[#222] text-white text-[13px] font-semibold rounded-full hover:bg-[#444]"
                >
                  Enviar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center h-8 w-full">
      <span className="w-[113px] flex-shrink-0 text-[13px] text-[#646462] truncate">{label}</span>
      <div className="flex-1 px-1">
        <span className="text-[13px] text-[#1a1a1a] truncate block">{value}</span>
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#e9eae6] pb-3">
      <button className="flex items-center justify-between w-full h-8 px-6 py-2 hover:bg-[#f8f8f7]">
        <span className="text-[13px] font-semibold text-[#1a1a1a]">{title}</span>
        <img src={ICON_CHEVRON} alt="" className="w-4 h-4 rotate-90 opacity-50" />
      </button>
      <div className="px-6">{children}</div>
    </div>
  );
}

function DetailsSidebar({ selectedConv }: { selectedConv: Conversation }) {
  const [activeTab, setActiveTab] = useState<'detalles' | 'actividad' | 'conversaciones'>('detalles');

  const channelName = selectedConv.channel.split('·')[0].trim();

  return (
    <div className="flex flex-col h-full w-[346px] bg-white rounded-2xl shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] flex-shrink-0 overflow-hidden">
      <div className="flex items-center border-b border-[#e9eae6] px-4 flex-shrink-0">
        {([['detalles', 'Detalles'], ['actividad', 'Actividad'], ['conversaciones', 'Conversaciones']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`text-[13px] h-10 px-2 mr-2 ${activeTab === id ? 'font-semibold text-[#1a1a1a] border-b-2 border-[#1a1a1a]' : 'text-[#646462] hover:text-[#1a1a1a]'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'detalles' && <>
          <DetailSection title="Detalles de la conversación">
            <DetailRow label="Persona asignada" value="Hector Vidal Sanchez" />
            <DetailRow label="Equipo asignado" value="Sin asignar" />
            <DetailRow label="Estado" value="Abierta" />
            <DetailRow label="Canal" value={channelName} />
            <DetailRow label="Prioridad" value="Sin prioridad" />
            <DetailRow label="Etiquetas" value="Añadir etiqueta..." />
          </DetailSection>
          <DetailSection title="Usuario">
            <div className="flex items-center gap-2 py-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: selectedConv.avatarColor }}>
                <span className="text-[14px] font-semibold text-[#1a1a1a]">{selectedConv.avatarLetter}</span>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#1a1a1a]">Visitante anónimo</p>
                <p className="text-[12px] text-[#646462]">Nunca visto antes</p>
              </div>
            </div>
            <DetailRow label="Correo" value="Sin correo" />
            <DetailRow label="Localización" value="España" />
            <DetailRow label="Idioma" value="Español" />
            <DetailRow label="Zona horaria" value="Europe/Madrid" />
            <DetailRow label="Creado" value="Hace 4 minutos" />
          </DetailSection>
          <DetailSection title="Empresa">
            <p className="text-[13px] text-[#646462] py-2">Sin empresa asociada</p>
          </DetailSection>
          <DetailSection title="Atributos de conversación">
            <DetailRow label="ID de conversación" value="215474178470870" />
            <DetailRow label="Iniciada" value="Hace 4 min" />
            <DetailRow label="Primer tiempo resp." value="—" />
            <DetailRow label="Tiempo de resolución" value="—" />
          </DetailSection>
          <DetailSection title="Actividad de Fin">
            <div className="py-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded-full bg-[#e7e2fd] flex items-center justify-center">
                  <img src={ICON_FIN} alt="" className="w-3 h-3" />
                </div>
                <span className="text-[13px] font-semibold text-[#1a1a1a]">Fin gestionó esta conversación</span>
              </div>
              <p className="text-[12px] text-[#646462] leading-4">
                Fin proporcionó instrucciones de instalación y cerró la conversación.
              </p>
            </div>
          </DetailSection>
        </>}
        {activeTab === 'actividad' && (
          <div className="px-6 py-4 flex flex-col gap-3">
            <p className="text-[13px] font-semibold text-[#1a1a1a]">Actividad reciente</p>
            {[
              { time: 'Hace 4 min', text: 'Conversación iniciada por visitante anónimo' },
              { time: 'Hace 4 min', text: 'Fin respondió automáticamente' },
              { time: 'Hace 4 min', text: 'Fin cerró la conversación' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#3b59f6] mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] text-[#1a1a1a]">{item.text}</p>
                  <p className="text-[12px] text-[#646462]">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'conversaciones' && (
          <div className="px-6 py-4">
            <p className="text-[13px] font-semibold text-[#1a1a1a] mb-3">Otras conversaciones</p>
            <p className="text-[13px] text-[#646462]">No hay otras conversaciones con este usuario.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function InboxView() {
  const [selectedConvId, setSelectedConvId] = useState('1');
  const selectedConv = conversations.find(c => c.id === selectedConvId) ?? conversations[0];

  return (
    <div className="flex flex-col flex-1 min-w-0 p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <InboxSidebar />
        <div className="relative h-full flex-shrink-0">
          <ConversationList selectedId={selectedConvId} onSelect={setSelectedConvId} />
        </div>
        <div className="flex flex-1 min-w-0 gap-2">
          <ConversationPanel selectedConv={selectedConv} />
          <DetailsSidebar selectedConv={selectedConv} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS VIEW
// ─────────────────────────────────────────────────────────────────────────────

function ContactsSidebar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const activeItem = view === 'allLeads' ? 'allLeads' : 'contacts';

  function SidebarItem({ label, count, itemView, opacity50Count = false }: {
    label: string; count: number; itemView: View; opacity50Count?: boolean;
  }) {
    const isActive = activeItem === itemView;
    return (
      <button
        onClick={() => onNavigate(itemView)}
        className={`flex items-center justify-between w-full px-2 py-[5px] rounded-[8px] ml-2 pl-2 ${
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
    <div className="flex flex-col h-full w-[230px] flex-shrink-0 bg-[#f3f3f1] pt-3 pb-3 px-2 gap-1">
      <div className="flex items-center justify-between px-2 py-1 mb-1">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a] leading-tight">Contactos</span>
        <button className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#f8f8f7] hover:bg-white/60">
          <img src={ICON_SEARCH} alt="" className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 px-2 py-1">
          <img src={ICON_PERSONAS} alt="" className="w-3.5 h-3.5 opacity-50" />
          <span className="text-[12px] font-medium text-[#646462]">Personas:</span>
        </div>
        <SidebarItem label="All users" count={4} itemView="contacts" />
        <SidebarItem label="All leads" count={0} itemView="allLeads" opacity50Count />
        <SidebarItem label="Active" count={4} itemView="contacts" />
        <SidebarItem label="New" count={0} itemView="contacts" opacity50Count />
      </div>

      <div className="h-px bg-[#e9eae6] mx-2 my-1" />

      <div className="flex flex-col gap-0.5">
        <button className="flex items-center justify-between w-full px-2 py-1 rounded-[8px] hover:bg-white/60">
          <span className="text-[12px] font-medium text-[#646462]">Empresas:</span>
          <img src={ICON_CHEVRON} alt="" className="w-3 h-3 opacity-40" />
        </button>
      </div>

      <div className="h-px bg-[#e9eae6] mx-2 my-1" />

      <button className="flex items-center gap-1.5 px-2 py-1 rounded-[8px] hover:bg-white/60 w-full">
        <span className="text-[13px] text-[#1a1a1a]">Conversaciones</span>
      </button>
    </div>
  );
}

function ContactsPageHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#f8f8f7] hover:bg-[#efefed]"
        >
          <img src={ICON_BACK} alt="" className="w-4 h-4" />
        </button>
        <span className="text-[20px] font-semibold text-[#1a1a1a] tracking-[-0.4px]">Active</span>
      </div>
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full pl-[12px] pr-[6px] py-[8px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#efefed]">
          <img src={ICON_LEARN} alt="" className="w-3.5 h-3.5" />
          <span>Aprender</span>
          <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-40" />
        </button>
        <button className="flex items-center gap-1.5 bg-[#222] rounded-full pl-[12px] pr-[6px] py-[8px] text-[13px] font-medium text-[#f8f8f7] hover:bg-[#333]">
          <img src={ICON_NEW_USER} alt="" className="w-3.5 h-3.5" />
          <span>Nuevos usuarios o leads</span>
          <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-60" />
        </button>
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

function UsersTable() {
  const rows = [
    { color: "#61d65c", initial: "E", name: "Email", channel: "en [Demo]", city: "Desconocido" },
    { color: "#85e0d9", initial: "M", name: "Messenger", channel: "en [Demo]", city: "Desconocido" },
    { color: "#b09efa", initial: "P", name: "Phone & SMS", channel: "en [Demo]", city: "Desconocido" },
    { color: "#61d65c", initial: "W", name: "WhatsApp & Social", channel: "en [Demo]", city: "Desconocido" },
  ];
  return (
    <div className="mx-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[18px] font-semibold text-[#1a1a1a]">4 usuarios</span>
          <div className="flex items-center gap-1">
            <button className="flex items-center gap-1.5 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#1a1a1a] hover:bg-[#efefed]">
              <img src={ICON_MSG} alt="" className="w-3.5 h-3.5" /><span>Nuevo mensaje</span>
            </button>
            <button className="flex items-center gap-1.5 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#1a1a1a] hover:bg-[#efefed]">
              <img src={ICON_TAG} alt="" className="w-3.5 h-3.5" /><span>Añadir etiqueta</span>
            </button>
            <button className="flex items-center gap-1 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#1a1a1a] hover:bg-[#efefed]">
              <span>Más</span><img src={ICON_CHEVRON} alt="" className="w-3 h-3 opacity-40" />
            </button>
          </div>
        </div>
        <div className="flex items-center border border-[#e9eae6] rounded-[8px] overflow-hidden">
          <button className="px-2 py-1.5 hover:bg-[#f8f8f7] border-r border-[#e9eae6]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1" fill="#1a1a1a" opacity="0.4"/>
              <rect x="9" y="1" width="6" height="6" rx="1" fill="#1a1a1a" opacity="0.4"/>
              <rect x="1" y="9" width="6" height="6" rx="1" fill="#1a1a1a" opacity="0.4"/>
              <rect x="9" y="9" width="6" height="6" rx="1" fill="#1a1a1a" opacity="0.4"/>
            </svg>
          </button>
          <button className="px-2 py-1.5 bg-white hover:bg-[#f8f8f7]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="#1a1a1a"/>
              <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="#1a1a1a"/>
              <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="#1a1a1a"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between bg-[#f8f8f7] rounded-[6px] px-[15px] py-[10px] border border-[#e9eae6]">
        <span className="text-[13px] text-[#1a1a1a]">
          Exige la verificación de identidad para proteger los datos de tus usuarios.{" "}
          <span className="underline cursor-pointer">Configurar verificación de identidad.</span>
        </span>
        <button className="text-[13px] text-[#646462] ml-4 hover:text-[#1a1a1a] flex-shrink-0">✕</button>
      </div>

      <div className="w-full">
        <div className="flex items-center border-b border-[#e9eae6] pb-2 text-[12px] font-medium text-[#646462]">
          <div className="w-7 flex-shrink-0" />
          <div className="flex-1 min-w-[180px]">Nombre</div>
          <div className="w-[130px] flex-shrink-0 flex items-center gap-1">
            <span className="text-[#e35712]">Last seen</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-60">
              <path d="M5 2L7 5H3L5 2Z" fill="#e35712"/>
              <path d="M5 8L3 5H7L5 8Z" fill="#e35712" opacity="0.4"/>
            </svg>
          </div>
          <div className="w-[90px] flex-shrink-0">Type</div>
          <div className="w-[110px] flex-shrink-0">First seen</div>
          <div className="w-[100px] flex-shrink-0">Signed up</div>
          <div className="w-[100px] flex-shrink-0">Web sessions</div>
          <div className="w-[100px] flex-shrink-0">City</div>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="flex items-center border-b border-[#e9eae6] py-[10px] hover:bg-[#f8f8f7] cursor-pointer">
            <div className="w-7 flex-shrink-0">
              <input type="checkbox" className="w-3.5 h-3.5 rounded border-[#e9eae6]" />
            </div>
            <div className="flex-1 min-w-[180px] flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold text-white flex-shrink-0" style={{ backgroundColor: row.color }}>
                {row.initial}
              </div>
              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-[#1a1a1a]">{row.name}</span>
                <span className="text-[12px] text-[#646462]">{row.channel}</span>
              </div>
            </div>
            <div className="w-[130px] flex-shrink-0 text-[13px] text-[#1a1a1a]">hace 40 minutos</div>
            <div className="w-[90px] flex-shrink-0 text-[13px] text-[#1a1a1a]">Usuario</div>
            <div className="w-[110px] flex-shrink-0 text-[13px] text-[#1a1a1a]">hace 40 min</div>
            <div className="w-[100px] flex-shrink-0 text-[13px] text-[#1a1a1a]">hace 40 min</div>
            <div className="w-[100px] flex-shrink-0 text-[13px] text-[#1a1a1a]">0</div>
            <div className="w-[100px] flex-shrink-0 text-[13px] text-[#646462]">{row.city}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactsView({ view, onNavigate, onBack }: { view: View; onNavigate: (v: View) => void; onBack: () => void }) {
  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden">
      {/* Contacts sidebar panel */}
      <div className="h-full flex-shrink-0 pt-3 pb-3 pl-1">
        <div className="h-full rounded-[16px] overflow-hidden bg-[#fbfbf9] drop-shadow-[0px_1px_2px_rgba(20,20,20,0.15)] w-[230px]">
          <ContactsSidebar view={view} onNavigate={onNavigate} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-[#e7e2fd] border border-[#b09efa] rounded-[10px] mx-4 mt-3 flex-shrink-0">
          <span className="text-[13px] text-[#1a1a1a]">
            Quedan <strong>14 días</strong> en tu prueba de Advanced.{" "}
            <span className="underline cursor-pointer">Explorar planes</span>
          </span>
          <button className="text-[13px] text-[#646462] hover:text-[#1a1a1a]">✕</button>
        </div>
        <ContactsPageHeader onBack={onBack} />
        <div className="flex-1 overflow-y-auto min-h-0">
          <ImportHero />
          <UsersTable />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ALL LEADS VIEW
// ─────────────────────────────────────────────────────────────────────────────

function AllLeadsHero() {
  const bullets = [
    { icon: ICON_BULLET_BOOK, label: "Comienza a usar los contactos" },
    { icon: ICON_BULLET_BOOK, label: "Seguimiento y agrupación de tus clientes" },
    { icon: ICON_BULLET_BOOK, label: "Uso de aplicaciones e integraciones" },
    { icon: ICON_BULLET_LINK, label: "Visita nuestra tienda de aplicaciones" },
  ];
  return (
    <div className="mx-4 mb-0">
      <div className="relative bg-[#f8f8f7] rounded-[12px] overflow-hidden h-[288px] flex">
        <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/5 z-10">
          <img src={ICON_CLOSE} alt="" className="w-3 h-3" />
        </button>
        <div className="flex flex-col justify-center px-12 py-8 flex-1 gap-5">
          <h2 className="text-[20px] font-semibold text-[#1a1a1a] leading-[1.6] max-w-[580px]">
            Importa tus contactos para una experiencia personalizada
          </h2>
          <p className="text-[14px] text-[#1a1a1a] leading-[1.5] max-w-[580px]">
            Ve los perfiles empresariales o de usuario, o segmenta tus contactos según las
            acciones que realicen. Integra con más fuentes de datos en nuestra tienda de
            aplicaciones. Cuando estés listo, comienza a segmentar a tus clientes de manera más
            efectiva con mensajes salientes, Fin AI Agent y flujos de trabajo.
          </p>
          <div className="flex flex-col gap-1">
            {bullets.map((b, i) => (
              <button key={i} className="flex items-center gap-2.5 text-left group px-3 py-1.5 rounded-full hover:bg-black/5">
                <img src={b.icon} alt="" className="w-4 h-4 flex-shrink-0" />
                <span className="text-[14px] font-semibold text-[#1a1a1a] group-hover:text-[#646462]">{b.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center justify-end pr-14 py-6">
          <img src={IMG_ILLUSTRATION_LEADS} alt="" className="h-[240px] w-[388px] object-cover object-left-top" />
        </div>
      </div>
    </div>
  );
}

function AllLeadsTableSection() {
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

function AllLeadsView({ view, onNavigate, onBack }: { view: View; onNavigate: (v: View) => void; onBack: () => void }) {
  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden">
      <div className="h-full flex-shrink-0 pt-3 pb-3 pl-1">
        <div className="h-full rounded-[16px] overflow-hidden bg-[#fbfbf9] drop-shadow-[0px_1px_2px_rgba(20,20,20,0.15)] w-[230px]">
          <ContactsSidebar view={view} onNavigate={onNavigate} />
        </div>
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-white rounded-[16px] mx-2 my-2 shadow-[0px_1px_2px_rgba(20,20,20,0.15)]">
        {/* Page header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#f8f8f7] hover:bg-[#efefed]">
              <img src={ICON_BACK} alt="" className="w-4 h-4" />
            </button>
            <span className="text-[20px] font-semibold text-[#1a1a1a] tracking-[-0.4px]">All leads</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full pl-[12px] pr-[6px] py-[8px] text-[14px] font-semibold text-[#1a1a1a] hover:bg-[#efefed]">
              <img src={ICON_LEARN} alt="" className="w-4 h-4" />
              <span>Aprender</span>
              <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-40" />
            </button>
            <button className="flex items-center gap-1.5 bg-[#222] rounded-full pl-[12px] pr-[6px] py-[8px] text-[14px] font-semibold text-[#f8f8f7] hover:bg-[#333]">
              <img src={ICON_NEW_USER} alt="" className="w-4 h-4" />
              <span>Nuevos usuarios o leads</span>
              <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-60" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <AllLeadsHero />
          <AllLeadsTableSection />
        </div>
      </div>
    </div>
  );
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

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS VIEW
// ─────────────────────────────────────────────────────────────────────────────

const ICON_SETTINGS_CHEVRON_OPEN = ICON_CHEVRON;

const SETTINGS_NAV_TOP = [
  { label: "Inicio",             hasChevron: false },
  { label: "Espacio de trabajo", hasChevron: true },
  { label: "Suscripción",        hasChevron: true },
  { label: "Canales",            hasChevron: true },
];
const SETTINGS_NAV_MID = [
  { label: "IA y automatización", hasChevron: true },
  { label: "Integraciones",       hasChevron: true },
];
const INBOX_SUB: { label: string; nav: View | null }[] = [
  { label: "Inbox para el equipo", nav: null },
  { label: "Asignaciones",         nav: 'assignments' },
  { label: "Macros",               nav: 'macros' },
  { label: "Folios de atención",   nav: 'tickets' },
  { label: "SLA",                  nav: 'sla' },
];
const DATOS_SUB: { label: string; nav: View | null }[] = [
  { label: "Etiquetas",                    nav: 'labels' },
  { label: "Personas",                     nav: 'people' },
  { label: "Empresas",                     nav: null },
  { label: "Conversaciones",               nav: 'settings' },
  { label: "Objetos personalizados",       nav: null },
  { label: "Importaciones y exportaciones", nav: 'imports' },
  { label: "Temas",                        nav: null },
];
const SETTINGS_NAV_BOTTOM = [
  { label: "Centro de ayuda",   hasChevron: true },
  { label: "Canales salientes", hasChevron: true },
];

const IA_SUB: { label: string; nav: View | null }[] = [
  { label: "Fin AI Agent",   nav: 'fin' },
  { label: "Buzón de IA",    nav: 'aiInbox' },
  { label: "Automatización", nav: 'automation' },
];
const INTEG_SUB: { label: string; nav: View | null }[] = [
  { label: "Tienda de aplicaciones",   nav: 'appStore' },
  { label: "Conectores de datos",      nav: 'connectors' },
  { label: "Autenticación",            nav: null },
  { label: "Centro para desarrolladores", nav: null },
];
const PERSONAL_SUB: { label: string; nav: View | null }[] = [
  { label: "Información",            nav: 'personal' },
  { label: "Seguridad de la cuenta", nav: 'security' },
  { label: "Notificaciones",         nav: 'notifications' },
  { label: "Visible para ti",        nav: 'visible' },
  { label: "Tokens de API",          nav: 'tokens' },
  { label: "Acceso a la cuenta",     nav: 'accountAccess' },
  { label: "Multilingüe",           nav: 'multilingual' },
];

function SettingsSidebar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const isDatos = view === 'settings' || view === 'imports' || view === 'labels' || view === 'people';
  const isInboxSection = view === 'assignments' || view === 'macros' || view === 'tickets' || view === 'sla';
  const isIASection = view === 'aiInbox' || view === 'automation' || view === 'fin';
  const isIntegSection = view === 'appStore' || view === 'connectors';
  const isPersonalSection = view === 'personal' || view === 'security' || view === 'notifications' || view === 'visible' || view === 'tokens' || view === 'accountAccess' || view === 'multilingual';

  function SubItems({ items }: { items: typeof DATOS_SUB }) {
    return (
      <div className="flex flex-col gap-0.5 pl-3">
        {items.map((sub) => {
          const active = sub.nav !== null && view === sub.nav;
          return (
            <button
              key={sub.label}
              onClick={() => sub.nav && onNavigate(sub.nav)}
              className={`flex items-center w-full px-3 py-[7px] rounded-lg text-[13px] text-left ${
                active
                  ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]"
                  : "font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]"
              }`}
            >
              {sub.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-[230px] flex-shrink-0 bg-[#fbfbf9] rounded-[16px] drop-shadow-[0px_1px_2px_rgba(20,20,20,0.15)] overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Ajustes</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-0.5">
        {SETTINGS_NAV_TOP.map((item) => (
          <button
            key={item.label}
            className="flex items-center justify-between w-full px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1] text-left"
          >
            <span>{item.label}</span>
            {item.hasChevron && <img src={ICON_SETTINGS_CHEVRON_OPEN} alt="" className="w-3.5 h-3.5 opacity-40" />}
          </button>
        ))}

        {/* Inbox section */}
        <button
          onClick={() => onNavigate('assignments')}
          className="flex items-center justify-between w-full px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1] text-left"
        >
          <span>Inbox</span>
          <img src={ICON_SETTINGS_CHEVRON_OPEN} alt="" className={`w-3.5 h-3.5 opacity-40 ${isInboxSection ? 'rotate-90' : ''}`} />
        </button>
        {isInboxSection && <SubItems items={INBOX_SUB} />}

        {/* IA y automatización section */}
        <button
          onClick={() => onNavigate('aiInbox')}
          className="flex items-center justify-between w-full px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1] text-left"
        >
          <span>IA y automatización</span>
          <img src={ICON_SETTINGS_CHEVRON_OPEN} alt="" className={`w-3.5 h-3.5 opacity-40 ${isIASection ? 'rotate-90' : ''}`} />
        </button>
        {isIASection && <SubItems items={IA_SUB} />}

        {/* Integraciones section */}
        <button
          onClick={() => onNavigate('appStore')}
          className="flex items-center justify-between w-full px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1] text-left"
        >
          <span>Integraciones</span>
          <img src={ICON_SETTINGS_CHEVRON_OPEN} alt="" className={`w-3.5 h-3.5 opacity-40 ${isIntegSection ? 'rotate-90' : ''}`} />
        </button>
        {isIntegSection && <SubItems items={INTEG_SUB} />}

        {/* Datos section */}
        <button className="flex items-center justify-between w-full px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1] text-left">
          <span>Datos</span>
          <img src={ICON_SETTINGS_CHEVRON_OPEN} alt="" className={`w-3.5 h-3.5 opacity-40 ${isDatos ? 'rotate-90' : ''}`} />
        </button>
        {isDatos && <SubItems items={DATOS_SUB} />}

        {SETTINGS_NAV_BOTTOM.map((item) => (
          <button
            key={item.label}
            className="flex items-center justify-between w-full px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1] text-left"
          >
            <span>{item.label}</span>
            <img src={ICON_SETTINGS_CHEVRON_OPEN} alt="" className="w-3.5 h-3.5 opacity-40" />
          </button>
        ))}

        {/* Personal section */}
        <button
          onClick={() => onNavigate('personal')}
          className="flex items-center justify-between w-full px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1] text-left"
        >
          <span>Personal</span>
          <img src={ICON_SETTINGS_CHEVRON_OPEN} alt="" className={`w-3.5 h-3.5 opacity-40 ${isPersonalSection ? 'rotate-90' : ''}`} />
        </button>
        {isPersonalSection && <SubItems items={PERSONAL_SUB} />}
      </div>
    </div>
  );
}

const SETTINGS_ROWS = [
  { name: "Sentiment",   created: "1 hora atrás", visible: "Todos", required: "No" },
  { name: "Urgency",     created: "1 hora atrás", visible: "Todos", required: "No" },
  { name: "Complexity",  created: "1 hora atrás", visible: "Todos", required: "No" },
];

function SettingsMainContent({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#efefed]"
          >
            <img src={ICON_BACK} alt="" className="w-4 h-4" />
          </button>
          <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Conversaciones</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full pl-[12px] pr-[8px] py-[7px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#efefed]">
            <img src={ICON_LEARN} alt="" className="w-3.5 h-3.5" />
            <span>Aprender</span>
            <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-40" />
          </button>
          <button className="flex items-center gap-1.5 bg-[#222] rounded-full pl-[12px] pr-[10px] py-[7px] text-[13px] font-medium text-[#f8f8f7] hover:bg-[#333]">
            <img src={ICON_PLUS} alt="" className="w-3.5 h-3.5 invert" />
            <span>Crear atributo</span>
          </button>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-1.5 bg-white border border-[#e9eae6] rounded-full pl-[13px] pr-[10px] py-[7px]">
          <img src={ICON_FILTER} alt="" className="w-3.5 h-3.5 opacity-60" />
          <span className="text-[13px] text-[#1a1a1a]">Type is cualquiera</span>
          <img src={ICON_CHEVRON} alt="" className="w-3 h-3 opacity-40" />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {/* Column headers */}
        <div
          className="flex items-center text-[13px] font-semibold text-[#646462] px-4"
          style={{ boxShadow: "inset 0px -1px 0px 0px #e9eae6", height: 40 }}
        >
          <div className="w-[48px] flex-shrink-0" />
          <div className="w-[202px] flex-shrink-0">Nombre</div>
          <div className="w-[130px] flex-shrink-0">Tipo</div>
          <div className="w-[88px] flex-shrink-0">Creado</div>
          <div className="w-[200px] flex-shrink-0">Visible para</div>
          <div className="w-[111px] flex-shrink-0">Obligatorio</div>
          <div className="w-[122px] flex-shrink-0">Condiciones</div>
          <div className="flex-1" />
        </div>

        {SETTINGS_ROWS.map((row) => (
          <div
            key={row.name}
            className="flex items-center px-4 text-[14px] text-[#1a1a1a] hover:bg-[#f8f8f7] cursor-pointer"
            style={{ height: 74, boxShadow: "inset 0px -1px 0px 0px #e9eae6" }}
          >
            {/* Drag handle */}
            <div className="w-[48px] flex-shrink-0 flex items-center justify-center opacity-30">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="5.5" cy="4.5" r="1.2" fill="#1a1a1a"/>
                <circle cx="5.5" cy="8"   r="1.2" fill="#1a1a1a"/>
                <circle cx="5.5" cy="11.5" r="1.2" fill="#1a1a1a"/>
                <circle cx="10.5" cy="4.5" r="1.2" fill="#1a1a1a"/>
                <circle cx="10.5" cy="8"   r="1.2" fill="#1a1a1a"/>
                <circle cx="10.5" cy="11.5" r="1.2" fill="#1a1a1a"/>
              </svg>
            </div>
            {/* Name */}
            <div className="w-[202px] flex-shrink-0 font-semibold">{row.name}</div>
            {/* Type badge */}
            <div className="w-[130px] flex-shrink-0">
              <span className="inline-flex items-center gap-1 bg-[#f8f8f7] rounded-full pl-[6px] pr-[10px] py-[4px]">
                <img src={ICON_FIN} alt="" className="w-3.5 h-3.5" />
                <span className="text-[13px]">Atributo de Fin</span>
              </span>
            </div>
            {/* Created */}
            <div className="w-[88px] flex-shrink-0 text-[14px]">{row.created}</div>
            {/* Visible */}
            <div className="w-[200px] flex-shrink-0 text-[14px]">{row.visible}</div>
            {/* Required */}
            <div className="w-[111px] flex-shrink-0 text-[14px]">{row.required}</div>
            {/* Conditions */}
            <div className="w-[122px] flex-shrink-0">
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-[0px_0px_0px_1px_#e9eae6] hover:bg-[#f8f8f7]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 4h10M4 7h6M6 10h2" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            {/* Actions */}
            <div className="flex-1 flex justify-end">
              <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#efefed]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="3"  r="1.3" fill="#1a1a1a"/>
                  <circle cx="7" cy="7"  r="1.3" fill="#1a1a1a"/>
                  <circle cx="7" cy="11" r="1.3" fill="#1a1a1a"/>
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsView({ view, onNavigate, onBack }: { view: View; onNavigate: (v: View) => void; onBack: () => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-3 overflow-hidden">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <SettingsMainContent onBack={onBack} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS VIEW
// ─────────────────────────────────────────────────────────────────────────────

const IMPORT_TABS = [
  "Importar desde Zendesk",
  "Importar CSV",
  "Importar desde Mixpanel",
  "Importar desde Mailchimp",
  "Exportar datos",
];

function ImportsZendeskTab() {
  return (
    <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
      <div className="max-w-[756px] mx-auto flex flex-col gap-6">
        {/* Main form card */}
        <div className="border border-[#e9eae6] rounded-[6px] px-[21px] py-[20px] bg-white flex flex-col gap-4">
          <h2 className="text-[18px] font-semibold text-[#1a1a1a]">
            Importar desde Zendesk de forma gratuita
          </h2>
          <p className="text-[14px] text-[#1a1a1a] leading-[1.5]">
            Sabemos que mudarse puede ser difícil. Por eso, para facilitarte las cosas, te
            ofrecemos importar tus datos de Zendesk de forma gratuita. Solo tienes que
            conectar tu cuenta de Zendesk a continuación para empezar.
          </p>

          <div className="flex flex-col gap-2">
            <span className="text-[14px] font-semibold text-[#1a1a1a]">La URL de Zendesk</span>
            <input
              type="text"
              placeholder="https://your-workspace.zendesk.com"
              className="border border-[#e9eae6] rounded-[6px] px-[13px] py-[8px] text-[14px] text-[#1a1a1a] placeholder-[#646462] outline-none focus:border-[#1a1a1a] w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <button className="bg-[#f8f8f7] rounded-full px-[12px] py-[8px] text-[14px] font-semibold text-[#81817e] hover:bg-[#efefed]">
              Conectar
            </button>
            <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full px-[12px] py-[8px] text-[14px] font-semibold text-[#81817e] hover:bg-[#efefed]">
              <span>Configurar importación</span>
              <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-50" />
            </button>
          </div>

          <p className="text-[14px] text-[#646462] leading-[1.5]">
            La importación puede tardar varios días en completarse, dependiendo de la cantidad
            de datos. Te notificaremos cuando esté lista.
          </p>
        </div>

        {/* Resources section */}
        <div className="flex flex-col gap-3">
          <h3 className="text-[16px] font-semibold text-[#1a1a1a]">Más recursos</h3>
          <div className="flex gap-4">
            {[
              "Guía de importación",
              "Importar artículos desde Zendesk",
            ].map((label) => (
              <div
                key={label}
                className="flex-1 bg-[#f8f8f7] border border-[#e9eae6] rounded-[6px] p-[21px] flex items-center gap-3 cursor-pointer hover:bg-[#f3f3f1]"
              >
                <img src={ICON_IMPORTS_BOOK} alt="" className="w-10 h-10 flex-shrink-0" />
                <span className="flex-1 text-[14px] font-medium text-[#1a1a1a]">{label}</span>
                <img src={ICON_IMPORTS_LINK} alt="" className="w-4 h-4 opacity-50 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ImportsEmptyTab({
  description,
  btnLabel,
}: {
  description: string;
  btnLabel: string;
}) {
  return (
    <div className="flex-1 overflow-y-auto min-h-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 max-w-[380px] text-center">
        <img src={ICON_EMPTY_STATE} alt="" className="w-10 h-10 opacity-60" />
        <div className="flex flex-col gap-1">
          <h2 className="text-[18px] font-semibold text-[#1a1a1a]">Todavía no hay importaciones</h2>
          <p className="text-[14px] text-[#646462] leading-[1.5]">{description}</p>
        </div>
        <a href="#" className="text-[14px] text-[#e35712] underline hover:opacity-80">
          Más información
        </a>
        <button className="bg-[#222] text-white text-[14px] font-semibold rounded-full px-5 py-[9px] hover:bg-[#444]">
          {btnLabel}
        </button>
      </div>
    </div>
  );
}

function ImportsExportTab() {
  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="px-8 py-6">
        <p className="text-[14px] text-[#1a1a1a] mb-8">
          Exporta datos de Intercom a tu proveedor de servicios en la nube para análisis e informes.
        </p>
        <div className="flex flex-col items-center justify-center py-10 gap-4">
          <img src={ICON_EMPTY_STATE} alt="" className="w-10 h-10 opacity-60" />
          <div className="flex flex-col items-center gap-1 text-center">
            <h2 className="text-[18px] font-semibold text-[#1a1a1a]">No hay exportaciones de datos</h2>
            <p className="text-[14px] text-[#646462]">Comienza creando una nueva exportación</p>
          </div>
          <button className="bg-[#222] text-white text-[14px] font-semibold rounded-full px-5 py-[9px] hover:bg-[#444]">
            Nueva exportación
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportsView({ view, onNavigate, onBack }: { view: View; onNavigate: (v: View) => void; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-3 overflow-hidden">
        <SettingsSidebar view={view} onNavigate={onNavigate} />

        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#efefed]"
              >
                <img src={ICON_BACK} alt="" className="w-4 h-4" />
              </button>
              <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">
                Importaciones y exportaciones
              </span>
            </div>
            <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full pl-[12px] pr-[8px] py-[7px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#efefed]">
              <img src={ICON_LEARN} alt="" className="w-3.5 h-3.5" />
              <span>Aprender</span>
              <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-40" />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex items-end gap-0 px-6 border-b border-[#e9eae6] flex-shrink-0">
            {IMPORT_TABS.map((tab, i) => (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                className={`px-4 py-3 text-[14px] whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === i
                    ? "border-[#ed621d] text-[#1a1a1a] font-medium"
                    : "border-transparent text-[#646462] hover:text-[#1a1a1a]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 0 && <ImportsZendeskTab />}
          {activeTab === 1 && (
            <ImportsEmptyTab
              description="Importar datos de un archivo CSV a Intercom."
              btnLabel="Importar"
            />
          )}
          {activeTab === 2 && (
            <ImportsEmptyTab
              description="Importa datos de tu cuenta de Mixpanel a Intercom."
              btnLabel="Conectar con Mixpanel"
            />
          )}
          {activeTab === 3 && (
            <ImportsEmptyTab
              description="Importa datos de tu lista de correo de Mailchimp a Intercom. Vamos a obtener el nombre y la dirección de correo electrónico de las personas."
              btnLabel="Conectar con Mailchimp"
            />
          )}
          {activeTab === 4 && <ImportsExportTab />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONAL VIEW (Settings > Personal > Información)
// ─────────────────────────────────────────────────────────────────────────────

const MAPBOX_URL = "https://api.mapbox.com/styles/v1/patrickod/cjbcj1mh978pd2rkd15d5aauf/static/-0.7902,38.4786,2/1280x186?access_token=pk.eyJ1IjoicGF0cmlja29kIiwiYSI6ImY1LVY4WkUifQ.WK9SrChxuv4vz1NxPDooSw&attribution=false&logo=false";

function ProfileRow({ children, value, muted = false }: { children: React.ReactNode; value: string; muted?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 py-[5px]">
      <div className="w-4 h-4 flex-shrink-0 mt-[2px] opacity-40">{children}</div>
      <span className={`text-[13px] leading-[1.4] ${muted ? 'text-[#646462]' : 'text-[#1a1a1a]'}`}>{value}</span>
    </div>
  );
}

const convFeedItems = [
  { id: "1", channel: "Messenger · [Demo]", preview: "Para instalar el Messenger de Intercom en tu sitio web, ve a Configuración > Messenger > Instalar.", time: "hace 4 min", color: "#9ec5fa", initial: "M" },
  { id: "2", channel: "Email · [Demo]", preview: "Esta es una demostración del canal de correo electrónico. Configura tu dirección de correo para recibir mensajes.", time: "hace 8 min", color: "#85e0d9", initial: "E" },
  { id: "3", channel: "WhatsApp · [Demo]", preview: "Configura WhatsApp para comunicarte con tus clientes directamente desde Intercom.", time: "hace 12 min", color: "#61d65c", initial: "W" },
  { id: "4", channel: "Phone · [Demo]", preview: "Configura llamadas telefónicas o SMS para atender a tus clientes por voz.", time: "hace 20 min", color: "#b09efa", initial: "P" },
];

function PersonalView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-3 overflow-hidden">
        <SettingsSidebar view={view} onNavigate={onNavigate} />

        <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
          {/* Map header */}
          <div className="relative h-[156px] flex-shrink-0 overflow-hidden" style={{ background: '#384754' }}>
            <img
              src={MAPBOX_URL}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/40" />
            <div className="absolute inset-0 flex items-end px-8 pb-5">
              <div className="flex items-end gap-4">
                <div className="w-[74px] h-[74px] rounded-full bg-[#9ec5fa] border-[3px] border-white flex items-center justify-center text-[22px] font-bold text-[#1a1a1a] flex-shrink-0">
                  HV
                </div>
                <div className="flex flex-col gap-0.5 pb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[20px] font-semibold text-white">Hector Vidal Sanchez</span>
                    <span className="text-[11px] font-semibold text-white/90 bg-white/25 rounded-[4px] px-2 py-[2px]">Tú</span>
                  </div>
                  <div className="flex items-center gap-3 text-[13px] text-white/80">
                    <span>Elda, Spain</span>
                    <span>·</span>
                    <span>9:56 a.m.</span>
                    <span>·</span>
                    <span>Activo en los últimos 15 minutos</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Content below map */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Profile sidebar */}
            <div className="w-[268px] flex-shrink-0 overflow-y-auto border-r border-[#e9eae6] py-5 px-[30px]">
              <h3 className="text-[18px] font-semibold text-[#1a1a1a] mb-3">Tú</h3>

              {/* Perfil público */}
              <div className="border border-[#e9eae6] rounded-[10px] mb-4 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-[14px] border-b border-[#e9eae6]">
                  <span className="text-[14px] font-semibold text-[#1a1a1a]">Perfil público</span>
                  <button className="text-[13px] font-semibold text-[#81817e] bg-[#f8f8f7] rounded-full px-3 py-[5px] hover:bg-[#efefed]">Guardar</button>
                </div>
                <div className="px-5 py-3">
                  <ProfileRow value="Hector Vidal Sanchez">
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><circle cx="7" cy="4.5" r="2.3" stroke="#1a1a1a" strokeWidth="1.2"/><path d="M2 12c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" stroke="#1a1a1a" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </ProfileRow>
                  <ProfileRow value="hector.vidal.sanchez">
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><rect x="1" y="3" width="12" height="8" rx="1.5" stroke="#1a1a1a" strokeWidth="1.2"/><path d="M1 5l6 4 6-4" stroke="#1a1a1a" strokeWidth="1.2"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Activo">
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><circle cx="7" cy="7" r="5.5" stroke="#1a1a1a" strokeWidth="1.2"/><circle cx="7" cy="7" r="2.5" fill="#158613"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Elda, Spain">
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><path d="M7 1C4.8 1 3 2.8 3 5c0 3 4 8 4 8s4-5 4-8c0-2.2-1.8-4-4-4z" stroke="#1a1a1a" strokeWidth="1.2"/><circle cx="7" cy="5" r="1.5" stroke="#1a1a1a" strokeWidth="1.2"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Desactivado" muted>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><path d="M2 7h10M7 2v10" stroke="#646462" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Aún no hay un puesto" muted>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><rect x="1" y="4" width="12" height="8" rx="1" stroke="#646462" strokeWidth="1.2"/><path d="M5 4V3a1 1 0 011-1h2a1 1 0 011 1v1" stroke="#646462" strokeWidth="1.2"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Aún no hay departamentos" muted>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><circle cx="4" cy="5" r="2" stroke="#646462" strokeWidth="1.1"/><circle cx="10" cy="5" r="2" stroke="#646462" strokeWidth="1.1"/><path d="M1 12c0-1.7 1.3-3 3-3" stroke="#646462" strokeWidth="1.1" strokeLinecap="round"/><path d="M13 12c0-1.7-1.3-3-3-3" stroke="#646462" strokeWidth="1.1" strokeLinecap="round"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Aún no hay números de teléfono" muted>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><path d="M11 9.5c0 .3-.1.6-.2.9-.2.3-.4.5-.7.7-.4.2-.9.4-1.4.4-1.5 0-3.2-.9-4.6-2.3C2.7 7.8 1.8 6.1 1.8 4.6c0-.5.1-1 .3-1.4.2-.4.5-.6.8-.8L3.5 2l2 4.5L4.8 7c.5 1 1.3 1.8 2.2 2.3l.5-.7L11 9.5z" stroke="#646462" strokeWidth="1.1"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Preséntate" muted>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><path d="M2 4h10M2 7h7M2 10h5" stroke="#646462" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </ProfileRow>
                  <ProfileRow value="Añade un enlace a tu calendario" muted>
                    <svg viewBox="0 0 14 14" fill="none" className="w-4 h-4"><rect x="1" y="2" width="12" height="11" rx="1.5" stroke="#646462" strokeWidth="1.2"/><path d="M1 6h12M5 1v2M9 1v2" stroke="#646462" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  </ProfileRow>
                </div>
              </div>

              {/* Tu cuenta */}
              <div className="border border-[#e9eae6] rounded-[10px] mb-4 overflow-hidden">
                <div className="px-5 py-[14px] border-b border-[#e9eae6]">
                  <span className="text-[14px] font-semibold text-[#1a1a1a]">Tu cuenta</span>
                </div>
                <div className="px-5 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-3 py-1">
                    <span className="text-[13px] text-[#646462] w-[85px] flex-shrink-0">Creado el</span>
                    <span className="text-[13px] text-[#1a1a1a]">1 hora atrás</span>
                  </div>
                  <div className="flex items-start gap-3 py-1">
                    <span className="text-[13px] text-[#646462] w-[85px] flex-shrink-0">Correo</span>
                    <span className="text-[12px] text-[#1a1a1a] break-all">hectorvidal041103@gmail.com</span>
                  </div>
                </div>
              </div>

              {/* Inbox para el equipo */}
              <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                <div className="px-5 py-[14px] border-b border-[#e9eae6]">
                  <span className="text-[14px] font-semibold text-[#1a1a1a]">Inbox para el equipo</span>
                </div>
                <div className="px-5 py-4 flex items-start justify-between gap-3">
                  <p className="text-[13px] text-[#646462] leading-[1.4]">
                    Hector no es miembro de ningún buzón del equipo
                  </p>
                  <button className="text-[13px] font-semibold text-[#1a1a1a] flex-shrink-0 hover:opacity-70">Editar</button>
                </div>
              </div>
            </div>

            {/* Conversations area */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <h3 className="text-[18px] font-semibold text-[#1a1a1a] mb-4">Tus conversaciones</h3>
              <div className="flex flex-col gap-3 max-w-[638px]">
                {convFeedItems.map((item) => (
                  <div key={item.id} className="border border-[#e9eae6] rounded-xl p-4 bg-white hover:bg-[#f8f8f7] cursor-pointer">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-[12px] font-semibold text-[#1a1a1a]"
                        style={{ backgroundColor: item.color }}
                      >
                        {item.initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[13px] font-semibold text-[#646462]">{item.channel}</span>
                          <span className="text-[12px] text-[#646462] flex-shrink-0 ml-2">{item.time}</span>
                        </div>
                        <p className="text-[13px] text-[#1a1a1a] leading-[1.5] line-clamp-2">{item.preview}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY VIEW (Settings > Personal > Seguridad de la cuenta)
// ─────────────────────────────────────────────────────────────────────────────

function SecuritySection({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="flex border border-[#e9eae6] rounded-[12px] overflow-hidden flex-shrink-0">
      <div className="flex-1 px-[25px] py-[25px] flex flex-col gap-3">{left}</div>
      <div className="flex-1 px-[25px] py-[25px] border-l border-[#e9eae6] flex flex-col justify-center">{right}</div>
    </div>
  );
}

function SecurityInput({ label, defaultValue = "", placeholder = "", blue = false }: {
  label: string; defaultValue?: string; placeholder?: string; blue?: boolean;
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="text-[14px] font-medium text-[#1a1a1a]">{label}</span>
      <input
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={`border border-[#e9eae6] rounded-[6px] px-3 py-[6px] text-[14px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] w-[236px] ${
          blue ? 'bg-[#e8f0fe]' : 'bg-white'
        }`}
      />
    </div>
  );
}

function SecurityView({ view, onNavigate, onBack }: { view: View; onNavigate: (v: View) => void; onBack: () => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-3 overflow-hidden">
        <SettingsSidebar view={view} onNavigate={onNavigate} />

        <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#efefed] mr-3"
            >
              <img src={ICON_BACK} alt="" className="w-4 h-4" />
            </button>
            <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Seguridad de la cuenta</span>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6 flex flex-col gap-4">
            {/* Section 1 — Email */}
            <SecuritySection
              left={
                <>
                  <h3 className="text-[16px] font-medium text-[#1a1a1a]">Dirección de correo electrónico</h3>
                  <p className="text-[14px] text-[#646462] leading-[1.5] max-w-[338px]">
                    Actualiza el correo electrónico asociado a tu cuenta de Intercom. Ingresa tu contraseña actual para confirmar los cambios.
                  </p>
                </>
              }
              right={
                <div className="flex flex-col gap-[5px]">
                  <span className="text-[14px] font-medium text-[#1a1a1a]">ID de correo electrónico</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      defaultValue="hectorvidal041103@gmail.com"
                      className="border border-[#e9eae6] rounded-[6px] px-3 py-[6px] text-[14px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] w-[236px]"
                    />
                    <button className="bg-[#f8f8f7] rounded-full px-3 py-[7px] text-[14px] font-semibold text-[#81817e] hover:bg-[#efefed] flex-shrink-0">Guardar</button>
                  </div>
                </div>
              }
            />

            {/* Section 2 — Password */}
            <SecuritySection
              left={
                <>
                  <h3 className="text-[16px] font-medium text-[#1a1a1a]">Cambiar contraseña</h3>
                  <p className="text-[14px] text-[#646462] leading-[1.5] max-w-[338px]">
                    Cambia la contraseña de tu cuenta de Intercom ingresando la contraseña actual y luego confirma la nueva contraseña
                  </p>
                </>
              }
              right={
                <div className="flex flex-col gap-8">
                  <SecurityInput label="Contraseña actual" defaultValue="Hector0411" blue />
                  <SecurityInput label="Nueva contraseña" placeholder="" />
                  <div className="flex flex-col gap-[5px]">
                    <span className="text-[14px] font-medium text-[#1a1a1a]">Vuelve a ingresar la nueva contraseña</span>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        className="border border-[#e9eae6] rounded-[6px] px-3 py-[6px] text-[14px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] w-[236px]"
                      />
                      <button className="bg-[#f8f8f7] rounded-full px-3 py-[7px] text-[14px] font-semibold text-[#81817e] hover:bg-[#efefed] flex-shrink-0">Confirmar</button>
                    </div>
                  </div>
                </div>
              }
            />

            {/* Section 3 — 2FA */}
            <SecuritySection
              left={
                <>
                  <h3 className="text-[16px] font-medium text-[#1a1a1a]">Autenticación de dos factores (2FA)</h3>
                  <p className="text-[14px] text-[#646462] leading-[1.5] max-w-[338px]">
                    Mejore la seguridad de la cuenta activando la 2FA
                  </p>
                  <a href="#" className="flex items-center gap-1.5 text-[14px] text-[#165fc6]">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#165fc6" strokeWidth="1.2"/><path d="M7 6v4M7 4.5v.5" stroke="#165fc6" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    <span>Más información</span>
                  </a>
                </>
              }
              right={
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    {/* Toggle off */}
                    <div className="w-8 h-4 bg-[#c6c9c0] rounded-full p-[2px] flex items-center flex-shrink-0">
                      <div className="w-3 h-3 bg-white rounded-full shadow-sm" />
                    </div>
                    <span className="text-[14px] text-[#1a1a1a]">Habilitar la autenticación de dos factores</span>
                    {/* Warning icon */}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0"><path d="M8 2L14 13H2L8 2z" fill="#F9C61F" stroke="#F9C61F" strokeWidth="0.5"/><path d="M8 6v3M8 10.5v.5" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  </div>
                  <div className="flex items-center gap-1.5 cursor-pointer hover:opacity-70">
                    <span className="text-[14px] font-medium text-[#1a1a1a]">Configurar</span>
                    <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-50" />
                  </div>
                </div>
              }
            />

            {/* Section 4 — Sessions */}
            <SecuritySection
              left={
                <>
                  <h3 className="text-[16px] font-medium text-[#1a1a1a]">Tus sesiones activas</h3>
                  <p className="text-[14px] text-[#646462] leading-[1.5] max-w-[338px]">
                    A la derecha se muestran las sesiones activas de su cuenta. Si no reconoce una sesión, puede terminarla.
                  </p>
                  <a href="#" className="text-[14px] text-[#1a1a1a] underline leading-[1.4]">
                    Haz clic aquí para ver la actividad reciente de tu compañero de equipo.
                  </a>
                </>
              }
              right={
                <div className="overflow-x-auto">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr style={{ boxShadow: 'inset 0 -1px 0 0 #e9eae6' }}>
                        {["Hora de inicio de sesión", "Dirección IP", "Navegador", "Sistema operativo", "Ubicación"].map((h) => (
                          <th key={h} className="text-left text-[13px] font-semibold text-[#646462] pb-3 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["May 5, 2026 at 8:58AM", "89.29.186.90", "Chrome", "Windows 10", "Elda, ES"],
                        ["May 5, 2026 at 8:55AM", "89.29.186.90", "Chrome", "Windows 10", "Elda, ES"],
                      ].map((row, i) => (
                        <tr key={i} style={{ boxShadow: 'inset 0 -1px 0 0 #e9eae6' }}>
                          {row.map((cell, j) => (
                            <td key={j} className="py-3 pr-4 text-[14px] text-[#1a1a1a]">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── NotificationsView ────────────────────────────────────────────────────────

const NOTIF_ROWS: { label: string; desk: boolean; mobile: boolean; email: boolean }[] = [
  { label: "Actividad en todas las conversaciones sin asignar",                                    desk: false, mobile: true,  email: false },
  { label: "Actividad en todo lo asignado a ti",                                                   desk: false, mobile: true,  email: true  },
  { label: "Actividad en cualquiera de tus equipos",                                               desk: false, mobile: true,  email: false },
  { label: "Actividad en conversaciones asignadas a otros equipos o compañeros de equipo",         desk: false, mobile: true,  email: false },
  { label: "Cualquier mención de ti en una conversación",                                          desk: false, mobile: true,  email: true  },
  { label: "Actividad en las conversaciones iniciadas a partir de mensajes que enviaste",           desk: false, mobile: true,  email: false },
  { label: "Nuevas conversaciones con leads y usuarios de tu propiedad",                           desk: false, mobile: true,  email: false },
];

function NotifCheck({ checked }: { checked: boolean }) {
  return (
    <span className={`inline-flex w-[13px] h-[13px] rounded-sm border flex-shrink-0 items-center justify-center ${
      checked ? 'bg-[#3b59f6] border-[#3b59f6]' : 'border-[#ccc] bg-white'
    }`}>
      {checked && (
        <svg viewBox="0 0 10 8" className="w-2 h-2 fill-white">
          <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      )}
    </span>
  );
}

function NotificationsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 border-b border-[#e9eae6] h-[64px] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Tus preferencias de notificaciones</h1>
            <div className="flex items-center gap-3">
              <a className="text-[13px] text-[#4f52cc] flex items-center gap-1 cursor-pointer">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current opacity-60"><path d="M3.5 10.5a.5.5 0 01-.354-.854l7-7a.5.5 0 01.707.707l-7 7A.5.5 0 013.5 10.5z"/><path d="M10.5 3.5h-4a.5.5 0 010-1h5a.5.5 0 01.5.5v5a.5.5 0 01-1 0v-4z"/></svg>
                Política de privacidad
              </a>
              <button className="bg-[#222] text-white text-[13px] font-semibold rounded-full px-4 py-[6px] hover:bg-[#444]">Guardar</button>
            </div>
          </div>
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-8 py-4">
              <p className="text-[13px] text-[#1a1a1a] mb-4">Recibe notificaciones sobre la actividad de las conversaciones en todos tus espacios de trabajo:</p>
              {/* Column headers */}
              <div className="flex border border-[#e9eae6] rounded-t-[8px] overflow-hidden mb-0">
                <div className="flex-1 border-r border-[#e9eae6] px-6 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a] opacity-70"><rect x="1" y="2" width="14" height="10" rx="1.5" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/><path d="M5 14h6M8 12v2" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    <span className="text-[13px] font-semibold text-[#1a1a1a]">Escritorio</span>
                  </div>
                  <span className="text-[12px] text-[#646462]">Un banner en la esquina de la pantalla</span>
                </div>
                <div className="flex-1 border-r border-[#e9eae6] px-6 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><rect x="4" y="1" width="8" height="13" rx="1.5"/><circle cx="8" cy="12" r="0.5" fill="#1a1a1a"/></svg>
                    <span className="text-[13px] font-semibold text-[#1a1a1a]">Dispositivo móvil</span>
                  </div>
                  <span className="text-[12px] text-[#646462]">Una notificación en tu teléfono</span>
                </div>
                <div className="flex-1 px-6 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><rect x="1" y="3" width="14" height="10" rx="1.5"/><path d="M1 6l7 4 7-4"/></svg>
                    <span className="text-[13px] font-semibold text-[#1a1a1a]">Correo electrónico</span>
                  </div>
                  <span className="text-[12px] text-[#646462]">Conversaciones enviadas a tu buzón</span>
                </div>
              </div>
              {/* Notification rows */}
              {NOTIF_ROWS.map((row, i) => (
                <div key={i} className="flex items-center border-x border-b border-[#e9eae6] px-6 py-4 gap-4">
                  <span className="flex-1 text-[13px] text-[#1a1a1a]">{row.label}</span>
                  <div className="flex items-center gap-[80px] flex-shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <NotifCheck checked={row.desk} />
                      <span className="text-[13px] text-[#1a1a1a]">Escritorio</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <NotifCheck checked={row.mobile} />
                      <span className="text-[13px] text-[#1a1a1a]">Dispositivo móvil</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <NotifCheck checked={row.email} />
                      <span className="text-[13px] text-[#1a1a1a]">Correo electrónico</span>
                    </label>
                  </div>
                </div>
              ))}
              {/* Row 8 — with radio sub-options */}
              <div className="flex border-x border-b border-[#e9eae6] rounded-b-[8px] px-6 py-4 gap-4">
                <div className="flex-1 flex flex-col gap-2">
                  <span className="text-[13px] text-[#1a1a1a]">Los leads de cuentas que posees vuelven a visitar tu sitio web</span>
                  <div className="flex flex-col gap-1 mt-1 ml-0">
                    <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[#1a1a1a]">
                      <input type="radio" name="site_visit" defaultChecked className="accent-[#3b59f6]" />
                      visita cualquier página
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[#1a1a1a]">
                      <input type="radio" name="site_visit" className="accent-[#3b59f6]" />
                      visita una página específica y
                      <span className="ml-1 border border-[#e9eae6] rounded px-2 py-0.5 text-[12px] text-[#4f52cc] bg-[#f5f5ff]">la URL contiene</span>
                    </label>
                  </div>
                </div>
                <div className="flex items-start gap-[80px] flex-shrink-0 pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <NotifCheck checked={false} />
                    <span className="text-[13px] text-[#1a1a1a]">Escritorio</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <NotifCheck checked={true} />
                    <span className="text-[13px] text-[#1a1a1a]">Dispositivo móvil</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <NotifCheck checked={false} />
                    <span className="text-[13px] text-[#1a1a1a]">Correo electrónico</span>
                  </label>
                </div>
              </div>
              {/* Browser notifications section */}
              <div className="mt-8">
                <h2 className="text-[17px] font-semibold text-[#1a1a1a] mb-1">Notificaciones del navegador</h2>
                <p className="text-[13px] text-[#646462] mb-3">Vincula tu pestaña cuando haya nueva actividad en estas conversaciones. Verás estos cambios al actualizar la página.</p>
                <div className="flex flex-col gap-2">
                  {["Asignado a ti", "Sin asignar", "Asignado a cualquiera de tus equipos"].map(label => (
                    <label key={label} className="flex items-center gap-2 cursor-pointer text-[13px] text-[#1a1a1a]">
                      <NotifCheck checked={false} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── VisibleView ───────────────────────────────────────────────────────────────

function VisibleView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'empresas' | 'personas' | 'etiquetas'>('empresas');
  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'empresas',  label: 'Segmentos de empresas' },
    { id: 'personas',  label: 'Segmentos de personas' },
    { id: 'etiquetas', label: 'Etiquetas' },
  ];
  const rows = [
    { name: 'Active', by: 'Segmento predeterminado', created: '1 hora atrás', canHide: true },
    { name: 'New',    by: 'Segmento predeterminado', created: '1 hora atrás', canHide: true },
    { name: 'All',    by: 'Segmento predeterminado', created: '',             canHide: false },
  ];
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="px-8 pt-6 pb-0 flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a] mb-4">Visible para ti</h1>
            <div className="flex gap-0 border-b border-[#e9eae6]">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 pb-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                    tab === t.id ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-8 py-4">
            <p className="text-[13px] font-semibold text-[#1a1a1a] mb-2">Visible</p>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#e9eae6]">
                  <th className="text-left py-2 pr-4 font-semibold text-[#1a1a1a]">Nombre del segmento</th>
                  <th className="text-left py-2 pr-4 font-semibold text-[#1a1a1a]">Creado por</th>
                  <th className="text-left py-2 pr-4 font-semibold text-[#1a1a1a]">Creado</th>
                  <th className="text-left py-2 font-semibold text-[#1a1a1a]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.name} className="border-b border-[#e9eae6]">
                    <td className="py-3 pr-4 text-[#1a1a1a]">{row.name}</td>
                    <td className="py-3 pr-4 text-[#646462]">{row.by}</td>
                    <td className="py-3 pr-4 text-[#646462]">{row.created}</td>
                    <td className="py-3">
                      {row.canHide && <button className="text-[#d97706] text-[13px] font-medium hover:underline">Ocultar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TokensView ────────────────────────────────────────────────────────────────

function TokensView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="px-8 pt-6 pb-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Tokens de API</h1>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-8 py-4 flex flex-col gap-3">
            <div className="flex items-start gap-3 bg-[#f8f8f8] border border-[#e9eae6] rounded-[8px] px-4 py-3">
              <span className="text-[#4f52cc] mt-0.5 flex-shrink-0">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 4a1 1 0 110 2 1 1 0 010-2zm0 4a1 1 0 011 1v3a1 1 0 01-2 0V9a1 1 0 011-1z"/></svg>
              </span>
              <p className="text-[13px] text-[#1a1a1a]">
                Puede restringir el acceso a la API por dirección IP.{' '}
                <a className="text-[#4f52cc] underline cursor-pointer">Configurar lista de IP permitidas</a>
              </p>
            </div>
            <div className="flex items-start gap-3 bg-[#f8f8f8] border border-[#e9eae6] rounded-[8px] px-4 py-3">
              <span className="text-[#4f52cc] mt-0.5 flex-shrink-0">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 4a1 1 0 110 2 1 1 0 010-2zm0 4a1 1 0 011 1v3a1 1 0 01-2 0V9a1 1 0 011-1z"/></svg>
              </span>
              <p className="text-[13px] text-[#1a1a1a]">Los tokens OAuth se crean cuando autorizas a otra aplicación para que acceda a Intercom en tu nombre. En este momento no tienes aplicaciones conectadas activas.</p>
            </div>
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <svg viewBox="0 0 48 48" className="w-12 h-12 fill-none stroke-[#ccc]" strokeWidth="2">
                <path d="M30 10l8 8-20 20-10 2 2-10 20-20z"/>
                <path d="M26 14l8 8"/>
              </svg>
              <h2 className="text-[17px] font-semibold text-[#1a1a1a]">Todavía no hay tokens de OAuth</h2>
              <p className="text-[13px] text-[#646462]">Cree un token para acceder a sus datos a través de la API</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AccountAccessView ─────────────────────────────────────────────────────────

function AccountAccessView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="px-8 pt-6 pb-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Acceso a la cuenta</h1>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-8 py-6 flex flex-col gap-0">
            <h2 className="text-[15px] font-semibold text-[#1a1a1a] mb-3">Dar acceso a Intercom a tu cuenta</h2>
            <p className="text-[13px] text-[#646462] leading-relaxed mb-5">
              Es posible que necesitemos acceso temporal a tu cuenta para diagnosticar y resolver tu problema de soporte.
              Esto dará a Intercom acceso a todos tus espacios de trabajo durante 14 días, después de lo cual el acceso
              vencerá automáticamente. También puedes revocar manualmente el acceso en cualquier momento.
            </p>
            <button className="bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-full px-5 py-[9px] self-start hover:bg-[#444] mb-6">
              Aprobar acceso a Intercom
            </button>
            <div className="border-t border-[#e9eae6] pt-6">
              <h2 className="text-[15px] font-semibold text-[#1a1a1a] mb-4">Historial de aprobación de acceso de Intercom</h2>
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <svg viewBox="0 0 48 48" className="w-12 h-12 fill-none stroke-[#ccc]" strokeWidth="2">
                  <rect x="6" y="6" width="36" height="10" rx="2"/>
                  <rect x="6" y="20" width="36" height="10" rx="2"/>
                  <rect x="6" y="34" width="36" height="10" rx="2"/>
                </svg>
                <p className="text-[14px] text-[#646462]">Sin historial</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MultilingualView ──────────────────────────────────────────────────────────

function MultilingualView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="px-8 pt-6 pb-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Multilingüe</h1>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-8 py-6 flex flex-col gap-6">
            {/* General section */}
            <div>
              <h2 className="text-[15px] font-semibold text-[#1a1a1a] mb-3">General</h2>
              <div className="border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-start justify-between gap-6">
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Ajustes de traducción de IA</p>
                  <p className="text-[13px] text-[#646462] leading-relaxed">
                    Traduzca automáticamente las respuestas de los clientes al idioma predeterminado de su espacio de trabajo en el buzón, y sus respuestas al idioma del cliente en todos los canales para mantener conversaciones fluidas.
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 pt-0.5">
                  <div className="w-9 h-5 bg-[#f97316] rounded-full relative cursor-pointer flex-shrink-0">
                    <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm" />
                  </div>
                  <span className="text-[13px] text-[#1a1a1a] whitespace-nowrap">Habilitar la traducción de IA para el buzón</span>
                </div>
              </div>
            </div>
            {/* Preferencias de idioma section */}
            <div>
              <h2 className="text-[15px] font-semibold text-[#1a1a1a] mb-3">Preferencias de idioma</h2>
              <div className="border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-start justify-between gap-6">
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Su idioma</p>
                  <p className="text-[13px] text-[#646462] leading-relaxed">
                    Traduciremos las conversaciones del buzón a este idioma. Responda siempre en el idioma en que se muestra la conversación; por lo general, será su idioma, a menos que la conversación esté en el idioma predeterminado de su espacio de trabajo (English) o en un idioma no compatible. Estas conversaciones no admiten traducción.
                  </p>
                </div>
                <div className="flex-shrink-0 pt-0.5">
                  <select className="border border-[#e9eae6] rounded-[6px] px-3 py-1.5 text-[13px] text-[#1a1a1a] bg-white min-w-[120px]">
                    <option>English</option>
                    <option>Español</option>
                    <option>Français</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared: Inbox/Helpdesk promo card ────────────────────────────────────────

function SettingsPromoCard({ title, description, primaryBtn, secondaryBtn, imageSlot }: {
  title: string;
  description: string;
  primaryBtn: string;
  secondaryBtn: string;
  imageSlot?: React.ReactNode;
}) {
  return (
    <div className="relative bg-[#f5f5f4] rounded-[12px] px-8 py-6 flex gap-6 overflow-hidden flex-shrink-0 mx-6 mt-6">
      <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#e5e5e3]">
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none">
          <path d="M1 1l10 10M11 1L1 11" stroke="#646462" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      <div className="flex flex-col justify-center gap-3 flex-1 max-w-[500px] py-4">
        <h2 className="text-[18px] font-bold text-[#1a1a1a] leading-tight">{title}</h2>
        <p className="text-[13px] text-[#646462] leading-relaxed">{description}</p>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="bg-[#7c3aed] text-white text-[13px] font-semibold rounded-full px-4 py-[7px] flex items-center gap-1.5 hover:bg-[#6d28d9]">
            <span>⊕</span> {primaryBtn}
          </button>
          <a className="text-[13px] text-[#4f52cc] flex items-center gap-1.5 cursor-pointer font-medium">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5">
              <rect x="2" y="4" width="12" height="9" rx="1.5"/><rect x="5" y="1" width="6" height="4" rx="1"/>
            </svg>
            {secondaryBtn}
          </a>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center min-w-0">
        {imageSlot ?? (
          <div className="w-full h-[160px] bg-[#e8e4f5] rounded-[8px] opacity-60" />
        )}
      </div>
    </div>
  );
}

// ── AssignmentsView ───────────────────────────────────────────────────────────

function AssignmentsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'general' | 'workload' | 'limits'>('workload');
  const tabs = [
    { id: 'general'  as const, label: 'General' },
    { id: 'workload' as const, label: 'Gestión de la carga de trabajo' },
    { id: 'limits'   as const, label: 'Límite de asignación de compañeros de equipo' },
  ];
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Asignaciones</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5">
                <path d="M8 1v14M3 6l5-5 5 5"/><path d="M2 14h12"/>
              </svg>
              Aprender
            </button>
          </div>
          {/* Tabs */}
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  tab === t.id ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === 'workload' && (
              <SettingsPromoCard
                title="Mantén el control con la gestión de la carga de trabajo"
                description="Agiliza la carga de trabajo de tu equipo con funciones de asignación inteligente. Controla qué conversaciones van a dónde, establece límites de asignación y más."
                primaryBtn="Get the feature"
                secondaryBtn="Gestión de carga de trabajo"
                imageSlot={
                  <div className="w-full h-[160px] rounded-[8px] bg-gradient-to-br from-[#e8e4f5] to-[#d4d0ea] flex items-center justify-center opacity-80">
                    <div className="text-[12px] text-[#7c3aed] font-medium">Assignment Logic diagram</div>
                  </div>
                }
              />
            )}
            {tab === 'limits' && (
              <SettingsPromoCard
                title="A la medida de cada compañero"
                description="Dale a cada compañero de equipo buzones principales en los que concentrarse. O establece límites de asignación individuales, para que las cargas de trabajo siempre se compartan de manera eficiente."
                primaryBtn="Get the feature"
                secondaryBtn="Límite de asignación de compañeros de equipo"
                imageSlot={
                  <div className="w-full h-[160px] rounded-[8px] bg-gradient-to-br from-[#fce7f3] to-[#f0abcc] flex items-center justify-center opacity-80">
                    <div className="text-[12px] text-[#9d174d] font-medium">Assignment limits table</div>
                  </div>
                }
              />
            )}
            {tab === 'general' && (
              <div className="px-6 py-6 text-[13px] text-[#646462]">Configuración general de asignaciones</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MacrosView ────────────────────────────────────────────────────────────────

const macrosList = [
  { id: '1', emoji: '✅', label: 'Close conversation [Example]', active: true },
  { id: '2', emoji: '🐞', label: 'Bug report [Example]', active: false },
  { id: '3', emoji: '💵', label: 'Billing [Example]', active: false },
  { id: '4', emoji: '',   label: 'Feature Request [Example]', active: false },
];

function MacrosView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [selected, setSelected] = useState('1');
  const macro = macrosList.find(m => m.id === selected)!;
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Macros</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M8 1v14M3 6l5-5 5 5"/><path d="M2 14h12"/></svg>
                Aprender
              </button>
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M8 15V1M3 10l5 5 5-5"/></svg>
                Exportar
              </button>
              <button className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">
                + Nueva macro
              </button>
            </div>
          </div>
          {/* Scrollable body */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <SettingsPromoCard
              title="Crea macros para ahorrar tiempo en tareas repetitivas en el buzón"
              description="Agiliza tu flujo de trabajo con acciones personalizables y fáciles de repetir. Reduce el tiempo que tu equipo dedica a escribir respuestas repetitivas, asignar conversaciones, etiquetar, posponer y más."
              primaryBtn="+ Nueva macro"
              secondaryBtn="Hacer un recorrido"
              imageSlot={
                <div className="w-full h-[160px] rounded-[8px] bg-gradient-to-br from-[#e0f2fe] to-[#b0d9f5] flex items-center justify-center opacity-80">
                  <div className="text-[12px] text-[#0369a1] font-medium">Macros editor preview</div>
                </div>
              }
            />
            {/* Search */}
            <div className="px-6 pt-4 pb-2 flex-shrink-0">
              <div className="flex items-center border border-[#e9eae6] rounded-[8px] px-3 py-2 gap-2 bg-[#f8f8f7]">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/></svg>
                <span className="text-[13px] text-[#9a9a98]">Buscar macros...</span>
              </div>
            </div>
            {/* 2-panel layout */}
            <div className="flex flex-1 min-h-0 mx-6 mb-4 border border-[#e9eae6] rounded-[8px] overflow-hidden">
              {/* List panel */}
              <div className="w-[350px] flex-shrink-0 border-r border-[#e9eae6] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#e9eae6]">
                  <button className="flex items-center gap-1.5 text-[13px] font-medium text-[#1a1a1a]">
                    Filtrar por
                    <svg viewBox="0 0 10 6" className="w-2.5 h-2.5 fill-[#646462]"><path d="M0 0l5 6 5-6z"/></svg>
                  </button>
                  <span className="text-[13px] text-[#646462]">4 macros</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <div className="px-4 py-2 text-[12px] font-semibold text-[#646462] uppercase tracking-wide">Macros compartidas</div>
                  {macrosList.map(m => (
                    <button key={m.id} onClick={() => setSelected(m.id)}
                      className={`w-full px-4 py-3 text-left text-[13px] border-b border-[#e9eae6] flex items-center gap-2 ${
                        selected === m.id ? 'bg-[#f0efff] text-[#1a1a1a] font-medium' : 'text-[#1a1a1a] hover:bg-[#f8f8f7]'
                      }`}>
                      {m.emoji && <span>{m.emoji}</span>}
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Detail panel */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-3 border-b border-[#e9eae6] flex-shrink-0">
                  <h2 className="text-[16px] font-semibold text-[#1a1a1a]">{macro.emoji} {macro.label}</h2>
                  <div className="flex items-center gap-2">
                    <button className="text-[13px] text-[#dc2626] font-medium border border-[#e9eae6] rounded-full px-3 py-[5px] hover:bg-red-50">Borrar macro</button>
                    <button className="text-[13px] font-medium border border-[#e9eae6] rounded-full px-3 py-[5px] hover:bg-[#f5f5f4]">Duplicar</button>
                    <button className="text-[13px] font-semibold bg-[#1a1a1a] text-white rounded-full px-4 py-[5px] hover:bg-[#444]">Guardar</button>
                  </div>
                </div>
                <p className="px-6 py-2 text-[12px] text-[#646462] flex-shrink-0">
                  Creado por <span className="font-medium text-[#1a1a1a]">Hector Vidal Sanchez</span> 1 hora atrás · Todavía no se ha usado
                </p>
                <div className="flex-1 overflow-y-auto px-6 py-3">
                  <div className="border border-[#e9eae6] rounded-[8px] p-4 text-[13px] text-[#1a1a1a] min-h-[120px]">
                    <p>👋 Hi <span className="bg-[#ede9fe] text-[#7c3aed] rounded px-1 text-[12px]">A First name</span>,</p>
                    <p className="mt-2">Unfortunately this is not a feature we support at the moment. However, we've logged your request with the product team. Thanks!</p>
                    <p className="mt-2">Thanks!</p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="bg-[#d1fae5] text-[#065f46] text-[12px] font-medium rounded-full px-3 py-1 flex items-center gap-1">✓ Cerrar <span className="opacity-50">+</span></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TicketsView ───────────────────────────────────────────────────────────────

function TicketsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'tipos' | 'estados' | 'portal'>('tipos');
  const tabs = [
    { id: 'tipos'   as const, label: 'Tipos de folios de atención' },
    { id: 'estados' as const, label: 'Estados del folio de atención' },
    { id: 'portal'  as const, label: 'Portal de folios de atención' },
  ];
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Folios de atención</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M8 1v14M3 6l5-5 5 5"/><path d="M2 14h12"/></svg>
                Aprender
              </button>
              {tab === 'tipos'   && <button className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Crear tipo de folio de atención</button>}
              {tab === 'estados' && <button className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Crear estado de folio de atención</button>}
              {tab === 'portal'  && <button className="bg-[#157c3c] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#0f5e2d]">Guardar cambios</button>}
            </div>
          </div>
          {/* Tabs */}
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.id ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === 'tipos' && <>
              <SettingsPromoCard
                title="Clasifica y haz un seguimiento eficaz de los problemas de los clientes"
                description="Usa los folios de atención del cliente para las consultas directas de los clientes, los de back-office para gestionar el trabajo interno o el seguimiento, y los de seguimiento para coordinar cuestiones complejas."
                primaryBtn="+ Crear tipo de folio de atención"
                secondaryBtn="Más información sobre los folios"
                imageSlot={<div className="w-full h-[160px] rounded-[8px] bg-gradient-to-br from-[#fce7f3] to-[#f0abcc] flex items-center justify-center opacity-80"><div className="text-[12px] text-[#9d174d] font-medium">Ticket types preview</div></div>}
              />
              <div className="px-6 py-4 flex flex-col gap-4">
                <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-4">
                    <div className="flex-1"><h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Tipos de folios de atención de clientes (1)</h3><p className="text-[12px] text-[#646462]">Recopila toda la información que necesitas, haz un seguimiento del progreso y mantén a los clientes actualizados en tiempo real.</p></div>
                  </div>
                  <table className="w-full text-[13px] border-t border-[#e9eae6]">
                    <thead><tr className="border-b border-[#e9eae6] bg-[#fafaf9]"><th className="text-left px-4 py-2 font-semibold text-[#1a1a1a] w-[200px]">Nombre</th><th className="text-left px-4 py-2 font-semibold text-[#1a1a1a]">Descripción</th><th className="text-left px-4 py-2 font-semibold text-[#1a1a1a] w-[120px]">Creado el</th><th className="w-[40px]"></th></tr></thead>
                    <tbody><tr><td className="px-4 py-4"><span className="font-medium text-[#1a1a1a]">🎫 Tickets</span></td><td className="px-4 py-4 text-[#646462]">When a customer query can't be instantly resolved, convert to a support request ticket.</td><td className="px-4 py-4 text-[#646462]">1 hora atrás</td><td className="px-4 py-4"><button className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]"><svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M11 2l3 3-9 9-4 1 1-4 9-9z"/></svg></button></td></tr></tbody>
                  </table>
                </div>
                <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-4"><div className="flex-1"><h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Tipos de folios de atención de seguimiento</h3><p className="text-[12px] text-[#646462]">Administra todas las conversaciones relacionadas con un problema generalizado con un solo folio de atención.</p></div></div>
                  <div className="border-t border-[#e9eae6] px-4 py-6 flex flex-col items-center gap-3"><p className="text-[13px] text-[#646462]">No has creado ningún tipo de folio de atención Seguimiento</p><button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold">+ Crear tipo de ticket</button></div>
                </div>
                <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                  <div className="flex items-start gap-3 px-4 py-4"><div className="flex-1"><h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-0.5">Tipos de folios de atención de back-office</h3><p className="text-[12px] text-[#646462]">Asigna un folio de atención separado a tus equipos administrativos y colabora en privado con notas internas.</p></div></div>
                  <div className="border-t border-[#e9eae6] px-4 py-6 flex flex-col items-center gap-3"><p className="text-[13px] text-[#646462]">No has creado ningún tipo de folio de atención Back-office</p><button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold">+ Crear tipo de ticket</button></div>
                </div>
              </div>
            </>}

            {tab === 'estados' && <>
              <SettingsPromoCard
                title="Seguimiento del progreso con los estados de los folios de atención"
                description="Los estados de los folios de atención proporcionan una visión clara del recorrido de un folio, desde abierto hasta resuelto. Personalízalos para que se ajusten a tu flujo de trabajo de asistencia y asegúrate de que cada paso queda registrado y organizado."
                primaryBtn="+ Crear estado de folio de atención"
                secondaryBtn="Estados del folio de atención"
                imageSlot={<div className="w-full h-[130px] rounded-[8px] bg-[#f0f4ff] flex flex-col gap-1.5 p-3 justify-center"><div className="h-7 bg-white rounded border border-[#e0e7ff] flex items-center px-2 text-[11px] text-[#646462]">Update ticket state</div>{[{c:'#ef4444',l:'In review'},{c:'#f97316',l:'Processing'},{c:'#eab308',l:'Proof of address needed'},{c:'#22c55e',l:'Refund approved'}].map(s=><div key={s.l} className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:s.c}}/><span className="text-[11px] text-[#1a1a1a]">{s.l}</span></div>)}</div>}
              />
              {/* Filter toggle */}
              <div className="mx-6 mb-4 border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-[#1a1a1a]">Filtro de buzón para el estado del folio de atención</p>
                  <p className="text-[12px] text-[#646462] mt-0.5">Los compañeros de equipo pueden filtrar los folios de atención por categoría de estado en el buzón.</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-8 h-[18px] rounded-full bg-[#f97316] relative flex-shrink-0"><div className="absolute right-0.5 top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow"/></div>
                  <span className="text-[12px] text-[#1a1a1a] whitespace-nowrap">Habilitar filtros de estado del folio de atención en el buzón.</span>
                </div>
              </div>
              {/* State groups */}
              {[
                { color: '#3b82f6', label: 'Enviado', count: 1, row: { internal: 'Submitted', client: 'Submitted' } },
                { color: '#f97316', label: 'En curso', count: 1, row: { internal: 'In progress', client: 'In progress' } },
                { color: '#eab308', label: 'Esperando al cliente', count: 1, row: { internal: 'Waiting on customer', client: 'Waiting on you' } },
                { color: '#22c55e', label: 'Resuelto', count: 1, row: { internal: 'Resolved', client: 'Resolved' } },
              ].map(group => (
                <div key={group.label} className="mx-6 mb-3 border border-[#e9eae6] rounded-[10px] overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e9eae6]">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{background: group.color}} />
                    <span className="text-[13px] font-semibold text-[#1a1a1a]">{group.label} ({group.count})</span>
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462] ml-1"><path d="M4 6l4 4 4-4"/></svg>
                  </div>
                  <table className="w-full text-[12px]">
                    <thead><tr className="border-b border-[#e9eae6] bg-[#fafaf9]"><th className="text-left px-4 py-2 font-medium text-[#646462] w-1/3">Etiqueta visible internamente</th><th className="text-left px-4 py-2 font-medium text-[#646462] w-1/3">Etiqueta visible para tus clientes <span className="text-[#aaa]">?</span></th><th className="text-left px-4 py-2 font-medium text-[#646462]">Tipos de folios de atención conectados</th></tr></thead>
                    <tbody><tr className="border-t border-[#e9eae6]">
                      <td className="px-4 py-3"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full inline-block" style={{background:group.color}}/><span className="font-medium text-[#1a1a1a]">{group.row.internal}</span></span></td>
                      <td className="px-4 py-3 text-[#646462]">{group.row.client}</td>
                      <td className="px-4 py-3 flex items-center justify-between"><span className="text-[#646462]">🎫 Tickets</span><button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#f3f3f1]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M11 2l3 3-9 9-4 1 1-4 9-9z"/></svg></button></td>
                    </tr></tbody>
                  </table>
                </div>
              ))}
            </>}

            {tab === 'portal' && <>
              <SettingsPromoCard
                title="Permitir que los clientes vean y administren sus folios de atención"
                description="Ofrece a tus clientes una visión clara de sus solicitudes de asistencia para permitirles seguir el progreso, revisar las actualizaciones y mantenerse informados, todo en un mismo lugar, ya sea a través de Messenger o del centro de ayuda."
                primaryBtn="Portal de folios de atención"
                secondaryBtn=""
                imageSlot={<img src={IMG_TICKETS_PORTAL} alt="Portal preview" className="w-full h-[206px] rounded-[8px] object-cover" data-node-id="1:24913" />}
              />
              <div className="px-6 pb-6 flex flex-col gap-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462]">REQUISITOS PREVIOS</p>
                <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden divide-y divide-[#e9eae6]">
                  {[
                    { icon: '💬', title: 'El mensajero de Intercom está instalado para los usuarios que han iniciado sesión.', desc: 'Para identificar a los usuarios, se debe instalar Intercom para los usuarios que hayan iniciado sesión en el sitio.' },
                    { icon: '🍪', title: 'Configuración del dominio personalizado y el reenvío de cookies del centro de ayuda', desc: 'Las cookies se utilizan para autenticar a los usuarios que han iniciado sesión en el portal.', warning: 'No pudimos verificar si el reenvío de cookies está funcionando en tu centro de ayuda. Si tu portal de folios de atención no funciona, consulta nuestra documentación' },
                    { icon: '🔒', title: 'Seguridad de Messenger con JWT.', desc: 'Para proteger el portal de folios de atención de la suplantación de identidad de los usuarios, la seguridad de Messenger con JWT debe estar habilitada en tu espacio de trabajo.' },
                    { icon: '🏢', title: 'Evitar las actualizaciones de atributos de empresas a través de Messenger', desc: 'Para proteger el portal de folios de atención de la suplantación de empresas, debes evitar las actualizaciones de atributos de empresas a través del Messenger.' },
                  ].map(req => (
                    <div key={req.title} className="px-5 py-4">
                      <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">{req.title}</p>
                      <p className="text-[12px] text-[#646462]">{req.desc}</p>
                      {req.warning && <div className="mt-2 flex items-start gap-2 bg-[#fffbeb] border border-[#fde68a] rounded-[6px] px-3 py-2"><span className="text-[#b45309] text-[12px]">⚠ {req.warning}</span></div>}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mt-2">AJUSTES DEL PORTAL DE FOLIOS DE ATENCIÓN</p>
                <div className="border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-start gap-8">
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Portal de folios de atención</p>
                    <p className="text-[12px] text-[#646462]">Se puede acceder al portal de folios de atención desde el Centro de ayuda y esto permite a tus clientes ver todos los folios de atención relacionados con su empresa.</p>
                  </div>
                  <div className="flex flex-col gap-3 flex-shrink-0 w-[320px]">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-[18px] rounded-full bg-[#e9eae6] relative flex-shrink-0"><div className="absolute left-0.5 top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow"/></div>
                      <span className="text-[12px] text-[#646462]">Habilitar el portal de folios de atención</span>
                    </div>
                    <div>
                      <p className="text-[12px] font-medium text-[#1a1a1a] mb-1">URL del portal de folios de atención</p>
                      <div className="flex items-center gap-2">
                        <input readOnly value="intercom.help/acme-fed2de5d0a6a/en/tickets" className="flex-1 border border-[#e9eae6] rounded-[6px] px-3 py-1.5 text-[12px] text-[#646462] bg-[#fafaf9]" />
                        <button className="border border-[#e9eae6] rounded-[6px] px-3 py-1.5 text-[12px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]">Copiar</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SlaView ───────────────────────────────────────────────────────────────────

function SlaView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">SLA</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M8 1v14M3 6l5-5 5 5"/><path d="M2 14h12"/></svg>
              Aprender
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-4">
            <div className="rounded-[12px] bg-[#f8f7ff] border border-[#e9eae6] p-6 flex items-start gap-6 relative">
              <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
              </button>
              <div className="flex-1 max-w-[500px]">
                <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2">Acuerdos de nivel de servicio (SLA)</h2>
                <p className="text-[13px] text-[#646462] mb-4">Los SLA te ayudan a establecer objetivos para que tu equipo proporcione una experiencia del cliente uniforme y de alta calidad. Al crear los SLA, puedes brindarle a cada cliente el nivel perfecto de asistencia.</p>
                <div className="flex items-center gap-3">
                  <button className="bg-[#7c3aed] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#6d28d9]">Get the feature</button>
                  <button className="flex items-center gap-1 text-[13px] text-[#646462] hover:text-[#1a1a1a]">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><rect x="2" y="4" width="12" height="9" rx="1.5"/><rect x="5" y="1" width="6" height="4" rx="1"/></svg>
                    Acuerdos de nivel de servicio para conversaciones y folios de atención
                  </button>
                </div>
              </div>
              <img src={IMG_SLA_BANNER} alt="SLA preview" className="w-[458px] h-[213px] flex-shrink-0 rounded-[8px] object-cover" data-node-id="1:26051" />
            </div>
            {/* Empty state */}
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <svg viewBox="0 0 40 40" className="w-10 h-10 fill-none stroke-[#ccc]" strokeWidth="1.5"><circle cx="20" cy="20" r="17"/><path d="M20 11v9l5 5"/></svg>
              <p className="text-[14px] font-semibold text-[#1a1a1a]">Aún no se han creado SLA</p>
              <a href="#" className="text-[13px] text-[#3b59f6] underline">Los SLA están limitados a planes específicos y configurados a través de flujos de trabajo.</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AiInboxView ───────────────────────────────────────────────────────────────

function AiInboxView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [copilot, setCopilot] = useState(true);
  const [redactar, setRedactar] = useState(true);
  const [autocompletar, setAutocompletar] = useState(true);

  function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    return (
      <button onClick={onToggle} className={`w-8 h-[18px] rounded-full relative flex-shrink-0 transition-colors ${on ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}>
        <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${on ? 'right-0.5' : 'left-0.5'}`}/>
      </button>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Buzón de IA</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M8 1v14M3 6l5-5 5 5"/><path d="M2 14h12"/></svg>
              Más información
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-8 flex flex-col gap-6">
            {/* Copilot */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle on={copilot} onToggle={() => setCopilot(v => !v)} />
                <h4 className="text-[14px] font-semibold text-[#1a1a1a]">Copilot</h4>
              </div>
              <p className="text-[13px] text-[#646462] ml-11">Un asistente personal de IA, impulsado por contenido y conversaciones pasadas.</p>
              <div className="ml-11 mt-2 flex items-center justify-between bg-[#f8f8f7] rounded-[8px] px-4 py-3">
                <div>
                  <p className="text-[13px] font-semibold text-[#1a1a1a]">Uso ilimitado: 1 compañeros de equipo • Uso incluido: 0 compañeros de equipo</p>
                  <p className="text-[12px] text-[#646462]">Administra el acceso para actualizar a los compañeros de equipo que necesitan un uso ilimitado.</p>
                </div>
                <button className="ml-4 flex-shrink-0 border border-[#e9eae6] rounded-full px-4 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]">Administrar el acceso</button>
              </div>
            </div>
            <div className="border-t border-[#e9eae6]" />
            {/* Redactar */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle on={redactar} onToggle={() => setRedactar(v => !v)} />
                <h4 className="text-[14px] font-semibold text-[#1a1a1a]">Redactar y resumir con AI</h4>
              </div>
              <p className="text-[13px] text-[#646462] ml-11">Ajustar las respuestas y utilizar resúmenes</p>
              <ul className="ml-14 mt-1 flex flex-col gap-1 list-disc text-[13px] text-[#1a1a1a]">
                <li>Ampliar, reformular, cambiar a tono formal, hacer más amigable, corregir ortografía y gramática</li>
                <li>Traducir</li>
                <li className="flex items-center gap-2 list-none -ml-3">
                  <span className="text-[#646462]">•</span>
                  <span>Ajustar a mi tono</span>
                  <span className="bg-[#7c3aed] text-white text-[11px] px-2 py-0.5 rounded-full font-medium">Obtener funcionalidad</span>
                </li>
                <li>Resume las conversaciones con un clic o utilizando automáticamente flujos de trabajo. <span className="text-[#3b59f6]">Más información</span>.</li>
              </ul>
            </div>
            <div className="border-t border-[#e9eae6]" />
            {/* Autocompletar */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Toggle on={autocompletar} onToggle={() => setAutocompletar(v => !v)} />
                <h4 className="text-[14px] font-semibold text-[#1a1a1a]">Autocompletar con IA</h4>
              </div>
              <p className="text-[13px] text-[#646462] ml-11">Generar título y descripción del folio de atención automáticamente</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AutomationView ────────────────────────────────────────────────────────────

function AutomationView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Automatización</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M13 3H3v10h10V3z"/><path d="M3 7h10M7 3v10"/></svg>
              Ir a Flujos de trabajo
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6 flex flex-col gap-4">
            {/* Card 1: Identidad */}
            <div className="border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-[8px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-[#646462]" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/></svg>
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-[#1a1a1a]">Elige una identidad para los bots de Fin y de los flujos de trabajo</p>
                <p className="text-[12px] text-[#646462] mt-0.5">Personaliza la foto de perfil de Fin y el nombre. Esta identidad también se utilizará para los bots en los flujos de trabajo.</p>
              </div>
              <button className="flex-shrink-0 flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-4 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></svg>
                Ajustes de Fin
              </button>
            </div>
            {/* Accordion items */}
            {[
              { title: 'Activar el Inbox del bot', desc: 'Mantén tus conversaciones en un buzón independiente mientras Fin AI Agent y los flujos de trabajo están activos al comienzo de una…' },
              { title: 'Cierre automático de conversaciones de flujo de trabajo abandonadas', desc: 'Si un cliente no ha respondido en 3 minutos, la conversación se cerrará automáticamente. Otras respuestas reabrirán la conversación.' },
            ].map(item => (
              <div key={item.title} className="border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-[8px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M9 12l2 2 4-4"/></svg>
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-[#1a1a1a]">{item.title}</p>
                  <p className="text-[12px] text-[#646462] mt-0.5">{item.desc}</p>
                </div>
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462] flex-shrink-0"><path d="M6 4l4 4-4 4"/></svg>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AppStoreView ──────────────────────────────────────────────────────────────

const APP_STORE_APPS = [
  { name: 'Salesforce', color: '#00A1E0', icon: '☁️', desc: 'Sync data and streamline workflows for sales, marketing…' },
  { name: 'Instagram',  color: '#E1306C', icon: '📷', desc: 'Easily reply to Instagram private messages from your…' },
  { name: 'Google Analytics', color: '#F4B400', icon: '📊', desc: 'Measure the impact of your Messenger on website…' },
  { name: 'Jira for Tickets',  color: '#0052CC', icon: '◆', desc: 'Create Jira issues from Intercom and automate with…' },
];

function AppCard({ name, icon, desc }: { name: string; icon: string; desc: string }) {
  return (
    <div className="border border-[#e9eae6] rounded-[10px] p-4 flex flex-col gap-2 hover:border-[#c8c9c4] cursor-pointer">
      <div className="w-10 h-10 rounded-[8px] bg-[#f3f3f1] flex items-center justify-center text-xl">{icon}</div>
      <p className="text-[13px] font-semibold text-[#1a1a1a]">{name}</p>
      <p className="text-[12px] text-[#646462]">{desc}</p>
    </div>
  );
}

function AppStoreView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [search, setSearch] = useState('');
  const categories = ['Todas las colecciones', 'Popular', 'New & noteworthy', 'Gratis', 'Para equipos de soporte'];
  const [activeCategory, setActiveCategory] = useState('Todas las colecciones');

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">App Store</h1>
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462] absolute left-2.5 top-1/2 -translate-y-1/2" strokeWidth="1.5"><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search for an app..." className="border border-[#e9eae6] rounded-full pl-8 pr-3 py-[6px] text-[13px] w-48 focus:outline-none focus:border-[#3b59f6]" />
              </div>
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
              </button>
            </div>
          </div>
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left categories sidebar */}
            <div className="w-[200px] flex-shrink-0 border-r border-[#e9eae6] flex flex-col overflow-y-auto">
              <div className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Manage</p>
                {['Your installed apps'].map(item => <button key={item} className="w-full text-left px-2 py-1.5 text-[13px] text-[#1a1a1a] hover:bg-[#f3f3f1] rounded-[6px]">{item}</button>)}
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Featured</p>
                {categories.map(cat => <button key={cat} onClick={() => setActiveCategory(cat)} className={`w-full text-left px-2 py-1.5 text-[13px] rounded-[6px] ${activeCategory === cat ? 'bg-[#f3f3f1] font-medium text-[#1a1a1a]' : 'text-[#1a1a1a] hover:bg-[#f3f3f1]'}`}>{cat}</button>)}
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Works with</p>
                {['Outbound', 'Help Desk', 'Automations', 'Messenger'].map(item => <button key={item} className="w-full text-left px-2 py-1.5 text-[13px] text-[#1a1a1a] hover:bg-[#f3f3f1] rounded-[6px]">{item}</button>)}
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Categories</p>
                {['Analytics', 'Automation', 'CRM', 'Data & Enrichment', 'For AI & Automation', 'For marketing teams', 'For sales teams', 'For Support Admins', 'For Support Agents', 'Issue tracking & ticketing', 'Lead capture', 'Marketing automation', 'Phone & video', 'Scheduling', 'Surveys & Feedback'].map(item => <button key={item} className="w-full text-left px-2 py-1.5 text-[12px] text-[#646462] hover:text-[#1a1a1a] hover:bg-[#f3f3f1] rounded-[6px]">{item}</button>)}
              </div>
            </div>
            {/* Main content */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
              {/* Banner cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="h-[130px] rounded-[12px] bg-[#0d9488] flex items-center justify-center text-white font-bold text-[18px]">Built by Intercom</div>
                <div className="h-[130px] rounded-[12px] bg-[#dc2626] flex items-center justify-center text-white font-bold text-[18px]">Seamlessly schedule meetings</div>
              </div>
              {/* Popular */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[15px] font-semibold text-[#1a1a1a]">Popular</p>
                  <button className="text-[13px] text-[#3b59f6] hover:underline">See all →</button>
                </div>
                <div className="grid grid-cols-4 gap-3">{APP_STORE_APPS.map(a => <AppCard key={a.name} name={a.name} icon={a.icon} desc={a.desc} />)}</div>
              </div>
              {/* New & noteworthy */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[15px] font-semibold text-[#1a1a1a]">New & noteworthy</p>
                  <button className="text-[13px] text-[#3b59f6] hover:underline">See all →</button>
                </div>
                <div className="grid grid-cols-4 gap-3">{[...APP_STORE_APPS].reverse().map(a => <AppCard key={a.name} name={a.name} icon={a.icon} desc={a.desc} />)}</div>
              </div>
              {/* Free apps */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[15px] font-semibold text-[#1a1a1a]">Free apps to install</p>
                  <button className="text-[13px] text-[#3b59f6] hover:underline">See all →</button>
                </div>
                <div className="grid grid-cols-4 gap-3">{APP_STORE_APPS.map(a => <AppCard key={a.name} name={a.name} icon={a.icon} desc={a.desc} />)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ConnectorsView ────────────────────────────────────────────────────────────

const CONNECTOR_CARDS = [
  { icon: '+', label: 'Crear desde cero', bg: '#f3f3f1', textColor: '#646462' },
  { icon: '⚡', label: 'MCP personalizado', bg: '#fef3c7', textColor: '#92400e' },
  { icon: '$', label: 'Stripe', bg: '#dbeafe', textColor: '#1e40af' },
  { icon: '◐', label: 'Linear', bg: '#e0e7ff', textColor: '#4338ca' },
  { icon: '🛍', label: 'Shopify Storefront', bg: '#dcfce7', textColor: '#166534' },
  { icon: '📖', label: 'Uso de conectores de datos para la automatización', bg: '#f5f3ff', textColor: '#6d28d9' },
];

function ConnectorsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Conectores de datos</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
              </button>
              <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nuevo</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-12 py-12 flex flex-col items-center">
            <h2 className="text-[28px] font-bold text-[#1a1a1a] text-center mb-3 leading-tight">Incorpore datos de sus clientes<br/>en tiempo real en Intercom</h2>
            <p className="text-[14px] text-[#646462] text-center mb-10 max-w-[600px]">Conéctese a cualquier sistema externo o API personalizada con Conectores de datos sin código. Impulse Fin y el servicio de asistencia con datos en tiempo real para ofrecer asistencia más personalizada.</p>
            <div className="grid grid-cols-3 gap-4 w-full max-w-[800px]">
              {CONNECTOR_CARDS.map(card => (
                <button key={card.label} className="border border-[#e9eae6] rounded-[12px] p-5 flex flex-col items-start gap-4 text-left hover:border-[#c8c9c4] hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-[8px] flex items-center justify-center text-[18px] font-bold" style={{ background: card.bg, color: card.textColor }}>{card.icon}</div>
                  <p className="text-[13px] font-semibold text-[#1a1a1a]">{card.label}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── LabelsView ────────────────────────────────────────────────────────────────

function LabelsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [search, setSearch] = useState('');
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Etiquetas</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
              </button>
              <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nueva etiqueta</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar etiquetas..." className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] mb-4 focus:outline-none focus:border-[#3b59f6]" />
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-[#e9eae6]">
                {['Nombre de la etiqueta', 'Creado', 'Creado por', 'Personas:', 'Empresas', 'Conversaciones', 'Mensajes'].map(h => (
                  <th key={h} className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">{h} <span className="text-[#ccc]">↕</span></th>
                ))}
              </tr></thead>
              <tbody><tr className="border-b border-[#f3f3f1] hover:bg-[#fafaf9]">
                <td className="px-4 py-3"><span className="flex items-center gap-2"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M2 5l5-3 7 3-5 9-7-9z"/></svg>Feature Request</span></td>
                <td className="px-4 py-3 text-[#646462]">1h ago</td>
                <td className="px-4 py-3 text-[#646462]">—</td>
                <td className="px-4 py-3 text-[#646462]">0</td>
                <td className="px-4 py-3 text-[#646462]">0</td>
                <td className="px-4 py-3 text-[#646462]">0</td>
                <td className="px-4 py-3 text-[#646462]">0</td>
              </tr></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PeopleView (with 6 tabs) ──────────────────────────────────────────────────

function PeopleView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'atributos' | 'segmentos' | 'eventos' | 'bot' | 'eliminar' | 'bloqueado'>('atributos');
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
              {tab === 'atributos' && <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Crear atributo</button>}
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
          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === 'atributos' && <>
              <div className="m-6 bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-6 flex items-start gap-6 relative">
                <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
                <div className="flex-1">
                  <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2">Envíe datos de clientes para rastrear, segmentar y personalizar la experiencia de sus clientes</h2>
                  <p className="text-[13px] text-[#646462] mb-3">Puedes usar estos datos como contexto en el buzón, como reglas para automatizaciones, audiencia para mensajes salientes y mucho más.</p>
                  <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><rect x="2" y="4" width="12" height="9" rx="1.5"/></svg>Cómo enviar atributos de usuario personalizados</button>
                </div>
                <div className="w-[270px] bg-white border border-[#e9eae6] rounded-[8px] p-4 flex-shrink-0">
                  <p className="text-[10px] font-semibold uppercase text-[#646462] tracking-wider mb-2">USER DATA</p>
                  {[['Name','Luis Easton'],['Company','Acme'],['Location','London'],['Plan','Premium'],['Lifetime value','$40k'],['# of projects','234']].map(([k,v]) => (
                    <div key={k} className="flex items-center justify-between py-1 text-[12px]"><span className="text-[#646462]">{k}</span><span className="text-[#1a1a1a] font-medium">{v}</span></div>
                  ))}
                </div>
              </div>
              <div className="px-6 pb-6">
                <input placeholder="🔍  Nombre del campo..." className="w-full max-w-[380px] border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] mb-3 focus:outline-none focus:border-[#3b59f6]" />
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[#e9eae6]"><th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Nombre del atributo</th><th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Protecciones de atributos</th><th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Formato</th><th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Creado</th><th className="w-[40px]"></th></tr></thead>
                  <tbody>
                    {[
                      { icon: '👥', name: 'Name', desc: "A person's full name", protect: 'Deshabilitado', format: 'Texto' },
                      { icon: '🏢', name: 'Account', desc: 'The account that owns a lead or user in Intercom', protect: '', format: 'Cuenta' },
                      { icon: '🏢', name: 'Account name', desc: 'The name of the account that owns a lead or user in Intercom', protect: '', format: 'Texto' },
                      { icon: '👤', name: 'Owner', desc: 'The teammate that owns a lead or user in Intercom', protect: '', format: 'Compañero de equipo' },
                    ].map(r => (
                      <tr key={r.name} className="border-b border-[#f3f3f1] hover:bg-[#fafaf9]">
                        <td className="px-4 py-3"><div className="flex items-start gap-2"><span>{r.icon}</span><div><p className="font-medium text-[#1a1a1a]">{r.name}</p><p className="text-[12px] text-[#646462]">{r.desc}</p></div></div></td>
                        <td className="px-4 py-3">{r.protect && <span className="bg-[#fef3c7] text-[#92400e] text-[11px] px-2 py-0.5 rounded-full font-medium">{r.protect}</span>}</td>
                        <td className="px-4 py-3 text-[#646462]">{r.format}</td>
                        <td className="px-4 py-3 text-[#646462]">1 hora atrás</td>
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

            {tab === 'bot' && (
              <div className="px-6 py-4 flex gap-6">
                <div className="flex-1">
                  <p className="text-[13px] text-[#646462] mb-2">Elige los datos que deseas usar para calificar a los clientes potenciales. Estos datos aparecerán en los perfiles de los clientes en Inbox, y también puedes recopilarlos con Automatización.</p>
                  <a href="#" className="text-[13px] text-[#3b59f6] underline">Ver el Bot de Tareas de cualificación básica</a>
                  <div className="mt-4 flex flex-col gap-2">
                    {[
                      ['Name', "A person's full name"],
                      ['Email', 'The email address assigned to a user or lead'],
                      ['Phone', "A person's phone number"],
                      ['Company name', 'The name of a company'],
                      ['Company size', 'The number of people employed in this company, expressed as a single number'],
                      ['Company website', "The web address for the company's primary marketing site"],
                      ['Company industry', "The category or domain this company belongs to e.g. 'ecommerce' or 'SaaS'"],
                    ].map(([name, desc]) => (
                      <div key={name} className="flex items-center justify-between py-2 px-3 border-b border-[#f3f3f1] text-[13px]">
                        <div className="flex items-center gap-3"><span className="font-medium text-[#1a1a1a] w-[120px]">{name}</span><span className="text-[#646462] flex-1">{desc}</span></div>
                        <button className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
                      </div>
                    ))}
                  </div>
                  <button className="mt-4 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">Agregar datos</button>
                  <p className="text-[12px] text-[#646462] mt-3">Cambiar esta configuración modificará los datos de calificación visibles en todos los perfiles de usuarios y leads.</p>
                </div>
                <div className="w-[200px] flex-shrink-0">
                  <div className="border border-[#e0e7ff] bg-[#f5f7ff] rounded-[12px] p-4">
                    <div className="flex items-center justify-center w-12 h-12 bg-[#e0e7ff] rounded-full mb-3">👤</div>
                    <p className="text-[12px] font-semibold text-[#1a1a1a] mb-3">Qualification</p>
                    {[1,2,3].map(i => <div key={i} className="h-2 bg-[#dbeafe] rounded mb-2" />)}
                  </div>
                </div>
              </div>
            )}

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

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────

export default function Prototype() {
  const [view, setView] = useState<View>('inbox');

  function renderView() {
    switch (view) {
      case 'inbox':    return <InboxView />;
      case 'allLeads': return <AllLeadsView view={view} onNavigate={setView} onBack={() => setView('contacts')} />;
      case 'contacts': return <ContactsView view={view} onNavigate={setView} onBack={() => setView('inbox')} />;
      case 'settings': return <SettingsView view={view} onNavigate={setView} onBack={() => setView('inbox')} />;
      case 'imports':  return <ImportsView view={view} onNavigate={setView} onBack={() => setView('inbox')} />;
      case 'personal': return <PersonalView view={view} onNavigate={setView} />;
      case 'security':       return <SecurityView view={view} onNavigate={setView} onBack={() => setView('personal')} />;
      case 'notifications':  return <NotificationsView view={view} onNavigate={setView} />;
      case 'visible':        return <VisibleView view={view} onNavigate={setView} />;
      case 'tokens':         return <TokensView view={view} onNavigate={setView} />;
      case 'accountAccess':  return <AccountAccessView view={view} onNavigate={setView} />;
      case 'multilingual':   return <MultilingualView view={view} onNavigate={setView} />;
      case 'assignments':    return <AssignmentsView view={view} onNavigate={setView} />;
      case 'macros':         return <MacrosView view={view} onNavigate={setView} />;
      case 'tickets':        return <TicketsView view={view} onNavigate={setView} />;
      case 'sla':            return <SlaView view={view} onNavigate={setView} />;
      case 'aiInbox':        return <AiInboxView view={view} onNavigate={setView} />;
      case 'automation':     return <AutomationView view={view} onNavigate={setView} />;
      case 'appStore':       return <AppStoreView view={view} onNavigate={setView} />;
      case 'connectors':     return <ConnectorsView view={view} onNavigate={setView} />;
      case 'labels':         return <LabelsView view={view} onNavigate={setView} />;
      case 'people':         return <PeopleView view={view} onNavigate={setView} />;
      case 'fin':            return <WIPView label="Fin AI" />;
      case 'knowledge':return <WIPView label="Knowledge Base" />;
      case 'reports':  return <WIPView label="Reports" />;
      case 'outbound': return <WIPView label="Outbound" />;
    }
  }

  return (
    <div
      className="flex bg-[#f3f3f1] overflow-hidden w-screen h-screen min-w-0"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <LeftNav view={view} onNavigate={setView} />
      {renderView()}
    </div>
  );
}
