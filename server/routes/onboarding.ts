/**
 * server/routes/onboarding.ts
 *
 * POST /api/onboarding/setup
 *
 * Called immediately after a new user signs up via Supabase Auth.
 * Creates the minimal tenant scaffold:
 *   organization → workspace → user record → member (owner)
 *
 * This route is PUBLIC (no tenant headers required) because the new user
 * has not yet been associated with any tenant.
 *
 * The Supabase JWT in the Authorization header is used to verify identity
 * and derive the user ID.  We do NOT require x-tenant-id here.
 *
 * Idempotent: if the org/workspace for this user already exists the
 * existing identifiers are returned (safe to call on browser refresh).
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { sendError } from '../http/errors.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/** Verify Supabase JWT and return the authenticated user ID + email. */
async function resolveSupabaseUser(
  authHeader: string | undefined,
): Promise<{ id: string; email: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? '' };
}

// ── POST /api/onboarding/setup ────────────────────────────────────────────────

router.post('/setup', async (req, res) => {
  const authUser = await resolveSupabaseUser(req.headers.authorization);
  if (!authUser) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Valid Supabase JWT required');
  }

  const { orgName, userName } = req.body as { orgName?: string; userName?: string };

  if (!orgName?.trim()) {
    return sendError(res, 400, 'MISSING_ORG_NAME', 'orgName is required');
  }

  const supabase = getSupabaseAdmin();

  try {
    // ── 1. Idempotency: check if user already has a workspace ──────────────
    const { data: existingMember } = await supabase
      .from('members')
      .select('tenant_id, workspace_id')
      .eq('user_id', authUser.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (existingMember) {
      logger.debug('onboarding/setup: user already has workspace, returning existing', {
        userId: authUser.id,
      });
      return res.json({
        tenantId:    existingMember.tenant_id,
        workspaceId: existingMember.workspace_id,
        created:     false,
      });
    }

    // ── 2. Create organization ─────────────────────────────────────────────
    const orgId   = randomUUID();
    const orgSlug = slugify(orgName.trim()) || `org-${orgId.slice(0, 8)}`;

    const { error: orgError } = await supabase.from('organizations').insert({
      id:         orgId,
      name:       orgName.trim(),
      slug:       orgSlug,
      created_at: new Date().toISOString(),
    });
    if (orgError) throw new Error(`org insert: ${orgError.message}`);

    // ── 3. Create workspace ────────────────────────────────────────────────
    const workspaceId   = randomUUID();
    const workspaceName = `${orgName.trim()} Workspace`;
    const workspaceSlug = orgSlug;

    const { error: wsError } = await supabase.from('workspaces').insert({
      id:         workspaceId,
      org_id:     orgId,
      name:       workspaceName,
      slug:       workspaceSlug,
      plan_id:    'starter',
      settings:   JSON.stringify({}),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (wsError) throw new Error(`workspace insert: ${wsError.message}`);

    // ── 4. Upsert user record ──────────────────────────────────────────────
    const displayName = userName?.trim() || authUser.email.split('@')[0];

    const { error: userError } = await supabase.from('users').upsert({
      id:         authUser.id,
      email:      authUser.email,
      name:       displayName,
      created_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (userError) throw new Error(`user upsert: ${userError.message}`);

    // ── 5. Create member record (owner) ────────────────────────────────────
    const memberId = randomUUID();

    const { error: memberError } = await supabase.from('members').insert({
      id:           memberId,
      user_id:      authUser.id,
      workspace_id: workspaceId,
      role_id:      'owner',
      status:       'active',
      tenant_id:    orgId,
      joined_at:    new Date().toISOString(),
    });
    if (memberError) throw new Error(`member insert: ${memberError.message}`);

    // ── 6. Seed a starter billing subscription ─────────────────────────────
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    await supabase.from('billing_subscriptions').insert({
      id:                   randomUUID(),
      org_id:               orgId,
      plan_id:              'starter',
      status:               'active',
      seats_included:       1,
      seats_used:           1,
      credits_included:     500,
      credits_used:         0,
      current_period_start: now.toISOString(),
      current_period_end:   nextMonth.toISOString(),
      created_at:           now.toISOString(),
    }).then(({ error: billingError }) => {
      if (billingError) {
        logger.warn('onboarding/setup: billing subscription seed failed (non-fatal)', {
          error: billingError.message,
        });
      }
    });

    logger.info('onboarding/setup: tenant scaffold created', {
      userId: authUser.id, orgId, workspaceId,
    });

    return res.status(201).json({
      tenantId:    orgId,
      workspaceId,
      created:     true,
    });

  } catch (err: any) {
    logger.error('onboarding/setup: failed', { error: err.message, userId: authUser.id });
    return sendError(res, 500, 'ONBOARDING_FAILED', err.message ?? 'Setup failed');
  }
});

export default router;
