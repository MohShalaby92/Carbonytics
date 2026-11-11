// Navbar switches at the `nav` screen (68em ≈ 1088px at default size, not lg): it scales with the user's text size, so the full nav only shows when it fits.
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { usePersona, PERSONAS, PERSONA_LABEL } from '../../hooks/usePersona';
import {
  BarChart3,
  Calculator,
  Settings,
  ShieldCheck,
  User,
  LogOut,
  Menu,
  X,
  Upload,
  Sun,
  Moon,
  LayoutGrid,
  Check,
  BookOpen,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { BrandMark } from '../ui/BrandMark';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  { name: 'Calculate', href: '/calculations', icon: Calculator },
  { name: 'Import / Export', href: '/import-export', icon: Upload },
  { name: 'Compliance', href: '/compliance', icon: ShieldCheck },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="p-2 rounded-lg text-muted hover:text-fg hover:bg-fg/[0.06] transition-colors"
    >
      {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
};

const Brand: React.FC<{ to: string }> = ({ to }) => (
  <Link to={to} className="flex items-center gap-2.5">
    <BrandMark className="w-7 h-7" />
    <span className="text-lg font-display font-semibold tracking-tight text-fg">Carbonytics</span>
  </Link>
);

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { persona, setPersona } = usePersona();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuButton = useRef<HTMLButtonElement>(null);
  const mobileMenuButton = useRef<HTMLButtonElement>(null);

  // Escape closes whichever menu is open and returns focus to its trigger.
  useEffect(() => {
    if (!userMenuOpen && !mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (userMenuOpen) { setUserMenuOpen(false); userMenuButton.current?.focus(); }
      if (mobileMenuOpen) { setMobileMenuOpen(false); mobileMenuButton.current?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [userMenuOpen, mobileMenuOpen]);

  const isCurrent = (path: string) => location.pathname === path;

  // The sign-in page carries its own brand panel and theme toggle.
  if (location.pathname === '/login') return null;

  if (!user) {
    return (
      <nav className="sticky top-0 z-40 bg-surface/80 backdrop-blur border-b border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Brand to="/" />
            <ThemeToggle />
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="sticky top-0 z-40 bg-surface/80 backdrop-blur border-b border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-8">
            <Brand to="/dashboard" />
            <div className="hidden nav:flex nav:gap-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = isCurrent(item.href);
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors',
                      active ? 'bg-fg/[0.06] text-fg' : 'text-muted hover:text-fg hover:bg-fg/[0.04]'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="hidden nav:flex nav:items-center gap-1">
            <ThemeToggle />
            <div className="relative">
              <button
                ref={userMenuButton}
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-expanded={userMenuOpen}
                aria-controls="user-menu"
                className="flex items-center gap-3 p-1.5 pe-3 rounded-xl hover:bg-fg/[0.04] transition-colors"
              >
                <span className="grid place-items-center w-9 h-9 rounded-full bg-brand text-brand-fg font-semibold">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-start leading-tight">
                  <span className="block text-sm font-semibold text-fg">{user.name}</span>
                  <span className="block text-xs text-muted">
                    <span className="capitalize">{user.role}</span> · {PERSONA_LABEL[persona]}
                  </span>
                </span>
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div id="user-menu" className="absolute end-0 mt-2 w-60 bg-surface border border-line rounded-xl shadow-lift py-1.5 z-50">
                    <Link to="/profile" className="flex items-center gap-3 px-4 py-2 text-sm text-fg/80 hover:bg-fg/[0.05]" onClick={() => setUserMenuOpen(false)}>
                      <User className="w-4 h-4" /> Profile
                    </Link>
                    <Link to="/settings" className="flex items-center gap-3 px-4 py-2 text-sm text-fg/80 hover:bg-fg/[0.05]" onClick={() => setUserMenuOpen(false)}>
                      <Settings className="w-4 h-4" /> Settings
                    </Link>
                    <Link to="/glossary" className="flex items-center gap-3 px-4 py-2 text-sm text-fg/80 hover:bg-fg/[0.05]" onClick={() => setUserMenuOpen(false)}>
                      <BookOpen className="w-4 h-4" /> Glossary &amp; Methodology
                    </Link>
                    {user.role === 'admin' && (
                      <>
                        <div className="my-1.5 border-t border-line" />
                        <p className="px-4 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Workspace mode
                        </p>
                        {PERSONAS.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => { setPersona(p.id); setUserMenuOpen(false); }}
                            title={p.tagline}
                            className="flex items-center justify-between gap-2 w-full px-4 py-2 text-sm text-fg/80 hover:bg-fg/[0.05]"
                          >
                            <span className="flex items-center gap-3">
                              <LayoutGrid className="w-4 h-4" /> {p.label}
                            </span>
                            {persona === p.id && <Check className="w-4 h-4 text-emphasis" />}
                          </button>
                        ))}
                      </>
                    )}
                    <div className="my-1.5 border-t border-line" />
                    <button onClick={() => { logout(); setUserMenuOpen(false); }} className="flex items-center gap-3 w-full px-4 py-2 text-sm text-fg/80 hover:bg-fg/[0.05]">
                      <LogOut className="w-4 h-4" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="nav:hidden flex items-center gap-1">
            <ThemeToggle />
            <button
              ref={mobileMenuButton}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-muted hover:text-fg hover:bg-fg/[0.06]"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div id="mobile-menu" className="nav:hidden border-t border-line">
          <div className="px-3 py-3 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isCurrent(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition-colors',
                    active ? 'bg-fg/[0.06] text-fg' : 'text-muted hover:text-fg hover:bg-fg/[0.04]'
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon className="w-5 h-5" /> {item.name}
                </Link>
              );
            })}
          </div>
          <div className="px-3 py-3 border-t border-line">
            <div className="flex items-center gap-3 px-1 pb-2">
              <span className="grid place-items-center w-10 h-10 rounded-full bg-brand text-brand-fg font-semibold">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-fg">{user.name}</div>
                <div className="text-xs text-muted">{user.email}</div>
              </div>
            </div>
            {/* Profile and Glossary live in the desktop user menu; phones need them here too. */}
            <Link to="/profile" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold text-muted hover:text-fg hover:bg-fg/[0.04]">
              <User className="w-5 h-5" /> Profile
            </Link>
            <Link to="/glossary" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold text-muted hover:text-fg hover:bg-fg/[0.04]">
              <BookOpen className="w-5 h-5" /> Glossary &amp; Methodology
            </Link>
            <button onClick={() => { logout(); setMobileMenuOpen(false); }} className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm font-semibold text-muted hover:text-fg hover:bg-fg/[0.04]">
              <LogOut className="w-5 h-5" /> Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};
