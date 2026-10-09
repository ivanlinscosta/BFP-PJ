import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListFilter, Plus, Send, Users } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import type { ActivationDestination, ActivationJob, AudienceRuleGroup } from '@bfp/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shell/page-header';
import { ErrorState, LoadingRows } from '@/components/states/states';
import {
  activateAudience,
  type AudienceField,
  getAudience,
  listActivations,
  listAudienceFields,
  previewAudience,
  saveAudience,
} from '@/features/audiences/api';
import { createRule, newId, OperatorToggle, RuleBuilder } from '@/features/audiences/rule-builder';
import { TEMPLATES } from '@/features/audiences/templates';
import { useFeatureFlags } from '@/features/admin/hooks';
import { AudienceDnaButton } from '@/features/customer-intelligence/audience-dna';
import { describeError } from '@/lib/errors';
import { formatCount, formatRelative, formatShare } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';

const JOB_STEPS: Record<ActivationJob['status'], string> = {
  QUEUED: 'Na fila',
  PROCESSING: 'Processando',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
};

function isComplete(group: AudienceRuleGroup): boolean {
  return group.rules.every((rule) =>
    rule.kind === 'group'
      ? isComplete(rule)
      : 'value' in rule &&
        (Array.isArray(rule.value) ? rule.value.some((value) => value !== '') : rule.value !== ''),
  );
}

export function AudienceBuilderPage() {
  const { audienceId } = useParams();
  const [searchParams] = useSearchParams();
  const fields = useQuery({
    queryKey: ['audiences', 'fields'],
    queryFn: listAudienceFields,
    staleTime: 5 * 60_000,
  });
  const existing = useQuery({
    queryKey: ['audience', audienceId],
    queryFn: () => getAudience(audienceId!),
    enabled: Boolean(audienceId),
  });
  const template = TEMPLATES.find((item) => item.id === searchParams.get('modelo'));

  if (fields.isLoading || (audienceId && existing.isLoading)) {
    return <LoadingRows rows={8} />;
  }

  if (fields.isError || (audienceId && existing.isError) || !fields.data) {
    return (
      <Card>
        <ErrorState
          error={fields.error ?? existing.error}
          onRetry={() => {
            void fields.refetch();
            void existing.refetch();
          }}
        />
      </Card>
    );
  }

  const stateField = fields.data.find((field) => field.id === 'state') ?? fields.data[0];
  const initialGroup: AudienceRuleGroup = existing.data?.filterGroups ??
    template?.group ?? {
      kind: 'group',
      id: 'root',
      operator: 'AND',
      rules: stateField ? [createRule(stateField)] : [],
    };

  return (
    <AudienceEditor
      audienceId={audienceId}
      fields={fields.data}
      initialGroup={initialGroup}
      initialName={existing.data?.name ?? template?.name ?? ''}
      key={audienceId ?? template?.id ?? 'new'}
    />
  );
}

