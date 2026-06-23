import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';
export interface SortState { key: string; dir: SortDir; }
export type Accessors<T> = Record<string, (t: T) => string | number>;

export interface Sortable<T> {
  sorted: T[];
  sort: SortState | null;
  toggle: (key: string) => void;
  setSort: (s: SortState | null) => void;
}

/**
 * Click-to-sort over a (stable) array. Accessors are read from a ref so the sorted
 * result stays referentially stable across renders (only re-sorts when items/sort
 * change) — important so it composes cleanly with usePaged's reset-on-change.
 */
export function useSortable<T>(
  items: T[], accessors: Accessors<T>, initial: SortState | null = null,
): Sortable<T> {
  // Captured once via a lazy initializer: accessors are functionally stable (eager data is
  // loaded before any page renders), keeping `sorted` referentially stable and the memo pure.
  const [acc] = useState(() => accessors);
  const [sort, setSort] = useState<SortState | null>(initial);

  const sorted = useMemo(() => {
    if (!sort) return items;
    const accessor = acc[sort.key];
    if (!accessor) return items;
    const out = [...items].sort((a, b) => {
      const x = accessor(a), y = accessor(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === 'asc' ? c : -c;
    });
    return out;
  }, [items, sort]);

  const toggle = (key: string) =>
    setSort((s) => (s && s.key === key
      ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }));

  return { sorted, sort, toggle, setSort };
}
