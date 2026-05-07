"""
patch_integrations_settings.py
- Remove standalone 'integrations' nav item + IntegrationsView
- Rebuild AppStoreView inside Settings with:
    · Clearbit CDN logos (+ color fallback)
    · ConnectModal styled with LC design tokens
    · Full 19-integration list
    · Category pills, search, connected badge
"""

PATH = r"C:\Users\usuario\OneDrive - Universidad Politécnica de Cartagena\Documentos\Claude\CRM-AI\src\prototype\Prototype.tsx"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

# ── 1. Remove 'integrations' from View type ───────────────────────────────────
src = src.replace(
    " | 'integrations'",
    ""
)

# ── 2. Remove isIntegrations variable ────────────────────────────────────────
src = src.replace(
    "  const isIntegrations = view === 'integrations';\n",
    ""
)

# ── 3. Remove integrations NavBtnSvg in LeftNav ───────────────────────────────
src = src.replace(
    """          {/* Integraciones — puzzle piece icon */}
          <NavBtnSvg nav="integrations" label="Integraciones">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2h4v2a1 1 0 0 0 1 1h2v4h-2a1 1 0 0 0-1 1v2H6v-2a1 1 0 0 0-1-1H3V6h2a1 1 0 0 0 1-1V2z"/>
            </svg>
          </NavBtnSvg>""",
    ""
)

# ── 4. Remove 'case integrations' from renderView switch ──────────────────────
src = src.replace(
    "      case 'integrations':   return <IntegrationsView view={view} onNavigate={setView} />;\n",
    ""
)

# ── 5. Replace AppStoreView (full rebuild) ────────────────────────────────────
OLD_APPSTORE_START = "// ── AppStoreView ──────────────────────────────────────────────────────────────"
OLD_APPSTORE_END   = "// ── ConnectorsView ────────────────────────────────────────────────────────────"

start5 = src.index(OLD_APPSTORE_START)
end5   = src.index(OLD_APPSTORE_END)

