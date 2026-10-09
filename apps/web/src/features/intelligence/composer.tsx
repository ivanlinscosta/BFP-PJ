import { ArrowUp } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';

/** Message box: grows with the text, Enter sends, Shift+Enter breaks the line. */
export function Composer({
  value,
  onChange,
  onSend,
  disabled,
  busy,
  placeholder = 'Pergunte sobre seus dados — por exemplo, “qual canal converte mais?”',
}: {
  value: string;
  onChange(value: string): void;
  onSend(): void;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <form
      className={
        disabled
          ? 'rounded-[18px] border border-line bg-muted px-3 pt-2 pb-2'
          : 'rounded-[18px] border border-line bg-card px-3 pt-2 pb-2 shadow-[0_4px_18px_rgba(0,26,71,0.08)] focus-within:border-brand-navy'
      }
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <label className="sr-only" htmlFor="intelligence-prompt">
        Pergunte aos seus dados
      </label>
      <textarea
        className="block max-h-40 min-h-[28px] w-full resize-none bg-transparent px-1 py-1.5 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
        disabled={disabled}
        id="intelligence-prompt"
        maxLength={4000}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={ref}
        rows={1}
        value={value}
      />
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="m-0 px-1 text-[11px] text-ink-faint">
          Respostas com dados governados · Enter envia, Shift+Enter quebra a linha
        </p>
        <button
          aria-label="Enviar pergunta"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-orange text-white transition-colors hover:bg-brand-orange-hover disabled:bg-line-strong"
          disabled={disabled || busy || !value.trim()}
          type="submit"
        >
          <ArrowUp aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
