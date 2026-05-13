import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { seedBigDataset, deleteBigSeed } from '../data/bigSeed.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(extractMultiTenant);

/**
 * POST /api/admin/seed/big
 * Injects the comprehensive big-seed dataset into the caller's workspace.
 */
router.post('/big', async (req: MultiTenantRequest, res: Response) => {
  const tenantId    = req.tenantId!;
  const workspaceId = req.workspaceId!;
  const ownerUserId = req.userId!;

  logger.info('adminSeed: big seed requested', { tenantId, workspaceId, ownerUserId });

  try {
    await seedBigDataset({ tenantId, workspaceId, ownerUserId });
    res.json({ ok: true, message: 'Big seed injected successfully' });
  } catch (err: any) {
    logger.error('adminSeed: big seed failed', { error: err?.message || String(err) });
    res.status(500).json({ ok: false, error: 'Seed failed', detail: err?.message });
  }
});

/**
 * DELETE /api/admin/seed/big
 * Removes all rows planted by the big-seed for the caller's workspace.
 */
router.delete('/big', async (req: MultiTenantRequest, res: Response) => {
  const tenantId    = req.tenantId!;
  const workspaceId = req.workspaceId!;

  logger.info('adminSeed: big seed delete requested', { tenantId, workspaceId });

  try {
    await deleteBigSeed(tenantId, workspaceId);
    res.json({ ok: true, message: 'Big seed data removed' });
  } catch (err: any) {
    logger.error('adminSeed: big seed delete failed', { error: err?.message || String(err) });
    res.status(500).json({ ok: false, error: 'Seed delete failed', detail: err?.message });
  }
});

export default router;
