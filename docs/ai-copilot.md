# Inteligência PJ

A Inteligência PJ é **outra interface para o mesmo `AnalysisSpec`** do playground.

`POST /api/ai/chat` `{ prompt, analysisSpec?, conversationId? }` →
`{ action, operations, message, answer, basis, evidence, suggestions, analysisSpec }`

- `UPDATE_ANALYSIS` devolve operações estruturadas (`ADD_METRIC`, `REMOVE_METRIC`,
  `ADD_DIMENSION`, `REMOVE_DIMENSION`, `ADD_FILTER`, `REMOVE_FILTER`, `SET_DATE_RANGE`,
  `SET_VISUALIZATION`, `SORT`, `SET_COMPARISON`, `CLEAR`) que a UI aplica com
  `applyAnalysisOperations` — ex.: "Agora separa por porte." →
  `[{ "type": "ADD_DIMENSION", "dimensionId": "company_size" }]` e a mensagem
  "Porte da empresa adicionado à análise.".
- `ANSWER_QUESTION` responde com números vindos de `runAnalyticsQuery` e mostra a "Base da
  resposta" (métricas, filtros, período).

## Provedores

| `AI_PROVIDER` | Comportamento                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `local`       | Determinístico: léxico governado → operações/spec → `runAnalyticsQuery` → narrativa a partir do Insight Engine |
| `bedrock`     | Amazon Bedrock Converse com tool calling; `BEDROCK_MODEL_ID` vem de env/SSM (nunca hardcoded)                  |

Ferramentas governadas: `getAvailableMetrics`, `getAvailableDimensions`, `getMetricDefinition`,
`runAnalyticsQuery`, `getCustomer360`, `searchBusinessGlossary`, `createAudiencePreview`,
`getQualityStatus`, `getLineage`. A IA não acessa Athena, tabelas ou SQL.

## Guardrails

- Recusa de prompt injection e pedidos de PII antes de qualquer chamada.
- Operações do modelo são validadas uma a uma pela camada semântica; ids inventados são descartados.
- Resposta com números sem `runAnalyticsQuery` no turno é descartada e substituída pela narrativa
  determinística.
- RBAC por domínio aplicado em toda ferramenta; resultados limitados a 50 linhas agregadas.
- CAC só é comparado entre canais pagos (`acquisition_source = PAID`).
- Conversas persistidas (`aiConversation`) e logs `AI_REQUEST` / `AI_TOOL_CALL` sem o texto do prompt (hash).
