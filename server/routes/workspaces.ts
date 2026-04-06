import { Router } from 'express';
import { getDb } from '../db/client.js';

const router = Router();

// List workspaces for user
router.get('/', (req, res) => {
  const userId = req.headers['x-user-id'] || 'user_alex';

  try {
    const db = getDb();
    const workspaces = db.prepare(`
      SELECT w.*, m.role_id, m.status as member_status 
      FROM workspaces w
      JOIN members m ON w.id = m.workspace_id
      WHERE m.user_id = ?
    `).all(userId);
    res.json(workspaces);
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current workspace details (Tenant config)
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    res.json(workspace);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
