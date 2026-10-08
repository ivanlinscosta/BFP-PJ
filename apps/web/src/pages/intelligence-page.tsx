import { useMutation } from '@tanstack/react-query';
import { FileDown, MessageSquarePlus, RotateCcw, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { AnalysisSpec } from '@bfp/domain';
import { describeAnalysisSpec } from '@bfp/shared';
import { ActionChip } from '@/components/ui/chip';
import { Notice } from '@/components/ui/notice';
import { useFeatureFlags } from '@/features/admin/hooks';
import { useSpecLabels } from '@/features/catalog/hooks';
import {
  AddToDashboardDialog,
  SaveAnalysisDialog,
} from '@/features/explorer/components/action-dialogs';
import { useAnalysisStore } from '@/features/explorer/store';
import { AnalysisCard } from '@/features/intelligence/analysis-card';
import {
  askIntelligence,
  type IntelligenceReply,
  type IntelligenceStudy,
} from '@/features/intelligence/api';
import { Composer } from '@/features/intelligence/composer';
import { ChatEmptyState } from '@/features/intelligence/empty-state';
import { StudyJobProgress } from '@/features/intelligence/study-job';
import { StudyView } from '@/features/intelligence/study-view';
import { ThinkingIndicator } from '@/features/intelligence/thinking-indicator';
import { describeError } from '@/lib/errors';
import { capitalize } from '@/lib/format';
import { exportElementToPdf, PDF_IGNORE_ATTRIBUTE } from '@/lib/pdf';
import { getCurrentUser } from '@/services/auth';

interface ChatEntry {
  id: number;
  role: 'user' | 'assistant' | 'error';
  text: string;
  reply?: IntelligenceReply;
  /** Prompt to resend when the entry is an error. */
  retry?: string;
}

interface ChatState {
  conversationId?: string;
  entries: ChatEntry[];
}

const STORAGE_KEY = 'bfp-intelligence-chat';
const ignore = { [PDF_IGNORE_ATTRIBUTE]: '' };

function loadChat(): ChatState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ChatState) : { entries: [] };
    // Entries from older versions of the page (e.g. "notice") are dropped.
    return {
      ...parsed,
      entries: parsed.entries.filter((entry) =>
        ['user', 'assistant', 'error'].includes(entry.role),
      ),
    };
  } catch {
    return { entries: [] };
  }
}

function persistChat(chat: ChatState) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chat));
  } catch {
    // Storage is a convenience: the conversation keeps working without it.
  }
}

/** Smooth scroll when supported (jsdom and older browsers only have scrollTop). */
function scrollListTo(list: HTMLElement, top: number) {
  if (typeof list.scrollTo === 'function') list.scrollTo({ top, behavior: 'smooth' });
  else list.scrollTop = top;
}

/** Analysis an answer is about (not for studies, which carry their own chapters). */
function answeredSpec(reply: IntelligenceReply | undefined) {
  if (!reply || reply.studyJob || reply.study) return undefined;
  return reply.analysisSpec && reply.analysisSpec.metrics.length > 0
    ? reply.analysisSpec
    : undefined;
}

/**
 * Inteligência PJ: a conversation where people ask for analyses of the data they can access.
 * Each answer brings the governed analysis behind it (chart/table, findings, source) and the
 * conversation keeps the current analysis as context for the next question.
 */
