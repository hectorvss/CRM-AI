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
import { z } from 'zod';
import { getSupabaseAdmin } from '../db/supabase.js';
import { sendError } from '../http/errors.js';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const SetupBodySchema = z.object({
  orgName: z.string().trim().min(1, 'orgName is required').max(120),
  userName: z.string().trim().max(120).optional(),
});

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

router.post('/setup', validate({ body: SetupBodySchema }), async (req, res) => {
  const authUser = await resolveSupabaseUser(req.headers.authorization);
  if (!authUser) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Valid Supabase JWT required');
  }

  const { orgName, userName } = req.body as z.infer<typeof SetupBodySchema>;

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

      // Ensure JWT app_metadata is in sync (idempotent — covers users who were
      // onboarded before this column was written, or whose metadata was wiped).
      try {
        await supabase.auth.admin.updateUserById(authUser.id, {
          app_metadata: {
            tenant_id:    existingMember.tenant_id,
            workspace_id: existingMember.workspace_id,
          },
        });
      } catch (metaErr: any) {
        logger.warn('onboarding/setup: failed to sync app_metadata for existing user (non-fatal)', {
          error: metaErr?.message,
          userId: authUser.id,
        });
      }

      return res.json({
        tenantId:    existingMember.tenant_id,
        workspaceId: existingMember.workspace_id,
        created:     false,
      });
    }

    // ── Track created IDs for compensating rollback on failure ─────────────
    // We have no real transaction across multiple Supabase REST calls, so on
    // any error we delete the rows we created in reverse order. The user row
    // is upserted (idempotent) so we deliberately do NOT delete it on
    // rollback — multiple onboarding attempts for the same authUser must
    // leave the auth user record intact.
    const created: {
      orgId?: string;
      workspaceId?: string;
      memberId?: string;
      subscriptionId?: string;
    } = {};

    const rollbackCreated = async () => {
      // Run deletes sequentially in reverse-creation order so a failure on
      // one step does not poison the others. Each step is best-effort and
      // logged on failure — there is nothing the caller can do beyond seeing
      // that the rollback was attempted.
      const steps: Array<{ label: string; run: () => Promise<{ error: any }> }> = [];
      if (created.subscriptionId) {
        const id = created.subscriptionId;
        steps.push({ label: 'billing_subscriptions', run: () =>
          supabase.from('billing_subscriptions').delete().eq('id', id) as any });
      }
      if (created.memberId) {
        const id = created.memberId;
        steps.push({ label: 'members', run: () =>
          supabase.from('members').delete().eq('id', id) as any });
      }
      if (created.workspaceId) {
        const id = created.workspaceId;
        steps.push({ label: 'workspaces', run: () =>
          supabase.from('workspaces').delete().eq('id', id) as any });
      }
      if (created.orgId) {
        const id = created.orgId;
        steps.push({ label: 'organizations', run: () =>
          supabase.from('organizations').delete().eq('id', id) as any });
      }
      for (const step of steps) {
        try {
          const { error: stepError } = await step.run();
          if (stepError) {
            logger.error('onboarding/setup: rollback step failed', {
              step: step.label, error: stepError.message,
            });
          }
        } catch (stepErr: any) {
          logger.error('onboarding/setup: rollback step threw', {
            step: step.label, error: stepErr?.message,
          });
        }
      }
    };

    try {
      // ── 2. Create organization ───────────────────────────────────────────
      const orgId   = randomUUID();
      const orgSlug = slugify(orgName.trim()) || `org-${orgId.slice(0, 8)}`;

      const { error: orgError } = await supabase.from('organizations').insert({
        id:         orgId,
        name:       orgName.trim(),
        slug:       orgSlug,
        created_at: new Date().toISOString(),
      });
      if (orgError) throw new Error(`org insert: ${orgError.message}`);
      created.orgId = orgId;

      // ── 3. Create workspace ──────────────────────────────────────────────
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
      created.workspaceId = workspaceId;

      // ── 4. Upsert user record ────────────────────────────────────────────
      const displayName = userName?.trim() || authUser.email.split('@')[0];

      const { error: userError } = await supabase.from('users').upsert({
        id:         authUser.id,
        email:      authUser.email,
        name:       displayName,
        created_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (userError) throw new Error(`user upsert: ${userError.message}`);

      // ── 5. Create member record (owner) ──────────────────────────────────
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
      created.memberId = memberId;

      // ── 6. Seed a starter billing subscription ───────────────────────────
      const now = new Date();
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const subscriptionId = randomUUID();

      // Seed in PENDING state — user must activate trial, choose paid plan,
      // or be granted demo access before the SPA lets them in. The paywall
      // (src/components/billing/Paywall.tsx) renders for status='pending_subscription'.
      //
      // We try the full payload first; if optional columns from later migrations
      // are missing (ai_credits_*, trial_used), we retry with just the core fields.
      // activateTrial() is self-healing and will create the row if it's absent.
      const fullBillingRow = {
        id:                      subscriptionId,
        org_id:                  orgId,
        plan_id:                 null,
        status:                  'pending_subscription',
        seats_included:          1,
        seats_used:              1,
        credits_included:        0,
        credits_used:            0,
        ai_credits_included:     0,
        ai_credits_used_period:  0,
        ai_credits_topup_balance: 0,
        trial_used:              false,
        current_period_start:    now.toISOString(),
        current_period_end:      nextMonth.toISOString(),
        created_at:              now.toISOString(),
      };

      let { error: billingError } = await supabase.from('billing_subscriptions').insert(fullBillingRow);

      if (billingError) {
        // Columns from a later migration might be missing — retry with core fields only.
        const minimalRow = {
          id:                   subscriptionId,
          org_id:               orgId,
          plan_id:              null,
          status:               'pending_subscription',
          seats_included:       1,
          seats_used:           1,
          current_period_start: now.toISOString(),
          current_period_end:   nextMonth.toISOString(),
          created_at:           now.toISOString(),
        };
        const { error: billingError2 } = await supabase.from('billing_subscriptions').insert(minimalRow);
        if (billingError2) {
          // Still non-fatal — activateTrial() will backfill later.
          logger.warn('onboarding/setup: billing subscription seed failed (non-fatal)', {
            error: billingError2.message, originalError: billingError.message,
          });
        } else {
          created.subscriptionId = subscriptionId;
          billingError = null;
        }
      } else {
        created.subscriptionId = subscriptionId;
      }
    } catch (innerErr: any) {
      logger.error('onboarding/setup: scaffold step failed, rolling back', {
        error: innerErr?.message, userId: authUser.id, created,
      });
      await rollbackCreated();
      return sendError(res, 500, 'ONBOARDING_FAILED',
        `${innerErr?.message ?? 'Setup failed'} (created rows were rolled back)`);
    }

    const orgId       = created.orgId!;
    const workspaceId = created.workspaceId!;

    // ── 7. Persist tenant/workspace into Supabase JWT app_metadata ─────────
    // The frontend reads session.user.app_metadata.tenant_id; backend
    // middleware also prefers this over headers. Best-effort — if it fails,
    // the frontend will fall back to /api/iam/me.
    try {
      await supabase.auth.admin.updateUserById(authUser.id, {
        app_metadata: {
          tenant_id:    orgId,
          workspace_id: workspaceId,
        },
      });
    } catch (metaErr: any) {
      logger.warn('onboarding/setup: failed to write app_metadata (non-fatal)', {
        error: metaErr?.message,
        userId: authUser.id,
      });
    }

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
