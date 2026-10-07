# Camada semântica

`packages/semantic-layer` define o vocabulário governado. Nada fora dele chega ao motor.

- `MetricDefinition`: id, nome, definição de negócio, fórmula, formato, domínio, owner, fonte,
  `timeField`, `allowedDimensions`, `allowedFilters`, `certificationStatus`
  (CERTIFIED · EXPERIMENTAL · DEPRECATED), SLO de freshness, limiar de qualidade, versão.
- `DimensionDefinition`: rótulo de negócio, tipo, operadores permitidos, sensibilidade,
  `valueLabels` (ex.: `GOOGLE_SEARCH → Google Search`).
- `DataProductDefinition`: owner, SLO, Gold dataset/tabela, fontes de negócio, métricas.
- `BusinessTerm`: glossário com sinônimos.

Métricas iniciais do prompt: `account_conversion_rate` (Conversão de abertura, coorte do lead,
v2.1), `cac`, `new_companies` (Novos clientes PJ), `activation_d30_rate`, `accounts_opened`,
`media_spend`, `products_per_company` — além de leads, CTR, CPL, onboarding etc.

**Validator** (`validateAnalysisSpec`): métricas/dimensões/filtros existentes, compatibilidade
métrica × dimensão, operadores por tipo, granularidade de datas, ordenação. Erros são semânticos
e acionáveis; a UI os mostra como "Essa combinação não é compatível".

**Linhagem**: `fontes de negócio → Gold → métrica oficial → análises/audiências` (página da
métrica) e o grafo entidade → campo → métrica (`buildLineage`).

**Qualidade**: completude, validade (ordem de datas, CNPJ mascarado, integridade referencial) e
unicidade medidas sobre os registros (`apps/api/src/http/dataQuality.ts`) + freshness vs. SLO.
