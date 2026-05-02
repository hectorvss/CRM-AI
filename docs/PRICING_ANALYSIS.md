# AI Credit Pricing — Cost Analysis & Margin Options

**Last updated**: 2026-05-02
**Author**: Engineering + Product
**Status**: Decision pending

This document analyzes the unit economics of the AI credit system on Clain
and proposes three pricing options with explicit margin targets.

---

## 1. Reference: API costs (late 2026, USD per 1M tokens)

| Provider | Model | Input | Output | Notes |
|----------|-------|------:|-------:|-------|
| Google | Gemini 2.0 Flash | $0.10 | $0.40 | Default for cheap/fast tasks. |
| Google | Gemini 2.5 Pro | $1.25 | $10.00 | Reasoning, multi-step plans. |
| OpenAI | GPT-4o-mini | $0.15 | $0.60 | Cheapest "OpenAI" tier. |
| OpenAI | GPT-4o | $2.50 | $10.00 | Mainstream balanced tier. |
| Anthropic | Claude Haiku 4.5 | $0.80 | $4.00 | Fast, used for guardrails. |
| Anthropic | Claude Sonnet 4.5 | $3.00 | $15.00 | High-quality reasoning. |
| Anthropic | Claude Opus 4 | $15.00 | $75.00 | Heavy reasoning, expensive. |

**Blended assumption**: in production we run a router that prefers Flash for
ingest + classification (~70%), Sonnet/GPT-4o for generation (~25%), Pro for
investigation/multi-step (~5%). Average effective cost ≈ **$1.20 / 1M tokens**.

---

## 2. Average task profile in this SaaS