export function IntelligencePage() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const labels = useSpecLabels();
  const flags = useFeatureFlags();
  const spec = useAnalysisStore((state) => state.spec);
  const saved = useAnalysisStore((state) => state.saved);
  const applyOperations = useAnalysisStore((state) => state.applyOperations);
  const loadAnalysis = useAnalysisStore((state) => state.loadAnalysis);
  const markSaved = useAnalysisStore((state) => state.markSaved);
  const clearAnalysis = useAnalysisStore((state) => state.clearAnalysis);
  const [chat, setChat] = useState<ChatState>(loadChat);
  const [prompt, setPrompt] = useState('');
  const [saveTarget, setSaveTarget] = useState<{ spec: AnalysisSpec; name: string } | null>(null);
  const [dashboardTarget, setDashboardTarget] = useState<{
    spec: AnalysisSpec;
    name: string;
  } | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sequence = useRef(Math.max(0, ...chat.entries.map((entry) => entry.id)));
  const previousCount = useRef(chat.entries.length);
  const hasContext = spec.metrics.length > 0;
  const context = describeAnalysisSpec(spec, labels);

  useEffect(() => {
    persistChat(chat);
    const list = listRef.current;
    if (!list || chat.entries.length === previousCount.current) return;
    previousCount.current = chat.entries.length;
    const last = chat.entries.at(-1);
    // A new answer is read from its beginning; anything else keeps the latest message in view.
    const element = last ? document.getElementById(`chat-entry-${last.id}`) : null;
    if (last?.role === 'assistant' && element) {
      scrollListTo(list, element.offsetTop - 16);
    } else {
      scrollListTo(list, list.scrollHeight);
    }
  }, [chat]);

  const append = useCallback((entries: ChatEntry[], conversationId?: string) => {
    setChat((current) => ({
      conversationId: conversationId ?? current.conversationId,
      entries: [...current.entries, ...entries],
    }));
  }, []);

  const mutation = useMutation({
    mutationFn: (text: string) =>
      askIntelligence({
        prompt: text,
        analysisSpec: hasContext ? spec : undefined,
        conversationId: chat.conversationId,
      }),
    onSuccess: (reply) => {
      // The analysis of the answer becomes the context of the next question.
      if (reply.action === 'UPDATE_ANALYSIS' && reply.operations.length > 0) {
        applyOperations(reply.operations, reply.message);
      } else {
        const answered = answeredSpec(reply);
        if (answered) loadAnalysis(answered);
      }
      append(
        [
          {
            id: ++sequence.current,
            role: 'assistant',
            // An adjustment already shows its message as a tag above the answer.
            text: reply.answer || (reply.action === 'UPDATE_ANALYSIS' ? '' : reply.message),
            reply,
          },
        ],
        reply.conversationId,
      );
    },
    onError: (error, text) => {
      append([
        {
          id: ++sequence.current,
          role: 'error',
          text: describeError(error).description,
          retry: text,
        },
      ]);
    },
  });

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || mutation.isPending || !flags.aiCopilot) return;
    append([{ id: ++sequence.current, role: 'user', text: trimmed }]);
    setPrompt('');
    mutation.mutate(trimmed);
  }

  // A background study finished: keep it in the conversation; chapter 1 becomes the context.
  const handleStudyReady = useCallback(
    (entryId: number, study: IntelligenceStudy) => {
      setChat((current) => ({
        ...current,
        entries: current.entries.map((entry) =>
          entry.id === entryId && entry.reply && !entry.reply.study
            ? { ...entry, text: '', reply: { ...entry.reply, study } }
            : entry,
        ),
      }));
      const first = study.sections[0]?.spec;
      if (first) loadAnalysis(first);
      // Bring the finished study into view from its beginning.
      requestAnimationFrame(() => {
        const list = listRef.current;
        const element = document.getElementById(`chat-entry-${entryId}`);
        if (list && element) scrollListTo(list, element.offsetTop - 16);
      });
    },
    [loadAnalysis],
  );

  async function exportEntry(entry: ChatEntry) {
    const element = document.getElementById(`chat-entry-${entry.id}`);
    if (!element) return;
    const answered = answeredSpec(entry.reply);
    const description = answered ? describeAnalysisSpec(answered, labels) : undefined;
    setExporting(entry.id);
    setExportError(null);
    try {
      await exportElementToPdf(element, {
        title: entry.reply?.study?.title ?? description?.title ?? 'Resposta da Inteligência PJ',
        subtitle:
          entry.reply?.study?.period ?? (description ? capitalize(description.period) : undefined),
      });
    } catch {
      setExportError('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setExporting(null);
    }
  }

  function newConversation() {
    setChat({ entries: [] });
    clearAnalysis();
    setExportError(null);
  }

  const lastAssistantId = [...chat.entries]
    .reverse()
    .find((entry) => entry.role === 'assistant')?.id;

  return (
    <div className="mx-auto flex h-[calc(100dvh-170px)] w-full max-w-[960px] flex-col lg:h-[calc(100dvh-124px)]">
      <header className="flex items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange text-white">
            <Sparkles aria-hidden className="h-5 w-5" />
          </span>
          <div>
            <h1 className="m-0 text-xl leading-tight font-semibold text-brand-navy">
              Inteligência PJ
            </h1>
            <p className="m-0 text-xs text-ink-soft">Análises sobre os dados que você acessa</p>
          </div>
        </div>
        {chat.entries.length > 0 ? (
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-card px-3 text-[13px] font-semibold text-brand-navy hover:border-line-strong"
            onClick={newConversation}
            type="button"
          >
            <MessageSquarePlus aria-hidden className="h-4 w-4" />
            Nova conversa
          </button>
        ) : null}
      </header>

      <div
        aria-live="polite"
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[var(--radius-card)] border border-line bg-card px-4 py-5 sm:px-6"
        ref={listRef}
      >
        {chat.entries.length === 0 ? (
          <ChatEmptyState firstName={user?.name?.split(' ')[0]} onPick={send} />
        ) : (
          <ol className="m-0 flex list-none flex-col gap-6 p-0">
            {chat.entries.map((entry) => {
              if (entry.role === 'user') {
                return (
                  <li className="flex justify-end" id={`chat-entry-${entry.id}`} key={entry.id}>
                    <p className="m-0 max-w-[80%] rounded-2xl rounded-br-md bg-brand-navy px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-white">
                      {entry.text}
                    </p>
                  </li>
                );
              }

              if (entry.role === 'error') {
                return (
                  <li key={entry.id}>
                    <Notice tone="error" title="Não consegui responder agora">
                      <span className="block">{entry.text}</span>
                      {entry.retry ? (
                        <button
                          className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-navy hover:underline"
                          onClick={() => entry.retry && send(entry.retry)}
                          type="button"
                        >
                          <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                          Tentar de novo
                        </button>
                      ) : null}
                    </Notice>
                  </li>
                );
              }

              const reply = entry.reply;
              const answered = answeredSpec(reply);
              const isLast = entry.id === lastAssistantId;
              const studyPending = Boolean(reply?.studyJob && !reply.study);
              return (
                <li className="flex gap-3" id={`chat-entry-${entry.id}`} key={entry.id}>
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-orange text-white"
                  >
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 flex items-center gap-2 text-xs font-semibold text-brand-navy">
                      Inteligência PJ
                      {reply ? (
                        <span className="font-normal text-ink-faint">
                          {reply.provider === 'bedrock' ? 'Claude' : 'Motor analítico'}
                        </span>
                      ) : null}
                    </p>
                    {reply?.action === 'UPDATE_ANALYSIS' && reply.message ? (
                      <p className="m-0 mt-1.5 inline-flex rounded bg-tint px-2 py-0.5 text-xs text-brand-navy">
                        {reply.message}
                      </p>
                    ) : null}
                    {entry.text && !reply?.study ? (
                      <p className="m-0 mt-1.5 text-[15px] leading-relaxed whitespace-pre-wrap text-ink">
                        {entry.text}
                      </p>
                    ) : null}

                    {answered ? (
                      <AnalysisCard
                        exporting={exporting === entry.id}
                        onAddToDashboard={() =>
                          setDashboardTarget({
                            spec: answered,
                            name: describeAnalysisSpec(answered, labels).title,
                          })
                        }
                        onExportPdf={() => void exportEntry(entry)}
                        onOpen={() => {
                          loadAnalysis(answered);
                          navigate('/explorar');
                        }}
                        onSave={() =>
                          setSaveTarget({
                            spec: answered,
                            name: describeAnalysisSpec(answered, labels).title,
                          })
                        }
                        spec={answered}
                      />
                    ) : null}

                    {studyPending && reply?.studyJob ? (
                      <div className="mt-3">
                        <StudyJobProgress
                          jobId={reply.studyJob.id}
                          onReady={(study) => handleStudyReady(entry.id, study)}
                        />
                      </div>
                    ) : null}
                    {reply?.study ? (
                      <>
                        <p className="m-0 mt-1.5 text-[15px] leading-relaxed text-ink">
                          {reply.study.summary}
                        </p>
                        <StudyView
                          onOpen={(sectionSpec) => {
                            loadAnalysis(sectionSpec);
                            navigate('/explorar');
                          }}
                          onSave={(sectionSpec, name) => setSaveTarget({ spec: sectionSpec, name })}
                          study={reply.study}
                        />
                        <div {...ignore} className="mt-2 flex justify-end">
                          <button
                            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-xs font-semibold text-brand-navy hover:bg-muted disabled:opacity-50"
                            disabled={exporting !== null}
                            onClick={() => void exportEntry(entry)}
                            type="button"
                          >
                            <FileDown aria-hidden className="h-3.5 w-3.5" />
                            {exporting === entry.id ? 'Gerando PDF…' : 'Baixar estudo em PDF'}
                          </button>
                        </div>
                      </>
                    ) : null}

                    {isLast && !studyPending && reply && reply.suggestions.length > 0 ? (
                      <div {...ignore} className="mt-3 flex flex-wrap gap-2">
                        {reply.suggestions.map((suggestion) => (
                          <ActionChip key={suggestion} onClick={() => send(suggestion)}>
                            {suggestion}
                          </ActionChip>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {mutation.isPending ? (
              <li>
                <ThinkingIndicator
                  study={/estudo|raio.?x|completo/i.test(mutation.variables ?? '')}
                />
              </li>
            ) : null}
          </ol>
        )}
      </div>

      <div className="pt-3">
        {exportError ? (
          <Notice className="mb-2" tone="error">
            {exportError}
          </Notice>
        ) : null}
        {!flags.aiCopilot ? (
          <Notice className="mb-2" tone="warning">
            A Inteligência PJ foi desativada pela administração. Continue a análise no Explorar.
          </Notice>
        ) : null}
        {hasContext ? (
          <div className="mb-2 flex items-center gap-2 px-1 text-xs text-ink-soft">
            <span className="truncate">
              Contexto da conversa:{' '}
              <span className="font-semibold text-brand-navy">{context.title}</span> ·{' '}
              {[...context.filters, capitalize(context.period)].join(' · ')}
            </span>
            <button
              aria-label="Limpar contexto da conversa"
              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-brand-navy hover:bg-muted"
              onClick={clearAnalysis}
              type="button"
            >
              <X aria-hidden className="h-3 w-3" />
              Limpar
            </button>
          </div>
        ) : null}
        <Composer
          busy={mutation.isPending}
          disabled={!flags.aiCopilot}
          onChange={setPrompt}
          onSend={() => send(prompt)}
          value={prompt}
        />
      </div>

      {saveTarget ? (
        <SaveAnalysisDialog
          defaultName={saveTarget.name}
          existing={saveTarget.spec === spec ? saved : null}
          onClose={() => setSaveTarget(null)}
          onSaved={(analysis) => {
            if (saveTarget.spec === spec) markSaved({ id: analysis.id, name: analysis.name });
          }}
          open
          spec={saveTarget.spec}
        />
      ) : null}
      {dashboardTarget ? (
        <AddToDashboardDialog
          analysis={dashboardTarget.spec === spec ? saved : null}
          defaultName={dashboardTarget.name}
          onClose={() => setDashboardTarget(null)}
          onSaved={(analysis) => {
            if (dashboardTarget.spec === spec) markSaved({ id: analysis.id, name: analysis.name });
          }}
          open
          spec={dashboardTarget.spec}
        />
      ) : null}
    </div>
  );
}
