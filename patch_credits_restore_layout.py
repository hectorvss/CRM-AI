PATH = r"C:\Users\usuario\OneDrive - Universidad Politécnica de Cartagena\Documentos\Claude\CRM-AI\src\prototype\Prototype.tsx"

with open(PATH, 'r', encoding='utf-8') as f:
    src = f.read()

# ── 1. Replace CREDIT_PACKS with real data ────────────────────────────────────
OLD_PACKS_START = "const CREDIT_PACKS = ["
OLD_PACKS_END   = "];\n\nfunction BillingCreditsBlock"

start = src.index(OLD_PACKS_START)
end   = src.index(OLD_PACKS_END) + len(OLD_PACKS_END)

NEW_PACKS = """const CREDIT_PACKS = [
  {
    id: 'pack-5k',
    label: '5.000 créditos',
    credits: '5.000',
    price: '€79',
    pricePerK: '€15,8/k',
    tagline: 'Para equipos pequeños',
    detail: {
      headline: '5.000 créditos adicionales — €79',
      models: 'GPT-4o mini, Claude 3 Haiku, Gemini 1.5 Flash',
      capacity: 'Up to 5M tokens / ~10k automated tasks',
      includes: [
        '~10.000 tareas automatizadas',
        'Hasta 5M tokens procesados',
        'Modelos rápidos y eficientes en coste',
        'Se consumen después de agotar la cuota mensual del plan',
      ],
      bestFor: 'Startups o equipos pequeños que quieren ampliar su cuota puntualmente sin sobrepasar su presupuesto.',
      note: 'Los créditos del pack permanecen disponibles mientras tu suscripción esté activa.',
    },
  },
  {
    id: 'pack-20k',
    label: '20.000 créditos',
    credits: '20.000',
    price: '€249',
    pricePerK: '€12,45/k',
    tagline: 'El más popular',
    popular: true,
    detail: {
      headline: '20.000 créditos adicionales — €249',
      models: 'GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro',
      capacity: 'Up to 20M tokens / ~40k automated tasks',
      includes: [
        '~40.000 tareas automatizadas',
        'Hasta 20M tokens procesados',
        'Acceso a modelos de gama alta (GPT-4o, Claude 3.5 Sonnet)',
        'Ideal para picos de demanda o campañas de soporte',
      ],
      bestFor: 'Equipos en crecimiento con volumen variable que necesitan potencia de modelos premium.',
      note: 'El pack más comprado. Un 21% más barato por crédito que el pack de 5.000.',
    },
  },
  {
    id: 'pack-50k',
    label: '50.000 créditos',
    credits: '50.000',
    price: '€549',
    pricePerK: '€10,98/k',
    tagline: 'Mayor capacidad',
    detail: {
      headline: '50.000 créditos adicionales — €549',
      models: 'All models + Custom fine-tuned models',
      capacity: 'Up to 50M tokens / ~100k automated tasks',
      includes: [
        '~100.000 tareas automatizadas',
        'Hasta 50M tokens procesados',
        'Acceso a todos los modelos, incluidos los fine-tuned personalizados',
        'Máxima capacidad para operaciones de soporte intensivas',
      ],
      bestFor: 'Operaciones de soporte grandes con alto volumen y constante. El precio por crédito más bajo disponible.',
      note: 'Un 31% más barato por crédito que el pack de 5.000. Disponible facturación anual con descuento adicional.',
    },
  },
  {
    id: 'flexible',
    label: 'Uso Flexible',
    credits: null as string | null,
    price: '€19',
    pricePerK: '€19 / 1.000 créd.',
    tagline: 'Sin compromiso',
    detail: {
      headline: '€19 por cada 1.000 créditos extra',
      models: 'Todos los modelos disponibles en tu plan',
      capacity: 'Sin límite de tokens — paga solo lo que uses',
      includes: [
        'Se activa solo después de agotar los créditos mensuales incluidos',
        'Facturado mensualmente según el uso real extra',
        'Protección de gasto máximo mensual y alertas de uso',
        'Activa y desactiva cuando quieras desde Facturación',
      ],
      bestFor: 'Equipos con volumen impredecible o que quieren validar el ROI del AI antes de comprometerse con un pack fijo.',
      note: 'No hay coste si no superas tu cuota mensual. Solo pagas por los créditos extra realmente consumidos.',
    },
  },
];

function BillingCreditsBlock"""

src = src[:start] + NEW_PACKS + src[end:]

# ── 2. Replace BillingCreditsBlock with the selector/detail layout ─────────────
OLD_BLOCK_START = "function BillingCreditsBlock({ currentPlan }: {"
OLD_BLOCK_END   = "}\n\nfunction BillingFaqItem"

start2 = src.index(OLD_BLOCK_START)
end2   = src.index(OLD_BLOCK_END) + len(OLD_BLOCK_END)

