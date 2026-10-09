# Próxima Melhor Ação (NBA)

`CANDIDATE ACTIONS → ELIGIBILITY → RANKING → NBA → ACTIVATION → OUTCOME → FEEDBACK`

A NBA **não é só cross-sell**: o catálogo inclui ativação (onboarding), retenção, recuperação de
atendimento, educação e a decisão explícita de não abordar.

## Catálogo de ações

| Ação                           | Nome                              | Objetivo         | Comercial | Cooldown (dias) | Sinais relevantes                                                                                | Regras                                                                                                                                                         |
| ------------------------------ | --------------------------------- | ---------------- | --------- | --------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OFFER_WORKING_CAPITAL`        | Oferecer Capital de Giro          | EXPANSION        | sim       | 30              | HIGH_CREDIT_INTENT, PRODUCT_GAP_WORKING_CAPITAL, TRANSACTION_GROWTH, ABANDONED_CREDIT_SIMULATION | productAlreadyOwned, customerStatus, consent, contactability, cooldown, recentComplaint, journeyState, actionEnabled, outstandingInteraction, commercialPolicy |
| `PROMOTE_PIX_COLLECTION`       | Apresentar Pix Cobrança           | EXPANSION        | sim       | 21              | PRODUCT_GAP_PIX_COLLECTION, HIGH_PIX_USAGE, RECENT_PRODUCT_INTEREST                              | productAlreadyOwned, customerStatus, consent, contactability, cooldown, recentComplaint, journeyState, actionEnabled, outstandingInteraction                   |
| `PROMOTE_BUSINESS_CARD`        | Oferecer Cartão PJ                | EXPANSION        | sim       | 30              | PRODUCT_GAP_CARD, INCREASED_PAYMENT_VOLUME, RECENT_PRODUCT_INTEREST                              | productAlreadyOwned, customerStatus, consent, contactability, cooldown, recentComplaint, journeyState, actionEnabled, outstandingInteraction                   |
| `PROMOTE_POS_MACHINE`          | Oferecer Maquininha               | EXPANSION        | sim       | 30              | RECENT_PRODUCT_INTEREST, TRANSACTION_GROWTH, HIGH_PIX_USAGE                                      | productAlreadyOwned, customerStatus, consent, contactability, cooldown, recentComplaint, journeyState, actionEnabled, outstandingInteraction                   |
| `PROMOTE_BOLETO`               | Apresentar cobrança por boletos   | EXPANSION        | sim       | 30              | INCREASED_PAYMENT_VOLUME, TRANSACTION_GROWTH, RECENT_PRODUCT_INTEREST                            | productAlreadyOwned, customerStatus, consent, contactability, cooldown, recentComplaint, journeyState, actionEnabled, outstandingInteraction                   |
| `PROMOTE_INSURANCE`            | Oferecer seguro empresarial       | EXPANSION        | sim       | 60              | RECENT_PRODUCT_INTEREST, TRANSACTION_GROWTH                                                      | productAlreadyOwned, customerStatus, consent, contactability, cooldown, recentComplaint, journeyState, actionEnabled, outstandingInteraction                   |
| `PROMOTE_INVESTMENTS`          | Apresentar investimentos PJ       | EXPANSION        | sim       | 60              | RECENT_PRODUCT_INTEREST, TRANSACTION_GROWTH, INCREASED_PAYMENT_VOLUME                            | productAlreadyOwned, customerStatus, consent, contactability, cooldown, recentComplaint, journeyState, actionEnabled, outstandingInteraction                   |
| `COMPLETE_ONBOARDING`          | Concluir onboarding               | ACTIVATION       | não       | 7               | ONBOARDING_INCOMPLETE                                                                            | customerStatus, journeyState, cooldown, actionEnabled                                                                                                          |
| `REENGAGE_DIGITAL`             | Reengajar nos canais digitais     | RETENTION        | não       | 21              | LOW_DIGITAL_ENGAGEMENT, CUSTOMER_INACTIVITY, TRANSACTION_DECLINE                                 | customerStatus, journeyState, cooldown, actionEnabled                                                                                                          |
| `CONTACT_RELATIONSHIP_MANAGER` | Contato consultivo do gerente     | RETENTION        | não       | 30              | HIGH_VALUE_RELATIONSHIP, RELATIONSHIP_COOLDOWN, TRANSACTION_DECLINE, CUSTOMER_INACTIVITY         | customerStatus, contactability, cooldown, actionEnabled                                                                                                        |
| `RESOLVE_SERVICE_ISSUE`        | Resolver atendimento pendente     | SERVICE_RECOVERY | não       | —               | RECENT_COMPLAINT, UNRESOLVED_SERVICE                                                             | actionEnabled                                                                                                                                                  |
| `EDUCATE_PRODUCT_FEATURE`      | Educar sobre produtos contratados | EDUCATION        | não       | 30              | —                                                                                                | customerStatus, journeyState, cooldown, actionEnabled                                                                                                          |
| `NO_ACTION`                    | Não abordar agora                 | RESTRAINT        | não       | —               | —                                                                                                |                                                                                                                                                                |

## Elegibilidade (`EligibilityEngine`)

Toda ação passa pelas regras antes do score; uma regra reprovada tira a ação do ranking (ela
continua "considerada", com o motivo):

- `productAlreadyOwned`: nunca sugere um produto já contratado;
- `customerStatus` e `journeyState`: empresa não inativa e jornada compatível (onboarding concluído para ofertas; incompleto para `COMPLETE_ONBOARDING`);
- `consent` e `contactability`: consentimento de contato comercial e canal disponível;
- `cooldown`: respeita o intervalo após `ACTIVATED`, `ACCEPTED`, `DISMISSED`, `NO_RESPONSE` ou `CONVERTED`;
- `recentComplaint` e `outstandingInteraction`: sem ofertas com reclamação recente ou pendência aberta;
- `commercialPolicy`: Capital de Giro não é oferecido para MEI nem para contas com menos de 45 dias;
- `actionEnabled`: ação ativa no catálogo (e gate de dados insuficientes).

## Ranking

O score (0–100) e as penalidades estão em [nba-scoring.md](nba-scoring.md). A resposta traz o
top 5 elegível e sempre `NO_ACTION` como alternativa explícita, com:
`actionId`, `actionName`, `rank`, `score`, `confidence`, objetivo, canal e janela recomendados,
componentes, penalidades, evidências (sinais), `reasonCodes`, checagens de elegibilidade,
`calculatedAt` e `modelVersion`.

**Reason codes**: os tipos dos sinais que sustentam a ação, mais `PRODUCT_GAP`,
`RELATIONSHIP_ACTIVE`, `SERVICE_RISK_PENALTY`, `CONTACT_FATIGUE_PENALTY` e `INSUFFICIENT_DATA`.

**Quality gate**: qualidade dos dados < 0,4 → somente `NO_ACTION` (`INSUFFICIENT_DATA`).

## Ativação e feedback

- **Iniciar ação** (MVP simulado): o gerente escolhe enviar ao CRM, criar tarefa ou enviar
  comunicação; nenhuma mensagem sai e nenhuma oferta é feita. Grava `ACTIVATED`.
- **Mais ações → Dispensar**: motivos "Não é relevante", "Já conversei com o cliente",
  "Momento inadequado" e "Outro". Grava `DISMISSED`.
- Status de `RecommendationOutcome`: `RECOMMENDED`, `VIEWED`, `ACCEPTED`, `DISMISSED`,
  `ACTIVATED`, `CONVERTED`, `FAILED` e `NO_RESPONSE`. Os outcomes alimentam o cooldown no próximo cálculo e a
  tabela `nba_outcomes` do lake.

## Explicação

"Entender recomendação" abre o drawer com a explicação (Claude via Bedrock quando disponível,
senão estruturada), como o score foi calculado, evidências, elegibilidade, alternativas
consideradas, versão do modelo e data do cálculo. A IA não altera ação, score, ranking ou
elegibilidade.

## Clusters e semelhantes

`ClusterIntelligenceService` agrega as NBAs individuais de um grupo (público do Audience Builder
ou empresas semelhantes): DNA médio e quartis, distribuição da ação #1, sinais dominantes e um
resumo de oportunidade.
