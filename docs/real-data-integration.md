# Dados reais: onde trocar o que hoje é sintético

A BFP - PJ roda inteira sobre dados **sintéticos** gerados por `scripts/seed`. Todas as telas
leem os dados por contratos estáveis (tabelas do mesh, entidades do dataset, perfis da
inteligência e integrações), então ligar dados reais é **trocar a origem que alimenta cada
contrato**, sem mudar telas, métricas ou motores.

Este guia lista cada ponto mockado, o arquivo onde ele nasce e o que fazer para consumir a
fonte real: **data mesh (Glue/Athena)**, **FullStory** e **Atlan**.

## Resumo

| #   | O que é sintético hoje                           | Onde nasce                                                                 | Fonte real                                     | O que mudar                                                                                                |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Tabelas do mesh (10 produtos de dados)           | `scripts/seed/generator.ts` → `npm run seed:lake`                          | Domínios publicando no Glue/S3                 | Publicar as tabelas gold no contrato de `packages/semantic-layer/src/mesh.ts`; parar de rodar `seed:lake`  |
| 2   | Catálogo do mesh (nomes, donos, descrições)      | `MESH_DATASETS` em `mesh.ts` (`MESH_CATALOG=local`)                        | AWS Glue Data Catalog (+ DataZone)             | `MESH_CATALOG=glue` e parâmetros `bfp:*` nas tabelas; `DATAZONE_DOMAIN_ID` opcional                        |
| 3   | Certificação, owners e glossário                 | Ausente (Atlan sem credenciais)                                            | **Atlan**                                      | Preencher o segredo `bfp-pj-<env>/atlan`                                                                   |
| 4   | Jornada digital (eventos de navegação)           | `digitalEvents` do gerador                                                 | **FullStory**                                  | Preencher `bfp-pj-<env>/fullstory`, `FS.identify(company_id)` no site e no app, `npm run fullstory:export` |
| 5   | Dataset operacional (Clientes PJ, audiências)    | `npm run seed:aws` → DynamoDB `bfp-pj-<env>-dataset`                       | Sistemas de origem (cadastro, CRM, produtos…)  | Carga incremental no formato `ENTITY#<tipo>` / `COMPANY#<id>` (ver seção 5)                                |
| 6   | Comportamento para a Customer Intelligence       | `scripts/seed/intelligence/generator.ts`                                   | Tabelas gold do mesh                           | Montar `CustomerRawData` a partir do Athena e gravar em `s3://<lake>/intelligence/raw/customers.json.gz`   |
| 7   | Qualidade dos dados (status e incidentes)        | `qualityStatuses` do gerador                                               | Monitor de qualidade do lake (Glue DQ, Deequ…) | Gravar entidades `qualityStatus` no DynamoDB a cada carga                                                  |
| 8   | Freshness ("Dados atualizados há…")              | `seed:lake` grava o horário no SSM                                         | Fim de cada carga real                         | O job de carga escreve `/bfp-pj-<env>/data-loaded-at`                                                      |
| 9   | Envio de audiência ao CRM                        | `advanceJob` em `apps/api/src/http/routes/audiences.ts` (simulado)         | CRM / plataforma de campanhas                  | Substituir a simulação por uma fila (SQS) + integração do destino                                          |
| 10  | "Iniciar ação" da próxima melhor ação            | `recordOutcome` em `apps/api/src/services/customerIntelligence/service.ts` | CRM, tarefas do gerente, comunicação           | Publicar o outcome `ACTIVATED` em uma fila para o destino escolhido                                        |
| 11  | Workspace de demonstração (análises, dashboards) | `apps/api/src/demo/workspace.ts`, `npm run seed:workspace`                 | Uso real dos usuários                          | `SEED_DEMO_WORKSPACE=false` e não rodar `seed:workspace`                                                   |
| 12  | Usuários de demonstração                         | `AUTH_MODE=dev` / `npm run cognito:users`                                  | Cognito com SSO corporativo                    | Federar o Cognito com o IdP corporativo e mapear grupos `admin`/`analyst`/`business`                       |

## 1. Tabelas do data mesh (Glue + Athena)

**Hoje:** `npm run seed` gera `data/dataset.json`; `npm run seed:lake` transforma esse arquivo em
NDJSON (bronze e silver) e cria as tabelas gold Parquet por CTAS
(`scripts/seed/lake.ts`, `scripts/seed/lake-publish.ts`). As linhas de cada produto saem de
`buildMeshRows` em `packages/analytics-engine/src/mesh-rows.ts`.

**Contrato:** `MESH_DATASETS` em `packages/semantic-layer/src/mesh.ts` define, para cada produto,
o banco Glue (`bfp_pj_<env>_<banco>`), a tabela, o grão e **as colunas e tipos**. O compilador do
Athena (`packages/analytics-engine/src/athena/compiler.ts`, `DIMENSION_COLUMNS` e as expressões das
métricas) só usa essas colunas.

