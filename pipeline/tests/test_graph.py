import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from graph import build_pairs, canon  # noqa: E402

# salt CHEMBL_S -> parent CHEMBL_P; CHEMBL_P and CHEMBL_X are parents (no entry)
PARENT = {"CHEMBL_S": "CHEMBL_P"}


def test_canon_collapses_salt_to_parent():
    assert canon("CHEMBL_S", PARENT) == "CHEMBL_P"
    assert canon("CHEMBL_P", PARENT) == "CHEMBL_P"   # identity when no parent
    assert canon("CHEMBL_X", PARENT) == "CHEMBL_X"


def test_salt_and_parent_edges_merge_onto_parent():
    # parent inhibits G1; salt inhibits G2 -> both attributed to the parent
    ot = [
        ("CHEMBL_P", "ENSG1", "INHIBITOR", "parent mech"),
        ("CHEMBL_S", "ENSG2", "INHIBITOR", "salt mech"),
    ]
    pairs = build_pairs(ot, [], PARENT)
    assert set(pairs) == {("CHEMBL_P", "ENSG1"), ("CHEMBL_P", "ENSG2")}
    assert "CHEMBL_S" not in {k[0] for k in pairs}
    assert pairs[("CHEMBL_P", "ENSG1")] == ("INHIBITOR", -1, "parent mech")


def test_primary_action_is_most_frequent():
    ot = [
        ("CHEMBL_P", "ENSG1", "INHIBITOR", ""),
        ("CHEMBL_P", "ENSG1", "INHIBITOR", "m"),
        ("CHEMBL_P", "ENSG1", "AGONIST", ""),
    ]
    action, sign, _ = build_pairs(ot, [], PARENT)[("CHEMBL_P", "ENSG1")]
    assert action == "INHIBITOR" and sign == -1


def test_iuphar_edges_merge_and_vote():
    # OT has one AGONIST; IUPHAR adds two INHIBITOR votes -> INHIBITOR wins
    ot = [("CHEMBL_P", "ENSG1", "AGONIST", "")]
    iuphar = [("CHEMBL_P", "ENSG1", "INHIBITOR"), ("CHEMBL_S", "ENSG1", "INHIBITOR")]
    action, sign, _ = build_pairs(ot, iuphar, PARENT)[("CHEMBL_P", "ENSG1")]
    assert action == "INHIBITOR" and sign == -1


def test_iuphar_only_pair_appears():
    pairs = build_pairs([], [("CHEMBL_X", "ENSG9", "AGONIST")], PARENT)
    assert pairs[("CHEMBL_X", "ENSG9")] == ("AGONIST", 1, "")


def test_ot_mechanism_preferred_over_empty():
    ot = [("CHEMBL_P", "ENSG1", "INHIBITOR", "real mech")]
    iuphar = [("CHEMBL_P", "ENSG1", "INHIBITOR")]
    assert build_pairs(ot, iuphar, PARENT)[("CHEMBL_P", "ENSG1")][2] == "real mech"
