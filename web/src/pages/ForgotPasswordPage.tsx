import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthLayout } from '../components/layout/AuthLayout';
import { Alert, Button, Field, Input } from '../components/ui';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await requestPasswordReset(trimmed);
      setSent(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to send reset email. Try again later.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset password"
      description="We'll email you a link to choose a new one."
      footer={
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Alert tone="ok" title="Check your inbox">
          If an account exists for <span className="font-medium">{email.trim()}</span>, a reset link
          is on its way. The link expires shortly — you can close this tab once you've finished.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field
            label="Email"
            required
            hint="Use the address your account was registered with."
            error={error || null}
          >
            {(props) => (
              <Input
                {...props}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@lgu.gov.ph"
                autoComplete="email"
                invalid={Boolean(error)}
                autoFocus
              />
            )}
          </Field>

          <Button type="submit" variant="primary" fullWidth loading={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
