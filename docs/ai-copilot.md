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

Em dev o modelo é `global.anthropic.claude-sonnet-4-6` (os perfis Claude 5.x não estão liberados
na conta) e depende do formulário de caso de uso da Anthropic no Bedrock. Se o Bedrock falhar
(acesso ao modelo, cota, região), a resposta vem do provedor determinístico local sobre as mesmas
ferramentas governadas (`provider: "local"` na resposta, log `ai_provider_fallback`). A causa fica em
`ai_request_failed` com `errorName`/`errorMessage`. `503 ai_unavailable` só ocorre se o provedor
local também falhar.

A IA também escolhe as bases do data mesh: toda spec que ela monta passa por `withRequiredDatasets`
e as bases adicionadas aparecem como operações `ADD_DATASET`.

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

## Experiência conversacional

- Coluna única de conversa com campo fixo (Enter envia, Shift+Enter quebra linha), tela inicial com
  sugestões por tema e as bases de dados que o usuário pode consultar.
- Cada resposta traz o **cartão de análise**: gráfico/tabela, até 3 achados do Insight Engine, fonte
  (bases do data mesh) e ações (Abrir no Explorar, Salvar, Dashboard, PDF). Os números vêm da mesma
  API governada do Explorar.
- A análise respondida vira o **contexto da conversa** (linha acima do campo, com "Limpar"); pedidos
  como "agora separa por porte" ajustam o contexto e mostram o novo recorte.
- Erros aparecem na conversa com "Tentar de novo".

## Estudo completo (tarefa em segundo plano)

`POST /api/ai/chat` com um pedido de estudo ("estudo", "raio-x", "análise completa") cria uma tarefa
`aiStudy` e responde na hora com `studyJob`; o chat acompanha `GET /api/ai/studies/:id`. Na AWS a
Lambda se auto-invoca (`InvocationType=Event`, timeout 120 s); localmente roda no mesmo processo.

- **Com Claude (Bedrock):** o modelo planeja de 5 a 10 capítulos, executa as consultas governadas em
  paralelo, lê os resultados e escreve resumo, leituras e recomendações. Capítulos sem consulta
  executada são descartados e frases com números ausentes dos resultados são removidas.
- **Sem Claude:** estudo determinístico guiado pelos temas da pergunta (aquisição, ativação, app,
  transações, NPS, atendimento, CRM, jornada digital), com o motivo exibido ao usuário.
