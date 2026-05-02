/* ============ Capability pages — Intercom-style + Clain UI ============ */
const { useState: useStateCap, useEffect: useEffectCap } = React;

/* ----- Shared shell ----- */
function CapHero({ eyebrow, title, lede, primary, secondary, lang }) {
  const renderTitleParts = window.renderTitleParts;
  return (
    <section className="cap-hero wrap reveal">
      <div className="cap-hero-eyebrow"><span className="eyebrow">{eyebrow}</span></div>
      <h1 className="h-display cap-hero-title">{Array.isArray(title) ? renderTitleParts(title) : title}</h1>
      <p className="lede cap-hero-lede">{lede}</p>
      <div className="cap-hero-cta">
        <a href="#/demo" className="btn-cta-link"><span className="btn btn-primary">{primary} <span className="arrow">→</span></span></a>
        <a href="#/product" className="btn btn-ghost">{secondary}</a>
      </div>
    </section>
  );
}

function CapStats({ items }) {
  return (
    <section className="cap-stats wrap reveal-children">
      {items.map(([n, l], i) => (
        <div key={i} className="cap-stat">
          <div className="cap-stat-num">{n}</div>
          <div className="cap-stat-lab">{l}</div>
        </div>
      ))}
    </section>
  );
}

function CapFeatureRow({ eyebrow, title, body, bullets, side, reverse, children }) {
  const renderTitleParts = window.renderTitleParts;
  return (
    <section className={`cap-row section ${reverse ? 'is-reverse' : ''}`}>
      <div className="wrap cap-row-inner">
        <div className="cap-row-text reveal">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 className="h-section">{Array.isArray(title) ? renderTitleParts(title) : title}</h2>
          <p className="lede">{body}</p>
          {bullets && (
            <ul className="cap-row-bullets">
              {bullets.map((b, i) => (
                <li key={i}><span className="cap-row-tick" aria-hidden="true">✓</span><span>{b}</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className="cap-row-vis reveal">
          {children || side}
        </div>
      </div>
    </section>
  );
}

function CapGrid3({ eyebrow, title, items }) {
  const renderTitleParts = window.renderTitleParts;
  return (
    <section className="section">
      <div className="wrap">
        <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 720, marginBottom: 56}}>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 className="h-section">{Array.isArray(title) ? renderTitleParts(title) : title}</h2>
        </div>
        <div className="cap-grid3 reveal-children">
          {items.map((it, i) => (
            <div key={i} className="cap-card">
              <div className="cap-card-num">{String(i + 1).padStart(2, '0')}</div>
              <h4>{it.t}</h4>
              <p>{it.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----- Mocks (lightweight UI illustrations) ----- */
function MockInbox() {
  return (
    <div className="cap-mock cap-mock--inbox">
      <div className="cap-mock-bar">
        <span className="dot dot-r"></span><span className="dot dot-y"></span><span className="dot dot-g"></span>
        <span className="cap-mock-title">Inbox · Unified</span>
      </div>
      <div className="cap-mock-body">
        <aside className="cap-mock-side">
          <div className="cap-mock-side-h">Channels</div>
          <ul>
            <li className="is-active"><span>📥</span> All conversations <em>248</em></li>
            <li><span>✉</span> Email <em>112</em></li>
            <li><span>💬</span> Chat <em>54</em></li>
            <li><span>📞</span> Voice <em>9</em></li>
            <li><span>🟢</span> WhatsApp <em>73</em></li>
          </ul>
        </aside>
        <div className="cap-mock-list">
          {[
            { t: "Refund — duplicate charge", c: "Email · ORD-7281", p: "P1", time: "04:12" },
            { t: "Where is my package?", c: "WhatsApp · ORD-7264", p: "P1", time: "06:48" },
            { t: "Promesa de entrega rota", c: "Chat · ORD-7259", p: "P2", time: "12:01" },
            { t: "Charge-back en disputa", c: "Email · ORD-7244", p: "P2", time: "31:20" },
            { t: "Cancel order before ship", c: "Chat · ORD-7232", p: "P3", time: "44:05" },
          ].map((r, i) => (
            <div key={i} className={`cap-mock-row ${i === 0 ? 'is-sel' : ''}`}>
              <div className="cap-mock-row-t">{r.t}</div>
              <div className="cap-mock-row-c">{r.c}</div>
              <div className="cap-mock-row-meta"><span className={`pri pri-${r.p.toLowerCase()}`}>{r.p}</span><span>{r.time}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockCases() {
  return (
    <div className="cap-mock cap-mock--cases">
      <div className="cap-mock-bar">
        <span className="dot dot-r"></span><span className="dot dot-y"></span><span className="dot dot-g"></span>
        <span className="cap-mock-title">Case · ORD-7281</span>
      </div>
      <div className="cap-mock-cases">
        <div className="cap-mock-cases-head">
          <h5>Refund — pago duplicado tras devolución parcial</h5>
          <span className="pri pri-p1">P1 · 04:12</span>
        </div>
        <div className="cap-mock-cases-meta">
          <div><b>Customer</b><span>María L. · LTV €2,408</span></div>
          <div><b>Order</b><span>ORD-7281 · €184.20</span></div>
          <div><b>Payment</b><span>Stripe · 2 charges</span></div>
          <div><b>Return</b><span>RMA-2204 · received</span></div>
        </div>
        <div className="cap-mock-cases-tabs">
          <span className="is-active">Timeline</span><span>Conversation</span><span>Graph</span><span>Audit</span>
        </div>
        <div className="cap-mock-cases-tl">
          <div><span className="tl-dot"></span> Charge captured · €184.20 · Mon 09:14</div>
          <div><span className="tl-dot"></span> Partial return received · Wed 11:02</div>
          <div><span className="tl-dot tl-warn"></span> Second charge captured · Wed 14:48</div>
          <div><span className="tl-dot"></span> Customer email · Thu 08:30</div>
          <div><span className="tl-dot tl-now"></span> Agent draft · refund €92.10 (proposed)</div>
        </div>
      </div>
    </div>
  );
}

function MockHelpCenter() {
  return (
    <div className="cap-mock cap-mock--help">
      <div className="cap-mock-bar">
        <span className="dot dot-r"></span><span className="dot dot-y"></span><span className="dot dot-g"></span>
        <span className="cap-mock-title">Help Center</span>
      </div>
      <div className="cap-mock-help">
        <div className="cap-mock-help-search">
          <span>🔎</span> ¿Cómo solicito un reembolso?
        </div>
        <div className="cap-mock-help-grid">
          {["Pedidos", "Pagos", "Envíos", "Devoluciones", "Cuenta", "Suscripciones"].map((c, i) => (
            <div key={i} className="cap-mock-help-card">
              <div className="cap-mock-help-icon">📚</div>
              <div className="cap-mock-help-t">{c}</div>
              <div className="cap-mock-help-n">{12 + i * 3} artículos</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockReporting() {
  return (
    <div className="cap-mock cap-mock--reporting">
      <div className="cap-mock-bar">
        <span className="dot dot-r"></span><span className="dot dot-y"></span><span className="dot dot-g"></span>
        <span className="cap-mock-title">Reporting · This week</span>
      </div>
      <div className="cap-mock-rep">
        <div className="cap-mock-rep-kpis">
          {[["Resolved", "12,841", "+18%"], ["AHT", "04:12", "−24%"], ["CSAT", "94%", "+3pt"], ["Auto-resolved", "61%", "+9pt"]].map((k, i) => (
            <div key={i} className="cap-mock-rep-kpi">
              <div className="lab">{k[0]}</div>
              <div className="num">{k[1]}</div>
              <div className="delta">{k[2]}</div>
            </div>
          ))}
        </div>
        <div className="cap-mock-rep-chart">
          <svg viewBox="0 0 400 120" preserveAspectRatio="none">
            <path d="M0,90 L40,72 L80,80 L120,55 L160,60 L200,40 L240,48 L280,30 L320,38 L360,22 L400,28" fill="none" stroke="currentColor" strokeWidth="2"/>
            <path d="M0,90 L40,72 L80,80 L120,55 L160,60 L200,40 L240,48 L280,30 L320,38 L360,22 L400,28 L400,120 L0,120 Z" fill="currentColor" opacity="0.06"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

function MockPolicy() {
  return (
    <div className="cap-mock cap-mock--policy">
      <div className="cap-mock-bar">
        <span className="dot dot-r"></span><span className="dot dot-y"></span><span className="dot dot-g"></span>
        <span className="cap-mock-title">Policy · refunds.v3</span>
      </div>
      <div className="cap-mock-policy">
        <pre>{`policy refunds {
  allow if amount <= 50€
       and reason in [defective, late]
  require approval(manager)
       if amount between 50€..500€
  require approval(finance)
       if amount > 500€
       or reason == goodwill
}`}</pre>
        <div className="cap-mock-policy-foot">
          <span>✓ valid · 0 conflicts</span>
          <span>last edit · Lucía · 2h ago</span>
        </div>
      </div>
    </div>
  );
}

function MockAudit() {
  return (
    <div className="cap-mock cap-mock--audit">
      <div className="cap-mock-bar">
        <span className="dot dot-r"></span><span className="dot dot-y"></span><span className="dot dot-g"></span>
        <span className="cap-mock-title">Audit log</span>
      </div>
      <div className="cap-mock-audit">
        {[
          { e: "agent.query", a: "agent · v0.9", t: "12:04:08", h: "0xa3…b21" },
          { e: "agent.draft", a: "agent · v0.9", t: "12:04:11", h: "0x71…ce4" },
          { e: "human.approve", a: "lucia@bondi", t: "12:05:42", h: "0x4f…20a" },
          { e: "execution.refund", a: "stripe.api", t: "12:05:43", h: "0xd8…712" },
          { e: "audit.seal", a: "ledger", t: "12:05:43", h: "0xfa…001" },
        ].map((r, i) => (
          <div key={i} className="cap-mock-audit-row">
            <span className="ev">{r.e}</span>
            <span className="ac">{r.a}</span>
            <span className="ts">{r.t}</span>
            <span className="hh">{r.h}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCopilot() {
  return (
    <div className="cap-mock cap-mock--copilot">
      <div className="cap-mock-bar">
        <span className="dot dot-r"></span><span className="dot dot-y"></span><span className="dot dot-g"></span>
        <span className="cap-mock-title">Copilot · ORD-7281</span>
      </div>
      <div className="cap-mock-copilot">
        <div className="cap-mock-copilot-msg cap-mock-copilot-msg--bot">
          He revisado el caso. Hay <b>dos cargos</b> por el mismo pedido y la devolución parcial fue aceptada. Propongo reembolsar €92.10 al método original.
          <div className="cap-mock-copilot-cite">Fuentes: Stripe · Shopify · RMA-2204</div>
        </div>
        <div className="cap-mock-copilot-msg cap-mock-copilot-msg--user">¿Y la diferencia con el primer cargo?</div>
        <div className="cap-mock-copilot-msg cap-mock-copilot-msg--bot">
          Coincide con el envío estándar (€8). Está fuera del alcance del refund según <i>refunds.v3</i>.
        </div>
        <div className="cap-mock-copilot-input">
          <input placeholder="Pregunta a Copilot…" />
          <button>↑</button>
        </div>
      </div>
    </div>
  );
}

/* ----- Capability data ----- */
const CAP_COPY = {
  unified_inbox: {
    es: {
      eyebrow: "Bandeja unificada",
      title: ["Una bandeja para ", { em: "todos los canales" }, "."],
      lede: "Email, chat, WhatsApp, voz y formularios — convergen en hilos únicos con todo el contexto del cliente y su pedido.",
      primary: "Solicita demo",
      secondary: "Ver el producto",
      stats: [["5", "canales nativos"], ["−63%", "tiempo en triaging"], ["100%", "casos con contexto"]],
      rows: [
        { eyebrow: "Una vista", title: ["Todo lo que un caso necesita,", { em: " en un solo hilo" }, "."], body: "Sin macros frágiles ni reglas que se rompen. Cada conversación se enlaza con su pedido, pago, devolución, riesgo y SLA en el momento de entrar.", bullets: ["Hilo único multi-canal", "Cliente, pedido y pago auto-detectados", "Saltos a Shopify, Stripe y carriers"] },
        { eyebrow: "Priorización", title: ["Lo urgente,", { em: " primero" }, "."], body: "Cada caso se reordena en tiempo real según SLA, riesgo y valor del cliente. Tu equipo siempre ve lo que hay que mirar ahora.", bullets: ["Cola por SLA y valor LTV", "Riesgo de chargeback y churn", "Asignación por skill y carga"], reverse: true },
      ],
      grid: { eyebrow: "Capacidades", title: ["Diseñado para escalar", { em: " sin reglas frágiles" }, "."], items: [
        { t: "Detección de entidad", d: "Lee body, headers y attachments para identificar order, customer y carrier." },
        { t: "SLAs por marca y región", d: "Reglas de tiempo y respuesta granulares con escalado automático." },
        { t: "Asignación inteligente", d: "Round-robin, skill, carga, idioma o reglas custom." },
        { t: "Macros que aprenden", d: "Propuestas de respuesta basadas en cómo resuelves casos similares." },
        { t: "Snooze contextual", d: "Vuelve cuando llega el evento (tracking, payout, return) que esperabas." },
        { t: "Vistas compartidas", d: "Ops, finanzas y soporte miran la misma cola sin reuniones." },
      ]},
      mock: 'inbox',
    },
    en: {
      eyebrow: "Unified Inbox",
      title: ["One inbox for ", { em: "every channel" }, "."],
      lede: "Email, chat, WhatsApp, voice and forms — converge into single threads with full customer and order context.",
      primary: "Request demo",
      secondary: "See the product",
      stats: [["5", "native channels"], ["−63%", "time in triage"], ["100%", "cases with context"]],
      rows: [
        { eyebrow: "One view", title: ["Everything a case needs,", { em: " in one thread" }, "."], body: "No fragile macros or rules that break. Every conversation links to its order, payment, return, risk and SLA on entry.", bullets: ["Single multi-channel thread", "Customer, order and payment auto-detected", "Jump to Shopify, Stripe and carriers"] },
        { eyebrow: "Prioritization", title: ["Urgent first,", { em: " always" }, "."], body: "Each case reorders in real time by SLA, risk and customer value. Your team always sees what to look at now.", bullets: ["Queue by SLA and LTV", "Chargeback and churn risk", "Skill and load assignment"], reverse: true },
      ],
      grid: { eyebrow: "Capabilities", title: ["Built to scale", { em: " without brittle rules" }, "."], items: [
        { t: "Entity detection", d: "Reads body, headers and attachments to identify order, customer and carrier." },
        { t: "SLAs by brand and region", d: "Granular time and response rules with auto-escalation." },
        { t: "Smart assignment", d: "Round-robin, skill, load, language or custom rules." },
        { t: "Macros that learn", d: "Reply suggestions based on how you resolve similar cases." },
        { t: "Contextual snooze", d: "Re-opens when the event you waited for (tracking, payout, return) arrives." },
        { t: "Shared views", d: "Ops, finance and support look at the same queue without meetings." },
      ]},
      mock: 'inbox',
    }
  },

  cases: {
    es: {
      eyebrow: "Cases",
      title: ["Casos ricos, ", { em: "no tickets planos" }, "."],
      lede: "Cada caso enlaza con cliente, pedido, pago, devolución, riesgo y SLA. Una vista para entender qué está realmente roto.",
      primary: "Solicita demo",
      secondary: "Ver el producto",
      stats: [["−71%", "saltos entre tabs"], ["3.4×", "decisiones por hora"], ["0", "casos sin contexto"]],
      rows: [
        { eyebrow: "Contexto operativo", title: ["Conversación + datos,", { em: " no uno u otro" }, "."], body: "El caso no es un thread aislado: trae las entidades reales del negocio. Lo que pasó, dónde, y por qué.", bullets: ["Order, payment, return en vivo", "Estado de pago y envío sincronizados", "Snapshot a momento de la decisión"] },
        { eyebrow: "Equipo", title: ["Una vista que ", { em: "ops y soporte" }, " comparten."], body: "Sin Notion. Sin Slack threads que se pierden. El caso es la fuente de verdad.", bullets: ["Comentarios privados por rol", "Asignación cruzada ops ↔ CX", "Historial completo y firmado"], reverse: true },
      ],
      grid: { eyebrow: "Capacidades", title: ["Diseñado para casos ", { em: "que importan" }], items: [
        { t: "Timeline operativo", d: "Eventos de negocio (charges, refunds, scans, signatures) en una línea de tiempo." },
        { t: "Vista de grafo", d: "Mapa de relaciones entre entidades con saltos a sistemas de origen." },
        { t: "Conflictos visibles", d: "Promesa vs. tracking, refund vs. charge — flags explícitos al ingresar." },
        { t: "Plantillas por categoría", d: "Layouts específicos para refund, late delivery, fraud, suscripción, etc." },
        { t: "Etiquetado vivo", d: "Tags se actualizan según eventos del caso, no por copia humana." },
        { t: "Reapertura por evento", d: "El caso vuelve solo cuando llega el evento que cambiaba la respuesta." },
      ]},
      mock: 'cases',
    },
    en: {
      eyebrow: "Cases",
      title: ["Rich cases, ", { em: "not flat tickets" }, "."],
      lede: "Every case links to customer, order, payment, return, risk and SLA. One view to understand what's really broken.",
      primary: "Request demo",
      secondary: "See the product",
      stats: [["−71%", "tab-switching"], ["3.4×", "decisions per hour"], ["0", "cases without context"]],
      rows: [
        { eyebrow: "Operational context", title: ["Conversation + data,", { em: " not either-or" }, "."], body: "A case isn't an isolated thread: it carries real business entities. What happened, where, and why.", bullets: ["Live order, payment, return", "Payment and shipping state synced", "Snapshot at decision time"] },
        { eyebrow: "Team", title: ["One view ", { em: "ops and CX" }, " share."], body: "No Notion. No Slack threads lost. The case is the source of truth.", bullets: ["Private comments by role", "Cross-assignment ops ↔ CX", "Full, signed history"], reverse: true },
      ],
      grid: { eyebrow: "Capabilities", title: ["Built for cases ", { em: "that matter" }], items: [
        { t: "Operational timeline", d: "Business events (charges, refunds, scans, signatures) on one timeline." },
        { t: "Graph view", d: "Map of entity relations with jumps to source systems." },
        { t: "Visible conflicts", d: "Promise vs. tracking, refund vs. charge — explicit flags on entry." },
        { t: "Templates by category", d: "Specific layouts for refund, late delivery, fraud, subscription, etc." },
        { t: "Live tagging", d: "Tags update based on case events, not human copy." },
        { t: "Event reopen", d: "The case returns automatically when the event that mattered arrives." },
      ]},
      mock: 'cases',
    }
  },

  help_center: {
    es: {
      eyebrow: "Help Center",
      title: ["Centro de ayuda ", { em: "que tu equipo escribe una vez" }, "."],
      lede: "Artículos versionados, ligados a casos reales y consumidos por el agente IA. Una sola fuente para clientes y para automatización.",
      primary: "Solicita demo",
      secondary: "Ver el producto",
      stats: [["1×", "fuente de verdad"], ["−42%", "casos repetidos"], ["8 idiomas", "soportados"]],
      rows: [
        { eyebrow: "Una vez, en todos lados", title: ["Escribe una vez,", { em: " úsalo en todos los canales" }, "."], body: "El mismo artículo alimenta el portal público, las respuestas del agente y los borradores que ven los humanos.", bullets: ["Versionado y diffable", "Bloques reutilizables", "Traducción asistida"] },
        { eyebrow: "Cerrado por evidencia", title: ["Lo que ", { em: "realmente resuelve casos" }, "."], body: "Cada artículo trae métricas: cuántos casos cerró, cuál fue el CSAT, dónde flaquea. Lo que no funciona se reescribe.", bullets: ["Tracking de resolución", "Vacíos detectados por el agente", "Sugerencias automáticas de mejora"], reverse: true },
      ],
      grid: { eyebrow: "Capacidades", title: ["Help center ", { em: "operativo, no de marketing" }], items: [
        { t: "Editor en bloques", d: "Markdown enriquecido con bloques de pedido, política y producto." },
        { t: "Multi-marca", d: "Theming, dominio propio y artículos por marca o región." },
        { t: "Multi-idioma", d: "Detección automática y traducciones revisables artículo a artículo." },
        { t: "Saltos a casos", d: "Cada artículo lista los casos donde se usó y su resultado." },
        { t: "Aprobación editorial", d: "Workflow de revisión por roles antes de publicar." },
        { t: "Embedded search", d: "Widget nativo en tu store con resultados rankeados por contexto." },
      ]},
      mock: 'help',
    },
    en: {
      eyebrow: "Help Center",
      title: ["Help center ", { em: "your team writes once" }, "."],
      lede: "Versioned articles, linked to real cases and consumed by the AI agent. One source for customers and automation.",
      primary: "Request demo",
      secondary: "See the product",
      stats: [["1×", "source of truth"], ["−42%", "repeated cases"], ["8 languages", "supported"]],
      rows: [
        { eyebrow: "Write once, use everywhere", title: ["Write once,", { em: " use everywhere" }, "."], body: "The same article feeds the public portal, agent replies and the drafts humans see.", bullets: ["Versioned and diffable", "Reusable blocks", "Assisted translation"] },
        { eyebrow: "Closed by evidence", title: ["What ", { em: "actually resolves cases" }, "."], body: "Every article carries metrics: how many cases it closed, CSAT, where it falls short. What doesn't work gets rewritten.", bullets: ["Resolution tracking", "Gaps detected by the agent", "Automatic improvement suggestions"], reverse: true },
      ],
      grid: { eyebrow: "Capabilities", title: ["Operational help center, ", { em: "not marketing" }], items: [
        { t: "Block editor", d: "Rich markdown with order, policy and product blocks." },
        { t: "Multi-brand", d: "Theming, custom domain and articles by brand or region." },
        { t: "Multi-language", d: "Auto-detection and reviewable translations per article." },
        { t: "Jump to cases", d: "Each article lists the cases that used it and their outcome." },
        { t: "Editorial approval", d: "Review workflow by role before publishing." },
        { t: "Embedded search", d: "Native widget in your store with context-ranked results." },
      ]},
      mock: 'help',
    }
  },

  reporting: {
    es: {
      eyebrow: "Reporting",
      title: ["Reporting que ", { em: "operaciones lee a diario" }, "."],
      lede: "Métricas reales: AHT, FCR, CSAT, auto-resolución, conflictos detectados, exceptions. Sin construir dashboards.",
      primary: "Solicita demo",
      secondary: "Ver el producto",
      stats: [["+18%", "casos resueltos"], ["−24%", "AHT"], ["+9pt", "auto-resolución"]],
      rows: [
        { eyebrow: "Métricas que importan", title: ["Lo que un VP de Ops ", { em: "mira en lunes" }, "."], body: "Volumen, AHT, FCR, CSAT, riesgo y exceptions — segmentado por canal, marca, región y motivo.", bullets: ["KPIs out-of-the-box", "Segmentación libre", "Comparativa semana a semana"] },
        { eyebrow: "Causa raíz", title: ["No solo ", { em: "qué pasó" }, " — por qué."], body: "Tendencias, anomalías y categorías que crecen. Vista desde la data, no desde un comité.", bullets: ["Detección de anomalías", "Top causas por marca", "Drill-down hasta el caso"], reverse: true },
      ],
      grid: { eyebrow: "Capacidades", title: ["Datos confiables, ", { em: "no slides" }], items: [
        { t: "KPIs estables", d: "Definiciones documentadas y consistentes a través de releases." },
        { t: "Drill-down", d: "De KPI a caso individual en un click. Reproducible y firmado." },
        { t: "Export a warehouse", d: "Streaming a Snowflake, BigQuery, Redshift, Datadog." },
        { t: "Alertas", d: "Slack y email cuando un KPI se desvía de su banda esperada." },
        { t: "Reportes programados", d: "PDF y CSV en tu inbox cada lunes a las 09:00." },
        { t: "Comparativa de cohortes", d: "Casos por categoría, marca, región o equipo." },
      ]},
      mock: 'reporting',
    },
    en: {
      eyebrow: "Reporting",
      title: ["Reporting ops ", { em: "actually reads daily" }, "."],
      lede: "Real metrics: AHT, FCR, CSAT, auto-resolution, detected conflicts, exceptions. No dashboards to build.",
      primary: "Request demo",
      secondary: "See the product",
      stats: [["+18%", "cases resolved"], ["−24%", "AHT"], ["+9pt", "auto-resolution"]],
      rows: [
        { eyebrow: "Metrics that matter", title: ["What a VP of Ops ", { em: "looks at on Monday" }, "."], body: "Volume, AHT, FCR, CSAT, risk and exceptions — segmented by channel, brand, region and reason.", bullets: ["Out-of-the-box KPIs", "Free segmentation", "Week-over-week comparison"] },
        { eyebrow: "Root cause", title: ["Not just ", { em: "what happened" }, " — why."], body: "Trends, anomalies and categories that grow. View from the data, not from a committee.", bullets: ["Anomaly detection", "Top causes by brand", "Drill-down to the case"], reverse: true },
      ],
      grid: { eyebrow: "Capabilities", title: ["Trustworthy data, ", { em: "not slides" }], items: [
        { t: "Stable KPIs", d: "Documented and consistent definitions across releases." },
        { t: "Drill-down", d: "From KPI to individual case in one click. Reproducible and signed." },
        { t: "Warehouse export", d: "Streaming to Snowflake, BigQuery, Redshift, Datadog." },
        { t: "Alerts", d: "Slack and email when a KPI drifts outside its expected band." },
        { t: "Scheduled reports", d: "PDF and CSV in your inbox every Monday at 09:00." },
        { t: "Cohort comparison", d: "Cases by category, brand, region or team." },
      ]},
      mock: 'reporting',
    }
  },

  policy_engine: {
    es: {
      eyebrow: "Policy Engine",
      title: ["Reglas en lenguaje natural,", { em: " guardas verificables" }, "."],
      lede: "Refunds, cancelaciones y compensaciones se ejecutan bajo reglas, permisos y aprobación humana. Define en plain English, ejecuta con control.",
      primary: "Solicita demo",
      secondary: "Ver el producto",
      stats: [["100%", "acciones con guarda"], ["−85%", "exceptions ad-hoc"], ["1 tarde", "para escribir la primera"]],
      rows: [
        { eyebrow: "Plain English", title: ["Lo escribe legal,", { em: " producción lo respeta" }, "."], body: "Compila a YAML auditable. Versionado, diffable, revisable como código. Sin DSLs raros.", bullets: ["Author en plain English", "Compila a guardas tipadas", "Diff y revisión por PR"] },
        { eyebrow: "Sandbox", title: ["Pruébalo contra ", { em: "el histórico real" }, "."], body: "Antes de activar un cambio, mira qué casos del último mes habrían cambiado de resultado. Sin sorpresas.", bullets: ["Dry-run sobre 30 días", "Diff de outcomes", "Activación gradual por marca"], reverse: true },
      ],
      grid: { eyebrow: "Capacidades", title: ["Governance ", { em: "que se pone hoy" }], items: [
        { t: "Aprobaciones en línea", d: "El aprobador ve caso, evidencia y efecto exacto antes de firmar." },
        { t: "Doble check", d: "Acciones críticas requieren dos aprobadores con roles definidos." },
        { t: "Límites composables", d: "Por monto, motivo, cliente, marca, hora, riesgo. Combinables." },
        { t: "Excepciones explícitas", d: "Override con razón obligatoria, firmada y reportable." },
        { t: "Versionado", d: "Cada política es una versión. Rollback en un click." },
        { t: "Audit-ready", d: "Cada decisión queda firmada con la versión vigente al momento." },
      ]},
      mock: 'policy',
    },
    en: {
      eyebrow: "Policy Engine",
      title: ["Rules in plain English,", { em: " verifiable guards" }, "."],
      lede: "Refunds, cancellations and goodwill run under rules, permissions and human approval. Author in plain English, execute with control.",
      primary: "Request demo",
      secondary: "See the product",
      stats: [["100%", "guarded actions"], ["−85%", "ad-hoc exceptions"], ["1 afternoon", "to write the first"]],
      rows: [
        { eyebrow: "Plain English", title: ["Legal writes it,", { em: " production respects it" }, "."], body: "Compiles to auditable YAML. Versioned, diffable, reviewable like code. No weird DSLs.", bullets: ["Authored in plain English", "Compiles to typed guards", "Diff and review via PR"] },
        { eyebrow: "Sandbox", title: ["Test against ", { em: "real history" }, "."], body: "Before activating a change, see which cases in the last month would have changed outcome. No surprises.", bullets: ["Dry-run over 30 days", "Outcome diff", "Gradual rollout by brand"], reverse: true },
      ],
      grid: { eyebrow: "Capabilities", title: ["Governance ", { em: "that ships today" }], items: [
        { t: "Inline approvals", d: "The approver sees case, evidence and exact effect before signing." },
        { t: "Double check", d: "Critical actions require two approvers with defined roles." },
        { t: "Composable limits", d: "By amount, reason, customer, brand, hour, risk. Composable." },
        { t: "Explicit exceptions", d: "Override with required reason, signed and reportable." },
        { t: "Versioning", d: "Every policy is a version. One-click rollback." },
        { t: "Audit-ready", d: "Each decision is signed with the active version at decision time." },
      ]},
      mock: 'policy',
    }
  },

  audit_log: {
    es: {
      eyebrow: "Audit log",
      title: ["Cada acción,", { em: " firmada y reproducible" }, "."],
      lede: "Toda ejecución del agente queda registrada con su evidencia, prompt, datos consultados y firmante. Lista para una auditoría real.",
      primary: "Solicita demo",
      secondary: "Ver el producto",
      stats: [["SOC 2", "Type II"], ["GDPR", "compliant"], ["100%", "acciones sealed"]],
      rows: [
        { eyebrow: "Trazabilidad", title: ["Quién, cuándo,", { em: " con qué evidencia" }, "."], body: "Cada evento se sella con timestamp, actor, hash de evidencia y firma criptográfica. No editable.", bullets: ["Timestamps y actor por evento", "Hash de evidencia consultada", "Firma criptográfica"] },
        { eyebrow: "Replay", title: ["Reconstruye ", { em: "exactamente qué vio" }, " el agente."], body: "En cualquier momento del pasado, podemos reproducir su contexto, su prompt y su decisión. Determinista.", bullets: ["Replay determinista", "Snapshot de contexto", "Comparación con outcome real"], reverse: true },
      ],
      grid: { eyebrow: "Capacidades", title: ["Listo para ", { em: "auditoría real" }], items: [
        { t: "Export a SIEM", d: "Streaming a Datadog, Splunk con esquemas estables y documentados." },
        { t: "Export a warehouse", d: "BigQuery, Snowflake, Redshift. Para análisis y reporting interno." },
        { t: "PII redaction", d: "Campos sensibles redactados antes de tocar el modelo." },
        { t: "Retención configurable", d: "Por evento, por categoría y por región (residency)." },
        { t: "Acceso por rol", d: "Lectura granular por equipo, marca o tipo de evento." },
        { t: "Hash chain", d: "Eventos encadenados — manipulación detectable." },
      ]},
      mock: 'audit',
    },
    en: {
      eyebrow: "Audit log",
      title: ["Every action,", { em: " signed and reproducible" }, "."],
      lede: "Every agent execution is recorded with its evidence, prompt, queried data and signer. Ready for a real audit.",
      primary: "Request demo",
      secondary: "See the product",
      stats: [["SOC 2", "Type II"], ["GDPR", "compliant"], ["100%", "actions sealed"]],
      rows: [
        { eyebrow: "Traceability", title: ["Who, when,", { em: " with what evidence" }, "."], body: "Every event is sealed with timestamp, actor, evidence hash and cryptographic signature. Not editable.", bullets: ["Timestamps and actor per event", "Hash of queried evidence", "Cryptographic signature"] },
        { eyebrow: "Replay", title: ["Reconstruct ", { em: "exactly what the agent saw" }, "."], body: "At any past point, we can reproduce its context, prompt and decision. Deterministic.", bullets: ["Deterministic replay", "Context snapshot", "Compare with real outcome"], reverse: true },
      ],
      grid: { eyebrow: "Capabilities", title: ["Ready for ", { em: "real audit" }], items: [
        { t: "SIEM export", d: "Streaming to Datadog, Splunk with stable, documented schemas." },
        { t: "Warehouse export", d: "BigQuery, Snowflake, Redshift. For analysis and internal reporting." },
        { t: "PII redaction", d: "Sensitive fields redacted before reaching the model." },
        { t: "Configurable retention", d: "By event, category and region (residency)." },
        { t: "Role-based access", d: "Granular read by team, brand or event type." },
        { t: "Hash chain", d: "Chained events — tamper detectable." },
      ]},
      mock: 'audit',
    }
  },

  copilot: {
    es: {
      eyebrow: "Copilot",
      title: ["Un copiloto ", { em: "que ya leyó el caso" }, "."],
      lede: "Un asistente al lado de cada agente humano: redacta, sugiere acciones, cita fuentes y respeta tus políticas — sin que tengas que prompt-hackear.",
      primary: "Solicita demo",
      secondary: "Ver el producto",
      stats: [["6×", "casos por agente"], ["91%", "borradores aprobados"], ["02:14", "tiempo medio"]],
      rows: [
        { eyebrow: "Borrador instantáneo", title: ["Empieza con ", { em: "el 80% ya escrito" }, "."], body: "El copiloto lee el caso, consulta tus sistemas y entrega un borrador con tono, política y datos correctos. Tú editas y envías.", bullets: ["Tono y voz por marca", "Política aplicada de fábrica", "Variables ya rellenadas"] },
        { eyebrow: "Cita fuentes", title: ["Cada conclusión,", { em: " con su evidencia" }, "."], body: "Si dice que el cargo se duplicó, el link a Stripe está al lado. Si propone un refund, la política aplicable está citada.", bullets: ["Links a sistema de origen", "Política citada por línea", "Modo solo-lectura para juniors"], reverse: true },
      ],
      grid: { eyebrow: "Capacidades", title: ["Diseñado para ", { em: "humanos rápidos" }], items: [
        { t: "Atajos de teclado", d: "Generar borrador, aplicar política, ejecutar — todo desde el teclado." },
        { t: "Multi-idioma", d: "Detección y respuesta en el idioma del cliente, manteniendo el tono." },
        { t: "Modo investigación", d: "Pregúntale qué pasó: el copiloto explora y resume con citas." },
        { t: "Resumen de caso", d: "Bajada ejecutiva en 3 líneas para escalado o handoff." },
        { t: "Sugerencia de acción", d: "Propone refund, cancel, re-ship con su política y guardas." },
        { t: "Tono ajustable", d: "Empático, directo, formal, breve — por marca o por canal." },
      ]},
      mock: 'copilot',
    },
    en: {
      eyebrow: "Copilot",
      title: ["A copilot ", { em: "that already read the case" }, "."],
      lede: "An assistant next to every human agent: drafts, suggests actions, cites sources and respects your policies — no prompt-hacking required.",
      primary: "Request demo",
      secondary: "See the product",
      stats: [["6×", "cases per agent"], ["91%", "drafts approved"], ["02:14", "average time"]],
      rows: [
        { eyebrow: "Instant draft", title: ["Start with ", { em: "80% already written" }, "."], body: "The copilot reads the case, queries your systems and delivers a draft with the right tone, policy and data. You edit and send.", bullets: ["Brand tone and voice", "Policy applied by default", "Variables pre-filled"] },
        { eyebrow: "Cites sources", title: ["Every conclusion,", { em: " with its evidence" }, "."], body: "If it says the charge was duplicated, the Stripe link is right there. If it proposes a refund, the applicable policy is cited.", bullets: ["Links to source-of-truth", "Policy cited per line", "Read-only mode for juniors"], reverse: true },
      ],
      grid: { eyebrow: "Capabilities", title: ["Built for ", { em: "fast humans" }], items: [
        { t: "Keyboard shortcuts", d: "Generate draft, apply policy, execute — all from the keyboard." },
        { t: "Multi-language", d: "Detect and reply in the customer's language, keeping tone." },
        { t: "Research mode", d: "Ask it what happened: the copilot explores and summarizes with citations." },
        { t: "Case summary", d: "Three-line executive summary for escalation or handoff." },
        { t: "Action suggestion", d: "Proposes refund, cancel, re-ship with its policy and guards." },
        { t: "Adjustable tone", d: "Empathetic, direct, formal, brief — by brand or channel." },
      ]},
      mock: 'copilot',
    }
  },
};

const MOCKS = { inbox: MockInbox, cases: MockCases, help: MockHelpCenter, reporting: MockReporting, policy: MockPolicy, audit: MockAudit, copilot: MockCopilot };

function makeCapPage(key) {
  return function CapPage({ t, lang }) {
    const FinalCTA = window.FinalCTA;
    const data = (CAP_COPY[key] && (CAP_COPY[key][lang] || CAP_COPY[key].es)) || null;
    if (!data) return <main><section className="hero wrap"><h1 className="h-display">Coming soon.</h1></section></main>;
    const Mock = MOCKS[data.mock] || (() => null);

    // Pull extra sections (deepDive, useCases, integrations, faq, related)
    // from capabilities-extra.jsx if available — otherwise the page renders the
    // legacy short layout. This keeps backward compatibility while letting
    // each capability ship a much richer page.
    const extras = window.CapExtras?.data?.[key]?.[lang] || window.CapExtras?.data?.[key]?.es || null;
    const cmp = window.CapExtras?.components || {};
    const { CapDeepDive, CapUseCases, CapIntegrations, CapFAQ, CapRelated, CapGradientBlock } = cmp;

    return (
      <main className="cap-page">
        <CapHero eyebrow={data.eyebrow} title={data.title} lede={data.lede} primary={data.primary} secondary={data.secondary} lang={lang} />
        <section className="cap-hero-mock-wrap wrap reveal"><Mock /></section>
        <CapStats items={data.stats} />

        {/* Original two feature rows */}
        {data.rows.map((r, i) => (
          <CapFeatureRow key={i} eyebrow={r.eyebrow} title={r.title} body={r.body} bullets={r.bullets} reverse={r.reverse}>
            <Mock />
          </CapFeatureRow>
        ))}

        {/* Deep dive: split row with gradient + numbered bullets */}
        {extras?.deepDive && CapDeepDive && (
          <CapDeepDive {...extras.deepDive} />
        )}

        {/* Original 6-card grid */}
        <CapGrid3 eyebrow={data.grid.eyebrow} title={data.grid.title} items={data.grid.items} />

        {/* Real-world use cases */}
        {extras?.useCases && CapUseCases && (
          <CapUseCases {...extras.useCases} />
        )}

        {/* Integrations strip */}
        {extras?.integrations && CapIntegrations && (
          <CapIntegrations {...extras.integrations} />
        )}

        {/* FAQ */}
        {extras?.faq && CapFAQ && (
          <CapFAQ {...extras.faq} />
        )}

        {/* Related capabilities */}
        {extras?.related && CapRelated && (
          <CapRelated {...extras.related} />
        )}

        {FinalCTA && <FinalCTA t={t} />}
      </main>
    );
  };
}

window.UnifiedInboxPage = makeCapPage('unified_inbox');
window.CasesPage = makeCapPage('cases');
window.HelpCenterPage = makeCapPage('help_center');
window.ReportingPage = makeCapPage('reporting');
window.PolicyEnginePage = makeCapPage('policy_engine');
window.AuditLogPage = makeCapPage('audit_log');
window.CopilotPage = makeCapPage('copilot');
