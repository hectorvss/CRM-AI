import re

PATH = r"C:\Users\usuario\OneDrive - Universidad Politécnica de Cartagena\Documentos\Claude\CRM-AI\src\prototype\Prototype.tsx"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

# ── 1. Replace CREDIT_PACKS ───────────────────────────────────────────────────
OLD_PACKS_START = "const CREDIT_PACKS = ["
OLD_PACKS_END   = "];\n\nfunction BillingCreditsBlock"

start = src.index(OLD_PACKS_START)
end   = src.index(OLD_PACKS_END) + len(OLD_PACKS_END)

NEW_PACKS = """const CREDIT_PACKS = [
  {
    id: 'pack-5k',
    credits: '5,000',
    price: '€79',
    popular: false,
    models: 'GPT-4o mini, Claude 3 Haiku, Gemini 1.5 Flash',
    capacity: 'Up to 5M tokens / ~10k automated tasks',
  },
  {
    id: 'pack-20k',
    credits: '20,000',
    price: '€249',
    popular: true,
    models: 'GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro',
    capacity: 'Up to 20M tokens / ~40k automated tasks',
  },
  {
    id: 'pack-50k',
    credits: '50,000',
    price: '€549',
    popular: false,
    models: 'All models + Custom fine-tuned models',
    capacity: 'Up to 50M tokens / ~100k automated tasks',
  },
];

function BillingCreditsBlock"""

src = src[:start] + NEW_PACKS + src[end:]

# ── 2. Replace BillingCreditsBlock function body ──────────────────────────────
OLD_BLOCK_START = "function BillingCreditsBlock({ selectedPack, setSelectedPack, currentPlan }: {"
OLD_BLOCK_END   = "}\n\nfunction BillingFaqItem"

start2 = src.index(OLD_BLOCK_START)
end2   = src.index(OLD_BLOCK_END) + len(OLD_BLOCK_END)

NEW_BLOCK = r"""function BillingCreditsBlock({ currentPlan }: {
  currentPlan: string;
}) {
  const [flexEnabled, setFlexEnabled] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${LC.border}` }}>
      {/* Header */}
      <div style={{ padding: '32px 64px 24px', borderBottom: `1px solid ${LC.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <p style={{ fontSize: 20, fontWeight: 800, color: LC.text }}>Comprar cr&eacute;ditos AI adicionales</p>
          <span style={{ fontSize: 11, fontWeight: 700, background: LC.accent, color: '#fff', padding: '2px 8px', letterSpacing: '0.04em' }}>COMPARTIDOS POR EQUIPO</span>
        </div>
        <p style={{ fontSize: 13, color: LC.text60, lineHeight: '1.7', maxWidth: 720 }}>
          Los cr&eacute;ditos de top-up est&aacute;n disponibles en todos los planes y se consumen solo despu&eacute;s de agotar los cr&eacute;ditos mensuales incluidos. Permanecen disponibles mientras tu suscripci&oacute;n est&eacute; activa.
        </p>
      </div>

      {/* Pack cards */}
      <div style={{ padding: '24px 64px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {CREDIT_PACKS.map(pk => (
          <div key={pk.id} style={{
            position: 'relative',
            border: pk.popular ? `2px solid ${LC.accent}` : `1px solid ${LC.border}`,
            background: LC.bg,
            display: 'flex',
            alignItems: 'center',
            padding: '20px 24px',
            gap: 24,
          }}>
            {pk.popular && (
              <div style={{ position: 'absolute', top: -12, left: 20, background: LC.accent, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 10px', letterSpacing: '0.06em' }}>
                M&Aacute;S POPULAR
              </div>
            )}
            {/* Left: icon + credits count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 160 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: LC.bg2, border: `1px solid ${LC.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke={LC.accent} strokeWidth="1.5"/>
                  <path d="M12 7v5l3 3" stroke={LC.accent} strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 24, fontWeight: 800, color: LC.text, lineHeight: 1 }}>{pk.credits}</p>
                <p style={{ fontSize: 12, color: LC.text60, marginTop: 2 }}>AI Credits</p>
              </div>
            </div>
            {/* Middle: models + capacity */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="8" cy="8" r="7" fill="#22c55e"/>
                  <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p style={{ fontSize: 13, color: LC.text }}><strong>Modelos:</strong> {pk.models}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="8" cy="8" r="7" fill="#22c55e"/>
                  <path d="M5 8l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p style={{ fontSize: 13, color: LC.text }}><strong>Capacidad:</strong> {pk.capacity}</p>
              </div>
            </div>
            {/* Right: price + button */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0, minWidth: 140 }}>
              <p style={{ fontSize: 28, fontWeight: 800, color: LC.text, letterSpacing: '-0.5px', lineHeight: 1 }}>{pk.price}</p>
              <button style={{
                width: '100%',
                height: 40,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: pk.popular ? 'none' : `1.5px solid ${LC.border}`,
                background: pk.popular ? LC.accent : 'transparent',
                color: pk.popular ? '#fff' : LC.text,
              }}>
                Comprar pack
              </button>
            </div>
          </div>
        ))}

        {/* Flexible Usage card */}
        <div style={{
          border: `1px solid ${LC.border}`,
          background: LC.bg,
          display: 'flex',
          alignItems: 'center',
          padding: '20px 24px',
          gap: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 160 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: LC.bg2, border: `1px solid ${LC.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2v20M2 12h20" stroke={LC.accent} strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="12" cy="12" r="4" stroke={LC.accent} strokeWidth="1.5"/>
              </svg>
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: LC.text, lineHeight: 1 }}>Uso Flexible</p>
              <p style={{ fontSize: 11, color: LC.text60, marginTop: 4, maxWidth: 180, lineHeight: '1.4' }}>Paga solo por los cr&eacute;ditos AI extra que uses realmente, una vez agotada tu capacidad mensual.</p>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              'Empieza solo después de agotar los créditos mensuales incluidos',
              'Facturado mensualmente según el uso real extra',
              'Protección de gasto máximo mensual y alertas de uso',
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="8" cy="8" r="7" fill="none" stroke={LC.accent} strokeWidth="1.5"/>
                  <path d="M5 8l2 2 4-4" stroke={LC.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p style={{ fontSize: 13, color: LC.text }}>{item}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0, minWidth: 160 }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: LC.text }}>€19 / 1.000 cr&eacute;ditos</p>
            <p style={{ fontSize: 11, color: LC.text60 }}>Facturado mensualmente por uso extra</p>
            <button
              onClick={() => setFlexEnabled((e: boolean) => !e)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${LC.border}`, background: flexEnabled ? LC.bg2 : 'transparent', color: LC.text }}
            >
              {flexEnabled ? 'Uso flexible activado' : 'Activar uso flexible'}
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none" style={{ transform: flexEnabled ? 'rotate(180deg)' : 'none' }}>
                <path d="M1 1.5L6 6.5L11 1.5" stroke={LC.text} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BillingFaqItem"""

src = src[:start2] + NEW_BLOCK + src[end2:]

# ── 3. Update BillingView to remove selectedPack state and fix component call ─
# Remove selectedPack state
src = src.replace(
    "  const [selectedPack, setSelectedPack] = useState('pack-pro');\n",
    ""
)
# Fix component call: remove selectedPack/setSelectedPack props
src = src.replace(
    "<BillingCreditsBlock selectedPack={selectedPack} setSelectedPack={setSelectedPack} currentPlan={currentPlan} />",
    "<BillingCreditsBlock currentPlan={currentPlan} />"
)

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK: real credit packs + new card layout")
print(f"File size: {len(src)} chars")
