import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from signmap import action_sign, sign_table  # noqa: E402


def test_positive_actions():
    for a in ["AGONIST", "Partial Agonist", "activator",
              "POSITIVE ALLOSTERIC MODULATOR", "POSITIVE MODULATOR",
              "OPENER", "STABILISER"]:
        assert action_sign(a) == 1, a


def test_negative_actions():
    for a in ["INHIBITOR", "ANTAGONIST", "INVERSE AGONIST", "BLOCKER",
              "NEGATIVE ALLOSTERIC MODULATOR", "NEGATIVE MODULATOR",
              "DISRUPTING AGENT"]:
        assert action_sign(a) == -1, a


def test_override_variants():
    assert action_sign("ANTISENSE INHIBITOR") == -1
    assert action_sign("RNAI INHIBITOR") == -1
    assert action_sign("ALLOSTERIC ANTAGONIST") == -1
    assert action_sign("DEGRADER") == -1


def test_ambiguous_and_unknown():
    for a in ["MODULATOR", "BINDING AGENT", "OTHER", "UNKNOWN",
              "VACCINE ANTIGEN", "RELEASING AGENT", "", None, "SOMETHING NEW"]:
        assert action_sign(a) == 0, a


def test_whitespace_and_case():
    assert action_sign("  inhibitor  ") == -1
    assert action_sign("Agonist") == 1


def test_sign_table_complete_and_consistent():
    table = sign_table()
    assert len(table) > 20
    for row in table:
        assert row["sign"] in (-1, 0, 1)
        # every listed actionType maps to its stated sign
        assert action_sign(row["actionType"]) == row["sign"]
