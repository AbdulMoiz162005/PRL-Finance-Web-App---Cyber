import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api, downloadCsv } from '../api/client';
import { PageHeader, Badge, TypeTag, EmptyState, LoadingBlock } from '../components/ui';
import { fmtMoney, fmtDate, today, yearStart } from '../lib/format';

interface Row {
  id: string;
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
}

interface TB {
  asOf: string;
  rows: Row[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export default function TrialBalance() {
  const [data, setData] = useState<TB | null>(null);
  const [asOf, setAsOf] = useState(today());
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<TB>(`/reports/trial-balance?asOf=${asOf}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [asOf]);

  const rows = data?.rows.filter((r) => (type ? r.type === type : true)) || [];
  const totalDebit = data?.totalDebit || 0;
  const totalCredit = data?.totalCredit || 0;

  return (
    <div>
      <PageHeader
        title="Trial Balance"
        sub={data ? `As of ${fmtDate(data.asOf)}` : 'Verify debits and credits balance'}
        actions={
          <button className="btn btn-secondary" onClick={() => downloadCsv('/reports/trial-balance.csv', `trial-balance-${asOf}.csv`)}>
            <Download size={15} /> Export CSV
          </button>
        }
      />

      <div className="filter-bar">
        <input type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All account types</option>
          {['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {data && (
          <span className="badge" style={{ background: data.balanced ? 'var(--green-soft)' : 'var(--red-soft)', color: data.balanced ? 'var(--green)' : 'var(--red)' }}>
            {data.balanced ? '✓ Balanced' : '✗ Out of balance'}
          </span>
        )}
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><span className="code-pill">{r.code}</span></td>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td><TypeTag type={r.type} /></td>
                    <td className="num">{r.debit ? fmtMoney(r.debit) : ''}</td>
                    <td className="num">{r.credit ? fmtMoney(r.credit) : ''}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td colSpan={3} style={{ fontWeight: 700 }}>Totals</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(totalDebit)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(totalCredit)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(totalDebit - totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {rows.length === 0 && <EmptyState title="No accounts" />}
        </div>
      )}
    </div>
  );
}
