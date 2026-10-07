import {
  ChartNoAxesColumn,
  GripVertical,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { CertificationBadge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/card';
import { SearchInput } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import type { CatalogDimension, CatalogMetric } from '@/features/catalog/api';
import { normalizeText } from '@/lib/text';
import { cn } from '@/lib/utils';
import { setDraggedItem, type DraggedItem } from '../dnd';
import { isDimensionCompatible, MONTH_DIMENSION_ID } from '../spec';

type LibraryTab = 'all' | 'metrics' | 'dimensions';

interface LibraryProps {
  metrics: CatalogMetric[];
  dimensions: CatalogDimension[];
  loading: boolean;
  selectedMetricIds: string[];
  selectedDimensionIds: string[];
  /** Metrics currently in the spec, used to flag incompatible dimensions. */
  activeMetrics: CatalogMetric[];
  monthSelected: boolean;
  /** Mesh bases selected for the analysis; items from other bases are disabled. */
  selectedDatasets: string[];
  datasetName(id: string): string;
  onToggle(item: DraggedItem): void;
}

function LibraryItem({
  item,
  label,
  selected,
  disabled,
  disabledReason,
  certified,
  onToggle,
}: {
  item: DraggedItem;
  label: string;
  selected: boolean;
  disabled?: boolean;
  disabledReason?: string;
  certified?: boolean;
  onToggle(item: DraggedItem): void;
}) {
  const Icon = item.kind === 'metric' ? ChartNoAxesColumn : Layers;
  return (
    <li>
      <button
        aria-pressed={selected}
        className={cn(
          'group flex w-full flex-col items-start rounded-[var(--radius-control)] px-2 py-[5px] text-left transition-colors',
          selected ? 'bg-cream' : 'hover:bg-muted',
          disabled && 'cursor-not-allowed opacity-45 hover:bg-transparent',
        )}
        disabled={disabled}
        draggable={!disabled}
        onClick={() => onToggle(item)}
        onDragStart={(event) => setDraggedItem(event, item)}
        title={
          disabled
            ? disabledReason
            : selected
              ? `Remover ${label} da análise`
              : `Adicionar ${label} à análise`
        }
        type="button"
      >
        <span className="flex w-full items-center gap-2">
          <GripVertical
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-line-strong group-hover:text-ink-faint"
          />
          <Icon
            aria-hidden
            className={cn(
              'h-4 w-4 shrink-0',
              item.kind === 'metric' ? 'text-brand-orange' : 'text-brand-navy',
            )}
            strokeWidth={item.kind === 'metric' ? 2.5 : 1.75}
          />
          <span
            className={cn('truncate text-sm', selected ? 'font-semibold text-ink' : 'text-ink')}
          >
            {label}
          </span>
        </span>
        {certified ? (
          <CertificationBadge
            className="mt-1.5 ml-[44px] h-[22px] text-[11px]"
            status="CERTIFIED"
          />
        ) : null}
      </button>
    </li>
  );
}

/** Left panel of the playground: governed metrics and dimensions (click, drag or keyboard). */
export function DataLibrary(props: LibraryProps) {
  const [tab, setTab] = useState<LibraryTab>('all');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const normalizedQuery = normalizeText(query);

  const metrics = useMemo(() => {
    const base = normalizedQuery
      ? props.metrics.filter((metric) =>
          normalizeText(`${metric.shortName} ${metric.name} ${metric.tags.join(' ')}`).includes(
            normalizedQuery,
          ),
        )
      : tab === 'metrics'
        ? props.metrics
        : props.metrics.filter((metric) => metric.featured);
    return [...base].sort((left, right) => (left.libraryOrder ?? 99) - (right.libraryOrder ?? 99));
  }, [props.metrics, normalizedQuery, tab]);

  const dimensions = useMemo(() => {
    const categorical = props.dimensions.filter((dimension) => dimension.type !== 'date');
    const base = normalizedQuery
      ? categorical.filter((dimension) =>
          normalizeText(`${dimension.label} ${dimension.name}`).includes(normalizedQuery),
        )
      : tab === 'dimensions'
        ? categorical
        : categorical.filter((dimension) => dimension.featured);
    return [...base].sort(
      (left, right) =>
        (left.libraryOrder ?? 99) - (right.libraryOrder ?? 99) || left.ordering - right.ordering,
    );
  }, [props.dimensions, normalizedQuery, tab]);

  const showMonth =
    !normalizedQuery ||
    'mes'.includes(normalizedQuery) ||
    normalizeText('Mês').includes(normalizedQuery);

  if (collapsed) {
    return (
      <aside className="flex h-full flex-col items-center rounded-[var(--radius-card)] border border-line bg-card py-4">
        <button
          aria-label="Expandir biblioteca de dados"
          className="rounded p-1 text-ink-soft hover:bg-muted"
          onClick={() => setCollapsed(false)}
          type="button"
        >
          <PanelLeftOpen aria-hidden className="h-[18px] w-[18px]" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Biblioteca de dados"
      className="flex flex-col rounded-[var(--radius-card)] border border-line bg-card px-4 pt-4 pb-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[15px] font-semibold text-brand-navy">Biblioteca de dados</h2>
        <button
          aria-label="Recolher biblioteca de dados"
          className="rounded p-1 text-ink-soft hover:bg-muted"
          onClick={() => setCollapsed(true)}
          type="button"
        >
          <PanelLeftClose aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </button>
      </div>
      <SearchInput
        aria-label="Buscar métricas ou dimensões"
        className="h-10"
        containerClassName="mt-4"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar métricas ou dimensões"
        value={query}
      />
      <Tabs
        className="mt-5"
        items={[
          { value: 'all', label: 'Tudo' },
          { value: 'metrics', label: 'Métricas' },
          { value: 'dimensions', label: 'Dimensões' },
        ]}
        label="Filtrar biblioteca"
        onChange={setTab}
        value={tab}
      />

      {props.loading ? (
        <div className="mt-5 flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton className="h-7" key={index} />
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-col">
          {tab !== 'dimensions' ? (
            <section aria-label="Métricas">
              <Eyebrow className="mb-1 px-0 pt-1">Métricas</Eyebrow>
              {metrics.length === 0 ? (
                <p className="px-2 py-2 text-[13px] text-ink-soft">Nenhuma métrica encontrada.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {metrics.map((metric) => {
                    const missing = (metric.datasets ?? []).filter(
                      (id) => !props.selectedDatasets.includes(id),
                    );
                    return (
                      <LibraryItem
                        certified={metric.certificationStatus === 'CERTIFIED'}
                        disabled={
                          missing.length > 0 && !props.selectedMetricIds.includes(metric.id)
                        }
                        disabledReason={`Selecione a base ${missing.map(props.datasetName).join(' e ')} para usar ${metric.shortName}.`}
                        item={{ kind: 'metric', id: metric.id }}
                        key={metric.id}
                        label={metric.shortName}
                        onToggle={props.onToggle}
                        selected={props.selectedMetricIds.includes(metric.id)}
                      />
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}

          {tab === 'all' ? <div className="my-3 border-t border-line" /> : null}

          {tab !== 'metrics' ? (
            <section aria-label="Dimensões">
              <Eyebrow className="mb-1 pt-1">Dimensões</Eyebrow>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {dimensions.map((dimension) => {
                  const compatible = isDimensionCompatible(dimension.id, props.activeMetrics);
                  const inSelectedBase =
                    !dimension.dataset || props.selectedDatasets.includes(dimension.dataset);
                  return (
                    <LibraryItem
                      disabled={!compatible || !inSelectedBase}
                      disabledReason={
                        !inSelectedBase
                          ? `Selecione a base ${props.datasetName(dimension.dataset ?? '')} para usar ${dimension.label}.`
                          : `${dimension.label} não é compatível com as métricas selecionadas.`
                      }
                      item={{ kind: 'dimension', id: dimension.id }}
                      key={dimension.id}
                      label={dimension.label}
                      onToggle={props.onToggle}
                      selected={props.selectedDimensionIds.includes(dimension.id)}
                    />
                  );
                })}
                {showMonth ? (
                  <LibraryItem
                    item={{ kind: 'dimension', id: MONTH_DIMENSION_ID }}
                    label="Mês"
                    onToggle={props.onToggle}
                    selected={props.monthSelected}
                  />
                ) : null}
              </ul>
            </section>
          ) : null}
        </div>
      )}
      <p className="mt-5 text-[11px] text-ink-soft">Arraste os objetos para montar sua análise.</p>
    </aside>
  );
}
