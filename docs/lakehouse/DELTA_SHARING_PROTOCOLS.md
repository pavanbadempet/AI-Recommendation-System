# Delta Sharing Protocol Architecture

## Architecture Summary
Delta Sharing enables secure, zero-copy sharing of curated Gold-layer movie catalog tables and aggregated recommendation metrics without vendor lock-in.

## Workflow
1. Client issues REST token request to Delta Sharing server.
2. Server validates bearer credentials and generates pre-signed S3/Blob storage URLs for Parquet parts.
3. Client reads parquet splits in parallel using local Apache Arrow / DuckDB engines.
