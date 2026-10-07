import { ChevronDown, ListFilter, Plus, X } from 'lucide-react';
import { ReactNode, useState } from 'react';
import type { AudienceRule, AudienceRuleGroup, FilterOperator, LogicalOperator } from '@bfp/domain';
import { Popover } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { AudienceField } from './api';

const OPERATOR_LABELS: Partial<Record<FilterOperator, { single: string; multi?: string }>> = {
  EQ: { single: 'é' },
  NEQ: { single: 'não é' },
  IN: { single: 'está em', multi: 'contém' },
  NOT_IN: { single: 'não está em', multi: 'não contém' },
};

let ruleSequence = 0;
export function newId(prefix: string) {
  ruleSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${ruleSequence}`;
}

export function createRule(field: AudienceField): AudienceRule {
  const operator = field.type === 'multi' ? 'NOT_IN' : 'EQ';
  const first = field.options[0]?.value ?? '';
  return operator === 'EQ'
    ? { kind: 'rule', id: newId('rule'), field: field.id, operator: 'EQ', value: first }
    : { kind: 'rule', id: newId('rule'), field: field.id, operator: 'NOT_IN', value: [first] };
}

function ruleValues(rule: AudienceRule): string[] {
  if (!('value' in rule)) return [];
  return (Array.isArray(rule.value) ? rule.value : [rule.value]).map(String);
}

function withValues(rule: AudienceRule, operator: FilterOperator, values: string[]): AudienceRule {
  if (operator === 'IN' || operator === 'NOT_IN') {
    return {
      kind: 'rule',
      id: rule.id,
      field: rule.field,
      operator,
      value: values.length ? values : [''],
    };
  }
  return {
    kind: 'rule',
    id: rule.id,
    field: rule.field,
    operator: operator === 'NEQ' ? 'NEQ' : 'EQ',
    value: values[0] ?? '',
  };
}

function PillSelect({
  label,
  value,
  children,
  open,
  onToggle,
  onClose,
}: {
  label: string;
  value: string;
  children: ReactNode;
  open: boolean;
  onToggle(): void;
  onClose(): void;
}) {
  return (
    <Popover
      anchor={
        <button
          aria-expanded={open}
          aria-label={`${label}: ${value}`}
          className="inline-flex h-[29px] max-w-[260px] items-center gap-2 rounded border border-line bg-muted px-2.5 text-[13px] font-medium text-brand-navy hover:border-line-strong"
          onClick={onToggle}
          type="button"
        >
          <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{value}</span>
        </button>
      }
      className="max-h-72 w-64 overflow-y-auto"
      onClose={onClose}
      open={open}
    >
      {children}
    </Popover>
  );
}

function RuleRow({
  rule,
  fields,
  prefix,
  onChange,
  onRemove,
}: {
  rule: AudienceRule;
  fields: AudienceField[];
  prefix: string;
  onChange(rule: AudienceRule): void;
  onRemove(): void;
}) {
  const [open, setOpen] = useState<'field' | 'value' | 'operator' | null>(null);
  const field = fields.find((candidate) => candidate.id === rule.field);
  const values = ruleValues(rule);
  const multiple = rule.operator === 'IN' || rule.operator === 'NOT_IN';
  const labelOf = (value: string) =>
    field?.options.find((option) => option.value === value)?.label ?? value;
  const operatorLabel =
    field?.type === 'multi'
      ? OPERATOR_LABELS[rule.operator]?.multi
      : OPERATOR_LABELS[rule.operator]?.single;

  return (
    <li className="flex min-h-[57px] items-center gap-3 border-b border-transparent">
      <span className="w-[52px] shrink-0 text-xs font-semibold text-ink">{prefix}</span>
      <div className="flex flex-1 flex-wrap items-center gap-2.5">
        <PillSelect
          label="Campo"
          onClose={() => setOpen(null)}
          onToggle={() => setOpen(open === 'field' ? null : 'field')}
          open={open === 'field'}
          value={field?.label ?? rule.field}
        >
          {fields.map((candidate) => (
            <button
              className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
              key={candidate.id}
              onClick={() => {
                onChange(createRule(candidate));
                setOpen(null);
              }}
              type="button"
            >
              {candidate.label}
            </button>
          ))}
        </PillSelect>
        <button
          aria-label={`Condição: ${operatorLabel ?? rule.operator}. Clique para alternar`}
          className="text-[13px] text-ink-soft hover:text-ink hover:underline"
          onClick={() => {
            const operators = field?.operators ?? ['EQ'];
            const next = operators[(operators.indexOf(rule.operator) + 1) % operators.length]!;
            onChange(withValues(rule, next, values));
          }}
          type="button"
        >
          {operatorLabel ?? rule.operator}
        </button>
        <PillSelect
          label="Valor"
          onClose={() => setOpen(null)}
          onToggle={() => setOpen(open === 'value' ? null : 'value')}
          open={open === 'value'}
          value={values.map(labelOf).join(', ') || 'Selecionar'}
        >
          {(field?.options ?? []).map((option) => {
            const checked = values.includes(option.value);
            return (
              <label
                className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm hover:bg-muted"
                key={option.value}
              >
                <input
                  checked={checked}
                  className="accent-[var(--color-brand-orange)]"
                  name={`value-${rule.id}`}
                  onChange={() => {
                    const nextValues = multiple
                      ? checked
                        ? values.filter((value) => value !== option.value)
                        : [...values.filter(Boolean), option.value]
                      : [option.value];
                    onChange(withValues(rule, rule.operator, nextValues));
                    if (!multiple) setOpen(null);
                  }}
                  type={multiple ? 'checkbox' : 'radio'}
                />
                {option.label}
              </label>
            );
          })}
        </PillSelect>
      </div>
      <button
        aria-label={`Remover condição ${field?.label ?? rule.field}`}
        className="rounded p-1 text-ink-soft hover:bg-muted hover:text-ink"
        onClick={onRemove}
        type="button"
      >
        <X aria-hidden className="h-[18px] w-[18px]" />
      </button>
    </li>
  );
}

function updateAt(
  group: AudienceRuleGroup,
  index: number,
  next: AudienceRule | AudienceRuleGroup | null,
): AudienceRuleGroup {
  const rules = [...group.rules];
  if (next === null) rules.splice(index, 1);
  else rules[index] = next;
  return { ...group, rules };
}

/**
 * Generic AND/OR rule builder with nested groups. It only edits the AudienceRuleGroup
 * structure; evaluation and counts happen in the API.
 */
export function RuleBuilder({
  group,
  fields,
  onChange,
  depth = 0,
  maxDepth = 3,
}: {
  group: AudienceRuleGroup;
  fields: AudienceField[];
  onChange(group: AudienceRuleGroup): void;
  depth?: number;
  maxDepth?: number;
}) {
  const connector = group.operator === 'AND' ? 'E' : 'OU';
  return (
    <div
      className={cn(
        depth > 0 && 'rounded-[var(--radius-control)] border border-line bg-page px-3 py-2',
      )}
    >
      {depth > 0 ? (
        <div className="mb-1 flex items-center justify-between">
          <OperatorToggle
            onChange={(operator) => onChange({ ...group, operator })}
            value={group.operator}
          />
        </div>
      ) : null}
      <ul className={cn('m-0 list-none p-0', depth === 0 && 'border-l-2 border-line pl-3.5')}>
        {group.rules.map((rule, index) =>
          rule.kind === 'group' ? (
            <li className="flex items-start gap-3 py-2" key={rule.id}>
              <span className="w-[52px] shrink-0 pt-2 text-xs font-semibold text-ink">
                {index === 0 ? 'ONDE' : connector}
              </span>
              <div className="flex-1">
                <RuleBuilder
                  depth={depth + 1}
                  fields={fields}
                  group={rule}
                  maxDepth={maxDepth}
                  onChange={(next) =>
                    onChange(updateAt(group, index, next.rules.length ? next : null))
                  }
                />
              </div>
            </li>
          ) : (
            <RuleRow
              fields={fields}
              key={rule.id}
              onChange={(next) => onChange(updateAt(group, index, next))}
              onRemove={() => onChange(updateAt(group, index, null))}
              prefix={index === 0 ? 'ONDE' : connector}
              rule={rule}
            />
          ),
        )}
      </ul>
      {depth > 0 ? (
        <button
          className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-navy hover:underline"
          onClick={() =>
            fields[0] && onChange({ ...group, rules: [...group.rules, createRule(fields[0])] })
          }
          type="button"
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
          Condição no grupo
        </button>
      ) : null}
    </div>
  );
}

export function OperatorToggle({
  value,
  onChange,
}: {
  value: LogicalOperator;
  onChange(value: LogicalOperator): void;
}) {
  return (
    <div
      aria-label="Combinar condições com"
      className="inline-flex gap-1 rounded-[var(--radius-control)] bg-segment p-1"
      role="radiogroup"
    >
      {(['AND', 'OR'] as const).map((operator) => (
        <button
          aria-checked={value === operator}
          className={cn(
            'h-[26px] min-w-[30px] rounded px-2 text-xs font-semibold',
            value === operator
              ? operator === 'AND'
                ? 'border border-peach bg-cream text-brand-navy'
                : 'bg-card text-brand-navy'
              : 'text-brand-navy',
          )}
          key={operator}
          onClick={() => onChange(operator)}
          role="radio"
          type="button"
        >
          {operator === 'AND' ? 'E' : 'OU'}
        </button>
      ))}
    </div>
  );
}

export function AddGroupIcon() {
  return <ListFilter aria-hidden className="h-[18px] w-[18px]" />;
}
