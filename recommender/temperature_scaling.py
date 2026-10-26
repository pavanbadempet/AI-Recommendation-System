"""Temperature scaling calibration for SASRec prediction logits."""
import numpy as np

def calibrate_logits(logits: np.ndarray, temperature: float = 1.2) -> np.ndarray:
    scaled = logits / max(temperature, 1e-4)
    exp_scaled = np.exp(scaled - np.max(scaled, axis=-1, keepdims=True))
    return exp_scaled / np.sum(exp_scaled, axis=-1, keepdims=True)
