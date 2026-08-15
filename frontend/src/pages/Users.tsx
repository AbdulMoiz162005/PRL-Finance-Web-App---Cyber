import { useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { PageHeader, Modal, Badge, EmptyState, LoadingBlock } from '../components/ui';
import { ROLE_LABEL, type User, type Role, type Department } from '../api/types';
import { fmtDateTime, initials } from '../lib/format';

const ROLES: Role[] = ['SUPER_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_MANAGER', 'ACCOUNTANT', 'CASHIER', 'AUDITOR', 'VIEWER'];

export default function Users() {
  const { user, hasRole } = useAuth();
  const { notify } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState<User | null>(null);

  const canManage = hasRole('SUPER_ADMIN', 'FINANCE_DIRECTOR');

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await api.get<User[]>('/users'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="Users & Roles"
        sub={`${users.length} users`}
        actions={
          canManage && (
            <button className="btn btn-primary" onClick={() => { setEdit(null); setShowForm(true); }}>
              <Plus size={15} /> New user
            </button>
          )
        }
      />

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th>Last login</th>
                <th className="actions"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="avatar" style={{ width: 30, height: 30, fontSize: 11, background: u.id === user?.id ? 'var(--teal)' : undefined }}>{initials(u.full_name)}</div>
                    <span style={{ fontWeight: 600 }}>{u.full_name}{u.id === user?.id ? ' (you)' : ''}</span>
                  </td>
                  <td className="muted">{u.email}</td>
                  <td><RoleTag role={u.role} /></td>
                  <td className="muted">{u.department?.name || '—'}</td>
                  <td>{u.status === 'ACTIVE' ? <Badge status="ACTIVE" label="Active" /> : <Badge status="DISABLED" label="Disabled" />}</td>
                  <td className="muted">{fmtDateTime(u.last_login_at)}</td>
                  <td className="actions">
                    {canManage && (
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => { setEdit(u); setShowForm(true); }}><Pencil size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <UserForm open={showForm} onClose={() => setShowForm(false)} user={edit} onSaved={() => { setShowForm(false); load(); }} />
    </div>
  );
}

function RoleTag({ role }: { role: Role }) {
  const colors: Record<string, string> = {
    SUPER_ADMIN: '#dc2626',
    FINANCE_DIRECTOR: '#7c3aed',
    FINANCE_MANAGER: '#2563eb',
    ACCOUNTANT: '#0d9488',
    CASHIER: '#d97706',
    AUDITOR: '#6b7280',
    VIEWER: '#94a3b8',
  };
  const c = colors[role] || '#6b7280';
  return <span className="badge" style={{ background: `${c}1a`, color: c }}>{ROLE_LABEL[role]}</span>;
}

function UserForm({ open, onClose, user, onSaved }: { open: boolean; onClose: () => void; user: User | null; onSaved: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [depts, setDepts] = useState<Department[]>([]);
  const [form, setForm] = useState<any>({ email: '', full_name: '', role: 'VIEWER', department_id: '', password: '', status: 'ACTIVE' });

  useEffect(() => {
    if (!open) return;
    api.get<Department[]>('/departments').then(setDepts).catch(() => {});
    setForm({
      email: user?.email || '', full_name: user?.full_name || '', role: user?.role || 'VIEWER',
      department_id: user?.department_id || '', password: '', status: user?.status || 'ACTIVE',
    });
  }, [open, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (user) {
        await api.put(`/users/${user.id}`, {
          full_name: form.full_name,
          role: form.role,
          department_id: form.department_id || null,
          status: form.status,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        await api.post('/users', {
          email: form.email,
          full_name: form.full_name,
          role: form.role,
          department_id: form.department_id || null,
          password: form.password,
        });
      }
      onSaved();
    } catch (err: any) {
      notify('error', 'Failed to save user', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={user ? `Edit ${user.full_name}` : 'New user'}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Full name <span className="req">*</span></label>
            <input className="input" value={form.full_name} onChange={(e) => setForm((f: any) => ({ ...f, full_name: e.target.value }))} required />
          </div>
          <div className="field">
            <label>Email <span className="req">*</span></label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm((f: any) => ({ ...f, email: e.target.value }))} disabled={!!user} required />
          </div>
          <div className="field">
            <label>Role <span className="req">*</span></label>
            <select className="select" value={form.role} onChange={(e) => setForm((f: any) => ({ ...f, role: e.target.value }))}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
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
            <label>Status</label>
            <select className="select" value={form.status} onChange={(e) => setForm((f: any) => ({ ...f, status: e.target.value }))} disabled={!user}>
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>{user ? 'New password (leave blank to keep)' : 'Password'} <span className="req">{!user && '*'}</span></label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm((f: any) => ({ ...f, password: e.target.value }))} required={!user} minLength={8} autoComplete="new-password" />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : user ? 'Save changes' : 'Create user'}</button>
        </div>
      </form>
    </Modal>
  );
}
