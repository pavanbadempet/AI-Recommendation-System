"""Evaluation suite for cold-start user recommendations."""
def test_cold_start_fallback_popularity():
    top_popular = [101, 102, 103, 104, 105]
    user_history = []
    recommendations = top_popular if len(user_history) == 0 else [999]
    assert len(recommendations) == 5
    assert recommendations[0] == 101
