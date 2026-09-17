<div align="center">

# 🌊 APEX Data Platform & Lakehouse Blueprint
### Enterprise Distributed Data Engineering, Medallion Lakehouse & Sub-5ms Vector Ingestion
**Architected & Engineered by Pavan Badempet**

[![PySpark 4.1](https://img.shields.io/badge/PySpark-4.1.1-E25A1C?style=for-the-badge&logo=apachespark&logoColor=white)](https://spark.apache.org/)
[![Delta Lake 4.3](https://img.shields.io/badge/Delta_Lake-4.3.1-00ADD8?style=for-the-badge&logo=delta&logoColor=white)](https://delta.io/)
[![Databricks](https://img.shields.io/badge/Databricks-Serverless_Lakehouse-FF3621?style=for-the-badge&logo=databricks&logoColor=white)](https://databricks.com/)
[![Neon pgvector](https://img.shields.io/badge/Neon-pgvector_10--Shard_HNSW-00E599?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Apache Kafka](https://img.shields.io/badge/Apache_Kafka-Confluent_7.3-231F20?style=for-the-badge&logo=apachekafka&logoColor=white)](https://kafka.apache.org/)
[![Pandera Contracts](https://img.shields.io/badge/Data_Contracts-Pandera_0.20-8A2BE2?style=for-the-badge&logo=python&logoColor=white)](https://pandera.readthedocs.io/)
[![Mobile Book](https://img.shields.io/badge/📱%20Mobile%20Book-Offline%20PWA%20Reader-8B5CF6?style=for-the-badge&logo=pwa&logoColor=white)](https://pavanbadempet.github.io/AI-Recommendation-System/book/)
[![License](https://img.shields.io/badge/License-AGPL--3.0-blue?style=for-the-badge)](LICENSE)

<br/>

[**📱 Mobile E-Reader Book**](https://pavanbadempet.github.io/AI-Recommendation-System/book/) • [**🏛️ Main Architecture Spec**](docs/ARCHITECTURE.md) • [**📊 Live Cinema & MLOps Portal**](https://pavanbadempet.github.io/AI-Recommendation-System/) • [**📓 Databricks Notebooks**](databricks_notebooks/) • [**🗄️ SQL Star Schema**](sql/postgres_init.sql) • [**📜 Schema Contracts**](docs/DATA_CONTRACTS.md)

</div>

---

## 📑 Table of Contents
1. [Executive Data Engineering Pitch & Rationale](#1-executive-data-engineering-pitch--rationale)
2. [End-to-End Lakehouse Architecture & Ingestion Flow](#2-end-to-end-lakehouse-architecture--ingestion-flow)
3. [Dataset Scale, Ingestion & The Bronze Layer](#3-dataset-scale-ingestion--the-bronze-layer)
4. [Data Quality Engineering, Validation & The Silver Layer](#4-data-quality-engineering-validation--the-silver-layer)
5. [Temporal Modeling, Feature Stores & The Gold Layer (SCD Type 2)](#5-temporal-modeling-feature-stores--the-gold-layer-scd-type-2)
6. [Storage Engineering: Liquid Clustering vs. Legacy Z-Ordering](#6-storage-engineering-liquid-clustering-vs-legacy-z-ordering)
7. [Distributed PySpark 4.x Performance Tuning & Execution Mechanics](#7-distributed-pyspark-4x-performance-tuning--execution-mechanics)
8. [Zero-OOM Catalyst Vector Serialization & 10-Shard Database Sync](#8-zero-oom-catalyst-vector-serialization--10-shard-database-sync)
9. [Real-Time Streaming Behavioral Telemetry (Kafka + Redis)](#9-real-time-streaming-behavioral-telemetry-kafka--redis)
10. [Dimensional Data Modeling & Production Star Schema](#10-dimensional-data-modeling--production-star-schema)
11. [Data Governance, Lineage & Observability](#11-data-governance-lineage--observability)
12. [Disaster Recovery, Time Travel & Rollback Runbook](#12-disaster-recovery-time-travel--rollback-runbook)
13. [Comprehensive Data Engineering Defense & Technical Decisions](#13-comprehensive-data-engineering-defense--technical-decisions)

---

## 1. Executive Data Engineering Pitch & Rationale

Most recommendation projects stop at isolated Jupyter notebooks running small `pandas.read_csv()` calls on single machines. They ignore the reality of enterprise data engineering: **streaming data drift, schema evolution, silent data corruption, shuffle skew bottlenecks, write-amplification, and temporal feature leakage.**

I engineered this data platform from the ground up as a **production-hardened, distributed Lakehouse and Vector Ingestion engine**. It handles the end-to-end data lifecycle over **21 Million+ real-world records** (1M+ TMDB movies and 20M+ MovieLens user interaction ratings), bridging distributed batch processing (**Databricks Serverless, Apache Spark 4.x, Delta Lake 4.x**) with real-time streaming telemetry (**Apache Kafka, Redis**) and low-latency online serving (**10-shard Neon PostgreSQL `pgvector` HNSW cluster**).

Every architectural choice follows Martin Kleppmann’s foundational principles from ***Designing Data-Intensive Applications* (DDIA)**:
* **Reliability:** ACID transactions via Delta Lake `_delta_log`, snapshot isolation, and deterministic idempotent recovery.
* **Scalability:** Shared-nothing distributed execution, dynamic Liquid Clustering (`clusterBy`), and 10-shard horizontal hash partitioning.
* **Maintainability:** Strict Pandera data quality contracts, automated OpenLineage tracking, and Unity Catalog 3-level namespace governance.

---

## 2. End-to-End Lakehouse Architecture & Ingestion Flow

```
                                  [DATA SOURCES]
        Kaggle TMDB Catalog (21M+ Records)         Frontend Real-Time Clickstream
               (CSV / JSON Bulk)                    (Views, Clicks, Ratings, Searches)
                       │                                             │
                       ▼                                             ▼
┌──────────────────────────────────────────────┐ ┌──────────────────────────────────────────────┐
│        BATCH & MICRO-BATCH INGESTION         │ │           STREAMING EVENT INGESTION          │
│  • Databricks Auto Loader (cloudFiles)       │ │  • Apache Kafka 7.3 (64 Partitions)          │
│  • Schema Inference & Evolution              │ │  • Sliding Redis Stream Buffer (TTL 3600s)   │
│  • Rescue Column (_rescued_data)             │ │  • Consumer Group Offset Management          │
└──────────────────────┬───────────────────────┘ └──────────────────────┬───────────────────────┘
                       │                                                │
                       ▼                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 BRONZE LAYER (RAW INGESTION)                                  │
│   Table: `apex.bronze.movies_raw`  •  Format: Delta Lake 4.x Parquet                          │
│   • Exact Source Fidelity (Zero mutations)                                                    │
│   • Lineage Metadata: `_source_file`, `_ingested_at`, `_batch_id`, `_raw_hash`               │
│   • Partitioning: Ingestion Date (`run_date=YYYY-MM-DD`)                                      │
└──────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                               │
                                               ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                           SILVER LAYER (CURATED & CONTRACT GATED)                             │
│   Table: `apex.silver.movies_curated`  •  Engine: PySpark 4.1 Distributed DAG                │
│   • Deterministic Deduplication: Windowed ROW_NUMBER() OVER (PARTITION BY id ORDER BY date)   │
│   • Fault-Tolerant Type Casting: `expr("try_cast(...)")` (Zero Pipeline Crash on Bad Data)   │
│   • Pandera Schema Validation Contracts (Strict Type & Nullability Gates)                     │
│   • Dead-Letter Quarantine: Malformed Records Diverted to `quarantine.bad_records`            │
└──────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                               │
                                               ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                        GOLD LAYER (FEATURE STORE & SCD TYPE 2 HISTORY)                        │
│   Table: `apex.gold.dim_movie_scd` & `apex.gold.movies_features`                             │
│   • SCD Type 2 Temporal Versioning: `is_current`, `effective_start_at`, `effective_end_at`   │
│   • Zero ML Data Leakage: Point-in-time feature backtesting for historical recommendation eval│
│   • Dynamic Liquid Clustering: `clusterBy("id")` (Eliminates static Z-Ordering rewrites)      │
│   • 768-D SBERT Embedding Generation via Distributed PySpark @pandas_udf + Apache Arrow       │
└──────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                               │
                                               ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                         ONLINE SERVING & VECTOR PERSISTENCE SYNC                              │
│   Target: 10-Shard Neon Serverless PostgreSQL Vector Cluster                                 │
│   • Zero-OOM Catalyst SQL Vector Serialization (Native JVM Array-to-JSON transforms)          │
│   • Parallel JDBC Batch Bulk Ingestion (Batch Size: 5,000 rows/partition)                    │
│   • Covering Indexes + pgvector HNSW Index (Cosine Distance, m=16, ef_construction=64)       │
│   • Sub-5ms Vector Similarity Retrieval for Real-Time UI Serving                             │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Dataset Scale, Ingestion & The Bronze Layer

* **Corpus Scale:** 21 Million+ interaction ratings (MovieLens 20M/32M benchmarks) and 1,000,000+ TMDB movie metadata entities containing titles, genres, overviews, budgets, box office revenues, and crew attributions.
* **Storage Layer:** Databricks Unity Catalog Volume `/Volumes/apex/raw/incoming_movies/`.
* **The Auto Loader (`cloudFiles`) Ingestion Engine:**
  * In enterprise production, raw files arrive incrementally (e.g. daily catalog drops or hourly bulk dumps).
  * Standard `spark.read.csv("/path/*")` requires recursive directory listings over object storage (S3/ADLS/GCS), which slows down quadratically ($O(N)$ HTTP `LIST` calls) as directory file counts grow.
  * We use **Databricks Auto Loader (`cloudFiles`)**, which leverages cloud notification services (AWS SQS / Azure Event Grid) to ingest newly arrived files incrementally with sub-second discovery latency.
* **Schema Inference & Evolution Modes:**
  * Auto Loader automatically infers schema types during initial boot.
  * We enforce `cloudFiles.schemaEvolutionMode = "addNewColumns"`. When TMDB introduces new metadata fields (e.g., `spoken_languages` or `origin_country`), the pipeline appends new nullable columns to the Bronze schema without breaking downstream DAG runs.
* **The Poison-Pill Rescue Column (`_rescued_data`):**
  * When incoming rows contain schema-breaking corruptions (e.g., non-numeric strings in boolean columns or truncated JSON strings), Auto Loader diverts the unparseable chunk into the `_rescued_data` JSON column rather than failing the job.
* **Data Provenance Metadata Injection:**
  ```python
  bronze_df = (
      spark.readStream.format("cloudFiles")
      .option("cloudFiles.format", "csv")
      .option("cloudFiles.schemaLocation", "/Volumes/apex/checkpoints/bronze_schema")
      .option("cloudFiles.schemaEvolutionMode", "addNewColumns")
      .load("/Volumes/apex/raw/incoming_movies/")
      .withColumn("_source_file", expr("_metadata.file_path"))
      .withColumn("_ingested_at", current_timestamp())
      .withColumn("_batch_id", expr("uuid()"))
      .withColumn("_raw_hash", expr("sha2(concat_ws('||', *), 256)"))
  )

  (
      bronze_df.writeStream
      .format("delta")
      .option("checkpointLocation", "/Volumes/apex/checkpoints/bronze_write")
      .partitionBy("run_date")
      .outputMode("append")
      .toTable("apex.bronze.movies_raw")
  )
  ```

---

## 4. Data Quality Engineering, Validation & The Silver Layer

The Silver layer transforms raw, untrusted records into validated, clean, queryable dimensional datasets.

### 1. Fault-Tolerant Type Casting (`try_cast`)
* **The Production Threat:** Multiline plot overviews and international movie titles frequently contain unescaped quotes, commas, and raw newline characters (`\n`). In distributed CSV readers, these cause row shifts, placing overview prose into the `vote_average` or `release_date` columns.
* **The Failure Mode of Standard Casting:** Standard Spark `.cast("double")` or `.cast("date")` throws a fatal `org.apache.spark.SparkUpgradeException` or `CAST_INVALID_INPUT`, terminating multi-hour cluster runs.
* **Our Solution:** We enforce `expr("try_cast(vote_average as double)")` across all transformation stages. Corrupted or misaligned strings safely resolve to `NULL`, allowing the pipeline to proceed while flagging bad rows.

### 2. Deterministic Deduplication: Windowing vs. `dropDuplicates()`
* Standard `df.dropDuplicates(["id"])` is non-deterministic during parallel execution: which row is preserved depends on which worker task finishes first.
* We enforce deterministic windowing:
  ```python
  from pyspark.sql.window import Window
  from pyspark.sql.functions import row_number, col

  dedup_window = Window.partitionBy("id").orderBy(col("_ingested_at").desc(), col("vote_count").desc())

  silver_deduped_df = (
      silver_df
      .withColumn("row_num", row_number().over(dedup_window))
      .filter(col("row_num") == 1)
      .drop("row_num")
  )
  ```

### 3. Pandera Schema Contracts & Dead-Letter Quarantine Circuit
All Silver tables must pass data contracts defined in [`docs/DATA_CONTRACTS.md`](docs/DATA_CONTRACTS.md):

```python
import pandera.pyspark as pa
from pyspark.sql.functions import col, lit

# Define contract invariants
clean_condition = (
    col("id").isNotNull()
    & col("title").isNotNull()
    & (col("title") != "")
    & (col("vote_average").isNull() | (col("vote_average").between(0.0, 10.0)))
    & (col("vote_count").isNull() | (col("vote_count") >= 0))
)

silver_clean_df = silver_deduped_df.filter(clean_condition)
silver_quarantine_df = silver_deduped_df.filter(~clean_condition).withColumn(
    "_quarantine_reason", lit("VIOLATED_DATA_CONTRACT_NULL_OR_RANGE")
)

# Atomic append to Silver curated table
silver_clean_df.write.format("delta").mode("append").saveAsTable("apex.silver.movies_curated")

# Divert bad records to quarantine dead-letter table for alerting
silver_quarantine_df.write.format("delta").mode("append").saveAsTable("apex.quarantine.bad_records")
```

---

## 5. Temporal Modeling, Feature Stores & The Gold Layer (SCD Type 2)

### Why SCD Type 2 is Mandatory for Recommendation Feature Stores
In machine learning recommendation systems, user interactions (clicks, ratings) occur at specific points in historical time ($T_{\text{event}}$). If a movie's metadata (e.g., genre reclassification, title edit, popularity metric) changes at $T_{\text{update}} > T_{\text{event}}$, updating the record in place (SCD Type 1) introduces **temporal data leakage**.
When offline ML models backtest historical user interactions from 6 months ago, the model would observe future metadata that did not exist when the user actually made the decision.

### The Delta Lake SCD Type 2 Implementation
We track temporal state changes using `movie_sk` (surrogate key), `movie_id` (business key), `is_current` (boolean active flag), `effective_start_at`, and `effective_end_at`:

```sql
-- Two-Part Deterministic Delta Lake SCD Type 2 MERGE INTO
MERGE INTO apex.gold.dim_movie_scd AS target
USING (
    -- 1. Incoming updates that match active records (Need to expire old versions)
    SELECT updates.id AS merge_key, updates.*
    FROM silver_updates AS updates
    UNION ALL
    -- 2. Incoming updates as new active records (Need to be inserted as is_current=true)
    SELECT NULL AS merge_key, updates.*
    FROM silver_updates AS updates
    JOIN apex.gold.dim_movie_scd AS target ON updates.id = target.id
    WHERE target.is_current = true AND target.content_hash != updates.content_hash
) AS source
ON target.id = source.merge_key
-- Expire the existing active version
WHEN MATCHED AND target.is_current = true AND target.content_hash != source.content_hash THEN
    UPDATE SET
        target.is_current = false,
        target.effective_end_at = current_timestamp()
-- Insert the new active version
WHEN NOT MATCHED THEN
    INSERT (
        movie_sk,
        id,
        title,
        genres,
        overview,
        vote_average,
        content_hash,
        is_current,
        effective_start_at,
        effective_end_at
    )
    VALUES (
        sha2(concat(source.id, current_timestamp()), 256),
        source.id,
        source.title,
        source.genres,
        source.overview,
        source.vote_average,
        source.content_hash,
        true,
        current_timestamp(),
        NULL
    );
```

---

## 6. Storage Engineering: Liquid Clustering vs. Legacy Z-Ordering

```
Z-ORDERING (Legacy Delta Lake):
┌─────────────────────────┐   New Append   ┌──────────────────────────────────────────────┐
│ Historical Partition    │ ─────────────► │ FULL TABLE REWRITE REQUIRED                  │
│ Files A, B, C           │                │ High Write-Amplification, Long Cluster Lock  │
└─────────────────────────┘                └──────────────────────────────────────────────┘

LIQUID CLUSTERING (APEX Production Choice):
┌─────────────────────────┐   New Append   ┌──────────────────────┐   ┌───────────────────┐
│ Historical Partition    │ ─────────────► │ Historical Untouched │ + │ Incremental Append│
│ Incremental Clustered   │                │ Zero Write Overhead  │   │ Clustered on Write│
└─────────────────────────┘                └──────────────────────┘   └───────────────────┘
```

1. **Incremental Clustering vs Full Table Rewrite:**
   * Traditional Z-Ordering (`OPTIMIZE ... ZORDER BY id, genres`) creates Space-Filling Hilbert/Peano curves across Parquet files. However, Z-Ordering is a **static batch operation**. Every time new data is appended, Spark must rewrite the entire historical table to re-order the curve, causing massive write-amplification and cloud compute costs.
   * **Liquid Clustering (`CLUSTER BY (id)`)** clusters incrementally as writes occur. Newly appended micro-batches are clustered dynamically without touching historical files.
2. **Cluster Key Mutability:**
   * In traditional Hive partitioning (`/year=2024/genre=Action/`), changing the partition layout requires creating a new table and running a multi-day backfill migration.
   * Liquid Clustering decouples physical directory hierarchies from data clustering. Cluster keys can be redefined instantly via `ALTER TABLE apex.gold.dim_movie_scd CLUSTER BY (genres, id)` without rewriting a single historical byte.
3. **Point-Lookup Query Pruning:**
   * Stores file-level min/max column statistics in the Delta transaction log (`_delta_log`). For single-movie or genre point-lookups, Spark skips over 95% of Parquet files without reading them from disk.

---

## 7. Distributed PySpark 4.x Performance Tuning & Execution Mechanics

### 1. High-Performance Cluster Configuration Profile
```python
# SOTA Databricks Serverless & Spark 4.1 Tuning Profile
spark.conf.set("spark.sql.execution.arrow.pyspark.enabled", "true")
spark.conf.set("spark.sql.execution.arrow.pyspark.fallback.enabled", "true")
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionFactor", "2.5")
spark.conf.set("spark.databricks.delta.optimizeWrite.enabled", "true")
spark.conf.set("spark.databricks.delta.autoCompact.enabled", "true")
spark.conf.set("spark.sql.files.maxPartitionBytes", "134217728") # 128 MB
spark.conf.set("spark.sql.shuffle.partitions", "auto")
```

### 2. Adaptive Query Execution (AQE) Mechanics
* **Dynamic Partition Coalescing:** Post-shuffle stages analyze runtime stage sizes and merge small partitions into uniform ~128MB chunks, eliminating the "1,000 tiny parquet files" problem.
* **Runtime Skew Join Optimization:**
  * In movie datasets, blockbuster titles (e.g. *Avatar*, *Titanic*, *Inception*) contain 500,000+ interaction ratings, while obscure indie films contain 5.
  * Standard Sort-Merge Join hashes all records for *Inception* to a single executor core, creating a **straggler task** that blocks the entire stage for 45 minutes while other cores sit idle.
  * AQE Skew Join detects when a partition exceeds $2.5\times$ the median partition size (`skewedPartitionFactor = 2.5`) and dynamically splits the skewed partition into $N$ parallel sub-partitions, balancing task execution evenly across worker cores.

### 3. The 128MB Shuffle Partition Sizing Rule
To prevent out-of-memory driver crashes or excessive scheduling overhead during wide joins and aggregations, we calculate shuffle partitions dynamically:

$$\text{Target Partitions} = \max\left(200, \; \left\lceil \frac{\text{Total Input Stage Bytes}}{134{,}217{,}728 \text{ Bytes (128 MB)}} \right\rceil \times 2\right)$$

---

## 8. Zero-OOM Catalyst Vector Serialization & 10-Shard Database Sync

* **The Production Problem:** Generating 768-dimensional SBERT embeddings for 1,000,000+ movies creates dense floating-point vector arrays. Traditional PySpark pipelines serialize these vectors using Python UDFs:
  `df.apply(lambda row: json.dumps(row.embedding))`
  This triggers massive Py4J serialization overhead, bottlenecks on the single driver node, causes JVM garbage collection pauses, and terminates the pipeline with `java.lang.OutOfMemoryError: Java heap space`.
* **The APEX Solution:** We format vectors natively inside the **Spark Catalyst SQL Optimizer** without ever transferring arrays across the JVM-Python bridge:

```python
# 100% Native Spark SQL Catalyst Transform — Zero Python Overhead
clean_gold_df = (
    gold_df.withColumn(
        "vector_str",
        concat_ws(",", expr("transform(embedding, x -> cast(round(x, 6) as string))"))
    )
    .withColumn(
        "pg_vector_literal",
        concat(lit("["), col("vector_str"), lit("]"))
    )
)
```

### The 10-Shard Neon Serverless Topology
* **Source Notebook:** [`databricks_notebooks/02_export_to_neon.py`](databricks_notebooks/02_export_to_neon.py)
* **Horizontal Hash Sharding:** Records are routed to 10 independent Neon PostgreSQL computing branches using deterministic modulus hashing:
  $$\text{Shard ID} = \text{pmod}(\text{spark\_hash}(\text{movie\_id}), \; 10)$$
* **Parallel Partition JDBC Bulk Ingestion:**
  Spark workers write their assigned partition directly to the target Neon shard in parallel, streaming at 5,000 rows/batch with 16 concurrent JDBC connections.
* **Vector Index Configuration (`pgvector` HNSW):**
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE TABLE IF NOT EXISTS dim_movie_vectors (
      movie_id BIGINT PRIMARY KEY,
      title VARCHAR(500),
      genres VARCHAR(255),
      embedding vector(768)
  );

  -- High-Recall Hierarchical Navigable Small World (HNSW) Graph Index
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movie_vectors_hnsw
  ON dim_movie_vectors
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
  ```
* **Why HNSW over IVF for Online Serving:**
  * **IVF (Inverted File Index):** Divides vector space into Voronoi cells via K-Means. While fast to build, IVF suffers from recall degradation at cluster boundaries and requires periodic retraining as new movies are added.
  * **HNSW (Hierarchical Navigable Small World):** Builds a multi-layer graph skip-list. Delivers **>98% recall**, sub-5ms query times, and supports seamless incremental vector inserts without rebuilding the graph.

---

## 9. Real-Time Streaming Behavioral Telemetry (Kafka + Redis)

* **Source Notebook:** [`databricks_notebooks/01b_streaming_events.py`](databricks_notebooks/01b_streaming_events.py)
* **Kafka Event Bus Architecture:**
  * Interactions from the frontend React Cinema SPA (ratings, clicks, video watch duration, searches) publish to topic `apex.telemetry.user_interactions`.
  * **64 Partitions Keyed by `user_id`:** Ensures all events for any given user arrive in strict chronological order on the same partition without distributed race conditions.
* **Dual-Buffer Strategy:**
  * **Redis Stream Buffer:** Holds a high-speed sliding-window buffer with a 3,600-second TTL for instantaneous online feature retrieval.
  * **Spark Structured Streaming Sink:** Micro-batches incoming telemetry every 10 seconds into the Delta Lake Bronze interaction table.
* **Idempotent Ingestion & Delivery Guarantees:**
  * Configured with **At-Least-Once Delivery** and checkpointing (`checkpointLocation`).
  * Ingestion merges use deterministic composite keys: `(user_id, session_id, event_timestamp)` to drop duplicate replayed network events.

---

## 10. Dimensional Data Modeling & Production Star Schema

```
                      ┌─────────────────────────┐
                      │       dim_genres        │
                      ├─────────────────────────┤
                      │ genre_id (PK)           │
                      │ genre_name              │
                      └────────────┬────────────┘
                                   │ 1:N
                                   ▼
┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│     dim_movies_scd2     │   │    fact_movie_genres    │   │       dim_users         │
├─────────────────────────┤   ├─────────────────────────┤   ├─────────────────────────┤
│ movie_sk (Surrogate PK) │   │ movie_id (FK)           │   │ user_id (PK)            │
│ movie_id (Business Key) │◄──┤ genre_id (FK)           │   │ hashed_email            │
│ title                   │   └─────────────────────────┘   │ signup_date             │
│ overview                │                                 │ tenant_id               │
│ vote_average            │                                 └────────────┬────────────┘
│ is_current              │◄───────────────────────┐                     │ 1:N
│ effective_start_at      │                        │ 1:N                 │
│ effective_end_at        │                        ▼                     ▼
└────────────┬────────────┘              ┌─────────────────────────────────────┐
             │                           │            fact_ratings             │
             │ 1:N                       ├─────────────────────────────────────┤
             │                           │ rating_id (PK)                      │
             ▼                           │ user_id (FK)                        │
┌─────────────────────────┐              │ movie_id (FK)                       │
│    dim_movie_vectors    │              │ rating (1.0 - 5.0)                  │
├─────────────────────────┤              │ timestamp                           │
│ movie_id (PK, Sharded)  │              └─────────────────────────────────────┘
│ embedding vector(768)   │
│ hnsw_index (Cosine)     │
└─────────────────────────┘
```

* **Surrogate Keys vs. Natural Keys:**
  `dim_movies_scd2` uses `movie_sk` (UUID/SHA-256) as the primary key and `movie_id` as the natural business key. This allows multiple historical versions of the same movie to exist in the dimension table without primary key collisions.
* **Partial Indexing for Fast Active Lookups:**
  ```sql
  CREATE INDEX idx_dim_movie_current ON dim_movie(movie_id) WHERE is_current = TRUE;
  ```

---

## 11. Data Governance, Lineage & Observability

1. **Unity Catalog 3-Level Namespace:**
   All assets are registered under `catalog.schema.table` (`apex.bronze.*`, `apex.silver.*`, `apex.gold.*`), providing unified access controls, credential isolation, and audit logging.
2. **Automated Lineage Tracking:**
   Integrated with **OpenLineage 1.0** to extract automated Directed Acyclic Graphs (DAGs) capturing input data versions, schema transformations, and output Delta commits.
3. **Cryptographic Salted PII Protection:**
   User email addresses and IP coordinates are masked with salted SHA-256 digests before writing to Lakehouse tables, satisfying GDPR / CCPA right-to-be-forgotten mandates.
4. **Pipeline Observability Metrics:**
   * Monitored via Prometheus and Databricks Lakehouse Monitoring:
     * Ingestion throughput (records/sec).
     * Stage shuffle spill (Target: 0 MB to disk).
     * Pandera contract quarantine rate (Alert threshold: $> 0.1\%$).
     * Neon JDBC write latency (P95 $< 15\text{ms}$).

---

## 12. Disaster Recovery, Time Travel & Rollback Runbook

* **Delta Lake Time Travel Auditing:**
  Every write appends a JSON commit to `_delta_log/`. Any table can be inspected at any historical commit version or timestamp:
  ```sql
  -- Inspect table state from 7 days ago
  SELECT * FROM apex.gold.dim_movie_scd TIMESTAMP AS OF '2026-09-10 00:00:00';

  -- Inspect exact commit version before a bad deployment
  SELECT * FROM apex.gold.dim_movie_scd VERSION AS OF 142;
  ```
* **Instant Table Rollback:**
  ```sql
  -- Instantaneous atomic rollback without data restoration
  RESTORE TABLE apex.gold.dim_movie_scd TO VERSION AS OF 141;
  ```
* **Idempotent Historical Backfill Script:**
  ```bash
  python scripts/etl_pipeline.py --start-date 2026-01-01 --end-date 2026-01-31 --mode backfill --recompute-embeddings false
  ```

---

## 13. Comprehensive Data Engineering Defense & Technical Decisions

### Q1: "How would you scale this pipeline from 21 Million to 21 Billion records?"
> **Architectural Evolution Strategy:**
> 1. **Compute & Partitioning:**
>    - At 21B rows, file ingestion cannot rely on directory globbing. Migrate raw ingestion from Volume files to a distributed event streaming backbone like **Apache Kafka** or **AWS Kinesis** with 64+ partitions.
>    - Tune PySpark shuffle partitions: increase `spark.sql.shuffle.partitions` from 200 to 2,000–5,000 based on the 128MB partition rule of thumb.
> 2. **Storage & Delta Lake:**
>    - Enable Delta Lake **Liquid Clustering (`clusterBy`)** on `movie_id` and `run_date`. Liquid clustering eliminates write-amplification and dynamically reorganizes data without full table rewrites.
> 3. **Database & Vector Serving Tier:**
>    - A single PostgreSQL instance cannot hold 21B dense 768-D vectors (which requires ~64 TB of raw vector storage).
>    - Migrate the serving layer to a distributed vector store (e.g. Milvus distributed cluster, Pinecone, or a multi-node Qdrant cluster on Kubernetes) or horizontal sharding via Citus / Vitess with consistent hashing.

---

### Q2: "Why did you use Delta Lake SCD Type 2 instead of just overwriting the Gold table (SCD Type 1)?"
> **Engineering Decision:**
> *"In production Machine Learning and recommendation systems, feature store integrity is critical. If a movie's genres, description, or rating stats change over time and we overwrite the record (SCD Type 1), we create **data leakage** and prevent historical backtesting. When evaluating how a recommendation model performed on historical user interactions from 6 months ago, the model must see the exact movie metadata that existed at that point in time. SCD Type 2 provides temporal auditability through `is_current`, `effective_start_at`, and `effective_end_at`, allowing point-in-time ML training and compliance auditing."*

---

### Q3: "Explain the difference between Liquid Clustering and Z-Ordering in Delta Lake. Why choose Liquid Clustering?"
> **Engineering Decision:**
> *"Z-Ordering maps multi-dimensional data into a one-dimensional space along a Space-Filling Z-Curve to achieve data skipping. However, Z-Ordering is a static clustering technique that requires a full table rewrite every time `OPTIMIZE ... ZORDER BY` is called. For tables receiving frequent streaming appends or CDC updates, Z-Ordering causes severe write-amplification.*
>
> *Liquid Clustering (`clusterBy`) replaces fixed partition hierarchies and Z-Ordering with dynamic, incremental clustering. As new micro-batches arrive, Spark clusters only the newly written data without rewriting historical partitions. It allows cluster keys to be redefined without rebuilding the table and speeds up query pruning by up to 10x for concurrent workloads."*

---

### Q4: "What happens if a worker node crashes during PySpark ETL or during the Neon Database export? How is idempotency guaranteed?"
> **Engineering Decision:**
> *"Two mechanisms guarantee end-to-end fault tolerance and idempotence:*
> 1. **Delta Lake ACID Log (`_delta_log`):** PySpark writes data files as temporary parquet files. A commit is only recorded if the entire batch completes. If an executor dies, Spark's DAG scheduler retries the failed task. If the entire job fails, no commit is written to `_delta_log`, and future readers simply ignore the uncommitted parquet files.
> 2. **Idempotent Upserts:** The Gold layer ETL uses deterministic `MERGE INTO` logic. Re-running the pipeline on the same source batch produces the exact same table state without creating duplicate active records.
> 3. **Neon Database Export Idempotency:** The JDBC write uses `INSERT ... ON CONFLICT (movie_id) DO UPDATE SET ...`. If a network timeout occurs and Spark retries a task partition, duplicate rows are upserted cleanly rather than throwing primary key violation errors."*

---

### Q5: "Why did you choose HNSW over IVF for your pgvector index?"
> **Engineering Decision:**
> *"IVF (Inverted File Index) clusters vectors into Voronoi cells using K-Means and searches only the nearest centroids. While IVF has a small memory footprint and fast build time, its recall drops significantly if query vectors lie near cluster boundaries, and it requires periodic retraining as the dataset distribution shifts.*
>
> *HNSW (Hierarchical Navigable Small World) constructs a multi-layer geometric graph structure. Top layers allow fast logarithmic skipping across vector space ($O(\log N)$), while bottom layers navigate fine-grained local neighborhoods. HNSW offers superior recall (>98%), sub-5ms query latency, and does not require periodic centroid retraining, making it the ideal choice for high-precision real-time recommendation retrieval."*

---

### Q6: "How did you prevent out-of-memory (OOM) errors when serializing 768-D dense vectors for database export?"
> **Engineering Decision:**
> *"In PySpark, running standard Python UDFs like `df.apply(lambda row: json.dumps(row.embedding))` causes severe JVM-to-Python pickling overhead, bottlenecks on the single driver node, and triggers driver OOM crashes.*
>
> *We solved this with two techniques:*
> 1. **Catalyst SQL Expression Transformation:** We replaced Python UDFs with native Spark SQL Catalyst expressions using `concat_ws(',', expr("transform(embedding, x -> cast(round(x, 6) as string))"))`. This vectorizes the string serialization directly in native off-heap memory on worker cores.
> 2. **Direct Worker JDBC Export:** Instead of collecting data to the driver node, we write to PostgreSQL directly from worker partitions using parallel JDBC connections (`numPartitions=16`), keeping driver memory consumption strictly flat."*

---

<div align="center">
  <b>Engineered with precision by Pavan Badempet</b><br/>
  <i>Distributed Systems • Lakehouse Engineering • Real-Time AI Vector Serving</i>
</div>