function AudienceEditor({
  audienceId,
  fields: allFields,
  initialGroup,
  initialName,
}: {
  audienceId?: string;
  fields: AudienceField[];
  initialGroup: AudienceRuleGroup;
  initialName: string;
}) {
  const queryClient = useQueryClient();
  const flags = useFeatureFlags();
  const [name, setName] = useState(initialName);
  const [group, setGroup] = useState<AudienceRuleGroup>(initialGroup);
  const [savedId, setSavedId] = useState<string | undefined>(audienceId);
  const [job, setJob] = useState<ActivationJob | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const debouncedGroup = useDebounced(group, 400);
  const previewReady = debouncedGroup.rules.length > 0 && isComplete(debouncedGroup);
  const preview = useQuery({
    queryKey: ['audiences', 'preview', JSON.stringify(debouncedGroup)],
    queryFn: ({ signal }) => previewAudience(debouncedGroup, signal),
    enabled: previewReady,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const jobs = useQuery({
    queryKey: ['audience', savedId, 'activations', job?.id],
    queryFn: () => listActivations(savedId!),
    enabled: Boolean(savedId && job),
    refetchInterval: (query) => {
      const latest = query.state.data?.find((item) => item.id === job?.id);
      return latest?.status === 'COMPLETED' || latest?.status === 'FAILED' ? false : 1000;
    },
  });
  const currentJob = jobs.data?.find((item) => item.id === job?.id) ?? job;

  const save = useMutation({
    mutationFn: () =>
      saveAudience({ name: name.trim(), filters: [], filterGroups: group }, savedId),
    onSuccess: (audience) => {
      setSavedId(audience.id);
      setSavedNotice(true);
      void queryClient.invalidateQueries({ queryKey: ['audiences'] });
    },
  });
  const activate = useMutation({
    mutationFn: async (destination: ActivationDestination) => {
      const audience = await saveAudience(
        { name: name.trim(), filters: [], filterGroups: group },
        savedId,
      );
      setSavedId(audience.id);
      return activateAudience(audience.id, destination);
    },
    onSuccess: (created) => {
      setJob(created);
      void queryClient.invalidateQueries({ queryKey: ['audiences'] });
    },
  });

  const sizeDistribution = preview.data?.distributions.find(
    (distribution) => distribution.field === 'company_size',
  );
  const stateDistribution = preview.data?.distributions.find(
    (distribution) => distribution.field === 'state',
  );
  const topState = stateDistribution?.buckets[0];
  const maxSize = Math.max(1, ...(sizeDistribution?.buckets.map((bucket) => bucket.count) ?? [1]));
  const canSubmit = Boolean(name.trim()) && group.rules.length > 0 && isComplete(group);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) save.mutate();
  }

  return (
    <form className="px-2" onSubmit={handleSubmit}>
      <PageHeader
        breadcrumbs={[
          { label: 'Audiências', to: '/audiencias' },
          { label: audienceId ? 'Editar audiência' : 'Nova audiência' },
        ]}
        subtitle="Monte um público usando os mesmos dados disponíveis no Analytics Explorer."
        title={audienceId ? 'Editar audiência' : 'Criar audiência'}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="px-6 pt-6 pb-10">
          <Label htmlFor="audience-name">Nome da audiência</Label>
          <Input
            className="mt-2"
            id="audience-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Oportunidade Capital de Giro — SP"
            value={name}
          />
          <hr className="my-6 border-line" />
          <div className="flex items-center justify-between gap-4">
            <h2 className="m-0 text-xl font-semibold text-brand-navy">Condições da audiência</h2>
            <OperatorToggle
              onChange={(operator) => setGroup({ ...group, operator })}
              value={group.operator}
            />
          </div>
          <p className="mt-6 mb-5 text-[13px] text-ink-soft">
            {group.operator === 'AND'
              ? 'Todas as condições deste grupo devem ser atendidas.'
              : 'Pelo menos uma condição deste grupo deve ser atendida.'}
          </p>
          <RuleBuilder fields={allFields} group={group} onChange={setGroup} />
          <div className="mt-7 flex flex-wrap items-center gap-6">
            <Button
              className="h-10"
              disabled={allFields.length === 0}
              onClick={() =>
                setGroup({
                  ...group,
                  rules: [
                    ...group.rules,
                    createRule(
                      allFields.find((field) => field.id === 'company_size') ?? allFields[0]!,
                    ),
                  ],
                })
              }
              size="lg"
            >
              <Plus aria-hidden className="h-4 w-4" />
              Adicionar condição
            </Button>
            <Button
              disabled={allFields.length === 0}
              onClick={() =>
                setGroup({
                  ...group,
                  rules: [
                    ...group.rules,
                    {
                      kind: 'group',
                      id: newId('group'),
                      operator: group.operator === 'AND' ? 'OR' : 'AND',
                      rules: [createRule(allFields[0]!)],
                    },
                  ],
                })
              }
              variant="ghost"
            >
              <ListFilter aria-hidden className="h-[18px] w-[18px]" />
              Adicionar grupo E/OU
            </Button>
          </div>
          <p className="mt-8 text-xs text-ink-soft">
            As regras usam dados certificados. A prévia respeita as permissões e a população
            analisável.
          </p>
        </Card>

        <Card aria-live="polite" className="px-6 pt-8 pb-8">
          <h2 className="m-0 flex items-center gap-2 text-xl font-semibold text-brand-navy">
            <Users aria-hidden className="h-5 w-5" strokeWidth={1.75} />
            Prévia da audiência
          </h2>
          {!previewReady ? (
            <p className="mt-8 text-sm text-ink-soft">
              Complete as condições para calcular a prévia.
            </p>
          ) : preview.isLoading ? (
            <div className="mt-8 flex flex-col gap-3">
              <Skeleton className="h-12 w-40" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-2 w-full" />
            </div>
          ) : preview.isError ? (
            <ErrorState compact error={preview.error} />
          ) : preview.data ? (
            <div className={preview.isFetching ? 'opacity-70 transition-opacity' : undefined}>
              <p className="mt-9 text-[40px] leading-none font-bold text-brand-navy">
                {formatCount(preview.data.size)}
              </p>
              <p className="mt-4 text-base text-ink">empresas elegíveis</p>
              <p className="mt-2 text-[13px] text-ink-soft">
                {formatShare(preview.data.share)} da base analisável
              </p>
              <div aria-hidden className="mt-6 h-1 rounded bg-segment">
                <div
                  className="h-1 rounded bg-brand-orange"
                  style={{ width: `${Math.max(2, preview.data.share * 100)}%` }}
                />
              </div>
              <hr className="my-6 border-line" />
              <h3 className="m-0 text-[13px] font-semibold text-brand-navy">
                Distribuição por porte
              </h3>
              <ul className="m-0 mt-5 flex list-none flex-col gap-5 p-0">
                {(sizeDistribution?.buckets ?? []).slice(0, 4).map((bucket) => (
                  <li key={bucket.value}>
                    <div className="flex justify-between text-sm">
                      <span className="text-ink">{bucket.label}</span>
                      <span className="font-semibold text-brand-navy">
                        {formatCount(bucket.count)}
                      </span>
                    </div>
                    <div aria-hidden className="mt-2 h-1 rounded bg-segment">
                      <div
                        className="h-1 rounded bg-brand-navy"
                        style={{ width: `${(bucket.count / maxSize) * 66}%` }}
                      />
                    </div>
                  </li>
                ))}
                {topState ? (
                  <li className="flex justify-between text-sm">
                    <span className="text-ink">Estado {topState.label}</span>
                    <span className="font-semibold text-brand-navy">
                      {formatShare(topState.count / Math.max(1, preview.data.size)).replace(
                        ',0%',
                        '%',
                      )}
                    </span>
                  </li>
                ) : null}
              </ul>
              <hr className="my-6 border-line" />
              <p className="text-xs text-ink-soft">
                Dados atualizados {formatRelative(preview.data.freshness)}
              </p>
              <p className="mt-6 text-xs leading-relaxed text-ink-soft">
                Fontes: {preview.data.sources.join(', ').replace(/, ([^,]*)$/, ' e $1')}. Prévia
                agregada, sem dados pessoais expostos.
              </p>
              <div className="mt-6">
                <AudienceDnaButton group={debouncedGroup} />
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      {save.isError || activate.isError ? (
        <Notice className="mt-4" tone="error" title="Não foi possível concluir">
          {describeError(save.error ?? activate.error).description}
        </Notice>
      ) : null}
      {savedNotice && save.isSuccess && !currentJob ? (
        <Notice className="mt-4" tone="success">
          Audiência salva.
        </Notice>
      ) : null}
      {currentJob ? (
        <Notice
          className="mt-4"
          tone={currentJob.status === 'COMPLETED' ? 'success' : 'info'}
          title={`Envio para ${currentJob.destination === 'CRM' ? 'CRM' : 'Mídia'} · ${JOB_STEPS[currentJob.status]}`}
        >
          <ol aria-label="Etapas da ativação" className="mt-1 flex list-none gap-4 p-0 text-xs">
            {(['QUEUED', 'PROCESSING', 'COMPLETED'] as const).map((step) => (
              <li
                className={step === currentJob.status ? 'font-semibold' : 'opacity-70'}
                key={step}
              >
                {JOB_STEPS[step]}
              </li>
            ))}
          </ol>
          <p className="mt-1 text-xs">
            {formatCount(currentJob.records)} empresas · simulação, nenhum dado foi enviado.
          </p>
        </Notice>
      ) : null}

      <Card className="mt-7 flex flex-wrap items-center gap-4 px-4 py-4">
        <Badge className="h-[22px] text-[11px]" tone="cream">
          <span className="text-ink">Simulação MVP</span>
        </Badge>
        <p className="text-[13px] text-ink-soft">
          Envios demonstrativos. Nenhum dado será enviado.
        </p>
        <div className="ml-auto flex flex-wrap gap-3">
          <Button
            className="h-10 px-4 text-[15px]"
            disabled={!flags.audienceActivation || !canSubmit || activate.isPending}
            onClick={() => activate.mutate('CRM')}
          >
            <Send aria-hidden className="h-4 w-4" />
            Enviar para CRM
          </Button>
          <Button
            className="h-10 px-4 text-[15px]"
            disabled={!flags.audienceActivation || !canSubmit || activate.isPending}
            onClick={() => activate.mutate('MEDIA')}
          >
            <Send aria-hidden className="h-4 w-4" />
            Enviar para Mídia
          </Button>
          <Button
            className="h-10 px-4 text-[15px]"
            disabled={!canSubmit || save.isPending}
            type="submit"
            variant="primary"
          >
            {save.isPending ? 'Salvando…' : 'Salvar audiência'}
          </Button>
        </div>
      </Card>
    </form>
  );
}
