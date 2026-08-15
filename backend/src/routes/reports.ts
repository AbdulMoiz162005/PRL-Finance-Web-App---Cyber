import { Router } from 'express';
import dayjs from 'dayjs';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler, ok, fail } from '../utils/http';
import { csv } from '../utils/http';
import { pnl, balanceSheet, cashFlow, trialBalance, gl, aging, budgetVsActual, departmentSpend } from '../services/reports';
import { getSystemAccount, CONTROL_ACCOUNTS } from '../services/ledger';

const router = Router();
router.use(authMiddleware);

function parseRange(req: any): { from: string; to: string } {
  const to = (req.query.to as string) || dayjs().format('YYYY-MM-DD');
  const from = (req.query.from as string) || dayjs(to).subtract(1, 'year').add(1, 'day').format('YYYY-MM-DD');
  return { from, to };
}

router.get('/pnl', asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req);
  ok(res, await pnl(from, to));
}));

router.get('/balance-sheet', asyncHandler(async (req, res) => {
  const asOf = (req.query.asOf as string) || dayjs().format('YYYY-MM-DD');
  ok(res, await balanceSheet(asOf));
}));

router.get('/cash-flow', asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req);
  ok(res, await cashFlow(from, to));
}));

router.get('/trial-balance', asyncHandler(async (req, res) => {
  const asOf = (req.query.asOf as string) || undefined;
  ok(res, await trialBalance(asOf));
}));

router.get('/gl', asyncHandler(async (req, res) => {
  const accountId = req.query.account_id as string;
  if (!accountId) return fail(res, 422, 'account_id is required');
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  ok(res, await gl(accountId, from, to));
}));

router.get('/aging', asyncHandler(async (req, res) => {
  const kind = (req.query.kind as string) || 'AR';
  if (!['AP', 'AR'].includes(kind)) return fail(res, 422, 'kind must be AP or AR');
  const asOf = (req.query.asOf as string) || undefined;
  ok(res, await aging(kind as any, asOf));
}));

router.get('/budget-vs-actual', asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year as string, 10) || dayjs().year();
  const departmentId = req.query.department_id as string | undefined;
  ok(res, await budgetVsActual(year, departmentId));
}));

router.get('/department-spend', asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req);
  ok(res, await departmentSpend(from, to));
}));

router.get('/pnl.csv', asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req);
  const r = await pnl(from, to);
  const headers = ['Account Code', 'Account Name', 'Amount'];
  const rows = [
    ...r.revenues.map((x) => [x.account?.code, x.account?.name, x.amount]),
    ['', 'Total Revenue', r.totalRevenue],
    ...r.expenses.map((x) => [x.account?.code, x.account?.name, x.amount]),
    ['', 'Total Expenses', r.totalExpenses],
    ['', 'Net Income', r.netIncome],
  ];
  return csv(res, `pnl_${from}_${to}.csv`, headers, rows);
}));

router.get('/aging.csv', asyncHandler(async (req, res) => {
  const kind = ((req.query.kind as string) || 'AR') as any;
  const r = await aging(kind);
  const headers = ['Invoice', 'Party', 'Invoice Date', 'Due Date', 'Days Overdue', 'Status', 'Total', 'Outstanding', 'Bucket'];
  const rows = r.rows.map((x: any) => [x.invoice_number, x.party, x.invoice_date, x.due_date, x.days_overdue, x.status, x.total, x.outstanding, x.bucket]);
  return csv(res, `aging_${kind}.csv`, headers, rows);
}));

router.get('/trial-balance.csv', asyncHandler(async (req, res) => {
  const asOf = (req.query.asOf as string) || undefined;
  const r = await trialBalance(asOf);
  const headers = ['Code', 'Account', 'Type', 'Debit', 'Credit', 'Balance'];
  const rows = r.rows.map((x: any) => [x.code, x.name, x.type, x.debit, x.credit, x.balance]);
  return csv(res, `trial_balance_${asOf || 'all'}.csv`, headers, rows);
}));

export default router;
