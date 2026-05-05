// ─────────────────────────────────────────────────────────────────────────────
// Contacts / Users "Active" segment – Standalone prototype (pixel-faithful)
// All assets served from Figma's CDN (7-day TTL).
// ─────────────────────────────────────────────────────────────────────────────

// ── Left-nav icons ────────────────────────────────────────────────────────────
const ICON_LOGO        = "https://www.figma.com/api/mcp/asset/210fe23a-321b-4e1f-8a00-dce6a7ba2224";
const ICON_FIN         = "https://www.figma.com/api/mcp/asset/570eff6a-8bff-4de1-8840-e6b108abdaef";
const ICON_KNOWLEDGE   = "https://www.figma.com/api/mcp/asset/39d9a7c0-cb9e-4d44-ab69-82d4a69df5ec";
const ICON_REPORTS     = "https://www.figma.com/api/mcp/asset/eb0b09a0-b9cb-47d5-a21b-1b8e674f7a07";
const ICON_OUTBOUND    = "https://www.figma.com/api/mcp/asset/4943ae31-0a7f-4f9e-b7f1-531cb824672b";
const ICON_CONTACTS    = "https://www.figma.com/api/mcp/asset/ac85e608-1800-4a92-888b-a0736c0ad1cb";
const ICON_SETUP       = "https://www.figma.com/api/mcp/asset/03ddd5ca-ae84-45f0-b396-13623cda163d";
const ICON_SEARCH_NAV  = "https://www.figma.com/api/mcp/asset/157d21c6-472b-4644-b914-342f6f402379";
const ICON_SETTINGS    = "https://www.figma.com/api/mcp/asset/0c20b532-867a-4850-94e0-76c877557291";
const ICON_AVATAR      = "https://www.figma.com/api/mcp/asset/fdbcb0bb-66a3-46e8-8cef-98ab237005fb";
const ICON_INBOX_NAV   = "https://www.figma.com/api/mcp/asset/210fe23a-321b-4e1f-8a00-dce6a7ba2224";

// ── Contacts sidebar icons ────────────────────────────────────────────────────
const ICON_PERSONAS    = "https://www.figma.com/api/mcp/asset/9944ae63-0c70-40e0-a9c4-d91a3113c832";
const ICON_SEARCH_SB   = "https://www.figma.com/api/mcp/asset/157d21c6-472b-4644-b914-342f6f402379";

// ── Header icons ──────────────────────────────────────────────────────────────
const ICON_BACK        = "https://www.figma.com/api/mcp/asset/7dc3bd9c-a229-4a26-b8e9-f08d905b4a47";
const ICON_LEARN       = "https://www.figma.com/api/mcp/asset/33253a6c-8a27-43f1-bc06-f9148e9032c6";
const ICON_NEW_USER    = "https://www.figma.com/api/mcp/asset/7fa3313c-824f-4246-b2fe-0c4f34180fcf";
const ICON_CHEVRON_DN  = "https://www.figma.com/api/mcp/asset/9840147a-dd4b-40b5-86c8-666ae1fec2be";

// ── Import hero bullet icons ──────────────────────────────────────────────────
const ICON_BULLET_1    = "https://www.figma.com/api/mcp/asset/9d0a580a-7c6e-4fe1-8318-746ec83f4737";
const ICON_BULLET_2    = "https://www.figma.com/api/mcp/asset/751ec081-7354-4359-bec0-73ce5e1d3390";
const ICON_BULLET_3    = "https://www.figma.com/api/mcp/asset/5b02e022-8147-4a69-94bf-162a04fcc08e";
const ICON_BULLET_4    = "https://www.figma.com/api/mcp/asset/19e88eef-a848-4b2c-8e39-722bd297d0a1";
const IMG_ILLUSTRATION = "https://www.figma.com/api/mcp/asset/47dae20e-791e-4f5e-a746-2149e4c4ff84";
const ICON_CLOSE       = "https://www.figma.com/api/mcp/asset/d8062253-7355-45d3-aeb0-c11e1433034b";

// ── Table action icons ────────────────────────────────────────────────────────
const ICON_MSG         = "https://www.figma.com/api/mcp/asset/5e9fa183-e5d4-4784-9632-1c8129c585eb";
const ICON_TAG         = "https://www.figma.com/api/mcp/asset/672fd307-8130-4af8-b8bc-a6c4f962f18e";

// ─────────────────────────────────────────────────────────────────────────────

