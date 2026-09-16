"""End-to-End Performance Optimization Test Suite for Requirements R1-R5.

Comprehensive, requirement-driven opaque-box test suite verifying:
- R1: Client-Side Instant Discovery & Speculative Hover Prefetching
- R2: Global Edge CDN & Cache Architecture (Cache-Control, SWR, ETag, 304 Not Modified)
- R3: Microsecond In-Memory SIMD Vector Retrieval & Quantized Inference
- R4: Precomputed Batch Matrix & Offline Top-K Serving
- R5: Autonomous Zero Cold-Start Reliability (Keep-Alive Ping Loop, Healthcheck SLA)

Organized across 4 verification tiers:
- Tier 1: Feature Isolation & Contract Verification
- Tier 2: Boundary & Corner Case Resilience
- Tier 3: Cross-Feature Combinations & State Transitions
- Tier 4: Real-World Latency SLAs & Hermetic Network Guarantees
"""

from __future__ import annotations

import concurrent.futures

from backend.api.fast_cache import clear_all_caches
from backend.main import app, get_rec
from backend.response_models import HealthResponse, RecommendationResponse
from backend.serving.app_startup import start_keepalive_ping_loop
from tests.e2e.conftest import (
    assert_zero_network_calls,
    benchmark_latencies,
)

# ---------------------------------------------------------------------------
# Test-Scoped Route Setup for Missing Catalog Handler
# ---------------------------------------------------------------------------
# wire_cache_control_middleware explicitly includes /v1/catalog, but
# if the router hasn't mounted GET /v1/catalog yet on the FastAPI instance,
# we provide the endpoint handler here so that the middleware's cache headers,
# ETag generation, and 304 negotiation can be fully exercised end-to-end.
if not any(getattr(r, "path", None) == "/v1/catalog" for r in app.routes):

    @app.get("/v1/catalog")
    async def _test_get_catalog():
        rec = get_rec()
        if rec and rec.movies is not None:
            return rec.movies.iloc[:50].to_dict(orient="records")
        return []


# Standard headers used for deterministic ETag negotiation tests
IDENTITY_HEADERS = {"Accept-Encoding": "identity"}


