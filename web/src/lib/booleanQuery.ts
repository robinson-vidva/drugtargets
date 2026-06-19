import type { DrugId, GeneId, GeneDrugsMap } from '../data/types';

export type BoolOp = 'AND' | 'OR';

/**
 * Resolve drugs that target the given genes under AND (intersection) or OR (union),
 * using the precomputed inverted index + native Set ops.
 */
export function booleanGeneQuery(
  geneIds: GeneId[],
  op: BoolOp,
  geneDrugs: GeneDrugsMap,
): DrugId[] {
  if (geneIds.length === 0) return [];
  const lists = geneIds.map((g) => new Set(geneDrugs[String(g)] ?? []));
  if (lists.some((s) => s.size === 0) && op === 'AND') {
    // a gene with no drugs makes the AND empty
    return [];
  }
  let acc: Set<DrugId>;
  if (op === 'AND') {
    // start from smallest set for efficiency
    acc = new Set(lists.reduce((a, b) => (a.size <= b.size ? a : b)));
    for (const s of lists) {
      if (s === acc) continue;
      for (const d of [...acc]) if (!s.has(d)) acc.delete(d);
    }
  } else {
    acc = new Set<DrugId>();
    for (const s of lists) for (const d of s) acc.add(d);
  }
  return [...acc];
}
