import {
  ChartArea,
  ChartBar,
  ChartColumn,
  ChartColumnStacked,
  ChartLine,
  ChartPie,
  ChartScatter,
  Grid3x3,
  Hash,
  Table2,
  type LucideIcon,
} from 'lucide-react';
import type { VisualizationType } from '@bfp/domain';
import { cn } from '@/lib/utils';
import type { VisualizationOption } from '../spec';

const ICONS: Partial<Record<VisualizationType, LucideIcon>> = {
  TABLE: Table2,
  KPI: Hash,
  BAR: ChartBar,
  GROUPED_BAR: ChartColumn,
  STACKED_BAR: ChartColumnStacked,
  LINE: ChartLine,
  AREA: ChartArea,
  DONUT: ChartPie,
  SCATTER: ChartScatter,
  HEATMAP: Grid3x3,
};

/** Chart type picker: every chart is visible; the ones the selection cannot draw say what they need. */
export function ChartPicker({
  options,
  value,
  onChange,
}: {
  options: VisualizationOption[];
  value: VisualizationType | 'KPI';
  onChange(type: VisualizationType): void;
}) {
  return (
    <div aria-label="Tipo de gráfico" className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((option) => {
        const Icon = ICONS[option.type] ?? Table2;
        const active = option.type === value;
        return (
          <button
            aria-checked={active}
            aria-label={
              option.enabled ? option.label : `${option.label} (precisa de ${option.requirement})`
            }
            className={cn(
              'group inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 text-[13px] font-medium transition-colors',
              active
                ? 'border-brand-navy bg-brand-navy text-white'
                : option.enabled
                  ? 'border-line bg-card text-ink hover:border-line-strong hover:bg-muted'
                  : 'cursor-not-allowed border-dashed border-line bg-card text-ink-faint',
            )}
            disabled={!option.enabled}
            key={option.type}
            onClick={() => onChange(option.type)}
            role="radio"
            title={option.enabled ? option.label : `Precisa de ${option.requirement}`}
            type="button"
          >
            <Icon aria-hidden className="h-4 w-4" />
            <span className="hidden xl:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
