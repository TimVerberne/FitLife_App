import { useState } from 'react';
import { resetPasswordForEmail, signInWithPassword, signUpWithPassword } from '../../lib/auth';

type Mode = 'signIn' | 'signUp' | 'forgot';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!email.trim() || (mode !== 'forgot' && !password)) return;
    setLoading(true);
    try {
      if (mode === 'signIn') {
        const { error: err } = await signInWithPassword(email.trim(), password);
        if (err) throw err;
      } else if (mode === 'signUp') {
        const { error: err, data } = await signUpWithPassword(email.trim(), password);
        if (err) throw err;
        if (!data.session) setMessage('Check your email to confirm your account, then sign in.');
      } else {
        const { error: err } = await resetPasswordForEmail(email.trim());
        if (err) throw err;
        setMessage('Password reset email sent — check your inbox.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 340 }}>
        <div className="eyebrow">FitFlow</div>
        <div className="h1" style={{ fontSize: 30, marginBottom: 22 }}>
          {mode === 'signIn' ? 'Sign in' : mode === 'signUp' ? 'Create account' : 'Reset password'}
        </div>

        <form onSubmit={submit}>
          <div className="section-h" style={{ margin: '0 2px 8px' }}>
            Email
          </div>
          <div className="search" style={{ marginBottom: 16 }}>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          {mode !== 'forgot' && (
            <>
              <div className="section-h" style={{ margin: '0 2px 8px' }}>
                Password
              </div>
              <div className="search" style={{ marginBottom: 16 }}>
                <input
                  type="password"
                  autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  required
                />
              </div>
            </>
          )}

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>
          )}
          {message && (
            <div style={{ color: 'var(--accent)', fontSize: 13, marginBottom: 12 }}>{message}</div>
          )}

          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signIn' ? 'Sign in' : mode === 'signUp' ? 'Create account' : 'Send reset email'}
          </button>
        </form>

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          {mode === 'signIn' && (
            <>
              <button className="btn ghost" style={{ width: 'auto', padding: '6px 10px' }} onClick={() => { setMode('forgot'); setError(''); setMessage(''); }}>
                Forgot password?
              </button>
              <button className="btn ghost" style={{ width: 'auto', padding: '6px 10px' }} onClick={() => { setMode('signUp'); setError(''); setMessage(''); }}>
                Need an account? Sign up
              </button>
            </>
          )}
          {mode !== 'signIn' && (
            <button className="btn ghost" style={{ width: 'auto', padding: '6px 10px' }} onClick={() => { setMode('signIn'); setError(''); setMessage(''); }}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
