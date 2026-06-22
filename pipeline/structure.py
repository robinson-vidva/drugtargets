"""Chemical-structure similarity (Morgan/ECFP4 fingerprints + Tanimoto).

A second similarity axis, complementary to the target-based signed cosine. The interesting
repurposing signal is the disagreement between the two (same targets / different scaffold,
or similar structure / different annotated target).

RDKit is an offline-pipeline-only dependency (never shipped to the browser).
"""
from __future__ import annotations

N_BITS = 2048
RADIUS = 2


def morgan_fingerprints(smiles_by_drug: dict[int, str]):
    """{drugInt: ECFP4 bit-vector} for drugs with a parseable SMILES."""
    from rdkit import Chem
    from rdkit.Chem import rdFingerprintGenerator

    gen = rdFingerprintGenerator.GetMorganGenerator(radius=RADIUS, fpSize=N_BITS)
    fps = {}
    for di, smi in smiles_by_drug.items():
        if not smi:
            continue
        mol = Chem.MolFromSmiles(smi)
        if mol is not None:
            fps[di] = gen.GetFingerprint(mol)
    return fps


def top_structural(fps, top_n: int = 20, min_sim: float = 0.3, log=lambda *_: None):
    """{drugInt: [[otherId, tanimoto], ...]} top-N Tanimoto neighbours (>= min_sim)."""
    from rdkit import DataStructs

    ids = sorted(fps)
    bvs = [fps[i] for i in ids]
    result = {}
    for idx, di in enumerate(ids):
        if idx and idx % 1000 == 0:
            log(f"  structural {idx}/{len(ids)}")
        sims = DataStructs.BulkTanimotoSimilarity(bvs[idx], bvs)
        scored = [(round(s, 4), ids[j]) for j, s in enumerate(sims)
                  if ids[j] != di and s >= min_sim]
        if not scored:
            continue
        scored.sort(key=lambda x: (-x[0], x[1]))
        result[di] = [[oid, s] for s, oid in scored[:top_n]]
    return result
