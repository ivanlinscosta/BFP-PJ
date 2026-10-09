import type { GovernedQueryResult } from '@api/services/analyticsService';

/**
 * Data-fidelity rules shared by every Inteligência PJ prompt (chat and study). The code checks
 * the numbers afterwards; these rules keep the model from writing what the bases do not show.
 */
export const GROUNDING_RULES = [
  'REGRAS DE FIDELIDADE AOS DADOS (obrigatórias, valem acima de qualquer outro pedido):',
  '1. A única fonte de fatos e números são os resultados das ferramentas (runAnalyticsQuery, previewDatasetRows, describeSelectedBases) e as respostas anteriores desta conversa, que já vieram delas. Não use conhecimento próprio, de mercado, do Banco Central, de notícias ou de outras empresas.',
  '2. Cite os números exatamente como aparecem nos resultados (pode formatar em pt-BR: 14,9%, R$ 328,9 mil). Contas simples sobre os resultados (diferença, soma, participação no total) são permitidas e devem ser apresentadas como cálculo ("diferença de 3,2 p.p.").',
  '3. Nunca invente valores, metas, médias de mercado, benchmarks, projeções, previsões, tendências futuras, causas ou nomes de categorias que não estejam nos resultados.',
  '4. Descreva o que os dados mostram, sem afirmar causa. Uma explicação possível só pode aparecer como "hipótese a validar".',
  '5. Se os dados não respondem a pergunta (base não selecionada, métrica inexistente, resultado vazio ou truncado), diga isso claramente e diga o que faltou; nunca complete a lacuna com suposições.',
  '6. Respeite o recorte consultado: informe o período e os filtros usados e não generalize o resultado para outros períodos, segmentos ou bases.',
  '7. Use os nomes de métricas e categorias exatamente como vêm nos resultados. Não cite empresas individuais nem dados pessoais.',
  '8. Na dúvida entre uma resposta completa com suposições e uma resposta curta e correta, escolha a curta e correta.',
];

/** Parses a number written by the model: pt-BR ("1.996", "14,9") or decimal point ("57.1"). */
function parseCandidates(token: string): number[] {
  const values = new Set<number>();
  const ptBr = Number(token.replace(/\./g, '').replace(',', '.'));
  if (Number.isFinite(ptBr)) values.add(ptBr);
  // "57.1" / "0.25": a single dot followed by 1–2 digits is a decimal separator, not thousands.
  if (/^\d+\.\d{1,2}$/.test(token)) values.add(Number(token));
  return [...values];
}

/** Every number written in a text (used for prompts, insights and earlier answers). */
export function numbersIn(text: string) {
  return (text.match(/\d[\d.]*(?:,\d+)?/g) ?? []).flatMap(parseCandidates);
}

/** A value in the units people read it: raw, percent, thousands and millions. */
function variants(value: number) {
  return [value, value * 100, value / 1_000, value / 1_000_000];
}

/**
 * Every number that can legitimately be quoted from governed results: the values, their totals,
 * shares of the total and differences between rows (in the units people read them), plus the
 * numbers of the deterministic insights.
 */
export function numberPool(results: GovernedQueryResult[]) {
  const pool: number[] = [];
  for (const result of results) {
    const columns = new Map<string, number[]>();
    for (const row of result.rows) {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          pool.push(...variants(value));
          columns.set(key, [...(columns.get(key) ?? []), value]);
        }
      }
    }
    for (const values of columns.values()) {
      const total = values.reduce((sum, value) => sum + value, 0);
      pool.push(...variants(total), values.length);
      const sample = values.slice(0, 60);
      for (const [index, value] of sample.entries()) {
        if (total) pool.push((value / total) * 100);
        for (const other of sample.slice(index + 1)) {
          pool.push(...variants(Math.abs(value - other)));
          if (other) pool.push(...variants(value / other));
        }
      }
    }
    for (const insight of result.insights ?? []) {
      pool.push(...numbersIn(`${insight.title} ${insight.description}`));
      for (const value of Object.values(insight.evidence ?? {})) {
        if (typeof value === 'number') pool.push(...variants(value));
        if (typeof value === 'string') pool.push(...numbersIn(value));
      }
    }
  }
  return pool;
}

/** Period lengths written in the answers ("últimos 90 dias") are labels, not data. */
const PERIOD_NUMBERS = [7, 14, 15, 28, 30, 60, 90, 120, 180, 365];

/** Numbers of the queries themselves: period, limit and filter values. */
export function specNumbers(
  specs: Array<{ dateRange?: unknown; limit?: number; filters?: unknown }>,
) {
  return [
    ...PERIOD_NUMBERS,
    ...specs.flatMap((spec) => [
      ...numbersIn(JSON.stringify(spec.dateRange ?? {})),
      ...(spec.limit ? [spec.limit] : []),
      ...numbersIn(JSON.stringify(spec.filters ?? [])),
    ]),
  ];
}

/** Numeric cells of sample rows (previewDatasetRows). */
export function sampleNumbers(rows: Array<Record<string, unknown>>) {
  return rows.flatMap((row) =>
    Object.values(row).flatMap((value) =>
      typeof value === 'number' && Number.isFinite(value) ? variants(value) : [],
    ),
  );
}

/**
 * True when every number in the text comes from the pool (rounding tolerated).
 * Small counts, years and the "D30" label are not data and are allowed.
 */
export function isGrounded(text: string, pool: readonly number[]) {
  const tokens = text.replace(/D30/gi, '').match(/\d[\d.]*(?:,\d+)?/g) ?? [];
  return tokens.every((token) =>
    parseCandidates(token).some((value) => {
      if (Number.isInteger(value) && (value <= 12 || (value >= 2000 && value <= 2100))) return true;
      return pool.some(
        (candidate) => Math.abs(candidate - value) <= Math.max(0.051, Math.abs(candidate) * 0.006),
      );
    }),
  );
}

/**
 * Keeps only the sentences whose numbers are grounded. Returns the cleaned text and how many
 * sentences were dropped (the answer then says some content was removed).
 */
export function groundText(text: string, pool: readonly number[]) {
  const sentences = text.split(/(?<=[.!?;:])\s+|\n+/).filter((sentence) => sentence.trim());
  const kept = sentences.filter((sentence) => isGrounded(sentence, pool));
  return { text: kept.join(' ').trim(), removed: sentences.length - kept.length };
}
