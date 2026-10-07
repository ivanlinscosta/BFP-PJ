# Data mesh AWS, Atlan e FullStory

## Data mesh (Glue + Lake Formation, DataZone opcional)

Cada domínio de negócio publica um **produto de dados** em um banco Glue próprio
`bfp_pj_<env>_<domínio>`. A chave de junção entre todos eles é `company_id`.

| Base (id)           | Banco Glue / tabela                      | Domínio / owner    | Origem                         |
| ------------------- | ---------------------------------------- | ------------------ | ------------------------------ |
| `customer_360`      | `<prefix>_customer360.customer_360`      | Clientes PJ        | Cadastro, abertura, onboarding |
| `media_touchpoints` | `<prefix>_media.media_touchpoints`       | Mídia PJ           | Google/Meta/LinkedIn Ads       |
| `company_products`  | `<prefix>_products.company_products`     | Produtos PJ        | Sistemas de produto            |
| `conversations`     | `<prefix>_service.conversations`         | Atendimento PJ     | WhatsApp, chat, telefone       |
| `crm_interactions`  | `<prefix>_relationship.crm_interactions` | Relacionamento PJ  | CRM Empresas                   |
| `digital_journey`   | `<prefix>_digital.digital_journey`       | Canais Digitais PJ | **FullStory**                  |

A definição fica em `packages/semantic-layer/src/mesh.ts`, que é a fonte única para o seed, o
compilador, a API e a UI.

### Governança (stack `bfp-pj-<env>-data`)

- O Lake Formation tem como administradores o role de execução do CloudFormation e os ARNs
  passados em `-c lakeFormationAdmins=...`.
- As permissões padrão `IAM_ALLOWED_PRINCIPALS` vêm vazias, então o acesso é decidido por grants
  do Lake Formation.
- O bucket do lake é registrado com um role de acesso a dados dedicado.
- As LF-tags `bfp_domain` (um valor por domínio) e `bfp_classification` ficam associadas a cada
  banco e são herdadas pelas tabelas.
- A Lambda da API recebe `DESCRIBE` nos bancos e `SELECT` e `DESCRIBE` nas tabelas por
  **expressão de LF-tag** (ABAC). Um novo domínio passa a ser acessível sem mudar IAM, desde que
  tenha a tag.
- O Amazon DataZone é opcional (`-c datazoneDomainId=...`). Quando configurado, a API vincula as
  listings do portal às tabelas do mesh.

### Catálogo

A rota `GET /api/mesh/datasets` lê os bancos e tabelas do Glue Data Catalog, com descrição,
colunas, comentários e parâmetros `bfp:*`, além das LF-tags. Em seguida, enriquece o resultado com
o Atlan. Em desenvolvimento (`MESH_CATALOG=local`), usa as definições do pacote.

### Seleção de bases → motor

1. No Explorar, o usuário escolhe as bases em **"Bases de dados do data mesh"**. Sem bases, o
   motor não é acionado. Métricas e dimensões de bases não selecionadas ficam desabilitadas na
   biblioteca.
2. O `AnalysisSpec.datasets` segue para a API. O validador rejeita a requisição com
   `MISSING_DATASETS`, `DATASET_NOT_SELECTED` ou `UNKNOWN_DATASET` quando for o caso.
3. O compilador Athena só lê as bases selecionadas:
   - os atributos de empresa entram por `INNER JOIN customer_360 ON company_id`;
   - fatos de bases diferentes são combinados com `FULL OUTER JOIN` nas dimensões.
4. O plano de execução (bases + joins) volta em `result.metadata.plan` e aparece no canvas.
5. A Inteligência PJ seleciona automaticamente as bases que a pergunta exige e as registra como
   operações `ADD_DATASET`.

## Atlan (catálogo oficial do Itaú)

Configure o segredo `bfp-pj-<env>/atlan` no Secrets Manager:

```json
{ "baseUrl": "https://<tenant>.atlan.com", "apiToken": "<token>", "glossaryGuid": "<guid>" }
```

- **Leitura:** `POST /api/meta/search/indexsearch` procura as tabelas do mesh por nome. A UI
  mostra certificação, owners, descrição, termos e o link para o asset no Atlan.
- **Escrita:** em Administração, o botão **"Publicar métricas governadas no Atlan"** chama
  `POST /api/integrations/atlan/sync`, que faz upsert de `AtlasGlossaryTerm` no glossário
  informado.

Sem segredo preenchido, a UI exibe "Não configurado" e o restante continua funcionando.

## FullStory (jornada digital)

Configure o segredo `bfp-pj-<env>/fullstory`:

```json
{ "apiKey": "<server API key>", "segmentId": "<segmento a exportar>" }
```

O site e o app precisam chamar `FS.identify('<company_id>')`.

- **Ao vivo:** o detalhe do Cliente PJ 360 lista as sessões (replays) da empresa via
  `GET /sessions/v2?uid=<company_id>`.
- **Lote:** `npm run fullstory:export` exporta os eventos do segmento em NDJSON:
  - `POST /segments/v1/exports`, depois polling em `/operations/v1/{id}`, depois a URL de download;
  - grava em `bronze/fullstory/` e normaliza em `silver/digital/digital_journey/`;
  - recria a tabela gold `digital_journey` via CTAS.

Variáveis do `fullstory:export`:

- `AWS_REGION`
- `DATA_LAKE_BUCKET`
- `MESH_DATABASE_PREFIX`
- `ATHENA_WORKGROUP`
- `FULLSTORY_SECRET_ID`
- opcional: `EXPORT_DAYS` (padrão 30)

Enquanto o FullStory não estiver configurado, `digital_journey` é populada pelo seed sintético no
mesmo formato.
