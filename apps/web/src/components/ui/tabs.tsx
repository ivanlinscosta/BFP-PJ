import { KeyboardEvent, ReactNode, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<TValue extends string> {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
}

interface TabsProps<TValue extends string> {
  items: ReadonlyArray<TabItem<TValue>>;
  value: TValue;
  onChange: (value: TValue) => void;
  label: string;
  className?: string;
  variant?: 'underline' | 'segmented';
  idPrefix?: string;
}

/** Accessible tablist (arrow keys, Home/End) in the underline or segmented styles. */
export function Tabs<TValue extends string>({
  items,
  value,
  onChange,
  label,
  className,
  variant = 'underline',
  idPrefix,
}: TabsProps<TValue>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = items.filter((item) => !item.disabled);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const enabledIndex = enabled.findIndex((item) => item.value === items[index]?.value);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') nextIndex = (enabledIndex + 1) % enabled.length;
    if (event.key === 'ArrowLeft') nextIndex = (enabledIndex - 1 + enabled.length) % enabled.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = enabled.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const next = enabled[nextIndex]!;
    onChange(next.value);
    refs.current[items.findIndex((item) => item.value === next.value)]?.focus();
  }

  return (
    <div
      aria-label={label}
      className={cn(
        variant === 'underline'
          ? 'flex items-end gap-6 border-b border-line'
          : 'inline-flex items-center gap-1 rounded-[var(--radius-control)] bg-segment p-1',
        className,
      )}
      role="tablist"
    >
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            aria-controls={idPrefix ? `${idPrefix}-panel-${item.value}` : undefined}
            aria-selected={active}
            className={cn(
              'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              variant === 'underline'
                ? cn(
                    '-mb-px border-b-2 pb-2 text-[13px] whitespace-nowrap',
                    active
                      ? 'border-brand-orange font-semibold text-brand-navy'
                      : 'border-transparent text-ink-soft hover:text-ink',
                  )
                : cn(
                    'h-8 rounded px-3 text-[13px] whitespace-nowrap',
                    active
                      ? 'bg-card font-semibold text-brand-navy shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                      : 'text-ink-soft hover:text-ink',
                  ),
            )}
            disabled={item.disabled}
            id={idPrefix ? `${idPrefix}-tab-${item.value}` : undefined}
            key={item.value}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(element) => {
              refs.current[index] = element;
            }}
            role="tab"
            tabIndex={active ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
