import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../components/Toast';
import { PageHeader } from '../components/ui';
import type { Account } from '../api/types';
import { today } from '../lib/format';

interface Line {
  account_id: string;
  department_id: string;
  description: string;
  debit: string;
  credit: string;
}

export default function JournalNew() {
  const { notify } = useToast();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<Line[]>([
    { account_id: '', department_id: '', description: '', debit: '', credit: '' },
    { account_id: '', department_id: '', description: '', debit: '', credit: '' },
  ]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Account[]>('/accounts').then(setAccounts).catch(() => {});
    api.get<{ id: string; name: string }[]>('/departments').then(setDepartments).catch(() => {});
  }, []);

  const totalDebit = useMemo(() => lines.reduce((s, l) => s + (Number(l.debit) || 0), 0), [lines]);
  const totalCredit = useMemo(() => lines.reduce((s, l) => s + (Number(l.credit) || 0), 0), [lines]);
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
  const valid = lines.every((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0)) && lines.length >= 2;

  const setLine = (i: number, k: keyof Line, v: string) => {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  };

  const addLine = () => setLines((ls) => [...ls, { account_id: '', department_id: '', description: '', debit: '', credit: '' }]);

  const removeLine = (i: number) => {
    if (lines.length <= 2) return;
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (diff !== 0) {
      notify('error', 'Journal does not balance', `Debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}`);
      return;
    }
    setBusy(true);
    try {
      const created = await api.post<{ id: string; entry_number: string }>('/journals', {
        entry_date: date,
        description,
        lines: lines.map((l) => ({
          account_id: l.account_id,
          department_id: l.department_id || null,
          description: l.description || null,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })),
      });
      notify('success', `Entry ${created.entry_number} created`, 'Submit for approval to proceed');
      navigate(`/journals/${created.id}`);
    } catch (err: any) {
      notify('error', 'Failed to create entry', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="New Journal Entry"
        sub="Record a manual journal entry — debits must equal credits"
      />

      <form onSubmit={submit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><div className="card-title">Entry details</div></div>
          <div className="card-pad">
            <div className="form-grid">
              <div className="field">
                <label>Entry date <span className="req">*</span></label>
                <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="field">
                <label>Description <span className="req">*</span></label>
                <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Monthly diesel stock adjustment" required minLength={3} />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Journal lines</div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addLine}>
              <Plus size={14} /> Add line
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 240 }}>Account</th>
                  <th style={{ width: 170 }}>Department</th>
                  <th>Description</th>
                  <th className="num" style={{ width: 130 }}>Debit</th>
                  <th className="num" style={{ width: 130 }}>Credit</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select className="select" value={l.account_id} onChange={(e) => setLine(i, 'account_id', e.target.value)} required>
                        <option value="">Select account…</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select className="select" value={l.department_id} onChange={(e) => setLine(i, 'department_id', e.target.value)}>
                        <option value="">—</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="input" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} placeholder="Line detail" />
                    </td>
                    <td>
                      <input type="number" step="0.01" min="0" className="input" style={{ textAlign: 'right' }} value={l.debit} onChange={(e) => setLine(i, 'debit', e.target.value)} />
                    </td>
                    <td>
                      <input type="number" step="0.01" min="0" className="input" style={{ textAlign: 'right' }} value={l.credit} onChange={(e) => setLine(i, 'credit', e.target.value)} />
                    </td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => removeLine(i)} disabled={lines.length <= 2} title="Remove line">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td colSpan={3} style={{ fontWeight: 700 }}>Totals</td>
                  <td className="num" style={{ fontWeight: 700 }}>{totalDebit.toFixed(2)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{totalCredit.toFixed(2)}</td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={6}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>Balance</span>
                      <span style={{ fontWeight: 700, fontSize: 15 }} className={diff === 0 ? 'pos' : 'neg'}>
                        {diff === 0 ? '✓ Balanced' : diff.toFixed(2)}
                      </span>
                      {diff !== 0 && <span className="muted" style={{ fontSize: 12 }}>Debits must equal credits</span>}
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/journals')}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !valid || diff !== 0}>
            {busy ? 'Creating…' : 'Create entry (draft)'}
          </button>
        </div>
      </form>
    </div>
  );
}
