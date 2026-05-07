import sys
sys.stdout.reconfigure(encoding='utf-8')

PROTOTYPE = r'src/prototype/Prototype.tsx'
with open(PROTOTYPE, 'r', encoding='utf-8') as f:
    content = f.read()

# ── 1. Insert CREDIT_PACKS const + BillingCreditsBlock component before BillingFaqItem
ANCHOR = 'function BillingFaqItem('
INSERT = r"""const CREDIT_PACKS = [
  {
    id: 'pack-basico', label: 'Pack Básico', credits: '1.000', price: '€12', pricePerK: '€12/k', tagline: 'Para uso puntual',
    detail: {
      headline: '1.000 créditos adicionales',
      what: 'Un crédito equivale a una unidad de trabajo autónomo del AI: desde etiquetar una conversación hasta resolver una incidencia compleja de forma totalmente autónoma.',
      includes: [
        '~200 conversaciones resueltas autónomamente por Fin AI',
        '~500 resúmenes automáticos de conversaciones',
        '~1.000 etiquetados y clasificaciones inteligentes',
        '~333 tareas de razonamiento multi-paso',
      ],
      bestFor: 'Startups o equipos pequeños que quieren probar el AI Agent de forma controlada sin sobrepasar su cuota mensual.',
      note: 'Los créditos del pack se consumen después de agotar la asignación mensual del plan.',
    },
  },
  {
    id: 'pack-pro', label: 'Pack Pro', credits: '5.000', price: '€50', pricePerK: '€10/k', tagline: 'El más popular',
    detail: {
      headline: '5.000 créditos adicionales',
      what: 'Amplía significativamente la capacidad AI de tu equipo durante picos de demanda o campañas de soporte estacionales.',
      includes: [
        '~1.000 conversaciones resueltas autónomamente por Fin AI',
        '~2.500 resúmenes automáticos de conversaciones',
        '~5.000 etiquetados y clasificaciones inteligentes',
        '~1.667 tareas de razonamiento multi-paso',
      ],
      bestFor: 'Equipos en crecimiento con volumen variable. Un 17% más barato por crédito que el Pack Básico.',
      note: 'El pack más comprado. Compatible con todos los planes de suscripción.',
    },
  },
  {
    id: 'pack-business', label: 'Pack Business', credits: '20.000', price: '€150', pricePerK: '€7,50/k', tagline: 'Mayor ahorro fijo',
    detail: {
      headline: '20.000 créditos adicionales',
      what: 'Cubre un mes completo de automatización intensiva para equipos medianos con alta carga de soporte AI.',
      includes: [
        '~4.000 conversaciones resueltas autónomamente por Fin AI',
        '~10.000 resúmenes automáticos de conversaciones',
        '~20.000 etiquetados y clasificaciones inteligentes',
        '~6.667 tareas de razonamiento multi-paso',
      ],
      bestFor: 'Operaciones de soporte medianas con volumen alto y constante. Un 37% más barato por crédito que el Pack Básico.',
      note: 'Disponible facturación anual con 10% de descuento adicional.',
    },
  },
  {
    id: 'payg', label: 'Pago por resultado', credits: null as string | null, price: '€0,012', pricePerK: null as string | null, tagline: 'Sin compromiso',
    detail: {
      headline: '€0,012 por resultado resuelto',
      what: 'Solo pagas cuando Fin AI resuelve una conversación de forma autónoma y completa. Sin cuota mensual adicional — el coste es 100% variable según el uso real.',
      includes: [
        'Solo se cobra por conversaciones cerradas sin intervención humana',
        'Sin asignación mínima — activa y desactiva cuando quieras',
        'Compatible con cualquier plan de suscripción activo',
        'Facturación mensual según consumo real del mes',
      ],
      bestFor: 'Equipos con volumen impredecible, startups en fase temprana o empresas que quieren validar el ROI del AI antes de comprometerse con un pack.',
      note: '1.000 resultados = €12 · mismo precio unitario que el Pack Básico pero sin pagar por adelantado.',
    },
  },
];

function BillingCreditsBlock({ selectedPack, setSelectedPack, currentPlan }: {
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
                  <p style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: LC.text, marginBottom: 2 }}>{pk.label}</p>
                  <p style={{ fontSize: 11, color: LC.text60 }}>{pk.tagline}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: LC.text }}>{pk.price}</p>
                  {pk.pricePerK && <p style={{ fontSize: 10, color: LC.text60 }}>{pk.pricePerK}</p>}
                  {pk.credits && <p style={{ fontSize: 10, color: LC.text60 }}>{pk.credits} créditos</p>}
                </div>
              </button>
            );
          })}
          {/* Subscription allowances */}
          <div style={{ margin: '20px 28px 0', padding: '16px', background: LC.bg2, border: `1px solid ${LC.border}` }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Incluido en tu suscripción</p>
            {[
              { plan: 'Starter', credits: '5.000/mes', cur: currentPlan.toLowerCase().includes('starter') },
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
          <p style={{ fontSize: 13, color: LC.text60, lineHeight: '1.7', marginBottom: 24 }}>{pack.detail.what}</p>
          <p style={{ fontSize: 10, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Qué puedes hacer con este pack</p>
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
              {pack.id === 'payg' ? 'Activar pago por resultado' : `Comprar ${pack.label}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

"""

