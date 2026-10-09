import { Database, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Explains the two catalog concepts side by side: a data product is the governed business
 * delivery (owner, SLO, quality, certified metrics); a base is the physical table that feeds it.
 */
export function BaseVsProduct({
  highlight,
  className,
}: {
  highlight?: 'base' | 'product';
  className?: string;
}) {
  const items = [
    {
      key: 'product' as const,
      icon: Package,
      title: 'Produto de dados',
      text: 'Entrega de negócio governada: tem dono, promessa de atualização (SLO), qualidade mínima, métricas certificadas e regras de uso. É o “contrato” que diz o que o dado significa e quem responde por ele.',
      example:
        'Ex.: Customer 360 — dono Clientes PJ, atualização a cada 1 h, métricas como contas abertas e ativação D30.',
    },
    {
      key: 'base' as const,
      icon: Database,
      title: 'Base de dados',
      text: 'Tabela física no data lake (camada gold, consultada pelo Athena), com colunas e linhas. É onde o dado do produto fica guardado; um produto pode ter uma ou mais bases.',
      example: 'Ex.: bfp_pj_dev_customer360.customer_360 — 1 linha por empresa.',
    },
  ];
  return (
    <div className={cn('grid gap-3 md:grid-cols-2', className)}>
      {items.map(({ key, icon: Icon, title, text, example }) => (
        <div
          className={cn(
            'rounded-[var(--radius-card)] border px-4 py-3',
            highlight === key ? 'border-brand-navy bg-tint' : 'border-line bg-card',
          )}
          key={key}
        >
          <p className="m-0 flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <Icon aria-hidden className="h-4 w-4" />
            {title}
          </p>
          <p className="m-0 mt-1 text-[13px] text-ink">{text}</p>
          <p className="m-0 mt-1 text-xs text-ink-soft">{example}</p>
        </div>
      ))}
    </div>
  );
}
