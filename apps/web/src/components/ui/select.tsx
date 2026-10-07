import { ChevronDown } from 'lucide-react';
import { forwardRef, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  containerClassName?: string;
  /** Renders the chevron on the left, as in the reference filter controls. */
  leadingChevron?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, containerClassName, leadingChevron = false, children, ...props },
  ref,
) {
  return (
    <div className={cn('relative', containerClassName)}>
      <ChevronDown
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft',
          leadingChevron ? 'left-3' : 'right-3',
        )}
      />
      <select
        ref={ref}
        className={cn(
          'h-10 w-full cursor-pointer appearance-none rounded-[var(--radius-control)] border border-line bg-card text-sm text-ink outline-none transition-colors focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10',
          leadingChevron ? 'pr-2 pl-8' : 'pr-9 pl-3',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
});
