import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import { X } from 'lucide-react';
import { Button } from './Button';
import { useDialogFocus } from '../../hooks/useDialogFocus';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, isOpen, onClose);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        tabIndex={-1}
        className={cn(
          'relative w-full flex flex-col max-h-[calc(100dvh-2rem)] bg-surface border border-line rounded-2xl shadow-lift transition-all focus:outline-none',
          sizeClasses[size]
        )}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between gap-4 p-6 border-b border-line">
            {title && (
              <h3 id={titleId} className="text-lg font-semibold text-fg">{title}</h3>
            )}
            {showCloseButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="p-2 ms-auto"
                aria-label="Close dialog"
                data-modal-close
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
