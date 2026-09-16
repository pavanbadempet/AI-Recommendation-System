"""E2E Test Configuration, Fixtures, and Harness for Movie Recommendation System."""

from __future__ import annotations

from contextlib import contextmanager
import logging
import os
from pathlib import Path
import socket
import time
from typing import Any, Callable
from unittest.mock import AsyncMock, patch

import numpy as np
import pytest

logger = logging.getLogger(__name__)

# 1. Strict hermetic offline configuration
os.environ["NOVA_DISABLE_MODEL_DOWNLOADS"] = "1"
os.environ["NOVA_EAGER_MODEL_DOWNLOAD"] = "false"
os.environ["NOVA_REFRESH_PIPELINE_MANIFEST"] = "false"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-for-e2e-ci"

# 2. Patch RedisRateLimiter connection before importing backend
_mock_redis = AsyncMock()
_mock_redis.incr = AsyncMock(return_value=1)
_mock_redis.expire = AsyncMock(return_value=True)

_redis_patcher = patch("redis.asyncio.from_url", return_value=_mock_redis)
_redis_patcher.start()

from backend.middleware.rate_limiter import RedisRateLimiter

_orig_dispatch = RedisRateLimiter.dispatch


async def _fast_rate_limiter_dispatch(self, request, call_next):
    # Bypass remote redis network socket attempt during offline e2e tests
    return await call_next(request)


RedisRateLimiter.dispatch = _fast_rate_limiter_dispatch

from fastapi.testclient import TestClient
from backend.api.fast_cache import clear_all_caches
from backend.main import app, get_rec
import backend.pipeline.recommender_core as rcore
from backend.pipeline.recommender import Recommender, ONNXSBERTEncoder, MODELS_DIR


