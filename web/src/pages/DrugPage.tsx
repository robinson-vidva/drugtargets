import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../data/DataContext';
import type { DrugTargetsMap, Mechanisms, IndicationRow } from '../data/types';
import { signToDirection } from '../data/types';
import { usePaged } from '../lib/usePaged';
import { useSortable } from '../lib/useSortable';
import { Pagination } from '../components/Pagination';
import { Disclaimer, DirectionBadge, EmptyState, Loading, PhaseTag, SortHeader, TableSkeleton } from '../components/common';
import { SimilarDrugs } from '../components/SimilarDrugs';
import { RepurposingHypotheses, StructuralSimilar } from '../components/Repurposing';

export default function DrugPage() {
  const { chembl = '' } = useParams();
  const { drugs, genes, meta, diseases, chemblToDrugId,
    loadDrugTargets, loadMechanisms, loadDrugIndications } = useData();
  const [targets, setTargets] = useState<DrugTargetsMap | null>(null);
  const [mechanisms, setMechanisms] = useState<Mechanisms | null>(null);
  const [indications, setIndications] = useState<IndicationRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const drugId = chemblToDrugId?.get(chembl.toUpperCase());

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadDrugTargets(), loadMechanisms()])
      .then(([dt, m]) => { if (!cancelled) { setTargets(dt); setMechanisms(m); } })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    return () => { cancelled = true; };
  }, [loadDrugTargets, loadMechanisms]);

  useEffect(() => {
    let cancelled = false;
    loadDrugIndications()
      .then((m) => { if (!cancelled && drugId !== undefined) setIndications(m[String(drugId)] ?? []); })
      .catch(() => { /* indications are non-critical */ });
    return () => { cancelled = true; };
  }, [loadDrugIndications, drugId]);

  const targetRows = useMemo(
    () => ((drugId !== undefined && targets) ? (targets[String(drugId)] ?? []) : []),
    [targets, drugId]);
  const targetSort = useSortable(targetRows, {
    gene: (r) => genes?.[String(r[0])]?.symbol ?? '',
    action: (r) => meta?.actionTypes[r[1]] ?? '',
    direction: (r) => r[2],
  }, { key: 'gene', dir: 'asc' });
  const targetsPaged = usePaged(targetSort.sorted, 10);

  const indItems = useMemo(() => indications ?? [], [indications]);
  const indSort = useSortable(indItems, {
    disease: (r) => diseases?.[String(r[0])]?.name ?? '',
    stage: (r) => r[1],
  }, { key: 'stage', dir: 'desc' });
  const indPaged = usePaged(indSort.sorted, 10);

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

      {drug.pharmClass.length === 0 && drug.atcClass.length === 0 && drug.derivedClass.length > 0 && (
        <div className="chip-row" style={{ marginTop: 10 }}>
          <span className="muted" style={{ fontSize: '0.8rem', alignSelf: 'center' }}
            title="No curated openFDA/ATC class; derived from this drug's targets and action">
            mechanism-derived:
          </span>
          {drug.derivedClass.map((p) => <span className="tag" key={p}>{p}</span>)}
        </div>
      )}

      <Disclaimer />

      <h2>Molecular targets</h2>
      {err ? <EmptyState>Failed to load targets: {err}</EmptyState>
        : !targets ? <TableSkeleton rows={6} cols={4} />
        : rows.length === 0 ? <EmptyState>No annotated mechanisms for this drug.</EmptyState>
        : (
          <>
          <div className="table-wrap" id="targets-table">
            <table>
              <thead>
                <tr>
                  <SortHeader label="Gene" sortKey="gene" sort={targetSort.sort} onSort={targetSort.toggle} />
                  <SortHeader label="Action type" sortKey="action" sort={targetSort.sort} onSort={targetSort.toggle} />
                  <SortHeader label="Direction" sortKey="direction" sort={targetSort.sort} onSort={targetSort.toggle} />
                  <th>Mechanism</th>
                </tr>
              </thead>
              <tbody>
                {targetsPaged.pageItems.map(([gid, ac, sign, mi]) => {
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
          <Pagination paged={targetsPaged} label="targets" scrollTargetId="targets-table" />
          </>
        )}

      {indications && indications.length > 0 && diseases && (
        <>
          <h2>Indications</h2>
          <p className="muted" style={{ marginTop: -6 }}>
            Diseases this drug is approved for or studied in (highest clinical stage shown).
          </p>
          <div className="table-wrap" id="indications-table">
            <table>
              <thead><tr>
                <SortHeader label="Disease" sortKey="disease" sort={indSort.sort} onSort={indSort.toggle} />
                <SortHeader label="Highest stage" sortKey="stage" sort={indSort.sort} onSort={indSort.toggle} />
              </tr></thead>
              <tbody>
                {indPaged.pageItems.map(([dis, phase]) => {
                  const dz = diseases[String(dis)];
                  if (!dz) return null;
                  return (
                    <tr key={dis}>
                      <td><Link to={`/disease/${encodeURIComponent(dz.efo)}`}>{dz.name}</Link></td>
                      <td><PhaseTag phase={phase} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination paged={indPaged} label="indications" scrollTargetId="indications-table" />
        </>
      )}

      <RepurposingHypotheses drugId={drugId} />

      <SimilarDrugs drugId={drugId} />

      <StructuralSimilar drugId={drugId} />
    </div>
  );
}
