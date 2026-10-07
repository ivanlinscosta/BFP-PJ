import { X } from 'lucide-react';
import { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const toneClasses = {
  metric: 'border-peach bg-cream text-ink',
  dimension: 'border-tint bg-tint text-brand-navy',
  filter: 'border-line bg-card text-ink',
  neutral: 'border-line bg-muted text-ink',
};

/** Removable token used by the query builder (metrics, dimensions, filters). */
export function Chip({
  children,
  tone = 'neutral',
  onRemove,
  removeLabel,
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof toneClasses;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[30px] items-center gap-2 rounded border px-2.5 text-[13px] font-medium whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      {children}
      {onRemove ? (
        <button
          aria-label={removeLabel ?? 'Remover'}
          className="-mr-0.5 rounded p-0.5 text-ink-soft hover:bg-black/5 hover:text-ink"
          onClick={onRemove}
          type="button"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </span>
  );
}

/** Clickable suggestion chip (próximas explorações, sugestões da IA). */
export function ActionChip({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-8 items-center rounded bg-tint px-3 py-1.5 text-left text-[13px] font-medium text-brand-navy transition-colors hover:bg-segment',
        className,
      )}
      {...props}
    />
  );
}
