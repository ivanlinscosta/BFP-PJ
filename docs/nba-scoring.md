# NBA · score

Implementação: `scoreCandidates` em `packages/customer-intelligence/src/nba.ts`. Pesos e
penalidades em `DEFAULT_NBA_CONFIG` (`NbaScoringConfig`), versão do modelo `nba-1.0.0`.

## Fórmula

```
score = round(100 × clamp01(
    0,30 × relevância
  + 0,25 × intenção
  + 0,20 × impacto esperado
  + 0,15 × momento
  + 0,10 × confiança
  − penalidade de fadiga
  − penalidade de risco))
```

| Componente       | Cálculo (0–1)                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relevância       | afinidade da ação com o DNA (`ACTION_SCORING[action].affinity`: dimensões, pesos, invertida quando "menos é mais") + 0,08 se houver sinal de lacuna do próprio produto. Casos especiais: concluir onboarding 0,95 se incompleto; resolver atendimento ≥ 0,85 (1 com reclamação crítica); educar = uso efetivo baixo × muitos produtos; Maquininha e Pix Cobrança +0,05 por visita ao produto (máx. 0,15) |
| Intenção         | combinação probabilística das forças dos sinais relevantes: `1 − Π(1 − força)`                                                                                                                                                                                                                                                                                                                           |
| Impacto esperado | impacto de negócio da ação (`ACTION_SCORING[action].impact`) × fator de porte (MEI 0,7 · Micro 0,8 · Pequena 0,9 · Média/Grande 1)                                                                                                                                                                                                                                                                       |
| Momento          | sinal mais recente: `0,5 + 0,5 × 0,5^(dias/14)`; sem sinais: `0,3 + 0,4 × momentum/100`                                                                                                                                                                                                                                                                                                                  |
| Confiança        | `0,6 × min(1, sinais/3) + 0,4 × qualidade dos dados`; × 0,7 se qualidade < 0,7                                                                                                                                                                                                                                                                                                                           |

Penalidades (somente ações comerciais):

| Penalidade | Regra                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------- |
| Fadiga     | 0,05 por contato comercial nos últimos 30 dias, limitada a 0,20                              |
| Risco      | 0,30 com reclamação em 30 dias + até 0,15 por interações sem resolução (0,075 por interação) |

## NO_ACTION

`NO_ACTION` compete com as demais ações pelo custo do contato:

```
noAction = min(100, 30
  + 20 × (1 − força do sinal de oportunidade mais forte)
  + 15 × (reclamação crítica em 30 dias)
  + 25 × (1 − qualidade dos dados)
  + (melhor score elegível < 45 ? 45 − melhor score + 10 : 0))
```

Ela sempre aparece no ranking como alternativa explícita. Com qualidade dos dados < 0,4, é a
única ação elegível (`INSUFFICIENT_DATA`).

## Confiança exibida

`confiança = 50% × componente de confiança + 50% × score/100` (para `NO_ACTION`, só o componente).

## Exemplo: Atlas Tecnologia

Oferecer Capital de Giro: relevância 87 · intenção 100 · impacto 92 · momento 100 · confiança 100,
penalidade de risco 8 pontos (WhatsApp de 08/10 sem resolução) → **score 87**, #1. Apresentar Pix
Cobrança fica em #2 (85), com a maior diferença no impacto esperado (92 vs. 72). Há 30 dias,
Capital de Giro era a #3: a intenção comercial subiu de média para alta.

## Calibração

`npm run intelligence:rebuild` imprime a distribuição da ação #1 e falha se uma ação concentrar
mais do que o limite definido no relatório (`concentrationOk`). Na base sintética atual nenhuma
ação passa de 19% (ver [synthetic-data.md](synthetic-data.md)).