**Para usar dados reais:**

1. Cada domínio publica sua tabela gold no banco do mesh com **as mesmas colunas e tipos** do
   contrato (Parquet em `s3://<lake>/gold/<banco>/<tabela>/` ou tabela já existente registrada no
   Glue). A chave de junção é sempre `company_id`.
2. Garanta as permissões no Lake Formation: as tabelas precisam da LF-tag de domínio
   (`infra/lib/data-stack.ts`) para que a Lambda da API consiga ler.
3. Mantenha `ANALYTICS_ENGINE=athena` (já é o padrão na nuvem) e pare de rodar `seed:lake`.
4. Se uma coluna real tiver outro nome, ajuste **apenas** o contrato em `mesh.ts` e o mapeamento
   em `compiler.ts`; telas e métricas não mudam.
5. Para incluir um novo produto, adicione-o em `MESH_DATASETS`, as dimensões e métricas em
   `packages/semantic-layer/src/catalog.ts` e o mapeamento no compilador.

A prévia de dados do catálogo (`/catalogo/bases/:id`) já lê a tabela gold pelo Athena
(`previewTable` em `apps/api/src/engines/athenaEngine.ts`), então passa a mostrar os dados reais
assim que a tabela for publicada.

## 2. Catálogo do mesh (Glue Data Catalog e DataZone)

**Hoje (local):** `MESH_CATALOG=local` usa os textos de `MESH_DATASETS`.
**Na nuvem:** `MESH_CATALOG=glue` lê cada tabela no Glue (`apps/api/src/services/mesh/catalog.ts`)
e usa os parâmetros da tabela quando existem: `bfp:owner`, `bfp:grain`, `bfp:domain`,
`bfp:source_system`, `bfp:data_product` e a descrição da tabela. O `seed:lake` grava esses
parâmetros; nas tabelas reais, o time dono deve gravá-los (ou a área de governança via Atlan).
Com `DATAZONE_DOMAIN_ID`, a API também vincula os listings do Amazon DataZone.

## 3. Atlan (catálogo oficial)

**Hoje:** o segredo `bfp-pj-<env>/atlan` foi criado vazio, então a interface mostra "Atlan: não
configurado".

**Para ligar:**

```bash
aws secretsmanager put-secret-value --secret-id bfp-pj-dev/atlan --region sa-east-1 \
  --secret-string '{"baseUrl":"https://<tenant>.atlan.com","apiToken":"<TOKEN>","glossaryGuid":"<GUID>"}'
```

- **Leitura** (`apps/api/src/services/integrations/atlan.ts`, `findByNames`): para cada base, a API
  procura no Atlan um asset do tipo `Table` com o **mesmo nome da tabela** e qualified name contendo
  o banco Glue. Certificação, owners, descrição e termos do Atlan passam a aparecer no catálogo.
  Para isso, o Atlan precisa estar conectado (crawler) ao Glue/Athena da conta.
- **Publicação** (`POST /api/integrations/atlan/sync`, administradores): publica as métricas
  certificadas como termos do glossário `glossaryGuid`.
- Localmente, use `ATLAN_BASE_URL` e `ATLAN_API_TOKEN` no ambiente em vez do segredo.

## 4. FullStory (jornada digital)

**Hoje:** a tabela `digital_journey` vem dos `digitalEvents` sintéticos e o segredo
`bfp-pj-<env>/fullstory` está vazio.

**Para ligar:**

1. No site e no app Itaú Empresas, identifique a empresa: `FS.identify('<company_id>')` — o
   `company_id` precisa ser o mesmo do Customer 360.
2. Crie no FullStory um segmento com os eventos que interessam e grave o segredo:

   ```bash
   aws secretsmanager put-secret-value --secret-id bfp-pj-dev/fullstory --region sa-east-1 \
     --secret-string '{"apiKey":"<API_KEY>","segmentId":"<SEGMENT_ID>"}'
   ```

3. Rode `npm run fullstory:export` (`scripts/fullstory-export.ts`): exporta o segmento em NDJSON,
   grava em `bronze/fullstory/`, normaliza em `silver/digital/digital_journey/` e recria a tabela
   gold. Agende essa execução (EventBridge + Lambda, ou o pipeline de dados existente).
4. **Ao vivo:** a aba Digital do Cliente PJ lista as sessões gravadas da empresa
   (`GET /sessions/v2?uid=<company_id>`, `FullStoryClient.listSessions`).

## 5. Dataset operacional (Clientes PJ e audiências)

