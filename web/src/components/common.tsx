import type { ReactNode } from 'react';
import type { Direction } from '../data/types';

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

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="state"><div className="spinner" /><div>{label}</div></div>;
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
