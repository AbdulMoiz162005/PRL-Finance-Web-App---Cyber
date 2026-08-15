import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { PageHeader, Modal, Badge, LoadingBlock } from '../components/ui';

export default function Settings() {
  const { hasRole } = useAuth();
  const { notify } = useToast();
  const [company, setCompany] = useState<any>(null);
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [taxRates, setTaxRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>({});
  const [showTax, setShowTax] = useState(false);
  const [taxForm, setTaxForm] = useState({ name: '', rate: '18' });

  const canEdit = hasRole('SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER');

  const load = async () => {
    setLoading(true);
    try {
      const [c, cur, tx] = await Promise.all([
        api.get<any>('/settings/company'),
        api.get<any[]>('/settings/currencies'),
        api.get<any[]>('/settings/tax-rates'),
      ]);
      setCompany(c);
      setCurrencies(cur);
      setTaxRates(tx);
      setForm({
        company_name: c.company_name || '',
        legal_name: c.legal_name || '',
        tax_id: c.tax_id || '',
        address: c.address || '',
        phone: c.phone || '',
        email: c.email || '',
        website: c.website || '',
        base_currency_id: c.base_currency_id || '',
        fiscal_year_start: c.fiscal_year_start || 1,
        default_tax_rate_id: c.default_tax_rate_id || '',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/settings/company', {
        company_name: form.company_name,
        legal_name: form.legal_name || null,
        tax_id: form.tax_id || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
        base_currency_id: form.base_currency_id || null,
        fiscal_year_start: Number(form.fiscal_year_start) || 1,
        default_tax_rate_id: form.default_tax_rate_id || null,
      });
      notify('success', 'Company settings saved');
    } catch (err: any) {
      notify('error', 'Failed to save settings', err.message);
    }
  };

  const updateCurrency = async (id: string, rate: number) => {
    try {
      await api.put(`/settings/currencies/${id}`, { rate_to_base: rate });
      notify('success', 'Exchange rate updated');
      load();
    } catch (err: any) {
      notify('error', 'Failed to update rate', err.message);
    }
  };

  const addTax = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/settings/tax-rates', { name: taxForm.name, rate: Number(taxForm.rate) });
      notify('success', 'Tax rate added');
      setShowTax(false);
      load();
    } catch (err: any) {
      notify('error', 'Failed to add tax rate', err.message);
    }
  };

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="Settings" sub="Company profile, currencies and tax configuration" />

      <div className="grid-2">
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header"><div className="card-title">Company profile</div></div>
          <div className="card-pad">
            <form onSubmit={saveCompany}>
              <div className="form-grid">
                <div className="field">
                  <label>Company name <span className="req">*</span></label>
                  <input className="input" value={form.company_name} onChange={(e) => setForm((f: any) => ({ ...f, company_name: e.target.value }))} required disabled={!canEdit} />
                </div>
                <div className="field">
                  <label>Legal name</label>
                  <input className="input" value={form.legal_name} onChange={(e) => setForm((f: any) => ({ ...f, legal_name: e.target.value }))} disabled={!canEdit} />
                </div>
                <div className="field">
                  <label>Tax ID</label>
                  <input className="input" value={form.tax_id} onChange={(e) => setForm((f: any) => ({ ...f, tax_id: e.target.value }))} disabled={!canEdit} />
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input className="input" value={form.phone} onChange={(e) => setForm((f: any) => ({ ...f, phone: e.target.value }))} disabled={!canEdit} />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input className="input" value={form.email} onChange={(e) => setForm((f: any) => ({ ...f, email: e.target.value }))} disabled={!canEdit} />
                </div>
                <div className="field">
                  <label>Website</label>
                  <input className="input" value={form.website} onChange={(e) => setForm((f: any) => ({ ...f, website: e.target.value }))} disabled={!canEdit} />
                </div>
                <div className="field">
                  <label>Base currency</label>
                  <select className="select" value={form.base_currency_id} onChange={(e) => setForm((f: any) => ({ ...f, base_currency_id: e.target.value }))} disabled={!canEdit}>
                    {currencies.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Fiscal year start (month)</label>
                  <select className="select" value={form.fiscal_year_start} onChange={(e) => setForm((f: any) => ({ ...f, fiscal_year_start: e.target.value }))} disabled={!canEdit}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'long' })}</option>)}
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Address</label>
                  <textarea className="textarea" value={form.address} onChange={(e) => setForm((f: any) => ({ ...f, address: e.target.value }))} disabled={!canEdit} />
                </div>
              </div>
              {canEdit && (
                <div className="form-actions">
                  <button className="btn btn-primary">Save settings</button>
                </div>
              )}
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Currencies</div></div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th className="num">Rate to base</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {currencies.map((c) => (
                  <tr key={c.id}>
                    <td><span className="code-pill">{c.code}</span> {c.is_base && <Badge status="ACTIVE" label="Base" />}</td>
                    <td className="muted">{c.name}</td>
                    <td>
                      {c.is_base ? (
                        <span style={{ fontWeight: 700 }}>1.0000</span>
                      ) : (
                        <input
                          type="number" step="0.0001" min="0"
                          className="input" style={{ width: 110, textAlign: 'right', padding: '4px 8px' }}
                          defaultValue={c.rate_to_base}
                          disabled={!canEdit}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (v > 0 && v !== c.rate_to_base) updateCurrency(c.id, v);
                          }}
                        />
                      )}
                    </td>
                    <td>{c.is_active ? <Badge status="ACTIVE" label="Active" /> : <Badge status="DISABLED" label="Inactive" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Tax rates</div>
            {canEdit && (
              <button className="btn btn-secondary btn-sm" onClick={() => setShowTax(true)}><Plus size={14} /> Add rate</button>
            )}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Rate</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {taxRates.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td className="num">{t.rate}%</td>
                    <td>{t.is_active ? <Badge status="ACTIVE" label="Active" /> : <Badge status="DISABLED" label="Inactive" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal open={showTax} onClose={() => setShowTax(false)} title="Add tax rate">
        <form onSubmit={addTax}>
          <div className="form-grid">
            <div className="field">
              <label>Name <span className="req">*</span></label>
              <input className="input" value={taxForm.name} onChange={(e) => setTaxForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. VAT" required />
            </div>
            <div className="field">
              <label>Rate (%) <span className="req">*</span></label>
              <input type="number" min="0" max="100" step="0.01" className="input" value={taxForm.rate} onChange={(e) => setTaxForm((f) => ({ ...f, rate: e.target.value }))} required />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowTax(false)}>Cancel</button>
            <button className="btn btn-primary">Add tax rate</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
