import { pageWindow, type Paged } from '../lib/usePaged';

interface Props<T> {
  paged: Paged<T>;
  label?: string;          // e.g. "drugs", "hypotheses"
  scrollTargetId?: string; // element to scroll to top of on page change
  pageSize?: number;       // when provided with onPageSize, renders a per-page selector
  onPageSize?: (n: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination<T>({
  paged, label = 'items', scrollTargetId,
  pageSize, onPageSize, pageSizeOptions = [10, 25, 50, 100],
}: Props<T>) {
  const { page, pageCount, from, to, total, setPage } = paged;
  if (total === 0) return null;

  function go(p: number) {
    setPage(p);
    if (scrollTargetId) {
      const el = document.getElementById(scrollTargetId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <div className="pager">
      <span className="pager-info">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} {label}
        {pageSize !== undefined && onPageSize && (
          <select className="page-size" value={pageSize}
            aria-label="Results per page"
            onChange={(e) => onPageSize(Number(e.target.value))}>
            {pageSizeOptions.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        )}
      </span>
      {pageCount > 1 && (
        <div className="pager-btns" role="navigation" aria-label="Pagination">
          <button className="pager-btn" disabled={page === 0} onClick={() => go(page - 1)}
            aria-label="Previous page">‹</button>
          {pageWindow(page, pageCount).map((p, i) =>
            p === -1
              ? <span key={`e${i}`} className="pager-ellipsis">…</span>
              : <button key={p} className={`pager-btn ${p === page ? 'active' : ''}`}
                  aria-current={p === page} onClick={() => go(p)}>{p + 1}</button>,
          )}
          <button className="pager-btn" disabled={page === pageCount - 1} onClick={() => go(page + 1)}
            aria-label="Next page">›</button>
        </div>
      )}
    </div>
  );
}
