import dayjs from 'dayjs';
import { getDb } from '../db';
import { getPostedLines, computeBalances, PostedLine, loadAccountMap } from './ledger';

export type Row = Record<string, any>;

export interface BalanceMap {
  debit: number;
  credit: number;
  balance: number;
}

export function getBalances(from?: string, to?: string): Promise<Map<string, BalanceMap>> {
  return getPostedLines(from, to).then(computeBalances);
}

export async function pnl(from: string, to: string) {
  const db = getDb();
  const accounts = await db.select('chart_of_accounts');
  const balances = await getBalances(from, to);
  const byType: Record<string, Row[]> = { REVENUE: [], EXPENSE: [] };
  const revenueTotal = { total: 0, accounts: [] as any[] };
  const expenseTotal = { total: 0, accounts: [] as any[] };
  const lines = await getPostedLines(from, to);
  const incomeAccounts = new Map<string, number>();
  const expenseAccounts = new Map<string, number>();
  for (const l of lines) {
    const acc = l.account;
    if (!acc) continue;
    if (acc.type === 'REVENUE') {
      incomeAccounts.set(acc.id, (incomeAccounts.get(acc.id) || 0) + (l.line.credit || 0));
    } else if (acc.type === 'EXPENSE') {
      expenseAccounts.set(acc.id, (expenseAccounts.get(acc.id) || 0) + (l.line.debit || 0));
    }
  }
  const accountMap = new Map<string, any>(accounts.map((a) => [a.id, a]));
  const toRows = (map: Map<string, number>) =>
    [...map.entries()].map(([id, amount]) => ({ account: accountMap.get(id), amount: round(amount) })).sort((a, b) =>
      a.account?.code.localeCompare(b.account?.code)
    );
  const revenues = toRows(incomeAccounts);
  const expenses = toRows(expenseAccounts);
  const totalRevenue = round(revenues.reduce((s, r) => s + r.amount, 0));
  const totalExpenses = round(expenses.reduce((s, r) => s + r.amount, 0));
  return {
    from,
    to,
    revenues,
    expenses,
    totalRevenue,
    totalExpenses,
    grossProfit: round(totalRevenue - totalExpenses),
    netIncome: round(totalRevenue - totalExpenses),
  };
}

