import type { AudienceRuleGroup } from '@bfp/domain';

/** Starter templates offered on the audiences list (UI configuration, not data). */
export const TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  group: AudienceRuleGroup;
}> = [
  {
    id: 'capital-de-giro',
    name: 'Oportunidade Capital de Giro — SP',
    description: 'Pequenas e médias de SP, ativadas, sem Capital de Giro.',
    group: {
      kind: 'group',
      id: 'root',
      operator: 'AND',
      rules: [
        { kind: 'rule', id: 'tpl-state', field: 'state', operator: 'EQ', value: 'SP' },
        {
          kind: 'rule',
          id: 'tpl-size',
          field: 'company_size',
          operator: 'IN',
          value: ['Pequena', 'Média'],
        },
        {
          kind: 'rule',
          id: 'tpl-onboarding',
          field: 'onboarding_status',
          operator: 'EQ',
          value: 'COMPLETED',
        },
        { kind: 'rule', id: 'tpl-d30', field: 'activation_d30', operator: 'EQ', value: 'YES' },
        {
          kind: 'rule',
          id: 'tpl-product',
          field: 'product',
          operator: 'NOT_IN',
          value: ['Capital de Giro'],
        },
      ],
    },
  },
  {
    id: 'reengajamento-onboarding',
    name: 'Reengajamento — onboarding pendente',
    description: 'Empresas com conta aberta e onboarding em andamento.',
    group: {
      kind: 'group',
      id: 'root',
      operator: 'AND',
      rules: [
        {
          kind: 'rule',
          id: 'tpl-onb',
          field: 'onboarding_status',
          operator: 'EQ',
          value: 'IN_PROGRESS',
        },
      ],
    },
  },
];
