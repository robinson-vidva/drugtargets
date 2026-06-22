import type { GeneId, IdfMap, Sign, TargetRow } from '../data/types';

export type SparseVec = Map<GeneId, number>;

/** Build a drug's signed sparse vector: component for gene t = sign * IDF_t (sign 0 omitted). */
export function buildVector(targets: TargetRow[], idf: IdfMap): SparseVec {
  const v: SparseVec = new Map();
  for (const [gid, , sign] of targets) {
    if (sign === 0) continue;
    const w = idf[String(gid)];
    if (w) v.set(gid, sign * w);
  }
  return v;
}

export function dot(a: SparseVec, b: SparseVec): number {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [g, w] of small) {
    const o = big.get(g);
    if (o !== undefined) s += w * o;
  }
  return s;
}

export function norm(a: SparseVec): number {
  let s = 0;
  for (const w of a.values()) s += w * w;
  return Math.sqrt(s);
}

/** Cosine of two signed vectors in [-1, 1]. */
export function signedCosine(a: SparseVec, b: SparseVec): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

/** Map cosine [-1,1] to similarity [0,1]. */
export function rescale(cos: number): number {
  return (cos + 1) / 2;
}

export function similarity(a: SparseVec, b: SparseVec): number {
  return rescale(signedCosine(a, b));
}

/** Shared targets split into concordant (same sign) and discordant (opposite sign). */
export function sharedTargets(a: SparseVec, b: SparseVec): {
  concordant: GeneId[]; discordant: GeneId[];
} {
  const concordant: GeneId[] = [];
  const discordant: GeneId[] = [];
  for (const [g, wa] of a) {
    const wb = b.get(g);
    if (wb === undefined) continue;
    const sa: Sign = wa > 0 ? 1 : -1;
    const sb: Sign = wb > 0 ? 1 : -1;
    (sa === sb ? concordant : discordant).push(g);
  }
  concordant.sort((x, y) => x - y);
  discordant.sort((x, y) => x - y);
  return { concordant, discordant };
}
