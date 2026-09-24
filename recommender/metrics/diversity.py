"""
Ranking evaluation metrics: Intra-List Diversity (ILD) and Long-Tail Catalog Coverage.
"""
from typing import List, Sequence
import numpy as np

def compute_intra_list_diversity(item_embeddings: np.ndarray) -> float:
    """Compute mean pairwise cosine distance across recommended items in top-K ranking."""
    n = len(item_embeddings)
    if n < 2:
        return 0.0
    norms = np.linalg.norm(item_embeddings, axis=1, keepdims=True)
    normalized = item_embeddings / np.maximum(norms, 1e-9)
    sim_matrix = np.dot(normalized, normalized.T)
    pairwise_distances = 1.0 - sim_matrix
    upper_tri = pairwise_distances[np.triu_indices(n, k=1)]
    return float(np.mean(upper_tri))
