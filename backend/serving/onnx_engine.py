"""
ONNX Runtime Engine for Sub-50ms CPU Serving.

This module loads the highly optimized ONNX graphs and executes them using
the C++ backend of ONNX Runtime, completely bypassing the Python GIL.
"""

import logging
import os
from pathlib import Path

import numpy as np
import onnxruntime as ort

logger = logging.getLogger(__name__)

MODELS_DIR = Path("models")
ONNX_DIR = MODELS_DIR / "onnx"
REQUIRED_TIER2_MODELS = frozenset(
    {
        "mmoe_ranker",
        "lightgcn",
        "hyperbolic",
        "kan_ranker",
        "sasrec",
        "diffusion",
    }
)


class ONNXEngine:
    def __init__(self, cpu_cores: int = 1):
        self.sessions = {}
        # If cpu_cores <= 0, default to single-threaded execution for zero-latency CPU serving
        self._cpu_cores = cpu_cores if cpu_cores > 0 else int(os.getenv("ORT_INTRA_OP_NUM_THREADS", "1"))

        # We use CPUExecutionProvider for maximum multi-threading throughput on standard nodes
        self.providers = ["CPUExecutionProvider"]

        self.load_model("mmoe_ranker", ONNX_DIR / "mmoe_ranker.onnx")
        self.load_model("lightgcn", ONNX_DIR / "lightgcn.onnx")
        self.load_model("hyperbolic", ONNX_DIR / "hyperbolic.onnx")
        self.load_model("quantum_fluid", ONNX_DIR / "quantum_fluid.onnx")
        self.load_model("kan_ranker", ONNX_DIR / "kan_ranker.onnx")
        self.load_model("sasrec", ONNX_DIR / "sasrec.onnx")
        self.load_model("diffusion", ONNX_DIR / "diffusion.onnx")

    def load_model(self, name: str, path: Path):
        """Loads an ONNX model into memory."""
        if path.exists():
            try:
                # Set SessionOptions to enable graph optimizations
                sess_options = ort.SessionOptions()
                sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                sess_options.enable_mem_pattern = True
                sess_options.enable_cpu_mem_arena = True
                sess_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
                sess_options.inter_op_num_threads = 1
                sess_options.add_session_config_entry("session.intra_op.allow_spinning", "0")
                # Use detected CPU core count; 0 = let ORT decide
                sess_options.intra_op_num_threads = self._cpu_cores

                self.sessions[name] = ort.InferenceSession(str(path), sess_options, providers=self.providers)
                logger.info("Loaded ONNX Model: %s (threads=%d)", name, self._cpu_cores)
            except Exception as e:
                logger.error(f"Failed to load ONNX model {name}: {e}")
        else:
            logger.warning(f"ONNX Model not found: {path}")

    def has_any_onnx_models(self) -> bool:
        """Return True if at least one ONNX model session loaded successfully."""
        return len(self.sessions) > 0

    def missing_required_models(self) -> list[str]:
        """Return required Tier 2 model names without a loaded ONNX session."""
        return sorted(REQUIRED_TIER2_MODELS - set(self.sessions))

    def has_required_models(self) -> bool:
        """Return True only when the complete supported Tier 2 set is loaded."""
        return not self.missing_required_models()

    def predict_mmoe(self, user_ids: np.ndarray, item_ids: np.ndarray):
        """Runs the Multi-Task Ranker via C++ runtime."""
        if "mmoe_ranker" not in self.sessions:
            raise RuntimeError("MMoERanker ONNX model not loaded.")

        session = self.sessions["mmoe_ranker"]
        # Position Bias is disabled during serving (passed as 0 or skipped)
        inputs = {
            "user_ids": user_ids.astype(np.int64),
            "item_ids": item_ids.astype(np.int64),
        }

        # If the ONNX graph demands a third input, we pass a dummy
        input_names = [inp.name for inp in session.get_inputs()]
        if "position_ids" in input_names:
            inputs["position_ids"] = np.zeros_like(user_ids, dtype=np.int64)

        # Returns: pred_ctr, pred_watch, pred_sat
        outputs = session.run(None, inputs)
        return outputs[0], outputs[1], outputs[2]

    def predict_lightgcn(self, user_ids: np.ndarray, item_ids: np.ndarray):
        if "lightgcn" not in self.sessions:
            raise RuntimeError("LightGCN ONNX model not loaded.")
        session = self.sessions["lightgcn"]
        inputs = {
            "user_ids": user_ids.astype(np.int64),
            "item_ids": item_ids.astype(np.int64),
        }
        outputs = session.run(None, inputs)
        return outputs[0]

    def predict_hyperbolic(self, user_ids: np.ndarray, item_ids: np.ndarray):
        if "hyperbolic" not in self.sessions:
            raise RuntimeError("Hyperbolic ONNX model not loaded.")
        session = self.sessions["hyperbolic"]
        inputs = {
            "user_ids": user_ids.astype(np.int64),
            "item_ids": item_ids.astype(np.int64),
        }
        outputs = session.run(None, inputs)
        return outputs[0]

    def predict_kan(self, user_emb: np.ndarray, item_emb: np.ndarray) -> np.ndarray:
        """Run KAN ranker via ONNX. Inputs are pre-computed embeddings."""
        if "kan_ranker" not in self.sessions:
            raise RuntimeError("KAN ONNX model not loaded.")
        outputs = self.sessions["kan_ranker"].run(
            None,
            {
                "user_emb": user_emb.astype(np.float32),
                "item_emb": item_emb.astype(np.float32),
            },
        )
        return outputs[0]

    def predict_sasrec(self, log_seqs: np.ndarray, candidate_items: np.ndarray) -> np.ndarray:
        """Run SASRec via ONNX. log_seqs: [1, 50], candidate_items: [1, N]."""
        if "sasrec" not in self.sessions:
            raise RuntimeError("SASRec ONNX model not loaded.")
        outputs = self.sessions["sasrec"].run(
            None,
            {
                "log_seqs": log_seqs.astype(np.int64),
                "candidate_items": candidate_items.astype(np.int64),
            },
        )
        return outputs[0]

    def predict_diffusion(self, x: np.ndarray, t: np.ndarray, user_emb: np.ndarray) -> np.ndarray:
        """Run Diffusion denoiser via ONNX."""
        if "diffusion" not in self.sessions:
            raise RuntimeError("Diffusion ONNX model not loaded.")
        outputs = self.sessions["diffusion"].run(
            None,
            {
                "x": x.astype(np.float32),
                "t": t.astype(np.float32),
                "user_emb": user_emb.astype(np.float32),
            },
        )
        return outputs[0]

    def predict_quantum(self, user_ids: np.ndarray, item_ids: np.ndarray) -> np.ndarray:
        """Run Quantum Fluid model via ONNX."""
        if "quantum_fluid" not in self.sessions:
            raise RuntimeError("Quantum ONNX model not loaded.")
        outputs = self.sessions["quantum_fluid"].run(
            None,
            {
                "user_ids": user_ids.astype(np.int64),
                "item_ids": item_ids.astype(np.int64),
            },
        )
        return outputs[0]


    def prewarm_all_sessions(self) -> int:
        """Execute a dummy forward pass through all loaded ONNX sessions.

        Returns:
            int: Number of successfully pre-warmed ONNX sessions.
        """
        warmed = 0
        for name, session in self.sessions.items():
            try:
                dummy_inputs = {}
                for inp in session.get_inputs():
                    shape = [dim if (isinstance(dim, int) and dim > 0) else 1 for dim in inp.shape]
                    if "int64" in inp.type:
                        dummy_inputs[inp.name] = np.zeros(shape, dtype=np.int64)
                    elif "int" in inp.type:
                        dummy_inputs[inp.name] = np.zeros(shape, dtype=np.int32)
                    elif "float" in inp.type:
                        dummy_inputs[inp.name] = np.zeros(shape, dtype=np.float32)
                    elif "double" in inp.type:
                        dummy_inputs[inp.name] = np.zeros(shape, dtype=np.float64)
                    else:
                        dummy_inputs[inp.name] = np.zeros(shape, dtype=np.float32)
                session.run(None, dummy_inputs)
                warmed += 1
                logger.debug("Pre-warmed ONNX session: %s", name)
            except Exception as exc:
                logger.warning("Pre-warm forward pass failed for ONNX model %s: %s", name, exc)
        return warmed


# Singleton Global Engine
_onnx_engine = None
_onnx_engine_lock = None  # initialised lazily to avoid import-time threading overhead


def get_onnx_engine(cpu_cores: int = 1) -> ONNXEngine:
    """Return the module-level ONNXEngine singleton (thread-safe)."""
    global _onnx_engine, _onnx_engine_lock
    # Lazy-init the lock itself (safe: GIL protects simple assignment at module level)
    if _onnx_engine_lock is None:
        import threading

        _onnx_engine_lock = threading.Lock()
    if _onnx_engine is None:
        with _onnx_engine_lock:
            if _onnx_engine is None:
                _onnx_engine = ONNXEngine(cpu_cores=cpu_cores)
    return _onnx_engine
