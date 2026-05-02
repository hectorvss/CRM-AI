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

  /* ── Trial signup form ────────────────────────────────────────────── */
  .pw-form-shell {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 56px;
    margin-top: 32px;
    align-items: start;
  }
  @media (max-width: 960px) { .pw-form-shell { grid-template-columns: 1fr; gap: 32px; } }

  .pw-form-info { display: grid; gap: 32px; }
  .pw-form-info-head { display: grid; gap: 14px; }
  .pw-form-info-head h2 {
    font-family: var(--serif);
    font-size: clamp(34px, 4.5vw, 48px);
    font-weight: 400;
    letter-spacing: -0.025em;
    line-height: 1.1;
  }
  .pw-form-info-head h2 .em { font-style: italic; color: var(--fg-muted); }
  .pw-form-info-head p { font-size: 15.5px; color: var(--fg-muted); line-height: 1.6; }

  .pw-form-bullets { display: grid; gap: 18px; }
  .pw-form-bullet { display: flex; gap: 12px; align-items: flex-start; }
  .pw-form-bullet-mark {
    flex-shrink: 0; width: 22px; height: 22px;
    border-radius: 50%; background: #16a34a; color: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    margin-top: 2px;
  }
  .pw-form-bullet h5 { font-family: var(--sans); font-size: 14.5px; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 4px; }
  .pw-form-bullet p { font-size: 13.5px; color: var(--fg-muted); line-height: 1.55; }

  .pw-form-card {
    background: var(--bg-elev);
    border: 1px solid var(--line);
    border-radius: 18px;
    padding: 32px;
    display: grid;
    gap: 22px;
  }
  .pw-form-card-head h2 { font-family: var(--serif); font-size: 26px; font-weight: 400; letter-spacing: -0.02em; margin-bottom: 6px; }
  .pw-form-card-head p { font-size: 13px; color: var(--fg-muted); }

  .pw-form-section {
    display: grid; gap: 14px;
    padding-top: 18px;
    border-top: 1px solid var(--line);
  }
  .pw-form-section:first-of-type { border-top: 0; padding-top: 0; }
  .pw-form-section-title {
    font-family: var(--mono); font-size: 10px; font-weight: 600;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--fg-faint);
    display: flex; align-items: center; gap: 8px;
  }
  .pw-form-section-title::before {
    content: ''; width: 14px; height: 1px;
    background: var(--line-strong);
  }

  .pw-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 600px) { .pw-form-row { grid-template-columns: 1fr; } }

  .pw-form-field { display: grid; gap: 6px; }
  .pw-form-field label {
    font-family: var(--mono); font-size: 10px;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--fg-muted);
  }
  .pw-form-field-hint {
    font-size: 11px; color: var(--fg-faint);
    margin-top: 2px; font-style: italic;
  }
  .pw-form-field input,
  .pw-form-field textarea {
    font-family: var(--sans); font-size: 14px;
    padding: 11px 14px;
    background: var(--bg-elev);
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    color: var(--fg);
    cursor: text;
    transition: border-color .15s;
    resize: vertical;
  }
  .pw-form-field input:focus, .pw-form-field textarea:focus {
    outline: none;
    border-color: var(--fg);
  }
  .pw-form-field input[readonly] {
    background: var(--bg);
    color: var(--fg-muted);
    cursor: not-allowed;
  }
  .pw-form-field textarea { min-height: 84px; }

  /* Pill rows (volume, team-size, timeline, source) */
  .pw-pill-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .pw-pill {
    flex: 0 1 auto;
    padding: 9px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--bg-elev);
    font-size: 13px;
    color: var(--fg);
    cursor: none;
    transition: all .15s;
    white-space: nowrap;
  }
  .pw-pill:hover { border-color: var(--fg); }
  .pw-pill.active {
    background: var(--fg); color: var(--bg); border-color: var(--fg);
  }
  .pw-pill.active::before {
    content: '✓ ';
    margin-right: 2px;
    font-weight: 700;
  }

  .pw-submit-cta {
    display: grid; gap: 8px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
    margin-top: 4px;
  }
  .pw-submit-cta .pw-btn-primary {
    width: 100%;
    justify-content: center;
    padding: 16px 22px;
    font-size: 16px;
    font-weight: 600;
    border-radius: 12px;
    box-shadow: 0 4px 18px rgba(10,10,10,0.12);
  }
  .pw-submit-cta .pw-btn-primary:hover { box-shadow: 0 6px 22px rgba(10,10,10,0.18); }
  .pw-submit-cta .pw-btn-primary:disabled { box-shadow: none; }
  .pw-submit-tag {
    text-align: center;
    font-family: var(--mono); font-size: 10px;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--fg-faint);
  }

  .pw-form-consent {
    font-size: 11px; color: var(--fg-faint); line-height: 1.6;
    text-align: center;
  }
  .pw-form-consent a { color: var(--fg-muted); text-decoration: underline; }

  .pw-form-back {
    background: none; border: none;
    font-size: 13px; color: var(--fg-faint);
    text-decoration: underline; cursor: none;
    margin-top: 4px;
    text-align: center;
  }
  .pw-form-back:hover { color: var(--fg); }

  .pw-need-setup {
    margin-top: 18px;
    padding: 14px 18px;
    background: var(--bg);
    border: 1px dashed var(--line-strong);
    border-radius: 10px;
    font-size: 13px;
    color: var(--fg-muted);
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
  }
  .pw-need-setup a {
    color: var(--fg); text-decoration: underline;
    font-weight: 500;
  }
