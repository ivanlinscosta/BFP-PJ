import { RefreshCw, SearchX, ShieldAlert } from 'lucide-react';
import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { describeError } from '@/lib/errors';
import { cn } from '@/lib/utils';

/** Human error state with retry; never renders raw API envelopes. */
export function ErrorState({
  error,
  onRetry,
  className,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const human = describeError(error);
  const Icon =
    human.kind === 'forbidden' ? ShieldAlert : human.kind === 'not_found' ? SearchX : RefreshCw;
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        compact ? 'py-6' : 'py-14',
        className,
      )}
      role="alert"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-card)] bg-tint text-brand-navy">
        <Icon aria-hidden className="h-6 w-6" />
      </span>
      <div>
        <p className="text-base font-semibold text-brand-navy">{human.title}</p>
        <p className="mt-1 max-w-md text-sm text-ink-soft">{human.description}</p>
        {human.issues.length > 0 ? (
          <ul className="mt-3 list-inside list-disc text-left text-[13px] text-ink-soft">
            {human.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {onRetry && human.kind !== 'forbidden' && human.kind !== 'not_found' ? (
        <Button onClick={onRetry} size="sm">
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

/** Friendly empty state with optional action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-14 text-center', className)}
    >
      {icon ? (
        <span className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-card)] bg-tint text-brand-navy">
          {icon}
        </span>
      ) : null}
      <p className="text-lg font-semibold text-brand-navy">{title}</p>
      {description ? <p className="max-w-md text-sm text-ink-soft">{description}</p> : null}
      {action}
    </div>
  );
}

/** Generic list/card skeleton. */
export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando"
      className={cn('flex flex-col gap-3', className)}
      role="status"
    >
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton className="h-10 w-full" key={index} />
      ))}
    </div>
  );
}
