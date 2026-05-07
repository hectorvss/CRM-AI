"""
patch_integrations_ui.py
Redesign ConnectModal + AppLogoImg + card grid to match Fin AI Agent UI:
  · rounded-[12px] cards, rounded-full buttons, soft shadows
  · Logo fallback chain: Figma MCP asset → Clearbit → Google S2 favicon → colored letter
  · Modal uses Tailwind + same rounded language as FinRoleCard
"""

PATH = r"C:\Users\usuario\OneDrive - Universidad Politécnica de Cartagena\Documentos\Claude\CRM-AI\src\prototype\Prototype.tsx"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

OLD_MODAL_START = "// ── Connect Modal (LC design tokens) ─────────────────────────────────────────"
OLD_MODAL_END   = "// ── ConnectorsView ────────────────────────────────────────────────────────────"

start = src.index(OLD_MODAL_START)
end   = src.index(OLD_MODAL_END)

NEW_MODAL_BLOCK = r"""// ── Logo sources: Figma MCP primary, Clearbit + Google S2 as fallbacks ─────────
const INTEG_LOGO_OVERRIDES: Record<string, string> = {
  salesforce:  IMG_APP_SALESFORCE,
  instagram:   IMG_APP_INSTAGRAM,
  ga:          IMG_APP_GA,
  jira:        IMG_APP_JIRA,
  whatsapp:    IMG_APP_WHATSAPP,
  delighted:   IMG_APP_DELIGHTED,
  stripe:      IMG_APP_STRIPE,
};

// Three-level logo with graceful degradation
function AppLogoImg({ id, domain, name, color, size = 36 }: {
  id: string; domain: string; name: string; color: string; size?: number;
}) {
  // source index: 0 = Figma MCP, 1 = Clearbit, 2 = Google S2 favicon, 3 = letter fallback
  const sources = [
    INTEG_LOGO_OVERRIDES[id] ?? null,
    `https://logo.clearbit.com/${domain}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ].filter(Boolean) as string[];

  const [idx, setIdx] = useState(0);

  if (idx >= sources.length) {
    return (
      <div style={{
        width: size, height: size,
        borderRadius: Math.round(size * 0.22),
        background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: Math.round(size * 0.5) }}>{name[0]}</span>
      </div>
    );
  }
  return (
    <img
      key={sources[idx]}
      src={sources[idx]}
      alt={name}
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: Math.round(size * 0.15) }}
      onError={() => setIdx(i => i + 1)}
    />
  );
}

// ── Connect Modal — Fin AI Agent design language ──────────────────────────────
function ConnectModal({ integ, onClose, onConnected }: {
  integ: typeof STORE_INTEGRATIONS[0];
  onClose: () => void;
  onConnected: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [step, setStep]     = useState<'form' | 'done'>('form');
  const isOAuth = integ.auth === 'oauth';

  const handleConnect = () => {
    setStep('done');
    onConnected();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[20px] shadow-2xl overflow-hidden"
        style={{ width: 480 }}
        onClick={e => e.stopPropagation()}
      >
        {step === 'form' ? (
          <>
            {/* Header */}
            <div className="flex items-center gap-4 px-7 pt-6 pb-5 border-b border-[#e9eae6]">
              <div className="w-[52px] h-[52px] rounded-[14px] bg-[#f3f3f1] border border-[#e9eae6] flex items-center justify-center overflow-hidden flex-shrink-0">
                <AppLogoImg id={integ.id} domain={integ.domain} name={integ.name} color={integ.color} size={36} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[18px] font-bold text-[#1a1a1a] leading-tight">{integ.name}</p>
                <p className="text-[12px] text-[#646462] mt-0.5">{integ.category}</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[#f3f3f1] hover:bg-[#e9e9e7] flex items-center justify-center flex-shrink-0 transition-colors"
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]">
                  <path d="M3 3l10 10M13 3L3 13" stroke="#646462" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                </svg>
              </button>
            </div>

            <div className="px-7 py-5 flex flex-col gap-5">
              {/* Description */}
              <p className="text-[13.5px] text-[#646462] leading-[1.65]">{integ.desc}</p>

              {/* Permissions */}
              <div className="bg-[#f8f8f7] rounded-[12px] p-4">
                <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-3">Permisos solicitados</p>
                <div className="flex flex-col gap-2">
                  {[
                    isOAuth ? 'Leer y escribir datos de contactos' : 'Acceso de lectura a tus datos',
                    'Ver conversaciones y tickets asociados',
                    'Sincronización automática en tiempo real',
                  ].map(p => (
                    <div key={p} className="flex items-center gap-2.5">
                      <div className="w-4 h-4 rounded-full bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 10 10" className="w-2.5 h-2.5"><path d="M2 5l2 2 4-4" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                      </div>
                      <span className="text-[13px] text-[#1a1a1a]">{p}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Auth method */}
              {isOAuth ? (
                <div className="flex items-center gap-3 bg-[#f8f8f7] rounded-[12px] px-4 py-3.5">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-[14px]"
                    style={{ background: integ.color }}
                  >
                    {integ.name[0]}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#1a1a1a]">Autenticación OAuth 2.0</p>
                    <p className="text-[12px] text-[#646462] mt-0.5">Se abrirá una ventana segura de {integ.name} para autorizar el acceso.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider">API Key de {integ.name}</label>
                  <input
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-••••••••••••••••••••••"
                    className="w-full border border-[#e9eae6] rounded-[10px] px-3.5 py-2.5 text-[13px] text-[#1a1a1a] font-mono focus:outline-none focus:border-[#222] bg-[#fafaf9]"
                  />
                  <p className="text-[11.5px] text-[#646462]">Encriptada en reposo · Revoca el acceso en cualquier momento</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={handleConnect}
                  className="flex-1 h-10 rounded-full bg-[#222] text-white text-[13px] font-semibold hover:bg-black transition-colors"
                >
                  {isOAuth ? `Conectar con ${integ.name}` : 'Guardar y conectar'}
                </button>
                <button
                  onClick={onClose}
                  className="h-10 px-5 rounded-full border border-[#e9eae6] text-[13px] font-semibold text-[#646462] hover:border-[#c8c9c4] hover:text-[#1a1a1a] transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </>
        ) : (
          /* ── Success ── */
          <div className="flex flex-col items-center gap-4 px-10 py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-[#dcfce7] flex items-center justify-center mb-1">
              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
                <path d="M5 12l5 5L19 7" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-[20px] font-bold text-[#1a1a1a]">{integ.name} conectado</p>
            <p className="text-[13.5px] text-[#646462] leading-[1.65] max-w-[320px]">
              La integración está activa. Los datos comenzarán a sincronizarse en los próximos minutos.
            </p>
            <button
              onClick={onClose}
              className="mt-3 h-10 px-8 rounded-full bg-[#222] text-white text-[13px] font-semibold hover:bg-black transition-colors"
            >
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AppStoreView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [search, setSearch]         = useState('');
  const [category, setCategory]     = useState('Todas');
  const [connecting, setConnecting] = useState<typeof STORE_INTEGRATIONS[0] | null>(null);
  const [connected, setConnected]   = useState<Set<string>>(
    () => new Set(STORE_INTEGRATIONS.filter(i => i.connected).map(i => i.id))
  );

  const filtered = STORE_INTEGRATIONS.filter(i => {
    const matchCat = category === 'Todas' || i.category === category;
    const matchQ   = !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.desc.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

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
                className="border border-[#e9eae6] rounded-full pl-8 pr-3 py-[6px] text-[13px] w-52 focus:outline-none focus:border-[#222]"
              />
            </div>
          </div>

          {/* Category pills + stats */}
          <div className="px-6 pt-4 pb-3 border-b border-[#e9eae6] flex-shrink-0">
            <div className="flex gap-2 flex-wrap mb-3">
              {STORE_CATS.map(cat => (
                <button key={cat} onClick={() => setCategory(cat)}
                  className={`px-3.5 py-1.5 text-[12px] font-semibold rounded-full border transition-colors ${
                    category === cat
                      ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]'
                      : 'bg-white text-[#646462] border-[#e9eae6] hover:border-[#1a1a1a] hover:text-[#1a1a1a]'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[12px] text-[#646462]">{filtered.length} integraciones</span>
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#15803d]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] inline-block" />
                {filtered.filter(i => connected.has(i.id)).length} conectadas
              </span>
            </div>
          </div>

          {/* Integration grid */}
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            <div className="grid grid-cols-3 gap-4 xl:grid-cols-4">
              {filtered.map(integ => {
                const isConn = connected.has(integ.id);
                return (
                  <div
                    key={integ.id}
                    className="bg-white border border-[#e9eae6] rounded-[12px] p-5 flex flex-col gap-3 hover:border-[#c8c9c4] hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all cursor-pointer"
                  >
                    {/* Logo + badge */}
                    <div className="flex items-start justify-between">
                      <div className="w-[48px] h-[48px] rounded-[12px] bg-[#f3f3f1] border border-[#e9eae6] flex items-center justify-center overflow-hidden flex-shrink-0">
                        <AppLogoImg id={integ.id} domain={integ.domain} name={integ.name} color={integ.color} size={32} />
                      </div>
                      {isConn && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-[#15803d] bg-[#dcfce7] px-2 py-0.5 rounded-full">
                          <span className="w-1 h-1 rounded-full bg-[#22c55e] inline-block" />
                          Conectado
                        </span>
                      )}
                    </div>

                    {/* Name + desc */}
                    <div className="flex-1">
                      <p className="text-[14px] font-semibold text-[#1a1a1a] mb-1">{integ.name}</p>
                      <p className="text-[12px] text-[#646462] leading-[1.55] line-clamp-2">{integ.desc}</p>
                    </div>

                    {/* CTA */}
                    <button
                      onClick={() => setConnecting(integ)}
                      className={`w-full h-[34px] rounded-full text-[12px] font-semibold border transition-colors ${
                        isConn
                          ? 'border-[#e9eae6] text-[#646462] hover:border-[#1a1a1a] hover:text-[#1a1a1a] bg-white'
                          : 'bg-[#1a1a1a] border-[#1a1a1a] text-white hover:bg-black'
                      }`}
                    >
                      {isConn ? 'Configurar' : 'Conectar'}
                    </button>
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
          onClose={() => setConnecting(null)}
          onConnected={() => setConnected(prev => new Set([...prev, connecting!.id]))}
        />
      )}
    </div>
  );
}

"""

src = src[:start] + NEW_MODAL_BLOCK + src[end:]

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK: ConnectModal + cards redesigned (Fin AI style, 3-level logo fallback)")
print(f"File size: {len(src)} chars")
