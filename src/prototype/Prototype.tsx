// ─────────────────────────────────────────────────────────────────────────────
// Unified prototype – Inbox + Contacts (connected screens)
// Navigate via the left-nav icons. All assets from Figma CDN (7-day TTL).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';

type View = 'inbox' | 'contacts' | 'allLeads' | 'companiesList' | 'settings' | 'imports' | 'personal' | 'security' | 'notifications' | 'visible' | 'tokens' | 'accountAccess' | 'multilingual' | 'assignments' | 'macros' | 'tickets' | 'sla' | 'aiInbox' | 'automation' | 'appStore' | 'connectors' | 'labels' | 'people' | 'companies' | 'workspaceSecurity' | 'workspaceMultilingual' | 'billing' | 'messenger' | 'email' | 'phone' | 'whatsapp' | 'discord' | 'sms' | 'social' | 'allChannels' | 'fin' | 'knowledge' | 'reports' | 'outbound' | 'inboxes' | 'cannedResponses' | 'aiGuardrails' | 'agentTools' | 'agentScenarios' | 'mcpServers' | 'emailTemplates' | 'visualFlows' | 'dataImports' | 'customRoles' | 'callsView';

// ── Shared icon constants ─────────────────────────────────────────────────────
// Figma desktop MCP assets (extracted node-by-node for 100% fidelity)
const IMG_SLA_BANNER       = "http://localhost:3845/assets/b19e591362b8c4de77f19587d881d94b1042678b.png";
const IMG_TICKETS_PORTAL   = "http://localhost:3845/assets/6971188673fd3013af5484de1fa365316c0b94cc.png";
const IMG_TICKETS_TYPES    = "http://localhost:3845/assets/d0b4c46e141639aad99c27b726fe8bde688d0a73.png";
// AppStore banners (1-30005, 1-30014)
const IMG_APPSTORE_BUILT   = "http://localhost:3845/assets/ad347ce8da225bd35f5b32fe6b12f1e0c920c359.png";
const IMG_APPSTORE_MEETING = "http://localhost:3845/assets/47092718aa85d977f81b82ebb8e30be7d57c735d.png";
// AppStore Popular apps (1-30033, 1-30045, 1-30057, 1-30069)
const IMG_APP_SALESFORCE   = "http://localhost:3845/assets/3bdcbcb8a69c1ab5dcd0f726121a4b1a1fd7639f.png";
const IMG_APP_INSTAGRAM    = "http://localhost:3845/assets/5f4fa567fe2eaa00f674696aab535d70118387b9.png";
const IMG_APP_GA           = "http://localhost:3845/assets/f2498aefe57b15048759bd0c7d413343f479d4c7.png";
const IMG_APP_JIRA         = "http://localhost:3845/assets/568c5d9e60a43fc756b02a5671654a0b4ff4ae53.png";
// AppStore additional sections (1-30113, 1-30125, 1-30168, 1-30180, 1-30235)
const IMG_APP_WHATSAPP     = "http://localhost:3845/assets/ed48cfb27c99c5386eb14f1637be6b27f26a0f07.png";
const IMG_APP_DELIGHTED    = "http://localhost:3845/assets/b549080f72c68b942d7026aefdaed6104eae652a.png";
const IMG_APP_QUICKLINKS   = "http://localhost:3845/assets/08b4d6a3bbb57338581614032b63927bd7df4230.png";
const IMG_APP_DEMO         = "http://localhost:3845/assets/914e49234ac9bdbbba12fee4a9fe382f5a5e0963.png";
const IMG_APP_STRIPE       = "http://localhost:3845/assets/fe71d140eb03f8f8f8d7da4781359f8957d0db1e.png";
// PeopleView previews (1-37921, 1-34193 main group SVG)
const IMG_QUALIFICATION    = "http://localhost:3845/assets/87ca775140e54d5c3863f89d37ef855026b40c28.svg";
const IMG_USERDATA_BANNER  = "http://localhost:3845/assets/ab0de40d6c4bdf7484aba9ff89ed27f73d76959e.svg";
// Channels banners (1:53419, 1:56342, 1:57727, 1:57822, 1:67142)
const IMG_EMAIL_BANNER     = "http://localhost:3845/assets/6e214d9080a16f54d442f6685aad025362ad2816.png";
const IMG_PHONE_VIDEO      = "http://localhost:3845/assets/0150575beef6c4a589bf4bc41825691e96238efd.png";
const IMG_WHATSAPP_BANNER  = "http://localhost:3845/assets/810cd6bad6138197c597db529f478a647af516bb.png";
const IMG_WHATSAPP_TRANS   = "http://localhost:3845/assets/d14c53a1a462ec4a3e702dc5235b771e2767ca95.png";
const IMG_CHANNELS_ALL     = "http://localhost:3845/assets/1db4722d06d0ece26352d1f6607f6edf10ffe166.png";
const IMG_DISCORD_ILLO     = "http://localhost:3845/assets/e25c01bf4ae888185fc2c494120173b16fb88dc8.png";
const IMG_FACEBOOK_BANNER  = "http://localhost:3845/assets/ff55606a7cb338b7b3782780552d97213eeffd34.png";
const IMG_INSTAGRAM_BANNER = "http://localhost:3845/assets/adf19f0a72d29719d45fcf27040a591f21c327b1.png";
// Chat support floating icon (1:55751 mask, used in all settings screens)
const IMG_CHAT_SUPPORT_MASK = "http://localhost:3845/assets/7d6b74634c1449d020cbc1db43f39966f662badb.svg";
// Connector icons (SVG, 1-31284…1-31315)
const SVG_CONN_CREATE      = "http://localhost:3845/assets/9547459195af209d7fc7a8266b21ba259e45d7b3.svg";
const SVG_CONN_MCP         = "http://localhost:3845/assets/b76967aa85b0e0a5adba750c204f52d62caa1075.svg";
const SVG_CONN_STRIPE      = "http://localhost:3845/assets/1ec21e44bf4a7010e4ff49d910b87634243adfb7.svg";
const SVG_CONN_LINEAR      = "http://localhost:3845/assets/ca75e281bbd6e32675df99f63256ec87f3236597.svg";
const SVG_CONN_SHOPIFY     = "http://localhost:3845/assets/8536a444ce92ea293aedfcb5be0df93a17a90a2e.svg";
const SVG_CONN_USAGE       = "http://localhost:3845/assets/c6a7642954882aa9ac8f79803b287640af9ec4cb.svg";

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
  const isContacts = view === 'contacts' || view === 'allLeads' || view === 'companiesList';
  const isSettings = view === 'settings' || view === 'imports' || view === 'personal' || view === 'security' || view === 'notifications' || view === 'visible' || view === 'tokens' || view === 'accountAccess' || view === 'multilingual' || view === 'assignments' || view === 'macros' || view === 'tickets' || view === 'sla' || view === 'aiInbox' || view === 'automation' || view === 'appStore' || view === 'connectors' || view === 'labels' || view === 'people' || view === 'companies' || view === 'workspaceSecurity' || view === 'workspaceMultilingual' || view === 'billing' || view === 'messenger' || view === 'email' || view === 'phone' || view === 'whatsapp' || view === 'discord' || view === 'sms' || view === 'social' || view === 'allChannels' || view === 'emailTemplates' || view === 'visualFlows' || view === 'dataImports' || view === 'customRoles' || view === 'callsView';
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
  const activeItem = view === 'allLeads' ? 'allLeads' : view === 'companiesList' ? 'companiesList' : 'contacts';

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
        <div className="flex items-center gap-1.5 px-2 py-1">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-50">
            <rect x="1" y="4" width="12" height="9" rx="1.5" stroke="#1a1a1a" strokeWidth="1.2"/>
            <path d="M4 4V3a3 3 0 016 0v1" stroke="#1a1a1a" strokeWidth="1.2"/>
          </svg>
          <span className="text-[12px] font-medium text-[#646462]">Empresas:</span>
        </div>
        <SidebarItem label="Todas las empresas" count={0} itemView="companiesList" opacity50Count />
        <SidebarItem label="Active" count={0} itemView="companiesList" opacity50Count />
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

type ContactType = 'visitor' | 'lead' | 'customer';

const CONTACT_TYPE_STYLES: Record<ContactType, { bg: string; text: string; label: string }> = {
  visitor:  { bg: 'bg-[#f3f3f1]',  text: 'text-[#646462]', label: 'Visitante' },
  lead:     { bg: 'bg-[#dbeafe]',  text: 'text-[#1d4ed8]', label: 'Lead' },
  customer: { bg: 'bg-[#dcfce7]',  text: 'text-[#16a34a]', label: 'Cliente' },
};

