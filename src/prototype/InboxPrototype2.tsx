// ─────────────────────────────────────────────────────────────────────────────
// Intercom Inbox – Messenger view prototype (pixel-faithful Figma replica)
// Screen 2: node-id=1-126478  — Messenger channel view + Copilot sidebar
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared icon URLs (reused from screen 1 / same Figma file) ────────────────
const ICON_INBOX       = "https://www.figma.com/api/mcp/asset/210fe23a-321b-4e1f-8a00-dce6a7ba2224";
const ICON_FIN         = "https://www.figma.com/api/mcp/asset/570eff6a-8bff-4de1-8840-e6b108abdaef";
const ICON_KNOWLEDGE   = "https://www.figma.com/api/mcp/asset/39d9a7c0-cb9e-4d44-ab69-82d4a69df5ec";
const ICON_REPORTS     = "https://www.figma.com/api/mcp/asset/eb0b09a0-b9cb-47d5-a21b-1b8e674f7a07";
const ICON_OUTBOUND    = "https://www.figma.com/api/mcp/asset/4943ae31-0a7f-4f9e-b7f1-531cb824672b";
const ICON_CONTACTS    = "https://www.figma.com/api/mcp/asset/ac85e608-1800-4a92-888b-a0736c0ad1cb";
const ICON_SETUP       = "https://www.figma.com/api/mcp/asset/03ddd5ca-ae84-45f0-b396-13623cda163d";
const ICON_SEARCH      = "https://www.figma.com/api/mcp/asset/157d21c6-472b-4644-b914-342f6f402379";
const ICON_SETTINGS    = "https://www.figma.com/api/mcp/asset/0c20b532-867a-4850-94e0-76c877557291";
const AVATAR_ME        = "https://www.figma.com/api/mcp/asset/fdbcb0bb-66a3-46e8-8cef-98ab237005fb";

// Sidebar nav icons
const ICON_SEARCH2     = "https://www.figma.com/api/mcp/asset/7ae31e0e-7c64-4d74-88eb-26fec615c318";
const ICON_MENTION     = "https://www.figma.com/api/mcp/asset/5cdb4ac9-f6f6-429c-9e37-1b69d5354f61";
const ICON_CREATED     = "https://www.figma.com/api/mcp/asset/6d8fae1a-f24a-4f06-b7f6-e9a13607c786";
const ICON_ALL         = "https://www.figma.com/api/mcp/asset/a8ea4e88-c431-466f-aeaa-409fbd2d279b";
const ICON_UNASSIGNED  = "https://www.figma.com/api/mcp/asset/d4ce9938-4911-4591-b203-51c5e9f5e29a";
const ICON_SPAM        = "https://www.figma.com/api/mcp/asset/670c2105-4750-43a3-92ca-4a987cd622b9";
const ICON_DASHBOARD   = "https://www.figma.com/api/mcp/asset/52a63b14-d63b-40b9-ac9e-c938980a6422";
const ICON_FIN_SVC     = "https://www.figma.com/api/mcp/asset/a6fd2023-c8b4-4e74-ba64-68f8d2ead3eb";
const ICON_RESOLVED    = "https://www.figma.com/api/mcp/asset/b3e474e4-d852-436a-851e-ac6b02f7a31e";
const ICON_ESCALATED   = "https://www.figma.com/api/mcp/asset/3378a1db-91fb-4b6c-ad65-90f00593a553";
const ICON_PENDING     = "https://www.figma.com/api/mcp/asset/dce15ce7-404d-42aa-8379-335096edcd6d";
const ICON_MESSENGER   = "https://www.figma.com/api/mcp/asset/58cb798a-ce4d-44df-b7a5-810ba9c4b86f";
const ICON_EMAIL2      = "https://www.figma.com/api/mcp/asset/d5136408-62d4-4975-a210-37e8ef5fd8f8";
const ICON_WHATSAPP2   = "https://www.figma.com/api/mcp/asset/9b827e1b-1423-4423-8fa2-384c229ddaee";
const ICON_PHONE2      = "https://www.figma.com/api/mcp/asset/9d438d3d-3f29-4cdc-9f7b-dc978c121c27";
const ICON_TICKETS     = "https://www.figma.com/api/mcp/asset/1920c81c-1015-4c31-ba53-88064a8b4b07";
const ICON_MANAGE      = "https://www.figma.com/api/mcp/asset/db6eb72f-0b7e-4dfc-a3f8-fa9575c751bf";
const ICON_PLUS        = "https://www.figma.com/api/mcp/asset/ec56a3b5-5680-4188-b2a6-79d8a7f39557";
const ICON_CHEVRON     = "https://www.figma.com/api/mcp/asset/9840147a-dd4b-40b5-86c8-666ae1fec2be";
const ICON_FILTER      = "https://www.figma.com/api/mcp/asset/fa2f16b4-f842-4096-9371-1423c279eaf7";
const ICON_SORT        = "https://www.figma.com/api/mcp/asset/e18e5357-7864-43c2-8a2f-46d5aad4d937";

