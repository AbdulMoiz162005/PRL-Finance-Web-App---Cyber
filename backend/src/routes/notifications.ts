import { Router } from 'express';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler, ok } from '../utils/http';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const notifications = await db.select('notifications', {
    where: { user_id: req.user.id },
    order: { column: 'created_at', dir: 'desc' },
    limit: 50,
  });
  const unread = notifications.filter((n) => !n.is_read).length;
  ok(res, { notifications, unread });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  const db = getDb();
  const n = await db.selectOne('notifications', { where: { id: req.params.id, user_id: req.user.id } });
  if (!n) return ok(res, { message: 'ok' });
  await db.update('notifications', { id: n.id }, { is_read: true });
  ok(res, { message: 'marked read' });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  const db = getDb();
  await db.updateMany('notifications', { user_id: req.user.id, is_read: false }, { is_read: true });
  ok(res, { message: 'all read' });
}));

export default router;
