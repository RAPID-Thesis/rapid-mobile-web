import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const successMessage = 'Your account has been submitted and is pending review by an admin.';

type RoleOption = 'inspector' | 'admin' | 'engineer';

export default function RegisterPage() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RoleOption>('inspector');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(name.trim()) && Boolean(email.trim()) && Boolean(password),
    [name, email, password]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      setError('Please complete all required fields.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      await signUp(email.trim(), password, {
        full_name: name.trim(),
        role,
        lgu_code: '',
      });
      setToast(successMessage);
      setName('');
      setEmail('');
      setPassword('');
      setRole('inspector');
      window.setTimeout(() => setToast(''), 5000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to submit registration right now.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 max-w-sm rounded-lg bg-emerald-600 text-white px-4 py-3 shadow-lg">
          {toast}
        </div>
      )}
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500 text-white text-3xl font-black mb-4">
            R
          </div>
          <h1 className="text-3xl font-black text-white tracking-wider">RAPID</h1>
          <p className="text-blue-300 text-sm mt-1">Resilience Prediction & Damage Classification</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Create an account</h2>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Name/Details</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-12 px-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Full name"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="you@lgu.gov.ph"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter password"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as RoleOption)}
              className="w-full h-12 px-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="inspector">inspector</option>
              <option value="admin">admin</option>
              <option value="engineer">engineer</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-lg transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit for Approval'}
          </button>
        </form>

        <p className="text-center text-sm text-blue-200 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-white hover:underline">
            Sign in
          </Link>
        </p>

        <p className="text-center text-blue-400/60 text-xs mt-6">
          FEMA P-154 &bull; ATC-20 Compliant System
        </p>
      </div>
    </div>
  );
}
