# Roteiro de demonstração (≈ 12 min)

Perfil: **Mariana Souza · Growth PJ** (`analyst@example.local`).

1. **Explorar vazio** — mostre a biblioteca governada (métricas certificadas), o construtor e as
   sugestões de visualização. "Nada aqui é dashboard pronto: o negócio monta a pergunta."
2. **Bases do data mesh** — clique em _Selecionar bases de dados_ e marque _Customer 360_ (mostre
   owner, tabela Glue, chave `company_id` e o selo do Atlan quando configurado). "O motor só lê e
   une as bases escolhidas." Métricas de outras bases ficam desabilitadas até serem selecionadas.
3. **Conversão por canal** — clique em _Conversão de abertura_ e _Canal_; adicione o filtro
   _Estado = SP_ (ou arraste da biblioteca). Período: últimos 90 dias. Leia os insights
   determinísticos e o rodapé de confiança (Acquisition Gold · Certificada · qualidade).
4. **Canal × Porte** — em _Próximas explorações_, "Segmentar por Porte da empresa": o heatmap
   genérico aparece com total por canal calculado pelo motor.
5. **Salvar e organizar** — _Salvar análise_ → _Adicionar ao dashboard_ → "Aquisição por canal".
   Em **Dashboards**, mostre Todos/Meus/Compartilhados/Favoritos e o card do Rafael (somente leitura).
6. **Inteligência PJ** — "Qual canal combina melhor conversão com menor CAC?" → resposta com
   números reais e base da resposta. Depois "Agora separa por porte." → a análise é alterada e o
   playground abre com a dimensão aplicada.
7. **Teste arquitetural** — pergunte "Compare CAC e ativação D30 por canal, porte e estado nos
   últimos 120 dias": é só um novo `AnalysisSpec`.
8. **Catálogo** — aba _Bases de dados_: os 6 produtos do mesh lidos do Glue, com status de Atlan,
   DataZone e FullStory. Em seguida, _Conversão de abertura_: definição, fórmula, confiança, dimensões compatíveis e
   linhagem _CRM + Mídia + Abertura de contas → Acquisition Gold → métrica → uso_. _Usar na análise_.
9. **Cliente PJ 360** — busque _Atlas Tecnologia_: resumo, jornada cronológica (marcos digitais do
   FullStory e painel de sessões quando a integração estiver configurada) e _Explorar
   empresas semelhantes_ (abre o playground pré-filtrado).
10. **Audiência** — modelo _Oportunidade Capital de Giro — SP_: regras E/OU, prévia agregada,
    _Salvar_ e _Enviar para CRM_ (Na fila → Processando → Concluído, simulado).
11. **Governança** — produtos de dados com owner, freshness × SLO e qualidade medida.
12. **Administração** (entre como `admin@example.local`) — usuários, papéis, semântica e feature flags.
