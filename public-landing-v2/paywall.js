(() => {
  (function() {
    const { useState } = React;
    const { PageShell, navigate } = ClainV2;
    const PLANS = [
      {
        id: "starter",
        name: "Starter",
        original: 149,
        monthly: 49,
        annual: 42,
        meta: "For small teams getting started with AI-assisted support.",
        bullets: [
          "5,000 AI credits / month",
          "3 seats included (\u20AC25 / extra seat)",
          "Core support workflows",
          "Email + chat integrations",
          "Basic reporting & analytics"
        ],
        cta: "Get Starter"
      },
      {
        id: "growth",
        name: "Growth",
        original: 399,
        monthly: 129,
        annual: 109,
        meta: "For teams using AI every day across support and ops.",
        bullets: [
          "20,000 AI credits / month",
          "8 seats included (\u20AC22 / extra seat)",
          "Advanced multi-step workflows",
          "Custom API integrations",
          "Priority email support"
        ],
        cta: "Upgrade to Growth",
        featured: true,
        badge: "Recommended"
      },
      {
        id: "scale",
        name: "Scale",
        original: 899,
        monthly: 299,
        annual: 254,
        meta: "For high-volume teams with custom workflows.",
        bullets: [
          "60,000 AI credits / month",
          "20 seats included (\u20AC19 / extra seat)",
          "Unlimited custom workflows",
          "Dedicated customer success manager",
          "Custom reporting dashboards"
        ],
        cta: "Upgrade to Scale"
      }
    ];
    function PlanCard({ plan, interval }) {
      const price = interval === "year" ? plan.annual : plan.monthly;
      function onPick() {
        navigate(`/signup?plan=${plan.id}&interval=${interval}`);
      }
      return /* @__PURE__ */ React.createElement("div", { className: `pw-card ${plan.featured ? "featured" : ""}` }, plan.badge && /* @__PURE__ */ React.createElement("span", { className: "pw-badge" }, plan.badge), /* @__PURE__ */ React.createElement("div", { className: "pw-card-name" }, plan.name), /* @__PURE__ */ React.createElement("div", { className: "pw-card-amount" }, /* @__PURE__ */ React.createElement("span", { className: "pw-was" }, "\u20AC", plan.original), /* @__PURE__ */ React.createElement("sup", null, "\u20AC"), price, /* @__PURE__ */ React.createElement("span", { className: "per" }, "/ mo")), /* @__PURE__ */ React.createElement("div", { className: "pw-card-billed" }, interval === "year" ? `Billed annually \xB7 \u20AC${plan.annual * 12}/yr` : "Billed monthly"), /* @__PURE__ */ React.createElement("div", { className: "pw-card-meta" }, plan.meta), /* @__PURE__ */ React.createElement("ul", { className: "pw-card-list" }, plan.bullets.map((b, i) => /* @__PURE__ */ React.createElement("li", { key: i, className: "pw-card-li" }, b))), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          onClick: onPick,
          className: `pw-btn ${plan.featured ? "pw-btn-primary" : "pw-btn-ghost"}`
        },
        plan.cta,
        " ",
        /* @__PURE__ */ React.createElement("span", { className: "pw-arrow" }, "\u2192")
      ));
    }
    function PaywallPage() {
      const [interval, setInterval] = useState("year");
      return /* @__PURE__ */ React.createElement(PageShell, { navVariant: "light" }, /* @__PURE__ */ React.createElement("main", { style: { background: "var(--cream, #FAFAF7)", minHeight: "100vh" } }, /* @__PURE__ */ React.createElement("div", { className: "pw-wrap" }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("span", { className: "pw-eyebrow" }, "Plans & Pricing"), /* @__PURE__ */ React.createElement("h1", { className: "pw-headline" }, "Choose how to ", /* @__PURE__ */ React.createElement("span", { className: "em" }, "get started.")), /* @__PURE__ */ React.createElement("p", { className: "pw-sub" }, "Try Clain free for 14 days \u2014 no card required. Or pick a plan and go live today.")), /* @__PURE__ */ React.createElement("div", { className: "pw-trial-banner" }, /* @__PURE__ */ React.createElement("div", { style: { position: "relative", zIndex: 1 } }, /* @__PURE__ */ React.createElement("div", { className: "pw-trial-mark" }, "Recommended \xB7 No card required"), /* @__PURE__ */ React.createElement("div", { className: "pw-trial-title" }, "Start your ", /* @__PURE__ */ React.createElement("span", { style: { fontStyle: "italic" } }, "14-day free trial")), /* @__PURE__ */ React.createElement("div", { className: "pw-trial-meta" }, "Full access to Inbox, Copilot, Reporting and integrations \u2014 1,000 AI credits, real countdown.")), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "pw-btn pw-btn-primary",
          style: { position: "relative", zIndex: 1 },
          onClick: () => navigate("/signup")
        },
        "Start free trial ",
        /* @__PURE__ */ React.createElement("span", { className: "pw-arrow" }, "\u2192")
      )), /* @__PURE__ */ React.createElement("div", { className: "pw-toggle-row" }, /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "pw-toggle-label",
          style: { fontWeight: interval === "month" ? 600 : 400, opacity: interval === "month" ? 1 : 0.5 }
        },
        "Monthly"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "pw-toggle-btn",
          "data-on": String(interval === "year"),
          onClick: () => setInterval(interval === "month" ? "year" : "month"),
          "aria-label": "Toggle billing interval"
        },
        /* @__PURE__ */ React.createElement("span", null)
      ), /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "pw-toggle-label",
          style: { fontWeight: interval === "year" ? 600 : 400, opacity: interval === "year" ? 1 : 0.5 }
        },
        "Annual ",
        /* @__PURE__ */ React.createElement("span", { className: "pw-save-pill" }, "20% OFF")
      )), /* @__PURE__ */ React.createElement("div", { className: "pw-grid" }, PLANS.map((p) => /* @__PURE__ */ React.createElement(PlanCard, { key: p.id, plan: p, interval }))), /* @__PURE__ */ React.createElement("div", { className: "pw-business" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "pw-business-name" }, "Business"), /* @__PURE__ */ React.createElement("div", { className: "pw-business-title" }, "Need custom volume, SSO or enterprise compliance?"), /* @__PURE__ */ React.createElement("div", { className: "pw-business-sub" }, "Tailored credits, seat allocation, SLA guarantees and onboarding.")), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "pw-btn pw-btn-ghost",
          onClick: () => navigate("/demo")
        },
        "Talk to sales ",
        /* @__PURE__ */ React.createElement("span", { className: "pw-arrow" }, "\u2192")
      )), /* @__PURE__ */ React.createElement("div", { className: "pw-need-setup" }, /* @__PURE__ */ React.createElement("span", null, "Need help with onboarding, migration or technical setup?"), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          onClick: () => navigate("/demo"),
          style: { background: "none", border: "none", color: "var(--fg, #0A0A0A)", fontWeight: 500, textDecoration: "underline", cursor: "pointer", fontSize: 13 }
        },
        "Book a setup call \u2192"
      )), /* @__PURE__ */ React.createElement("p", { className: "pw-foot" }, "All plans include the core platform. AI credits reset monthly. Top-up packs available on all plans.", /* @__PURE__ */ React.createElement("br", null), "Questions? ", /* @__PURE__ */ React.createElement("a", { href: "mailto:support@clain.io" }, "support@clain.io")))));
    }
    window.PaywallPage = PaywallPage;
  })();
})();
