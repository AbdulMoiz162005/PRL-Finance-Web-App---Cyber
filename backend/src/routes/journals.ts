import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireMinRole, ROLE_HIERARCHY } from '../middleware/rbac';
import { asyncHandler, ok, fail, pick } from '../utils/http';
import { createJournalEntry, approveEntry, postEntry, reverseEntry } from '../services/ledger';
import { auditLog } from '../services/audit';
import { notifyUser } from '../services/notifications';

const router = Router();
router.use(authMiddleware);

async function decorate(db: any, entry: any) {
  const lines = await db.select('journal_lines', { where: { entry_id: entry.id }, order: { column: 'line_no' } });
  const accounts = await db.select('chart_of_accounts');
  const accountMap = new Map<string, any>(accounts.map((a) => [a.id, a]));
  const users = await db.select('users');
  const userMap = new Map<string, any>(users.map((u) => [u.id, u]));
  return {
    ...entry,
    lines: lines.map((l: any) => ({ ...l, account: accountMap.get(l.account_id) || null })),
    created_by_user: entry.created_by ? userMap.get(entry.created_by)?.full_name || null : null,
    approved_by_user: entry.approved_by ? userMap.get(entry.approved_by)?.full_name || null : null,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { status, from, to, source, limit = '100', offset = '0' } = req.query;
  const entries = await db.select('journal_entries', {
    order: [{ column: 'entry_date', dir: 'desc' }, { column: 'created_at', dir: 'desc' }],
    limit: parseInt(limit as string, 10),
    offset: parseInt(offset as string, 10),
  });
  let filtered = entries;
  if (status) filtered = filtered.filter((e) => e.status === status);
  if (source) filtered = filtered.filter((e) => e.source === source);
  if (from) filtered = filtered.filter((e) => e.entry_date >= from);
  if (to) filtered = filtered.filter((e) => e.entry_date <= to);
  const total = await db.count('journal_entries');
  ok(res, await Promise.all(filtered.map((e) => decorate(db, e))), { total, offset: parseInt(offset as string, 10) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const entry = await db.selectOne('journal_entries', { where: { id: req.params.id } });
  if (!entry) return fail(res, 404, 'Journal entry not found');
  ok(res, await decorate(db, entry));
}));

const lineSchema = z.object({
  account_id: z.string().min(1),
  department_id: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  debit: z.number().nonnegative().optional(),
  credit: z.number().nonnegative().optional(),
});

const createSchema = z.object({
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(3),
  lines: z.array(lineSchema).min(2),
});

router.post('/', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) return fail(res, 422, 'Validation failed', body.error.issues);
  const db = getDb();
  const entry = await createJournalEntry(db, req.user, {
    entryDate: body.data.entry_date,
    description: body.data.description,
    lines: body.data.lines,
  });
  await notifyUser(req.user.id, 'Journal entry created', `Entry ${entry.entry_number} created and awaiting approval.`);
  ok(res, await decorate(db, entry));
}));

router.post('/:id/approve', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const db = getDb();
  const entry = await db.selectOne('journal_entries', { where: { id: req.params.id } });
  if (!entry) return fail(res, 404, 'Journal entry not found');
  const approved = await approveEntry(db, req.user, entry);
  ok(res, await decorate(db, approved));
}));

router.post('/:id/post', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const db = getDb();
  const entry = await db.selectOne('journal_entries', { where: { id: req.params.id } });
  if (!entry) return fail(res, 404, 'Journal entry not found');
  const isManager = (ROLE_HIERARCHY[req.user.role] || 0) >= ROLE_HIERARCHY.FINANCE_MANAGER;
  if (!isManager && !entry.approved_by) {
    return fail(res, 403, 'This entry must be approved by a Finance Manager or Director before posting');
  }
  const posted = await postEntry(db, req.user, entry);
  ok(res, await decorate(db, posted));
}));

router.post('/:id/reverse', requireMinRole('FINANCE_MANAGER'), asyncHandler(async (req, res) => {
  const db = getDb();
  const entry = await db.selectOne('journal_entries', { where: { id: req.params.id } });
  if (!entry) return fail(res, 404, 'Journal entry not found');
  const reversal = await reverseEntry(db, req.user, entry);
  ok(res, await decorate(db, reversal));
}));

router.delete('/:id', requireMinRole('ACCOUNTANT'), asyncHandler(async (req, res) => {
  const db = getDb();
  const entry = await db.selectOne('journal_entries', { where: { id: req.params.id } });
  if (!entry) return fail(res, 404, 'Journal entry not found');
  if (entry.status !== 'DRAFT') return fail(res, 400, 'Only draft entries can be deleted');
  await db.remove('journal_lines', { entry_id: entry.id });
  await db.remove('journal_entries', { id: entry.id });
  await auditLog({ user: req.user, action: 'DELETE', entity: 'journal_entry', entityId: entry.id });
  ok(res, { message: 'Entry deleted' });
}));

export default router;
