/**
 * server/routes/publicConfig.ts
 *
 * Endpoints used by the static landing page (public-landing/) that runs
 * outside the Vite app and therefore cannot read VITE_* env vars.
 *
 * NO authentication, NO multi-tenant headers required. These routes are
 * deliberately public.
 *
 *   GET  /api/public/config   → { supabaseUrl, supabaseAnonKey, appUrl }
 *   POST /api/public/leads    → record demo-request lead
 *
 * Only the Supabase ANON key is exposed (never the service-role key).
 */

import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';

import { config } from '../config.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { sendError } from '../http/errors.js';
import { validate } from '../middleware/validate.js';
import { sendEmail } from '../pipeline/channelSenders.js';

const router = Router();

// ── GET /api/public/config ────────────────────────────────────────────────────

router.get('/config', (_req, res) => {
  const supabaseUrl = config.db.supabaseUrl ?? process.env.SUPABASE_URL?.trim() ?? '';
  // Public anon key — distinct env var, NEVER service-role.
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY?.trim() ??
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ??
    '';

  if (!supabaseUrl || !supabaseAnonKey) {
    logger.warn('publicConfig: SUPABASE_URL or SUPABASE_ANON_KEY missing — landing auth will fail');
  }

  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    supabaseUrl,
    supabaseAnonKey,
    appUrl: config.app.url,
  });
});

// ── POST /api/public/leads ────────────────────────────────────────────────────

const LeadSchema = z.object({
  name:    z.string().trim().min(1).max(160),
  email:   z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional().default(''),
  role:    z.string().trim().max(120).optional().default(''),
  volume:  z.string().trim().max(80).optional().default(''),
  stack:   z.string().trim().max(400).optional().default(''),
  note:    z.string().trim().max(4000).optional().default(''),
  source:  z.string().trim().max(80).optional().default('landing/demo'),
});

router.post('/leads', validate({ body: LeadSchema }), async (req, res) => {
  const body = req.body as z.infer<typeof LeadSchema>;
  const supabase = getSupabaseAdmin();

  const row = {
    id:           randomUUID(),
    name:         body.name,
    email:        body.email.toLowerCase(),
    company:      body.company || null,
    role:         body.role || null,
    volume:       body.volume || null,
    stack:        body.stack || null,
    note:         body.note || null,
    source:       body.source || 'landing/demo',
    user_agent:   (req.headers['user-agent'] as string | undefined)?.slice(0, 500) ?? null,
    referer:      (req.headers['referer'] as string | undefined)?.slice(0, 500) ?? null,
    created_at:   new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from('demo_leads').insert(row);
    if (error) throw error;
  } catch (err: any) {
    logger.error('publicConfig.leads: insert failed', { error: err?.message });
    return sendError(res, 500, 'LEAD_INSERT_FAILED', 'Could not save lead');
  }

  // Notify ops inbox — non-blocking; failures are logged but do not surface.
  const inbox =
    process.env.LEADS_INBOX_EMAIL?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    config.channels?.postmark?.fromEmail;

  if (inbox) {
    const subject = `New demo request: ${body.name}${body.company ? ` (${body.company})` : ''}`;
    const lines = [
      `Name:    ${body.name}`,
      `Email:   ${body.email}`,
      `Company: ${body.company || '—'}`,
      `Role:    ${body.role || '—'}`,
      `Volume:  ${body.volume || '—'}`,
      `Stack:   ${body.stack || '—'}`,
      '',
      'Note:',
      body.note || '(none)',
      '',
      `Source:  ${body.source}`,
      `Lead ID: ${row.id}`,
    ];
    sendEmail(inbox, subject, lines.join('\n'), `lead_${row.id}`).catch((err) => {
      logger.warn('publicConfig.leads: notification email failed', { error: err?.message });
    });
  } else {
    logger.warn('publicConfig.leads: no LEADS_INBOX_EMAIL/EMAIL_FROM configured — skipping notification');
  }

  res.status(201).json({ ok: true, id: row.id });
});

// ── GET /api/public/pricing ──────────────────────────────────────────────────
// Public, unauthenticated. Returns the plan catalogue (codes, monthly + annual
// prices, AI credit allotments, seat caps, feature highlights) so the static
// landing page can render its pricing grid without leaking server creds.
//
// The Stripe Price IDs themselves are NEVER returned — we only flag whether
// each (plan, interval) is configured server-side, so the landing knows
// which buttons to enable. Actual checkout creation happens through the
// authenticated /api/billing/:orgId/checkout-session endpoint after signup.

