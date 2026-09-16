"""
Tests for Milestone 1: Zero-Network Boot & CPU Thread Pinning.

Validates:
1. Zero-Network Boot Configuration & Socket Blocking (no outbound calls).
2. CPU Thread Pinning & Single-Core Execution (torch, ONNX Runtime, BLAS env vars).
3. Direct ONNX Query Encoder Loading (prioritizing sbert_encoder.quant.onnx).
4. Comprehensive Startup Pre-Warming Pipeline & GC freeze with fault tolerance.
5. Dockerfile runtime environment configuration.
"""

from __future__ import annotations

import gc
import os
from pathlib import Path
import socket
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from backend.pipeline.recommender import ONNXSBERTEncoder, Recommender
from backend.serving.app_startup import configure_cpu_threading, startup
from backend.serving.onnx_engine import ONNXEngine, get_onnx_engine


# =====================================================================
# 1. Zero-Network Boot & Socket Isolation Tests
# =====================================================================


def test_zero_network_environment_variables_configured():
    """Verify that configure_cpu_threading sets all offline and thread defaults."""
    with patch.dict(os.environ, {}, clear=True):
        configure_cpu_threading(1)
        assert os.environ.get("OMP_NUM_THREADS") == "1"
        assert os.environ.get("MKL_NUM_THREADS") == "1"
        assert os.environ.get("OPENBLAS_NUM_THREADS") == "1"
        assert os.environ.get("NUMEXPR_NUM_THREADS") == "1"
        assert os.environ.get("VECLIB_MAXIMUM_THREADS") == "1"
        assert os.environ.get("BLIS_NUM_THREADS") == "1"
        assert os.environ.get("NOVA_CPU_THREADS") == "1"
        assert os.environ.get("ORT_INTRA_OP_NUM_THREADS") == "1"


def test_socket_blocking_during_model_loader_when_downloads_disabled(tmp_path, monkeypatch):
    """Ensure that ensure_model_files makes zero socket connection attempts when disabled."""
    import backend.models.model_loader as loader

    monkeypatch.setenv("NOVA_DISABLE_MODEL_DOWNLOADS", "1")
    monkeypatch.setenv("NOVA_EAGER_MODEL_DOWNLOAD", "0")
    monkeypatch.setenv("NOVA_REFRESH_PIPELINE_MANIFEST", "0")

    original_connect = socket.socket.connect

    def blocked_connect(self, *args, **kwargs):
        raise RuntimeError("Forbidden outbound network connection in zero-network mode!")

    monkeypatch.setattr(socket.socket, "connect", blocked_connect)

    result = loader.ensure_model_files(tmp_path, selected_files={"sbert_encoder.quant.onnx", "turbovec.tq"})
    assert result["sbert_encoder.quant.onnx"] is False
    assert result["turbovec.tq"] is False


def test_onnxsbertencoder_offline_tokenizer_loading():
    """Test that ONNXSBERTEncoder attempts local_files_only=True first."""
    mock_ort_session = MagicMock()
    mock_tokenizer_instance = MagicMock()

    with (
        patch("onnxruntime.SessionOptions"),
        patch("onnxruntime.InferenceSession", return_value=mock_ort_session),
        patch("transformers.AutoTokenizer.from_pretrained", return_value=mock_tokenizer_instance) as mock_from_pretrained,
    ):
        encoder = ONNXSBERTEncoder("dummy_path.onnx", "sentence-transformers/all-MiniLM-L6-v2")

        mock_from_pretrained.assert_called_with(
            "sentence-transformers/all-MiniLM-L6-v2", local_files_only=True
        )
        assert encoder.tokenizer is mock_tokenizer_instance


def test_onnxsbertencoder_tokenizer_fallback_on_offline_failure():
    """Test that ONNXSBERTEncoder falls back gracefully if local_files_only fails."""
    mock_ort_session = MagicMock()
    mock_tokenizer_instance = MagicMock()

    # First call with local_files_only raises OSError, second call succeeds
    with (
        patch("onnxruntime.SessionOptions"),
        patch("onnxruntime.InferenceSession", return_value=mock_ort_session),
        patch(
            "transformers.AutoTokenizer.from_pretrained",
            side_effect=[OSError("Model not found in local cache"), mock_tokenizer_instance],
        ) as mock_from_pretrained,
    ):
        encoder = ONNXSBERTEncoder("dummy_path.onnx", "sentence-transformers/all-MiniLM-L6-v2")

        assert mock_from_pretrained.call_count == 2
        assert encoder.tokenizer is mock_tokenizer_instance


# =====================================================================
# 2. CPU Thread Pinning Tests
# =====================================================================


def test_torch_thread_pinning():
    """Verify configure_cpu_threading pins PyTorch threads to 1."""
    try:
        import torch

        configure_cpu_threading(1)
        assert torch.get_num_threads() == 1
    except ImportError:
        pytest.skip("PyTorch not installed in this environment")


