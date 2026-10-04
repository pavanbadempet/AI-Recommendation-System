"""
Test suite for empirical Bayes shrinkage rating estimation for cold-start items.
"""
import unittest

def bayesian_shrunken_rating(rating_sum: float, count: int, global_mean: float = 3.5, prior_weight: float = 25.0) -> float:
    return (rating_sum + prior_weight * global_mean) / (count + prior_weight)

class TestBayesianShrinkage(unittest.TestCase):
    def test_zero_count_returns_global_mean(self):
        val = bayesian_shrunken_rating(0.0, 0, global_mean=3.5, prior_weight=25.0)
        self.assertAlmostEqual(val, 3.5)

    def test_large_count_approaches_sample_mean(self):
        val = bayesian_shrunken_rating(5000.0, 1000, global_mean=3.5, prior_weight=25.0)
        self.assertAlmostEqual(val, 5.0, places=1)

if __name__ == "__main__":
    unittest.main()
