# Deploy

## O que é preciso fornecer

| Item                           | Quando                   | Onde                                                                                           |
| ------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------- |
| Conta AWS + credenciais        | antes do primeiro deploy | AWS CLI (`aws configure` / SSO)                                                                |
| Região                         | deploy                   | `-c region=sa-east-1` (padrão)                                                                 |
| Model id do Bedrock            | deploy                   | `-c bedrockModelId=<inference profile>` ou `cdk.json` (ver "Modelo do Bedrock")                |
| Administradores Lake Formation | deploy                   | `-c lakeFormationAdmins=<ARN>[,<ARN>]`: quem roda `seed:lake` / publica produtos de dados      |
| Domínio DataZone               | opcional                 | `-c datazoneDomainId=dzd_...` (vincula listings às tabelas do mesh)                            |
| Credenciais Atlan e FullStory  | após o deploy            | segredos `bfp-pj-<env>/atlan` e `bfp-pj-<env>/fullstory` (ver `data-mesh-and-integrations.md`) |
| Senha dos usuários de demo     | após o deploy            | gerada e guardada no segredo `bfp-pj-<env>/demo-users` (nunca no repositório ou no chat)       |
| Repositório GitHub             | para CI/CD               | `-c githubRepository=owner/repo` (cria a role OIDC)                                            |

## Primeiro deploy (dev)

```bash
npm ci
npm run seed
npx cdk bootstrap aws://<ACCOUNT_ID>/sa-east-1
npm run build -w api && npm run build -w web
npm run deploy -w infra -- -c env=dev -c lakeFormationAdmins=arn:aws:iam::<ACCOUNT_ID>:user/<operador>
```

Os outputs trazem `WebUrl` e `ApiEndpoint`. Carregue dados e usuários:

```bash
export AWS_REGION=sa-east-1
DATASET_TABLE=bfp-pj-dev-dataset npm run seed:aws
DATA_LAKE_BUCKET=bfp-data-dev-<ACCOUNT_ID> MESH_DATABASE_PREFIX=bfp_pj_dev \
  ATHENA_WORKGROUP=bfp-pj-dev-etl DATA_LOADED_AT_PARAMETER=/bfp-pj-dev/data-loaded-at \
  npm run seed:lake
OBJECTS_TABLE=bfp-pj-dev-objects npm run seed:workspace

PW="Bfp-$(openssl rand -base64 18 | tr -d '/+=')9a"
aws secretsmanager create-secret --name bfp-pj-dev/demo-users --secret-string "{\"password\":\"$PW\"}"
COGNITO_USER_POOL_ID=<UserPoolId> DEMO_USER_PASSWORD="$PW" npm run cognito:users; unset PW
```

Observações:

- `seed:lake` usa o workgroup **`bfp-pj-<env>-etl`**. O workgroup da API (`bfp-pj-<env>`) impõe o
  local de saída e por isso rejeita `CTAS` com `external_location`.
- O operador que roda `seed:lake` precisa estar em `lakeFormationAdmins` (cria/recria tabelas
  governadas pelo Lake Formation).
- Os timestamps das tabelas gold são gravados como `timestamp` UTC (o Parquet/Hive não aceita
  `timestamp with time zone`).
- Para recuperar a senha de demo:
  `aws secretsmanager get-secret-value --secret-id bfp-pj-dev/demo-users --query SecretString --output text`.

## Modelo do Bedrock

O model id fica no parâmetro SSM `/bfp-pj-<env>/bedrock-model-id` (stack `ai`). A API resolve o
valor no deploy, sem export entre stacks, então trocar de modelo é só
`-c bedrockModelId=<id>` + `cdk deploy --all`.

Antes, confirme que o modelo está liberado na conta (Bedrock → Model access):

```bash
aws bedrock-runtime converse --region sa-east-1 --model-id <id> \
  --messages '[{"role":"user","content":[{"text":"ok"}]}]' --query "output.message.content[0].text"
```

Na conta de dev, os perfis Claude 5.x retornam `AccessDenied`; o padrão em `infra/cdk.json` é
`global.anthropic.claude-sonnet-4-6`. Para modelos Anthropic, a AWS também exige que o formulário
de caso de uso da Anthropic seja enviado uma vez por conta (Bedrock → Model catalog → modelo
Anthropic → _Submit use case details_); sem isso o Bedrock responde `ResourceNotFoundException:
Model use case details have not been submitted`. Esse envio aceita termos em nome da conta e deve
ser feito por um responsável da conta.

Sem modelo (`NOT_CONFIGURED`) ou com o Bedrock indisponível, a Inteligência PJ responde com o
provedor determinístico local (mesmas ferramentas governadas) e registra `ai_provider_fallback`.
Falhas do Bedrock aparecem no log `ai_request_failed` com `errorName` e `errorMessage`.

## Ambiente dev publicado

| Item      | Valor                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------- |
| Conta     | `480595128032` · `sa-east-1`                                                                   |
| Web       | https://dv90segk2omht.cloudfront.net                                                           |
| API       | https://99x83w7mdc.execute-api.sa-east-1.amazonaws.com                                         |
| User pool | `sa-east-1_YKZoKZ74A`                                                                          |
| Bucket    | `bfp-data-dev-480595128032`                                                                    |
| Mesh      | `bfp_pj_dev_{customer360,media,products,service,relationship,digital,app,payments,experience}` |
| Modelo    | `global.anthropic.claude-sonnet-4-6`                                                           |
| Usuários  | `analyst@`, `admin@`, `business@example.local`                                                 |

## Ambientes e pipeline

- Stacks independentes por ambiente: `-c env=dev|homol|prod` → `bfp-pj-<env>-*`.
- `.github/workflows/ci.yml`: PR → `npm ci`, typecheck, lint, test, build, `cdk synth`; E2E com Playwright.
- `.github/workflows/deploy.yml`: push em `homol` ou `prod` → testes → OIDC → `cdk deploy`.
  Configure no GitHub as variáveis `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION` e `BEDROCK_MODEL_ID` por environment.

## Operação

- Logs: CloudWatch `/aws/lambda/bfp-pj-<env>-api` (`aws logs tail … --follow`).
- Dashboard: `bfp-pj-<env>-operacao`; alarmes de erros da Lambda, 5xx da API e erros da IA.
- Freshness: `seed:lake` grava o horário da carga em
  `/bfp-pj-<env>/data-loaded-at`; a API lê o parâmetro (cache de 5 min).
- Rollback: `git revert` + novo deploy, ou `cdk deploy` a partir da tag anterior. Dados de `prod`
  são retidos (RETAIN) mesmo se o stack for removido.
- Diferenças: `npm run diff -w infra -- -c env=homol`.
