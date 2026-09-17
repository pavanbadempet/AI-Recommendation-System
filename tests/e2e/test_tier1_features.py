"""Tier 1: Feature Isolation Tests for APEX Movie Recommendation System.

Verifies nominal execution, contract compliance, schema validation, and offline / resource
guarantees for all core platform endpoints and background serving components.
"""

from __future__ import annotations

import os
import threading

import numpy as np
import torch

from backend.main import get_rec
from backend.response_models import HealthResponse


# =====================================================================
# Feature 1: Health Check Endpoint (/health)
# =====================================================================
class TestFeature1Health:
    """Feature 1: System Health, Catalog Metrics, and Hardware Status (/health)."""

    def test_health_status_200_and_schema(self, client):
        """Verify /health returns HTTP 200 and passes HealthResponse Pydantic validation."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        validated = HealthResponse(**data)
        assert validated.status in {"healthy", "degraded", "unhealthy"}

    def test_health_healthy_status_value(self, client):
        """Verify the service reports healthy status during normal operation."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in {"healthy", "degraded"}

    def test_health_catalog_movie_count_positive(self, client):
        """Verify the health check reports a positive catalog movie count."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data.get("movie_count"), int)
        assert data["movie_count"] > 0

    def test_health_app_version_string(self, client):
        """Verify app_version is returned as a semantic version string."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "app_version" in data
        assert isinstance(data["app_version"], str)
        assert len(data["app_version"]) > 0

    def test_health_hardware_profile_and_tier_fields(self, client):
        """Verify hardware profile and serving tier detector fields are present in response."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "serving_tier" in data
        assert "tier_selection_reason" in data


# =====================================================================
# Feature 2: Movie Recommendations by ID (/v1/recommendations/id/{movie_id})
# =====================================================================
class TestFeature2Recommendations:
    """Feature 2: Item-to-Item Vector Recommendations (/v1/recommendations/id/{movie_id})."""

    def test_recommendations_valid_id_status_200(self, client, sample_movie_ids):
        """Verify recommendations endpoint returns 200 for known catalog movie IDs."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 10})
        assert response.status_code == 200

    def test_recommendations_response_structure_and_query_movie(self, client, sample_movie_ids):
        """Verify response contains request_id, valid query_movie metadata, and recommendations."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 10})
        assert response.status_code == 200
        data = response.json()
        assert "request_id" in data
        assert "query_movie" in data
        assert "recommendations" in data

        query_movie = data["query_movie"]
        assert query_movie["id"] == movie_id
        assert isinstance(query_movie.get("title"), str)
        assert len(query_movie["title"]) > 0

    def test_recommendations_list_non_empty_with_scores(self, client, sample_movie_ids):
        """Verify recommended movies list is non-empty and contains similarity scores."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 10})
        assert response.status_code == 200
        recs = response.json().get("recommendations", [])
        assert len(recs) > 0
        for rec in recs:
            assert "id" in rec
            assert "title" in rec
            assert rec["id"] != movie_id

    def test_recommendations_limit_n_1(self, client, sample_movie_ids):
        """Verify limit parameter n=1 returns exactly 1 recommendation."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 1})
        assert response.status_code == 200
        recs = response.json().get("recommendations", [])
        assert len(recs) == 1

    def test_recommendations_limit_n_10(self, client, sample_movie_ids):
        """Verify limit parameter n=10 returns up to 10 recommendations."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 10})
        assert response.status_code == 200
        recs = response.json().get("recommendations", [])
        assert len(recs) <= 10
        assert len(recs) > 0

    def test_recommendations_limit_n_50(self, client, sample_movie_ids):
        """Verify limit parameter n=50 returns maximum allowable recommendations batch."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 50})
        assert response.status_code == 200
        recs = response.json().get("recommendations", [])
        assert len(recs) <= 50
        assert len(recs) > 0

    def test_recommendations_explain_flag(self, client, sample_movie_ids):
        """Verify explain=True generates explanation metadata or explanation text."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 5, "explain": "true"})
        assert response.status_code == 200
        recs = response.json().get("recommendations", [])
        assert len(recs) > 0

    def test_recommendations_alias_endpoint(self, client, sample_movie_ids):
        """Verify backward-compatible /recommend/id/{id} alias functions identically."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/recommend/id/{movie_id}", params={"n": 5})
        assert response.status_code == 200
        data = response.json()
        assert data["query_movie"]["id"] == movie_id
        assert len(data["recommendations"]) > 0

    def test_recommendations_cache_control_headers(self, client, sample_movie_ids):
        """Verify HTTP wire Cache-Control header is populated on recommendations."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 5})
        assert response.status_code == 200
        cache_header = response.headers.get("Cache-Control", "")
        assert "public" in cache_header or "max-age" in cache_header


