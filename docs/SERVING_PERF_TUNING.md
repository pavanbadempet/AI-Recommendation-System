# FastAPI & Uvicorn Connection Pool Tuning

## Server Architecture
- Worker threads: `workers = (2 * CPU) + 1`
- Async asyncpg pool size: `min_size=10, max_size=50`
- Gzip compression middleware enabled for payloads > 1KB.
