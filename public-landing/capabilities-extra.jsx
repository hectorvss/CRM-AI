/* ============================================================================
   capabilities-extra.jsx
   ----------------------------------------------------------------------------
   Extended sections for the per-capability pages: gradient hero illustrations,
   use-case scenarios, integration strips, FAQ, related capabilities, and
   second-level "deep dive" feature blocks.

   The main capabilities.jsx file consumes this via window.CapExtras and
   renders the additional sections after the base hero/stats/rows/grid.
   ============================================================================ */

/* ------------------------------------------------------------ Gradient hero */

function CapGradientBlock({ tone = 'indigo', label, sub }) {
  // Each tone yields a different gradient. The block is decorative and meant
  // to fill the visual slots that previously sat empty in feature rows.
  const TONES = {
    indigo:  ['#6366f1', '#a855f7', '#ec4899'],
    teal:    ['#14b8a6', '#06b6d4', '#3b82f6'],
    sunset:  ['#f97316', '#ec4899', '#8b5cf6'],
    forest:  ['#10b981', '#84cc16', '#facc15'],
    royal:   ['#1e3a8a', '#7c3aed', '#0ea5e9'],
    rose:    ['#fb7185', '#f59e0b', '#f43f5e'],
    slate:   ['#0f172a', '#334155', '#64748b'],
  };
  const c = TONES[tone] || TONES.indigo;
  return (
    <div className="cap-gradient-block">
      <svg viewBox="0 0 600 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id={`gr-${tone}-a`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c[0]} />
            <stop offset="60%" stopColor={c[1]} />
            <stop offset="100%" stopColor={c[2]} />
          </linearGradient>
          <radialGradient id={`gr-${tone}-b`} cx="20%" cy="20%" r="60%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <radialGradient id={`gr-${tone}-c`} cx="80%" cy="90%" r="55%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.35)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
        <rect width="600" height="360" fill={`url(#gr-${tone}-a)`} />
        <rect width="600" height="360" fill={`url(#gr-${tone}-b)`} />
        <rect width="600" height="360" fill={`url(#gr-${tone}-c)`} />
        {/* Subtle grid overlay */}
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={`v${i}`} x1={50 * i} x2={50 * i} y1="0" y2="360" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={`h${i}`} x1="0" x2="600" y1={45 * i} y2={45 * i} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {/* Floating circle */}
        <circle cx="460" cy="120" r="60" fill="rgba(255,255,255,0.18)" />
        <circle cx="460" cy="120" r="34" fill="rgba(255,255,255,0.32)" />
      </svg>
      {label && (
        <div className="cap-gradient-label">
          <span className="cap-gradient-label-eyebrow">{sub}</span>
          <span className="cap-gradient-label-title">{label}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Use cases */

function CapUseCases({ eyebrow, title, items }) {
  const renderTitleParts = window.renderTitleParts;
  return (
    <section className="section cap-usecases">
      <div className="wrap">
        <div className="reveal" style={{ display: 'grid', gap: 18, maxWidth: 720, marginBottom: 56 }}>
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="h-section">{Array.isArray(title) ? renderTitleParts(title) : title}</h2>
        </div>
        <div className="cap-usecases-grid reveal-children">
          {items.map((it, i) => (
            <article key={i} className="cap-usecase-card">
              <div className="cap-usecase-body">
                <span className="cap-usecase-tag">{it.tag}</span>
                <h4>{it.title}</h4>
                <p className="cap-usecase-scenario"><b>Scenario.</b> {it.scenario}</p>
                <p className="cap-usecase-outcome"><b>Outcome.</b> {it.outcome}</p>
                {it.metric && <div className="cap-usecase-metric"><span>{it.metric.value}</span> {it.metric.label}</div>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Integrations strip */

function CapIntegrations({ eyebrow, title, body, items }) {
  const renderTitleParts = window.renderTitleParts;
  return (
    <section className="section cap-integrations">
      <div className="wrap">
        <div className="cap-integrations-head reveal" style={{ display: 'grid', gap: 18, maxWidth: 760, marginBottom: 48 }}>
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="h-section">{Array.isArray(title) ? renderTitleParts(title) : title}</h2>
          {body && <p className="lede">{body}</p>}
        </div>
        <div className="cap-integrations-grid reveal-children">
          {items.map((it, i) => (
            <div key={i} className={`cap-integration-card tone-${it.tone || 'slate'}`}>
              <div className="cap-integration-logo">{it.icon || it.name.slice(0, 2).toUpperCase()}</div>
              <div className="cap-integration-name">{it.name}</div>
              <div className="cap-integration-what">{it.what}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ FAQ */

function CapFAQ({ eyebrow, title, items }) {
  const [openIdx, setOpenIdx] = React.useState(0);
  const renderTitleParts = window.renderTitleParts;
  return (
    <section className="section cap-faq">
      <div className="wrap">
        <div className="reveal" style={{ display: 'grid', gap: 18, maxWidth: 720, marginBottom: 40 }}>
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="h-section">{Array.isArray(title) ? renderTitleParts(title) : title}</h2>
        </div>
        <div className="cap-faq-list reveal-children">
          {items.map((q, i) => (
            <div key={i} className={`cap-faq-item ${openIdx === i ? 'is-open' : ''}`}>
              <button className="cap-faq-q" onClick={() => setOpenIdx(openIdx === i ? -1 : i)}>
                <span>{q.q}</span>
                <span className="cap-faq-toggle">{openIdx === i ? '−' : '+'}</span>
              </button>
              {openIdx === i && <div className="cap-faq-a">{q.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Related capabilities */

function CapRelated({ eyebrow, title, items }) {
  const renderTitleParts = window.renderTitleParts;
  return (
    <section className="section cap-related">
      <div className="wrap">
        <div className="reveal" style={{ display: 'grid', gap: 18, maxWidth: 720, marginBottom: 48 }}>
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="h-section">{Array.isArray(title) ? renderTitleParts(title) : title}</h2>
        </div>
        <div className="cap-related-grid reveal-children">
          {items.map((r, i) => (
            <a key={i} href={r.href} className="cap-related-card">
              <div className="cap-related-body">
                <span className="cap-related-tag">{r.tag || 'Capability'}</span>
                <h4>{r.title}</h4>
                <p>{r.summary}</p>
                <span className="cap-related-arrow">Learn more <span>→</span></span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Deep dive (split row with gradient) */

function CapDeepDive({ eyebrow, title, body, bullets, metric }) {
  const renderTitleParts = window.renderTitleParts;
  return (
    <section className="section cap-deepdive">
      <div className="wrap cap-deepdive-inner-single reveal">
        <span className="eyebrow">{eyebrow}</span>
        <h2 className="h-section">{Array.isArray(title) ? renderTitleParts(title) : title}</h2>
        <p className="lede">{body}</p>
        <ul className="cap-deepdive-bullets cap-deepdive-bullets--cols">
          {bullets.map((b, i) => (
            <li key={i}>
              <span className="cap-deepdive-num">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <strong>{b.t}</strong>
                <span>{b.d}</span>
              </div>
            </li>
          ))}
        </ul>
        {metric && (
          <div className="cap-deepdive-metric">
            <div className="cap-deepdive-metric-num">{metric.value}</div>
            <div className="cap-deepdive-metric-lab">{metric.label}</div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ============================================================================
   Per-capability extra content (use cases, integrations, FAQ, related, deep dive)
   ============================================================================ */

const CAP_EXTRA = {

  /* ----------------------------- Bandeja unificada ------------------------- */

  unified_inbox: {
    es: {
      deepDive: {
        eyebrow: "Cómo funciona en producción",
        title: ["Del email caótico al ", { em: "hilo enriquecido" }, ", en menos de un segundo."],
        body: "Cada mensaje entrante pasa por un pipeline canónico que detecta entidades, normaliza eventos y enlaza con la fuente de verdad antes de llegar a la cola.",
        bullets: [
          { t: "Ingesta multi-canal", d: "Webhooks de Postmark, Twilio, WhatsApp BSP y formularios convergen en un canonical event." },
          { t: "Detección de entidad", d: "Order, customer, payment y carrier identificados desde body, headers y attachments." },
          { t: "Conciliación cruzada", d: "Si Stripe dice refund y Shopify dice open, el caso entra ya con el conflicto marcado." },
          { t: "Asignación con guardas", d: "Skill, idioma, marca, carga, riesgo — combinables como reglas declarativas." },
        ],
        tone: "indigo",
        metric: { value: "<1s", label: "p95 latencia de ingesta" },
      },
      useCases: {
        eyebrow: "Casos reales",
        title: ["Para los momentos en que ", { em: "todo se acumula" }],
        items: [
          {
            tag: "Email + WhatsApp",
            tone: "indigo",
            title: "Cliente escribe por dos canales sobre el mismo pedido",
            scenario: "Una clienta abre un email pidiendo cancelar, y 3 minutos después manda un WhatsApp porque el email no le llega rápido.",
            outcome: "Clain reconoce el order_id, fusiona ambos hilos en un solo caso, y el agente solo responde una vez con el contexto completo.",
            metric: { value: "−47%", label: "casos duplicados" },
          },
          {
            tag: "SLA crítico",
            tone: "sunset",
            title: "Late delivery a 2h del breach",
            scenario: "Un envío express va con retraso. El email del cliente llega 2 horas antes de que se dispare el SLA premium.",
            outcome: "El caso entra con el flag `sla_at_risk`, salta a la cola P1 y notifica a Ops. Compensación automática propuesta.",
            metric: { value: "0", label: "SLA breaches el último mes" },
          },
          {
            tag: "Voz transcrita",
            tone: "teal",
            title: "Llamada inbound se convierte en caso",
            scenario: "Cliente llama por un cargo doble. La llamada se transcribe en tiempo real y el operador ve los datos del pago a la vez.",
            outcome: "La transcripción se enlaza al caso, el agente sugiere refund parcial, el operador firma con un click.",
            metric: { value: "02:14", label: "tiempo medio en cola" },
          },
        ],
      },
      integrations: {
        eyebrow: "Conecta con tu stack",
        title: ["Bandeja conectada a ", { em: "todo lo que importa" }],
        body: "Sin sincronizaciones nocturnas: cada plataforma habla en tiempo real con la bandeja unificada.",
        items: [
          { name: "Postmark", icon: "✉", what: "Email transaccional in/out", tone: "indigo" },
          { name: "WhatsApp BSP", icon: "💬", what: "Mensajería oficial Meta", tone: "forest" },
          { name: "Twilio", icon: "📞", what: "Voice + SMS bidirectional", tone: "rose" },
          { name: "Shopify", icon: "🛍", what: "Order + customer sync", tone: "teal" },
          { name: "Stripe", icon: "💳", what: "Payment events stream", tone: "royal" },
          { name: "Zendesk", icon: "🛟", what: "Migration + dual-run", tone: "sunset" },
          { name: "Intercom", icon: "💭", what: "Migration + dual-run", tone: "indigo" },
          { name: "Gorgias", icon: "🛒", what: "Migration + dual-run", tone: "rose" },
        ],
      },
      faq: {
        eyebrow: "Preguntas frecuentes",
        title: ["Lo que ", { em: "siempre nos preguntan" }],
        items: [
          { q: "¿Reemplaza a Zendesk o Front?", a: "No es obligatorio. Puedes correr Clain en paralelo a tu helpdesk actual usando los webhooks. Muchos equipos hacen un dual-run de 30-60 días antes de migrar del todo." },
          { q: "¿Qué canales soporta nativamente?", a: "Email (IMAP/SMTP + Postmark), Chat web, WhatsApp Business, Voz vía Twilio (con transcripción) y Forms. Cualquier canal adicional vía webhook genérico." },
          { q: "¿Cómo detecta el pedido en un email?", a: "Pipeline de varias capas: regex para IDs comunes, lookup por email del remitente, búsqueda por texto en order metadata, y NER vía LLM cuando los anteriores no encuentran match." },
          { q: "¿Qué pasa si dos agentes responden a la vez?", a: "Locking optimista en el cliente: cuando un agente abre el caso, los demás ven un indicador. Si dos guardan a la vez, se hace merge automático con resolución manual." },
          { q: "¿Hay límite de canales por workspace?", a: "Plan Starter: 3 canales. Growth: 8. Scale: ilimitado. Cada conexión se factura una sola vez por workspace." },
        ],
      },
      related: {
        eyebrow: "Sigue explorando",
        title: ["Capacidades que ", { em: "se complementan" }],
        items: [
          { href: "#/cases", tag: "Cases", title: "Cases ricos, no tickets planos", summary: "Cada caso enlaza con cliente, pedido, pago, devolución, riesgo y SLA.", tone: "teal" },
          { href: "#/copilot", tag: "Copilot", title: "Un copiloto al lado del humano", summary: "Borrador instantáneo con citas, política y datos correctos.", tone: "sunset" },
          { href: "#/policy-engine", tag: "Policy", title: "Policy Engine con plain English", summary: "Refunds, cancelaciones y compensaciones bajo guardas verificables.", tone: "royal" },
        ],
      },
    },
    en: {
      deepDive: {
        eyebrow: "How it works in production",
        title: ["From chaotic email to ", { em: "enriched thread" }, " in under a second."],
        body: "Every inbound message goes through a canonical pipeline that detects entities, normalizes events and links to the source of truth before reaching the queue.",
        bullets: [
          { t: "Multi-channel ingest", d: "Webhooks from Postmark, Twilio, WhatsApp BSP and forms converge into a canonical event." },
          { t: "Entity detection", d: "Order, customer, payment and carrier identified from body, headers and attachments." },
          { t: "Cross-system reconciliation", d: "If Stripe says refund and Shopify says open, the case enters with the conflict already flagged." },
          { t: "Guarded assignment", d: "Skill, language, brand, load, risk — composable as declarative rules." },
        ],
        tone: "indigo",
        metric: { value: "<1s", label: "p95 ingest latency" },
      },
      useCases: {
        eyebrow: "Real cases",
        title: ["For the moments when ", { em: "everything piles up" }],
        items: [
          {
            tag: "Email + WhatsApp",
            tone: "indigo",
            title: "Customer writes on two channels about the same order",
            scenario: "A customer opens an email asking to cancel, then 3 minutes later sends a WhatsApp because the email isn't getting through fast enough.",
            outcome: "Clain recognizes the order_id, merges both threads into a single case, and the agent answers once with full context.",
            metric: { value: "−47%", label: "duplicate cases" },
          },
          {
            tag: "Critical SLA",
            tone: "sunset",
            title: "Late delivery 2h before breach",
            scenario: "An express shipment is delayed. The customer's email arrives 2 hours before the premium SLA fires.",
            outcome: "Case enters with `sla_at_risk` flag, jumps to P1 queue and notifies Ops. Goodwill auto-proposed.",
            metric: { value: "0", label: "SLA breaches last month" },
          },
          {
            tag: "Transcribed voice",
            tone: "teal",
            title: "Inbound call becomes a case",
            scenario: "Customer calls about a duplicate charge. The call is transcribed in real time and the operator sees the payment data live.",
            outcome: "Transcript links to the case, agent suggests partial refund, operator signs with one click.",
            metric: { value: "02:14", label: "average queue time" },
          },
        ],
      },
      integrations: {
        eyebrow: "Connect with your stack",
        title: ["Inbox connected to ", { em: "everything that matters" }],
        body: "No nightly syncs: every platform talks to the unified inbox in real time.",
        items: [
          { name: "Postmark", icon: "✉", what: "Transactional email in/out", tone: "indigo" },
          { name: "WhatsApp BSP", icon: "💬", what: "Official Meta messaging", tone: "forest" },
          { name: "Twilio", icon: "📞", what: "Voice + SMS bidirectional", tone: "rose" },
          { name: "Shopify", icon: "🛍", what: "Order + customer sync", tone: "teal" },
          { name: "Stripe", icon: "💳", what: "Payment events stream", tone: "royal" },
          { name: "Zendesk", icon: "🛟", what: "Migration + dual-run", tone: "sunset" },
          { name: "Intercom", icon: "💭", what: "Migration + dual-run", tone: "indigo" },
          { name: "Gorgias", icon: "🛒", what: "Migration + dual-run", tone: "rose" },
        ],
      },
      faq: {
        eyebrow: "FAQ",
        title: ["What ", { em: "people always ask" }],
        items: [
          { q: "Does it replace Zendesk or Front?", a: "Not required. You can run Clain in parallel to your existing helpdesk via webhooks. Many teams dual-run for 30-60 days before fully migrating." },
          { q: "Which channels are native?", a: "Email (IMAP/SMTP + Postmark), Web chat, WhatsApp Business, Voice via Twilio (with transcription) and Forms. Any extra channel via generic webhook." },
          { q: "How does it detect the order from an email?", a: "Multi-layer pipeline: regex for common IDs, lookup by sender email, full-text search in order metadata, and LLM-based NER as fallback." },
          { q: "What if two agents reply at once?", a: "Optimistic client-side locking: when an agent opens the case, others see an indicator. If two save concurrently, automatic merge with manual resolution." },
          { q: "Channel limits per workspace?", a: "Starter: 3 channels. Growth: 8. Scale: unlimited. Each connection billed once per workspace." },
        ],
      },
      related: {
        eyebrow: "Keep exploring",
        title: ["Capabilities that ", { em: "fit together" }],
        items: [
          { href: "#/cases", tag: "Cases", title: "Rich cases, not flat tickets", summary: "Every case links to customer, order, payment, return, risk and SLA.", tone: "teal" },
          { href: "#/copilot", tag: "Copilot", title: "A copilot next to the human", summary: "Instant draft with citations, policy and correct data.", tone: "sunset" },
          { href: "#/policy-engine", tag: "Policy", title: "Plain-English Policy Engine", summary: "Refunds, cancellations and goodwill under verifiable guards.", tone: "royal" },
        ],
      },
    },
  },

  /* ----------------------------- Cases ------------------------------------ */

  cases: {
    es: {
      deepDive: {
        eyebrow: "Anatomía de un caso",
        title: ["Lo que un caso de Clain ", { em: "sabe sobre sí mismo" }],
        body: "No es un thread con metadatos: es un grafo de entidades reales con timeline operativo, conflictos detectados y plan de resolución.",
        bullets: [
          { t: "Entidades vinculadas", d: "Customer, order, payment, return, carrier, brand. Todo en vivo, no copiado al crear." },
          { t: "Timeline operativo", d: "Eventos de negocio (charges, refunds, scans, signatures) ordenados cronológicamente." },
          { t: "Conflictos detectados", d: "Promise vs. tracking, refund vs. charge, return vs. inventory — explícitos y accionables." },
          { t: "Plan de resolución", d: "Pasos sugeridos, sus precondiciones y el resultado esperado de cada uno." },
        ],
        tone: "teal",
        metric: { value: "8", label: "entidades por caso (media)" },
      },
      useCases: {
        eyebrow: "Casos reales",
        title: ["Cuando el caso ", { em: "tiene que ser un caso" }],
        items: [
          {
            tag: "Refund con devolución parcial",
            tone: "teal",
            title: "Cargo duplicado tras devolución parcial",
            scenario: "Un cliente devuelve 1 de 3 productos. Stripe duplica el cargo de lo retenido. El cliente reclama.",
            outcome: "El caso muestra los 3 line items, los 2 charges y el RMA, con el conflicto marcado. Refund propuesto: €92.10.",
            metric: { value: "01:48", label: "tiempo medio a resolución" },
          },
          {
            tag: "Late delivery + chargeback",
            tone: "sunset",
            title: "Cliente abre disputa antes del breach",
            scenario: "El paquete lleva 4 días sin escaneo. Cliente abre disputa con el banco. Llega el chargeback notice.",
            outcome: "El caso pre-existe del SLA monitor, contiene el tracking y el chargeback. Acción: refund + carrier claim.",
            metric: { value: "−68%", label: "chargebacks en los que perdimos" },
          },
          {
            tag: "Suscripción cancelada",
            tone: "royal",
            title: "Churn investigado en una vista",
            scenario: "Cliente Premium cancela. Quieres saber si fue un caso mal resuelto, un fallo de envío o un upsell perdido.",
            outcome: "El caso muestra el último año de pedidos, devoluciones, contactos y tags de fricción. Ruta clara para retención.",
            metric: { value: "+12pt", label: "retención post-investigación" },
          },
        ],
      },
      integrations: {
        eyebrow: "Datos de fuentes confiables",
        title: ["Cada caso tira de ", { em: "fuentes de verdad" }],
        items: [
          { name: "Shopify", icon: "🛍", what: "Order, customer, line items", tone: "teal" },
          { name: "Stripe", icon: "💳", what: "Charges, refunds, disputes", tone: "royal" },
          { name: "Salesforce", icon: "☁", what: "Account & opportunity", tone: "indigo" },
          { name: "HubSpot", icon: "🟠", what: "CRM & lifecycle stage", tone: "sunset" },
          { name: "Carrier APIs", icon: "📦", what: "FedEx, UPS, DHL tracking", tone: "forest" },
          { name: "Riskified", icon: "🛡", what: "Fraud signals", tone: "rose" },
          { name: "Postgres", icon: "🐘", what: "Custom internal data", tone: "slate" },
          { name: "Snowflake", icon: "❄", what: "Analytics joins", tone: "royal" },
        ],
      },
      faq: {
        eyebrow: "Preguntas frecuentes",
        title: ["Detalles de ", { em: "cómo funciona" }, " un case"],
        items: [
          { q: "¿Cómo se vincula un caso con un pedido?", a: "Vía order_id detectado al ingresar (regex, NER, lookup por email). Si no se detecta, el agente puede vincularlo manual con un picker que busca por número, email o producto." },
          { q: "¿Se pierde el contexto si el pedido cambia después?", a: "No. Cada caso guarda un snapshot del estado en el momento de la decisión, además del estado en vivo. Audit log preserva los dos." },
          { q: "¿Funciona sin order? Por ejemplo en pre-sales", a: "Sí. Un caso puede existir solo con customer + canal. Cuando se vincula un order más tarde, el grafo se completa y el timeline se reordena." },
          { q: "¿Qué tipos de caso vienen out-of-the-box?", a: "Refund, late delivery, fraud, subscription, exchange, escalation, complaint, technical issue. Cada uno con plantilla específica que muestra los datos relevantes." },
          { q: "¿Cómo se asignan?", a: "Round-robin, skill (idioma/categoría), carga, marca, riesgo. Reglas declarativas combinables, con override manual de manager." },
        ],
      },
      related: {
        eyebrow: "Sigue explorando",
        title: ["Capacidades ", { em: "que se complementan" }],
        items: [
          { href: "#/unified-inbox", tag: "Inbox", title: "Bandeja unificada", summary: "Email, chat, WhatsApp, voz y formularios — un único hilo enriquecido.", tone: "indigo" },
          { href: "#/policy-engine", tag: "Policy", title: "Policy Engine", summary: "Refunds, cancelaciones y compensaciones bajo guardas declarativas.", tone: "royal" },
          { href: "#/audit-log", tag: "Audit", title: "Audit log", summary: "Cada decisión firmada, replay determinista y export a SIEM.", tone: "slate" },
        ],
      },
    },
    en: {
      deepDive: {
        eyebrow: "Anatomy of a case",
        title: ["What a Clain case ", { em: "knows about itself" }],
        body: "Not a thread with metadata: it's a graph of real entities with operational timeline, detected conflicts and resolution plan.",
        bullets: [
          { t: "Linked entities", d: "Customer, order, payment, return, carrier, brand. Live, not copied at creation." },
          { t: "Operational timeline", d: "Business events (charges, refunds, scans, signatures) chronologically ordered." },
          { t: "Detected conflicts", d: "Promise vs. tracking, refund vs. charge, return vs. inventory — explicit and actionable." },
          { t: "Resolution plan", d: "Suggested steps, preconditions and expected outcome for each." },
        ],
        tone: "teal",
        metric: { value: "8", label: "entities per case (avg)" },
      },
      useCases: {
        eyebrow: "Real cases",
        title: ["When the case ", { em: "has to be a case" }],
        items: [
          {
            tag: "Refund + partial return",
            tone: "teal",
            title: "Duplicate charge after partial return",
            scenario: "Customer returns 1 of 3 products. Stripe duplicates the held charge. Customer complains.",
            outcome: "Case shows the 3 line items, 2 charges and the RMA with the conflict flagged. Proposed refund: €92.10.",
            metric: { value: "01:48", label: "average time to resolution" },
          },
          {
            tag: "Late delivery + chargeback",
            tone: "sunset",
            title: "Customer opens dispute before breach",
            scenario: "Package hasn't been scanned in 4 days. Customer opens a dispute with the bank. Chargeback notice arrives.",
            outcome: "Case pre-existed from SLA monitor, contains tracking and chargeback. Action: refund + carrier claim.",
            metric: { value: "−68%", label: "chargebacks lost" },
          },
          {
            tag: "Subscription churn",
            tone: "royal",
            title: "Churn investigated in one view",
            scenario: "Premium customer cancels. You want to know if it was a botched case, a shipping failure or a missed upsell.",
            outcome: "Case shows last year of orders, returns, contacts and friction tags. Clear path to retention.",
            metric: { value: "+12pt", label: "post-investigation retention" },
          },
        ],
      },
      integrations: {
        eyebrow: "Data from trusted sources",
        title: ["Every case pulls from ", { em: "sources of truth" }],
        items: [
          { name: "Shopify", icon: "🛍", what: "Order, customer, line items", tone: "teal" },
          { name: "Stripe", icon: "💳", what: "Charges, refunds, disputes", tone: "royal" },
          { name: "Salesforce", icon: "☁", what: "Account & opportunity", tone: "indigo" },
          { name: "HubSpot", icon: "🟠", what: "CRM & lifecycle stage", tone: "sunset" },
          { name: "Carrier APIs", icon: "📦", what: "FedEx, UPS, DHL tracking", tone: "forest" },
          { name: "Riskified", icon: "🛡", what: "Fraud signals", tone: "rose" },
          { name: "Postgres", icon: "🐘", what: "Custom internal data", tone: "slate" },
          { name: "Snowflake", icon: "❄", what: "Analytics joins", tone: "royal" },
        ],
      },
      faq: {
        eyebrow: "FAQ",
        title: ["Details of ", { em: "how a case works" }],
        items: [
          { q: "How is a case linked to an order?", a: "Via order_id detected on ingest (regex, NER, lookup by email). If not detected, the agent can manually link via a picker that searches by number, email or product." },
          { q: "Does context get lost if the order changes later?", a: "No. Each case snapshots state at decision time, plus the live state. Audit log preserves both." },
          { q: "Works without an order? E.g. pre-sales", a: "Yes. A case can exist with just customer + channel. When an order is linked later, the graph completes and timeline reorders." },
          { q: "Which case types come out-of-the-box?", a: "Refund, late delivery, fraud, subscription, exchange, escalation, complaint, technical issue. Each has a specific template surfacing relevant data." },
          { q: "How are they assigned?", a: "Round-robin, skill (language/category), load, brand, risk. Composable declarative rules with manual manager override." },
        ],
      },
      related: {
        eyebrow: "Keep exploring",
        title: ["Capabilities ", { em: "that fit together" }],
        items: [
          { href: "#/unified-inbox", tag: "Inbox", title: "Unified Inbox", summary: "Email, chat, WhatsApp, voice and forms — a single enriched thread.", tone: "indigo" },
          { href: "#/policy-engine", tag: "Policy", title: "Policy Engine", summary: "Refunds, cancellations and goodwill under declarative guards.", tone: "royal" },
          { href: "#/audit-log", tag: "Audit", title: "Audit log", summary: "Every decision signed, deterministic replay and SIEM export.", tone: "slate" },
        ],
      },
    },
  },

  /* ----------------------------- Help Center ------------------------------ */

  help_center: {
    es: {
      deepDive: {
        eyebrow: "Una sola fuente",
        title: ["Un artículo, ", { em: "tres consumidores" }],
        body: "El mismo bloque de contenido alimenta el portal público, las respuestas del agente IA y el copiloto del humano. Sin duplicación.",
        bullets: [
          { t: "Bloques estructurados", d: "Markdown enriquecido con bloques tipados: política, producto, paso, advertencia." },
          { t: "Versionado y diff", d: "Cada cambio es una versión revisable. Diff legible para legal y producto." },
          { t: "Resolución por artículo", d: "Cuántos casos cerró el último mes y con qué CSAT. Lo malo se rescribe." },
          { t: "Multi-idioma asistido", d: "Traducción auto + revisión humana opcional. Sincronización de versión." },
        ],
        tone: "forest",
        metric: { value: "1×", label: "fuente, sin duplicación" },
      },
      useCases: {
        eyebrow: "Casos reales",
        title: ["Cuando el contenido ", { em: "tiene que rendir" }],
        items: [
          { tag: "Lanzamiento de feature", tone: "forest", title: "Producto sale el lunes", scenario: "El equipo de producto lanza una nueva política de devoluciones. Hay que actualizar 12 artículos en 4 idiomas.", outcome: "Se edita un bloque maestro, las traducciones se proponen, revisión por idioma y push simultáneo.", metric: { value: "4h", label: "vs 3 días antes" } },
          { tag: "Hotfix de política", tone: "sunset", title: "Cambio urgente en condiciones", scenario: "Legal exige cambiar el wording sobre garantía con efecto inmediato.", outcome: "Edit + approve por legal en línea. El agente IA aprende el cambio en menos de 1 minuto.", metric: { value: "<1min", label: "tiempo de propagación" } },
          { tag: "Brecha detectada", tone: "indigo", title: "Casos repetidos sin artículo", scenario: "El agente detecta que 18% de los casos del mes preguntan algo sin documentar.", outcome: "Se sugiere un artículo borrador con scenarios reales. Editor lo afina y publica.", metric: { value: "−42%", label: "casos repetidos" } },
        ],
      },
      integrations: {
        eyebrow: "Donde vive el contenido",
        title: ["Embed ", { em: "en cualquier sitio" }],
        items: [
          { name: "Shopify", icon: "🛍", what: "Help widget en checkout", tone: "teal" },
          { name: "Custom domain", icon: "🌐", what: "help.tu-marca.com", tone: "indigo" },
          { name: "Webflow", icon: "✏", what: "Embed en CMS", tone: "rose" },
          { name: "Slack", icon: "💬", what: "Slash commands internos", tone: "sunset" },
          { name: "Algolia", icon: "🔎", what: "Search relevance", tone: "royal" },
          { name: "Google", icon: "G", what: "Schema + sitemap", tone: "forest" },
        ],
      },
      faq: {
        eyebrow: "Preguntas frecuentes",
        title: ["Cómo escribir ", { em: "un help center que rinde" }],
        items: [
          { q: "¿Soporta multi-marca?", a: "Sí. Cada marca tiene su tema, dominio, y subset de artículos. Los bloques pueden compartirse entre marcas con override por marca." },
          { q: "¿Cómo aprende el agente IA del help center?", a: "Cada artículo se vectoriza por bloque. El agente cita por bloque (no artículo entero) lo que mejora precisión y permite trazabilidad por línea." },
          { q: "¿Hay editor WYSIWYG?", a: "Sí, con bloques estructurados. Para usuarios power-user también está disponible el modo Markdown." },
          { q: "¿Se publica en múltiples idiomas a la vez?", a: "Sí. Cada idioma se versiona independiente pero se sincroniza con el master. Si el master cambia, los idiomas marcan stale hasta revisión." },
        ],
      },
      related: {
        eyebrow: "Sigue explorando",
        title: ["Capacidades ", { em: "complementarias" }],
        items: [
          { href: "#/copilot", tag: "Copilot", title: "Copilot", summary: "Cita el help center con precisión por bloque y respeta tono.", tone: "sunset" },
          { href: "#/reporting", tag: "Reporting", title: "Reporting", summary: "Mide qué artículos resuelven, cuáles no, y dónde hay brechas.", tone: "royal" },
          { href: "#/cases", tag: "Cases", title: "Cases", summary: "Cada artículo lista los casos donde se usó y su resultado.", tone: "teal" },
        ],
      },
    },
    en: {
      deepDive: {
        eyebrow: "Single source",
        title: ["One article, ", { em: "three consumers" }],
        body: "The same content block feeds the public portal, the AI agent's replies and the human's copilot. No duplication.",
        bullets: [
          { t: "Structured blocks", d: "Rich markdown with typed blocks: policy, product, step, warning." },
          { t: "Versioning and diff", d: "Every change is a reviewable version. Readable diff for legal and product." },
          { t: "Per-article resolution", d: "How many cases closed last month and at what CSAT. The bad gets rewritten." },
          { t: "Assisted multi-language", d: "Auto translation + optional human review. Version sync." },
        ],
        tone: "forest",
        metric: { value: "1×", label: "source, no duplication" },
      },
      useCases: {
        eyebrow: "Real cases",
        title: ["When content ", { em: "has to perform" }],
        items: [
          { tag: "Feature launch", tone: "forest", title: "Product ships Monday", scenario: "Product team launches a new returns policy. 12 articles in 4 languages need updating.", outcome: "Master block is edited, translations proposed, per-language review and simultaneous push.", metric: { value: "4h", label: "vs 3 days before" } },
          { tag: "Policy hotfix", tone: "sunset", title: "Urgent terms change", scenario: "Legal demands wording change about warranty with immediate effect.", outcome: "Edit + legal approval inline. AI agent learns the change in under 1 minute.", metric: { value: "<1min", label: "propagation time" } },
          { tag: "Detected gap", tone: "indigo", title: "Repeated cases with no article", scenario: "The agent detects 18% of monthly cases ask something undocumented.", outcome: "A draft article is suggested with real scenarios. Editor refines and publishes.", metric: { value: "−42%", label: "repeated cases" } },
        ],
      },
      integrations: {
        eyebrow: "Where content lives",
        title: ["Embed ", { em: "anywhere" }],
        items: [
          { name: "Shopify", icon: "🛍", what: "Help widget in checkout", tone: "teal" },
          { name: "Custom domain", icon: "🌐", what: "help.your-brand.com", tone: "indigo" },
          { name: "Webflow", icon: "✏", what: "Embed in CMS", tone: "rose" },
          { name: "Slack", icon: "💬", what: "Internal slash commands", tone: "sunset" },
          { name: "Algolia", icon: "🔎", what: "Search relevance", tone: "royal" },
          { name: "Google", icon: "G", what: "Schema + sitemap", tone: "forest" },
        ],
      },
      faq: {
        eyebrow: "FAQ",
        title: ["How to ship ", { em: "a help center that performs" }],
        items: [
          { q: "Multi-brand support?", a: "Yes. Each brand has its theme, domain and subset of articles. Blocks can be shared across brands with per-brand overrides." },
          { q: "How does the AI agent learn from the help center?", a: "Each article is vectorized per block. The agent cites by block (not full article), improving precision and enabling per-line traceability." },
          { q: "WYSIWYG editor?", a: "Yes, with structured blocks. Power users also get a Markdown mode." },
          { q: "Multi-language publish at once?", a: "Yes. Each language is versioned independently but synced with master. If master changes, languages flag as stale until review." },
        ],
      },
      related: {
        eyebrow: "Keep exploring",
        title: ["Complementary ", { em: "capabilities" }],
        items: [
          { href: "#/copilot", tag: "Copilot", title: "Copilot", summary: "Cites the help center with per-block precision and matches tone.", tone: "sunset" },
          { href: "#/reporting", tag: "Reporting", title: "Reporting", summary: "Measures which articles resolve, which don't, and where the gaps are.", tone: "royal" },
          { href: "#/cases", tag: "Cases", title: "Cases", summary: "Each article lists the cases that used it and their outcome.", tone: "teal" },
        ],
      },
    },
  },

  /* ----------------------------- Reporting -------------------------------- */

  reporting: {
    es: {
      deepDive: {
        eyebrow: "De data a decisión",
        title: ["Métricas ", { em: "que ops lee a diario" }],
        body: "Volumen, AHT, FCR, CSAT, riesgo y exceptions con definiciones documentadas y consistentes a través de releases. Sin construir dashboards.",
        bullets: [
          { t: "KPIs estables", d: "Volume, AHT, FCR, CSAT con definiciones que no cambian sin release note." },
          { t: "Drill-down a caso", d: "De agregado a caso individual en un click. Reproducible y firmado." },
          { t: "Anomaly detection", d: "Bandas de confianza por KPI; alertas en Slack cuando un valor se sale." },
          { t: "Streaming a warehouse", d: "Snowflake, BigQuery, Redshift, Datadog. Eventos crudos exportables." },
        ],
        tone: "royal",
        metric: { value: "+18%", label: "casos resueltos vs. baseline" },
      },
      useCases: {
        eyebrow: "Casos reales",
        title: ["Cuando reporting ", { em: "decide en serio" }],
        items: [
          { tag: "Lunes de Ops", tone: "royal", title: "Dashboard que un VP mira en 30s", scenario: "Cada lunes a las 09:00, el VP de Ops mira el mismo dashboard: volumen, brechas SLA, anomalías y top causas.", outcome: "Decisiones tomadas en la junta con data confirmada, no impresiones.", metric: { value: "<2min", label: "tiempo de junta semanal" } },
          { tag: "Lanzamiento BFCM", tone: "sunset", title: "Cohorte BFCM separada", scenario: "Black Friday Cyber Monday genera 4× volumen. Quieres saber si la calidad bajó.", outcome: "Cohorte BFCM con KPIs propios. Comparativa contra baseline. Alertas tempranas.", metric: { value: "0", label: "sorpresas post-BFCM" } },
          { tag: "Auditoría externa", tone: "slate", title: "Auditor pide datos de Q3", scenario: "Auditor externo pide reporte de exceptions del último trimestre con evidencia.", outcome: "Export auto-firmado a CSV/PDF. Cada fila enlaza con el case y su audit log.", metric: { value: "30min", label: "vs 2 días antes" } },
        ],
      },
      integrations: {
        eyebrow: "Llévate la data",
        title: ["Tu warehouse, ", { em: "tu canvas" }],
        items: [
          { name: "Snowflake", icon: "❄", what: "Streaming + materializaciones", tone: "royal" },
          { name: "BigQuery", icon: "🔷", what: "Streaming + auth nativo", tone: "indigo" },
          { name: "Redshift", icon: "🟥", what: "Streaming via Firehose", tone: "rose" },
          { name: "Datadog", icon: "🐶", what: "Métricas en tiempo real", tone: "sunset" },
          { name: "Looker", icon: "👁", what: "Modelo semántico", tone: "forest" },
          { name: "dbt", icon: "🔨", what: "Pipelines analíticos", tone: "teal" },
          { name: "Slack", icon: "💬", what: "Alertas y reportes", tone: "indigo" },
          { name: "Notion", icon: "🗒", what: "Dashboards embebidos", tone: "slate" },
        ],
      },
      faq: {
        eyebrow: "Preguntas frecuentes",
        title: ["Lo que ", { em: "operaciones quiere saber" }],
        items: [
          { q: "¿Las definiciones de KPI son configurables?", a: "Sí, con guardas. Definitions live en config como código, versionadas. Cualquier cambio dispara una release note y los reports tienen un timestamp de qué definición usaron." },
          { q: "¿Cómo se compara semana a semana?", a: "Comparativa W/W, M/M, Y/Y por defecto en cada KPI. Cohortes adicionales (canal, marca, región) se crean en 2 clicks." },
          { q: "¿Hay export programado?", a: "Sí. PDF y CSV en tu inbox según schedule (diario, semanal, mensual). Múltiples destinatarios y filtros por dashboard." },
          { q: "¿Soporta SQL custom?", a: "Sí, en plan Scale+. Editor SQL con autocompletado de schema. Resultados aparecen como widgets en cualquier dashboard." },
        ],
      },
      related: {
        eyebrow: "Sigue explorando",
        title: ["Capacidades que ", { em: "se complementan" }],
        items: [
          { href: "#/audit-log", tag: "Audit", title: "Audit log", summary: "Cada métrica se puede llevar al evento que la generó.", tone: "slate" },
          { href: "#/policy-engine", tag: "Policy", title: "Policy Engine", summary: "Mide el efecto de un cambio de política antes de activar.", tone: "royal" },
          { href: "#/cases", tag: "Cases", title: "Cases", summary: "Drill-down de cualquier KPI hasta el caso individual.", tone: "teal" },
        ],
      },
    },
    en: {
      deepDive: {
        eyebrow: "From data to decision",
        title: ["Metrics ", { em: "ops reads daily" }],
        body: "Volume, AHT, FCR, CSAT, risk and exceptions with documented and consistent definitions across releases. No dashboards to build.",
        bullets: [
          { t: "Stable KPIs", d: "Volume, AHT, FCR, CSAT with definitions that don't change without a release note." },
          { t: "Drill-down to case", d: "From aggregate to individual case in one click. Reproducible and signed." },
          { t: "Anomaly detection", d: "Confidence bands per KPI; Slack alerts when a value drifts." },
          { t: "Warehouse streaming", d: "Snowflake, BigQuery, Redshift, Datadog. Raw events exportable." },
        ],
        tone: "royal",
        metric: { value: "+18%", label: "cases resolved vs. baseline" },
      },
      useCases: {
        eyebrow: "Real cases",
        title: ["When reporting ", { em: "decides for real" }],
        items: [
          { tag: "Ops Monday", tone: "royal", title: "Dashboard a VP reads in 30s", scenario: "Every Monday at 09:00 the VP Ops reads the same dashboard: volume, SLA breaches, anomalies and top causes.", outcome: "Decisions made in the meeting with confirmed data, not impressions.", metric: { value: "<2min", label: "weekly meeting time" } },
          { tag: "BFCM launch", tone: "sunset", title: "BFCM cohort separated", scenario: "Black Friday Cyber Monday generates 4× volume. You want to know if quality dropped.", outcome: "BFCM cohort with its own KPIs. Compared to baseline. Early alerts.", metric: { value: "0", label: "post-BFCM surprises" } },
          { tag: "External audit", tone: "slate", title: "Auditor asks for Q3 data", scenario: "External auditor requests last quarter's exceptions report with evidence.", outcome: "Auto-signed export to CSV/PDF. Each row links to its case and audit log.", metric: { value: "30min", label: "vs 2 days before" } },
        ],
      },
      integrations: {
        eyebrow: "Take your data",
        title: ["Your warehouse, ", { em: "your canvas" }],
        items: [
          { name: "Snowflake", icon: "❄", what: "Streaming + materializations", tone: "royal" },
          { name: "BigQuery", icon: "🔷", what: "Streaming + native auth", tone: "indigo" },
          { name: "Redshift", icon: "🟥", what: "Streaming via Firehose", tone: "rose" },
          { name: "Datadog", icon: "🐶", what: "Real-time metrics", tone: "sunset" },
          { name: "Looker", icon: "👁", what: "Semantic model", tone: "forest" },
          { name: "dbt", icon: "🔨", what: "Analytical pipelines", tone: "teal" },
          { name: "Slack", icon: "💬", what: "Alerts and reports", tone: "indigo" },
          { name: "Notion", icon: "🗒", what: "Embedded dashboards", tone: "slate" },
        ],
      },
      faq: {
        eyebrow: "FAQ",
        title: ["What ", { em: "operations wants to know" }],
        items: [
          { q: "Are KPI definitions configurable?", a: "Yes, with guards. Definitions live in config-as-code, versioned. Any change triggers a release note and reports timestamp which definition was used." },
          { q: "How is W/W comparison done?", a: "W/W, M/M, Y/Y comparison by default for each KPI. Additional cohorts (channel, brand, region) created in 2 clicks." },
          { q: "Scheduled export?", a: "Yes. PDF and CSV to your inbox per schedule (daily, weekly, monthly). Multiple recipients and per-dashboard filters." },
          { q: "Custom SQL support?", a: "Yes, in Scale+. SQL editor with schema autocomplete. Results appear as widgets in any dashboard." },
        ],
      },
      related: {
        eyebrow: "Keep exploring",
        title: ["Capabilities ", { em: "that fit together" }],
        items: [
          { href: "#/audit-log", tag: "Audit", title: "Audit log", summary: "Every metric drills into the event that generated it.", tone: "slate" },
          { href: "#/policy-engine", tag: "Policy", title: "Policy Engine", summary: "Measure a policy change's effect before activating.", tone: "royal" },
          { href: "#/cases", tag: "Cases", title: "Cases", summary: "Drill-down any KPI to the individual case.", tone: "teal" },
        ],
      },
    },
  },

  /* ----------------------------- Policy Engine ---------------------------- */

  policy_engine: {
    es: {
      deepDive: {
        eyebrow: "Cómo funciona",
        title: ["Plain English in, ", { em: "guardas tipadas out" }],
        body: "Escribes la política en lenguaje natural. El compilador la convierte en guardas que el ejecutor respeta. Diff legible, dry-run sobre histórico.",
        bullets: [
          { t: "Author en plain English", d: "Si esto entonces aquello — versionable como markdown comentable." },
          { t: "Compilación a guardas", d: "Cada cláusula se traduce a YAML tipado verificable por el sistema." },
          { t: "Dry-run histórico", d: "Antes de activar, simula sobre últimos 30/60/90 días. Diff de outcomes." },
          { t: "Activación gradual", d: "Por marca, por canal, por usuario. Rollback en un click si algo cambia mal." },
        ],
        tone: "royal",
        metric: { value: "100%", label: "acciones bajo guarda" },
      },
      useCases: {
        eyebrow: "Casos reales",
        title: ["Cuando una política ", { em: "tiene que ser ley" }],
        items: [
          { tag: "Refunds", tone: "royal", title: "Política de reembolsos por marca", scenario: "Marca A acepta refund <50€ sin aprobación. Marca B requiere aprobación a partir de €1.", outcome: "Una sola política con override por marca. Versión auditable. Cero exceptions ad-hoc.", metric: { value: "−85%", label: "exceptions ad-hoc" } },
          { tag: "Goodwill", tone: "sunset", title: "Compensación por late delivery", scenario: "Si el envío llega 24h tarde, ofrecer descuento del 10% en el siguiente pedido. Si llega 48h tarde, full refund.", outcome: "Política compilada. Agente la aplica solo. Audit log con razón firmada.", metric: { value: "1 tarde", label: "para escribir la primera" } },
          { tag: "Fraud", tone: "rose", title: "Cancelación por riesgo alto", scenario: "Si Riskified score > 0.85 y el pago es de un país nuevo, cancelar y notificar.", outcome: "Política compuesta de varias señales. Aprobación humana requerida arriba del límite.", metric: { value: "−68%", label: "fraude exitoso" } },
        ],
      },
      integrations: {
        eyebrow: "Conecta con tus sistemas",
        title: ["Una política, ", { em: "muchos sistemas" }],
        items: [
          { name: "Stripe", icon: "💳", what: "Refund + dispute actions", tone: "royal" },
          { name: "Shopify", icon: "🛍", what: "Cancel + edit order", tone: "teal" },
          { name: "Riskified", icon: "🛡", what: "Fraud signals", tone: "rose" },
          { name: "Slack", icon: "💬", what: "Approvals inline", tone: "indigo" },
          { name: "GitHub", icon: "🐙", what: "Diff + review como PR", tone: "slate" },
          { name: "Postmark", icon: "✉", what: "Notify customer + team", tone: "sunset" },
          { name: "JIRA", icon: "🟦", what: "Open ticket on exception", tone: "royal" },
          { name: "DataDog", icon: "🐶", what: "Alert on policy drift", tone: "forest" },
        ],
      },
      faq: {
        eyebrow: "Preguntas frecuentes",
        title: ["Lo que ", { em: "legal y producto" }, " preguntan"],
        items: [
          { q: "¿Quién puede escribir políticas?", a: "Cualquier rol con permiso `policy.write`. Suelen ser ops, legal y producto. La revisión y publicación se separan por rol (ej. legal aprueba antes de activar)." },
          { q: "¿Cómo se prueba un cambio?", a: "Dry-run sobre los últimos N días: simula la política nueva contra los casos reales y muestra qué outcomes habrían cambiado. Diff legible." },
          { q: "¿Qué pasa si una política tiene un bug?", a: "Rollback en un click. Cada versión se mantiene. La política activa al momento de cada decisión queda firmada en el audit log." },
          { q: "¿Soporta políticas combinadas?", a: "Sí. Composición por AND/OR/NOT con precedencia explícita. Linter previene conflictos circulares." },
          { q: "¿Hay templates de partida?", a: "Sí: refund standard, late delivery, fraud, return abuse, subscription cancellation, partial refund con catch-up." },
        ],
      },
      related: {
        eyebrow: "Sigue explorando",
        title: ["Capacidades ", { em: "que se complementan" }],
        items: [
          { href: "#/audit-log", tag: "Audit", title: "Audit log", summary: "Cada decisión bajo política firmada y reproducible.", tone: "slate" },
          { href: "#/copilot", tag: "Copilot", title: "Copilot", summary: "El copiloto cita la política aplicable por línea de razonamiento.", tone: "sunset" },
          { href: "#/cases", tag: "Cases", title: "Cases", summary: "Cada caso muestra qué política aplica y por qué.", tone: "teal" },
        ],
      },
    },
    en: {
      deepDive: {
        eyebrow: "How it works",
        title: ["Plain English in, ", { em: "typed guards out" }],
        body: "You write the policy in natural language. The compiler converts it into guards the executor respects. Readable diff, dry-run over history.",
        bullets: [
          { t: "Author in plain English", d: "If this then that — versionable as commentable markdown." },
          { t: "Compile to guards", d: "Each clause translates to typed, system-verifiable YAML." },
          { t: "Historical dry-run", d: "Before activating, simulate over last 30/60/90 days. Outcome diff." },
          { t: "Gradual rollout", d: "By brand, channel, user. One-click rollback if something goes wrong." },
        ],
        tone: "royal",
        metric: { value: "100%", label: "guarded actions" },
      },
      useCases: {
        eyebrow: "Real cases",
        title: ["When a policy ", { em: "has to be law" }],
        items: [
          { tag: "Refunds", tone: "royal", title: "Per-brand refund policy", scenario: "Brand A accepts refund <€50 without approval. Brand B requires approval from €1.", outcome: "One policy with per-brand override. Auditable version. Zero ad-hoc exceptions.", metric: { value: "−85%", label: "ad-hoc exceptions" } },
          { tag: "Goodwill", tone: "sunset", title: "Late-delivery goodwill", scenario: "If shipment is 24h late, offer 10% discount on next order. If 48h late, full refund.", outcome: "Compiled policy. Agent applies it solo. Audit log with signed reason.", metric: { value: "1 afternoon", label: "to write the first" } },
          { tag: "Fraud", tone: "rose", title: "High-risk cancellation", scenario: "If Riskified score > 0.85 and payment is from a new country, cancel and notify.", outcome: "Composite policy from multiple signals. Human approval required above threshold.", metric: { value: "−68%", label: "successful fraud" } },
        ],
      },
      integrations: {
        eyebrow: "Connect with your systems",
        title: ["One policy, ", { em: "many systems" }],
        items: [
          { name: "Stripe", icon: "💳", what: "Refund + dispute actions", tone: "royal" },
          { name: "Shopify", icon: "🛍", what: "Cancel + edit order", tone: "teal" },
          { name: "Riskified", icon: "🛡", what: "Fraud signals", tone: "rose" },
          { name: "Slack", icon: "💬", what: "Inline approvals", tone: "indigo" },
          { name: "GitHub", icon: "🐙", what: "Diff + review as PR", tone: "slate" },
          { name: "Postmark", icon: "✉", what: "Notify customer + team", tone: "sunset" },
          { name: "JIRA", icon: "🟦", what: "Open ticket on exception", tone: "royal" },
          { name: "DataDog", icon: "🐶", what: "Alert on policy drift", tone: "forest" },
        ],
      },
      faq: {
        eyebrow: "FAQ",
        title: ["What ", { em: "legal and product" }, " ask"],
        items: [
          { q: "Who can write policies?", a: "Any role with `policy.write`. Usually ops, legal and product. Review and publish are role-separated (e.g. legal approves before activation)." },
          { q: "How is a change tested?", a: "Dry-run over last N days: simulates the new policy against real cases and shows which outcomes would have changed. Readable diff." },
          { q: "What if a policy has a bug?", a: "One-click rollback. Each version is preserved. The active policy at decision time is signed in the audit log." },
          { q: "Composite policies?", a: "Yes. AND/OR/NOT composition with explicit precedence. Linter prevents circular conflicts." },
          { q: "Starter templates?", a: "Yes: standard refund, late delivery, fraud, return abuse, subscription cancellation, partial refund with catch-up." },
        ],
      },
      related: {
        eyebrow: "Keep exploring",
        title: ["Capabilities ", { em: "that fit together" }],
        items: [
          { href: "#/audit-log", tag: "Audit", title: "Audit log", summary: "Every policy decision signed and reproducible.", tone: "slate" },
          { href: "#/copilot", tag: "Copilot", title: "Copilot", summary: "The copilot cites the applicable policy per reasoning line.", tone: "sunset" },
          { href: "#/cases", tag: "Cases", title: "Cases", summary: "Each case shows which policy applies and why.", tone: "teal" },
        ],
      },
    },
  },

  /* ----------------------------- Audit Log -------------------------------- */

  audit_log: {
    es: {
      deepDive: {
        eyebrow: "Hash chain",
        title: ["Cada acción ", { em: "firmada y encadenada" }],
        body: "Cada evento se sella con timestamp, actor, hash de evidencia y firma criptográfica. Manipulación detectable. Replay determinista.",
        bullets: [
          { t: "Sealing automático", d: "Cada acción del agente, humano o sistema queda sellada al ejecutarse." },
          { t: "Cadena de hashes", d: "Cada evento incluye el hash del anterior — manipulación detectable de inmediato." },
          { t: "Replay determinista", d: "Reconstruimos exactamente qué vio el agente, qué pidió y qué decidió." },
          { t: "Export firmado", d: "CSV, JSON, NDJSON con firma del exporter para auditorías externas." },
        ],
        tone: "slate",
        metric: { value: "100%", label: "acciones sealed" },
      },
      useCases: {
        eyebrow: "Casos reales",
        title: ["Cuando ", { em: "auditar es serio" }],
        items: [
          { tag: "SOC 2 Type II", tone: "slate", title: "Audit anual sin sufrir", scenario: "El auditor pide evidencia de controles operativos del último año.", outcome: "Export firmado por categoría con hashes verificables. Auditor lo procesa offline.", metric: { value: "1 día", label: "vs 2 semanas antes" } },
          { tag: "Disputa cliente", tone: "royal", title: "Cliente reclama un reembolso negado", scenario: "Cliente dice que pidió reembolso y nadie respondió.", outcome: "Replay del caso muestra timestamp del email, decisión del agente y razón firmada.", metric: { value: "<5min", label: "tiempo en disputa" } },
          { tag: "Investigación interna", tone: "rose", title: "Anomalía: refund grande aprobado", scenario: "QA detecta un refund de €4,200 aprobado en horario raro.", outcome: "Audit log muestra exact request, política aplicada, aprobador y context. Limpio.", metric: { value: "0", label: "fraudes internos sin detectar" } },
        ],
      },
      integrations: {
        eyebrow: "Donde van los logs",
        title: ["Stream a ", { em: "tu SIEM o warehouse" }],
        items: [
          { name: "Datadog", icon: "🐶", what: "Logs + alerts unificados", tone: "sunset" },
          { name: "Splunk", icon: "🔎", what: "SIEM enterprise", tone: "forest" },
          { name: "Elastic", icon: "🟦", what: "ELK stack streaming", tone: "indigo" },
          { name: "S3", icon: "🪣", what: "Cold storage compliant", tone: "rose" },
          { name: "BigQuery", icon: "🔷", what: "Análisis SQL ad-hoc", tone: "royal" },
          { name: "Snowflake", icon: "❄", what: "Warehouse joins", tone: "teal" },
          { name: "PagerDuty", icon: "🟥", what: "Alertas a on-call", tone: "rose" },
          { name: "Slack", icon: "💬", what: "Notifs en canal seguro", tone: "indigo" },
        ],
      },
      faq: {
        eyebrow: "Preguntas frecuentes",
        title: ["Compliance ", { em: "y operación" }],
        items: [
          { q: "¿Cumple SOC 2 / GDPR?", a: "Sí. SOC 2 Type II con hash chain y firma. GDPR vía PII redaction antes del modelo y per-region retention." },
          { q: "¿Cuánto tiempo se retienen los logs?", a: "Configurable por categoría: action logs hasta 7 años, conversation logs hasta 1 año, raw events según residency. Override por workspace." },
          { q: "¿Cómo se redacta PII?", a: "Pipeline de redacción antes del modelo: detección de email, phone, credit card, custom regex por workspace. Logs guardan tokens, no valores." },
          { q: "¿Hay export en tiempo real?", a: "Sí, vía Datadog, Splunk, Elastic, S3 streaming. Latencia <30s desde acción a SIEM." },
        ],
      },
      related: {
        eyebrow: "Sigue explorando",
        title: ["Capacidades ", { em: "que dan governance" }],
        items: [
          { href: "#/policy-engine", tag: "Policy", title: "Policy Engine", summary: "Reglas que el audit log certifica que se cumplen.", tone: "royal" },
          { href: "#/reporting", tag: "Reporting", title: "Reporting", summary: "Métricas que se atan al audit log para reproducibilidad.", tone: "indigo" },
          { href: "#/cases", tag: "Cases", title: "Cases", summary: "Cada caso lleva su audit log embebido.", tone: "teal" },
        ],
      },
    },
    en: {
      deepDive: {
        eyebrow: "Hash chain",
        title: ["Every action ", { em: "signed and chained" }],
        body: "Each event is sealed with timestamp, actor, evidence hash and cryptographic signature. Tamper detectable. Deterministic replay.",
        bullets: [
          { t: "Automatic sealing", d: "Every agent, human or system action is sealed at execution time." },
          { t: "Hash chain", d: "Each event includes the previous hash — tampering immediately detectable." },
          { t: "Deterministic replay", d: "We reconstruct exactly what the agent saw, asked and decided." },
          { t: "Signed export", d: "CSV, JSON, NDJSON with exporter signature for external audits." },
        ],
        tone: "slate",
        metric: { value: "100%", label: "sealed actions" },
      },
      useCases: {
        eyebrow: "Real cases",
        title: ["When ", { em: "audit is serious" }],
        items: [
          { tag: "SOC 2 Type II", tone: "slate", title: "Yearly audit without suffering", scenario: "Auditor requests evidence of operational controls for the past year.", outcome: "Signed export by category with verifiable hashes. Auditor processes offline.", metric: { value: "1 day", label: "vs 2 weeks before" } },
          { tag: "Customer dispute", tone: "royal", title: "Customer claims a denied refund", scenario: "Customer says they requested a refund and no one replied.", outcome: "Replay shows email timestamp, agent decision and signed reason.", metric: { value: "<5min", label: "time in dispute" } },
          { tag: "Internal investigation", tone: "rose", title: "Anomaly: large refund approved", scenario: "QA detects a €4,200 refund approved at odd hours.", outcome: "Audit log shows exact request, applied policy, approver and context. Clean.", metric: { value: "0", label: "internal frauds undetected" } },
        ],
      },
      integrations: {
        eyebrow: "Where logs go",
        title: ["Stream to ", { em: "your SIEM or warehouse" }],
        items: [
          { name: "Datadog", icon: "🐶", what: "Unified logs + alerts", tone: "sunset" },
          { name: "Splunk", icon: "🔎", what: "Enterprise SIEM", tone: "forest" },
          { name: "Elastic", icon: "🟦", what: "ELK stack streaming", tone: "indigo" },
          { name: "S3", icon: "🪣", what: "Compliant cold storage", tone: "rose" },
          { name: "BigQuery", icon: "🔷", what: "Ad-hoc SQL analysis", tone: "royal" },
          { name: "Snowflake", icon: "❄", what: "Warehouse joins", tone: "teal" },
          { name: "PagerDuty", icon: "🟥", what: "On-call alerts", tone: "rose" },
          { name: "Slack", icon: "💬", what: "Secure-channel notifs", tone: "indigo" },
        ],
      },
      faq: {
        eyebrow: "FAQ",
        title: ["Compliance ", { em: "and operations" }],
        items: [
          { q: "SOC 2 / GDPR compliant?", a: "Yes. SOC 2 Type II with hash chain and signature. GDPR via PII redaction before model and per-region retention." },
          { q: "How long are logs retained?", a: "Configurable by category: action logs up to 7 years, conversation logs up to 1 year, raw events by residency. Per-workspace override." },
          { q: "How is PII redacted?", a: "Pre-model redaction pipeline: detect email, phone, credit card, custom workspace regex. Logs store tokens, not values." },
          { q: "Real-time export?", a: "Yes, via Datadog, Splunk, Elastic, S3 streaming. <30s latency from action to SIEM." },
        ],
      },
      related: {
        eyebrow: "Keep exploring",
        title: ["Capabilities ", { em: "that bring governance" }],
        items: [
          { href: "#/policy-engine", tag: "Policy", title: "Policy Engine", summary: "Rules the audit log certifies are followed.", tone: "royal" },
          { href: "#/reporting", tag: "Reporting", title: "Reporting", summary: "Metrics tied to the audit log for reproducibility.", tone: "indigo" },
          { href: "#/cases", tag: "Cases", title: "Cases", summary: "Each case carries its embedded audit log.", tone: "teal" },
        ],
      },
    },
  },

  /* ----------------------------- Copilot ---------------------------------- */

  copilot: {
    es: {
      deepDive: {
        eyebrow: "Cómo el copiloto piensa",
        title: ["Lee, investiga, ", { em: "redacta y cita" }],
        body: "Antes de proponer una respuesta, el copiloto lee el caso, consulta tus sistemas, identifica conflictos y aplica la política aplicable.",
        bullets: [
          { t: "Read", d: "Toda la conversación, line items, eventos del pedido y devolución, audit log relevante." },
          { t: "Investigate", d: "Llama a Stripe, Shopify, Riskified y al help center. Reconcilia conflictos." },
          { t: "Draft", d: "Genera un borrador en el tono del workspace, citando las fuentes consultadas." },
          { t: "Cite", d: "Cada afirmación enlaza a Stripe charge, Shopify order o artículo del help center." },
        ],
        tone: "sunset",
        metric: { value: "91%", label: "borradores aprobados" },
      },
      useCases: {
        eyebrow: "Casos reales",
        title: ["Cuando un copiloto ", { em: "ahorra horas" }],
        items: [
          { tag: "Refund explicado", tone: "sunset", title: "Cliente pregunta por qué le negaron refund", scenario: "Cliente reclama porque su refund fue rechazado.", outcome: "Copilot lee el caso, encuentra la política aplicada y redacta una explicación empática + link al artículo del help center.", metric: { value: "01:48", label: "tiempo a borrador" } },
          { tag: "Escalado a manager", tone: "royal", title: "Caso complejo, junior necesita ayuda", scenario: "Caso con 2 charges, 1 partial return y un envío partido. Junior pide help.", outcome: "Copilot resume en 3 líneas, sugiere refund parcial con cita de policy, ofrece escalado a manager.", metric: { value: "−42%", label: "escalations innecesarias" } },
          { tag: "Multi-idioma", tone: "indigo", title: "Cliente en alemán, agente solo habla español", scenario: "Cliente alemán reclama. Agente español tiene que responder en alemán natural.", outcome: "Copilot redacta en alemán matching el tono del cliente. Agente revisa, edita un par de frases y envía.", metric: { value: "8 idiomas", label: "soportados de fábrica" } },
        ],
      },
      integrations: {
        eyebrow: "Sus fuentes",
        title: ["El copiloto consulta ", { em: "fuentes de verdad" }],
        items: [
          { name: "Stripe", icon: "💳", what: "Charges, refunds, disputes", tone: "royal" },
          { name: "Shopify", icon: "🛍", what: "Order, customer, returns", tone: "teal" },
          { name: "Help Center", icon: "📚", what: "Artículos por bloque", tone: "forest" },
          { name: "Audit log", icon: "📜", what: "Histórico del caso", tone: "slate" },
          { name: "Policy", icon: "⚖", what: "Reglas aplicables", tone: "royal" },
          { name: "Carriers", icon: "📦", what: "Tracking en vivo", tone: "sunset" },
          { name: "Riskified", icon: "🛡", what: "Señales de fraud", tone: "rose" },
          { name: "Postgres", icon: "🐘", what: "Datos custom internos", tone: "indigo" },
        ],
      },
      faq: {
        eyebrow: "Preguntas frecuentes",
        title: ["Sobre cómo ", { em: "funciona el copiloto" }],
        items: [
          { q: "¿El copiloto envía solo o solo redacta?", a: "Por defecto solo redacta. La autonomía es configurable: en plan Scale puedes activar autoresponder bajo política para casos clase A (alta confianza, bajo riesgo)." },
          { q: "¿Cómo aprende el tono de mi marca?", a: "Tres vías: (1) configuración explícita por marca, (2) muestras de respuestas históricas que tu equipo aprueba, (3) feedback continuo de cada draft aceptado/rechazado." },
          { q: "¿Funciona en multi-idioma?", a: "Sí, 8 idiomas de fábrica con tono mantenido. Detección automática del idioma del cliente, posibilidad de override." },
          { q: "¿Puedo usarlo solo lectura?", a: "Sí. Modo solo-lectura para juniors o auditoría: el copiloto explica el caso pero no propone acciones." },
          { q: "¿Cuánto cuesta cada draft?", a: "Cada draft consume créditos de IA según el modelo. En tier rápido ~5 créditos por draft, en tier balanced ~12." },
        ],
      },
      related: {
        eyebrow: "Sigue explorando",
        title: ["Capacidades ", { em: "que se complementan" }],
        items: [
          { href: "#/help-center", tag: "Help", title: "Help Center", summary: "El copiloto cita por bloque y mejora cuando el contenido mejora.", tone: "forest" },
          { href: "#/policy-engine", tag: "Policy", title: "Policy Engine", summary: "El copiloto respeta y cita la política aplicable.", tone: "royal" },
          { href: "#/audit-log", tag: "Audit", title: "Audit log", summary: "Cada borrador y aprobación queda firmada.", tone: "slate" },
        ],
      },
    },
    en: {
      deepDive: {
        eyebrow: "How the copilot thinks",
        title: ["Reads, investigates, ", { em: "drafts and cites" }],
        body: "Before suggesting a reply, the copilot reads the case, queries your systems, identifies conflicts and applies the relevant policy.",
        bullets: [
          { t: "Read", d: "Whole conversation, line items, order and return events, relevant audit log." },
          { t: "Investigate", d: "Calls Stripe, Shopify, Riskified and the help center. Reconciles conflicts." },
          { t: "Draft", d: "Generates a draft in the workspace tone, citing consulted sources." },
          { t: "Cite", d: "Each claim links to Stripe charge, Shopify order or help center article." },
        ],
        tone: "sunset",
        metric: { value: "91%", label: "drafts approved" },
      },
      useCases: {
        eyebrow: "Real cases",
        title: ["When a copilot ", { em: "saves hours" }],
        items: [
          { tag: "Explained refund", tone: "sunset", title: "Customer asks why refund was denied", scenario: "Customer complains because their refund was rejected.", outcome: "Copilot reads the case, finds the applied policy and drafts an empathetic explanation + help center link.", metric: { value: "01:48", label: "time to draft" } },
          { tag: "Manager escalation", tone: "royal", title: "Complex case, junior needs help", scenario: "Case with 2 charges, 1 partial return and split shipment. Junior asks for help.", outcome: "Copilot summarizes in 3 lines, suggests partial refund with policy citation, offers manager escalation.", metric: { value: "−42%", label: "unnecessary escalations" } },
          { tag: "Multi-language", tone: "indigo", title: "German customer, agent only speaks Spanish", scenario: "German customer complains. Spanish agent must reply in natural German.", outcome: "Copilot drafts in German matching the customer's tone. Agent reviews, edits a couple of sentences, sends.", metric: { value: "8 languages", label: "supported by default" } },
        ],
      },
      integrations: {
        eyebrow: "Its sources",
        title: ["The copilot queries ", { em: "sources of truth" }],
        items: [
          { name: "Stripe", icon: "💳", what: "Charges, refunds, disputes", tone: "royal" },
          { name: "Shopify", icon: "🛍", what: "Order, customer, returns", tone: "teal" },
          { name: "Help Center", icon: "📚", what: "Articles per block", tone: "forest" },
          { name: "Audit log", icon: "📜", what: "Case history", tone: "slate" },
          { name: "Policy", icon: "⚖", what: "Applicable rules", tone: "royal" },
          { name: "Carriers", icon: "📦", what: "Live tracking", tone: "sunset" },
          { name: "Riskified", icon: "🛡", what: "Fraud signals", tone: "rose" },
          { name: "Postgres", icon: "🐘", what: "Custom internal data", tone: "indigo" },
        ],
      },
      faq: {
        eyebrow: "FAQ",
        title: ["How ", { em: "the copilot works" }],
        items: [
          { q: "Does the copilot send by itself or only draft?", a: "By default only drafts. Autonomy is configurable: on Scale you can enable autoresponder under policy for class-A cases (high confidence, low risk)." },
          { q: "How does it learn my brand's tone?", a: "Three ways: (1) explicit per-brand config, (2) samples of historical replies your team approves, (3) continuous feedback from each accepted/rejected draft." },
          { q: "Multi-language support?", a: "Yes, 8 languages out of the box with preserved tone. Auto-detection of customer language, manual override available." },
          { q: "Read-only mode?", a: "Yes. Read-only for juniors or audit: copilot explains the case but doesn't propose actions." },
          { q: "How much does each draft cost?", a: "Each draft consumes AI credits per model. Fast tier ~5 credits per draft, balanced tier ~12." },
        ],
      },
      related: {
        eyebrow: "Keep exploring",
        title: ["Capabilities ", { em: "that fit together" }],
        items: [
          { href: "#/help-center", tag: "Help", title: "Help Center", summary: "Copilot cites per block and improves as content improves.", tone: "forest" },
          { href: "#/policy-engine", tag: "Policy", title: "Policy Engine", summary: "Copilot respects and cites the applicable policy.", tone: "royal" },
          { href: "#/audit-log", tag: "Audit", title: "Audit log", summary: "Every draft and approval is signed.", tone: "slate" },
        ],
      },
    },
  },
};

/* Expose to capabilities.jsx */
window.CapExtras = {
  data: CAP_EXTRA,
  components: { CapGradientBlock, CapUseCases, CapIntegrations, CapFAQ, CapRelated, CapDeepDive },
};
