import type { VisualizationSettings } from '@bfp/domain';
import type { ChartType } from '@bfp/shared';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { AnalyticsResponse } from '@/features/explorer/api';
import { metricColumns } from './model';
import { resolveDefinition, type SettingKey } from './registry';

type Kind =
  | { kind: 'toggle' }
  | { kind: 'select'; options: Array<{ value: string; label: string }> }
  | { kind: 'metric' };

const SETTING_UI: Partial<Record<SettingKey, { label: string } & Kind>> = {
  sort: {
    label: 'Ordenação',
    kind: 'select',
    options: [
      { value: 'DESC', label: 'Maior → menor' },
      { value: 'ASC', label: 'Menor → maior' },
      { value: 'LABEL', label: 'A → Z' },
    ],
  },
  topN: {
    label: 'Mostrar',
    kind: 'select',
    options: [
      { value: '', label: 'Todas as categorias' },
      { value: '5', label: 'Top 5' },
      { value: '10', label: 'Top 10' },
      { value: '15', label: 'Top 15' },
      { value: '20', label: 'Top 20' },
    ],
  },
  bins: {
    label: 'Faixas (bins)',
    kind: 'select',
    options: [
      { value: '', label: 'Automático' },
      { value: '5', label: '5' },
      { value: '8', label: '8' },
      { value: '10', label: '10' },
      { value: '15', label: '15' },
      { value: '20', label: '20' },
    ],
  },
  innerRadius: {
    label: 'Raio interno',
    kind: 'select',
    options: [
      { value: '0', label: 'Pizza (sem furo)' },
      { value: '40', label: 'Pequeno' },
      { value: '55', label: 'Médio' },
      { value: '70', label: 'Grande' },
    ],
  },
  xAxis: { label: 'Eixo X', kind: 'metric' },
  yAxis: { label: 'Eixo Y', kind: 'metric' },
  size: { label: 'Tamanho da bolha', kind: 'metric' },
  showValues: { label: 'Mostrar valores', kind: 'toggle' },
  showLegend: { label: 'Legenda', kind: 'toggle' },
  showGrid: { label: 'Grade', kind: 'toggle' },
  showPoints: { label: 'Mostrar pontos', kind: 'toggle' },
  smooth: { label: 'Suavizar linha', kind: 'toggle' },
  showPercent: { label: 'Mostrar percentual', kind: 'toggle' },
  trendLine: { label: 'Linha de tendência', kind: 'toggle' },
  conditional: { label: 'Formatação condicional', kind: 'toggle' },
};

/** Effective value of a toggle when the user never changed it (same defaults as the renderers). */
function toggleDefault(type: ChartType, key: SettingKey) {
  if (key === 'showValues') {
    return ['BAR_HORIZONTAL', 'SCATTER', 'BUBBLE', 'QUADRANT'].includes(type);
  }
  return key !== 'trendLine';
}

/**
 * "Visualização" panel: only the options of the selected chart (from the registry), plus
 * "Mostrar tabela" for every chart. Changes are saved in the analysis.
 */
export function VisualizationSettingsPanel({
  type,
  settings,
  onChange,
  result,
}: {
  type: ChartType;
  settings: VisualizationSettings;
  onChange(patch: Partial<VisualizationSettings>): void;
  result?: AnalyticsResponse;
}) {
  const definition = resolveDefinition(type);
  const metrics = result ? metricColumns(result) : [];
  const keys: SettingKey[] = [
    ...definition.settings,
    ...(type === 'TABLE' ? [] : ['showTable' as const]),
  ];
  const selects = keys.filter((key) => SETTING_UI[key]?.kind !== 'toggle' && key !== 'showTable');
  const toggles = keys.filter((key) => SETTING_UI[key]?.kind === 'toggle' || key === 'showTable');

  if (keys.length === 0) {
    return <p className="m-0 text-[13px] text-ink-soft">Este gráfico não tem opções.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {selects.map((key) => {
        const ui = SETTING_UI[key]!;
        const id = `viz-setting-${key}`;
        const value = settings[key];
        const options =
          ui.kind === 'metric'
            ? [
                { value: '', label: 'Automático' },
                ...metrics.map((metric) => ({ value: metric.key, label: metric.label })),
              ]
            : ui.kind === 'select'
              ? ui.options
              : [];
        return (
          <div className="flex flex-col gap-2" key={key}>
            <label className="text-sm font-semibold text-ink" htmlFor={id}>
              {ui.label}
            </label>
            <Select
              className="text-ink-soft"
              id={id}
              leadingChevron
              onChange={(event) => {
                const raw = event.target.value;
                const numericKey = key === 'topN' || key === 'bins' || key === 'innerRadius';
                onChange({ [key]: raw === '' ? undefined : numericKey ? Number(raw) : raw });
              }}
              value={
                value === undefined
                  ? key === 'sort'
                    ? 'DESC'
                    : key === 'innerRadius'
                      ? '55'
                      : ''
                  : String(value)
              }
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        );
      })}
      {toggles.length ? (
        <div className="flex flex-col gap-3 text-sm text-ink">
          {toggles.map((key) => {
            const label = key === 'showTable' ? 'Mostrar tabela abaixo' : SETTING_UI[key]!.label;
            const checked =
              (settings[key] as boolean | undefined) ??
              (key === 'showTable' ? false : toggleDefault(type, key));
            return (
              <div className="flex items-center justify-between" key={key}>
                <span>{label}</span>
                <Switch
                  checked={checked}
                  label={label}
                  onCheckedChange={(next) => onChange({ [key]: next })}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
