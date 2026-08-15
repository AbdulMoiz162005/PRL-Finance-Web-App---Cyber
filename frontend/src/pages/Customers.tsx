import { useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { PageHeader, Modal, Badge, EmptyState, LoadingBlock } from '../components/ui';
import type { Customer } from '../api/types';
import { fmtMoney } from '../lib/format';

export default function Customers() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<Customer | null>(null);

  const canEdit = !!user && ['SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER', 'ACCOUNTANT'].includes(user.role);

  const load = async () => {
    setLoading(true);
    try {
      setCustomers(await api.get<Customer[]>('/customers'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = customers.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Customers"
        sub={`${customers.length} customers`}
        actions={
          canEdit && (
            <button className="btn btn-primary" onClick={() => { setEdit(null); setShowForm(true); }}>
              <Plus size={15} /> New customer
            </button>
          )
        }
      />

      <div className="filter-bar">
        <input className="input" placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 260 }} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No customers found" />
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
                  <th>Credit limit</th>
                  <th className="num">Outstanding AR</th>
                  <th>Status</th>
                  <th className="actions"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td><span className="code-pill">{c.code}</span></td>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td className="muted">{c.contact_person || '—'}</td>
                    <td className="muted">{c.phone || '—'}</td>
                    <td className="muted">{c.credit_limit ? fmtMoney(c.credit_limit) : '—'}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmtMoney(c.outstanding)}</td>
                    <td>{c.status === 'ACTIVE' ? <Badge status="ACTIVE" label="Active" /> : <Badge status="DISABLED" label="Inactive" />}</td>
                    <td className="actions">
                      {canEdit && (
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEdit(c); setShowForm(true); }}><Pencil size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CustomerForm open={showForm} onClose={() => setShowForm(false)} customer={edit} onSaved={() => { setShowForm(false); load(); }} />
    </div>
  );
}

function CustomerForm({ open, onClose, customer, onSaved }: { open: boolean; onClose: () => void; customer: Customer | null; onSaved: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({
    name: '', tin: '', contact_person: '', email: '', phone: '', address: '', payment_terms_days: '30', credit_limit: '',
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: customer?.name || '', tin: customer?.tin || '', contact_person: customer?.contact_person || '',
        email: customer?.email || '', phone: customer?.phone || '', address: customer?.address || '',
        payment_terms_days: String(customer?.payment_terms_days ?? 30), credit_limit: customer?.credit_limit != null ? String(customer.credit_limit) : '',
      });
    }
  }, [open, customer]);

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
        credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
      };
      if (customer) await api.put(`/customers/${customer.id}`, payload);
      else await api.post('/customers', payload);
      onSaved();
    } catch (err: any) {
      notify('error', 'Failed to save customer', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={customer ? `Edit ${customer.name}` : 'New customer'}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Customer name <span className="req">*</span></label>
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
            <label>Credit limit</label>
            <input type="number" min="0" step="0.01" className="input" value={form.credit_limit} onChange={(e) => set('credit_limit', e.target.value)} />
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
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Address</label>
            <textarea className="textarea" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : customer ? 'Save changes' : 'Create customer'}</button>
        </div>
      </form>
    </Modal>
  );
}
