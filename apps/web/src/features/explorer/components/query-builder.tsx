import { Database, Plus } from 'lucide-react';
import { DragEvent, ReactNode, useState } from 'react';
import type { AnalysisSpec, FilterCondition } from '@bfp/domain';
import { describeFilter, type SpecLabelResolver } from '@bfp/shared';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Popover } from '@/components/ui/popover';
import type { CatalogDimension, CatalogMetric } from '@/features/catalog/api';
import { cn } from '@/lib/utils';
import { hasDraggedItem, readDraggedItem, type DraggedItem } from '../dnd';
import { isDimensionCompatible, MONTH_DIMENSION_ID } from '../spec';
import { FilterDialog } from './filter-dialog';
import { PeriodPicker } from './period-picker';

export interface QueryBuilderProps {
  spec: AnalysisSpec;
  metrics: CatalogMetric[];
  dimensions: CatalogDimension[];
  labels: SpecLabelResolver;
  onAdd(item: DraggedItem): void;
  onRemoveMetric(id: string): void;
  onRemoveDimension(id: string): void;
  onAddFilter(filter: FilterCondition): void;
  onUpdateFilter(index: number, filter: FilterCondition): void;
  onRemoveFilter(index: number): void;
  onDateRangeChange: Parameters<typeof PeriodPicker>[0]['onChange'];
  onClear(): void;
  /** Data mesh bases selected for the analysis. */
  datasets: Array<{ id: string; name: string }>;
  onPickDatasets(): void;
  onRemoveDataset(datasetId: string): void;
}

/** "Bases de dados" row: the user chooses which mesh data products the engine may join. */
function DatasetSection({
  datasets,
  onPick,
  onRemove,
}: {
  datasets: Array<{ id: string; name: string }>;
  onPick(): void;
  onRemove(datasetId: string): void;
}) {
  return (
    <div className="mb-4 border-b border-line pb-4">
      <SlotLabel>Bases de dados (data mesh)</SlotLabel>
      <div className="flex flex-wrap items-center gap-2">
        {datasets.map((dataset) => (
          <Chip
            key={dataset.id}
            onRemove={() => onRemove(dataset.id)}
            removeLabel={`Remover base ${dataset.name}`}
            tone="dimension"
          >
            <Database aria-hidden className="h-3.5 w-3.5" />
            {dataset.name}
          </Chip>
        ))}
        <Button
          onClick={onPick}
          size="sm"
          variant={datasets.length === 0 ? 'primary' : 'secondary'}
        >
          <Database aria-hidden className="h-4 w-4" />
          {datasets.length === 0 ? 'Selecionar bases de dados' : 'Alterar bases'}
        </Button>
        {datasets.length === 0 ? (
          <span className="text-xs text-ink-soft">
            O motor só é acionado depois que você escolher as bases.
          </span>
        ) : datasets.length > 1 ? (
          <span className="text-xs text-ink-soft">
            As bases são unidas por company_id quando a análise cruza dados.
          </span>
        ) : null}
      </div>
    </div>
  );
}

function useDropTarget(kind: DraggedItem['kind'], onAdd: (item: DraggedItem) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver(event: DragEvent) {
        if (!hasDraggedItem(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setOver(true);
      },
      onDragLeave() {
        setOver(false);
      },
      onDrop(event: DragEvent) {
        event.preventDefault();
        setOver(false);
        const item = readDraggedItem(event);
        if (item && item.kind === kind) onAdd(item);
        else if (item) onAdd(item);
      },
    },
  };
}

