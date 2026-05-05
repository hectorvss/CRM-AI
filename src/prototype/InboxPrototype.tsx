// ─────────────────────────────────────────────────────────────────────────────
// Intercom Inbox – Standalone prototype (pixel-faithful Figma replica)
// All assets served from Figma's CDN (7-day TTL).
// ─────────────────────────────────────────────────────────────────────────────

// ── Icon asset URLs (from Figma MCP) ─────────────────────────────────────────
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

// ── Sub-components ────────────────────────────────────────────────────────────

function NavIcon({ src, active = false }: { src: string; active?: boolean }) {
  return (
    <div className={`flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer ${active ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]" : "hover:bg-white/60"}`}>
      <img src={src} alt="" className="w-4 h-4" />
    </div>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="absolute -top-2 -right-2 bg-[#ffccb2] border border-white rounded-full min-w-[15px] h-[15px] flex items-center justify-center text-[11px] font-bold text-[#1a1a1a] px-1">
      {count}
    </span>
  );
}

// ── LEFT NAV (44px icon sidebar) ──────────────────────────────────────────────
function LeftNav() {
  return (
    <div className="flex flex-col h-full w-[44px] pt-5 pb-2 bg-[#f3f3f1] rounded-tr-2xl rounded-br-2xl justify-between flex-shrink-0">
      {/* Top section */}
      <div className="flex flex-col gap-4 items-center">
        {/* Logo */}
        <div className="flex items-center justify-center w-9 h-9 mb-1">
          <img src={ICON_INBOX} alt="Intercom" className="w-6 h-6" />
        </div>

        {/* Nav links */}
        <div className="flex flex-col gap-1 items-start w-full px-1.5">
          {/* Inbox - active */}
          <div className="relative flex items-center justify-center w-full">
            <div className="bg-white w-full h-8 rounded-lg shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] flex items-center justify-center cursor-pointer relative">
              <img src={ICON_INBOX} alt="Inbox" className="w-4 h-4" />
              <Badge count={4} />
            </div>
          </div>
          {/* Fin */}
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60 cursor-pointer">
            <img src={ICON_FIN} alt="Fin AI" className="w-4 h-4" />
          </button>
          {/* Knowledge */}
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60 cursor-pointer">
            <img src={ICON_KNOWLEDGE} alt="Knowledge" className="w-4 h-4" />
          </button>
          {/* Reports */}
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60 cursor-pointer">
            <img src={ICON_REPORTS} alt="Reports" className="w-4 h-4" />
          </button>
          {/* Outbound */}
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60 cursor-pointer">
            <img src={ICON_OUTBOUND} alt="Outbound" className="w-4 h-4" />
          </button>
          {/* Contacts */}
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60 cursor-pointer">
            <img src={ICON_CONTACTS} alt="Contacts" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom section */}
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
        {/* Avatar */}
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

// ── SIDEBAR NAV (236px inbox navigation) ─────────────────────────────────────
function SidebarNavItem({
  icon, label, count, active = false,
}: { icon: string; label: string; count?: number; active?: boolean }) {
  return (
    <a
      href="#"
      className={`relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] ${
        active
          ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]"
          : "hover:bg-[#e9eae6]/40 text-[#1a1a1a]"
      }`}
    >
      {active && <div className="absolute inset-0 bg-white/0 rounded-lg shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]" />}
      <div className="flex items-center justify-center w-[18px] h-[18px] flex-shrink-0">
        <img src={icon} alt="" className="w-4 h-4" />
      </div>
      <span className="flex-1 leading-4">{label}</span>
      {count !== undefined && (
        <span className="text-[#646462] text-[13px]">{count}</span>
      )}
    </a>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between h-8 px-3 cursor-pointer group">
      <span className="text-[13px] font-semibold text-[#1a1a1a]">{title}</span>
      <div className="flex items-center gap-1">
        <button className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)] hover:bg-[#f8f8f7]">
          <img src={ICON_PLUS} alt="+" className="w-4 h-4" />
        </button>
        <button className="w-5 h-4 flex items-center justify-center opacity-20">
          <img src={ICON_CHEVRON} alt=">" className="w-4 h-4 rotate-90" />
        </button>
      </div>
    </div>
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
          {/* Quick links */}
          <SidebarNavItem icon={ICON_SEARCH2} label="Buscar" />
          <SidebarNavItem icon={AVATAR_ME} label="Tu bandeja de entrada" count={4} active />
          <SidebarNavItem icon={ICON_MENTION} label="Menciones" count={0} />
          <SidebarNavItem icon={ICON_CREATED} label="Creado por ti" count={0} />
          <SidebarNavItem icon={ICON_ALL} label="Todo" count={4} />
          <SidebarNavItem icon={ICON_UNASSIGNED} label="Sin asignar" count={0} />
          <SidebarNavItem icon={ICON_SPAM} label="Correo no deseado" count={0} />
          <SidebarNavItem icon={ICON_DASHBOARD} label="Tablero" />
        </div>

        {/* Fin para servicio section */}
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
          <SectionHeader title="Inbox para el equipo" />
        </div>

        {/* Compañeros de equipo */}
        <div className="mt-1">
          <SectionHeader title="Compañeros de equipo" />
        </div>

        {/* Vistas */}
        <div className="mt-1">
          <div className="flex items-center justify-between h-8 px-3 cursor-pointer">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Vistas</span>
            <button className="w-5 h-4 flex items-center justify-center">
              <img src={ICON_CHEVRON} alt=">" className="w-4 h-4 rotate-90" />
            </button>
          </div>
          <div className="flex flex-col gap-0.5 pl-1">
            <SidebarNavItem icon={ICON_MESSENGER} label="Messenger" count={1} />
            <SidebarNavItem icon={ICON_EMAIL2} label="Email" count={1} />
            <SidebarNavItem icon={ICON_WHATSAPP2} label="WhatsApp & Social" count={1} />
            <SidebarNavItem icon={ICON_PHONE2} label="Phone & SMS" count={1} />
            <SidebarNavItem icon={ICON_TICKETS} label="Tickets" count={0} />
          </div>
        </div>

        {/* Bottom: Administrar */}
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

// ── CONVERSATION LIST (271px) ─────────────────────────────────────────────────
type Conversation = {
  id: string;
  channel: string;
  preview: string;
  time: string;
  avatarColor: string;
  avatarLetter: string;
  active?: boolean;
};

const conversations: Conversation[] = [
  { id: "1", channel: "Messenger · [Demo]", preview: "Install Messenger", time: "4 min", avatarColor: "#9ec5fa", avatarLetter: "M", active: true },
  { id: "2", channel: "Email · [Demo]", preview: "This is a demo email. It", time: "4 min", avatarColor: "#85e0d9", avatarLetter: "E" },
  { id: "3", channel: "WhatsApp · [Demo]", preview: "Set up WhatsApp or so", time: "4 min", avatarColor: "#61d65c", avatarLetter: "W" },
  { id: "4", channel: "Phone · [Demo]", preview: "Set up phone or SMS", time: "4 min", avatarColor: "#85e0d9", avatarLetter: "P" },
];

function ConversationCard({ conv }: { conv: Conversation }) {
  return (
    <a
      href="#"
      className={`relative flex items-start gap-2 px-3 py-3 rounded-xl cursor-pointer ${
        conv.active
          ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]"
          : "hover:bg-white/60"
      }`}
    >
      {conv.active && (
        <div className="absolute inset-0 rounded-xl shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] bg-transparent" />
      )}
      {/* Avatar */}
      <div
        className="w-6 h-6 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: conv.avatarColor }}
      >
        <span className="text-[12px] font-semibold text-[#1a1a1a] uppercase">{conv.avatarLetter}</span>
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <span
            className={`text-[13px] truncate ${conv.active ? "font-semibold text-[#646462]" : "font-bold text-[#1a1a1a]"}`}
          >
            {conv.channel}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-[13px] truncate ${conv.active ? "text-[#646462]" : "text-[#1a1a1a]"}`}>
            {conv.preview}
          </span>
          <span className="text-[13px] text-[#646462] flex-shrink-0 ml-2">{conv.time}</span>
        </div>
      </div>
    </a>
  );
}

function ConversationList() {
  return (
    <div className="flex flex-col h-full w-[271px] border-l border-[#e9eae6] bg-[#f8f8f7] flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 h-16 sticky top-0">
        <div className="flex items-center gap-2">
          <div className="relative w-4 h-4 rounded-lg overflow-hidden bg-[#f8f8f7]">
            <img src={AVATAR_ME} alt="Me" className="absolute inset-0 w-full h-full object-cover" />
          </div>
          <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Hector Vidal Sanchez</span>
        </div>
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]">
          <img src={ICON_SEARCH2} alt="Search" className="w-4 h-4" />
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0">
        <button className="bg-white border border-[#e9eae6] text-[13px] font-semibold text-[#1a1a1a] px-[9px] py-[5px] rounded-full flex items-center gap-1">
          4 Abierta
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

      {/* Conversation items */}
      <div className="flex-1 overflow-y-auto px-3 pb-16 flex flex-col gap-0">
        {conversations.map((conv, i) => (
          <div key={conv.id}>
            {i > 0 && (
              <div className="flex justify-center py-0.5">
                <div className="w-[222px] h-[1px] bg-[#f8f8f7]" />
              </div>
            )}
            <ConversationCard conv={conv} />
          </div>
        ))}
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

// ── CONVERSATION PANEL (519px) ────────────────────────────────────────────────
type Message = {
  id: string;
  from: "user" | "agent" | "bot";
  text: string;
  time: string;
  senderName?: string;
};

const messages: Message[] = [
  {
    id: "1",
    from: "bot",
    text: "Hola, soy Fin, el agente de IA de Intercom. Puedo responder preguntas sobre productos, precios, y más. ¿En qué puedo ayudarte hoy?",
    time: "hace 4 min",
    senderName: "Fin",
  },
  {
    id: "2",
    from: "user",
    text: "Install Messenger",
    time: "hace 4 min",
  },
  {
    id: "3",
    from: "bot",
    text: "Para instalar el Messenger de Intercom en tu sitio web, ve a Configuración > Messenger > Instalar y sigue las instrucciones paso a paso. Si necesitas ayuda adicional, puedo conectarte con un agente.",
    time: "hace 4 min",
    senderName: "Fin",
  },
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
      <div
        className={`max-w-[380px] px-4 py-4 rounded-xl text-[14px] leading-[20px] ${
          isUser
            ? "bg-[#f8f8f7] text-[#1a1a1a] rounded-br-sm"
            : "bg-[#f8f8f7] text-[#1a1a1a] rounded-bl-sm"
        }`}
      >
        {msg.senderName && (
          <p className="text-[12px] font-semibold text-[#646462] mb-1">{msg.senderName}</p>
        )}
        <p>{msg.text}</p>
        <p className="text-[11px] text-[#646462] mt-2 text-right">{msg.time}</p>
      </div>
    </div>
  );
}

function ConversationPanel() {
  return (
    <div className="flex flex-col h-full min-w-[400px] w-[519px] bg-white rounded-2xl shadow-[0px_1px_2px_rgba(20,20,20,0.15)] flex-shrink-0 overflow-hidden">
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
            {/* Tag – active (purple) */}
            <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#e7e2fd] border border-[#c6c9c0] relative hover:bg-[#d4cffb]">
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
      <div className="flex-1 overflow-y-auto px-8 py-4">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} />
        ))}

        {/* Fin AI summary card */}
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

      {/* Reply box */}
      <div className="border-t border-[#e9eae6] flex-shrink-0">
        {/* Tab bar */}
        <div className="flex items-center gap-4 px-4 pt-3">
          <button className="text-[13px] font-semibold text-[#1a1a1a] border-b-2 border-[#1a1a1a] pb-1">Responder</button>
          <button className="text-[13px] text-[#646462] pb-1">Nota interna</button>
          <button className="text-[13px] text-[#646462] pb-1">Datos de la IA</button>
        </div>
        {/* Input */}
        <div className="px-4 py-3">
          <div className="border border-[#e9eae6] rounded-2xl overflow-hidden">
            <div className="px-4 py-3 min-h-[80px] text-[14px] text-[#646462]">
              Escribe un mensaje a <span className="font-semibold text-[#1a1a1a]">Hector...</span>
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
              <button className="h-7 px-4 bg-[#222] text-white text-[13px] font-semibold rounded-full hover:bg-[#444]">
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DETAILS SIDEBAR (346px) ───────────────────────────────────────────────────
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
    <div className="border-b border-[#e9eae6] pb-3 mb-0">
      <button className="flex items-center justify-between w-full h-8 px-6 py-2 hover:bg-[#f8f8f7]">
        <span className="text-[13px] font-semibold text-[#1a1a1a]">{title}</span>
        <img src={ICON_CHEVRON} alt="" className="w-4 h-4 rotate-90 opacity-50" />
      </button>
      <div className="px-6">{children}</div>
    </div>
  );
}

function DetailsSidebar() {
  return (
    <div className="flex flex-col h-full w-[346px] bg-white rounded-2xl shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] flex-shrink-0 overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-[#e9eae6] px-4 flex-shrink-0">
        <button className="text-[13px] font-semibold text-[#1a1a1a] border-b-2 border-[#1a1a1a] h-10 px-2 mr-2">Detalles</button>
        <button className="text-[13px] text-[#646462] h-10 px-2 mr-2">Actividad</button>
        <button className="text-[13px] text-[#646462] h-10 px-2">Conversaciones</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Conversation details */}
        <DetailSection title="Detalles de la conversación">
          <DetailRow label="Persona asignada" value="Hector Vidal Sanchez" />
          <DetailRow label="Equipo asignado" value="Sin asignar" />
          <DetailRow label="Estado" value="Abierta" />
          <DetailRow label="Canal" value="Messenger" />
          <DetailRow label="Prioridad" value="Sin prioridad" />
          <DetailRow label="Etiquetas" value="Añadir etiqueta..." />
        </DetailSection>

        {/* User details */}
        <DetailSection title="Usuario">
          <div className="flex items-center gap-2 py-2">
            <div className="w-8 h-8 rounded-xl bg-[#9ec5fa] flex items-center justify-center flex-shrink-0">
              <span className="text-[14px] font-semibold text-[#1a1a1a]">M</span>
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

        {/* Company */}
        <DetailSection title="Empresa">
          <p className="text-[13px] text-[#646462] py-2">Sin empresa asociada</p>
        </DetailSection>

        {/* Conversation attributes */}
        <DetailSection title="Atributos de conversación">
          <DetailRow label="ID de conversación" value="215474178470870" />
          <DetailRow label="Iniciada" value="Hace 4 min" />
          <DetailRow label="Primer tiempo resp." value="—" />
          <DetailRow label="Tiempo de resolución" value="—" />
        </DetailSection>

        {/* Fin AI */}
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
      </div>
    </div>
  );
}

// ── TOP BANNER ────────────────────────────────────────────────────────────────
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

// ── ROOT PROTOTYPE ────────────────────────────────────────────────────────────
export default function InboxPrototype() {
  return (
    <div
      className="flex bg-[#f3f3f1] overflow-hidden"
      style={{ width: "1440px", height: "900px", fontFamily: "'Inter', sans-serif" }}
    >
      {/* Far-left icon nav */}
      <LeftNav />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 p-2 gap-2">
        {/* Trial banner */}
        <TrialBanner />

        {/* Workspace */}
        <div className="flex flex-1 min-h-0 gap-2">
          {/* Inbox sidebar nav */}
          <InboxSidebar />

          {/* Conversation list */}
          <div className="relative">
            <ConversationList />
          </div>

          {/* Conversation + details */}
          <div className="flex flex-1 min-w-0 gap-2">
            <ConversationPanel />
            <DetailsSidebar />
          </div>
        </div>
      </div>
    </div>
  );
}
