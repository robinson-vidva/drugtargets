import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from similarity import rescale, signed_cosine, top_similar  # noqa: E402

# Hand-checked worked example (mirrors the Methods page).
# N = 4 drugs. Gene T1 targeted by 2 drugs, gene T2 by 1 drug.
N = 4
IDF_T1 = math.log(N / 2)  # ln 2 = 0.693147
IDF_T2 = math.log(N / 1)  # ln 4 = 1.386294


def test_idf_values():
    assert abs(IDF_T1 - 0.693147) < 1e-5
    assert abs(IDF_T2 - 1.386294) < 1e-5


def test_concordant_cosine():
    # Drug A inhibits T1 & T2; Drug B inhibits T1. Shared T1 same sign.
    A = {1: -IDF_T1, 2: -IDF_T2}
    B = {1: -IDF_T1}
    cos = signed_cosine(A, B)
    # dot = IDF_T1^2 ; |A| = sqrt(IDF_T1^2+IDF_T2^2) ; |B| = IDF_T1
    expected = (IDF_T1 ** 2) / (math.sqrt(IDF_T1 ** 2 + IDF_T2 ** 2) * IDF_T1)
    assert abs(cos - expected) < 1e-9
    assert abs(cos - 0.447214) < 1e-5
    assert abs(rescale(cos) - 0.723607) < 1e-5


def test_discordant_opposite_sign_is_minus_one():
    # B inhibits T1, C activates T1 -> opposite sign, single shared target.
    B = {1: -IDF_T1}
    C = {1: +IDF_T1}
    assert abs(signed_cosine(B, C) - (-1.0)) < 1e-9
    assert abs(rescale(signed_cosine(B, C)) - 0.0) < 1e-9


def test_orthogonal_no_shared_targets():
    A = {1: -IDF_T1}
    D = {2: -IDF_T2}
    assert signed_cosine(A, D) == 0.0
    assert rescale(0.0) == 0.5


def test_top_similar_concordant_discordant_lists():
    vectors = {
        0: {1: -IDF_T1, 2: -IDF_T2},  # A
        1: {1: -IDF_T1},              # B
        2: {1: +IDF_T1},              # C (opposite on T1)
    }
    drug_targets = {0: [], 1: [], 2: []}
    sim = top_similar(vectors, drug_targets, top_n=30)
    # B's neighbours: A (concordant T1) ranks above C (discordant T1)
    b = sim[1]
    assert b[0][0] == 0  # A is closest
    assert b[0][2] == [1] and b[0][3] == []          # concordant T1, no discordant
    # C vs B is discordant on T1
    c_entry = next(e for e in b if e[0] == 2)
    assert c_entry[2] == [] and c_entry[3] == [1]
    assert abs(c_entry[1] - 0.0) < 1e-9
