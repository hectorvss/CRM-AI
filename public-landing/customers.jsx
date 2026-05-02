/* global React */
const { useState: useStateC, useMemo } = React;

const CUSTOMERS_COPY = {
  es: {
    eyebrow: "Clientes",
    title: ["Equipos de soporte que dejaron de ", { em: "apagar fuegos" }, "."],
    lede: "Marcas de ecommerce que pasaron de macros y reglas frágiles a casos resueltos con contexto, evidencia y velocidad. Esto es lo que cambió cuando pusieron Clain en su stack.",
    metrics: [
      ["−63%", "tiempo de triaging"],
      ["6×", "casos atendidos por agente"],
      ["+44%", "first-contact resolution"],
      ["100%", "decisiones auditables"],
    ],
    filtersTitle: "Por industria",
    industries: ["Todas", "Moda & lifestyle", "Marketplaces", "D2C alimentación", "Hardware", "Suscripciones", "Travel & ticketing"],
    filtersSizeTitle: "Por tamaño",
    sizes: ["Todos", "Scale-up", "Mid-market", "Enterprise"],
    cases: [
      {
        brand: "Lumère",
        industry: "Moda & lifestyle",
        size: "Scale-up",
        accent: "oklch(0.55 0.16 290)",
        headline: ["Cobros duplicados, ", { em: "resueltos en minutos" }, ", no en días."],
        body: "Lumère pasó de 28h a 47min de SLA en disputas de pago. El Super Agent reconcilia Stripe + Shopify en cada caso y deja un plan listo para aprobar.",
        kpis: [["−96%", "SLA en disputas"], ["+38%", "CSAT post-refund"], ["3 personas", "menos en triaging"]],
        quote: "Antes pasábamos el día entre Stripe, Shopify y el helpdesk. Ahora abrimos un caso y ya está todo cruzado, con el refund propuesto.",
        author: "Helena Ruiz · Head of CX",
      },
      {
        brand: "Cova Market",
        industry: "Marketplaces",
        size: "Mid-market",
        accent: "oklch(0.62 0.14 30)",
        headline: ["Un grafo de caso vale más que ", { em: "doce pestañas abiertas" }, "."],
        body: "Con vendedores, pedidos, pagos y disputas viviendo en sistemas distintos, Cova usa Case Graph para que ops, fraude y soporte miren la misma realidad.",
        kpis: [["−71%", "saltos entre tools"], ["3.4×", "decisiones por hora"], ["−52%", "escalados a fraude"]],
        quote: "El grafo es la primera vez que operaciones, finanzas y soporte ven el mismo caso al mismo tiempo. Las reuniones de coordinación desaparecieron.",
        author: "Iván Cortés · Director of Operations",
      },
      {
        brand: "Aldea",
        industry: "D2C alimentación",
        size: "Scale-up",
        accent: "oklch(0.62 0.13 145)",
        headline: ["Devoluciones perecederas, ", { em: "decididas con política" }, "."],
        body: "Aldea conectó sus reglas de frescura, lote y carrier al motor de approvals. Cada refund pasa por la política correcta, sin macros ni excepciones manuales.",
        kpis: [["100%", "refunds con política aplicada"], ["−61%", "fraude de devolución"], ["+22%", "retención post-incidencia"]],
        quote: "Pusimos las reglas de la empresa en un sitio donde el agente las ejecuta. Lo que antes era criterio de cada persona ahora es política consistente.",
        author: "Marta Olmo · COO",
      },
      {
        brand: "Voltio",
        industry: "Hardware",
        size: "Enterprise",
        accent: "oklch(0.60 0.13 220)",
        headline: ["RMA con ", { em: "cadena de evidencia" }, ", no con post-its."],
        body: "Voltio gestiona RMAs de hardware con número de serie, foto, diagnóstico y carrier. El audit log les ahorró tres semanas en su última auditoría.",
        kpis: [["SOC 2", "auditoría sin findings"], ["−83%", "tiempo de auditoría"], ["12s", "para reproducir cualquier decisión"]],
        quote: "Cada acción del agente está firmada y se reproduce. El equipo de compliance dejó de ser un cuello de botella.",
        author: "Pau Sentís · VP Compliance",
      },
      {
        brand: "Mensual",
        industry: "Suscripciones",
        size: "Mid-market",
        accent: "oklch(0.65 0.13 80)",
        headline: ["Churn por fricción, ", { em: "interceptado en el momento" }, "."],
        body: "Mensual usa AI Case Inbox para detectar señales de cancelación en email y chat antes de que el cliente abra una disputa. El agente propone retención sin que el equipo lo pida.",
        kpis: [["+19pp", "save rate"], ["−44%", "disputas por suscripción"], ["02:14", "tiempo medio de borrador"]],
        quote: "El mejor caso es el que nunca llega a disputa. Clain nos avisa cuando un email tiene tono de cancelación y nos da la respuesta lista.",
        author: "Sara Domínguez · Head of Retention",
      },
      {
        brand: "Albatros",
        industry: "Travel & ticketing",
        size: "Enterprise",
        accent: "oklch(0.55 0.16 290)",
        headline: ["Eventos masivos, ", { em: "operación tranquila" }, "."],
        body: "En picos de venta de Albatros, el Super Agent absorbe el 71% del volumen sin abrir la puerta a errores. La política de approvals decide qué pasa al humano.",
        kpis: [["71%", "casos auto-resueltos en peak"], ["−58%", "agentes en cola"], ["99.97%", "uptime durante drop"]],
        quote: "En el último drop teníamos miedo de las primeras dos horas. Pasaron sin un solo escalado de pánico.",
        author: "Diego Vergara · Head of Support",
      },
    ],
    industriesBreakdownTitle: ["Funciona en cualquier ", { em: "modelo de ecommerce" }, "."],
    industriesBreakdownLede: "Las mismas cinco capas — inbox, agente, grafo, política, audit — adaptadas a la realidad de cada vertical.",
    industriesGrid: [
      { t: "Moda & lifestyle", d: "Tallas, devoluciones de talla, restocks, drops y colaboraciones." },
      { t: "Marketplaces", d: "Multi-vendor, disputes, payouts, KYC y escalados de fraude." },
      { t: "Alimentación D2C", d: "Frescura, lotes, carriers refrigerados, devoluciones perecederas." },
      { t: "Hardware", d: "RMA, números de serie, garantías, diagnóstico técnico, repuestos." },
      { t: "Suscripciones", d: "Renovaciones, prorrateos, dunning, retention, downgrades." },
      { t: "Travel & ticketing", d: "Picos de demanda, cancelaciones, no-shows, regulación local." },
    ],
    quoteRailTitle: "Lo que dicen los equipos",
    cta: ["¿Listo para ver tus ", { em: "propios casos" }, " resueltos?"],
    ctaLede: "Demo de 30 minutos con tus datos reales. Sin slides.",
  },
  en: {
    eyebrow: "Customers",
    title: ["Support teams that stopped ", { em: "fighting fires" }, "."],
    lede: "Ecommerce brands that moved from macros and brittle rules to cases resolved with context, evidence and speed. Here's what changed when Clain entered their stack.",
    metrics: [
      ["−63%", "triaging time"],
      ["6×", "cases per agent"],
      ["+44%", "first-contact resolution"],
      ["100%", "auditable decisions"],
    ],
    filtersTitle: "By industry",
    industries: ["All", "Fashion & lifestyle", "Marketplaces", "D2C food", "Hardware", "Subscriptions", "Travel & ticketing"],
    filtersSizeTitle: "By size",
    sizes: ["All", "Scale-up", "Mid-market", "Enterprise"],
    cases: [
      {
        brand: "Lumère",
        industry: "Fashion & lifestyle",
        size: "Scale-up",
        accent: "oklch(0.55 0.16 290)",
        headline: ["Duplicate charges, ", { em: "resolved in minutes" }, ", not days."],
        body: "Lumère cut payment-dispute SLA from 28h to 47min. Super Agent reconciles Stripe + Shopify on every case and hands over a plan ready to approve.",
        kpis: [["−96%", "dispute SLA"], ["+38%", "post-refund CSAT"], ["3 people", "fewer in triaging"]],
        quote: "We used to live between Stripe, Shopify and the helpdesk. Now we open a case and everything is already cross-referenced, with a refund proposed.",
        author: "Helena Ruiz · Head of CX",
      },
      {
        brand: "Cova Market",
        industry: "Marketplaces",
        size: "Mid-market",
        accent: "oklch(0.62 0.14 30)",
        headline: ["A case graph beats ", { em: "twelve open tabs" }, "."],
        body: "With sellers, orders, payments and disputes living in different systems, Cova uses Case Graph so ops, fraud and support look at the same reality.",
        kpis: [["−71%", "tool-hops"], ["3.4×", "decisions per hour"], ["−52%", "fraud escalations"]],
        quote: "It's the first time ops, finance and support see the same case at the same time. Coordination meetings are gone.",
        author: "Iván Cortés · Director of Operations",
      },
      {
        brand: "Aldea",
        industry: "D2C food",
        size: "Scale-up",
        accent: "oklch(0.62 0.13 145)",
        headline: ["Perishable returns, ", { em: "decided by policy" }, "."],
        body: "Aldea wired their freshness, batch and carrier rules into the approvals engine. Every refund runs through the right policy — no macros, no manual exceptions.",
        kpis: [["100%", "refunds with policy"], ["−61%", "return fraud"], ["+22%", "post-issue retention"]],
        quote: "We put the company's rules in a place where the agent executes them. What used to be each person's judgment is now consistent policy.",
        author: "Marta Olmo · COO",
      },
      {
        brand: "Voltio",
        industry: "Hardware",
        size: "Enterprise",
        accent: "oklch(0.60 0.13 220)",
        headline: ["RMAs with ", { em: "evidence chains" }, ", not sticky notes."],
        body: "Voltio runs hardware RMAs with serial number, photo, diagnosis and carrier. The audit log saved them three weeks on their last audit.",
        kpis: [["SOC 2", "audit without findings"], ["−83%", "audit time"], ["12s", "to replay any decision"]],
        quote: "Every agent action is signed and replayable. Compliance is no longer a bottleneck.",
        author: "Pau Sentís · VP Compliance",
      },
      {
        brand: "Mensual",
        industry: "Subscriptions",
        size: "Mid-market",
        accent: "oklch(0.65 0.13 80)",
        headline: ["Friction churn, ", { em: "intercepted live" }, "."],
        body: "Mensual uses AI Case Inbox to catch cancellation signals in email and chat before the customer opens a dispute. The agent proposes retention without being asked.",
        kpis: [["+19pp", "save rate"], ["−44%", "subscription disputes"], ["02:14", "average draft time"]],
        quote: "The best case is the one that never becomes a dispute. Clain warns us when an email reads like a cancellation, with the response ready.",
        author: "Sara Domínguez · Head of Retention",
      },
      {
        brand: "Albatros",
        industry: "Travel & ticketing",
        size: "Enterprise",
        accent: "oklch(0.55 0.16 290)",
        headline: ["Mass events, ", { em: "calm operations" }, "."],
        body: "During Albatros sales peaks, Super Agent absorbs 71% of the volume without opening the door to mistakes. Approval policy decides what reaches a human.",
        kpis: [["71%", "auto-resolved in peak"], ["−58%", "agents in queue"], ["99.97%", "uptime during drop"]],
        quote: "We used to dread the first two hours of a drop. The last one passed without a single panic escalation.",
        author: "Diego Vergara · Head of Support",
      },
    ],
    industriesBreakdownTitle: ["Works in any ", { em: "ecommerce model" }, "."],
    industriesBreakdownLede: "The same five layers — inbox, agent, graph, policy, audit — adapted to each vertical's reality.",
    industriesGrid: [
      { t: "Fashion & lifestyle", d: "Sizes, size-returns, restocks, drops and collaborations." },
      { t: "Marketplaces", d: "Multi-vendor, disputes, payouts, KYC and fraud escalations." },
      { t: "D2C food", d: "Freshness, batches, refrigerated carriers, perishable returns." },
      { t: "Hardware", d: "RMA, serials, warranties, technical diagnosis, spare parts." },
      { t: "Subscriptions", d: "Renewals, prorations, dunning, retention, downgrades." },
      { t: "Travel & ticketing", d: "Demand peaks, cancellations, no-shows, local regulation." },
    ],
    quoteRailTitle: "What teams say",
    cta: ["Ready to see your ", { em: "own cases" }, " resolved?"],
    ctaLede: "30-minute demo with your real data. No slides.",
  },
};