function ItemPicker({
  kind,
  metrics,
  dimensions,
  spec,
  onPick,
  children,
}: {
  kind: DraggedItem['kind'];
  metrics: CatalogMetric[];
  dimensions: CatalogDimension[];
  spec: AnalysisSpec;
  onPick(item: DraggedItem): void;
  children: (toggle: () => void, open: boolean) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const activeMetrics = metrics.filter((metric) =>
    spec.metrics.some((selected) => selected.id === metric.id),
  );
  const options =
    kind === 'metric'
      ? metrics
          .filter((metric) => !spec.metrics.some((selected) => selected.id === metric.id))
          .map((metric) => ({
            id: metric.id,
            label: metric.shortName,
            disabled: false,
            featured: metric.featured,
          }))
      : [
          ...dimensions
            .filter((dimension) => dimension.type !== 'date')
            .filter(
              (dimension) => !spec.dimensions.some((selected) => selected.id === dimension.id),
            )
            .map((dimension) => ({
              id: dimension.id,
              label: dimension.label,
              disabled: !isDimensionCompatible(dimension.id, activeMetrics),
              featured: dimension.featured,
            })),
          {
            id: MONTH_DIMENSION_ID,
            label: 'Mês',
            disabled: activeMetrics.length === 0,
            featured: true,
          },
        ];
  const sorted = [...options].sort(
    (left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured)),
  );

  return (
    <Popover
      anchor={children(() => setOpen((current) => !current), open)}
      className="max-h-72 w-72 overflow-y-auto"
      onClose={() => setOpen(false)}
      open={open}
    >
      <ul
        aria-label={kind === 'metric' ? 'Métricas disponíveis' : 'Dimensões disponíveis'}
        className="m-0 list-none p-0"
        role="listbox"
      >
        {sorted.map((option) => (
          <li key={option.id}>
            <button
              aria-disabled={option.disabled}
              className={cn(
                'w-full rounded px-3 py-2 text-left text-sm',
                option.disabled ? 'cursor-not-allowed text-ink-faint' : 'text-ink hover:bg-muted',
              )}
              disabled={option.disabled}
              onClick={() => {
                onPick({ kind, id: option.id });
                setOpen(false);
              }}
              role="option"
              aria-selected={false}
              type="button"
            >
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

function SlotLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-semibold text-ink">{children}</p>;
}

/** Empty drop slot that also opens a picker on click (drag-and-drop is never the only path). */
function DropSlot({
  label,
  placeholder,
  kind,
  onAdd,
  onClick,
  open,
}: {
  label: string;
  placeholder: string;
  kind: DraggedItem['kind'];
  onAdd(item: DraggedItem): void;
  onClick(): void;
  open: boolean;
}) {
  const { over, handlers } = useDropTarget(kind, onAdd);
  return (
    <button
      aria-expanded={open}
      aria-label={`${label}: ${placeholder}`}
      className={cn(
        'flex h-[31px] w-full items-center rounded border px-2.5 text-left text-[13px] text-brand-navy-soft transition-colors',
        over
          ? 'border-dashed border-brand-orange bg-cream'
          : 'border-line bg-card hover:border-line-strong',
      )}
      onClick={onClick}
      type="button"
      {...handlers}
    >
      {placeholder}
    </button>
  );
}

function AddButton({ label, onClick, open }: { label: string; onClick(): void; open?: boolean }) {
  return (
    <button
      aria-expanded={open}
      aria-label={label}
      className="flex h-[30px] w-[30px] items-center justify-center rounded border border-dashed border-line-strong text-ink-soft hover:border-brand-navy hover:text-brand-navy"
      onClick={onClick}
      title={label}
      type="button"
    >
      <Plus aria-hidden className="h-4 w-4" />
    </button>
  );
}

function ChipZone({
  kind,
  onAdd,
  children,
}: {
  kind: DraggedItem['kind'];
  onAdd(item: DraggedItem): void;
  children: ReactNode;
}) {
  const { over, handlers } = useDropTarget(kind, onAdd);
  return (
    <div
      className={cn(
        'flex min-h-[34px] flex-wrap items-center gap-2 rounded transition-colors',
        over && 'bg-cream outline outline-1 outline-brand-orange outline-dashed',
      )}
      {...handlers}
    >
      {children}
    </div>
  );
}

/** Query shelf: metrics, dimensions, filters and period. Every change edits the AnalysisSpec. */
export function QueryBuilder(props: QueryBuilderProps) {
  const { spec, labels } = props;
  const [filterDialog, setFilterDialog] = useState<{ open: boolean; index?: number }>({
    open: false,
  });
  const isEmpty =
    spec.metrics.length === 0 && spec.dimensions.length === 0 && spec.filters.length === 0;

  const filterDialogElement = (
    <FilterDialog
      dimensions={props.dimensions}
      initial={filterDialog.index !== undefined ? spec.filters[filterDialog.index] : undefined}
      key={`${filterDialog.open}-${filterDialog.index ?? 'new'}`}
      onClose={() => setFilterDialog({ open: false })}
      onSubmit={(filter) =>
        filterDialog.index !== undefined
          ? props.onUpdateFilter(filterDialog.index, filter)
          : props.onAddFilter(filter)
      }
      open={filterDialog.open}
    />
  );

  const metricPicker = (renderAnchor: (toggle: () => void, open: boolean) => ReactNode) => (
    <ItemPicker
      dimensions={props.dimensions}
      kind="metric"
      metrics={props.metrics}
      onPick={props.onAdd}
      spec={spec}
    >
      {renderAnchor}
    </ItemPicker>
  );
  const dimensionPicker = (renderAnchor: (toggle: () => void, open: boolean) => ReactNode) => (
    <ItemPicker
      dimensions={props.dimensions}
      kind="dimension"
      metrics={props.metrics}
      onPick={props.onAdd}
      spec={spec}
    >
      {renderAnchor}
    </ItemPicker>
  );

  if (isEmpty) {
    return (
      <Card className="px-4 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Construtor de análise</CardTitle>
            <CardDescription className="mt-1.5">
              Defina métricas, dimensões, filtros e período antes de visualizar.
            </CardDescription>
          </div>
          <Button onClick={props.onClear} size="sm" variant="secondary">
            Limpar tudo
          </Button>
        </div>
        <div className="mt-5">
          <DatasetSection
            datasets={props.datasets}
            onPick={props.onPickDatasets}
            onRemove={props.onRemoveDataset}
          />
        </div>
        <div className="grid gap-x-4 gap-y-4 md:grid-cols-[1fr_280px]">
          <div>
            <SlotLabel>Métricas</SlotLabel>
            {metricPicker((toggle, open) => (
              <DropSlot
                kind="metric"
                label="Métricas"
                onAdd={props.onAdd}
                onClick={toggle}
                open={open}
                placeholder="Arraste uma métrica para começar"
              />
            ))}
          </div>
          <div>
            <SlotLabel>Filtros</SlotLabel>
            <button
              className="flex h-[31px] w-full items-center rounded border border-line bg-card px-2.5 text-left text-[13px] text-brand-navy-soft hover:border-line-strong"
              onClick={() => setFilterDialog({ open: true })}
              type="button"
            >
              Adicione um filtro para restringir a análise
            </button>
          </div>
          <div>
            <SlotLabel>Dimensões</SlotLabel>
            {dimensionPicker((toggle, open) => (
              <DropSlot
                kind="dimension"
                label="Dimensões"
                onAdd={props.onAdd}
                onClick={toggle}
                open={open}
                placeholder="Arraste uma dimensão para segmentar os dados"
              />
            ))}
          </div>
          <div>
            <SlotLabel>Período</SlotLabel>
            <PeriodPicker onChange={props.onDateRangeChange} value={spec.dateRange} />
          </div>
        </div>
        {filterDialogElement}
      </Card>
    );
  }

  const wide = spec.dimensions.length >= 2;
  const metricSection = (
    <div>
      <SlotLabel>Métricas</SlotLabel>
      <ChipZone kind="metric" onAdd={props.onAdd}>
        {spec.metrics.map((metric) => (
          <Chip
            key={metric.id}
            onRemove={() => props.onRemoveMetric(metric.id)}
            removeLabel={`Remover ${labels.metric(metric.id)}`}
            tone="metric"
          >
            {labels.metric(metric.id)}
          </Chip>
        ))}
        {spec.metrics.length === 0
          ? metricPicker((toggle, open) => (
              <DropSlot
                kind="metric"
                label="Métricas"
                onAdd={props.onAdd}
                onClick={toggle}
                open={open}
                placeholder="Arraste uma métrica"
              />
            ))
          : metricPicker((toggle, open) => (
              <AddButton label="Adicionar métrica" onClick={toggle} open={open} />
            ))}
      </ChipZone>
    </div>
  );
  const dimensionSection = (
    <div>
      <SlotLabel>Dimensões</SlotLabel>
      <ChipZone kind="dimension" onAdd={props.onAdd}>
        {spec.dimensions.map((dimension) => (
          <Chip
            key={dimension.id}
            onRemove={() => props.onRemoveDimension(dimension.id)}
            removeLabel={`Remover ${labels.dimension(dimension.id)}`}
            tone="dimension"
          >
            {dimension.granularity === 'month' ? 'Mês' : labels.dimension(dimension.id)}
          </Chip>
        ))}
        {dimensionPicker((toggle, open) =>
          spec.dimensions.length === 0 ? (
            <DropSlot
              kind="dimension"
              label="Dimensões"
              onAdd={props.onAdd}
              onClick={toggle}
              open={open}
              placeholder="Arraste uma dimensão"
            />
          ) : (
            <AddButton label="Adicionar dimensão" onClick={toggle} open={open} />
          ),
        )}
      </ChipZone>
    </div>
  );
  const filterSection = (
    <div>
      <SlotLabel>Filtros</SlotLabel>
      <div className="flex min-h-[34px] flex-wrap items-center gap-2">
        {spec.filters.map((filter, index) => (
          <Chip
            key={`${filter.field}-${index}`}
            onRemove={() => props.onRemoveFilter(index)}
            removeLabel={`Remover filtro ${describeFilter(filter, labels)}`}
            tone="filter"
          >
            <button
              className="hover:underline"
              onClick={() => setFilterDialog({ open: true, index })}
              type="button"
            >
              {describeFilter(filter, labels)}
            </button>
          </Chip>
        ))}
        <AddButton label="Adicionar filtro" onClick={() => setFilterDialog({ open: true })} />
      </div>
    </div>
  );
  const periodSection = (
    <div>
      <SlotLabel>Período</SlotLabel>
      <div className="flex min-h-[34px] items-center">
        <PeriodPicker onChange={props.onDateRangeChange} value={spec.dateRange} variant="chip" />
      </div>
    </div>
  );

  return (
    <Card className={cn('px-4', wide ? 'py-3.5' : 'py-4')}>
      <DatasetSection
        datasets={props.datasets}
        onPick={props.onPickDatasets}
        onRemove={props.onRemoveDataset}
      />
      <div
        className={cn(
          'grid gap-x-6 gap-y-3',
          wide ? 'lg:grid-cols-[1fr_1.3fr_1fr_1fr]' : 'md:grid-cols-[250px_1fr]',
        )}
      >
        {metricSection}
        {dimensionSection}
        {filterSection}
        {periodSection}
      </div>
      {filterDialogElement}
    </Card>
  );
}
