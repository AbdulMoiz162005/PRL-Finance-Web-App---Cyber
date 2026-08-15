import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api/client';
import { LoadingBlock, Badge, TypeTag, EmptyState } from '../components/ui';
import type { Account } from '../api/types';
import { fmtMoney, fmtDate, yearStart, today } from '../lib/format';

interface GlRow {
  entry_id: string;
  entry_number: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export default function AccountDetail() {
  const { id } = useParams();
  const [account, setAccount] = useState<Account | null>(null);
  const [rows, setRows] = useState<GlRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [acc] = await Promise.all([
          api.get<Account[]>('/accounts').then((list) => list.find((a) => a.id === id)),
          api.get<{ rows: GlRow[] }>(`/accounts/${id}/ledger?from=${yearStart()}&to=${today()}`),
        ]);
        setAccount(acc || null);
        setRows((await api.get<{ rows: GlRow[] }>(`/accounts/${id}/ledger?from=${yearStart()}&to=${today()}`)).rows);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <LoadingBlock />;
  if (!account) return <EmptyState title="Account not found" />;

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const ending = rows.length ? rows[rows.length - 1].balance : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/accounts" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 8 }} className="link-btn">
            <ArrowLeft size={13} /> Chart of Accounts
          </Link>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="code-pill">{account.code}</span> {account.name}
            <TypeTag type={account.type} />
            {account.is_active ? <Badge status="ACTIVE" label="Active" /> : <Badge status="DISABLED" label="Inactive" />}
          </h2>
          <div className="ph-sub">General ledger · {yearStart()} – {today()}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="s-label" style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Current balance</div>
          <div style={{ fontSize: 22, fontWeight: 800 }} className={ending < 0 ? 'neg' : 'pos'}>{fmtMoney(ending)}</div>
        </div>
      </div>

      <div className="stat-grid">
        <StatMini label="Total debits" value={fmtMoney(totalDebit)} />
        <StatMini label="Total credits" value={fmtMoney(totalCredit)} />
        <StatMini label="Transactions" value={String(rows.length)} />
        <StatMini label="Normal balance" value={account.normal_balance} />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Ledger transactions</div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Entry</th>
                <th>Description</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th className="num">Running balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.entry_id}-${r.entry_number}`}>
                  <td>{fmtDate(r.date)}</td>
                  <td><Link to={`/journals/${r.entry_id}`} className="code-pill">{r.entry_number}</Link></td>
                  <td>{r.description}</td>
                  <td className="num">{r.debit ? fmtMoney(r.debit) : ''}</td>
                  <td className="num">{r.credit ? fmtMoney(r.credit) : ''}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td colSpan={3} style={{ fontWeight: 700 }}>Totals</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(totalDebit)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(totalCredit)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {rows.length === 0 && <EmptyState title="No posted transactions" sub="This account has no activity in the selected period" />}
      </div>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="card card-pad">
      <div className="s-label" style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  );
}
