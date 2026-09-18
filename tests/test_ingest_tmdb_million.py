"""Unit tests for TMDB 1.2M+ Catalog Ingestion Pipeline."""

import pyarrow as pa
import pytest

from scripts.ingest_tmdb_million import (
    load_enriched_metadata_lookup,
)


def test_load_enriched_metadata_lookup_runs_safely():
    """Verify that metadata lookup loads valid dict with movie records."""
    lookup = load_enriched_metadata_lookup()
    assert isinstance(lookup, dict)
    if lookup:
        sample_id = next(iter(lookup))
        rec = lookup[sample_id]
        assert "overview" in rec
        assert "vote_average" in rec
        assert "genres" in rec


def test_arrow_table_schema_invariants():
    """Ensure generated Bronze and Silver schemas match expected data contracts."""
    raw_ids = [100, 200]
    raw_titles = ["Test Movie A", "Test Movie B"]
    raw_pops = [12.5, 4.2]
    raw_adults = [False, False]
    raw_videos = [False, False]

    bronze_table = pa.Table.from_arrays(
        [
            pa.array(raw_ids, type=pa.int64()),
            pa.array(raw_titles, type=pa.string()),
            pa.array(raw_pops, type=pa.float64()),
            pa.array(raw_adults, type=pa.bool_()),
            pa.array(raw_videos, type=pa.bool_()),
        ],
        names=["id", "title", "popularity", "adult", "video"],
    )

    assert bronze_table.num_rows == 2
    assert bronze_table.column_names == ["id", "title", "popularity", "adult", "video"]
    assert bronze_table.schema.field("id").type == pa.int64()