function ContactTypeBadge({ type }: { type: ContactType }) {
  const s = CONTACT_TYPE_STYLES[type];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function UsersTable() {
  const rows: Array<{ color: string; initial: string; name: string; channel: string; city: string; contactType: ContactType; blocked: boolean; lastActivity: string }> = [
    { color: "#61d65c", initial: "E", name: "Email", channel: "en [Demo]", city: "Desconocido", contactType: 'customer', blocked: false, lastActivity: 'hace 40 min' },
    { color: "#85e0d9", initial: "M", name: "Messenger", channel: "en [Demo]", city: "Desconocido", contactType: 'lead', blocked: false, lastActivity: 'hace 2 horas' },
    { color: "#b09efa", initial: "P", name: "Phone & SMS", channel: "en [Demo]", city: "Desconocido", contactType: 'visitor', blocked: true, lastActivity: 'hace 1 día' },
    { color: "#61d65c", initial: "W", name: "WhatsApp & Social", channel: "en [Demo]", city: "Desconocido", contactType: 'customer', blocked: false, lastActivity: 'hace 3 días' },
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
            <span className="text-[#e35712]">Última actividad</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-60">
              <path d="M5 2L7 5H3L5 2Z" fill="#e35712"/>
              <path d="M5 8L3 5H7L5 8Z" fill="#e35712" opacity="0.4"/>
            </svg>
          </div>
          <div className="w-[110px] flex-shrink-0">Tipo</div>
          <div className="w-[110px] flex-shrink-0">First seen</div>
          <div className="w-[100px] flex-shrink-0">Signed up</div>
          <div className="w-[100px] flex-shrink-0">Web sessions</div>
          <div className="w-[100px] flex-shrink-0">City</div>
        </div>
        {rows.map((row, i) => (
          <div key={i} className={`flex items-center border-b border-[#e9eae6] py-[10px] hover:bg-[#f8f8f7] cursor-pointer ${row.blocked ? 'opacity-60' : ''}`}>
            <div className="w-7 flex-shrink-0">
              <input type="checkbox" className="w-3.5 h-3.5 rounded border-[#e9eae6]" />
            </div>
            <div className="flex-1 min-w-[180px] flex items-center gap-2">
              <div className="relative flex-shrink-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold text-white" style={{ backgroundColor: row.color }}>
                  {row.initial}
                </div>
                {row.blocked && (
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center">
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="white" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  </div>
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-[#1a1a1a]">{row.name}</span>
                <span className="text-[12px] text-[#646462]">{row.channel}</span>
              </div>
            </div>
            <div className="w-[130px] flex-shrink-0 text-[13px] text-[#1a1a1a]">{row.lastActivity}</div>
            <div className="w-[110px] flex-shrink-0"><ContactTypeBadge type={row.contactType} /></div>
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
  { label: "Bandejas de entrada",  nav: 'inboxes' },
  { label: "Inbox para el equipo", nav: null },
  { label: "Respuestas rápidas",   nav: 'cannedResponses' },
  { label: "Asignaciones",         nav: 'assignments' },
  { label: "Macros",               nav: 'macros' },
  { label: "Folios de atención",   nav: 'tickets' },
  { label: "SLA",                  nav: 'sla' },
  { label: "Llamadas",             nav: 'callsView' },
];
const DATOS_SUB: { label: string; nav: View | null }[] = [
  { label: "Etiquetas",                    nav: 'labels' },
  { label: "Personas",                     nav: 'people' },
  { label: "Empresas",                     nav: 'companies' },
  { label: "Conversaciones",               nav: 'settings' },
  { label: "Objetos personalizados",       nav: null },
  { label: "Importaciones y exportaciones", nav: 'imports' },
  { label: "Importaciones de datos",       nav: 'dataImports' },
  { label: "Plantillas de email",          nav: 'emailTemplates' },
  { label: "Temas",                        nav: null },
];

const WORKSPACE_SUB: { label: string; nav: View | null; warn?: boolean }[] = [
  { label: "General",                nav: null },
  { label: "Compañeros de equipo",   nav: null },
  { label: "Horario de atención",    nav: null },
  { label: "Marcas",                 nav: null },
  { label: "Seguridad",              nav: 'workspaceSecurity', warn: true },
  { label: "Multilingüe",            nav: 'workspaceMultilingual' },
  { label: "Roles personalizados",   nav: 'customRoles' },
];

const SUSCRIPCION_SUB: { label: string; nav: View | null }[] = [
  { label: "Facturación", nav: 'billing' },
];

const CANALES_SUB: { label: string; nav: View | null }[] = [
  { label: "Messenger",                 nav: 'messenger' },
  { label: "Correo electrónico",        nav: 'email' },
  { label: "Teléfono",                  nav: 'phone' },
  { label: "WhatsApp",                  nav: 'whatsapp' },
  { label: "Switch",                    nav: null },
  { label: "Slack",                     nav: null },
  { label: "Discord",                   nav: 'discord' },
  { label: "SMS",                       nav: 'sms' },
  { label: "Canales de redes sociales", nav: 'social' },
  { label: "Todos los canales",         nav: 'allChannels' },
];
const SETTINGS_NAV_BOTTOM = [
  { label: "Centro de ayuda",   hasChevron: true },
  { label: "Canales salientes", hasChevron: true },
];

const IA_SUB: { label: string; nav: View | null }[] = [
  { label: "Fin AI Agent",    nav: 'fin' },
  { label: "Buzón de IA",     nav: 'aiInbox' },
  { label: "Automatización",  nav: 'automation' },
  { label: "Guardarraíles",   nav: 'aiGuardrails' },
  { label: "Herramientas",    nav: 'agentTools' },
  { label: "Escenarios",      nav: 'agentScenarios' },
  { label: "Servidores MCP",  nav: 'mcpServers' },
  { label: "Flujos visuales", nav: 'visualFlows' },
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
  const isDatos = view === 'settings' || view === 'imports' || view === 'labels' || view === 'people' || view === 'companies' || view === 'emailTemplates' || view === 'dataImports';
  const isInboxSection = view === 'assignments' || view === 'macros' || view === 'tickets' || view === 'sla' || view === 'inboxes' || view === 'cannedResponses' || view === 'callsView';
  const isIASection = view === 'aiInbox' || view === 'automation' || view === 'fin' || view === 'aiGuardrails' || view === 'agentTools' || view === 'agentScenarios' || view === 'mcpServers' || view === 'visualFlows';
  const isIntegSection = view === 'appStore' || view === 'connectors';
  const isWorkspaceSection = view === 'workspaceSecurity' || view === 'workspaceMultilingual' || view === 'customRoles';
  const isSuscripcionSection = view === 'billing';
  const isCanalesSection = view === 'messenger' || view === 'email' || view === 'phone' || view === 'whatsapp' || view === 'discord' || view === 'sms' || view === 'social' || view === 'allChannels';
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
        {/* Inicio (no chevron) */}
        <button className="flex items-center justify-between w-full px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1] text-left">
          <span>Inicio</span>
        </button>

        {/* Espacio de trabajo section */}
        <button
          onClick={() => onNavigate('workspaceSecurity')}
          className="flex items-center justify-between w-full px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1] text-left"
        >
          <span>Espacio de trabajo</span>
          <img src={ICON_SETTINGS_CHEVRON_OPEN} alt="" className={`w-3.5 h-3.5 opacity-40 ${isWorkspaceSection ? 'rotate-90' : ''}`} />
        </button>
        {isWorkspaceSection && (
          <div className="flex flex-col gap-0.5 pl-3">
            {WORKSPACE_SUB.map((sub) => {
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
                  <span className="flex-1">{sub.label}</span>
                  {sub.warn && <span className="text-[#f59e0b] ml-1">⚠</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Suscripción section */}
        <button
          onClick={() => onNavigate('billing')}
          className="flex items-center justify-between w-full px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1] text-left"
        >
          <span>Suscripción</span>
          <img src={ICON_SETTINGS_CHEVRON_OPEN} alt="" className={`w-3.5 h-3.5 opacity-40 ${isSuscripcionSection ? 'rotate-90' : ''}`} />
        </button>
        {isSuscripcionSection && <SubItems items={SUSCRIPCION_SUB} />}

        {/* Canales section */}
        <button
          onClick={() => onNavigate('messenger')}
          className="flex items-center justify-between w-full px-3 py-[7px] rounded-lg text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1] text-left"
        >
          <span>Canales</span>
          <img src={ICON_SETTINGS_CHEVRON_OPEN} alt="" className={`w-3.5 h-3.5 opacity-40 ${isCanalesSection ? 'rotate-90' : ''}`} />
        </button>
        {isCanalesSection && <SubItems items={CANALES_SUB} />}

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

type AssignmentPolicy = {
  id: string; name: string; policy_type: 'round_robin' | 'capacity_based' | 'skills_based';
  active: boolean; inbox_id: string | null; config: Record<string, unknown>;
};

const POLICY_TYPE_LABELS: Record<string, string> = {
  round_robin:    'Turno rotativo',
  capacity_based: 'Por capacidad',
  skills_based:   'Por habilidades',
};

const POLICY_COLORS: Record<string, string> = {
  round_robin:    'bg-[#dbeafe] text-[#1d4ed8]',
  capacity_based: 'bg-[#dcfce7] text-[#15803d]',
  skills_based:   'bg-[#ede9fe] text-[#5b21b6]',
};

function AssignmentsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'policies' | 'limits' | 'general'>('policies');
  const [showNewPolicy, setShowNewPolicy] = useState(false);
  const [policies, setPolicies] = useState<AssignmentPolicy[]>([
    { id: '1', name: 'Soporte general (round-robin)', policy_type: 'round_robin', active: true, inbox_id: null, config: { max_per_agent: 5 } },
    { id: '2', name: 'Facturación (por capacidad)', policy_type: 'capacity_based', active: true, inbox_id: 'billing', config: { max_capacity: 8, respect_online_status: true } },
    { id: '3', name: 'Soporte técnico (por habilidades)', policy_type: 'skills_based', active: false, inbox_id: 'tech', config: { required_skills: ['javascript', 'api'], fallback_to_round_robin: true } },
  ]);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<AssignmentPolicy['policy_type']>('round_robin');

  function handleCreate() {
    if (!newName.trim()) return;
    setPolicies(prev => [...prev, {
      id: String(Date.now()), name: newName, policy_type: newType,
      active: true, inbox_id: null, config: {},
    }]);
    setNewName(''); setShowNewPolicy(false);
  }

  const tabs = [
    { id: 'policies' as const, label: 'Políticas de asignación' },
    { id: 'limits'   as const, label: 'Límites por agente' },
    { id: 'general'  as const, label: 'General' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Asignaciones</h1>
            <button onClick={() => setShowNewPolicy(true)}
              className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">
              + Nueva política
            </button>
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
            {tab === 'policies' && (
              <div className="px-6 py-4 flex flex-col gap-3">
                {showNewPolicy && (
                  <div className="border border-[#3b59f6] rounded-[10px] px-5 py-4 bg-[#f8f9ff] flex flex-col gap-3">
                    <p className="text-[13px] font-semibold text-[#1a1a1a]">Nueva política de asignación</p>
                    <div className="grid grid-cols-2 gap-3">
                      <input value={newName} onChange={e => setNewName(e.target.value)}
                        placeholder="Nombre de la política..."
                        className="border border-[#e9eae6] rounded-[6px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3b59f6]" />
                      <select value={newType} onChange={e => setNewType(e.target.value as AssignmentPolicy['policy_type'])}
                        className="border border-[#e9eae6] rounded-[6px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3b59f6] bg-white">
                        {Object.entries(POLICY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowNewPolicy(false)} className="px-4 py-[6px] text-[13px] border border-[#e9eae6] rounded-full hover:bg-[#f3f3f1]">Cancelar</button>
                      <button onClick={handleCreate} className="px-4 py-[6px] text-[13px] font-semibold bg-[#1a1a1a] text-white rounded-full hover:bg-[#444]">Crear</button>
                    </div>
                  </div>
                )}

                {policies.map(policy => (
                  <div key={policy.id} className={`border rounded-[10px] px-5 py-4 flex items-center gap-4 ${policy.active ? 'border-[#e9eae6]' : 'border-[#e9eae6] opacity-60'}`}>
                    <button
                      onClick={() => setPolicies(prev => prev.map(p => p.id === policy.id ? { ...p, active: !p.active } : p))}
                      className={`w-8 h-[18px] rounded-full flex-shrink-0 relative transition-colors ${policy.active ? 'bg-[#22c55e]' : 'bg-[#e9eae6]'}`}>
                      <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${policy.active ? 'right-0.5' : 'left-0.5'}`}/>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-[#1a1a1a]">{policy.name}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${POLICY_COLORS[policy.policy_type]}`}>
                          {POLICY_TYPE_LABELS[policy.policy_type]}
                        </span>
                        {policy.inbox_id && (
                          <span className="text-[11px] bg-[#f3f3f1] text-[#646462] px-2 py-0.5 rounded-full">
                            Inbox: {policy.inbox_id}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[12px] text-[#646462]">
                        {policy.policy_type === 'round_robin' && `Máx. ${(policy.config as any).max_per_agent ?? '∞'} conversaciones/agente`}
                        {policy.policy_type === 'capacity_based' && `Capacidad máx. ${(policy.config as any).max_capacity ?? '∞'} · ${(policy.config as any).respect_online_status ? 'Solo agentes online' : 'Todos los agentes'}`}
                        {policy.policy_type === 'skills_based' && `Habilidades: ${((policy.config as any).required_skills as string[] ?? []).join(', ') || 'ninguna'}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button className="px-3 py-[5px] text-[12px] border border-[#e9eae6] rounded-full hover:bg-[#f3f3f1]">Editar</button>
                      <button onClick={() => setPolicies(prev => prev.filter(p => p.id !== policy.id))}
                        className="px-3 py-[5px] text-[12px] border border-[#e9eae6] rounded-full hover:bg-red-50 text-[#dc2626]">Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'limits' && (
              <div className="px-6 py-6">
                <p className="text-[13px] text-[#646462] mb-4">Límites de conversaciones activas por agente. Dejar en blanco para sin límite.</p>
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-[#e9eae6]">
                    <th className="text-left py-2 px-4 font-medium text-[#646462] text-[12px]">Agente</th>
                    <th className="text-left py-2 px-4 font-medium text-[#646462] text-[12px]">Límite</th>
                    <th className="text-left py-2 px-4 font-medium text-[#646462] text-[12px]">Actual</th>
                  </tr></thead>
                  <tbody>
                    {[
                      { name: 'Ana García',    limit: 10, current: 7  },
                      { name: 'Carlos López',  limit: 8,  current: 8  },
                      { name: 'María Martín',  limit: 12, current: 3  },
                      { name: 'Javier Ruiz',   limit: 10, current: 5  },
                    ].map(agent => (
                      <tr key={agent.name} className="border-b border-[#f3f3f1] hover:bg-[#fafaf9]">
                        <td className="px-4 py-3 font-medium text-[#1a1a1a]">{agent.name}</td>
                        <td className="px-4 py-3">
                          <input type="number" defaultValue={agent.limit} min={1}
                            className="w-20 border border-[#e9eae6] rounded-[6px] px-2 py-1 text-[13px] focus:outline-none focus:border-[#3b59f6]" />
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[12px] font-medium ${agent.current >= agent.limit ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>
                            {agent.current} / {agent.limit}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button className="mt-4 px-4 py-[6px] text-[13px] font-semibold bg-[#1a1a1a] text-white rounded-full hover:bg-[#444]">Guardar límites</button>
              </div>
            )}

            {tab === 'general' && (
              <div className="px-6 py-6 flex flex-col gap-4">
                {[
                  { title: 'Auto-asignación al crear conversación', desc: 'Aplica la política activa automáticamente cuando se crea una nueva conversación.', on: true },
                  { title: 'Re-asignar al cambiar de inbox', desc: 'Si una conversación se mueve de inbox, re-evalúa la política de asignación.', on: false },
                  { title: 'Notificar al agente al ser asignado', desc: 'Envía una notificación push/email cuando un agente recibe una conversación asignada automáticamente.', on: true },
                ].map(item => (
                  <div key={item.title} className="border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-[#1a1a1a]">{item.title}</p>
                      <p className="text-[12px] text-[#646462] mt-0.5">{item.desc}</p>
                    </div>
                    <div className={`w-8 h-[18px] rounded-full flex-shrink-0 cursor-pointer ${item.on ? 'bg-[#22c55e]' : 'bg-[#e9eae6]'}`}>
                      <div className={`m-0.5 w-3.5 h-3.5 rounded-full bg-white shadow ${item.on ? 'ml-auto mr-0.5' : ''}`}/>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MacrosView ────────────────────────────────────────────────────────────────

type MacroItem = {
  id: string; emoji: string; label: string; visibility: 'public' | 'private';
  run_count: number; last_run_at: string | null;
  actions: Array<{ action_name: string; label: string; color: string }>;
};

const macrosList: MacroItem[] = [
  {
    id: '1', emoji: '✅', label: 'Close conversation [Example]', visibility: 'public', run_count: 34, last_run_at: 'hace 2 horas',
    actions: [
      { action_name: 'update_status', label: 'Cerrar conversación', color: 'bg-[#dcfce7] text-[#15803d]' },
      { action_name: 'send_message',  label: 'Enviar respuesta final', color: 'bg-[#dbeafe] text-[#1d4ed8]' },
    ],
  },
  {
    id: '2', emoji: '🐞', label: 'Bug report [Example]', visibility: 'public', run_count: 12, last_run_at: 'ayer',
    actions: [
      { action_name: 'add_label',   label: 'Añadir etiqueta: bug', color: 'bg-[#fef3c7] text-[#92400e]' },
      { action_name: 'assign_team', label: 'Asignar: Tech Team',   color: 'bg-[#ede9fe] text-[#5b21b6]' },
    ],
  },
  {
    id: '3', emoji: '💵', label: 'Billing [Example]', visibility: 'public', run_count: 8, last_run_at: 'hace 3 días',
    actions: [
      { action_name: 'assign_team', label: 'Asignar: Facturación', color: 'bg-[#ede9fe] text-[#5b21b6]' },
    ],
  },
  {
    id: '4', emoji: '', label: 'Feature Request [Example]', visibility: 'private', run_count: 0, last_run_at: null,
    actions: [
      { action_name: 'add_label',    label: 'Añadir etiqueta: feature', color: 'bg-[#fef3c7] text-[#92400e]' },
      { action_name: 'send_message', label: 'Enviar confirmación',      color: 'bg-[#dbeafe] text-[#1d4ed8]' },
    ],
  },
];

function MacrosView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [selected, setSelected] = useState('1');
  const [executedId, setExecutedId] = useState<string | null>(null);
  const macro = macrosList.find(m => m.id === selected)!;

  function handleExecute() {
    setExecutedId(selected);
    setTimeout(() => setExecutedId(null), 2000);
  }
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
                      className={`w-full px-4 py-3 text-left text-[13px] border-b border-[#e9eae6] flex items-center justify-between gap-2 ${
                        selected === m.id ? 'bg-[#f0efff] text-[#1a1a1a] font-medium' : 'text-[#1a1a1a] hover:bg-[#f8f8f7]'
                      }`}>
                      <span className="flex items-center gap-2 min-w-0">
                        {m.emoji && <span>{m.emoji}</span>}
                        <span className="truncate">{m.label}</span>
                        {m.visibility === 'private' && <span className="text-[10px] bg-[#f3f3f1] text-[#646462] px-1.5 py-0.5 rounded-full flex-shrink-0">Privada</span>}
                      </span>
                      {m.run_count > 0 && <span className="text-[11px] text-[#646462] flex-shrink-0">{m.run_count}×</span>}
                    </button>
                  ))}
                </div>
              </div>
              {/* Detail panel */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-3 border-b border-[#e9eae6] flex-shrink-0">
                  <h2 className="text-[16px] font-semibold text-[#1a1a1a]">{macro.emoji} {macro.label}</h2>
                  <div className="flex items-center gap-2">
                    <button className="text-[13px] text-[#dc2626] font-medium border border-[#e9eae6] rounded-full px-3 py-[5px] hover:bg-red-50">Borrar</button>
                    <button className="text-[13px] font-medium border border-[#e9eae6] rounded-full px-3 py-[5px] hover:bg-[#f5f5f4]">Duplicar</button>
                    <button className="text-[13px] font-semibold bg-[#1a1a1a] text-white rounded-full px-4 py-[5px] hover:bg-[#444]">Guardar</button>
                  </div>
                </div>
                <div className="px-6 py-2 flex items-center justify-between flex-shrink-0">
                  <p className="text-[12px] text-[#646462]">
                    Ejecutada <strong>{macro.run_count}</strong> veces
                    {macro.last_run_at && <> · Última vez {macro.last_run_at}</>}
                  </p>
                  <button
                    onClick={handleExecute}
                    className={`flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-3 py-[5px] transition-all ${
                      executedId === macro.id
                        ? 'bg-[#22c55e] text-white'
                        : 'bg-[#f3f3f1] text-[#1a1a1a] hover:bg-[#e9eae6]'
                    }`}>
                    {executedId === macro.id ? (
                      <><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> Ejecutada!</>
                    ) : (
                      <><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 2l7 4-7 4V2z" fill="#1a1a1a"/></svg> Ejecutar ahora</>
                    )}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-3">
                  <p className="text-[12px] font-semibold text-[#646462] uppercase tracking-wide mb-2">Acciones</p>
                  <div className="flex flex-col gap-2">
                    {macro.actions.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 border border-[#e9eae6] rounded-[8px] px-4 py-3">
                        <span className="text-[11px] text-[#646462] w-5 text-center">{i + 1}</span>
                        <span className={`text-[12px] font-medium rounded-full px-2.5 py-1 ${a.color}`}>{a.label}</span>
                      </div>
                    ))}
                    <button className="flex items-center gap-2 border border-dashed border-[#e9eae6] rounded-[8px] px-4 py-3 text-[12px] text-[#646462] hover:bg-[#f8f8f7] hover:border-[#c8c9c4]">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="#646462" strokeWidth="1.3" strokeLinecap="round"/></svg>
                      Añadir acción
                    </button>
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
                imageSlot={<img src={IMG_TICKETS_TYPES} alt="Ticket types preview" className="w-full h-[206px] rounded-[8px] object-cover" data-node-id="1:22052" />}
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

type SlaPolicy = {
  id: string; name: string; description: string | null;
  first_response_time: number | null; next_response_time: number | null;
  resolution_time: number | null; business_hours: boolean;
};

function fmtSecs(s: number | null): string {
  if (s == null) return '—';
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

function SlaView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [policies, setPolicies] = useState<SlaPolicy[]>([
    { id: '1', name: 'Estándar',  description: 'Política SLA básica para todas las conversaciones', first_response_time: 3600,  next_response_time: 7200,  resolution_time: 86400,  business_hours: true  },
    { id: '2', name: 'Prioritario', description: 'Clientes VIP y escalados urgentes',                 first_response_time: 900,   next_response_time: 1800,  resolution_time: 14400,  business_hours: true  },
    { id: '3', name: '24/7',      description: 'Sin restricción de horario',                          first_response_time: 1800,  next_response_time: 3600,  resolution_time: 43200,  business_hours: false },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', first_response_time: '', next_response_time: '', resolution_time: '', business_hours: false });

  function addPolicy() {
    if (!form.name.trim()) return;
    setPolicies(prev => [...prev, {
      id: String(Date.now()), name: form.name.trim(), description: form.description.trim() || null,
      first_response_time: form.first_response_time ? parseInt(form.first_response_time) * 60 : null,
      next_response_time:  form.next_response_time  ? parseInt(form.next_response_time)  * 60 : null,
      resolution_time:     form.resolution_time     ? parseInt(form.resolution_time)     * 60 : null,
      business_hours: form.business_hours,
    }]);
    setForm({ name: '', description: '', first_response_time: '', next_response_time: '', resolution_time: '', business_hours: false });
    setShowForm(false);
  }

  function deletePolicy(id: string) { setPolicies(prev => prev.filter(p => p.id !== id)); }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <div>
              <h1 className="text-[18px] font-semibold text-[#1a1a1a]">Políticas SLA</h1>
              <p className="text-[13px] text-[#646462] mt-0.5">Tiempos de respuesta y resolución por acuerdo</p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 bg-[#222] rounded-full pl-[12px] pr-[10px] py-[7px] text-[13px] font-medium text-white hover:bg-[#333]"
            >
              <span className="text-[16px] leading-none">+</span>
              <span>Nueva política</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Columns */}
            <div className="flex items-center text-[12px] font-semibold text-[#646462] px-6 py-2 border-b border-[#e9eae6] bg-[#fafaf9]">
              <div className="flex-1">Nombre</div>
              <div className="w-28 flex-shrink-0 text-center">1ª respuesta</div>
              <div className="w-28 flex-shrink-0 text-center">Siguiente resp.</div>
              <div className="w-28 flex-shrink-0 text-center">Resolución</div>
              <div className="w-24 flex-shrink-0 text-center">Horario</div>
              <div className="w-16 flex-shrink-0" />
            </div>
            {policies.map(p => (
              <div key={p.id} className="flex items-center px-6 py-3 border-b border-[#f0f0ee] hover:bg-[#fafafa] group">
                <div className="flex-1 min-w-0">
                  <span className="text-[14px] font-medium text-[#1a1a1a] block truncate">{p.name}</span>
                  {p.description && <span className="text-[12px] text-[#999] block truncate">{p.description}</span>}
                </div>
                <div className="w-28 flex-shrink-0 text-center">
                  <span className="text-[13px] font-mono text-[#7c5cfc]">{fmtSecs(p.first_response_time)}</span>
                </div>
                <div className="w-28 flex-shrink-0 text-center">
                  <span className="text-[13px] font-mono text-[#646462]">{fmtSecs(p.next_response_time)}</span>
                </div>
                <div className="w-28 flex-shrink-0 text-center">
                  <span className="text-[13px] font-mono text-[#646462]">{fmtSecs(p.resolution_time)}</span>
                </div>
                <div className="w-24 flex-shrink-0 flex justify-center">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${p.business_hours ? 'bg-[#ecfdf5] text-[#059669]' : 'bg-[#f0f0ee] text-[#646462]'}`}>
                    {p.business_hours ? 'Laborable' : '24/7'}
                  </span>
                </div>
                <div className="w-16 flex-shrink-0 flex justify-end opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => deletePolicy(p.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#fee2e2] text-[#ef4444] text-[12px]"
                  >✕</button>
                </div>
              </div>
            ))}
            {policies.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <svg viewBox="0 0 40 40" className="w-10 h-10 fill-none stroke-[#ccc]" strokeWidth="1.5"><circle cx="20" cy="20" r="17"/><path d="M20 11v9l5 5"/></svg>
                <p className="text-[14px] font-semibold text-[#1a1a1a]">Aún no se han creado políticas SLA</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-[16px] shadow-xl p-6 w-[460px]">
            <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-4">Nueva política SLA</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[12px] font-medium text-[#646462] mb-1">Nombre</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej. Estándar, Prioritario..."
                  className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#7c5cfc]" />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#646462] mb-1">Descripción</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Opcional..."
                  className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#7c5cfc]" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '1ª respuesta (min)', key: 'first_response_time' as const },
                  { label: 'Siguiente resp. (min)', key: 'next_response_time' as const },
                  { label: 'Resolución (min)', key: 'resolution_time' as const },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-[11px] font-medium text-[#646462] mb-1">{label}</label>
                    <input type="number" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder="—"
                      className="w-full border border-[#e9eae6] rounded-lg px-2 py-2 text-[13px] outline-none focus:border-[#7c5cfc]" />
                  </div>
                ))}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.business_hours} onChange={e => setForm(f => ({ ...f, business_hours: e.target.checked }))} />
                <span className="text-[13px] text-[#1a1a1a]">Solo horario laboral</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-[13px] text-[#646462] hover:bg-[#f3f3f1] rounded-lg">Cancelar</button>
              <button onClick={addPolicy} className="px-4 py-2 text-[13px] bg-[#222] text-white rounded-lg hover:bg-[#333]">Crear</button>
            </div>
          </div>
        </div>
      )}
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

type AutomationRule = {
  id: string; name: string; event_name: string; active: boolean;
  run_count: number; condition_match: string;
  conditions: Array<{ attribute: string; operator: string; value: unknown }>;
  actions: Array<{ action_name: string; action_params: Record<string, unknown> }>;
};

const EVENT_LABELS: Record<string, string> = {
  conversation_created:  'Conversación creada',
  conversation_updated:  'Conversación actualizada',
  conversation_resolved: 'Conversación resuelta',
  conversation_opened:   'Conversación abierta',
  message_created:       'Mensaje recibido',
  contact_created:       'Contacto creado',
  contact_updated:       'Contacto actualizado',
};

const ACTION_LABELS: Record<string, string> = {
  assign_team:    'Asignar equipo',
  assign_agent:   'Asignar agente',
  add_label:      'Añadir etiqueta',
  remove_label:   'Eliminar etiqueta',
  send_message:   'Enviar mensaje',
  send_email:     'Enviar email',
  update_status:  'Cambiar estado',
  mute_conversation: 'Silenciar conversación',
  snooze:         'Posponer',
};

function AutomationView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'rules' | 'settings'>('rules');
  const [showNewRule, setShowNewRule] = useState(false);
  const [rules, setRules] = useState<AutomationRule[]>([
    {
      id: '1', name: 'Auto-asignar soporte técnico', event_name: 'conversation_created',
      active: true, run_count: 142, condition_match: 'all',
      conditions: [{ attribute: 'status', operator: 'equals', value: 'open' }],
      actions: [{ action_name: 'assign_team', action_params: { team: 'Soporte Técnico' } }],
    },
    {
      id: '2', name: 'Etiquetar urgente por palabra clave', event_name: 'message_created',
      active: true, run_count: 88, condition_match: 'any',
      conditions: [{ attribute: 'message.content', operator: 'contains', value: 'urgente' }],
      actions: [{ action_name: 'add_label', action_params: { label: 'urgente' } }],
    },
    {
      id: '3', name: 'Cerrar conversaciones inactivas', event_name: 'conversation_updated',
      active: false, run_count: 0, condition_match: 'all',
      conditions: [],
      actions: [{ action_name: 'update_status', action_params: { status: 'resolved' } }],
    },
  ]);

  // New rule form state
  const [newName, setNewName] = useState('');
  const [newEvent, setNewEvent] = useState('conversation_created');
  const [newMatch, setNewMatch] = useState<'all' | 'any'>('all');
  const [newAction, setNewAction] = useState('assign_team');

  function handleToggle(id: string) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  }

  function handleCreate() {
    if (!newName.trim()) return;
    setRules(prev => [...prev, {
      id: String(Date.now()), name: newName, event_name: newEvent,
      active: true, run_count: 0, condition_match: newMatch,
      conditions: [], actions: [{ action_name: newAction, action_params: {} }],
    }]);
    setNewName(''); setShowNewRule(false);
  }

  function handleDelete(id: string) {
    setRules(prev => prev.filter(r => r.id !== id));
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <div className="flex items-center gap-3">
              <h1 className="text-[20px] font-bold text-[#1a1a1a]">Automatización</h1>
              <span className="text-[12px] bg-[#f3f3f1] text-[#646462] px-2 py-0.5 rounded-full">{rules.filter(r => r.active).length} activas</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => onNavigate('automation')} className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.5"><path d="M13 3H3v10h10V3z"/><path d="M3 7h10M7 3v10"/></svg>
                Flujos de trabajo
              </button>
              <button onClick={() => setShowNewRule(true)}
                className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">
                + Nueva regla
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
            {[{ id: 'rules' as const, label: 'Reglas' }, { id: 'settings' as const, label: 'Configuración' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.id ? 'border-[#fa7938] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {tab === 'rules' && (
              <div className="px-6 py-4 flex flex-col gap-3">
                {/* New rule form */}
                {showNewRule && (
                  <div className="border border-[#3b59f6] rounded-[10px] px-5 py-4 bg-[#f8f9ff] flex flex-col gap-3">
                    <p className="text-[13px] font-semibold text-[#1a1a1a]">Nueva regla de automatización</p>
                    <div className="grid grid-cols-3 gap-3">
                      <input value={newName} onChange={e => setNewName(e.target.value)}
                        placeholder="Nombre de la regla..."
                        className="col-span-3 border border-[#e9eae6] rounded-[6px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3b59f6]" />
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-[#646462] uppercase tracking-wide">Evento</label>
                        <select value={newEvent} onChange={e => setNewEvent(e.target.value)}
                          className="border border-[#e9eae6] rounded-[6px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3b59f6] bg-white">
                          {Object.entries(EVENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-[#646462] uppercase tracking-wide">Condiciones</label>
                        <select value={newMatch} onChange={e => setNewMatch(e.target.value as 'all' | 'any')}
                          className="border border-[#e9eae6] rounded-[6px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3b59f6] bg-white">
                          <option value="all">Todas (AND)</option>
                          <option value="any">Alguna (OR)</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium text-[#646462] uppercase tracking-wide">Acción principal</label>
                        <select value={newAction} onChange={e => setNewAction(e.target.value)}
                          className="border border-[#e9eae6] rounded-[6px] px-3 py-2 text-[13px] focus:outline-none focus:border-[#3b59f6] bg-white">
                          {Object.entries(ACTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowNewRule(false)} className="px-4 py-[6px] text-[13px] border border-[#e9eae6] rounded-full hover:bg-[#f3f3f1]">Cancelar</button>
                      <button onClick={handleCreate} className="px-4 py-[6px] text-[13px] font-semibold bg-[#1a1a1a] text-white rounded-full hover:bg-[#444]">Crear regla</button>
                    </div>
                  </div>
                )}

                {/* Rules list */}
                {rules.map(rule => (
                  <div key={rule.id} className={`border rounded-[10px] px-5 py-4 flex items-start gap-4 transition-colors ${rule.active ? 'border-[#e9eae6] bg-white' : 'border-[#e9eae6] bg-[#f8f8f7] opacity-70'}`}>
                    {/* Toggle */}
                    <button onClick={() => handleToggle(rule.id)}
                      className={`mt-0.5 w-8 h-[18px] rounded-full flex-shrink-0 relative transition-colors ${rule.active ? 'bg-[#22c55e]' : 'bg-[#e9eae6]'}`}>
                      <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${rule.active ? 'right-0.5' : 'left-0.5'}`}/>
                    </button>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-[#1a1a1a]">{rule.name}</span>
                        <span className="text-[11px] bg-[#f3f3f1] text-[#646462] px-2 py-0.5 rounded-full">
                          {EVENT_LABELS[rule.event_name] ?? rule.event_name}
                        </span>
                        {rule.run_count > 0 && (
                          <span className="text-[11px] text-[#646462]">· Ejecutada {rule.run_count} veces</span>
                        )}
                      </div>
                      {/* Conditions + actions summary */}
                      <div className="flex items-center gap-4 mt-2 text-[12px] text-[#646462] flex-wrap">
                        {rule.conditions.length > 0 ? (
                          <span className="flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M3.5 6h5M5 9h2" stroke="#646462" strokeWidth="1.2" strokeLinecap="round"/></svg>
                            {rule.conditions.length} condición{rule.conditions.length !== 1 ? 'es' : ''} ({rule.condition_match === 'all' ? 'todas' : 'alguna'})
                          </span>
                        ) : (
                          <span className="text-[#aaa]">Sin condiciones (siempre se ejecuta)</span>
                        )}
                        <span className="flex items-center gap-1 text-[#fa7938]">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v5l3 2" stroke="#fa7938" strokeWidth="1.2" strokeLinecap="round"/><circle cx="6" cy="6" r="5" stroke="#fa7938" strokeWidth="1.2"/></svg>
                          {rule.actions.map(a => ACTION_LABELS[a.action_name] ?? a.action_name).join(', ')}
                        </span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button className="px-3 py-[5px] text-[12px] border border-[#e9eae6] rounded-full hover:bg-[#f3f3f1] text-[#1a1a1a]">Editar</button>
                      <button onClick={() => handleDelete(rule.id)} className="px-3 py-[5px] text-[12px] border border-[#e9eae6] rounded-full hover:bg-red-50 text-[#dc2626]">Eliminar</button>
                    </div>
                  </div>
                ))}

                {rules.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-[#646462]">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="6" y="10" width="28" height="20" rx="3" stroke="#e9eae6" strokeWidth="2"/><path d="M6 16h28M14 10v4M26 10v4" stroke="#e9eae6" strokeWidth="2" strokeLinecap="round"/></svg>
                    <span className="text-[15px] font-medium">No hay reglas de automatización</span>
                    <button onClick={() => setShowNewRule(true)} className="mt-2 px-4 py-2 bg-[#1a1a1a] text-white rounded-full text-[13px] font-semibold hover:bg-[#444]">+ Crear primera regla</button>
                  </div>
                )}
              </div>
            )}

            {tab === 'settings' && (
              <div className="px-6 py-6 flex flex-col gap-4">
                {[
                  { title: 'Activar el Inbox del bot', desc: 'Mantén tus conversaciones en un buzón independiente mientras Fin AI Agent y los flujos de trabajo están activos.', on: true },
                  { title: 'Cierre automático de conversaciones abandonadas', desc: 'Si un cliente no ha respondido en 3 minutos, la conversación se cerrará automáticamente.', on: false },
                  { title: 'Notificar al agente al ejecutar una regla', desc: 'Muestra una notificación en el inbox cuando una regla de automatización se ejecuta en una conversación asignada.', on: true },
                ].map(item => (
                  <div key={item.title} className="border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-[#1a1a1a]">{item.title}</p>
                      <p className="text-[12px] text-[#646462] mt-0.5">{item.desc}</p>
                    </div>
                    <div className={`w-8 h-[18px] rounded-full relative flex-shrink-0 cursor-pointer ${item.on ? 'bg-[#22c55e]' : 'bg-[#e9eae6]'}`}>
                      <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow ${item.on ? 'right-0.5' : 'left-0.5'}`}/>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AppStoreView ──────────────────────────────────────────────────────────────

type AppCardData = { name: string; img: string; desc: string };
const APP_STORE_POPULAR: AppCardData[] = [
  { name: 'Salesforce',        img: IMG_APP_SALESFORCE, desc: 'Sync data and streamline workflows for sales, marketing…' },
  { name: 'Instagram',         img: IMG_APP_INSTAGRAM,  desc: 'Easily reply to Instagram private messages from your…' },
  { name: 'Google Analytics',  img: IMG_APP_GA,         desc: 'Measure the impact of your Messenger on website…' },
  { name: 'Jira for Tickets',  img: IMG_APP_JIRA,       desc: 'Create Jira Issues from Intercom and automate with…' },
];
const APP_STORE_NEW: AppCardData[] = [
  { name: 'Instagram',         img: IMG_APP_INSTAGRAM,  desc: 'Easily reply to Instagram private messages from your…' },
  { name: 'Jira for Tickets',  img: IMG_APP_JIRA,       desc: 'Create Jira Issues from Intercom and automate with…' },
  { name: 'WhatsApp',          img: IMG_APP_WHATSAPP,   desc: 'Easily receive and reply to WhatsApp messages from your…' },
  { name: 'Delighted Inc.',    img: IMG_APP_DELIGHTED,  desc: 'Sync customer feedback and trigger surveys based on key…' },
];
const APP_STORE_FREE: AppCardData[] = [
  { name: 'Instagram',         img: IMG_APP_INSTAGRAM,  desc: 'Easily reply to Instagram private messages from your…' },
  { name: 'Jira for Tickets',  img: IMG_APP_JIRA,       desc: 'Create Jira Issues from Intercom and automate with…' },
  { name: 'Quick Links',       img: IMG_APP_QUICKLINKS, desc: 'Save time by creating smart links for your common tools or…' },
  { name: 'Get a Demo',        img: IMG_APP_DEMO,       desc: 'Capture and qualify leads who want a product demo' },
];
const APP_STORE_SUPPORT: AppCardData[] = [
  { name: 'Instagram',         img: IMG_APP_INSTAGRAM,  desc: 'Easily reply to Instagram private messages from your…' },
  { name: 'Jira for Tickets',  img: IMG_APP_JIRA,       desc: 'Create Jira Issues from Intercom and automate with…' },
  { name: 'WhatsApp',          img: IMG_APP_WHATSAPP,   desc: 'Easily receive and reply to WhatsApp messages from your…' },
  { name: 'Stripe',            img: IMG_APP_STRIPE,     desc: 'View Stripe data from Intercom' },
];

function AppCard({ name, img, desc }: { name: string; img: string; desc: string }) {
  return (
    <div className="bg-white border border-[#e9eae6] rounded-[6px] px-[21px] pt-[21px] pb-[21px] flex flex-col gap-[15px] hover:border-[#c8c9c4] cursor-pointer">
      <img src={img} alt="" className="w-12 h-12 rounded-[8px]" />
      <p className="text-[16px] font-medium text-[#1a1a1a] leading-[24px]">{name}</p>
      <p className="text-[14px] text-[#646462] leading-[20px] line-clamp-3">{desc}</p>
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
              <div className="grid grid-cols-2 gap-0">
                <a href="#" className="relative h-[300px] rounded-[16px] overflow-hidden bg-[#f0f1ef] flex flex-col items-center pb-[51px] pt-[55px] px-[40px]" data-node-id="1:30005">
                  <img src={IMG_APPSTORE_BUILT} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="relative flex-1 flex items-start w-full max-w-[324px]">
                    <p className="text-[36px] font-bold leading-[46.8px] text-black" style={{ textShadow: '0px 0px 5px white' }}>Built by Intercom</p>
                  </div>
                  <div className="relative self-start">
                    <span className="inline-block border border-black rounded-[6px] px-[17px] py-[11px] text-[14px] text-black bg-white/30 backdrop-blur-sm">View collection →</span>
                  </div>
                </a>
                <a href="#" className="relative h-[300px] rounded-[16px] overflow-hidden bg-[#f0f1ef] flex flex-col items-center pb-[51px] pt-[55px] px-[40px]" data-node-id="1:30014">
                  <img src={IMG_APPSTORE_MEETING} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="relative flex-1 flex items-start w-full max-w-[324px]">
                    <p className="text-[36px] font-bold leading-[46.8px] text-white" style={{ textShadow: '0px 0px 5px black' }}>Seamlessly<br/>schedule meetings</p>
                  </div>
                  <div className="relative self-start">
                    <span className="inline-block border border-white rounded-[6px] px-[17px] py-[11px] text-[14px] text-white">View collection →</span>
                  </div>
                </a>
              </div>
              {/* Popular */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[15px] font-semibold text-[#1a1a1a]">Popular</p>
                  <button className="text-[13px] text-[#3b59f6] hover:underline">See all →</button>
                </div>
                <div className="grid grid-cols-4 gap-3">{APP_STORE_POPULAR.map(a => <AppCard key={a.name} name={a.name} img={a.img} desc={a.desc} />)}</div>
              </div>
              {/* New & noteworthy */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[15px] font-semibold text-[#1a1a1a]">New & noteworthy</p>
                  <button className="text-[13px] text-[#3b59f6] hover:underline">See all →</button>
                </div>
                <div className="grid grid-cols-4 gap-3">{APP_STORE_NEW.map(a => <AppCard key={a.name} name={a.name} img={a.img} desc={a.desc} />)}</div>
              </div>
              {/* Free apps */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[15px] font-semibold text-[#1a1a1a]">Free apps to install</p>
                  <button className="text-[13px] text-[#3b59f6] hover:underline">See all →</button>
                </div>
                <div className="grid grid-cols-4 gap-3">{APP_STORE_FREE.map(a => <AppCard key={a.name} name={a.name} img={a.img} desc={a.desc} />)}</div>
              </div>
              {/* For support teams */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[15px] font-semibold text-[#1a1a1a]">For support teams</p>
                  <button className="text-[13px] text-[#3b59f6] hover:underline">See all →</button>
                </div>
                <div className="grid grid-cols-4 gap-3">{APP_STORE_SUPPORT.map(a => <AppCard key={a.name} name={a.name} img={a.img} desc={a.desc} />)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ConnectorsView ────────────────────────────────────────────────────────────

const CONNECTOR_CARDS: { svg: string; label: string; bg: string }[] = [
  { svg: SVG_CONN_CREATE,  label: 'Crear desde cero',     bg: '#f8f8f7' },
  { svg: SVG_CONN_MCP,     label: 'MCP personalizado',    bg: '#f8f8f7' },
  { svg: SVG_CONN_STRIPE,  label: 'Stripe',               bg: '#d1e0fa' },
  { svg: SVG_CONN_LINEAR,  label: 'Linear',               bg: '#d9dbf2' },
  { svg: SVG_CONN_SHOPIFY, label: 'Shopify Storefront',   bg: '#e2f0db' },
  { svg: SVG_CONN_USAGE,   label: 'Uso de conectores de datos\npara la automatización', bg: '#f8f8f7' },
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
                <button key={card.label} className="bg-white border border-[#e9eae6] rounded-[12px] p-[17px] flex flex-col items-start justify-between gap-[46px] text-left hover:border-[#c8c9c4] hover:shadow-sm transition-all min-h-[144px]">
                  <div className="w-11 h-11 rounded-[12px] flex items-center justify-center" style={{ background: card.bg }}>
                    <img src={card.svg} alt="" className="w-4 h-4" />
                  </div>
                  <p className="text-[14px] font-semibold text-[#1a1a1a] leading-[20px] whitespace-pre-line">{card.label}</p>
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
                <div className="w-[508px] flex-shrink-0 flex items-center justify-center">
                  <img src={IMG_USERDATA_BANNER} alt="People data banner" className="w-[508px] h-[251px]" data-node-id="1:34193" />
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
                <div className="w-[208px] flex-shrink-0 flex items-center justify-center">
                  <img src={IMG_QUALIFICATION} alt="Vista previa del perfil de calificación" className="w-[208px] h-[299px]" data-node-id="1:37921" />
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

// ── CompaniesListView ─────────────────────────────────────────────────────────
// CRM view showing company records (navigated from ContactsSidebar → Empresas)

function CompaniesListView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [search, setSearch] = useState('');

  const companies = [
    { id: '1', name: 'Acme Corp', domain: 'acme.com', industry: 'Software', contacts: 12, lastActivity: 'hace 2 horas', country: 'España' },
    { id: '2', name: 'Globex Industries', domain: 'globex.io', industry: 'Manufactura', contacts: 5, lastActivity: 'hace 1 día', country: 'USA' },
    { id: '3', name: 'Initech Solutions', domain: 'initech.com', industry: 'Consultoría', contacts: 3, lastActivity: 'hace 3 días', country: 'España' },
    { id: '4', name: 'Umbrella Ltd', domain: 'umbrella.co', industry: 'Salud', contacts: 27, lastActivity: 'hace 1 semana', country: 'UK' },
  ];

  const filtered = companies.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.domain.includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden">
      <div className="h-full flex-shrink-0 pt-3 pb-3 pl-1">
        <div className="h-full rounded-[16px] overflow-hidden bg-[#fbfbf9] drop-shadow-[0px_1px_2px_rgba(20,20,20,0.15)] w-[230px]">
          <ContactsSidebar view={view} onNavigate={onNavigate} />
        </div>
      </div>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-white rounded-[16px] mx-2 my-2 shadow-[0px_1px_2px_rgba(20,20,20,0.15)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-3 border-b border-[#e9eae6] flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('contacts')} className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#f8f8f7] hover:bg-[#efefed]">
              <img src={ICON_BACK} alt="" className="w-4 h-4" />
            </button>
            <span className="text-[20px] font-semibold text-[#1a1a1a] tracking-[-0.4px]">Empresas</span>
            <span className="text-[13px] text-[#646462] bg-[#f3f3f1] rounded-full px-2 py-0.5">{filtered.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 bg-[#f8f8f7] rounded-full pl-[12px] pr-[6px] py-[8px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#efefed]">
              <img src={ICON_FILTER} alt="" className="w-3.5 h-3.5" />
              <span>Filtrar</span>
              <img src={ICON_CHEVRON} alt="" className="w-3.5 h-3.5 opacity-40" />
            </button>
            <button className="flex items-center gap-1.5 bg-[#222] rounded-full px-[14px] py-[8px] text-[13px] font-semibold text-[#f8f8f7] hover:bg-[#333]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <span>Nueva empresa</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-3 flex-shrink-0">
          <div className="flex items-center gap-2 border border-[#e9eae6] rounded-[8px] px-3 py-2 bg-[#f8f8f7] max-w-[360px]">
            <img src={ICON_SEARCH2} alt="" className="w-3.5 h-3.5 opacity-40 flex-shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar empresas..."
              className="flex-1 bg-transparent text-[13px] text-[#1a1a1a] placeholder-[#646462] focus:outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-[#e9eae6]">
                <th className="text-left py-3 pr-4 font-medium text-[#646462] text-[12px] w-7"><input type="checkbox" className="w-3.5 h-3.5 rounded border-[#e9eae6]" /></th>
                <th className="text-left py-3 pr-4 font-medium text-[#646462] text-[12px]">Empresa</th>
                <th className="text-left py-3 pr-4 font-medium text-[#646462] text-[12px]">Dominio</th>
                <th className="text-left py-3 pr-4 font-medium text-[#646462] text-[12px]">Sector</th>
                <th className="text-left py-3 pr-4 font-medium text-[#646462] text-[12px]">Contactos</th>
                <th className="text-left py-3 pr-4 font-medium text-[#646462] text-[12px] flex items-center gap-1">
                  <span className="text-[#e35712]">Última actividad</span>
                </th>
                <th className="text-left py-3 font-medium text-[#646462] text-[12px]">País</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-20 text-center text-[#646462] text-[14px]">No se encontraron empresas</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="border-b border-[#f3f3f1] hover:bg-[#f8f8f7] cursor-pointer group">
                  <td className="py-3 pr-4"><input type="checkbox" className="w-3.5 h-3.5 rounded border-[#e9eae6]" /></td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-[6px] bg-[#f3f3f1] border border-[#e9eae6] flex items-center justify-center text-[11px] font-bold text-[#646462] flex-shrink-0">
                        {c.name[0]}
                      </div>
                      <span className="font-medium text-[#1a1a1a] group-hover:text-[#e35712] transition-colors">{c.name}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-[#646462]">{c.domain}</td>
                  <td className="py-3 pr-4 text-[#646462]">{c.industry}</td>
                  <td className="py-3 pr-4">
                    <span className="inline-flex items-center gap-1 text-[#1a1a1a]">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="4" r="2.5" stroke="#646462" strokeWidth="1.1"/><path d="M1 10c0-2.21 2.239-4 5-4s5 1.79 5 4" stroke="#646462" strokeWidth="1.1" strokeLinecap="round"/></svg>
                      {c.contacts}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-[#646462]">{c.lastActivity}</td>
                  <td className="py-3 text-[#646462]">{c.country}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── EmpresasView (1-41345 + 1-42522) ──────────────────────────────────────────

function EmpresasView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
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

// ── WorkspaceSecurityView (1-44080) ───────────────────────────────────────────

function WorkspaceSecurityView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'enlaces'>('enlaces');
  const [untrustedOn, setUntrustedOn] = useState(true);
  const [maliciousOn, setMaliciousOn] = useState(true);
  const [showDefaults, setShowDefaults] = useState(true);
  const tabs = [
    { id: 'workspace' as const, label: 'Espacio de trabajo' },
    { id: 'datos'     as const, label: 'Datos' },
    { id: 'messenger' as const, label: 'Messenger' },
    { id: 'archivos'  as const, label: 'Archivos adjuntos' },
    { id: 'enlaces'   as const, label: 'Enlaces' },
    { id: 'auth'      as const, label: 'Autenticación de clientes' },
    { id: 'estado'    as const, label: 'Comprobación de estado' },
  ];

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
          {/* Yellow security warning banner */}
          <div className="bg-[#fef3c7] border-b border-[#fde68a] px-6 py-3 flex items-center justify-center text-[13px] text-[#1a1a1a] flex-shrink-0">
            <span className="text-[#f59e0b] mr-2">⚠</span>
            Ingresa un contacto de seguridad obligatorio en caso de un incidente de seguridad. Haz <a href="#" className="text-[#3b59f6] underline ml-1">clic aquí</a>.
          </div>
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Seguridad</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
              Más información <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
            </button>
          </div>
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0 overflow-x-auto">
            {tabs.map(t => (
              <button key={t.id} onClick={() => t.id === 'enlaces' && setTab('enlaces')}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  tab === t.id ? 'border-[#fa7938] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
            <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">Seguridad de los enlaces</h2>
            <p className="text-[13px] text-[#646462] mb-5">Controla la configuración de seguridad de los enlaces en las conversaciones</p>
            <div className="grid grid-cols-2 gap-4 mb-8">
              {/* Untrusted card */}
              <div className="border border-[#e9eae6] rounded-[12px] overflow-hidden">
                <div className="bg-[#f8f8f7] py-10 flex items-center justify-center">
                  <div className="bg-[#ffe8d6] border border-[#fdba74] rounded-full px-4 py-2 text-[13px] text-[#1a1a1a] flex items-center gap-2">
                    <span className="text-[#f97316]">⚠</span>
                    <span>www.untrusted-warning.com</span>
                  </div>
                </div>
                <div className="px-4 py-3 flex items-start gap-3">
                  <Toggle on={untrustedOn} onToggle={() => setUntrustedOn(v => !v)} />
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-[#1a1a1a] mb-0.5">Advertencias no confiables</p>
                    <p className="text-[12px] text-[#646462]">Pide a tus compañeros de equipo que revisen detenidamente los enlaces que no son de confianza antes de abrirlos. <a href="#" className="text-[#3b59f6] underline">(Ver ejemplo)</a></p>
                  </div>
                </div>
              </div>
              {/* Malicious card */}
              <div className="border border-[#e9eae6] rounded-[12px] overflow-hidden">
                <div className="bg-[#f8f8f7] py-10 flex items-center justify-center">
                  <div className="bg-[#fee2e2] border border-[#fca5a5] rounded-full px-4 py-2 text-[13px] text-[#1a1a1a] flex items-center gap-2">
                    <span className="text-[#dc2626]">▲</span>
                    <span>www.malicious-warning.com</span>
                  </div>
                </div>
                <div className="px-4 py-3 flex items-start gap-3">
                  <Toggle on={maliciousOn} onToggle={() => setMaliciousOn(v => !v)} />
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-[#1a1a1a] mb-0.5">Advertencias maliciosas</p>
                    <p className="text-[12px] text-[#646462]">Detecta enlaces maliciosos y exige a los compañeros de equipo que reconozcan los riesgos antes de abrir. <a href="#" className="text-[#3b59f6] underline">(Ver ejemplo)</a></p>
                  </div>
                </div>
              </div>
            </div>

            <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">Enlaces de confianza y bloqueados</h2>
            <p className="text-[13px] text-[#646462] mb-4">Define políticas para controlar qué enlaces son de confianza o están bloqueados dentro de las conversaciones. Los enlaces de confianza no activarán advertencias ni se someterán a detección maliciosa. Los enlaces utilizados por tu espacio de trabajo se consideran predeterminada. Los compañeros de equipo no podrán abrir enlaces bloqueados.</p>
            <div className="flex items-center gap-3 mb-4">
              <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Añadir política</button>
              <Toggle on={showDefaults} onToggle={() => setShowDefaults(v => !v)} />
              <span className="text-[13px] text-[#1a1a1a]">Mostrar políticas predeterminadas</span>
            </div>
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-[#e9eae6] bg-[#fafaf9]">
                <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Item</th>
                <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Type</th>
                <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Action</th>
                <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Added By</th>
                <th className="text-left px-4 py-2 font-medium text-[#646462] text-[12px]">Date</th>
              </tr></thead>
              <tbody>
                {['*.intercom.com', '*.intercom.io', '*.intercomcdn.com', '*.intercomcdn.eu', '*.intercom-attachments.com', '*.intercom-attachments-1.com'].map(item => (
                  <tr key={item} className="border-b border-[#f3f3f1] hover:bg-[#fafaf9]">
                    <td className="px-4 py-2 text-[#1a1a1a]">{item}</td>
                    <td className="px-4 py-2"><span className="bg-[#f0f0ec] rounded-full px-2 py-0.5 text-[12px] text-[#646462]">Dominio</span></td>
                    <td className="px-4 py-2 text-[#646462]">Predeterminado</td>
                    <td className="px-4 py-2"><span className="bg-[#dcfce7] text-[#166534] rounded-full px-2 py-0.5 text-[12px]">Trusted</span></td>
                    <td className="px-4 py-2 text-[#646462]">Intercom</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-center mt-4">
              <button className="border border-[#e9eae6] rounded-full px-4 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Load more</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── WorkspaceMultilingualView (1-45264) ───────────────────────────────────────

function WorkspaceMultilingualView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'general' | 'glosario'>('general');
  const [aiTranslate, setAiTranslate] = useState(false);
  const [defaultLang, setDefaultLang] = useState('English');

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
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Multilingüe</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Más información</button>
              <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">Guardar</button>
            </div>
          </div>
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
            {(['general', 'glosario'] as const).map(id => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors capitalize ${
                  tab === id ? 'border-[#fa7938] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {id === 'general' ? 'General' : 'Glosario'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
            {tab === 'general' && <>
              {/* AI translation card */}
              <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6 mb-8">
                <div className="flex-1">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Traducciones de IA para el buzón</h3>
                  <p className="text-[13px] text-[#646462]">Traduce automáticamente las respuestas de los clientes al idioma predeterminado de tu espacio de trabajo en el buzón, y las respuestas de los miembros del equipo al idioma del cliente en todos los canales para ofrecer conversaciones fluidas.</p>
                </div>
                <div className="flex flex-col items-start gap-2 max-w-[380px]">
                  <div className="flex items-center gap-2">
                    <Toggle on={aiTranslate} onToggle={() => setAiTranslate(v => !v)} />
                    <span className="text-[13px] text-[#1a1a1a]">Habilitar la traducción de IA para el buzón</span>
                  </div>
                  <p className="text-[12px] text-[#646462]">Al habilitar esto, das tu consentimiento para el uso de funciones impulsadas por IA y aceptas los <a href="#" className="text-[#3b59f6] underline">Términos y condiciones</a>.</p>
                  <p className="text-[12px] text-[#646462]">Todos los compañeros de equipo podrán ver las traducciones, pero solo los compañeros de equipo con <a href="#" className="text-[#3b59f6] underline">acceso a Copilot</a> podrán traducir automáticamente sus respuestas usando Traducción del buzón con IA.</p>
                </div>
              </div>

              <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Idiomas</h2>
              {/* Workspace languages */}
              <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6 mb-4">
                <div className="flex-1">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Idiomas del área de trabajo</h3>
                  <p className="text-[13px] text-[#646462]">Establece tus idiomas predeterminados y adicionales para la comunicación con el cliente en todos los canales.</p>
                </div>
                <div className="w-[380px] flex-shrink-0">
                  <p className="text-[13px] font-medium text-[#1a1a1a] mb-1">Idioma predeterminado</p>
                  <p className="text-[12px] text-[#646462] mb-2">Seleccione el idioma predeterminado para la atención a clientes.</p>
                  <select value={defaultLang} onChange={e => setDefaultLang(e.target.value)} className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] mb-3 bg-white">
                    <option>English</option><option>Español</option><option>Français</option><option>Deutsch</option>
                  </select>
                  <p className="text-[13px] font-medium text-[#1a1a1a] mb-1">Idiomas adicionales</p>
                  <p className="text-[12px] text-[#646462] mb-2">Seleccione hasta dos idiomas adicionales.</p>
                  <button className="text-[13px] text-[#fa7938] font-medium">+ Agregar idioma</button>
                </div>
              </div>

              {/* Supported languages */}
              <div className="border border-[#e9eae6] rounded-[12px] p-5 flex items-start gap-6 mb-4">
                <div className="flex-1">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Idiomas admitidos</h3>
                  <p className="text-[13px] text-[#646462]">Idiomas que Fin y Messenger pueden detectar y traducir automáticamente las conversaciones en este espacio de trabajo.</p>
                  <a href="#" className="text-[13px] text-[#3b59f6] underline mt-2 inline-block">Consulta la lista completa de idiomas compatibles</a>
                </div>
                <div className="w-[380px] flex-shrink-0">
                  <select className="w-full border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] bg-white">
                    <option>Todo</option>
                  </select>
                </div>
              </div>

              <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-3 mt-4">Tono de traducción</h2>
            </>}
            {tab === 'glosario' && (
              <p className="text-[13px] text-[#646462]">Glosario de traducciones (próximamente).</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── BillingView (1-46200 + 1-47188) ───────────────────────────────────────────

function BillingView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'suscripcion' | 'facturas' | 'pago'>('suscripcion');
  const tabs = [
    { id: 'suscripcion' as const, label: 'Suscripción' },
    { id: 'facturas'    as const, label: 'Facturas' },
    { id: 'pago'        as const, label: 'Detalles de pago' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Facturación</h1>
            <div className="flex items-center gap-2">
              {tab === 'suscripcion' && <>
                <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                  Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
                </button>
                <button className="border border-[#e9eae6] rounded-full px-4 py-[7px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Deja un comentario</button>
              </>}
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
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
            {tab === 'suscripcion' && <>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-[16px] font-bold text-[#1a1a1a]">Prueba gratuita</h2>
                  <p className="text-[13px] text-[#646462] mt-1">Fecha de finalización de la prueba: 20 may 2026</p>
                </div>
                <p className="text-[14px] font-semibold text-[#1a1a1a]">USD 0.00</p>
              </div>
              {/* Plan card */}
              <div className="border border-[#e9eae6] rounded-[12px] mb-4">
                <div className="px-5 py-3 border-b border-[#e9eae6] flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-[#1a1a1a]">Plan</p>
                  <button className="text-[13px] text-[#646462] flex items-center gap-1 hover:text-[#1a1a1a]">≡ Ver funciones incluidas</button>
                </div>
                <div className="px-5 py-4 flex items-center gap-3">
                  <span className="text-[14px] font-medium text-[#1a1a1a]">Advanced</span>
                  <span className="bg-[#e0e7ff] text-[#4338ca] rounded-full px-2 py-0.5 text-[11px] font-medium">Prueba De Advanced</span>
                  <button className="text-[13px] text-[#646462] hover:text-[#1a1a1a] flex items-center gap-1 ml-auto">⚙ Cambiar plan</button>
                </div>
                <div className="px-5 py-3 border-t border-[#e9eae6] bg-[#fafaf9]">
                  <p className="text-[12px] text-[#646462] flex items-start gap-2"><span className="text-[#3b59f6]">ⓘ</span>Los cambios de plazas pueden tardar hasta 24 horas en reflejarse aquí.</p>
                </div>
              </div>
              {/* Complementos card */}
              <div className="border border-[#e9eae6] rounded-[12px]">
                <div className="px-5 py-3 border-b border-[#e9eae6]">
                  <p className="text-[13px] font-semibold text-[#1a1a1a]">Complementos</p>
                </div>
                {[['Asistencia proactiva Plus', 'Prueba'], ['Fin AI Copilot', 'Prueba'], ['Pro', 'Prueba']].map(([n, b]) => (
                  <div key={n} className="px-5 py-3 border-b border-[#f3f3f1] last:border-0 flex items-center gap-3">
                    <span className="text-[13px] text-[#1a1a1a]">{n}</span>
                    <span className="bg-[#e0e7ff] text-[#4338ca] rounded-full px-2 py-0.5 text-[11px] font-medium">{b}</span>
                  </div>
                ))}
              </div>
            </>}

            {tab === 'facturas' && (
              <p className="text-[13px] text-[#646462]">No hay facturas disponibles aún.</p>
            )}

            {tab === 'pago' && <>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-4">Pago</h2>
              <div className="flex flex-col gap-2 mb-8">
                <p className="text-[13px] text-[#1a1a1a]"><span>📅</span> <strong>Fecha de facturación:</strong> 5th de cada mes</p>
                <p className="text-[13px] text-[#1a1a1a]"><span>💳</span> Facturado a: no se agregó una tarjeta de crédito. <a href="#" className="text-[#3b59f6] underline ml-1">Agregar tarjeta</a></p>
                <p className="text-[13px] text-[#1a1a1a]"><span>🏢</span> Ubicación de la empresa: no se agregó la dirección de la empresa. <a href="#" className="text-[#3b59f6] underline ml-1">Agregar dirección de la empresa</a></p>
                <p className="text-[13px] text-[#1a1a1a]"><span>🏢</span> Nombre de la empresa: Acme. <a href="#" className="text-[#3b59f6] underline ml-1">Editar nombre de la empresa</a></p>
              </div>
              <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2">Contactos de facturación</h2>
              <p className="text-[13px] text-[#646462] mb-3">Envía facturas, excedentes y otros mensajes relacionados con la facturación a la siguiente lista: <span className="text-[#646462]">⓵</span></p>
              <div className="border border-[#e9eae6] rounded-[8px] p-3 mb-2 flex flex-wrap items-center gap-2">
                <span className="bg-[#f3f3f1] rounded-full px-3 py-1 text-[13px] text-[#1a1a1a]">hectorvidal041103@gmail.com</span>
                <input placeholder="Ingresa una dirección de correo electrónico" className="flex-1 min-w-[200px] outline-none text-[13px] bg-transparent" />
              </div>
              <p className="text-[12px] text-[#646462] mb-4">Puedes agregar varias direcciones de correo electrónico separándolas con una coma o un espacio.</p>
              <button className="bg-[#f3f3f1] text-[#646462] rounded-full px-4 py-[7px] text-[13px] font-semibold cursor-not-allowed">Guardar</button>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MessengerView (1-48766 + 1-50442 + 1-52109) ───────────────────────────────

function MessengerView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'widget' | 'destacado' | 'sdk' | 'conversaciones' | 'general' | 'instalar' | 'seguridad'>('widget');
  const [subTab, setSubTab] = useState<'contenido' | 'apariencia'>('contenido');
  const [audience, setAudience] = useState<'visitantes' | 'todos' | 'audiencia' | 'nadie'>('nadie');
  const tabs = [
    { id: 'widget'         as const, label: 'Widget' },
    { id: 'destacado'      as const, label: 'Destacado' },
    { id: 'sdk'            as const, label: 'SDK de dispositivo móvil' },
    { id: 'conversaciones' as const, label: 'Conversaciones' },
    { id: 'general'        as const, label: 'General' },
    { id: 'instalar'       as const, label: 'Instalar' },
    { id: 'seguridad'      as const, label: 'Seguridad' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Messenger</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
                Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
              </button>
              <button className="bg-[#157c3c] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#0f5e2d] flex items-center gap-1.5">
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-white"><path d="M3 2l11 6-11 6V2z"/></svg>
                Guardar y establecer en vivo
              </button>
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
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left configuration panel */}
            <div className="flex-1 overflow-y-auto p-6 border-r border-[#e9eae6]">
              {(tab === 'widget' || tab === 'sdk') && (
                <div className="bg-[#f3f3f1] rounded-full p-1 inline-flex mb-4">
                  {(['contenido', 'apariencia'] as const).map(id => (
                    <button key={id} onClick={() => setSubTab(id)}
                      className={`px-6 py-1.5 rounded-full text-[13px] font-medium ${
                        subTab === id ? 'bg-white shadow-sm text-[#1a1a1a]' : 'text-[#646462]'
                      }`}>
                      {id === 'contenido' ? 'Contenido' : 'Apariencia'}
                    </button>
                  ))}
                </div>
              )}

              {tab === 'widget' && (
                <div className="flex flex-col gap-2">
                  {['Espacios de trabajo', 'Iniciar directamente en la conversación', 'Mostrar el lanzador de Messenger'].map(s => (
                    <button key={s} className="flex items-center justify-between w-full border border-[#e9eae6] rounded-[10px] px-5 py-4 hover:bg-[#fafaf9]">
                      <span className="text-[14px] font-medium text-[#1a1a1a]">{s}</span>
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M6 4l4 4-4 4"/></svg>
                    </button>
                  ))}
                </div>
              )}

              {tab === 'destacado' && (
                <div className="flex flex-col gap-2 -mt-4">
                  {/* Audiencia (open) */}
                  <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[#e9eae6]">
                      <span className="text-[14px] font-semibold text-[#1a1a1a]">Audiencia</span>
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
                    </div>
                    <div className="p-5">
                      <p className="text-[13px] text-[#646462] mb-4">Elija quién puede ver Spotlight Messenger. Para esa audiencia, reemplaza al Messenger clásico. Por defecto, se vuelve visible para todos los visitantes y clientes potenciales una vez que se implemente Fin for Sales.</p>
                      <div className="flex flex-col gap-2">
                        {[
                          { id: 'visitantes', label: 'Visitantes y leads', desc: 'Todos los visitantes y clientes potenciales de su sitio web, una vez que Fin for Sales esté implementado.', badge: 'Predeterminado' },
                          { id: 'todos', label: 'Todos', desc: 'Todos los visitantes, prospectos y usuarios registrados.' },
                          { id: 'audiencia', label: 'Audiencia específica', desc: 'Defina su propia segmentación.' },
                          { id: 'nadie', label: 'Nadie', desc: 'Desactive Spotlight Messenger.' },
                        ].map(opt => (
                          <button key={opt.id} onClick={() => setAudience(opt.id as typeof audience)}
                            className={`flex items-start gap-3 px-4 py-3 rounded-[8px] border text-left ${
                              audience === opt.id ? 'border-[#3b59f6] bg-[#f5f7ff]' : 'border-[#e9eae6] hover:bg-[#fafaf9]'
                            }`}>
                            <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${
                              audience === opt.id ? 'border-[#3b59f6]' : 'border-[#ccc]'
                            }`}>
                              {audience === opt.id && <div className="w-2 h-2 rounded-full bg-[#3b59f6] m-0.5"/>}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-[13px] font-medium text-[#1a1a1a]">{opt.label}</p>
                                {opt.badge && <span className="bg-[#e0e7ff] text-[#4338ca] rounded-full px-2 py-0.5 text-[11px] font-medium">{opt.badge}</span>}
                              </div>
                              <p className="text-[12px] text-[#646462] mt-0.5">{opt.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {['Apariencia', 'Sugerencias inteligentes'].map(s => (
                    <button key={s} className="flex items-center justify-between w-full border border-[#e9eae6] rounded-[10px] px-5 py-4 hover:bg-[#fafaf9]">
                      <span className="text-[14px] font-semibold text-[#1a1a1a]">{s}{s === 'Sugerencias inteligentes' && <span className="ml-2 bg-[#e0e7ff] text-[#4338ca] rounded-full px-2 py-0.5 text-[11px]">Beta</span>}</span>
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M6 4l4 4 4-4"/></svg>
                    </button>
                  ))}
                </div>
              )}

              {tab === 'sdk' && (
                <div className="flex flex-col gap-2">
                  <div className="border border-[#e9eae6] rounded-[10px] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[#e9eae6]">
                      <span className="text-[14px] font-semibold text-[#1a1a1a]">Espacios de trabajo</span>
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
                    </div>
                    <div className="p-5">
                      <p className="text-[13px] font-medium text-[#1a1a1a] mb-3">Espacios de trabajo</p>
                      <div className="border border-[#e9eae6] rounded-[8px] px-4 py-3 flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 bg-[#1a1a1a] rounded-[6px] flex items-center justify-center">💬</div>
                        <div><p className="text-[13px] font-medium text-[#1a1a1a]">Mensajes</p><p className="text-[11px] text-[#646462]">Un Inbox para conversaciones y tickets</p></div>
                      </div>
                      <button className="text-[13px] text-[#fa7938] font-medium">+ Añadir espacio</button>
                    </div>
                  </div>
                  {['Iniciar directamente en la conversación', 'Configura tu mensaje de bienvenida', 'Personaliza Inicio con aplicaciones'].map(s => (
                    <button key={s} className="flex items-center justify-between w-full border border-[#e9eae6] rounded-[10px] px-5 py-4 hover:bg-[#fafaf9]">
                      <span className="text-[14px] font-medium text-[#1a1a1a]">{s}</span>
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M6 4l4 4 4-4"/></svg>
                    </button>
                  ))}
                </div>
              )}

              {(tab === 'conversaciones' || tab === 'general' || tab === 'instalar' || tab === 'seguridad') && (
                <p className="text-[13px] text-[#646462]">Configuración de {tabs.find(t => t.id === tab)?.label.toLowerCase()} (próximamente).</p>
              )}
            </div>

            {/* Right preview panel */}
            <div className="w-[400px] flex-shrink-0 flex flex-col bg-[#fafaf9] overflow-y-auto">
              {/* Top toolbar */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-[#e9eae6]">
                <button className="flex items-center gap-1 text-[13px] text-[#1a1a1a]">
                  {tab === 'destacado' ? '— Predeterminado' : <>▶ Conversación <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg></>}
                </button>
                <div className="flex items-center gap-1">
                  {tab === 'destacado' ? (
                    <>
                      <button className="px-2 py-1 text-[12px] text-[#646462] flex items-center gap-1">⛶ Participó</button>
                      <button className="px-2 py-1 text-[12px] text-[#646462] flex items-center gap-1">▦ Conversación</button>
                    </>
                  ) : (
                    <>
                      {tab === 'sdk' ? (
                        <>
                          <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#f3f3f1]"><svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M8 0L2 4v8l6 4 6-4V4L8 0z"/></svg></button>
                          <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#f3f3f1]"><svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><circle cx="8" cy="8" r="3"/></svg></button>
                        </>
                      ) : (
                        <>
                          <button className="px-2 py-1 text-[12px] text-[#646462] rounded hover:bg-[#f3f3f1]">Visitantes</button>
                          <button className="px-2 py-1 text-[12px] text-[#646462] rounded hover:bg-[#f3f3f1]">Usuarios</button>
                        </>
                      )}
                      <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#f3f3f1]">☀</button>
                      <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#f3f3f1]">🌙</button>
                    </>
                  )}
                </div>
              </div>
              {/* Warning install card */}
              <div className="m-4 bg-[#fef3c7] border border-[#fde68a] rounded-[10px] p-4">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-[#000]">⚠</span>
                  <div>
                    <p className="text-[13px] font-semibold text-[#1a1a1a]">{tab === 'sdk' ? 'No has instalado el SDK de Intercom para iOS' : 'Aún no has instalado el Messenger para visitantes'}</p>
                    <p className="text-[12px] text-[#646462] mt-1">Con nuestros ejemplos e integraciones sin código, solo te tomará unos minutos</p>
                  </div>
                </div>
                <button className="bg-[#1a1a1a] text-white rounded-full px-3 py-1.5 text-[12px] font-medium mt-2">{tab === 'sdk' ? 'Instalar el SDK de Intercom' : 'Instalar Messenger'}</button>
              </div>
              {/* Mini preview */}
              {tab !== 'destacado' && tab !== 'sdk' && (
                <div className="m-4 bg-white border border-[#e9eae6] rounded-[12px] overflow-hidden shadow-sm">
                  <div className="px-3 py-2 border-b border-[#e9eae6] flex items-center gap-2">
                    <button className="w-6 h-6 flex items-center justify-center hover:bg-[#f3f3f1] rounded">‹</button>
                    <div className="w-7 h-7 bg-[#1a1a1a] rounded-full flex items-center justify-center text-white text-[11px]">H</div>
                    <div className="flex-1"><p className="text-[12px] font-semibold text-[#1a1a1a]">Acme</p><p className="text-[10px] text-[#646462]">⏱ As soon as we can</p></div>
                  </div>
                  <div className="px-3 py-3 text-[11px] text-[#1a1a1a]">Ask us anything, or share your feedback.</div>
                </div>
              )}
              {tab === 'destacado' && (
                <div className="mx-4 mt-auto mb-4">
                  <div className="border border-[#e9eae6] rounded-full px-4 py-2 flex items-center bg-white">
                    <input className="flex-1 text-[12px] outline-none" placeholder="Escribe un mensaje..." />
                    <button>↑</button>
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

// ── EmailView (1-53459) ───────────────────────────────────────────────────────

function EmailView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'dominios' | 'ajustes'>('dominios');
  const tabs = [
    { id: 'dominios' as const, label: 'Dominios y direcciones' },
    { id: 'ajustes'  as const, label: 'Ajustes de correo electrónico' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Correo electrónico</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
              Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
            </button>
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
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            {tab === 'dominios' && <>
              {/* Promo card with banner */}
              <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
                <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]">
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
                </button>
                <div className="flex-1 max-w-[500px]">
                  <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2 leading-[20px]">Brinda asistencia a los clientes por correo electrónico, directamente desde tu Inbox</h2>
                  <p className="text-[13px] text-[#646462] mb-4">Usa el correo electrónico para administrar las conversaciones de los clientes junto con otros canales en el Inbox. Configura respuestas automáticas con Fin AI Agent y usa canales salientes para programar mensajes por segmento.</p>
                  <div className="flex items-center gap-4">
                    <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><rect x="2" y="4" width="12" height="9" rx="1.5"/></svg>Conectar al correo</button>
                    <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M8 2L2 6l6 4 6-4-6-4z"/></svg>Implementa Fin AI Agent por correo electrónico</button>
                  </div>
                </div>
                <img src={IMG_EMAIL_BANNER} alt="Email preview" className="w-[458px] h-[213px] flex-shrink-0 rounded-[8px] object-cover" data-node-id="1:53419" />
              </div>
              {/* Setup card */}
              <div className="border border-[#e9eae6] rounded-[12px] p-5">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Comenzar la configuración del correo electrónico</h3>
                <p className="text-[13px] text-[#646462] mb-4">Agrega la dirección de correo electrónico que deseas usar con Intercom. Generalmente es el correo electrónico que utilizas para comunicarte con tus clientes. Después de agregar tu dirección de correo electrónico, te guiaremos a través del resto de la configuración. <a href="#" className="text-[#3b59f6] underline">Más información sobre dominios y direcciones de correo electrónico</a>.</p>
                <input placeholder="Dirección de correo electrónico" className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] w-[300px] focus:outline-none focus:border-[#3b59f6]" />
              </div>
            </>}
            {tab === 'ajustes' && (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Dirección de correo electrónico del espacio de trabajo</h3>
                  <p className="text-[13px] text-[#646462] mb-3">Esta es la dirección de trabajo que se utiliza desde el espacio de trabajo. Las respuestas a los correos automáticos enviados desde tus aplicaciones de mensajería se desviarán hacia ella, junto con las solicitudes de los clientes que no estén dirigidas a una dirección específica.</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value="b6gvpvyn-d8d7e93dd9ab@incoming.intercom-mail.com" className="flex-1 max-w-[500px] border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] bg-[#fafaf9] text-[#646462]" />
                    <button className="border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] hover:bg-[#f3f3f1]">📋</button>
                  </div>
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Respuestas</h2>
                  <div className="border border-[#e9eae6] rounded-[12px] divide-y divide-[#e9eae6]">
                    {[
                      { title: 'Detectar clientes en correos electrónicos', desc: 'Cuando un compañero de equipo escribe directamente al correo electrónico de un cliente, lo conectamos automáticamente con el perfil de ese cliente para que toda su comunicación quede registrada en un solo lugar.' },
                      { title: 'Conversaciones divididas entre contactos', desc: 'Cuando dos clientes están conectados a la misma conversación, el correo electrónico se redirige automáticamente al cliente activo para mantener la comunicación organizada.' },
                      { title: 'Direcciones generales', desc: 'Permite crear direcciones de correo electrónico genéricas para tu espacio de trabajo y enrutar las conversaciones recibidas en ellas como conversaciones nuevas.' },
                      { title: 'Notificaciones de contacto', desc: 'Las notificaciones permiten recibir actualizaciones sobre eventos relevantes en tu cuenta de Intercom.' },
                    ].map(item => (
                      <div key={item.title} className="px-5 py-4">
                        <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">{item.title}</p>
                        <p className="text-[12px] text-[#646462]">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Firmas y plantillas</h2>
                  <div className="border border-[#e9eae6] rounded-[12px] divide-y divide-[#e9eae6]">
                    {[
                      { title: 'Firmas de correo electrónico', desc: 'Crea y administra firmas de correo electrónico para los compañeros de equipo y para todo el espacio de trabajo.' },
                      { title: 'Plantillas de correo electrónico para notificaciones', desc: 'Personaliza las plantillas de correo electrónico que reciben los clientes y compañeros de equipo cuando se envían notificaciones.' },
                    ].map(item => (
                      <div key={item.title} className="px-5 py-4">
                        <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">{item.title}</p>
                        <p className="text-[12px] text-[#646462]">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Notificaciones</h2>
                  <div className="border border-[#e9eae6] rounded-[12px] divide-y divide-[#e9eae6]">
                    {[
                      { title: 'Notificaciones de seguridad de entrega', desc: 'Comunica con los compañeros de equipo cuando hay entregas de correos electrónicos rebotados o no entregados.' },
                      { title: 'Notificaciones por correo electrónico', desc: 'Cambia cuántos correos electrónicos se le envían a los clientes desde Intercom.' },
                    ].map(item => (
                      <div key={item.title} className="px-5 py-4">
                        <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">{item.title}</p>
                        <p className="text-[12px] text-[#646462]">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Medios, enlaces y documentos</h2>
                  <div className="border border-[#e9eae6] rounded-[12px] divide-y divide-[#e9eae6]">
                    {[
                      { title: 'Enviando archivos', desc: 'Los correos electrónicos enviados y recibidos por los compañeros de equipo a los clientes pueden contener archivos adjuntos.' },
                      { title: 'Marca del enlace', desc: 'Cambia el dominio de los enlaces y compártelos en correos electrónicos.' },
                      { title: 'Mostrar enlaces de correo electrónico', desc: 'Si está habilitado, los correos electrónicos enviados a los clientes serán visibles en los hilos de discusión.' },
                    ].map(item => (
                      <div key={item.title} className="px-5 py-4">
                        <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">{item.title}</p>
                        <p className="text-[12px] text-[#646462]">{item.desc}</p>
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
  );
}

// ── PhoneView (1-56416) ───────────────────────────────────────────────────────

function PhoneView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Teléfono</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
              Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            {/* Promo card with phone-video banner */}
            <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
              <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
              </button>
              <div className="flex-1 max-w-[440px]">
                <h2 className="text-[20px] font-bold text-[#1a1a1a] mb-2 leading-[26px]">Llamadas y conversaciones en un solo lugar</h2>
                <p className="text-[13px] text-[#646462] mb-4">Aprovecha llamadas telefónicas, videollamadas y pantalla compartida para solucionar los problemas de los clientes más rápido con asistencia telefónica nativa, creada en Intercom.</p>
                <div className="flex items-center gap-4">
                  <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📖 Cómo configurar</button>
                  <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">▦ Flujos de trabajo de IVR</button>
                  <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📅 Precios</button>
                </div>
              </div>
              <img src={IMG_PHONE_VIDEO} alt="Phone preview" className="w-[444px] h-[250px] flex-shrink-0 rounded-[8px] object-cover" data-node-id="1:56342" />
            </div>
            {/* Usage warning */}
            <div className="bg-[#fef3c7] border border-[#fde68a] rounded-[10px] px-5 py-3 mb-4 flex items-center gap-2">
              <span className="text-[#f59e0b]">⚠</span>
              <p className="text-[13px] text-[#1a1a1a]">Alcanzó el límite de uso de su teléfono. Comuníquese con asistencia para modificar su límite.</p>
            </div>
            {/* Accordion sections */}
            <div className="flex flex-col gap-3">
              {[
                { title: 'Llamadas telefónicas', desc: 'Llamadas telefónicas entrantes y salientes' },
                { title: 'Llamadas por Messenger', desc: 'Comparte voz, video y pantalla en Messenger' },
                { title: 'Grabación y transcripción', desc: 'Configurar grabaciones y transcripciones para todas las llamadas' },
              ].map(item => (
                <button key={item.title} className="w-full border border-[#e9eae6] rounded-[10px] px-5 py-4 flex items-center justify-between hover:bg-[#fafaf9]">
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-[#1a1a1a]">{item.title}</p>
                      <span className="bg-[#f3f3f1] text-[#646462] rounded-full px-2 py-0.5 text-[11px]">Off</span>
                    </div>
                    <p className="text-[12px] text-[#646462] mt-1">{item.desc}</p>
                  </div>
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M6 4l4 4-4 4"/></svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared Channel Promo Card ─────────────────────────────────────────────────

function ChannelPromoCard({ title, description, links, banner, dataNodeId }: {
  title: string; description: string; links: { label: string; icon?: string }[]; banner?: string; dataNodeId?: string;
}) {
  return (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
      <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg>
      </button>
      <div className="flex-1 max-w-[500px]">
        <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2 leading-[20px]">{title}</h2>
        <p className="text-[13px] text-[#646462] mb-4">{description}</p>
        <div className="flex items-center gap-4 flex-wrap">
          {links.map(l => (
            <button key={l.label} className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">
              {l.icon && <span>{l.icon}</span>}{l.label}
            </button>
          ))}
        </div>
      </div>
      {banner && <img src={banner} alt={title} className="w-[458px] h-[213px] flex-shrink-0 rounded-[8px] object-cover" data-node-id={dataNodeId} />}
    </div>
  );
}

// ── WhatsAppView (1-57872) ────────────────────────────────────────────────────

function WhatsAppView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [transition, setTransition] = useState(true);
  const [identify, setIdentify] = useState<'new' | 'existing'>('new');
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">WhatsApp</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg></button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            <ChannelPromoCard
              title="Incorpora WhatsApp a tu buzón para agilizar la asistencia"
              description="Gestiona las conversaciones de WhatsApp en tu buzón y despliega Fin AI Agent para ayudar a responder automáticamente a las preguntas más comunes. Solo se te cobrará con base en el uso."
              links={[{ icon: '📖', label: 'Conéctate a WhatsApp' }, { icon: '🤖', label: 'Implementa Fin AI Agent por chat' }]}
              banner={IMG_WHATSAPP_BANNER}
              dataNodeId="1:57727"
            />
            {/* Numbers */}
            <div className="border border-[#e9eae6] rounded-[12px] px-8 py-7 mb-4">
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Números de WhatsApp Business conectados</h3>
              <p className="text-[13px] text-[#646462] mb-4">Puedes conectarte a varios números de WhatsApp Business. La facturación se basa en el uso. <a href="#" className="text-[#3b59f6] underline">Más información sobre números de WhatsApp Business</a></p>
              <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Conectar a un número de WhatsApp Business</button>
            </div>
            {/* 2-col sections */}
            {[
              { title: 'Fin AI Agent', desc: 'Permite que Fin responda al instante las preguntas de los clientes en WhatsApp, reduce la carga de trabajo manual y mejora los tiempos de respuesta.', cta: 'Administrar Fin AI Agent' },
              { title: 'Perfil de empresa', desc: 'Agrega los detalles que tus clientes verán en tu perfil de WhatsApp Business, como foto de perfil, estado, correo electrónico, dirección y sitio web.', cta: 'Establece el perfil de tu empresa' },
            ].map(s => (
              <div key={s.title} className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6 mb-4">
                <div className="flex-1"><h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">{s.title}</h3><p className="text-[13px] text-[#646462]">{s.desc}</p></div>
                <button className="border border-[#e9eae6] rounded-[6px] px-4 py-2 text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1] flex-shrink-0">{s.cta}</button>
              </div>
            ))}
            {/* Templates */}
            <div className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6 mb-4">
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Plantillas de mensajes</h3>
                <p className="text-[13px] text-[#646462] mb-2">Las plantillas de mensajes son requeridas por WhatsApp para iniciar o continuar conversaciones 24 horas después de la última respuesta del usuario. <a href="#" className="text-[#3b59f6] underline">Más información</a></p>
                <div className="bg-[#fef3c7] border border-[#fde68a] rounded-[8px] px-3 py-2 mt-3 text-[12px] text-[#1a1a1a] flex items-start gap-2"><span>⚠</span>Las plantillas de marketing no son compatibles. Solo se pueden usar plantillas de utilidad y autenticación en Intercom. Las plantillas de marketing no aparecerán en tu lista de plantillas. <a href="#" className="text-[#3b59f6] underline">Más información sobre las categorías de plantillas.</a></div>
              </div>
              <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444] flex-shrink-0">Administrar plantillas de mensajes</button>
            </div>
            {/* Switch transition */}
            <div className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6 mb-4">
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Cambiar de Messenger a WhatsApp</h3>
                <p className="text-[13px] text-[#646462] mb-3">Cuando los leads o los usuarios inicien una conversación en Messenger, ofréceles continuarla en WhatsApp en su idioma preferido (solo disponible en la web). <a href="#" className="text-[#3b59f6] underline">Explicación sobre leads y usuarios</a>.</p>
              </div>
              <div className="w-[440px] flex-shrink-0">
                <div className="flex items-center gap-3 mb-3">
                  <button onClick={() => setTransition(v => !v)} className={`w-8 h-[18px] rounded-full relative ${transition ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}>
                    <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow ${transition ? 'right-0.5' : 'left-0.5'}`}/>
                  </button>
                  <span className="text-[13px] text-[#1a1a1a]">Ofrece la opción de cambiar a WhatsApp</span>
                </div>
                <img src={IMG_WHATSAPP_TRANS} alt="WhatsApp transition" className="w-full rounded-[8px] border border-[#e9eae6]" data-node-id="1:57822" />
              </div>
            </div>
            {/* New conversations */}
            <div className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6 mb-4">
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">nuevas conversaciones</h3>
                <p className="text-[13px] text-[#646462]">Una vez cerrada la conversación, los mensajes nuevos que se reciban después de este período de tiempo establecido se tratarán como una nueva conversación.</p>
              </div>
              <select className="w-[440px] border border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] bg-white flex-shrink-0"><option>30 días</option></select>
            </div>
            {/* Existing users */}
            <div className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6 mb-4">
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Usuarios existentes</h3>
                <p className="text-[13px] text-[#646462]">Cuando se inicia una conversación en WhatsApp, crea un nuevo cliente potencial o intenta hacer coincidir el número de teléfono con un usuario existente. Si no se encuentra ninguna coincidencia, se creará un nuevo cliente potencial.</p>
              </div>
              <div className="w-[440px] flex flex-col gap-3 flex-shrink-0">
                {[
                  { id: 'new' as const, label: 'Crear siempre un nuevo cliente potencial' },
                  { id: 'existing' as const, label: 'Identificar a los usuarios existentes por su número de teléfono' },
                ].map(o => (
                  <label key={o.id} onClick={() => setIdentify(o.id)} className="flex items-center gap-3 cursor-pointer">
                    <div className={`w-4 h-4 rounded-full border-2 ${identify === o.id ? 'border-[#3b59f6]' : 'border-[#ccc]'} flex items-center justify-center`}>
                      {identify === o.id && <div className="w-2 h-2 rounded-full bg-[#3b59f6]"/>}
                    </div>
                    <span className="text-[13px] text-[#1a1a1a]">{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DiscordView (1-61787) ─────────────────────────────────────────────────────

function DiscordView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Discord</h1>
            <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">Conectar servidor</button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            {/* Fin AI Agent banner */}
            <div className="border border-[#e9eae6] rounded-[10px] px-5 py-4 mb-6 flex items-center justify-between">
              <p className="text-[13px] text-[#1a1a1a] max-w-[700px]">Permita que Fin responda al instante las preguntas de los clientes en Discord, reduzca la carga de trabajo manual y mejore los tiempos de respuesta</p>
              <div className="flex items-center gap-3">
                <button className="border border-[#e9eae6] rounded-full px-4 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]">Administrar Fin AI Agent</button>
                <button className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
              </div>
            </div>
            {/* Promo card */}
            <div className="bg-white border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
              <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
              <div className="flex-1 max-w-[500px]">
                <h2 className="text-[20px] font-bold text-[#1a1a1a] mb-2 leading-[26px]">Conecta Discord para empezar a administrar los mensajes de los clientes en Intercom</h2>
                <p className="text-[13px] text-[#646462] mb-4">Configura un servidor de Discord para crear, responder y resolver conversaciones desde tu buzón de Intercom. También puedes habilitar Fin para que responda en Discord.</p>
                <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📖 Canal de Discord</button>
              </div>
              <img src={IMG_DISCORD_ILLO} alt="Discord settings illustration" className="w-[298px] h-[142px] flex-shrink-0 rounded-[8px] object-cover" data-node-id="1:61730" />
            </div>
            {/* Empty state */}
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <svg viewBox="0 0 24 24" className="w-10 h-10" fill="#5865F2"><path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 00-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 00-4.8 0c-.14-.33-.36-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05a18.46 18.46 0 005.59 2.83.07.07 0 00.08-.03c.43-.59.81-1.21 1.14-1.87.02-.04 0-.08-.04-.09-.61-.23-1.19-.51-1.75-.83-.04-.02-.04-.08-.01-.11.12-.09.23-.18.34-.27a.07.07 0 01.07-.01c3.66 1.67 7.61 1.67 11.23 0a.07.07 0 01.07.01c.11.09.23.18.34.27.04.03.04.09-.01.11-.56.33-1.14.6-1.75.83a.07.07 0 00-.04.09c.34.66.72 1.28 1.14 1.87.02.02.06.04.08.03 1.79-.55 3.65-1.39 5.59-2.83.02-.01.03-.03.03-.05.45-4.53-.75-8.46-3.18-11.95-.01-.01-.02-.02-.03-.02zM8.52 14.42c-1.06 0-1.93-.97-1.93-2.16 0-1.19.85-2.16 1.93-2.16 1.09 0 1.95.98 1.93 2.16 0 1.19-.85 2.16-1.93 2.16zm6.97 0c-1.06 0-1.93-.97-1.93-2.16 0-1.19.85-2.16 1.93-2.16 1.09 0 1.95.98 1.93 2.16 0 1.19-.84 2.16-1.93 2.16z"/></svg>
              <p className="text-[14px] font-semibold text-[#1a1a1a]">Aún no hay servidores conectados.</p>
              <p className="text-[13px] text-[#646462] text-center max-w-[500px]">Conecte su servidor de Discord para comenzar a sincronizar conversaciones con Intercom. Una vez conectado, verá sus servidores listados aquí.</p>
              <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444] mt-2">+ Conectar el servidor de Discord</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SmsView (1-63243) ─────────────────────────────────────────────────────────

function SmsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">SMS</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg></button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            <h2 className="text-[14px] font-semibold text-[#1a1a1a] mb-3">Gestión de respuestas SMS</h2>
            <div className="border border-[#e9eae6] rounded-[12px] mb-3 overflow-hidden">
              <div className="px-5 py-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-[8px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0">💬</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2"><p className="text-[14px] font-semibold text-[#1a1a1a]">SMS de dos vías</p><span className="bg-[#dcfce7] text-[#166534] rounded-full px-2 py-0.5 text-[11px] font-medium">Activado</span></div>
                  <p className="text-[12px] text-[#646462] mt-0.5">Apoya a tus clientes al instante con conversaciones por SMS</p>
                </div>
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462] mt-2"><path d="M4 10l4-4 4 4"/></svg>
              </div>
              <div className="px-5 pb-5 ml-14">
                <p className="text-[13px] text-[#646462] mb-3">Cuando recibas una respuesta de palabra clave no reconocida, inicia una conversación en Inbox por SMS.</p>
                <button className="border border-[#e9eae6] rounded-full px-4 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f3f3f1]">Activar esta función Desactivado</button>
              </div>
            </div>
            <div className="border border-[#e9eae6] rounded-[12px] mb-6 px-5 py-4 flex items-start gap-4 hover:bg-[#fafaf9]">
              <div className="w-10 h-10 rounded-[8px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0">💬</div>
              <div className="flex-1"><p className="text-[14px] font-semibold text-[#1a1a1a]">Respuestas automáticas a palabras clave</p><p className="text-[12px] text-[#646462] mt-0.5">Administra las respuestas automatizadas que se enviarán a tus clientes.</p></div>
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462] mt-2"><path d="M6 4l4 4-4 4"/></svg>
            </div>
            <h2 className="text-[14px] font-semibold text-[#1a1a1a] mb-3">Configuración avanzada de SMS</h2>
            <div className="flex flex-col gap-3">
              {[
                { icon: '📱', title: 'Países y números de teléfono', desc: 'Activar nuevos países, editar y previsualizar los números de teléfono activos' },
                { icon: '⏰', title: 'Horarios tranquilos por zona horaria', desc: 'Cuando se activan para mensajes individuales, las horas tranquilas retrasan el envío del mensaje SMS para garantizar que solo se reciban cuan...' },
                { icon: '🏢', title: 'Prefijo de identificación de la empresa', desc: 'Identifica tu empresa cuando envíes SMS salientes.' },
              ].map(s => (
                <button key={s.title} className="border border-[#e9eae6] rounded-[12px] px-5 py-4 flex items-start gap-4 hover:bg-[#fafaf9] text-left">
                  <div className="w-10 h-10 rounded-[8px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0">{s.icon}</div>
                  <div className="flex-1"><p className="text-[14px] font-semibold text-[#1a1a1a]">{s.title}</p><p className="text-[12px] text-[#646462] mt-0.5">{s.desc}</p></div>
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462] mt-2"><path d="M6 4l4 4-4 4"/></svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SocialChannelsView (1-64525 + 1-65820) ────────────────────────────────────

function SocialChannelsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'facebook' | 'instagram'>('facebook');
  const [respHistorias, setRespHistorias] = useState(true);
  const [mencionesHistorias, setMencionesHistorias] = useState(true);
  const [compartirTiempo, setCompartirTiempo] = useState(false);

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Canales de redes sociales</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg></button>
          </div>
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
            {(['facebook', 'instagram'] as const).map(id => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors capitalize ${
                  tab === id ? 'border-[#fa7938] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {id === 'facebook' ? 'Facebook' : 'Instagram'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            {tab === 'facebook' && <>
              <div className="bg-white border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
                <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
                <div className="flex-1 max-w-[500px]">
                  <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2">Conéctate con los clientes en Facebook</h2>
                  <p className="text-[13px] text-[#646462] mb-4">Administra todas tus conversaciones de Facebook Messenger en tu buzón de Intercom. Asigna mensajes automáticamente a tu equipo, realiza un seguimiento de todas las interacciones como clientes potenciales o usuarios y responde más rápido a los clientes, todo en un solo lugar.</p>
                  <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📖 Canal de Facebook</button>
                </div>
                <img src={IMG_FACEBOOK_BANNER} alt="Facebook preview" className="w-[458px] h-[213px] flex-shrink-0 rounded-[8px] object-cover" data-node-id="1:64496" />
              </div>
              <div className="border border-[#e9eae6] rounded-[12px] px-7 py-6">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Páginas de empresas de Facebook conectadas</h3>
                <p className="text-[13px] text-[#646462] mb-4">Te puedes conectar a varias páginas comerciales de Facebook. El uso de Facebook es gratuito en tu plan de precios.</p>
                <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Conectar página de empresa de Facebook</button>
              </div>
            </>}
            {tab === 'instagram' && <>
              <div className="bg-white border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
                <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
                <div className="flex-1 max-w-[500px]">
                  <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2">Conéctate con los clientes en Instagram</h2>
                  <p className="text-[13px] text-[#646462] mb-4">Administra fácilmente los mensajes directos (DM) y las respuestas a Historias en tu buzón de Intercom. Asigna conversaciones automáticamente, convierte todas las interacciones en clientes potenciales o usuarios y responde a cada cliente más rápido.</p>
                  <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📖 Canal de Instagram</button>
                </div>
                <img src={IMG_INSTAGRAM_BANNER} alt="Instagram preview" className="w-[458px] h-[213px] flex-shrink-0 rounded-[8px] object-cover" data-node-id="1:65752" />
              </div>
              <div className="border border-[#e9eae6] rounded-[12px] px-7 py-6 mb-4">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Cuentas comerciales de Instagram conectadas</h3>
                <p className="text-[13px] text-[#646462] mb-4">Puedes conectarte a varias cuentas comerciales de Instagram. El uso de Instagram es gratuito en tu plan de precios.</p>
                <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Conectar cuenta comercial de Instagram</button>
              </div>
              <div className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6 mb-4">
                <div className="flex-1">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Mensajes de Instagram en tu buzón</h3>
                  <p className="text-[13px] text-[#646462]">Elige qué mensajes de Instagram se entregarán directamente en tu buzón de Intercom.</p>
                </div>
                <div className="w-[280px] flex flex-col gap-3 flex-shrink-0">
                  {[
                    { state: respHistorias, set: setRespHistorias, label: 'Respuestas a tus historias' },
                    { state: mencionesHistorias, set: setMencionesHistorias, label: 'Menciones en historias de otros usuarios' },
                  ].map(t => (
                    <div key={t.label} className="flex items-center gap-2">
                      <button onClick={() => t.set(v => !v)} className={`w-8 h-[18px] rounded-full relative ${t.state ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}>
                        <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow ${t.state ? 'right-0.5' : 'left-0.5'}`}/>
                      </button>
                      <span className="text-[13px] text-[#1a1a1a]">{t.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6">
                <div className="flex-1">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Compartir el tiempo de respuesta</h3>
                  <p className="text-[13px] text-[#646462]">Comparte tu tiempo de respuesta habitual cuando los clientes te envían mensajes en Instagram. <a href="#" className="text-[#3b59f6] underline">Más información sobre el horario de atención y los tiempos de respuesta</a>.</p>
                </div>
                <div className="w-[280px] flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setCompartirTiempo(v => !v)} className={`w-8 h-[18px] rounded-full relative ${compartirTiempo ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}>
                    <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow ${compartirTiempo ? 'right-0.5' : 'left-0.5'}`}/>
                  </button>
                  <span className="text-[13px] text-[#1a1a1a]">Comparte tu tiempo de respuesta</span>
                </div>
              </div>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AllChannelsView (1-67348) ─────────────────────────────────────────────────

const ALL_CHANNELS_RECOMMENDED: { name: string; subtitle: string; desc: string; bg: string; emoji: string; nav: View | null }[] = [
  { name: 'Messenger',         subtitle: 'Incluido en tu plan', desc: 'Brinda ayuda proactiva, autoservicio y asistencia personal a través del chat en tu sitio web.', bg: '#3b59f6', emoji: '💬', nav: 'messenger' },
  { name: 'Correo electrónico',subtitle: 'Incluido en tu plan', desc: 'Responde a las consultas de los clientes e inicia conversaciones por correo electrónico.', bg: '#fa7938', emoji: '✉', nav: 'email' },
  { name: 'Teléfono',          subtitle: 'Facturado por uso',   desc: 'Inicia llamadas telefónicas, videollamadas y pantalla compartida para ayudar rápidamente a tus clientes.', bg: '#22c55e', emoji: '📞', nav: 'phone' },
];
const ALL_CHANNELS_OTHER: { name: string; subtitle: string; desc: string; bg: string; emoji: string; nav: View | null; badge?: string }[] = [
  { name: 'WhatsApp',  subtitle: 'Facturado por uso',   desc: 'Responde a los mensajes de WhatsApp e interactúa con los clientes directamente desde tu Inbox.', bg: '#25D366', emoji: '💚', nav: 'whatsapp' },
  { name: 'Instagram', subtitle: 'Incluido en tu plan', desc: 'Responde a los mensajes de Instagram e interactúa con los clientes directamente desde tu Inbox.', bg: '#E1306C', emoji: '📷', nav: 'social' },
  { name: 'Facebook',  subtitle: 'Incluido en tu plan', desc: 'Responde a los mensajes de Facebook e interactúa con los clientes directamente desde tu Inbox.', bg: '#1877F2', emoji: 'f', nav: 'social' },
  { name: 'Slack',     subtitle: 'Incluido en tu plan', desc: 'Responde a los mensajes de Slack e interactúa con los clientes directamente desde tu Inbox.', bg: '#4A154B', emoji: '#', nav: null },
  { name: 'SMS',       subtitle: 'Facturado por uso',   desc: 'Responde a las consultas de los clientes e inicia conversaciones con mensajes SMS.', bg: '#22c55e', emoji: '📱', nav: 'sms' },
  { name: 'Switch',    subtitle: 'Disponible con cambio a un plan de mayor categoría', desc: 'Permite que los clientes pasen de una cola telefónica a una experiencia de chat en Messenger.', bg: '#6366f1', emoji: '⇄', nav: null, badge: 'Obtener funcionalidad' },
];

function AllChannelsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Todos los canales</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg></button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            {/* Hub banner */}
            <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
              <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
              <div className="flex-1 max-w-[500px]">
                <h2 className="text-[20px] font-bold text-[#1a1a1a] mb-2">Todos los canales en un buzón</h2>
                <p className="text-[13px] text-[#646462] mb-4">Atiende a tus clientes donde están, desde chat en vivo y correo electrónico hasta teléfono y redes sociales. Todas las conversaciones se canalizan directamente a tu buzón, para que puedas priorizar los problemas y resolverlos más rápido.</p>
                <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📖 Canales</button>
              </div>
              <img src={IMG_CHANNELS_ALL} alt="Hub" className="w-[442px] h-[206px] flex-shrink-0 rounded-[8px] object-cover" data-node-id="1:67142" />
            </div>
            {/* Recomendado */}
            <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Recomendado</h3>
            <div className="grid grid-cols-2 gap-4 mb-6">
              {ALL_CHANNELS_RECOMMENDED.map(c => (
                <button key={c.name} onClick={() => c.nav && onNavigate(c.nav)} className="border border-[#e9eae6] rounded-[10px] p-6 flex flex-col text-left hover:border-[#c8c9c4] hover:shadow-sm">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[20px] flex-shrink-0" style={{background: c.bg}}>{c.emoji}</div>
                    <div><p className="text-[15px] font-semibold text-[#1a1a1a]">{c.name}</p><p className="text-[12px] text-[#646462]">{c.subtitle}</p></div>
                  </div>
                  <p className="text-[13px] text-[#646462]">{c.desc}</p>
                </button>
              ))}
            </div>
            {/* Otros canales */}
            <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-3">Otros canales</h3>
            <div className="grid grid-cols-2 gap-4">
              {ALL_CHANNELS_OTHER.map(c => (
                <button key={c.name} onClick={() => c.nav && onNavigate(c.nav)} className="border border-[#e9eae6] rounded-[10px] p-6 flex flex-col text-left hover:border-[#c8c9c4] hover:shadow-sm">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[20px] flex-shrink-0" style={{background: c.bg}}>{c.emoji}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2"><p className="text-[15px] font-semibold text-[#1a1a1a]">{c.name}</p>{c.badge && <span className="bg-[#7c3aed] text-white text-[11px] px-2 py-0.5 rounded-full font-medium">{c.badge}</span>}</div>
                      <p className="text-[12px] text-[#646462]">{c.subtitle}</p>
                    </div>
                  </div>
                  <p className="text-[13px] text-[#646462]">{c.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── InboxesView ───────────────────────────────────────────────────────────────
// Settings view — manage all configured inboxes (email, WhatsApp, chat, etc.)

const CHANNEL_ICONS: Record<string, string> = {
  email:      '✉️', whatsapp: '💬', phone: '📞', messenger: '📨',
  web_widget: '🌐', api: '⚙️', twitter: '🐦', instagram: '📸',
  line:       '💚', telegram: '✈️', discord: '🎮', sms: '📱',
};
const CHANNEL_LABELS: Record<string, string> = {
  email: 'Correo', whatsapp: 'WhatsApp', phone: 'Teléfono', messenger: 'Messenger',
  web_widget: 'Widget Web', api: 'API', twitter: 'Twitter/X', instagram: 'Instagram',
  line: 'LINE', telegram: 'Telegram', discord: 'Discord', sms: 'SMS',
};

type InboxItem = {
  id: string; name: string; channel_type: string;
  email?: string; enabled: boolean; conversations: number;
};

function InboxesView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [inboxes, setInboxes] = useState<InboxItem[]>([
    { id: '1', name: 'Soporte General',       channel_type: 'email',      email: 'soporte@acme.com',   enabled: true,  conversations: 148 },
    { id: '2', name: 'Chat en vivo',          channel_type: 'web_widget', enabled: true,  conversations: 67 },
    { id: '3', name: 'WhatsApp Ventas',        channel_type: 'whatsapp',   enabled: true,  conversations: 53 },
    { id: '4', name: 'Telegram',              channel_type: 'telegram',   enabled: false, conversations: 0 },
    { id: '5', name: 'API Externa',           channel_type: 'api',        enabled: true,  conversations: 22 },
  ]);
  const [newName, setNewName] = useState('');
  const [newChannel, setNewChannel] = useState('email');

  const filtered = inboxes.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    CHANNEL_LABELS[i.channel_type]?.toLowerCase().includes(search.toLowerCase()),
  );

  function toggleEnabled(id: string) {
    setInboxes(prev => prev.map(i => i.id === id ? { ...i, enabled: !i.enabled } : i));
  }

  function addInbox() {
    if (!newName.trim()) return;
    setInboxes(prev => [...prev, {
      id: String(Date.now()), name: newName.trim(), channel_type: newChannel,
      enabled: true, conversations: 0,
    }]);
    setNewName(''); setNewChannel('email'); setShowForm(false);
  }

  function deleteInbox(id: string) {
    setInboxes(prev => prev.filter(i => i.id !== id));
  }

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-4 pb-1 flex-shrink-0 text-[13px] text-[#646462]">
        <button onClick={() => onNavigate('settings')} className="hover:underline">Ajustes</button>
        <span>/</span><span className="text-[#1a1a1a] font-medium">Bandejas de entrada</span>
      </div>
      <div className="flex flex-1 min-h-0 gap-3 px-4 pb-4 pt-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <div>
              <h2 className="text-[18px] font-semibold text-[#1a1a1a]">Bandejas de entrada</h2>
              <p className="text-[13px] text-[#646462] mt-0.5">Gestiona todos los canales de comunicación</p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 bg-[#222] rounded-full pl-[12px] pr-[10px] py-[7px] text-[13px] font-medium text-white hover:bg-[#333]"
            >
              <span className="text-[16px] leading-none">+</span>
              <span>Nueva bandeja</span>
            </button>
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b border-[#e9eae6] flex-shrink-0">
            <div className="flex items-center gap-2 bg-[#f8f8f7] rounded-lg px-3 py-2 w-72">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="#888" strokeWidth="1.5"/><path d="M10.5 10.5L14 14" stroke="#888" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar bandeja..."
                className="flex-1 bg-transparent text-[13px] outline-none text-[#1a1a1a] placeholder-[#999]"
              />
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {/* Column headers */}
            <div className="flex items-center text-[12px] font-semibold text-[#646462] px-6 py-2 border-b border-[#e9eae6] bg-[#fafaf9]">
              <div className="w-8 flex-shrink-0" />
              <div className="flex-1">Nombre</div>
              <div className="w-36 flex-shrink-0">Canal</div>
              <div className="w-40 flex-shrink-0">Email / Identificador</div>
              <div className="w-24 flex-shrink-0 text-center">Convs.</div>
              <div className="w-20 flex-shrink-0 text-center">Estado</div>
              <div className="w-16 flex-shrink-0" />
            </div>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#999]">
                <span className="text-4xl mb-3">📥</span>
                <p className="text-[14px] font-medium">No hay bandejas</p>
                <p className="text-[12px] mt-1">Crea tu primera bandeja de entrada</p>
              </div>
            ) : filtered.map(inbox => (
              <div key={inbox.id} className="flex items-center px-6 py-3 border-b border-[#f0f0ee] hover:bg-[#fafafa] group">
                <div className="w-8 flex-shrink-0 text-[18px]">{CHANNEL_ICONS[inbox.channel_type] ?? '📥'}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-[14px] font-medium text-[#1a1a1a] truncate block">{inbox.name}</span>
                </div>
                <div className="w-36 flex-shrink-0">
                  <span className="text-[12px] text-[#646462] bg-[#f0f0ee] px-2 py-0.5 rounded-full">
                    {CHANNEL_LABELS[inbox.channel_type] ?? inbox.channel_type}
                  </span>
                </div>
                <div className="w-40 flex-shrink-0 text-[12px] text-[#646462] truncate">
                  {inbox.email ?? '—'}
                </div>
                <div className="w-24 flex-shrink-0 text-center text-[13px] text-[#1a1a1a]">
                  {inbox.conversations}
                </div>
                <div className="w-20 flex-shrink-0 flex justify-center">
                  <button
                    onClick={() => toggleEnabled(inbox.id)}
                    className={`w-9 h-5 rounded-full relative transition-colors ${inbox.enabled ? 'bg-[#25b15f]' : 'bg-[#ddd]'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${inbox.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </div>
                <div className="w-16 flex-shrink-0 flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => deleteInbox(inbox.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#fee2e2] text-[#ef4444] text-[12px]"
                    title="Eliminar"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-[16px] shadow-xl p-6 w-[420px]">
            <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-4">Nueva bandeja de entrada</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[12px] font-medium text-[#646462] mb-1">Nombre</label>
                <input
                  value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Ej. Soporte técnico"
                  className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#7c5cfc]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#646462] mb-1">Canal</label>
                <select
                  value={newChannel} onChange={e => setNewChannel(e.target.value)}
                  className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#7c5cfc] bg-white"
                >
                  {Object.entries(CHANNEL_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{CHANNEL_ICONS[key]} {label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-[13px] text-[#646462] hover:bg-[#f3f3f1] rounded-lg">Cancelar</button>
              <button onClick={addInbox} className="px-4 py-2 text-[13px] bg-[#222] text-white rounded-lg hover:bg-[#333]">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CannedResponsesView ───────────────────────────────────────────────────────
// Settings view — quick reply library (respuestas rápidas / canned responses)

type CannedItem = {
  id: string; short_code: string; content: string;
  category: string | null; usage_count: number;
};

function CannedResponsesView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [items, setItems] = useState<CannedItem[]>([
    { id: '1', short_code: 'hola',        content: '¡Hola! ¿En qué puedo ayudarte hoy?',                                  category: 'Saludo',    usage_count: 84 },
    { id: '2', short_code: 'gracias',     content: 'Muchas gracias por contactarnos. ¡Que tengas un excelente día!',       category: 'Cierre',    usage_count: 71 },
    { id: '3', short_code: 'espera',      content: 'Un momento, por favor. Estoy revisando tu caso.',                      category: 'Gestión',   usage_count: 55 },
    { id: '4', short_code: 'escalado',    content: 'He escalado tu solicitud a nuestro equipo especializado. Te contactarán pronto.', category: 'Escalado', usage_count: 33 },
    { id: '5', short_code: 'horario',     content: 'Nuestro horario de atención es de lunes a viernes de 9:00 a 18:00 (CET).', category: 'Info',   usage_count: 29 },
    { id: '6', short_code: 'pago-fallo',  content: 'Lamentamos los inconvenientes con tu pago. Por favor, intenta de nuevo o usa otro método.', category: 'Pagos', usage_count: 18 },
    { id: '7', short_code: 'reembolso',   content: 'Tu solicitud de reembolso ha sido recibida. El proceso tarda 5-7 días hábiles.',            category: 'Pagos', usage_count: 12 },
  ]);
  const [form, setForm] = useState({ short_code: '', content: '', category: '' });

  const filtered = items.filter(i =>
    i.short_code.includes(search.toLowerCase()) ||
    i.content.toLowerCase().includes(search.toLowerCase()) ||
    (i.category ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))) as string[];

  function openCreate() { setForm({ short_code: '', content: '', category: '' }); setEditId(null); setShowForm(true); }
  function openEdit(item: CannedItem) {
    setForm({ short_code: item.short_code, content: item.content, category: item.category ?? '' });
    setEditId(item.id); setShowForm(true);
  }

  function saveForm() {
    if (!form.short_code.trim() || !form.content.trim()) return;
    if (editId) {
      setItems(prev => prev.map(i => i.id === editId
        ? { ...i, short_code: form.short_code.trim(), content: form.content.trim(), category: form.category.trim() || null }
        : i));
    } else {
      setItems(prev => [...prev, {
        id: String(Date.now()), short_code: form.short_code.trim().toLowerCase(),
        content: form.content.trim(), category: form.category.trim() || null, usage_count: 0,
      }]);
    }
    setShowForm(false);
  }

  function deleteItem(id: string) { setItems(prev => prev.filter(i => i.id !== id)); }

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-4 pb-1 flex-shrink-0 text-[13px] text-[#646462]">
        <button onClick={() => onNavigate('settings')} className="hover:underline">Ajustes</button>
        <span>/</span><span className="text-[#1a1a1a] font-medium">Respuestas rápidas</span>
      </div>
      <div className="flex flex-1 min-h-0 gap-3 px-4 pb-4 pt-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <div>
              <h2 className="text-[18px] font-semibold text-[#1a1a1a]">Respuestas rápidas</h2>
              <p className="text-[13px] text-[#646462] mt-0.5">Usa <code className="bg-[#f0f0ee] px-1 rounded text-[12px]">/código</code> en la bandeja para insertar</p>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 bg-[#222] rounded-full pl-[12px] pr-[10px] py-[7px] text-[13px] font-medium text-white hover:bg-[#333]"
            >
              <span className="text-[16px] leading-none">+</span>
              <span>Nueva respuesta</span>
            </button>
          </div>

          {/* Search + filter row */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-[#e9eae6] flex-shrink-0">
            <div className="flex items-center gap-2 bg-[#f8f8f7] rounded-lg px-3 py-2 flex-1 max-w-xs">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="#888" strokeWidth="1.5"/><path d="M10.5 10.5L14 14" stroke="#888" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por código o contenido..."
                className="flex-1 bg-transparent text-[13px] outline-none text-[#1a1a1a] placeholder-[#999]"
              />
            </div>
            <span className="text-[12px] text-[#999]">{filtered.length} respuesta{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center text-[12px] font-semibold text-[#646462] px-6 py-2 border-b border-[#e9eae6] bg-[#fafaf9]">
              <div className="w-32 flex-shrink-0">Código</div>
              <div className="flex-1">Contenido</div>
              <div className="w-28 flex-shrink-0">Categoría</div>
              <div className="w-16 flex-shrink-0 text-center">Usos</div>
              <div className="w-20 flex-shrink-0" />
            </div>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#999]">
                <span className="text-4xl mb-3">💬</span>
                <p className="text-[14px] font-medium">Sin respuestas rápidas</p>
                <p className="text-[12px] mt-1">Crea plantillas para agilizar la atención</p>
              </div>
            ) : filtered.map(item => (
              <div key={item.id} className="flex items-center px-6 py-3 border-b border-[#f0f0ee] hover:bg-[#fafafa] group">
                <div className="w-32 flex-shrink-0">
                  <code className="bg-[#f0f0ee] text-[#7c5cfc] text-[12px] font-mono px-2 py-0.5 rounded">/{item.short_code}</code>
                </div>
                <div className="flex-1 min-w-0 pr-4">
                  <span className="text-[13px] text-[#1a1a1a] line-clamp-2 block">{item.content}</span>
                </div>
                <div className="w-28 flex-shrink-0">
                  {item.category ? (
                    <span className="text-[11px] text-[#646462] bg-[#f0f0ee] px-2 py-0.5 rounded-full">{item.category}</span>
                  ) : <span className="text-[12px] text-[#ccc]">—</span>}
                </div>
                <div className="w-16 flex-shrink-0 text-center text-[13px] text-[#646462]">{item.usage_count}</div>
                <div className="w-20 flex-shrink-0 flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(item)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f0f0ee] text-[#646462] text-[12px]"
                    title="Editar"
                  >✎</button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#fee2e2] text-[#ef4444] text-[12px]"
                    title="Eliminar"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-[16px] shadow-xl p-6 w-[500px]">
            <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-4">
              {editId ? 'Editar respuesta rápida' : 'Nueva respuesta rápida'}
            </h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[12px] font-medium text-[#646462] mb-1">Código corto (sin espacios)</label>
                <div className="flex items-center gap-1">
                  <span className="text-[#7c5cfc] font-medium">/</span>
                  <input
                    value={form.short_code} onChange={e => setForm(f => ({ ...f, short_code: e.target.value.replace(/\s/g, '') }))}
                    placeholder="ej. hola"
                    className="flex-1 border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#7c5cfc] font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#646462] mb-1">Contenido</label>
                <textarea
                  value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Escribe la respuesta predefinida..."
                  rows={4}
                  className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#7c5cfc] resize-none"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#646462] mb-1">Categoría (opcional)</label>
                <input
                  value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="Ej. Saludo, Pagos, Info..."
                  list="canned-categories"
                  className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#7c5cfc]"
                />
                <datalist id="canned-categories">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-[13px] text-[#646462] hover:bg-[#f3f3f1] rounded-lg">Cancelar</button>
              <button onClick={saveForm} className="px-4 py-2 text-[13px] bg-[#222] text-white rounded-lg hover:bg-[#333]">
                {editId ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AiGuardrailsView ──────────────────────────────────────────────────────────

const RULE_TYPE_LABELS: Record<string, string> = {
  blocked_topic: 'Tema bloqueado', required_disclaimer: 'Disclaimer requerido',
  tone_enforcement: 'Tono', pii_redaction: 'Redacción PII',
  language_restriction: 'Idioma', max_response_length: 'Longitud máxima', custom_regex: 'Regex custom',
};
const RULE_TYPE_COLORS: Record<string, string> = {
  blocked_topic: 'bg-red-100 text-red-700', required_disclaimer: 'bg-blue-100 text-blue-700',
  tone_enforcement: 'bg-purple-100 text-purple-700', pii_redaction: 'bg-orange-100 text-orange-700',
  language_restriction: 'bg-teal-100 text-teal-700', max_response_length: 'bg-gray-100 text-gray-700',
  custom_regex: 'bg-yellow-100 text-yellow-700',
};

type GuardrailItem = { id: string; name: string; rule_type: string; enabled: boolean; priority: number; description: string | null };

function AiGuardrailsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [items, setItems] = useState<GuardrailItem[]>([
    { id: '1', name: 'Sin temas de competencia', rule_type: 'blocked_topic', enabled: true,  priority: 10, description: 'Bloquea menciones a competidores directos' },
    { id: '2', name: 'Redacción de emails',      rule_type: 'pii_redaction',  enabled: true,  priority: 8,  description: 'Elimina emails del output del agente' },
    { id: '3', name: 'Tono profesional',         rule_type: 'tone_enforcement', enabled: true, priority: 5, description: 'Aplica tono formal en respuestas' },
    { id: '4', name: 'Máx. 500 caracteres',      rule_type: 'max_response_length', enabled: false, priority: 3, description: 'Limita respuestas a 500 caracteres' },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [evalText, setEvalText] = useState('');
  const [evalResult, setEvalResult] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('blocked_topic');

  function toggle(id: string) { setItems(prev => prev.map(i => i.id === id ? { ...i, enabled: !i.enabled } : i)); }
  function remove(id: string) { setItems(prev => prev.filter(i => i.id !== id)); }
  function addGuardrail() {
    if (!newName.trim()) return;
    setItems(prev => [...prev, { id: String(Date.now()), name: newName.trim(), rule_type: newType, enabled: true, priority: 0, description: null }]);
    setNewName(''); setShowForm(false);
  }

  function evaluate() {
    const violations = items.filter(g => {
      if (!g.enabled) return false;
      if (g.rule_type === 'max_response_length' && evalText.length > 200) return true;
      return false;
    });
    setEvalResult(violations.length === 0 ? '✅ Sin violaciones detectadas' : `⚠️ ${violations.length} violación(es): ${violations.map(v => v.name).join(', ')}`);
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <div>
              <h2 className="text-[18px] font-semibold text-[#1a1a1a]">Guardarraíles de IA</h2>
              <p className="text-[13px] text-[#646462] mt-0.5">Controla el comportamiento del agente IA</p>
            </div>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 bg-[#222] rounded-full pl-[12px] pr-[10px] py-[7px] text-[13px] font-medium text-white hover:bg-[#333]">
              <span className="text-[16px] leading-none">+</span><span>Nuevo</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
            {/* Evaluation tester */}
            <div className="bg-[#f8f7ff] rounded-[10px] border border-[#e0deff] p-4">
              <h3 className="text-[13px] font-semibold text-[#7c5cfc] mb-2">Probar texto</h3>
              <div className="flex gap-2">
                <textarea value={evalText} onChange={e => setEvalText(e.target.value)}
                  placeholder="Introduce texto para evaluar contra los guardarraíles activos..."
                  rows={2}
                  className="flex-1 border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none resize-none" />
                <button onClick={evaluate}
                  className="px-3 py-2 bg-[#7c5cfc] text-white rounded-lg text-[13px] font-medium hover:bg-[#6b4df0] self-end">Evaluar</button>
              </div>
              {evalResult && <p className="text-[12px] mt-2 text-[#1a1a1a]">{evalResult}</p>}
            </div>
            {/* List */}
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-4 p-4 border border-[#e9eae6] rounded-[10px] hover:bg-[#fafafa] group">
                <button
                  onClick={() => toggle(item.id)}
                  className={`w-9 h-5 rounded-full relative flex-shrink-0 transition-colors ${item.enabled ? 'bg-[#25b15f]' : 'bg-[#ddd]'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${item.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-[#1a1a1a]">{item.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${RULE_TYPE_COLORS[item.rule_type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {RULE_TYPE_LABELS[item.rule_type] ?? item.rule_type}
                    </span>
                  </div>
                  {item.description && <p className="text-[12px] text-[#999] mt-0.5">{item.description}</p>}
                </div>
                <span className="text-[11px] text-[#999] flex-shrink-0">P:{item.priority}</span>
                <button onClick={() => remove(item.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#fee2e2] text-[#ef4444] text-[12px] opacity-0 group-hover:opacity-100">✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-[16px] shadow-xl p-6 w-[400px]">
            <h3 className="text-[16px] font-semibold mb-4">Nuevo guardarraíl</h3>
            <div className="flex flex-col gap-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre"
                className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#7c5cfc]" />
              <select value={newType} onChange={e => setNewType(e.target.value)}
                className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] bg-white outline-none focus:border-[#7c5cfc]">
                {Object.entries(RULE_TYPE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-[13px] text-[#646462] hover:bg-[#f3f3f1] rounded-lg">Cancelar</button>
              <button onClick={addGuardrail} className="px-4 py-2 text-[13px] bg-[#222] text-white rounded-lg hover:bg-[#333]">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AgentToolsView ────────────────────────────────────────────────────────────

type AgentToolItem = { id: string; name: string; tool_type: string; endpoint_url: string | null; enabled: boolean };

const TOOL_TYPE_ICONS: Record<string, string> = {
  http_request: '🌐', sql_query: '🗃️', javascript: '⚡', mcp_call: '🔌', builtin: '⚙️',
};

function AgentToolsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tools, setTools] = useState<AgentToolItem[]>([
    { id: '1', name: 'Buscar pedidos',   tool_type: 'http_request', endpoint_url: 'https://api.example.com/orders/{{order_id}}', enabled: true },
    { id: '2', name: 'Crear reembolso',  tool_type: 'http_request', endpoint_url: 'https://api.example.com/refunds', enabled: true },
    { id: '3', name: 'Estado de envío',  tool_type: 'http_request', endpoint_url: 'https://shipping.example.com/track', enabled: false },
    { id: '4', name: 'Calcular precio',  tool_type: 'javascript',   endpoint_url: null, enabled: true },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('http_request');
  const [newUrl, setNewUrl] = useState('');
  const [testId, setTestId] = useState<string | null>(null);

  function toggle(id: string) { setTools(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t)); }
  function remove(id: string) { setTools(prev => prev.filter(t => t.id !== id)); }
  function addTool() {
    if (!newName.trim()) return;
    setTools(prev => [...prev, { id: String(Date.now()), name: newName.trim(), tool_type: newType, endpoint_url: newUrl.trim() || null, enabled: true }]);
    setNewName(''); setNewUrl(''); setShowForm(false);
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <div>
              <h2 className="text-[18px] font-semibold text-[#1a1a1a]">Herramientas del agente</h2>
              <p className="text-[13px] text-[#646462] mt-0.5">APIs y acciones que el agente IA puede invocar</p>
            </div>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 bg-[#222] rounded-full pl-[12px] pr-[10px] py-[7px] text-[13px] font-medium text-white hover:bg-[#333]">
              <span className="text-[16px] leading-none">+</span><span>Nueva herramienta</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center text-[12px] font-semibold text-[#646462] px-6 py-2 border-b border-[#e9eae6] bg-[#fafaf9]">
              <div className="w-8 flex-shrink-0" />
              <div className="flex-1">Nombre</div>
              <div className="w-28 flex-shrink-0">Tipo</div>
              <div className="flex-1">Endpoint</div>
              <div className="w-20 flex-shrink-0 text-center">Estado</div>
              <div className="w-24 flex-shrink-0" />
            </div>
            {tools.map(tool => (
              <div key={tool.id} className="flex items-center px-6 py-3 border-b border-[#f0f0ee] hover:bg-[#fafafa] group">
                <div className="w-8 flex-shrink-0 text-[18px]">{TOOL_TYPE_ICONS[tool.tool_type] ?? '⚙️'}</div>
                <div className="flex-1 min-w-0">
                  <span className="text-[14px] font-medium text-[#1a1a1a]">{tool.name}</span>
                </div>
                <div className="w-28 flex-shrink-0">
                  <span className="text-[11px] bg-[#f0f0ee] text-[#646462] px-2 py-0.5 rounded-full">{tool.tool_type}</span>
                </div>
                <div className="flex-1 min-w-0 px-2">
                  <code className="text-[11px] text-[#999] truncate block">{tool.endpoint_url ?? '—'}</code>
                </div>
                <div className="w-20 flex-shrink-0 flex justify-center">
                  <button onClick={() => toggle(tool.id)}
                    className={`w-9 h-5 rounded-full relative transition-colors ${tool.enabled ? 'bg-[#25b15f]' : 'bg-[#ddd]'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${tool.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </div>
                <div className="w-24 flex-shrink-0 flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                  <button onClick={() => setTestId(testId === tool.id ? null : tool.id)}
                    className="text-[11px] px-2 py-1 bg-[#f0f0ee] hover:bg-[#e0deff] text-[#7c5cfc] rounded-md font-medium">Test</button>
                  <button onClick={() => remove(tool.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#fee2e2] text-[#ef4444] text-[12px]">✕</button>
                </div>
              </div>
            ))}
          </div>
          {testId && (
            <div className="px-6 py-4 border-t border-[#e9eae6] bg-[#f8f8f7] flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-medium text-[#1a1a1a]">Probar: {tools.find(t => t.id === testId)?.name}</span>
                <button onClick={() => setTestId(null)} className="text-[12px] text-[#999] hover:text-[#1a1a1a]">✕</button>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg p-3 text-[12px] font-mono text-[#25b15f]">
                {`> POST ${tools.find(t => t.id === testId)?.endpoint_url ?? '—'}\n> { "test": true }\n\n200 OK — { "status": "ok", "result": "mock_response" }`}
              </div>
            </div>
          )}
        </div>
      </div>
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-[16px] shadow-xl p-6 w-[420px]">
            <h3 className="text-[16px] font-semibold mb-4">Nueva herramienta</h3>
            <div className="flex flex-col gap-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre"
                className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#7c5cfc]" />
              <select value={newType} onChange={e => setNewType(e.target.value)}
                className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] bg-white outline-none">
                {Object.entries(TOOL_TYPE_ICONS).map(([k]) => <option key={k} value={k}>{TOOL_TYPE_ICONS[k]} {k}</option>)}
              </select>
              {newType === 'http_request' && (
                <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://..."
                  className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] font-mono outline-none focus:border-[#7c5cfc]" />
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-[13px] text-[#646462] hover:bg-[#f3f3f1] rounded-lg">Cancelar</button>
              <button onClick={addTool} className="px-4 py-2 text-[13px] bg-[#222] text-white rounded-lg hover:bg-[#333]">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AgentScenariosView ────────────────────────────────────────────────────────

type ScenarioItem = { id: string; name: string; trigger_type: string; enabled: boolean; run_count: number; description: string | null };

const TRIGGER_LABELS: Record<string, string> = {
  intent_match: '🎯 Intención', keyword_match: '🔑 Palabras clave',
  routing_rule: '📋 Regla', time_based: '⏰ Tiempo', manual: '👆 Manual',
};

function AgentScenariosView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([
    { id: '1', name: 'Bienvenida a nuevos contactos', trigger_type: 'intent_match',   enabled: true,  run_count: 234, description: 'Se activa cuando se detecta intención "new_user"' },
    { id: '2', name: 'Escalado automático',           trigger_type: 'keyword_match',  enabled: true,  run_count: 78,  description: 'Detecta "urgente" o "manager"' },
    { id: '3', name: 'Seguimiento tras resolución',   trigger_type: 'time_based',     enabled: false, run_count: 12,  description: 'Envía CSAT 24h después de resolver' },
    { id: '4', name: 'Oferta de descuento',           trigger_type: 'intent_match',   enabled: true,  run_count: 45,  description: 'Propone descuento a usuarios con intención de cancelar' },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTrigger, setNewTrigger] = useState('intent_match');

  function toggle(id: string) { setScenarios(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)); }
  function remove(id: string) { setScenarios(prev => prev.filter(s => s.id !== id)); }
  function addScenario() {
    if (!newName.trim()) return;
    setScenarios(prev => [...prev, { id: String(Date.now()), name: newName.trim(), trigger_type: newTrigger, enabled: true, run_count: 0, description: null }]);
    setNewName(''); setShowForm(false);
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <div>
              <h2 className="text-[18px] font-semibold text-[#1a1a1a]">Escenarios del agente</h2>
              <p className="text-[13px] text-[#646462] mt-0.5">Flujos automáticos con triggers definidos</p>
            </div>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 bg-[#222] rounded-full pl-[12px] pr-[10px] py-[7px] text-[13px] font-medium text-white hover:bg-[#333]">
              <span className="text-[16px] leading-none">+</span><span>Nuevo escenario</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-3">
            {scenarios.map(s => (
              <div key={s.id} className="flex items-start gap-4 p-4 border border-[#e9eae6] rounded-[10px] hover:bg-[#fafafa] group">
                <button onClick={() => toggle(s.id)}
                  className={`w-9 h-5 rounded-full relative flex-shrink-0 mt-0.5 transition-colors ${s.enabled ? 'bg-[#25b15f]' : 'bg-[#ddd]'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${s.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium text-[#1a1a1a]">{s.name}</span>
                    <span className="text-[11px] bg-[#f0f0ee] text-[#646462] px-2 py-0.5 rounded-full">{TRIGGER_LABELS[s.trigger_type] ?? s.trigger_type}</span>
                    <span className="text-[11px] text-[#999]">Ejecuciones: {s.run_count}</span>
                  </div>
                  {s.description && <p className="text-[12px] text-[#999] mt-0.5">{s.description}</p>}
                </div>
                <button onClick={() => remove(s.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#fee2e2] text-[#ef4444] text-[12px] opacity-0 group-hover:opacity-100 flex-shrink-0">✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-[16px] shadow-xl p-6 w-[400px]">
            <h3 className="text-[16px] font-semibold mb-4">Nuevo escenario</h3>
            <div className="flex flex-col gap-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre del escenario"
                className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#7c5cfc]" />
              <select value={newTrigger} onChange={e => setNewTrigger(e.target.value)}
                className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] bg-white outline-none">
                {Object.entries(TRIGGER_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-[13px] text-[#646462] hover:bg-[#f3f3f1] rounded-lg">Cancelar</button>
              <button onClick={addScenario} className="px-4 py-2 text-[13px] bg-[#222] text-white rounded-lg hover:bg-[#333]">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── McpServersView ────────────────────────────────────────────────────────────

type McpServerItem = { id: string; name: string; transport: string; endpoint_url: string | null; enabled: boolean; last_ping_at: string | null; tools_schema: unknown[] };

const TRANSPORT_ICONS: Record<string, string> = { stdio: '💻', http: '🌐', sse: '📡' };

function McpServersView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [servers, setServers] = useState<McpServerItem[]>([
    { id: '1', name: 'Stripe MCP',   transport: 'http',  endpoint_url: 'https://mcp.stripe.com/v1',    enabled: true,  last_ping_at: new Date(Date.now() - 60000).toISOString(),  tools_schema: [{ name: 'create_payment' }, { name: 'refund_charge' }] },
    { id: '2', name: 'Linear MCP',   transport: 'http',  endpoint_url: 'https://mcp.linear.app/v1',    enabled: true,  last_ping_at: new Date(Date.now() - 300000).toISOString(), tools_schema: [{ name: 'create_issue' }, { name: 'list_issues' }] },
    { id: '3', name: 'Local Tools',  transport: 'stdio', endpoint_url: null,                            enabled: false, last_ping_at: null, tools_schema: [] },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTransport, setNewTransport] = useState('http');
  const [newUrl, setNewUrl] = useState('');

  function toggle(id: string) { setServers(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)); }
  function remove(id: string) { setServers(prev => prev.filter(s => s.id !== id)); }
  function addServer() {
    if (!newName.trim()) return;
    setServers(prev => [...prev, { id: String(Date.now()), name: newName.trim(), transport: newTransport, endpoint_url: newUrl.trim() || null, enabled: true, last_ping_at: null, tools_schema: [] }]);
    setNewName(''); setNewUrl(''); setShowForm(false);
  }

  function relativeTime(iso: string | null) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'hace <1 min';
    if (diff < 3600000) return `hace ${Math.round(diff/60000)} min`;
    return `hace ${Math.round(diff/3600000)}h`;
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <div>
              <h2 className="text-[18px] font-semibold text-[#1a1a1a]">Servidores MCP</h2>
              <p className="text-[13px] text-[#646462] mt-0.5">Model Context Protocol — herramientas externas para el agente</p>
            </div>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 bg-[#222] rounded-full pl-[12px] pr-[10px] py-[7px] text-[13px] font-medium text-white hover:bg-[#333]">
              <span className="text-[16px] leading-none">+</span><span>Conectar servidor</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-3">
            {servers.map(srv => (
              <div key={srv.id} className="border border-[#e9eae6] rounded-[10px] overflow-hidden group">
                <div className="flex items-center gap-4 px-5 py-3 hover:bg-[#fafafa]">
                  <span className="text-[20px]">{TRANSPORT_ICONS[srv.transport] ?? '🔌'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-[#1a1a1a]">{srv.name}</span>
                      <span className="text-[11px] bg-[#f0f0ee] text-[#646462] px-2 py-0.5 rounded-full">{srv.transport}</span>
                      {srv.enabled && <span className="text-[11px] bg-[#ecfdf5] text-[#059669] px-2 py-0.5 rounded-full">●&nbsp;Activo</span>}
                    </div>
                    <code className="text-[11px] text-[#999]">{srv.endpoint_url ?? 'stdio'}</code>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[11px] text-[#999]">Último ping: {relativeTime(srv.last_ping_at)}</p>
                    <p className="text-[11px] text-[#7c5cfc]">{srv.tools_schema.length} herramienta{srv.tools_schema.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button onClick={() => toggle(srv.id)}
                    className={`w-9 h-5 rounded-full relative flex-shrink-0 transition-colors ${srv.enabled ? 'bg-[#25b15f]' : 'bg-[#ddd]'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${srv.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                  <button onClick={() => remove(srv.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#fee2e2] text-[#ef4444] text-[12px] opacity-0 group-hover:opacity-100">✕</button>
                </div>
                {srv.tools_schema.length > 0 && (
                  <div className="border-t border-[#f0f0ee] px-5 py-2 bg-[#fafaf9] flex flex-wrap gap-1">
                    {(srv.tools_schema as Array<{ name: string }>).map(t => (
                      <span key={t.name} className="text-[11px] bg-[#f0f0ee] text-[#646462] px-2 py-0.5 rounded-full font-mono">{t.name}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-[16px] shadow-xl p-6 w-[420px]">
            <h3 className="text-[16px] font-semibold mb-4">Conectar servidor MCP</h3>
            <div className="flex flex-col gap-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre del servidor"
                className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#7c5cfc]" />
              <select value={newTransport} onChange={e => setNewTransport(e.target.value)}
                className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] bg-white outline-none">
                <option value="http">🌐 HTTP</option>
                <option value="sse">📡 SSE</option>
                <option value="stdio">💻 Stdio (local)</option>
              </select>
              {newTransport !== 'stdio' && (
                <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://..."
                  className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] font-mono outline-none focus:border-[#7c5cfc]" />
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-[13px] text-[#646462] hover:bg-[#f3f3f1] rounded-lg">Cancelar</button>
              <button onClick={addServer} className="px-4 py-2 text-[13px] bg-[#222] text-white rounded-lg hover:bg-[#333]">Conectar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ReportsView ───────────────────────────────────────────────────────────────
// Main reporting dashboard: overview metrics + CSAT summary + sparkline bars

function ReportsView({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'overview' | 'csat'>('overview');

  // Mock rollup data for the last 14 days
  const dailyData = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i));
    return {
      date: d.toLocaleDateString('es', { month: 'short', day: 'numeric' }),
      opened:   Math.floor(Math.random() * 40 + 10),
      resolved: Math.floor(Math.random() * 35 + 8),
      msgs:     Math.floor(Math.random() * 120 + 30),
    };
  });

  const totalOpened   = dailyData.reduce((s, d) => s + d.opened, 0);
  const totalResolved = dailyData.reduce((s, d) => s + d.resolved, 0);
  const totalMsgs     = dailyData.reduce((s, d) => s + d.msgs, 0);
  const resolutionRate = totalOpened > 0 ? Math.round(totalResolved / totalOpened * 100) : 0;

  // Mock CSAT data
  const csatData = [
    { label: '⭐⭐⭐⭐⭐', count: 84, pct: 52 },
    { label: '⭐⭐⭐⭐', count: 41, pct: 26 },
    { label: '⭐⭐⭐', count: 20, pct: 12 },
    { label: '⭐⭐', count: 10, pct: 6 },
    { label: '⭐', count: 6, pct: 4 },
  ];
  const avgCsat = (84*5 + 41*4 + 20*3 + 10*2 + 6*1) / 161;

  const maxOpened = Math.max(...dailyData.map(d => d.opened));

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden bg-[#f3f3f1]">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[24px] font-bold text-[#1a1a1a] tracking-[-0.4px]">Informes</h1>
            <p className="text-[13px] text-[#646462] mt-0.5">Últimos 14 días</p>
          </div>
          <button
            onClick={() => onNavigate('inbox')}
            className="flex items-center gap-1.5 bg-white border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] text-[#646462] hover:bg-[#f3f3f1]"
          >
            ← Volver
          </button>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#e9eae6]">
          {(['overview', 'csat'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
                tab === t ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
              }`}
            >
              {t === 'overview' ? 'Visión general' : 'CSAT'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {tab === 'overview' && (
          <div className="flex flex-col gap-4">
            {/* KPI cards */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Conversaciones abiertas', value: totalOpened,   color: '#7c5cfc' },
                { label: 'Conversaciones resueltas', value: totalResolved, color: '#25b15f' },
                { label: 'Mensajes intercambiados',  value: totalMsgs,    color: '#3b82f6' },
                { label: 'Tasa de resolución',        value: `${resolutionRate}%`, color: '#f59e0b' },
              ].map(kpi => (
                <div key={kpi.label} className="bg-white rounded-[12px] border border-[#e9eae6] px-5 py-4">
                  <p className="text-[12px] text-[#646462] mb-1">{kpi.label}</p>
                  <p className="text-[28px] font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
                </div>
              ))}
            </div>

            {/* Bar chart: conversations opened */}
            <div className="bg-white rounded-[12px] border border-[#e9eae6] px-5 py-4">
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-4">Conversaciones abiertas por día</h3>
              <div className="flex items-end gap-1 h-[120px]">
                {dailyData.map(d => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-[3px] bg-[#7c5cfc]/80 hover:bg-[#7c5cfc] transition-colors cursor-pointer"
                      style={{ height: `${(d.opened / maxOpened) * 100}px` }}
                      title={`${d.date}: ${d.opened}`}
                    />
                    <span className="text-[9px] text-[#999] whitespace-nowrap">{d.date}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Resolution chart */}
            <div className="bg-white rounded-[12px] border border-[#e9eae6] px-5 py-4">
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-4">Conversaciones resueltas por día</h3>
              <div className="flex items-end gap-1 h-[80px]">
                {dailyData.map(d => {
                  const maxR = Math.max(...dailyData.map(x => x.resolved));
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-[3px] bg-[#25b15f]/70 hover:bg-[#25b15f] transition-colors cursor-pointer"
                        style={{ height: `${(d.resolved / maxR) * 64}px` }}
                        title={`${d.date}: ${d.resolved}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'csat' && (
          <div className="flex flex-col gap-4">
            {/* CSAT score card */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-[12px] border border-[#e9eae6] px-5 py-4 flex flex-col items-center justify-center">
                <p className="text-[12px] text-[#646462] mb-1">Puntuación media</p>
                <p className="text-[36px] font-bold text-[#f59e0b]">{avgCsat.toFixed(1)}</p>
                <p className="text-[12px] text-[#999]">de 5.0</p>
              </div>
              <div className="bg-white rounded-[12px] border border-[#e9eae6] px-5 py-4 flex flex-col items-center justify-center">
                <p className="text-[12px] text-[#646462] mb-1">Respuestas totales</p>
                <p className="text-[36px] font-bold text-[#3b82f6]">161</p>
              </div>
              <div className="bg-white rounded-[12px] border border-[#e9eae6] px-5 py-4 flex flex-col items-center justify-center">
                <p className="text-[12px] text-[#646462] mb-1">Satisfacción positiva</p>
                <p className="text-[36px] font-bold text-[#25b15f]">78%</p>
                <p className="text-[12px] text-[#999]">4+ estrellas</p>
              </div>
            </div>

            {/* Rating breakdown */}
            <div className="bg-white rounded-[12px] border border-[#e9eae6] px-5 py-4">
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-4">Distribución de puntuaciones</h3>
              <div className="flex flex-col gap-3">
                {csatData.map(({ label, count, pct }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-[13px] w-32 flex-shrink-0">{label}</span>
                    <div className="flex-1 bg-[#f0f0ee] rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-[#f59e0b]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[12px] text-[#646462] w-16 text-right flex-shrink-0">{count} ({pct}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent comments */}
            <div className="bg-white rounded-[12px] border border-[#e9eae6] px-5 py-4">
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-3">Comentarios recientes</h3>
              <div className="flex flex-col gap-3">
                {[
                  { stars: 5, msg: 'Excelente atención, resolvieron mi problema en minutos.', agent: 'Ana García', date: 'hace 1h' },
                  { stars: 4, msg: 'Muy buena atención aunque tardaron un poco.', agent: 'Carlos López', date: 'hace 3h' },
                  { stars: 2, msg: 'Tardaron demasiado en responder.', agent: 'María Ruiz', date: 'hace 5h' },
                  { stars: 5, msg: '¡Increíble servicio! Totalmente satisfecho.', agent: 'Ana García', date: 'hace 8h' },
                ].map(({ stars, msg, agent, date }, i) => (
                  <div key={i} className="flex gap-3 p-3 bg-[#fafaf9] rounded-lg">
                    <span className="text-[13px] flex-shrink-0">{'⭐'.repeat(stars)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#1a1a1a]">{msg}</p>
                      <p className="text-[11px] text-[#999] mt-0.5">Agente: {agent} · {date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL TEMPLATES VIEW
// ─────────────────────────────────────────────────────────────────────────────

type EmailTemplate = {
  id: string; name: string; subject: string; body: string;
  category: string; variables: string[]; updatedAt: string;
};
const MOCK_EMAIL_TEMPLATES: EmailTemplate[] = [
  { id: '1', name: 'Bienvenida', subject: 'Bienvenido/a a {{company_name}}', body: 'Hola {{contact_name}},\n\nGracias por unirte a nosotros. Estamos encantados de tenerte.', category: 'Onboarding', variables: ['company_name','contact_name'], updatedAt: 'hace 2 días' },
  { id: '2', name: 'Seguimiento post-venta', subject: 'Tu pedido {{order_id}} ha sido enviado', body: 'Hola {{contact_name}},\n\nTu pedido está en camino. Número de seguimiento: {{tracking_number}}.', category: 'Ventas', variables: ['contact_name','order_id','tracking_number'], updatedAt: 'hace 5 días' },
  { id: '3', name: 'Encuesta CSAT', subject: '¿Cómo valorarías nuestra atención?', body: 'Hola {{contact_name}},\n\nTu opinión es muy importante para nosotros. Por favor, valora tu experiencia.', category: 'CSAT', variables: ['contact_name'], updatedAt: 'hace 1 semana' },
  { id: '4', name: 'Recordatorio de renovación', subject: 'Tu suscripción vence el {{expiry_date}}', body: 'Hola {{contact_name}},\n\nTu plan {{plan_name}} vence pronto. Renueva para no perder el servicio.', category: 'Facturación', variables: ['contact_name','expiry_date','plan_name'], updatedAt: 'hace 2 semanas' },
];

function EmailTemplatesView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [templates, setTemplates] = useState<EmailTemplate[]>(MOCK_EMAIL_TEMPLATES);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [preview, setPreview] = useState<EmailTemplate | null>(null);

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.subject.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() { setEditing(null); setShowModal(true); }
  function openEdit(t: EmailTemplate) { setEditing(t); setShowModal(true); setPreview(null); }
  function handleDelete(id: string) { setTemplates(ts => ts.filter(t => t.id !== id)); }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name     = fd.get('name')     as string;
    const subject  = fd.get('subject')  as string;
    const body     = fd.get('body')     as string;
    const category = fd.get('category') as string;
    const vars     = body.match(/\{\{(\w+)\}\}/g)?.map(v => v.replace(/\{\{|\}\}/g, '')) ?? [];
    if (editing) {
      setTemplates(ts => ts.map(t => t.id === editing.id ? { ...t, name, subject, body, category, variables: vars, updatedAt: 'ahora' } : t));
    } else {
      setTemplates(ts => [...ts, { id: Date.now().toString(), name, subject, body, category, variables: vars, updatedAt: 'ahora' }]);
    }
    setShowModal(false);
  }

  const CAT_COLORS: Record<string, string> = {
    'Onboarding': 'bg-[#dbeafe] text-[#1e40af]',
    'Ventas':     'bg-[#dcfce7] text-[#166534]',
    'CSAT':       'bg-[#fef9c3] text-[#854d0e]',
    'Facturación':'bg-[#fce7f3] text-[#9d174d]',
  };

  return (
    <div className="flex flex-1 min-w-0 h-full gap-3 p-3 overflow-hidden">
      <SettingsSidebar view={view} onNavigate={onNavigate} />
      <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Plantillas de email</h2>
            <p className="text-[13px] text-[#646462] mt-0.5">Gestiona plantillas reutilizables con variables dinámicas.</p>
          </div>
          <button onClick={openCreate} className="px-4 py-2 bg-[#222] text-white text-[13px] font-semibold rounded-full hover:bg-[#444] flex items-center gap-2">
            <span>+ Nueva plantilla</span>
          </button>
        </div>
        {/* Search */}
        <div className="px-6 py-3 border-b border-[#e9eae6] flex-shrink-0">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar plantillas..."
            className="w-full max-w-sm border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#6366f1]"
          />
        </div>
        {/* Body: split between list + preview */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Table */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-[#f8f8f7] z-10">
                <tr className="border-b border-[#e9eae6]">
                  <th className="text-left px-6 py-3 font-semibold text-[#646462]">Nombre</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#646462]">Asunto</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#646462]">Categoría</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#646462]">Variables</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#646462]">Actualizado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr
                    key={t.id}
                    onClick={() => setPreview(preview?.id === t.id ? null : t)}
                    className={`border-b border-[#f0f0ee] cursor-pointer transition-colors ${preview?.id === t.id ? 'bg-[#f0f0ff]' : 'hover:bg-[#fafaf9]'}`}
                  >
                    <td className="px-6 py-3 font-medium text-[#1a1a1a]">{t.name}</td>
                    <td className="px-4 py-3 text-[#646462] max-w-[200px] truncate font-mono text-[12px]">{t.subject}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[t.category] ?? 'bg-[#f0f0ee] text-[#444]'}`}>{t.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {t.variables.slice(0, 3).map(v => (
                          <span key={v} className="text-[11px] bg-[#ede9fe] text-[#5b21b6] px-1.5 py-0.5 rounded font-mono">{`{{${v}}}`}</span>
                        ))}
                        {t.variables.length > 3 && <span className="text-[11px] text-[#999]">+{t.variables.length - 3}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#999]">{t.updatedAt}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(t)} className="px-2 py-1 text-[12px] bg-[#f0f0ee] rounded hover:bg-[#e0e0de]">Editar</button>
                        <button onClick={() => handleDelete(t.id)} className="px-2 py-1 text-[12px] bg-[#fee2e2] text-[#b91c1c] rounded hover:bg-[#fecaca]">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-[#999] text-[13px]">No se encontraron plantillas</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Preview panel */}
          {preview && (
            <div className="w-[340px] flex-shrink-0 border-l border-[#e9eae6] overflow-y-auto bg-[#fafaf9]">
              <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
                <span className="text-[14px] font-semibold text-[#1a1a1a]">Vista previa</span>
                <button onClick={() => setPreview(null)} className="text-[#999] hover:text-[#444] text-[18px] leading-none">×</button>
              </div>
              <div className="px-5 py-4 flex flex-col gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-[#999] uppercase tracking-wide mb-1">Asunto</p>
                  <p className="text-[13px] text-[#1a1a1a] font-mono bg-white border border-[#e9eae6] rounded px-3 py-2">{preview.subject}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#999] uppercase tracking-wide mb-1">Cuerpo</p>
                  <pre className="text-[12px] text-[#1a1a1a] font-mono bg-white border border-[#e9eae6] rounded px-3 py-2 whitespace-pre-wrap leading-relaxed">{preview.body}</pre>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#999] uppercase tracking-wide mb-1">Variables detectadas</p>
                  <div className="flex flex-wrap gap-1">
                    {preview.variables.map(v => (
                      <span key={v} className="text-[11px] bg-[#ede9fe] text-[#5b21b6] px-2 py-0.5 rounded font-mono">{`{{${v}}}`}</span>
                    ))}
                  </div>
                </div>
                <button onClick={() => openEdit(preview)} className="w-full py-2 bg-[#222] text-white text-[13px] font-semibold rounded-full hover:bg-[#444] mt-2">
                  Editar plantilla
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6]">
              <h3 className="text-[16px] font-semibold text-[#1a1a1a]">{editing ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
              <button onClick={() => setShowModal(false)} className="text-[#999] hover:text-[#444] text-[20px] leading-none">×</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-4 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[12px] font-semibold text-[#646462]">Nombre</label>
                  <input name="name" defaultValue={editing?.name ?? ''} required className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#6366f1]" placeholder="Ej. Bienvenida" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[12px] font-semibold text-[#646462]">Categoría</label>
                  <input name="category" defaultValue={editing?.category ?? ''} list="cat-list" className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#6366f1]" placeholder="Onboarding" />
                  <datalist id="cat-list">{['Onboarding','Ventas','CSAT','Facturación','Soporte'].map(c => <option key={c} value={c} />)}</datalist>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-semibold text-[#646462]">Asunto</label>
                <input name="subject" defaultValue={editing?.subject ?? ''} required className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] font-mono outline-none focus:border-[#6366f1]" placeholder="Ej. Bienvenido a {{company_name}}" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-semibold text-[#646462]">Cuerpo <span className="text-[#999] font-normal">(usa {'{{variable}}'} para variables dinámicas)</span></label>
                <textarea name="body" defaultValue={editing?.body ?? ''} required rows={5} className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[12px] font-mono outline-none focus:border-[#6366f1] resize-none" placeholder="Hola {{contact_name}},&#10;&#10;..." />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-[13px] text-[#646462] bg-[#f0f0ee] rounded-full hover:bg-[#e0e0de]">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-[13px] font-semibold text-white bg-[#222] rounded-full hover:bg-[#444]">{editing ? 'Guardar cambios' : 'Crear plantilla'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VISUAL FLOWS VIEW
// ─────────────────────────────────────────────────────────────────────────────

type VisualFlow = {
  id: string; name: string; description: string;
  trigger_type: 'keyword' | 'intent' | 'event' | 'schedule' | 'api';
  status: 'draft' | 'published' | 'archived';
  step_count: number; run_count: number; updatedAt: string;
};
const FLOW_TRIGGER_LABELS: Record<VisualFlow['trigger_type'], string> = {
  keyword: 'Palabra clave', intent: 'Intención', event: 'Evento', schedule: 'Programado', api: 'API',
};
const FLOW_TRIGGER_COLORS: Record<VisualFlow['trigger_type'], string> = {
  keyword: 'bg-[#dbeafe] text-[#1e40af]', intent: 'bg-[#ede9fe] text-[#5b21b6]',
  event: 'bg-[#dcfce7] text-[#166534]', schedule: 'bg-[#fef9c3] text-[#854d0e]', api: 'bg-[#f0f0ee] text-[#444]',
};
const FLOW_STATUS_COLORS: Record<VisualFlow['status'], string> = {
  draft: 'bg-[#fef9c3] text-[#854d0e]', published: 'bg-[#dcfce7] text-[#166534]', archived: 'bg-[#f0f0ee] text-[#999]',
};
const MOCK_FLOWS: VisualFlow[] = [
  { id: '1', name: 'Onboarding automático', description: 'Secuencia de bienvenida para nuevos clientes', trigger_type: 'event', status: 'published', step_count: 5, run_count: 342, updatedAt: 'hace 1 día' },
  { id: '2', name: 'Calificación de leads', description: 'Preguntas para calificar leads entrantes', trigger_type: 'intent', status: 'published', step_count: 8, run_count: 178, updatedAt: 'hace 3 días' },
  { id: '3', name: 'Recuperación de carrito', description: 'Recordatorio de compra abandonada', trigger_type: 'schedule', status: 'draft', step_count: 3, run_count: 0, updatedAt: 'hace 5 días' },
  { id: '4', name: 'Soporte técnico nivel 1', description: 'Triaje automático de incidencias técnicas', trigger_type: 'keyword', status: 'archived', step_count: 6, run_count: 1240, updatedAt: 'hace 2 semanas' },
];

// Simple visual flow canvas mock — shows steps as nodes
function FlowCanvas({ flow }: { flow: VisualFlow }) {
  const steps = [
    { label: 'Trigger', color: '#6366f1', icon: '⚡' },
    { label: 'Condición', color: '#f59e0b', icon: '?' },
    { label: 'Acción IA', color: '#22c55e', icon: '🤖' },
    { label: 'Espera', color: '#64748b', icon: '⏳' },
    { label: 'Finalizar', color: '#ef4444', icon: '✓' },
  ].slice(0, flow.step_count > 5 ? 5 : flow.step_count);
  return (
    <div className="flex items-center gap-0 overflow-x-auto py-3 px-4 bg-[#f8f8ff] rounded-xl border border-[#e9eae6] min-h-[80px]">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-0 flex-shrink-0">
          <div className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[16px] shadow-sm" style={{ backgroundColor: s.color }}>
              {s.icon}
            </div>
            <span className="text-[10px] text-[#646462] font-medium">{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className="w-8 h-[2px] bg-[#e9eae6] mx-1 flex-shrink-0 relative">
              <span className="absolute right-0 top-[-5px] text-[10px] text-[#999]">›</span>
            </div>
          )}
        </div>
      ))}
      {flow.step_count > 5 && (
        <div className="ml-2 text-[12px] text-[#999]">+{flow.step_count - 5} pasos</div>
      )}
    </div>
  );
}

function VisualFlowsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [flows, setFlows] = useState<VisualFlow[]>(MOCK_FLOWS);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  function toggleStatus(id: string) {
    setFlows(fs => fs.map(f => {
      if (f.id !== id) return f;
      const next = f.status === 'published' ? 'draft' : f.status === 'draft' ? 'published' : f.status;
      return { ...f, status: next };
    }));
  }
  function handleDelete(id: string) { setFlows(fs => fs.filter(f => f.id !== id)); }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newFlow: VisualFlow = {
      id: Date.now().toString(),
      name: fd.get('name') as string,
      description: fd.get('description') as string,
      trigger_type: fd.get('trigger_type') as VisualFlow['trigger_type'],
      status: 'draft', step_count: 1, run_count: 0, updatedAt: 'ahora',
    };
    setFlows(fs => [newFlow, ...fs]);
    setShowModal(false);
  }

  return (
    <div className="flex flex-1 min-w-0 h-full gap-3 p-3 overflow-hidden">
      <SettingsSidebar view={view} onNavigate={onNavigate} />
      <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Flujos visuales</h2>
            <p className="text-[13px] text-[#646462] mt-0.5">Crea flujos de conversación y automatización sin código.</p>
          </div>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-[#222] text-white text-[13px] font-semibold rounded-full hover:bg-[#444]">+ Nuevo flujo</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
          {flows.map(flow => (
            <div key={flow.id} className="border border-[#e9eae6] rounded-xl overflow-hidden">
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#fafaf9]"
                onClick={() => setExpanded(expanded === flow.id ? null : flow.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[14px] font-semibold text-[#1a1a1a]">{flow.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${FLOW_TRIGGER_COLORS[flow.trigger_type]}`}>{FLOW_TRIGGER_LABELS[flow.trigger_type]}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${FLOW_STATUS_COLORS[flow.status]}`}>{flow.status === 'published' ? 'Publicado' : flow.status === 'draft' ? 'Borrador' : 'Archivado'}</span>
                  </div>
                  <p className="text-[12px] text-[#646462] truncate">{flow.description}</p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 text-[12px] text-[#999]">
                  <span>{flow.step_count} pasos</span>
                  <span>{flow.run_count.toLocaleString()} ejecuciones</span>
                  <span>{flow.updatedAt}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  {flow.status !== 'archived' && (
                    <button
                      onClick={() => toggleStatus(flow.id)}
                      className={`px-3 py-1 text-[12px] font-semibold rounded-full ${flow.status === 'published' ? 'bg-[#dcfce7] text-[#166534] hover:bg-[#bbf7d0]' : 'bg-[#f0f0ee] text-[#444] hover:bg-[#e0e0de]'}`}
                    >
                      {flow.status === 'published' ? 'Pausar' : 'Publicar'}
                    </button>
                  )}
                  <button onClick={() => handleDelete(flow.id)} className="p-1.5 text-[#ef4444] hover:bg-[#fee2e2] rounded-lg text-[12px]">✕</button>
                </div>
                <span className={`text-[#999] text-[14px] transition-transform ${expanded === flow.id ? 'rotate-90' : ''}`}>›</span>
              </div>
              {expanded === flow.id && (
                <div className="px-5 pb-4 pt-0 border-t border-[#f0f0ee] bg-[#fafaf9]">
                  <p className="text-[12px] font-semibold text-[#999] uppercase tracking-wide mb-3 pt-3">Vista previa del flujo</p>
                  <FlowCanvas flow={flow} />
                  <div className="flex gap-2 mt-3">
                    <button className="px-3 py-1.5 text-[12px] font-semibold bg-[#6366f1] text-white rounded-full hover:bg-[#4f46e5]">✏️ Editar en canvas</button>
                    <button className="px-3 py-1.5 text-[12px] font-semibold bg-[#f0f0ee] text-[#444] rounded-full hover:bg-[#e0e0de]">📋 Duplicar</button>
                    <button className="px-3 py-1.5 text-[12px] font-semibold bg-[#f0f0ee] text-[#444] rounded-full hover:bg-[#e0e0de]">📊 Ver ejecuciones</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6]">
              <h3 className="text-[16px] font-semibold text-[#1a1a1a]">Nuevo flujo visual</h3>
              <button onClick={() => setShowModal(false)} className="text-[#999] hover:text-[#444] text-[20px] leading-none">×</button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-semibold text-[#646462]">Nombre del flujo</label>
                <input name="name" required className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#6366f1]" placeholder="Ej. Onboarding de clientes" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-semibold text-[#646462]">Descripción</label>
                <input name="description" className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#6366f1]" placeholder="Breve descripción del flujo" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-semibold text-[#646462]">Tipo de trigger</label>
                <select name="trigger_type" className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#6366f1]">
                  {(Object.entries(FLOW_TRIGGER_LABELS) as [VisualFlow['trigger_type'], string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-[13px] text-[#646462] bg-[#f0f0ee] rounded-full hover:bg-[#e0e0de]">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-[13px] font-semibold text-white bg-[#222] rounded-full hover:bg-[#444]">Crear flujo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA IMPORTS VIEW
// ─────────────────────────────────────────────────────────────────────────────

type DataImport = {
  id: string; entity_type: 'contacts' | 'conversations' | 'companies' | 'knowledge';
  filename: string; status: 'pending' | 'processing' | 'completed' | 'failed';
  total_rows: number; imported_rows: number; skipped_rows: number; error_rows: number;
  imported_by: string; createdAt: string;
};
const DI_ENTITY_LABELS: Record<DataImport['entity_type'], string> = {
  contacts: 'Contactos', conversations: 'Conversaciones', companies: 'Empresas', knowledge: 'Base de conocimiento',
};
const DI_ENTITY_COLORS: Record<DataImport['entity_type'], string> = {
  contacts: 'bg-[#dbeafe] text-[#1e40af]', conversations: 'bg-[#ede9fe] text-[#5b21b6]',
  companies: 'bg-[#dcfce7] text-[#166534]', knowledge: 'bg-[#fef9c3] text-[#854d0e]',
};
const DI_STATUS_COLORS: Record<DataImport['status'], string> = {
  pending: 'bg-[#fef9c3] text-[#854d0e]', processing: 'bg-[#dbeafe] text-[#1e40af]',
  completed: 'bg-[#dcfce7] text-[#166534]', failed: 'bg-[#fee2e2] text-[#b91c1c]',
};
const DI_STATUS_LABELS: Record<DataImport['status'], string> = {
  pending: 'Pendiente', processing: 'Procesando', completed: 'Completado', failed: 'Error',
};
const MOCK_IMPORTS: DataImport[] = [
  { id: '1', entity_type: 'contacts', filename: 'clientes_2026_q1.csv', status: 'completed', total_rows: 1500, imported_rows: 1480, skipped_rows: 12, error_rows: 8, imported_by: 'Hector Vidal', createdAt: 'hace 2 días' },
  { id: '2', entity_type: 'companies', filename: 'empresas_partner.xlsx', status: 'completed', total_rows: 240, imported_rows: 238, skipped_rows: 2, error_rows: 0, imported_by: 'Ana García', createdAt: 'hace 4 días' },
  { id: '3', entity_type: 'knowledge', filename: 'faq_soporte_v3.json', status: 'processing', total_rows: 420, imported_rows: 180, skipped_rows: 0, error_rows: 0, imported_by: 'Carlos López', createdAt: 'hace 1 hora' },
  { id: '4', entity_type: 'contacts', filename: 'leads_evento_abril.csv', status: 'failed', total_rows: 890, imported_rows: 0, skipped_rows: 0, error_rows: 890, imported_by: 'Hector Vidal', createdAt: 'hace 1 semana' },
  { id: '5', entity_type: 'conversations', filename: 'historico_2025.csv', status: 'pending', total_rows: 5600, imported_rows: 0, skipped_rows: 0, error_rows: 0, imported_by: 'María Ruiz', createdAt: 'hace 30 min' },
];

function DataImportsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [imports, setImports] = useState<DataImport[]>(MOCK_IMPORTS);
  const [filterStatus, setFilterStatus] = useState<DataImport['status'] | 'all'>('all');
  const [showModal, setShowModal] = useState(false);

  const filtered = imports.filter(i => filterStatus === 'all' || i.status === filterStatus);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newImport: DataImport = {
      id: Date.now().toString(),
      entity_type: fd.get('entity_type') as DataImport['entity_type'],
      filename: fd.get('filename') as string,
      status: 'pending', total_rows: 0, imported_rows: 0, skipped_rows: 0, error_rows: 0,
      imported_by: 'Hector Vidal', createdAt: 'ahora',
    };
    setImports(im => [newImport, ...im]);
    setShowModal(false);
  }

  const statusCounts = {
    all: imports.length,
    pending: imports.filter(i => i.status === 'pending').length,
    processing: imports.filter(i => i.status === 'processing').length,
    completed: imports.filter(i => i.status === 'completed').length,
    failed: imports.filter(i => i.status === 'failed').length,
  };

  return (
    <div className="flex flex-1 min-w-0 h-full gap-3 p-3 overflow-hidden">
      <SettingsSidebar view={view} onNavigate={onNavigate} />
      <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Importaciones de datos</h2>
            <p className="text-[13px] text-[#646462] mt-0.5">Historial y estado de importaciones masivas.</p>
          </div>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-[#222] text-white text-[13px] font-semibold rounded-full hover:bg-[#444]">+ Nueva importación</button>
        </div>
        {/* Filter tabs */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-[#e9eae6] flex-shrink-0">
          {(['all','pending','processing','completed','failed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-full transition-colors ${filterStatus === s ? 'bg-[#222] text-white' : 'bg-[#f0f0ee] text-[#444] hover:bg-[#e0e0de]'}`}
            >
              {s === 'all' ? 'Todos' : DI_STATUS_LABELS[s]} ({statusCounts[s]})
            </button>
          ))}
        </div>
        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-[#f8f8f7] z-10">
              <tr className="border-b border-[#e9eae6]">
                <th className="text-left px-6 py-3 font-semibold text-[#646462]">Archivo</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Progreso</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Importado por</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(imp => {
                const pct = imp.total_rows > 0 ? Math.round((imp.imported_rows / imp.total_rows) * 100) : 0;
                return (
                  <tr key={imp.id} className="border-b border-[#f0f0ee] hover:bg-[#fafaf9]">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[16px]">📄</span>
                        <span className="font-medium text-[#1a1a1a] truncate max-w-[180px]">{imp.filename}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${DI_ENTITY_COLORS[imp.entity_type]}`}>{DI_ENTITY_LABELS[imp.entity_type]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${DI_STATUS_COLORS[imp.status]}`}>{DI_STATUS_LABELS[imp.status]}</span>
                    </td>
                    <td className="px-4 py-3">
                      {imp.total_rows > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-[#f0f0ee] rounded-full h-1.5 flex-shrink-0">
                            <div className={`h-1.5 rounded-full ${imp.status === 'failed' ? 'bg-[#ef4444]' : 'bg-[#22c55e]'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-[#999] whitespace-nowrap">{imp.imported_rows.toLocaleString()} / {imp.total_rows.toLocaleString()}</span>
                          {imp.error_rows > 0 && <span className="text-[11px] text-[#ef4444]">{imp.error_rows} errores</span>}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#999]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#646462]">{imp.imported_by}</td>
                    <td className="px-4 py-3 text-[#999]">{imp.createdAt}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-[#999]">No hay importaciones en este estado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6]">
              <h3 className="text-[16px] font-semibold text-[#1a1a1a]">Nueva importación</h3>
              <button onClick={() => setShowModal(false)} className="text-[#999] hover:text-[#444] text-[20px] leading-none">×</button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-semibold text-[#646462]">Tipo de entidad</label>
                <select name="entity_type" className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#6366f1]">
                  {(Object.entries(DI_ENTITY_LABELS) as [DataImport['entity_type'], string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-semibold text-[#646462]">Nombre del archivo</label>
                <input name="filename" required className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#6366f1]" placeholder="Ej. clientes_mayo_2026.csv" />
              </div>
              <div className="p-3 bg-[#f8f8f7] rounded-lg border border-dashed border-[#e9eae6] text-center">
                <p className="text-[13px] text-[#999]">📤 Arrastra tu archivo CSV/Excel aquí</p>
                <p className="text-[11px] text-[#c0c0be] mt-1">o haz clic para seleccionar</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-[13px] text-[#646462] bg-[#f0f0ee] rounded-full hover:bg-[#e0e0de]">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-[13px] font-semibold text-white bg-[#222] rounded-full hover:bg-[#444]">Iniciar importación</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM ROLES VIEW
// ─────────────────────────────────────────────────────────────────────────────

type CustomRole = {
  id: string; name: string; description: string;
  permissions: string[]; is_system: boolean; member_count: number; updatedAt: string;
};
const ALL_PERMISSIONS = [
  'conversations.read','conversations.write','conversations.delete',
  'contacts.read','contacts.write','contacts.delete',
  'reports.read','settings.read','settings.write',
  'inboxes.manage','agents.manage','billing.manage','*',
];
const MOCK_ROLES: CustomRole[] = [
  { id: '1', name: 'Owner', description: 'Acceso total al espacio de trabajo', permissions: ['*'], is_system: true, member_count: 1, updatedAt: 'Sistema' },
  { id: '2', name: 'Admin', description: 'Gestión completa excepto facturación', permissions: ['conversations.read','conversations.write','contacts.read','contacts.write','reports.read','settings.read','settings.write','inboxes.manage','agents.manage'], is_system: true, member_count: 3, updatedAt: 'Sistema' },
  { id: '3', name: 'Agent', description: 'Acceso de agente de soporte estándar', permissions: ['conversations.read','conversations.write','contacts.read','contacts.write','reports.read'], is_system: true, member_count: 12, updatedAt: 'Sistema' },
  { id: '4', name: 'Viewer', description: 'Solo lectura en todo el espacio', permissions: ['conversations.read','contacts.read','reports.read','settings.read'], is_system: true, member_count: 5, updatedAt: 'Sistema' },
  { id: '5', name: 'Soporte Tier 2', description: 'Agentes senior con acceso a settings', permissions: ['conversations.read','conversations.write','contacts.read','contacts.write','reports.read','settings.read','inboxes.manage'], is_system: false, member_count: 4, updatedAt: 'hace 3 días' },
];

function CustomRolesView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [roles, setRoles] = useState<CustomRole[]>(MOCK_ROLES);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  function openCreate() { setEditing(null); setSelectedPerms([]); setShowModal(true); }
  function openEdit(r: CustomRole) {
    if (r.is_system) return;
    setEditing(r); setSelectedPerms([...r.permissions]); setShowModal(true);
  }
  function handleDelete(id: string) { setRoles(rs => rs.filter(r => r.id !== id || r.is_system)); }
  function togglePerm(p: string) {
    setSelectedPerms(ps => ps.includes(p) ? ps.filter(x => x !== p) : [...ps, p]);
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (editing) {
      setRoles(rs => rs.map(r => r.id === editing.id ? { ...r, name: fd.get('name') as string, description: fd.get('description') as string, permissions: selectedPerms, updatedAt: 'ahora' } : r));
    } else {
      setRoles(rs => [...rs, {
        id: Date.now().toString(), name: fd.get('name') as string, description: fd.get('description') as string,
        permissions: selectedPerms, is_system: false, member_count: 0, updatedAt: 'ahora',
      }]);
    }
    setShowModal(false);
  }

  const PERM_GROUPS: { label: string; perms: string[] }[] = [
    { label: 'Conversaciones', perms: ['conversations.read','conversations.write','conversations.delete'] },
    { label: 'Contactos',      perms: ['contacts.read','contacts.write','contacts.delete'] },
    { label: 'Reportes',       perms: ['reports.read'] },
    { label: 'Ajustes',        perms: ['settings.read','settings.write'] },
    { label: 'Gestión',        perms: ['inboxes.manage','agents.manage','billing.manage'] },
    { label: 'Superadmin',     perms: ['*'] },
  ];

  return (
    <div className="flex flex-1 min-w-0 h-full gap-3 p-3 overflow-hidden">
      <SettingsSidebar view={view} onNavigate={onNavigate} />
      <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Roles personalizados</h2>
            <p className="text-[13px] text-[#646462] mt-0.5">Define permisos granulares para tu equipo.</p>
          </div>
          <button onClick={openCreate} className="px-4 py-2 bg-[#222] text-white text-[13px] font-semibold rounded-full hover:bg-[#444]">+ Nuevo rol</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-[#f8f8f7] z-10">
              <tr className="border-b border-[#e9eae6]">
                <th className="text-left px-6 py-3 font-semibold text-[#646462]">Nombre</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Descripción</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Permisos</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Miembros</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {roles.map(role => (
                <tr key={role.id} className="border-b border-[#f0f0ee] hover:bg-[#fafaf9]">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#1a1a1a]">{role.name}</span>
                      {role.is_system && <span className="text-[10px] bg-[#f0f0ee] text-[#999] px-1.5 py-0.5 rounded-full">Sistema</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#646462] max-w-[200px]">{role.description}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[300px]">
                      {role.permissions.includes('*') ? (
                        <span className="text-[11px] bg-[#fef9c3] text-[#854d0e] px-1.5 py-0.5 rounded font-medium">Todo (*)</span>
                      ) : (
                        <>
                          {role.permissions.slice(0, 4).map(p => (
                            <span key={p} className="text-[11px] bg-[#f0f0ee] text-[#444] px-1.5 py-0.5 rounded font-mono">{p}</span>
                          ))}
                          {role.permissions.length > 4 && <span className="text-[11px] text-[#999]">+{role.permissions.length - 4}</span>}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="w-5 h-5 rounded-full bg-[#e9eae6] flex items-center justify-center text-[10px] font-semibold text-[#646462]">{role.member_count}</span>
                      <span className="text-[#999]">miembros</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {!role.is_system && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(role)} className="px-2 py-1 text-[12px] bg-[#f0f0ee] rounded hover:bg-[#e0e0de]">Editar</button>
                        <button onClick={() => handleDelete(role.id)} className="px-2 py-1 text-[12px] bg-[#fee2e2] text-[#b91c1c] rounded hover:bg-[#fecaca]">Eliminar</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] sticky top-0 bg-white">
              <h3 className="text-[16px] font-semibold text-[#1a1a1a]">{editing ? 'Editar rol' : 'Nuevo rol personalizado'}</h3>
              <button onClick={() => setShowModal(false)} className="text-[#999] hover:text-[#444] text-[20px] leading-none">×</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-semibold text-[#646462]">Nombre del rol</label>
                <input name="name" defaultValue={editing?.name ?? ''} required className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#6366f1]" placeholder="Ej. Soporte Tier 2" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[12px] font-semibold text-[#646462]">Descripción</label>
                <input name="description" defaultValue={editing?.description ?? ''} className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#6366f1]" placeholder="Describe el propósito del rol" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-semibold text-[#646462]">Permisos ({selectedPerms.length} seleccionados)</label>
                {PERM_GROUPS.map(g => (
                  <div key={g.label}>
                    <p className="text-[11px] font-semibold text-[#999] uppercase tracking-wide mb-1">{g.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.perms.map(p => (
                        <button
                          key={p} type="button" onClick={() => togglePerm(p)}
                          className={`text-[11px] px-2 py-1 rounded-lg border font-mono transition-colors ${selectedPerms.includes(p) ? 'bg-[#222] text-white border-[#222]' : 'bg-white text-[#444] border-[#e9eae6] hover:border-[#999]'}`}
                        >{p}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-[13px] text-[#646462] bg-[#f0f0ee] rounded-full hover:bg-[#e0e0de]">Cancelar</button>
                <button type="submit" className="px-4 py-2 text-[13px] font-semibold text-white bg-[#222] rounded-full hover:bg-[#444]">{editing ? 'Guardar cambios' : 'Crear rol'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CALLS VIEW
// ─────────────────────────────────────────────────────────────────────────────

type Call = {
  id: string; direction: 'inbound' | 'outbound'; status: 'completed' | 'missed' | 'in_progress' | 'voicemail' | 'failed';
  from_number: string; to_number: string; agent: string;
  duration_s: number | null; createdAt: string; recording: boolean;
};
const CALL_DIR_COLORS: Record<Call['direction'], string> = {
  inbound: 'bg-[#dbeafe] text-[#1e40af]', outbound: 'bg-[#ede9fe] text-[#5b21b6]',
};
const CALL_STATUS_COLORS: Record<Call['status'], string> = {
  completed: 'bg-[#dcfce7] text-[#166534]', missed: 'bg-[#fee2e2] text-[#b91c1c]',
  in_progress: 'bg-[#dbeafe] text-[#1e40af]', voicemail: 'bg-[#fef9c3] text-[#854d0e]', failed: 'bg-[#f0f0ee] text-[#999]',
};
const CALL_STATUS_LABELS: Record<Call['status'], string> = {
  completed: 'Completada', missed: 'Perdida', in_progress: 'En curso', voicemail: 'Buzón de voz', failed: 'Fallida',
};
const MOCK_CALLS: Call[] = [
  { id: '1', direction: 'inbound', status: 'completed', from_number: '+34 612 345 678', to_number: '+34 900 123 456', agent: 'Ana García', duration_s: 245, createdAt: 'hace 5 min', recording: true },
  { id: '2', direction: 'outbound', status: 'completed', from_number: '+34 900 123 456', to_number: '+34 655 234 567', agent: 'Carlos López', duration_s: 180, createdAt: 'hace 12 min', recording: true },
  { id: '3', direction: 'inbound', status: 'missed', from_number: '+34 688 456 789', to_number: '+34 900 123 456', agent: '—', duration_s: null, createdAt: 'hace 25 min', recording: false },
  { id: '4', direction: 'inbound', status: 'voicemail', from_number: '+34 699 567 890', to_number: '+34 900 123 456', agent: '—', duration_s: 42, createdAt: 'hace 1 hora', recording: true },
  { id: '5', direction: 'outbound', status: 'failed', from_number: '+34 900 123 456', to_number: '+34 622 678 901', agent: 'Hector Vidal', duration_s: null, createdAt: 'hace 2 horas', recording: false },
  { id: '6', direction: 'inbound', status: 'in_progress', from_number: '+34 633 789 012', to_number: '+34 900 123 456', agent: 'María Ruiz', duration_s: null, createdAt: 'ahora', recording: false },
];

function fmtDuration(s: number | null): string {
  if (s === null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

function CallsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [calls] = useState<Call[]>(MOCK_CALLS);
  const [filterDir, setFilterDir] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [filterStatus, setFilterStatus] = useState<Call['status'] | 'all'>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);

  const filtered = calls.filter(c =>
    (filterDir === 'all' || c.direction === filterDir) &&
    (filterStatus === 'all' || c.status === filterStatus)
  );

  // Stats
  const total     = calls.length;
  const answered  = calls.filter(c => c.status === 'completed').length;
  const missed    = calls.filter(c => c.status === 'missed').length;
  const avgDur    = calls.filter(c => c.duration_s !== null).reduce((acc, c) => acc + (c.duration_s ?? 0), 0) /
                    Math.max(1, calls.filter(c => c.duration_s !== null).length);

  return (
    <div className="flex flex-1 min-w-0 h-full gap-3 p-3 overflow-hidden">
      <SettingsSidebar view={view} onNavigate={onNavigate} />
      <div className="flex flex-col flex-1 min-w-0 bg-white rounded-[16px] shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
          <div>
            <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Llamadas</h2>
            <p className="text-[13px] text-[#646462] mt-0.5">Historial y estado de llamadas del equipo.</p>
          </div>
          <button className="px-4 py-2 bg-[#222] text-white text-[13px] font-semibold rounded-full hover:bg-[#444] flex items-center gap-1">
            📞 Nueva llamada
          </button>
        </div>
        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
          {[
            { label: 'Total hoy', value: total, icon: '📊' },
            { label: 'Contestadas', value: answered, icon: '✅' },
            { label: 'Perdidas', value: missed, icon: '❌' },
            { label: 'Duración media', value: fmtDuration(Math.round(avgDur)), icon: '⏱' },
          ].map(({ label, value, icon }) => (
            <div key={label} className="bg-[#fafaf9] rounded-xl border border-[#e9eae6] px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span>{icon}</span>
                <span className="text-[12px] text-[#999]">{label}</span>
              </div>
              <span className="text-[22px] font-bold text-[#1a1a1a]">{value}</span>
            </div>
          ))}
        </div>
        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-[#e9eae6] flex-shrink-0">
          <div className="flex items-center gap-1">
            {(['all','inbound','outbound'] as const).map(d => (
              <button
                key={d}
                onClick={() => setFilterDir(d)}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-full transition-colors ${filterDir === d ? 'bg-[#222] text-white' : 'bg-[#f0f0ee] text-[#444] hover:bg-[#e0e0de]'}`}
              >{d === 'all' ? 'Todas' : d === 'inbound' ? '↙ Entrantes' : '↗ Salientes'}</button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {(['all','completed','missed','voicemail','failed'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-full transition-colors ${filterStatus === s ? 'bg-[#222] text-white' : 'bg-[#f0f0ee] text-[#444] hover:bg-[#e0e0de]'}`}
              >{s === 'all' ? 'Todo' : CALL_STATUS_LABELS[s]}</button>
            ))}
          </div>
        </div>
        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-[#f8f8f7] z-10">
              <tr className="border-b border-[#e9eae6]">
                <th className="text-left px-6 py-3 font-semibold text-[#646462]">Dirección</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">De</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Para</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Agente</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Duración</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Grabación</th>
                <th className="text-left px-4 py-3 font-semibold text-[#646462]">Hora</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(call => (
                <tr key={call.id} className="border-b border-[#f0f0ee] hover:bg-[#fafaf9]">
                  <td className="px-6 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${CALL_DIR_COLORS[call.direction]}`}>
                      {call.direction === 'inbound' ? '↙ Entrante' : '↗ Saliente'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${CALL_STATUS_COLORS[call.status]}`}>
                      {CALL_STATUS_LABELS[call.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#646462]">{call.from_number}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#646462]">{call.to_number}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]">{call.agent}</td>
                  <td className="px-4 py-3 font-mono text-[#1a1a1a]">{fmtDuration(call.duration_s)}</td>
                  <td className="px-4 py-3">
                    {call.recording ? (
                      <button
                        onClick={() => setPlayingId(playingId === call.id ? null : call.id)}
                        className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full font-medium transition-colors ${playingId === call.id ? 'bg-[#6366f1] text-white' : 'bg-[#ede9fe] text-[#5b21b6] hover:bg-[#ddd6fe]'}`}
                      >
                        {playingId === call.id ? '⏹ Detener' : '▶ Reproducir'}
                      </button>
                    ) : (
                      <span className="text-[#ccc] text-[12px]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#999]">{call.createdAt}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-[#999]">No hay llamadas con estos filtros</td></tr>
              )}
            </tbody>
          </table>
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
      case 'allLeads':      return <AllLeadsView view={view} onNavigate={setView} onBack={() => setView('contacts')} />;
      case 'contacts':      return <ContactsView view={view} onNavigate={setView} onBack={() => setView('inbox')} />;
      case 'companiesList': return <CompaniesListView view={view} onNavigate={setView} />;
      case 'settings': return <SettingsView view={view} onNavigate={setView} onBack={() => setView('inbox')} />;
      case 'imports':  return <ImportsView view={view} onNavigate={setView} onBack={() => setView('inbox')} />;
      case 'personal': return <PersonalView view={view} onNavigate={setView} />;
      case 'security':       return <SecurityView view={view} onNavigate={setView} onBack={() => setView('personal')} />;
      case 'notifications':  return <NotificationsView view={view} onNavigate={setView} />;
      case 'visible':        return <VisibleView view={view} onNavigate={setView} />;
      case 'tokens':         return <TokensView view={view} onNavigate={setView} />;
      case 'accountAccess':  return <AccountAccessView view={view} onNavigate={setView} />;
      case 'multilingual':   return <MultilingualView view={view} onNavigate={setView} />;
      case 'inboxes':        return <InboxesView view={view} onNavigate={setView} />;
      case 'cannedResponses': return <CannedResponsesView view={view} onNavigate={setView} />;
      case 'assignments':    return <AssignmentsView view={view} onNavigate={setView} />;
      case 'macros':         return <MacrosView view={view} onNavigate={setView} />;
      case 'tickets':        return <TicketsView view={view} onNavigate={setView} />;
      case 'sla':            return <SlaView view={view} onNavigate={setView} />;
      case 'aiInbox':        return <AiInboxView view={view} onNavigate={setView} />;
      case 'automation':     return <AutomationView view={view} onNavigate={setView} />;
      case 'aiGuardrails':  return <AiGuardrailsView view={view} onNavigate={setView} />;
      case 'agentTools':    return <AgentToolsView view={view} onNavigate={setView} />;
      case 'agentScenarios': return <AgentScenariosView view={view} onNavigate={setView} />;
      case 'mcpServers':    return <McpServersView view={view} onNavigate={setView} />;
      case 'appStore':       return <AppStoreView view={view} onNavigate={setView} />;
      case 'connectors':     return <ConnectorsView view={view} onNavigate={setView} />;
      case 'labels':         return <LabelsView view={view} onNavigate={setView} />;
      case 'people':         return <PeopleView view={view} onNavigate={setView} />;
      case 'companies':      return <EmpresasView view={view} onNavigate={setView} />;
      case 'workspaceSecurity':     return <WorkspaceSecurityView view={view} onNavigate={setView} />;
      case 'workspaceMultilingual': return <WorkspaceMultilingualView view={view} onNavigate={setView} />;
      case 'billing':        return <BillingView view={view} onNavigate={setView} />;
      case 'messenger':      return <MessengerView view={view} onNavigate={setView} />;
      case 'email':          return <EmailView view={view} onNavigate={setView} />;
      case 'phone':          return <PhoneView view={view} onNavigate={setView} />;
      case 'whatsapp':       return <WhatsAppView view={view} onNavigate={setView} />;
      case 'discord':        return <DiscordView view={view} onNavigate={setView} />;
      case 'sms':            return <SmsView view={view} onNavigate={setView} />;
      case 'social':         return <SocialChannelsView view={view} onNavigate={setView} />;
      case 'allChannels':    return <AllChannelsView view={view} onNavigate={setView} />;
      case 'emailTemplates': return <EmailTemplatesView view={view} onNavigate={setView} />;
      case 'visualFlows':   return <VisualFlowsView view={view} onNavigate={setView} />;
      case 'dataImports':   return <DataImportsView view={view} onNavigate={setView} />;
      case 'customRoles':   return <CustomRolesView view={view} onNavigate={setView} />;
      case 'callsView':     return <CallsView view={view} onNavigate={setView} />;
      case 'fin':            return <WIPView label="Fin AI" />;
      case 'knowledge':return <WIPView label="Knowledge Base" />;
      case 'reports':  return <ReportsView onNavigate={setView} />;
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
