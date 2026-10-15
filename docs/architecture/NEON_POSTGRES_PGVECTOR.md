# Neon Serverless Postgres with pgvector

## Architecture
- Scale-to-zero serverless PostgreSQL compute with persistent tiered storage.
- pgvector HNSW indexing on 128-dimensional movie semantic embeddings.
- Connection pooling via Neon pgbouncer proxy handling 10,000+ concurrent API connections.
- Parameter configuration: `m = 16`, `ef_construction = 64`, `ef_search = 40`.
