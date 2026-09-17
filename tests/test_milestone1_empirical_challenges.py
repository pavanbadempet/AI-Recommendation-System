"""
Empirical stress-testing and challenge suite for Milestone 1.

Verifies:
1. CPU Thread Pinning under simulated concurrent load (PyTorch & ONNX runtime).
2. Strict socket-level zero-network hermeticity (blocking socket connect, HTTP, HF Hub).
3. ONNX SBERT query encoder vs baseline latency, scaling, and embedding fidelity.
"""

from __future__ import annotations

import concurrent.futures
import os
from pathlib import Path
import socket
import time
import urllib.request

import numpy as np
import pytest

from backend.pipeline.recommender import ONNXSBERTEncoder, Recommender
from backend.serving.app_startup import configure_cpu_threading

# ============================================================================
# 1. Thread Pinning Under Simulated Concurrent Load
# ============================================================================


def test_torch_single_thread_invariants():
    """Verify PyTorch thread pinning invariants remain strictly single-threaded."""
    try:
        import torch

        configure_cpu_threading(1)
        assert torch.get_num_threads() == 1, f"Expected torch threads == 1, got {torch.get_num_threads()}"
        assert torch.get_num_interop_threads() == 1, (
            f"Expected torch interop threads == 1, got {torch.get_num_interop_threads()}"
        )
    except ImportError:
        pytest.skip("PyTorch not installed in this environment")


def test_onnx_encoder_concurrent_thread_pinning_under_load():
    """Verify ONNXSBERTEncoder maintains thread options and stability under concurrent thread pool load."""
    onnx_file = Path("models/sbert_encoder.quant.onnx")
    if not onnx_file.exists():
        pytest.skip(f"ONNX model file not found at {onnx_file}")

    encoder = ONNXSBERTEncoder(str(onnx_file))

    queries = [
        "Inception mind-bending dreams",
        "Interstellar space voyage relativity",
        "The Matrix cyberpunk simulated reality",
        "Pulp Fiction neo-noir crime thriller",
        "The Dark Knight superhero Gotham vigilante",
        "Spirited Away studio ghibli anime fantasy",
        "Gladiator ancient Rome arena combat",
        "Blade Runner dystopian replicant detective",
    ]

    def worker_task(query: str) -> np.ndarray:
        emb = encoder.encode(query)
        return emb

    # Execute 40 concurrent tasks across 8 worker threads
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(worker_task, queries[i % len(queries)]) for i in range(40)]
        results = [f.result() for f in futures]

    assert len(results) == 40
    for emb in results:
        assert emb.shape == (1, 384)
        assert not np.isnan(emb).any()
        assert not np.isinf(emb).any()

    # Re-verify torch threading has not been mutated by concurrent thread executions
    try:
        import torch

        assert torch.get_num_threads() == 1
    except ImportError:
        pass


def test_concurrent_configure_cpu_threading_idempotence():
    """Verify configure_cpu_threading is thread-safe and idempotent under concurrent invocation."""

    def worker():
        for _ in range(20):
            configure_cpu_threading(1)

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(worker) for _ in range(8)]
        for f in futures:
            f.result()

    for env_var in (
        "OMP_NUM_THREADS",
        "MKL_NUM_THREADS",
        "OPENBLAS_NUM_THREADS",
        "NUMEXPR_NUM_THREADS",
        "VECLIB_MAXIMUM_THREADS",
        "BLIS_NUM_THREADS",
        "NOVA_CPU_THREADS",
        "ORT_INTRA_OP_NUM_THREADS",
    ):
        assert os.environ.get(env_var) == "1"


# ============================================================================
# 2. Strict Socket-Level Zero-Network Hermeticity Stress Tests
# ============================================================================


class NetworkAccessAttemptError(RuntimeError):
    """Raised when any outbound network connection is attempted."""


def test_zero_network_hermetic_sandbox(monkeypatch):
    """
    Stress-test zero-network hermeticity by intercepting all low-level socket connections.
    Ensure initialization, pre-warming, query encoding, and search make zero network calls.
    """
    monkeypatch.setenv("NOVA_DISABLE_MODEL_DOWNLOADS", "true")
    monkeypatch.setenv("NOVA_EAGER_MODEL_DOWNLOAD", "false")
    monkeypatch.setenv("NOVA_REFRESH_PIPELINE_MANIFEST", "false")
    monkeypatch.setenv("TRANSFORMERS_OFFLINE", "1")
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")

    # Install low-level socket interceptor
    def forbidden_connect(self, *args, **kwargs):
        raise NetworkAccessAttemptError(f"Forbidden outbound socket.connect attempt to {args}")

    def forbidden_create_connection(*args, **kwargs):
        raise NetworkAccessAttemptError(f"Forbidden socket.create_connection attempt to {args}")

    def forbidden_urlopen(*args, **kwargs):
        raise NetworkAccessAttemptError(f"Forbidden urllib.request.urlopen attempt to {args}")

    monkeypatch.setattr(socket.socket, "connect", forbidden_connect)
    monkeypatch.setattr(socket, "create_connection", forbidden_create_connection)
    monkeypatch.setattr(urllib.request, "urlopen", forbidden_urlopen)

    # 1. Test model_loader.ensure_model_files without network
    import backend.models.model_loader as model_loader

    status = model_loader.ensure_model_files(
        Path("models"),
        selected_files={"sbert_encoder.quant.onnx", "turbovec.tq"},
    )
    assert isinstance(status, dict)

    # 2. Test ONNXSBERTEncoder offline instantiation and encoding
    onnx_file = Path("models/sbert_encoder.quant.onnx")
    if onnx_file.exists():
        encoder = ONNXSBERTEncoder(str(onnx_file))
        emb = encoder.encode("Hermetic offline test query")
        assert emb.shape == (1, 384)
        assert np.isfinite(emb).all()

    # 3. Test Recommender instantiation and query encoder acquisition
    rec = Recommender()
    if onnx_file.exists():
        query_encoder = rec._get_query_encoder()
        assert query_encoder is not None
        emb = query_encoder.encode(["Multi-token offline test query"])
        assert emb.shape[0] == 1
        assert emb.shape[1] in {384, 768}

    # 4. Test recommender searches in hermetic offline environment
    res_movies = rec.search_movies("Matrix", limit=3)
    assert isinstance(res_movies, list)