function round(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function trialBalance(asOf?: string) {
  const db = getDb();
  const accounts = await db.select('chart_of_accounts', { order: { column: 'code' } });
  const balances = await getBalances(undefined, asOf);
  const rows = accounts.map((a) => {
    const b = balances.get(a.id) || { debit: 0, credit: 0, balance: 0 };
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      debit: round(b.debit),
      credit: round(b.credit),
      balance: round(b.balance),
    };
  });
  const totalDebit = round(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = round(rows.reduce((s, r) => s + r.credit, 0));
  return { asOf: asOf || dayjs().format('YYYY-MM-DD'), rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export async function gl(accountId: string, from?: string, to?: string) {
  const db = getDb();
  const account = await db.selectOne('chart_of_accounts', { where: { id: accountId } });
  if (!account) throw new Error('Account not found');
  const lines = await getPostedLines(from, to, accountId);
  const rows: any[] = [];
  let running = 0;
  const normalDebit = (account.normal_balance || 'DEBIT') === 'DEBIT';
  for (const item of lines) {
    const delta = (item.line.debit || 0) - (item.line.credit || 0);
    running += delta;
    rows.push({
      entry_id: item.entry_id,
      entry_number: item.entry_number,
      date: item.entry_date,
      description: item.line.description || item.entry_number,
      debit: round(item.line.debit || 0),
      credit: round(item.line.credit || 0),
      balance: round(normalDebit ? running : -running),
    });
  }
  return { account, rows, openingBalance: 0, endingBalance: round(running) };
}

export async function balanceSheet(asOf?: string) {
  const asOfDate = asOf || dayjs().format('YYYY-MM-DD');
  const db = getDb();
  const accounts = await db.select('chart_of_accounts');
  const balances = await getBalances(undefined, asOfDate);
  const accountMap = new Map<string, any>(accounts.map((a) => [a.id, a]));
  const assets: any[] = [];
  const liabilities: any[] = [];
  let assetsTotal = 0;
  let liabilitiesTotal = 0;
  const equityAccounts: any[] = [];
  let equityTotal = 0;
  for (const [id, b] of balances.entries()) {
    const acc = accountMap.get(id);
    if (!acc) continue;
    const amount = round(b.balance);
    if (acc.type === 'ASSET') {
      assets.push({ account: acc, amount });
      assetsTotal += amount;
    } else if (acc.type === 'LIABILITY') {
      liabilities.push({ account: acc, amount: round(-b.balance) });
      liabilitiesTotal += -b.balance;
    } else if (acc.type === 'EQUITY') {
      equityAccounts.push({ account: acc, amount: round(-b.balance) });
      equityTotal += -b.balance;
    }
  }
  const netIncome = await yearToDateIncome(asOfDate);
  const retained = round(assetsTotal - liabilitiesTotal - equityTotal - netIncome);
  assets.sort((a, b) => a.account.code.localeCompare(b.account.code));
  liabilities.sort((a, b) => a.account.code.localeCompare(b.account.code));
  equityAccounts.sort((a, b) => a.account.code.localeCompare(b.account.code));
  return {
    asOf: asOfDate,
    assets,
    liabilities,
    equityAccounts,
    netIncome,
    retained,
    totalAssets: round(assetsTotal),
    totalLiabilities: round(liabilitiesTotal),
    totalEquity: round(equityTotal + netIncome + retained),
  };
}

async function yearToDateIncome(asOfDate: string): Promise<number> {
  const start = `${dayjs(asOfDate).year()}-01-01`;
  const p = await pnl(start, asOfDate);
  return p.netIncome;
}

export async function cashFlow(from: string, to: string) {
  const db = getDb();
  const accounts = await db.select('chart_of_accounts');
  const accountMap = new Map<string, any>(accounts.map((a) => [a.id, a]));
  const start = dayjs(from);
  const periodStart = start.startOf('month').format('YYYY-MM-DD');
  const periodEnd = to;

  const closing = await getBalances(undefined, periodEnd);
  const opening = await getBalances(undefined, dayjs(periodStart).subtract(1, 'day').format('YYYY-MM-DD'));
  const activity = await getBalances(periodStart, periodEnd);

  const signed = (acc: Row, b: number) => (acc.normal_balance === 'CREDIT' ? -b : b);
  const sum = (m: Map<string, BalanceMap>, pred: (a: Row) => boolean) => {
    let total = 0;
    for (const [id, b] of m.entries()) {
      const acc = accountMap.get(id);
      if (acc && pred(acc)) total += b.balance;
    }
    return total;
  };
  const range = (acc: Row, lo: number, hi: number) => {
    const n = parseInt(acc.code, 10);
    return Number.isFinite(n) && n >= lo && n < hi;
  };
  const cashStart = sum(opening, (a) => range(a, 1000, 1100));
  const cashEnd = sum(closing, (a) => range(a, 1000, 1100));

  const netIncome = (await pnl(periodStart, periodEnd)).netIncome;
  const depreciation = sum(activity, (a) => a.code === '5280');

  const delta = (pred: (a: Row) => boolean) =>
    sum(closing, pred) - sum(opening, pred);
  const chgAR = delta((a) => range(a, 1100, 1200));
  const chgInv = delta((a) => range(a, 1200, 1300));
  const chgPrepay = delta((a) => range(a, 1300, 1400));
  const chgOtherAssets = delta((a) => range(a, 1500, 2000));
  const chgAP = delta((a) => range(a, 2000, 2100));
  const chgCurrLiab = delta((a) => range(a, 2200, 2300));
  const chgOtherLiab = delta((a) => range(a, 2300, 2400));

  const operating = round(
    netIncome + depreciation - chgAR - chgInv - chgPrepay - chgOtherAssets + chgAP + chgCurrLiab + chgOtherLiab
  );

  const purchases = sum(activity, (a) => a.type === 'ASSET' && range(a, 1410, 1490) && a.code !== '1490');
  const disposals = sum(activity, (a) => a.code === '1490');
  const investing = round(-purchases + disposals);

  const chgEquity = sum(closing, (a) => a.type === 'EQUITY') - sum(opening, (a) => a.type === 'EQUITY');
  const chgLoans = sum(closing, (a) => range(a, 2100, 2200)) - sum(opening, (a) => range(a, 2100, 2200));
  const financing = round(-chgEquity - chgLoans);

  const netChange = round(operating + investing + financing);
  return {
    from: periodStart,
    to: periodEnd,
    netIncome: round(netIncome),
    depreciation: round(depreciation),
    changes: {
      accountsReceivable: round(-chgAR),
      inventory: round(-chgInv),
      prepayments: round(-chgPrepay),
      otherAssets: round(-chgOtherAssets),
      accountsPayable: round(chgAP),
      otherCurrentLiabilities: round(chgCurrLiab + chgOtherLiab),
    },
    operating,
    investing,
    financing,
    netChange,
    cashStart: round(cashStart),
    cashEnd: round(cashEnd),
  };
}

export async function aging(kind: 'AP' | 'AR', asOf?: string) {
  const db = getDb();
  const asOfDate = asOf || dayjs().format('YYYY-MM-DD');
  const invoices = await db.select('invoices', { where: { kind } });
  const idColumn = kind === 'AP' ? 'vendor_id' : 'customer_id';
  const parties = kind === 'AP' ? await db.select('vendors') : await db.select('customers');
  const partyMap = new Map<string, any>(parties.map((p) => [p.id, p]));
  const buckets: Record<string, { count: number; total: number }> = {
    current: { count: 0, total: 0 },
    '1-30': { count: 0, total: 0 },
    '31-60': { count: 0, total: 0 },
    '61-90': { count: 0, total: 0 },
    '90+': { count: 0, total: 0 },
  };
  const rows: any[] = [];
  for (const inv of invoices) {
    if (['DRAFT', 'SUBMITTED', 'CANCELLED'].includes(inv.status)) continue;
    const outstanding = round((inv.total || 0) - (inv.amount_paid || 0));
    if (outstanding <= 0) continue;
    const due = inv.due_date || inv.invoice_date;
    const days = dayjs(asOfDate).diff(dayjs(due), 'day');
    let bucket: string;
    if (days <= 0) bucket = 'current';
    else if (days <= 30) bucket = '1-30';
    else if (days <= 60) bucket = '31-60';
    else if (days <= 90) bucket = '61-90';
    else bucket = '90+';
    buckets[bucket].count += 1;
    buckets[bucket].total += outstanding;
    const party = partyMap.get(inv[idColumn]);
    rows.push({
      invoice_number: inv.invoice_number,
      party: party?.name || 'N/A',
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      days_overdue: Math.max(0, days),
      status: inv.status,
      total: round(inv.total || 0),
      outstanding,
      bucket,
    });
  }
  rows.sort((a, b) => (a.days_overdue > b.days_overdue ? -1 : 1));
  const totalOutstanding = round(Object.values(buckets).reduce((s, b) => s + b.total, 0));
  return { kind, asOf: asOfDate, buckets, rows, totalOutstanding };
}

export async function budgetVsActual(year: number, departmentId?: string) {
  const db = getDb();
  const budgets = await db.select('budgets', { where: { fiscal_year: year } });
  const filtered = departmentId ? budgets.filter((b) => b.department_id === departmentId) : budgets;
  const budgetIds = new Set(filtered.map((b) => b.id));
  const lines = await db.select('budget_lines');
  const byAccount = new Map<string, { budget: number; actual: number; account?: Row }>();
  const accounts = await db.select('chart_of_accounts');
  const accountMap = new Map<string, any>(accounts.map((a) => [a.id, a]));
  for (const l of lines) {
    if (!budgetIds.has(l.budget_id)) continue;
    const cur = byAccount.get(l.account_id) || { budget: 0, actual: 0 };
    cur.budget += l.amount || 0;
    byAccount.set(l.account_id, cur);
  }
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const posted = await getPostedLines(start, end);
  for (const p of posted) {
    const acc = p.account;
    if (!acc) continue;
    const cur = byAccount.get(acc.id);
    if (!cur) continue;
    const amount = acc.normal_balance === 'CREDIT' ? p.line.credit || 0 : p.line.debit || 0;
    cur.actual += amount;
  }
  const rows = [...byAccount.entries()].map(([accountId, v]) => {
    const account = accountMap.get(accountId);
    const variance = round((v.budget || 0) - (v.actual || 0));
    return {
      accountId,
      account_code: account?.code || '?',
      account_name: account?.name || '?',
      budget: round(v.budget),
      actual: round(v.actual),
      variance,
      utilization: v.budget ? round((v.actual / v.budget) * 100) : 0,
    };
  });
  rows.sort((a, b) => a.account_code.localeCompare(b.account_code));
  const totalBudget = round(rows.reduce((s, r) => s + r.budget, 0));
  const totalActual = round(rows.reduce((s, r) => s + r.actual, 0));
  return { year, rows, totalBudget, totalActual, departments: filtered };
}

export async function departmentSpend(from: string, to: string) {
  const db = getDb();
  const depts = await db.select('departments', { where: { is_active: true } });
  const lines = await getPostedLines(from, to);
  const map = new Map<string, number>();
  for (const l of lines) {
    const acc = l.account;
    if (!acc || acc.type !== 'EXPENSE') continue;
    const deptId = l.line.department_id;
    const key = deptId || 'UNASSIGNED';
    map.set(key, (map.get(key) || 0) + (l.line.debit || 0));
  }
  const deptMap = new Map<string, any>(depts.map((d) => [d.id, d]));
  const rows = [...map.entries()].map(([id, amount]) => ({
    id,
    name: id === 'UNASSIGNED' ? 'Unassigned' : deptMap.get(id)?.name || 'Unknown',
    amount: round(amount),
  }));
  rows.sort((a, b) => b.amount - a.amount);
  return { from, to, rows, total: round(rows.reduce((s, r) => s + r.amount, 0)) };
}
