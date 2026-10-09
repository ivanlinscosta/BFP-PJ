# Customer DNA

Leitura comportamental da empresa em **6 dimensões de 0 a 100**, calculada de forma determinística
a partir do `CustomerFeatureSet` (`packages/customer-intelligence/src/dna.ts`). O DNA **não é nota
de crédito** e não usa atributos pessoais sensíveis; a árvore da página é uma metáfora — os
valores estão nas anotações.

## Cálculo

Para cada dimensão: `score = round(100 × Σ peso_i × normalize(feature_i))`, com os pesos da
dimensão somando 1. Normalizações:

- `linear min–max`: `(valor − min) / (max − min)`, limitado a 0–1;
- `inverse min–max`: `1 − linear` (menor é melhor, por exemplo dias desde o último login);
- `log10 min–max`: para valores em reais que variam em ordens de grandeza;
- `booleano`: 1 ou 0.

Cada dimensão devolve os **drivers** (feature, valor, contribuição em pontos, direção, fonte e
período), exibidos no drawer de drivers ao clicar em uma dimensão.

**Níveis**: muito alto ≥ 90 · alto ≥ 70 · médio ≥ 40 · baixo < 40.
**Tendência**: compara com o DNA calculado em `asOf − 30 dias`; variação ≥ 3 pontos = alta/queda.

Os pesos ficam em `DEFAULT_DNA_CONFIG` (`DnaScoringConfig`) e podem ser trocados por ambiente
sem alterar o código dos motores. Versão atual: `dna-1.0.0`.

## Dimensões

### Relacionamento (raízes e vínculos) · `relationshipStrength`

| Feature                    | Driver                     | Peso | Normalização | Fonte         |
| -------------------------- | -------------------------- | ---- | ------------ | ------------- |
| `relationship_tenure_days` | Tempo de relacionamento    | 0.2  | linear 0–600 | Cadastro PJ   |
| `crm_interactions_90d`     | Interações com gerente/CRM | 0.15 | linear 0–7   | CRM (90 dias) |
| `products_count`           | Produtos contratados       | 0.2  | linear 0–6   | Produtos      |
| `active_products_ratio`    | Uso dos produtos           | 0.15 | linear 0–1   | Produtos      |
| `days_since_last_contact`  | Recência do contato        | 0.15 | inverse 0–60 | CRM           |
| `has_relationship_manager` | Gerente de relacionamento  | 0.15 | booleano     | CRM           |

### Engajamento digital (rede de conexões) · `digitalEngagement`

| Feature                   | Driver                 | Peso | Normalização | Fonte             |
| ------------------------- | ---------------------- | ---- | ------------ | ----------------- |
| `logins_30d`              | Frequência de login    | 0.3  | linear 0–24  | Digital (30 dias) |
| `digital_active_days_30d` | Dias ativos            | 0.2  | linear 0–20  | Digital (30 dias) |
| `features_used_30d`       | Funcionalidades usadas | 0.2  | linear 0–7   | Digital (30 dias) |
| `days_since_last_login`   | Recência de acesso     | 0.15 | inverse 0–30 | Digital           |
| `channel_mix`             | App e Internet Banking | 0.15 | linear 0–1   | Digital (30 dias) |

### Profundidade de produtos (ramificações e cobertura) · `productDepth`

| Feature                    | Driver                 | Peso | Normalização | Fonte    |
| -------------------------- | ---------------------- | ---- | ------------ | -------- |
| `products_count`           | Quantidade de produtos | 0.4  | linear 0–8   | Produtos |
| `active_products_ratio`    | Uso efetivo            | 0.25 | linear 0–1   | Produtos |
| `product_categories_count` | Categorias             | 0.2  | linear 0–5   | Produtos |
| `relevant_gaps`            | Lacunas relevantes     | 0.15 | inverse 0–3  | Produtos |

### Atividade transacional (circulação e fluxos) · `transactionActivity`

| Feature                         | Driver                             | Peso | Normalização    | Fonte                |
| ------------------------------- | ---------------------------------- | ---- | --------------- | -------------------- |
| `transaction_volume_30d`        | Volume transacionado               | 0.35 | log10 4–6.7     | Transações (30 dias) |
| `transactions_count_30d`        | Frequência de transações           | 0.25 | linear 0–260    | Transações (30 dias) |
| `payment_means_used`            | Meios usados (Pix, boleto, cartão) | 0.15 | linear 0–3      | Transações (30 dias) |
| `transaction_volume_change_60d` | Tendência do volume                | 0.25 | linear -0.3–0.3 | Transações (60 dias) |

### Momentum do negócio (crescimento do organismo) · `businessMomentum`

| Feature                         | Driver                       | Peso | Normalização    | Fonte                |
| ------------------------------- | ---------------------------- | ---- | --------------- | -------------------- |
| `transaction_volume_change_60d` | Crescimento transacional     | 0.3  | linear -0.3–0.3 | Transações (60 dias) |
| `inflow_change_60d`             | Crescimento de recebimentos  | 0.2  | linear -0.3–0.3 | Transações (60 dias) |
| `digital_sessions_change_30d`   | Aumento de acessos           | 0.2  | linear -0.5–1   | Digital (30 dias)    |
| `new_products_90d`              | Maior utilização de produtos | 0.15 | linear 0–4      | Produtos (90 dias)   |
| `payments_volume_change_60d`    | Evolução dos pagamentos      | 0.15 | linear -0.3–0.3 | Transações (60 dias) |

### Intenção comercial (brotos de oportunidade) · `commercialIntent`

| Feature                         | Driver                          | Peso | Normalização  | Fonte                |
| ------------------------------- | ------------------------------- | ---- | ------------- | -------------------- |
| `credit_page_views_14d`         | Visitas a conteúdo de crédito   | 0.25 | linear 0–3    | Digital (14 dias)    |
| `credit_searches_14d`           | Buscas por crédito              | 0.15 | linear 0–3    | Digital (14 dias)    |
| `credit_simulations_30d`        | Simulações                      | 0.25 | linear 0–2    | Digital (30 dias)    |
| `product_views_30d`             | Interações com produtos         | 0.1  | linear 0–8    | Digital (30 dias)    |
| `abandoned_credit_journeys_30d` | Jornadas de crédito abandonadas | 0.1  | linear 0–2    | Digital (30 dias)    |
| `transaction_volume_change_60d` | Crescimento transacional        | 0.15 | linear 0–0.25 | Transações (60 dias) |

## Exemplo: Atlas Tecnologia

Calculado pelo pipeline a partir do comportamento sintético (nada é fixado na página):
relacionamento 82 · engajamento digital 91 · profundidade de produtos 47 · atividade transacional
75 · momentum 70 · intenção comercial 85. A intenção comercial passou de média para alta nos
últimos 30 dias.
