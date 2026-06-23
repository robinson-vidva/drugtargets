import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { booleanGeneQuery, type BoolOp } from '../lib/booleanQuery';
import { downloadCSV } from '../lib/csv';
import { usePaged } from '../lib/usePaged';
import { useSortable, type SortState } from '../lib/useSortable';
import { usePersistentNumber } from '../lib/useLocalStorage';
import { usePageTitle } from '../lib/usePageTitle';
import { Pagination } from '../components/Pagination';
import { Disclaimer, EmptyState, SortHeader, phaseLabel } from '../components/common';

interface Token { geneId: number; symbol: string; }

const DEFAULT_SORT: SortState = { key: 'phase', dir: 'desc' };
const canon = (pairs: [string, string][]) =>
  pairs.slice().sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
    .map(([k, v]) => `${k}=${v}`).join('&');

interface QueryState {
  tokens: Token[]; op: BoolOp; approvedOnly: boolean; minPhase: number;
  drugType: string; sort: SortState;
}

function parseQuery(
  params: URLSearchParams,
  genes: Record<string, { symbol: string }> | undefined,
  symbolToGeneId: Map<string, number> | undefined,
): QueryState {
  const q = params.get('q') ?? '';
  const tokens: Token[] = [];
  for (const p of q.split(/\b(?:AND|OR)\b/i).map((s) => s.trim()).filter(Boolean)) {
    const gid = symbolToGeneId?.get(p.toUpperCase());
    if (gid !== undefined && genes && !tokens.some((t) => t.geneId === gid)) {
      tokens.push({ geneId: gid, symbol: genes[String(gid)].symbol });
    }
  }
  const sp = params.get('sort');
  return {
    tokens,
    op: /\bOR\b/i.test(q) ? 'OR' : 'AND',
    approvedOnly: params.get('approved') === '1',
    minPhase: Number(params.get('phase')) || 0,
    drugType: params.get('type') ?? '',
    sort: sp ? { key: sp.split(':')[0], dir: sp.split(':')[1] === 'asc' ? 'asc' : 'desc' } : DEFAULT_SORT,
  };
}

function buildParamObj(s: QueryState): Record<string, string> {
  const obj: Record<string, string> = {};
  if (s.tokens.length) obj.q = s.tokens.map((t) => t.symbol).join(` ${s.op} `);
  if (s.approvedOnly) obj.approved = '1';
  if (s.minPhase) obj.phase = String(s.minPhase);
  if (s.drugType) obj.type = s.drugType;
  if (s.sort.key !== DEFAULT_SORT.key || s.sort.dir !== DEFAULT_SORT.dir) {
    obj.sort = `${s.sort.key}:${s.sort.dir}`;
  }
  return obj;
}

