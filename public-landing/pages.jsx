/* global React */
const { useState, useEffect } = React;

const PRODUCT_COPY = {
  es: {
    eyebrow: "Producto",
    title: ["Una plataforma para resolver", { em: " casos complejos" }, " de ecommerce, de extremo a extremo."],
    lede: "Cinco capas que trabajan juntas: ingesta, contexto, decisión, ejecución y auditoría. Cada una está diseñada para que tu equipo gane velocidad sin perder control.",
    pillars: [
      {
        num: "01",
        slug: "inbox",
        name: "AI Case Inbox",
        title: ["Una bandeja que ", { em: "se conecta sola" }, " al resto de tu negocio."],
        body: "Centraliza email, chat, formularios y webhooks en hilos únicos. Cada caso queda enlazado automáticamente con el cliente, su pedido, pago, devolución, riesgo y SLA — sin macros, sin reglas frágiles, sin copia-pegar entre tabs.",
        capabilities: [
          { t: "Detección automática de entidad", d: "Lee el cuerpo del mensaje, los headers y los attachments para identificar order, customer y carrier — incluso si el cliente no proporciona el ID." },
          { t: "Hilo único multi-canal", d: "Email, chat, WhatsApp y formularios convergen en una vista. El historial sobrevive cambios de canal y de agente." },
          { t: "Priorización por SLA y valor", d: "Cada caso se reordena en tiempo real según urgencia (SLA), riesgo (chargeback, churn) y valor del cliente." },
          { t: "Macros que aprenden", d: "El sistema observa cómo resuelves casos parecidos y propone respuestas con las variables ya rellenadas. Tú decides si aceptar." },
        ],
        outcomes: [
          ["−63%", "tiempo en triaging"],
          ["+44%", "casos resueltos en 1er contacto"],
          ["100%", "casos con contexto completo"],
        ],
      },
      {
        num: "02",
        slug: "agent",
        name: "Super Agent",
        title: ["Un agente que ", { em: "investiga primero" }, ", responde después."],
        body: "Antes de redactar cualquier respuesta, el agente recorre tu stack: lee el historial, consulta sistemas internos, detecta conflictos entre la promesa y los hechos, y propone la siguiente mejor acción con su evidencia.",
        capabilities: [
          { t: "RAG sobre tu stack interno", d: "Conecta orders, payments, returns, carriers, policies, knowledge base y wikis. El agente cita fuentes en cada conclusión." },
          { t: "Detección de conflictos", d: "Si la promesa de envío no encaja con el tracking, o el refund no coincide con los charges, el agente lo levanta como flag explícito." },
          { t: "Borrador y plan de acción", d: "Te entrega una respuesta lista para enviar y un plan de pasos (refund, re-shipping, ticket interno) para aprobar o ajustar." },
          { t: "Razonamiento auditable", d: "Cada paso del agente —qué leyó, qué dedujo, qué propuso— queda guardado para revisión humana." },
        ],
        outcomes: [
          ["6×", "casos atendidos por agente"],
          ["02:14", "tiempo medio de borrador"],
          ["91%", "borradores aprobados sin edits"],
        ],
      },
      {
        num: "03",
        slug: "graph",
        name: "Case Graph",
        title: ["Todo el caso ", { em: "en un mapa" }, ", no en 12 tabs."],
        body: "Visualiza la relación entre conversación, order, payment, return, carrier, policies y approvals. Una sola vista para entender qué está realmente roto, dónde y por qué.",
        capabilities: [
          { t: "Grafo dinámico por caso", d: "Cada nodo es una entidad real con su estado en vivo. Cada arista es una relación con su tipo (paid_for, returned_in, blocked_by)." },
          { t: "Saltos a sistema de origen", d: "Click en cualquier nodo te lleva al admin de Shopify, al dashboard de Stripe, al carrier — con el contexto correcto pre-cargado." },
          { t: "Snapshots para auditoría", d: "Congela el grafo en el momento de una decisión. Reproducible, exportable, anclable al audit log." },
          { t: "Vista de equipo", d: "Operaciones, finanzas y soporte miran el mismo grafo y resuelven sin reuniones." },
        ],
        outcomes: [
          ["−71%", "saltos entre herramientas"],
          ["3.4×", "decisiones por hora"],
          ["0", "casos sin contexto"],
        ],
      },
      {
        num: "04",
        slug: "policy",
        name: "Approvals & Policy Engine",
        title: ["Reglas en lenguaje natural,", { em: " guardas verificables" }, "."],
        body: "Refunds, cancelaciones y compensaciones se ejecutan bajo reglas, permisos y aprobación humana. Define las políticas en plain English y conviértelas en guardas que la ejecución respeta al pie.",
        capabilities: [
          { t: "Policy-as-code", d: "Escribe en lenguaje natural; el sistema compila a YAML auditable. Versionado, diffable, revisable como cualquier código." },
          { t: "Aprobaciones en línea", d: "El aprobador ve el caso, la evidencia y el efecto exacto antes de firmar. Doble check para acciones críticas." },
          { t: "Límites por rol y contexto", d: "Por monto, motivo, cliente, marca, hora, riesgo. Combinables. Sin colas paralelas." },
          { t: "Sandbox y dry-run", d: "Prueba un cambio de política contra el histórico de los últimos 30 días antes de activarlo en producción." },
        ],
        outcomes: [
          ["100%", "acciones sensibles con guarda"],
          ["−85%", "exceptions ad-hoc"],
          ["1 tarde", "para escribir la primera política"],
        ],
      },
      {
        num: "05",
        slug: "audit",
        name: "Audit & Safe Execution",
        title: ["Cada acción del agente,", { em: " firmada y reproducible" }, "."],
        body: "Toda ejecución del agente queda registrada con su evidencia, prompt, datos consultados y firmante. Reproducible, exportable a tu SIEM y a tu warehouse, lista para una auditoría real.",
        capabilities: [
          { t: "Trazabilidad por caso y por acción", d: "Cada evento — query, draft, approval, execution — se sella con timestamp, actor, hash de evidencia y firma criptográfica." },
          { t: "Replay determinista", d: "Reconstruye exactamente qué vio el agente y qué decidió, en cualquier momento del pasado." },
          { t: "Export a SIEM y warehouse", d: "Streaming a Datadog, Splunk, BigQuery, Snowflake. Esquemas estables y documentados." },
          { t: "Privacidad por diseño", d: "Redacción de PII antes del modelo, residencia de datos por región, retention configurable." },
        ],
        outcomes: [
          ["SOC 2", "Type II"],
          ["GDPR", "compliant"],
          ["100%", "acciones sealed"],
        ],
      },
    ],
    integrationsTitle: ["Se conecta con", { em: " tu stack actual" }, "."],
    integrationsLede: "Sin reemplazar nada que ya funcione. Clain orquesta encima de tu helpdesk, tu ERP y tus pasarelas de pago.",
    integrations: [
      { cat: "Helpdesk", items: ["Zendesk", "Front", "Gorgias", "Intercom", "Freshdesk"] },
      { cat: "Ecommerce", items: ["Shopify", "WooCommerce", "BigCommerce", "Magento", "Salesforce Commerce"] },
      { cat: "Payments", items: ["Stripe", "Adyen", "Braintree", "Klarna", "Mollie"] },
      { cat: "Shipping", items: ["Shippo", "EasyPost", "Sendcloud", "DHL", "UPS API"] },
      { cat: "Comms", items: ["Slack", "Microsoft Teams", "WhatsApp Business", "Twilio"] },
      { cat: "Data", items: ["Snowflake", "BigQuery", "Datadog", "Splunk", "Segment"] },
    ],
    securityTitle: ["Seguridad por defecto,", { em: " no por roadmap" }, "."],
    securityCards: [
      { t: "SOC 2 Type II", d: "Auditoría anual con reporte público disponible bajo NDA." },
      { t: "GDPR & DPA", d: "Procesamiento dentro de EU. Subprocesadores listados y notificados." },
      { t: "Encriptación", d: "AES-256 en reposo, TLS 1.3 en tránsito. Claves gestionadas por KMS." },
      { t: "SSO + SCIM", d: "Okta, Azure AD, Google Workspace. Provisioning automático." },
      { t: "Roles granulares", d: "Permisos por marca, región, tipo de caso y rol. Revocable al instante." },
      { t: "VPC dedicado", d: "Despliegue aislado en tu cloud para casos de alta sensibilidad." },
    ],
  },
  en: {
    eyebrow: "Product",
    title: ["A platform to solve", { em: " complex ecommerce cases" }, ", end to end."],
    lede: "Five layers working together: ingestion, context, decision, execution and audit. Each one designed to give your team speed without losing control.",
    pillars: [
      {
        num: "01",
        slug: "inbox",
        name: "AI Case Inbox",
        title: ["An inbox that ", { em: "wires itself" }, " to the rest of the business."],
        body: "Centralize email, chat, forms and webhooks into single threads. Every case is automatically linked to the customer, their order, payment, return, risk and SLA — no macros, no fragile rules, no copy-pasting across tabs.",
        capabilities: [
          { t: "Automatic entity detection", d: "Reads the message body, headers and attachments to identify order, customer and carrier — even when the customer doesn't provide the ID." },
          { t: "Single multi-channel thread", d: "Email, chat, WhatsApp and forms converge into one view. History survives channel and agent changes." },
          { t: "Priority by SLA and value", d: "Cases reorder in real time by urgency (SLA), risk (chargeback, churn) and customer value." },
          { t: "Macros that learn", d: "The system watches how you resolve similar cases and proposes replies with variables already filled. You decide whether to accept." },
        ],
        outcomes: [
          ["−63%", "time in triage"],
          ["+44%", "first-contact resolutions"],
          ["100%", "cases with full context"],
        ],
      },
      {
        num: "02",
        slug: "agent",
        name: "Super Agent",
        title: ["An agent that ", { em: "investigates first" }, ", replies later."],
        body: "Before drafting anything, the agent walks your stack: reads the history, queries internal systems, detects conflicts between promise and facts, and proposes the next best action with its evidence.",
        capabilities: [
          { t: "RAG over your internal stack", d: "Connects orders, payments, returns, carriers, policies, knowledge base and wikis. The agent cites sources for every conclusion." },
          { t: "Conflict detection", d: "If shipping promise doesn't match tracking, or refunds don't match charges, the agent surfaces it as an explicit flag." },
          { t: "Draft and action plan", d: "You get a ready-to-send reply and a step-by-step plan (refund, re-ship, internal ticket) to approve or adjust." },
          { t: "Auditable reasoning", d: "Every step the agent took — what it read, deduced, proposed — is saved for human review." },
        ],
        outcomes: [
          ["6×", "cases handled per agent"],
          ["02:14", "average draft time"],
          ["91%", "drafts approved without edits"],
        ],
      },
      {
        num: "03",
        slug: "graph",
        name: "Case Graph",
        title: ["The whole case ", { em: "in one map" }, ", not 12 tabs."],
        body: "See the relationship between conversation, order, payment, return, carrier, policies and approvals. One view to understand what's really broken, where, and why.",
        capabilities: [
          { t: "Per-case dynamic graph", d: "Every node is a real entity with live state. Every edge is a typed relationship (paid_for, returned_in, blocked_by)." },
          { t: "Jump to source-of-truth", d: "Click any node to land in Shopify admin, Stripe dashboard or carrier portal — with the right context pre-loaded." },
          { t: "Snapshots for audit", d: "Freeze the graph at the moment of a decision. Reproducible, exportable, anchored to the audit log." },
          { t: "Team view", d: "Ops, finance and support look at the same graph and resolve without meetings." },
        ],
        outcomes: [
          ["−71%", "tool-switching"],
          ["3.4×", "decisions per hour"],
          ["0", "cases without context"],
        ],
      },
      {
        num: "04",
        slug: "policy",
        name: "Approvals & Policy Engine",
        title: ["Rules in plain English,", { em: " verifiable guards" }, "."],
        body: "Refunds, cancellations and goodwill run under rules, permissions and human approval. Author policies in plain English and turn them into guards execution respects to the letter.",
        capabilities: [
          { t: "Policy-as-code", d: "Write in natural language; the system compiles to auditable YAML. Versioned, diffable, reviewable like any code." },
          { t: "Inline approvals", d: "The approver sees the case, evidence and exact effect before signing. Double-check for critical actions." },
          { t: "Limits by role and context", d: "By amount, reason, customer, brand, hour, risk. Composable. No parallel queues." },
          { t: "Sandbox and dry-run", d: "Test a policy change against the last 30 days of history before activating in production." },
        ],
        outcomes: [
          ["100%", "sensitive actions guarded"],
          ["−85%", "ad-hoc exceptions"],
          ["1 afternoon", "to write the first policy"],
        ],
      },
      {
        num: "05",
        slug: "audit",
        name: "Audit & Safe Execution",
        title: ["Every agent action,", { em: " signed and reproducible" }, "."],
        body: "Every agent execution is recorded with its evidence, prompt, queried data and signer. Reproducible, exportable to your SIEM and warehouse, ready for a real audit.",
        capabilities: [
          { t: "Per-case and per-action trace", d: "Each event — query, draft, approval, execution — is sealed with timestamp, actor, evidence hash and cryptographic signature." },
          { t: "Deterministic replay", d: "Reconstruct exactly what the agent saw and decided, at any point in the past." },
          { t: "Export to SIEM and warehouse", d: "Streaming to Datadog, Splunk, BigQuery, Snowflake. Stable, documented schemas." },
          { t: "Privacy by design", d: "PII redaction before the model, regional data residency, configurable retention." },
        ],
        outcomes: [
          ["SOC 2", "Type II"],
          ["GDPR", "compliant"],
          ["100%", "actions sealed"],
        ],
      },
    ],
    integrationsTitle: ["Plugs into", { em: " your current stack" }, "."],
    integrationsLede: "Without replacing anything that already works. Clain orchestrates on top of your helpdesk, ERP and payment rails.",
    integrations: [
      { cat: "Helpdesk", items: ["Zendesk", "Front", "Gorgias", "Intercom", "Freshdesk"] },
      { cat: "Ecommerce", items: ["Shopify", "WooCommerce", "BigCommerce", "Magento", "Salesforce Commerce"] },
      { cat: "Payments", items: ["Stripe", "Adyen", "Braintree", "Klarna", "Mollie"] },
      { cat: "Shipping", items: ["Shippo", "EasyPost", "Sendcloud", "DHL", "UPS API"] },
      { cat: "Comms", items: ["Slack", "Microsoft Teams", "WhatsApp Business", "Twilio"] },
      { cat: "Data", items: ["Snowflake", "BigQuery", "Datadog", "Splunk", "Segment"] },
    ],
    securityTitle: ["Security by default,", { em: " not by roadmap" }, "."],
    securityCards: [
      { t: "SOC 2 Type II", d: "Annual audit with public report available under NDA." },
      { t: "GDPR & DPA", d: "Processing within EU. Subprocessors listed and notified." },
      { t: "Encryption", d: "AES-256 at rest, TLS 1.3 in transit. KMS-managed keys." },
      { t: "SSO + SCIM", d: "Okta, Azure AD, Google Workspace. Automatic provisioning." },
      { t: "Granular roles", d: "Permissions by brand, region, case type and role. Revocable instantly." },
      { t: "Dedicated VPC", d: "Isolated deployment in your cloud for high-sensitivity cases." },
    ],
  }
};

