import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../data/DataContext';
import { booleanGeneQuery, type BoolOp } from '../lib/booleanQuery';
import { downloadCSV } from '../lib/csv';
import { Disclaimer, EmptyState, phaseLabel } from '../components/common';

interface Token { geneId: number; symbol: string; }

export default function GeneQueryPage() {
  const { genes, geneDrugs, drugs, symbolToGeneId, search } = useData();
  const [params, setParams] = useSearchParams();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [op, setOp] = useState<BoolOp>('AND');
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [minPhase, setMinPhase] = useState(0);
  const [drugType, setDrugType] = useState('');
  const lastQRef = useRef<string | null>(null);

  // URL -> tokens. Re-parses on EXTERNAL url changes (shared link, in-app gene-link or
  // search-box navigation), but skips echoes of our own tokens->URL writes (lastQRef).
  useEffect(() => {
    if (!genes || !symbolToGeneId) return;
    const q = params.get('q') ?? '';
    if (q === lastQRef.current) return;
    lastQRef.current = q;
    const detectedOp: BoolOp = /\bOR\b/i.test(q) ? 'OR' : 'AND';
    const parts = q.split(/\b(?:AND|OR)\b/i).map((s) => s.trim()).filter(Boolean);
    const resolved: Token[] = [];
    for (const p of parts) {
      const gid = symbolToGeneId.get(p.toUpperCase());
      if (gid !== undefined && !resolved.some((t) => t.geneId === gid)) {
        resolved.push({ geneId: gid, symbol: genes[String(gid)].symbol });
      }
    }
    setOp(detectedOp);
    setTokens(resolved);
  }, [params, genes, symbolToGeneId]);

  // tokens/op -> URL (shareable). lastQRef marks our write so the effect above ignores it.
  useEffect(() => {
    const q = tokens.length ? tokens.map((t) => t.symbol).join(` ${op} `) : '';
    if (q === (params.get('q') ?? '')) return;
    lastQRef.current = q;
    setParams(q ? { q } : {}, { replace: true });
  }, [tokens, op]); // eslint-disable-line react-hooks/exhaustive-deps

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
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Drug</th><th>Type</th><th>Max phase</th><th>Status</th><th>Class</th></tr>
                </thead>
                <tbody>
                  {filtered.map(({ id, drug }) => (
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
        </>
      )}
    </div>
  );
}