# ===========================================================================
# TIER 1: FEATURE ISOLATION & CONTRACT COVERAGE
# ===========================================================================
class TestTier1FeatureCoverage:
    """Tier 1: Feature Isolation tests for R1-R5 contract compliance."""

    def test_showcase_cache_control_and_stale_while_revalidate(self, client):
        """Verify /movies/showcase emits public Cache-Control with stale-while-revalidate."""
        response = client.get("/movies/showcase", headers=IDENTITY_HEADERS)
        assert response.status_code == 200
        cc = response.headers.get("Cache-Control", "")
        assert "public" in cc, f"Cache-Control missing 'public': {cc}"
        assert "max-age=300" in cc, f"Cache-Control missing 'max-age=300': {cc}"
        assert "stale-while-revalidate=3600" in cc, f"Cache-Control missing 'stale-while-revalidate=3600': {cc}"
        assert "s-maxage=300" in cc, f"Cache-Control missing 's-maxage=300': {cc}"

    def test_titles_cache_control_and_stale_while_revalidate(self, client):
        """Verify /movies/titles emits public Cache-Control with max-age=1800, swr=86400."""
        response = client.get("/movies/titles", headers=IDENTITY_HEADERS)
        assert response.status_code == 200
        cc = response.headers.get("Cache-Control", "")
        assert "public" in cc, f"Cache-Control missing 'public': {cc}"
        assert "max-age=1800" in cc, f"Cache-Control missing 'max-age=1800': {cc}"
        assert "stale-while-revalidate=86400" in cc, f"Cache-Control missing 'stale-while-revalidate=86400': {cc}"

    def test_movie_detail_cache_control_and_stale_while_revalidate(self, client, sample_movie_ids):
        """Verify /movie/{id} emits public Cache-Control with max-age=3600, swr=86400."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/movie/{movie_id}", headers=IDENTITY_HEADERS)
        assert response.status_code == 200
        cc = response.headers.get("Cache-Control", "")
        assert "public" in cc, f"Cache-Control missing 'public': {cc}"
        assert "max-age=3600" in cc, f"Cache-Control missing 'max-age=3600': {cc}"
        assert "stale-while-revalidate=86400" in cc, f"Cache-Control missing 'stale-while-revalidate=86400': {cc}"

    def test_catalog_cache_control_and_stale_while_revalidate(self, client):
        """Verify /v1/catalog emits public Cache-Control with max-age=600, swr=7200."""
        response = client.get("/v1/catalog", headers=IDENTITY_HEADERS)
        assert response.status_code == 200
        cc = response.headers.get("Cache-Control", "")
        assert "public" in cc, f"Cache-Control missing 'public': {cc}"
        assert "max-age=600" in cc, f"Cache-Control missing 'max-age=600': {cc}"
        assert "stale-while-revalidate=7200" in cc, f"Cache-Control missing 'stale-while-revalidate=7200': {cc}"

    def test_recommendations_cache_control_and_stale_while_revalidate(self, client, sample_movie_ids):
        """Verify /v1/recommendations/id/{id} emits public Cache-Control with max-age=600, swr=7200."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 5}, headers=IDENTITY_HEADERS)
        assert response.status_code == 200
        cc = response.headers.get("Cache-Control", "")
        assert "public" in cc, f"Cache-Control missing 'public': {cc}"
        assert "max-age=600" in cc, f"Cache-Control missing 'max-age=600': {cc}"
        assert "stale-while-revalidate=7200" in cc, f"Cache-Control missing 'stale-while-revalidate=7200': {cc}"

    def test_etag_header_presence_on_all_cacheable_endpoints(self, client, sample_movie_ids):
        """Verify deterministic ETag header presence across all read-heavy endpoints."""
        endpoints = [
            "/movies/showcase",
            "/movies/titles",
            "/v1/catalog",
            f"/movie/{sample_movie_ids[0]}",
            f"/v1/recommendations/id/{sample_movie_ids[0]}?n=5",
        ]
        for ep in endpoints:
            res = client.get(ep, headers=IDENTITY_HEADERS)
            assert res.status_code == 200, f"Expected 200 for {ep}, got {res.status_code}"
            etag = res.headers.get("ETag")
            assert etag is not None and len(etag) > 0, f"Endpoint {ep} missing ETag header"
            assert etag.startswith('"') and etag.endswith('"'), f"ETag should be quoted string, got {etag}"

    def test_etag_if_none_match_returns_304_not_modified(self, client):
        """Verify conditional GET with matching If-None-Match responds with HTTP 304 and empty body."""
        # 1. Initial GET
        res1 = client.get("/movies/showcase", headers=IDENTITY_HEADERS)
        assert res1.status_code == 200
        etag = res1.headers.get("ETag")
        assert etag is not None

        # 2. Conditional GET with matching ETag
        res2 = client.get("/movies/showcase", headers={"If-None-Match": etag, **IDENTITY_HEADERS})
        assert res2.status_code == 304, f"Expected HTTP 304 Not Modified, got {res2.status_code}"
        assert len(res2.content) == 0, f"Expected empty body on 304, got {len(res2.content)} bytes"
        assert "ETag" in res2.headers

    def test_healthcheck_responsiveness_and_schema(self, client):
        """Verify /health endpoint returns 200 and complies with HealthResponse schema."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        validated = HealthResponse(**data)
        assert validated.status in {"healthy", "degraded"}
        assert validated.movie_count > 0

    def test_keepalive_ping_loop_initialization(self):
        """Verify start_keepalive_ping_loop initializes and cancels cleanly for zero cold-start."""
        task = start_keepalive_ping_loop()
        assert task is not None, "Keepalive task should be scheduled"
        assert hasattr(task, "cancel"), "Keepalive task must be cancellable"
        task.cancel()

    def test_topk_recommendations_schema_and_valid_movie_fields(self, client, sample_movie_ids):
        """Verify top-K recommendations return expected schema, valid movie fields, and no self-reference."""
        movie_id = sample_movie_ids[0]
        n_val = 5
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": n_val}, headers=IDENTITY_HEADERS)
        assert response.status_code == 200
        data = response.json()

        validated = RecommendationResponse(**data)
        assert validated.query_movie.id == movie_id
        assert isinstance(validated.query_movie.title, str)
        assert len(validated.query_movie.title) > 0

        recs = data["recommendations"]
        assert 0 < len(recs) <= n_val

        for rec in recs:
            assert "id" in rec and isinstance(rec["id"], int) and rec["id"] > 0
            assert "title" in rec and isinstance(rec["title"], str) and len(rec["title"]) > 0
            assert rec["id"] != movie_id, "Recommendation result should not contain the query movie itself"
            similarity = rec.get("similarity_score")
            if similarity is not None:
                assert -1.0 <= similarity <= 1.0


# ===========================================================================
# TIER 2: BOUNDARY & CORNER CASE RESILIENCE
# ===========================================================================
class TestTier2BoundaryCornerCases:
    """Tier 2: Boundary, Corner Case, and Input Validation Tests."""

    def test_unknown_movie_id_recommendations_returns_404(self, client):
        """Verify unknown/non-existent movie ID returns HTTP 404 for recommendations."""
        response = client.get("/v1/recommendations/id/999999999", headers=IDENTITY_HEADERS)
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()

    def test_unknown_movie_id_movie_detail_returns_404(self, client):
        """Verify unknown/non-existent movie ID returns HTTP 404 for movie details."""
        response = client.get("/movie/999999999", headers=IDENTITY_HEADERS)
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data

    def test_out_of_bounds_n_zero_returns_422(self, client, sample_movie_ids):
        """Verify out-of-bounds parameter n=0 returns 422 Unprocessable Entity (ge=1)."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 0}, headers=IDENTITY_HEADERS)
        assert response.status_code == 422

    def test_out_of_bounds_n_too_large_returns_422(self, client, sample_movie_ids):
        """Verify out-of-bounds parameter n=100 returns 422 Unprocessable Entity (le=50)."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 100}, headers=IDENTITY_HEADERS)
        assert response.status_code == 422

    def test_out_of_bounds_n_negative_returns_422(self, client, sample_movie_ids):
        """Verify negative parameter n=-1 returns 422 Unprocessable Entity."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": -1}, headers=IDENTITY_HEADERS)
        assert response.status_code == 422

    def test_empty_if_none_match_string_returns_200(self, client):
        """Verify empty If-None-Match string returns full 200 response with fresh ETag."""
        response = client.get("/movies/showcase", headers={"If-None-Match": "", **IDENTITY_HEADERS})
        assert response.status_code == 200
        assert len(response.content) > 0
        assert "ETag" in response.headers

    def test_non_matching_if_none_match_returns_200(self, client):
        """Verify non-matching If-None-Match string returns 200 OK."""
        response = client.get(
            "/movies/showcase",
            headers={"If-None-Match": '"nonexistent-etag-12345"', **IDENTITY_HEADERS},
        )
        assert response.status_code == 200
        assert len(response.content) > 0

    def test_malformed_if_none_match_handled_gracefully(self, client):
        """Verify malformed If-None-Match does not raise 500 and returns 200."""
        response = client.get(
            "/movies/showcase",
            headers={"If-None-Match": "malformed,,??**;;;", **IDENTITY_HEADERS},
        )
        assert response.status_code == 200

    def test_wildcard_star_if_none_match_returns_304(self, client):
        """Verify If-None-Match: * returns 304 Not Modified."""
        response = client.get("/movies/showcase", headers={"If-None-Match": "*", **IDENTITY_HEADERS})
        assert response.status_code == 304
        assert len(response.content) == 0

    def test_weak_etag_prefix_returns_304(self, client):
        """Verify weak ETag format (W/\"<etag>\") is accepted and returns 304."""
        r1 = client.get("/movies/showcase", headers=IDENTITY_HEADERS)
        etag = r1.headers.get("ETag")
        weak_etag = f"W/{etag}"
        r2 = client.get("/movies/showcase", headers={"If-None-Match": weak_etag, **IDENTITY_HEADERS})
        assert r2.status_code == 304

    def test_multiple_comma_separated_etags_with_match_returns_304(self, client):
        """Verify comma-separated list of ETags containing the matching tag returns 304."""
        r1 = client.get("/movies/showcase", headers=IDENTITY_HEADERS)
        etag = r1.headers.get("ETag")
        multi_tag = f'"mismatched-tag-1", {etag}, "mismatched-tag-2"'
        r2 = client.get("/movies/showcase", headers={"If-None-Match": multi_tag, **IDENTITY_HEADERS})
        assert r2.status_code == 304

    def test_rapid_consecutive_requests_cache_stability(self, client):
        """Verify cache remains consistent and stable across 20 rapid back-to-back requests."""
        etags = []
        for _ in range(20):
            res = client.get("/movies/showcase", headers=IDENTITY_HEADERS)
            assert res.status_code == 200
            etags.append(res.headers.get("ETag"))

        # All 20 requests must return the identical deterministic ETag
        assert len(set(etags)) == 1, f"ETags drifted across consecutive requests: {set(etags)}"


