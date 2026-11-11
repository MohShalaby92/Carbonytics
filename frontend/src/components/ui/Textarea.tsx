import React, { useId } from 'react';
import { cn } from '../../utils/cn';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  /** Visible label, linked to the textarea. */
  label?: React.ReactNode;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, label, helperText, id, 'aria-describedby': describedBy, ...props }, ref) => {
    const autoId = useId();
    const textareaId = id ?? autoId;
    const hintId = `${textareaId}-hint`;
    const errorId = `${textareaId}-error`;
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-fg/80">
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(
            'block w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm [@media(pointer:coarse)]:text-base text-fg placeholder:text-muted shadow-sm transition-colors resize-y',
            'focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed',
            // Keyed on aria-invalid so pages that mark a field invalid themselves (sign-in) get the same cue.
            'aria-[invalid=true]:border-critical aria-[invalid=true]:focus:border-critical aria-[invalid=true]:focus:ring-critical',
            className
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [error ? errorId : helperText && hintId, describedBy].filter(Boolean).join(' ') || undefined
          }
          ref={ref}
          {...props}
        />
        {helperText && !error && (
          <p id={hintId} className="text-xs text-muted">{helperText}</p>
        )}
        {error && (
          <p id={errorId} className="text-sm text-critical">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
