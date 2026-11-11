import React, { useId } from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  /** Visible label, linked to the input. Omit only when the field is labelled another way. */
  label?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, label, id, 'aria-describedby': describedBy, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-fg/80">
            {label}
          </label>
        )}
        <input
          id={inputId}
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
        />
        {error && <p id={errorId} className="text-sm text-critical">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