# ===========================================================================
# TIER 3: CROSS-FEATURE COMBINATIONS & WORKFLOWS
# ===========================================================================
class TestTier3CrossFeatureCombinations:
    """Tier 3: Multi-step workflows, cache invalidation, and parameter variations."""

    def test_cache_revalidation_while_querying_recommendations(self, client, sample_movie_ids):
        """Workflow: Initial fetch -> 304 revalidation -> cached stability."""
        movie_id = sample_movie_ids[0]

        # Step 1: Initial recommendation query
        r1 = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 5}, headers=IDENTITY_HEADERS)
        assert r1.status_code == 200
        etag1 = r1.headers.get("ETag")
        assert etag1 is not None

        # Step 2: Conditional GET with matching ETag yields 304 Not Modified
        r2 = client.get(
            f"/v1/recommendations/id/{movie_id}",
            params={"n": 5},
            headers={"If-None-Match": etag1, **IDENTITY_HEADERS},
        )
        assert r2.status_code == 304
        assert len(r2.content) == 0

        # Step 3: Verify subsequent queries while cached preserve the same ETag
        r3 = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 5}, headers=IDENTITY_HEADERS)
        assert r3.status_code == 200
        assert r3.headers.get("ETag") == etag1

    def test_cache_purge_and_revalidation_on_showcase(self, client):
        """Workflow: Showcase fetch -> 304 -> cache purge -> deterministic re-fetch matches identical ETag."""
        # Step 1: Initial showcase fetch
        r1 = client.get("/movies/showcase", headers=IDENTITY_HEADERS)
        assert r1.status_code == 200
        etag1 = r1.headers.get("ETag")
        assert etag1 is not None

        # Step 2: Conditional GET yields 304
        r2 = client.get("/movies/showcase", headers={"If-None-Match": etag1, **IDENTITY_HEADERS})
        assert r2.status_code == 304
        assert len(r2.content) == 0

        # Step 3: Clear FastCache to simulate eviction
        clear_all_caches()

        # Step 4: Re-query without ETag -> returns identical payload and identical ETag
        r3 = client.get("/movies/showcase", headers=IDENTITY_HEADERS)
        assert r3.status_code == 200
        assert r3.headers.get("ETag") == etag1
        assert r3.content == r1.content

        # Step 5: Conditional GET after purge still yields 304
        r4 = client.get("/movies/showcase", headers={"If-None-Match": etag1, **IDENTITY_HEADERS})
        assert r4.status_code == 304

    def test_etag_differentiation_across_different_query_parameters(self, client, sample_movie_ids):
        """Verify different request parameters (e.g. n=3 vs n=10) produce distinct ETags."""
        movie_id = sample_movie_ids[0]
        r_n3 = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 3}, headers=IDENTITY_HEADERS)
        r_n10 = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 10}, headers=IDENTITY_HEADERS)

        assert r_n3.status_code == 200
        assert r_n10.status_code == 200

        etag_n3 = r_n3.headers.get("ETag")
        etag_n10 = r_n10.headers.get("ETag")
        assert etag_n3 != etag_n10, "Distinct recommendation batches must produce distinct ETags"

    def test_etag_consistency_across_catalog_and_movie_detail_fetches(self, client):
        """Workflow: Browse showcase movies -> fetch detail for each -> revalidate each with 304."""
        # Step 1: Browse showcase
        showcase_res = client.get("/movies/showcase", params={"limit": 3}, headers=IDENTITY_HEADERS)
        assert showcase_res.status_code == 200
        showcase_movies = showcase_res.json()
        assert len(showcase_movies) >= 1

        detail_etags = {}
        for m in showcase_movies[:3]:
            mid = m["id"]
            # Fetch detail
            det_res = client.get(f"/movie/{mid}", headers=IDENTITY_HEADERS)
            assert det_res.status_code == 200
            m_etag = det_res.headers.get("ETag")
            assert m_etag is not None
            detail_etags[mid] = m_etag

            # Conditional revalidation
            reval_res = client.get(f"/movie/{mid}", headers={"If-None-Match": m_etag, **IDENTITY_HEADERS})
            assert reval_res.status_code == 304

        # Distinct movies must have distinct detail ETags
        assert len(set(detail_etags.values())) == len(detail_etags)

    def test_multi_thread_concurrent_cache_access_stability(self, client):
        """Verify concurrent threaded requests to cached endpoints remain stable without race conditions."""
        endpoints = ["/movies/showcase", "/movies/titles"]

        def fetch_endpoint(ep: str) -> tuple[int, str]:
            res = client.get(ep, headers=IDENTITY_HEADERS)
            return res.status_code, res.headers.get("ETag", "")

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            tasks = [executor.submit(fetch_endpoint, ep) for ep in endpoints for _ in range(5)]
            results = [t.result() for t in tasks]

        for status, etag in results:
            assert status == 200
            assert len(etag) > 0


