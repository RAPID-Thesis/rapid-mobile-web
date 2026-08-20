import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, isApprovedProfile } from '../context/AuthContext';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Alert, Button, Field, Input } from '../components/ui';

type LoginLocationState = {
  message?: string;
  flashType?: 'success' | 'error';
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LoginLocationState | null;
  const { signIn, session, profile, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; text: string } | null>(() => {
    const msg = typeof state?.message === 'string' ? state.message : '';
    if (!msg) return null;
    return { type: state?.flashType === 'success' ? 'success' : 'error', text: msg };
  });
  const [submitting, setSubmitting] = useState(false);

  const redirectHome = !loading && Boolean(session && profile && isApprovedProfile(profile));

  useEffect(() => {
    if (redirectHome) {
      navigate('/', { replace: true });
    }
  }, [redirectHome, navigate]);

  if (redirectHome) {
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setFlash({ type: 'error', text: 'Enter your email and password.' });
      return;
    }
    setFlash(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to sign in right now.';
      setFlash({ type: 'error', text: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      description="Use the account issued by your LGU administrator."
      footer={
        <p className="text-ink-subtle">
          Need an account?{' '}
          <Link to="/register" className="font-medium text-brand-700 hover:underline">
            Request access
          </Link>
        </p>
      }
    >
      <form onSubmit={handleLogin} className="space-y-4" noValidate>
        {flash && (
          <Alert tone={flash.type === 'success' ? 'ok' : 'danger'}>{flash.text}</Alert>
        )}

        <Field label="Email" required>
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@lgu.gov.ph"
              autoComplete="username"
              autoFocus
            />
          )}
        </Field>

        <div>
          <Field label="Password" required>
            {(props) => (
              <Input
                {...props}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
            )}
          </Field>
          <div className="mt-1.5 text-right">
            <Link to="/forgot-password" className="text-xs font-medium text-brand-700 hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" variant="primary" fullWidth loading={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
