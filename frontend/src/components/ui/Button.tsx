import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  loading?: boolean;
  children: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', href, loading, children, disabled, ...props }, ref) => {
    const baseClasses =
      'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]';

    const variants = {
      primary: 'bg-brand text-brand-fg hover:opacity-90 shadow-soft',
      secondary: 'bg-surface text-fg border border-line hover:bg-fg/[0.04]',
      outline: 'border border-line bg-transparent text-fg hover:bg-fg/[0.04]',
      ghost: 'text-fg/80 hover:bg-fg/[0.06] hover:text-fg',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-soft',
    };

    const sizes = {
      sm: 'h-9 px-3.5 text-sm',
      md: 'h-10 px-4 text-sm',
      lg: 'h-12 px-7 text-base',
    };

    // With href, render a client-side router link styled as a button
    // (previously href was silently dropped, leaving navigation buttons dead).
    if (href && !disabled && !loading) {
      const { type: _type, onClick, ...anchorProps } = props as any;
      return (
        <Link
          to={href}
          className={cn(baseClasses, variants[variant], sizes[size], className)}
          style={{ ['--tw-ring-color' as any]: 'rgb(var(--ring) / 0.55)' }}
          onClick={onClick}
          {...anchorProps}
        >
          {children}
        </Link>
      );
    }

    return (
      <button
        className={cn(baseClasses, variants[variant], sizes[size], className)}
        style={{ ['--tw-ring-color' as any]: 'rgb(var(--ring) / 0.55)' }}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" className="opacity-25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
