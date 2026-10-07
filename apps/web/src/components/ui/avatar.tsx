import { getInitials } from '@/services/auth';
import { cn } from '@/lib/utils';

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tint text-[11px] font-bold text-brand-navy',
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
