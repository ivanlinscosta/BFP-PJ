# Motor analítico

```
AnalysisSpec → SemanticValidator → QueryPlanner/Compiler → Engine → ResultNormalizer → Insights → AnalyticsResult
```

O browser **nunca envia SQL** — apenas `AnalysisSpec`:

```json
{
  "datasets": ["customer_360"],
  "metrics": [{ "id": "account_conversion_rate" }],
  "dimensions": [{ "id": "acquisition_channel" }],
  "filters": [{ "field": "state", "operator": "EQ", "value": "SP" }],
  "dateRange": { "type": "LAST_N_DAYS", "value": 90 },
  "visualization": { "type": "BAR" }
}
```

`POST /api/analytics/query` → `executeGovernedQuery` (validação semântica → RBAC por domínio →
engine → rótulos de negócio → insights). Engines intercambiáveis por `ANALYTICS_ENGINE`:

| Engine     | Uso                                                     |
| ---------- | ------------------------------------------------------- |
| `memory`   | desenvolvimento e testes (dataset sintético em memória) |
| `dynamodb` | dataset operacional no DynamoDB                         |
| `athena`   | produção: produtos de dados do mesh via Glue/Athena     |

### Seleção de bases (`datasets`)

O motor só é acionado sobre as bases do data mesh que o usuário selecionou. O validador exige que
elas cubram todas as métricas, dimensões e filtros (`MISSING_DATASETS`, `DATASET_NOT_SELECTED`,
`UNKNOWN_DATASET` → 422). A regra de quais bases cada métrica lê está em
`packages/semantic-layer/src/mesh.ts` (`requiredDatasets`); um teste do compilador garante que o
SQL nunca lê uma base que o validador não exigiu (ex.: `products_per_company` lê Produtos e o
status da empresa no Customer 360). No frontend, `useAnalysisResult` aplica a mesma checagem em
todas as telas (Explorar, Inteligência PJ, dashboards) e não chama a API enquanto faltar base.

## AthenaQueryCompiler (`packages/analytics-engine/src/athena/compiler.ts`)

- Identificadores vêm **só de whitelists** (tabelas do mesh, colunas por dimensão, SQL por métrica);
  `resolveTable` qualifica `<prefixo>_<domínio>.<tabela>` e valida o nome.
- Cada fato é lido como `f`; atributos de empresa entram por
  `INNER JOIN <prefixo>_customer360.customer_360 c ON c.company_id = f.company_id`.
- O plano (bases + joins) volta em `result.metadata.plan` e aparece no canvas.
- Erros de compilação viram `422 analysis_not_supported` (nunca 500).
- Valores de filtro viram `ExecutionParameters` posicionais (`?`); aliases de saída são `c0..cn`.
- Cada métrica base vira uma CTE por fato (tabela + coluna de tempo + predicado); razões combinam
  fatos com `FULL OUTER JOIN … IS NOT DISTINCT FROM` (ex.: CAC = mídia / contas abertas).
- Datas em `America/Sao_Paulo`, granularidade dia/semana/mês.

`AthenaAnalyticsQueryEngine` faz `StartQueryExecution` → polling com backoff → `GetQueryResults`
paginado → normalização; timeout vira `504 athena_timeout` (com `StopQueryExecution`), falha vira
`502`. Cache de 60 s por hash de `AnalysisSpec + escopo de acesso`.

## Insight Engine (determinístico)

`generateInsights` produz evidências estruturadas (DIFFERENCE, RANKING, CONTRIBUTION, OUTLIER,
PERIOD_OVER_PERIOD, MATRIX_PEAK, MATRIX_CONSISTENCY, MATRIX_LOW). Métricas em que menor é melhor
(CAC, CPL, tempos) invertem o ranking. O LLM apenas narra essas evidências.

## Teste arquitetural final

"Compare CAC e ativação D30 por canal, porte e estado nos últimos 120 dias" é apenas um novo
`AnalysisSpec` — coberto por testes (Inteligência PJ, compilador Athena e engine local) sem
página, endpoint, componente ou query específicos.
