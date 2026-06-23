import type { ReactNode } from 'react';
import type { Direction } from '../data/types';
import type { SortState } from '../lib/useSortable';

export function Disclaimer() {
  return (
    <div className="disclaimer" role="note">
      <strong>Hypothesis, not evidence.</strong> Generated from annotated drug–target
      mechanisms — not experimental proof of repurposing. <strong>Not for clinical use.</strong>
    </div>
  );
}

const DIR_LABEL: Record<Direction, string> = {
  activate: 'Activate',
  inhibit: 'Inhibit',
  ambiguous: 'Ambiguous',
};
const DIR_ICON: Record<Direction, string> = {
  activate: '▲',
  inhibit: '▼',
  ambiguous: '◆',
};

export function DirectionBadge({ direction }: { direction: Direction }) {
  return (
    <span className={`badge ${direction}`} title={`Direction: ${DIR_LABEL[direction]}`}>
      {DIR_ICON[direction]} {DIR_LABEL[direction]}
    </span>
  );
}

export function ScoreBar({ value }: { value: number }) {
  const pct = Math.round(value * 1000) / 10;
  return (
    <div className="scorebar">
      <div className="track"><div className="fill" style={{ width: `${pct}%` }} /></div>
      <span className="val">{value.toFixed(3)}</span>
    </div>
  );
}

export function phaseLabel(p: number): string {
  if (p >= 4) return 'Approved';
  if (p <= 0) return '—';
  return `Phase ${p}`;
}

export function PhaseTag({ phase }: { phase: number }) {
  if (phase >= 4) return <span className="badge activate">Approved</span>;
  if (phase <= 0) return <span className="tag">—</span>;
  return <span className="tag">Phase {phase}</span>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="state"><div className="spinner" /><div>{label}</div></div>;
}

/** Shimmer placeholder for a table while its data lazy-loads. */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-wrap" aria-hidden="true">
      <table>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((__, c) => (
                <td key={c}><span className="skeleton" style={{ width: `${60 - c * 8}%` }} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Clickable, sort-aware table header cell. */
export function SortHeader({ label, sortKey, sort, onSort }: {
  label: string; sortKey: string; sort: SortState | null; onSort: (k: string) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <th className="th-sort" onClick={() => onSort(sortKey)}
      aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {label}<span className={`sort-ind ${active ? 'on' : ''}`}>{active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="state">
      <div className="error-box">Something went wrong: {message}</div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="state">{children}</div>;
}
