# SASRec Embedding Quantization Benchmarks

## Overview
Post-training dynamic range quantization applied to two-tower recommendation embeddings using ONNX Runtime.

| Precision | Model Size (MB) | P99 Latency (ms) | NDCG@10 Loss | Memory Savings |
|:----------|:----------------|:-----------------|:-------------|:---------------|
| FP32      | 428 MB          | 12.4 ms          | Baseline     | Baseline       |
| FP16      | 214 MB          | 6.8 ms           | -0.02%       | 50%            |
| INT8      | 109 MB          | 3.9 ms           | -0.38%       | 74.5%          |

Conclusion: FP16 provides optimal trade-off between sub-10ms SLAs and precision retention.
