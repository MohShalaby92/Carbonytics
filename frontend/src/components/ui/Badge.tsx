import React from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', size = 'md', children, className }) => {
  const baseClasses = 'inline-flex items-center font-semibold rounded-full border';

  const variants = {
    default: 'bg-fg/[0.06] text-fg/70 border-line',
    success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 dark:text-emerald-300 border-emerald-500/20',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 dark:text-amber-300 border-amber-500/20',
    error: 'bg-red-500/15 text-red-700 dark:text-red-300 dark:text-red-300 border-red-500/20',
    info: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 dark:text-sky-300 border-sky-500/20',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return <span className={cn(baseClasses, variants[variant], sizes[size], className)}>{children}</span>;
};
