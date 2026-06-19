"""Signed IDF-weighted cosine similarity (precompute side).

Per-drug sparse vector component for target t = sign(action) * IDF_t (sign 0 targets omitted).
similarity = cosine(a, b) rescaled to [0,1] via (cos + 1) / 2.

For each drug we keep the top-N neighbours plus the shared concordant (same-sign) and
discordant (opposite-sign) target gene ids, so the UI can explain *why* two drugs are similar.

The pure helpers (signed_cosine, rescale) mirror the client-side fallback util and are
unit-tested in pipeline/tests/test_similarity.py.
"""
from __future__ import annotations

import math


def dot(a: dict, b: dict) -> float:
    if len(a) > len(b):
        a, b = b, a
    return sum(w * b[g] for g, w in a.items() if g in b)


def norm(a: dict) -> float:
    return math.sqrt(sum(w * w for w in a.values()))


def signed_cosine(a: dict, b: dict) -> float:
    na, nb = norm(a), norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return dot(a, b) / (na * nb)


def rescale(cos: float) -> float:
    """Map cosine in [-1,1] to [0,1]."""
    return (cos + 1.0) / 2.0


def top_similar(vectors: dict, drug_targets: dict, top_n: int = 30, log=lambda *_: None):
    """Return {drugId: [[otherId, score, [concordant], [discordant]], ...]} top-N each."""
    norms = {d: norm(v) for d, v in vectors.items()}
    # postings: gene -> list of (drug, signed_weight) for drugs with nonzero sign on gene
    postings: dict[int, list] = {}
    for d, v in vectors.items():
        for g, w in v.items():
            postings.setdefault(g, []).append((d, w))

    result: dict[int, list] = {}
    drugs = sorted(vectors)
    total = len(drugs)
    for i, d in enumerate(drugs):
        if i and i % 1000 == 0:
            log(f"  similarity {i}/{total}")
        va = vectors[d]
        na = norms[d]
        if na == 0:
            continue
        acc: dict[int, float] = {}
        for g, wa in va.items():
            for d2, wb in postings[g]:
                if d2 != d:
                    acc[d2] = acc.get(d2, 0.0) + wa * wb
        scored = []
        for d2, dp in acc.items():
            nb = norms[d2]
            if nb == 0:
                continue
            cos = dp / (na * nb)
            scored.append((round(rescale(cos), 4), d2))
        if not scored:
            continue
        scored.sort(key=lambda x: (-x[0], x[1]))
        top = scored[:top_n]
        # signs for concordant/discordant: use vector sign (sign(w)) on shared genes
        sa = {g: (1 if w > 0 else -1) for g, w in va.items()}
        out = []
        for score, d2 in top:
            vb = vectors[d2]
            conc, disc = [], []
            for g, sgn in sa.items():
                if g in vb:
                    sb = 1 if vb[g] > 0 else -1
                    (conc if sgn == sb else disc).append(g)
            out.append([d2, score, sorted(conc), sorted(disc)])
        result[d] = out
    return result
