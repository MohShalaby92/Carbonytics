import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { TrendingDown, ShieldCheck, BarChart3, Eye, EyeOff } from 'lucide-react';
import { BrandMark } from '../ui/BrandMark';
import { ThemeToggle } from '../layout/Navbar';

// Name the problem and the way out instead of echoing the server's raw message.
const signInError = (err: any): string => {
  const res = err?.response;
  if (!res) return "Can't reach Carbonytics right now. Check your connection and try again.";
  if (res.status === 401) return "That email and password don't match. Check both and try again.";
  if (res.status === 429) {
    // express-rate-limit standard headers: seconds until the window resets.
    const h = res.headers ?? {};
    const secs = Number(h['ratelimit-reset'] ?? /reset=(\d+)/.exec(h['ratelimit'] ?? '')?.[1] ?? h['retry-after']);
    const mins = Math.max(1, Math.ceil(secs / 60));
    const wait = secs > 0 ? `${mins} minute${mins === 1 ? '' : 's'}` : 'a few minutes';
    return `Too many sign-in attempts. Try again in ${wait}.`;
  }
  return res.data?.message || 'Sign-in failed. Please try again.';
};

type Invalid = { email?: boolean; password?: boolean };

// Checked before the request so the page's own error treatment replaces the browser's validation bubbles.
const validate = (email: string, password: string): { message: string; invalid: Invalid } | null => {
  const e = email.trim();
  if (!e && !password) return { message: 'Enter your email address and password.', invalid: { email: true, password: true } };
  if (!e) return { message: 'Enter your email address.', invalid: { email: true } };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { message: 'Enter a full email address, like you@company.com.', invalid: { email: true } };
  if (!password) return { message: 'Enter your password.', invalid: { password: true } };
  return null;
};

export const LoginPage: React.FC = () => {
  const { user, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState<Invalid>({});
  const [showPassword, setShowPassword] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  useEffect(() => {
    const previous = document.title;
    document.title = 'Sign in · Carbonytics';
    return () => { document.title = previous; };
  }, []);

  if (user) {
    return <Navigate to={from} replace />;
  }

  // Show an error and put focus on the first field to fix (the disabled button would otherwise drop it to <body>).
  const fail = (message: string, fields: Invalid, focus = fields.password && !fields.email ? passwordRef : emailRef) => {
    setError(message);
    setInvalid(fields);
    focus.current?.focus();
  };

  const clearError = () => { setError(''); setInvalid({}); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate(email, password);
    if (problem) return fail(problem.message, problem.invalid);
    setLoading(true);
    clearError();
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      // Wrong credentials: mark both fields, but the password is the usual culprit, so focus it.
      if (err?.response?.status === 401) fail(signInError(err), { email: true, password: true }, passwordRef);
      else fail(signInError(err), {});
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen grid lg:grid-cols-2">
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
        <div className="relative flex items-center gap-[1.125rem]">
          <img
            src="/icon.png"
            alt=""
            aria-hidden="true"
            // White mark on the forest band; dark mark on Console's mint band.
            className="w-[4.5rem] h-[4.5rem] object-contain brightness-0 invert dark:invert-0"
          />
          <div>
            <span className="block text-[2rem] leading-[1.05] font-display font-semibold">Carbonytics</span>
            <span className="block mt-2 text-xs uppercase tracking-[0.14em] rtl:normal-case rtl:tracking-normal text-brand-fg/70">Data. Insight. Impact.</span>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="text-4xl font-display font-semibold leading-tight tracking-[-0.015em] text-balance">
            Measure, understand, and cut your organization's carbon footprint.
          </p>
          <p className="mt-4 text-brand-fg/70 text-pretty">
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

        <p className="relative text-xs text-brand-fg/70">
          Carbon emissions analytics · Built for organizations in Egypt and beyond
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <BrandMark className="w-7 h-7" />
            <span className="text-lg font-display font-semibold text-fg">Carbonytics</span>
          </div>

          <h1 className="text-2xl font-display font-semibold text-fg">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted">Continue to your organization's GHG inventory.</p>

          <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-fg/80 mb-1.5">
                Email address
              </label>
              <Input
                ref={emailRef}
                id="email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError(); }}
                required
                autoComplete="email"
                aria-invalid={invalid.email || undefined}
                aria-describedby={error ? 'signin-error' : undefined}
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-fg/80 mb-1.5">
                Password
              </label>
              {/* LTR wrapper: a password is Latin text, and the eye button must sit on the same edge as the padding reserved for it. */}
              <div className="relative" dir="ltr">
                <Input
                  ref={passwordRef}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  required
                  autoComplete="current-password"
                  className="pe-11"
                  aria-invalid={invalid.password || undefined}
                  aria-describedby={error ? 'signin-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label="Show password"
                  aria-pressed={showPassword}
                  aria-controls="password"
                  className="absolute inset-y-0 end-0 grid w-11 place-items-center rounded-e-xl text-muted hover:text-fg transition-colors focus-ring"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" loading={loading} size="lg" className="w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>

            {/* Reserved height: the panel is vertically centred, so the error (right under the button)
                must fit inside this block or the fields would shift when it appears. */}
            <div className="min-h-[8.25rem] space-y-4">
              {error && <Alert id="signin-error" variant="error">{error}</Alert>}
              <p className="text-sm text-muted">Forgot your password or need an account? Ask your organization's admin.</p>
            </div>
          </form>

          {/* Dev builds only: production/review instances have no demo account and must not publish a password. */}
          {import.meta.env.DEV && (
            <div className="mt-8 rounded-xl border border-line bg-fg/[0.02] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Demo credentials
              </p>
              <p className="text-xs font-mono text-fg/70">demo@carbonytics.com</p>
              <p className="text-xs font-mono text-fg/70">Demo!2026Pass</p>
            </div>
          )}
        </div>
      </div>

      {/* Last in DOM order so the first Tab after "Skip to content" reaches the email field; absolute keeps it in the top corner. */}
      <div className="absolute top-4 end-4 z-10">
        <ThemeToggle />
      </div>
    </div>
  );
};
