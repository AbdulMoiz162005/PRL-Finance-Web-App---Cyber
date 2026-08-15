import { useEffect, useState } from 'react';
import { Plus, RefreshCcw } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { PageHeader, Modal, Badge, EmptyState, LoadingBlock, Confirm } from '../components/ui';
import type { FixedAsset, Department } from '../api/types';
import { fmtMoney, fmtDate } from '../lib/format';

export default function Assets() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deprecateId, setDeprecateId] = useState<string | null>(null);

  const canManage = !!user && ['SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER', 'ACCOUNTANT'].includes(user.role);

  const load = async () => {
    setLoading(true);
    try {
      setAssets(await api.get<FixedAsset[]>('/assets'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (fn: () => Promise<any>, msg: string) => {
    try {
      const res = await fn();
      await load();
      notify('success', msg, res?.amount ? `Depreciation for this period: ${fmtMoney(res.amount)}` : undefined);
    } catch (err: any) {
      notify('error', 'Action failed', err.message);
    }
  };

  const bookValue = assets.reduce((s, a) => s + (a.cost || 0), 0);
  const accum = assets.reduce((s, a) => s + (a.accumulated_depreciation || 0), 0);
  const nbv = assets.reduce((s, a) => s + (a.net_book_value || 0), 0);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Fixed Assets"
        sub={`${assets.length} assets · NBV ${fmtMoney(nbv)}`}
        actions={
          canManage && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={15} /> Add asset
            </button>
          )
        }
      />

      <div className="stat-grid">
        <MiniStat label="Total cost" value={fmtMoney(bookValue)} />
        <MiniStat label="Accumulated depreciation" value={fmtMoney(accum)} />
        <MiniStat label="Net book value" value={fmtMoney(nbv)} />
        <MiniStat label="Active assets" value={String(assets.filter((a) => a.status === 'ACTIVE').length)} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Category</th>
                <th>Department</th>
                <th>Acquired</th>
                <th className="num">Cost</th>
                <th className="num">Accum. dep.</th>
                <th className="num">NBV</th>
                <th>Status</th>
                <th className="actions"></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.name} <span className="code-pill">{a.asset_code}</span></td>
                  <td className="muted">{a.category || '—'}</td>
                  <td className="muted">{a.department || '—'}</td>
                  <td>{fmtDate(a.acquired_date)}</td>
                  <td className="num">{fmtMoney(a.cost)}</td>
                  <td className="num">{fmtMoney(a.accumulated_depreciation || 0)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(a.net_book_value || 0)}</td>
                  <td><Badge status={a.status} /></td>
                  <td className="actions">
                    {canManage && a.status === 'ACTIVE' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeprecateId(a.id)}>
                        <RefreshCcw size={13} /> Depreciate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {assets.length === 0 && <EmptyState title="No fixed assets" />}
      </div>

      <AssetForm open={showForm} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />

      <Confirm
        open={!!deprecateId}
        onClose={() => setDeprecateId(null)}
        onConfirm={() => act(() => api.post(`/assets/${deprecateId}/depreciate`), 'Depreciation posted')}
        title="Run depreciation?"
        message="This posts a depreciation journal entry up to the current month and updates the asset's accumulated depreciation."
        confirmText="Run depreciation"
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card card-pad">
      <div className="s-label" style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function AssetForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [depts, setDepts] = useState<Department[]>([]);
  const [form, setForm] = useState<any>({ name: '', category: 'EQUIPMENT', cost: '', salvage_value: '0', useful_life_years: '5', acquired_date: '', department_id: '' });

  useEffect(() => {
    if (!open) return;
    api.get<Department[]>('/departments').then(setDepts).catch(() => {});
    setForm({ name: '', category: 'EQUIPMENT', cost: '', salvage_value: '0', useful_life_years: '5', acquired_date: '', department_id: '' });
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/assets', {
        name: form.name,
        category: form.category || null,
        cost: Number(form.cost),
        salvage_value: Number(form.salvage_value) || 0,
        useful_life_years: Number(form.useful_life_years),
        acquired_date: form.acquired_date,
        department_id: form.department_id || null,
      });
      onSaved();
    } catch (err: any) {
      notify('error', 'Failed to add asset', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add fixed asset">
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Asset name <span className="req">*</span></label>
            <input className="input" value={form.name} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="e.g. Storage Tank T-07" required />
          </div>
          <div className="field">
            <label>Category</label>
            <select className="select" value={form.category} onChange={(e) => setForm((f: any) => ({ ...f, category: e.target.value }))}>
              {['TANKS', 'PIPELINES', 'PUMPING', 'VEHICLES', 'EQUIPMENT', 'BUILDINGS', 'COMPUTERS', 'FURNITURE', 'OTHER'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Department</label>
            <select className="select" value={form.department_id} onChange={(e) => setForm((f: any) => ({ ...f, department_id: e.target.value }))}>
              <option value="">—</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Cost <span className="req">*</span></label>
            <input type="number" step="0.01" min="0.01" className="input" value={form.cost} onChange={(e) => setForm((f: any) => ({ ...f, cost: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Salvage value</label>
            <input type="number" step="0.01" min="0" className="input" value={form.salvage_value} onChange={(e) => setForm((f: any) => ({ ...f, salvage_value: e.target.value }))} />
          </div>
          <div className="field">
            <label>Useful life (years) <span className="req">*</span></label>
            <input type="number" min="1" className="input" value={form.useful_life_years} onChange={(e) => setForm((f: any) => ({ ...f, useful_life_years: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Acquired date <span className="req">*</span></label>
            <input type="date" className="input" value={form.acquired_date} onChange={(e) => setForm((f: any) => ({ ...f, acquired_date: e.target.value }))} required />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add asset'}</button>
        </div>
      </form>
    </Modal>
  );
}
