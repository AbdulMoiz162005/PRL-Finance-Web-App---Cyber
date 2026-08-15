import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';
import { api, downloadCsv } from '../api/client';
import { PageHeader, Tabs, TypeTag, EmptyState, LoadingBlock, Badge } from '../components/ui';
import { fmtMoney, fmtDate, fmtCompact, yearStart, today, monthStart } from '../lib/format';

type TabKey = 'pnl' | 'balance-sheet' | 'cash-flow' | 'aging' | 'budget' | 'dept';

interface PnlRow { account: { code: string; name: string }; amount: number }
interface Pnl { from: string; to: string; revenues: PnlRow[]; expenses: PnlRow[]; totalRevenue: number; totalExpenses: number; grossProfit: number; netIncome: number }
interface BsRow { account: { code: string; name: string; type: string }; amount: number }
interface Bs { asOf: string; assets: BsRow[]; liabilities: BsRow[]; equityAccounts: BsRow[]; netIncome: number; retained: number; totalAssets: number; totalLiabilities: number; totalEquity: number }
interface Cf { from: string; to: string; netIncome: number; depreciation: number; changes: Record<string, number>; operating: number; investing: number; financing: number; netChange: number; cashStart: number; cashEnd: number }
interface AgingRow { invoice_number: string; party: string; invoice_date: string; due_date: string; days_overdue: number; status: string; total: number; outstanding: number; bucket: string }
interface Aging { kind: string; buckets: Record<string, { count: number; total: number }>; rows: AgingRow[]; totalOutstanding: number }
interface BudgetRow { account_code: string; account_name: string; budget: number; actual: number; variance: number; utilization: number }
interface Budget { year: number; rows: BudgetRow[]; totalBudget: number; totalActual: number }
interface DeptRow { id: string; name: string; amount: number }
interface Dept { from: string; to: string; rows: DeptRow[]; total: number }

const BUCKET_ORDER = ['current', '1-30', '31-60', '61-90', '90+'];
const BUCKET_LABEL: Record<string, string> = { current: 'Current', '1-30': '1–30 days', '31-60': '31–60 days', '61-90': '61–90 days', '90+': '90+ days' };

export default function Reports() {
  const [tab, setTab] = useState<TabKey>('pnl');
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [asOf, setAsOf] = useState(today());
  const [year, setYear] = useState(new Date().getFullYear());
  const [kind, setKind] = useState<'AP' | 'AR'>('AR');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    let url = '';
    if (tab === 'pnl') url = `/reports/pnl?from=${from}&to=${to}`;
    else if (tab === 'balance-sheet') url = `/reports/balance-sheet?asOf=${asOf}`;
    else if (tab === 'cash-flow') url = `/reports/cash-flow?from=${from}&to=${to}`;
    else if (tab === 'aging') url = `/reports/aging?kind=${kind}&asOf=${asOf}`;
    else if (tab === 'budget') url = `/reports/budget-vs-actual?year=${year}`;
    else url = `/reports/department-spend?from=${from}&to=${to}`;
    api.get(url).then(setData).finally(() => setLoading(false));
  }, [tab, from, to, asOf, year, kind]);

  const csvUrl = {
    pnl: '/reports/pnl.csv',
    'balance-sheet': '',
    'cash-flow': '',
    aging: '/reports/aging.csv',
    budget: '',
    dept: '',
  }[tab];

  return (
    <div>
      <PageHeader
        title="Financial Reports"
        sub="Income statement, balance sheet, cash flow and analysis"
        actions={
          csvUrl ? (
            <button className="btn btn-secondary" onClick={() => downloadCsv(csvUrl, `${tab}.csv`)}>
              <Download size={15} /> Export CSV
            </button>
          ) : undefined
        }
      />

      <Tabs
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: 'pnl', label: 'Profit & Loss' },
          { key: 'balance-sheet', label: 'Balance Sheet' },
          { key: 'cash-flow', label: 'Cash Flow' },
          { key: 'aging', label: 'Aging' },
          { key: 'budget', label: 'Budget vs Actual' },
          { key: 'dept', label: 'Department Spend' },
        ]}
      />

      <div className="filter-bar">
        {(tab === 'pnl' || tab === 'cash-flow' || tab === 'dept') && (
          <>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="muted">to</span>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        {(tab === 'balance-sheet' || tab === 'aging') && (
          <input type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        )}
        {tab === 'aging' && (
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as 'AP' | 'AR')}>
            <option value="AR">Accounts Receivable</option>
            <option value="AP">Accounts Payable</option>
          </select>
        )}
        {tab === 'budget' && (
          <select className="select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? <LoadingBlock /> : (
        <>
          {tab === 'pnl' && <PnlReport data={data as Pnl} />}
          {tab === 'balance-sheet' && <BsReport data={data as Bs} />}
          {tab === 'cash-flow' && <CfReport data={data as Cf} />}
          {tab === 'aging' && <AgingReport data={data as Aging} />}
          {tab === 'budget' && <BudgetReport data={data as Budget} />}
          {tab === 'dept' && <DeptReport data={data as Dept} />}
        </>
      )}
    </div>
  );
}

