import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Filter } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Badge, EmptyState, LoadingBlock } from '../components/ui';
import type { JournalEntry } from '../api/types';
import { fmtMoney, fmtDate } from '../lib/format';

export default function JournalList() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');

  const canCreate = !!user && ['SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER', 'ACCOUNTANT'].includes(user.role);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<JournalEntry[]>('/journals?limit=500');
      setEntries(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (status && e.status !== status) return false;
      if (source && e.source !== source) return false;
      if (search && !e.entry_number.toLowerCase().includes(search.toLowerCase()) && !e.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [entries, status, source, search]);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Journal Entries"
        sub={`${entries.length} entries`}
        actions={
          canCreate && (
            <Link to="/journals/new" className="btn btn-primary">
              <Plus size={15} /> New journal entry
            </Link>
          )
        }
      />

      <div className="filter-bar">
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="POSTED">Posted</option>
          <option value="REVERSED">Reversed</option>
        </select>
        <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          <option value="MANUAL">Manual</option>
          <option value="SYSTEM">System</option>
          <option value="INVOICE">Invoice</option>
          <option value="PAYMENT">Payment</option>
          <option value="PETTY_CASH">Petty Cash</option>
          <option value="DEPRECIATION">Depreciation</option>
          <option value="REVERSAL">Reversal</option>
        </select>
        <input className="input" placeholder="Search entry # or description…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 240 }} />
      </div>

      {filtered.length === 0 && <EmptyState title="No journal entries found" sub="Create a new journal entry to get started" />}

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Entry</th>
                <th>Date</th>
                <th>Description</th>
                <th>Source</th>
                <th>Status</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
                <th className="actions">Created by</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const debit = e.lines.reduce((s, l) => s + (l.debit || 0), 0);
                const credit = e.lines.reduce((s, l) => s + (l.credit || 0), 0);
                return (
                  <tr key={e.id}>
                    <td><Link to={`/journals/${e.id}`} className="code-pill">{e.entry_number}</Link></td>
                    <td>{fmtDate(e.entry_date)}</td>
                    <td style={{ maxWidth: 320 }}>
                      <Link to={`/journals/${e.id}`} style={{ color: 'var(--text)', fontWeight: 500 }}>{e.description}</Link>
                    </td>
                    <td className="muted">{e.source}</td>
                    <td><Badge status={e.status} /></td>
                    <td className="num">{fmtMoney(debit)}</td>
                    <td className="num">{fmtMoney(credit)}</td>
                    <td className="actions muted">{e.created_by_user || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