NEW_BLOCK = r"""function BillingCreditsBlock({ selectedPack, setSelectedPack, currentPlan }: {
  selectedPack: string;
  setSelectedPack: (id: string) => void;
  currentPlan: string;
}) {
  const pack = CREDIT_PACKS.find(p => p.id === selectedPack) || CREDIT_PACKS[1];
  return (
    <div style={{ borderBottom: `1px solid ${LC.border}` }}>
      {/* Header */}
      <div style={{ padding: '32px 64px 24px', borderBottom: `1px solid ${LC.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <p style={{ fontSize: 20, fontWeight: 800, color: LC.text }}>Créditos AI</p>
          <span style={{ fontSize: 11, fontWeight: 700, background: LC.accent, color: '#fff', padding: '2px 8px', letterSpacing: '0.04em' }}>COMPARTIDOS POR EQUIPO</span>
        </div>
        <p style={{ fontSize: 13, color: LC.text60, lineHeight: '1.7', maxWidth: 680 }}>
          Cada plan incluye una asignación mensual de créditos AI <strong style={{ color: LC.text }}>compartida entre todo el equipo</strong>, no por puesto. Añadir puestos <strong style={{ color: LC.text }}>no añade créditos</strong> — los packs adicionales se compran aparte.
        </p>
      </div>
      {/* Body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr' }}>
        {/* Left — selector */}
        <div style={{ borderRight: `1px solid ${LC.border}`, padding: '24px 0' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 28px', marginBottom: 12 }}>Selecciona un pack</p>
          {CREDIT_PACKS.map(pk => {
            const sel = pk.id === selectedPack;
            return (
              <button key={pk.id} onClick={() => setSelectedPack(pk.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', border: 'none', background: sel ? LC.bg2 : 'transparent', borderLeft: sel ? `3px solid ${LC.accent}` : '3px solid transparent', cursor: 'pointer', textAlign: 'left', gap: 12 }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: LC.text, marginBottom: 2 }}>{pk.label}</p>
                    {pk.popular && <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: LC.accent, padding: '1px 5px', letterSpacing: '0.04em' }}>POPULAR</span>}
                  </div>
                  <p style={{ fontSize: 11, color: LC.text60 }}>{pk.tagline}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: LC.text }}>{pk.price}</p>
                  {pk.pricePerK && <p style={{ fontSize: 10, color: LC.text60 }}>{pk.pricePerK}</p>}
                </div>
              </button>
            );
          })}
          {/* Subscription allowances */}
          <div style={{ margin: '20px 28px 0', padding: '16px', background: LC.bg2, border: `1px solid ${LC.border}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Incluido en tu suscripción</p>
            {[
              { plan: 'Starter', credits: '5.000/mes',  cur: currentPlan.toLowerCase().includes('starter') },
              { plan: 'Growth',  credits: '20.000/mes', cur: currentPlan.toLowerCase().includes('growth') },
              { plan: 'Scale',   credits: '60.000/mes', cur: currentPlan.toLowerCase().includes('scale') },
            ].map(r => (
              <div key={r.plan} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${LC.border}` }}>
                <span style={{ fontSize: 12, color: LC.text, fontWeight: r.cur ? 700 : 400 }}>
                  {r.plan}{r.cur && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: LC.accent }}>TU PLAN</span>}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: LC.text }}>{r.credits}</span>
              </div>
            ))}
            <p style={{ fontSize: 11, color: LC.text60, marginTop: 10 }}>Los créditos no usados <strong style={{ color: LC.text }}>no se acumulan</strong>.</p>
          </div>
        </div>
        {/* Right — detail */}
        <div style={{ padding: '28px 40px', display: 'flex', flexDirection: 'column' }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: LC.text, marginBottom: 8 }}>{pack.detail.headline}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: LC.text60 }}><strong style={{ color: LC.text }}>Modelos:</strong> {pack.detail.models}</p>
            <p style={{ fontSize: 13, color: LC.text60 }}><strong style={{ color: LC.text }}>Capacidad:</strong> {pack.detail.capacity}</p>
          </div>
          <p style={{ fontSize: 10, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Qué incluye</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {pack.detail.includes.map(item => (
              <div key={item} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: LC.accent, fontWeight: 700, flexShrink: 0, fontSize: 14 }}>✓</span>
                <span style={{ fontSize: 13, color: LC.text, lineHeight: '1.5' }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ background: LC.bg2, border: `1px solid ${LC.border}`, padding: '16px 20px', marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Ideal para</p>
            <p style={{ fontSize: 13, color: LC.text, lineHeight: '1.6' }}>{pack.detail.bestFor}</p>
          </div>
          <p style={{ fontSize: 12, color: LC.text60, lineHeight: '1.6', marginBottom: 24 }}>
            <strong style={{ color: LC.text }}>Nota: </strong>{pack.detail.note}
          </p>
          <div style={{ marginTop: 'auto' }}>
            <button style={{ height: 44, padding: '0 28px', fontSize: 14, fontWeight: 700, background: LC.text, color: '#fff', border: 'none', cursor: 'pointer' }}>
              {pack.id === 'flexible' ? 'Activar uso flexible' : `Comprar ${pack.label}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BillingFaqItem"""

src = src[:start2] + NEW_BLOCK + src[end2:]

# ── 3. Restore selectedPack state in BillingView ──────────────────────────────
# Add back selectedPack state after billing state
src = src.replace(
    "  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual');\n  const { data: sub }",
    "  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual');\n  const [selectedPack, setSelectedPack] = useState('pack-20k');\n  const { data: sub }"
)

# ── 4. Restore component call with props ─────────────────────────────────────
src = src.replace(
    "<BillingCreditsBlock currentPlan={currentPlan} />",
    "<BillingCreditsBlock selectedPack={selectedPack} setSelectedPack={setSelectedPack} currentPlan={currentPlan} />"
)

with open(PATH, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK: selector/detail layout restored with real data")
print(f"File size: {len(src)} chars")