function PnlReport({ data }: { data: Pnl }) {
  if (!data) return null;
  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-header"><div className="card-title">Revenue</div></div>
        <div style={{ padding: '8px 20px' }}>
          {data.revenues.map((r) => (
            <div key={r.account.code} className="summary-line">
              <span><span className="code-pill">{r.account.code}</span> {r.account.name}</span>
              <span style={{ fontWeight: 600 }}>{fmtMoney(r.amount)}</span>
            </div>
          ))}
          {data.revenues.length === 0 && <EmptyState title="No revenue in period" />}
          <div className="summary-line total">
            <span>Total revenue</span><span>{fmtMoney(data.totalRevenue)}</span>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Expenses</div></div>
        <div style={{ padding: '8px 20px' }}>
          {data.expenses.map((r) => (
            <div key={r.account.code} className="summary-line">
              <span><span className="code-pill">{r.account.code}</span> {r.account.name}</span>
              <span style={{ fontWeight: 600 }}>{fmtMoney(r.amount)}</span>
            </div>
          ))}
          {data.expenses.length === 0 && <EmptyState title="No expenses in period" />}
          <div className="summary-line total">
            <span>Total expenses</span><span>{fmtMoney(data.totalExpenses)}</span>
          </div>
        </div>
      </div>
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div style={{ padding: '16px 20px', display: 'flex', gap: 40, flexWrap: 'wrap' }}>
          <Summary label="Gross profit" value={data.grossProfit} />
          <Summary label="Net income" value={data.netIncome} />
          <Summary label="Margin" value={`${data.totalRevenue ? ((data.netIncome / data.totalRevenue) * 100).toFixed(1) : 0}%`} />
          <div className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>{fmtDate(data.from)} → {fmtDate(data.to)}</div>
        </div>
      </div>
    </div>
  );
}

