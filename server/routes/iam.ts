import { Router } from 'express';
import { getDb } from '../db/client.js';

const router = Router();

// Get current user profile
router.get('/me', (req, res) => {
  const userId = req.headers['x-user-id'] || 'user_alex';

  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's members/workspaces
    const members = db.prepare(`
      SELECT m.*, w.name as workspace_name, w.slug as workspace_slug 
      FROM members m 
      JOIN workspaces w ON m.workspace_id = w.id 
      WHERE m.user_id = ?
    `).all(userId);

    res.json({ ...(user as Record<string, any>), memberships: members });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List users for Tenant/Workspace
router.get('/users', (req, res) => {
  const tenantId = req.headers['x-tenant-id'] || 'tenant_default';
  
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.avatar_url, u.created_at, m.status, m.workspace_id 
      FROM users u
      LEFT JOIN members m ON u.id = m.user_id
      WHERE m.tenant_id = ? OR m.tenant_id IS NULL
    `).all(tenantId);
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
