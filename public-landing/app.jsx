/* global React, ReactDOM, useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakRadio, TweakSelect, TweakColor, TweakToggle */
const { useState, useEffect, useRef, useCallback, useMemo } = React;

const DEFAULTS = /*EDITMODE-BEGIN*/{
  "intensity": 100,
  "fontPair": "instrument-inter",
  "accent": "#0A0A0A",
  "theme": "light",
  "density": "comfortable",
  "lang": "en"
}/*EDITMODE-END*/;

const COPY = {
  es: {
    nav: { home: "Home", product: "Producto", pricing: "Pricing", customers: "Clientes", omnichannel: "Bandeja unificada", earlyStage: "Para startups", changelog: "Changelog", login: "Iniciar sesión", cta: "Solicita trial", productMenu: {
      aboutTitle: "Sobre Clain",
      about: [
        { slug: "/product", icon: "platform", name: "Cómo funciona Clain", desc: "Una plataforma moderna nativa de IA." },
        { slug: "/super-agent", icon: "agent", name: "Incluye Super Agent", desc: "El #1 en agentes para CX y operaciones." },
        { slug: "/omnichannel", icon: "channels", name: "Funciona en todos los canales", desc: "Email, WhatsApp, voz y chat." },
        { slug: "/product#integrations", icon: "apps", name: "Integra tus apps", desc: "+250 integraciones para retener clientes." },
      ],
      featuredTitle: "Capacidades destacadas",
      featured: [
        { slug: "/unified-inbox", name: "Bandeja unificada" },
        { slug: "/cases", name: "Cases" },
        { slug: "/help-center", name: "Help Center" },
        { slug: "/reporting", name: "Reporting" },
        { slug: "/policy-engine", name: "Policy Engine" },
        { slug: "/audit-log", name: "Audit log" },
        { slug: "/copilot", name: "Copilot" },
      ],
    } },
    hero: {
      pill: { tag: "v0.9", text: "Beta abierta para equipos de ecommerce" },
      title: ["Resuelve casos complejos de ecommerce con ", { em: "agentes de IA" }, ", aprobaciones y contexto operativo completo."],
      lede: "Clain conecta cada conversación con su pedido, pago, devolución, riesgo y SLA — y deja que un agente proponga la siguiente mejor acción, con humano en el bucle.",
      cta1: "Empieza gratis",
      cta2: "Solicita demo",
      meta: [
        ["Status", "Operativo"],
        ["Casos resueltos hoy", "12,841"],
        ["P50 resolución", "00:04:12"],
        ["Aprobaciones pendientes", "23"],
      ]
    },
    logos: "Empleado por equipos de ecommerce que escalan",
    features: [
      { num: "01", title: ["AI Case Inbox que ", { em: "se conecta sola" }], body: "Centraliza email, chat y formularios. Cada caso se enlaza automáticamente con cliente, pedido, pago, devolución, riesgo y SLA — sin macros ni reglas frágiles.", bullets: ["Detección automática de entidad", "Hilo único multi-canal", "Priorización por SLA y valor"] },
      { num: "02", title: ["Super Agent que ", { em: "investiga primero" }], body: "Antes de responder, el agente lee el historial, consulta sistemas internos, detecta conflictos entre pedido y promesa, y propone la siguiente mejor acción.", bullets: ["RAG sobre tu stack interno", "Detección de conflictos de datos", "Borrador de respuesta y plan de acción"] },
      { num: "03", title: ["Case Graph: ", { em: "todo en un mapa" }], body: "Visualiza la relación entre conversación, order, payment, return, carrier, policies y approvals. Una sola vista para entender qué está realmente roto.", bullets: ["Grafo dinámico por caso", "Saltos a sistema de origen", "Snapshots para auditoría"] },
      { num: "04", title: ["Approvals & Policy Engine"], body: "Refunds, cancelaciones y compensaciones se ejecutan bajo reglas, permisos y aprobación humana. Define políticas en lenguaje natural y conviértelas en guardas verificables.", bullets: ["Policy-as-code, escrita en plain English", "Aprobaciones en línea con doble check", "Límites por rol, monto y motivo"] },
      { num: "05", title: ["Audit & ", { em: "safe execution" }], body: "Cada acción del agente queda registrada con su evidencia, prompt, datos consultados y firmante. Reproducible, exportable y revisable.", bullets: ["Trazabilidad por caso y por acción", "Replay determinista", "Export a SIEM y data warehouse"] },
    ],
    testimonialsTitle: ["Equipos que cerraron", { em: " la brecha" }, " entre soporte y operaciones."],
    testimonials: [
      { quote: "Pasamos de 6 herramientas y un Notion compartido a un único caso con todo el contexto. Bajamos el tiempo medio un 41%.", name: "Lucía Marín", role: "Head of CX, Bondi" },
      { quote: "El Policy Engine fue lo que destrabó el rollout. Lo escribió legal en una tarde y producción lo respeta al pie.", name: "Tomás Silvera", role: "VP Ops, Norte&Co" },
      { quote: "Lo que más me gusta es lo aburrido que es: aprueba, ejecuta, audita. Sin sorpresas. Por fin.", name: "Hannah Reuter", role: "COO, Mareva" },
    ],
    pricingTitle: ["Precio simple,", { em: " escalable con tu volumen." }],
    pricingNote: "Todos los planes incluyen la plataforma core. Lo que cambia es la capacidad de IA, los seats y la escala.",
    plans: [
      { name: "Starter", price: 42, monthly: 49, was: 149, per: "/ mes", billed: "Facturado anual (€504/año)", meta: "Para equipos pequeños empezando con operaciones asistidas por IA.", feats: ["5,000 créditos de IA / mes", "3 seats incluidos (€25/seat extra)", "Workflows de soporte y ops core", "Integraciones email y chat estándar", "Reporting y analytics básico"], cta: "Empieza con Starter", featured: false },
      { name: "Growth", price: 109, monthly: 129, was: 399, per: "/ mes", billed: "Facturado anual (€1,308/año)", meta: "Para equipos en crecimiento que usan IA todos los días.", feats: ["20,000 créditos de IA / mes", "8 seats incluidos (€22/seat extra)", "Workflows multi-step avanzados", "Integraciones API custom", "Soporte prioritario por email"], cta: "Empieza con Growth", featured: true, badge: "Recomendado" },
      { name: "Scale", price: 254, monthly: 299, was: 899, per: "/ mes", billed: "Facturado anual (€3,048/año)", meta: "Para equipos avanzados con alto volumen y multi-workflow.", feats: ["60,000 créditos de IA / mes", "20 seats incluidos (€19/seat extra)", "Workflows custom ilimitados", "Customer success manager dedicado", "Dashboards de reporting custom"], cta: "Empieza con Scale", featured: false },
      { name: "Business", price: null, per: "Custom", meta: "Para organizaciones con capacidad, governance y necesidades enterprise.", feats: ["Asignación de créditos a medida", "Asignación de seats custom", "Seguridad y compliance enterprise", "SLA y uptime garantizados", "Onboarding y formación a medida"], cta: "Habla con ventas", featured: false },
    ],
    creditsTitle: ["Compra créditos", { em: " extra de IA." }],
    creditsNote: "Los packs top-up están disponibles en todos los planes y se consumen solo después de gastar tus créditos mensuales incluidos. Permanecen activos mientras tu suscripción siga viva.",
    credits: [
      { amount: "5,000", price: 79, models: "Modelos rápidos: tier económico", capacity: "Hasta 5M tokens · ~10k tareas", cta: "Comprar pack", featured: false },
      { amount: "20,000", price: 249, models: "Modelos balanced: razonamiento estándar", capacity: "Hasta 20M tokens · ~40k tareas", cta: "Comprar pack", featured: true, badge: "Más popular" },
      { amount: "50,000", price: 549, models: "Todos los modelos + fine-tuned propios", capacity: "Hasta 50M tokens · ~100k tareas", cta: "Comprar pack", featured: false },
    ],
    flexible: { title: "Uso flexible", price: "€19 / 1,000 créditos", billed: "Facturado mensual por uso extra", body: "Paga solo por los créditos extra que uses tras consumir tu capacidad mensual incluida.", feats: ["Solo se activa tras agotar los créditos incluidos", "Facturación mensual basada en uso real", "Tope de gasto mensual y alertas de uso"], cta: "Activar uso flexible" },
    faqTitle: ["Preguntas razonables.", { em: " Respuestas honestas." }],
    faqs: [
      { q: "¿Reemplaza mi helpdesk actual?", a: "No es obligatorio. Clain se conecta vía API/webhooks a Zendesk, Front, Gorgias, Intercom y similares. Puedes correr en paralelo, migrar gradual, o usarlo como capa de orquestación encima de tu helpdesk." },
      { q: "¿El agente puede ejecutar acciones en producción?", a: "Sí, dentro de los límites del Policy Engine. Cada acción sensible (refund, cancel, override de promesa) requiere las aprobaciones que definas: por monto, por motivo, por rol o por combinación. Toda ejecución queda firmada y reproducible." },
      { q: "¿Qué datos necesita ver?", a: "Solo lo que conectes. Mínimo recomendado: conversación, pedido, pago, envío, devoluciones y políticas. El acceso es granular y puedes redactar campos PII antes de que lleguen al modelo." },
      { q: "¿Qué modelos usa?", a: "Una mezcla de modelos comerciales y open-source detrás de un router interno. Puedes traer tus propias claves o desplegar en VPC con modelos auto-hospedados para casos sensibles." },
      { q: "¿Cómo se factura?", a: "Por casos resueltos por el agente, no por seats ni por mensaje. Pricing transparente, sin compromisos anuales hasta Scale." },
    ],
    finalCta: ["El siguiente caso", { em: " ya tiene contexto." }],
    footer: {
      brand: "Operaciones de soporte, ejecutadas con el contexto correcto.",
      cols: [
        { t: "Producto", l: ["Bandeja unificada", "AI Case Inbox", "Super Agent", "Case Graph", "Approvals", "Audit log"] },
        { t: "Empresa", l: ["Clientes", "Pricing", "Para startups", "Carreras", "Manifesto"] },
        { t: "Recursos", l: ["Docs", "API reference", "Status", "Comunidad", "Seguridad"] },
        { t: "Legal", l: ["Privacidad", "Términos", "DPA", "Subprocesadores", "Trust"] },
      ],
      bot: ["© 2026 Clain Labs", "Hecho en Madrid · Lisboa · Buenos Aires"]
    }
  },
  en: {
    nav: { home: "Home", product: "Product", pricing: "Pricing", customers: "Customers", omnichannel: "Unified Inbox", earlyStage: "For startups", changelog: "Changelog", login: "Sign in", cta: "Request trial", productMenu: {
      aboutTitle: "About Clain",
      about: [
        { slug: "/product", icon: "platform", name: "How Clain works", desc: "A modern, AI-native platform." },
        { slug: "/super-agent", icon: "agent", name: "Includes Super Agent", desc: "#1 AI agent for CX and operations." },
        { slug: "/omnichannel", icon: "channels", name: "Works on every channel", desc: "Email, WhatsApp, voice and chat." },
        { slug: "/product#integrations", icon: "apps", name: "Integrates with your apps", desc: "250+ integrations to retain customers." },
      ],
      featuredTitle: "Featured capabilities",
      featured: [
        { slug: "/unified-inbox", name: "Unified Inbox" },
        { slug: "/cases", name: "Cases" },
        { slug: "/help-center", name: "Help Center" },
        { slug: "/reporting", name: "Reporting" },
        { slug: "/policy-engine", name: "Policy Engine" },
        { slug: "/audit-log", name: "Audit log" },
        { slug: "/copilot", name: "Copilot" },
      ],
    } },
    hero: {
      pill: { tag: "v0.9", text: "Open beta for ecommerce ops teams" },
      title: ["Resolve complex ecommerce cases with ", { em: "AI agents" }, ", approvals, and full operational context."],
      lede: "Clain wires every conversation to its order, payment, return, risk and SLA — then lets an agent propose the next best action, with a human in the loop.",
      cta1: "Start free",
      cta2: "Request demo",
      meta: [
        ["Status", "Operational"],
        ["Cases resolved today", "12,841"],
        ["P50 resolution", "00:04:12"],
        ["Pending approvals", "23"],
      ]
    },
    logos: "Trusted by ecommerce teams that scale",
    features: [
      { num: "01", title: ["AI Case Inbox that ", { em: "wires itself" }], body: "Centralize email, chat and forms. Every case is automatically linked to customer, order, payment, return, risk and SLA — no fragile macros or rules.", bullets: ["Auto entity detection", "Single multi-channel thread", "Priority by SLA and value"] },
      { num: "02", title: ["Super Agent that ", { em: "investigates first" }], body: "Before replying, the agent reads the history, queries internal systems, surfaces conflicts between order and promise, and proposes the next best action.", bullets: ["RAG over your internal stack", "Data conflict detection", "Reply draft and action plan"] },
      { num: "03", title: ["Case Graph: ", { em: "everything in one map" }], body: "See the relation between conversation, order, payment, return, carrier, policies and approvals. One view to understand what's really broken.", bullets: ["Per-case dynamic graph", "Jump to source-of-truth", "Snapshots for audit"] },
      { num: "04", title: ["Approvals & Policy Engine"], body: "Refunds, cancellations and goodwill run under rules, permissions and human approval. Author policies in plain English, get verifiable guards.", bullets: ["Policy-as-code, in plain English", "Inline approvals with double-check", "Limits by role, amount, reason"] },
      { num: "05", title: ["Audit & ", { em: "safe execution" }], body: "Every agent action is recorded with evidence, prompt, queried data and signer. Reproducible, exportable, reviewable.", bullets: ["Per-case and per-action trace", "Deterministic replay", "Export to SIEM and warehouse"] },
    ],
    testimonialsTitle: ["Teams that closed", { em: " the gap" }, " between support and ops."],
    testimonials: [
      { quote: "We went from 6 tools and a shared Notion to a single case with full context. Average handling time fell 41%.", name: "Lucía Marín", role: "Head of CX, Bondi" },
      { quote: "The Policy Engine unlocked the rollout. Legal wrote it in an afternoon and production respects it to the letter.", name: "Tomás Silvera", role: "VP Ops, Norte&Co" },
      { quote: "What I love most is how boring it is: approve, execute, audit. No surprises. Finally.", name: "Hannah Reuter", role: "COO, Mareva" },
    ],
    pricingTitle: ["Simple pricing,", { em: " scales with you." }],
    pricingNote: "All plans include the core platform. What changes is AI capacity, seat capacity, and scale.",
    plans: [
      { name: "Starter", price: 42, monthly: 49, was: 149, per: "/ mo", billed: "Billed annually (€504/yr)", meta: "For small teams getting started with AI-assisted ops.", feats: ["5,000 AI credits / month", "3 seats included (€25/extra seat)", "Core support and ops workflows", "Standard email and chat integrations", "Basic reporting and analytics"], cta: "Get Starter", featured: false },
      { name: "Growth", price: 109, monthly: 129, was: 399, per: "/ mo", billed: "Billed annually (€1,308/yr)", meta: "For growing support and ops teams using AI every day.", feats: ["20,000 AI credits / month", "8 seats included (€22/extra seat)", "Advanced multi-step workflows", "Custom API integrations", "Priority email support"], cta: "Upgrade to Growth", featured: true, badge: "Recommended" },
      { name: "Scale", price: 254, monthly: 299, was: 899, per: "/ mo", billed: "Billed annually (€3,048/yr)", meta: "For advanced teams managing high-volume, multi-workflow ops.", feats: ["60,000 AI credits / month", "20 seats included (€19/extra seat)", "Unlimited custom workflows", "Dedicated customer success manager", "Custom reporting dashboards"], cta: "Upgrade to Scale", featured: false },
      { name: "Business", price: null, per: "Custom", meta: "For organizations with custom capacity, governance and enterprise needs.", feats: ["Tailored AI credit allocation", "Custom seat allocation", "Enterprise-grade security & compliance", "Custom SLA & uptime guarantees", "Tailored onboarding & training"], cta: "Talk to sales", featured: false },
    ],
    creditsTitle: ["Buy extra", { em: " AI credits." }],
    creditsNote: "Top-up packs are available on all plans and are consumed only after your included monthly credits are used. They remain active while your subscription is active.",
    credits: [
      { amount: "5,000", price: 79, models: "Fast models: economy tier", capacity: "Up to 5M tokens · ~10k automated tasks", cta: "Buy pack", featured: false },
      { amount: "20,000", price: 249, models: "Balanced models: standard reasoning", capacity: "Up to 20M tokens · ~40k automated tasks", cta: "Buy pack", featured: true, badge: "Most popular" },
      { amount: "50,000", price: 549, models: "All models + custom fine-tuned", capacity: "Up to 50M tokens · ~100k automated tasks", cta: "Buy pack", featured: false },
    ],
    flexible: { title: "Flexible Usage", price: "€19 / 1,000 credits", billed: "Billed monthly by extra usage", body: "Pay only for the extra AI credits you actually use after your included monthly capacity is consumed.", feats: ["Starts only after included monthly credits are fully used", "Billed monthly based on actual extra usage", "Monthly spend cap protection & usage alerts"], cta: "Enable Flexible Usage" },
    faqTitle: ["Reasonable questions.", { em: " Honest answers." }],
    faqs: [
      { q: "Does it replace my current helpdesk?", a: "Not required. Clain connects via API/webhooks to Zendesk, Front, Gorgias, Intercom and similar. Run in parallel, migrate gradually, or use it as an orchestration layer on top." },
      { q: "Can the agent execute production actions?", a: "Yes, within the Policy Engine. Every sensitive action (refund, cancel, promise override) requires the approvals you define — by amount, reason, role, or any combination. Every execution is signed and reproducible." },
      { q: "What data does it need?", a: "Only what you connect. Minimum recommended: conversation, order, payment, shipping, returns and policies. Access is granular, and PII fields can be redacted before reaching the model." },
      { q: "What models does it use?", a: "A mix of commercial and open-source models behind an internal router. Bring your own keys, or deploy in VPC with self-hosted models for sensitive cases." },
      { q: "How is it billed?", a: "Per agent-resolved case, not per seat or per message. Transparent, no annual lock-in until Scale." },
    ],
    finalCta: ["The next case", { em: " already has context." }],
    footer: {
      brand: "Support operations, executed with the right context.",
      cols: [
        { t: "Product", l: ["Unified Inbox", "AI Case Inbox", "Super Agent", "Case Graph", "Approvals", "Audit log"] },
        { t: "Company", l: ["Customers", "Pricing", "For startups", "Careers", "Manifesto"] },
        { t: "Resources", l: ["Docs", "API reference", "Status", "Community", "Security"] },
        { t: "Legal", l: ["Privacy", "Terms", "DPA", "Subprocessors", "Trust"] },
      ],
      bot: ["© 2026 Clain Labs", "Made in Madrid · Lisbon · Buenos Aires"]
    }
  }
};

