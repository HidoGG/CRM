import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos.'
          : authError.message,
      );
    }
    // Si el login fue exitoso, onAuthStateChange en AppShell renderiza la app.
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--surface)' }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--border-faint)',
          borderRadius: 24,
          padding: 36,
          width: '100%',
          maxWidth: 380,
          display: 'grid',
          gap: 18,
          margin: '0 16px',
        }}
        aria-label="Iniciar sesión"
      >
        <div>
          <div className="brand-mark" aria-hidden="true" style={{ marginBottom: 12 }}>C</div>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            CRM Laboral
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Ingresá con tu cuenta para continuar.
          </p>
        </div>

        <div className="detail-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            aria-label="Email"
          />
        </div>
        <div className="detail-field">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            aria-label="Contraseña"
          />
        </div>

        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--red-text)', fontSize: '0.85rem' }}>
            {error}
          </p>
        )}

        <button type="submit" className="primary-button" disabled={loading}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
