import {
  computeFeatures,
  DNA_DIMENSIONS,
  type CustomerIntelligenceProfile,
  type CustomerRawData,
} from '@bfp/customer-intelligence';
import type { LakeDatasetDefinition, LakeTable, Row } from '../lake-model';

const col = (
  name: string,
  type: LakeDatasetDefinition['columns'][number]['type'],
  description: string,
) => ({
  name,
  type,
  description,
});
const COMPANY_KEY = col('company_id', 'string', 'Chave da empresa (join do data mesh)');

const base = {
  domain: 'customer360',
  owner: 'Inteligência de Clientes PJ',
  glueDatabase: 'intelligence',
  sourceSystem: 'Customer Intelligence (pipeline determinístico)',
  dataProductId: 'customer_intelligence_nba',
} as const;

/**
 * Auxiliary gold tables of the intelligence pipeline (features, DNA, signals, recommendations and
 * outcomes). They live in the same Glue database as the customer_intelligence mesh product and
 * carry only synthetic, non-PII attributes.
 */
export function buildIntelligenceLakeTables(
  raws: CustomerRawData[],
  profiles: CustomerIntelligenceProfile[],
  asOf: string,
): Array<LakeTable<LakeDatasetDefinition>> {
  const featureRows: Row[] = [];
  let featureColumns: string[] = [];
  for (const raw of raws) {
    const features = computeFeatures(raw, asOf) as unknown as Record<string, unknown>;
    if (featureColumns.length === 0) {
      featureColumns = Object.keys(features).filter(
        (key) => typeof features[key] === 'number' || typeof features[key] === 'boolean',
      );
    }
    const row: Row = { company_id: raw.identity.customerId, calculated_at: asOf };
    for (const key of featureColumns) {
      const value = features[key];
      row[key] = typeof value === 'boolean' ? value : Number(value);
    }
    featureRows.push(row);
  }
  const firstFeatures = raws[0]
    ? (computeFeatures(raws[0], asOf) as unknown as Record<string, unknown>)
    : {};

  return [
    {
      dataset: {
        ...base,
        id: 'customer_features',
        name: 'Features do cliente',
        description:
          'Features determinísticas (janelas de 14 a 90 dias) usadas pelo DNA e pela NBA.',
        table: 'customer_features',
        grain: '1 linha por empresa e cálculo',
        columns: [
          COMPANY_KEY,
          col('calculated_at', 'timestamp', 'Data do cálculo'),
          ...featureColumns.map((key) =>
            col(
              key,
              typeof firstFeatures[key] === 'boolean' ? 'boolean' : 'double',
              `Feature ${key}`,
            ),
          ),
        ],
      },
      rows: featureRows,
    },
    {
      dataset: {
        ...base,
        id: 'customer_dna',
        name: 'Customer DNA',
        description: 'Score 0-100, nível e tendência de cada dimensão do DNA (formato longo).',
        table: 'customer_dna',
        grain: '1 linha por empresa e dimensão',
        columns: [
          COMPANY_KEY,
          col('dimension', 'string', 'Dimensão do DNA'),
          col('score', 'double', 'Score 0-100'),
          col('level', 'string', 'LOW, MEDIUM, HIGH ou VERY_HIGH'),
          col('trend', 'string', 'UP, DOWN ou STABLE (vs. 30 dias atrás)'),
          col('dna_version', 'string', 'Versão do DNA'),
          col('calculated_at', 'timestamp', 'Data do cálculo'),
        ],
      },
      rows: profiles.flatMap((profile) =>
        DNA_DIMENSIONS.map((dimension) => ({
          company_id: profile.customerId,
          dimension,
          score: profile.dna[dimension].score,
          level: profile.dna[dimension].level,
          trend: profile.dna[dimension].trend,
          dna_version: profile.dnaVersion,
          calculated_at: profile.updatedAt,
        })),
      ),
    },
    {
      dataset: {
        ...base,
        id: 'customer_signals',
        name: 'Sinais do cliente',
        description: 'Sinais detectados por regras, com força após decaimento temporal.',
        table: 'customer_signals',
        grain: '1 linha por sinal',
        columns: [
          col('signal_id', 'string', 'Identificador do sinal'),
          COMPANY_KEY,
          col('signal_type', 'string', 'Tipo do sinal'),
          col('category', 'string', 'Categoria'),
          col('kind', 'string', 'OPPORTUNITY, OBSERVATION ou RISK'),
          col('strength', 'double', 'Força 0-1 após decaimento'),
          col('source', 'string', 'Fonte'),
          col('detected_at', 'timestamp', 'Detecção'),
          col('expires_at', 'timestamp', 'Expiração'),
        ],
      },
      rows: profiles.flatMap((profile) =>
        profile.signals.map((signal) => ({
          signal_id: signal.id,
          company_id: profile.customerId,
          signal_type: signal.type,
          category: signal.category,
          kind: signal.kind,
          strength: signal.strength,
          source: signal.source,
          detected_at: signal.detectedAt,
          expires_at: signal.expiresAt ?? null,
        })),
      ),
    },
    {
      dataset: {
        ...base,
        id: 'nba_recommendations',
        name: 'Recomendações de próxima melhor ação',
        description:
          'Ranking das ações elegíveis por empresa, com score, componentes e reason codes.',
        table: 'nba_recommendations',
        grain: '1 linha por empresa e ação ranqueada',
        columns: [
          col('recommendation_id', 'string', 'Identificador da recomendação'),
          COMPANY_KEY,
          col('action_id', 'string', 'Ação'),
          col('rank', 'bigint', 'Posição no ranking'),
          col('score', 'double', 'Score 0-100'),
          col('confidence', 'double', 'Confiança 0-100'),
          col('channel', 'string', 'Canal recomendado'),
          col('reason_codes', 'string', 'Reason codes separados por vírgula'),
          col('model_version', 'string', 'Versão do modelo'),
          col('calculated_at', 'timestamp', 'Data do cálculo'),
        ],
      },
      rows: profiles.flatMap((profile) =>
        profile.recommendations.map((recommendation) => ({
          recommendation_id: recommendation.id,
          company_id: profile.customerId,
          action_id: recommendation.actionId,
          rank: recommendation.rank,
          score: recommendation.score,
          confidence: recommendation.confidence,
          channel: recommendation.recommendedChannel,
          reason_codes: recommendation.reasonCodes.join(','),
          model_version: recommendation.modelVersion,
          calculated_at: recommendation.calculatedAt,
        })),
      ),
    },
    {
      dataset: {
        ...base,
        id: 'nba_outcomes',
        name: 'Resultados das recomendações',
        description: 'Feedback das recomendações (visualizada, ativada, dispensada, convertida…).',
        table: 'nba_outcomes',
        grain: '1 linha por evento de resultado',
        columns: [
          col('recommendation_id', 'string', 'Recomendação'),
          COMPANY_KEY,
          col('action_id', 'string', 'Ação'),
          col('status', 'string', 'Status do resultado'),
          col('channel', 'string', 'Canal'),
          col('occurred_at', 'timestamp', 'Data do evento'),
        ],
      },
      rows: raws.flatMap((raw) =>
        raw.outcomes.map((outcome) => ({
          recommendation_id: outcome.recommendationId,
          company_id: outcome.customerId,
          action_id: outcome.actionId,
          status: outcome.status,
          channel: outcome.channel ?? null,
          occurred_at: outcome.timestamp,
        })),
      ),
    },
  ];
}
