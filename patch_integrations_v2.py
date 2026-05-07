PATH = r"C:\Users\usuario\OneDrive - Universidad Politécnica de Cartagena\Documentos\Claude\CRM-AI\src\prototype\Prototype.tsx"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

# Find and replace the full IntegrationsView function
OLD_START = "// ── IntegrationsView ──────────────────────────────────────────────────────────\n"
OLD_END   = "\n// ─── DeveloperView ───────────────────────────────────────────────────────────"

start = src.index(OLD_START)
end   = src.index(OLD_END)

NEW_VIEW = """// ── IntegrationsView ──────────────────────────────────────────────────────────

const INTEGRATIONS = [
  // ── CRM & Soporte ──────────────────────────────────────────────────────────
  { id: 'salesforce',   name: 'Salesforce',        category: 'CRM',          desc: 'Sincroniza contactos, oportunidades y casos con Salesforce CRM.',          logo: 'https://logo.clearbit.com/salesforce.com',    connected: false },
  { id: 'hubspot',      name: 'HubSpot',            category: 'CRM',          desc: 'Sincroniza contactos y deals de HubSpot con tu bandeja de entrada.',       logo: 'https://logo.clearbit.com/hubspot.com',        connected: true  },
  { id: 'zendesk',      name: 'Zendesk',            category: 'Soporte',      desc: 'Importa tickets de Zendesk y gestiona todo desde Clain.',                  logo: 'https://logo.clearbit.com/zendesk.com',        connected: false },
  { id: 'freshdesk',    name: 'Freshdesk',          category: 'Soporte',      desc: 'Centraliza tus tickets de Freshdesk en la bandeja de Clain.',              logo: 'https://logo.clearbit.com/freshdesk.com',      connected: false },
  // ── Canales ────────────────────────────────────────────────────────────────
  { id: 'whatsapp',     name: 'WhatsApp Business',  category: 'Canales',      desc: 'Recibe y responde mensajes de WhatsApp directamente desde el inbox.',       logo: 'https://logo.clearbit.com/whatsapp.com',       connected: true  },
  { id: 'instagram',    name: 'Instagram',          category: 'Canales',      desc: 'Gestiona mensajes directos de Instagram desde tu bandeja de entrada.',      logo: 'https://logo.clearbit.com/instagram.com',      connected: true  },
  { id: 'slack',        name: 'Slack',              category: 'Canales',      desc: 'Notificaciones de conversaciones y escalados directamente en Slack.',       logo: 'https://logo.clearbit.com/slack.com',          connected: true  },
  { id: 'sms',          name: 'SMS / Twilio',        category: 'Canales',      desc: 'Envía y recibe SMS a través de Twilio integrado en el workspace.',          logo: 'https://logo.clearbit.com/twilio.com',         connected: false },
  // ── Pagos & Comercio ───────────────────────────────────────────────────────
  { id: 'stripe',       name: 'Stripe',             category: 'Pagos',        desc: 'Consulta suscripciones, pagos y facturas de clientes desde cada caso.',     logo: 'https://logo.clearbit.com/stripe.com',         connected: true  },
  { id: 'shopify',      name: 'Shopify',            category: 'Comercio',     desc: 'Accede a pedidos, productos y clientes de Shopify en las conversaciones.',   logo: 'https://logo.clearbit.com/shopify.com',        connected: false },
  // ── Productividad ──────────────────────────────────────────────────────────
  { id: 'jira',         name: 'Jira',               category: 'Productividad', desc: 'Crea issues de Jira desde conversaciones y sincroniza el estado.',         logo: 'https://logo.clearbit.com/atlassian.com',      connected: false },
  { id: 'linear',       name: 'Linear',             category: 'Productividad', desc: 'Crea y enlaza issues de Linear directamente desde el inbox de soporte.',   logo: 'https://logo.clearbit.com/linear.app',         connected: true  },
  { id: 'notion',       name: 'Notion',             category: 'Productividad', desc: 'Guarda notas de conversaciones y crea páginas de Notion al instante.',     logo: 'https://logo.clearbit.com/notion.so',          connected: false },
  { id: 'github',       name: 'GitHub',             category: 'Productividad', desc: 'Vincula issues de GitHub a conversaciones para seguimiento de bugs.',       logo: 'https://logo.clearbit.com/github.com',         connected: false },
  // ── Analítica ──────────────────────────────────────────────────────────────
  { id: 'ga',           name: 'Google Analytics',  category: 'Analítica',     desc: 'Mide el impacto del widget de chat en las conversiones de tu web.',         logo: 'https://logo.clearbit.com/google.com',         connected: false },
  { id: 'delighted',    name: 'Delighted',          category: 'Analítica',     desc: 'Dispara encuestas CSAT y NPS basadas en eventos de conversación.',          logo: 'https://logo.clearbit.com/delighted.com',      connected: false },
  // ── IA & Automatización ────────────────────────────────────────────────────
  { id: 'openai',       name: 'OpenAI',             category: 'IA',           desc: 'Conecta GPT-4o para respuestas generativas y análisis de conversaciones.',   logo: 'https://logo.clearbit.com/openai.com',         connected: true  },
  { id: 'anthropic',    name: 'Anthropic',          category: 'IA',           desc: 'Usa Claude como modelo base para el agente AI de tu workspace.',             logo: 'https://logo.clearbit.com/anthropic.com',      connected: true  },
  { id: 'zapier',       name: 'Zapier',             category: 'IA',           desc: 'Conecta Clain con miles de apps a través de Zaps automatizados.',            logo: 'https://logo.clearbit.com/zapier.com',         connected: false },
];

const INTEG_CATEGORIES = ['Todas', 'CRM', 'Canales', 'Pagos', 'Comercio', 'Productividad', 'Analítica', 'IA'];

function IntegrationsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'apps' | 'connectors' | 'developer'>('apps');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [devTab, setDevTab] = useState<'keys' | 'webhooks'>('keys');
  const [webhooks, setWebhooks] = useState([
    { id: 1, url: 'https://mi-app.com/webhook/clain', events: ['conversation.created', 'conversation.closed'], active: true },
  ]);
  const [addUrl, setAddUrl] = useState('');
  const { data: connectors } = useApi(() => connectorsApi.list(), [], []);

  const filtered = INTEGRATIONS.filter(i => {
    const matchCat = category === 'Todas' || i.category === category;
    const matchQ   = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.desc.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  const API_REFERENCE = [
    { method: 'GET',    path: '/me',             desc: 'Devuelve el app de la API key' },
    { method: 'GET',    path: '/contacts',        desc: 'Lista contactos' },
    { method: 'POST',   path: '/contacts',        desc: 'Crea un contacto' },
    { method: 'GET',    path: '/conversations',   desc: 'Lista conversaciones' },
    { method: 'POST',   path: '/conversations',   desc: 'Crea una conversación' },
    { method: 'GET',    path: '/admins',          desc: 'Lista administradores' },
    { method: 'POST',   path: '/messages',        desc: 'Envía un mensaje' },
    { method: 'GET',    path: '/tags',            desc: 'Lista etiquetas' },
    { method: 'DELETE', path: '/contacts/:id',    desc: 'Elimina un contacto' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden" style={{ background: '#f5f5f3' }}>
      <TrialBanner />

      {/* Header */}
      <div className="bg-white border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <div>
            <h1 className="text-[22px] font-bold text-[#1a1a1a]">Integraciones</h1>
            <p className="text-[13px] text-[#646462] mt-0.5">Conecta Clain con las herramientas que ya usas</p>
          </div>
          {tab === 'apps' && (
            <div className="relative">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462] absolute left-2.5 top-1/2 -translate-y-1/2" strokeWidth="1.5"><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar integración..." className="border border-[#e9eae6] rounded-full pl-8 pr-3 py-[6px] text-[13px] w-52 focus:outline-none focus:border-[#3b59f6]" />
            </div>
          )}
          {tab === 'connectors' && (
            <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nuevo conector</button>
          )}
          {tab === 'developer' && (
            <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nueva API key</button>
          )}
        </div>
        <div className="flex gap-0 px-6 mt-4">
          {([['apps', 'Aplicaciones'], ['connectors', 'Conectores de datos'], ['developer', 'Desarrolladores']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${tab === id ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Aplicaciones ─────────────────────────────────────────────────── */}
      {tab === 'apps' && (
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
          {/* Category pills */}
          <div className="flex gap-2 flex-wrap mb-6">
            {INTEG_CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-full border transition-colors ${category === cat ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-[#646462] border-[#e9eae6] hover:border-[#1a1a1a] hover:text-[#1a1a1a]'}`}>
                {cat}
              </button>
            ))}
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 mb-6">
            <span className="text-[12px] text-[#646462]">{filtered.length} integraciones</span>
            <span className="text-[12px] text-[#22c55e] font-medium">● {filtered.filter(i => i.connected).length} conectadas</span>
          </div>

          {/* Integrations grid */}
          <div className="grid grid-cols-4 gap-4">
            {filtered.map(integ => (
              <div key={integ.id} className="bg-white border border-[#e9eae6] rounded-[12px] p-5 flex flex-col gap-3 hover:border-[#c8c9c4] hover:shadow-sm transition-all cursor-pointer group">
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-[10px] border border-[#f0f0ee] flex items-center justify-center bg-white overflow-hidden flex-shrink-0">
                    <img
                      src={integ.logo}
                      alt={integ.name}
                      className="w-9 h-9 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).parentElement!.innerHTML = `<span style="font-size:22px">${integ.name[0]}</span>`;
                      }}
                    />
                  </div>
                  {integ.connected && (
                    <span className="text-[10px] font-semibold text-[#15803d] bg-[#dcfce7] px-2 py-0.5 rounded-full">Conectado</span>
                  )}
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[#1a1a1a] mb-1">{integ.name}</p>
                  <p className="text-[12px] text-[#646462] leading-[1.5] line-clamp-2">{integ.desc}</p>
                </div>
                <div className="mt-auto pt-1">
                  <button className={`w-full h-8 text-[12px] font-semibold rounded-[6px] border transition-colors ${integ.connected ? 'border-[#e9eae6] text-[#646462] hover:border-[#1a1a1a] hover:text-[#1a1a1a]' : 'border-[#1a1a1a] text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white'}`}>
                    {integ.connected ? 'Configurar' : 'Conectar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Conectores ───────────────────────────────────────────────────── */}
      {tab === 'connectors' && (
        <div className="flex-1 overflow-y-auto min-h-0 px-8 py-8">
          <div className="max-w-[860px] mx-auto">
            <p className="text-[14px] text-[#646462] mb-8 max-w-[580px]">Conéctate a cualquier sistema externo o API personalizada sin código. Impulsa el AI Agent con datos en tiempo real.</p>
            {(connectors as any[]).length > 0 ? (
              <>
                <h2 className="text-[15px] font-bold text-[#1a1a1a] mb-4">Tus conectores ({(connectors as any[]).length})</h2>
                <div className="flex flex-col gap-3 mb-10">
                  {(connectors as any[]).map((c: any) => (
                    <div key={c.id} className="border border-[#e9eae6] rounded-[12px] px-5 py-4 flex items-center gap-4 bg-white hover:bg-[#fafaf9]">
                      <div className="w-10 h-10 rounded-[10px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0 text-[18px]">{c.icon ?? '🔌'}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-[#1a1a1a]">{c.name ?? c.label ?? c.id}</p>
                        <p className="text-[12px] text-[#646462] truncate">{c.description ?? c.type ?? ''}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${c.status === 'active' || c.isActive ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#f3f3f1] text-[#646462]'}`}>
                        {c.status === 'active' || c.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-4">Plantillas de conector</p>
            <div className="grid grid-cols-3 gap-4">
              {CONNECTOR_CARDS.map(card => (
                <button key={card.label} className="bg-white border border-[#e9eae6] rounded-[12px] p-[17px] flex flex-col items-start justify-between gap-[40px] text-left hover:border-[#c8c9c4] hover:shadow-sm transition-all min-h-[140px]">
                  <div className="w-11 h-11 rounded-[12px] flex items-center justify-center" style={{ background: card.bg }}>
                    <img src={card.svg} alt="" className="w-6 h-6 object-contain" />
                  </div>
                  <p className="text-[14px] font-semibold text-[#1a1a1a] leading-[20px] whitespace-pre-line">{card.label}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Desarrolladores ──────────────────────────────────────────────── */}
      {tab === 'developer' && (
        <div className="flex-1 overflow-y-auto min-h-0 px-8 py-8">
          <div className="max-w-[760px] mx-auto flex flex-col gap-6">
            <p className="text-[13.5px] text-[#646462]">API keys y webhooks para integraciones personalizadas con tu stack.</p>
            <div className="flex gap-1 border-b border-[#e9eae6]">
              {(['keys', 'webhooks'] as const).map(t => (
                <button key={t} onClick={() => setDevTab(t)}
                  className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${devTab === t ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'}`}>
                  {t === 'keys' ? 'Claves de API' : 'Webhooks'}
                </button>
              ))}
            </div>
            {devTab === 'keys' && (
              <div className="bg-white border border-[#e9eae6] rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-[#f8f8f7] border-b border-[#e9eae6]">
                  <p className="text-[12px] font-semibold text-[#646462] uppercase tracking-wide">Referencia de la API REST</p>
                </div>
                <table className="w-full text-[13px]">
                  <thead className="bg-[#f8f8f7]">
                    <tr>{['Método', 'Endpoint', 'Descripción'].map(h => <th key={h} className="text-left px-4 py-2.5 font-semibold text-[#646462] border-b border-[#e9eae6]">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-[#e9eae6]">
                    {API_REFERENCE.map(r => (
                      <tr key={r.path} className="hover:bg-[#f8f8f7]">
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${r.method === 'GET' ? 'bg-[#dbeafe] text-[#1d4ed8]' : r.method === 'POST' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#fee2e2] text-[#b91c1c]'}`}>{r.method}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[12px] text-[#646462]">{r.path}</td>
                        <td className="px-4 py-2.5 text-[#1a1a1a]">{r.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {devTab === 'webhooks' && (
              <div className="flex flex-col gap-4">
                <div className="bg-white border border-[#e9eae6] rounded-xl divide-y divide-[#e9eae6]">
                  {webhooks.map(wh => (
                    <div key={wh.id} className="px-5 py-4 flex items-start gap-3">
                      <div className="flex-1">
                        <p className="text-[13px] font-medium text-[#1a1a1a] font-mono">{wh.url}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {wh.events.map(ev => <span key={ev} className="px-2 py-0.5 bg-[#f1f1ee] rounded-full text-[11px] text-[#646462]">{ev}</span>)}
                        </div>
                      </div>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${wh.active ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#f1f1ee] text-[#646462]'}`}>{wh.active ? 'Activo' : 'Inactivo'}</span>
                      <button onClick={() => setWebhooks(ws => ws.filter(w => w.id !== wh.id))} className="text-[12px] text-[#b91c1c] hover:underline flex-shrink-0">Eliminar</button>
                    </div>
                  ))}
                  {webhooks.length === 0 && <div className="px-5 py-8 text-center text-[13px] text-[#a4a4a2]">Sin webhooks configurados</div>}
                </div>
                <div className="flex gap-2">
                  <input className="flex-1 border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] focus:outline-none" placeholder="https://tu-app.com/webhook" value={addUrl} onChange={e => setAddUrl(e.target.value)} />
                  <button
                    onClick={() => { if (addUrl.trim()) { setWebhooks(ws => [...ws, { id: Date.now(), url: addUrl.trim(), events: ['conversation.created'], active: true }]); setAddUrl(''); } }}
                    className="px-4 py-2 bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333]">
                    Añadir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"""

src = src[:start] + NEW_VIEW + src[end:]

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK: IntegrationsView v2 — no sidebar, real logos grid")
print(f"File size: {len(src)} chars")
