import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { TrendingDown, ShieldCheck, BarChart3 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { user, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  if (user) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err?.response?.data?.message || (err instanceof Error ? err.message : 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-brand text-brand-fg overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="relative flex items-center gap-3">
          <img
            src="/icon.png"
            alt=""
            aria-hidden="true"
            className="w-11 h-11 object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <div className="leading-tight">
            <span className="block text-xl font-display font-semibold">Carbonytics</span>
            <span className="block text-xs text-brand-fg/70 tracking-wide">Data. Insight. Impact.</span>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-display font-semibold leading-tight">
            Measure, understand, and cut your organization's carbon footprint.
          </h1>
          <p className="mt-4 text-brand-fg/70">
            Scope 1, 2 &amp; 3 accounting built on recognized emission factors — with the
            local context Egyptian organizations need.
          </p>
          <div className="mt-10 space-y-4">
            {[
              { icon: BarChart3, text: 'Audit-ready scope breakdowns and reports' },
              { icon: TrendingDown, text: 'Track reductions against targets over time' },
              { icon: ShieldCheck, text: 'Your data, isolated per organization and secured' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm">
                <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand-fg/10">
                  <Icon className="w-5 h-5" />
                </span>
                <span className="text-brand-fg/85">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-brand-fg/50">
          Carbon emissions analytics · Built for organizations in Egypt and beyond
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <img src="/icon.png" alt="" aria-hidden="true" className="w-9 h-9 object-contain" />
            <span className="text-lg font-display font-semibold text-fg">Carbonytics</span>
          </div>

          <h2 className="text-2xl font-display font-semibold text-fg">Welcome back</h2>
          <p className="mt-1.5 text-sm text-muted">Sign in to continue to your dashboard.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && <Alert variant="error">{error}</Alert>}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-fg/80 mb-1.5">
                Email address
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-fg/80 mb-1.5">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" loading={loading} size="lg" className="w-full">
              Sign in
            </Button>
          </form>

          <div className="mt-8 rounded-xl border border-line bg-fg/[0.02] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Demo credentials
            </p>
            <p className="text-xs font-mono text-fg/70">demo@carbonytics.com</p>
            <p className="text-xs font-mono text-fg/70">Demo!2026Pass</p>
          </div>
        </div>
      </div>
    </div>
  );
};
