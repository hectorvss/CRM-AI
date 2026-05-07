PATH = r"C:\Users\usuario\OneDrive - Universidad Politécnica de Cartagena\Documentos\Claude\CRM-AI\src\prototype\Prototype.tsx"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

# ── 1. Add 'integrations' to View type ───────────────────────────────────────
src = src.replace(
    "| 'helpCenter' | 'featuresComparison';",
    "| 'helpCenter' | 'featuresComparison' | 'integrations';"
)

# ── 2. Add isIntegrations to the nav (after isSettings definition) ────────────
src = src.replace(
    "  const isSettings = view === 'settings' ||",
    "  const isIntegrations = view === 'integrations';\n  const isSettings = view === 'settings' ||"
)

# Remove 'appStore' | 'connectors' | 'auth' | 'developer' from isSettings so they go to integrations
# (keep them available but route them through integrations tab)
# Actually let's keep them in isSettings for backwards compat but add 'integrations' as a separate active state

# ── 3. Add Integraciones nav button after Contactos ───────────────────────────
src = src.replace(
    """          {/* Contactos — inline SVG of two person silhouettes (proper contacts icon) */}
          <NavBtnSvg nav="contacts" label="Contactos">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="6" cy="5" r="2.5"/><path d="M1.8 12.5c.4-2 2.1-3.2 4.2-3.2s3.8 1.2 4.2 3.2v.5H1.8v-.5z"/><circle cx="11.5" cy="6" r="2"/><path d="M9.5 9.4c.6-.2 1.3-.3 2-.3 1.7 0 3 .9 3.4 2.5v.4H10.6c-.1-.9-.4-1.8-1.1-2.6z"/></svg>
          </NavBtnSvg>""",
    """          {/* Contactos — inline SVG of two person silhouettes (proper contacts icon) */}
          <NavBtnSvg nav="contacts" label="Contactos">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="6" cy="5" r="2.5"/><path d="M1.8 12.5c.4-2 2.1-3.2 4.2-3.2s3.8 1.2 4.2 3.2v.5H1.8v-.5z"/><circle cx="11.5" cy="6" r="2"/><path d="M9.5 9.4c.6-.2 1.3-.3 2-.3 1.7 0 3 .9 3.4 2.5v.4H10.6c-.1-.9-.4-1.8-1.1-2.6z"/></svg>
          </NavBtnSvg>
          {/* Integraciones — puzzle piece icon */}
          <NavBtnSvg nav="integrations" label="Integraciones">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2h4v2a1 1 0 0 0 1 1h2v4h-2a1 1 0 0 0-1 1v2H6v-2a1 1 0 0 0-1-1H3V6h2a1 1 0 0 0 1-1V2z"/>
            </svg>
          </NavBtnSvg>"""
)

