import { useState, type ReactNode } from 'react';
import { useAuthState, updatePassword, signOut } from '../../lib/auth';
import { AuthScreen } from './AuthScreen';

function RecoveryScreen() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return;
    setLoading(true);
    setError('');
    const { error: err } = await updatePassword(password);
    setLoading(false);
    if (err) setError(err.message);
  }

  return (
    <div className="app-shell" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 340 }}>
        <div className="eyebrow">FitFlow</div>
        <div className="h1" style={{ fontSize: 30, marginBottom: 22 }}>
          Set a new password
        </div>
        <form onSubmit={submit}>
          <div className="search" style={{ marginBottom: 16 }}>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              minLength={6}
              required
            />
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save new password'}
          </button>
        </form>
        <button className="btn ghost" style={{ width: 'auto', padding: '6px 10px', marginTop: 14 }} onClick={() => void signOut()}>
          Cancel and sign out
        </button>
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuthState();

  if (status === 'checking') {
    return (
      <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="eyebrow">Loading FitFlow…</div>
      </div>
    );
  }

  if (status === 'signedOut') return <AuthScreen />;
  if (status === 'recovery') return <RecoveryScreen />;
  return <>{children}</>;
}
