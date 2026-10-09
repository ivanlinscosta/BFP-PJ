import { Check, ChevronDown, Search, Sparkles, Star } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import {
  VISUALIZATION_CATEGORIES,
  chartName,
  describeShape,
  type ChartType,
  type VisualizationEvaluation,
} from '@bfp/shared';
import { Popover } from '@/components/ui/popover';
import { trackEvent } from '@/lib/telemetry';
import { normalizeText } from '@/lib/text';
import { cn } from '@/lib/utils';
import { VISUALIZATION_REGISTRY, resolveDefinition } from './registry';
import type { useVisualizationModel } from './visualization-renderer';

type Model = ReturnType<typeof useVisualizationModel>;

function Option({
  type,
  evaluation,
  reason,
  selected,
  starred,
  onPick,
}: {
  type: ChartType;
  evaluation: VisualizationEvaluation;
  reason?: string;
  selected: boolean;
  starred?: boolean;
  onPick(): void;
}) {
  const definition = resolveDefinition(type);
  const Icon = definition.icon;
  const disabled = !evaluation.compatible;
  return (
    <button
      aria-disabled={disabled}
      aria-selected={selected}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left focus-visible:bg-muted',
        disabled ? 'cursor-not-allowed opacity-55' : 'hover:bg-muted',
        selected && 'bg-tint',
      )}
      onClick={onPick}
      role="option"
      title={disabled ? evaluation.reason : undefined}
      type="button"
    >
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)]',
          disabled ? 'bg-muted text-ink-faint' : 'bg-cream text-brand-orange',
        )}
      >
        <Icon aria-hidden className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          {starred ? (
            <Star aria-hidden className="h-3.5 w-3.5 fill-brand-orange text-brand-orange" />
          ) : null}
          {definition.name}
          {starred ? (
            <span className="rounded bg-cream px-1.5 py-px text-[10px] font-semibold text-brand-orange">
              Recomendado
            </span>
          ) : null}
        </span>
        <span className="block text-xs leading-snug text-ink-soft">
          {disabled ? evaluation.reason : (reason ?? definition.description)}
        </span>
      </span>
      {selected ? <Check aria-hidden className="mt-1 h-4 w-4 shrink-0 text-brand-navy" /> : null}
    </button>
  );
}

/**
 * VisualizationSelector: one control for every chart type. Opens a popover with search, the
 * recommendations for the current analysis (with the reason), all charts by category and the
 * incompatible ones disabled with what they need — so the user learns how to explore.
 */
