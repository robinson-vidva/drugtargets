import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../data/DataContext';
import type { RepurposingRow, StructuralRow } from '../data/types';
import { usePaged } from '../lib/usePaged';
import { Pagination } from './Pagination';
import { ScoreBar, EmptyState, TableSkeleton } from './common';

export function RepurposingHypotheses({ drugId }: { drugId: number }) {
  const { drugs, genes, diseases, loadRepurposing } = useData();
  const [map, setMap] = useState<Record<string, RepurposingRow[]> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    loadRepurposing().then((m) => !c && setMap(m)).catch((e) => !c && setErr(String(e)));
    return () => { c = true; };
  }, [loadRepurposing]);

  const rows = useMemo(() => map?.[String(drugId)] ?? [], [map, drugId]);
  const paged = usePaged(rows, 10);

  return (
    <>
      <h2>Repurposing hypotheses</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        Diseases this drug is <em>not</em> indicated for, but a target-similar drug is approved
        or in late-phase trials for — ranked by similarity, with shared targets and Open Targets
        genetic support. <strong>Hypotheses only.</strong>
      </p>
      {err ? <EmptyState>Failed to load: {err}</EmptyState>
        : !map ? <TableSkeleton rows={5} cols={5} />
        : rows.length === 0 ? <EmptyState>No repurposing hypotheses for this drug.</EmptyState>
        : (
          <>
          <div className="table-wrap" id="repurposing-table">
            <table>
              <thead>
                <tr><th>Candidate disease</th><th>Strength</th><th>Shared targets</th>
                  <th>Genetic support</th><th>Via</th></tr>
              </thead>
              <tbody>
                {paged.pageItems.map(([dz, score, via, shared, support]) => {
                  const d = diseases?.[String(dz)];
                  if (!d) return null;
                  const norm = Math.min(1, score / 2);
                  return (
                    <tr key={dz}>
                      <td><Link to={`/disease/${encodeURIComponent(d.efo)}`}>{d.name}</Link></td>
                      <td><ScoreBar value={norm} /></td>
                      <td><div className="chip-row">
                        {shared.map((g) => {
                          const sym = genes?.[String(g)]?.symbol ?? String(g);
                          return <Link key={g} className="gene-chip concordant"
                            to={`/genes?q=${encodeURIComponent(sym)}`}>{sym}</Link>;
                        })}
                        {shared.length === 0 && <span className="muted">—</span>}
                      </div></td>
                      <td>{support >= 0.1
                        ? <span className="badge activate" title="Max OT target–disease association">
                            {support.toFixed(2)}</span>
                        : <span className="muted">—</span>}</td>
                      <td><div className="pill-list">
                        {via.map((v) => {
                          const dr = drugs?.[String(v)];
                          return dr ? <Link key={v} className="tag"
                            to={`/drug/${encodeURIComponent(dr.chembl)}`}>{dr.name}</Link> : null;
                        })}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination paged={paged} label="hypotheses" scrollTargetId="repurposing-table" />
          </>
        )}
    </>
  );
}

export function StructuralSimilar({ drugId }: { drugId: number }) {
  const { drugs, loadStructural } = useData();
  const [map, setMap] = useState<Record<string, StructuralRow[]> | null>(null);

  useEffect(() => {
    let c = false;
    loadStructural().then((m) => !c && setMap(m)).catch(() => { /* optional */ });
    return () => { c = true; };
  }, [loadStructural]);

  const rows = useMemo(() => map?.[String(drugId)] ?? [], [map, drugId]);
  const paged = usePaged(rows, 10);
  if (map && rows.length === 0) return null; // no SMILES / no structural neighbours

  return (
    <>
      <h2>Structurally similar drugs</h2>
      <p className="muted" style={{ marginTop: -6 }}>
        By ECFP4 fingerprint (Tanimoto) — a chemical-structure axis independent of targets.
      </p>
      {!map ? <TableSkeleton rows={4} cols={2} /> : (
        <>
        <div className="table-wrap" id="structural-table">
          <table>
            <thead><tr><th>Drug</th><th>Tanimoto</th></tr></thead>
            <tbody>
              {paged.pageItems.map(([other, t]) => {
                const d = drugs?.[String(other)];
                if (!d) return null;
                return (
                  <tr key={other}>
                    <td><Link to={`/drug/${encodeURIComponent(d.chembl)}`}>{d.name}</Link></td>
                    <td><ScoreBar value={t} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination paged={paged} label="similar structures" scrollTargetId="structural-table" />
        </>
      )}
    </>
  );
}
