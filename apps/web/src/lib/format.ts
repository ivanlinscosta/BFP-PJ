import type { ColumnFormat, MetricFormat, MetricSemanticType } from '@bfp/domain';

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const integerFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});
const compactCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const compactNumberFormatter = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const oneDecimalFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/**
 * Central formatter of metric values (pt-BR): 8,8% · R$ 1,2 mi · 12.418 · 1,2 mi · 3,2 dias ·
 * 84/100. `compact` shortens large numbers (axes, labels); `semantic` and `unit` come from the
 * metric definition when known.
 */
export function formatMetricValue(
  value: unknown,
  format: ColumnFormat | MetricFormat | undefined,
  options: { compact?: boolean; semantic?: MetricSemanticType; unit?: string } = {},
) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Não';
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    return String(value);
  }

  if (format === 'percent') {
    return `${percentFormatter.format(value * 100)}%`;
  }

  if (options.semantic === 'SCORE') {
    return `${integerFormatter.format(Math.round(value))}/100`;
  }

  if (options.semantic === 'DURATION' && options.unit) {
    return `${oneDecimalFormatter.format(value)} ${options.unit}`;
  }

  if (format === 'currency') {
    return options.compact && Math.abs(value) >= 10_000
      ? compactCurrencyFormatter.format(value)
      : currencyFormatter.format(value);
  }

  if (options.compact && Math.abs(value) >= 10_000) {
    return compactNumberFormatter.format(value);
  }

  return Number.isInteger(value) ? integerFormatter.format(value) : decimalFormatter.format(value);
}

/** Formats an integer count (2.418). */
export function formatCount(value: number) {
  return integerFormatter.format(value);
}

/** Formats a ratio as percentage with one decimal (0.127 → 12,7%). */
export function formatShare(value: number) {
  return `${percentFormatter.format(value * 100)}%`;
}

/** dd/mm/aaaa */
export function formatDate(value: string | null | undefined) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

/** "12 Jul" style used by the Customer 360 timeline. */
export function formatDayMonth(value: string) {
  const date = new Date(value);
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '');
  return `${date.getDate()} ${month.charAt(0).toUpperCase()}${month.slice(1)}`;
}

/** "Julho de 2026" */
export function formatMonthYear(value: string) {
  const formatted = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(value),
  );
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/** Relative time in pt-BR: "agora", "há 12 min", "há 2 h", "ontem", "há 3 dias". */
export function formatRelative(value: string | null | undefined, now: Date = new Date()) {
  if (!value) {
    return '—';
  }

  const diffMs = now.getTime() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  return formatDate(value);
}

/** Minutes rendered as "12 min", "3 h" or "2 dias". */
export function formatMinutes(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h`;
  const days = Math.round(minutes / (60 * 24));
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/** Capitalizes the first letter. */
export function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
