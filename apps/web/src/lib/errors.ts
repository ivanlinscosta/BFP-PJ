import { ApiClientError } from '@/services/apiClient';

export type ErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'semantic'
  | 'invalid'
  | 'timeout'
  | 'ai_unavailable'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export interface HumanError {
  kind: ErrorKind;
  title: string;
  description: string;
  issues: string[];
}

function readIssues(details: unknown): string[] {
  if (!details || typeof details !== 'object' || !('issues' in details)) {
    return [];
  }

  const issues = (details as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) {
    return [];
  }

  return issues
    .map((issue) =>
      issue && typeof issue === 'object' && 'message' in issue
        ? String((issue as { message: unknown }).message)
        : '',
    )
    .filter(Boolean);
}

/** Maps any error to human pt-BR copy. Raw envelopes are never shown to users. */
export function describeError(error: unknown): HumanError {
  if (error instanceof ApiClientError) {
    const issues = readIssues(error.details);
    switch (true) {
      case error.status === 401:
        return {
          kind: 'unauthorized',
          title: 'Sua sessão expirou',
          description: 'Entre novamente para continuar.',
          issues,
        };
      case error.status === 403:
        return {
          kind: 'forbidden',
          title: 'Acesso restrito ao seu perfil',
          description:
            'Seu perfil não tem permissão para estes dados. Fale com o owner do domínio se precisar de acesso.',
          issues,
        };
      case error.status === 404:
        return {
          kind: 'not_found',
          title: 'Não encontramos o que você procurava',
          description: 'O item pode ter sido removido ou não estar compartilhado com você.',
          issues,
        };
      case error.code === 'invalid_analysis_spec' || error.code === 'semantic_validation_error':
        return {
          kind: 'semantic',
          title: 'Essa combinação não é compatível',
          description:
            'Algumas métricas, dimensões ou filtros não podem ser combinados. Ajuste a análise e tente de novo.',
          issues,
        };
      case error.status === 422 || error.status === 400:
        return {
          kind: 'invalid',
          title: 'Revise os dados informados',
          description: issues[0] ?? 'Algumas informações estão incompletas ou inválidas.',
          issues,
        };
      case error.status === 429:
        return {
          kind: 'rate_limited',
          title: 'Muitas solicitações em sequência',
          description: 'Aguarde alguns segundos e tente novamente.',
          issues,
        };
      case error.status === 504:
        return {
          kind: 'timeout',
          title: 'A consulta demorou mais que o esperado',
          description: 'Reduza o período ou o número de dimensões e tente novamente.',
          issues,
        };
      case error.code === 'ai_unavailable' || error.status === 503:
        return {
          kind: 'ai_unavailable',
          title: 'A Inteligência PJ está indisponível',
          description: 'Você pode continuar a análise normalmente no playground.',
          issues,
        };
      default:
        return {
          kind: 'unknown',
          title: 'Algo saiu do esperado',
          description: 'Tente novamente em instantes.',
          issues,
        };
    }
  }

  if (error instanceof TypeError) {
    return {
      kind: 'network',
      title: 'Sem conexão com o servidor',
      description: 'Verifique sua conexão e tente novamente.',
      issues: [],
    };
  }

  return {
    kind: 'unknown',
    title: 'Algo saiu do esperado',
    description: 'Tente novamente em instantes.',
    issues: [],
  };
}