`;

export default function Paywall({
  reason, status, trialUsed, canActivateTrial, orgId, onAccessGranted, onSignOut,
}: PaywallProps) {
  const [view, setView] = useState<'grid' | 'trial-form'>('grid');
  const [interval, setInterval] = useState<'month' | 'year'>('year');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [trialLoading, setTrialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Trial signup form state
  const [trialForm, setTrialForm] = useState({
    name: '',
    email: '',
    company: '',
    role: '',
    teamSize: '',           // pill: solo / 2-5 / 6-15 / 16-50 / 50+
    volume: '',             // pill: <1k / 1-5k / 5-20k / 20k+
    timeline: '',           // pill: just-exploring / evaluating / ready
    source: '',             // pill: how did you hear (twitter / google / ph / friend / blog / other)
    useCases: [] as string[], // multi-select pills
    favouriteTools: '',
    note: '',
  });
  const setTF = (k: keyof typeof trialForm, v: any) =>
    setTrialForm((f) => ({ ...f, [k]: v }));
  const toggleUseCase = (uc: string) =>
    setTrialForm((f) => ({
      ...f,
      useCases: f.useCases.includes(uc)
        ? f.useCases.filter((x) => x !== uc)
        : [...f.useCases, uc],
    }));

  // Auto-populate name + email from the existing Supabase session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        const user = data?.user;
        if (!user) return;
        const meta = (user.user_metadata ?? {}) as Record<string, any>;
        const name =
          meta.full_name || meta.name ||
          [meta.first_name, meta.last_name].filter(Boolean).join(' ') ||
          (user.email ? user.email.split('@')[0] : '');
        setTrialForm((f) => ({
          ...f,
          name: f.name || String(name || ''),
          email: f.email || String(user.email || ''),
          company: f.company || String(meta.company || meta.organization || ''),
        }));
      } catch {
        // silent — user can fill in manually
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  /** Submit the trial signup form → activate trial + log metadata. */
  const handleSubmitTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!trialForm.name.trim() || !trialForm.email.trim()) {
      setError('Name and work email are required.');
      return;
    }
    setTrialLoading(true);
    try {
      // Pack the rich research metadata into the existing `note` field so the
      // backend doesn't need a schema change. The trial-signup row in
      // demo_leads is searchable on `source = 'in_app_trial_signup'`.
      const noteParts: string[] = [];
      if (trialForm.teamSize)              noteParts.push(`Team size: ${trialForm.teamSize}`);
      if (trialForm.timeline)              noteParts.push(`Timeline: ${trialForm.timeline}`);
      if (trialForm.source)                noteParts.push(`Source: ${trialForm.source}`);
      if (trialForm.useCases.length)       noteParts.push(`Use cases: ${trialForm.useCases.join(', ')}`);
      if (trialForm.favouriteTools.trim()) noteParts.push(`Loves about other tools: ${trialForm.favouriteTools.trim()}`);
      if (trialForm.note.trim())           noteParts.push(`Notes: ${trialForm.note.trim()}`);

      const res = await authedFetch('/api/billing/activate-trial', {
        method: 'POST',
        body: JSON.stringify({
          name: trialForm.name.trim(),
          email: trialForm.email.trim(),
          company: trialForm.company.trim(),
          role: trialForm.role.trim(),
          volume: trialForm.volume || '',
          stack: '', // no longer collected, kept for backend compat
          note: noteParts.join(' · '),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `Could not activate trial (HTTP ${res.status})`);
      }
      onAccessGranted();
    } catch (e: any) {
      setError(e?.message || 'Could not start your trial. Try again or contact support.');
      setTrialLoading(false);
    }
  };

  /** Open the trial signup form. */
  const handleOpenTrialForm = () => {
    setError(null);
    setView('trial-form');
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

        {/* Header — adapts based on view */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span className="pw-eyebrow">
            {view === 'trial-form' ? 'Request trial'
              : status === 'trial_expired' ? 'Trial ended'
              : 'Welcome to Clain'}
          </span>
          {view === 'grid' ? (
            <>
              <h1 className="pw-headline">
                {copy.lead} <span className="em">{copy.em}</span>
              </h1>
              <p className="pw-sub">{copy.sub}</p>
            </>
          ) : (
            <>
              <h1 className="pw-headline">
                Tell us just <span className="em">enough.</span>
              </h1>
              <p className="pw-sub">7 fields. A human reads it. We'll provision your trial in seconds.</p>
            </>
          )}
          <button className="pw-signout" onClick={onSignOut}>Sign out</button>
        </div>

        {/* ── Plans grid view ────────────────────────────────────────── */}
        {view === 'grid' && (
          <>
            {/* Trial banner */}
            {canActivateTrial && (
              <div className="pw-trial-banner">
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div className="pw-trial-mark">Recommended · No card required</div>
                  <div className="pw-trial-title">Start your <span style={{ fontStyle: 'italic' }}>10-day free trial</span></div>
                  <div className="pw-trial-meta">Full access to Cases, Inbox, Copilot and Reporting — 1,000 AI credits, real countdown.</div>
                </div>
                <button
                  onClick={handleOpenTrialForm}
                  className="pw-btn pw-btn-primary"
                  style={{ position: 'relative', zIndex: 1 }}
                >
                  Start trial <span className="pw-arrow">→</span>
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

            {/* Need set up? — links to demo (sales-led setup) */}
            <div className="pw-need-setup">
              <span>Need help with onboarding, migration or setup?</span>
              <a href="/#/demo" target="_blank" rel="noopener noreferrer">
                Book a setup call →
              </a>
            </div>
          </>
        )}

        {/* ── Trial signup form view ──────────────────────────────────── */}
        {view === 'trial-form' && (
          <div className="pw-form-shell">
            {/* Left: marketing info */}
            <section className="pw-form-info">
              <div className="pw-form-info-head">
                <h2>
                  10 days, full access. <span className="em">No card required.</span>
                </h2>
                <p>
                  We'll provision your trial workspace right after you submit. Real countdown,
                  real credit limits — exactly what your team will use day-to-day.
                </p>
              </div>
              <div className="pw-form-bullets">
                <div className="pw-form-bullet">
                  <span className="pw-form-bullet-mark" aria-hidden>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                  </span>
                  <div>
                    <h5>Full product access</h5>
                    <p>Cases, Inbox, Copilot, Reporting, integrations — the entire platform.</p>
                  </div>
                </div>
                <div className="pw-form-bullet">
                  <span className="pw-form-bullet-mark" aria-hidden>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                  </span>
                  <div>
                    <h5>1,000 AI credits, real limits</h5>
                    <p>Enough to run the agent on real workloads. Same metering as paid plans.</p>
                  </div>
                </div>
                <div className="pw-form-bullet">
                  <span className="pw-form-bullet-mark" aria-hidden>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                  </span>
                  <div>
                    <h5>10-day countdown</h5>
                    <p>No surprise charges. At day 10, pick a plan or extend with a top-up.</p>
                  </div>
                </div>
              </div>
              <div className="pw-need-setup">
                <span>Want a guided setup with our team instead?</span>
                <a href="/#/demo" target="_blank" rel="noopener noreferrer">
                  Need set up? →
                </a>
              </div>
            </section>

            {/* Right: form */}
            <section>
              <form className="pw-form-card" onSubmit={handleSubmitTrial}>
                <div className="pw-form-card-head">
                  <h2>Start your trial</h2>
                  <p>Most fields are optional. The more you tell us, the more we can tailor onboarding.</p>
                </div>

                {/* ── Section 1: About you ─────────────────────────── */}
                <div className="pw-form-section">
                  <div className="pw-form-section-title">About you</div>
                  <div className="pw-form-row">
                    <div className="pw-form-field">
                      <label htmlFor="pw-name">Full name</label>
                      <input id="pw-name" required value={trialForm.name} onChange={(e) => setTF('name', e.target.value)} />
                    </div>
                    <div className="pw-form-field">
                      <label htmlFor="pw-email">Work email</label>
                      <input
                        id="pw-email"
                        type="email"
                        value={trialForm.email}
                        readOnly
                        title="Linked to your Clain account"
                      />
                      <span className="pw-form-field-hint">From your account — locked.</span>
                    </div>
                  </div>
                  <div className="pw-form-row">
                    <div className="pw-form-field">
                      <label htmlFor="pw-company">Company</label>
                      <input id="pw-company" value={trialForm.company} onChange={(e) => setTF('company', e.target.value)} placeholder="Acme Inc." />
                    </div>
                    <div className="pw-form-field">
                      <label htmlFor="pw-role">Your role <span style={{textTransform:'none', letterSpacing: 0, color:'var(--fg-faint)'}}>(optional)</span></label>
                      <input id="pw-role" value={trialForm.role} onChange={(e) => setTF('role', e.target.value)} placeholder="CX Lead, Founder, Ops Manager…" />
                    </div>
                  </div>
                </div>

                {/* ── Section 2: About your team ───────────────────── */}
                <div className="pw-form-section">
                  <div className="pw-form-section-title">About your team</div>
                  <div className="pw-form-field">
                    <label>Team size</label>
                    <div className="pw-pill-row">
                      {['Solo', '2-5', '6-15', '16-50', '50+'].map((v) => (
                        <button
                          key={v} type="button"
                          className={`pw-pill ${trialForm.teamSize === v ? 'active' : ''}`}
                          onClick={() => setTF('teamSize', trialForm.teamSize === v ? '' : v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pw-form-field">
                    <label>Monthly ticket volume</label>
                    <div className="pw-pill-row">
                      {['<1k', '1-5k', '5-20k', '20k+'].map((v) => (
                        <button
                          key={v} type="button"
                          className={`pw-pill ${trialForm.volume === v ? 'active' : ''}`}
                          onClick={() => setTF('volume', trialForm.volume === v ? '' : v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Section 3: What you want to do ───────────────── */}
                <div className="pw-form-section">
                  <div className="pw-form-section-title">What you want to do</div>
                  <div className="pw-form-field">
                    <label>Top use cases <span style={{textTransform:'none', letterSpacing: 0, color:'var(--fg-faint)'}}>· pick any</span></label>
                    <div className="pw-pill-row">
                      {[
                        'Customer support',
                        'Refunds & ops',
                        'Fraud & risk',
                        'AI agents / Copilot',
                        'Workflow automation',
                        'Custom integrations',
                      ].map((uc) => (
                        <button
                          key={uc} type="button"
                          className={`pw-pill ${trialForm.useCases.includes(uc) ? 'active' : ''}`}
                          onClick={() => toggleUseCase(uc)}
                        >
                          {uc}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pw-form-field">
                    <label>Where are you in the process?</label>
                    <div className="pw-pill-row">
                      {[
                        'Just exploring',
                        'Evaluating in 30 days',
                        'Ready to switch now',
                      ].map((v) => (
                        <button
                          key={v} type="button"
                          className={`pw-pill ${trialForm.timeline === v ? 'active' : ''}`}
                          onClick={() => setTF('timeline', trialForm.timeline === v ? '' : v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── Section 4: How you found us + product feedback ─ */}
                <div className="pw-form-section">
                  <div className="pw-form-section-title">A bit about you</div>
                  <div className="pw-form-field">
                    <label>How did you hear about Clain?</label>
                    <div className="pw-pill-row">
                      {[
                        'Twitter / X',
                        'Google',
                        'ProductHunt',
                        'Friend or colleague',
                        'Blog or newsletter',
                        'YouTube / podcast',
                        'Other',
                      ].map((v) => (
                        <button
                          key={v} type="button"
                          className={`pw-pill ${trialForm.source === v ? 'active' : ''}`}
                          onClick={() => setTF('source', trialForm.source === v ? '' : v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pw-form-field">
                    <label htmlFor="pw-fav">What do you love about your current tools?</label>
                    <textarea
                      id="pw-fav"
                      placeholder="One thing your current support / ops stack does well that we should not break."
                      value={trialForm.favouriteTools}
                      onChange={(e) => setTF('favouriteTools', e.target.value)}
                    />
                    <span className="pw-form-field-hint">Optional — helps us prioritise the trial experience.</span>
                  </div>
                  <div className="pw-form-field">
                    <label htmlFor="pw-note">Anything specific you want to test?</label>
                    <textarea
                      id="pw-note"
                      placeholder="A real hard case — duplicated refunds, fraud, international returns. The more concrete, the better."
                      value={trialForm.note}
                      onChange={(e) => setTF('note', e.target.value)}
                    />
                  </div>
                </div>

                {/* ── Submit CTA — large + prominent ───────────────── */}
                <div className="pw-submit-cta">
                  <div className="pw-submit-tag">10 days · 1,000 AI credits · No card</div>
                  <button
                    type="submit"
                    disabled={trialLoading}
                    className="pw-btn pw-btn-primary"
                  >
                    {trialLoading ? 'Provisioning your trial…' : <>Start my 10-day trial <span className="pw-arrow">→</span></>}
                  </button>
                  <p className="pw-form-consent">
                    By submitting, you agree to our <a href="/#/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>.
                    Your trial workspace is created instantly.
                  </p>
                  <button type="button" className="pw-form-back" onClick={() => setView('grid')}>
                    ← Back to plans
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {error && <div className="pw-error">{error}</div>}

        {view === 'grid' && (
          <p className="pw-foot">
            All plans include the core platform. AI credits reset monthly. Top-up packs available on all plans.<br />
            Questions? <a href="mailto:support@clain.io">support@clain.io</a>
          </p>
        )}

      </div>
    </div>
  );
}
