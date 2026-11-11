import React, { useId } from 'react';
import { cn } from '../../utils/cn';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  /** Visible label, linked to the select. Omit only when the field is labelled another way. */
  label?: React.ReactNode;
  children: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, label, id, 'aria-describedby': describedBy, children, ...props }, ref) => {
    const autoId = useId();
    const selectId = id ?? autoId;
    const errorId = `${selectId}-error`;
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-fg/80">
            {label}
          </label>
        )}
        <select
          id={selectId}
          className={cn(
            'block w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm [@media(pointer:coarse)]:text-base text-fg placeholder:text-muted shadow-sm transition-colors',
            'focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed',
            // Keyed on aria-invalid so pages that mark a field invalid themselves (sign-in) get the same cue.
            'aria-[invalid=true]:border-critical aria-[invalid=true]:focus:border-critical aria-[invalid=true]:focus:ring-critical',
            className
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={[error && errorId, describedBy].filter(Boolean).join(' ') || undefined}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        {error && (
          <p id={errorId} className="text-sm text-critical">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
