import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { FilterCondition } from '@bfp/domain';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, SearchInput } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchDimensionValues, type CatalogDimension } from '@/features/catalog/api';
import { normalizeText } from '@/lib/text';

type Mode = 'EQ' | 'NEQ' | 'IN' | 'NOT_IN';

const MODE_LABELS: Record<Mode, string> = {
  EQ: 'é igual a',
  NEQ: 'é diferente de',
  IN: 'está em',
  NOT_IN: 'não está em',
};

/** Builds a governed filter by choosing a dimension, an operator and values from the data. */
export function FilterDialog({
  open,
  onClose,
  dimensions,
  initial,
  onSubmit,
}: {
  open: boolean;
  onClose(): void;
  dimensions: CatalogDimension[];
  initial?: FilterCondition;
  onSubmit(filter: FilterCondition): void;
}) {
  const filterable = dimensions.filter(
    (dimension) => dimension.type !== 'date' && dimension.allowedOperators.includes('EQ'),
  );
  const [field, setField] = useState(initial?.field ?? 'state');
  const [mode, setMode] = useState<Mode>(
    initial && ['EQ', 'NEQ', 'IN', 'NOT_IN'].includes(initial.operator)
      ? (initial.operator as Mode)
      : 'EQ',
  );
  const [selected, setSelected] = useState<string[]>(
    initial && 'value' in initial
      ? (Array.isArray(initial.value) ? initial.value : [initial.value]).map(String)
      : [],
  );

  const [dimensionQuery, setDimensionQuery] = useState('');
  const [valueQuery, setValueQuery] = useState('');
  const dimensionSearch = normalizeText(dimensionQuery.trim());
  // The current dimension stays in the list so the select never loses its value.
  const visibleDimensions = filterable.filter(
    (dimension) =>
      dimension.id === field ||
      !dimensionSearch ||
      normalizeText(dimension.label).includes(dimensionSearch),
  );

  const values = useQuery({
    queryKey: ['catalog', 'dimension-values', field],
    queryFn: () => fetchDimensionValues(field),
    enabled: open && Boolean(field),
    staleTime: 5 * 60 * 1000,
  });
  const multiple = mode === 'IN' || mode === 'NOT_IN';
  const valueSearch = normalizeText(valueQuery.trim());
  const filteredValues = (values.data ?? []).filter(
    (option) =>
      selected.includes(option.value) ||
      !valueSearch ||
      normalizeText(option.label).includes(valueSearch),
  );

  function submit() {
    if (selected.length === 0) return;
    onSubmit(
      multiple
        ? { field, operator: mode as 'IN' | 'NOT_IN', value: selected }
        : { field, operator: mode as 'EQ' | 'NEQ', value: selected[0]! },
    );
    onClose();
  }

  return (
    <Dialog
      description="Restrinja a análise usando dimensões governadas."
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button disabled={selected.length === 0} onClick={submit} variant="primary">
            Aplicar filtro
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={initial ? 'Editar filtro' : 'Adicionar filtro'}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor="filter-field" label="Dimensão">
          <SearchInput
            aria-label="Buscar dimensão"
            onChange={(event) => {
              const next = event.target.value;
              setDimensionQuery(next);
              // Typing picks the first match, so search + Enter is enough.
              const search = normalizeText(next.trim());
              const first = filterable.find(
                (dimension) => search && normalizeText(dimension.label).includes(search),
              );
              if (first && first.id !== field) {
                setField(first.id);
                setSelected([]);
                setValueQuery('');
              }
            }}
            placeholder="Buscar dimensão…"
            value={dimensionQuery}
          />
          <Select
            id="filter-field"
            onChange={(event) => {
              setField(event.target.value);
              setSelected([]);
              setValueQuery('');
            }}
            value={field}
          >
            {visibleDimensions.map((dimension) => (
              <option key={dimension.id} value={dimension.id}>
                {dimension.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field htmlFor="filter-operator" label="Condição">
          <Select
            id="filter-operator"
            onChange={(event) => {
              const next = event.target.value as Mode;
              setMode(next);
              if (next === 'EQ' || next === 'NEQ') setSelected((current) => current.slice(0, 1));
            }}
            value={mode}
          >
            {(Object.keys(MODE_LABELS) as Mode[]).map((key) => (
              <option key={key} value={key}>
                {MODE_LABELS[key]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset className="mt-4 border-0 p-0">
        <legend className="text-[13px] font-semibold text-ink">Valores</legend>
        <SearchInput
          aria-label="Buscar valor"
          containerClassName="mt-2"
          onChange={(event) => setValueQuery(event.target.value)}
          placeholder="Buscar valor…"
          value={valueQuery}
        />
        {values.isLoading ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton className="h-8" key={index} />
            ))}
          </div>
        ) : (
          <div className="mt-2 grid max-h-56 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
            {filteredValues.map((option) => {
              const checked = selected.includes(option.value);
              return (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  key={option.value}
                >
                  <input
                    checked={checked}
                    className="accent-[var(--color-brand-orange)]"
                    name="filter-value"
                    onChange={() =>
                      setSelected((current) =>
                        multiple
                          ? checked
                            ? current.filter((value) => value !== option.value)
                            : [...current, option.value]
                          : [option.value],
                      )
                    }
                    type={multiple ? 'checkbox' : 'radio'}
                  />
                  <span className="truncate" title={option.label}>
                    {option.label}
                  </span>
                </label>
              );
            })}
            {values.data?.length === 0 ? (
              <p className="col-span-full text-sm text-ink-soft">
                Nenhum valor disponível para esta dimensão.
              </p>
            ) : filteredValues.length === 0 ? (
              <p className="col-span-full text-sm text-ink-soft">
                Nenhum valor encontrado para “{valueQuery.trim()}”.
              </p>
            ) : null}
          </div>
        )}
      </fieldset>
    </Dialog>
  );
}
