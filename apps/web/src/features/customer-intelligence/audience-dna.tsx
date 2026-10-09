import { useMutation } from '@tanstack/react-query';
import { Dna } from 'lucide-react';
import { useState } from 'react';
import type { AudienceRuleGroup } from '@bfp/domain';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState, LoadingRows } from '@/components/states/states';
import { analyzeAudienceIntelligence } from './api';
import { ClusterDnaView } from './cluster';

/** "Analisar DNA do público": aggregated DNA and NBA of the audience (ClusterIntelligenceService). */
export function AudienceDnaButton({ group }: { group: AudienceRuleGroup }) {
  const [open, setOpen] = useState(false);
  const analysis = useMutation({ mutationFn: () => analyzeAudienceIntelligence(group) });
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          analysis.mutate();
        }}
        size="sm"
      >
        <Dna aria-hidden className="h-4 w-4" />
        Analisar DNA do público
      </Button>
      {open ? (
        <Dialog
          description="Recomendações individuais agregadas: DNA médio, ação #1 mais frequente e sinais dominantes."
          onClose={() => setOpen(false)}
          open
          placement="right"
          title="DNA do público"
        >
          {analysis.isPending ? <LoadingRows rows={6} /> : null}
          {analysis.isError ? (
            <ErrorState error={analysis.error} onRetry={() => analysis.mutate()} />
          ) : null}
          {analysis.data ? (
            analysis.data.populationSize === 0 ? (
              <p className="text-sm text-ink-soft">
                Nenhuma empresa do público tem inteligência calculada.
              </p>
            ) : (
              <ClusterDnaView cluster={analysis.data} />
            )
          ) : null}
        </Dialog>
      ) : null}
    </>
  );
}