function CustomersPage({ t, lang }) {
  const c = CUSTOMERS_COPY[lang] || CUSTOMERS_COPY.es;
  const renderTitleParts = window.renderTitleParts;
  const FinalCTA = window.FinalCTA;
  const [industry, setIndustry] = useStateC(c.industries[0]);
  const [size, setSize] = useStateC(c.sizes[0]);

  const filtered = useMemo(() => {
    return c.cases.filter((cs) => {
      const okI = industry === c.industries[0] || cs.industry === industry;
      const okS = size === c.sizes[0] || cs.size === size;
      return okI && okS;
    });
  }, [c, industry, size]);

  return (
    <main>
      {/* HERO */}
      <section className="hero wrap reveal" style={{paddingBottom: 24}}>
        <div className="hero-eyebrow-row"><span className="eyebrow">{c.eyebrow}</span></div>
        <h1 className="h-display">{renderTitleParts(c.title)}</h1>
        <p className="lede" style={{marginTop: 32, maxWidth: 760, fontSize: 19}}>{c.lede}</p>

        {/* Featured logo rail */}
        <div className="cust-logo-rail reveal-children" style={{marginTop: 56}}>
          {c.cases.map((cs, i) => (
            <div key={i} className="cust-logo-tile" style={{ '--accent-tile': cs.accent }}>
              <div className="cust-logo-mark">{cs.brand.slice(0, 2).toUpperCase()}</div>
              <div className="cust-logo-name">{cs.brand}</div>
              <div className="cust-logo-meta">{cs.industry}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Headline metrics strip */}
      <section className="section" style={{paddingTop: 40}}>
        <div className="wrap">
          <div className="cust-metrics reveal-children">
            {c.metrics.map(([n, l], i) => (
              <div key={i} className="cust-metric">
                <div className="cust-metric-num">{n}</div>
                <div className="cust-metric-lab">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Filters + Case grid */}
      <section className="section">
        <div className="wrap">
          <div className="cust-filters reveal">
            <div className="cust-filter-group">
              <span className="cust-filter-label">{c.filtersTitle}</span>
              <div className="cust-chip-row">
                {c.industries.map((it) => (
                  <button key={it} className={`cust-chip ${industry === it ? 'active' : ''}`} onClick={() => setIndustry(it)}>{it}</button>
                ))}
              </div>
            </div>
            <div className="cust-filter-group">
              <span className="cust-filter-label">{c.filtersSizeTitle}</span>
              <div className="cust-chip-row">
                {c.sizes.map((s) => (
                  <button key={s} className={`cust-chip ${size === s ? 'active' : ''}`} onClick={() => setSize(s)}>{s}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="cust-grid reveal-children">
            {filtered.length === 0 ? (
              <div className="cust-empty">— No hay casos para esa combinación. Prueba a relajar los filtros.</div>
            ) : filtered.map((cs, i) => (
              <article key={cs.brand} className="cust-card" style={{ '--accent-tile': cs.accent }}>
                <div className="cust-card-head">
                  <div className="cust-card-brand">
                    <div className="cust-logo-mark sm">{cs.brand.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <div className="cust-card-name">{cs.brand}</div>
                      <div className="cust-card-meta">{cs.industry} · {cs.size}</div>
                    </div>
                  </div>
                </div>
                <h3 className="cust-card-headline">{renderTitleParts(cs.headline)}</h3>
                <p className="cust-card-body">{cs.body}</p>
                <div className="cust-card-kpis">
                  {cs.kpis.map(([n, l], j) => (
                    <div key={j} className="cust-kpi">
                      <div className="cust-kpi-num">{n}</div>
                      <div className="cust-kpi-lab">{l}</div>
                    </div>
                  ))}
                </div>
                <blockquote className="cust-card-quote">
                  <p>"{cs.quote}"</p>
                  <cite>— {cs.author}</cite>
                </blockquote>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Industries breakdown */}
      <section className="section">
        <div className="wrap">
          <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 760, marginBottom: 40}}>
            <span className="eyebrow">{c.filtersTitle}</span>
            <h2 className="h-section">{renderTitleParts(c.industriesBreakdownTitle)}</h2>
            <p className="lede">{c.industriesBreakdownLede}</p>
          </div>
          <div className="cust-industries reveal-children">
            {c.industriesGrid.map((it, i) => (
              <div key={i} className="cust-industry">
                <div className="cust-industry-num">{String(i + 1).padStart(2, '0')}</div>
                <h4>{it.t}</h4>
                <p>{it.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FinalCTA t={t} />
    </main>
  );
}

window.CustomersPage = CustomersPage;