const FONT_PAIRS = {
  "instrument-inter": { serif: "'Instrument Serif', Georgia, serif", sans: "'Inter', system-ui, sans-serif", label: "Instrument · Inter" },
  "fraunces-geist":   { serif: "'Fraunces', Georgia, serif",         sans: "'Geist', system-ui, sans-serif",  label: "Fraunces · Geist" },
  "playfair-dm":      { serif: "'Playfair Display', Georgia, serif", sans: "'DM Sans', system-ui, sans-serif", label: "Playfair · DM Sans" },
  "newsreader-jost":  { serif: "'Newsreader', Georgia, serif",        sans: "'Jost', system-ui, sans-serif",    label: "Newsreader · Jost" },
};

/* ---- Helpers to render parts of titles with <em> ---- */
function renderTitleParts(parts) {
  return parts.map((p, i) => {
    if (typeof p === 'string') return <React.Fragment key={i}>{p}</React.Fragment>;
    if (p && p.em) return <em key={i}>{p.em}</em>;
    return null;
  });
}

/* ============ Cursor ============ */
function Cursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const target = useRef({ x: -100, y: -100 });
  const ring = useRef({ x: -100, y: -100 });

  useEffect(() => {
    const onMove = (e) => {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      }
    };
    const onOver = (e) => {
      const t = e.target;
      if (!ringRef.current) return;
      const interactive = t.closest('a, button, .faq-q, .demo-tab, .demo-side .item, [data-cursor="hover"]');
      const text = t.closest('input, textarea, [contenteditable]');
      ringRef.current.classList.toggle('is-hover', !!interactive);
      ringRef.current.classList.toggle('is-text', !!text);
    };
    let raf;
    const tick = () => {
      ring.current.x += (target.current.x - ring.current.x) * 0.18;
      ring.current.y += (target.current.y - ring.current.y) * 0.18;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ring.current.x}px, ${ring.current.y}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseover', onOver);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseover', onOver);
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="cursor-ring" />
      <div ref={dotRef} className="cursor-dot" />
    </>
  );
}

