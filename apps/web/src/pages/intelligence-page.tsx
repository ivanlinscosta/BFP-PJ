import { useMutation } from '@tanstack/react-query';
import { ArrowUp, Download, ExternalLink, LayoutGrid, Save, Share2, Sparkles } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { describeAnalysisSpec, describeFilter } from '@bfp/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ActionChip } from '@/components/ui/chip';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/shell/page-header';
import { useSpecLabels } from '@/features/catalog/hooks';
import { SaveAnalysisDialog, ShareDialog } from '@/features/explorer/components/action-dialogs';
import { useAnalysisResult } from '@/features/explorer/hooks';
import { useAnalysisStore } from '@/features/explorer/store';
import { askIntelligence, type IntelligenceReply } from '@/features/intelligence/api';
import { downloadCsv } from '@/features/viz/csv';
import { capitalize } from '@/lib/format';
import { describeError } from '@/lib/errors';
import { getCurrentUser } from '@/services/auth';
import { useFeatureFlags } from '@/features/admin/hooks';

interface ChatEntry {
  id: number;
  role: 'user' | 'assistant' | 'notice' | 'error';
  text: string;
  reply?: IntelligenceReply;
}

const STORAGE_KEY = 'bfp-intelligence-chat';
const STARTERS = [
  'Qual canal combina melhor conversão com menor CAC?',
  'Compare CAC e ativação D30 por canal, porte e estado nos últimos 120 dias.',
  'O que é ativação D30?',
];

