# Sinais

O `CustomerSignalEngine` (`packages/customer-intelligence/src/signals.ts`) aplica regras
determinísticas sobre features, DNA e dados brutos. Cada sinal tem tipo, categoria
(oportunidade, crescimento, engajamento, produto, relacionamento, risco, jornada, transações,
digital), natureza (`OPPORTUNITY`, `OBSERVATION`, `RISK`), força 0–1, evidências
(feature, valor, fonte, período), `detectedAt`, `expiresAt` e a dimensão do DNA que alimenta.

## Decaimento

`força = força_base × 0,5^(dias desde a detecção / 21)` (meia-vida de 21 dias). Sinais além do
`expiresAt` (`detectedAt` + TTL da regra) deixam de existir.

## Regras

| Sinal                         | Categoria    | Tipo        | TTL (dias) | Dimensão do DNA      |
| ----------------------------- | ------------ | ----------- | ---------- | -------------------- |
| `HIGH_CREDIT_INTENT`          | INTENT       | OPPORTUNITY | 30         | commercialIntent     |
| `HIGH_VALUE_RELATIONSHIP`     | RELATIONSHIP | OPPORTUNITY | 30         | transactionActivity  |
| `TRANSACTION_GROWTH`          | GROWTH       | OBSERVATION | 45         | businessMomentum     |
| `TRANSACTION_DECLINE`         | TRANSACTION  | RISK        | 45         | transactionActivity  |
| `HIGH_DIGITAL_ENGAGEMENT`     | DIGITAL      | OBSERVATION | 30         | digitalEngagement    |
| `LOW_DIGITAL_ENGAGEMENT`      | DIGITAL      | RISK        | 30         | digitalEngagement    |
| `PRODUCT_GAP_WORKING_CAPITAL` | PRODUCT_GAP  | OPPORTUNITY | 60         | productDepth         |
| `PRODUCT_GAP_PIX_COLLECTION`  | PRODUCT_GAP  | OPPORTUNITY | 60         | productDepth         |
| `PRODUCT_GAP_CARD`            | PRODUCT_GAP  | OPPORTUNITY | 60         | productDepth         |
| `ONBOARDING_INCOMPLETE`       | JOURNEY      | RISK        | 90         | —                    |
| `RECENT_COMPLAINT`            | RISK         | RISK        | 45         | relationshipStrength |
| `UNRESOLVED_SERVICE`          | RELATIONSHIP | RISK        | 30         | relationshipStrength |
| `RELATIONSHIP_COOLDOWN`       | RELATIONSHIP | OBSERVATION | 30         | relationshipStrength |
| `CUSTOMER_INACTIVITY`         | RISK         | RISK        | 30         | transactionActivity  |
| `INCREASED_PAYMENT_VOLUME`    | TRANSACTION  | OBSERVATION | 45         | transactionActivity  |
| `HIGH_PIX_USAGE`              | TRANSACTION  | OBSERVATION | 30         | transactionActivity  |
| `ABANDONED_CREDIT_SIMULATION` | JOURNEY      | OPPORTUNITY | 30         | commercialIntent     |
| `RECENT_PRODUCT_INTEREST`     | INTENT       | OPPORTUNITY | 30         | commercialIntent     |

`HIGH_CREDIT_INTENT` exige pelo menos 5 pontos de intenção:
`visitas a crédito (14d) + buscas por crédito (14d) + 2 × simulações (30d)`.

## Impacto na NBA

Depois do ranking, cada sinal recebe `nbaImpact`: "Sustenta a ação #N (…)" quando é evidência de
uma recomendação, "Reduz a prioridade de ofertas comerciais" quando é risco, ou "Contexto para a
conversa". A aba **Sinais** filtra por Todos, Oportunidade, Digital, Transações, Produtos e
Relacionamento.
