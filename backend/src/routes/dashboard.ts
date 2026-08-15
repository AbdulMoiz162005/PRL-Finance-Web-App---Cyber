import { Router } from 'express';
import dayjs from 'dayjs';
import { getDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler, ok } from '../utils/http';
import { pnl, aging, getBalances } from '../services/reports';
import { accountBalance } from '../services/ledger';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const now = dayjs();
  const yearStart = `${now.year()}-01-01`;
  const today = now.format('YYYY-MM-DD');
  const lastMonth = now.subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
  const lastMonthEnd = now.subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
  const thisMonthStart = now.startOf('month').format('YYYY-MM-DD');

  const pnlYTD = await pnl(yearStart, today);
  const pnlThisMonth = await pnl(thisMonthStart, today);
  const pnlLastMonth = await pnl(lastMonth, lastMonthEnd);

  async function balanceByCode(code: string): Promise<number> {
    const acc = await db.selectOne('chart_of_accounts', { where: { code } });
    if (!acc) return 0;
    return accountBalance(acc.id).catch(() => 0);
  }
  const cash = await balanceByCode('1020');
  const cashLocal = await balanceByCode('1021');
  const cashCollections = await balanceByCode('1030');
  const cashTotal = Math.round((cash + cashLocal + cashCollections) * 100) / 100;
  const ar = await aging('AR');
  const ap = await aging('AP');

  const postedEntries = await db.select('journal_entries', { where: { status: 'POSTED' } });
  const drafts = await db.count('journal_entries', { where: { status: 'DRAFT' } });
  const pendingInvoices = await db.select('invoices');
  const submittedInvoices = pendingInvoices.filter((i) => ['SUBMITTED', 'APPROVED'].includes(i.status));
  const overdueInvoices = pendingInvoices.filter((i) => {
    if (['PAID', 'CANCELLED', 'DRAFT', 'SUBMITTED'].includes(i.status)) return false;
    const due = i.due_date || i.invoice_date;
    return dayjs(today).isAfter(dayjs(due));
  });

  const monthly: any[] = [];
  const accountsCount = await db.count('chart_of_accounts');
  const vendorsCount = await db.count('vendors');
  const customersCount = await db.count('customers');
  const activeUsers = await db.count('users', { where: { status: 'ACTIVE' } });
  const budgets = await db.select('budgets');
  const approvedBudgets = budgets.filter((b) => b.status === 'APPROVED').length;

  for (let m = 1; m <= now.month() + 1; m++) {
    const start = `${now.year()}-${String(m).padStart(2, '0')}-01`;
    const end = dayjs(start).endOf('month').format('YYYY-MM-DD');
    const p = await pnl(start, end);
    monthly.push({ month: m, label: dayjs(start).format('MMM'), revenue: p.totalRevenue, expenses: p.totalExpenses, net: p.netIncome });
  }

  const revenueAccounts = await db.select('chart_of_accounts', { where: { type: 'REVENUE' } });
  const expenseAccounts = await db.select('chart_of_accounts', { where: { type: 'EXPENSE' } });

  ok(res, {
    kpi: {
      revenueYTD: pnlYTD.totalRevenue,
      expensesYTD: pnlYTD.totalExpenses,
      netIncomeYTD: pnlYTD.netIncome,
      netIncomeThisMonth: pnlThisMonth.netIncome,
      revenueThisMonth: pnlThisMonth.totalRevenue,
      revenueLastMonth: pnlLastMonth.totalRevenue,
      cashTotal,
      receivables: ar.totalOutstanding,
      payables: ap.totalOutstanding,
    },
    counts: {
      postedEntries: postedEntries.length,
      draftEntries: drafts,
      pendingInvoices: submittedInvoices.length,
      overdueInvoices: overdueInvoices.length,
      accounts: accountsCount,
      vendors: vendorsCount,
      customers: customersCount,
      activeUsers,
      budgets,
      approvedBudgets,
    },
    monthly,
    receivableBuckets: ar.buckets,
    payableBuckets: ap.buckets,
    revenueAccounts: revenueAccounts.length,
    expenseAccounts: expenseAccounts.length,
  });
}));

export default router;
