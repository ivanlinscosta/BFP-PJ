import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Building2,
  Check,
  MoreHorizontal,
  Plus,
} from 'lucide-react';
import { useState } from 'react';
import type {
  CustomerDNA,
  DnaDimensionId,
  NextBestActionRecommendation,
  RecommendationOutcome,
} from '@bfp/customer-intelligence';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Notice } from '@/components/ui/notice';
import { Popover } from '@/components/ui/popover';
import { LoadingRows } from '@/components/states/states';
import { maskCnpj } from '@/features/customers/api';
import { formatDate, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  useRecommendationExplanation,
  useRecordOutcome,
  type CustomerIntelligenceResponse,
} from './api';
import { DnaTree } from './dna-tree';
import {
  CHANGE_ORDER,
  CHANNEL_LABELS,
  DNA_LABELS,
  LEVEL_LABELS,
  changeValue,
  priorityOf,
  whyNowBullets,
  windowLabel,
} from './labels';

const SIZE_LABELS: Record<string, string> = {
  MEI: 'MEI',
  Micro: 'Microempresa',
  Pequena: 'Pequena empresa',
  Média: 'Média empresa',
  Grande: 'Grande empresa',
};

export function CustomerHeader({ data }: { data: CustomerIntelligenceResponse }) {
  const { customer } = data;
  const preAccount =
    customer.accountOpenedAt !== null && customer.relationshipStartDate < customer.accountOpenedAt;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-control)] bg-tint text-brand-navy">
          <Building2 aria-hidden className="h-6 w-6" />
        </span>
        <div>
          <p className="m-0 text-base font-semibold text-ink">{customer.legalName}</p>
          <p className="m-0 mt-0.5 text-xs text-ink-soft">
            CNPJ {maskCnpj(customer.cnpjMasked)} · Empresa fictícia
          </p>
          <p className="m-0 mt-0.5 text-xs text-ink-soft">
            {SIZE_LABELS[customer.companySize] ?? customer.companySize} · {customer.segment} ·{' '}
            {customer.city} · {customer.state}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right text-xs">
          <p className="m-0 font-semibold text-ink">
            {data.tenureMonths} meses de relacionamento comercial
          </p>
          <p className="m-0 mt-0.5 text-ink-soft">
            {customer.relationshipManager
              ? `Gerente ${customer.relationshipManager}`
              : 'Sem gerente atribuído'}
          </p>
          {preAccount ? (
            <p className="m-0 mt-0.5 text-ink-soft">Inclui pré-conta · hipótese demonstrativa</p>
          ) : null}
        </div>
        <Badge tone={customer.status === 'ACTIVE' ? 'success' : 'neutral'} uppercase>
          {customer.status === 'ACTIVE'
            ? 'Ativo'
            : customer.status === 'ONBOARDING'
              ? 'Onboarding'
              : 'Inativo'}
        </Badge>
      </div>
    </Card>
  );
}

const LEFT: DnaDimensionId[] = ['digitalEngagement', 'productDepth', 'relationshipStrength'];
const RIGHT: DnaDimensionId[] = ['commercialIntent', 'businessMomentum', 'transactionActivity'];

function DnaDimensionRow({
  dna,
  id,
  align,
  onOpen,
}: {
  dna: CustomerDNA;
  id: DnaDimensionId;
  align: 'left' | 'right';
  onOpen(id: DnaDimensionId): void;
}) {
  const dimension = dna[id];
  const label = DNA_LABELS[id];
  const levelLabel =
    id === 'businessMomentum' && dimension.trend === 'UP'
      ? 'Crescimento'
      : label.levels[dimension.level];
  return (
    <button
      aria-label={`${label.title}: ${dimension.score} de 100, ${levelLabel}. Ver drivers`}
      className={cn(
        'group block w-full max-w-[150px] rounded px-1 py-1 text-left transition-colors hover:bg-card/70',
        align === 'right' && 'ml-auto',
      )}
      onClick={() => onOpen(id)}
      type="button"
    >
      <span className="block text-[13px] leading-tight font-medium text-ink">{label.title}</span>
      <span className="mt-1 block text-lg leading-none font-semibold text-brand-navy group-hover:underline">
        {dimension.score}/100
      </span>
      <span className="mt-1 block text-[11px] font-semibold text-brand-navy">
        {levelLabel}
        {dimension.trend !== 'STABLE' ? (
          <span className="ml-1 font-normal text-ink-soft">
            {dimension.trend === 'UP' ? '↑' : '↓'}
          </span>
        ) : null}
      </span>
      <span className="mt-1 block text-[11px] text-ink-faint">{label.metaphor}</span>
    </button>
  );
}

