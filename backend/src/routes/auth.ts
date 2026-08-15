import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware, signToken } from '../middleware/auth';
import { asyncHandler, ok, fail } from '../utils/http';
import { nowIso } from '../utils/id';
import { auditLog } from '../services/audit';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', asyncHandler(async (req, res) => {
  const body = loginSchema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Invalid email or password');
  const { email, password } = body.data;
  const user = await getDb().selectOne('users', { where: { email: email.toLowerCase().trim() } });
  if (!user) return fail(res, 401, 'Invalid email or password');
  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return fail(res, 401, 'Invalid email or password');
  if (user.status !== 'ACTIVE') return fail(res, 403, 'Account is disabled. Contact an administrator.');
  await getDb().update('users', { id: user.id }, { last_login_at: nowIso() });
  await auditLog({ user, action: 'LOGIN', entity: 'auth', entityId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] });
  const token = signToken({ uid: user.id, role: user.role });
  ok(res, { token, user: publicUser(user) });
}));

router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const db = getDb();
  const user = req.user;
  const dept = user.department_id ? await db.selectOne('departments', { where: { id: user.department_id } }) : null;
  ok(res, { ...publicUser(user), department: dept ? { id: dept.id, name: dept.name, code: dept.code } : null });
}));

const changePwSchema = z.object({ current_password: z.string().min(1), new_password: z.string().min(8) });

router.post('/change-password', authMiddleware, asyncHandler(async (req, res) => {
  const body = changePwSchema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'New password must be at least 8 characters');
  const { current_password, new_password } = body.data;
  const db = getDb();
  const user = await db.selectOne('users', { where: { id: req.user.id } });
  if (!user) return fail(res, 404, 'User not found');
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return fail(res, 400, 'Current password is incorrect');
  }
  await db.update('users', { id: user.id }, { password_hash: bcrypt.hashSync(new_password, 10) });
  await auditLog({ user, action: 'CHANGE_PASSWORD', entity: 'auth', entityId: user.id });
  ok(res, { message: 'Password updated' });
}));

function publicUser(u: any) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    department_id: u.department_id,
    status: u.status,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
  };
}

export default router;
