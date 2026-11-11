import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '../../utils/cn';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'info' | 'success' | 'warning' | 'error';
  children: React.ReactNode;
}

// Status colours come from the theme tokens; the icon is the second cue so state never rests on colour alone.
const variants = {
  default: { box: 'bg-fg/[0.04] border-line', icon: null },
  info: { box: 'bg-info/10 border-info/30', icon: <Info className="w-4 h-4 text-info" /> },
  success: { box: 'bg-positive/10 border-positive/30', icon: <CheckCircle2 className="w-4 h-4 text-positive" /> },
  warning: { box: 'bg-caution/10 border-caution/30', icon: <AlertTriangle className="w-4 h-4 text-caution" /> },
  error: { box: 'bg-critical/10 border-critical/30', icon: <AlertCircle className="w-4 h-4 text-critical" /> },
};

export const Alert: React.FC<AlertProps> = ({
  className,
  variant = 'default',
  children,
  ...props
}) => {
  const { box, icon } = variants[variant];

  // Errors interrupt; success/warning are polite; neutral notes stay silent (no chatter on static panels).
  const role = variant === 'error' ? 'alert' : variant === 'success' || variant === 'warning' ? 'status' : undefined;

  return (
    <div
      role={role}
      className={cn('rounded-xl border p-4 text-sm text-fg', icon && 'flex items-start gap-2.5', box, className)}
      {...props}
    >
      {icon && <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span>}
      {icon ? <div className="min-w-0 flex-1">{children}</div> : children}
    </div>
  );
};
