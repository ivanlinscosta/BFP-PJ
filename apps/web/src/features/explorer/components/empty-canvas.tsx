import { ChartColumnIncreasing, Database, Plus, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/card';

/** Empty playground canvas (reference screen 01). */
export function EmptyCanvas({
  hasDatasets = true,
  onPickDatasets,
}: {
  hasDatasets?: boolean;
  onPickDatasets?: () => void;
}) {
  return (
    <Card className="flex min-h-[558px] flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-card)] bg-tint">
        <ChartColumnIncreasing aria-hidden className="h-8 w-8 text-brand-navy" strokeWidth={1.5} />
      </span>
      <h2 className="mt-6 text-2xl font-semibold text-brand-navy">Comece sua análise</h2>
      <p className="mt-4 text-[15px] text-ink-soft">
        {hasDatasets
          ? 'Arraste uma métrica para o canvas ou pergunte aos seus dados.'
          : 'Escolha as bases de dados do data mesh e depois arraste uma métrica para o canvas.'}
      </p>
      {!hasDatasets && onPickDatasets ? (
        <button
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-brand-orange px-5 text-[15px] font-semibold text-white hover:bg-brand-orange-hover"
          onClick={onPickDatasets}
          type="button"
        >
          <Database aria-hidden className="h-4 w-4" />
          Selecionar bases de dados
        </button>
      ) : null}
      <Link
        className={
          hasDatasets
            ? 'mt-6 inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-brand-orange px-5 text-[15px] font-semibold text-white hover:bg-brand-orange-hover'
            : 'mt-4 inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-card px-5 text-[15px] font-semibold text-brand-navy hover:bg-muted'
        }
        to="/explorar/adicionar"
      >
        <Plus aria-hidden className="h-4 w-4" strokeWidth={2.5} />
        Adicionar uma métrica
      </Link>
      <Link
        className="mt-7 inline-flex items-center gap-2 text-[15px] font-semibold text-brand-navy hover:underline"
        to="/inteligencia"
      >
        <Sparkles aria-hidden className="h-[18px] w-[18px]" />
        Perguntar à Inteligência PJ
      </Link>
      <p className="mt-9 text-[13px] text-ink-soft">Sua próxima decisão começa com uma pergunta.</p>
    </Card>
  );
}
