import { useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { PageHeader, Modal, Badge, EmptyState, LoadingBlock } from '../components/ui';
import type { Vendor } from '../api/types';
import { fmtMoney } from '../lib/format';

export default function Vendors() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<Vendor | null>(null);

  const canEdit = !!user && ['SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER', 'ACCOUNTANT'].includes(user.role);

  const load = async () => {
    setLoading(true);
    try {
      setVendors(await api.get<Vendor[]>('/vendors'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = vendors.filter((v) => !search || v.name.toLowerCase().includes(search.toLowerCase()) || v.code.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Vendors"
        sub={`${vendors.length} suppliers`}
        actions={
          canEdit && (
            <button className="btn btn-primary" onClick={() => { setEdit(null); setShowForm(true); }}>
              <Plus size={15} /> New vendor
            </button>
          )
        }
      />

      <div className="filter-bar">
        <input className="input" placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 260 }} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No vendors found" />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Terms</th>
                  <th className="num">Outstanding AP</th>
                  <th>Status</th>
                  <th className="actions"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id}>
                    <td><span className="code-pill">{v.code}</span></td>
                    <td style={{ fontWeight: 600 }}>{v.name}</td>
                    <td className="muted">{v.contact_person || '—'}</td>
                    <td className="muted">{v.phone || '—'}</td>
                    <td className="muted">{v.payment_terms_days}d</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(v.outstanding)}</td>
                    <td>{v.status === 'ACTIVE' ? <Badge status="ACTIVE" label="Active" /> : <Badge status="DISABLED" label="Inactive" />}</td>
                    <td className="actions">
                      {canEdit && (
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEdit(v); setShowForm(true); }}><Pencil size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <VendorForm open={showForm} onClose={() => setShowForm(false)} vendor={edit} onSaved={() => { setShowForm(false); load(); }} />
    </div>
  );
}

function VendorForm({ open, onClose, vendor, onSaved }: { open: boolean; onClose: () => void; vendor: Vendor | null; onSaved: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    name: '', tin: '', contact_person: '', email: '', phone: '', address: '', payment_terms_days: '30', bank_name: '', bank_account: '',
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: vendor?.name || '', tin: vendor?.tin || '', contact_person: vendor?.contact_person || '',
        email: vendor?.email || '', phone: vendor?.phone || '', address: vendor?.address || '',
        payment_terms_days: String(vendor?.payment_terms_days ?? 30), bank_name: '', bank_account: '',
      });
    }
  }, [open, vendor]);

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        tin: form.tin || null,
        contact_person: form.contact_person || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        payment_terms_days: Number(form.payment_terms_days) || 30,
        bank_name: form.bank_name || null,
        bank_account: form.bank_account || null,
      };
      if (vendor) await api.put(`/vendors/${vendor.id}`, payload);
      else await api.post('/vendors', payload);
      onSaved();
    } catch (err: any) {
      notify('error', 'Failed to save vendor', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={vendor ? `Edit ${vendor.name}` : 'New vendor'}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Vendor name <span className="req">*</span></label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="field">
            <label>Tax ID (TIN)</label>
            <input className="input" value={form.tin} onChange={(e) => set('tin', e.target.value)} />
          </div>
          <div className="field">
            <label>Payment terms (days)</label>
            <input type="number" min="0" className="input" value={form.payment_terms_days} onChange={(e) => set('payment_terms_days', e.target.value)} />
          </div>
          <div className="field">
            <label>Contact person</label>
            <input className="input" value={form.contact_person} onChange={(e) => set('contact_person', e.target.value)} />
          </div>
          <div className="field">
            <label>Phone</label>
            <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="field">
            <label>Bank name</label>
            <input className="input" value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Address</label>
            <textarea className="textarea" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : vendor ? 'Save changes' : 'Create vendor'}</button>
        </div>
      </form>
    </Modal>
  );
}