function loadChat(): { conversationId?: string; entries: ChatEntry[] } {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw
      ? (JSON.parse(raw) as { conversationId?: string; entries: ChatEntry[] })
      : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

/** Inteligência PJ: a conversational interface over the same AnalysisSpec as the playground. */
export function IntelligencePage() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const labels = useSpecLabels();
  const flags = useFeatureFlags();
  const spec = useAnalysisStore((state) => state.spec);
  const saved = useAnalysisStore((state) => state.saved);
  const applyOperations = useAnalysisStore((state) => state.applyOperations);
  const markSaved = useAnalysisStore((state) => state.markSaved);
  const [chat, setChat] = useState(loadChat);
  const [prompt, setPrompt] = useState('');
  const [dialog, setDialog] = useState<'save' | 'share' | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sequence = useRef(chat.entries.length);
  const result = useAnalysisResult(spec);
  const description = describeAnalysisSpec(spec, labels);
  const contextChips = [
    ...description.metrics,
    ...spec.dimensions.map((dimension) =>
      dimension.granularity === 'month' ? 'Mês' : labels.dimension(dimension.id),
    ),
    ...description.filters,
    capitalize(description.period),
  ];

  useEffect(() => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chat));
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chat]);

  const mutation = useMutation({
    mutationFn: (text: string) =>
      askIntelligence({ prompt: text, analysisSpec: spec, conversationId: chat.conversationId }),
    onSuccess: (reply) => {
      const entries: ChatEntry[] = [];
      if (reply.action === 'UPDATE_ANALYSIS' && reply.operations.length > 0) {
        applyOperations(reply.operations, reply.message);
        if (reply.answer)
          entries.push({ id: ++sequence.current, role: 'assistant', text: reply.answer, reply });
        entries.push({ id: ++sequence.current, role: 'notice', text: reply.message, reply });
      } else {
        entries.push({
          id: ++sequence.current,
          role: 'assistant',
          text: reply.answer || reply.message,
          reply,
        });
      }
      setChat((current) => ({
        conversationId: reply.conversationId,
        entries: [...current.entries, ...entries],
      }));
    },
    onError: (error) => {
      setChat((current) => ({
        ...current,
        entries: [
          ...current.entries,
          { id: ++sequence.current, role: 'error', text: describeError(error).description },
        ],
      }));
    },
  });

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || mutation.isPending) return;
    setChat((current) => ({
      ...current,
      entries: [...current.entries, { id: ++sequence.current, role: 'user', text: trimmed }],
    }));
    setPrompt('');
    mutation.mutate(trimmed);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    send(prompt);
  }

  const lastReplyId = [...chat.entries].reverse().find((entry) => entry.reply)?.id;

  return (
    <div>
      <PageHeader
        subtitle="Consulte a análise, revise o contexto e continue a conversa em uma superfície dedicada."
        title="Inteligência PJ"
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Card className="flex min-h-[calc(100vh-210px)] flex-col">
          <div className="border-b border-line px-4 pt-4 pb-4">
            <div className="flex items-start gap-2">
              <Sparkles aria-hidden className="mt-1 h-5 w-5 text-brand-orange" />
              <div>
                <h2 className="m-0 text-lg font-semibold text-brand-navy">Inteligência PJ</h2>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Consulte a análise, revise o contexto e continue a conversa em uma superfície
                  dedicada.
                </p>
              </div>
            </div>
            {spec.metrics.length > 0 ? (
              <ul
                aria-label="Contexto da análise"
                className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0"
              >
                {contextChips.map((chip) => (
                  <li
                    className="rounded bg-tint px-2.5 py-1.5 text-[13px] text-brand-navy"
                    key={chip}
                  >
                    {chip}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[13px] text-ink-soft">
                Sem análise ativa. Pergunte livremente — a IA monta a análise para você.
              </p>
            )}
          </div>

          <div
            aria-live="polite"
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
            ref={listRef}
          >
            {chat.entries.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink-soft">Sugestões para começar:</p>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((starter) => (
                    <ActionChip key={starter} onClick={() => send(starter)}>
                      {starter}
                    </ActionChip>
                  ))}
                </div>
              </div>
            ) : null}
            {chat.entries.map((entry) => {
              if (entry.role === 'notice') {
                return (
                  <Notice key={entry.id} tone="success">
                    {entry.text}
                  </Notice>
                );
              }
              if (entry.role === 'error') {
                return (
                  <Notice
                    key={entry.id}
                    tone="error"
                    title="A Inteligência PJ não conseguiu responder"
                  >
                    {entry.text}
                  </Notice>
                );
              }
              const isUser = entry.role === 'user';
              return (
                <div key={entry.id}>
                  <div
                    className={
                      isUser
                        ? 'rounded-[var(--radius-control)] bg-muted px-3 py-3'
                        : 'rounded-[var(--radius-control)] bg-tint px-3 py-3'
                    }
                  >
                    <p className="text-[11px] font-semibold text-brand-navy">
                      {isUser ? (user?.name ?? 'Você') : 'Inteligência PJ'}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink">{entry.text}</p>
                  </div>
                  {entry.reply?.basis && entry.role === 'assistant' ? (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold text-brand-navy">Base da resposta</p>
                      <p className="mt-1 text-[11px] text-ink-soft">
                        {entry.reply.basis.items.join(' / ')}
                      </p>
                    </div>
                  ) : null}
                  {entry.id === lastReplyId && entry.reply && entry.reply.suggestions.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.reply.suggestions.map((suggestion) => (
                        <ActionChip key={suggestion} onClick={() => send(suggestion)}>
                          {suggestion}
                        </ActionChip>
                      ))}
                      {entry.reply.action === 'ANSWER_QUESTION' && entry.reply.analysisSpec ? (
                        <ActionChip
                          onClick={() => {
                            useAnalysisStore.getState().loadAnalysis(entry.reply!.analysisSpec!);
                            navigate('/explorar');
                          }}
                        >
                          Abrir resposta no playground
                        </ActionChip>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {mutation.isPending ? (
              <p className="text-[13px] text-ink-soft" role="status">
                Consultando dados governados…
              </p>
            ) : null}
          </div>

          {!flags.aiCopilot ? (
            <Notice className="mx-4 mb-2" tone="warning">
              A Inteligência PJ foi desativada pela administração. Continue a análise no playground.
            </Notice>
          ) : null}
          <form className="border-t border-line px-4 pt-4 pb-4" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="intelligence-prompt">
              Pergunte aos seus dados
            </label>
            <div className="flex h-12 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-card pr-2 pl-3 focus-within:border-brand-navy">
              <input
                className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft"
                id="intelligence-prompt"
                maxLength={4000}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Pergunte aos seus dados..."
                value={prompt}
              />
              <button
                aria-label="Enviar pergunta"
                className="flex h-7 w-7 items-center justify-center rounded bg-brand-orange text-white disabled:opacity-50"
                disabled={!flags.aiCopilot || !prompt.trim() || mutation.isPending}
                type="submit"
              >
                <ArrowUp aria-hidden className="h-4 w-4" />
              </button>
            </div>
          </form>
        </Card>

        <aside
          aria-label="Contexto analítico"
          className="rounded-[var(--radius-card)] bg-card px-4 pt-4 pb-6"
        >
          <h2 className="m-0 text-xl font-semibold text-brand-navy">Contexto analítico</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Filtros, período e ações para continuar a análise no playground.
          </p>
          <section className="mt-4 rounded-[var(--radius-card)] bg-muted px-4 py-4 text-sm">
            <p className="text-[11px] font-semibold text-brand-navy">Filtros ativos</p>
            <dl className="mt-3 flex flex-col gap-2">
              {spec.filters.map((filter) => {
                const text = describeFilter(filter, labels);
                const [field, ...rest] = text.split(/ = | em /);
                return (
                  <div className="flex justify-between gap-3" key={text}>
                    <dt className="text-ink-soft">{field}</dt>
                    <dd className="m-0 text-right font-semibold text-brand-navy">
                      {rest.join(', ') || text}
                    </dd>
                  </div>
                );
              })}
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Período</dt>
                <dd className="m-0 font-semibold text-brand-navy">
                  {capitalize(description.period)}
                </dd>
              </div>
              {spec.dimensions.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <dt className="text-ink-soft">Quebras</dt>
                  <dd className="m-0 font-semibold text-brand-navy">
                    {description.dimensions.join(', ')}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={spec.metrics.length === 0}
              onClick={() => setDialog('save')}
              size="sm"
              variant="primary"
            >
              <Save aria-hidden className="h-4 w-4" />
              Salvar análise
            </Button>
            <Button
              disabled={spec.metrics.length === 0}
              onClick={() => setDialog('share')}
              size="sm"
            >
              <Share2 aria-hidden className="h-4 w-4" />
              Compartilhar
            </Button>
            <Button onClick={() => navigate('/explorar')} size="sm">
              <LayoutGrid aria-hidden className="h-4 w-4" />
              Abrir no playground
            </Button>
            <Button
              disabled={!result.data}
              onClick={() => result.data && downloadCsv(result.data, description.title)}
              size="sm"
            >
              <Download aria-hidden className="h-4 w-4" />
              Exportar
            </Button>
          </div>
          <section className="mt-4 rounded-[var(--radius-card)] bg-tint px-3 py-3">
            <p className="text-[11px] font-semibold text-brand-navy">Contexto preservado</p>
            <p className="mt-1.5 text-xs text-ink-soft">
              {spec.metrics.length > 0
                ? `A conversa continua a partir da análise de ${description.title.toLowerCase()}.`
                : 'Ao perguntar, a análise criada aqui fica disponível no playground.'}
            </p>
          </section>
          {chat.entries.length > 0 ? (
            <button
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-navy hover:underline"
              onClick={() => setChat({ entries: [] })}
              type="button"
            >
              <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              Nova conversa
            </button>
          ) : null}
        </aside>
      </div>

      {dialog === 'save' ? (
        <SaveAnalysisDialog
          defaultName={description.title}
          existing={saved}
          onClose={() => setDialog(null)}
          onSaved={(analysis) => markSaved({ id: analysis.id, name: analysis.name })}
          open
          spec={spec}
        />
      ) : null}
      {dialog === 'share' ? (
        <ShareDialog onClose={() => setDialog(null)} open saved={saved} spec={spec} />
      ) : null}
    </div>
  );
}
