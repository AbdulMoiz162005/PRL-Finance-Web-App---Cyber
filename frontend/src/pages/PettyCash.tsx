import { useEffect, useState } from 'react';
import { Plus, Eye, Pencil } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { PageHeader, Modal, Badge, EmptyState, LoadingBlock } from '../components/ui';
import type { PettyCashFund, User } from '../api/types';
import { fmtMoney, fmtDate, today } from '../lib/format';

export default function PettyCash() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [funds, setFunds] = useState<PettyCashFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  const canManage = !!user && ['SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER'].includes(user.role);
  const canTx = !!user && ['CASHIER', 'SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER', 'ACCOUNTANT'].includes(user.role);

  const load = async () => {
    setLoading(true);
    try {
      setFunds(await api.get<PettyCashFund[]>('/petty-cash'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const total = funds.reduce((s, f) => s + (f.current_balance || 0), 0);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Petty Cash"
        sub={`${funds.length} funds · balance ${fmtMoney(total)}`}
        actions={
          canManage && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={15} /> New fund
            </button>
          )
        }
      />

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fund</th>
                <th>Custodian</th>
                <th className="num">Opening</th>
                <th className="num">Current balance</th>
                <th>Status</th>
                <th className="actions"></th>
              </tr>
            </thead>
            <tbody>
              {funds.map((f) => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 600 }}>{f.name} <span className="code-pill">{f.fund_code}</span></td>
                  <td className="muted">{f.custodian || '—'}</td>
                  <td className="num">{fmtMoney(f.opening_balance)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(f.current_balance || 0)}</td>
                  <td>{f.is_active ? <Badge status="ACTIVE" label="Active" /> : <Badge status="DISABLED" label="Inactive" />}</td>
                  <td className="actions">
                    {canTx && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setViewId(f.id)}><Eye size={13} /> Transactions</button>
                    )}
                    {canManage && (
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowForm(true)}><Pencil size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {funds.length === 0 && <EmptyState title="No petty cash funds" />}
      </div>

      <FundForm open={showForm} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
      <FundDetail id={viewId} onClose={() => setViewId(null)} onChanged={load} />
    </div>
  );
}

function FundForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<any>({ name: '', custodian_id: '', opening_balance: '500' });

  useEffect(() => {
    if (!open) return;
    api.get<User[]>('/users').then(setUsers).catch(() => {});
    setForm({ name: '', custodian_id: '', opening_balance: '500' });
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/petty-cash', {
        name: form.name,
        custodian_id: form.custodian_id || null,
        opening_balance: Number(form.opening_balance) || 0,
      });
      onSaved();
    } catch (err: any) {
      notify('error', 'Failed to create fund', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New petty cash fund">
      <form onSubmit={submit}>
        <div className="field">
          <label>Fund name <span className="req">*</span></label>
          <input className="input" value={form.name} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="e.g. Operations Imprest" required />
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Custodian</label>
            <select className="select" value={form.custodian_id} onChange={(e) => setForm((f: any) => ({ ...f, custodian_id: e.target.value }))}>
              <option value="">—</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Opening balance</label>
            <input type="number" step="0.01" min="0" className="input" value={form.opening_balance} onChange={(e) => setForm((f: any) => ({ ...f, opening_balance: e.target.value }))} />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create fund'}</button>
        </div>
      </form>
    </Modal>
  );
}

function FundDetail({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { notify } = useToast();
  const [data, setData] = useState<any>(null);
  const [showTx, setShowTx] = useState(false);
  const [tx, setTx] = useState<any>({ tx_date: today(), kind: 'EXPENSE', description: '', amount: '', receipt_ref: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setData(null);
    api.get<any>(`/petty-cash/${id}`).then(setData).catch(() => {});
  }, [id]);

  const recordTx = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/petty-cash/${id}/transactions`, {
        tx_date: tx.tx_date,
        kind: tx.kind,
        description: tx.description,
        amount: Number(tx.amount),
        receipt_ref: tx.receipt_ref || null,
      });
      notify('success', 'Transaction recorded');
      setShowTx(false);
      setData(await api.get<any>(`/petty-cash/${id}`));
      onChanged();
    } catch (err: any) {
      notify('error', 'Failed to record transaction', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!id} onClose={onClose} title={data ? `${data.name} (${data.fund_code})` : 'Fund'} wide>
      {!data ? (
        <LoadingBlock />
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <span className="muted">Custodian: {data.custodian || '—'}</span>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{fmtMoney(data.current_balance || 0)}</div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowTx(true)}><Plus size={14} /> Record transaction</button>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Kind</th>
                  <th>Description</th>
                  <th>Receipt</th>
                  <th className="num">Amount</th>
                  <th className="actions">By</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t: any) => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.tx_date)}</td>
                    <td><Badge status={t.kind === 'EXPENSE' ? 'RED' : 'ACTIVE'} label={t.kind} /></td>
                    <td>{t.description}</td>
                    <td className="muted">{t.receipt_ref || '—'}</td>
                    <td className={`num ${t.kind === 'EXPENSE' ? 'neg' : 'pos'}`} style={{ fontWeight: 700 }}>
                      {t.kind === 'EXPENSE' ? '-' : '+'}{fmtMoney(t.amount)}
                    </td>
                    <td className="actions muted">{t.created_by_user || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.transactions.length === 0 && <EmptyState title="No transactions" />}
        </div>
      )}

      <Modal open={showTx} onClose={() => setShowTx(false)} title="Record petty cash transaction">
        <form onSubmit={recordTx}>
          <div className="form-grid">
            <div className="field">
              <label>Type</label>
              <select className="select" value={tx.kind} onChange={(e) => setTx((f: any) => ({ ...f, kind: e.target.value }))}>
                <option value="EXPENSE">Expense</option>
                <option value="TOPUP">Top-up</option>
                <option value="REPLENISH">Replenish</option>
              </select>
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" className="input" value={tx.tx_date} onChange={(e) => setTx((f: any) => ({ ...f, tx_date: e.target.value }))} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Description <span className="req">*</span></label>
              <input className="input" value={tx.description} onChange={(e) => setTx((f: any) => ({ ...f, description: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Amount <span className="req">*</span></label>
              <input type="number" step="0.01" min="0.01" className="input" value={tx.amount} onChange={(e) => setTx((f: any) => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Receipt ref</label>
              <input className="input" value={tx.receipt_ref} onChange={(e) => setTx((f: any) => ({ ...f, receipt_ref: e.target.value }))} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowTx(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Record'}</button>
          </div>
        </form>
      </Modal>
    </Modal>
  );
}
