import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

const variantClasses = {
  primary:
    'bg-brand-orange text-white hover:bg-brand-orange-hover disabled:bg-brand-orange/50 font-semibold',
  secondary:
    'border border-line bg-card text-brand-navy hover:border-line-strong hover:bg-muted font-semibold',
  ghost: 'text-brand-navy hover:bg-muted font-semibold',
  link: 'text-brand-navy hover:underline underline-offset-4 font-semibold px-0',
  subtle: 'bg-tint text-brand-navy hover:bg-segment font-medium',
  danger: 'border border-line bg-card text-danger hover:bg-danger-soft font-semibold',
};

const sizeClasses = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
  icon: 'h-9 w-9 justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
});
