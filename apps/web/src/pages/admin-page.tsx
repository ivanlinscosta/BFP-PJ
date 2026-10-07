import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { Badge, CertificationBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shell/page-header';
import { ErrorState, LoadingRows } from '@/components/states/states';
import { getAdminOverview, updateFeatureFlags, type FeatureFlags } from '@/features/admin/api';
import { SOURCE_LABELS, syncAtlan, useIntegrationStatus } from '@/features/mesh/api';
import { Button } from '@/components/ui/button';
import { describeError } from '@/lib/errors';
import { formatMinutes } from '@/lib/format';
import type { CertificationStatus } from '@bfp/domain';

type Section =
  | 'integrations'
  | 'users'
  | 'roles'
  | 'domains'
  | 'metrics'
  | 'dimensions'
  | 'products'
  | 'semantic'
  | 'flags';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  analyst: 'Analista',
  business: 'Negócio',
};
const FLAG_LABELS: Record<keyof FeatureFlags, { title: string; description: string }> = {
  aiCopilot: {
    title: 'Inteligência PJ',
    description: 'Habilita perguntas em linguagem natural sobre o AnalysisSpec.',
  },
  audienceActivation: {
    title: 'Ativação de audiências',
    description: 'Permite enviar audiências (simulado) para CRM e Mídia.',
  },
  csvExport: {
    title: 'Exportação CSV',
    description: 'Permite exportar resultados agregados e autorizados.',
  },
  dashboardSharing: {
    title: 'Compartilhamento de dashboards',
    description: 'Permite compartilhar com o time ou somente leitura.',
  },
};

function SimpleTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <Table>
      <THead>
        <TR>
          {headers.map((header) => (
            <TH key={header}>{header}</TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.map((row, index) => (
          <TR key={index}>
            {row.map((cell, cellIndex) => (
              <TD key={cellIndex}>{cell}</TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

/** Administration (admin only): users, roles, domains, semantic surface and feature flags. */
export function AdminPage() {
  const queryClient = useQueryClient();
  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: getAdminOverview,
    retry: false,
  });
  const [section, setSection] = useState<Section>('integrations');
  const integrations = useIntegrationStatus();
  const atlanSync = useMutation({ mutationFn: syncAtlan });
  const flags = useMutation({
    mutationFn: updateFeatureFlags,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  if (overview.isLoading) return <LoadingRows rows={8} />;
  if (overview.isError || !overview.data) {
    return (
      <div>
        <PageHeader
          subtitle="Usuários, papéis, domínios e configuração da camada semântica."
          title="Administração"
        />
        <Card>
          <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
        </Card>
      </div>
    );
  }

  const data = overview.data;
  return (
    <div>
      <PageHeader
        subtitle="Usuários, papéis, domínios e configuração da camada semântica."
        title="Administração"
      />
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        {(
          [
            [
              'Autenticação',
              data.runtime.authMode === 'cognito' ? 'Amazon Cognito' : 'Local (dev)',
            ],
            ['Persistência', data.runtime.persistence],
            [
              'Motor analítico',
              { memory: 'Local (memória)', dynamodb: 'DynamoDB', athena: 'Amazon Athena' }[
                data.runtime.analyticsEngine
              ] ?? data.runtime.analyticsEngine,
            ],
            [
              'Inteligência PJ',
              {
                local: 'Determinístico local',
                bedrock: 'Amazon Bedrock',
                anthropic: 'Anthropic API',
              }[data.runtime.aiProvider] ?? data.runtime.aiProvider,
            ],
          ] as const
        ).map(([label, value]) => (
          <Card className="px-4 py-3" key={label}>
            <p className="text-xs text-ink-soft">{label}</p>
            <p className="mt-1 text-sm font-semibold text-brand-navy">{value}</p>
          </Card>
        ))}
      </div>
      <Tabs
        className="gap-5 [&>button]:pb-3"
        idPrefix="admin"
        items={[
          { value: 'integrations', label: 'Integrações' },
          { value: 'users', label: 'Usuários' },
          { value: 'roles', label: 'Papéis' },
          { value: 'domains', label: 'Domínios' },
          { value: 'metrics', label: 'Métricas' },
          { value: 'dimensions', label: 'Dimensões' },
          { value: 'products', label: 'Data Products' },
          { value: 'semantic', label: 'Semântica' },
          { value: 'flags', label: 'Feature flags' },
        ]}
        label="Seções da administração"
        onChange={setSection}
        value={section}
      />
      <Card
        className="mt-6"
        aria-labelledby={`admin-tab-${section}`}
        id={`admin-panel-${section}`}
        role="tabpanel"
      >
        {section === 'integrations' ? (
          <div className="flex flex-col gap-4 p-5">
            {integrations.data ? (
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    [
                      'Data mesh AWS',
                      `${SOURCE_LABELS.mesh[integrations.data.mesh.source]} · ${integrations.data.mesh.available}/${integrations.data.mesh.datasets} bases`,
                    ],
                    ['Amazon DataZone', SOURCE_LABELS.datazone[integrations.data.datazone]],
                    [
                      'Atlan (catálogo oficial)',
                      `${SOURCE_LABELS.atlan[integrations.data.atlan]} · ${integrations.data.atlanLinkedAssets} ativos vinculados`,
                    ],
                    [
                      'FullStory (jornada digital)',
                      SOURCE_LABELS.fullstory[integrations.data.fullstory],
                    ],
                  ] as const
                ).map(([label, value]) => (
                  <div className="rounded-[var(--radius-control)] bg-muted px-4 py-3" key={label}>
                    <dt className="text-xs text-ink-soft">{label}</dt>
                    <dd className="m-0 mt-1 text-sm font-semibold text-brand-navy">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <LoadingRows rows={2} />
            )}
            <p className="text-[13px] text-ink-soft">
              Prefixo dos bancos do mesh: <code>{integrations.data?.mesh.databasePrefix}</code>.
              Credenciais do Atlan e do FullStory ficam no AWS Secrets Manager (nunca no navegador).
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={atlanSync.isPending}
                onClick={() => atlanSync.mutate()}
                variant="primary"
              >
                Publicar métricas governadas no Atlan
              </Button>
              {atlanSync.isSuccess ? (
                <span className="text-sm text-success">
                  {atlanSync.data.published} termos publicados no glossário.
                </span>
              ) : null}
              {atlanSync.isError ? (
                <span className="text-sm text-danger">
                  {describeError(atlanSync.error).description === 'Tente novamente em instantes.'
                    ? 'Configure a conexão com o Atlan no Secrets Manager.'
                    : describeError(atlanSync.error).description}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        {section === 'users' ? (
          <SimpleTable
            headers={['Nome', 'E-mail', 'Time', 'Papel', 'Status']}
            rows={data.users.map((user) => [
              <span className="font-semibold text-brand-navy" key="n">
                {user.name}
              </span>,
              user.email,
              user.team,
              ROLE_LABELS[user.role] ?? user.role,
              <Badge key="s" tone="success">
                {user.status === 'ACTIVE' || user.status === 'CONFIRMED' ? 'Ativo' : user.status}
              </Badge>,
            ])}
          />
        ) : null}
        {section === 'roles' ? (
          <SimpleTable
            headers={['Papel', 'Ações permitidas', 'Domínios']}
            rows={data.roles.map((role) => [
              <span className="font-semibold text-brand-navy" key="r">
                {ROLE_LABELS[role.role] ?? role.role}
              </span>,
              role.actions.join(', '),
              role.domains.join(', ').replace('*', 'Todos'),
            ])}
          />
        ) : null}
        {section === 'domains' ? (
          <SimpleTable
            headers={['Domínio', 'Métricas', 'Dimensões', 'Produtos de dados']}
            rows={data.domains.map((domain) => [
              domain.id,
              domain.metrics,
              domain.dimensions,
              domain.dataProducts,
            ])}
          />
        ) : null}
        {section === 'metrics' ? (
          <SimpleTable
            headers={['Métrica', 'Id', 'Domínio', 'Owner', 'Versão', 'Status']}
            rows={data.metrics.map((metric) => [
              <span className="font-semibold text-brand-navy" key="m">
                {metric.name}
              </span>,
              <code className="text-xs" key="i">
                {metric.id}
              </code>,
              metric.domain,
              metric.owner,
              metric.version,
              <CertificationBadge
                key="c"
                status={metric.certificationStatus as CertificationStatus}
              />,
            ])}
          />
        ) : null}
        {section === 'dimensions' ? (
          <SimpleTable
            headers={['Dimensão', 'Id', 'Domínio', 'Tipo', 'Sensibilidade']}
            rows={data.dimensions.map((dimension) => [
              dimension.name,
              <code className="text-xs" key="i">
                {dimension.id}
              </code>,
              dimension.domain,
              dimension.type,
              dimension.sensitivity,
            ])}
          />
        ) : null}
        {section === 'products' ? (
          <SimpleTable
            headers={['Produto de dados', 'Owner', 'Tabela Gold (Glue)', 'SLO']}
            rows={data.dataProducts.map((product) => [
              product.name,
              product.owner,
              <code className="text-xs" key="g">
                {product.goldTable}
              </code>,
              `< ${formatMinutes(product.sloMinutes)}`,
            ])}
          />
        ) : null}
        {section === 'semantic' ? (
          <dl className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ['Versão do catálogo', data.semantic.version],
                ['Métricas', data.semantic.metricCount],
                ['Certificadas', data.semantic.certifiedMetrics],
                ['Dimensões', data.semantic.dimensionCount],
                ['Termos de glossário', data.semantic.glossaryCount],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-ink-soft">{label}</dt>
                <dd className="m-0 mt-1 text-2xl font-bold text-brand-navy">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {section === 'flags' ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {(Object.keys(FLAG_LABELS) as Array<keyof FeatureFlags>).map((key) => (
              <li
                className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 last:border-b-0"
                key={key}
              >
                <div>
                  <p className="text-sm font-semibold text-brand-navy">{FLAG_LABELS[key].title}</p>
                  <p className="text-[13px] text-ink-soft">{FLAG_LABELS[key].description}</p>
                </div>
                <Switch
                  checked={data.featureFlags[key]}
                  disabled={flags.isPending}
                  label={FLAG_LABELS[key].title}
                  onCheckedChange={(checked) =>
                    flags.mutate({ ...data.featureFlags, [key]: checked })
                  }
                />
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
