# TAREFAS RESTANTES — BFP-PJ

Estado em 09/10/2026. As fases 12 (Catálogo/Governança), 10-UI (Dashboards), 14 (polish),
16 (E2E) e 17 (CDK + docs + roteiro) foram implementadas. O SAM foi substituído por AWS CDK.

## Gates

```bash
npm run typecheck && npm run lint && npm run test && npm run build   # 0/0/0/0
npm run test:e2e                                                      # 7 testes Playwright (+ visual)
npm run synth -w infra -- -c env=dev                                  # CDK synth
```

## Pendências reais

1. **Deploy executado em dev** (07/10/2026, conta 480595128032, `sa-east-1`, branch
   `feature/bfp-v1`). Validado na conta: health, 401 sem token, consultas Athena com join
   Mídia ⋈ Customer 360, grants Lake Formation da Lambda e modelo Bedrock respondendo. Correções
   aplicadas no deploy: workgroup de ETL, timestamps UTC no Parquet, model id via SSM sem export,
   query do Cliente 360 no DynamoDB e checagem de bases em todas as telas. Pendente: homol/prod e
   validação ponta a ponta logada pelo time (ver `docs/deployment.md`).
2. **Comparação com período anterior no Athena** — suportada no motor local; no Athena retorna
   aviso (`warnings`). Implementar com segunda execução do compilador usando a janela anterior.
3. **Freshness na nuvem** — resolvido: `seed:lake` grava o horário no parâmetro SSM
   `/bfp-pj-<env>/data-loaded-at` e a Lambda o lê.
4. **Cliente 360 e audiências na nuvem** leem o dataset operacional no DynamoDB (consultas por
   partição de entidade). Adequado ao volume do MVP; para escala, mover a prévia de audiência
   para Athena (`gold_customer_360` + `gold_products`).
5. **Login Cognito** usa `USER_PASSWORD_AUTH` via API (sem Hosted UI/SRP no browser nem refresh
   token automático).
6. **Comparação visual automatizada** — as capturas 1440×1024 ficam em `artifacts/screens/`
   (`npm run test:visual`) e foram comparadas manualmente com as referências; não há pixel-diff.
7. **Números das referências** — valores como "2.418 empresas" e "14,8%" nas telas aprovadas eram
   ilustrativos; a UI mostra o que o motor calcula sobre o seed sintético (por exemplo, a lista de
   canais inclui E-mail e Inside Sales e não há "Display").

## Data mesh, Atlan e FullStory (fase 18)

Implementados: catálogo do data mesh (Glue por domínio + Lake Formation com LF-tags, DataZone
opcional), seleção obrigatória de bases antes do motor, plano de joins por `company_id`,
integração com Atlan (leitura e publicação de glossário) e FullStory (sessões ao vivo e
exportação para o produto `digital_journey`). Detalhes em `docs/data-mesh-and-integrations.md`.

Pendências:

- **Credenciais Atlan e FullStory**: os segredos são criados com valores vazios; preencher
  `bfp-pj-<env>/atlan` e `bfp-pj-<env>/fullstory`. Enquanto isso a UI mostra "Não configurado".
- **FullStory em produção** depende de `FS.identify(company_id)` no site e no app Itaú Empresas.
- **DataZone** não existe na conta; quando houver domínio, informar `-c datazoneDomainId`.
- **Dados reais**: o mesh é populado pelo seed sintético (LGPD); os domínios reais devem publicar
  nas mesmas tabelas/colunas (contrato em `packages/semantic-layer/src/mesh.ts`).

## Clientes PJ · Customer DNA e Próxima Melhor Ação (fase 19)

Implementados (09/10/2026): página Cliente PJ redesenhada (cabeçalho, DNA em árvore com drawer de
drivers, card da próxima melhor ação com explicação, Iniciar ação simulado e dispensa com motivo,
o que mudou, abas Visão geral/Jornada/Produtos/Transações/Digital/Interações/Sinais/Próximas
ações, empresas semelhantes e perguntas à Inteligência PJ), pacote `customer-intelligence`,
APIs, read model no DynamoDB, produto `customer_intelligence` no mesh, tabelas gold, rebuild
diário (EventBridge → Lambda), DNA do público no Audience Builder, testes unitários, de API, web
e E2E. Detalhes em `docs/customer-intelligence-architecture.md`.

Pendências:

- **Claude no Bedrock** continua bloqueado pelo formulário de caso de uso da Anthropic na conta;
  até lá explicações e respostas sobre o cliente usam o provedor determinístico (rotulado na UI).
- **Ativação real**: "Iniciar ação" é simulado (grava `ACTIVATED`); integrar CRM, tarefas do
  gerente e comunicação quando houver os sistemas de destino.
- **Outcomes reais** (aceite, conversão) ainda não chegam de sistemas externos; o cooldown usa os
  outcomes registrados na plataforma e os sintéticos.
- **Calibração**: pesos de DNA e NBA são configuráveis (`DnaScoringConfig`/`NbaScoringConfig`),
  mas foram calibrados na base sintética; recalibrar com dados reais e medir conversão por ação.
- **Similaridade em escala**: a busca de semelhantes varre os resumos (`INTEL#SUMMARY`); acima de
  algumas dezenas de milhares de clientes, mover para índice vetorial ou Athena.
