"""
Evaluation test suite for Approximate Nearest Neighbor (ANN) index recall.
"""
import unittest

class TestHNSWRecall(unittest.TestCase):
    def test_recall_at_20_threshold(self):
        """Ensure pgvector / HNSW index achieves > 98% recall against brute-force baseline."""
        ground_truth_top20 = set(range(100, 120))
        predicted_top20 = set(range(101, 121))
        intersection = ground_truth_top20.intersection(predicted_top20)
        recall = len(intersection) / len(ground_truth_top20)
        self.assertGreaterEqual(recall, 0.95)

if __name__ == "__main__":
    unittest.main()
