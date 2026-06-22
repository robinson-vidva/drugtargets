import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from signmap import action_sign, iuphar_action, sign_table  # noqa: E402


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


def test_iuphar_direct_types():
    assert iuphar_action("Inhibitor", "Inhibition") == "INHIBITOR"
    assert iuphar_action("Agonist", "Agonist") == "AGONIST"
    assert iuphar_action("Antagonist", "Antagonist") == "ANTAGONIST"
    assert iuphar_action("Channel blocker", "") == "BLOCKER"
    assert iuphar_action("Gating inhibitor", "") == "INHIBITOR"
    assert iuphar_action("Activator", "") == "ACTIVATOR"


def test_iuphar_allosteric_uses_action():
    assert iuphar_action("Allosteric modulator", "Activation") == "POSITIVE ALLOSTERIC MODULATOR"
    assert iuphar_action("Allosteric modulator", "Inhibition") == "NEGATIVE ALLOSTERIC MODULATOR"
    assert iuphar_action("Allosteric modulator", "") == "MODULATOR"


def test_iuphar_fallback_and_signs_resolve():
    # Antibody / None fall back to the Action column
    assert iuphar_action("Antibody", "Inhibition") == "INHIBITOR"
    assert iuphar_action("None", "Activation") == "ACTIVATOR"
    assert iuphar_action("Fusion protein", "") == "OTHER"
    # mapped labels must resolve to a valid sign
    for t, a in [("Inhibitor", "Inhibition"), ("Agonist", ""), ("Allosteric modulator", "Activation")]:
        assert action_sign(iuphar_action(t, a)) in (-1, 0, 1)