/** Drivers (features and contributions) behind one DNA dimension. */
function DnaDriverDrawer({
  dna,
  dimension,
  onClose,
}: {
  dna: CustomerDNA;
  dimension: DnaDimensionId | null;
  onClose(): void;
}) {
  if (!dimension) return null;
  const value = dna[dimension];
  const label = DNA_LABELS[dimension];
  return (
    <Dialog
      description={`${label.metaphor} · ${value.score}/100 · ${LEVEL_LABELS[value.level]} · versão ${dna.version}`}
      onClose={onClose}
      open
      placement="right"
      title={label.title}
    >
      <p className="text-sm text-ink-soft">
        Score determinístico calculado a partir das features do cliente com pesos configuráveis
        (DnaScoringConfig). A tendência compara com o cálculo de 30 dias atrás.
      </p>
      <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0">
        {value.drivers.map((driver) => (
          <li
            className="rounded-[var(--radius-control)] border border-line px-3 py-2.5"
            key={driver.id}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-ink">{driver.name}</span>
              <span className="text-sm font-semibold text-brand-navy">
                +{driver.contribution?.toLocaleString('pt-BR')} pts
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-muted">
              <div
                className={cn(
                  'h-1.5 rounded-full',
                  driver.direction === 'NEGATIVE' ? 'bg-line-strong' : 'bg-brand-orange',
                )}
                style={{ width: `${Math.min(100, ((driver.contribution ?? 0) / 40) * 100)}%` }}
              />
            </div>
            <p className="m-0 mt-1.5 text-xs text-ink-soft">
              Valor:{' '}
              {String(
                typeof driver.value === 'boolean' ? (driver.value ? 'sim' : 'não') : driver.value,
              )}{' '}
              · Fonte: {driver.source}
              {driver.period ? ` · ${driver.period}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export function CustomerDnaPanel({ data }: { data: CustomerIntelligenceResponse }) {
  const [open, setOpen] = useState<DnaDimensionId | null>(null);
  const { dna } = data;
  return (
    <Card className="px-5 pt-5 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold text-brand-navy">DNA do cliente</h2>
          <p className="m-0 mt-0.5 text-xs text-ink-soft">Mapa vivo da empresa</p>
        </div>
        <span className="mt-4 text-xs font-semibold text-brand-navy">
          {data.customer.tradeName.replace(/ Ltda\.?$/, '')}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_minmax(0,150px)] items-stretch rounded-[var(--radius-card)] bg-tint px-3 py-3">
        <div className="flex flex-col justify-between gap-6 py-1">
          {LEFT.map((id) => (
            <DnaDimensionRow align="left" dna={dna} id={id} key={id} onOpen={setOpen} />
          ))}
        </div>
        <div className="min-h-[300px] px-1">
          <DnaTree highlightIntent={dna.commercialIntent.level !== 'LOW'} />
        </div>
        <div className="flex flex-col justify-between gap-6 py-1">
          {RIGHT.map((id) => (
            <DnaDimensionRow align="right" dna={dna} id={id} key={id} onOpen={setOpen} />
          ))}
        </div>
      </div>
      <p className="m-0 mt-3 text-[11px] text-ink-soft">{dna.overallSummary}</p>
      <p className="m-0 mt-1 text-[11px] text-ink-faint">
        Leitura comportamental, não é nota de crédito. O desenho é uma metáfora; os valores estão
        nas anotações.
      </p>
      <DnaDriverDrawer dimension={open} dna={dna} onClose={() => setOpen(null)} />
    </Card>
  );
}

const DISMISS_REASONS = [
  'Não é relevante',
  'Já conversei com o cliente',
  'Momento inadequado',
  'Outro',
];

/** Explanation drawer: score components, evidence, eligibility, alternatives, version. */
export function RecommendationExplanationDrawer({
  data,
  recommendation,
  onClose,
}: {
  data: CustomerIntelligenceResponse;
  recommendation: NextBestActionRecommendation | null;
  onClose(): void;
}) {
  const explanation = useRecommendationExplanation(recommendation?.id ?? null);
  if (!recommendation) return null;
  const components: Array<[keyof NextBestActionRecommendation['components'], string, number]> = [
    ['relevance', 'Relevância', 0.3],
    ['intent', 'Intenção', 0.25],
    ['expectedImpact', 'Impacto esperado', 0.2],
    ['timing', 'Momento', 0.15],
    ['confidence', 'Confiança', 0.1],
  ];
  const alternatives = data.recommendations.filter((item) => item.id !== recommendation.id);
  return (
    <Dialog
      description={`#${recommendation.rank} · score ${recommendation.score} · ${recommendation.modelVersion} · atualizado ${formatRelative(recommendation.calculatedAt)}`}
      onClose={onClose}
      open
      placement="right"
      title={recommendation.actionName}
    >
      <section aria-label="Explicação">
        {explanation.isLoading ? (
          <LoadingRows rows={3} />
        ) : explanation.data ? (
          <div className="rounded-[var(--radius-card)] bg-tint px-4 py-3">
            <p className="m-0 text-[11px] font-semibold text-brand-navy uppercase">
              {explanation.data.generatedBy === 'ai'
                ? `Explicação gerada por IA (${explanation.data.model ?? 'Claude'}) a partir das evidências`
                : 'Explicação estruturada (sem IA generativa)'}
            </p>
            <p className="m-0 mt-2 text-sm font-semibold text-ink">{explanation.data.summary}</p>
            <p className="m-0 mt-1.5 text-sm text-ink">{explanation.data.explanation}</p>
            {explanation.data.suggestedConversation.length > 0 ? (
              <>
                <p className="m-0 mt-3 text-xs font-semibold text-brand-navy">
                  Sugestão de conversa
                </p>
                <ul className="m-0 mt-1 list-disc pl-5 text-[13px] text-ink">
                  {explanation.data.suggestedConversation.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {explanation.data.notice ? (
              <p className="m-0 mt-2 text-[11px] text-ink-soft">{explanation.data.notice}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section aria-label="Componentes do score" className="mt-5">
        <h3 className="m-0 text-sm font-semibold text-brand-navy">Como o score foi calculado</h3>
        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
          {components.map(([key, label, weight]) => (
            <li className="text-[13px]" key={key}>
              <div className="flex justify-between">
                <span className="text-ink">
                  {label} <span className="text-ink-faint">· peso {Math.round(weight * 100)}%</span>
                </span>
                <span className="font-semibold text-brand-navy">
                  {Math.round(recommendation.components[key] * 100)}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-brand-navy"
                  style={{ width: `${Math.round(recommendation.components[key] * 100)}%` }}
                />
              </div>
            </li>
          ))}
          {recommendation.penalties.fatigue + recommendation.penalties.risk > 0 ? (
            <li className="text-[13px] text-ink-soft">
              Penalidades: fadiga {Math.round(recommendation.penalties.fatigue * 100)} ·
              risco/atendimento {Math.round(recommendation.penalties.risk * 100)} pontos
            </li>
          ) : null}
        </ul>
      </section>

      <section aria-label="Evidências" className="mt-5">
        <h3 className="m-0 text-sm font-semibold text-brand-navy">Evidências</h3>
        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
          {recommendation.evidence.map((item) => (
            <li
              className="rounded-[var(--radius-control)] border border-line px-3 py-2"
              key={item.signalType}
            >
              <p className="m-0 text-[13px] font-semibold text-ink">{item.title}</p>
              <p className="m-0 mt-0.5 text-xs text-ink-soft">
                Força {Math.round(item.strength * 100)}% · {item.source} · detectado em{' '}
                {formatDate(item.detectedAt)}
              </p>
            </li>
          ))}
          {recommendation.evidence.length === 0 ? (
            <li className="text-[13px] text-ink-soft">Sem sinais específicos para esta ação.</li>
          ) : null}
        </ul>
      </section>

      <section aria-label="Elegibilidade" className="mt-5">
        <h3 className="m-0 text-sm font-semibold text-brand-navy">Elegibilidade</h3>
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
          {recommendation.eligibility.checks.map((check) => (
            <li className="flex items-start gap-2 text-[13px] text-ink" key={check.rule}>
              <Check
                aria-hidden
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  check.passed ? 'text-success' : 'text-danger',
                )}
              />
              {check.reason}
            </li>
          ))}
          {recommendation.eligibility.checks.length === 0 ? (
            <li className="text-[13px] text-ink-soft">
              Sem regras de elegibilidade para esta ação.
            </li>
          ) : null}
        </ul>
      </section>

      <section aria-label="Alternativas consideradas" className="mt-5">
        <h3 className="m-0 text-sm font-semibold text-brand-navy">Alternativas consideradas</h3>
        <ol className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
          {alternatives.map((item) => (
            <li className="flex justify-between text-[13px]" key={item.id}>
              <span className="text-ink">
                #{item.rank} {item.actionName}
              </span>
              <span className="font-semibold text-brand-navy">{item.score}</span>
            </li>
          ))}
        </ol>
        <p className="m-0 mt-3 text-[11px] text-ink-faint">
          Modelo {recommendation.modelVersion} · DNA {data.dnaVersion} · última atualização{' '}
          {formatRelative(data.updatedAt)}. A IA apenas explica; elegibilidade, score e ranking vêm
          do NextBestActionEngine.
        </p>
      </section>
    </Dialog>
  );
}

/** "Iniciar ação" (MVP simulation) — persists ACTIVATED. */
function StartActionDialog({
  data,
  recommendation,
  onClose,
}: {
  data: CustomerIntelligenceResponse;
  recommendation: NextBestActionRecommendation;
  onClose(): void;
}) {
  const record = useRecordOutcome(data.customer.customerId);
  const [target, setTarget] = useState('Criar tarefa para gerente');
  return (
    <Dialog
      description="Simulação MVP: nenhuma mensagem é enviada ao cliente e nenhuma oferta é feita."
      footer={
        record.isSuccess ? (
          <Button onClick={onClose} variant="primary">
            Concluir
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button
              disabled={record.isPending}
              onClick={() =>
                record.mutate({
                  recommendationId: recommendation.id,
                  status: 'ACTIVATED',
                  channel: recommendation.recommendedChannel,
                  reason: target,
                })
              }
              variant="primary"
            >
              Confirmar ação
            </Button>
          </>
        )
      }
      onClose={onClose}
      open
      title="Iniciar ação"
    >
      <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-y-2 text-sm">
        <dt className="text-ink-soft">Ação</dt>
        <dd className="m-0 font-semibold text-ink">{recommendation.actionName}</dd>
        <dt className="text-ink-soft">Cliente</dt>
        <dd className="m-0 text-ink">{data.customer.tradeName}</dd>
        <dt className="text-ink-soft">Canal</dt>
        <dd className="m-0 text-ink">
          {CHANNEL_LABELS[recommendation.recommendedChannel] ?? recommendation.recommendedChannel}
        </dd>
        <dt className="text-ink-soft">Resumo</dt>
        <dd className="m-0 text-ink">
          {recommendation.objective} · score {recommendation.score} ·{' '}
          {windowLabel(recommendation.recommendedWindow)}
        </dd>
      </dl>
      <fieldset className="mt-4">
        <legend className="text-xs font-semibold text-brand-navy">Destino da ação</legend>
        <div className="mt-2 flex flex-col gap-1.5">
          {['Enviar ao CRM', 'Criar tarefa para gerente', 'Enviar comunicação'].map((option) => (
            <label className="flex items-center gap-2 text-sm text-ink" key={option}>
              <input
                checked={target === option}
                name="action-target"
                onChange={() => setTarget(option)}
                type="radio"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
      {record.isSuccess ? (
        <Notice className="mt-4" tone="success">
          Ação registrada como ativada ({target}). Simulação MVP.
        </Notice>
      ) : null}
      {record.isError ? (
        <Notice className="mt-4" tone="error">
          Não foi possível registrar a ação.
        </Notice>
      ) : null}
    </Dialog>
  );
}

function DismissDialog({
  data,
  recommendation,
  onClose,
}: {
  data: CustomerIntelligenceResponse;
  recommendation: NextBestActionRecommendation;
  onClose(): void;
}) {
  const record = useRecordOutcome(data.customer.customerId);
  const [reason, setReason] = useState(DISMISS_REASONS[0]!);
  return (
    <Dialog
      description="O motivo alimenta o feedback do modelo (cooldown e calibração)."
      footer={
        record.isSuccess ? (
          <Button onClick={onClose} variant="primary">
            Fechar
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancelar</Button>
            <Button
              disabled={record.isPending}
              onClick={() =>
                record.mutate({ recommendationId: recommendation.id, status: 'DISMISSED', reason })
              }
              variant="primary"
            >
              Dispensar recomendação
            </Button>
          </>
        )
      }
      onClose={onClose}
      open
      title={`Dispensar: ${recommendation.actionName}`}
    >
      <div className="flex flex-col gap-1.5">
        {DISMISS_REASONS.map((option) => (
          <label className="flex items-center gap-2 text-sm text-ink" key={option}>
            <input
              checked={reason === option}
              name="dismiss-reason"
              onChange={() => setReason(option)}
              type="radio"
            />
            {option}
          </label>
        ))}
      </div>
      {record.isSuccess ? (
        <Notice className="mt-4" tone="success">
          Recomendação dispensada: {reason}.
        </Notice>
      ) : null}
    </Dialog>
  );
}

function outcomeLabel(outcome: RecommendationOutcome | undefined) {
  if (!outcome) return null;
  if (outcome.status === 'ACTIVATED')
    return `Ação iniciada ${formatRelative(outcome.timestamp)} (${outcome.reason ?? 'simulação'})`;
  if (outcome.status === 'DISMISSED')
    return `Dispensada ${formatRelative(outcome.timestamp)}: ${outcome.reason ?? ''}`;
  return null;
}

export function NextBestActionCard({
  data,
  onShowEvidence,
  onCompare,
}: {
  data: CustomerIntelligenceResponse;
  onShowEvidence(): void;
  onCompare(): void;
}) {
  const top = data.recommendations[0];
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState<'start' | 'dismiss' | null>(null);
  const [menu, setMenu] = useState(false);
  if (!top) return null;
  const priority = priorityOf(top.score);
  const bullets = whyNowBullets(top, data.signals, data.tenureMonths);
  const latestOutcome = data.outcomes.find((outcome) => outcome.recommendationId === top.id);
  const facts: Array<[string, string]> = [
    ['Confiança', `${top.confidence}%`],
    ['Objetivo', top.objective],
    ['Canal recomendado', CHANNEL_LABELS[top.recommendedChannel] ?? top.recommendedChannel],
    ['Melhor momento', windowLabel(top.recommendedWindow)],
  ];

  return (
    <Card className="flex flex-col px-5 pt-5 pb-4">
      <h2 className="m-0 text-lg font-semibold text-brand-navy">Próxima melhor ação</h2>
      <div className="mt-3">
        <Badge tone={priority.tone} uppercase>
          {priority.label}
        </Badge>
      </div>
      <p className="m-0 mt-3 text-xl font-semibold text-brand-navy">
        {top.actionId === 'NO_ACTION' ? top.actionName : top.actionName}
      </p>
      <p className="m-0 mt-1 text-sm text-ink-soft">{priority.fit}</p>
      <dl className="m-0 mt-4 grid grid-cols-[140px_minmax(0,1fr)] gap-y-1.5 text-xs">
        {facts.map(([label, value]) => (
          <div className="contents" key={label}>
            <dt className="text-ink-soft">{label}</dt>
            <dd className="m-0 font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <hr className="my-4 border-line" />
      <p className="m-0 text-sm font-semibold text-ink">Por que agora?</p>
      <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
        {bullets.map((bullet) => (
          <li className="flex items-start gap-2 text-xs text-ink" key={bullet}>
            <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-navy" />
            {bullet}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => setDrawer(true)} size="sm">
          Entender recomendação
        </Button>
        <Button onClick={onShowEvidence} size="sm" variant="ghost">
          <Plus aria-hidden className="h-3.5 w-3.5" />
          Ver evidências
        </Button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          disabled={top.actionId === 'NO_ACTION'}
          onClick={() => setDialog('start')}
          size="sm"
          variant="primary"
        >
          Iniciar ação
        </Button>
        <Popover
          align="end"
          anchor={
            <Button
              aria-expanded={menu}
              onClick={() => setMenu((current) => !current)}
              size="sm"
              variant="ghost"
            >
              <Plus aria-hidden className="h-3.5 w-3.5" />
              Mais ações
              <MoreHorizontal aria-hidden className="h-4 w-4" />
            </Button>
          }
          className="w-56"
          onClose={() => setMenu(false)}
          open={menu}
        >
          <div className="flex flex-col" role="menu">
            <button
              className="px-3 py-2 text-left text-sm text-ink hover:bg-muted"
              onClick={() => {
                setMenu(false);
                onCompare();
              }}
              role="menuitem"
              type="button"
            >
              Comparar recomendações
            </button>
            <button
              className="px-3 py-2 text-left text-sm text-ink hover:bg-muted"
              onClick={() => {
                setMenu(false);
                setDialog('dismiss');
              }}
              role="menuitem"
              type="button"
            >
              Dispensar recomendação
            </button>
          </div>
        </Popover>
      </div>
      {outcomeLabel(latestOutcome) ? (
        <p className="m-0 mt-2 text-xs font-semibold text-success">{outcomeLabel(latestOutcome)}</p>
      ) : null}
      <p className="m-0 mt-3 text-[11px] text-ink-faint">
        Recomendação demonstrativa. Não significa aprovação de crédito; nenhuma oferta será enviada.
      </p>
      <RecommendationExplanationDrawer
        data={data}
        onClose={() => setDrawer(false)}
        recommendation={drawer ? top : null}
      />
      {dialog === 'start' ? (
        <StartActionDialog data={data} onClose={() => setDialog(null)} recommendation={top} />
      ) : null}
      {dialog === 'dismiss' ? (
        <DismissDialog data={data} onClose={() => setDialog(null)} recommendation={top} />
      ) : null}
    </Card>
  );
}

export function CustomerChangesStrip({ data }: { data: CustomerIntelligenceResponse }) {
  const tiles = [...data.changes]
    .slice(0, 4)
    .sort((left, right) => CHANGE_ORDER.indexOf(left.metric) - CHANGE_ORDER.indexOf(right.metric));
  const shift = data.readingShift;
  return (
    <Card className="px-5 pt-5 pb-5">
      <h2 className="m-0 text-lg font-semibold text-brand-navy">O que mudou neste cliente?</h2>
      <p className="m-0 mt-0.5 text-xs text-ink-soft">
        Últimos 30 dias · comparação com os 30 dias anteriores
      </p>
      {tiles.length > 0 ? (
        <ul className="m-0 mt-4 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
          {tiles.map((change) => (
            <li
              className="rounded-[var(--radius-control)] border border-line bg-muted/60 px-4 py-3"
              key={change.metric}
            >
              <p className="m-0 flex items-center gap-1 text-2xl font-semibold text-brand-navy">
                {change.display === 'PERCENT' ? (
                  change.direction === 'DOWN' ? (
                    <ArrowDown aria-label="queda" className="h-5 w-5" />
                  ) : (
                    <ArrowUp aria-label="alta" className="h-5 w-5" />
                  )
                ) : null}
                {changeValue(change)}
              </p>
              <p className="m-0 mt-1 text-xs text-ink-soft">{change.label}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">
          Sem mudanças relevantes nas janelas comparadas.
        </p>
      )}
      <hr className="my-4 border-line" />
      <h3 className="m-0 text-sm font-semibold text-brand-navy">
        Como isso muda a leitura do cliente
      </h3>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <p className="m-0 text-xs font-semibold text-brand-navy">Intenção comercial</p>
          <p className="m-0 mt-2 flex items-center gap-2 text-sm">
            <span className="rounded bg-tint px-2 py-1 font-semibold text-brand-navy">
              {LEVEL_LABELS[shift.intentLevel.previous]}
            </span>
            <ArrowRight aria-hidden className="h-4 w-4 text-ink-soft" />
            <span className="rounded bg-tint px-2 py-1 font-semibold text-brand-navy">
              {LEVEL_LABELS[shift.intentLevel.current]}
            </span>
          </p>
          <p className="m-0 mt-2 text-[11px] text-ink-soft">
            Leitura atual do comportamento comercial.
          </p>
        </div>
        <div>
          <p className="m-0 text-xs font-semibold text-brand-navy">
            Prioridade de {shift.topAction.actionName.replace(/^(Oferecer|Apresentar) /, '')}
          </p>
          <p className="m-0 mt-2 flex items-center gap-2 text-sm">
            <span className="rounded bg-tint px-2 py-1 font-semibold text-brand-navy">
              {shift.topAction.previousRank ? `#${shift.topAction.previousRank}` : '—'}
            </span>
            <ArrowRight aria-hidden className="h-4 w-4 text-ink-soft" />
            <span className="rounded bg-tint px-2 py-1 font-semibold text-brand-navy">
              #{shift.topAction.currentRank}
            </span>
          </p>
          <p className="m-0 mt-2 text-[11px] text-ink-soft">
            {shift.topAction.previousRank === shift.topAction.currentRank
              ? 'Mantém a primeira posição nas próximas ações.'
              : 'Agora ocupa a primeira posição nas próximas ações.'}
          </p>
        </div>
      </div>
    </Card>
  );
}
