import { X } from 'lucide-react';
import { ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/** Modal dialog with focus management, Esc to close and labelled title. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  placement = 'center',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** 'right' renders a full-height side drawer (explanations, evidence, details). */
  placement?: 'center' | 'right';
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocus.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>(
      'input, select, textarea, button:not([data-dialog-close])',
    );
    (focusable ?? panel)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key === 'Tab' && panel) {
        const items = [
          ...panel.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ];
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 flex bg-brand-navy-strong/30',
        placement === 'right' ? 'justify-end' : 'items-center justify-center p-4',
      )}
    >
      <div aria-hidden className="absolute inset-0" onClick={onClose} />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          placement === 'right'
            ? 'relative flex h-full w-full max-w-[560px] flex-col overflow-y-auto border-l border-line bg-card p-6 shadow-[-12px_0_40px_rgba(0,26,71,0.18)]'
            : 'relative w-full max-w-lg rounded-[var(--radius-card)] border border-line bg-card p-6 shadow-[0_12px_40px_rgba(0,26,71,0.18)]',
          className,
        )}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-brand-navy" id={titleId}>
              {title}
            </h2>
            {description ? <div className="mt-1 text-sm text-ink-soft">{description}</div> : null}
          </div>
          <button
            aria-label="Fechar"
            className="rounded p-1 text-ink-soft hover:bg-muted hover:text-ink"
            data-dialog-close
            onClick={onClose}
            type="button"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