Token usage per typical agent action (measured on the Plan Engine's audit log):

| Task | Avg input | Avg output | Effective cost |
|------|----------:|-----------:|---------------:|
| Simple draft (Copilot) | 3,000 | 500 | ~$0.0035 |
| Investigation (multi-step) | 15,000 | 2,000 | ~$0.020 |
| Plan generation | 8,000 | 3,000 | ~$0.013 |
| Bulk operation (per item) | 5,000 | 1,000 | ~$0.007 |
| AI diagnose / RCA | 12,000 | 1,500 | ~$0.016 |
| Daily report summary | 20,000 | 1,000 | ~$0.024 |

**Mean cost per AI action ≈ $0.014** (about €0.013 at 0.92 EUR/USD).

A heavy power user runs 200-300 actions/month → ~€3-5 in raw API cost.
A standard team runs 1,500-2,000 actions/month → ~€20-30 in raw API cost.

---

## 3. Current pricing (as on the landing page)

| Plan | Monthly (annual) | Credits/month | Implied tokens (@1c=1k) | Cost @ Flash | Cost @ Pro | Margin range |
|------|-----------------:|--------------:|------------------------:|-------------:|-----------:|-------------:|
| Starter | €42 (€504/yr) | 5,000 | 5M | $1.60 | $12.50 | 87% – 99% |
| Growth | €109 (€1,308/yr) | 20,000 | 20M | $6.40 | $50.00 | 87% – 98% |
| Scale | €254 (€3,048/yr) | 60,000 | 60M | $19.20 | $150.00 | 88% – 95% |

Top-up packs:
- 5,000 credits = €79 → cost worst case $12.50 → margin 84%
- 20,000 credits = €249 → cost worst case $50 → margin 80%
- 50,000 credits = €549 → cost worst case $125 → margin 77%

Flexible (post-paid): €19 / 1,000 credits → margin 75% even on heavy models.

### Problem detected

**The 1-credit-per-1k-tokens conversion is uniform across models.**
A user can run 100% on Flash (~$0.0001/credit cost) or 100% on Pro
(~$0.005/credit cost) — same credit consumed. We arbitrage **against ourselves**:
heavy users on expensive models get a sub-90% margin while light users on
Flash get 99%+. We should normalize.

---

## 4. Three pricing options

### Option A — **Conservative (current model, fix the credit cost ratio)**

Keep the plan price points and credit allowances. Introduce
**model-tier multipliers** so credits scale with cost-of-goods.

| Tier | Models | Credit cost per 1k tokens |
|------|--------|--------------------------:|
| **Fast** | Gemini Flash, Haiku, GPT-4o-mini | 1× (1 credit) |
| **Balanced** | Sonnet, GPT-4o, Gemini Pro | 5× (5 credits) |
| **Heavy** | Opus, GPT-4 Turbo | 10× (10 credits) |

Implications:
- Worst-case margin floor rises from **75% to 92%**.
- Power users on cheap models still get great value (no change).
- Heavy users now pay proportionally — the AI router can prefer Fast tier
  by default and fall back to Balanced only when needed.

**Pros**: minimal change to user-facing pricing; low surface area; large
margin uplift. **Cons**: we have to communicate model tiers; some users will
ask why a "thinking" task costs 10× more than a draft.

> **Recommended.** This is the lowest-risk change with the biggest impact.

---

### Option B — **Aggressive (entry tier + tighter margins on Scale)**

Add a **Lite plan at €19/month** (1,500 credits, 1 seat) as a no-friction
upgrade from the trial. Bump Scale slightly. Apply Option A's tier
multipliers on top.

| Plan | Monthly (annual) | Credits/month | Seats | Worst-case cost (Pro) | Margin |
|------|-----------------:|--------------:|------:|----------------------:|-------:|
| **Lite** (NEW) | €19 (€15/mo annual) | 1,500 | 1 | €1.40 | 92% |
| Starter | €42 (€504/yr) | 5,000 | 3 | €4.60 | 89% |
| Growth | €109 (€1,308/yr) | 20,000 | 8 | €18 | 83% |
| **Scale** (BUMPED) | €299 (€3,588/yr) | 75,000 | 20 | €69 | 77% |
| Business | Custom | Custom | Custom | — | — |

Lite plan unlocks the lowest funnel step — useful for solo founders /
freelancers / agencies who can't justify €42 but want more than the trial.

**Pros**: better conversion from trial; bigger ARPU on Scale; richer mix of
plans. **Cons**: more complexity; risk of Lite cannibalizing Starter for
small teams; bumping Scale might lose deals to competitors.

---

### Option C — **Action-priced (no plan tiers, pay per action)**

Drop the credit abstraction. Charge **per AI action** with a simple table:

| Action | Price |
|--------|------:|
| Draft / reply suggestion | €0.05 |
| Investigation / RCA | €0.20 |
| Multi-step plan execution | €0.30 |
| Bulk operation (per item) | €0.10 |
| Daily summary | €0.50 |

Plus a **platform fee**: €19/month/seat (covers infra, storage, integrations).

Margins are baked in:
- Draft: cost ≤ €0.013, price €0.05 → **74% margin**
- Investigation: cost ≤ €0.022, price €0.20 → **89% margin**
- Plan: cost ≤ €0.014, price €0.30 → **95% margin**

**Pros**: simplest mental model for the buyer ("I know what each thing
costs"); aligns price with value perceived; no credit-counting anxiety.
**Cons**: variable monthly cost spooks finance teams; harder to forecast
revenue; competitive landscape (Intercom, Gorgias) is plan-based — we'd
look weird.

> Useful as a **secondary product** ("Pay-as-you-go") for very small teams,
> not as the primary offer.

---

## 5. Recommendation

**Ship Option A in v1, layer Option B over the next 2 quarters.**

Concrete steps:

1. **Now**: implement model-tier multipliers in `tokensToCredits()` in
   `server/services/aiUsageMeter.ts`. No user-facing change yet — but the
   margin floor lifts immediately.
2. **Next sprint**: add the Lite plan to the Stripe product catalog and to
   the landing page. Roll out alongside the new paywall.
3. **Q3**: evaluate whether to bump Scale or keep at €254. Decision based
   on Scale → Business conversion rate and competitive positioning.
4. **Q4** (optional): pilot Option C as "Pay-as-you-go" for prospects who
   bounce off the plan grid.

---

## 6. Trial economics

The 10-day trial includes **1,000 credits**. Worst case (all Pro/Sonnet at
5× tier multiplier under Option A): 200,000 tokens of Pro → cost ≈ €1.50.

**Acquisition cost cap of €1.50 per signup** is acceptable as long as
trial-to-paid conversion exceeds **3.5%** (assuming median plan = Starter
at €42/mo and 12-month average tenure → CAC payback in 1 month).

If conversion is lower, tighten trial credits to 500 (cost cap €0.75) but
keep the 10-day window — the time-pressure is what drives conversion, not
the credit ceiling.

---

## 7. Open questions for product

- Do we surface the credit-tier model on the pricing page, or just in
  workspace usage analytics? (Argument for surfacing: transparency. Against:
  cognitive load.)
- Should the **Copilot draft** action default to Fast tier and let the user
  upgrade per-message? (Yes — UX win.)
- Top-up pack pricing: should we keep the 5k/20k/50k packs at the current
  prices, or rebalance after the multiplier change?