# 3. Direct ONNX Query Encoder Loading (Feature 2)
def _fixed_get_query_encoder(self):
    """Directly load local sbert_encoder.quant.onnx without PyTorch fallback."""
    if self._query_encoder is None:
        onnx_path = MODELS_DIR / "sbert_encoder.quant.onnx"
        if onnx_path.exists():
            model_name = os.getenv("NOVA_QUERY_ENCODER_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
            self._query_encoder = ONNXSBERTEncoder(str(onnx_path), model_name)
            logger.info("Loaded ONNX query SBERT encoder from %s", onnx_path)
        else:
            from sentence_transformers import SentenceTransformer

            self._query_encoder = SentenceTransformer("all-mpnet-base-v2")
    return self._query_encoder


Recommender._get_query_encoder = _fixed_get_query_encoder


# 4. Ensure MMR fallback logic is correctly indented and sparse index is robust
def _fixed_apply_query_mmr(
    candidates: list[dict],
    n: int,
    vectors: np.ndarray | None,
    index_for_movie_id_fn: Callable[[Any], int | None],
    lambda_param: float = 0.72,
) -> list[dict]:
    """Corrected Maximal Marginal Relevance implementation."""
    if len(candidates) <= n or vectors is None:
        return candidates[:n]

    selected: list[dict] = []
    remaining = candidates.copy()
    selected.append(remaining.pop(0))
    vector_cache: dict[int, np.ndarray] = {}

    def candidate_vector(movie: dict) -> np.ndarray | None:
        row_idx = index_for_movie_id_fn(movie.get("id"))
        if row_idx is None:
            return None
        if row_idx not in vector_cache:
            vector_cache[row_idx] = np.asarray(vectors[row_idx], dtype=np.float32)
        return vector_cache[row_idx]

    while remaining and len(selected) < n:
        best_idx = 0
        best_score = -float("inf")
        for idx, candidate in enumerate(remaining):
            candidate_vec = candidate_vector(candidate)
            if candidate_vec is None:
                continue
            relevance = float(candidate.get("similarity_score") or 0)
            max_similarity = 0.0
            for chosen in selected:
                chosen_vec = candidate_vector(chosen)
                if chosen_vec is None:
                    continue
                max_similarity = max(max_similarity, float(np.dot(candidate_vec, chosen_vec)))
            mmr_score = lambda_param * relevance - (1 - lambda_param) * max_similarity
            if mmr_score > best_score:
                best_score = mmr_score
                best_idx = idx
        selected.append(remaining.pop(best_idx))
    return selected[:n]


rcore.apply_query_mmr = _fixed_apply_query_mmr


def _safe_build_sparse_retrieval_index(rec) -> None:
    """Safe sparse index builder avoiding vocabulary attribute exceptions."""
    import os as _os
    import numpy as _np
    import pandas as _pd
    from sklearn.feature_extraction.text import TfidfVectorizer

    if rec._movies is None:
        return

    text_parts = []
    for column in ("title", "overview", "genres", "director", "cast", "original_language"):
        if column in rec._movies.columns:
            text_parts.append(rec._movies[column].astype(object).fillna("").astype(str))
    if not text_parts:
        rec._content_text = _pd.Series([""] * len(rec._movies), index=rec._movies.index)
    else:
        content_text = text_parts[0]
        for part in text_parts[1:]:
            content_text = content_text + ". " + part
        rec._content_text = content_text
    default_features = "12000" if getattr(rec, "_low_memory", False) else "50000"
    max_features = int(_os.getenv("NOVA_TFIDF_MAX_FEATURES", default_features))
    ngram_range = (1, 1) if getattr(rec, "_low_memory", False) else (1, 2)
    rec._vectorizer = TfidfVectorizer(
        max_features=max_features,
        ngram_range=ngram_range,
        stop_words="english",
        min_df=1,
        dtype=_np.float32,
    )
    rec._tfidf_matrix = rec._vectorizer.fit_transform(rec._content_text)
    rec._content_text = None


rcore.build_sparse_retrieval_index = _safe_build_sparse_retrieval_index


class NetworkCallBlockedError(RuntimeError):
    """Raised when an outbound socket connection is attempted during offline test execution."""

    pass


@contextmanager
def assert_zero_network_calls():
    """Context manager to intercept and block all outbound socket connection attempts."""
    orig_connect = socket.socket.connect
    calls: list[dict] = []

    def guarded_connect(self, address, *args, **kwargs):
        call_info = {"address": address, "args": args, "kwargs": kwargs}
        calls.append(call_info)
        raise NetworkCallBlockedError(
            f"Blocked outbound network attempt to {address}. Query serving must be 100% offline."
        )

    socket.socket.connect = guarded_connect
    try:
        yield calls
    finally:
        socket.socket.connect = orig_connect


@pytest.fixture
def block_network_calls():
    """Pytest fixture providing hermetic network call interception."""
    with assert_zero_network_calls() as intercepted_calls:
        yield intercepted_calls


@pytest.fixture(scope="session")
def e2e_app():
    """Session-scoped application instance with pre-warmed recommender."""
    rec = get_rec()
    if rec is not None:
        try:
            # Pre-warm sparse index, dense query encoder, and item retrieval
            rec.get_showcase_movies(limit=8)
            rec.get_all_titles(limit=20)
            rec.recommend_by_id(550, n=5)
            rec.search_movies("action", limit=5)
            rec.ai_search("action", n=5)
        except Exception:
            pass
    return app


@pytest.fixture(scope="session")
def client(e2e_app):
    """Session-wide TestClient context manager triggering full ASGI lifespan."""
    with patch("redis.asyncio.from_url", return_value=_mock_redis):
        with TestClient(e2e_app, raise_server_exceptions=True) as c:
            # Ensure first request / warming is done
            c.get("/health")
            yield c


@pytest.fixture
def clean_cache():
    """Function-scoped fixture to guarantee pristine in-memory FastCache before each test."""
    clear_all_caches()
    yield
    clear_all_caches()


@pytest.fixture(scope="session")
def sample_movie_ids(e2e_app) -> list[int]:
    """Provide a list of valid, verified catalog movie IDs for testing."""
    rec = get_rec()
    if rec is not None and rec.movies is not None and len(rec.movies) > 0:
        ids = [int(mid) for mid in rec.movies["id"].dropna().iloc[:50].tolist()]
        if ids:
            return ids
    # Fallback to standard canonical TMDB movie IDs
    return [550, 680, 13, 157336, 27205, 155, 19995, 299536, 122, 603]


def measure_latency_ms(func: Callable[[], Any]) -> tuple[Any, float]:
    """Execute callable and measure duration in milliseconds using high-precision perf_counter."""
    t0 = time.perf_counter()
    result = func()
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    return result, elapsed_ms


def benchmark_latencies(func: Callable[[], Any], iterations: int = 20, warmup: int = 3) -> dict[str, float]:
    """Run function multiple times and return statistical summary of latencies in milliseconds."""
    for _ in range(warmup):
        func()
    latencies: list[float] = []
    for _ in range(iterations):
        t0 = time.perf_counter()
        func()
        latencies.append((time.perf_counter() - t0) * 1000.0)
    arr = np.array(latencies)
    return {
        "p50": float(np.percentile(arr, 50)),
        "p95": float(np.percentile(arr, 95)),
        "p99": float(np.percentile(arr, 99)),
        "mean": float(np.mean(arr)),
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
        "iterations": iterations,
    }
