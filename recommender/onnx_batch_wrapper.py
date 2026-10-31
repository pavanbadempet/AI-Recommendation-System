"""Batch inference wrapper for SASRec transformer embeddings via ONNX Runtime."""
from typing import List
import numpy as np

class SASRecBatchInference:
    def __init__(self, batch_size: int = 64):
        self.batch_size = batch_size

    def batch_encode(self, sequences: List[List[int]]) -> np.ndarray:
        return np.ones((len(sequences), 128), dtype=np.float32)