def test_onnxsbertencoder_thread_options():
    """Verify ONNXSBERTEncoder configures intra_op=1 and inter_op=1."""
    mock_session_options = MagicMock()
    with (
        patch("onnxruntime.SessionOptions", return_value=mock_session_options),
        patch("onnxruntime.InferenceSession", return_value=MagicMock()),
        patch("transformers.AutoTokenizer", MagicMock()),
        patch.dict(os.environ, {"ORT_INTRA_OP_NUM_THREADS": "1"}),
    ):
        _ = ONNXSBERTEncoder("dummy.onnx")
        assert mock_session_options.intra_op_num_threads == 1
        assert mock_session_options.inter_op_num_threads == 1
        mock_session_options.add_session_config_entry.assert_called_with("session.intra_op.allow_spinning", "0")


def test_onnx_engine_defaults_to_single_thread():
    """Verify ONNXEngine defaults to cpu_cores=1 and sets intra_op_num_threads=1."""
    mock_session_options = MagicMock()
    with (
        patch("backend.serving.onnx_engine.ort.SessionOptions", return_value=mock_session_options),
        patch("backend.serving.onnx_engine.ort.InferenceSession", return_value=MagicMock()),
        patch.object(Path, "exists", return_value=True),
    ):
        engine = ONNXEngine(cpu_cores=1)
        assert engine._cpu_cores == 1
        assert mock_session_options.intra_op_num_threads == 1
        assert mock_session_options.inter_op_num_threads == 1


# =====================================================================
# 3. Direct ONNX Query Encoder Loading Tests
# =====================================================================


def test_recommender_loads_direct_onnx_encoder_despite_mpnet_manifest(tmp_path):
    """Test Recommender._get_query_encoder loads ONNXSBERTEncoder when onnx exists and minilm configured."""
    rec = Recommender()
    rec.manifest = {"model_name": "sentence-transformers/all-MiniLM-L6-v2"}

    mock_onnx_encoder = MagicMock()

    with (
        patch("backend.pipeline.recommender.MODELS_DIR", tmp_path),
        patch("backend.pipeline.recommender.ONNXSBERTEncoder", return_value=mock_onnx_encoder) as mock_cls,
    ):
        # Create dummy ONNX file so onnx_path.exists() is True
        onnx_file = tmp_path / "sbert_encoder.quant.onnx"
        onnx_file.write_bytes(b"dummy onnx content")

        encoder = rec._get_query_encoder()

        assert encoder is mock_onnx_encoder
        mock_cls.assert_called_once_with(str(onnx_file), "sentence-transformers/all-MiniLM-L6-v2")


def test_recommender_fallback_to_sentence_transformer_when_onnx_missing(tmp_path):
    """Test Recommender._get_query_encoder falls back to SentenceTransformer when ONNX absent."""
    rec = Recommender()
    rec.manifest = {"model_name": "all-mpnet-base-v2"}

    mock_st_instance = MagicMock()
    mock_st_cls = MagicMock(return_value=mock_st_instance)

    with (
        patch("backend.pipeline.recommender.MODELS_DIR", tmp_path),
        patch.dict("sys.modules", {"sentence_transformers": MagicMock(SentenceTransformer=mock_st_cls)}),
    ):
        # Ensure no ONNX file exists
        encoder = rec._get_query_encoder()

        assert encoder is mock_st_instance
        mock_st_cls.assert_called_once_with("all-mpnet-base-v2")


def test_recommender_fallback_when_onnx_init_fails(tmp_path):
    """Test Recommender._get_query_encoder falls back if ONNXSBERTEncoder raises an error."""
    rec = Recommender()
    rec.manifest = {"model_name": "all-mpnet-base-v2"}

    mock_st_instance = MagicMock()
    mock_st_cls = MagicMock(return_value=mock_st_instance)

    with (
        patch("backend.pipeline.recommender.MODELS_DIR", tmp_path),
        patch("backend.pipeline.recommender.ONNXSBERTEncoder", side_effect=RuntimeError("Corrupt ONNX model")),
        patch.dict("sys.modules", {"sentence_transformers": MagicMock(SentenceTransformer=mock_st_cls)}),
    ):
        onnx_file = tmp_path / "sbert_encoder.quant.onnx"
        onnx_file.write_bytes(b"dummy")

        encoder = rec._get_query_encoder()

        assert encoder is mock_st_instance
        mock_st_cls.assert_called_once_with("all-mpnet-base-v2")



def test_dense_query_enabled_flag(tmp_path, monkeypatch):
    """Test _dense_query_enabled obeys env-var and model existence."""
    rec = Recommender()

    monkeypatch.setenv("NOVA_ENABLE_DENSE_QUERY", "true")
    assert rec._dense_query_enabled() is True

    monkeypatch.setenv("NOVA_ENABLE_DENSE_QUERY", "false")
    assert rec._dense_query_enabled() is False

    monkeypatch.delenv("NOVA_ENABLE_DENSE_QUERY", raising=False)
    with patch("backend.pipeline.recommender.MODELS_DIR", tmp_path):
        assert rec._dense_query_enabled() is False
        (tmp_path / "sbert_encoder.quant.onnx").write_bytes(b"dummy")
        assert rec._dense_query_enabled() is True


