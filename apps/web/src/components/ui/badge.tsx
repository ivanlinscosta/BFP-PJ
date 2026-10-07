import { BadgeCheck, FlaskConical, Archive } from 'lucide-react';
import { HTMLAttributes } from 'react';
import type { CertificationStatus } from '@bfp/domain';
import { cn } from '@/lib/utils';

const toneClasses = {
  tint: 'bg-tint text-brand-navy',
  cream: 'bg-cream text-brand-orange',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-muted text-ink-soft',
  navy: 'bg-brand-navy text-white',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: keyof typeof toneClasses;
  uppercase?: boolean;
}

export function Badge({ className, tone = 'tint', uppercase = false, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-semibold whitespace-nowrap',
        uppercase && 'tracking-wide uppercase',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

const CERTIFICATION_META: Record<
  CertificationStatus,
  { label: string; tone: keyof typeof toneClasses; Icon: typeof BadgeCheck }
> = {
  CERTIFIED: { label: 'Certificada', tone: 'tint', Icon: BadgeCheck },
  EXPERIMENTAL: { label: 'Experimental', tone: 'warning', Icon: FlaskConical },
  DEPRECATED: { label: 'Descontinuada', tone: 'neutral', Icon: Archive },
};

/** Governance badge used in the library, catalog and metric cards. */
export function CertificationBadge({
  status,
  uppercase = false,
  className,
}: {
  status: CertificationStatus;
  uppercase?: boolean;
  className?: string;
}) {
  const meta = CERTIFICATION_META[status];
  return (
    <Badge tone={meta.tone} uppercase={uppercase} className={className}>
      <meta.Icon aria-hidden className="h-3.5 w-3.5" />
      {meta.label}
    </Badge>
  );
}
