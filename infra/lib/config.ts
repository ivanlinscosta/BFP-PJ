/** Deployment environments with independent stacks: bfp-pj-dev, bfp-pj-homol, bfp-pj-prod. */
export const ENVIRONMENTS = ['dev', 'homol', 'prod'] as const;

export type EnvironmentName = (typeof ENVIRONMENTS)[number];

export interface EnvironmentConfig {
  name: EnvironmentName;
  prefix: string;
  /** Production keeps data on stack deletion; lower environments are disposable. */
  retainData: boolean;
  logRetentionDays: number;
  apiThrottle: { rateLimit: number; burstLimit: number };
  athenaBytesScannedCutoff: number;
}

export function resolveEnvironment(name: string): EnvironmentConfig {
  if (!ENVIRONMENTS.includes(name as EnvironmentName)) {
    throw new Error(`Ambiente inválido "${name}". Use: ${ENVIRONMENTS.join(', ')}.`);
  }

  const env = name as EnvironmentName;
  return {
    name: env,
    prefix: `bfp-pj-${env}`,
    retainData: env === 'prod',
    logRetentionDays: env === 'prod' ? 90 : 30,
    apiThrottle:
      env === 'prod' ? { rateLimit: 200, burstLimit: 400 } : { rateLimit: 50, burstLimit: 100 },
    athenaBytesScannedCutoff: 10 * 1024 ** 3,
  };
}
