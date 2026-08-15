import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

const DEMO_ACCOUNTS = [
  { email: 'admin@refinery.local', role: 'Super Admin' },
  { email: 'director@refinery.local', role: 'Finance Director' },
  { email: 'manager@refinery.local', role: 'Finance Manager' },
  { email: 'accountant@refinery.local', role: 'Accountant' },
  { email: 'cashier@refinery.local', role: 'Cashier' },
  { email: 'auditor@refinery.local', role: 'Auditor' },
  { email: 'viewer@refinery.local', role: 'Viewer' },
];

export default function Login() {
  const { login } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@refinery.local');
  const [password, setPassword] = useState('Refinery@2024');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(email, password);
      notify('success', `Welcome back, ${user.full_name}`);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">RF</div>
        <div className="login-title">Refinery Terminal Finance</div>
        <div className="login-sub">Sign in to the finance & ERP platform</div>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '10px' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="login-hint">
          <strong>Demo accounts</strong> (password <code>Refinery@2024</code>)
          <br />
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.email} className="link-btn" onClick={() => setEmail(a.email)} style={{ marginRight: 6 }}>
              {a.role}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