/* ============ Aurora bg (mouse reactive gradient) ============ */
function Aurora({ intensity }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e) => {
      const f = intensity / 100;
      const mx = (e.clientX / window.innerWidth) * 100;
      const my = (e.clientY / window.innerHeight) * 100;
      el.style.setProperty('--mx', `${50 + (mx - 50) * f}%`);
      el.style.setProperty('--my', `${50 + (my - 50) * f}%`);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [intensity]);
  return <div ref={ref} className="aurora" />;
}

/* ============ Gravity Grid: dots attracted to cursor ============ */
function GravityGrid({ intensity }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    let dots = [];
    const SPACING = 28;
    const RADIUS = 220;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Build dot field
      dots = [];
      const cols = Math.ceil(w / SPACING) + 2;
      const rows = Math.ceil(h / SPACING) + 2;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const ox = (i - 1) * SPACING + (j % 2) * (SPACING / 2);
          const oy = (j - 1) * SPACING;
          dots.push({ ox, oy, x: ox, y: oy, vx: 0, vy: 0 });
        }
      }
    };

    const mouse = { x: -9999, y: -9999, active: false };
    const onMove = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; mouse.active = false; };

    let raf;
    const loop = () => {
      const isDark = document.documentElement.dataset.theme === 'dark';
      const fillBase = isDark ? 'rgba(250,250,247,' : 'rgba(10,10,10,';
      const fillHi = isDark ? 'rgba(250,250,247,' : 'rgba(10,10,10,';
      ctx.clearRect(0, 0, w, h);

      const f = intensity / 100;
      const PULL = 0.22 * f;
      const RETURN = 0.06;
      const DAMP = 0.78;

      for (let k = 0; k < dots.length; k++) {
        const d = dots[k];
        // Force toward mouse if within radius
        const dx = mouse.x - d.x;
        const dy = mouse.y - d.y;
        const dist2 = dx * dx + dy * dy;
        if (mouse.active && dist2 < RADIUS * RADIUS) {
          const dist = Math.sqrt(dist2) || 1;
          const force = (1 - dist / RADIUS);
          // attractive force scaled by proximity
          d.vx += (dx / dist) * force * PULL * 6;
          d.vy += (dy / dist) * force * PULL * 6;
        }
        // Spring back to origin
        d.vx += (d.ox - d.x) * RETURN;
        d.vy += (d.oy - d.y) * RETURN;
        d.vx *= DAMP;
        d.vy *= DAMP;
        d.x += d.vx;
        d.y += d.vy;

        // Compute alpha + size based on displacement
        const ddx = d.x - d.ox;
        const ddy = d.y - d.oy;
        const disp = Math.sqrt(ddx * ddx + ddy * ddy);
        const t = Math.min(disp / 30, 1);
        const baseA = isDark ? 0.10 : 0.08;
        const a = baseA + t * 0.35;
        const r = 0.9 + t * 1.6;

        ctx.fillStyle = fillBase + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [intensity]);

  return <canvas ref={canvasRef} className="gravity-grid" />;
}

/* ============ Reveal on scroll ============ */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal, .reveal-children');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ============ Magnetic button ============ */
function Magnetic({ children, className, strength = 0.25, ...rest }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = '';
  };
  return (
    <button ref={ref} className={className} onMouseMove={onMove} onMouseLeave={onLeave} {...rest}>
      {children}
    </button>
  );
}

