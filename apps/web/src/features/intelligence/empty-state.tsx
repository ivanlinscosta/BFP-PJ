import {
  CreditCard,
  Gauge,
  Megaphone,
  Smartphone,
  Sparkles,
  ThumbsUp,
  type LucideIcon,
} from 'lucide-react';
import { useMeshDatasets } from '@/features/mesh/api';

/** Starting points of the conversation, one per business theme. */
export const SUGGESTIONS: Array<{ icon: LucideIcon; theme: string; prompt: string }> = [
  {
    icon: Sparkles,
    theme: 'Estudo completo',
    prompt:
      'Faça um estudo completo da jornada PJ: aquisição, ativação, uso do app, transações e NPS.',
  },
  {
    icon: Megaphone,
    theme: 'Aquisição',
    prompt: 'Qual canal combina melhor conversão com menor CAC?',
  },
  { icon: Gauge, theme: 'Ativação', prompt: 'Como está a ativação D30 por porte da empresa?' },
  { icon: Smartphone, theme: 'App Itaú Empresas', prompt: 'Qual a taxa de erro no app por tela?' },
  { icon: CreditCard, theme: 'Transações', prompt: 'Volume em Pix por segmento' },
  { icon: ThumbsUp, theme: 'Satisfação', prompt: 'Qual o NPS por momento da relação?' },
];

/** Welcome screen: what the assistant does, where to start and which data it can read. */
export function ChatEmptyState({
  firstName,
  onPick,
}: {
  firstName?: string;
  onPick(prompt: string): void;
}) {
  const mesh = useMeshDatasets();
  const bases = (mesh.data?.items ?? []).filter((item) => item.available);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col items-center px-2 pt-6 pb-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-orange text-white shadow-[0_6px_18px_rgba(255,98,0,0.35)]">
        <Sparkles aria-hidden className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-2xl font-semibold text-brand-navy">
        {firstName ? `Olá, ${firstName}.` : 'Olá.'} O que você quer analisar hoje?
      </h2>
      <p className="mt-2 max-w-[560px] text-sm text-ink-soft">
        Pergunte em linguagem natural. A Inteligência PJ consulta as bases que você acessa, responde
        com gráficos e números verificáveis e continua a análise com você.
      </p>

      <ul className="m-0 mt-6 grid w-full list-none grid-cols-1 gap-3 p-0 text-left sm:grid-cols-2 lg:grid-cols-3">
        {SUGGESTIONS.map(({ icon: Icon, theme, prompt }) => (
          <li key={prompt}>
            <button
              className="group flex h-full w-full flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-card px-4 py-3.5 text-left transition-colors hover:border-brand-orange hover:bg-cream"
              onClick={() => onPick(prompt)}
              type="button"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-brand-orange">
                <Icon aria-hidden className="h-4 w-4" />
                {theme}
              </span>
              <span className="text-sm leading-snug text-ink group-hover:text-brand-navy">
                {prompt}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {bases.length > 0 ? (
        <p className="mt-6 text-xs text-ink-soft">
          Você pode perguntar sobre: {bases.map((base) => base.name).join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
