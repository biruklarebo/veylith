import { useEffect, useState, type FormEvent } from 'react';
import { pb } from '../lib/pb';

const MIN_PASSWORD = 8;

export function Login() {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);

  // Shown only when the backend has Google sign-in set up.
  useEffect(() => {
    pb.collection('users')
      .listAuthMethods()
      .then((m) => setGoogle(m.oauth2.providers.some((p) => p.name === 'google')))
      .catch(() => setGoogle(false));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (creating) await pb.collection('users').create({ name: name.trim(), email, password, passwordConfirm: password });
      await pb.collection('users').authWithPassword(email, password);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(
        !status ? 'Could not reach the server. Check your connection and try again.'
          : creating ? 'Could not create that account. It may already exist, or the email may be invalid.'
            : 'Wrong email or password.',
      );
    }
    setBusy(false);
  };

  // Runs straight from the tap: Safari blocks the pop-up if anything is awaited first.
  const signInWithGoogle = async () => {
    setError('');
    try {
      await pb.collection('users').authWithOAuth2({ provider: 'google' });
    } catch (err) {
      // Closing the pop-up is a change of mind, not a failure.
      if (!(err as { isAbort?: boolean }).isAbort) setError('Could not sign in with Google. Try again.');
    }
  };

  return (
    <div className="page login">
      <h1 className="title">Veylith</h1>
      <p className="muted">{creating ? 'Create an account to keep your workouts safe.' : 'Sign in to your workouts.'}</p>
      {google && (
        <>
          <button className="btn big google-btn" onClick={signInWithGoogle}>
            <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden>
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l8 6.2C12.5 13.7 17.8 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.9 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.9c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 7.1-10.3 7.1-17.7z" />
              <path fill="#FBBC05" d="M10.5 28.6a14.5 14.5 0 0 1 0-9.2l-8-6.2a24 24 0 0 0 0 21.6l8-6.2z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.2-13.4-9.9l-8 6.2C6.5 42.6 14.6 48 24 48z" />
            </svg>
            Continue with Google
          </button>
          <p className="login-or muted small">or</p>
        </>
      )}
      <form className="login-form" onSubmit={submit}>
        {creating && <input className="field" required maxLength={255} autoComplete="name" placeholder="Your name" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />}
        <input className="field" type="email" required autoComplete="email" placeholder="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          className="field"
          type="password"
          required
          minLength={MIN_PASSWORD}
          autoComplete={creating ? 'new-password' : 'current-password'}
          placeholder={creating ? `Password (at least ${MIN_PASSWORD} characters)` : 'Password'}
          aria-label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary big" disabled={busy}>
          {creating ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <button
        className="link small"
        onClick={() => {
          setCreating((c) => !c);
          setError('');
        }}
      >
        {creating ? 'I already have an account' : 'Create an account'}
      </button>
    </div>
  );
}
