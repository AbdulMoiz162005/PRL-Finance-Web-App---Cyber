import dayjs from 'dayjs';
import { getDb, DbAdapter } from '../db';
import { uuid, nowIso, isoDate } from '../utils/id';
import { journalNumber } from './sequence';
import { auditLog } from './audit';

export type Row = Record<string, any>;

export const CONTROL_ACCOUNTS: Record<string, string> = {
  CASH: '1000',
  AR: '1110',
  AP: '2010',
  VAT_PAYABLE: '2210',
  VAT_RECOVERABLE: '1520',
  DEPRECIATION_EXPENSE: '5280',
};

export async function getSystemAccount(code: string): Promise<Row | null> {
  return getDb().selectOne('chart_of_accounts', { where: { code } });
}

export function fiscalYearOf(date: string | Date): number {
  return dayjs(date).year();
}

export function periodOf(date: string | Date): number {
  return dayjs(date).month() + 1;
}

export async function getAccountWithBalance(accountId: string, asOf?: string) {
  const db = getDb();
  const account = await db.selectOne('chart_of_accounts', { where: { id: accountId } });
  if (!account) return null;
  const bal = await accountBalance(accountId, asOf);
  return { ...account, balance: bal };
}

export async function accountBalance(accountId: string, asOf?: string): Promise<number> {
  const db = getDb();
  const entries = await db.select('journal_entries', {
    where: { status: 'POSTED' },
  });
  const entryIds = new Set(entries.map((e) => e.id));
  const lines = await db.select('journal_lines', { where: { account_id: accountId } });
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    if (!entryIds.has(l.entry_id)) continue;
    const entry = entries.find((e) => e.id === l.entry_id);
    if (asOf && entry && entry.entry_date > asOf) continue;
    debit += l.debit || 0;
    credit += l.credit || 0;
  }
  return debit - credit;
}

export interface PostedLine {
  entry_id: string;
  entry_number: string;
  entry_date: string;
  line: Row;
  account: Row | undefined;
}

/** All posted journal lines (optionally within date range, optionally filtered by account). */
export async function getPostedLines(from?: string, to?: string, accountId?: string): Promise<PostedLine[]> {
  const db = getDb();
  const entries = await db.select('journal_entries', {
    where: { status: 'POSTED' },
    order: { column: 'entry_date', dir: 'asc' },
  });
  const filtered = entries.filter((e) => {
    if (from && e.entry_date < from) return false;
    if (to && e.entry_date > to) return false;
    return true;
  });
  const accountIds = accountId ? [accountId] : null;
  const lines = accountIds
    ? await db.select('journal_lines', { where: { account_id: accountId } })
    : await db.select('journal_lines');
  const entryMap = new Map<string, any>(filtered.map((e) => [e.id, e]));
  const accountMap = await loadAccountMap();
  const out: PostedLine[] = [];
  for (const l of lines) {
    const entry = entryMap.get(l.entry_id);
    if (!entry) continue;
    out.push({
      entry_id: entry.id,
      entry_number: entry.entry_number,
      entry_date: entry.entry_date,
      line: l,
      account: accountMap.get(l.account_id),
    });
  }
  out.sort((a, b) => (a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : 0));
  return out;
}

export async function loadAccountMap(): Promise<Map<string, Row>> {
  const accounts = await getDb().select('chart_of_accounts');
  return new Map<string, any>(accounts.map((a) => [a.id, a]));
}

/** Compute debit/credit/balance map for every account over a set of lines. */
export function computeBalances(lines: PostedLine[]): Map<string, { debit: number; credit: number; balance: number }> {
  const map = new Map<string, { debit: number; credit: number; balance: number }>();
  for (const item of lines) {
    const acc = item.line.account_id;
    if (!map.has(acc)) map.set(acc, { debit: 0, credit: 0, balance: 0 });
    const b = map.get(acc)!;
    b.debit += item.line.debit || 0;
    b.credit += item.line.credit || 0;
    b.balance = b.debit - b.credit;
  }
  return map;
}

export interface NewEntryInput {
  entryDate: string;
  description: string;
  source?: string;
  lines: { account_id: string; department_id?: string | null; description?: string | null; debit?: number; credit?: number }[];
}

