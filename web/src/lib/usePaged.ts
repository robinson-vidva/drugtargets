import { useEffect, useMemo, useState } from 'react';

export interface Paged<T> {
  page: number;
  pageCount: number;
  pageItems: T[];
  total: number;
  from: number; // 1-based index of first item on page (0 if empty)
  to: number;   // 1-based index of last item on page
  setPage: (p: number) => void;
}

/**
 * Client-side pagination over a (stable / memoized) array.
 * Resets to the first page whenever the input array reference changes.
 */
export function usePaged<T>(items: T[], pageSize = 10): Paged<T> {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [items, pageSize]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const pageItems = useMemo(
    () => items.slice(start, start + pageSize),
    [items, start, pageSize],
  );

  return {
    page: safePage,
    pageCount,
    pageItems,
    total: items.length,
    from: items.length ? start + 1 : 0,
    to: Math.min(start + pageSize, items.length),
    setPage,
  };
}

/** Compact page-number window (with -1 sentinels for ellipsis). */
export function pageWindow(page: number, pageCount: number): number[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i);
  const out = new Set<number>([0, pageCount - 1, page, page - 1, page + 1]);
  const sorted = [...out].filter((p) => p >= 0 && p < pageCount).sort((a, b) => a - b);
  const win: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i && sorted[i] - sorted[i - 1] > 1) win.push(-1); // ellipsis
    win.push(sorted[i]);
  }
  return win;
}
