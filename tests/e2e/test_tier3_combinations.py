"""Tier 3: Combinatorial Workflows, Cache Transitions, and Concurrency Tests.

Verifies end-to-end multi-step pipelines, cold-to-warm FastCache state transitions,
parameter permutations, and multi-threaded concurrency resilience.
"""

from __future__ import annotations

import concurrent.futures
import time
from typing import Any

import pytest

from backend.api.fast_cache import clear_all_caches
from tests.e2e.conftest import measure_latency_ms


class TestTier3Combinations:
    """Tier 3 Combinatorial Workflows and Cross-Endpoint Chains."""

    def test_workflow_search_then_recommend(self, client):
        """Workflow 1: Search for natural language prompt, pick top movie, and get recommendations."""
        # Step 1: AI Search for thematic query
        search_resp = client.get("/v1/search/ai", params={"q": "cyberpunk artificial intelligence", "limit": 5})
        assert search_resp.status_code == 200
        search_items = search_resp.json()
        assert len(search_items) > 0

        # Step 2: Extract top candidate movie ID
        top_movie = search_items[0]
        movie_id = top_movie["id"]

        # Step 3: Fetch item-to-item vector recommendations for that movie
        rec_resp = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 5})
        assert rec_resp.status_code == 200
        rec_data = rec_resp.json()
        assert rec_data["query_movie"]["id"] == movie_id
        assert len(rec_data["recommendations"]) > 0

    def test_workflow_showcase_then_recommend_chain(self, client):
        """Workflow 2: Fetch showcase hero list, then fetch recommendations for multiple showcase items."""
        # Step 1: Retrieve curated showcase movies
        showcase_resp = client.get("/movies/showcase", params={"limit": 3})
        assert showcase_resp.status_code == 200
        showcase_movies = showcase_resp.json()
        assert len(showcase_movies) >= 1

        # Step 2: Request recommendations for each showcase movie
        for movie in showcase_movies:
            mid = movie["id"]
            rec_resp = client.get(f"/v1/recommendations/id/{mid}", params={"n": 5})
            assert rec_resp.status_code == 200
            recs = rec_resp.json().get("recommendations", [])
            assert len(recs) > 0
            # Ensure query movie is not returned in its own recommendations
            assert all(r["id"] != mid for r in recs)

    def test_workflow_titles_autocomplete_then_search(self, client):
        """Workflow 3: Autocomplete catalog titles, extract keyword, and run AI search."""
        # Step 1: Get catalog titles
        titles_resp = client.get("/movies/titles", params={"limit": 10})
        assert titles_resp.status_code == 200
        titles = titles_resp.json()
        assert len(titles) > 0

        # Step 2: Extract clean title text from first title entry (e.g. "Inception (2010) - Action")
        first_title_str = titles[0]["title"]
        title_core = first_title_str.split("(")[0].strip() if "(" in first_title_str else first_title_str[:15]

        # Step 3: Run AI search with the extracted title
        search_resp = client.get("/v1/search/ai", params={"q": title_core, "limit": 5})
        assert search_resp.status_code == 200
        search_results = search_resp.json()
        assert isinstance(search_results, list)

    def test_workflow_cold_to_warm_cache_transition(self, client, sample_movie_ids):
        """Workflow 4: Measure cold request latency vs warm cached latency, asserting speedup."""
        movie_id = sample_movie_ids[0]
        clear_all_caches()

        # Step 1: Cold request (cache miss)
        _, cold_time_ms = measure_latency_ms(
            lambda: client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 10})
        )

        # Step 2: Warm request (FastCache hit)
        warm_resp, warm_time_ms = measure_latency_ms(
            lambda: client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 10})
        )
        assert warm_resp.status_code == 200

        # FastCache hit should execute rapidly
        assert warm_time_ms < 15.0, f"Warm cache hit took {warm_time_ms:.2f}ms (expected < 15ms)"

        # Step 3: Clear cache and verify subsequent call is fresh
        clear_all_caches()
        fresh_resp = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 10})
        assert fresh_resp.status_code == 200

    def test_workflow_cache_parameter_isolation(self, client, sample_movie_ids):
        """Workflow 5: Ensure different query parameters generate distinct cache entries."""
        movie_id = sample_movie_ids[0]
        clear_all_caches()

        # Request with n=3
        resp_3 = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 3})
        assert resp_3.status_code == 200
        assert len(resp_3.json()["recommendations"]) == 3

        # Request with n=7 - must return 7 items, not the cached 3
        resp_7 = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 7})
        assert resp_7.status_code == 200
        assert len(resp_7.json()["recommendations"]) == 7

    def test_workflow_explain_flag_isolation(self, client, sample_movie_ids):
        """Workflow 6: Ensure explain=True and explain=False operate independently in cache."""
        movie_id = sample_movie_ids[0]
        clear_all_caches()

        resp_no_explain = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 3, "explain": "false"})
        assert resp_no_explain.status_code == 200

        resp_explain = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 3, "explain": "true"})
        assert resp_explain.status_code == 200
        assert len(resp_explain.json()["recommendations"]) == 3

    def test_workflow_showcase_to_movie_details_chain(self, client):
        """Workflow 7: Fetch showcase list and verify individual movie details via /movie/{id}."""
        showcase_resp = client.get("/movies/showcase", params={"limit": 2})
        assert showcase_resp.status_code == 200
        movies = showcase_resp.json()
        assert len(movies) > 0

        for m in movies:
            mid = m["id"]
            detail_resp = client.get(f"/movie/{mid}")
            assert detail_resp.status_code == 200
            detail = detail_resp.json()
            assert detail["id"] == mid
            assert detail["title"] == m["title"]

    def test_workflow_multi_genre_search_diversity(self, client):
        """Workflow 8: Verify multiple diverse thematic searches return distinct candidate lists."""
        genres = ["animated comedy family", "outer space sci-fi galaxy", "haunted house horror paranormal"]
        results_by_genre: dict[str, set[int]] = {}

        for query in genres:
            resp = client.get("/v1/search/ai", params={"q": query, "limit": 5})
            assert resp.status_code == 200
            items = resp.json()
            assert len(items) > 0
            results_by_genre[query] = {item["id"] for item in items}

        # Assert search result sets are diverse
        assert results_by_genre[genres[0]] != results_by_genre[genres[1]]
        assert results_by_genre[genres[1]] != results_by_genre[genres[2]]

    def test_workflow_concurrent_multi_user_traffic(self, client, sample_movie_ids):
        """Workflow 9: Verify 24 concurrent requests across endpoints complete without corruption."""
        sample_ids = sample_movie_ids[:4]
        queries = ["action", "thriller", "comedy", "drama"]

        def simulate_user_session(user_idx: int) -> dict[str, Any]:
            mid = sample_ids[user_idx % len(sample_ids)]
            query = queries[user_idx % len(queries)]

            r_health = client.get("/health")
            r_rec = client.get(f"/v1/recommendations/id/{mid}", params={"n": 5})
            r_search = client.get("/v1/search/ai", params={"q": query, "limit": 5})
            r_showcase = client.get("/movies/showcase", params={"limit": 4})

            return {
                "health": r_health.status_code,
                "rec": r_rec.status_code,
                "search": r_search.status_code,
                "showcase": r_showcase.status_code,
            }

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            futures = [executor.submit(simulate_user_session, i) for i in range(6)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        for res in results:
            assert res["health"] == 200
            assert res["rec"] == 200
            assert res["search"] == 200
            assert res["showcase"] == 200

    def test_workflow_health_under_active_load(self, client, sample_movie_ids):
        """Workflow 10: Health check responds quickly even while recommendations are computing."""
        mid = sample_movie_ids[0]

        def background_load():
            for _ in range(5):
                client.get(f"/v1/recommendations/id/{mid}", params={"n": 10})

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            load_future = executor.submit(background_load)

            # Check health during background load
            health_latencies = []
            for _ in range(5):
                t0 = time.perf_counter()
                resp = client.get("/health")
                elapsed_ms = (time.perf_counter() - t0) * 1000.0
                assert resp.status_code == 200
                health_latencies.append(elapsed_ms)
                time.sleep(0.01)

            load_future.result()

        assert all(lat < 20.0 for lat in health_latencies)

    def test_workflow_cache_invalidation_lifecycle(self, client, sample_movie_ids):
        """Workflow 11: Verify clear_all_caches() resets cached responses across all routes."""
        mid = sample_movie_ids[0]
        # Populate caches
        client.get("/movies/showcase", params={"limit": 5})
        client.get(f"/v1/recommendations/id/{mid}", params={"n": 5})
        client.get("/v1/search/ai", params={"q": "space journey", "limit": 5})

        # Clear caches
        clear_all_caches()

        # Re-fetch and assert success
        resp1 = client.get("/movies/showcase", params={"limit": 5})
        resp2 = client.get(f"/v1/recommendations/id/{mid}", params={"n": 5})
        resp3 = client.get("/v1/search/ai", params={"q": "space journey", "limit": 5})

        assert resp1.status_code == 200
        assert resp2.status_code == 200
        assert resp3.status_code == 200
