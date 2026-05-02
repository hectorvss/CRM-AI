/* global React */
const { useState: useStateS, useEffect: useEffectS } = React;

/* =================================================================
   /omnichannel — Helpdesk omnicanal
   ================================================================= */

const OMNI_COPY = {
  es: {
    eyebrow: "Helpdesk omnicanal",
    title: ["Una bandeja. ", { em: "Todos los canales." }, " Cero copia-pegar."],
    lede: "Email, WhatsApp, chat web, Instagram, voz y formularios convergen en hilos únicos. El cliente cambia de canal — el contexto no se pierde, el agente no se entera.",
    pillTag: "v0.9",
    pillText: "9 canales nativos · sin conectores frágiles",
    channels: [
      { k: "email",    name: "Email",            ex: "soporte@brand.com",         vol: "42%", color: "oklch(0.65 0.13 220)" },
      { k: "wa",       name: "WhatsApp",         ex: "+34 600 ...",               vol: "21%", color: "oklch(0.65 0.15 145)" },
      { k: "chat",     name: "Chat web",         ex: "widget · marca.com",        vol: "14%", color: "oklch(0.70 0.14 60)" },
      { k: "ig",       name: "Instagram DM",     ex: "@marca",                    vol: "8%",  color: "oklch(0.62 0.18 320)" },
      { k: "voice",    name: "Voz / Aircall",    ex: "+34 91 ...",                vol: "7%",  color: "oklch(0.60 0.18 30)" },
      { k: "sms",      name: "SMS",              ex: "+34 600 ...",               vol: "3%",  color: "oklch(0.65 0.10 250)" },
      { k: "form",     name: "Formularios",      ex: "/contacto, /devoluciones",  vol: "2%",  color: "oklch(0.55 0.05 250)" },
      { k: "review",   name: "Reseñas",          ex: "Trustpilot · Google",       vol: "2%",  color: "oklch(0.70 0.14 80)" },
      { k: "api",      name: "Webhook / API",    ex: "/v1/cases",                 vol: "1%",  color: "oklch(0.45 0.02 250)" },
    ],
    routingTitle: ["Routing por contexto, ", { em: "no por canal" }, "."],
    routingLede: "El canal es solo el envoltorio. Lo que importa es: quién es el cliente, qué pidió, cuánto SLA queda, qué riesgo tiene. Esa es la dimensión por la que Clain enruta.",
    routingPills: ["Idioma", "SLA restante", "Valor del cliente", "Riesgo (chargeback)", "Tipo de caso", "Skill del agente", "Carga del equipo", "Brand · región"],
    timeline: {
      title: ["Un hilo, ", { em: "tres canales" }, ", cero contexto perdido."],
      lede: "Caso real reconstruido a partir de un cliente que escribió por email, siguió por WhatsApp y cerró por chat. Para Clain, es un solo hilo.",
      events: [
        { t: "10:42", ch: "email", who: "Cliente", body: "Pedí 2 unidades, llegó solo 1. El packing slip dice 2.", meta: "ORD-7281 · vinculado automáticamente" },
        { t: "10:43", ch: "sys",   who: "Clain",   body: "Detectado: discrepancia entre fulfilled_qty (2) y delivered_qty (1). Carrier: GLS. Tracking: in transit, parcel 2/2.", meta: "Evidencia adjunta al hilo" },
        { t: "11:08", ch: "wa",    who: "Cliente", body: "Hola, escribí por email pero no me han contestado. Necesito esto urgente.", meta: "Mismo número que en el perfil · merge automático" },
        { t: "11:08", ch: "sys",   who: "Clain",   body: "Hilo unificado con CASE-4129. Cliente y pedido reconocidos. Borrador propuesto al agente.", meta: "Sin duplicar caso" },
        { t: "11:11", ch: "wa",    who: "Agente",  body: "Hola Marta, vemos que el segundo paquete sigue en tránsito. Llega mañana antes de las 14h. ¿Te confirmamos por aquí o por email?", meta: "Plantilla aprobada · evidencia GLS adjunta" },
        { t: "11:42", ch: "chat",  who: "Cliente", body: "Confírmame por aquí, gracias.", meta: "Tercer canal · mismo hilo, mismo contexto" },
        { t: "11:43", ch: "sys",   who: "Clain",   body: "Recordatorio programado para 14:00 mañana. Si tracking ≠ delivered, escalar a Ops.", meta: "Acción condicional registrada" },
      ],
    },
    handoffTitle: ["Handoff de IA a humano, ", { em: "sin fricción" }, "."],
    handoffLede: "El agente IA resuelve, propone o escala. Cuando escala, el humano recibe un brief listo: qué pasó, qué se intentó, qué falta. Nadie empieza de cero.",
    handoffSteps: [
      { num: "01", t: "El agente ingiere el mensaje", d: "En cualquier canal. Identifica intención, entidad, urgencia. Verifica contra tus sistemas." },
      { num: "02", t: "Resuelve o propone", d: "Si la respuesta es alta-confianza y dentro de política, responde. Si no, prepara borrador + plan." },
      { num: "03", t: "Escala con brief", d: "El humano hereda el caso con resumen, evidencia, próximas acciones sugeridas y nivel de confianza por paso." },
      { num: "04", t: "Vuelve a aprender", d: "Cómo lo cerró el humano se incorpora al modelo del cliente. La próxima vez, mejor confianza." },
    ],
    statsTitle: "Lo que cambia cuando el canal deja de mandar.",
    stats: [
      { n: "−54%", l: "tiempo medio de primera respuesta" },
      { n: "+38%", l: "casos resueltos sin escalar" },
      { n: "1.0",  l: "hilos por caso (antes 2.7 hilos / caso)" },
      { n: "9",    l: "canales nativos en una vista" },
    ],
    proofQuote: "Antes teníamos un equipo dedicado solo a fusionar conversaciones que llegaban por canales distintos. Ese equipo ya no existe — Clain lo hace en background.",
    proofWho: "Iván Rodríguez · Head of CX, Quintela",
  },
  en: {
    eyebrow: "Omnichannel helpdesk",
    title: ["One inbox. ", { em: "Every channel." }, " Zero copy-paste."],
    lede: "Email, WhatsApp, web chat, Instagram, voice and forms converge into single threads. The customer switches channels — context doesn't break, the agent doesn't notice.",
    pillTag: "v0.9",
    pillText: "9 native channels · no fragile connectors",
    channels: [
      { k: "email",    name: "Email",            ex: "support@brand.com",         vol: "42%", color: "oklch(0.65 0.13 220)" },
      { k: "wa",       name: "WhatsApp",         ex: "+44 7700 ...",              vol: "21%", color: "oklch(0.65 0.15 145)" },
      { k: "chat",     name: "Web chat",         ex: "widget · brand.com",        vol: "14%", color: "oklch(0.70 0.14 60)" },
      { k: "ig",       name: "Instagram DM",     ex: "@brand",                    vol: "8%",  color: "oklch(0.62 0.18 320)" },
      { k: "voice",    name: "Voice / Aircall",  ex: "+44 20 ...",                vol: "7%",  color: "oklch(0.60 0.18 30)" },
      { k: "sms",      name: "SMS",              ex: "+44 7700 ...",              vol: "3%",  color: "oklch(0.65 0.10 250)" },
      { k: "form",     name: "Forms",            ex: "/contact, /returns",        vol: "2%",  color: "oklch(0.55 0.05 250)" },
      { k: "review",   name: "Reviews",          ex: "Trustpilot · Google",       vol: "2%",  color: "oklch(0.70 0.14 80)" },
      { k: "api",      name: "Webhook / API",    ex: "/v1/cases",                 vol: "1%",  color: "oklch(0.45 0.02 250)" },
    ],
    routingTitle: ["Routing by context, ", { em: "not by channel" }, "."],
    routingLede: "The channel is just packaging. What matters is: who is the customer, what did they buy, how much SLA is left, what's the risk. That's the axis Clain routes on.",
    routingPills: ["Language", "SLA remaining", "Customer value", "Risk (chargeback)", "Case type", "Agent skill", "Team load", "Brand · region"],
    timeline: {
      title: ["One thread, ", { em: "three channels" }, ", zero context lost."],
      lede: "Real case reconstructed from a customer who emailed, switched to WhatsApp and closed on chat. To Clain, it's a single thread.",
      events: [
        { t: "10:42", ch: "email", who: "Customer", body: "I ordered 2 units, only 1 arrived. The packing slip says 2.", meta: "ORD-7281 · auto-linked" },
        { t: "10:43", ch: "sys",   who: "Clain",    body: "Detected: discrepancy between fulfilled_qty (2) and delivered_qty (1). Carrier: GLS. Tracking: in transit, parcel 2/2.", meta: "Evidence attached to thread" },
        { t: "11:08", ch: "wa",    who: "Customer", body: "Hi, I emailed but no reply yet. I need this urgently.", meta: "Same number as profile · auto-merge" },
        { t: "11:08", ch: "sys",   who: "Clain",    body: "Thread unified with CASE-4129. Customer & order recognized. Draft proposed to agent.", meta: "No duplicate case" },
        { t: "11:11", ch: "wa",    who: "Agent",    body: "Hi Marta, second parcel is still in transit. Arriving tomorrow before 2pm. Confirm here or by email?", meta: "Approved template · GLS evidence attached" },
        { t: "11:42", ch: "chat",  who: "Customer", body: "Confirm here, thanks.", meta: "Third channel · same thread, same context" },
        { t: "11:43", ch: "sys",   who: "Clain",    body: "Reminder scheduled for 2pm tomorrow. If tracking ≠ delivered, escalate to Ops.", meta: "Conditional action recorded" },
      ],
    },
    handoffTitle: ["AI to human handoff, ", { em: "without friction" }, "."],
    handoffLede: "The AI agent resolves, proposes or escalates. When it escalates, the human gets a ready brief: what happened, what was tried, what's missing. Nobody starts from scratch.",
    handoffSteps: [
      { num: "01", t: "Agent ingests the message", d: "On any channel. Identifies intent, entity, urgency. Verifies against your systems." },
      { num: "02", t: "Resolves or proposes", d: "If high-confidence and within policy, it responds. Otherwise, draft + plan ready for review." },
      { num: "03", t: "Escalates with brief", d: "The human inherits the case with summary, evidence, next-best-action and per-step confidence." },
      { num: "04", t: "Loop back to learn", d: "How the human closed it feeds back into the customer model. Better confidence next time." },
    ],
    statsTitle: "What changes when the channel stops driving.",
    stats: [
      { n: "−54%", l: "average first response time" },
      { n: "+38%", l: "cases resolved without escalation" },
      { n: "1.0",  l: "threads per case (was 2.7 threads / case)" },
      { n: "9",    l: "native channels in one view" },
    ],
    proofQuote: "We used to have a whole team just merging conversations from different channels. That team doesn't exist anymore — Clain does it in the background.",
    proofWho: "Iván Rodríguez · Head of CX, Quintela",
  },
};