# ── 4. Add IntegrationsView before DeveloperView ──────────────────────────────
NEW_VIEW = r"""
// ── IntegrationsView ──────────────────────────────────────────────────────────

function IntegrationsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'appstore' | 'connectors' | 'developer'>('appstore');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todas las colecciones');
  const [devTab, setDevTab] = useState<'keys' | 'webhooks'>('keys');
  const [webhooks, setWebhooks] = useState([
    { id: 1, url: 'https://mi-app.com/webhook/clain', events: ['conversation.created', 'conversation.closed'], active: true },
  ]);
  const [addUrl, setAddUrl] = useState('');
  const { data: connectors } = useApi(() => connectorsApi.list(), [], []);

  const TABS = [
    { id: 'appstore' as const,   label: 'App Store' },
    { id: 'connectors' as const, label: 'Conectores de datos' },
    { id: 'developer' as const,  label: 'Desarrolladores' },
  ];

  const APP_CATEGORIES = ['Todas las colecciones', 'Popular', 'Nuevo', 'Gratis', 'Para soporte'];
  const APP_WORKS_WITH = ['Outbound', 'Help Desk', 'Automatizaciones', 'Messenger'];
  const APP_CATS_FULL = ['Analytics', 'Automatización', 'CRM', 'Datos & Enriquecimiento', 'Para equipos de marketing', 'Para equipos de ventas', 'Para soporte', 'Issue tracking', 'Captación de leads', 'Encuestas'];

  const API_REFERENCE = [
    { method: 'GET',    path: '/me',                desc: 'Devuelve el app de la API key' },
    { method: 'GET',    path: '/contacts',          desc: 'Lista contactos' },
    { method: 'POST',   path: '/contacts',          desc: 'Crea un contacto' },
    { method: 'GET',    path: '/conversations',     desc: 'Lista conversaciones' },
    { method: 'POST',   path: '/conversations',     desc: 'Crea una conversación' },
    { method: 'GET',    path: '/admins',            desc: 'Lista administradores' },
    { method: 'POST',   path: '/messages',          desc: 'Envía un mensaje' },
    { method: 'GET',    path: '/tags',              desc: 'Lista etiquetas' },
    { method: 'DELETE', path: '/contacts/:id',      desc: 'Elimina un contacto' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden" style={{ background: '#f5f5f3' }}>
      <TrialBanner />
      {/* Page header */}
      <div className="bg-white border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <h1 className="text-[22px] font-bold text-[#1a1a1a]">Integraciones</h1>
          {tab === 'appstore' && (
            <div className="relative">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462] absolute left-2.5 top-1/2 -translate-y-1/2" strokeWidth="1.5"><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar apps..." className="border border-[#e9eae6] rounded-full pl-8 pr-3 py-[6px] text-[13px] w-52 focus:outline-none focus:border-[#3b59f6]" />
            </div>
          )}
          {tab === 'connectors' && (
            <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nuevo conector</button>
          )}
          {tab === 'developer' && (
            <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nueva API key</button>
          )}
        </div>
        {/* Tabs */}
        <div className="flex gap-0 px-6 mt-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${tab === t.id ? 'border-[#1a1a1a] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: App Store ─────────────────────────────────────────────────── */}
      {tab === 'appstore' && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left sidebar */}
          <div className="w-[200px] flex-shrink-0 border-r border-[#e9eae6] bg-white flex flex-col overflow-y-auto">
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Gestionar</p>
              <button className="w-full text-left px-2 py-1.5 text-[13px] text-[#1a1a1a] hover:bg-[#f3f3f1] rounded-[6px]">Tus apps instaladas</button>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Destacadas</p>
              {APP_CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`w-full text-left px-2 py-1.5 text-[13px] rounded-[6px] ${activeCategory === cat ? 'bg-[#f3f3f1] font-medium text-[#1a1a1a]' : 'text-[#1a1a1a] hover:bg-[#f3f3f1]'}`}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Compatible con</p>
              {APP_WORKS_WITH.map(item => <button key={item} className="w-full text-left px-2 py-1.5 text-[13px] text-[#1a1a1a] hover:bg-[#f3f3f1] rounded-[6px]">{item}</button>)}
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Categorías</p>
              {APP_CATS_FULL.map(item => <button key={item} className="w-full text-left px-2 py-1.5 text-[12px] text-[#646462] hover:text-[#1a1a1a] hover:bg-[#f3f3f1] rounded-[6px]">{item}</button>)}
            </div>
          </div>
          {/* Main content */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8">
            {/* Hero banners */}
            <div className="grid grid-cols-2 gap-4">
              <div className="relative h-[220px] rounded-[16px] overflow-hidden bg-[#f0f1ef] flex flex-col items-start justify-between p-8">
                <p className="text-[28px] font-bold leading-tight text-black">Creado por Clain</p>
                <span className="border border-black rounded-[6px] px-4 py-2 text-[13px] text-black bg-white/40">Ver colección →</span>
              </div>
              <div className="relative h-[220px] rounded-[16px] overflow-hidden bg-[#1a1a1a] flex flex-col items-start justify-between p-8">
                <p className="text-[28px] font-bold leading-tight text-white">Programa reuniones<br/>fácilmente</p>
                <span className="border border-white rounded-[6px] px-4 py-2 text-[13px] text-white bg-white/10">Ver colección →</span>
              </div>
            </div>
            {/* Popular */}
            <div>
              <p className="text-[13px] font-semibold text-[#646462] uppercase tracking-wider mb-3">Popular</p>
              <div className="grid grid-cols-4 gap-3">
                {APP_STORE_POPULAR.map(app => <AppCard key={app.name} {...app} />)}
              </div>
            </div>
            {/* New & noteworthy */}
            <div>
              <p className="text-[13px] font-semibold text-[#646462] uppercase tracking-wider mb-3">Nuevo y destacado</p>
              <div className="grid grid-cols-4 gap-3">
                {APP_STORE_NEW.map(app => <AppCard key={app.name + 'new'} {...app} />)}
              </div>
            </div>
            {/* Free */}
            <div>
              <p className="text-[13px] font-semibold text-[#646462] uppercase tracking-wider mb-3">Gratis</p>
              <div className="grid grid-cols-4 gap-3">
                {APP_STORE_FREE.map(app => <AppCard key={app.name + 'free'} {...app} />)}
              </div>
            </div>
            {/* For support */}
            <div>
              <p className="text-[13px] font-semibold text-[#646462] uppercase tracking-wider mb-3">Para equipos de soporte</p>
              <div className="grid grid-cols-4 gap-3">
                {APP_STORE_SUPPORT.map(app => <AppCard key={app.name + 'sup'} {...app} />)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Conectores ────────────────────────────────────────────────── */}
      {tab === 'connectors' && (
        <div className="flex-1 overflow-y-auto min-h-0 px-12 py-10">
          <div className="max-w-[860px] mx-auto">
            <p className="text-[14px] text-[#646462] mb-8 max-w-[600px]">Conéctate a cualquier sistema externo o API personalizada sin código. Impulsa el AI Agent con datos en tiempo real para ofrecer soporte más personalizado.</p>
            {(connectors as any[]).length > 0 ? (
              <>
                <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-4">Tus conectores ({(connectors as any[]).length})</h2>
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
            ) : (
              <>
                <h2 className="text-[24px] font-bold text-[#1a1a1a] mb-2">Conecta tus datos en tiempo real</h2>
                <p className="text-[13px] text-[#646462] mb-8">Sin ningún conector activo aún. Empieza conectando Stripe, Linear, Shopify u otro sistema.</p>
              </>
            )}
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-4">Plantillas de conector</p>
            <div className="grid grid-cols-3 gap-4">
              {CONNECTOR_CARDS.map(card => (
                <button key={card.label} className="bg-white border border-[#e9eae6] rounded-[12px] p-[17px] flex flex-col items-start justify-between gap-[40px] text-left hover:border-[#c8c9c4] hover:shadow-sm transition-all min-h-[140px]">
                  <div className="w-11 h-11 rounded-[12px] flex items-center justify-center" style={{ background: card.bg }}>
                    <img src={card.svg} alt="" className="w-4 h-4" />
                  </div>
                  <p className="text-[14px] font-semibold text-[#1a1a1a] leading-[20px] whitespace-pre-line">{card.label}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Desarrolladores ───────────────────────────────────────────── */}
      {tab === 'developer' && (
        <div className="flex-1 overflow-y-auto min-h-0 px-12 py-10">
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
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${wh.active ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#f1f1ee] text-[#646462]'}`}>{wh.active ? 'Activo' : 'Inactivo'}</span>
                      <button onClick={() => setWebhooks(ws => ws.filter(w => w.id !== wh.id))} className="text-[12px] text-[#b91c1c] hover:underline">Eliminar</button>
                    </div>
                  ))}
                  {webhooks.length === 0 && <div className="px-5 py-8 text-center text-[13px] text-[#a4a4a2]">Sin webhooks configurados</div>}
                </div>
                <div className="flex gap-2">
                  <input className="flex-1 border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] focus:outline-none" placeholder="https://tu-app.com/webhook" value={addUrl} onChange={e => setAddUrl(e.target.value)} />
                  <button
                    onClick={() => { if (addUrl.trim()) { setWebhooks(ws => [...ws, { id: Date.now(), url: addUrl.trim(), events: ['conversation.created'], active: true }]); setAddUrl(''); }}}
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

src = src.replace(
    "// ─── DeveloperView ───────────────────────────────────────────────────────────",
    NEW_VIEW + "// ─── DeveloperView ───────────────────────────────────────────────────────────"
)

# ── 5. Add 'integrations' to renderView switch ────────────────────────────────
src = src.replace(
    "      case 'appStore':       return <AppStoreView view={view} onNavigate={setView} />;",
    "      case 'integrations':   return <IntegrationsView view={view} onNavigate={setView} />;\n      case 'appStore':       return <AppStoreView view={view} onNavigate={setView} />;"
)

# ── 6. Add 'integrations' to the isSettings check (so it's NOT treated as settings) ─
# It's already NOT in isSettings, so no change needed — the nav button will highlight correctly
# via NavBtnSvg which uses view === nav for active state check

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK: IntegrationsView created + nav button added")
print(f"File size: {len(src)} chars")