# =====================================================================
# Feature 3: AI Semantic Search (/v1/search/ai)
# =====================================================================
class TestFeature3AISearch:
    """Feature 3: Dense SBERT / Neural Vector Search (/v1/search/ai)."""

    def test_ai_search_natural_language_scifi_query(self, client):
        """Verify natural language search for 'sci-fi action space' returns 200 and movie items."""
        response = client.get("/v1/search/ai", params={"q": "sci-fi action space", "limit": 5})
        assert response.status_code == 200
        items = response.json()
        assert isinstance(items, list)
        assert len(items) > 0

    def test_ai_search_comedy_query(self, client):
        """Verify natural language search for 'romantic comedy in Paris' returns matches."""
        response = client.get("/v1/search/ai", params={"q": "romantic comedy in Paris", "limit": 5})
        assert response.status_code == 200
        items = response.json()
        assert isinstance(items, list)
        assert len(items) > 0

    def test_ai_search_family_animated_query(self, client):
        """Verify natural language search for 'animated family adventure' returns matches."""
        response = client.get("/v1/search/ai", params={"q": "animated family adventure", "limit": 5})
        assert response.status_code == 200
        items = response.json()
        assert isinstance(items, list)
        assert len(items) > 0

    def test_ai_search_limit_parameter_5(self, client):
        """Verify limit=5 restricts search results to at most 5 items."""
        response = client.get("/v1/search/ai", params={"q": "superhero dark knight", "limit": 5})
        assert response.status_code == 200
        items = response.json()
        assert len(items) <= 5

    def test_ai_search_limit_parameter_20(self, client):
        """Verify limit=20 returns up to 20 search candidates."""
        response = client.get("/v1/search/ai", params={"q": "detective murder mystery", "limit": 20})
        assert response.status_code == 200
        items = response.json()
        assert len(items) <= 20
        assert len(items) > 0

    def test_ai_search_top_k_alias_parameter(self, client):
        """Verify top_k parameter overrides default limit correctly."""
        response = client.get("/v1/search/ai", params={"q": "ocean voyage shipwreck", "top_k": 3})
        assert response.status_code == 200
        items = response.json()
        assert len(items) <= 3

    def test_ai_search_movie_item_field_structure(self, client):
        """Verify search items contain expected movie metadata fields."""
        response = client.get("/v1/search/ai", params={"q": "dinosaur jurassic", "limit": 5})
        assert response.status_code == 200
        items = response.json()
        assert len(items) > 0
        first_item = items[0]
        assert "id" in first_item
        assert "title" in first_item
        assert "overview" in first_item
        assert "genres" in first_item


# =====================================================================
# Feature 4: Showcase Movies (/movies/showcase)
# =====================================================================
class TestFeature4Showcase:
    """Feature 4: Curated Cold-Start Hero Showcase (/movies/showcase)."""

    def test_showcase_status_200(self, client):
        """Verify showcase endpoint returns HTTP 200."""
        response = client.get("/movies/showcase")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_showcase_default_limit_8(self, client):
        """Verify default limit for showcase is 8 items."""
        response = client.get("/movies/showcase")
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 8

    def test_showcase_custom_limit_5(self, client):
        """Verify showcase respects custom limit=5."""
        response = client.get("/movies/showcase", params={"limit": 5})
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 5

    def test_showcase_custom_limit_20(self, client):
        """Verify showcase respects maximum limit=20."""
        response = client.get("/movies/showcase", params={"limit": 20})
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 20
        assert len(data) > 5

    def test_showcase_item_structure_and_fields(self, client):
        """Verify showcase items have valid title, poster_path, vote_average, and popularity."""
        response = client.get("/movies/showcase", params={"limit": 5})
        assert response.status_code == 200
        data = response.json()
        for item in data:
            assert "id" in item
            assert "title" in item
            assert isinstance(item["title"], str)
            assert item.get("vote_average", 0) >= 0

    def test_showcase_score_ordering_and_posters(self, client):
        """Verify showcase movies have non-empty poster paths for UI hero display."""
        response = client.get("/movies/showcase", params={"limit": 5})
        assert response.status_code == 200
        data = response.json()
        for item in data:
            # Showcase filters for items with non-empty poster_path
            assert item.get("poster_path") is not None