export function VisualizationSelector({
  model,
  onSelect,
  surface = 'explorer',
  compact = false,
}: {
  model: Model;
  onSelect(type: ChartType | 'AUTO'): void;
  surface?: 'explorer' | 'dashboard' | 'chat';
  /** Smaller trigger without the caption (chat cards). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const [query, setQuery] = useState('');
  const { resolved, evaluations, recommendations, shape } = model;
  const auto = resolved.mode === 'AUTO';
  const current = resolved.incompatible?.requested ?? resolved.type;
  const byType = useMemo(
    () => new Map(evaluations.map((evaluation) => [evaluation.type, evaluation])),
    [evaluations],
  );
  const search = normalizeText(query.trim());
  const matches = (type: ChartType) => {
    if (!search) return true;
    const definition = resolveDefinition(type);
    return normalizeText(`${definition.name} ${definition.description} ${type}`).includes(search);
  };
  const shapeInfo = describeShape(shape);

  function pick(type: ChartType | 'AUTO') {
    if (type !== 'AUTO' && !byType.get(type)?.compatible) {
      trackEvent('VISUALIZATION_INCOMPATIBLE_ATTEMPT', { type, surface, shape: shapeInfo });
      return;
    }
    const rank = type === 'AUTO' ? -1 : recommendations.findIndex((item) => item.type === type);
    trackEvent(type === 'AUTO' ? 'AUTO_VISUALIZATION_SELECTED' : 'VISUALIZATION_SELECTED', {
      previousType: auto ? 'AUTO' : current,
      type: type === 'AUTO' ? resolved.recommended : type,
      mode: type === 'AUTO' ? 'AUTO' : 'MANUAL',
      surface,
      shape: shapeInfo,
    });
    if (rank >= 0) {
      trackEvent('VISUALIZATION_RECOMMENDATION_ACCEPTED', {
        type,
        rank,
        surface,
        shape: shapeInfo,
      });
    }
    onSelect(type);
    setOpen(false);
    setQuery('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const options = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[role="option"], input'),
    ];
    const index = options.indexOf(document.activeElement as HTMLElement);
    const next =
      options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length];
    next?.focus();
    event.preventDefault();
  }

  const CurrentIcon = resolveDefinition(resolved.type).icon;
  const label = auto ? `Automático · ${chartName(resolved.type)}` : chartName(current);

  return (
    <div className="flex flex-col gap-1">
      <span
        className={
          compact ? 'sr-only' : 'text-[11px] font-semibold tracking-wide text-ink-soft uppercase'
        }
        id={labelId}
      >
        Tipo de visualização
      </span>
      <Popover
        anchor={
          <button
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-labelledby={`${labelId} ${labelId}-value`}
            className={cn(
              'inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-line bg-card px-2.5 font-semibold text-ink hover:border-line-strong',
              compact ? 'h-8 min-w-[200px] text-xs' : 'h-9 min-w-[260px] text-[13px]',
            )}
            onClick={() => {
              if (!open) trackEvent('VISUALIZATION_DROPDOWN_OPENED', { surface, shape: shapeInfo });
              setOpen(!open);
            }}
            type="button"
          >
            {auto ? (
              <Sparkles aria-hidden className="h-4 w-4 text-brand-orange" />
            ) : (
              <CurrentIcon aria-hidden className="h-4 w-4 text-brand-navy" />
            )}
            <span className="flex-1 truncate text-left" id={`${labelId}-value`}>
              {label}
            </span>
            <ChevronDown aria-hidden className="h-4 w-4 text-ink-faint" />
          </button>
        }
        align={compact ? 'end' : 'start'}
        className="w-[400px] p-0"
        onClose={() => setOpen(false)}
        open={open}
      >
        <div onKeyDown={handleKeyDown}>
          <label className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <Search aria-hidden className="h-4 w-4 text-ink-faint" />
            <input
              aria-label="Buscar visualização"
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
              data-autofocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar visualização…"
              value={query}
            />
          </label>
          <div
            aria-label="Tipos de visualização"
            className="max-h-[460px] overflow-y-auto p-2"
            role="listbox"
          >
            {!search ? (
              <>
                <button
                  aria-selected={auto}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left hover:bg-muted focus-visible:bg-muted',
                    auto && 'bg-tint',
                  )}
                  onClick={() => pick('AUTO')}
                  role="option"
                  type="button"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand-navy text-white">
                    <Sparkles aria-hidden className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink">Automático</span>
                    <span className="block text-xs text-ink-soft">
                      A plataforma escolhe: {chartName(resolved.recommended)}. Muda quando a análise
                      muda.
                    </span>
                  </span>
                  {auto ? <Check aria-hidden className="mt-1 h-4 w-4 text-brand-navy" /> : null}
                </button>
                {recommendations.length > 0 ? (
                  <div className="mt-2">
                    <p className="m-0 px-2 py-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
                      Recomendadas para esta análise
                    </p>
                    {recommendations.map((recommendation, index) => (
                      <Option
                        evaluation={byType.get(recommendation.type)!}
                        key={recommendation.type}
                        onPick={() => pick(recommendation.type)}
                        reason={recommendation.reason}
                        selected={!auto && current === recommendation.type}
                        starred={index === 0}
                        type={recommendation.type}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            {VISUALIZATION_CATEGORIES.map((category) => {
              const types = [...VISUALIZATION_REGISTRY.values()]
                .filter((definition) => definition.category === category.id)
                .map((definition) => definition.type)
                .filter(matches);
              if (types.length === 0) return null;
              return (
                <div
                  className="mt-2 border-t border-line pt-2 first:mt-0 first:border-t-0 first:pt-0"
                  key={category.id}
                >
                  <p className="m-0 px-2 py-1 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
                    {category.label}
                  </p>
                  {types.map((type) => (
                    <Option
                      evaluation={byType.get(type)!}
                      key={type}
                      onPick={() => pick(type)}
                      reason={byType.get(type)?.compatible ? byType.get(type)?.why : undefined}
                      selected={!auto && current === type}
                      type={type}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </Popover>
    </div>
  );
}