**Hoje:** `npm run seed:aws` grava todas as entidades de `data/dataset.json` na tabela DynamoDB
`bfp-pj-<env>-dataset` (`scripts/seed/aws.ts`). A página Clientes PJ (busca e Customer 360) e a
prévia de audiências leem dessa tabela (`apps/api/src/repositories/dynamoDatasetRepository.ts`).

**Formato de cada item:** `PK = ENTITY#<tipo>`, `SK = <id>`, `entityType`, `document` (o objeto da
entidade), `GSI1PK = COMPANY#<company_id>` e `GSI1SK = <timestamp>#<tipo>#<id>`; o objeto da entidade (tipos em `packages/domain/src/index.ts`:
`company`, `account`, `companyProduct`, `crmInteraction`, `conversation`, `digitalEvent`,
`transaction`, `npsResponse`…).

**Para usar dados reais:** um job incremental (Glue Job ou Lambda) lê as tabelas gold e grava os
itens nesse formato (reutilize `marshallDatasetItem` de `scripts/seed/aws.ts`). Para volumes
grandes, a evolução recomendada é mover a busca de clientes e a prévia de audiência para o Athena
(`customer_360` + `company_products`), como já é feito nas análises.

## 6. Customer Intelligence (DNA, sinais e próxima melhor ação)

**Hoje:** `scripts/seed/intelligence/generator.ts` cria o comportamento de 18 meses de cada
empresa (`CustomerRawData`). O `seed:intelligence` grava esse comportamento em
`s3://<lake>/intelligence/raw/customers.json.gz`, e a Lambda `intelligence-rebuild`
(`apps/api/src/services/customerIntelligence/rebuild.ts`) recalcula tudo diariamente a partir dele.

**Para usar dados reais:** substitua o gerador por um job que monta `CustomerRawData`
(`packages/customer-intelligence/src/types.ts`) a partir do mesh:

| Campo de `CustomerRawData` | Tabela real                                            |
| -------------------------- | ------------------------------------------------------ |
| `identity`                 | `customer_360` (+ cadastro para nome e gerente)        |
| `products`                 | `company_products`                                     |
| `transactions` (semanais)  | `transactions` agregada por semana                     |
| `sessions`, `events`       | `digital_journey` (FullStory) e `app_navigation`       |
| `interactions`             | `crm_interactions`                                     |
| `serviceCases`             | `conversations` (atendimentos)                         |
| `outcomes`                 | partição `INTEL#OUTCOME#` do DynamoDB                  |
| `milestones`               | datas de lead, abertura e onboarding do `customer_360` |

Grave o resultado no mesmo arquivo do S3 (ou altere `rebuildIntelligenceReadModel` para ler
direto do Athena). Nada muda nos motores: features, DNA, sinais e ranking são funções puras do
pacote `packages/customer-intelligence`. Recalibre os pesos em `config.ts` com dados reais.

## 7 e 8. Qualidade e freshness

- **Qualidade:** a governança lê entidades `qualityStatus` do dataset
  (`apps/api/src/http/routes/quality.ts`). Hoje elas vêm do gerador; com dados reais, o monitor
  de qualidade do lake grava um `qualityStatus` por produto a cada carga.
- **Freshness:** o rótulo "Dados atualizados há…" lê o parâmetro SSM
  `/bfp-pj-<env>/data-loaded-at` (`DATA_LOADED_AT_PARAMETER`). O job de carga real deve gravar o
  horário ao terminar, como faz `scripts/seed/lake.ts`.

## 9 e 10. Ativação (audiências e próxima melhor ação)

- **Audiências → CRM:** o envio é simulado em `advanceJob`
  (`apps/api/src/http/routes/audiences.ts`), que só avança o status com o tempo. Para o envio
  real, publique o job em uma fila (SQS) e deixe um consumidor enviar ao CRM e atualizar o status
  do `activationJob`.
- **"Iniciar ação":** grava o outcome `ACTIVATED` (`recordOutcome`). Para integrar, publique o
  outcome no mesmo fluxo (fila) com o destino escolhido: CRM, tarefa do gerente ou comunicação.

## 11 e 12. Workspace e usuários

- Desligue o workspace de demonstração com `SEED_DEMO_WORKSPACE=false` (já é assim na nuvem) e não
  rode `seed:workspace` em homologação e produção.
- Federe o Cognito com o provedor corporativo (SSO) e mapeie os grupos `admin`, `analyst` e
  `business`, que definem o que cada pessoa vê (`apps/api/src/auth/rbac.ts`).

## IA generativa

A Inteligência PJ usa o provedor de `AI_PROVIDER`: `openai` (chave em `bfp-pj-<env>/openai`),
`bedrock` (modelo em `/bfp-pj-<env>/bedrock-model-id`) ou `local`. Em todos os casos os números
vêm das ferramentas governadas sobre as tabelas do mesh, então a IA passa a responder com dados
reais automaticamente quando as tabelas forem reais.