router.get('/pricing', (_req, res) => {
  // Plan structure mirrors server/integrations/stripe/plans.ts. Prices are
  // sourced from env vars when set (so an admin can tune without redeploy);
  // otherwise the conservative defaults from PRICING_ANALYSIS.md ship.
  const num = (envVar: string, fallback: number): number => {
    const v = Number(process.env[envVar]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };

  const PLAN_CONFIGURED = (plan: string, interval: 'month' | 'year'): boolean => {
    const key = `STRIPE_PRICE_ID_${plan.toUpperCase()}_${interval === 'year' ? 'ANNUAL' : 'MONTHLY'}`;
    return Boolean(process.env[key]);
  };

  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    currency: process.env.PRICING_CURRENCY?.toUpperCase() || 'EUR',
    annualDiscountPct: 20,
    plans: [
      {
        code: 'starter',
        name: 'Starter',
        tagline: 'For small teams shipping their first AI agent.',
        priceMonthly: num('PRICING_STARTER_MONTHLY', 52),
        priceAnnualPerMonth: num('PRICING_STARTER_ANNUAL_MONTHLY', 42),
        credits: 5_000,
        seats: 3,
        cta: 'Start free trial',
        ctaPath: '/signup',
        configured: { month: PLAN_CONFIGURED('starter', 'month'), year: PLAN_CONFIGURED('starter', 'year') },
        features: [
          'Inbox with shared views',
          'Clain AI Agent (autonomous)',
          'Knowledge Hub (1 source of truth)',
          '5,000 AI credits / month',
          'Up to 3 seats',
          'Email support',
          'Native Slack, Gmail, Outlook integrations',
        ],
      },
      {
        code: 'growth',
        name: 'Growth',
        tagline: 'For teams scaling AI-first customer service.',
        priceMonthly: num('PRICING_GROWTH_MONTHLY', 135),
        priceAnnualPerMonth: num('PRICING_GROWTH_ANNUAL_MONTHLY', 109),
        credits: 20_000,
        seats: 10,
        cta: 'Start free trial',
        ctaPath: '/signup',
        configured: { month: PLAN_CONFIGURED('growth', 'month'), year: PLAN_CONFIGURED('growth', 'year') },
        recommended: true,
        features: [
          'Everything in Starter',
          'Tickets, pipelines and SLA monitoring',
          'Reporting + AI-powered Insights',
          'Copilot for human agents',
          '20,000 AI credits / month',
          'Up to 10 seats',
          'Priority support (next business day)',
          '30+ integrations (HubSpot, Salesforce, Stripe, Shopify…)',
        ],
      },
      {
        code: 'scale',
        name: 'Scale',
        tagline: 'For teams running customer service across every channel.',
        priceMonthly: num('PRICING_SCALE_MONTHLY', 315),
        priceAnnualPerMonth: num('PRICING_SCALE_ANNUAL_MONTHLY', 254),
        credits: 60_000,
        seats: 25,
        cta: 'Start free trial',
        ctaPath: '/signup',
        configured: { month: PLAN_CONFIGURED('scale', 'month'), year: PLAN_CONFIGURED('scale', 'year') },
        features: [
          'Everything in Growth',
          'Omnichannel (voice, WhatsApp, Messenger, Instagram, Telegram)',
          'Custom workflows + plan engine',
          '60,000 AI credits / month',
          'Up to 25 seats',
          'Dedicated CSM',
          'SSO / SAML, audit logs',
          'Custom integrations + sandbox',
        ],
      },
      {
        code: 'business',
        name: 'Business',
        tagline: 'For enterprises with custom volume, security and SLA requirements.',
        priceMonthly: null,
        priceAnnualPerMonth: null,
        credits: null,
        seats: null,
        cta: 'Talk to sales',
        ctaPath: '/demo',
        configured: { month: false, year: false },
        features: [
          'Everything in Scale',
          'Unlimited AI credits (custom contract)',
          'Unlimited seats',
          'Dedicated infrastructure + custom region',
          '99.9% uptime SLA, financially backed',
          'Custom DPA, SOC2 / ISO 27001 evidence',
          'Quarterly business reviews',
          'Custom-trained agent on your tone of voice',
        ],
      },
    ],
    topupPacks: [
      { code: '5k',  credits: 5_000,  price: num('PRICING_TOPUP_5K_PRICE',  29) },
      { code: '20k', credits: 20_000, price: num('PRICING_TOPUP_20K_PRICE', 99) },
      { code: '50k', credits: 50_000, price: num('PRICING_TOPUP_50K_PRICE', 219) },
    ],
    flexibleUsage: {
      pricePerCredit: Number(process.env.PRICING_FLEXIBLE_USAGE_RATE) || 0.012,
    },
  });
});

export default router;