function ProductPage({ t, lang }) {
  const p = PRODUCT_COPY[lang] || PRODUCT_COPY.es;
  const renderTitleParts = window.renderTitleParts;
  const FeaturePlaceholder = window.FeaturePlaceholder;
  const FinalCTA = window.FinalCTA;
  const Panorama = window.Panorama;
  const HelpdeskExtras = window.HelpdeskExtras;
  return (
    <main>
      <section className="hero wrap reveal" style={{paddingBottom: 40}}>
        <div className="hero-eyebrow-row">
          <span className="eyebrow">{p.eyebrow}</span>
        </div>
        <h1 className="h-display">{renderTitleParts(p.title)}</h1>
        <p className="lede" style={{marginTop: 32, maxWidth: 720, fontSize: 19}}>{p.lede}</p>

        <nav className="product-toc reveal-children">
          {p.pillars.map((pl) => (
            <a key={pl.slug} href={`#${pl.slug}`} className="toc-item">
              <span className="toc-num">{pl.num}</span>
              <span className="toc-name">{pl.name}</span>
            </a>
          ))}
        </nav>
      </section>

      {/* Hero metrics + 5-stage flow + before/after + persona tabs */}
      {HelpdeskExtras && <HelpdeskExtras />}

      {Panorama && <Panorama lang={lang} />}

      {p.pillars.map((pl, i) => (
        <section key={pl.slug} id={pl.slug} className="section product-pillar">
          <div className="wrap">
            <div className="pillar-head reveal">
              <div className="pillar-meta">
                <span className="pillar-num">{pl.num} —</span>
                <span className="pillar-tag">{pl.name}</span>
              </div>
              <h2 className="h-section">{renderTitleParts(pl.title)}</h2>
              <p className="lede">{pl.body}</p>
            </div>

            <div className="pillar-body">
              <div className="pillar-vis reveal">
                <FeaturePlaceholder idx={i} />
              </div>
              <div className="pillar-caps reveal-children">
                {pl.capabilities.map((c, j) => (
                  <div key={j} className="cap">
                    <div className="cap-head">
                      <span className="cap-mark">{String(j + 1).padStart(2, '0')}</span>
                      <h4>{c.t}</h4>
                    </div>
                    <p>{c.d}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pillar-outcomes reveal-children">
              {pl.outcomes.map(([n, l], k) => (
                <div key={k} className="outcome">
                  <div className="outcome-num">{n}</div>
                  <div className="outcome-lab">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="section">
        <div className="wrap">
          <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 720}}>
            <span className="eyebrow">Integraciones</span>
            <h2 className="h-section">{renderTitleParts(p.integrationsTitle)}</h2>
            <p className="lede">{p.integrationsLede}</p>
          </div>
          <div className="integ-grid reveal-children">
            {p.integrations.map((g, i) => (
              <div key={i} className="integ-col">
                <h6>{g.cat}</h6>
                <ul>{g.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 720}}>
            <span className="eyebrow">Seguridad</span>
            <h2 className="h-section">{renderTitleParts(p.securityTitle)}</h2>
          </div>
          <div className="security-grid reveal-children">
            {p.securityCards.map((c, i) => (
              <div key={i} className="security-card">
                <h4>{c.t}</h4>
                <p>{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FinalCTA t={t} />
    </main>
  );
}

function PricingPage({ t, navigate }) {
  const renderTitleParts = window.renderTitleParts;
  const Pricing = window.Pricing;
  const FAQ = window.FAQ;
  const FinalCTA = window.FinalCTA;
  return (
    <main>
      <section className="hero wrap reveal" style={{paddingBottom: 40}}>
        <div className="hero-eyebrow-row">
          <span className="eyebrow">{t.nav.pricing}</span>
        </div>
        <h1 className="h-display">{renderTitleParts(t.pricingTitle)}</h1>
        {t.pricingNote && <p className="lede" style={{marginTop: 32, maxWidth: 720, fontSize: 19}}>{t.pricingNote}</p>}
      </section>

      <Pricing t={t} hideTitle navigate={navigate} />
      <FAQ t={t} />
      <FinalCTA t={t} navigate={navigate} />
    </main>
  );
}

window.ProductPage = ProductPage;
window.PricingPage = PricingPage;

/* ============ Panorama (tabbed product canvas) ============ */
const PANORAMA_COPY = {
  es: {
    eyebrow: "Recorrido",
    title: ["Cuatro capas que ", { em: "se sienten como una" }, "."],
    lede: "Mira cómo Clain transforma cada etapa del soporte: desde el helpdesk hasta los insights que cierran el ciclo.",
    tabs: [
      { id: "helpdesk", label: "Helpdesk completo" },
      { id: "agent", label: "Agente IA nativo" },
      { id: "insights", label: "Insights con IA" },
      { id: "system", label: "Sistema que aprende" },
    ],
  },
  en: {
    eyebrow: "Tour",
    title: ["Four layers that ", { em: "feel like one" }, "."],
    lede: "See how Clain transforms each stage of support: from the helpdesk to the insights that close the loop.",
    tabs: [
      { id: "helpdesk", label: "Fully-featured helpdesk" },
      { id: "agent", label: "Native AI Agent" },
      { id: "insights", label: "AI-powered Insights" },
      { id: "system", label: "Self-improving system" },
    ],
  },
};

function Panorama({ lang }) {
  const c = PANORAMA_COPY[lang] || PANORAMA_COPY.es;
  const [tab, setTab] = useState(2); // start on Insights to showcase color
  const renderTitleParts = window.renderTitleParts;
  return (
    <section className="section">
      <div className="wrap">
        <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 760, marginBottom: 0}}>
          <span className="eyebrow">{c.eyebrow}</span>
          <h2 className="h-section">{renderTitleParts(c.title)}</h2>
          <p className="lede">{c.lede}</p>
        </div>

        <div className="panorama reveal">
          <div className="panorama-tabs" role="tablist">
            {c.tabs.map((tb, i) => (
              <button
                key={tb.id}
                role="tab"
                aria-selected={tab === i}
                className={`panorama-tab ${tab === i ? 'active' : ''}`}
                onClick={() => setTab(i)}
                data-cursor="hover"
              >{tb.label}</button>
            ))}
          </div>
          <div className="panorama-stage" data-tab={tab}>
            {tab === 0 && <PanoramaHelpdesk lang={lang} />}
            {tab === 1 && <PanoramaAgent lang={lang} />}
            {tab === 2 && <PanoramaInsights lang={lang} />}
            {tab === 3 && <PanoramaSystem lang={lang} />}
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkspaceShell({ navItems, activeNav, headTitle, filters, children }) {
  return (
    <div className="workspace">
      <aside className="ws-side">
        <h6>Clain</h6>
        {navItems.map((n, i) => (
          <div key={i} className={`nav-row ${i === activeNav ? 'active' : ''}`}>
            <span className="ico" />
            <span>{n}</span>
          </div>
        ))}
      </aside>
      <div className="ws-main">
        <div className="ws-head">
          <div className="title">{headTitle}</div>
          <div className="filters">
            {filters.map((f, i) => <span key={i} className="ws-pill">{f}</span>)}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function PanoramaHelpdesk({ lang }) {
  const isEs = lang === 'es';
  return (
    <WorkspaceShell
      navItems={isEs ? ['Bandeja', 'Mis casos', 'Equipo', 'Vistas', 'Macros', 'Reglas', 'Reports'] : ['Inbox', 'My cases', 'Team', 'Views', 'Macros', 'Rules', 'Reports']}
      activeNav={0}
      headTitle={isEs ? 'Bandeja unificada' : 'Unified inbox'}
      filters={[isEs ? 'Hoy' : 'Today', isEs ? 'Sin asignar' : 'Unassigned', 'SLA <2h']}
    >
      <div style={{display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, height: 'calc(100% - 60px)'}}>
        <div style={{display: 'grid', gap: 6, alignContent: 'start', overflow: 'hidden'}}>
          {[
            { name: 'Marina F.', subj: isEs ? 'Cobro duplicado en mi pedido' : 'Duplicate charge on my order', sla: '00:42', tag: 'pay', color: 'oklch(0.55 0.16 290)' },
            { name: 'Hannah R.', subj: isEs ? 'Devolución no procesada' : 'Refund not processed', sla: '01:12', tag: 'return', color: 'oklch(0.65 0.14 30)' },
            { name: 'Nathan B.', subj: isEs ? 'Pedido perdido en tránsito' : 'Order lost in transit', sla: '02:30', tag: 'ship', color: 'oklch(0.60 0.13 220)' },
            { name: 'Amy W.', subj: isEs ? '¿Puedo cambiar la talla?' : 'Can I change the size?', sla: '03:15', tag: 'order', color: 'oklch(0.62 0.13 145)' },
            { name: 'Marie F.', subj: isEs ? 'Factura incorrecta' : 'Wrong invoice', sla: '04:50', tag: 'billing', color: 'oklch(0.65 0.13 80)' },
          ].map((c, i) => (
            <div key={i} style={{
              padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)',
              background: i === 0 ? 'var(--bg-elev)' : 'transparent',
              boxShadow: i === 0 ? 'inset 2px 0 0 var(--fg)' : 'none',
              fontSize: 12,
            }}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 4}}>
                <span style={{fontWeight: 600}}>{c.name}</span>
                <span style={{fontFamily:'var(--mono)', fontSize: 10, color: 'var(--fg-faint)'}}>SLA {c.sla}</span>
              </div>
              <div style={{color: 'var(--fg-muted)', fontSize: 12, lineHeight: 1.4}}>{c.subj}</div>
              <span style={{display:'inline-block', marginTop: 6, fontSize: 9.5, fontFamily:'var(--mono)', letterSpacing:'0.06em', textTransform:'uppercase', padding:'2px 6px', borderRadius:4, background: c.color, color:'white'}}>{c.tag}</span>
            </div>
          ))}
        </div>
        <div style={{border:'1px solid var(--line)', borderRadius: 10, padding: 16, background: 'var(--bg)', overflow: 'hidden'}}>
          <div style={{fontFamily:'var(--mono)', fontSize: 10, letterSpacing:'0.08em', color:'var(--fg-faint)', textTransform:'uppercase', marginBottom: 8}}>{isEs ? 'Caso' : 'Case'} #4821 · Marina F.</div>
          <h4 style={{fontFamily:'var(--serif)', fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em', marginBottom: 14}}>{isEs ? 'Cobro duplicado en mi pedido #2014' : 'Duplicate charge on my order #2014'}</h4>
          <div style={{display:'grid', gap: 10, fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55}}>
            <p>{isEs ? 'Hola, veo dos cargos de €89,00 en mi tarjeta el martes. Solo hice un pedido. ¿Podéis revisarlo?' : 'Hi, I see two €89.00 charges on my card on Tuesday. I only placed one order. Can you check?'}</p>
            <div style={{padding: 10, borderRadius: 8, background: 'oklch(0.96 0.04 145)', borderLeft:'2px solid oklch(0.55 0.15 145)', color: 'var(--fg)'}}>
              <strong style={{fontFamily:'var(--sans)'}}>Clain Agent · </strong>{isEs ? 'Confirmado: dos charges en Stripe (txn_3O9k…, txn_3O9k…). Refund propuesto de €89,00. Esperando aprobación.' : 'Confirmed: two charges in Stripe (txn_3O9k…, txn_3O9k…). Refund of €89.00 proposed. Awaiting approval.'}</div>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

function PanoramaAgent({ lang }) {
  const isEs = lang === 'es';
  return (
    <WorkspaceShell
      navItems={isEs ? ['Bandeja', 'Agente IA', 'Investigaciones', 'Borradores', 'Aprobaciones', 'Reglas'] : ['Inbox', 'AI Agent', 'Investigations', 'Drafts', 'Approvals', 'Rules']}
      activeNav={1}
      headTitle={isEs ? 'Investigación del agente' : 'Agent investigation'}
      filters={['Live', isEs ? 'Auto-revisión' : 'Auto-review']}
    >
      <div style={{display:'grid', gap: 10, paddingTop: 4}}>
        {[
          { step: '01', label: isEs ? 'Lectura del hilo' : 'Read thread', detail: isEs ? '4 mensajes, 1 attachment, intent: refund' : '4 messages, 1 attachment, intent: refund', color: 'oklch(0.55 0.16 290)' },
          { step: '02', label: isEs ? 'Consulta a Stripe' : 'Stripe lookup', detail: isEs ? '2 charges encontrados (€89.00 × 2)' : '2 charges found (€89.00 × 2)', color: 'oklch(0.62 0.14 220)' },
          { step: '03', label: isEs ? 'Consulta a Shopify' : 'Shopify lookup', detail: isEs ? 'Order #2014 · 1 item · €89.00' : 'Order #2014 · 1 item · €89.00', color: 'oklch(0.65 0.14 145)' },
          { step: '04', label: isEs ? 'Conflicto detectado' : 'Conflict detected', detail: isEs ? 'Cobros (2) ≠ pedidos (1) → duplicado' : 'Charges (2) ≠ orders (1) → duplicate', color: 'oklch(0.62 0.16 30)' },
          { step: '05', label: isEs ? 'Plan propuesto' : 'Proposed plan', detail: isEs ? 'Refund €89.00 → email automático → close case' : 'Refund €89.00 → auto-email → close case', color: 'oklch(0.45 0.16 285)' },
        ].map((s, i) => (
          <div key={i} style={{
            display:'grid', gridTemplateColumns: '60px 220px 1fr auto', alignItems:'center', gap: 14,
            padding: '12px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg)',
          }}>
            <span style={{fontFamily:'var(--mono)', fontSize: 11, color: s.color, fontWeight: 600}}>{s.step}</span>
            <span style={{fontWeight: 600, fontSize: 13.5}}>{s.label}</span>
            <span style={{color:'var(--fg-muted)', fontSize: 12.5}}>{s.detail}</span>
            <span style={{fontFamily:'var(--mono)', fontSize: 10, color: 'var(--fg-faint)', letterSpacing:'0.08em'}}>0.{i + 4}s</span>
          </div>
        ))}
        <div style={{marginTop: 8, padding: 14, borderRadius: 10, background: 'oklch(0.96 0.05 290)', border: '1px solid oklch(0.80 0.10 290)'}}>
          <div style={{fontFamily:'var(--mono)', fontSize: 10, letterSpacing:'0.08em', textTransform:'uppercase', color: 'oklch(0.40 0.18 285)', marginBottom: 6}}>{isEs ? 'Borrador listo · espera aprobación' : 'Draft ready · awaiting approval'}</div>
          <div style={{fontSize: 13, lineHeight: 1.55, color: '#2a1844'}}>{isEs ? '"Hola Marina, hemos confirmado el cobro duplicado y procesado el reembolso de €89,00 a tu tarjeta terminada en 4421. Llegará en 5–7 días hábiles."' : '"Hi Marina, we\'ve confirmed the duplicate charge and processed a €89.00 refund to your card ending in 4421. It will arrive in 5–7 business days."'}</div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

function PanoramaInsights({ lang }) {
  const isEs = lang === 'es';
  return (
    <WorkspaceShell
      navItems={isEs ? ['Analizar', 'Performance', 'Topics Explorer', 'Optimize', 'Train', 'Test', 'Deploy', 'Settings'] : ['Analyze', 'Performance', 'Topics Explorer', 'Optimize', 'Train', 'Test', 'Deploy', 'Settings']}
      activeNav={2}
      headTitle="Topics Explorer"
      filters={[isEs ? '1 mar – 28 mar' : 'Mar 1 – Mar 28', isEs ? 'Tipo: agente' : 'Type: agent', 'CX Score']}
    >
      <div style={{position:'relative'}}>
        <div style={{fontFamily:'var(--mono)', fontSize: 10, letterSpacing:'0.08em', color:'var(--fg-faint)', textTransform:'uppercase', marginBottom: 10}}>{isEs ? '10 topics de mayor volumen' : '10 highest-volume topics'}</div>
        <div className="heatmap">
          <div className="heat-tile t1">
            <div className="h-name">{isEs ? 'Gestión de tarjeta' : 'Card Management'}</div>
            <div className="h-meta">412 conv · CX 4.8</div>
          </div>
          <div className="heat-tile t2">
            <div className="h-name">{isEs ? 'Acceso de cuenta' : 'Account Access'}</div>
            <div className="h-meta">298 conv · CX 4.6</div>
          </div>
          <div className="heat-tile t3">
            <div className="h-name">{isEs ? 'Pagos & transferencias' : 'Payments & Transfers'}</div>
            <div className="h-meta">256 conv · CX 4.0</div>
          </div>
          <div className="heat-tile t4">
            <div className="h-name">{isEs ? 'Gestión de cuenta' : 'Account Management'}</div>
            <div className="h-meta">214 conv · CX 4.2</div>
          </div>
          <div className="heat-tile t5">
            <div className="h-name">{isEs ? 'Fraude & seguridad' : 'Fraud & Security'}</div>
            <div className="h-meta">198 conv · CX 4.5</div>
          </div>
          <div className="heat-tile t6">
            <div className="h-name">{isEs ? 'Insights de gasto' : 'Spending Insights'}</div>
            <div className="h-meta">142 conv · CX 4.4</div>
          </div>
          <div className="heat-tile t7">
            <div className="h-name">{isEs ? 'Notificaciones & ajustes' : 'Notifications & Settings'}</div>
            <div className="h-meta">118 conv · CX 4.3</div>
          </div>
          <div className="heat-tile t8">
            <div className="h-name">{isEs ? 'Consultas de ingreso' : 'Income Queries'}</div>
            <div className="h-meta">96 conv · CX 4.1</div>
          </div>
        </div>
        <div className="annot-pop">
          <div className="head">
            <span className="badge">CX 4.0</span>
            <strong style={{fontSize: 12}}>{isEs ? 'Pagos & transferencias' : 'Payments & Transfers'}</strong>
          </div>
          <p>{isEs ? 'El agente identificó el cobro duplicado, verificó el error, procesó el reembolso y aplicó un goodwill credit.' : 'The agent identified the duplicate charge, verified the error, processed the refund and applied a goodwill credit.'}</p>
        </div>
      </div>
    </WorkspaceShell>
  );
}

function PanoramaSystem({ lang }) {
  const isEs = lang === 'es';
  const greenBars = [40, 55, 65, 60, 72, 68, 78, 85];
  const blueBars = [55, 50, 60, 70, 65, 72, 80, 88];
  return (
    <WorkspaceShell
      navItems={isEs ? ['Analizar', 'Optimizar', 'Recomendaciones', 'Train', 'Test', 'Deploy'] : ['Analyze', 'Optimize', 'Recommendations', 'Train', 'Test', 'Deploy']}
      activeNav={2}
      headTitle={isEs ? 'Recomendaciones' : 'Recommendations'}
      filters={[isEs ? '8 insights' : '8 insights', isEs ? 'Impacto: alto a bajo' : 'Impact: high to low']}
    >
      <div className="insights">
        <div className="ins-col">
          <h6><span>{isEs ? 'Métricas en vivo' : 'Live metrics'}</span><span style={{color:'oklch(0.55 0.15 145)'}}>↑ +1.7%</span></h6>
          <div className="ins-chart">
            <div>
              <div className="chart-cap">{isEs ? 'Tasa de resolución 85.6%' : 'Resolution rate 85.6%'}</div>
              <div className="chart-row">{greenBars.map((h, i) => <div key={i} className="bar" style={{height: h + '%', background: 'oklch(0.65 0.15 145)'}}/>)}</div>
            </div>
            <div>
              <div className="chart-cap">{isEs ? 'Volumen 1.18k' : 'Volume 1.18k'}</div>
              <div className="chart-row">{blueBars.map((h, i) => <div key={i} className="bar" style={{height: h + '%', background: 'oklch(0.65 0.13 220)'}}/>)}</div>
            </div>
            <div>
              <div className="chart-cap">{isEs ? 'Engagement 79.1%' : 'Engagement 79.1%'}</div>
              <div className="chart-row">{[60,65,70,68,75,78,82,85].map((h, i) => <div key={i} className="bar" style={{height: h + '%', background: 'oklch(0.70 0.12 220)'}}/>)}</div>
            </div>
          </div>
        </div>

        <div className="ins-col">
          <h6><span>{isEs ? '15 ítems' : '15 items'}</span><span>{isEs ? 'Filtros' : 'Filters'}</span></h6>
          <div className="rec-list">
            {[
              { tag: 'gap', tagL: isEs ? 'Gap de contenido' : 'Content gap', title: isEs ? 'Entender tu factura mensual' : 'Understanding your monthly invoice', meta: isEs ? '6 conv · alto impacto' : '6 conv · high impact' },
              { tag: 'data', tagL: isEs ? 'Detalles de pago' : 'Payment details', title: isEs ? 'Capturar fecha exacta del próximo cargo' : 'Capture exact next charge date', meta: '8 conv · medium' },
              { tag: 'action', tagL: isEs ? 'Acción' : 'Action', title: isEs ? 'Habilitar refund automático <€20' : 'Enable auto-refund <€20', meta: isEs ? '14 conv · alto impacto' : '14 conv · high impact' },
              { tag: 'gap', tagL: isEs ? 'Gap de contenido' : 'Content gap', title: isEs ? 'Diagnóstico de facturas duplicadas' : 'Diagnose duplicate invoices', meta: '5 conv · medium' },
              { tag: 'data', tagL: isEs ? 'Detalles' : 'Details', title: isEs ? 'Cargos basados en uso' : 'Usage-based charges', meta: '4 conv · low' },
            ].map((r, i) => (
              <div key={i} className="rec-item">
                <span className={`tag ${r.tag}`}>{r.tagL}</span>
                <div className="rec-title">{r.title}</div>
                <div className="rec-meta">{r.meta}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="ins-col">
          <h6><span>{isEs ? 'Editar artículo' : 'Edit article'}</span><span style={{display:'inline-flex', gap: 4}}><span style={{color:'oklch(0.55 0.15 145)'}}>✓</span><span style={{color:'oklch(0.60 0.18 30)'}}>×</span></span></h6>
          <div className="article">
            <h5>{isEs ? 'Entender tu factura mensual' : 'Understanding your monthly invoice'}</h5>
            <p style={{marginBottom: 8}}><strong>{isEs ? 'Suscripciones mensuales' : 'Monthly subscriptions'}</strong></p>
            <p style={{marginBottom: 8}}>{isEs ? 'Si estás en una suscripción mensual, recibirás una factura al inicio de cada ciclo.' : 'On a monthly subscription, you\'ll receive an invoice at the start of each billing cycle.'}</p>
            <p style={{marginBottom: 8}}><strong>{isEs ? 'Prorrateos' : 'Prorations'}</strong></p>
            <p style={{marginBottom: 8}}>
              <span className="hl-green">{isEs ? 'Si subes de plan, bajas de plan o cambias de asientos durante tu ciclo,' : 'If you upgrade, downgrade, or change seats during your billing cycle,'}</span>{' '}
              {isEs ? 'verás cargos prorrateados en tu próxima factura.' : 'you\'ll see prorated charges on your next invoice.'}
            </p>
            <p style={{marginBottom: 8}}><strong>{isEs ? 'Cargos basados en uso' : 'Usage-based charges'}</strong></p>
            <p>
              <span className="hl-amber">{isEs ? 'Los cargos por uso reflejan la actividad del periodo anterior.' : 'Usage-based charges reflect activity from the previous period.'}</span>{' '}
              {isEs ? 'Por ejemplo, si superaste tu límite el mes pasado, los cargos extra aparecerán en tu factura actual.' : 'For example, if you exceeded your limit last month, the overage will appear in your current invoice.'}
            </p>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

window.Panorama = Panorama;