function ChannelGlyph({ k }) {
  // tiny abstract glyphs per channel (mono-line, not emoji)
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (k) {
    case "email":  return (<svg {...common}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 8l9 6 9-6"/></svg>);
    case "wa":     return (<svg {...common}><path d="M4 20l1.4-4.2A8 8 0 1 1 9 19.4L4 20z"/><path d="M9 11c.3 1.6 1.6 2.9 3.2 3.2l1-1.4c1.4.4 2.6.4 2.6.4l-.5 1.6a4 4 0 0 1-4.5-1.1A4 4 0 0 1 9.4 9l1.6-.5s0 1.2.4 2.6L10 12z"/></svg>);
    case "chat":   return (<svg {...common}><path d="M4 5h16v11H8l-4 4z"/></svg>);
    case "ig":     return (<svg {...common}><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.5"/><circle cx="17" cy="7" r="0.6" fill="currentColor"/></svg>);
    case "voice":  return (<svg {...common}><path d="M5 4h3l2 5-2.5 1.5a10 10 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A14 14 0 0 1 4 6a2 2 0 0 1 1-2z"/></svg>);
    case "sms":    return (<svg {...common}><path d="M4 6h16v10H10l-4 4V6z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/></svg>);
    case "form":   return (<svg {...common}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>);
    case "review": return (<svg {...common}><path d="M12 4l2.4 5 5.6.6-4 4 1.2 5.4L12 16.4 6.8 19l1.2-5.4-4-4 5.6-.6z"/></svg>);
    case "api":    return (<svg {...common}><path d="M8 6l-4 6 4 6M16 6l4 6-4 6M14 4l-4 16"/></svg>);
    case "sys":    return (<svg {...common}><circle cx="12" cy="12" r="8"/><path d="M9 12l2 2 4-4"/></svg>);
    default:       return null;
  }
}

function OmniInbox({ channels }) {
  // a stylized live unified inbox preview
  const rows = [
    { ch: "wa",     who: "Marta L.",     prev: "Hola, escribí por email pero…", t: "11:08", tag: "ORD-7281", urgent: true },
    { ch: "email",  who: "Akin O.",      prev: "Refund pendiente desde el martes", t: "11:02", tag: "ORD-7264", urgent: true },
    { ch: "chat",   who: "Visit · 2c91", prev: "¿Cuándo sale mi pedido?",       t: "10:58", tag: "ORD-7259" },
    { ch: "voice",  who: "+34 600 82…",  prev: "[transcripción] cambio de talla", t: "10:51", tag: "ORD-7244" },
    { ch: "ig",     who: "@laura.b",     prev: "Foto del paquete dañado",       t: "10:47", tag: "ORD-7231" },
    { ch: "form",   who: "alt-form/56",  prev: "Devolución internacional",      t: "10:32", tag: "ORD-7218" },
    { ch: "email",  who: "Eva P.",       prev: "Confirmación factura abril",    t: "10:14", tag: "INV-2204" },
  ];
  return (
    <div className="omni-inbox">
      <div className="omni-inbox-head">
        <div className="omni-inbox-title">
          <span className="omni-dot" />
          <span>Bandeja unificada</span>
        </div>
        <div className="omni-inbox-meta">
          <span>{rows.length} hilos vivos</span>
          <span>·</span>
          <span>2 SLA en rojo</span>
        </div>
      </div>
      <div className="omni-inbox-body">
        {rows.map((r, i) => {
          const c = channels.find((c) => c.k === r.ch);
          return (
            <div key={i} className={`omni-row ${r.urgent ? 'is-urgent' : ''}`}>
              <div className="omni-row-ch" style={{ color: c?.color }}>
                <ChannelGlyph k={r.ch} />
              </div>
              <div className="omni-row-main">
                <div className="omni-row-top">
                  <span className="omni-row-who">{r.who}</span>
                  <span className="omni-row-tag">{r.tag}</span>
                </div>
                <div className="omni-row-prev">{r.prev}</div>
              </div>
              <div className="omni-row-time">{r.t}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OmniChannelsGrid({ channels }) {
  return (
    <div className="omni-channels">
      {channels.map((c) => (
        <div key={c.k} className="omni-channel">
          <div className="omni-channel-icon" style={{ color: c.color }}>
            <ChannelGlyph k={c.k} />
          </div>
          <div className="omni-channel-name">{c.name}</div>
          <div className="omni-channel-ex">{c.ex}</div>
          <div className="omni-channel-vol">
            <span className="omni-channel-bar" style={{ width: c.vol, background: c.color }} />
            <span>{c.vol}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function OmniTimeline({ events }) {
  return (
    <div className="omni-timeline">
      {events.map((ev, i) => {
        const isSys = ev.ch === 'sys';
        return (
          <div key={i} className={`omni-evt ${isSys ? 'is-sys' : ''}`}>
            <div className="omni-evt-rail">
              <div className="omni-evt-dot"><ChannelGlyph k={ev.ch} /></div>
              {i < events.length - 1 && <div className="omni-evt-line" />}
            </div>
            <div className="omni-evt-body">
              <div className="omni-evt-head">
                <span className="omni-evt-time">{ev.t}</span>
                <span className="omni-evt-who">{ev.who}</span>
                <span className="omni-evt-ch">via {ev.ch === 'sys' ? 'Clain' : ev.ch.toUpperCase()}</span>
              </div>
              <div className="omni-evt-text">{ev.body}</div>
              <div className="omni-evt-meta">{ev.meta}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OmnichannelPage({ t, lang }) {
  const c = OMNI_COPY[lang] || OMNI_COPY.es;
  const renderTitleParts = window.renderTitleParts;
  const FinalCTA = window.FinalCTA;
  return (
    <main>
      {/* Hero */}
      <section className="hero wrap reveal" style={{paddingBottom: 24}}>
        <div className="hero-eyebrow-row">
          <span className="eyebrow">{c.eyebrow}</span>
          <span className="hero-pill"><b>{c.pillTag}</b><span>·</span><span>{c.pillText}</span></span>
        </div>
        <h1 className="h-display">{renderTitleParts(c.title)}</h1>
        <p className="lede" style={{marginTop: 32, maxWidth: 760, fontSize: 19}}>{c.lede}</p>
      </section>

      {/* Live inbox preview */}
      <section className="section" style={{paddingTop: 40}}>
        <div className="wrap">
          <div className="omni-inbox-wrap reveal">
            <OmniInbox channels={c.channels} />
          </div>
        </div>
      </section>

      {/* Channels grid */}
      <section className="section">
        <div className="wrap">
          <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 720, marginBottom: 48}}>
            <span className="eyebrow">{lang === 'es' ? 'Canales nativos' : 'Native channels'}</span>
            <h2 className="h-section">{lang === 'es'
              ? <>Nueve entradas, <em>una sola lógica</em>.</>
              : <>Nine inputs, <em>one single logic</em>.</>}</h2>
            <p className="lede">{lang === 'es'
              ? 'Cada canal entra con su metadata original (headers de email, IDs de WhatsApp, transcripciones de voz). Clain normaliza, identifica y enruta sin perder nada en el camino.'
              : 'Each channel enters with its original metadata (email headers, WhatsApp IDs, voice transcripts). Clain normalises, identifies and routes without losing anything along the way.'}
            </p>
          </div>
          <OmniChannelsGrid channels={c.channels} />
        </div>
      </section>

      {/* Routing */}
      <section className="section">
        <div className="wrap">
          <div className="omni-routing reveal">
            <div className="omni-routing-head">
              <span className="eyebrow">{lang === 'es' ? 'Routing' : 'Routing'}</span>
              <h2 className="h-section">{renderTitleParts(c.routingTitle)}</h2>
              <p className="lede" style={{maxWidth: 720}}>{c.routingLede}</p>
            </div>
            <div className="omni-routing-pills">
              {c.routingPills.map((p, i) => (
                <span key={i} className="omni-pill">{p}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="section">
        <div className="wrap">
          <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 760, marginBottom: 48}}>
            <span className="eyebrow">{lang === 'es' ? 'Hilo unificado' : 'Unified thread'}</span>
            <h2 className="h-section">{renderTitleParts(c.timeline.title)}</h2>
            <p className="lede">{c.timeline.lede}</p>
          </div>
          <OmniTimeline events={c.timeline.events} />
        </div>
      </section>

      {/* Handoff */}
      <section className="section">
        <div className="wrap">
          <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 720, marginBottom: 48}}>
            <span className="eyebrow">{lang === 'es' ? 'Handoff' : 'Handoff'}</span>
            <h2 className="h-section">{renderTitleParts(c.handoffTitle)}</h2>
            <p className="lede">{c.handoffLede}</p>
          </div>
          <div className="omni-handoff">
            {c.handoffSteps.map((s, i) => (
              <div key={i} className="omni-handoff-step">
                <span className="omni-handoff-num">{s.num}</span>
                <h4>{s.t}</h4>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats + proof */}
      <section className="section">
        <div className="wrap">
          <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 720, marginBottom: 40}}>
            <span className="eyebrow">{lang === 'es' ? 'Resultados' : 'Outcomes'}</span>
            <h2 className="h-section">{c.statsTitle}</h2>
          </div>
          <div className="omni-stats">
            {c.stats.map((s, i) => (
              <div key={i} className="omni-stat">
                <div className="omni-stat-num">{s.n}</div>
                <div className="omni-stat-lab">{s.l}</div>
              </div>
            ))}
          </div>
          <div className="omni-proof reveal">
            <p>"{c.proofQuote}"</p>
            <span>{c.proofWho}</span>
          </div>
        </div>
      </section>

      <FinalCTA t={t} />
    </main>
  );
}

window.OmnichannelPage = OmnichannelPage;

/* =================================================================
   /early-stage — Programa para startups
   ================================================================= */

const EARLY_COPY = {
  es: {
    eyebrow: "Programa Early-stage",
    title: ["Soporte de IA para startups que ", { em: "aún no tienen equipo de soporte" }, "."],
    lede: "Si levantaste menos de 12M€ y llevas menos de 5 años, te damos Clain gratis durante 12 meses, on-boarding 1-a-1 con un fundador, y créditos para nuestros partners de infra.",
    pillText: "Aplica en 5 minutos · respuesta en 7 días",
    benefitsTitle: ["Lo que recibes el día ", { em: "uno" }, "."],
    benefits: [
      { num: "01", t: "12 meses de Clain gratis", d: "Plan Scale completo, sin límite de seats. Suficiente para crecer de 0 a 200k pedidos / año sin migrar." },
      { num: "02", t: "Onboarding con un fundador", d: "Una hora a la semana durante el primer mes, con quien escribió el producto. No con un account manager." },
      { num: "03", t: "Créditos de infra", d: "30k$ en crédito Anthropic, 25k$ Stripe Atlas, 20k$ AWS Activate, 10k$ Linear, Sentry, Posthog. Activación directa." },
      { num: "04", t: "Acceso al Clain Network", d: "Slack privado con +120 fundadores de ecommerce, ops, supply chain. Hiring, intros, deal-flow." },
      { num: "05", t: "Plantillas de operaciones", d: "Playbooks listos para copiar: refunds, devoluciones internacionales, fraude, churn, escalado de equipo." },
      { num: "06", t: "Después del año", d: "50% de descuento permanente. Sin upsell agresivo, sin auto-renovación a precio sorpresa." },
    ],
    eligibilityTitle: ["Quién puede ", { em: "aplicar" }, "."],
    eligibility: [
      { t: "Has levantado menos de 12M€", d: "Sumando todas las rondas. SAFEs convertidos cuentan." },
      { t: "Tu empresa tiene menos de 5 años", d: "Desde la incorporación legal de la entidad principal." },
      { t: "Eres una marca de ecommerce o un SaaS con soporte", d: "DTC, marketplace, suscripción, hardware con soporte. SaaS B2B con CX team también encaja." },
      { t: "Tienes al menos un canal de soporte vivo", d: "Aunque sea email + un Notion. No necesitas helpdesk previo, pero sí volumen real." },
    ],
    timelineTitle: ["Cómo funciona el ", { em: "proceso" }, "."],
    timelineSteps: [
      { day: "Día 0", t: "Aplicación", d: "Formulario de 8 campos. Cap-table no requerida — confiamos en lo que cuentes." },
      { day: "Día 1-7", t: "Revisión", d: "Una llamada de 30 min con un fundador. No es entrevista, es para entender tu setup actual." },
      { day: "Día 7-10", t: "Decisión", d: "Aceptamos al ~70% de quienes aplican. Si no encajas hoy, te decimos exactamente qué tendría que cambiar." },
      { day: "Día 10-14", t: "Onboarding", d: "Plug & play con tu helpdesk actual. Primer caso resuelto por el agente típicamente en menos de 48h." },
      { day: "Día 14+", t: "Acompañamiento", d: "Revisiones semanales mientras lo pides. Después, mensuales o cuando lo necesites." },
    ],
    faqTitle: "Preguntas que nos hacéis siempre.",
    faqs: [
      { q: "¿Hay letra pequeña?", a: "No. Sin compromiso de permanencia, sin cláusulas de exclusividad, sin obligación de aparecer en marketing. Si quieres salirte el mes 4, te exportamos todos los datos en formatos abiertos y no nos verás más." },
      { q: "¿Y si crecemos rápido y superamos el límite de Scale?", a: "El plan no tiene límite de pedidos durante los 12 meses. Si superas 1M de pedidos/año (poco probable en early-stage), nos sentamos y vemos qué tiene sentido — sin trampa." },
      { q: "¿Por qué hacéis esto?", a: "Porque la mayoría de nuestros clientes con más tracción hoy fueron startups que entraron por aquí en su año 1. Es nuestra forma más eficiente de growth, y es honesto sobre eso." },
      { q: "¿Qué pasa con los datos al terminar el año?", a: "Si no continúas, tienes 90 días para exportar todo (CSVs, JSON, accesos API). Después, hard-delete del cluster con confirmación firmada." },
      { q: "¿Aplica si ya somos clientes pagando?", a: "Sí, si encajas en los criterios. Te aplicamos el descuento al siguiente ciclo y te metemos en el programa con el resto de beneficios." },
    ],
    apply: {
      title: "¿Encajas?",
      sub: "El formulario tarda 5 minutos. Lo lee un fundador, no un bot.",
      cta: "Aplicar al programa",
      note: "También puedes escribir directamente a early@clain.com",
    },
  },
  en: {
    eyebrow: "Early-stage program",
    title: ["AI support for startups that ", { em: "don't have a support team yet" }, "."],
    lede: "If you've raised less than €12M and you're under 5 years old, we give you Clain free for 12 months, 1-on-1 onboarding with a founder, and credit for our infra partners.",
    pillText: "Apply in 5 minutes · response in 7 days",
    benefitsTitle: ["What you get on day ", { em: "one" }, "."],
    benefits: [
      { num: "01", t: "12 months of Clain free", d: "Full Scale plan, unlimited seats. Enough to grow from 0 to 200k orders / year without migrating." },
      { num: "02", t: "Onboarding with a founder", d: "An hour a week for the first month, with someone who wrote the product. Not an account manager." },
      { num: "03", t: "Infra credits", d: "$30k Anthropic credit, $25k Stripe Atlas, $20k AWS Activate, $10k Linear, Sentry, Posthog. Direct activation." },
      { num: "04", t: "Access to the Clain Network", d: "Private Slack with 120+ ecommerce, ops & supply-chain founders. Hiring, intros, deal-flow." },
      { num: "05", t: "Operations playbooks", d: "Ready-to-copy templates: refunds, international returns, fraud, churn, team scaling." },
      { num: "06", t: "After year one", d: "50% permanent discount. No aggressive upsell, no surprise auto-renewal pricing." },
    ],
    eligibilityTitle: ["Who can ", { em: "apply" }, "."],
    eligibility: [
      { t: "You've raised less than €12M", d: "Across all rounds. Converted SAFEs count." },
      { t: "Your company is under 5 years old", d: "From the legal incorporation of the main entity." },
      { t: "You're an ecommerce brand or a SaaS with support", d: "DTC, marketplace, subscription, hardware with support. B2B SaaS with a CX team also fits." },
      { t: "You have at least one live support channel", d: "Even if it's email + a Notion. You don't need a prior helpdesk, but you need real volume." },
    ],
    timelineTitle: ["How the ", { em: "process" }, " works."],
    timelineSteps: [
      { day: "Day 0", t: "Application", d: "8-field form. Cap-table not required — we trust what you tell us." },
      { day: "Day 1-7", t: "Review", d: "A 30-min call with a founder. Not an interview, just to understand your current setup." },
      { day: "Day 7-10", t: "Decision", d: "We accept ~70% of applicants. If you don't fit today, we tell you exactly what would need to change." },
      { day: "Day 10-14", t: "Onboarding", d: "Plug & play with your existing helpdesk. First case solved by the agent typically in under 48h." },
      { day: "Day 14+", t: "Support", d: "Weekly reviews as long as you want them. Then monthly, or whenever you need." },
    ],
    faqTitle: "Questions we get every time.",
    faqs: [
      { q: "Is there fine print?", a: "No. No lock-in, no exclusivity clauses, no obligation to appear in marketing. If you want out in month 4, we export all your data in open formats and you'll never hear from us again." },
      { q: "What if we grow fast and exceed Scale's limit?", a: "The plan has no order limit for the 12 months. If you cross 1M orders/year (unlikely in early-stage), we sit down and figure out what makes sense — no trap." },
      { q: "Why are you doing this?", a: "Because most of our highest-traction customers today were startups that came in via this program in their year 1. It's our most efficient growth channel, and we're honest about that." },
      { q: "What happens to our data when the year ends?", a: "If you don't continue, you have 90 days to export everything (CSV, JSON, API access). Then hard-delete from the cluster with signed confirmation." },
      { q: "Does this apply if we're already paying customers?", a: "Yes, if you fit the criteria. We apply the discount to your next cycle and add you to the program with all other benefits." },
    ],
    apply: {
      title: "Are you a fit?",
      sub: "The form takes 5 minutes. A founder reads it, not a bot.",
      cta: "Apply to the program",
      note: "You can also write directly to early@clain.com",
    },
  },
};

function EarlyStagePage({ t, lang }) {
  const c = EARLY_COPY[lang] || EARLY_COPY.es;
  const renderTitleParts = window.renderTitleParts;
  const [open, setOpen] = useStateS(0);
  return (
    <main>
      {/* Hero */}
      <section className="hero wrap reveal" style={{paddingBottom: 24}}>
        <div className="hero-eyebrow-row">
          <span className="eyebrow">{c.eyebrow}</span>
          <span className="hero-pill"><b>—12mo</b><span>·</span><span>{c.pillText}</span></span>
        </div>
        <h1 className="h-display">{renderTitleParts(c.title)}</h1>
        <p className="lede" style={{marginTop: 32, maxWidth: 760, fontSize: 19}}>{c.lede}</p>

        <div className="early-hero-meta reveal-children">
          <div><span className="early-meta-num">€0</span><span className="early-meta-lab">{lang === 'es' ? 'durante 12 meses' : 'for 12 months'}</span></div>
          <div><span className="early-meta-num">7d</span><span className="early-meta-lab">{lang === 'es' ? 'tiempo de respuesta' : 'response time'}</span></div>
          <div><span className="early-meta-num">120+</span><span className="early-meta-lab">{lang === 'es' ? 'fundadores en la red' : 'founders in network'}</span></div>
          <div><span className="early-meta-num">~70%</span><span className="early-meta-lab">{lang === 'es' ? 'tasa de aceptación' : 'acceptance rate'}</span></div>
        </div>
      </section>

      {/* Benefits grid */}
      <section className="section">
        <div className="wrap">
          <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 720, marginBottom: 48}}>
            <span className="eyebrow">{lang === 'es' ? 'Beneficios' : 'Benefits'}</span>
            <h2 className="h-section">{renderTitleParts(c.benefitsTitle)}</h2>
          </div>
          <div className="early-benefits">
            {c.benefits.map((b, i) => (
              <div key={i} className="early-benefit">
                <span className="early-benefit-num">{b.num}</span>
                <h4>{b.t}</h4>
                <p>{b.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Eligibility */}
      <section className="section">
        <div className="wrap">
          <div className="early-elig">
            <div className="early-elig-head reveal">
              <span className="eyebrow">{lang === 'es' ? 'Elegibilidad' : 'Eligibility'}</span>
              <h2 className="h-section">{renderTitleParts(c.eligibilityTitle)}</h2>
            </div>
            <ul className="early-elig-list reveal-children">
              {c.eligibility.map((e, i) => (
                <li key={i}>
                  <span className="early-elig-mark" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                  </span>
                  <div>
                    <h5>{e.t}</h5>
                    <p>{e.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="section">
        <div className="wrap">
          <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 720, marginBottom: 48}}>
            <span className="eyebrow">{lang === 'es' ? 'Proceso' : 'Process'}</span>
            <h2 className="h-section">{renderTitleParts(c.timelineTitle)}</h2>
          </div>
          <div className="early-timeline">
            {c.timelineSteps.map((s, i) => (
              <div key={i} className="early-step">
                <div className="early-step-day">{s.day}</div>
                <div className="early-step-body">
                  <h4>{s.t}</h4>
                  <p>{s.d}</p>
                </div>
                <div className="early-step-num">{String(i + 1).padStart(2, '0')}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section">
        <div className="wrap">
          <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 720, marginBottom: 48}}>
            <span className="eyebrow">FAQ</span>
            <h2 className="h-section">{c.faqTitle}</h2>
          </div>
          <div className="faq" style={{maxWidth: 880}}>
            {c.faqs.map((f, i) => (
              <div key={i} className={`faq-item ${open === i ? 'open' : ''}`} onClick={() => setOpen(open === i ? -1 : i)}>
                <div className="faq-q">
                  <span>{f.q}</span>
                  <span className="faq-mark">{open === i ? '−' : '+'}</span>
                </div>
                {open === i && <div className="faq-a">{f.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Apply CTA */}
      <section className="section" style={{paddingBottom: 96}}>
        <div className="wrap">
          <div className="early-apply reveal">
            <div className="early-apply-text">
              <span className="eyebrow">{lang === 'es' ? 'Aplica' : 'Apply'}</span>
              <h2 className="h-section">{c.apply.title}</h2>
              <p className="lede">{c.apply.sub}</p>
            </div>
            <div className="early-apply-cta">
              <a href="#" className="btn btn-primary" data-cursor="hover">
                {c.apply.cta}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
              </a>
              <span className="early-apply-note">{c.apply.note}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

window.EarlyStagePage = EarlyStagePage;
