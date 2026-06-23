import { useEffect, useState } from 'react';

/** A number persisted to localStorage (used for the remembered page size). */
export function usePersistentNumber(key: string, initial: number): [number, (n: number) => void] {
  const [value, setValue] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(key);
      const n = raw == null ? NaN : Number(raw);
      return Number.isFinite(n) ? n : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
  }, [key, value]);
  return [value, setValue];
}
