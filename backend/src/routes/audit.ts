import { Router } from 'express';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole } from '../middleware/rbac';
import { asyncHandler, ok } from '../utils/http';

const router = Router();
router.use(authMiddleware, requireMinRole('AUDITOR'));

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit as string, 10) || 200;
  const entity = req.query.entity as string | undefined;
  const action = req.query.action as string | undefined;
  let logs = await db.select('audit_logs', { order: { column: 'created_at', dir: 'desc' }, limit });
  if (entity) logs = logs.filter((l) => l.entity === entity);
  if (action) logs = logs.filter((l) => l.action === action);
  const users = await db.select('users');
  const userMap = new Map<string, string>(users.map((u) => [u.id, u.full_name]));
  ok(res, logs.map((l) => ({
    ...l,
    old_value: l.old_value ? JSON.parse(l.old_value) : null,
    new_value: l.new_value ? JSON.parse(l.new_value) : null,
    user_name: l.user_id ? userMap.get(l.user_id) || l.email : l.email || 'System',
  })));
}));

export default router;
