# Modelo de dados

## Dados sintéticos (LGPD)

Todo o dataset é gerado por `scripts/seed/generator.ts` (semente fixa = determinístico). Não há CPF,
CNPJ, telefone, e-mail ou conta bancária reais: CNPJs são mascarados (`10.000.123/0001-**`) e
exibidos com máscara adicional na UI; nomes vêm do faker em pt-BR.

Volumes padrão: ~3.000 empresas que avançam no funil + ~16.000 leads que não convertem
(calibração por canal), 12 meses de eventos, 40 campanhas, 9.000 sócios, 8.000 produtos
contratados, 60.000 touchpoints de mídia, 50.000 eventos de funil, 12.000 interações de CRM,
8.000 conversas, 80.000 eventos digitais (formato FullStory), 90.000 interações no app Itaú
Empresas, 45.000 transações e 5.000 respostas NPS.

Tipos adicionados para análises de uso e relacionamento (todos ligados por `company_id` e só para
empresas com conta aberta):

| Entidade        | Campos                                                                                 | Produto de dados (mesh) |
| --------------- | -------------------------------------------------------------------------------------- | ----------------------- |
| `appNavigation` | sessão, tela (Início, Extrato, Pix, Boletos…), ação, plataforma, versão, tempo em tela | `app_navigation`        |
| `transaction`   | tipo (Pix recebido/enviado, boleto emitido/pago, TED, cartão), canal, valor            | `transactions`          |
| `npsResponse`   | momento (onboarding, app, atendimento, gerente) e nota 0–10, sem texto livre           | `nps_responses`         |

Padrões: empresas maiores e ativadas usam mais o app e transacionam mais; o ticket segue o porte;
o NPS sobe com onboarding rápido e cai com conversas não resolvidas.

Padrões de negócio garantidos por `scripts/seed/coherence.ts` (testados):

- Conversão lead → conta entre 5% e 20% por canal — Google Search ~14,8%, Organic ~13,6%,
  Referral ~12,1%, Meta ~9,7%, LinkedIn ~8,4%.
- Google Search: boa conversão e CAC intermediário; Meta: alto volume e conversão menor;
  LinkedIn: CAC alto e empresas maiores; Organic: CAC muito baixo.
- Empresas médias contratam mais produtos; onboarding ≤ 3 dias aumenta a ativação D30; mais de
  uma conversa não resolvida reduz a ativação.
- ~1,2% dos touchpoints chegam sem empresa correspondente (sincronização tardia) para que a
  governança mostre qualidade realista.
- A empresa-vitrine **Atlas Tecnologia Ltda.** (SP, Média, Google Search) sustenta o roteiro do
  Cliente 360.

## Estado da aplicação (DynamoDB `objects`)

Chave `PK = USER#<userId>`, `SK = <type>#<id>`; `GSI1` por id; `GSI2 = SHARED#<type>` para
objetos compartilhados.

| type             | Conteúdo                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `analysis`       | `AnalysisSpec` + `metadata` (owner, time, `visibility` PRIVATE/TEAM/READ_ONLY, descrição) |
| `dashboard`      | nome, descrição, cards (referência a `analysisId` + layout/ordem), compartilhamento       |
| `favorite`       | favoritos por usuário (`dashboard:<id>`)                                                  |
| `audience`       | `filterGroups` (E/OU aninhado), tamanho estimado, status, último destino                  |
| `activationJob`  | destino CRM/MEDIA, status QUEUED → PROCESSING → COMPLETED, registros                      |
| `aiConversation` | turnos da Inteligência PJ e o `AnalysisSpec` resultante                                   |
| `preference`     | feature flags (usuário de sistema)                                                        |

Cards de dashboard referenciam análises salvas — a definição da consulta não é duplicada.