export default function GeneQueryPage() {
  const { genes, geneDrugs, drugs, symbolToGeneId, search } = useData();
  const [params, setParams] = useSearchParams();
  // Initialize from the URL synchronously so the first render already matches the link
  // (avoids any mount-time clobber). genes/symbolToGeneId are eager-loaded before this renders.
  const [init] = useState(() => parseQuery(params, genes, symbolToGeneId));
  const [tokens, setTokens] = useState<Token[]>(init.tokens);
  const [op, setOp] = useState<BoolOp>(init.op);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [approvedOnly, setApprovedOnly] = useState(init.approvedOnly);
  const [minPhase, setMinPhase] = useState(init.minPhase);
  const [drugType, setDrugType] = useState(init.drugType);

  const suggestions = useMemo(() => {
    if (!search || text.trim().length < 1) return [];
    return search.search(text.trim())
      .filter((r) => r.kind === 'gene')
      .slice(0, 6)
      .map((r) => ({ geneId: Number(String(r.id).slice(2)), symbol: r.label as string, detail: r.detail as string }))
      .filter((s) => !tokens.some((t) => t.geneId === s.geneId));
  }, [search, text, tokens]);

  useEffect(() => setActive(0), [text]);

  function addToken(t: Token) {
    setTokens((ts) => ts.some((x) => x.geneId === t.geneId) ? ts : [...ts, t]);
    setText('');
  }
  function removeToken(geneId: number) {
    setTokens((ts) => ts.filter((t) => t.geneId !== geneId));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Enter') { e.preventDefault(); const s = suggestions[active]; addToken({ geneId: s.geneId, symbol: s.symbol }); return; }
    }
    if (e.key === 'Backspace' && text === '' && tokens.length > 0) {
      removeToken(tokens[tokens.length - 1].geneId);
    }
  }

  const results = useMemo(() => {
    if (!geneDrugs || !drugs || tokens.length === 0) return [];
    const ids = booleanGeneQuery(tokens.map((t) => t.geneId), op, geneDrugs);
    return ids
      .map((id) => ({ id, drug: drugs[String(id)] }))
      .filter((r) => r.drug)
      .sort((a, b) => (b.drug.maxPhase - a.drug.maxPhase) || a.drug.name.localeCompare(b.drug.name));
  }, [geneDrugs, drugs, tokens, op]);

  const drugTypes = useMemo(
    () => [...new Set(results.map((r) => r.drug.drugType).filter(Boolean))].sort(),
    [results]);

  const filtered = useMemo(() => results.filter(({ drug }) =>
    (!approvedOnly || drug.approved)
    && drug.maxPhase >= minPhase
    && (!drugType || drug.drugType === drugType)
  ), [results, approvedOnly, minPhase, drugType]);
  const { sorted, sort, toggle, setSort } = useSortable(filtered, {
    name: (r) => r.drug.name.toLowerCase(),
    type: (r) => r.drug.drugType,
    phase: (r) => r.drug.maxPhase,
    status: (r) => (r.drug.approved ? 1 : 0),
  }, init.sort);
  const [pageSize, setPageSize] = usePersistentNumber('dt.pageSize', 10);
  const paged = usePaged(sorted, pageSize);
  usePageTitle(tokens.length
    ? `${tokens.map((t) => t.symbol).join(` ${op} `)} — drugs`
    : 'Gene query');

  // ---- shareable URL state: genes, op, filters, sort (page size is local only) ----
  // `syncedRef` holds the canon query string we last reconciled, so the two effects
  // don't fight. We compare against the ACTUAL current params (not a stale ref), which
  // is idempotent and StrictMode-safe — the first write is a no-op since state was
  // initialized from the URL.
  const syncedRef = useRef<string | null>(null);

  // state -> URL
  useEffect(() => {
    const obj = buildParamObj({ tokens, op, approvedOnly, minPhase, drugType, sort: sort ?? DEFAULT_SORT });
    const desired = canon(Object.entries(obj));
    if (desired === canon([...params.entries()])) { syncedRef.current = desired; return; }
    syncedRef.current = desired;
    setParams(obj, { replace: true });
  }, [tokens, op, approvedOnly, minPhase, drugType, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  // URL -> state (external nav: shared link, gene-link or search-box navigation)
  useEffect(() => {
    if (!genes || !symbolToGeneId) return;
    const cur = canon([...params.entries()]);
    if (cur === syncedRef.current) return;
    syncedRef.current = cur;
    const p = parseQuery(params, genes, symbolToGeneId);
    setTokens(p.tokens); setOp(p.op); setApprovedOnly(p.approvedOnly);
    setMinPhase(p.minPhase); setDrugType(p.drugType); setSort(p.sort);
  }, [params, genes, symbolToGeneId]); // eslint-disable-line react-hooks/exhaustive-deps

  function exportCsv() {
    downloadCSV(
      `drugtargets_${tokens.map((t) => t.symbol).join('-')}_${op}.csv`,
      ['drug', 'chembl', 'drugType', 'maxPhase', 'approved', 'pharmClass', 'atcClass'],
      filtered.map(({ drug }) => [
        drug.name, drug.chembl, drug.drugType, drug.maxPhase, drug.approved,
        drug.pharmClass.join('; '), drug.atcClass.join('; '),
      ]));
  }

  return (
    <div>
      <h1>Boolean gene query</h1>
      <p className="lede">Add one or more genes; toggle AND / OR to find drugs that target
        them. Aliases and previous symbols resolve via the autocomplete.</p>

      <div className="row" style={{ alignItems: 'flex-start', margin: '18px 0' }}>
        <div className="searchbox" style={{ flex: 1, minWidth: 280 }}>
          <div className="token-input">
            {tokens.map((t) => (
              <span className="token" key={t.geneId}>
                {t.symbol}
                <button aria-label={`Remove ${t.symbol}`} onClick={() => removeToken(t.geneId)}>×</button>
              </span>
            ))}
            <input
              value={text}
              placeholder={tokens.length ? 'Add another gene…' : 'Type a gene symbol (e.g. EGFR)…'}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Add gene"
            />
          </div>
          {suggestions.length > 0 && (
            <div className="suggestions">
              {suggestions.map((s, i) => (
                <div
                  key={s.geneId}
                  className={`suggestion ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); addToken({ geneId: s.geneId, symbol: s.symbol }); }}
                >
                  <span className="label">{s.symbol}</span>
                  <span className="detail">{s.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="segmented" role="group" aria-label="Combine genes with">
          <button className={op === 'AND' ? 'active' : ''} onClick={() => setOp('AND')}>AND</button>
          <button className={op === 'OR' ? 'active' : ''} onClick={() => setOp('OR')}>OR</button>
        </div>
      </div>

      {tokens.length === 0 ? (
        <EmptyState>Add a gene above to see the drugs that target it.</EmptyState>
      ) : (
        <>
          <div className="spread" style={{ marginBottom: 10 }}>
            <span className="muted">
              {filtered.length.toLocaleString()}
              {filtered.length !== results.length && ` of ${results.length.toLocaleString()}`} drug
              {filtered.length === 1 ? '' : 's'} target {tokens.map((t) => t.symbol).join(` ${op} `)}
            </span>
            {filtered.length > 0 && (
              <button className="btn secondary" onClick={exportCsv}>Export CSV</button>
            )}
          </div>

          <div className="row filterbar" style={{ marginBottom: 12 }}>
            <label className="filter-check">
              <input type="checkbox" checked={approvedOnly}
                onChange={(e) => setApprovedOnly(e.target.checked)} /> Approved only
            </label>
            <label className="filter-sel">Min phase
              <select value={minPhase} onChange={(e) => setMinPhase(Number(e.target.value))}>
                <option value={0}>Any</option>
                <option value={1}>Phase 1+</option>
                <option value={2}>Phase 2+</option>
                <option value={3}>Phase 3+</option>
                <option value={4}>Approved</option>
              </select>
            </label>
            <label className="filter-sel">Type
              <select value={drugType} onChange={(e) => setDrugType(e.target.value)}>
                <option value="">All</option>
                {drugTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          <Disclaimer />
          {filtered.length === 0 ? (
            <EmptyState>No drugs match {results.length === 0 ? 'this combination' : 'these filters'}.</EmptyState>
          ) : (
            <div className="table-wrap" id="gene-results">
              <table>
                <thead>
                  <tr>
                    <SortHeader label="Drug" sortKey="name" sort={sort} onSort={toggle} />
                    <SortHeader label="Type" sortKey="type" sort={sort} onSort={toggle} />
                    <SortHeader label="Max phase" sortKey="phase" sort={sort} onSort={toggle} />
                    <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggle} />
                    <th>Class</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.pageItems.map(({ id, drug }) => (
                    <tr key={id}>
                      <td><Link to={`/drug/${encodeURIComponent(drug.chembl)}`}>{drug.name}</Link>
                        <div className="muted mono" style={{ fontSize: '0.8rem' }}>{drug.chembl}</div></td>
                      <td>{drug.drugType || '—'}</td>
                      <td>{phaseLabel(drug.maxPhase)}</td>
                      <td>{drug.approved ? <span className="badge activate">Approved</span> : <span className="tag">Investigational</span>}</td>
                      <td><div className="pill-list">{(drug.pharmClass.length ? drug.pharmClass : drug.atcClass.length ? drug.atcClass : drug.derivedClass).slice(0, 2).map((p) => <span className="tag" key={p}>{p}</span>)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination paged={paged} label="drugs" scrollTargetId="gene-results"
            pageSize={pageSize} onPageSize={setPageSize} />
        </>
      )}
    </div>
  );
}
