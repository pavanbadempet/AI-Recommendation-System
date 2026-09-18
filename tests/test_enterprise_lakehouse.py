"""Unit tests for APEX Enterprise Medallion Lakehouse Pipeline."""

import json
from pathlib import Path
import pyarrow.parquet as pq
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DATALAKE_DIR = DATA_DIR / "datalake"
GOLD_DIR = DATALAKE_DIR / "gold"
QUALITY_DIR = DATA_DIR / "quality"


def test_gold_tables_exist_and_populated():
    """Verify that all Gold layer tables are generated and populated."""
    gold_movies_path = GOLD_DIR / "dim_movies_scd2.parquet"
    gold_users_path = GOLD_DIR / "dim_users.parquet"
    gold_fact_path = GOLD_DIR / "fact_interactions.parquet"

    assert gold_movies_path.exists(), f"Missing {gold_movies_path}"
    assert gold_users_path.exists(), f"Missing {gold_users_path}"
    assert gold_fact_path.exists(), f"Missing {gold_fact_path}"

    movies_table = pq.read_table(gold_movies_path)
    users_table = pq.read_table(gold_users_path)
    fact_table = pq.read_table(gold_fact_path)

    assert len(movies_table) >= 50000
    assert len(users_table) >= 100
    assert len(fact_table) >= 1000


def test_scd_type_2_schema_contract():
    """Verify that dim_movies_scd2 adheres to SCD Type 2 data contract."""
    gold_movies_path = GOLD_DIR / "dim_movies_scd2.parquet"
    movies_table = pq.read_table(gold_movies_path)

    # Invariants for SCD Type 2
    assert "effective_start_at" in movies_table.column_names
    assert "effective_end_at" in movies_table.column_names
    assert "is_current" in movies_table.column_names
    assert "id" in movies_table.column_names
    assert "title" in movies_table.column_names
    assert "popularity" in movies_table.column_names

    # Check is_current boolean column
    is_current_col = movies_table["is_current"].to_pylist()
    assert all(is_current_col[:100])


def test_enterprise_lakehouse_audit_report():
    """Verify that the enterprise lakehouse audit summary is valid JSON and has high fidelity."""
    audit_file = QUALITY_DIR / "enterprise_lakehouse_audit.json"
    assert audit_file.exists(), f"Missing audit report: {audit_file}"

    with open(audit_file, "r", encoding="utf-8") as f:
        summary = json.load(f)

    assert summary["pipeline_name"] == "apex_enterprise_big_data_lakehouse"
    assert summary["total_records_processed"] >= 75000
    assert "stages" in summary
    assert "bronze_raw_ingestion" in summary["stages"]
    assert "silver_curation_contracts" in summary["stages"]
    assert "gold_dimensional_scd2" in summary["stages"]
    assert summary["overall_throughput_rows_per_sec"] > 1000
