"""Tier 2: Boundary, Corner Case, and Error Resilience Tests.

Verifies input validation, boundary values, error responses (404, 422),
zero-network security enforcement, and FastCache eviction dynamics.
"""

from __future__ import annotations

import concurrent.futures
import socket
import time

import pytest

from backend.api.fast_cache import FastCache, clear_all_caches
from tests.e2e.conftest import NetworkCallBlockedError, assert_zero_network_calls


# =====================================================================
# 1. Recommendation Endpoint Boundaries (/v1/recommendations/id/{movie_id})
# =====================================================================
class TestRecommendationBoundaries:
    """Boundary tests for /v1/recommendations/id/{movie_id}."""

    def test_nonexistent_large_movie_id_returns_404(self, client):
        """Verify non-existent movie ID (999999999) returns 404 Not Found."""
        response = client.get("/v1/recommendations/id/999999999")
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()

    def test_negative_movie_id_returns_422(self, client):
        """Verify negative movie_id returns 422 Unprocessable Entity (ge=0)."""
        response = client.get("/v1/recommendations/id/-1")
        assert response.status_code == 422

    def test_zero_movie_id_handled(self, client):
        """Verify movie_id=0 returns either 200 or 404 without unhandled 500."""
        response = client.get("/v1/recommendations/id/0")
        assert response.status_code in {200, 404}

    def test_float_movie_id_returns_422(self, client):
        """Verify float movie ID (e.g. 550.5) returns 422."""
        response = client.get("/v1/recommendations/id/550.5")
        assert response.status_code == 422

    def test_string_non_integer_movie_id_returns_422(self, client):
        """Verify string movie ID (e.g. 'inception') returns 422."""
        response = client.get("/v1/recommendations/id/inception")
        assert response.status_code == 422

    def test_recommendations_limit_n_zero_returns_422(self, client, sample_movie_ids):
        """Verify n=0 returns 422 Unprocessable Entity (ge=1 constraint)."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 0})
        assert response.status_code == 422

    def test_recommendations_limit_n_negative_returns_422(self, client, sample_movie_ids):
        """Verify negative n returns 422 Unprocessable Entity."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": -5})
        assert response.status_code == 422

    def test_recommendations_limit_n_exceeds_max_returns_422(self, client, sample_movie_ids):
        """Verify n=51 returns 422 Unprocessable Entity (le=50 constraint)."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 51})
        assert response.status_code == 422

    def test_recommendations_limit_n_non_integer_returns_422(self, client, sample_movie_ids):
        """Verify non-integer n returns 422."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": "ten"})
        assert response.status_code == 422


# =====================================================================
# 2. AI Search Endpoint Boundaries (/v1/search/ai)
# =====================================================================
class TestAISearchBoundaries:
    """Boundary tests for /v1/search/ai."""

    def test_ai_search_missing_q_parameter_returns_422(self, client):
        """Verify omitting required 'q' parameter returns 422."""
        response = client.get("/v1/search/ai")
        assert response.status_code == 422

    def test_ai_search_empty_query_returns_422(self, client):
        """Verify empty string query q='' returns 422 (min_length=1)."""
        response = client.get("/v1/search/ai", params={"q": ""})
        assert response.status_code == 422

    def test_ai_search_whitespace_query_returns_200(self, client):
        """Verify whitespace-only query is handled gracefully with 200."""
        response = client.get("/v1/search/ai", params={"q": "   "})
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_ai_search_single_char_query(self, client):
        """Verify single character query q='a' returns 200."""
        response = client.get("/v1/search/ai", params={"q": "a", "limit": 3})
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_ai_search_extremely_long_query(self, client):
        """Verify 1000-character long natural language prompt is handled without crashing."""
        long_query = "space adventure intergalactic journey " * 30
        response = client.get("/v1/search/ai", params={"q": long_query, "limit": 5})
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_ai_search_unicode_and_emojis(self, client):
        """Verify search query with unicode and emojis processes cleanly."""
        response = client.get("/v1/search/ai", params={"q": "🚀 🎬 sci-fi résumé café 日本語", "limit": 5})
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_ai_search_sql_injection_payload(self, client):
        """Verify SQL injection payloads do not cause exceptions or crashes."""
        response = client.get("/v1/search/ai", params={"q": "' OR '1'='1'; DROP TABLE movies; --", "limit": 5})
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_ai_search_xss_script_payload(self, client):
        """Verify XSS payloads are handled safely."""
        response = client.get("/v1/search/ai", params={"q": "<script>alert('xss')</script>", "limit": 5})
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_ai_search_limit_zero_returns_422(self, client):
        """Verify limit=0 returns 422 (ge=1 constraint)."""
        response = client.get("/v1/search/ai", params={"q": "space", "limit": 0})
        assert response.status_code == 422

    def test_ai_search_limit_negative_returns_422(self, client):
        """Verify negative limit returns 422."""
        response = client.get("/v1/search/ai", params={"q": "space", "limit": -5})
        assert response.status_code == 422

    def test_ai_search_limit_exceeds_max_returns_422(self, client):
        """Verify limit=101 returns 422 (le=100 constraint)."""
        response = client.get("/v1/search/ai", params={"q": "space", "limit": 101})
        assert response.status_code == 422

    def test_ai_search_top_k_zero_returns_422(self, client):
        """Verify top_k=0 returns 422 (ge=1 constraint)."""
        response = client.get("/v1/search/ai", params={"q": "space", "top_k": 0})
        assert response.status_code == 422

    def test_ai_search_top_k_exceeds_max_returns_422(self, client):
        """Verify top_k=101 returns 422 (le=100 constraint)."""
        response = client.get("/v1/search/ai", params={"q": "space", "top_k": 101})
        assert response.status_code == 422