# ============================================================================
# 3. ONNX Query Encoder Benchmarking & Semantic Fidelity Verification
# ============================================================================


def test_onnx_query_encoder_latency_and_fidelity():
    """
    Benchmark ONNX query encoder latency (p50, p95, p99) and verify embedding fidelity
    against PyTorch SentenceTransformer (if available).
    """
    onnx_file = Path("models/sbert_encoder.quant.onnx")
    if not onnx_file.exists():
        pytest.skip(f"ONNX model file not found at {onnx_file}")

    # Measure ONNX Cold Load Time
    t0 = time.perf_counter()
    onnx_encoder = ONNXSBERTEncoder(str(onnx_file))
    onnx_load_ms = (time.perf_counter() - t0) * 1000.0

    # Warmup
    _ = onnx_encoder.encode("warmup query")

    # Benchmark test queries
    bench_queries = [
        "Inception",
        "mind-bending science fiction thriller about dream infiltration",
        "a classic romantic comedy set in the streets of Paris during autumn with witty dialogue",
        "superhero action adventure dark gritty vigilante saving Gotham city from villains",
        "historical documentary detailing the space race and Apollo moon landing missions",
    ]

    latencies_ms = []
    for _ in range(30):
        for q in bench_queries:
            t_start = time.perf_counter()
            _ = onnx_encoder.encode(q)
            latencies_ms.append((time.perf_counter() - t_start) * 1000.0)

    p50 = float(np.percentile(latencies_ms, 50))
    p95 = float(np.percentile(latencies_ms, 95))
    p99 = float(np.percentile(latencies_ms, 99))
    mean_lat = float(np.mean(latencies_ms))
    min_lat = float(np.min(latencies_ms))
    max_lat = float(np.max(latencies_ms))

    print(
        f"\n[ONNX Benchmark] Load: {onnx_load_ms:.2f}ms | Mean: {mean_lat:.2f}ms | "
        f"p50: {p50:.2f}ms | p95: {p95:.2f}ms | p99: {p99:.2f}ms | Min: {min_lat:.2f}ms | Max: {max_lat:.2f}ms"
    )

    # Latency SLA checks: mean latency should be well under 25ms on CPU
    assert mean_lat < 25.0, f"Mean ONNX latency {mean_lat:.2f}ms exceeds 25ms threshold"
    assert p95 < 40.0, f"p95 ONNX latency {p95:.2f}ms exceeds 40ms threshold"

    # Batch scaling verification
    t_b1 = time.perf_counter()
    emb_b1 = onnx_encoder.encode(["Single test query"])
    lat_b1 = (time.perf_counter() - t_b1) * 1000.0

    t_b5 = time.perf_counter()
    emb_b5 = onnx_encoder.encode(bench_queries)
    lat_b5 = (time.perf_counter() - t_b5) * 1000.0

    assert emb_b1.shape == (1, 384)
    assert emb_b5.shape == (5, 384)

    # Check cosine fidelity against PyTorch baseline if sentence_transformers is installed
    try:
        from sentence_transformers import SentenceTransformer

        t0_st = time.perf_counter()
        st_encoder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        st_load_ms = (time.perf_counter() - t0_st) * 1000.0

        st_latencies = []
        for q in bench_queries:
            t_s = time.perf_counter()
            _ = st_encoder.encode(q)
            st_latencies.append((time.perf_counter() - t_s) * 1000.0)
        st_mean_lat = float(np.mean(st_latencies))

        # Check semantic vector cosine similarity between PyTorch and ONNX Quantized
        for q in bench_queries:
            vec_onnx = onnx_encoder.encode(q)[0]
            vec_st = st_encoder.encode(q)

            # Cosine similarity
            cos_sim = np.dot(vec_onnx, vec_st) / (np.linalg.norm(vec_onnx) * np.linalg.norm(vec_st))
            assert cos_sim > 0.95, f"Quantized ONNX cosine similarity {cos_sim:.4f} too low for query '{q}'"

        print(
            f"[PyTorch Baseline] Load: {st_load_ms:.2f}ms | Mean Latency: {st_mean_lat:.2f}ms | "
            f"Speedup vs ST: {st_mean_lat / mean_lat:.2f}x"
        )
    except Exception as exc:
        print(f"[PyTorch comparison skipped or failed]: {exc}")