function LeftNav() {
  return (
    <div className="flex flex-col h-full w-[44px] pt-5 pb-2 bg-[#f3f3f1] rounded-tr-2xl rounded-br-2xl justify-between flex-shrink-0">
      <div className="flex flex-col gap-4 items-center">
        <div className="flex items-center justify-center w-9 h-9 mb-1">
          <img src={ICON_LOGO} alt="" className="w-6 h-6" />
        </div>

        <div className="flex flex-col gap-1 items-start w-full px-1.5">
          {/* Inbox */}
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60">
            <img src={ICON_INBOX_NAV} alt="" className="w-4 h-4" />
          </button>
          {/* Fin */}
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60">
            <img src={ICON_FIN} alt="" className="w-4 h-4" />
          </button>
          {/* Knowledge */}
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60">
            <img src={ICON_KNOWLEDGE} alt="" className="w-4 h-4" />
          </button>
          {/* Reports */}
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60">
            <img src={ICON_REPORTS} alt="" className="w-4 h-4" />
          </button>
          {/* Outbound */}
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60">
            <img src={ICON_OUTBOUND} alt="" className="w-4 h-4" />
          </button>
          {/* Contacts — ACTIVE */}
          <button className="w-full h-8 flex items-center justify-center rounded-lg bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]">
            <img src={ICON_CONTACTS} alt="" className="w-4 h-4" />
          </button>
          {/* Setup */}
          <button className="w-full h-8 flex items-center justify-center rounded-lg hover:bg-white/60">
            <img src={ICON_SETUP} alt="" className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 items-center pb-1">
        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/60">
          <img src={ICON_SEARCH_NAV} alt="" className="w-4 h-4" />
        </button>
        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/60">
          <img src={ICON_SETTINGS} alt="" className="w-4 h-4" />
        </button>
        <button className="w-8 h-8 rounded-full overflow-hidden">
          <img src={ICON_AVATAR} alt="" className="w-8 h-8" />
        </button>
      </div>
    </div>
  );
}

function ContactsSidebar() {
  return (
    <div className="flex flex-col h-full w-[230px] flex-shrink-0 bg-[#f3f3f1] pt-3 pb-3 px-2 gap-1">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 mb-1">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a] leading-tight">Contactos</span>
        <button className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#f8f8f7] hover:bg-white/60">
          <img src={ICON_SEARCH_SB} alt="" className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Personas section */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 px-2 py-1">
          <img src={ICON_PERSONAS} alt="" className="w-3.5 h-3.5 opacity-50" />
          <span className="text-[12px] font-medium text-[#646462]">Personas:</span>
        </div>

        {/* All users */}
        <button className="flex items-center justify-between w-full px-2 py-[5px] rounded-[8px] hover:bg-white/60 border-l border-[#e9eae6] ml-2 pl-2">
          <span className="text-[13px] text-[#1a1a1a]">All users</span>
          <span className="text-[12px] text-[#646462]">4</span>
        </button>

        {/* All leads */}
        <button className="flex items-center justify-between w-full px-2 py-[5px] rounded-[8px] hover:bg-white/60 border-l border-[#e9eae6] ml-2 pl-2">
          <span className="text-[13px] text-[#1a1a1a]">All leads</span>
          <span className="text-[12px] text-[#646462] opacity-50">0</span>
        </button>

        {/* Active — ACTIVE */}
        <button className="flex items-center justify-between w-full px-2 py-[5px] rounded-[8px] bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] border-l border-[#fa7938] ml-2 pl-2">
          <span className="text-[13px] font-semibold text-[#1a1a1a]">Active</span>
          <span className="text-[12px] text-[#646462]">4</span>
        </button>

        {/* New */}
        <button className="flex items-center justify-between w-full px-2 py-[5px] rounded-[8px] hover:bg-white/60 border-l border-[#e9eae6] ml-2 pl-2">
          <span className="text-[13px] text-[#1a1a1a]">New</span>
          <span className="text-[12px] text-[#646462] opacity-50">0</span>
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#e9eae6] mx-2 my-1" />

      {/* Empresas section */}
      <div className="flex flex-col gap-0.5">
        <button className="flex items-center justify-between w-full px-2 py-1 rounded-[8px] hover:bg-white/60">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium text-[#646462]">Empresas:</span>
          </div>
          <img src={ICON_CHEVRON_DN} alt="" className="w-3 h-3 opacity-40" />
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#e9eae6] mx-2 my-1" />

      {/* Conversaciones link */}
      <button className="flex items-center gap-1.5 px-2 py-1 rounded-[8px] hover:bg-white/60 w-full">
        <span className="text-[13px] text-[#1a1a1a]">Conversaciones</span>
      </button>
    </div>
  );
}

function TrialBanner() {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#e7e2fd] border border-[#b09efa] rounded-[10px] mx-4 mt-3 mb-0">
      <span className="text-[13px] text-[#1a1a1a]">
        Quedan <strong>14 días</strong> en tu prueba de Advanced.{" "}
        <span className="underline cursor-pointer">Explorar planes</span>
      </span>
      <button className="text-[13px] text-[#646462] hover:text-[#1a1a1a]">✕</button>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-3">
      <div className="flex items-center gap-3">
        <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#f8f8f7] hover:bg-[#efefed]">
          <img src={ICON_BACK} alt="" className="w-4 h-4" />
        </button>
        <span className="text-[20px] font-semibold text-[#1a1a1a] tracking-[-0.4px]">Active</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Aprender button */}
        <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full pl-[12px] pr-[6px] py-[8px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#efefed]">
          <img src={ICON_LEARN} alt="" className="w-3.5 h-3.5" />
          <span>Aprender</span>
          <img src={ICON_CHEVRON_DN} alt="" className="w-3.5 h-3.5 opacity-40" />
        </button>

        {/* Nuevos usuarios o leads button */}
        <button className="flex items-center gap-1.5 bg-[#222] rounded-full pl-[12px] pr-[6px] py-[8px] text-[13px] font-medium text-[#f8f8f7] hover:bg-[#333]">
          <img src={ICON_NEW_USER} alt="" className="w-3.5 h-3.5" />
          <span>Nuevos usuarios o leads</span>
          <img src={ICON_CHEVRON_DN} alt="" className="w-3.5 h-3.5 opacity-60" />
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
        {/* Close button */}
        <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/5 z-10">
          <img src={ICON_CLOSE} alt="" className="w-3 h-3" />
        </button>

        {/* Left column */}
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
                <span className="text-[13px] text-[#1a1a1a] underline underline-offset-2 group-hover:text-[#646462]">
                  {b.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right illustration */}
        <div className="flex-shrink-0 flex items-end justify-end pr-0 pb-0">
          <img
            src={IMG_ILLUSTRATION}
            alt=""
            className="h-[240px] w-[388px] object-cover object-left-top"
          />
        </div>
      </div>
    </div>
  );
}

