import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    navigate('/', { replace: true });
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate('/');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to sign in right now.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500 text-white text-3xl font-black mb-4">
            R
          </div>
          <h1 className="text-3xl font-black text-white tracking-wider">RAPID</h1>
          <p className="text-blue-300 text-sm mt-1">Resilience Prediction & Damage Classification</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Sign in to Portal</h2>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
          )}

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

          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-lg transition-colors"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-blue-400/60 text-xs mt-6">
          FEMA P-154 &bull; ATC-20 Compliant System
        </p>
      </div>
    </div>
  );
}
