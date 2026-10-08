import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

const STEPS = [
  'Interpretando a pergunta',
  'Selecionando as bases do data mesh',
  'Consultando dados governados',
  'Calculando insights',
  'Escrevendo a resposta',
];

/** Assistant "thinking" bubble: pulsing mark, bouncing dots and the current step of the agent. */
export function ThinkingIndicator({
  study = false,
  progress,
}: {
  study?: boolean;
  /** Real progress reported by a background job; replaces the rotating steps. */
  progress?: string;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setStep((current) => Math.min(current + 1, STEPS.length - 1)),
      1400,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      aria-label="A Inteligência PJ está pensando"
      className="flex max-w-[460px] items-start gap-3 rounded-[var(--radius-control)] bg-tint px-3 py-3"
      role="status"
    >
      <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-orange/25 motion-reduce:animate-none" />
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-brand-orange text-white">
          <Sparkles aria-hidden className="h-4 w-4" />
        </span>
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-brand-navy">Inteligência PJ</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span aria-hidden className="flex items-end gap-1">
            {[0, 150, 300].map((delay) => (
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-navy motion-reduce:animate-none"
                key={delay}
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
          <span className="text-[13px] text-ink-soft" key={step}>
            {progress ?? (study && step >= 2 ? 'Montando o estudo completo' : STEPS[step])}…
          </span>
        </div>
      </div>
    </div>
  );
}
