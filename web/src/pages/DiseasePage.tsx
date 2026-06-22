import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../data/DataContext';
import type { DrugIndicationsMap } from '../data/types';
import { downloadCSV } from '../lib/csv';
import { Disclaimer, EmptyState, Loading, PhaseTag, phaseLabel } from '../components/common';

export default function DiseasePage() {
  const { efo = '' } = useParams();
  const { diseases, drugs, efoToDiseaseId, loadDrugIndications } = useData();
  const [ind, setInd] = useState<DrugIndicationsMap | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const diseaseId = efoToDiseaseId?.get(efo.toUpperCase());

  useEffect(() => {
    let cancelled = false;
    loadDrugIndications()
      .then((m) => { if (!cancelled) setInd(m); })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    return () => { cancelled = true; };
  }, [loadDrugIndications]);

  const rows = useMemo(() => {
    if (!ind || !drugs || diseaseId === undefined) return [];
    const out: { id: number; phase: number }[] = [];
    for (const [drugId, indications] of Object.entries(ind)) {
      const hit = indications.find((r) => r[0] === diseaseId);
      if (hit) out.push({ id: Number(drugId), phase: hit[1] });
    }
    return out
      .filter((r) => drugs[String(r.id)])
      .sort((a, b) => (b.phase - a.phase)
        || drugs[String(a.id)].name.localeCompare(drugs[String(b.id)].name));
  }, [ind, drugs, diseaseId]);

  if (!diseases || !drugs) return <Loading />;
  if (diseaseId === undefined) {
    return <EmptyState>No disease found for <code>{efo}</code>. <Link to="/">Back home</Link>.</EmptyState>;
  }
  const disease = diseases[String(diseaseId)];

  return (
    <div>
      <h1>{disease.name}</h1>
      <div className="meta-line">
        <a href={`https://www.ebi.ac.uk/ols4/search?q=${encodeURIComponent(disease.efo)}`}
           target="_blank" rel="noreferrer" className="mono">{disease.efo}</a>
      </div>
      <Disclaimer />

      <div className="spread">
        <h2>Drugs studied or approved for this indication</h2>
        {rows.length > 0 && (
          <button className="btn secondary" onClick={() => downloadCSV(
            `drugtargets_${disease.efo}.csv`,
            ['drug', 'chembl', 'drugType', 'stage'],
            rows.map(({ id, phase }) => {
              const d = drugs[String(id)];
              return [d.name, d.chembl, d.drugType, phaseLabel(phase)];
            }))}>Export CSV</button>
        )}
      </div>
      {err ? <EmptyState>Failed to load indications: {err}</EmptyState>
        : !ind ? <Loading label="Loading indications…" />
        : rows.length === 0 ? <EmptyState>No drugs in the dataset for this disease.</EmptyState>
        : (
          <>
            <p className="muted">{rows.length.toLocaleString()} drug{rows.length === 1 ? '' : 's'}
              {' '}(highest clinical stage reached for this indication).</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Drug</th><th>Type</th><th>Stage (this indication)</th><th>Targets</th></tr></thead>
                <tbody>
                  {rows.map(({ id, phase }) => {
                    const d = drugs[String(id)];
                    return (
                      <tr key={id}>
                        <td><Link to={`/drug/${encodeURIComponent(d.chembl)}`}>{d.name}</Link></td>
                        <td>{d.drugType || '—'}</td>
                        <td><PhaseTag phase={phase} /></td>
                        <td className="muted">{(d.pharmClass[0] || d.atcClass[0] || d.derivedClass[0]) ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
    </div>
  );
}