export async function createJournalEntry(db: DbAdapter, user: Row, input: NewEntryInput, opts?: { approvedBy?: string | null }): Promise<Row> {
  const totalDebit = input.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = input.lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(`Journal entry is not balanced: debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}`);
  }
  if (input.lines.length < 2) {
    throw new Error('A journal entry requires at least two lines');
  }
  const year = fiscalYearOf(input.entryDate);
  const entryNumber = await journalNumber(year);
  const entry = {
    id: uuid(),
    entry_number: entryNumber,
    entry_date: input.entryDate,
    fiscal_year: year,
    period: periodOf(input.entryDate),
    description: input.description,
    status: 'DRAFT',
    source: input.source || 'MANUAL',
    created_by: user.id,
    approved_by: opts?.approvedBy || null,
    approved_at: opts?.approvedBy ? nowIso() : null,
    posted_at: null,
    reversed_of_id: null,
    reversal_entry_id: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await db.insert('journal_entries', entry);
  const lines = input.lines.map((l, i) => ({
    id: uuid(),
    entry_id: entry.id,
    line_no: i + 1,
    account_id: l.account_id,
    department_id: l.department_id || null,
    description: l.description || null,
    debit: l.debit || 0,
    credit: l.credit || 0,
  }));
  await db.insert('journal_lines', lines);
  await auditLog({ user, action: 'CREATE', entity: 'journal_entry', entityId: entry.id, newValue: entry });
  return { ...entry, lines };
}

export async function approveEntry(db: DbAdapter, user: Row, entry: Row): Promise<Row> {
  if (entry.status !== 'DRAFT') throw new Error('Only draft entries can be approved');
  const updated = await db.update('journal_entries', { id: entry.id }, {
    approved_by: user.id,
    approved_at: nowIso(),
    updated_at: nowIso(),
  });
  await auditLog({ user, action: 'APPROVE', entity: 'journal_entry', entityId: entry.id });
  return updated || entry;
}

export async function postEntry(db: DbAdapter, user: Row, entry: Row): Promise<Row> {
  if (entry.status !== 'DRAFT') throw new Error(`Cannot post entry with status ${entry.status}`);
  const lines = await db.select('journal_lines', { where: { entry_id: entry.id } });
  const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(debit - credit) > 0.005) {
    throw new Error('Cannot post an unbalanced entry');
  }
  const updated = await db.update('journal_entries', { id: entry.id }, {
    status: 'POSTED',
    posted_at: nowIso(),
    updated_at: nowIso(),
  });
  await auditLog({ user, action: 'POST', entity: 'journal_entry', entityId: entry.id });
  return updated || entry;
}

export async function reverseEntry(db: DbAdapter, user: Row, entry: Row): Promise<Row> {
  if (entry.status !== 'POSTED') throw new Error('Only posted entries can be reversed');
  const lines = await db.select('journal_lines', { where: { entry_id: entry.id } });
  const reversalEntryNumber = await journalNumber(fiscalYearOf(entry.entry_date));
  const reversal = {
    id: uuid(),
    entry_number: reversalEntryNumber,
    entry_date: isoDate(new Date()),
    fiscal_year: fiscalYearOf(new Date()),
    period: periodOf(new Date()),
    description: `REVERSAL of ${entry.entry_number}: ${entry.description}`,
    status: 'POSTED',
    source: 'REVERSAL',
    created_by: user.id,
    approved_by: null,
    approved_at: null,
    posted_at: nowIso(),
    reversed_of_id: entry.id,
    reversal_entry_id: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await db.insert('journal_entries', reversal);
  const revLines = lines.map((l, i) => ({
    id: uuid(),
    entry_id: reversal.id,
    line_no: i + 1,
    account_id: l.account_id,
    department_id: l.department_id,
    description: l.description,
    debit: l.credit || 0,
    credit: l.debit || 0,
  }));
  await db.insert('journal_lines', revLines);
  await db.update('journal_entries', { id: entry.id }, {
    status: 'REVERSED',
    reversal_entry_id: reversal.id,
    updated_at: nowIso(),
  });
  await auditLog({ user, action: 'REVERSE', entity: 'journal_entry', entityId: entry.id });
  return reversal;
}

export async function postLinesToLedger(
  db: DbAdapter,
  user: Row,
  date: string,
  description: string,
  lines: { account_id: string; department_id?: string | null; description?: string; debit?: number; credit?: number }[],
  opts?: { approve?: boolean }
): Promise<Row> {
  const entry = await createJournalEntry(db, user, {
    entryDate: date,
    description,
    source: opts?.approve ? 'SYSTEM' : 'MANUAL',
    lines,
  }, { approvedBy: opts?.approve ? user.id : null });
  return postEntry(db, user, entry);
}
