import { useData } from '../data/DataContext';
import { Disclaimer } from '../components/common';

// Phase 2 baseline Methods page — expanded with the worked example, full sign table
// and license/caveat detail in Phase 4.
export default function MethodsPage() {
  const { meta } = useData();
  return (
    <div>
      <h1>Methods</h1>
      <Disclaimer />
      <p className="lede">How drugtargets is built and what it does (and does not) mean.</p>

      <h2>Data sources</h2>
      <ul>
        {meta?.licenses.map((l) => (
          <li key={l.source}>{l.source} {l.version} — <span className="muted">{l.license}</span></li>
        ))}
      </ul>

      <h2>Similarity</h2>
      <p>Per-drug sparse vector component for target <em>t</em> = sign(action) × IDF<sub>t</sub>,
        where IDF<sub>t</sub> = log(N / n<sub>t</sub>). Similarity = cosine of the signed
        vectors, rescaled to [0,1] via (cos + 1) / 2.</p>

      <p className="muted">Build {meta?.buildDate} · Open Targets {meta?.otRelease}.</p>
    </div>
  );
}