// Screen 2 specific assets (from Figma MCP node fetches)
const GIF_MESSENGER    = "https://www.figma.com/api/mcp/asset/21ea466a-3d55-4107-9c33-f1f26fc0dd4e";
const ICON_CLOCK       = "https://www.figma.com/api/mcp/asset/03154217-05a5-4f6a-b50a-0f176568f1c2";
const ICON_COPILOT_BTN = "https://www.figma.com/api/mcp/asset/a60ac438-e3f4-4299-8279-4bac5253295a";
const ICON_COPILOT_SND = "https://www.figma.com/api/mcp/asset/5dfe62c7-4d3b-44b6-b3a9-0b00e8f1dd83";

// ── LEFT NAV (44px icon sidebar) — identical to screen 1 ─────────────────────
function Badge({ count }: { count: number }) {
  return (
    <span className="absolute -top-2 -right-2 bg-[#ffccb2] border border-white rounded-full min-w-[15px] h-[15px] flex items-center justify-center text-[11px] font-bold text-[#1a1a1a] px-1">
      {count}
    </span>
  );
}

function LeftNav() {
  return (
    <div className="flex flex-col h-full w-[44px] pt-5 pb-2 bg-[#f3f3f1] rounded-tr-2xl rounded-br-2xl justify-between flex-shrink-0">
      <div className="flex flex-col gap-4 items-center">
        <div className="flex items-center justify-center w-9 h-9 mb-1">
          <img src={ICON_INBOX} alt="Intercom" className="w-6 h-6" />
        </div>
        <div className="flex flex-col gap-1 items-start w-full px-1.5">
          <div className="relative flex items-center justify-center w-full">
            <div className="bg-white w-full h-8 rounded-lg shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] flex items-center justify-center cursor-pointer relative">
              <img src={ICON_INBOX} alt="Inbox" className="w-4 h-4" />
              <Badge count={4} />
            </div>
          </div>
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60 cursor-pointer">
            <img src={ICON_FIN} alt="Fin AI" className="w-4 h-4" />
          </button>
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60 cursor-pointer">
            <img src={ICON_KNOWLEDGE} alt="Knowledge" className="w-4 h-4" />
          </button>
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60 cursor-pointer">
            <img src={ICON_REPORTS} alt="Reports" className="w-4 h-4" />
          </button>
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60 cursor-pointer">
            <img src={ICON_OUTBOUND} alt="Outbound" className="w-4 h-4" />
          </button>
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60 cursor-pointer">
            <img src={ICON_CONTACTS} alt="Contacts" className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1 items-start w-full px-1.5 pb-1">
        <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60 cursor-pointer">
          <img src={ICON_SETUP} alt="Setup" className="w-4 h-4" />
        </button>
        <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60 cursor-pointer">
          <img src={ICON_SEARCH} alt="Search" className="w-4 h-4" />
        </button>
        <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60 cursor-pointer">
          <img src={ICON_SETTINGS} alt="Settings" className="w-4 h-4" />
        </button>
        <div className="w-full h-8 flex items-center justify-center cursor-pointer">
          <div className="relative w-4 h-4 rounded-lg overflow-hidden bg-[#f8f8f7]">
            <img src={AVATAR_ME} alt="Profile" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute bottom-[-2px] right-[-2px] w-[7px] h-[7px] bg-[#158613] rounded-[3.6px] border border-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── INBOX SIDEBAR (236px) — "Messenger" active in Vistas ─────────────────────
function SidebarNavItem({
  icon, label, count, active = false, isAvatar = false,
}: { icon: string; label: string; count?: number; active?: boolean; isAvatar?: boolean }) {
  return (
    <a
      href="#"
      className={`relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] ${
        active
          ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]"
          : "hover:bg-[#e9eae6]/40 text-[#1a1a1a]"
      }`}
    >
      <div className="flex items-center justify-center w-[18px] h-[18px] flex-shrink-0">
        {isAvatar ? (
          <div className="w-4 h-4 rounded-lg overflow-hidden bg-[#f8f8f7]">
            <img src={icon} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <img src={icon} alt="" className="w-4 h-4" />
        )}
      </div>
      <span className="flex-1 leading-4">{label}</span>
      {count !== undefined && (
        <span className={`text-[13px] ${active ? "font-semibold text-[#1a1a1a]" : "text-[#646462]"}`}>{count}</span>
      )}
    </a>
  );
}

function InboxSidebar() {
  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Inbox</span>
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]">
          <img src={ICON_PLUS} alt="+" className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto pl-3 pr-0 pb-4">
        <div className="flex flex-col gap-0.5">
          <SidebarNavItem icon={ICON_SEARCH2} label="Buscar" />
          {/* Tu bandeja de entrada — NOT active in screen 2 */}
          <SidebarNavItem icon={AVATAR_ME} label="Tu bandeja de entrada" count={4} isAvatar />
          <SidebarNavItem icon={ICON_MENTION} label="Menciones" count={0} />
          <SidebarNavItem icon={ICON_CREATED} label="Creado por ti" count={0} />
          <SidebarNavItem icon={ICON_ALL} label="Todo" count={4} />
          <SidebarNavItem icon={ICON_UNASSIGNED} label="Sin asignar" count={0} />
          <SidebarNavItem icon={ICON_SPAM} label="Correo no deseado" count={0} />
          <SidebarNavItem icon={ICON_DASHBOARD} label="Tablero" />
        </div>

        {/* Fin para servicio */}
        <div className="mt-3">
          <div className="flex items-center justify-between h-8 px-3 cursor-pointer">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Fin para servicio</span>
            <div className="flex items-center gap-1">
              <button className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)]">
                <img src={ICON_PLUS} alt="+" className="w-4 h-4" />
              </button>
              <button className="w-5 h-4 flex items-center justify-center">
                <img src={ICON_CHEVRON} alt=">" className="w-4 h-4 rotate-90" />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 pl-1 pr-0">
            <SidebarNavItem icon={ICON_FIN_SVC} label="Todas las conversaciones" />
            <SidebarNavItem icon={ICON_RESOLVED} label="Resuelto" />
            <SidebarNavItem icon={ICON_ESCALATED} label="Escalado y transferencia" />
            <SidebarNavItem icon={ICON_PENDING} label="Pendiente" />
            <SidebarNavItem icon={ICON_SPAM} label="Correo no deseado" />
          </div>
        </div>

        {/* Inbox para el equipo */}
        <div className="mt-3">
          <div className="flex items-center justify-between h-8 px-3 cursor-pointer">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Inbox para el equipo</span>
            <div className="flex items-center gap-1">
              <button className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)]">
                <img src={ICON_PLUS} alt="+" className="w-4 h-4" />
              </button>
              <button className="w-5 h-4 flex items-center justify-center">
                <img src={ICON_CHEVRON} alt=">" className="w-4 h-4 rotate-90" />
              </button>
            </div>
          </div>
        </div>

        {/* Compañeros de equipo */}
        <div className="mt-1">
          <div className="flex items-center justify-between h-8 px-3 cursor-pointer">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Compañeros de equipo</span>
            <div className="flex items-center gap-1">
              <button className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)]">
                <img src={ICON_PLUS} alt="+" className="w-4 h-4" />
              </button>
              <button className="w-5 h-4 flex items-center justify-center">
                <img src={ICON_CHEVRON} alt=">" className="w-4 h-4 rotate-90" />
              </button>
            </div>
          </div>
        </div>

        {/* Vistas — Messenger is ACTIVE */}
        <div className="mt-1">
          <div className="flex items-center justify-between h-8 px-3 cursor-pointer">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Vistas</span>
            <button className="w-5 h-4 flex items-center justify-center">
              <img src={ICON_CHEVRON} alt=">" className="w-4 h-4 rotate-90" />
            </button>
          </div>
          <div className="flex flex-col gap-0.5 pl-1">
            {/* Messenger — active */}
            <SidebarNavItem icon={ICON_MESSENGER} label="Messenger" count={1} active />
            <SidebarNavItem icon={ICON_EMAIL2} label="Email" count={1} />
            <SidebarNavItem icon={ICON_WHATSAPP2} label="WhatsApp & Social" count={1} />
            <SidebarNavItem icon={ICON_PHONE2} label="Phone & SMS" count={1} />
            <SidebarNavItem icon={ICON_TICKETS} label="Tickets" count={0} />
          </div>
        </div>

        {/* Administrar */}
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

