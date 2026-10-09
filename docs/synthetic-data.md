# Dados sintéticos da Customer Intelligence

Todos os dados são **fictícios e determinísticos** (semente fixa). Nenhum CNPJ, nome ou texto
livre real; nenhum atributo pessoal sensível ou protegido.

## Base

- `npm run seed` gera `data/dataset.json`: a calibração de aquisição (leads de 2026) e **3.000
  clientes estabelecidos** (contas abertas entre abril e setembro de 2025, `company-NNNNN`), para
  um total de **5.004 empresas com conta**.
- `npm run intelligence:rebuild` gera o comportamento de **18 meses (78 semanas)** de cada
  cliente (`scripts/seed/intelligence/generator.ts`), roda o pipeline e grava:
  - `data/customer-intelligence.json`: read model local (perfis completos);
  - `data/intelligence-report.json`: relatório da base;
  - `customerIntelligence` dentro de `data/dataset.json`: snapshot governado por empresa.
- As-of fixo: `2026-10-09T12:00:00Z` (`INTELLIGENCE_AS_OF`), para que a demonstração seja
  reprodutível. Dados posteriores ao as-of são ignorados pelas features.

## Personas latentes

O gerador sorteia uma persona por empresa (por chave, `intelligence:<companyId>`). Ela molda o
comportamento de forma coerente e **nunca é exibida nem usada pelos motores** — DNA, sinais e NBA
são calculados só a partir dos dados gerados.

| Persona                  | Comportamento gerado                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| `CREDIT_INTENT`          | conteúdos, buscas e simulações de crédito; volume em crescimento            |
| `DIGITAL_GROWER`         | uso intenso de app/IB, novos produtos, interesse em Pix Cobrança/Maquininha |
| `TRADITIONAL_HIGH_VALUE` | alto volume transacional e pouco uso digital; relacionamento via gerente    |
| `EARLY_JOURNEY`          | conta recente; parte sem onboarding concluído                               |
| `SERVICE_RISK`           | reclamações e interações sem resolução                                      |
| `LOW_ENGAGEMENT`         | pouco acesso e queda de movimentação                                        |
| `MATURE_MULTIPRODUCT`    | muitos produtos, uso estável                                                |

Os produtos de clientes que já existem no dataset principal vêm de lá (`companyProducts`).

## Atlas Tecnologia (história da demonstração)

`atlasRaw` descreve **apenas o comportamento bruto** de Atlas Soluções Tecnológicas Ltda.
(Tecnologia / SaaS B2B, média empresa, São Paulo · SP, gerente Mariana Souza, relacionamento
comercial desde 05/08/2025 com pré-conta): volume semanal crescente, 19 sessões nos últimos 30
dias, visitas e buscas por Capital de Giro, uma simulação concluída, uma jornada de antecipação
abandonada, interesse em Pix Cobrança e Maquininha no fim de agosto e um WhatsApp de 08/10 sem
resolução. Só possui Conta PJ e Cartão PJ (mais Pix e boletos em uso).

O pipeline calcula, sem nenhum valor fixado: DNA 82/91/47/75/70/85, ação #1 **Oferecer Capital
de Giro (score 87)**, #2 Pix Cobrança (85), mudanças +18% de volume, +27% de acessos, +3
interações com crédito e −12% no cartão, intenção comercial média → alta e Capital de Giro de #3
para #1. O teste `scripts/seed/intelligence/intelligence.test.ts` garante a história com
tolerância de ±5 pontos. O frontend não tem nenhum caso especial para a Atlas.

## Relatório da base (rebuild atual)

| Volume                            |   Total |
| --------------------------------- | ------: |
| Clientes                          |   5.004 |
| Semanas de transações             | 258.622 |
| Sessões digitais                  | 304.869 |
| Eventos digitais                  | 849.947 |
| Interações (CRM/canais)           |  59.351 |
| Atendimentos                      |     609 |
| Produtos                          |  21.380 |
| Sinais ativos                     |  16.083 |
| Recomendações (top 5 + NO_ACTION) |  24.888 |

Ação #1 por cliente:

| Ação                            | Clientes | Participação |
| ------------------------------- | -------: | -----------: |
| Não abordar agora               |      942 |        18,8% |
| Reengajar nos canais digitais   |      737 |        14,7% |
| Oferecer Capital de Giro        |      656 |        13,1% |
| Apresentar Pix Cobrança         |      591 |        11,8% |
| Oferecer Maquininha             |      488 |         9,8% |
| Resolver atendimento pendente   |      427 |         8,5% |
| Concluir onboarding             |      371 |         7,4% |
| Contato consultivo do gerente   |      358 |         7,2% |
| Apresentar investimentos PJ     |      259 |         5,2% |
| Oferecer seguro empresarial     |      160 |         3,2% |
| Oferecer Cartão PJ              |       14 |         0,3% |
| Apresentar cobrança por boletos |        1 |         0,0% |

Maior concentração: 18,8% (limite do relatório: 35%). DNA médio: relacionamento 69, engajamento
digital 67, profundidade de produtos 57, atividade transacional 54, momentum 45, intenção
comercial 15 (a maioria das empresas não demonstra intenção comercial no período — esperado).

Sinais mais frequentes: alto engajamento digital (52%), interesse recente em produto (33%), gap de
Pix Cobrança (30%), relacionamento esfriando (27%), gap de Capital de Giro (27%), crescimento
transacional (22%), alta intenção em crédito (18%).

## Comandos

```bash
npm run seed                    # dataset principal (inclui os 3.000 clientes estabelecidos)
npm run intelligence:rebuild    # comportamento + DNA + sinais + NBA (local, ~6 s)
npm run seed:aws                # dataset no DynamoDB (inclui o snapshot customerIntelligence)
npm run seed:lake               # produtos do mesh no lake (inclui customer_intelligence)
npm run seed:intelligence       # perfis no DynamoDB, dados brutos no S3 e tabelas gold auxiliares
```