function UsersTable() {
  const rows = [
    { color: "#61d65c", initial: "E", name: "Email", channel: "en [Demo]", type: "Usuario", city: "Desconocido" },
    { color: "#85e0d9", initial: "M", name: "Messenger", channel: "en [Demo]", type: "Usuario", city: "Desconocido" },
    { color: "#b09efa", initial: "P", name: "Phone & SMS", channel: "en [Demo]", type: "Usuario", city: "Desconocido" },
    { color: "#61d65c", initial: "W", name: "WhatsApp & Social", channel: "en [Demo]", type: "Usuario", city: "Desconocido" },
  ];

  return (
    <div className="mx-4 flex flex-col gap-3">
      {/* Controls row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[18px] font-semibold text-[#1a1a1a]">4 usuarios</span>
          <div className="flex items-center gap-1">
            <button className="flex items-center gap-1.5 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#1a1a1a] hover:bg-[#efefed]">
              <img src={ICON_MSG} alt="" className="w-3.5 h-3.5" />
              <span>Nuevo mensaje</span>
            </button>
            <button className="flex items-center gap-1.5 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#1a1a1a] hover:bg-[#efefed]">
              <img src={ICON_TAG} alt="" className="w-3.5 h-3.5" />
              <span>Añadir etiqueta</span>
            </button>
            <button className="flex items-center gap-1 bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#1a1a1a] hover:bg-[#efefed]">
              <span>Más</span>
              <img src={ICON_CHEVRON_DN} alt="" className="w-3 h-3 opacity-40" />
            </button>
          </div>
        </div>

        {/* View toggle */}
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

      {/* Identity verification banner */}
      <div className="flex items-center justify-between bg-[#f8f8f7] rounded-[6px] px-[15px] py-[10px] border border-[#e9eae6]">
        <span className="text-[13px] text-[#1a1a1a]">
          Exige la verificación de identidad para proteger los datos de tus usuarios.{" "}
          <span className="underline cursor-pointer">Configurar verificación de identidad.</span>
        </span>
        <button className="text-[13px] text-[#646462] ml-4 hover:text-[#1a1a1a] flex-shrink-0">✕</button>
      </div>

      {/* Table */}
      <div className="w-full">
        {/* Column headers */}
        <div className="flex items-center border-b border-[#e9eae6] pb-2 text-[12px] font-medium text-[#646462] gap-0">
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

        {/* Rows */}
        {rows.map((row, i) => (
          <div key={i} className="flex items-center border-b border-[#e9eae6] py-[10px] gap-0 hover:bg-[#f8f8f7] cursor-pointer">
            <div className="w-7 flex-shrink-0">
              <input type="checkbox" className="w-3.5 h-3.5 rounded border-[#e9eae6]" />
            </div>
            <div className="flex-1 min-w-[180px] flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold text-white flex-shrink-0"
                style={{ backgroundColor: row.color }}
              >
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

export default function InboxPrototype3() {
  return (
    <div
      className="flex bg-[#f3f3f1] overflow-hidden"
      style={{ width: 1440, height: 900 }}
    >
      {/* Left nav */}
      <LeftNav />

      {/* Contacts sidebar panel */}
      <div className="h-full flex-shrink-0 pt-3 pb-3 pl-1 pr-0">
        <div className="h-full rounded-[16px] overflow-hidden bg-[#fbfbf9] drop-shadow-[0px_1px_2px_rgba(20,20,20,0.15)] w-[230px]">
          <ContactsSidebar />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Trial banner */}
        <TrialBanner />

        {/* Page header */}
        <PageHeader />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Import hero */}
          <ImportHero />

          {/* Users table */}
          <UsersTable />
        </div>
      </div>
    </div>
  );
}
