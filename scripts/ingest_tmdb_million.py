"""
TMDB 1.2M+ Catalog Ingestion & Medallion Lakehouse Pipeline.

Ingests, validates, and partitions the complete TMDB export catalog (1,245,400+ movies)
into the Medallion Lakehouse (Bronze raw -> Silver curated dim_movies).
Enriches existing records with full semantic metadata, genres, and popularity scores.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone, timedelta
import gzip
import json
import logging
import os
from pathlib import Path
import sys
import time
import urllib.request

import pyarrow as pa
import pyarrow.parquet as pq

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("apex.ingest_tmdb_1m")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DATALAKE_DIR = DATA_DIR / "datalake"
BRONZE_DIR = DATALAKE_DIR / "bronze"
SILVER_DIR = DATALAKE_DIR / "silver"
QUALITY_DIR = DATA_DIR / "quality"
PROCESSED_CATALOG = DATA_DIR / "processed" / "movies_transformed.parquet"


def get_latest_tmdb_export_url() -> tuple[str, str]:
    """Find the most recent available TMDB daily export URL."""
    today = datetime.now(timezone.utc)
    for days_ago in range(4):
        date_cand = today - timedelta(days=days_ago)
        date_str = date_cand.strftime("%m_%d_%Y")
        url = f"http://files.tmdb.org/p/exports/movie_ids_{date_str}.json.gz"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (APEX-Lakehouse/2.0)"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status == 200:
                    cl = resp.headers.get("content-length", "unknown")
                    logger.info("Found TMDB export for %s (Size: %s bytes)", date_str, cl)
                    return url, date_str
        except Exception:
            continue
    raise RuntimeError("Could not find an active TMDB export in the last 4 days.")


def load_enriched_metadata_lookup() -> dict[int, dict]:
    """Load existing curated metadata from processed catalog for join enrichment."""
    lookup = {}
    if not PROCESSED_CATALOG.exists():
        logger.warning("Processed catalog %s not found, continuing without enrichment join", PROCESSED_CATALOG)
        return lookup

    logger.info("Loading existing curated metadata from %s...", PROCESSED_CATALOG)
    table = pq.read_table(
        PROCESSED_CATALOG,
        columns=["id", "overview", "genres", "vote_average", "vote_count", "release_date", "poster_path"],
    )
    for batch in table.to_batches():
        ids = batch.column("id").to_pylist()
        overviews = batch.column("overview").to_pylist()
        genres = batch.column("genres").to_pylist()
        vas = batch.column("vote_average").to_pylist()
        vcs = batch.column("vote_count").to_pylist()
        rds = batch.column("release_date").to_pylist()
        pps = batch.column("poster_path").to_pylist()

        for idx, mid in enumerate(ids):
            if mid is not None:
                lookup[int(mid)] = {
                    "overview": overviews[idx],
                    "genres": genres[idx],
                    "vote_average": vas[idx] if vas[idx] is not None else 0.0,
                    "vote_count": vcs[idx] if vcs[idx] is not None else 0.0,
                    "release_date": rds[idx],
                    "poster_path": pps[idx],
                }
    logger.info("Loaded %d enriched movies into memory lookup", len(lookup))
    return lookup


def run_ingestion(limit: int | None = None) -> dict:
    """Execute streaming ingestion and Medallion Lakehouse partitioning."""
    start_time = time.time()
    url, date_str = get_latest_tmdb_export_url()

    BRONZE_DIR.mkdir(parents=True, exist_ok=True)
    SILVER_DIR.mkdir(parents=True, exist_ok=True)
    QUALITY_DIR.mkdir(parents=True, exist_ok=True)

    lookup = load_enriched_metadata_lookup()

    logger.info("Streaming and parsing TMDB 1.2M+ export from %s...", url)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (APEX-Lakehouse/2.0)"})

    raw_ids = []
    raw_titles = []
    raw_popularities = []
    raw_adults = []
    raw_videos = []

    # Enriched silver fields
    silver_overviews = []
    silver_genres = []
    silver_vote_averages = []
    silver_vote_counts = []
    silver_release_dates = []
    silver_poster_paths = []
    silver_is_enriched = []

    count = 0
    with urllib.request.urlopen(req) as resp:
        with gzip.GzipFile(fileobj=resp) as gz:
            for line in gz:
                try:
                    record = json.loads(line.decode("utf-8", errors="ignore"))
                except Exception:
                    continue

                mid = record.get("id")
                if mid is None:
                    continue

                raw_ids.append(int(mid))
                raw_titles.append(str(record.get("original_title") or ""))
                raw_popularities.append(float(record.get("popularity") or 0.0))
                raw_adults.append(bool(record.get("adult", False)))
                raw_videos.append(bool(record.get("video", False)))

                enrichment = lookup.get(int(mid))
                if enrichment:
                    silver_overviews.append(enrichment.get("overview"))
                    g = enrichment.get("genres")
                    if isinstance(g, list):
                        silver_genres.append(", ".join(g))
                    else:
                        silver_genres.append(str(g or ""))
                    silver_vote_averages.append(float(enrichment.get("vote_average") or 0.0))
                    silver_vote_counts.append(float(enrichment.get("vote_count") or 0.0))
                    silver_release_dates.append(enrichment.get("release_date"))
                    silver_poster_paths.append(enrichment.get("poster_path"))
                    silver_is_enriched.append(True)
                else:
                    silver_overviews.append(None)
                    silver_genres.append(None)
                    silver_vote_averages.append(0.0)
                    silver_vote_counts.append(0.0)
                    silver_release_dates.append(None)
                    silver_poster_paths.append(None)
                    silver_is_enriched.append(False)

                count += 1
                if count % 250000 == 0:
                    logger.info("Processed %d / 1,245,000+ movies...", count)

                if limit and count >= limit:
                    break

    ingest_latency = time.time() - start_time
    logger.info("Streamed %d records in %.2f seconds (%.0f rows/sec)", count, ingest_latency, count / max(ingest_latency, 0.001))

    # Construct Arrow Tables
    logger.info("Building PyArrow Bronze raw and Silver curated tables...")
    bronze_table = pa.Table.from_arrays(
        [
            pa.array(raw_ids, type=pa.int64()),
            pa.array(raw_titles, type=pa.string()),
            pa.array(raw_popularities, type=pa.float64()),
            pa.array(raw_adults, type=pa.bool_()),
            pa.array(raw_videos, type=pa.bool_()),
        ],
        names=["id", "title", "popularity", "adult", "video"],
    )

    silver_table = pa.Table.from_arrays(
        [
            pa.array(raw_ids, type=pa.int64()),
            pa.array(raw_titles, type=pa.string()),
            pa.array(raw_popularities, type=pa.float64()),
            pa.array(raw_adults, type=pa.bool_()),
            pa.array(silver_overviews, type=pa.string()),
            pa.array(silver_genres, type=pa.string()),
            pa.array(silver_vote_averages, type=pa.float64()),
            pa.array(silver_vote_counts, type=pa.float64()),
            pa.array(silver_release_dates, type=pa.string()),
            pa.array(silver_poster_paths, type=pa.string()),
            pa.array(silver_is_enriched, type=pa.bool_()),
        ],
        names=[
            "id",
            "title",
            "popularity",
            "adult",
            "overview",
            "genres",
            "vote_average",
            "vote_count",
            "release_date",
            "poster_path",
            "is_enriched",
        ],
    )

    bronze_path = BRONZE_DIR / f"movies_raw_{date_str}.parquet"
    silver_path = SILVER_DIR / "dim_movies_1m.parquet"

    logger.info("Writing Bronze raw table to %s (Snappy compressed)...", bronze_path)
    pq.write_table(bronze_table, bronze_path, compression="snappy")

    logger.info("Writing Silver curated table to %s (Snappy compressed)...", silver_path)
    pq.write_table(silver_table, silver_path, compression="snappy")

    bronze_size_mb = os.path.getsize(bronze_path) / (1024 * 1024)
    silver_size_mb = os.path.getsize(silver_path) / (1024 * 1024)
    total_time = time.time() - start_time

    enriched_count = sum(silver_is_enriched)

    summary = {
        "dataset_name": "tmdb_million_movies",
        "export_date": date_str,
        "total_movies_ingested": count,
        "enriched_movies_count": enriched_count,
        "enrichment_ratio": round(enriched_count / max(count, 1), 4),
        "bronze_parquet_mb": round(bronze_size_mb, 2),
        "silver_parquet_mb": round(silver_size_mb, 2),
        "total_pipeline_time_seconds": round(total_time, 2),
        "throughput_rows_per_second": round(count / max(total_time, 0.001), 1),
        "bronze_path": str(bronze_path),
        "silver_path": str(silver_path),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }

    quality_file = QUALITY_DIR / "tmdb_1m_ingestion_summary.json"
    with open(quality_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    logger.info("=========================================================")
    logger.info("✅ SUCCESS: INGESTED %s MOVIES IN %.2f SECONDS!", f"{count:,}", total_time)
    logger.info("   Bronze Table: %s (%.2f MB)", bronze_path.name, bronze_size_mb)
    logger.info("   Silver Table: %s (%.2f MB)", silver_path.name, silver_size_mb)
    logger.info("   Enriched: %d / %d (%.2f%%)", enriched_count, count, 100 * enriched_count / count)
    logger.info("=========================================================")

    return summary


def main():
    parser = argparse.ArgumentParser(description="Ingest TMDB 1.2M+ Catalog into Medallion Lakehouse")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of rows for dry-run testing")
    args = parser.parse_args()

    run_ingestion(limit=args.limit)


if __name__ == "__main__":
    main()
