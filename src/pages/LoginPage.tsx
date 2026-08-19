import { useState } from 'react';
import { Headphones, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useL } from '../lib/labels';

export function LoginPage() {
  const { signIn } = useAuth();
  const L = useL();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const systemName = L('system_name', 'Malomatia QA');
  const systemSubtitle = L('system_subtitle', 'Call Evaluation System');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    const { error: signInError } = await signIn(email.trim(), password);
    if (signInError) {
      setError(signInError === 'Invalid login credentials' ? 'Incorrect email or password.' : signInError);
      setLoading(false);
      return;
    }
    // onAuthStateChange in AuthProvider will load the profile; App re-renders.
    setLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-brand-50/40 to-accent-50/30 px-4 py-10">
      {/* Decorative background blobs */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-accent-200/25 blur-3xl" />

      <div className="relative w-full max-w-md animate-scaleIn">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-cardHover">
            <Headphones className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{systemName}</h1>
          <p className="mt-1 text-sm text-slate-500">{systemSubtitle}</p>
        </div>

        {/* Card */}
        <div className="card p-8 shadow-cardHover">
          <div className="mb-6 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-slate-900">Sign in</h2>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-danger-50 p-3 text-sm text-danger-700 animate-fadeIn">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="firstname.secondname@crystel.co"
                className="input"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Use your Crystel email and the password provided by your administrator.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Access is limited by your assigned role and project permissions.
        </p>
      </div>
    </div>
  );
}
