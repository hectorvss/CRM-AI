(() => {
  (function() {
    const { useState } = React;
    const { PageShell } = ClainV2;
    const FONT = "'Inter', sans-serif";
    const COLOR_TEXT = "#111";
    const COLOR_TEXT_60 = "rgba(17,17,17,0.6)";
    const COLOR_TEXT_80 = "rgba(17,17,17,0.8)";
    const BORDER_CLAY = "#d3cec6";
    const BG_OFF_WHITE = "#faf9f6";
    const BG_OFF_WHITE_2 = "#f5f1ea";
    const ACCENT_BLUE = "#0007cb";
    function CornerDots({ color }) {
      const dotColor = color || ACCENT_BLUE;
      return /* @__PURE__ */ React.createElement("div", { className: "absolute inset-[16px] pointer-events-none" }, /* @__PURE__ */ React.createElement("div", { className: "absolute left-0 top-0 size-[8px]", style: { background: dotColor } }), /* @__PURE__ */ React.createElement("div", { className: "absolute right-0 top-0 size-[8px]", style: { background: dotColor } }), /* @__PURE__ */ React.createElement("div", { className: "absolute left-0 bottom-0 size-[8px]", style: { background: dotColor } }), /* @__PURE__ */ React.createElement("div", { className: "absolute right-0 bottom-0 size-[8px]", style: { background: dotColor } }));
    }
    function InfoIcon() {
      return /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", className: "inline-block shrink-0" }, /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "6", r: "5.5", stroke: COLOR_TEXT_60 }), /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "3.5", r: "0.6", fill: COLOR_TEXT_60 }), /* @__PURE__ */ React.createElement("path", { d: "M6 5.5v3.5", stroke: COLOR_TEXT_60, strokeLinecap: "round" }));
    }
    function Bullet({ children }) {
      return /* @__PURE__ */ React.createElement("li", { className: "flex gap-[10px] items-start" }, /* @__PURE__ */ React.createElement("span", { className: "size-[4px] mt-[8px] shrink-0", style: { background: "rgba(17,17,17,0.3)" } }), /* @__PURE__ */ React.createElement("span", { className: "text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT } }, children));
    }
    function PlanColumn({ plan, isAnnual, width, showDemoBtn }) {
      const price = isAnnual ? plan.priceAnnual : plan.priceMonthly;
      return /* @__PURE__ */ React.createElement("div", { className: "flex flex-col p-[24px]", style: { width, minHeight: 608 } }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col", style: { minHeight: 270 } }, /* @__PURE__ */ React.createElement("h3", { className: "m-0 text-[22px] tracking-[-0.48px] leading-[24px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 } }, plan.name), /* @__PURE__ */ React.createElement("p", { className: "m-0 mt-[10px] text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT } }, plan.subtitle), /* @__PURE__ */ React.createElement("p", { className: "m-0 mt-[16px] text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT_60 } }, plan.description), /* @__PURE__ */ React.createElement("div", { className: "mt-[16px]" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-baseline gap-[4px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT } }, "From"), /* @__PURE__ */ React.createElement("span", { className: "text-[19px] leading-[19px] tracking-[-0.2px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 } }, plan.unitPrice), /* @__PURE__ */ React.createElement("span", { className: "text-[13px] leading-[19.6px] flex items-center gap-[6px]", style: { fontFamily: FONT, color: COLOR_TEXT_80 } }, plan.unitLabel, " ", /* @__PURE__ */ React.createElement(InfoIcon, null))), plan.seatPrice && /* @__PURE__ */ React.createElement("div", { className: "mt-[6px] flex items-baseline gap-[4px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-[19px] leading-[19px] tracking-[-0.2px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 } }, price), /* @__PURE__ */ React.createElement("span", { className: "text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT_80 } }, plan.seatLabel)), plan.noSeats && /* @__PURE__ */ React.createElement("p", { className: "m-0 mt-[6px] text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT_80 } }, "No seats required")), /* @__PURE__ */ React.createElement("div", { className: "flex gap-[12px] mt-[24px]" }, /* @__PURE__ */ React.createElement("button", { onClick: () => ClainV2.navigate("/signup"), className: "cursor-pointer rounded-[4px] h-[40px] px-[14px] flex items-center justify-center text-[13px] leading-[20px] border-0", style: { fontFamily: FONT, background: COLOR_TEXT, color: "white" } }, "Start free trial"), showDemoBtn && /* @__PURE__ */ React.createElement("button", { onClick: () => ClainV2.navigate("/demo"), className: "cursor-pointer rounded-[4px] h-[40px] px-[15px] flex items-center justify-center text-[13px] leading-[20px] bg-white", style: { fontFamily: FONT, color: COLOR_TEXT, border: "1px solid " + COLOR_TEXT } }, "Get a demo"))), /* @__PURE__ */ React.createElement("div", { style: { height: 40 } }), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col" }, /* @__PURE__ */ React.createElement("p", { className: "m-0 text-[10px] uppercase tracking-[0.6px] leading-[10px]", style: { fontFamily: FONT, color: COLOR_TEXT } }, plan.featuresLabel), /* @__PURE__ */ React.createElement("ul", { className: "list-none p-0 m-0 mt-[26px] flex flex-col gap-[16px]" }, plan.features.map((f, i) => /* @__PURE__ */ React.createElement(Bullet, { key: i }, f))), /* @__PURE__ */ React.createElement("button", { onClick: () => ClainV2.navigate("/pricing/all-features"), className: "mt-[26px] self-start bg-transparent border-0 p-0 cursor-pointer text-[13px] leading-[19.6px] underline", style: { fontFamily: FONT, color: COLOR_TEXT } }, "View all features")));
    }
    function FAQItem({ q, a, isOpen, onToggle }) {
      return /* @__PURE__ */ React.createElement("div", { className: "border-t", style: { borderColor: BORDER_CLAY } }, /* @__PURE__ */ React.createElement("button", { onClick: onToggle, className: "w-full flex items-center justify-between gap-4 py-[18px] bg-transparent border-0 cursor-pointer text-left" }, /* @__PURE__ */ React.createElement("span", { className: "text-[15px] leading-[22px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 } }, q), /* @__PURE__ */ React.createElement("svg", { className: `shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`, width: "12", height: "8", viewBox: "0 0 12 8", fill: "none" }, /* @__PURE__ */ React.createElement("path", { d: "M1 1.5L6 6.5L11 1.5", stroke: COLOR_TEXT, strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }))), isOpen && /* @__PURE__ */ React.createElement("div", { className: "pb-[18px]" }, /* @__PURE__ */ React.createElement("p", { className: "m-0 text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT_60 } }, a)));
    }
    function PricingPage() {
      const [isAnnual, setIsAnnual] = useState(true);
      const [openFaq, setOpenFaq] = useState(0);
      const [activeTestimonial, setActiveTestimonial] = useState(0);
      const platformPlans = [
        {
          name: "Starter",
          subtitle: "Includes Clain AI Agent",
          description: "The customer support plan for individuals, startups, and small businesses.",
          unitPrice: "\u20AC0.012",
          unitLabel: "per Clain outcome",
          priceAnnual: "\u20AC42",
          priceMonthly: "\u20AC49",
          seatPrice: true,
          seatLabel: "per seat/mo",
          featuresLabel: "KEY FEATURES INCLUDE",
          features: [
            "Clain AI Agent (autonomous)",
            "Inbox with shared views",
            "Knowledge Hub",
            "5,000 AI credits/month",
            "Up to 3 seats"
          ]
        },
        {
          name: "Growth",
          subtitle: "Includes Clain AI Agent",
          description: "Powerful automation tools and AI features for growing support teams.",
          unitPrice: "\u20AC0.012",
          unitLabel: "per Clain outcome",
          priceAnnual: "\u20AC109",
          priceMonthly: "\u20AC129",
          seatPrice: true,
          seatLabel: "per seat/mo",
          featuresLabel: "EVERY STARTER FEATURE, PLUS",
          features: [
            "Tickets & SLA monitoring",
            "Workflow automation builder",
            "Round robin assignment",
            "Reporting + AI Insights",
            "Up to 10 seats"
          ]
        },
        {
          name: "Scale",
          subtitle: "Includes Clain AI Agent",
          description: "Collaboration, security, and multibrand features for large support teams.",
          unitPrice: "\u20AC0.012",
          unitLabel: "per Clain outcome",
          priceAnnual: "\u20AC254",
          priceMonthly: "\u20AC299",
          seatPrice: true,
          seatLabel: "per seat/mo",
          featuresLabel: "EVERY GROWTH FEATURE, PLUS",
          features: [
            "SSO & identity management",
            "HIPAA support",
            "Service level agreements (SLAs)",
            "Multibrand Help Center",
            "Up to 25 seats"
          ]
        }
      ];
      const standalonePlan = {
        name: "Clain AI Agent",
        subtitle: "",
        description: "Use Clain AI with your current helpdesk including Salesforce and more.",
        unitPrice: "\u20AC0.012",
        unitLabel: "per Clain outcome",
        noSeats: true,
        featuresLabel: "FEATURES INCLUDE",
        features: [
          "Set up in under an hour on your current helpdesk",
          "Answers email, live chat, phone and more",
          "Customizable tone & answer length",
          "Takes action on external systems",
          "Hands off to agents in preferred Inbox"
        ]
      };
      const addons = [
        { name: "Pro", price: "\u20AC99/mo", desc: "AI features for visibility and control across every conversation. Includes CX Score, Topics, Recommendations, Monitors, and Custom Scorecards.", extra: "Includes analysis of 1,000 conversations/mo" },
        { name: "Copilot", price: "\u20AC29/agent/mo", desc: "Increase agent efficiency with a personal AI assistant in the inbox. Free to use in 10 Copilot and 10 AI Auto-translation conversations per agent/mo.", extra: "Unlimited usage" },
        { name: "Proactive Support Plus", price: "\u20AC99/mo", desc: "Advanced in-app and outbound support features including Posts, Checklists, Product Tours, Surveys, and Series campaign builder.", extra: "Includes 500 messages sent/mo" }
      ];
      const testimonials = [
        { tab: "LINKTREE", logo: "Linktree", quote: '"Within six days, Clain is successfully resolving 42% of conversations. It\u2019s truly surpassed my expectations."', author: "Dane Burgess", role: "Customer Support Director at Linktree" },
        { tab: "ROBIN", logo: "Robin", quote: '"Clain\u2019s agent handles the repetitive queries our team used to dread. We redirected 20 hours a week."', author: "Camila Vives", role: "Lead CX at Robin" },
        { tab: "SYNTHESIA", logo: "Synthesia", quote: '"We plugged Clain into our existing stack and the AI started resolving tickets on day one."', author: "Marco Ribeiro", role: "Head of Support at Synthesia" }
      ];
      const faqs = [
        { q: "How does Clain pricing work?", a: "Clain pricing has two components \u2014 Seats: you pay per teammate based on your plan (Starter, Growth, Scale). Usage: you pay for what you use (e.g. Clain outcomes, messaging channels). All plans include access to Clain\u2019s helpdesk and Clain AI Agent." },
        { q: "How is Clain AI Agent priced?", a: "Clain AI Agent is included in every plan with a monthly credit allowance. One credit = one resolved interaction. Flexible usage at \u20AC0.012 per outcome." },
        { q: "Can I use Clain with my existing helpdesk?", a: "Yes. Clain integrates with Zendesk, HubSpot, Salesforce, Freshdesk and others via API." },
        { q: "What plans does Clain offer?", a: "Starter, Growth, Scale self-serve + Business enterprise. All include AI agent and unlimited integrations." },
        { q: "What is a seat (Full vs Lite)?", a: "A Full seat is a human teammate with full login access. Lite seats are read-only collaborators included free with each plan." },
        { q: "Are there additional usage charges?", a: "Only if you exceed monthly credit allowance with flexible usage enabled." },
        { q: "What is Proactive Support Plus?", a: "Add-on (\u20AC99/mo) for outbound AI nudges \u2014 onboarding, cart-recovery, renewals." },
        { q: "Do I need a contract?", a: "No. Self-serve monthly/annual, no commitment. Business uses MSA + DPA." },
        { q: "What\u2019s the minimum to get started?", a: "Free 14-day trial, no card required." },
        { q: "Is there a free trial?", a: "Yes \u2014 14 days, full access, no card." },
        { q: "How do I change my plan or seats?", a: "Self-service in Billing \u2192 Subscription." },
        { q: "Are there discounts available?", a: "20% off annual. Startups under 2 years get 50% off year one." }
      ];
      return /* @__PURE__ */ React.createElement(PageShell, null, /* @__PURE__ */ React.createElement("div", { className: "relative w-full bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "max-w-[1440px] mx-auto px-[16px] pt-[128px] pb-[40px] relative" }, /* @__PURE__ */ React.createElement(CornerDots, null), /* @__PURE__ */ React.createElement("div", { className: "max-w-[1170px] mx-auto px-[16px]" }, /* @__PURE__ */ React.createElement("h1", { className: "m-0 text-[50px] leading-[54px] tracking-[-1.6px] max-w-[896px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 } }, "Get Clain AI Agent and the full platform for a single, integrated experience"), /* @__PURE__ */ React.createElement("a", { onClick: (e) => {
        e.preventDefault();
        ClainV2.navigate("/demo");
      }, href: "/demo", className: "cursor-pointer inline-flex items-center gap-[8px] py-[21px]" }, /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none" }, /* @__PURE__ */ React.createElement("path", { d: "M2.5 6L5 8.5L9.5 3.5", stroke: COLOR_TEXT, strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase tracking-[0.6px] underline", style: { fontFamily: FONT, color: COLOR_TEXT } }, "Clain AI guarantee")), /* @__PURE__ */ React.createElement("div", { className: "inline-flex items-center gap-[10px] px-[6px] py-[6px] bg-white", style: { border: "1px solid #dedbd6" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => setIsAnnual(true), className: "cursor-pointer border-0 px-[8px] py-[4px] text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT, background: isAnnual ? "#e7e3db" : "transparent" } }, "Billed annually"), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsAnnual(false), className: "cursor-pointer border-0 px-[8px] py-[4px] text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT, background: !isAnnual ? "#e7e3db" : "transparent" } }, "Billed monthly")), /* @__PURE__ */ React.createElement("div", { className: "flex gap-[24px] items-stretch mt-[24px]" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col flex-1", style: { border: `1px solid ${BORDER_CLAY}` } }, /* @__PURE__ */ React.createElement("div", { className: "px-[24px] py-[10px]", style: { background: BG_OFF_WHITE, borderBottom: `1px solid ${BORDER_CLAY}` } }, /* @__PURE__ */ React.createElement("span", { className: "text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT } }, "Our Clain AI Agent + platform plans")), /* @__PURE__ */ React.createElement("div", { className: "flex" }, platformPlans.map((plan, i) => /* @__PURE__ */ React.createElement("div", { key: plan.name, className: "flex-1", style: { borderLeft: i > 0 ? `1px solid ${BORDER_CLAY}` : "none" } }, /* @__PURE__ */ React.createElement(PlanColumn, { plan, isAnnual, showDemoBtn: i > 0 }))))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col", style: { width: 288, border: `1px solid ${BORDER_CLAY}` } }, /* @__PURE__ */ React.createElement("div", { className: "px-[24px] py-[10px]", style: { background: BG_OFF_WHITE, borderBottom: `1px solid ${BORDER_CLAY}` } }, /* @__PURE__ */ React.createElement("span", { className: "text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT } }, "Already have a helpdesk?")), /* @__PURE__ */ React.createElement(PlanColumn, { plan: standalonePlan, isAnnual, showDemoBtn: true }))), /* @__PURE__ */ React.createElement("div", { className: "mt-[40px] max-w-[600px] text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT } }, /* @__PURE__ */ React.createElement("p", { className: "m-0" }, "All plans include free, unlimited live chat, support email, in-app chats, banners, and tooltips. Pay-as-you-go for email campaigns, SMS, WhatsApp, and Phone. ", /* @__PURE__ */ React.createElement("a", { onClick: (e) => {
        e.preventDefault();
        ClainV2.navigate("/pricing/channels");
      }, href: "#", className: "underline", style: { color: COLOR_TEXT } }, "View channel pricing")))))), /* @__PURE__ */ React.createElement("div", { className: "relative w-full", style: { background: BG_OFF_WHITE } }, /* @__PURE__ */ React.createElement("div", { className: "max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative" }, /* @__PURE__ */ React.createElement(CornerDots, { color: "rgba(17,17,17,0.1)" }), /* @__PURE__ */ React.createElement("div", { className: "max-w-[1170px] mx-auto px-[16px]" }, /* @__PURE__ */ React.createElement("h2", { className: "m-0 text-[50px] leading-[54px] tracking-[-1.6px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 } }, "Add-ons"), /* @__PURE__ */ React.createElement("p", { className: "m-0 mt-[8px] text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT_60 } }, "Included in your free trial. Add or remove anytime."), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 gap-[24px] mt-[40px]" }, addons.map((addon) => /* @__PURE__ */ React.createElement("div", { key: addon.name, className: "relative p-[40px]", style: { background: BG_OFF_WHITE_2 } }, /* @__PURE__ */ React.createElement(CornerDots, { color: "rgba(17,17,17,0.15)" }), /* @__PURE__ */ React.createElement("h3", { className: "m-0 text-[19px] leading-[24px] tracking-[-0.2px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 } }, addon.name), /* @__PURE__ */ React.createElement("p", { className: "m-0 mt-[16px] text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT_60 } }, addon.desc), /* @__PURE__ */ React.createElement("div", { className: "mt-[16px] flex items-baseline gap-[4px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-[19px] leading-[19px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 } }, addon.price.split("/")[0]), /* @__PURE__ */ React.createElement("span", { className: "text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT_80 } }, "/", addon.price.split("/").slice(1).join("/"))), /* @__PURE__ */ React.createElement("p", { className: "m-0 mt-[8px] text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT_80 } }, addon.extra), /* @__PURE__ */ React.createElement("div", { className: "mt-[24px]" }, /* @__PURE__ */ React.createElement("button", { onClick: () => ClainV2.navigate("/demo"), className: "cursor-pointer border-0 rounded-[4px] h-[40px] px-[14px] text-[13px] leading-[20px]", style: { fontFamily: FONT, background: COLOR_TEXT, color: "white" } }, "Learn more")))))))), /* @__PURE__ */ React.createElement("div", { className: "relative w-full bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative" }, /* @__PURE__ */ React.createElement(CornerDots, { color: "rgba(17,17,17,0.1)" }), /* @__PURE__ */ React.createElement("div", { className: "max-w-[1170px] mx-auto px-[16px]" }, /* @__PURE__ */ React.createElement("h2", { className: "m-0 text-[50px] leading-[54px] tracking-[-1.6px] max-w-[700px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 } }, /* @__PURE__ */ React.createElement("span", { style: { color: COLOR_TEXT_60 } }, "Get an estimate "), "based on your needs"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-[24px] mt-[40px]" }, [
        { title: "Find the right plan for your team", desc: "Get an estimated cost for Clain\u2019s AI-first customer service platform \u2014 based on your team size, expected Clain outcomes, and more.", cta: "Estimate cost", link: "/pricing/estimate" },
        { title: "See the ROI impact Clain could have on your business", desc: "Estimate how much time and money Clain could save your team \u2014 based on your current and future support volume.", cta: "See ROI", link: "/pricing/roi" }
      ].map((card) => /* @__PURE__ */ React.createElement("div", { key: card.title, className: "relative p-[40px]", style: { background: BG_OFF_WHITE_2 } }, /* @__PURE__ */ React.createElement(CornerDots, { color: "rgba(17,17,17,0.15)" }), /* @__PURE__ */ React.createElement("h3", { className: "m-0 text-[28px] leading-[32px] tracking-[-0.6px] max-w-[280px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 500 } }, card.title), /* @__PURE__ */ React.createElement("p", { className: "m-0 mt-[16px] text-[13px] leading-[19.6px] max-w-[380px]", style: { fontFamily: FONT, color: COLOR_TEXT_60 } }, card.desc), /* @__PURE__ */ React.createElement("div", { className: "mt-[24px]" }, /* @__PURE__ */ React.createElement("button", { onClick: () => ClainV2.navigate(card.link), className: "cursor-pointer border-0 rounded-[4px] h-[40px] px-[14px] text-[13px] leading-[20px]", style: { fontFamily: FONT, background: COLOR_TEXT, color: "white" } }, card.cta)))))))), /* @__PURE__ */ React.createElement("div", { className: "relative w-full", style: { background: BG_OFF_WHITE } }, /* @__PURE__ */ React.createElement("div", { className: "max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative" }, /* @__PURE__ */ React.createElement(CornerDots, { color: "rgba(17,17,17,0.1)" }), /* @__PURE__ */ React.createElement("div", { className: "max-w-[1170px] mx-auto px-[16px] flex flex-col items-center text-center" }, /* @__PURE__ */ React.createElement("h2", { className: "m-0 text-[50px] leading-[54px] tracking-[-1.6px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 } }, "Startups get 90% off"), /* @__PURE__ */ React.createElement("div", { className: "relative mt-[40px] w-full max-w-[700px] p-[60px] flex flex-col items-center", style: { background: BG_OFF_WHITE_2 } }, /* @__PURE__ */ React.createElement(CornerDots, { color: "rgba(17,17,17,0.15)" }), /* @__PURE__ */ React.createElement("p", { className: "m-0 text-[13px] leading-[19.6px] text-center", style: { fontFamily: FONT, color: COLOR_TEXT } }, "Get a direct line to your customers with"), /* @__PURE__ */ React.createElement("p", { className: "m-0 text-[13px] leading-[19.6px] text-center", style: { fontFamily: FONT, color: COLOR_TEXT } }, "best-in-class support."), /* @__PURE__ */ React.createElement("button", { onClick: () => ClainV2.navigate("/startups"), className: "mt-[24px] cursor-pointer border-0 rounded-[4px] h-[40px] px-[14px] text-[13px] leading-[20px]", style: { fontFamily: FONT, background: COLOR_TEXT, color: "white" } }, "Apply now"))))), /* @__PURE__ */ React.createElement("div", { className: "relative w-full bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative" }, /* @__PURE__ */ React.createElement(CornerDots, { color: "rgba(17,17,17,0.1)" }), /* @__PURE__ */ React.createElement("div", { className: "max-w-[1170px] mx-auto px-[16px]" }, /* @__PURE__ */ React.createElement("h2", { className: "m-0 text-[50px] leading-[54px] tracking-[-1.6px] max-w-[800px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 } }, /* @__PURE__ */ React.createElement("span", null, "Thousands of businesses "), /* @__PURE__ */ React.createElement("span", { style: { color: COLOR_TEXT_60 } }, "have already seen transformational results")), /* @__PURE__ */ React.createElement("div", { className: "mt-[40px] flex", style: { borderBottom: `1px solid ${BORDER_CLAY}` } }, testimonials.map((t, i) => /* @__PURE__ */ React.createElement("button", { key: t.tab, onClick: () => setActiveTestimonial(i), className: "flex-1 cursor-pointer border-0 bg-transparent px-[24px] py-[12px] text-left text-[12px] uppercase tracking-[0.6px]", style: { fontFamily: FONT, color: COLOR_TEXT, background: i === activeTestimonial ? BG_OFF_WHITE : "transparent" } }, t.tab))), /* @__PURE__ */ React.createElement("div", { className: "relative p-[60px]", style: { background: BG_OFF_WHITE } }, /* @__PURE__ */ React.createElement(CornerDots, { color: ACCENT_BLUE }), /* @__PURE__ */ React.createElement("p", { className: "m-0 text-[28px] leading-[36px] tracking-[-0.4px]", style: { fontFamily: FONT, color: COLOR_TEXT_60, fontWeight: 500 } }, /* @__PURE__ */ React.createElement("span", { style: { color: COLOR_TEXT } }, testimonials[activeTestimonial].quote)), /* @__PURE__ */ React.createElement("div", { className: "mt-[60px]" }, /* @__PURE__ */ React.createElement("p", { className: "m-0 text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 600 } }, testimonials[activeTestimonial].author), /* @__PURE__ */ React.createElement("p", { className: "m-0 text-[13px] leading-[19.6px]", style: { fontFamily: FONT, color: COLOR_TEXT_60 } }, testimonials[activeTestimonial].role)))))), /* @__PURE__ */ React.createElement("div", { className: "relative w-full bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "max-w-[1440px] mx-auto px-[16px] pt-[80px] pb-[80px] relative" }, /* @__PURE__ */ React.createElement(CornerDots, { color: "rgba(17,17,17,0.1)" }), /* @__PURE__ */ React.createElement("div", { className: "max-w-[1170px] mx-auto px-[16px] grid grid-cols-[1fr_2fr] gap-[80px]" }, /* @__PURE__ */ React.createElement("h2", { className: "m-0 text-[50px] leading-[54px] tracking-[-1.6px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 } }, "FAQs"), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col" }, faqs.map((faq, i) => /* @__PURE__ */ React.createElement(FAQItem, { key: i, q: faq.q, a: faq.a, isOpen: openFaq === i, onToggle: () => setOpenFaq(openFaq === i ? null : i) })), /* @__PURE__ */ React.createElement("div", { style: { borderBottom: `1px solid ${BORDER_CLAY}` } }))))), /* @__PURE__ */ React.createElement("div", { className: "relative w-full", style: { background: BG_OFF_WHITE } }, /* @__PURE__ */ React.createElement("div", { className: "max-w-[1440px] mx-auto px-[16px] pt-[120px] pb-[120px] relative" }, /* @__PURE__ */ React.createElement(CornerDots, { color: "rgba(17,17,17,0.15)" }), /* @__PURE__ */ React.createElement("div", { className: "max-w-[1170px] mx-auto px-[16px] flex flex-col items-center text-center" }, /* @__PURE__ */ React.createElement("h2", { className: "m-0 text-[64px] leading-[68px] tracking-[-2px] max-w-[820px]", style: { fontFamily: FONT, color: COLOR_TEXT, fontWeight: 400 } }, "Perfect customer experiences, powered by Clain"), /* @__PURE__ */ React.createElement("div", { className: "mt-[32px] flex gap-[12px]" }, /* @__PURE__ */ React.createElement("button", { onClick: () => ClainV2.navigate("/signup"), className: "cursor-pointer border-0 rounded-[4px] h-[40px] px-[16px] text-[13px] leading-[20px]", style: { fontFamily: FONT, background: COLOR_TEXT, color: "white" } }, "Start free trial"), /* @__PURE__ */ React.createElement("button", { onClick: () => ClainV2.navigate("/demo"), className: "cursor-pointer rounded-[4px] h-[40px] px-[16px] text-[13px] leading-[20px] bg-white", style: { fontFamily: FONT, color: COLOR_TEXT, border: "1px solid " + COLOR_TEXT } }, "View demo"))))));
    }
    window.PricingPage = PricingPage;
  })();
})();
