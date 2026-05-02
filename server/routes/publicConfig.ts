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

export default router;