function BsReport({ data }: { data: Bs }) {
  if (!data) return null;
  const show = (rows: BsRow[], total: number) => (
    <div style={{ padding: '8px 20px' }}>
      {rows.map((r) => (
        <div key={r.account.code} className="summary-line">
          <span><span className="code-pill">{r.account.code}</span> {r.account.name}</span>
          <span style={{ fontWeight: 600 }}>{fmtMoney(r.amount)}</span>
        </div>
      ))}
      <div className="summary-line total"><span>Subtotal</span><span>{fmtMoney(total)}</span></div>
    </div>
  );
  const balanced = Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)) < 1;
  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-header">
          <div className="card-title">Assets</div>
          {balanced && <Badge status="ACTIVE" label="Balanced" />}
        </div>
        {show(data.assets, data.totalAssets)}
      </div>
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><div className="card-title">Liabilities</div></div>
          {show(data.liabilities, data.totalLiabilities)}
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Equity</div></div>
          <div style={{ padding: '8px 20px' }}>
            {data.equityAccounts.map((r) => (
              <div key={r.account.code} className="summary-line">
                <span><span className="code-pill">{r.account.code}</span> {r.account.name}</span>
                <span style={{ fontWeight: 600 }}>{fmtMoney(r.amount)}</span>
              </div>
            ))}
            {data.retained !== 0 && (
              <div className="summary-line">
                <span>Retained earnings</span><span style={{ fontWeight: 600 }}>{fmtMoney(data.retained)}</span>
              </div>
            )}
            {data.netIncome !== 0 && (
              <div className="summary-line">
                <span>Net income YTD</span><span style={{ fontWeight: 600 }}>{fmtMoney(data.netIncome)}</span>
              </div>
            )}
            <div className="summary-line total"><span>Total equity</span><span>{fmtMoney(data.totalEquity)}</span></div>
          </div>
        </div>
      </div>
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <div style={{ padding: '16px 20px', display: 'flex', gap: 40, flexWrap: 'wrap' }}>
          <Summary label="Total assets" value={data.totalAssets} />
          <Summary label="Total liabilities" value={data.totalLiabilities} />
          <Summary label="Total equity" value={data.totalEquity} />
          <Summary label="L + E" value={data.totalLiabilities + data.totalEquity} />
          <div className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>As of {fmtDate(data.asOf)}</div>
        </div>
      </div>
    </div>
  );
}

function CfReport({ data }: { data: Cf }) {
  if (!data) return null;
  const rows: { label: string; amount: number; bold?: boolean }[] = [
    { label: 'Net income', amount: data.netIncome },
    { label: 'Depreciation', amount: data.depreciation },
    { label: 'Change in accounts receivable', amount: data.changes.accountsReceivable },
    { label: 'Change in inventory', amount: data.changes.inventory },
    { label: 'Change in prepayments', amount: data.changes.prepayments },
    { label: 'Change in other assets', amount: data.changes.otherAssets },
    { label: 'Change in accounts payable', amount: data.changes.accountsPayable },
    { label: 'Change in other current liabilities', amount: data.changes.otherCurrentLiabilities },
    { label: 'Net cash from operations', amount: data.operating, bold: true },
    { label: 'Net cash used in investing', amount: data.investing, bold: true },
    { label: 'Net cash used in financing', amount: data.financing, bold: true },
    { label: 'Net change in cash', amount: data.netChange, bold: true },
  ];
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Statement of Cash Flows</div>
        <div className="card-sub">{fmtDate(data.from)} → {fmtDate(data.to)}</div>
      </div>
      <div style={{ padding: '8px 20px', maxWidth: 620 }}>
        {rows.map((r) => (
          <div key={r.label} className={`summary-line ${r.bold ? 'total' : ''}`}>
            <span>{r.label}</span>
            <span style={{ fontWeight: r.bold ? 700 : 600 }} className={r.amount < 0 ? 'neg' : 'pos'}>{fmtMoney(r.amount)}</span>
          </div>
        ))}
        <div className="summary-line" style={{ borderTop: '2px solid var(--border-strong)', marginTop: 8, paddingTop: 10 }}>
          <span>Cash at start</span><span style={{ fontWeight: 600 }}>{fmtMoney(data.cashStart)}</span>
        </div>
        <div className="summary-line">
          <span>Cash at end</span><span style={{ fontWeight: 800 }}>{fmtMoney(data.cashEnd)}</span>
        </div>
      </div>
    </div>
  );
}

