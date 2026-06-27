import React, { useState } from 'react';
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

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  { name: 'Calculate', href: '/calculations', icon: Calculator },
  { name: 'Import / Export', href: '/import-export', icon: Upload },
  { name: 'Compliance', href: '/compliance', icon: ShieldCheck },
  { name: 'Settings', href: '/settings', icon: Settings },
];

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="p-2 rounded-lg text-muted hover:text-fg hover:bg-fg/[0.06] transition-colors"
    >
      {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
};

const Brand: React.FC<{ to: string }> = ({ to }) => (
  <Link to={to} className="flex items-center gap-2.5">
    <img src="/icon.png" alt="" aria-hidden="true" className="w-9 h-9 object-contain" />
    <span className="text-lg font-display font-semibold tracking-tight text-fg">Carbonytics</span>
  </Link>
);

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { persona, setPersona } = usePersona();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isCurrent = (path: string) => location.pathname === path;

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
            <div className="hidden md:flex md:gap-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = isCurrent(item.href);
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors',
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

          <div className="hidden md:flex md:items-center gap-1">
            <ThemeToggle />
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-3 p-1.5 pr-3 rounded-xl hover:bg-fg/[0.04] transition-colors"
              >
                <span className="grid place-items-center w-9 h-9 rounded-full bg-brand text-brand-fg font-semibold">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-left leading-tight">
                  <span className="block text-sm font-semibold text-fg">{user.name}</span>
                  <span className="block text-xs text-muted">
                    <span className="capitalize">{user.role}</span> · {PERSONA_LABEL[persona]}
                  </span>
                </span>
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-60 bg-surface border border-line rounded-xl shadow-lift py-1.5 z-50">
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
                            {persona === p.id && <Check className="w-4 h-4 text-primary-600" />}
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

          <div className="md:hidden flex items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-muted hover:text-fg hover:bg-fg/[0.06]"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-line">
          <div className="px-3 py-3 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isCurrent(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors',
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
            <button onClick={() => { logout(); setMobileMenuOpen(false); }} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-muted hover:text-fg hover:bg-fg/[0.04]">
              <LogOut className="w-5 h-5" /> Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};
