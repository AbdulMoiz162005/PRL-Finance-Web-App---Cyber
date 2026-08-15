import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <div style={{ fontSize: 48, fontWeight: 800 }}>404</div>
      <div style={{ color: 'var(--text-3)' }}>The page you are looking for does not exist.</div>
      <Link to="/" className="btn btn-primary" style={{ marginTop: 12 }}>Back to dashboard</Link>
    </div>
  );
}
