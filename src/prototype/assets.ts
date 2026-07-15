// ─────────────────────────────────────────────────────────────────────────────
// Figma image assets (CDN + localhost helper URLs)
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────




// ── Shared icon constants ─────────────────────────────────────────────────────
// Figma desktop MCP assets (extracted node-by-node for 100% fidelity)
export const IMG_SLA_BANNER       = "http://localhost:3845/assets/b19e591362b8c4de77f19587d881d94b1042678b.png";
export const IMG_TICKETS_PORTAL   = "http://localhost:3845/assets/6971188673fd3013af5484de1fa365316c0b94cc.png";
export const IMG_TICKETS_TYPES    = "http://localhost:3845/assets/d0b4c46e141639aad99c27b726fe8bde688d0a73.png";
// AppStore banners (1-30005, 1-30014)
const IMG_APPSTORE_BUILT   = "http://localhost:3845/assets/ad347ce8da225bd35f5b32fe6b12f1e0c920c359.png";
const IMG_APPSTORE_MEETING = "http://localhost:3845/assets/47092718aa85d977f81b82ebb8e30be7d57c735d.png";
// AppStore Popular apps (1-30033, 1-30045, 1-30057, 1-30069)
export const IMG_APP_SALESFORCE   = "http://localhost:3845/assets/3bdcbcb8a69c1ab5dcd0f726121a4b1a1fd7639f.png";
export const IMG_APP_INSTAGRAM    = "http://localhost:3845/assets/5f4fa567fe2eaa00f674696aab535d70118387b9.png";
export const IMG_APP_GA           = "http://localhost:3845/assets/f2498aefe57b15048759bd0c7d413343f479d4c7.png";
export const IMG_APP_JIRA         = "http://localhost:3845/assets/568c5d9e60a43fc756b02a5671654a0b4ff4ae53.png";
// AppStore additional sections (1-30113, 1-30125, 1-30168, 1-30180, 1-30235)
export const IMG_APP_WHATSAPP     = "http://localhost:3845/assets/ed48cfb27c99c5386eb14f1637be6b27f26a0f07.png";
export const IMG_APP_DELIGHTED    = "http://localhost:3845/assets/b549080f72c68b942d7026aefdaed6104eae652a.png";
const IMG_APP_QUICKLINKS   = "http://localhost:3845/assets/08b4d6a3bbb57338581614032b63927bd7df4230.png";
const IMG_APP_DEMO         = "http://localhost:3845/assets/914e49234ac9bdbbba12fee4a9fe382f5a5e0963.png";
export const IMG_APP_STRIPE       = "http://localhost:3845/assets/fe71d140eb03f8f8f8d7da4781359f8957d0db1e.png";
// PeopleView previews (1-37921, 1-34193 main group SVG)
export const IMG_QUALIFICATION    = "http://localhost:3845/assets/87ca775140e54d5c3863f89d37ef855026b40c28.svg";
export const IMG_USERDATA_BANNER  = "http://localhost:3845/assets/ab0de40d6c4bdf7484aba9ff89ed27f73d76959e.svg";
// Channels banners (1:53419, 1:56342, 1:57727, 1:57822, 1:67142)
export const IMG_EMAIL_BANNER     = "http://localhost:3845/assets/6e214d9080a16f54d442f6685aad025362ad2816.png";
export const IMG_PHONE_VIDEO      = "http://localhost:3845/assets/0150575beef6c4a589bf4bc41825691e96238efd.png";
export const IMG_WHATSAPP_BANNER  = "http://localhost:3845/assets/810cd6bad6138197c597db529f478a647af516bb.png";
export const IMG_WHATSAPP_TRANS   = "http://localhost:3845/assets/d14c53a1a462ec4a3e702dc5235b771e2767ca95.png";
export const IMG_CHANNELS_ALL     = "http://localhost:3845/assets/1db4722d06d0ece26352d1f6607f6edf10ffe166.png";
export const IMG_DISCORD_ILLO     = "http://localhost:3845/assets/e25c01bf4ae888185fc2c494120173b16fb88dc8.png";
export const IMG_FACEBOOK_BANNER  = "http://localhost:3845/assets/ff55606a7cb338b7b3782780552d97213eeffd34.png";
export const IMG_INSTAGRAM_BANNER = "http://localhost:3845/assets/adf19f0a72d29719d45fcf27040a591f21c327b1.png";
// Horario de atención — permanent inline SVGs (clock / sparkle)
const IMG_OFFICE_HOURS_BANNER = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>')}`;
const IMG_OFFICE_HOURS_FIN_AI = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>')}`;
// Chat support floating icon (1:55751 mask, used in all settings screens)
const IMG_CHAT_SUPPORT_MASK = "http://localhost:3845/assets/7d6b74634c1449d020cbc1db43f39966f662badb.svg";
// Fin Deploy hero images (audit pass 9 — replaced hand-coded mockups with real Figma assets;
// audit pass 13 — re-fetched via cloud Figma MCP and migrated to portable FIGMA_CDN URLs so the
// images render even when Figma Desktop helper at localhost:3845 isn't running)
// Chat 1:11722 (fin-deploy-chat-eb9e48bead5c65c37096718276eda303.png — 388x212)
export const IMG_FIN_DEPLOY_CHAT  = "https://www.figma.com/api/mcp/asset/8a603a79-7b5e-4bca-acd7-af1ae349a519";
// Email 1:13373 (fin-deploy-email-68f7d0016a876341da3cdc56522be3a4.png — 388x212)
export const IMG_FIN_DEPLOY_EMAIL = "https://www.figma.com/api/mcp/asset/82b6476b-9996-4eba-a5c2-41ad9340c6cc";
// Phone 1:14530 (fin-voice-coming-soon-6f4acefc29fcc6d0e4edc15621ecf710.png — 400x264)
export const IMG_FIN_VOICE_BANNER = "https://www.figma.com/api/mcp/asset/9c5ad212-925d-4c4a-9ca7-9f0abd7dc12f";
// Desempeño Pro trial banner (1:15713 — pro-trial-banner-thumbnail-f434e3ca88e55db74cf6215f987c6c48.png — 300x144)
export const IMG_FIN_PRO_TRIAL_BANNER = "https://www.figma.com/api/mcp/asset/6c556a51-d0db-42bd-ad40-54598a85d0ce";
// AllChannels card logos — each is a composition of bg SVG + foreground SVGs
// All extracted node-by-node via cloud Figma MCP (1:67155, 70, 84, 202, 22, 41, 60, 99, 314)
export const FIGMA_CDN = "https://www.figma.com/api/mcp/asset";
