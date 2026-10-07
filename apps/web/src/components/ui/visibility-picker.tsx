import { Eye, Lock, Users } from 'lucide-react';
import type { SharingLevel } from '@bfp/domain';
import { cn } from '@/lib/utils';

export const VISIBILITY_OPTIONS: Array<{
  value: SharingLevel;
  label: string;
  description: string;
  Icon: typeof Lock;
}> = [
  { value: 'PRIVATE', label: 'Privado', description: 'Só você vê e edita.', Icon: Lock },
  { value: 'TEAM', label: 'Time pode editar', description: 'Seu time vê e edita.', Icon: Users },
  {
    value: 'READ_ONLY',
    label: 'Somente leitura',
    description: 'Todos com acesso ao domínio podem visualizar.',
    Icon: Eye,
  },
];

/** Accessible radio group for sharing levels. */
export function VisibilityPicker({
  value,
  onChange,
  name = 'visibility',
}: {
  value: SharingLevel;
  onChange(value: SharingLevel): void;
  name?: string;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 text-[13px] font-semibold text-ink">Compartilhamento</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {VISIBILITY_OPTIONS.map((option) => (
          <label
            className={cn(
              'flex cursor-pointer flex-col gap-1 rounded-[var(--radius-control)] border p-3 text-sm transition-colors',
              value === option.value
                ? 'border-brand-orange bg-cream'
                : 'border-line hover:border-line-strong',
            )}
            key={option.value}
          >
            <input
              checked={value === option.value}
              className="sr-only"
              name={name}
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />
            <span className="flex items-center gap-2 font-semibold text-brand-navy">
              <option.Icon aria-hidden className="h-4 w-4" />
              {option.label}
            </span>
            <span className="text-xs text-ink-soft">{option.description}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Footer label for a sharing level, as in the dashboard cards ("Pode editar · Growth PJ"). */
export function sharingLabel(visibility: SharingLevel | undefined, team: string | undefined) {
  if (!visibility || visibility === 'PRIVATE') return 'Privado · Só você';
  return `${visibility === 'TEAM' ? 'Pode editar' : 'Pode visualizar'} · ${team ?? '—'}`;
}
