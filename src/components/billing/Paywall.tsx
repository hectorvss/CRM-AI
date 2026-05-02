/**
 * src/components/billing/Paywall.tsx
 *
 * Forced-choice screen rendered when the workspace has no active subscription.
 * Visually identical to the landing pricing section — same Instrument Serif
 * headline, Inter body, cream background, grain texture, and cursor follower.
 *
 * Three exits:
 *   1. Start a 10-day free trial (no card required) — same access as a demo
 *   2. Pick a paid plan → Stripe Checkout
 *   3. Talk to sales (Business / custom)
 */

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../api/supabase';

// ── GravityGrid: canvas of dots that get pulled toward the cursor ────────────
// Direct port of public-landing/app.jsx GravityGrid → React TS.
function GravityGrid({ intensity = 70 }: { intensity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let dots: { ox: number; oy: number; x: number; y: number; vx: number; vy: number }[] = [];
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
    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; mouse.active = false; };

    let raf = 0;
    const loop = () => {
      ctx.clearRect(0, 0, w, h);
      const f = intensity / 100;
      const PULL = 0.22 * f;
      const RETURN = 0.06;
      const DAMP = 0.78;

      for (let k = 0; k < dots.length; k++) {
        const d = dots[k];
        const dx = mouse.x - d.x;
        const dy = mouse.y - d.y;
        const dist2 = dx * dx + dy * dy;
        if (mouse.active && dist2 < RADIUS * RADIUS) {
          const dist = Math.sqrt(dist2) || 1;
          const force = (1 - dist / RADIUS);
          d.vx += (dx / dist) * force * PULL * 6;
          d.vy += (dy / dist) * force * PULL * 6;
        }
        d.vx += (d.ox - d.x) * RETURN;
        d.vy += (d.oy - d.y) * RETURN;
        d.vx *= DAMP;
        d.vy *= DAMP;
        d.x += d.vx;
        d.y += d.vy;

        const ddx = d.x - d.ox;
        const ddy = d.y - d.oy;
        const disp = Math.sqrt(ddx * ddx + ddy * ddy);
        const t = Math.min(disp / 30, 1);
        const a = 0.08 + t * 0.35;
        const r = 0.9 + t * 1.6;

        ctx.fillStyle = `rgba(10,10,10,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = window.requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    raf = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [intensity]);

  return <canvas ref={canvasRef} className="pw-gravity-grid" aria-hidden />;
}

interface PaywallProps {
  reason: 'no_subscription' | 'trial_expired' | 'past_due_grace_ended' | 'canceled' | null;
  status: string;
  trialUsed: boolean;
  canActivateTrial: boolean;
  orgId: string | null;
  onAccessGranted: () => void;
  onSignOut: () => void;
}

interface Plan {
  id: 'starter' | 'growth' | 'scale';
  name: string;
  /** MSRP — always shown strikethrough. */
  original: number;
  /** Discounted monthly billing price. */
  monthly: number;
  /** Bigger discount when billed annually. */
  annual: number;
  meta: string;
  bullets: string[];
  cta: string;
  featured?: boolean;
  badge?: string;
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    original: 149, monthly: 49, annual: 42,
    meta: 'For small teams getting started with AI-assisted operations.',
    bullets: [
      '5,000 AI credits / month',
      '3 seats included (€25/extra seat)',
      'Core support + ops workflows',
      'Email + chat integrations',
      'Basic reporting & analytics',
    ],
    cta: 'Get Starter',
  },
  {
    id: 'growth',
    name: 'Growth',
    original: 399, monthly: 129, annual: 109,
    meta: 'For teams using AI every day across support and ops.',
    bullets: [
      '20,000 AI credits / month',
      '8 seats included (€22/extra seat)',
      'Advanced multi-step workflows',
      'Custom API integrations',
      'Priority email support',
    ],
    cta: 'Upgrade to Growth',
    featured: true,
    badge: 'Recommended',
  },
  {
    id: 'scale',
    name: 'Scale',
    original: 899, monthly: 299, annual: 254,
    meta: 'For high-volume teams with custom workflows.',
    bullets: [
      '60,000 AI credits / month',
      '20 seats included (€19/extra seat)',
      'Unlimited custom workflows',
      'Dedicated customer success manager',
      'Custom reporting dashboards',
    ],
    cta: 'Upgrade to Scale',
  },
];

const REASON_COPY: Record<string, { lead: string; em: string; sub: string }> = {
  no_subscription: {
    lead: 'Choose how to',
    em: 'get started.',
    sub: 'Try Clain free for 10 days — no card required. Or pick a plan and go.',
  },
  trial_expired: {
    lead: 'Your trial has',
    em: 'ended.',
    sub: 'Your data is preserved. Pick a plan to keep using Clain.',
  },
  past_due_grace_ended: {
    lead: 'Payment',
    em: 'failed.',
    sub: 'We could not process your last payment. Update your card to restore access.',
  },
  canceled: {
    lead: 'Subscription',
    em: 'canceled.',
    sub: 'Pick a plan to reactivate your workspace. Your data is safe.',
  },
};

// ── Inline CSS that mirrors the landing-page tokens / typography / cursor ────
const PAYWALL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif&display=swap');

  .pw-root {
    --bg: #FAFAF7;
    --bg-elev: #FFFFFF;
    --fg: #0A0A0A;
    --fg-muted: #6B6B6B;
    --fg-faint: #A3A3A0;
    --line: rgba(10,10,10,0.08);
    --line-strong: rgba(10,10,10,0.16);
    --accent: #0A0A0A;
    --serif: 'Instrument Serif', 'Times New Roman', serif;
    --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    --mono: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

    background: var(--bg);
    color: var(--fg);
    font-family: var(--sans);
    font-size: 16px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
    cursor: none;
    overflow-x: hidden;
    position: relative;
  }
  @media (max-width: 768px) { .pw-root { cursor: auto; } }
  .pw-root *, .pw-root button { cursor: inherit; }
  .pw-root button { font: inherit; background: none; border: 0; color: inherit; }

  /* Gravity grid — canvas of dots that respond to the mouse */
  .pw-gravity-grid {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 0;
  }

  /* Grain overlay — same SVG noise as landing */
  .pw-grain {
    position: fixed;
    inset: -50%;
    pointer-events: none;
    z-index: 1;
    opacity: 0.06;
    mix-blend-mode: multiply;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.7 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
    animation: pw-grainShift 8s steps(8) infinite;
    will-change: transform;
  }
  @keyframes pw-grainShift {
    0% { transform: translate(0,0); }
    20% { transform: translate(-5%,3%); }
    40% { transform: translate(-2%,5%); }
    60% { transform: translate(4%,1%); }
    80% { transform: translate(2%,-3%); }
    100% { transform: translate(0,0); }
  }

  /* Cursor follower */
  .pw-cursor-dot, .pw-cursor-ring {
    position: fixed;
    pointer-events: none;
    z-index: 10000;
    top: 0; left: 0;
    mix-blend-mode: difference;
    transform: translate3d(-100px, -100px, 0);
  }
  .pw-cursor-dot { width: 6px; height: 6px; background: #FFF; border-radius: 50%; margin: -3px 0 0 -3px; }
  .pw-cursor-ring {
    width: 36px; height: 36px; border: 1px solid rgba(255,255,255,0.6);
    border-radius: 50%; margin: -18px 0 0 -18px;
    transition: width .25s ease, height .25s ease, margin .25s ease, border-color .25s ease, background .25s ease;
  }
  .pw-cursor-ring.is-hover {
    width: 64px; height: 64px; margin: -32px 0 0 -32px;
    background: rgba(255,255,255,0.12);
    border-color: rgba(255,255,255,0.9);
  }
  @media (max-width: 768px) { .pw-cursor-dot, .pw-cursor-ring { display: none; } }

  /* Layout */
  .pw-wrap { max-width: 1180px; margin: 0 auto; padding: 72px 24px 96px; position: relative; z-index: 2; }

  /* Header */
  .pw-eyebrow {
    display: inline-block;
    padding: 6px 14px;
    background: var(--bg-elev);
    border: 1px solid var(--line);
    border-radius: 999px;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--fg-muted);
    margin-bottom: 20px;
  }
  .pw-headline {
    font-family: var(--serif);
    font-size: clamp(40px, 6vw, 64px);
    font-weight: 400;
    letter-spacing: -0.025em;
    line-height: 1.05;
    margin-bottom: 16px;
  }
  .pw-headline .em { font-style: italic; color: var(--fg-muted); }
  .pw-sub {
    font-size: 17px;
    color: var(--fg-muted);
    line-height: 1.6;
    max-width: 560px;
    margin: 0 auto 18px;
  }
  .pw-signout {
    background: none; border: none; cursor: none;
    font-size: 13px; color: var(--fg-faint);
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color .15s;
  }
  .pw-signout:hover { text-decoration-color: var(--fg-faint); }

  /* Trial banner */
  .pw-trial-banner {
    background: var(--bg-elev);
    border: 1.5px solid var(--fg);
    border-radius: 18px;
    padding: 28px 36px;
    margin: 48px 0 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
    position: relative;
    overflow: hidden;
  }
  .pw-trial-banner::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(600px 200px at 0% 0%, rgba(150, 100, 220, 0.06), transparent 60%);
    pointer-events: none;
  }
  .pw-trial-mark {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--fg-muted); margin-bottom: 8px;
  }
  .pw-trial-title {
    font-family: var(--serif); font-size: 28px; font-weight: 400;
    letter-spacing: -0.02em; line-height: 1.1; margin-bottom: 6px;
  }
  .pw-trial-meta { font-size: 14px; color: var(--fg-muted); }

  /* Buttons — match landing .btn exactly */
  .pw-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 999px;
    border: 1px solid transparent;
    white-space: nowrap;
    transition: transform .2s ease, background .2s ease, color .2s ease, border-color .2s ease;
    cursor: none;
  }
  .pw-btn-primary { background: var(--fg); color: var(--bg); }
  .pw-btn-primary:hover { transform: translateY(-1px); }
  .pw-btn-ghost { border-color: var(--line-strong); color: var(--fg); background: transparent; }
  .pw-btn-ghost:hover { background: var(--fg); color: var(--bg); border-color: var(--fg); }
  .pw-btn .pw-arrow { transition: transform .25s ease; display: inline-block; }
  .pw-btn:hover .pw-arrow { transform: translateX(3px); }
  .pw-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  /* Toggle */
  .pw-toggle-row {
    display: flex; align-items: center; justify-content: center;
    gap: 12px; margin: 32px 0 28px;
  }
  .pw-toggle-label { font-size: 14px; transition: opacity .15s; }
  .pw-toggle-btn {
    position: relative; width: 48px; height: 26px; border-radius: 999px;
    background: #d1d5db; border: 0; cursor: none; transition: background .2s; flex-shrink: 0;
  }
  .pw-toggle-btn[data-on="true"] { background: var(--fg); }
  .pw-toggle-btn span {
    position: absolute; top: 3px; left: 3px;
    width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: left .2s;
  }
  .pw-toggle-btn[data-on="true"] span { left: 25px; }
  .pw-save-pill {
    color: #16a34a; font-size: 10px; font-weight: 700;
    background: #dcfce7; padding: 3px 7px; border-radius: 4px;
    letter-spacing: 0.02em; margin-left: 4px;
  }

  /* Plan cards */
  .pw-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 18px;
  }
  @media (max-width: 960px) { .pw-grid { grid-template-columns: 1fr; } }
  .pw-card {
    position: relative;
    background: var(--bg-elev);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 28px;
    display: flex; flex-direction: column;
    transition: transform .2s ease, border-color .2s ease;
  }
  .pw-card:hover { transform: translateY(-4px); border-color: var(--line-strong); }
  .pw-card.featured {
    background: var(--fg);
    color: var(--bg);
    border-color: var(--fg);
  }
  .pw-card.featured .pw-card-meta,
  .pw-card.featured .pw-card-billed { color: rgba(255,255,255,0.6); }
  .pw-card.featured .pw-was { color: rgba(255,255,255,0.4); }
  .pw-card.featured .pw-card-li { border-color: rgba(255,255,255,0.12); }
  .pw-badge {
    position: absolute; top: -12px; left: 50%;
    transform: translateX(-50%);
    background: var(--bg-elev);
    color: var(--fg);
    border: 1px solid var(--fg);
    border-radius: 999px;
    padding: 4px 14px;
    font-family: var(--mono); font-size: 10px; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase;
    white-space: nowrap;
  }
  .pw-card.featured .pw-badge { background: var(--bg); color: var(--fg); border-color: var(--bg); }
  .pw-card-name {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em;
    text-transform: uppercase; margin-bottom: 16px;
  }
  .pw-card-amount {
    font-family: var(--serif);
    font-size: 48px;
    font-weight: 400;
    letter-spacing: -0.02em;
    line-height: 1;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
  }
  .pw-card-amount sup { font-size: 18px; opacity: 0.6; vertical-align: top; margin-right: 2px; }
  .pw-card-amount .per {
    font-family: var(--sans); font-size: 13px;
    color: var(--fg-muted); letter-spacing: 0; margin-left: 4px;
  }
  .pw-card.featured .pw-card-amount .per { color: rgba(255,255,255,0.6); }
  .pw-was {
    font-family: var(--serif); font-size: 22px;
    color: var(--fg-faint); text-decoration: line-through;
    text-decoration-thickness: 1.5px;
    margin-right: 4px;
    font-weight: 400;
  }
  .pw-card-billed {
    font-family: var(--mono); font-size: 10.5px;
    letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--fg-faint);
    margin-bottom: 14px;
  }
  .pw-card-meta { font-size: 13.5px; color: var(--fg-muted); margin-bottom: 18px; line-height: 1.5; }
  .pw-card-list { list-style: none; padding: 0; margin: 0 0 22px; display: grid; gap: 10px; }
  .pw-card-li {
    display: flex; align-items: flex-start; gap: 10px;
    font-size: 13px; padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .pw-card-li:first-child { padding-top: 0; border-top: 0; }
  .pw-card-li::before {
    content: '✓';
    color: var(--fg-muted);
    flex-shrink: 0;
  }
  .pw-card.featured .pw-card-li::before { color: rgba(255,255,255,0.7); }
  .pw-card .pw-btn { width: 100%; justify-content: center; margin-top: auto; }
  .pw-card.featured .pw-btn-ghost { background: transparent; color: var(--bg); border-color: rgba(255,255,255,0.4); }
  .pw-card.featured .pw-btn-ghost:hover { background: var(--bg); color: var(--fg); border-color: var(--bg); }

  /* Business row */
  .pw-business {
    background: var(--bg-elev);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 24px 32px;
    margin-top: 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
  }
  .pw-business-name {
    font-family: var(--mono); font-size: 11px;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--fg-faint); margin-bottom: 6px;
  }
  .pw-business-title { font-family: var(--serif); font-size: 22px; letter-spacing: -0.01em; line-height: 1.2; margin-bottom: 4px; }
  .pw-business-sub { font-size: 13px; color: var(--fg-muted); }

  /* Notices */
  .pw-error {
    margin-top: 24px; padding: 14px 20px;
    background: #FEF2F2; border: 1px solid #FECACA;
    border-radius: 12px; font-size: 13px; color: #B91C1C;
  }
  .pw-warn {
    margin-bottom: 32px; padding: 12px 20px;
    background: #FFFBEB; border: 1px solid #FDE68A;
    border-radius: 10px; font-size: 13px; color: #92400E;
  }
  .pw-foot {
    text-align: center; font-size: 12px;
    color: var(--fg-faint); margin-top: 48px; line-height: 1.7;
  }
  .pw-foot a { color: var(--fg-muted); text-decoration: underline; }
`;

export default function Paywall({
  reason, status, trialUsed, canActivateTrial, orgId, onAccessGranted, onSignOut,
}: PaywallProps) {
  const [interval, setInterval] = useState<'month' | 'year'>('year');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [trialLoading, setTrialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  // Cursor follower (same approach as landing app.jsx)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 768px)').matches) return;

    let mx = -100, my = -100;
    let rx = -100, ry = -100;
    let rafId = 0;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      }
      // Hover detection — anything tagged button / a / [data-hover]
      const target = e.target as HTMLElement | null;
      const interactive =
        target?.closest('button, a, [data-hover]') != null;
      ringRef.current?.classList.toggle('is-hover', !!interactive);
    };

    const tick = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove);
    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  const copy = REASON_COPY[reason ?? 'no_subscription'] ?? REASON_COPY.no_subscription;

  const authedFetch = async (path: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  };

  const handleActivateTrial = async () => {
    setError(null);
    setTrialLoading(true);
    try {
      const res = await authedFetch('/api/billing/activate-trial', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `Could not activate trial (HTTP ${res.status})`);
      }
      // Successful trial activation — bubble up so App.tsx re-fetches /access
      // and unmounts the paywall.
      onAccessGranted();
    } catch (e: any) {
      setError(e?.message || 'Could not start your trial. Try again or contact support.');
      setTrialLoading(false);
    }
  };

  const handlePickPlan = async (plan: Plan) => {
    if (!orgId) {
      setError('Workspace not loaded. Reload the page and try again.');
      return;
    }
    setError(null);
    setLoadingPlan(plan.id);
    try {
      const res = await authedFetch(`/api/billing/${orgId}/checkout-session`, {
        method: 'POST',
        body: JSON.stringify({ plan: plan.id, interval }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Checkout error (HTTP ${res.status})`);
      if (body?.url) window.location.href = body.url;
      else throw new Error('Checkout session URL missing');
    } catch (e: any) {
      setError(e?.message || 'Could not start checkout. Try again.');
      setLoadingPlan(null);
    }
  };

  const handleTalkToSales = () => {
    window.open('mailto:sales@clain.io?subject=Clain Business enquiry', '_blank');
  };

  return (
    <div className="pw-root">
      <style>{PAYWALL_CSS}</style>

      <GravityGrid intensity={70} />
      <div className="pw-grain" aria-hidden />
      <div ref={dotRef} className="pw-cursor-dot" aria-hidden />
      <div ref={ringRef} className="pw-cursor-ring" aria-hidden />

      <div className="pw-wrap">

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span className="pw-eyebrow">
            {status === 'trial_expired' ? 'Trial ended' : 'Welcome to Clain'}
          </span>
          <h1 className="pw-headline">
            {copy.lead} <span className="em">{copy.em}</span>
          </h1>
          <p className="pw-sub">{copy.sub}</p>
          <button className="pw-signout" onClick={onSignOut}>Sign out</button>
        </div>

        {/* Trial banner */}
        {canActivateTrial && (
          <div className="pw-trial-banner">
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="pw-trial-mark">Recommended · No card required</div>
              <div className="pw-trial-title">Start your <span style={{ fontStyle: 'italic' }}>10-day free trial</span></div>
              <div className="pw-trial-meta">Full access to Cases, Inbox, Copilot and Reporting — 1,000 AI credits included.</div>
            </div>
            <button
              onClick={handleActivateTrial}
              disabled={trialLoading}
              className="pw-btn pw-btn-primary"
              style={{ position: 'relative', zIndex: 1 }}
            >
              {trialLoading ? 'Starting trial…' : <>Start trial <span className="pw-arrow">→</span></>}
            </button>
          </div>
        )}

        {trialUsed && reason === 'trial_expired' && (
          <div className="pw-warn">
            Your 10-day trial has been used. Choose a plan below to continue — your data is preserved.
          </div>
        )}

        {/* Toggle */}
        <div className="pw-toggle-row">
          <span className="pw-toggle-label" style={{ fontWeight: interval === 'month' ? 600 : 400, opacity: interval === 'month' ? 1 : 0.5 }}>
            Monthly
          </span>
          <button
            className="pw-toggle-btn"
            data-on={interval === 'year'}
            onClick={() => setInterval(interval === 'month' ? 'year' : 'month')}
            aria-label="Toggle billing interval"
          >
            <span />
          </button>
          <span className="pw-toggle-label" style={{ fontWeight: interval === 'year' ? 600 : 400, opacity: interval === 'year' ? 1 : 0.5 }}>
            Annual <span className="pw-save-pill">15% OFF</span>
          </span>
        </div>

        {/* Plan grid */}
        <div className="pw-grid">
          {PLANS.map((plan) => {
            const isAnnual = interval === 'year';
            const price = isAnnual ? plan.annual : plan.monthly;
            const isLoading = loadingPlan === plan.id;
            return (
              <div key={plan.id} className={`pw-card ${plan.featured ? 'featured' : ''}`}>
                {plan.badge && <span className="pw-badge">{plan.badge}</span>}
                <div className="pw-card-name">{plan.name}</div>
                <div className="pw-card-amount">
                  <span className="pw-was">€{plan.original}</span>
                  <sup>€</sup>{price}
                  <span className="per">/ mo</span>
                </div>
                <div className="pw-card-billed">
                  {isAnnual ? `Billed annually · €${plan.annual * 12}/yr` : 'Billed monthly'}
                </div>
                <div className="pw-card-meta">{plan.meta}</div>
                <ul className="pw-card-list">
                  {plan.bullets.map((b, i) => (
                    <li key={i} className="pw-card-li">{b}</li>
                  ))}
                </ul>
                <button
                  onClick={() => handlePickPlan(plan)}
                  disabled={loadingPlan !== null}
                  className={`pw-btn ${plan.featured ? 'pw-btn-primary' : 'pw-btn-ghost'}`}
                >
                  {isLoading ? 'Loading…' : <>{plan.cta} <span className="pw-arrow">→</span></>}
                </button>
              </div>
            );
          })}
        </div>

        {/* Business row */}
        <div className="pw-business">
          <div>
            <div className="pw-business-name">Business</div>
            <div className="pw-business-title">Need custom volume, SSO or enterprise compliance?</div>
            <div className="pw-business-sub">Tailored credits, seat allocation, SLA guarantees and onboarding.</div>
          </div>
          <button onClick={handleTalkToSales} className="pw-btn pw-btn-ghost">
            Talk to sales <span className="pw-arrow">→</span>
          </button>
        </div>

        {error && <div className="pw-error">{error}</div>}

        <p className="pw-foot">
          All plans include the core platform. AI credits reset monthly. Top-up packs available on all plans.<br />
          Questions? <a href="mailto:support@clain.io">support@clain.io</a>
        </p>

      </div>
    </div>
  );
}
