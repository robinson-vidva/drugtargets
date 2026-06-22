import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../data/DataContext';
import type { DrugTargetsMap, Mechanisms } from '../data/types';
import { signToDirection } from '../data/types';
import { Disclaimer, DirectionBadge, EmptyState, Loading } from '../components/common';
import { SimilarDrugs } from '../components/SimilarDrugs';

export default function DrugPage() {
  const { chembl = '' } = useParams();
  const { drugs, genes, meta, chemblToDrugId, loadDrugTargets, loadMechanisms } = useData();
  const [targets, setTargets] = useState<DrugTargetsMap | null>(null);
  const [mechanisms, setMechanisms] = useState<Mechanisms | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const drugId = chemblToDrugId?.get(chembl.toUpperCase());

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadDrugTargets(), loadMechanisms()])
      .then(([dt, m]) => { if (!cancelled) { setTargets(dt); setMechanisms(m); } })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    return () => { cancelled = true; };
  }, [loadDrugTargets, loadMechanisms]);

  if (!drugs || !genes) return <Loading />;
  if (drugId === undefined) {
    return <EmptyState>No drug found for <code>{chembl}</code>.{' '}
      <Link to="/">Back home</Link></EmptyState>;
  }

  const drug = drugs[String(drugId)];
  const rows = targets?.[String(drugId)] ?? [];

  return (
    <div>
      <div className="spread">
        <div>
          <h1>{drug.name}</h1>
          <div className="meta-line">
            <a href={`https://www.ebi.ac.uk/chembl/explore/compound/${drug.chembl}`}
               target="_blank" rel="noreferrer" className="mono">{drug.chembl}</a>
            {drug.drugType && <> · {drug.drugType}</>}
            {drug.maxPhase ? <> · max phase {drug.maxPhase}</> : null}
          </div>
        </div>
        <div className="chip-row">
          {drug.approved
            ? <span className="badge activate">Approved</span>
            : <span className="tag">Investigational</span>}
        </div>
      </div>

      {(drug.pharmClass.length > 0 || drug.atcClass.length > 0) && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {drug.pharmClass.length > 0 && (
            <div className="chip-row">
              <span className="muted" style={{ fontSize: '0.8rem', alignSelf: 'center' }}>openFDA:</span>
              {drug.pharmClass.map((p) => <span className="tag" key={p}>{p}</span>)}
            </div>
          )}
          {drug.atcClass.length > 0 && (
            <div className="chip-row">
              <span className="muted" style={{ fontSize: '0.8rem', alignSelf: 'center' }}>ATC:</span>
              {drug.atcClass.map((p, i) => (
                <span className="tag" key={p} title={drug.atc[i]}>{p}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <Disclaimer />

      <h2>Molecular targets</h2>
      {err ? <EmptyState>Failed to load targets: {err}</EmptyState>
        : !targets ? <Loading label="Loading targets…" />
        : rows.length === 0 ? <EmptyState>No annotated mechanisms for this drug.</EmptyState>
        : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Gene</th><th>Action type</th><th>Direction</th><th>Mechanism</th></tr>
              </thead>
              <tbody>
                {[...rows]
                  .sort((a, b) => genes[String(a[0])].symbol.localeCompare(genes[String(b[0])].symbol))
                  .map(([gid, ac, sign, mi]) => {
                    const g = genes[String(gid)];
                    return (
                      <tr key={gid}>
                        <td>
                          <Link to={`/genes?q=${encodeURIComponent(g.symbol)}`}>{g.symbol}</Link>
                          <div className="muted" style={{ fontSize: '0.8rem' }}>{g.name}</div>
                        </td>
                        <td>{meta?.actionTypes[ac] ?? '—'}</td>
                        <td><DirectionBadge direction={signToDirection(sign)} /></td>
                        <td className="muted">{mechanisms?.[mi] || '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

      <SimilarDrugs drugId={drugId} />
    </div>
  );
}
