import { PRODUCT_CATALOG } from './config';
import { daysBetween } from './features';
import type {
  ActionDefinition,
  CustomerFeatureSet,
  CustomerRawData,
  EligibilityCheck,
  EligibilityResult,
  EligibilityRule,
} from './types';

const COOLDOWN_STATUSES = new Set([
  'ACTIVATED',
  'ACCEPTED',
  'DISMISSED',
  'NO_RESPONSE',
  'CONVERTED',
]);

/**
 * Eligibility engine: runs every rule of an action before any scoring. A failed rule removes
 * the action from the ranking (it stays visible as "considered" with the reason).
 * Rules use business data only (status, products, consent, journey, service history).
 */
export function checkEligibility(
  action: ActionDefinition,
  features: CustomerFeatureSet,
  raw: CustomerRawData,
): EligibilityResult {
  const checks = action.eligibilityRules.map((rule) => evaluate(rule, action, features, raw));
  return { eligible: checks.every((check) => check.passed), checks };
}

function evaluate(
  rule: EligibilityRule,
  action: ActionDefinition,
  features: CustomerFeatureSet,
  raw: CustomerRawData,
): EligibilityCheck {
  const pass = (reason: string): EligibilityCheck => ({ rule: rule.id, passed: true, reason });
  const fail = (reason: string): EligibilityCheck => ({ rule: rule.id, passed: false, reason });

  switch (rule.id) {
    case 'productAlreadyOwned': {
      const product = rule.product;
      if (!product) return pass('Sem produto associado.');
      return features.owned_products.includes(product)
        ? fail(`${PRODUCT_CATALOG[product].name} já contratado.`)
        : pass(`${PRODUCT_CATALOG[product].name} ainda não contratado.`);
    }
    case 'customerStatus':
      return raw.identity.status === 'INACTIVE' || raw.identity.status === 'CHURNED'
        ? fail('Cliente inativo ou encerrado.')
        : pass('Cliente ativo.');
    case 'consent':
      return features.commercial_contact_allowed
        ? pass('Consentimento para contato comercial.')
        : fail('Sem consentimento para contato comercial.');
    case 'contactability':
      return action.supportedChannels.length > 0 && raw.identity.status !== 'CHURNED'
        ? pass('Canal de contato disponível.')
        : fail('Nenhum canal de contato disponível.');
    case 'cooldown': {
      const days = action.cooldownDays ?? 0;
      const recent = raw.outcomes.find(
        (outcome) =>
          outcome.actionId === action.id &&
          COOLDOWN_STATUSES.has(outcome.status) &&
          daysBetween(outcome.timestamp, features.as_of) < days,
      );
      return recent
        ? fail(
            `Ação registrada há ${daysBetween(recent.timestamp, features.as_of)} dias (intervalo mínimo de ${days}).`,
          )
        : pass('Sem abordagem recente desta ação.');
    }
    case 'recentComplaint':
      return features.critical_complaints_30d > 0
        ? fail('Reclamação crítica em aberto: ofertas comerciais suspensas.')
        : pass('Sem reclamação crítica em aberto.');
    case 'journeyState':
      if (action.id === 'COMPLETE_ONBOARDING') {
        return features.onboarding_completed || !raw.identity.accountOpenedAt
          ? fail('Onboarding já concluído.')
          : pass('Onboarding ainda não concluído.');
      }
      return features.onboarding_completed
        ? pass('Onboarding concluído.')
        : fail('Onboarding incompleto: priorizar a ativação da conta.');
    case 'actionEnabled':
      return action.active ? pass('Ação habilitada.') : fail('Ação desabilitada.');
    case 'commercialPolicy':
      if (raw.identity.companySize === 'MEI')
        return fail('Política comercial: produto não ofertado a MEI.');
      return features.account_age_days >= 45
        ? pass('Conta com pelo menos 45 dias.')
        : fail('Política comercial: conta com menos de 45 dias.');
    case 'outstandingInteraction': {
      const open = raw.serviceCases.filter(
        (item) => !item.resolved && item.openedAt <= features.as_of,
      );
      return open.length > 0
        ? fail('Atendimento em aberto: resolver antes de ofertar.')
        : pass('Sem atendimento em aberto.');
    }
  }
}
