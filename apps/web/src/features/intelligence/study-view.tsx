import { ExternalLink, Lightbulb } from 'lucide-react';
import type { AnalysisSpec } from '@bfp/domain';
import { Card } from '@/components/ui/card';
import { ResultView } from '@/features/viz/result-view';
import { formatMetricValue } from '@/lib/format';
import type { IntelligenceStudy } from './api';

/**
 * Complete study rendered inside the conversation: headline KPIs, one chapter per business
 * question (chart or table + findings) and recommendations. Every number comes from the
 * governed queries returned by the API.
 */
export function StudyView({
  study,
  onOpen,
}: {
  study: IntelligenceStudy;
  onOpen(spec: AnalysisSpec): void;
}) {
  return (
    <section aria-label={study.title} className="mt-3 flex flex-col gap-3">
      <div>
        <h3 className="m-0 text-base font-semibold text-brand-navy">{study.title}</h3>
        <p className="mt-0.5 text-xs text-ink-soft">
          {study.period} · {study.queryCount} consultas governadas
        </p>
      </div>

      <ul
        aria-label="Indicadores do estudo"
        className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-4"
      >
        {study.kpis.map((kpi) => (
          <li
            className="rounded-[var(--radius-control)] border border-line bg-card px-3 py-2.5"
            key={kpi.metricId}
          >
            <p className="truncate text-[11px] text-ink-soft">{kpi.label}</p>
            <p className="mt-1 text-lg font-semibold text-brand-navy">
              {formatMetricValue(kpi.value, kpi.format, { compact: true })}
            </p>
          </li>
        ))}
      </ul>

      {study.sections.map((section, index) => (
        <Card className="px-4 pt-4 pb-3" key={section.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wide text-brand-orange uppercase">
                {index + 1}. {section.question}
              </p>
              <h4 className="m-0 mt-1 text-[15px] font-semibold text-brand-navy">
                {section.title}
              </h4>
            </div>
            <button
              className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-navy hover:underline"
              onClick={() => onOpen(section.spec)}
              type="button"
            >
              Abrir no playground
              <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 max-h-[340px] overflow-auto">
            <ResultView
              result={section.result}
              showLegend
              type={section.visualization === 'AUTO' ? 'BAR' : section.visualization}
            />
          </div>
          {section.findings.length > 0 ? (
            <ul className="m-0 mt-3 flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink">
              {section.findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          ) : null}
        </Card>
      ))}

      {study.recommendations.length > 0 ? (
        <Card className="border-peach bg-cream px-4 py-4">
          <h4 className="m-0 flex items-center gap-2 text-[15px] font-semibold text-brand-navy">
            <Lightbulb aria-hidden className="h-4 w-4 text-brand-orange" />
            Recomendações
          </h4>
          <ol className="m-0 mt-2 flex flex-col gap-1.5 pl-5 text-[13px] text-ink">
            {study.recommendations.map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ol>
        </Card>
      ) : null}

      {study.skipped.length > 0 ? (
        <p className="text-[11px] text-ink-soft">
          Fora do seu perfil de acesso: {study.skipped.join(', ')}.
        </p>
      ) : null}
    </section>
  );
}