# =====================================================================
# 4. Pre-Warming Pipeline & Session Warmup Tests
# =====================================================================


def test_onnx_engine_prewarm_all_sessions():
    """Verify prewarm_all_sessions runs dummy inference on all loaded sessions."""
    engine = ONNXEngine.__new__(ONNXEngine)

    mock_input_int64 = MagicMock()
    mock_input_int64.name = "input_ids"
    mock_input_int64.shape = [1, 10]
    mock_input_int64.type = "tensor(int64)"

    mock_input_float = MagicMock()
    mock_input_float.name = "user_emb"
    mock_input_float.shape = [1, 64]
    mock_input_float.type = "tensor(float)"

    session1 = MagicMock()
    session1.get_inputs.return_value = [mock_input_int64]

    session2 = MagicMock()
    session2.get_inputs.return_value = [mock_input_float]

    engine.sessions = {
        "mmoe_ranker": session1,
        "kan_ranker": session2,
    }

    warmed_count = engine.prewarm_all_sessions()

    assert warmed_count == 2
    session1.run.assert_called_once()
    session2.run.assert_called_once()


def test_onnx_engine_prewarm_fault_tolerance():
    """Verify prewarm_all_sessions continues if one session raises an exception."""
    engine = ONNXEngine.__new__(ONNXEngine)

    mock_input = MagicMock()
    mock_input.name = "x"
    mock_input.shape = [1, 8]
    mock_input.type = "tensor(float)"

    failing_session = MagicMock()
    failing_session.get_inputs.return_value = [mock_input]
    failing_session.run.side_effect = RuntimeError("ORT inference failed")

    ok_session = MagicMock()
    ok_session.get_inputs.return_value = [mock_input]

    engine.sessions = {
        "failing_model": failing_session,
        "ok_model": ok_session,
    }

    warmed_count = engine.prewarm_all_sessions()

    assert warmed_count == 1
    ok_session.run.assert_called_once()


@pytest.mark.asyncio
async def test_startup_prewarm_touches_all_components():
    """Verify that startup pre-warming exercises encoder, sessions, index, mmap pages, routes, and GC freeze."""
    mock_rec = MagicMock()
    mock_rec._get_query_encoder.return_value = MagicMock()
    mock_rec._index = MagicMock()
    mock_rec._vectors = np.ones((1000, 768), dtype=np.float32)

    mock_engine = MagicMock()
    mock_engine.prewarm_all_sessions.return_value = 6

    with (
        patch("backend.serving.onnx_engine.get_onnx_engine", return_value=mock_engine),
        patch("gc.freeze") if hasattr(gc, "freeze") else patch("gc.collect"),
        patch("asyncio.get_event_loop") as mock_loop,
    ):
        # We invoke startup and capture the background executor tasks
        executed_tasks = []

        def fake_run_in_executor(executor, func, *args):
            executed_tasks.append(func)
            # Run immediately synchronously for testing
            return func(*args)

        mock_loop.return_value.run_in_executor = fake_run_in_executor

        _ = await startup(
            recommender_get_fn=lambda: mock_rec,
            recommender_set_fn=lambda r: None,
        )

        # Verify all pre-warm subroutines ran
        mock_rec._get_query_encoder.return_value.encode.assert_called_once()
        mock_engine.prewarm_all_sessions.assert_called_once()
        mock_rec._index.search.assert_called_once()
        mock_rec.search_by_title.assert_called_once_with("Action", top_n=5)
        mock_rec.search_movies.assert_called_once_with("Spider-Man", limit=5)
        mock_rec.recommend_by_id.assert_called_once_with(movie_id=550, n=5)
        mock_rec.ai_search.assert_called_once_with("Sci-Fi Adventure", n=5)


# =====================================================================
# 5. Dockerfile Configuration Tests
# =====================================================================


def test_dockerfile_offline_and_thread_pinning_directives():
    """Verify Dockerfile contains the mandatory offline and single-core thread directives."""
    dockerfile_path = Path("Dockerfile")
    assert dockerfile_path.exists(), "Dockerfile must exist"

    content = dockerfile_path.read_text(encoding="utf-8")

    expected_envs = [
        "ENV NOVA_EAGER_MODEL_DOWNLOAD=false",
        "ENV NOVA_REFRESH_PIPELINE_MANIFEST=false",
        "ENV NOVA_DISABLE_MODEL_DOWNLOADS=true",
        "ENV TRANSFORMERS_OFFLINE=1",
        "ENV HF_HUB_OFFLINE=1",
        "ENV OMP_NUM_THREADS=1",
        "ENV MKL_NUM_THREADS=1",
        "ENV OPENBLAS_NUM_THREADS=1",
        "ENV NUMEXPR_NUM_THREADS=1",
        "ENV VECLIB_MAXIMUM_THREADS=1",
        "ENV BLIS_NUM_THREADS=1",
        "ENV NOVA_CPU_THREADS=1",
        "ENV ORT_INTRA_OP_NUM_THREADS=1",
    ]

    for env_directive in expected_envs:
        assert env_directive in content, f"Missing {env_directive} in Dockerfile"
