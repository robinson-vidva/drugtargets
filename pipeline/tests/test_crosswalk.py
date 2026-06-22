import gzip
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from crosswalk import _copy_rows, normalize_name  # noqa: E402


def test_normalize_strips_salt_suffixes():
    assert normalize_name("IMATINIB MESYLATE") == "IMATINIB"
    assert normalize_name("metformin hydrochloride") == "METFORMIN"
    assert normalize_name("warfarin sodium") == "WARFARIN"
    # multiple trailing salt/hydrate tokens
    assert normalize_name("X hydrochloride monohydrate") == "X"


def test_normalize_keeps_non_salt_tokens():
    # 'etexilate' is part of the active moiety name, not in the salt list
    assert normalize_name("DABIGATRAN ETEXILATE MESYLATE") == "DABIGATRAN ETEXILATE"
    assert normalize_name("") == ""
    assert normalize_name("ASPIRIN") == "ASPIRIN"


def test_copy_rows_parses_postgres_dump_block(tmp_path):
    dump = tmp_path / "d.sql.gz"
    content = (
        "SET statement_timeout = 0;\n"
        "COPY public.atc (id, code, name) FROM stdin;\n"
        "1\tL01EA01\tImatinib\n"
        "2\tL01EH01\tLapatinib\n"
        "\\.\n"
        "COPY public.other (x) FROM stdin;\n"
        "9\n"
        "\\.\n"
    )
    dump.write_bytes(gzip.compress(content.encode()))
    rows = list(_copy_rows(dump, "atc"))
    assert rows == [["1", "L01EA01", "Imatinib"], ["2", "L01EH01", "Lapatinib"]]
    # stops at the block's terminator, doesn't bleed into the next table
    assert all(r[0] != "9" for r in rows)