function AgingReport({ data }: { data: Aging }) {
  if (!data) return null;
  const chart = BUCKET_ORDER.filter((b) => (data.buckets[b]?.total || 0) > 0).map((b) => ({
    name: BUCKET_LABEL[b], amount: data.buckets[b].total,
  }));
  return (
    <div>
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">{data.kind === 'AR' ? 'Receivables' : 'Payables'} Aging Summary</div></div>
          <div style={{ padding: '8px 20px' }}>
            {BUCKET_ORDER.map((b) => (
              <div key={b} className="summary-line">
                <span>{BUCKET_LABEL[b]}</span>
                <span style={{ fontWeight: 600 }}>{fmtMoney(data.buckets[b]?.total || 0)}</span>
              </div>
            ))}
            <div className="summary-line total"><span>Total outstanding</span><span>{fmtMoney(data.totalOutstanding)}</span></div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Bucket distribution</div></div>
          <div style={{ padding: 12, height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCompact(v, '')} axisLine={false} tickLine={false} width={55} />
                <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
                <Bar dataKey="amount" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Aging detail</div></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>{data.kind === 'AR' ? 'Customer' : 'Vendor'}</th>
                <th>Invoice date</th>
                <th>Due date</th>
                <th className="num">Days overdue</th>
                <th>Bucket</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th className="num">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.invoice_number}>
                  <td><span className="code-pill">{r.invoice_number}</span></td>
                  <td style={{ fontWeight: 500 }}>{r.party}</td>
                  <td>{fmtDate(r.invoice_date)}</td>
                  <td>{fmtDate(r.due_date)}</td>
                  <td className={r.days_overdue > 0 ? 'num neg' : 'num muted'}>{r.days_overdue}</td>
                  <td>{BUCKET_LABEL[r.bucket]}</td>
                  <td><Badge status={r.status} /></td>
                  <td className="num">{fmtMoney(r.total)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(r.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.rows.length === 0 && <EmptyState title="No outstanding invoices" />}
      </div>
    </div>
  );
}

function BudgetReport({ data }: { data: Budget }) {
  if (!data) return null;
  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ padding: '16px 20px', display: 'flex', gap: 40, flexWrap: 'wrap' }}>
          <Summary label="Total budget" value={data.totalBudget} />
          <Summary label="Total actual" value={data.totalActual} />
          <Summary label="Variance" value={data.totalBudget - data.totalActual} />
          <Summary label="Utilization" value={`${data.totalBudget ? ((data.totalActual / data.totalBudget) * 100).toFixed(1) : 0}%`} />
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th className="num">Budget</th>
                <th className="num">Actual</th>
                <th className="num">Variance</th>
                <th style={{ width: 180 }}>Utilization</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.account_code}>
                  <td><span className="code-pill">{r.account_code}</span> {r.account_name}</td>
                  <td className="num">{fmtMoney(r.budget)}</td>
                  <td className="num">{fmtMoney(r.actual)}</td>
                  <td className={`num ${r.variance < 0 ? 'neg' : 'pos'}`} style={{ fontWeight: 600 }}>{fmtMoney(r.variance)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, r.utilization)}%`, height: '100%', background: r.utilization > 100 ? 'var(--red)' : 'var(--primary)', borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, width: 46, textAlign: 'right' }}>{r.utilization}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.rows.length === 0 && <EmptyState title="No budget lines for this year" />}
      </div>
    </div>
  );
}

function DeptReport({ data }: { data: Dept }) {
  if (!data) return null;
  const chart = data.rows.slice(0, 8).map((r) => ({ name: r.name, amount: r.amount }));
  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-header"><div className="card-title">Spend by department</div></div>
        <div style={{ padding: 12, height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCompact(v, '')} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
              <Bar dataKey="amount" fill="#7c3aed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Detail</div></div>
        <div style={{ padding: '8px 20px' }}>
          {data.rows.map((r) => (
            <div key={r.id} className="summary-line">
              <span>{r.name}</span>
              <span style={{ fontWeight: 600 }}>{fmtMoney(r.amount)}</span>
            </div>
          ))}
          <div className="summary-line total"><span>Total</span><span>{fmtMoney(data.total)}</span></div>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="s-label" style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }} className={typeof value === 'number' && value < 0 ? 'neg' : ''}>{typeof value === 'number' ? fmtMoney(value) : value}</div>
    </div>
  );
}
