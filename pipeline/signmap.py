"""ChEMBL action_type -> direction sign mapping.

Single source of truth for the sign of a mechanism's effect on its target:
  +1 = activates / increases function
  -1 = inhibits / decreases function
   0 = ambiguous / not clearly directional

The canonical lists below come directly from the build spec. The OVERRIDES dict
normalises common ChEMBL variant labels (e.g. "ANTISENSE INHIBITOR") to the sign
of their parent type. Everything not clearly positive or negative is 0.

This module is pure and unit-tested (pipeline/tests/test_signmap.py). The full table
is exported via sign_table() for the in-app Methods page (auditable).
"""
from __future__ import annotations

# Canonical positive (+1) and negative (-1) action types (per spec).
POSITIVE = {
    "AGONIST",
    "PARTIAL AGONIST",
    "ACTIVATOR",
    "POSITIVE ALLOSTERIC MODULATOR",
    "POSITIVE MODULATOR",
    "OPENER",
    "STABILISER",
}
NEGATIVE = {
    "INHIBITOR",
    "ANTAGONIST",
    "INVERSE AGONIST",
    "BLOCKER",
    "NEGATIVE ALLOSTERIC MODULATOR",
    "NEGATIVE MODULATOR",
    "DISRUPTING AGENT",
}

# Variant labels mapped to a parent sign (override dict).
OVERRIDES = {
    "ANTISENSE INHIBITOR": -1,
    "RNAI INHIBITOR": -1,
    "ALLOSTERIC ANTAGONIST": -1,
    "DEGRADER": -1,
}

# Action types deliberately treated as ambiguous (0) — listed for the audit table.
AMBIGUOUS = {
    "MODULATOR",
    "BINDING AGENT",
    "OTHER",
    "UNKNOWN",
    "EXOGENOUS PROTEIN",
    "EXOGENOUS GENE",
    "VACCINE ANTIGEN",
    "RELEASING AGENT",
    "CROSS-LINKING AGENT",
    "SUBSTRATE",
    "HYDROLYTIC ENZYME",
    "PROTEOLYTIC ENZYME",
}


def normalise(action_type: str | None) -> str:
    return (action_type or "").strip().upper()


def action_sign(action_type: str | None) -> int:
    """Return +1, -1, or 0 for a ChEMBL action_type string."""
    at = normalise(action_type)
    if not at:
        return 0
    if at in OVERRIDES:
        return OVERRIDES[at]
    if at in POSITIVE:
        return 1
    if at in NEGATIVE:
        return -1
    return 0


def sign_table() -> list[dict]:
    """Ordered, de-duplicated table for the Methods page."""
    rows: list[dict] = []
    for at in sorted(POSITIVE):
        rows.append({"actionType": at, "sign": 1})
    for at in sorted(NEGATIVE):
        rows.append({"actionType": at, "sign": -1})
    for at, s in sorted(OVERRIDES.items()):
        rows.append({"actionType": at, "sign": s})
    for at in sorted(AMBIGUOUS):
        rows.append({"actionType": at, "sign": 0})
    return rows
