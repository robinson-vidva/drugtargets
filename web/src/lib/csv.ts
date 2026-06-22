// Tiny dependency-free CSV export + browser download.
type Cell = string | number | boolean | null | undefined;

function esc(v: Cell): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCSV(filename: string, header: string[], rows: Cell[][]): void {
  const body = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
