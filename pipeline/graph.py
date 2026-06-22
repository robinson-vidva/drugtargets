"""Pure drug-target graph construction: salt collapse + multi-source edge merge.

Extracted from build.py so the salt-collapse and primary-action logic is unit-tested
(pipeline/tests/test_graph.py) and can't silently regress in the quarterly rebuild.
"""
from __future__ import annotations

from collections import Counter, defaultdict

from signmap import action_sign


def canon(chembl: str, parent_of: dict) -> str:
    """Collapse a salt/ester ChEMBL id to its parent molecule (identity if no parent)."""
    return parent_of.get(chembl, chembl)


def build_pairs(ot_edges, iuphar_edges, parent_of):
    """Aggregate edges to one primary (action, sign, mechanism) per (parent_chembl, gene).

    ot_edges:     iterable of (chembl, ensembl, action, mechanism)
    iuphar_edges: iterable of (chembl, ensembl, action)
    parent_of:    {chembl: parent_chembl} salt->parent map
    Primary action = most frequent across sources (ties broken alphabetically); OT
    mechanism text is preferred. Returns {(chembl, ensembl): (action, sign, mechanism)}.
    """
    by_actions: dict[tuple, Counter] = defaultdict(Counter)
    by_mech: dict[tuple, dict] = defaultdict(dict)
    for chembl, ensembl, action, mech in ot_edges:
        key = (canon(chembl, parent_of), ensembl)
        by_actions[key][action] += 1
        if mech:
            by_mech[key].setdefault(action, mech)
    for chembl, ensembl, action in iuphar_edges:
        by_actions[(canon(chembl, parent_of), ensembl)][action] += 1

    pair_primary: dict[tuple, tuple] = {}
    for key, counter in by_actions.items():
        best = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        mech = by_mech[key].get(best) or next((m for m in by_mech[key].values()), "")
        pair_primary[key] = (best, action_sign(best), mech)
    return pair_primary
