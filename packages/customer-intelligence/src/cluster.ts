import { levelOf } from './dna';
import {
  DNA_DIMENSIONS,
  type AggregateDNA,
  type ClusterDNA,
  type CustomerIntelligenceProfile,
  type DnaDimensionId,
  type DnaLevel,
} from './types';

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[index]!;
}

function aggregate(values: number[]): AggregateDNA {
  const sorted = [...values].sort((left, right) => left - right);
  const levels: Record<DnaLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, VERY_HIGH: 0 };
  for (const value of values) levels[levelOf(value)] += 1;
  return {
    mean: values.length
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : 0,
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    levels,
  };
}

/** Compact row aggregated by the cluster service (DNA scores, signal types and #1 action). */
export interface ClusterRow {
  dna: Record<DnaDimensionId, number>;
  signalTypes: string[];
  topActionId: string;
  topActionName: string;
  topScore: number;
}

/** Human labels of signal types (cluster summaries and filters). */
export const SIGNAL_LABELS: Record<string, string> = {
  HIGH_CREDIT_INTENT: 'Alta intenção em crédito',
  HIGH_VALUE_RELATIONSHIP: 'Alto valor com pouco uso digital',
  TRANSACTION_GROWTH: 'Crescimento transacional',
  TRANSACTION_DECLINE: 'Queda transacional',
  HIGH_DIGITAL_ENGAGEMENT: 'Engajamento digital alto',
  LOW_DIGITAL_ENGAGEMENT: 'Baixo engajamento digital',
  PRODUCT_GAP_WORKING_CAPITAL: 'Gap: Capital de Giro',
  PRODUCT_GAP_PIX_COLLECTION: 'Gap: Pix Cobrança',
  PRODUCT_GAP_CARD: 'Gap: Cartão PJ',
  ONBOARDING_INCOMPLETE: 'Onboarding incompleto',
  RECENT_COMPLAINT: 'Reclamação recente',
  UNRESOLVED_SERVICE: 'Atendimento sem resolução',
  RELATIONSHIP_COOLDOWN: 'Relacionamento esfriando',
  CUSTOMER_INACTIVITY: 'Cliente inativo',
  INCREASED_PAYMENT_VOLUME: 'Pagamentos em alta',
  HIGH_PIX_USAGE: 'Uso intenso de Pix',
  ABANDONED_CREDIT_SIMULATION: 'Simulação de crédito abandonada',
  RECENT_PRODUCT_INTEREST: 'Interesse recente por produto',
};

const DIMENSION_NAMES: Record<DnaDimensionId, string> = {
  relationshipStrength: 'relacionamento',
  digitalEngagement: 'engajamento digital',
  productDepth: 'profundidade de produtos',
  transactionActivity: 'atividade transacional',
  businessMomentum: 'momentum do negócio',
  commercialIntent: 'intenção comercial',
};

export function clusterRow(profile: CustomerIntelligenceProfile): ClusterRow {
  const top = profile.recommendations[0];
  return {
    dna: Object.fromEntries(DNA_DIMENSIONS.map((id) => [id, profile.dna[id].score])) as Record<
      DnaDimensionId,
      number
    >,
    signalTypes: profile.signals.map((signal) => signal.type),
    topActionId: top?.actionId ?? 'NO_ACTION',
    topActionName: top?.actionName ?? 'Não abordar agora',
    topScore: top?.score ?? 0,
  };
}

/**
 * Cluster intelligence: the NBA is computed per customer first and only then aggregated, so a
 * group never receives a single action by decree — it shows the distribution of individual NBAs.
 */
export function aggregateClusterRows(rows: ClusterRow[]): ClusterDNA {
  const population = rows.length;
  const dimensions = Object.fromEntries(
    DNA_DIMENSIONS.map((id) => [id, aggregate(rows.map((row) => row.dna[id]))]),
  ) as Record<DnaDimensionId, AggregateDNA>;

  const signalCounts = new Map<string, number>();
  for (const row of rows) {
    for (const type of new Set(row.signalTypes))
      signalCounts.set(type, (signalCounts.get(type) ?? 0) + 1);
  }
  const dominantSignals = [...signalCounts.entries()]
    .map(([type, customers]) => ({
      type,
      title: SIGNAL_LABELS[type] ?? type,
      customers,
      share: population ? customers / population : 0,
    }))
    .sort((left, right) => right.customers - left.customers)
    .slice(0, 6);

  const actions = new Map<string, { name: string; customers: number; scoreSum: number }>();
  for (const row of rows) {
    const current = actions.get(row.topActionId) ?? {
      name: row.topActionName,
      customers: 0,
      scoreSum: 0,
    };
    current.customers += 1;
    current.scoreSum += row.topScore;
    actions.set(row.topActionId, current);
  }
  const nextBestActions = [...actions.entries()]
    .map(([actionId, value]) => ({
      actionId,
      actionName: value.name,
      customers: value.customers,
      share: population ? value.customers / population : 0,
      avgScore: Math.round(value.scoreSum / value.customers),
    }))
    .sort((left, right) => right.customers - left.customers);

  const leader = nextBestActions[0];
  const strongest = [...DNA_DIMENSIONS].sort(
    (left, right) => dimensions[right].mean - dimensions[left].mean,
  )[0]!;
  const opportunitySummary = leader
    ? `${population.toLocaleString('pt-BR')} empresas. Ação #1 mais frequente: ${leader.actionName} (${Math.round(leader.share * 100)}% das empresas). Dimensão mais forte do grupo: ${DIMENSION_NAMES[strongest]} (média ${dimensions[strongest].mean}).`
    : 'Grupo sem recomendações calculadas.';

  return {
    populationSize: population,
    dimensions,
    dominantSignals,
    nextBestActions,
    opportunitySummary,
  };
}

export function aggregateCluster(profiles: CustomerIntelligenceProfile[]): ClusterDNA {
  return aggregateClusterRows(profiles.map(clusterRow));
}
