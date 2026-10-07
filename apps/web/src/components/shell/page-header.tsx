import { ChevronRight } from 'lucide-react';
import { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export interface Breadcrumb {
  label: string;
  to?: string;
}

/** Page title block: optional breadcrumbs, 32px navy title, subtitle and right-side actions. */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {breadcrumbs ? (
          <nav aria-label="Trilha" className="mb-2 flex items-center gap-1.5 text-xs text-ink-soft">
            {breadcrumbs.map((crumb, index) => (
              <span className="flex items-center gap-1.5" key={`${crumb.label}-${index}`}>
                {index > 0 ? <ChevronRight aria-hidden className="h-3 w-3" /> : null}
                {crumb.to ? (
                  <Link className="hover:text-brand-navy" to={crumb.to}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="m-0 text-[32px] leading-[1.2] font-bold tracking-[-0.01em] text-brand-navy">
          {title}
        </h1>
        {subtitle ? <p className="mt-2 text-[15px] text-ink-soft">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
