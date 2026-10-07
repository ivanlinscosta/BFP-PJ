import { CalendarDays, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { DateRangeSpec } from '@bfp/domain';
import { describeDateRange } from '@bfp/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover } from '@/components/ui/popover';
import { capitalize } from '@/lib/format';
import { cn } from '@/lib/utils';

const PRESETS: DateRangeSpec[] = [
  { type: 'LAST_N_DAYS', value: 7 },
  { type: 'LAST_N_DAYS', value: 30 },
  { type: 'LAST_N_DAYS', value: 90 },
  { type: 'LAST_N_DAYS', value: 120 },
  { type: 'LAST_N_DAYS', value: 365 },
  { type: 'THIS_MONTH' },
  { type: 'LAST_MONTH' },
  { type: 'THIS_YEAR' },
  { type: 'ALL_TIME' },
];

function sameRange(left: DateRangeSpec | undefined, right: DateRangeSpec) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Period selector: presets plus a custom range. */
export function PeriodPicker({
  value,
  onChange,
  variant = 'field',
}: {
  value: DateRangeSpec | undefined;
  onChange(range: DateRangeSpec): void;
  variant?: 'field' | 'chip';
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const label = capitalize(describeDateRange(value));

  return (
    <Popover
      anchor={
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`Período: ${label}`}
          className={cn(
            'flex items-center gap-2 text-left',
            variant === 'field'
              ? 'h-10 w-full rounded-[var(--radius-control)] border border-line bg-card px-3 text-sm text-ink-soft hover:border-line-strong'
              : 'h-[30px] rounded border border-line bg-card px-2.5 text-[13px] font-medium text-brand-navy',
          )}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <CalendarDays
            aria-hidden
            className={cn('shrink-0', variant === 'field' ? 'h-[18px] w-[18px]' : 'h-4 w-4')}
            strokeWidth={1.5}
          />
          <span className="truncate">{label}</span>
          {variant === 'chip' ? <ChevronDown aria-hidden className="h-3 w-3" /> : null}
        </button>
      }
      onClose={() => setOpen(false)}
      open={open}
    >
      <div aria-label="Escolher período" className="flex w-64 flex-col gap-0.5" role="dialog">
        {PRESETS.map((preset) => (
          <button
            className={cn(
              'rounded px-3 py-2 text-left text-sm hover:bg-muted',
              sameRange(value, preset) ? 'bg-cream font-semibold text-brand-navy' : 'text-ink',
            )}
            key={JSON.stringify(preset)}
            onClick={() => {
              onChange(preset);
              setOpen(false);
            }}
            type="button"
          >
            {capitalize(describeDateRange(preset))}
          </button>
        ))}
        <div className="mt-2 border-t border-line pt-3">
          <p className="px-1 text-xs font-semibold text-ink-soft">Personalizado</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input
              aria-label="Data inicial"
              className="h-9 px-2 text-xs"
              onChange={(event) => setFrom(event.target.value)}
              type="date"
              value={from}
            />
            <Input
              aria-label="Data final"
              className="h-9 px-2 text-xs"
              onChange={(event) => setTo(event.target.value)}
              type="date"
              value={to}
            />
          </div>
          <Button
            className="mt-2 w-full"
            disabled={!from || !to || from > to}
            onClick={() => {
              onChange({
                type: 'CUSTOM',
                from: new Date(`${from}T00:00:00.000Z`).toISOString(),
                to: new Date(`${to}T23:59:59.999Z`).toISOString(),
              });
              setOpen(false);
            }}
            size="sm"
          >
            Aplicar período
          </Button>
        </div>
      </div>
    </Popover>
  );
}
