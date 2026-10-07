# Deploy

## O que é preciso fornecer

| Item                       | Quando                   | Onde                                                                                                |
| -------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| Conta AWS + credenciais    | antes do primeiro deploy | AWS CLI (`aws configure` / SSO)                                                                     |
| Região                     | deploy                   | `-c region=sa-east-1` (padrão)                                                                      |
| Model id do Bedrock        | opcional                 | `-c bedrockModelId=<id ou inference profile>` com acesso ao modelo habilitado no console do Bedrock |
| Senha dos usuários de demo | após o deploy            | `DEMO_USER_PASSWORD` (mín. 12, maiúscula, minúscula, dígito)                                        |
| Repositório GitHub         | para CI/CD               | `-c githubRepository=owner/repo` (cria a role OIDC)                                                 |

## Primeiro deploy (dev)

```bash
npm ci
npm run seed
npx cdk bootstrap aws://<ACCOUNT_ID>/sa-east-1
npm run build -w api && npm run build -w web
npm run deploy -w infra -- -c env=dev -c bedrockModelId=<MODEL_ID>
```

Os outputs trazem `WebUrl`, `ApiEndpoint`, `UserPoolId` e `UserPoolClientId`. Carregue dados e
usuários:

```bash
export AWS_REGION=sa-east-1
DATASET_TABLE=bfp-pj-dev-dataset npm run seed:aws
DATA_LAKE_BUCKET=bfp-data-dev-<ACCOUNT_ID> ATHENA_DATABASE=bfp_pj_dev ATHENA_WORKGROUP=bfp-pj-dev npm run seed:lake
OBJECTS_TABLE=bfp-pj-dev-objects npm run seed:workspace
COGNITO_USER_POOL_ID=<UserPoolId> DEMO_USER_PASSWORD='<senha>' npm run cognito:users
```

## Ambientes e pipeline

- Stacks independentes por ambiente: `-c env=dev|homol|prod` → `bfp-pj-<env>-*`.
- `.github/workflows/ci.yml`: PR → `npm ci`, typecheck, lint, test, build, `cdk synth`; E2E com Playwright.
- `.github/workflows/deploy.yml`: push em `homol` ou `prod` → testes → OIDC → `cdk deploy`.
  Configure no GitHub as variáveis `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION` e `BEDROCK_MODEL_ID` por environment.

## Operação

- Logs: CloudWatch `/aws/lambda/bfp-pj-<env>-api` (`aws logs tail … --follow`).
- Dashboard: `bfp-pj-<env>-operacao`; alarmes de erros da Lambda, 5xx da API e erros da IA.
- Rollback: `git revert` + novo deploy, ou `cdk deploy` a partir da tag anterior. Dados de `prod`
  são retidos (RETAIN) mesmo se o stack for removido.
- Diferenças: `npm run diff -w infra -- -c env=homol`.
