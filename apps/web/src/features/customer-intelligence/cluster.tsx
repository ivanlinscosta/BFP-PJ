import type { ClusterDNA, DnaDimensionId } from '@bfp/customer-intelligence';
import { DNA_LABELS } from './labels';

const DIMENSIONS: DnaDimensionId[] = [
  'digitalEngagement',
  'productDepth',
  'relationshipStrength',
  'commercialIntent',
  'businessMomentum',
  'transactionActivity',
];

/** Aggregated DNA of a group of customers (similar customers or an audience). */
export function ClusterDnaView({ cluster }: { cluster: ClusterDNA }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 rounded-[var(--radius-card)] bg-tint px-4 py-3 text-sm text-ink">
        {cluster.opportunitySummary}
      </p>
      <section aria-label="DNA médio do grupo">
        <h3 className="m-0 text-sm font-semibold text-brand-navy">
          DNA do grupo · {cluster.populationSize.toLocaleString('pt-BR')} empresas
        </h3>
        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
          {DIMENSIONS.map((id) => {
            const value = cluster.dimensions[id];
            return (
              <li className="text-[13px]" key={id}>
                <div className="flex justify-between">
                  <span className="text-ink">{DNA_LABELS[id].title}</span>
                  <span className="text-ink-soft">
                    <span className="font-semibold text-brand-navy">{value.mean}</span> · p25{' '}
                    {value.p25} · p75 {value.p75}
                  </span>
                </div>
                <div className="relative mt-1 h-1.5 rounded-full bg-muted">
                  <div
                    className="absolute h-1.5 rounded-full bg-brand-navy/30"
                    style={{
                      left: `${value.p25}%`,
                      width: `${Math.max(1, value.p75 - value.p25)}%`,
                    }}
                  />
                  <div
                    className="absolute top-[-2px] h-2.5 w-1 rounded bg-brand-navy"
                    style={{ left: `calc(${value.mean}% - 2px)` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-label="Próximas ações do grupo">
        <h3 className="m-0 text-sm font-semibold text-brand-navy">Ação #1 mais frequente</h3>
        <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
          {cluster.nextBestActions.slice(0, 6).map((item) => (
            <li className="flex justify-between gap-3 text-[13px]" key={item.actionId}>
              <span className="text-ink">{item.actionName}</span>
              <span className="text-ink-soft">
                <span className="font-semibold text-brand-navy">
                  {Math.round(item.share * 100)}%
                </span>{' '}
                · {item.customers.toLocaleString('pt-BR')} · score médio {item.avgScore}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Sinais dominantes">
        <h3 className="m-0 text-sm font-semibold text-brand-navy">Sinais dominantes</h3>
        <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
          {cluster.dominantSignals.slice(0, 6).map((item) => (
            <li className="flex justify-between gap-3 text-[13px]" key={item.type}>
              <span className="text-ink">{item.title}</span>
              <span className="font-semibold text-brand-navy">{Math.round(item.share * 100)}%</span>
            </li>
          ))}
          {cluster.dominantSignals.length === 0 ? (
            <li className="text-[13px] text-ink-soft">Sem sinais predominantes.</li>
          ) : null}
        </ul>
      </section>
      <p className="m-0 text-[11px] text-ink-faint">
        Agregação das recomendações individuais (ClusterIntelligenceService). Leitura
        comportamental, não é nota de crédito.
      </p>
    </div>
  );
}
