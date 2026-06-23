import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';

interface Suggestion {
  id: string;
  kind: 'gene' | 'drug' | 'disease';
  label: string;
  detail: string;
  ref: string;
}

export function SearchBox({ placeholder = 'Search a drug or gene…', autoFocus = false, inputId }:
  { placeholder?: string; autoFocus?: boolean; inputId?: string }) {
  const { search } = useData();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo<Suggestion[]>(() => {
    if (!search || q.trim().length < 1) return [];
    return search.search(q.trim()).slice(0, 8).map((r) => ({
      id: String(r.id), kind: r.kind, label: r.label, detail: r.detail, ref: r.ref,
    }));
  }, [search, q]);

  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function go(s: Suggestion) {
    setOpen(false);
    setQ('');
    if (s.kind === 'drug') navigate(`/drug/${encodeURIComponent(s.ref)}`);
    else if (s.kind === 'disease') navigate(`/disease/${encodeURIComponent(s.ref)}`);
    else navigate(`/genes?q=${encodeURIComponent(s.ref)}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      if (q) setQ('');
      else (e.target as HTMLInputElement).blur();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
  }

  return (
    <div className="searchbox" ref={boxRef}>
      <input
        type="text"
        id={inputId}
        value={q}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label="Search drugs and genes"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && results.length > 0 && (
        <div className="suggestions" role="listbox">
          {results.map((s, i) => (
            <div
              key={s.id}
              role="option"
              aria-selected={i === active}
              className={`suggestion ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); go(s); }}
            >
              <span className="tag">{s.kind}</span>
              <span className="label">{s.label}</span>
              <span className="detail">{s.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