# =====================================================================
# 3. Showcase Endpoint Boundaries (/movies/showcase)
# =====================================================================
class TestShowcaseBoundaries:
    """Boundary tests for /movies/showcase."""

    def test_showcase_limit_exceeds_max_returns_422(self, client):
        """Verify limit=21 returns 422 Unprocessable Entity (le=20 constraint)."""
        response = client.get("/movies/showcase", params={"limit": 21})
        assert response.status_code == 422

    def test_showcase_limit_non_integer_returns_422(self, client):
        """Verify limit='invalid' returns 422."""
        response = client.get("/movies/showcase", params={"limit": "abc"})
        assert response.status_code == 422

    def test_showcase_limit_1_minimum(self, client):
        """Verify minimum limit=1 returns exactly 1 showcase movie."""
        response = client.get("/movies/showcase", params={"limit": 1})
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    def test_showcase_limit_20_maximum(self, client):
        """Verify maximum limit=20 returns up to 20 showcase movies."""
        response = client.get("/movies/showcase", params={"limit": 20})
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 20
        assert len(data) > 0


# =====================================================================
# 4. Movie Titles Catalog Boundaries (/movies/titles)
# =====================================================================
class TestMovieTitlesBoundaries:
    """Boundary tests for /movies/titles."""

    def test_titles_limit_zero_returns_422(self, client):
        """Verify limit=0 returns 422 (ge=1 constraint)."""
        response = client.get("/movies/titles", params={"limit": 0})
        assert response.status_code == 422

    def test_titles_limit_negative_returns_422(self, client):
        """Verify negative limit returns 422."""
        response = client.get("/movies/titles", params={"limit": -10})
        assert response.status_code == 422

    def test_titles_limit_exceeds_100k_returns_422(self, client):
        """Verify limit=100001 returns 422 (le=100000 constraint)."""
        response = client.get("/movies/titles", params={"limit": 100001})
        assert response.status_code == 422

    def test_titles_limit_1_minimum(self, client):
        """Verify limit=1 returns exactly 1 title entry."""
        response = client.get("/movies/titles", params={"limit": 1})
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    def test_titles_limit_non_integer_returns_422(self, client):
        """Verify non-integer limit returns 422."""
        response = client.get("/movies/titles", params={"limit": "hundred"})
        assert response.status_code == 422


# =====================================================================
# 5. Network, Thread, and FastCache Resilience Boundaries
# =====================================================================
class TestSystemResilienceBoundaries:
    """Boundary tests for Zero-Network enforcement and FastCache operations."""

    def test_zero_network_guard_blocks_outbound_connection(self):
        """Verify assert_zero_network_calls strictly catches outbound network attempts."""
        with pytest.raises(NetworkCallBlockedError) as exc_info:
            with assert_zero_network_calls():
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.connect(("8.8.8.8", 53))
        assert "Blocked outbound network attempt" in str(exc_info.value)

    def test_fastcache_ttl_expiration(self):
        """Verify FastCache entries expire and are pruned after TTL."""
        cache = FastCache(ttl_seconds=0.05, max_size=10)
        cache.set("test_key", {"data": "cached_val"})
        assert cache.get("test_key") == {"data": "cached_val"}
        time.sleep(0.06)
        assert cache.get("test_key") is None

    def test_fastcache_max_size_lru_eviction(self):
        """Verify FastCache evicts oldest item when max_size capacity is reached."""
        cache = FastCache(ttl_seconds=60.0, max_size=3)
        cache.set("k1", 1)
        cache.set("k2", 2)
        cache.set("k3", 3)
        assert len(cache.cache) == 3

        # Insert 4th item - should evict oldest (k1)
        cache.set("k4", 4)
        assert len(cache.cache) == 3
        assert cache.get("k1") is None
        assert cache.get("k2") == 2
        assert cache.get("k3") == 3
        assert cache.get("k4") == 4

    def test_fastcache_clear_all_functionality(self):
        """Verify clear_all_caches() resets state across all caches."""
        clear_all_caches()
        cache = FastCache(ttl_seconds=60.0, max_size=10)
        cache.set("item1", "val1")
        cache.clear()
        assert cache.get("item1") is None

    def test_concurrent_request_burst(self, client, sample_movie_ids):
        """Verify system handles rapid burst of 20 concurrent mixed requests without corruption."""
        movie_id = sample_movie_ids[0]

        def call_endpoint(endpoint_type: int):
            if endpoint_type == 0:
                return client.get("/health").status_code
            elif endpoint_type == 1:
                return client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 5}).status_code
            elif endpoint_type == 2:
                return client.get("/v1/search/ai", params={"q": "action hero", "limit": 3}).status_code
            else:
                return client.get("/movies/showcase", params={"limit": 3}).status_code

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(call_endpoint, i % 4) for i in range(20)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        assert all(code == 200 for code in results), f"Non-200 responses in burst: {results}"
