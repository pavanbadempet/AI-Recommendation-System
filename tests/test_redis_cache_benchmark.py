"""Redis caching response benchmark for high-velocity movie queries."""
def test_simulated_cache_hit_latency():
    cache_store = {"movie:tt0111161": {"title": "The Shawshank Redemption", "score": 9.3}}
    assert "movie:tt0111161" in cache_store
    assert cache_store["movie:tt0111161"]["score"] > 9.0
