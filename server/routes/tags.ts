// Tags / Labels management route.
// Aggregates distinct tags from the cases table for the current workspace
// and exposes basic CRUD for future custom tag definitions.

import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { getSupabaseAdmin } from '../db/supabase.js';

const router = Router();
router.use(extractMultiTenant);

// GET /api/tags — list all tags used in the workspace
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Tenant context missing' });

  try {
    const supabase = getSupabaseAdmin();

    // Fetch all tags arrays from cases
    const { data: cases, error } = await supabase
      .from('cases')
      .select('tags, created_at, assigned_user_id')
      .eq('tenant_id', req.tenantId)
      .not('tags', 'is', null);

    if (error) throw error;

    // Aggregate tag stats
    const tagMap: Record<string, { conversations: number; createdAt: string }> = {};

    for (const c of cases ?? []) {
      const tags: string[] = Array.isArray(c.tags)
        ? c.tags
        : typeof c.tags === 'string'
          ? JSON.parse(c.tags).filter(Boolean)
          : [];

      for (const tag of tags) {
        if (!tag) continue;
        if (!tagMap[tag]) {
          tagMap[tag] = { conversations: 0, createdAt: c.created_at ?? new Date().toISOString() };
        }
        tagMap[tag].conversations += 1;
      }
    }

    const result = Object.entries(tagMap).map(([name, stats]) => ({
      name,
      conversations: stats.conversations,
      people: 0,
      companies: 0,
      messages: 0,
      createdAt: new Date(stats.createdAt).toLocaleDateString('es-ES', {
        day: 'numeric', month: 'short', year: 'numeric',
      }),
      createdBy: '—',
    }));

    // Sort by usage descending
    result.sort((a, b) => b.conversations - a.conversations);

    res.json(result);
  } catch (err) {
    console.error('Error listing tags:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
