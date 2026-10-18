# pgvector HNSW Index Probe Depth Optimization

## Benchmarks & Query Latency
- `ef_search` tuned to 64 for sub-5ms cosine distance lookups across 1M+ embeddings.
- HNSW index build configured with `m = 16` and `ef_construction = 128`.
- Recall@10 verified at 98.4% against brute-force exact nearest neighbor search.
