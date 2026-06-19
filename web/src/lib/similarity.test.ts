import { describe, expect, it } from 'vitest';
import {
  buildVector, dot, norm, signedCosine, rescale, similarity, sharedTargets,
} from './similarity';
import type { IdfMap, TargetRow } from '../data/types';

// Mirrors the Python worked example (pipeline/tests/test_similarity.py).
// N = 4 drugs. Gene 1 targeted by 2 drugs -> IDF = ln 2; gene 2 by 1 -> IDF = ln 4.
const LN2 = Math.log(2);
const LN4 = Math.log(4);
const idf: IdfMap = { '1': LN2, '2': LN4 };

function rows(...rs: [number, number, -1 | 0 | 1][]): TargetRow[] {
  return rs.map(([g, ac, s]) => [g, ac, s, 0]);
}

describe('client-side signed cosine (fallback)', () => {
  it('builds signed vectors, dropping sign-0 targets', () => {
    const v = buildVector(rows([1, 0, -1], [2, 0, 0]), idf);
    expect(v.get(1)).toBeCloseTo(-LN2, 10);
    expect(v.has(2)).toBe(false); // sign 0 omitted
  });

  it('dot and norm are correct', () => {
    const a = buildVector(rows([1, 0, -1], [2, 0, -1]), idf);
    const b = buildVector(rows([1, 0, -1]), idf);
    expect(dot(a, b)).toBeCloseTo(LN2 * LN2, 10);
    expect(norm(b)).toBeCloseTo(LN2, 10);
  });

  it('concordant cosine matches hand calculation', () => {
    const a = buildVector(rows([1, 0, -1], [2, 0, -1]), idf);
    const b = buildVector(rows([1, 0, -1]), idf);
    expect(signedCosine(a, b)).toBeCloseTo(0.447214, 5);
    expect(rescale(signedCosine(a, b))).toBeCloseTo(0.723607, 5);
    expect(similarity(a, b)).toBeCloseTo(0.723607, 5);
  });

  it('opposite-sign single shared target gives cosine -1 -> similarity 0', () => {
    const b = buildVector(rows([1, 0, -1]), idf);
    const c = buildVector(rows([1, 0, 1]), idf);
    expect(signedCosine(b, c)).toBeCloseTo(-1, 10);
    expect(rescale(signedCosine(b, c))).toBeCloseTo(0, 10);
  });

  it('orthogonal (no shared targets) -> cosine 0 -> similarity 0.5', () => {
    const a = buildVector(rows([1, 0, -1]), idf);
    const d = buildVector(rows([2, 0, -1]), idf);
    expect(signedCosine(a, d)).toBe(0);
    expect(rescale(0)).toBe(0.5);
  });

  it('splits shared targets into concordant and discordant', () => {
    const a = buildVector(rows([1, 0, -1], [2, 0, -1]), idf);
    const b = buildVector(rows([1, 0, -1], [2, 0, 1]), idf);
    const { concordant, discordant } = sharedTargets(a, b);
    expect(concordant).toEqual([1]);
    expect(discordant).toEqual([2]);
  });
});
