"""
Unit tests for SciPy CSR sparse interaction matrix generation from tabular ratings.
"""
import unittest
import numpy as np
from scipy.sparse import csr_matrix

class TestSparseMatrixBuilder(unittest.TestCase):
    def test_csr_construction_dimensions(self):
        row_indices = np.array([0, 0, 1, 2, 2])
        col_indices = np.array([1, 2, 0, 1, 3])
        ratings = np.array([4.5, 5.0, 3.0, 2.5, 4.0])
        matrix = csr_matrix((ratings, (row_indices, col_indices)), shape=(3, 4))
        self.assertEqual(matrix.shape, (3, 4))
        self.assertEqual(matrix.nnz, 5)
        self.assertAlmostEqual(matrix[0, 1], 4.5)

if __name__ == "__main__":
    unittest.main()
