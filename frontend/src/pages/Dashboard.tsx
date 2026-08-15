import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Legend, PieChart, Pie, Cell,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, Receipt, FileText,
  Clock, CheckCircle2, AlertTriangle, Users, Building2, PiggyBank,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { StatCard, Badge, LoadingBlock } from '../components/ui';
import { fmtMoney, fmtCompact, yearStart, today } from '../lib/format';

interface DashData {
  kpi: Record<string, number>;
  counts: Record<string, number | any[]>;
  monthly: { month: number; label: string; revenue: number; expenses: number; net: number }[];
  receivableBuckets: { label: string; amount: number }[];
  payableBuckets: { label: string; amount: number }[];
  revenueAccounts: number;
  expenseAccounts: number;
}

const PIE_COLORS = ['#1d4ed8', '#7c3aed', '#0d9488', '#d97706', '#dc2626', '#0891b2', '#16a34a', '#6b7280'];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    api.get<DashData>('/dashboard').then(setData).catch(() => {});
  }, []);

  if (!data) return <LoadingBlock />;

  const k = data.kpi;
  const c = data.counts;
  const last = data.monthly[data.monthly.length - 1]?.net || 0;

  const buckets = [
    ...data.receivableBuckets.map((b) => ({ ...b, key: `AR ${b.label}` })),
    ...data.payableBuckets.map((b) => ({ ...b, key: `AP ${b.label}` })),
  ];

  const pnlData = data.monthly.map((m) => ({
    label: m.label,
    Revenue: m.revenue,
    Expenses: m.expenses,
    Net: m.net,
  }));

  const cards = [
    { label: 'Revenue YTD', value: fmtMoney(k.revenueYTD), icon: <TrendingUp />, color: '#16a34a', to: '/reports' },
    { label: 'Expenses YTD', value: fmtMoney(k.expensesYTD), icon: <TrendingDown />, color: '#dc2626', to: '/reports' },
    { label: 'Net Income YTD', value: fmtMoney(k.netIncomeYTD), icon: <DollarSign />, color: '#1d4ed8', to: '/reports' },
    { label: 'Cash & Banks', value: fmtMoney(k.cashTotal), icon: <Wallet />, color: '#0d9488', to: '/bank-accounts' },
    { label: 'Receivables', value: fmtMoney(k.receivables), icon: <Receipt />, color: '#7c3aed', to: '/invoices' },
    { label: 'Payables', value: fmtMoney(k.payables), icon: <FileText />, color: '#d97706', to: '/invoices' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Welcome back, {user?.full_name?.split(' ')[0]}</h2>
          <div className="ph-sub">
            Financial overview {yearStart()} – {today()}
          </div>
        </div>
      </div>

      <div className="stat-grid">
        {cards.map((card) => (
          <div key={card.label} onClick={() => navigate(card.to)} style={{ cursor: 'pointer' }}>
            <StatCard label={card.label} value={card.value} icon={card.icon} color={card.color} />
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Revenue vs Expenses — {new Date().getFullYear()}</div>
            <div className="card-sub">Monthly YTD</div>
          </div>
          <div style={{ padding: 12, height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pnlData}>
                <defs>
                  <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCompact(v, '')} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
                <Area type="monotone" dataKey="Revenue" stroke="#16a34a" fill="url(#gRev)" strokeWidth={2} />
                <Area type="monotone" dataKey="Expenses" stroke="#dc2626" fill="url(#gExp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Net Income Trend</div>
            <div className="card-sub">This month: {fmtMoney(k.netIncomeThisMonth)} · vs last {fmtMoney(k.revenueThisMonth - k.revenueLastMonth)}</div>
          </div>
          <div style={{ padding: 12, height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCompact(v, '')} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={(v: any) => fmtMoney(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Net" fill={last >= 0 ? '#1d4ed8' : '#dc2626'} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Receivables Aging</div>
            <Link to="/invoices" className="link-btn">View invoices</Link>
          </div>
          <div style={{ padding: 12, height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.receivableBuckets} dataKey="amount" nameKey="label" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {data.receivableBuckets.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any, n: any) => [`${fmtMoney(Number(v))}`, n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ padding: '0 20px 16px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {data.receivableBuckets.map((b, i) => (
              <span key={i} className="badge" style={{ background: `${PIE_COLORS[i % PIE_COLORS.length]}1a`, color: PIE_COLORS[i % PIE_COLORS.length] }}>
                {b.label}: {fmtCompact(b.amount)}
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Payables Aging</div>
            <Link to="/invoices" className="link-btn">View invoices</Link>
          </div>
          <div style={{ padding: 12, height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.payableBuckets} dataKey="amount" nameKey="label" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {data.payableBuckets.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[(i + 3) % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any, n: any) => [`${fmtMoney(Number(v))}`, n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ padding: '0 20px 16px', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {data.payableBuckets.map((b, i) => (
              <span key={i} className="badge" style={{ background: `${PIE_COLORS[(i + 3) % PIE_COLORS.length]}1a`, color: PIE_COLORS[(i + 3) % PIE_COLORS.length] }}>
                {b.label}: {fmtCompact(b.amount)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Operational Overview</div>
        </div>
        <div style={{ padding: 16 }}>
          <div className="grid-4" style={{ gap: 12 }}>
            <OverviewItem icon={<CheckCircle2 size={18} />} color="#2563eb" label="Posted entries" value={Number(c.postedEntries)} to="/journals" />
            <OverviewItem icon={<Clock size={18} />} color="#b45309" label="Draft entries" value={Number(c.draftEntries)} to="/journals" />
            <OverviewItem icon={<Receipt size={18} />} color="#7c3aed" label="Pending invoices" value={Number(c.pendingInvoices)} to="/invoices" />
            <OverviewItem icon={<AlertTriangle size={18} />} color="#dc2626" label="Overdue invoices" value={Number(c.overdueInvoices)} to="/invoices" />
            <OverviewItem icon={<Users size={18} />} color="#0d9488" label="Customers" value={Number(c.customers)} to="/customers" />
            <OverviewItem icon={<Building2 size={18} />} color="#d97706" label="Vendors" value={Number(c.vendors)} to="/vendors" />
            <OverviewItem icon={<PiggyBank size={18} />} color="#16a34a" label="Approved budgets" value={Number(c.approvedBudgets)} to="/budgets" />
            <OverviewItem icon={<FileText size={18} />} color="#6b7280" label="Chart accounts" value={Number(c.accounts)} to="/accounts" />
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewItem({ icon, color, label, value, to }: { icon: React.ReactNode; color: string; label: string; value: number; to: string }) {
  return (
    <Link to={to} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px', borderRadius: 10, background: 'var(--surface-2)' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{label}</div>
      </div>
    </Link>
  );
}