// ── CONVERSATION LIST (271px) — 1 conversation, header "Messenger" ────────────
function ConversationList() {
  return (
    <div className="flex flex-col h-full w-[271px] border-l border-[#e9eae6] bg-[#f8f8f7] flex-shrink-0 relative">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4 h-16 sticky top-0">
        <div className="flex items-center gap-2">
          {/* Back arrow */}
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#e9eae6]">
            <img src={ICON_CHEVRON} alt="Back" className="w-4 h-4 -rotate-90" />
          </button>
          <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Messenger</span>
        </div>
        <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#e9eae6]">
          <img src={ICON_SEARCH2} alt="Search" className="w-4 h-4" />
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0">
        <button className="bg-white border border-[#e9eae6] text-[13px] font-semibold text-[#1a1a1a] px-[9px] py-[5px] rounded-full flex items-center gap-1">
          1 Abierta
        </button>
        <div className="flex items-center gap-1">
          <button className="bg-white border border-[#e9eae6] text-[13px] font-semibold text-[#1a1a1a] px-[9px] py-[5px] rounded-full">
            Última actividad
          </button>
          <button className="bg-white border border-[#e9eae6] w-6 h-6 flex items-center justify-center rounded-full">
            <img src={ICON_FILTER} alt="Filter" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Single conversation */}
      <div className="flex-1 overflow-y-auto px-3 pb-16">
        <a
          href="#"
          className="relative flex items-start gap-2 px-3 py-3 rounded-xl cursor-pointer bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]"
        >
          <div className="w-6 h-6 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#9ec5fa]">
            <span className="text-[12px] font-semibold text-[#1a1a1a] uppercase">M</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-semibold text-[#646462] truncate">Messenger · [Demo]</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-[#646462] truncate">Install Messenger</span>
              <span className="text-[13px] text-[#646462] flex-shrink-0 ml-2">6 min</span>
            </div>
          </div>
        </a>
      </div>

      {/* Bottom toggle */}
      <div className="absolute bottom-4 left-6 bg-white border border-[#e9eae6] rounded-full shadow-[0px_8px_8px_rgba(20,20,20,0.15)] flex items-center gap-1 p-[5px]">
        <button className="bg-[#f8f8f7] rounded-full px-3 py-2">
          <img src={ICON_FILTER} alt="" className="w-4 h-4" />
        </button>
        <button className="rounded-full px-3 py-2">
          <img src={ICON_SORT} alt="" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── CONVERSATION PANEL (519px) — Messenger demo messages ─────────────────────
function ConversationPanel() {
  return (
    <div className="flex flex-col h-full w-[519px] bg-white rounded-2xl shadow-[0px_1px_2px_rgba(20,20,20,0.15)] flex-shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-4 pt-4 flex-shrink-0">
        <div className="flex items-center px-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a] truncate">Messenger</h2>
          </div>
          <div className="flex items-center gap-1">
            {/* Snooze */}
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]">
              <img src={ICON_SEARCH2} alt="" className="w-4 h-4" />
            </button>
            {/* Tag – active purple */}
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#e7e2fd] border border-[#c6c9c0] hover:bg-[#d4cffb]">
              <img src={ICON_FIN} alt="" className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]">
              <img src={ICON_KNOWLEDGE} alt="" className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]">
              <img src={ICON_REPORTS} alt="" className="w-4 h-4" />
            </button>
            {/* Resolve */}
            <button className="h-8 px-4 bg-[#222] text-white text-[13px] font-semibold rounded-full hover:bg-[#444] flex items-center gap-1">
              <img src={ICON_RESOLVED} alt="" className="w-4 h-4 invert" />
              <span>Resolver</span>
            </button>
          </div>
        </div>
        <div className="h-[1px] bg-[#e9eae6]" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Message 1 — GIF animation bubble */}
        <div className="flex items-end pl-8 pr-12 mb-4">
          <div className="bg-[#f8f8f7] flex flex-col items-start max-w-[406px] min-w-[128px] py-5 px-4 rounded-tl-[12px] rounded-tr-[12px] rounded-br-[12px]">
            <div className="h-[116.56px] w-[373.82px] rounded-[8px] overflow-hidden relative border border-transparent">
              <img
                alt=""
                src={GIF_MESSENGER}
                className="absolute w-[312.98%] h-[308.85%] top-[-104.43%] left-[-106.49%] max-w-none"
              />
            </div>
          </div>
        </div>

        {/* Message 2 — Text explanation */}
        <div className="flex items-end pl-8 pr-12 mb-4">
          <div className="bg-[#f8f8f7] flex flex-col items-start max-w-[406px] min-w-[128px] py-3 px-4 rounded-tr-[12px] rounded-br-[12px]">
            <div className="flex flex-col font-normal gap-[18px] items-start text-[#1a1a1a] text-[14px] leading-[18px]">
              <div>
                <p className="mb-0">This is a demo message. It shows how a customer</p>
                <p className="mb-0">conversation from the Messenger will look in your</p>
                <p className="mb-0">Inbox. Conversations handled by Fin AI Agent will also</p>
                <p>appear here.</p>
              </div>
              <div>
                <p className="mb-0">Once a channel is installed, all conversations come</p>
                <p className="mb-0">straight to your Inbox, so you can route them to the right</p>
                <p>team.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Message 3 — Install Messenger link + M avatar */}
        <div className="flex items-end gap-2 pl-4 pr-12 mb-4">
          {/* Avatar M */}
          <div className="w-6 h-6 rounded-full bg-[#9ec5fa] flex items-center justify-center flex-shrink-0">
            <span className="text-[14px] font-semibold text-[#1a1a1a]">M</span>
          </div>
          {/* Bubble */}
          <div className="bg-[#f8f8f7] flex flex-col gap-1 items-start max-w-[406px] min-w-[128px] pb-[14px] pt-[11px] px-4 rounded-tr-[12px] rounded-br-[12px] rounded-bl-[12px]">
            <a
              href="https://app.intercom.com/a/apps/b6gvpvyn/settings/channels/messenger/install"
              target="_blank"
              rel="noreferrer"
              className="text-[14px] text-[#165fc6] underline leading-[18px] cursor-pointer"
            >
              Install Messenger
            </a>
            <div className="flex items-center gap-1 mt-1">
              <img src={ICON_CLOCK} alt="" className="w-3 h-3" />
              <span className="text-[13px] text-[#646462] leading-5">5 minutos</span>
            </div>
          </div>
        </div>
      </div>

      {/* Reply composer */}
      <div className="border-t border-[#e9eae6] flex-shrink-0">
        {/* Tab bar */}
        <div className="flex items-center gap-4 px-4 pt-3">
          <button className="text-[13px] font-semibold text-[#1a1a1a] border-b-2 border-[#1a1a1a] pb-1 flex items-center gap-1">
            Responder
            <img src={ICON_CHEVRON} alt="" className="w-3 h-3 rotate-90" />
          </button>
          <button className="text-[13px] text-[#646462] pb-1">Nota interna</button>
          <button className="text-[13px] text-[#646462] pb-1">Datos de la IA</button>
        </div>

        {/* Composer */}
        <div className="px-4 py-3">
          <div className="border border-[#e9eae6] rounded-2xl overflow-hidden relative">
            {/* Keyboard shortcut hint overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-white border border-[#e9eae6] rounded-xl px-3 py-2 shadow-sm text-[13px] text-[#1a1a1a] flex flex-col gap-1">
                <p className="text-[#646462]">⚡️ Consejo profesional: presiona</p>
                <div className="flex items-center gap-1">
                  {["Ctrl", "Shift", "Enter"].map((k) => (
                    <span key={k} className="bg-[#f8f8f7] border border-[#e9eae6] rounded px-1.5 py-0.5 text-[12px] font-semibold text-[#1a1a1a]">{k}</span>
                  ))}
                  <span className="text-[13px] text-[#646462] ml-1">para enviar y cerrar</span>
                </div>
              </div>
            </div>
            <div className="px-4 py-3 min-h-[80px] text-[14px] text-[#646462] opacity-50">
              Usa <kbd className="bg-[#f8f8f7] border border-[#e9eae6] rounded px-1 text-[12px]">Ctrl</kbd>
              <kbd className="bg-[#f8f8f7] border border-[#e9eae6] rounded px-1 text-[12px] ml-1">K</kbd>
              <span className="ml-1">para atajos</span>
            </div>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-[#e9eae6]">
              <div className="flex items-center gap-1">
                {[ICON_FIN, ICON_KNOWLEDGE, ICON_REPORTS, ICON_OUTBOUND, ICON_CONTACTS].map((icon, i) => (
                  <button key={i} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f8f8f7]">
                    <img src={icon} alt="" className="w-4 h-4" />
                  </button>
                ))}
              </div>
              <button className="h-7 px-4 bg-[#222] text-white text-[13px] font-semibold rounded-full opacity-50">
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── COPILOT SIDEBAR (346px) — replaces Details sidebar ───────────────────────
function CopilotSidebar() {
  return (
    <div className="flex flex-col h-full w-[346px] bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] flex-shrink-0 overflow-hidden">
      {/* Tab header */}
      <div className="bg-white border-b border-[#e9eae6] flex items-center pl-6 pr-4 flex-shrink-0 sticky top-0 h-16">
        <div className="flex items-center gap-[24px] flex-1 h-full">
          {/* Información — inactive */}
          <div className="flex flex-col items-start flex-shrink-0">
            <div className="flex h-16 items-center justify-center overflow-clip border-b border-transparent pb-[23px] pt-[21px]">
              <span className="text-[14px] font-semibold text-[#646462]">Información</span>
            </div>
          </div>
          {/* Copilot — active (orange underline) */}
          <div className="flex flex-col items-start flex-shrink-0">
            <div className="flex h-16 items-center justify-center overflow-clip border-b border-[#ed621d] pb-[23px] pt-[21px]">
              <span className="text-[14px] font-semibold text-[#1a1a1a]">Copilot</span>
            </div>
          </div>
        </div>
        {/* Icon buttons */}
        <div className="flex items-center gap-0">
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f8f8f7]">
            <img src={ICON_COPILOT_BTN} alt="" className="w-4 h-4" />
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f8f8f7]">
            <img src={ICON_COPILOT_SND} alt="" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pl-3 pr-7">
          {/* "Hola, qué tal?" heading */}
          <div className="pt-[19px] pb-1 w-[265px]">
            <p className="text-[18px] font-semibold text-[#1a1a1a] leading-6">Hola, qué tal?</p>
          </div>

          {/* Copilot response block */}
          <div className="flex flex-col items-start w-full mt-1 px-3">
            <div className="w-full pb-1">
              {/* Text block */}
              <div className="relative w-full" style={{ height: "152px" }}>
                <div className="absolute top-0 left-0 right-0">
                  <div className="text-[14px] text-[#1a1a1a] leading-5">
                    <p className="mb-0">Copilot no pudo encontrar una</p>
                    <p className="mb-0">respuesta en el centro de conocimiento</p>
                    <p className="mb-0">de su equipo o en el historial de</p>
                    <p className="mb-0">conversaciones. Por favor, reformule o</p>
                    <span className="inline">
                      <a
                        href="https://app.intercom.com/a/apps/b6gvpvyn/knowledge-hub/overview"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[14px] text-[#1a1a1a] underline cursor-pointer"
                      >
                        agregue contenido
                      </a>
                      {" "}para ayudar a
                    </span>
                    <p className="mb-0">Copilot a responder más preguntas.</p>
                  </div>
                </div>
                {/* "2 fuentes" button */}
                <div className="absolute left-[-4px] top-[132px]">
                  <button className="flex items-center justify-center h-5 px-1 rounded-full">
                    <span className="text-[14px] font-semibold text-[#1a1a1a]">2 fuentes que podrían ayudar →</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Follow-up input */}
        <div className="flex-shrink-0 px-4 pb-4">
          <div className="relative rounded-[12px] border border-[#e9eae6] bg-white flex items-end">
            {/* Textarea area */}
            <div className="flex-1 min-w-0 h-12 relative rounded-[12px] bg-white">
              <div className="absolute left-4 top-3 right-4">
                <p className="text-[14px] text-[#646462] leading-6 whitespace-pre">{"Haz una pregunta de "}</p>
                <p className="text-[14px] text-[#646462] leading-6">seguimiento...</p>
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex items-center pb-1 pr-1 flex-shrink-0">
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f8f8f7]">
                <img src={ICON_COPILOT_BTN} alt="" className="w-4 h-4" />
              </button>
              <div className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7]">
                <img src={ICON_COPILOT_SND} alt="" className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TRIAL BANNER ──────────────────────────────────────────────────────────────
function TrialBanner() {
  return (
    <div className="flex items-center justify-between bg-[#e7e2fd] border border-[#b09efa] rounded-2xl px-4 py-[9px] flex-shrink-0">
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

// ── ROOT PROTOTYPE ────────────────────────────────────────────────────────────
export default function InboxPrototype2() {
  return (
    <div
      className="flex bg-[#f3f3f1] overflow-hidden"
      style={{ width: "1440px", height: "900px", fontFamily: "'Inter', sans-serif" }}
    >
      <LeftNav />
      <div className="flex flex-col flex-1 min-w-0 p-2 gap-2">
        <TrialBanner />
        <div className="flex flex-1 min-h-0 gap-2">
          <InboxSidebar />
          <div className="relative">
            <ConversationList />
          </div>
          <div className="flex flex-1 min-w-0 gap-2">
            <ConversationPanel />
            <CopilotSidebar />
          </div>
        </div>
      </div>
    </div>
  );
}