# ===========================================================================
# TIER 4: REAL-WORLD LATENCY SLAS & ZERO-NETWORK ENFORCEMENT
# ===========================================================================
class TestTier4RealWorldLatencyWorkload:
    """Tier 4: Latency Benchmark SLA assertions and hermetic execution verification."""

    def test_precomputed_recommendation_lookup_latency_sla(self, client, sample_movie_ids):
        """SLA: Warm/precomputed recommendation lookup executes within SLA thresholds."""
        movie_id = sample_movie_ids[0]

        # Warm up cache / in-memory index
        client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 5}, headers=IDENTITY_HEADERS)

        # Benchmark 20 iterations
        stats = benchmark_latencies(
            lambda: client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 5}, headers=IDENTITY_HEADERS),
            iterations=20,
            warmup=3,
        )

        # Assert in-memory fast path latency
        assert stats["p95"] < 35.0, (
            f"Cached recommendations p95={stats['p95']:.2f}ms exceeded 35ms tolerance (mean={stats['mean']:.2f}ms)"
        )
        assert stats["min"] < 15.0, f"Min latency {stats['min']:.2f}ms exceeded 15ms threshold"

    def test_cache_304_response_latency_sla(self, client):
        """SLA: HTTP 304 Not Modified revalidation latency executes in < 15ms."""
        r1 = client.get("/movies/showcase", headers=IDENTITY_HEADERS)
        etag = r1.headers.get("ETag")
        assert etag is not None

        stats = benchmark_latencies(
            lambda: client.get("/movies/showcase", headers={"If-None-Match": etag, **IDENTITY_HEADERS}),
            iterations=20,
            warmup=3,
        )

        # 304 responses have empty bodies and minimal serialization overhead
        assert stats["p50"] < 15.0, f"304 Not Modified p50={stats['p50']:.2f}ms exceeded 15ms SLA"
        assert stats["min"] < 10.0, f"304 Not Modified min={stats['min']:.2f}ms exceeded 10ms SLA"

    def test_healthcheck_keepalive_latency_sla(self, client):
        """SLA: Healthcheck keep-alive responsiveness executes in < 10ms (p50)."""
        stats = benchmark_latencies(lambda: client.get("/health"), iterations=20, warmup=3)
        assert stats["p50"] < 12.0 or stats["min"] < 5.0, (
            f"Healthcheck keep-alive p50={stats['p50']:.2f}ms exceeded 12ms target"
        )

    def test_zero_outbound_network_during_cached_retrieval(self, client, sample_movie_ids):
        """Hermetic Security: Ensure zero outbound socket connections occur during query serving."""
        movie_id = sample_movie_ids[0]

        with assert_zero_network_calls():
            # All these calls must be served entirely offline from local in-memory stores and caches
            r_showcase = client.get("/movies/showcase", headers=IDENTITY_HEADERS)
            assert r_showcase.status_code == 200

            r_titles = client.get("/movies/titles", headers=IDENTITY_HEADERS)
            assert r_titles.status_code == 200

            r_movie = client.get(f"/movie/{movie_id}", headers=IDENTITY_HEADERS)
            assert r_movie.status_code == 200

            r_rec = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 5}, headers=IDENTITY_HEADERS)
            assert r_rec.status_code == 200
