import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../data/DataContext';
import type { GeneId, SimilarMap } from '../data/types';
import { ScoreBar, EmptyState, Loading } from './common';

function GeneChips({ ids, kind, genes }:
  { ids: GeneId[]; kind: 'concordant' | 'discordant'; genes: Record<string, { symbol: string }> }) {
  const [expanded, setExpanded] = useState(false);
  if (ids.length === 0) return <span className="muted">—</span>;
  const shown = expanded ? ids : ids.slice(0, 6);
  return (
    <div className="chip-row">
      {shown.map((g) => {
        const sym = genes[String(g)]?.symbol ?? String(g);
        return (
          <Link key={g} className={`gene-chip ${kind}`} to={`/genes?q=${encodeURIComponent(sym)}`}>
            {sym}
          </Link>
        );
      })}
      {ids.length > 6 && (
        <button className="tag" style={{ cursor: 'pointer' }} onClick={() => setExpanded((x) => !x)}>
          {expanded ? 'show less' : `+${ids.length - 6} more`}
        </button>
      )}
    </div>
  );
}

function EgoNetwork({ drugId, entries }:
  { drugId: number; entries: SimilarMap[string] }) {
  const { drugs } = useData();
  const navigate = useNavigate();
  const nodes = entries.slice(0, 8);
  const W = 560, H = 360, cx = W / 2, cy = H / 2, R = 130;
  if (!drugs) return null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block', margin: '8px auto' }}
      role="img" aria-label="Similar-drug ego network">
      {nodes.map((e, i) => {
        const ang = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
        const score = e[1];
        return <line key={`l${e[0]}`} x1={cx} y1={cy} x2={x} y2={y}
          stroke="var(--accent)" strokeOpacity={0.2 + score * 0.7} strokeWidth={1 + score * 4} />;
      })}
      {nodes.map((e, i) => {
        const ang = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
        const d = drugs[String(e[0])];
        const label = (d?.name ?? String(e[0])).slice(0, 16);
        return (
          <g key={`n${e[0]}`} style={{ cursor: 'pointer' }}
            onClick={() => d && navigate(`/drug/${encodeURIComponent(d.chembl)}`)}>
            <circle cx={x} cy={y} r={9} fill="var(--surface-2)" stroke="var(--accent)" strokeWidth={1.5} />
            <text x={x} y={y - 14} textAnchor="middle" fontSize={11} fill="var(--text)">{label}</text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={13} fill="var(--accent)" />
      <text x={cx} y={cy + 30} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text)">
        {(drugs[String(drugId)]?.name ?? '').slice(0, 18)}
      </text>
    </svg>
  );
}

export function SimilarDrugs({ drugId }: { drugId: number }) {
  const { drugs, genes, loadSimilar } = useData();
  const [similar, setSimilar] = useState<SimilarMap | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showNet, setShowNet] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSimilar()
      .then((s) => { if (!cancelled) setSimilar(s); })
      .catch((e) => { if (!cancelled) setErr(String(e)); });
    return () => { cancelled = true; };
  }, [loadSimilar]);

  const entries = useMemo(() => similar?.[String(drugId)] ?? [], [similar, drugId]);

  return (
    <>
      <div className="spread" style={{ marginTop: 4 }}>
        <h2>Similar drugs</h2>
        {entries.length > 0 && (
          <button className="btn secondary" onClick={() => setShowNet((x) => !x)}>
            {showNet ? 'Hide network' : 'Show network'}
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Ranked by signed IDF-weighted cosine of shared targets.
        <span className="gene-chip concordant" style={{ marginLeft: 8 }}>concordant</span> = same
        direction, <span className="gene-chip discordant">discordant</span> = opposite.
      </p>

      {err ? <EmptyState>Failed to load similar drugs: {err}</EmptyState>
        : !similar ? <Loading label="Loading similar drugs…" />
        : entries.length === 0 ? <EmptyState>No similar drugs (drug has no signed targets).</EmptyState>
        : (
          <>
            {showNet && genes && drugs && <EgoNetwork drugId={drugId} entries={entries} />}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Drug</th><th>Similarity</th>
                    <th>Concordant targets</th><th>Discordant targets</th></tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => {
                    const [other, score, conc, disc] = e;
                    const d = drugs![String(other)];
                    if (!d) return null;
                    return (
                      <tr key={other}>
                        <td className="muted">{i + 1}</td>
                        <td><Link to={`/drug/${encodeURIComponent(d.chembl)}`}>{d.name}</Link>
                          <div className="muted mono" style={{ fontSize: '0.8rem' }}>{d.chembl}</div></td>
                        <td><ScoreBar value={score} /></td>
                        <td><GeneChips ids={conc} kind="concordant" genes={genes!} /></td>
                        <td><GeneChips ids={disc} kind="discordant" genes={genes!} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
    </>
  );
}
