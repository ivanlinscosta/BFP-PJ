import { ReactNode, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** Anchored popover with outside-click and Esc dismissal. */
export function Popover({
  open,
  onClose,
  anchor,
  children,
  className,
  align = 'start',
}: {
  open: boolean;
  onClose: () => void;
  anchor: ReactNode;
  children: ReactNode;
  className?: string;
  align?: 'start' | 'end';
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    containerRef.current?.querySelector<HTMLElement>('[data-autofocus], button, input')?.focus();
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  return (
    <div className="relative" ref={containerRef}>
      {anchor}
      {open ? (
        <div
          className={cn(
            'absolute top-full z-30 mt-1 min-w-[240px] rounded-[var(--radius-card)] border border-line bg-card p-2 shadow-[0_8px_24px_rgba(0,26,71,0.12)]',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
