# Segurança

- **Autenticação**: Cognito (grupos admin/analyst/business). O papel vem exclusivamente do token
  verificado (API Gateway JWT authorizer + verificação na Lambda); nunca do frontend.
- **Autorização**: RBAC por ação e por domínio semântico; objetos com visibilidade
  PRIVATE/TEAM/READ_ONLY verificada no servidor; edição de objetos somente-leitura retorna 403.
- **Rede/edge**: CloudFront HTTPS, OAC para S3 privado, mesma origem para `/api/*`, headers de
  segurança (HSTS, nosniff, frame DENY, no-referrer).
- **Dados**: S3 com BLOCK_ALL, SSL obrigatório e KMS; DynamoDB com KMS e PITR; resultados do Athena
  cifrados e expirados em 7 dias; bronze sem CNPJ/nomes/texto livre.
- **IAM mínimo**: a Lambda acessa só suas tabelas, prefixos `gold/*` e `analytics-results/*`, o
  workgroup, os databases Glue do mesh, os segredos de integração, o parâmetro de freshness,
  Bedrock e `ListUsersInGroup`.
- **Lake Formation**: permissões padrão `IAM_ALLOWED_PRINCIPALS` removidas; acesso às tabelas do
  mesh só por grants baseados em LF-tag (`bfp_domain`). Administradores explícitos
  (`-c lakeFormationAdmins`).
- **Segredos**: nenhum segredo no repositório nem no frontend; credenciais Atlan/FullStory e senha
  de demo no Secrets Manager (preenchidas por operadores); model id no SSM; deploy via GitHub
  OIDC (sem chaves estáticas). `JWT_SECRET` só existe em `AUTH_MODE=dev`.
- **SQL**: o browser envia `AnalysisSpec`; o compilador usa whitelists e parâmetros.
- **Erros**: envelope tipado; stack trace nunca é exposto em `NODE_ENV=production`; a UI só mostra
  mensagens humanas em pt-BR.
- **LGPD**: dados 100% sintéticos; audiências usam apenas empresas com consentimento; prévias são
  agregadas; exportação CSV só de resultados agregados autorizados.
- **Observabilidade**: logs estruturados com `correlationId`, `userId`, `operation`, `durationMs`,
  `status`, `queryId` (ANALYTICS_QUERY, SAVE_ANALYSIS, CREATE_DASHBOARD, CREATE_AUDIENCE,
  ACTIVATION, AI_REQUEST, AI_TOOL_CALL).
