import { RefObject, useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal-dialog focus contract shared by every overlay: lock page scroll, move focus inside,
 * trap Tab, and return focus to the opener on close. Without `onEscape` the dialog is
 * non-dismissible (Escape does nothing), for flows that must be finished or explicitly skipped.
 */
export function useDialogFocus(dialogRef: RefObject<HTMLElement | null>, open: boolean, onEscape?: () => void) {
  // Latest handler without re-running the effect when callers pass inline lambdas.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    // Move focus inside: first field/control, else the dialog itself.
    const dialog = dialogRef.current;
    const focusables = () => Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const firstField = focusables().find((el) => !el.hasAttribute('data-modal-close')) ?? focusables()[0];
    (firstField ?? dialog)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (onEscapeRef.current) {
          event.stopPropagation();
          onEscapeRef.current();
        }
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      // Focus can fall to <body> when a step's content re-renders; pull it back in.
      const outside = !dialog.contains(document.activeElement);
      if (event.shiftKey && (outside || document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // Content that re-renders (loading → form, step changes) can unmount the focused control,
    // dropping focus to <body>. Put it back: first field if the control vanished, else the dialog.
    const onFocusOut = (event: FocusEvent) => {
      const lost = event.target as HTMLElement;
      setTimeout(() => {
        if (!dialog?.isConnected || document.activeElement !== document.body) return;
        const target = lost.isConnected ? dialog : focusables().find((el) => !el.hasAttribute('data-modal-close')) ?? dialog;
        target.focus();
      }, 0);
    };
    dialog?.addEventListener('focusout', onFocusOut);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      dialog?.removeEventListener('focusout', onFocusOut);
      document.body.style.overflow = 'unset';
      // Return focus to whatever opened the dialog, if it is still on the page.
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open, dialogRef]);
}