if ANCHOR not in content:
    print('ERROR: anchor not found'); exit(1)
content = content.replace(ANCHOR, INSERT + ANCHOR, 1)
print('OK: inserted CREDIT_PACKS + BillingCreditsBlock')

# ── 2. Replace the IIFE in BillingView with the component call ─────────────
OLD_IIFE = """        {/* ── AI Credits — selector + detail ──────────────────────────────────── */}
        {(() => {
          const PACKS = [
            {
              id: 'pack-basico', label: 'Pack Básico', credits: '1.000', price: '€12', pricePerK: '€12/k', tagline: 'Para uso puntual',
              detail: {
                headline: '1.000 créditos adicionales',
                what: 'Un crédito equivale a una unidad de trabajo autónomo del AI: desde etiquetar una conversación hasta resolver una incidencia compleja de forma totalmente autónoma.',
                includes: [
                  '~200 conversaciones resueltas autónomamente por Fin AI',
                  '~500 resúmenes automáticos de conversaciones',
                  '~1.000 etiquetados y clasificaciones inteligentes',
                  '~333 tareas de razonamiento multi-paso',
                ],
                bestFor: 'Startups o equipos pequeños que quieren probar el AI Agent de forma controlada sin sobrepasar su cuota mensual.',
                note: 'Los créditos del pack se consumen después de agotar la asignación mensual del plan.',
              },
            },
            {
              id: 'pack-pro', label: 'Pack Pro', credits: '5.000', price: '€50', pricePerK: '€10/k', tagline: 'El más popular',
              detail: {
                headline: '5.000 créditos adicionales',
                what: 'Amplía significativamente la capacidad AI de tu equipo durante picos de demanda o campañas de soporte estacionales.',
                includes: [
                  '~1.000 conversaciones resueltas autónomamente por Fin AI',
                  '~2.500 resúmenes automáticos de conversaciones',
                  '~5.000 etiquetados y clasificaciones inteligentes',
                  '~1.667 tareas de razonamiento multi-paso',
                ],
                bestFor: 'Equipos en crecimiento con volumen variable. Un 17% más barato por crédito que el Pack Básico.',
                note: 'El pack más comprado. Compatible con todos los planes de suscripción.',
              },
            },
            {
              id: 'pack-business', label: 'Pack Business', credits: '20.000', price: '€150', pricePerK: '€7,50/k', tagline: 'Mayor ahorro fijo',
              detail: {
                headline: '20.000 créditos adicionales',
                what: 'Cubre un mes completo de automatización intensiva para equipos medianos con alta carga de soporte AI.',
                includes: [
                  '~4.000 conversaciones resueltas autónomamente por Fin AI',
                  '~10.000 resúmenes automáticos de conversaciones',
                  '~20.000 etiquetados y clasificaciones inteligentes',
                  '~6.667 tareas de razonamiento multi-paso',
                ],
                bestFor: 'Operaciones de soporte medianas con volumen alto y constante. Un 37% más barato por crédito que el Pack Básico.',
                note: 'Disponible facturación anual con 10% de descuento adicional.',
              },
            },
            {
              id: 'payg', label: 'Pago por resultado', credits: null, price: '€0,012', pricePerK: null, tagline: 'Sin compromiso',
              detail: {
                headline: '€0,012 por resultado resuelto',
                what: 'Solo pagas cuando Fin AI resuelve una conversación de forma autónoma y completa. Sin cuota mensual adicional — el coste es 100% variable según el uso real.',
                includes: [
                  'Solo se cobra por conversaciones cerradas sin intervención humana',
                  'Sin asignación mínima — activa y desactiva cuando quieras',
                  'Compatible con cualquier plan de suscripción activo',
                  'Facturación mensual según consumo real del mes',
                ],
                bestFor: 'Equipos con volumen impredecible, startups en fase temprana o empresas que quieren validar el ROI del AI antes de comprometerse con un pack.',
                note: '1.000 resultados = €12 · mismo precio unitario que el Pack Básico pero sin pagar por adelantado.',
              },
            },
          ];
          const pack = PACKS.find(p => p.id === selectedPack) || PACKS[1];
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

              {/* Body: selector left + detail right */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.8fr' }}>
                {/* Left — pack selector */}
                <div style={{ borderRight: `1px solid ${LC.border}`, padding: '24px 0' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 28px', marginBottom: 12 }}>Selecciona un pack</p>
                  {PACKS.map(pk => {
                    const sel = pk.id === selectedPack;
                    return (
                      <button key={pk.id} onClick={() => setSelectedPack(pk.id)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', border: 'none', background: sel ? LC.bg2 : 'transparent', borderLeft: sel ? `3px solid ${LC.accent}` : '3px solid transparent', cursor: 'pointer', textAlign: 'left', gap: 12 }}
                      >
                        <div>
                          <p style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: LC.text, marginBottom: 2 }}>{pk.label}</p>
                          <p style={{ fontSize: 11, color: LC.text60 }}>{pk.tagline}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: 16, fontWeight: 700, color: LC.text }}>{pk.price}</p>
                          {pk.pricePerK && <p style={{ fontSize: 10, color: LC.text60 }}>{pk.pricePerK}</p>}
                          {pk.credits && <p style={{ fontSize: 10, color: LC.text60 }}>{pk.credits} créditos</p>}
                        </div>
                      </button>
                    );
                  })}
                  {/* Subscription allowances */}
                  <div style={{ margin: '20px 28px 0', padding: '16px', background: LC.bg2, border: `1px solid ${LC.border}` }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Incluido en tu suscripción</p>
                    {[
                      { plan: 'Starter', credits: '5.000/mes', cur: currentPlan.toLowerCase().includes('starter') },
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

                {/* Right — detail panel */}
                <div style={{ padding: '28px 40px', display: 'flex', flexDirection: 'column' }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color: LC.text, marginBottom: 8 }}>{pack.detail.headline}</p>
                  <p style={{ fontSize: 13, color: LC.text60, lineHeight: '1.7', marginBottom: 24 }}>{pack.detail.what}</p>

                  <p style={{ fontSize: 10, fontWeight: 700, color: LC.text60, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Qué puedes hacer con este pack</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                    {pack.detail.includes.map((item) => (
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
                      {pack.id === 'payg' ? 'Activar pago por resultado' : `Comprar ${pack.label}`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}"""

NEW_COMPONENT_CALL = "        {/* ── AI Credits — selector + detail ──────────────────────────────────── */}\n        <BillingCreditsBlock selectedPack={selectedPack} setSelectedPack={setSelectedPack} currentPlan={currentPlan} />"

if OLD_IIFE not in content:
    print('ERROR: IIFE not found')
else:
    content = content.replace(OLD_IIFE, NEW_COMPONENT_CALL, 1)
    print('OK: replaced IIFE with component call')

with open(PROTOTYPE, 'w', encoding='utf-8') as f:
    f.write(content)
print(f'Saved. {len(content)} chars')
