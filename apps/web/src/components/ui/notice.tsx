import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const toneMeta = {
  success: { classes: 'bg-success-soft text-success', Icon: CheckCircle2 },
  info: { classes: 'bg-tint text-brand-navy', Icon: Info },
  warning: { classes: 'bg-warning-soft text-warning', Icon: AlertTriangle },
  error: { classes: 'bg-danger-soft text-danger', Icon: XCircle },
};

/** Inline feedback banner (e.g. "Porte da empresa adicionado à análise."). */
export function Notice({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof toneMeta;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const meta = toneMeta[tone];
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-control)] px-4 py-3 text-sm',
        meta.classes,
        className,
      )}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <meta.Icon aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={cn(title ? 'mt-0.5 opacity-90' : undefined)}>{children}</div>
        ) : null}
      </div>
      {action}
    </div>
  );
}