NEW_APPSTORE = r"""// ── AppStoreView ──────────────────────────────────────────────────────────────

const STORE_INTEGRATIONS = [
  // CRM
  { id: 'salesforce',  name: 'Salesforce',        category: 'CRM',           desc: 'Sincroniza contactos, oportunidades y casos con Salesforce.', domain: 'salesforce.com',   connected: false, auth: 'oauth',  color: '#00A1E0' },
  { id: 'hubspot',     name: 'HubSpot',            category: 'CRM',           desc: 'Sincroniza contactos y deals de HubSpot con el inbox.',       domain: 'hubspot.com',       connected: true,  auth: 'apikey', color: '#FF7A59' },
  { id: 'zendesk',     name: 'Zendesk',            category: 'CRM',           desc: 'Importa tickets de Zendesk y gestiona todo desde Clain.',      domain: 'zendesk.com',       connected: false, auth: 'apikey', color: '#03363D' },
  { id: 'freshdesk',   name: 'Freshdesk',          category: 'CRM',           desc: 'Centraliza tickets de Freshdesk en la bandeja de Clain.',      domain: 'freshdesk.com',     connected: false, auth: 'apikey', color: '#2DC26B' },
  // Canales
  { id: 'whatsapp',    name: 'WhatsApp Business',  category: 'Canales',       desc: 'Recibe y responde mensajes de WhatsApp desde el inbox.',        domain: 'whatsapp.com',      connected: true,  auth: 'oauth',  color: '#25D366' },
  { id: 'instagram',   name: 'Instagram',          category: 'Canales',       desc: 'Gestiona DMs de Instagram desde tu bandeja de entrada.',        domain: 'instagram.com',     connected: true,  auth: 'oauth',  color: '#E1306C' },
  { id: 'slack',       name: 'Slack',              category: 'Canales',       desc: 'Notificaciones de conversaciones y escalados en Slack.',        domain: 'slack.com',         connected: true,  auth: 'oauth',  color: '#4A154B' },
  { id: 'twilio',      name: 'SMS · Twilio',       category: 'Canales',       desc: 'Envía y recibe SMS a través de Twilio en el workspace.',        domain: 'twilio.com',        connected: false, auth: 'apikey', color: '#F22F46' },
  // Pagos
  { id: 'stripe',      name: 'Stripe',             category: 'Pagos',         desc: 'Consulta suscripciones, pagos y facturas desde cada caso.',    domain: 'stripe.com',        connected: true,  auth: 'apikey', color: '#635BFF' },
  { id: 'shopify',     name: 'Shopify',            category: 'Comercio',      desc: 'Accede a pedidos y clientes de Shopify en conversaciones.',     domain: 'shopify.com',       connected: false, auth: 'oauth',  color: '#96BF48' },
  // Productividad
  { id: 'jira',        name: 'Jira',               category: 'Productividad', desc: 'Crea issues de Jira desde conversaciones y sincroniza estado.', domain: 'atlassian.com',     connected: false, auth: 'oauth',  color: '#0052CC' },
  { id: 'linear',      name: 'Linear',             category: 'Productividad', desc: 'Crea y enlaza issues de Linear desde el inbox de soporte.',     domain: 'linear.app',        connected: true,  auth: 'oauth',  color: '#5E6AD2' },
  { id: 'notion',      name: 'Notion',             category: 'Productividad', desc: 'Guarda notas de conversaciones y crea páginas de Notion.',      domain: 'notion.so',         connected: false, auth: 'oauth',  color: '#000000' },
  { id: 'github',      name: 'GitHub',             category: 'Productividad', desc: 'Vincula issues de GitHub a conversaciones para bugs.',          domain: 'github.com',        connected: false, auth: 'oauth',  color: '#24292E' },
  // Analítica
  { id: 'ga',          name: 'Google Analytics',  category: 'Analítica',     desc: 'Mide el impacto del widget de chat en las conversiones.',       domain: 'google.com',        connected: false, auth: 'oauth',  color: '#E37400' },
  { id: 'delighted',   name: 'Delighted',          category: 'Analítica',     desc: 'Dispara encuestas CSAT y NPS basadas en conversaciones.',       domain: 'delighted.com',     connected: false, auth: 'apikey', color: '#FF6E6E' },
  // IA
  { id: 'openai',      name: 'OpenAI',             category: 'IA',            desc: 'Conecta GPT-4o para respuestas generativas en el workspace.',   domain: 'openai.com',        connected: true,  auth: 'apikey', color: '#10A37F' },
  { id: 'anthropic',   name: 'Anthropic',          category: 'IA',            desc: 'Usa Claude como modelo base para el agente AI de Clain.',       domain: 'anthropic.com',     connected: true,  auth: 'apikey', color: '#D97706' },
  { id: 'zapier',      name: 'Zapier',             category: 'IA',            desc: 'Conecta Clain con miles de apps a través de Zaps automáticos.', domain: 'zapier.com',        connected: false, auth: 'oauth',  color: '#FF4A00' },
];

const STORE_CATS = ['Todas', 'CRM', 'Canales', 'Pagos', 'Comercio', 'Productividad', 'Analítica', 'IA'];

// ── Connect Modal (LC design tokens) ─────────────────────────────────────────
function ConnectModal({ integ, onClose }: { integ: typeof STORE_INTEGRATIONS[0]; onClose: () => void }) {
  const LC = { text: '#111111', text60: 'rgba(17,17,17,0.6)', border: '#d3cec6', bg: '#faf9f6', bg2: '#f5f1ea', accent: '#0007cb' };
  const [apiKey, setApiKey] = useState('');
  const [step, setStep] = useState<'form' | 'done'>('form');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div style={{ width: 480, background: LC.bg, border: `1px solid ${LC.border}`, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', position: 'relative' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '28px 32px 20px', borderBottom: `1px solid ${LC.border}`, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 52, height: 52, background: LC.bg2, border: `1px solid ${LC.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
            <img
              src={`https://logo.clearbit.com/${integ.domain}`}
              alt={integ.name}
              style={{ width: 36, height: 36, objectFit: 'contain' }}
              onError={e => {
                const el = e.target as HTMLImageElement;
                el.style.display = 'none';
                if (el.parentElement) {
                  el.parentElement.style.background = integ.color;
                  el.parentElement.innerHTML = `<span style="color:#fff;font-size:22px;font-weight:700">${integ.name[0]}</span>`;
                }
              }}
            />
          </div>
          <div>
            <p style={{ fontSize: 18, fontWeight: 800, color: LC.text }}>{integ.name}</p>
            <p style={{ fontSize: 12, color: LC.text60, marginTop: 2 }}>{integ.category}</p>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: LC.text60, fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {/* Body */}
        {step === 'form' ? (
          <div style={{ padding: '24px 32px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontSize: 13, color: LC.text60, lineHeight: '1.7' }}>{integ.desc}</p>

            {/* Permissions / scopes */}
            <div style={{ background: LC.bg2, border: `1px solid ${LC.border}`, padding: '16px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Permisos solicitados</p>
              {[
                integ.auth === 'oauth' ? 'Leer y escribir datos de contactos' : 'Acceso de solo lectura a datos',
                'Ver conversaciones y tickets',
                integ.connected ? 'Revocar acceso en cualquier momento' : 'Sincronización en tiempo real',
              ].map(p => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${LC.border}` }}>
                  <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>✓</span>
                  <span style={{ fontSize: 13, color: LC.text }}>{p}</span>
                </div>
              ))}
            </div>

            {/* Auth form */}
            {integ.auth === 'apikey' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.08em' }}>API Key</label>
                <input
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={`Pega tu API key de ${integ.name}...`}
                  style={{ padding: '10px 14px', border: `1px solid ${LC.border}`, background: '#fff', fontSize: 13, color: LC.text, outline: 'none', fontFamily: 'monospace', letterSpacing: '0.02em' }}
                />
                <p style={{ fontSize: 11, color: LC.text60 }}>
                  Encriptada en reposo. Revoca el acceso en cualquier momento desde esta pantalla.
                </p>
              </div>
            ) : (
              <div style={{ background: LC.bg2, border: `1px solid ${LC.border}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 32, height: 32, background: integ.color, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{integ.name[0]}</span>
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: LC.text }}>Autenticación OAuth 2.0</p>
                  <p style={{ fontSize: 11, color: LC.text60, marginTop: 2 }}>
                    Se abrirá una ventana segura de {integ.name} para autorizar el acceso.
                  </p>
                </div>
              </div>
            )}

            {/* CTA */}
            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <button
                onClick={() => setStep('done')}
                style={{ height: 42, flex: 1, fontSize: 14, fontWeight: 700, background: LC.accent, color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                {integ.auth === 'oauth' ? `Conectar con ${integ.name}` : 'Guardar y conectar'}
              </button>
              <button
                onClick={onClose}
                style={{ height: 42, padding: '0 20px', fontSize: 14, fontWeight: 600, background: 'transparent', color: LC.text60, border: `1px solid ${LC.border}`, cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          /* Success state */
          <div style={{ padding: '40px 32px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#15803d', fontSize: 26, fontWeight: 700 }}>✓</span>
            </div>
            <p style={{ fontSize: 18, fontWeight: 800, color: LC.text }}>{integ.name} conectado</p>
            <p style={{ fontSize: 13, color: LC.text60, lineHeight: '1.7', maxWidth: 340 }}>
              La integración está activa. Los datos se sincronizarán automáticamente en los próximos minutos.
            </p>
            <button
              onClick={onClose}
              style={{ marginTop: 8, height: 42, padding: '0 32px', fontSize: 14, fontWeight: 700, background: LC.text, color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── AppLogoImg — Clearbit logo with colored-letter fallback ───────────────────
function AppLogoImg({ domain, name, color, size = 36 }: { domain: string; name: string; color: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div style={{ width: size, height: size, borderRadius: 6, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.55) }}>{name[0]}</span>
      </div>
    );
  }
  return (
    <img
      src={`https://logo.clearbit.com/${domain}`}
      alt={name}
      style={{ width: size, height: size, objectFit: 'contain' }}
      onError={() => setFailed(true)}
    />
  );
}

function AppStoreView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [search, setSearch]           = useState('');
  const [category, setCategory]       = useState('Todas');
  const [connecting, setConnecting]   = useState<typeof STORE_INTEGRATIONS[0] | null>(null);
  const [connected, setConnected]     = useState<Set<string>>(
    () => new Set(STORE_INTEGRATIONS.filter(i => i.connected).map(i => i.id))
  );

  const filtered = STORE_INTEGRATIONS.filter(i => {
    const matchCat = category === 'Todas' || i.category === category;
    const matchQ   = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.desc.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  const handleClose = (connected_?: boolean) => {
    if (connecting && connected_) {
      setConnected(prev => new Set([...prev, connecting.id]));
    }
    setConnecting(null);
  };

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />

        {/* Main panel */}
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <div>
              <h1 className="text-[20px] font-bold text-[#1a1a1a]">Integraciones</h1>
              <p className="text-[13px] text-[#646462] mt-0.5">Conecta Clain con las herramientas que ya usas</p>
            </div>
            <div className="relative">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462] absolute left-2.5 top-1/2 -translate-y-1/2" strokeWidth="1.5">
                <circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/>
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar integración..."
                className="border border-[#e9eae6] rounded-full pl-8 pr-3 py-[6px] text-[13px] w-52 focus:outline-none focus:border-[#0007cb]"
              />
            </div>
          </div>

          {/* Category pills + stats */}
          <div className="px-6 pt-4 pb-3 border-b border-[#e9eae6] flex-shrink-0">
            <div className="flex gap-2 flex-wrap mb-3">
              {STORE_CATS.map(cat => (
                <button key={cat} onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 text-[12px] font-semibold border transition-colors ${
                    category === cat
                      ? 'bg-[#111] text-white border-[#111]'
                      : 'bg-white text-[#646462] border-[#e9eae6] hover:border-[#111] hover:text-[#111]'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[12px] text-[#646462]">{filtered.length} integraciones</span>
              <span className="text-[12px] font-semibold" style={{ color: '#15803d' }}>
                ● {filtered.filter(i => connected.has(i.id)).length} conectadas
              </span>
            </div>
          </div>

          {/* Integration grid */}
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            <div className="grid grid-cols-3 gap-4 xl:grid-cols-4">
              {filtered.map(integ => {
                const isConn = connected.has(integ.id);
                return (
                  <div key={integ.id}
                    className="bg-white border border-[#e9eae6] p-5 flex flex-col gap-3 hover:border-[#c8c9c4] hover:shadow-sm transition-all cursor-pointer"
                  >
                    {/* Logo row */}
                    <div className="flex items-start justify-between">
                      <div className="w-12 h-12 rounded-[8px] border border-[#f0f0ee] flex items-center justify-center bg-[#fafaf9] overflow-hidden flex-shrink-0">
                        <AppLogoImg domain={integ.domain} name={integ.name} color={integ.color} size={34} />
                      </div>
                      {isConn && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#166534' }}>
                          CONECTADO
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div>
                      <p className="text-[14px] font-semibold text-[#1a1a1a] mb-1">{integ.name}</p>
                      <p className="text-[12px] text-[#646462] leading-[1.55] line-clamp-2">{integ.desc}</p>
                    </div>

                    {/* CTA */}
                    <div className="mt-auto pt-1">
                      <button
                        onClick={() => setConnecting(integ)}
                        className={`w-full h-[34px] text-[12px] font-semibold border transition-colors ${
                          isConn
                            ? 'border-[#e9eae6] text-[#646462] hover:border-[#111] hover:text-[#111]'
                            : 'bg-[#0007cb] border-[#0007cb] text-white hover:bg-[#0005a0]'
                        }`}
                      >
                        {isConn ? 'Configurar' : 'Conectar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {connecting && (
        <ConnectModal
          integ={connecting}
          onClose={() => handleClose(true)}
        />
      )}
    </div>
  );
}

"""

src = src[:start5] + NEW_APPSTORE + src[end5:]

# ── 6. Remove the standalone IntegrationsView + INTEGRATIONS const ────────────
OLD_INTEG_START = "// ── IntegrationsView ──────────────────────────────────────────────────────────"
OLD_INTEG_END   = "\n\n// ─── DeveloperView ───────────────────────────────────────────────────────────"

start6 = src.index(OLD_INTEG_START)
end6   = src.index(OLD_INTEG_END)

src = src[:start6] + src[end6:]

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK: integrations back in Settings, Clearbit logos, ConnectModal with LC tokens")
print(f"File size: {len(src)} chars")
