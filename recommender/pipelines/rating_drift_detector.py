"""
Online data drift detection using two-sample Kolmogorov-Smirnov test.
"""
from typing import Tuple
import numpy as np
from scipy import stats

class RatingDriftDetector:
    """Monitors live recommendation rating feedback streams for concept drift."""

    def __init__(self, significance_level: float = 0.05) -> None:
        self.alpha = significance_level

    def check_drift(self, baseline_scores: np.ndarray, current_scores: np.ndarray) -> Tuple[bool, float]:
        res = stats.ks_2samp(baseline_scores, current_scores)
        drift_detected = bool(res.pvalue < self.alpha)
        return drift_detected, float(res.pvalue)
