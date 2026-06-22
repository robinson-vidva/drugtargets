import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

pytest.importorskip("rdkit")  # structural sim is an optional pipeline dependency

from structure import morgan_fingerprints, top_structural  # noqa: E402

SMILES = {
    1: "CC(=O)OC1=CC=CC=C1C(=O)O",   # aspirin
    2: "CC(=O)OC1=CC=CC=C1C(=O)O",   # aspirin (duplicate)
    3: "CC(=O)NC1=CC=C(O)C=C1",      # paracetamol (different)
    4: "not a smiles",               # unparseable -> dropped
}


def test_fingerprints_drop_unparseable():
    fps = morgan_fingerprints(SMILES)
    assert set(fps) == {1, 2, 3}     # id 4 dropped


def test_identical_molecules_are_tanimoto_1():
    res = top_structural(morgan_fingerprints(SMILES), top_n=5, min_sim=0.0)
    # aspirin (1) vs its duplicate (2) must be the top neighbour at 1.0
    top_other, top_sim = res[1][0]
    assert top_other == 2 and top_sim == 1.0


def test_different_molecules_below_one_and_ordered():
    res = top_structural(morgan_fingerprints(SMILES), top_n=5, min_sim=0.0)
    sims = [s for _o, s in res[1]]
    assert sims == sorted(sims, reverse=True)        # descending
    para = next(s for o, s in res[1] if o == 3)
    assert 0.0 <= para < 1.0                          # paracetamol < identical


def test_min_sim_filters():
    res = top_structural(morgan_fingerprints(SMILES), top_n=5, min_sim=0.99)
    # only the identical pair survives a 0.99 threshold
    assert all(s >= 0.99 for neigh in res.values() for _o, s in neigh)