/* ============ Nav ============ */
function NavIcon({ kind }) {
  const stroke = "currentColor";
  const sw = 1.5;
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (kind) {
    case 'platform':
      return (<svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>);
    case 'agent':
      return (<svg {...common}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3.5"/></svg>);
    case 'channels':
      return (<svg {...common}><rect x="3" y="5" width="13" height="10" rx="2"/><path d="M3 7l6.5 4.5L16 7"/><path d="M9 19h10a2 2 0 0 0 2-2v-6"/></svg>);
    case 'apps':
      return (<svg {...common}><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>);
    default: return null;
  }
}

function Nav({ t, lang, onLangToggle, route, navigate }) {
  const [openMenu, setOpenMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  // close on route change
  useEffect(() => { setOpenMenu(false); }, [route]);

  const link = (path, label) => (
    <a
      href={`#${path}`}
      onClick={(e) => { e.preventDefault(); navigate(path); }}
      className={route === path ? 'is-active' : ''}
    >{label}</a>
  );

  const productActive = route.startsWith('/product') || route.startsWith('/omnichannel') || route.startsWith('/early-stage') || route.startsWith('/super-agent');

  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="#/" onClick={(e)=>{e.preventDefault(); navigate('/');}} className="nav-logo" data-cursor="hover">
          <span className="mark"></span>
          <span>Clain</span>
        </a>
        <div className="nav-links">
          <div className="nav-menu" ref={menuRef}>
            <button
              className={`nav-menu-trigger ${productActive ? 'is-active' : ''} ${openMenu ? 'is-open' : ''}`}
              onClick={() => setOpenMenu(v => !v)}
              aria-expanded={openMenu}
              data-cursor="hover"
            >
              {t.nav.product}
              <svg className="nav-caret" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5l3 3 3-3"/></svg>
            </button>
            {openMenu && (
              <div className="nav-menu-panel nav-menu-panel--mega" role="menu">
                <div className="nav-mega-col">
                  <div className="nav-mega-eyebrow">{t.nav.productMenu.aboutTitle}</div>
                  <div className="nav-mega-list">
                    {t.nav.productMenu.about.map((it) => (
                      <a
                        key={it.slug + it.name}
                        href={`#${it.slug}`}
                        className="nav-mega-item"
                        onClick={(e) => { e.preventDefault(); setOpenMenu(false); navigate(it.slug); }}
                      >
                        <span className={`nav-mega-icon nav-mega-icon--${it.icon}`} aria-hidden="true">
                          <NavIcon kind={it.icon} />
                        </span>
                        <span className="nav-mega-text">
                          <span className="nav-mega-name">{it.name}</span>
                          <span className="nav-mega-desc">{it.desc}</span>
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
                <div className="nav-mega-col nav-mega-col--featured">
                  <div className="nav-mega-eyebrow">{t.nav.productMenu.featuredTitle}</div>
                  <div className="nav-mega-featured">
                    {t.nav.productMenu.featured.map((it) => (
                      <a
                        key={it.slug + it.name}
                        href={`#${it.slug}`}
                        className="nav-mega-feat"
                        onClick={(e) => { e.preventDefault(); setOpenMenu(false); navigate(it.slug); }}
                      >{it.name}</a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          {link('/customers', t.nav.customers)}
          {link('/pricing', t.nav.pricing)}
        </div>
        <div className="nav-cta">
          <button
            className="lang-toggle"
            onClick={() => onLangToggle()}
            aria-label="Toggle language"
            data-cursor="hover"
          >
            <span className={lang === 'es' ? 'is-active' : ''}>ES</span>
            <span className="lang-toggle-sep">·</span>
            <span className={lang === 'en' ? 'is-active' : ''}>EN</span>
          </button>
          <a href="#/signin" onClick={(e)=>{e.preventDefault(); navigate('/signin');}} className="btn btn-ghost">{t.nav.login}</a>
          <a href="#/demo" onClick={(e)=>{e.preventDefault(); navigate('/demo');}} className="btn-cta-link">
            <Magnetic className="btn btn-primary" strength={0.18}>
              {t.nav.cta} <span className="arrow">→</span>
            </Magnetic>
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ============ Hero ============ */
function Hero({ t, navigate }) {
  const goSignup = (e) => { if (e) e.preventDefault(); (navigate || ((p) => window.location.hash = '#' + p))('/signup'); };
  const goDemo   = (e) => { if (e) e.preventDefault(); (navigate || ((p) => window.location.hash = '#' + p))('/demo'); };
  const [hot, setHot] = useState(2);
  useEffect(() => {
    const id = setInterval(() => setHot(h => (h + 1) % 4), 2400);
    return () => clearInterval(id);
  }, []);
  const rows = useMemo(() => [
    { label: "ORD-7281", title: "Refund — pago duplicado tras devolución parcial", stamp: "P1 · 04:12" },
    { label: "ORD-7264", title: "Carrier perdió paquete · cliente VIP", stamp: "P1 · 06:48" },
    { label: "ORD-7259", title: "Promesa de entrega rota · sticker mal aplicado", stamp: "P2 · 12:01" },
    { label: "ORD-7244", title: "Charge-back en disputa con evidencia", stamp: "P2 · 31:20" },
  ], []);

  return (
    <section className="hero wrap reveal">
      <div className="hero-eyebrow-row">
        <div className="hero-pill">
          <span className="tag">{t.hero.pill.tag}</span>
          <span>{t.hero.pill.text}</span>
        </div>
        <span className="eyebrow" style={{display:'inline-flex'}}>SOC 2 · GDPR · ISO 27001</span>
      </div>
      <div className="hero-grid">
        <h1 className="h-display">{renderTitleParts(t.hero.title)}</h1>
        <div style={{display:'grid', gap: 24}}>
          <p className="lede">{t.hero.lede}</p>
          <div className="hero-cta">
            <Magnetic className="btn btn-primary" onClick={goSignup}>{t.hero.cta1} <span className="arrow">→</span></Magnetic>
            <Magnetic className="btn btn-ghost" strength={0.12} onClick={goDemo}>{t.hero.cta2}</Magnetic>
          </div>
          <div className="hero-meta">
            {t.hero.meta.map(([k, v], i) => (
              <div className="row" key={i}><span>{k}</span><span>{v}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="hero-canvas">
        <div className="hc-inner">
          <div className="hc-left">
            <div className="eyebrow" style={{marginBottom: 4}}>Live inbox</div>
            {rows.map((r, i) => (
              <div key={i} className={`hc-row ${i === hot ? 'hot' : ''}`}>
                <span className="dot-state" />
                <span className="label">{r.label}</span>
                <span className="title">{r.title}</span>
                <span className="stamp">{r.stamp}</span>
              </div>
            ))}
          </div>
          <div className="hc-right">
            <div className="eyebrow" style={{marginBottom: 4}}>Case graph</div>
            <HeroGraph hot={hot} />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroGraph({ hot }) {
  // Simple animated radial graph
  const nodes = [
    { id: 'case', x: 50, y: 50, label: 'CASE', center: true },
    { id: 'cust', x: 20, y: 22, label: 'CUSTOMER' },
    { id: 'ord',  x: 80, y: 22, label: 'ORDER' },
    { id: 'pay',  x: 88, y: 60, label: 'PAYMENT' },
    { id: 'ret',  x: 62, y: 88, label: 'RETURN' },
    { id: 'car',  x: 22, y: 82, label: 'CARRIER' },
    { id: 'pol',  x: 8,  y: 55, label: 'POLICY' },
  ];
  return (
    <div className="hc-graph">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {nodes.slice(1).map((n, i) => (
          <line
            key={n.id}
            className={`ge ${i === hot ? 'live' : ''}`}
            x1="50" y1="50" x2={n.x} y2={n.y}
          />
        ))}
        {nodes.map(n => (
          <g key={n.id} className={`gn ${n.center ? 'center' : ''}`}>
            <circle cx={n.x} cy={n.y} r={n.center ? 7 : 5} />
            <text x={n.x} y={n.y + (n.center ? 1 : -7)}>{n.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ============ Logos ============ */
function Logos({ t }) {
  return (
    <section className="logos wrap">
      <div className="logos-label">{t.logos}</div>
      <div className="logos-track">
        <span className="logo"><span className="dot"/> Bondi</span>
        <span className="logo"><span className="dot circle"/> Norte&amp;Co</span>
        <span className="logo"><span className="dot tri"/> Mareva</span>
        <span className="logo"><span className="dot bar"/> Folio</span>
        <span className="logo"><span className="dot"/> Quanta</span>
        <span className="logo"><span className="dot circle"/> Veridian</span>
        <span className="logo"><span className="dot bar"/> Atelier</span>
      </div>
    </section>
  );
}

/* ============ Press marquee ============ */
function Press() {
  const items = [
    "“The Slack of ecommerce ops”", "Forbes",
    "“Finally, agents you can audit”", "Sifted",
    "“Approvals done right”", "TechCrunch",
    "“The graph changed our P50”", "RetailDive",
  ];
  const track = (
    <div className="press-track">
      {items.map((it, i) => (
        <span key={i}>{it} <span className="star">✦</span></span>
      ))}
      {items.map((it, i) => (
        <span key={`d-${i}`}>{it} <span className="star">✦</span></span>
      ))}
    </div>
  );
  return <div className="press">{track}</div>;
}

/* ============ Features ============ */
function FeaturePlaceholder({ idx }) {
  if (idx === 0) return <FeatureInbox />;
  if (idx === 1) return <FeatureSuperAgent />;
  if (idx === 2) return <FeatureGraph />;
  if (idx === 3) return <FeaturePolicy />;
  return <FeatureAudit />;
}

function FeatureInbox() {
  return (
    <div style={{position:'absolute', inset: 16, display:'grid', gap: 8, gridTemplateRows:'repeat(5, 1fr)', fontFamily:'var(--mono)', fontSize: 11}}>
      {["ORD-7281 · refund","ORD-7264 · carrier","ORD-7259 · promise","ORD-7244 · cb","ORD-7231 · risk"].map((s, i) => (
        <div key={i} style={{border:'1px solid var(--line)', borderRadius: 10, padding:'10px 12px', display:'flex', alignItems:'center', gap: 10, background: i===1 ? 'var(--fg)' : 'var(--bg-elev)', color: i===1 ? 'var(--bg)':'var(--fg)'}}>
          <span style={{width:6, height:6, borderRadius:'50%', background: i===1?'var(--bg)':'var(--fg)'}}/>
          <span style={{flex:1, letterSpacing:'0.05em'}}>{s.toUpperCase()}</span>
          <span style={{opacity:.6}}>P{(i%2)+1} · 0{i+2}:1{i}</span>
        </div>
      ))}
    </div>
  );
}
function FeatureSuperAgent() {
  return (
    <div style={{position:'absolute', inset: 20, display:'grid', gridTemplateRows:'auto 1fr auto', gap: 10}}>
      <div style={{fontFamily:'var(--mono)', fontSize: 10, letterSpacing:'.1em', color:'var(--fg-faint)', textTransform:'uppercase'}}>AGENT THINKING · ORD-7281</div>
      <div style={{display:'grid', gap: 8, fontSize: 12}}>
        {["Querying orders.fulfillment...","Found mismatch: paid 2× · refunded 1×","Cross-checking returns log → confirmed","Drafting refund €38.20 + 10% goodwill","Awaiting approval: amount > policy.refund.auto"].map((line, i) => (
          <div key={i} style={{display:'flex', gap:8, alignItems:'flex-start'}}>
            <span style={{fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-faint)', minWidth: 18}}>{String(i+1).padStart(2,'0')}</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
      <div style={{display:'flex', gap: 6}}>
        <span className="hero-pill" style={{padding:'4px 10px', fontSize: 11}}><span className="tag" style={{padding:'2px 6px'}}>NBA</span> Refund + apology</span>
      </div>
    </div>
  );
}
function FeatureGraph() {
  return (
    <div style={{position:'absolute', inset: 0}}>
      <HeroGraph hot={1} />
    </div>
  );
}
function FeaturePolicy() {
  return (
    <div style={{position:'absolute', inset: 20, display:'grid', gap: 10, fontFamily:'var(--mono)', fontSize: 11.5, lineHeight: 1.55}}>
      <div style={{fontSize: 10, letterSpacing:'.1em', color:'var(--fg-faint)', textTransform:'uppercase'}}>policy.refund.yaml</div>
      <pre style={{margin:0, whiteSpace:'pre-wrap'}}>
{`when refund.amount <= 25
  → auto_approve

when refund.amount <= 100 and customer.tier ∈ [vip, gold]
  → require role: senior_agent

else
  → require role: ops_lead
  + reason in [duplicate, lost_in_transit, defect]`}
      </pre>
      <div style={{marginTop: 'auto', display:'flex', gap: 8}}>
        <span style={{padding:'4px 10px', border:'1px solid var(--line)', borderRadius: 999, fontSize: 10, letterSpacing:'.08em', textTransform:'uppercase'}}>compiled · 23 guards</span>
      </div>
    </div>
  );
}
function FeatureAudit() {
  return (
    <div style={{position:'absolute', inset: 20, display:'grid', gridTemplateColumns:'80px 1fr auto', gap: '6px 12px', fontFamily:'var(--mono)', fontSize: 11.5, alignItems:'baseline'}}>
      {[
        ["14:02:11","Agent queried orders/7281","ok"],
        ["14:02:12","Detected: payments.duplicate=true","flag"],
        ["14:02:14","Drafted reply + refund €38.20","draft"],
        ["14:02:18","Approval required: above €25","pending"],
        ["14:03:02","Approved by lmarin@bondi.io","signed"],
        ["14:03:03","Executed refund via stripe.adapter","ok"],
        ["14:03:03","Wrote audit row #91234","sealed"],
      ].map((row, i) => (
        <React.Fragment key={i}>
          <span style={{color:'var(--fg-faint)'}}>{row[0]}</span>
          <span>{row[1]}</span>
          <span style={{padding:'2px 8px', borderRadius:999, border:'1px solid var(--line-strong)', fontSize: 10, letterSpacing:'.06em', textTransform:'uppercase'}}>{row[2]}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function Features({ t }) {
  return (
    <section id="features" className="section">
      <div className="wrap">
        <div className="reveal" style={{marginBottom: 56, display:'grid', gap: 18, maxWidth: 720}}>
          <span className="eyebrow">Producto</span>
          <h2 className="h-section">Cinco capas. <em>Un solo caso.</em></h2>
        </div>
        {t.features.map((f, i) => (
          <div key={i} className={`feature reveal ${i % 2 === 1 ? 'reverse' : ''}`}>
            <div className="feature-text">
              <div className="num">{f.num} —</div>
              <h3>{renderTitleParts(f.title)}</h3>
              <p>{f.body}</p>
              <ul className="bullets">
                {f.bullets.map((b, j) => <li key={j}>{b}</li>)}
              </ul>
            </div>
            <div className="feature-vis">
              <FeaturePlaceholder idx={i} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============ Demo ============ */
function Demo({ t }) {
  const [tab, setTab] = useState(0);
  const tabs = ["Inbox", "Super Agent", "Case Graph", "Approvals", "Audit"];
  return (
    <section className="section">
      <div className="wrap reveal">
        <div style={{display:'grid', gap: 18, maxWidth: 720}}>
          <span className="eyebrow">Demo en vivo</span>
          <h2 className="h-section">Cómo se siente <em>resolver</em> un caso.</h2>
          <p className="lede">Hover por la app — está corriendo. Cambia entre tabs para ver el flujo end-to-end de un caso real.</p>
        </div>
        <div className="demo-shell">
          <div className="demo-tabs">
            {tabs.map((tt, i) => (
              <button key={i} className={`demo-tab ${i === tab ? 'active' : ''}`} onClick={() => setTab(i)}>
                {String(i+1).padStart(2,'0')} {tt}
              </button>
            ))}
          </div>
          <div className="demo-body">
            <aside className="demo-side">
              <h5>Live cases</h5>
              {[
                { name:"ORD-7281 · Refund duplicado", prev:"Hola, vi dos cargos en mi tarjeta…", act: true, badge:"P1" },
                { name:"ORD-7264 · Carrier perdió paquete", prev:"Hace 6 días que sigue en tránsito.", badge:"P1" },
                { name:"ORD-7259 · Promesa de entrega", prev:"Me prometieron 24h y van 4 días.", badge:"P2" },
                { name:"ORD-7244 · Chargeback", prev:"Banco dice que no autorizó.", badge:"P2" },
                { name:"ORD-7231 · Risk hold", prev:"Pago con verificación pendiente.", badge:"P3" },
              ].map((c, i) => (
                <div key={i} className={`item ${c.act ? 'active' : ''}`}>
                  <div className="avatar">{c.name.split(' ')[0].slice(-2)}</div>
                  <div className="meta">
                    <span className="name">{c.name}</span>
                    <span className="preview">{c.prev}</span>
                  </div>
                  {c.badge && <span className="badge">{c.badge}</span>}
                </div>
              ))}
            </aside>
            <main className="demo-main">
              <DemoMain tab={tab} />
            </main>
            <aside className="demo-aside">
              <div className="aside-card">
                <h6>Customer <span className="pill">VIP</span></h6>
                <div className="row"><span>Lifetime</span><span>€2,140</span></div>
                <div className="row"><span>NPS</span><span>9</span></div>
                <div className="row"><span>Returns</span><span>2 / 14</span></div>
              </div>
              <div className="aside-card">
                <h6>Order ORD-7281</h6>
                <div className="row"><span>Total</span><span>€38.20 ×2</span></div>
                <div className="row"><span>Status</span><span>delivered</span></div>
                <div className="row"><span>Promise</span><span>24h · met</span></div>
              </div>
              <div className="aside-card">
                <h6>Graph</h6>
                <div className="graph-mini"><HeroGraph hot={2} /></div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

function DemoMain({ tab }) {
  if (tab === 0) {
    return (
      <>
        <h4>Refund — pago duplicado tras devolución parcial</h4>
        <div className="sub">ORD-7281 · cliente VIP · P1 · SLA 04:12</div>
        <div className="demo-thread">
          <div className="msg"><div className="av">L</div><div><span className="who">lucia@bondi.io</span><span className="when">14:01</span><div className="body">Vi dos cargos en mi tarjeta por €38.20 después de la devolución parcial. Llevo dos días esperando.</div></div></div>
          <div className="msg ai"><div className="av">★</div><div><span className="who">Clain · Super Agent</span><span className="when">14:02</span><div className="body">Confirmado en payments: 2 cargos coincidentes, 1 refund procesado. Borrador listo para aprobar — refund €38.20 + 10% goodwill (€3.82). Razón: duplicado.</div></div></div>
          <div className="msg"><div className="av">M</div><div><span className="who">marina@bondi.io</span><span className="when">14:03</span><div className="body">Aprobado. Firmar y ejecutar.</div></div></div>
        </div>
        <div style={{display:'flex', gap: 8, flexWrap:'wrap'}}>
          <span className="hero-pill"><span className="tag">NBA</span> Refund €38.20 + goodwill</span>
          <span className="hero-pill"><span className="tag">SLA</span> 04:12 → green</span>
        </div>
      </>
    );
  }
  if (tab === 1) {
    return (
      <>
        <h4>Investigación del agente</h4>
        <div className="sub">Plan generado · 6 pasos · 1 conflicto detectado</div>
        <div className="demo-thread">
          {[
            ["Read","conversación · 4 mensajes · 1 attach"],
            ["Query","orders.fulfillment(ORD-7281)"],
            ["Query","payments.charges(card_***4421)"],
            ["Detect","2 charges + 1 refund · diff = €38.20"],
            ["Plan","refund €38.20 + goodwill 10%"],
            ["Block","amount > policy.refund.auto · need approval"],
          ].map(([k, v], i) => (
            <div key={i} className="msg ai"><div className="av">{i+1}</div><div><span className="who" style={{fontFamily:'var(--mono)', fontSize: 11, letterSpacing:'.08em', textTransform:'uppercase'}}>{k}</span><div className="body">{v}</div></div></div>
          ))}
        </div>
      </>
    );
  }
  if (tab === 2) {
    return (
      <>
        <h4>Case graph</h4>
        <div className="sub">7 entidades · 1 conflicto · 1 política activa</div>
        <div style={{height: 360}}><HeroGraph hot={3} /></div>
      </>
    );
  }
  if (tab === 3) {
    return (
      <>
        <h4>Pendiente de aprobación</h4>
        <div className="sub">refund €38.20 · solicita: Super Agent · firmar: ops_lead</div>
        <div className="demo-thread">
          <div className="msg ai"><div className="av">!</div><div><span className="who">Policy guard</span><div className="body">amount €38.20 &gt; policy.refund.auto (€25). Required role: ops_lead OR senior_agent + reason ∈ [duplicate, lost_in_transit, defect].</div></div></div>
          <div className="msg"><div className="av">M</div><div><span className="who">marina · ops_lead</span><div className="body">Razón: duplicate · evidencia: payments.charges#1, #2 → ✓ approve</div></div></div>
        </div>
        <div style={{display:'flex', gap: 8}}>
          <span className="btn btn-primary" style={{pointerEvents:'none'}}>Approve & sign</span>
          <span className="btn btn-ghost" style={{pointerEvents:'none'}}>Reject</span>
        </div>
      </>
    );
  }
  return (
    <>
      <h4>Audit log</h4>
      <div className="sub">Caso ORD-7281 · 7 eventos · sealed</div>
      <FeatureAudit />
    </>
  );
}

/* ============ Scroll-painted quote ============
   Sticky frame: as the user scrolls, each word transitions from light gray
   to full dark — Attio-style painterly reveal. Uses requestAnimationFrame
   for buttery-smooth interpolation regardless of scroll velocity. */
function ScrollPaintedQuote({ lang }) {
  const wrapRef = useRef(null);
  const [progress, setProgress] = useState(0);

  const COPY = {
    es: {
      pre: '"',
      words: [
        'La', 'primera', 'vez', 'que', 'abrí', 'Clain,',
        'supe', 'al', 'instante', 'que', 'esto', 'era',
        'la', 'próxima', 'generación', 'de', 'operaciones',
        'de', 'comercio.',
      ],
      post: '"',
      author: 'Tomás Silvera',
      role: 'VP Operations · Norte&Co',
    },
    en: {
      pre: '"',
      words: [
        'When', 'I', 'first', 'opened', 'Clain,', 'I',
        'instantly', 'got', 'the', 'feeling', 'this', 'was',
        'the', 'next', 'generation', 'of', 'commerce',
        'operations.',
      ],
      post: '"',
      author: 'Tomás Silvera',
      role: 'VP Operations · Norte&Co',
    },
  };
  const c = COPY[lang] || COPY.en;

  useEffect(() => {
    let raf = null;
    const update = () => {
      raf = null;
      if (!wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const total = wrapRef.current.offsetHeight - window.innerHeight;
      if (total <= 0) { setProgress(0); return; }
      const scrolled = -rect.top;
      const p = Math.max(0, Math.min(1, scrolled / total));
      setProgress(p);
    };
    const onScroll = () => { if (raf == null) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Reserve a fraction of the scroll for hold-state (text fully painted before
  // the section detaches). 0.78 means: words finish painting at 78% scroll,
  // then the fully-bright frame holds for the remaining 22%.
  const STAGGER = 0.78;
  const total = c.words.length;

  return (
    <section ref={wrapRef} className="scroll-paint-section">
      <div className="scroll-paint-sticky">
        <div className="scroll-paint-inner">
          <p className="scroll-paint-quote">
            <span className="scroll-paint-mark">{c.pre}</span>
            {c.words.map((w, i) => {
              const startP = (i / total) * STAGGER;
              const endP = ((i + 1) / total) * STAGGER;
              const wp = Math.max(0, Math.min(1, (progress - startP) / (endP - startP)));
              // ease-out for the per-word fade (feels more "painted")
              const eased = 1 - Math.pow(1 - wp, 2);
              const opacity = 0.14 + 0.86 * eased;
              return (
                <span key={i} className="scroll-paint-word" style={{ opacity }}>
                  {w}{i < total - 1 ? ' ' : ''}
                </span>
              );
            })}
            <span className="scroll-paint-mark">{c.post}</span>
          </p>
          <div className="scroll-paint-author">
            <div className="scroll-paint-author-name">{c.author}</div>
            <div className="scroll-paint-author-role">{c.role}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============ Stats ============ */
function Stats() {
  return (
    <div className="stats wrap reveal-children">
      <div className="stat"><div className="num">41<em>%</em></div><div className="lab">menos AHT medio</div></div>
      <div className="stat"><div className="num">3.2×</div><div className="lab">throughput por agente</div></div>
      <div className="stat"><div className="num">99.9<em>%</em></div><div className="lab">uptime contractual</div></div>
      <div className="stat"><div className="num">04:12</div><div className="lab">P50 resolución</div></div>
    </div>
  );
}

/* ============ Testimonials ============ */
function Testimonials({ t }) {
  return (
    <section id="testimonials" className="section">
      <div className="wrap">
        <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 760}}>
          <span className="eyebrow">Clientes</span>
          <h2 className="h-section">{renderTitleParts(t.testimonialsTitle)}</h2>
        </div>
        <div className="test-grid reveal-children">
          {t.testimonials.map((q, i) => (
            <article key={i} className="test-card">
              <div className="quote">“{q.quote}”</div>
              <div className="who">
                <div className="av" />
                <div>
                  <div className="name">{q.name}</div>
                  <div className="role">{q.role}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ Pricing ============ */
function Pricing({ t, hideTitle, navigate }) {
  const [billingInterval, setBillingInterval] = React.useState('year');

  // Detect language from plan data (per text)
  const isEs = t.plans && t.plans[0] && t.plans[0].per === '/ mes';
  const toggleLabels = isEs
    ? { monthly: 'Mensual', annual: 'Anual', save: '15% OFF' }
    : { monthly: 'Monthly', annual: 'Annual', save: '15% OFF' };

  // Map plan name → checkout plan id; Business plan goes to /demo (talk to sales).
  const planActionFor = (planName) => {
    const key = (planName || '').toLowerCase();
    if (key.includes('starter')) return { kind: 'plan', id: 'starter' };
    if (key.includes('growth'))  return { kind: 'plan', id: 'growth' };
    if (key.includes('scale'))   return { kind: 'plan', id: 'scale' };
    if (key.includes('business')) return { kind: 'sales' };
    return { kind: 'signup' };
  };
  const onPlanCta = async (p) => {
    const action = planActionFor(p.name);
    if (action.kind === 'sales') {
      (navigate || ((path) => window.location.hash = '#' + path))('/demo');
      return;
    }
    if (action.kind === 'plan' && window.ClainAuth) {
      await window.ClainAuth.checkoutPlan(action.id, billingInterval);
      return;
    }
    (navigate || ((path) => window.location.hash = '#' + path))(`/signup?interval=${billingInterval}`);
  };
  // Credit packs are ordered: 5,000 / 20,000 / 50,000.
  const onCreditCta = async (c) => {
    const credits = parseInt(String(c.amount || '').replace(/[^0-9]/g, ''), 10) || 0;
    if (!credits) return;
    if (window.ClainAuth) {
      await window.ClainAuth.topupPack(credits);
    } else {
      (navigate || ((path) => window.location.hash = '#' + path))('/signup?plan=topup');
    }
  };

  return (
    <section id="pricing" className="section">
      <div className="wrap">
        {!hideTitle && (
          <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 760}}>
            <span className="eyebrow">Pricing</span>
            <h2 className="h-section">{renderTitleParts(t.pricingTitle)}</h2>
            {t.pricingNote && <p className="lede">{t.pricingNote}</p>}
          </div>
        )}

        {/* ── Billing-interval toggle ── */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap: 10, margin:'40px 0 32px'}}>
          <span style={{fontSize: 14, fontWeight: billingInterval === 'month' ? 600 : 400, opacity: billingInterval === 'month' ? 1 : 0.5, transition:'opacity .15s'}}>
            {toggleLabels.monthly}
          </span>
          <button
            onClick={() => setBillingInterval(billingInterval === 'month' ? 'year' : 'month')}
            aria-label="Toggle billing interval"
            style={{
              position:'relative', width: 48, height: 26, borderRadius: 999,
              background: billingInterval === 'year' ? '#0A0A0A' : '#d1d5db',
              border: 'none', cursor: 'pointer', transition:'background .2s', flexShrink: 0,
            }}
          >
            <span style={{
              position:'absolute', top: 3, left: billingInterval === 'year' ? 25 : 3,
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              boxShadow:'0 1px 3px rgba(0,0,0,.25)', transition:'left .2s',
            }} />
          </button>
          <span style={{fontSize: 14, fontWeight: billingInterval === 'year' ? 600 : 400, opacity: billingInterval === 'year' ? 1 : 0.5, transition:'opacity .15s'}}>
            {toggleLabels.annual}&nbsp;<span style={{color:'#16a34a', fontSize: 10, fontWeight: 700, background:'#dcfce7', padding:'2px 6px', borderRadius: 4, letterSpacing:'.02em'}}>{toggleLabels.save}</span>
          </span>
        </div>

        <div className="price-grid price-grid-4 reveal-children">
          {t.plans.map((p, i) => {
            // Both monthly and annual are discounted from `was` (MSRP).
            // Annual gets the bigger discount via `price`; monthly uses `monthly`.
            // The strikethrough `was` is shown in BOTH modes (when present).
            const isAnnual = billingInterval === 'year';
            const displayPrice = isAnnual ? p.price : (p.monthly != null ? p.monthly : p.was);
            const strikePrice  = (p.price !== null && p.was) ? p.was : null;
            const billedLine = p.price !== null
              ? (isAnnual ? p.billed : (isEs ? 'Facturado mensualmente' : 'Billed monthly'))
              : null;
            return (
              <div key={i} className={`price-card ${p.featured ? 'featured' : ''}`}>
                {p.badge && <span className="price-badge">{p.badge}</span>}
                <div className="price-name">{p.name}</div>
                <div className="price-amount">
                  {displayPrice === null || displayPrice === undefined ? (
                    <span style={{fontSize: 40}}>{p.per}</span>
                  ) : (
                    <>
                      {strikePrice && <span className="price-was">€{strikePrice}</span>}
                      <sup>€</sup>{displayPrice}<span className="per">{p.per}</span>
                    </>
                  )}
                </div>
                {billedLine && <div className="price-billed">{billedLine}</div>}
                <div className="price-meta">{p.meta}</div>
                <ul className="price-list">
                  {p.feats.map((f, j) => <li className="price-li" key={j}>{f}</li>)}
                </ul>
                <button onClick={() => onPlanCta(p)} className={`btn ${p.featured ? 'btn-primary' : 'btn-ghost'}`}>{p.cta} <span className="arrow">→</span></button>
              </div>
            );
          })}
        </div>

        {/* Need set up? — link to sales-led setup (the demo page) */}
        <div style={{
          marginTop: 32,
          padding: '16px 24px',
          background: 'var(--bg-elev)',
          border: '1px dashed var(--line-strong)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          fontSize: 14,
          color: 'var(--fg-muted)',
        }}>
          <span>{isEs ? 'Necesitas ayuda con onboarding, migración o setup técnico?' : 'Need help with onboarding, migration or technical setup?'}</span>
          <a
            href="#/demo"
            onClick={(e)=>{e.preventDefault(); (navigate || ((p) => window.location.hash = '#' + p))('/demo');}}
            style={{color:'var(--fg)', fontWeight: 500, textDecoration:'underline'}}
          >
            {isEs ? 'Need set up? Reserva una llamada →' : 'Need set up? Book a call →'}
          </a>
        </div>

        {t.credits && (
          <div style={{marginTop: 96}}>
            <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 760}}>
              <span className="eyebrow">Credits</span>
              <h2 className="h-section">{renderTitleParts(t.creditsTitle)}</h2>
              {t.creditsNote && <p className="lede">{t.creditsNote}</p>}
            </div>
            <div className="credits-list reveal-children">
              {t.credits.map((c, i) => (
                <div key={i} className={`credit-row ${c.featured ? 'featured' : ''}`}>
                  {c.badge && <span className="credit-badge">{c.badge}</span>}
                  <div className="credit-amount">
                    <div className="credit-num">{c.amount}</div>
                    <div className="credit-sub">AI credits</div>
                  </div>
                  <div className="credit-feats">
                    <div><strong>Models:</strong> <span>{c.models}</span></div>
                    <div><strong>Capacity:</strong> <span>{c.capacity}</span></div>
                  </div>
                  <div className="credit-price">€{c.price}</div>
                  <button onClick={() => onCreditCta(c)} className={`btn ${c.featured ? 'btn-primary' : 'btn-ghost'}`}>{c.cta}</button>
                </div>
              ))}
              {t.flexible && (
                <div className="credit-row flex-row">
                  {/* Col 1 — title (replaces the credit-amount block of upper rows) */}
                  <div className="credit-amount">
                    <div className="credit-num" style={{fontSize: 26}}>{t.flexible.title}</div>
                  </div>
                  {/* Col 2 — bullets, aligned with Models/Capacity of upper rows */}
                  <div className="credit-feats">
                    {t.flexible.feats.map((f, j) => <div key={j}>· {f}</div>)}
                  </div>
                  {/* Col 3 — price */}
                  <div className="credit-price" style={{fontSize: 22, whiteSpace:'nowrap'}}>
                    {t.flexible.price}
                    <div style={{fontFamily:'var(--mono)', fontSize: 10, color:'var(--fg-faint)', letterSpacing:'.08em', textTransform:'uppercase', marginTop: 4}}>{t.flexible.billed}</div>
                  </div>
                  {/* Col 4 — CTA */}
                  <button className="btn btn-ghost" style={{whiteSpace:'nowrap'}}>{t.flexible.cta}</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ============ FAQ ============ */
function FAQ({ t }) {
  return (
    <section id="faq" className="section">
      <div className="wrap">
        <div className="reveal" style={{display:'grid', gap: 18, maxWidth: 720}}>
          <span className="eyebrow">FAQ</span>
          <h2 className="h-section">{renderTitleParts(t.faqTitle)}</h2>
        </div>
        <div className="faq-list reveal">
          {t.faqs.map((f, i) => (
            <details className="faq-item" key={i}>
              <summary className="faq-q">
                <span>{f.q}</span>
                <span className="icon">+</span>
              </summary>
              <div className="faq-a">{f.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ Final CTA ============ */
function FinalCTA({ t, navigate }) {
  const goSignup = (e) => { if (e) e.preventDefault(); (navigate || ((p) => window.location.hash = '#' + p))('/signup'); };
  const goDemo   = (e) => { if (e) e.preventDefault(); (navigate || ((p) => window.location.hash = '#' + p))('/demo'); };
  return (
    <section className="final-cta">
      <span className="stamp">[ Listo · 2 minutos · sin tarjeta ]</span>
      <div className="wrap reveal">
        <h2 className="h-display">{renderTitleParts(t.finalCta)}</h2>
        <div style={{display:'flex', gap: 10, justifyContent:'center', flexWrap:'wrap'}}>
          <Magnetic className="btn btn-primary" onClick={goSignup}>{t.hero.cta1} <span className="arrow">→</span></Magnetic>
          <Magnetic className="btn btn-ghost" strength={0.12} onClick={goDemo}>{t.hero.cta2}</Magnetic>
        </div>
      </div>
    </section>
  );
}

/* ============ Footer ============ */
function Footer({ t, navigate }) {
  const handle = (e, path) => {
    if (path && path.startsWith('/')) {
      e.preventDefault();
      navigate && navigate(path);
    }
  };
  // map labels to internal routes
  const labelToRoute = {
    "Pricing": "/pricing",
    "Clientes": "/customers",
    "Customers": "/customers",
    "Bandeja unificada": "/omnichannel",
    "Unified Inbox": "/omnichannel",
    "Omnicanal": "/omnichannel",
    "Omnichannel": "/omnichannel",
    "Para startups": "/early-stage",
    "For startups": "/early-stage",
    "Early-stage": "/early-stage",
    "Programa Early-stage": "/early-stage",
    "AI Case Inbox": "/product#inbox",
    "Super Agent": "/product#agent",
    "Case Graph": "/product#graph",
    "Approvals": "/product#policy",
    "Audit log": "/product#audit",
  };
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <a href="#/" onClick={(e)=>handle(e,'/')} className="nav-logo"><span className="mark"></span><span>Clain</span></a>
            <p>{t.footer.brand}</p>
          </div>
          {t.footer.cols.map((c, i) => (
            <div key={i} className="footer-col">
              <h6>{c.t}</h6>
              <ul>
                {c.l.map((l, j) => {
                  const r = labelToRoute[l];
                  return (
                    <li key={j}>
                      <a href={r ? `#${r}` : '#'} onClick={(e)=>handle(e, r)}>{l}</a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer-bot">
          <span>{t.footer.bot[0]}</span>
          <span>{t.footer.bot[1]}</span>
          <div className="wordmark">Clain<em>.</em></div>
        </div>
      </div>
    </footer>
  );
}

/* ============ Router hook ============ */
function useHashRoute() {
  const get = () => {
    const h = window.location.hash || '#/';
    return h.startsWith('#') ? h.slice(1) : h;
  };
  const [route, setRoute] = useState(get());
  useEffect(() => {
    const onHash = () => {
      setRoute(get());
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = (path) => {
    if (window.location.hash !== `#${path}`) {
      window.location.hash = path;
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  return [route, navigate];
}

/* ============ App ============ */
function App() {
  const [tweaks, setTweak] = useTweaks(DEFAULTS);
  const t = COPY[tweaks.lang] || COPY.es;
  const [route, navigate] = useHashRoute();
  useReveal();

  // Apply tokens
  useEffect(() => {
    document.documentElement.dataset.theme = tweaks.theme;
    const pair = FONT_PAIRS[tweaks.fontPair] || FONT_PAIRS["instrument-inter"];
    document.documentElement.style.setProperty('--serif', pair.serif);
    document.documentElement.style.setProperty('--sans', pair.sans);
    document.documentElement.style.setProperty('--accent', tweaks.accent);
    document.documentElement.style.setProperty('--anim', String(tweaks.intensity / 100));
    document.documentElement.style.setProperty('--density', tweaks.density === 'compact' ? '0.7' : tweaks.density === 'roomy' ? '1.2' : '1');
  }, [tweaks]);

  // Re-run reveal when route changes (new DOM)
  useEffect(() => {
    setTimeout(() => {
      const els = document.querySelectorAll('.reveal:not(.in), .reveal-children:not(.in)');
      els.forEach(el => el.classList.add('in'));
    }, 100);
  }, [route]);

  const isProduct = route.startsWith('/product');
  const isPricing = route.startsWith('/pricing');
  const isCustomers = route.startsWith('/customers');
  const isOmni = route.startsWith('/omnichannel');
  const isEarly = route.startsWith('/early-stage');
  const isSuperAgent = route.startsWith('/super-agent');
  const isSignin = route.startsWith('/signin');
  const isSignup = route.startsWith('/signup');
  const isReset  = route.startsWith('/reset-password');
  const isDemo = route.startsWith('/demo');
  const capRoutes = {
    '/unified-inbox': 'UnifiedInboxPage',
    '/cases': 'CasesPage',
    '/help-center': 'HelpCenterPage',
    '/reporting': 'ReportingPage',
    '/policy-engine': 'PolicyEnginePage',
    '/audit-log': 'AuditLogPage',
    '/copilot': 'CopilotPage',
  };
  const capPageKey = Object.keys(capRoutes).find(p => route.startsWith(p));

  return (
    <>
      <Cursor />
      <div className="grain" />
      <Aurora intensity={tweaks.intensity} />
      <GravityGrid intensity={tweaks.intensity} />

      <Nav t={t} lang={tweaks.lang} route={route} navigate={navigate} onLangToggle={() => setTweak('lang', tweaks.lang === 'es' ? 'en' : 'es')} />

      {(() => {
        const ProductPage = window.ProductPage;
        const PricingPage = window.PricingPage;
        const CustomersPage = window.CustomersPage;
        const OmnichannelPage = window.OmnichannelPage;
        const EarlyStagePage = window.EarlyStagePage;
        const SignInPage = window.SignInPage;
        const DemoPage = window.DemoPage;
        const Panorama = window.Panorama;
        if (isProduct && ProductPage) return <ProductPage t={t} lang={tweaks.lang} />;
        if (isPricing && PricingPage) return <PricingPage t={t} navigate={navigate} />;
        if (isCustomers && CustomersPage) return <CustomersPage t={t} lang={tweaks.lang} />;
        if (isOmni && OmnichannelPage) return <OmnichannelPage t={t} lang={tweaks.lang} />;
        if (isEarly && EarlyStagePage) return <EarlyStagePage t={t} lang={tweaks.lang} />;
        if (isSuperAgent && window.SuperAgentPage) return <window.SuperAgentPage t={t} lang={tweaks.lang} />;
        if (isSignin && SignInPage) return <SignInPage lang={tweaks.lang} navigate={navigate} />;
        if (isSignup && window.SignUpPage) return <window.SignUpPage lang={tweaks.lang} navigate={navigate} />;
        if (isReset && window.ResetPasswordPage) return <window.ResetPasswordPage lang={tweaks.lang} navigate={navigate} />;
        if (isDemo && DemoPage) return <DemoPage lang={tweaks.lang} navigate={navigate} />;
        if (capPageKey) {
          const CapPage = window[capRoutes[capPageKey]];
          if (CapPage) return <CapPage t={t} lang={tweaks.lang} />;
        }
        return (
          <main>
            <Hero t={t} navigate={navigate} />
            <Logos t={t} />
            <ScrollPaintedQuote lang={tweaks.lang} />
            <Stats />
            <Press />
            <Features t={t} />
            <Demo t={t} />
            {Panorama && <Panorama lang={tweaks.lang} />}
            <Testimonials t={t} />
            <Pricing t={t} navigate={navigate} />
            <FAQ t={t} />
            <FinalCTA t={t} navigate={navigate} />
          </main>
        );
      })()}
      <Footer t={t} navigate={navigate} />

      <TweaksPanel title="Tweaks">
        <TweakSection title="Animation">
          <TweakSlider label="Intensity" value={tweaks.intensity} min={0} max={100} step={5} onChange={(v) => setTweak('intensity', v)} />
        </TweakSection>
        <TweakSection title="Theme">
          <TweakRadio label="Mode" value={tweaks.theme} options={[{value:'light', label:'Light'}, {value:'dark', label:'Dark'}]} onChange={(v) => setTweak('theme', v)} />
          <TweakColor label="Accent" value={tweaks.accent} onChange={(v) => setTweak('accent', v)} />
        </TweakSection>
        <TweakSection title="Type">
          <TweakSelect
            label="Pair"
            value={tweaks.fontPair}
            options={Object.entries(FONT_PAIRS).map(([v, p]) => ({value: v, label: p.label}))}
            onChange={(v) => setTweak('fontPair', v)}
          />
        </TweakSection>
        <TweakSection title="Layout">
          <TweakRadio label="Density" value={tweaks.density} options={[{value:'compact', label:'Compact'}, {value:'comfortable', label:'Default'}, {value:'roomy', label:'Roomy'}]} onChange={(v) => setTweak('density', v)} />
        </TweakSection>
        <TweakSection title="Language">
          <TweakRadio label="Lang" value={tweaks.lang} options={[{value:'es', label:'ES'}, {value:'en', label:'EN'}]} onChange={(v) => setTweak('lang', v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

// Expose helpers to pages.jsx
window.renderTitleParts = renderTitleParts;
window.FeaturePlaceholder = FeaturePlaceholder;
window.Pricing = Pricing;
window.FAQ = FAQ;
window.FinalCTA = FinalCTA;

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
