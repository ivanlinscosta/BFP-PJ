import { ArrowRight, BadgeCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { VisualizationType } from '@bfp/domain';
import { Badge } from '@/components/ui/badge';
import { Card, Eyebrow } from '@/components/ui/card';
import { ActionChip } from '@/components/ui/chip';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs } from '@/components/ui/tabs';
import type { MetricDetail } from '@/features/catalog/api';
import type { BarSort } from '@/features/viz/bar-chart';
import { AnalyticsTable } from '@/features/viz/data-table';
import { formatMinutes, formatShare } from '@/lib/format';
import type { AnalyticsResponse } from '../api';
import type { NextExploration } from '../explorations';

const SUGGESTIONS = [
  {
    title: 'Barras',
    badge: '1 métrica',
    tone: 'cream' as const,
    description: 'Compare valores por dimensão.',
  },
  {
    title: 'Linha',
    badge: 'Mês',
    tone: 'tint' as const,
    description: 'Veja a evolução ao longo do tempo.',
  },
  {
    title: 'Mapa de calor',
    badge: 'Cruzamento',
    tone: 'tint' as const,
    description: 'Explore a relação entre duas dimensões.',
  },
];

/** Right panel of the empty playground: visualization suggestions. */
export function EmptySidePanel() {
  const [tab, setTab] = useState<'viz' | 'data'>('viz');
  return (
    <Card className="flex min-h-[558px] flex-col px-4 pt-6 pb-4">
      <Tabs
        items={[
          { value: 'viz', label: 'Visualização' },
          { value: 'data', label: 'Dados' },
        ]}
        label="Painel da análise"
        onChange={setTab}
        value={tab}
      />
      {tab === 'viz' ? (
        <>
          <p className="mt-8 text-xs font-semibold text-ink-soft">Sugestões de visualização</p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
            {SUGGESTIONS.map((suggestion) => (
              <li
                className="rounded-[var(--radius-control)] border border-line bg-muted px-3 py-3"
                key={suggestion.title}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold text-brand-navy">
                    {suggestion.title}
                  </span>
                  <Badge
                    className="h-5 text-[11px]"
                    tone={suggestion.tone === 'cream' ? 'cream' : 'tint'}
                  >
                    {suggestion.badge}
                  </Badge>
                </div>
                <p className="mt-2 text-[13px] text-ink-soft">{suggestion.description}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-8 text-[13px] text-ink-soft">
          Adicione uma métrica para ver a origem dos dados, o produto de dados e a qualidade do
          recorte.
        </p>
      )}
      <div className="mt-auto rounded-[var(--radius-control)] border border-line bg-muted px-3 py-3">
        <p className="text-xs font-semibold text-ink-soft">Próximos insights</p>
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          Quando você adicionar métricas e dimensões, este painel mostrará sugestões de
          visualização, distribuição dos dados e alertas de consistência.
        </p>
      </div>
    </Card>
  );
}

export interface VisualizationSettings {
  sort: BarSort;
  showValues: boolean;
  showTable: boolean;
  showLegend: boolean;
}

const TYPE_LABELS: Partial<Record<VisualizationType | 'KPI', string>> = {
  TABLE: 'Tabela',
  BAR: 'Barras',
  GROUPED_BAR: 'Barras agrupadas',
  LINE: 'Linha',
  HEATMAP: 'Mapa de calor',
  SCATTER: 'Dispersão',
  KPI: 'Indicadores',
  STACKED_BAR: 'Barras empilhadas',
};

/** Right panel with visualization settings, data tab and next explorations. */
export function ResultSidePanel({
  type,
  options,
  onTypeChange,
  settings,
  onSettingsChange,
  explorations,
  onExplore,
  result,
}: {
  type: VisualizationType | 'KPI';
  options: Array<{ type: VisualizationType; label: string; enabled: boolean }>;
  onTypeChange(type: VisualizationType): void;
  settings: VisualizationSettings;
  onSettingsChange(settings: VisualizationSettings): void;
  explorations: NextExploration[];
  onExplore(exploration: NextExploration): void;
  result: AnalyticsResponse | undefined;
}) {
  const [tab, setTab] = useState<'viz' | 'data'>('viz');
  return (
    <Card className="px-3 pt-5 pb-3">
      <Tabs
        items={[
          { value: 'viz', label: 'Visualização' },
          { value: 'data', label: 'Dados' },
        ]}
        label="Painel da análise"
        onChange={setTab}
        value={tab}
      />
      {tab === 'viz' ? (
        <div className="mt-4 flex flex-col">
          <label className="text-sm font-semibold text-ink" htmlFor="viz-type">
            Tipo
          </label>
          <Select
            className="mt-2 text-ink-soft"
            id="viz-type"
            leadingChevron
            onChange={(event) => onTypeChange(event.target.value as VisualizationType)}
            value={type === 'GROUPED_BAR' ? 'BAR' : type}
          >
            {options.map((option) => (
              <option disabled={!option.enabled} key={option.type} value={option.type}>
                {option.label}
              </option>
            ))}
            {type === 'KPI' ? <option value="KPI">{TYPE_LABELS.KPI}</option> : null}
          </Select>
          <label className="mt-4 text-sm font-semibold text-ink" htmlFor="viz-sort">
            Ordenação
          </label>
          <Select
            className="mt-2 text-ink-soft"
            id="viz-sort"
            leadingChevron
            onChange={(event) =>
              onSettingsChange({ ...settings, sort: event.target.value as BarSort })
            }
            value={settings.sort}
          >
            <option value="DESC">Maior → menor</option>
            <option value="ASC">Menor → maior</option>
            <option value="LABEL">A → Z</option>
          </Select>
          <div className="mt-4 flex flex-col gap-3 text-sm text-ink">
            {(
              [
                ['showValues', 'Mostrar valores'],
                ['showTable', 'Mostrar tabela'],
                ['showLegend', 'Legenda'],
              ] as const
            ).map(([key, label]) => (
              <div className="flex items-center justify-between" key={key}>
                <span>{label}</span>
                <Switch
                  checked={settings[key]}
                  label={label}
                  onCheckedChange={(checked) => onSettingsChange({ ...settings, [key]: checked })}
                />
              </div>
            ))}
          </div>
          {explorations.length > 0 ? (
            <div className="mt-4 border-t border-line pt-3">
              <Eyebrow>Próximas explorações</Eyebrow>
              <div className="mt-2 flex flex-col gap-1.5">
                {explorations.map((exploration) => (
                  <ActionChip key={exploration.id} onClick={() => onExplore(exploration)}>
                    {exploration.label}
                  </ActionChip>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 text-[13px] text-ink-soft">
          {result ? (
            <>
              <p>
                {result.metadata.rowCount} linhas agregadas · consulta em{' '}
                {result.metadata.executionMs} ms
              </p>
              <div className="max-h-80 overflow-y-auto">
                <AnalyticsTable result={result} />
              </div>
            </>
          ) : (
            <p>Execute a análise para ver os dados agregados.</p>
          )}
        </div>
      )}
    </Card>
  );
}

/** Governance card of the primary metric: certification, owner, freshness and quality. */
export function MetricTrustCard({ detail }: { detail: MetricDetail | undefined }) {
  if (!detail) return null;
  const certified = detail.metric.certificationStatus === 'CERTIFIED';
  return (
    <section
      aria-label="Confiança da métrica"
      className="rounded-[var(--radius-card)] bg-tint px-3 py-4"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-navy uppercase">
        <BadgeCheck aria-hidden className="h-4 w-4" />
        {certified
          ? 'Certificada'
          : detail.metric.certificationStatus === 'EXPERIMENTAL'
            ? 'Experimental'
            : 'Descontinuada'}
      </p>
      <p className="mt-2 text-sm font-semibold text-brand-navy">{detail.metric.shortName}</p>
      <dl className="mt-1 text-xs leading-5 text-ink-soft">
        <div>
          <dt className="inline">Owner </dt>
          <dd className="inline">{detail.trust.owner}</dd>
        </div>
        <div>
          <dt className="inline">Atualização </dt>
          <dd className="inline">{formatMinutes(detail.trust.freshnessMinutes)} atrás</dd>
        </div>
        <div>
          <dt className="inline">Qualidade </dt>
          <dd className="inline">
            {detail.trust.qualityRatio !== null ? formatShare(detail.trust.qualityRatio) : '—'}
          </dd>
        </div>
      </dl>
      <Link
        className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-navy hover:underline"
        to={`/catalogo/metricas/${detail.metric.id}`}
      >
        Ver definição
        <ArrowRight aria-hidden className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