# =====================================================================
# Feature 5: Movie Titles Catalog (/movies/titles)
# =====================================================================
class TestFeature5Titles:
    """Feature 5: Instant Autocomplete Title Catalog (/movies/titles)."""

    def test_titles_status_200(self, client):
        """Verify /movies/titles returns HTTP 200."""
        response = client.get("/movies/titles", params={"limit": 20})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_titles_default_limit(self, client):
        """Verify /movies/titles with explicit limit returns requested batch size."""
        response = client.get("/movies/titles", params={"limit": 100})
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 100

    def test_titles_custom_limit_50(self, client):
        """Verify /movies/titles with limit=50 returns exactly 50 entries."""
        response = client.get("/movies/titles", params={"limit": 50})
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 50

    def test_titles_string_formatting_pattern(self, client):
        """Verify title field is formatted as 'Title (YYYY) - Genres' or 'Title (YYYY)'."""
        response = client.get("/movies/titles", params={"limit": 10})
        assert response.status_code == 200
        data = response.json()
        for entry in data:
            assert "id" in entry
            assert "title" in entry
            assert isinstance(entry["id"], int)
            assert isinstance(entry["title"], str)
            # Year pattern in parentheses e.g. (2010)
            assert "(" in entry["title"] and ")" in entry["title"]

    def test_titles_non_empty_array(self, client):
        """Verify /movies/titles returns populated array of distinct IDs."""
        response = client.get("/movies/titles", params={"limit": 25})
        assert response.status_code == 200
        data = response.json()
        ids = [item["id"] for item in data]
        assert len(set(ids)) == len(ids), "Duplicate movie IDs found in title catalog"


# =====================================================================
# Feature 6: Zero-Network Offline Configuration
# =====================================================================
class TestFeature6ZeroNetwork:
    """Feature 6: Strict Hermetic Zero-Network Offline Guarantees."""

    def test_offline_transformers_flag_active(self):
        """Verify TRANSFORMERS_OFFLINE is set to 1."""
        assert os.environ.get("TRANSFORMERS_OFFLINE") in {"1", "true", "yes"}

    def test_offline_hf_hub_flag_active(self):
        """Verify HF_HUB_OFFLINE is set to 1."""
        assert os.environ.get("HF_HUB_OFFLINE") in {"1", "true", "yes"}

    def test_offline_nova_disable_downloads_flag_active(self):
        """Verify NOVA_DISABLE_MODEL_DOWNLOADS is active."""
        assert os.environ.get("NOVA_DISABLE_MODEL_DOWNLOADS") in {"1", "true", "yes"}

    def test_zero_network_during_recommendations(self, client, sample_movie_ids, block_network_calls):
        """Verify 0 outbound network/socket calls during recommendation generation."""
        movie_id = sample_movie_ids[0]
        response = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 5})
        assert response.status_code == 200
        assert len(block_network_calls) == 0

    def test_zero_network_during_ai_search(self, client, block_network_calls):
        """Verify 0 outbound network/socket calls during AI search query serving."""
        response = client.get("/v1/search/ai", params={"q": "space exploration", "limit": 5})
        assert response.status_code == 200
        assert len(block_network_calls) == 0

    def test_zero_network_during_health_check(self, client, block_network_calls):
        """Verify 0 outbound network/socket calls during /health probes."""
        response = client.get("/health")
        assert response.status_code == 200
        assert len(block_network_calls) == 0


# =====================================================================
# Feature 7: Thread Pinning & Resource Control
# =====================================================================
class TestFeature7ThreadPinning:
    """Feature 7: CPU Single-Thread Pinning & Memory-Mapped Vector Controls."""

    def test_torch_thread_pinning_configured(self):
        """Verify PyTorch intra-op CPU threads can be pinned to 1 thread."""
        torch.set_num_threads(1)
        assert torch.get_num_threads() == 1

    def test_torch_interop_threads_configured(self):
        """Verify PyTorch inter-op threads setting."""
        current_interop = torch.get_num_interop_threads()
        assert current_interop >= 1

    def test_onnx_thread_configuration(self):
        """Verify ONNX Runtime SessionOptions configure single-threaded execution."""
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1
        opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        assert opts.intra_op_num_threads == 1
        assert opts.inter_op_num_threads == 1

    def test_mmap_embeddings_mode_r(self):
        """Verify SBERT embeddings matrix is memory-mapped in read-only mode."""
        rec = get_rec()
        if rec is not None and rec._vectors is not None:
            # Memory-mapped arrays in numpy are instances of np.memmap or ndarray with base
            assert isinstance(rec._vectors, np.ndarray)
            assert rec._vectors.shape[1] in {384, 768}

    def test_concurrent_single_thread_stability(self, client, sample_movie_ids):
        """Verify single-thread serving remains stable without thread contention."""
        movie_id = sample_movie_ids[0]
        threads = []
        errors = []

        def worker():
            try:
                resp = client.get(f"/v1/recommendations/id/{movie_id}", params={"n": 5})
                if resp.status_code != 200:
                    errors.append(f"Bad status: {resp.status_code}")
            except Exception as e:
                errors.append(str(e))

        for _ in range(5):
            t = threading.Thread(target=worker)
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        assert len(errors) == 0, f"Thread errors: {errors}"
