import React from 'react';
import { cn } from '../../utils/cn';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'info' | 'success' | 'warning' | 'error';
  children: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({ 
  className, 
  variant = 'default', 
  children, 
  ...props 
}) => {
  const variants = {
    default: 'bg-fg/[0.04] text-fg border-line',
    info: 'bg-blue-500/10 text-blue-900 border-blue-500/25',
    success: 'bg-green-500/10 text-green-900 border-green-500/25',
    warning: 'bg-yellow-500/10 text-yellow-900 border-yellow-500/25',
    error: 'bg-red-500/10 text-red-900 border-red-500/25',
  };

  return (
    <div
      className={cn(
        'rounded-md border p-4',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
