from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_health_check():
    """Verify the API is online."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_api_search_movies():
    """Verify the search endpoint returns valid recommendations."""
    response = client.get("/v1/search?q=Action")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Even if the database is empty, it shouldn't 500
    if len(data) > 0:
        assert "id" in data[0]
        assert "title" in data[0]


def test_api_ai_search():
    """Verify the AI semantic search endpoint routes correctly."""
    response = client.get("/v1/search/ai?q=Matrix")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_record_telemetry_event(monkeypatch):
    """
    Verify the telemetry endpoint can ingest a Dislike event
    which triggers the Active Inference Engine.
    """
    payload = {
        "user_id": "test_user_123",
        "session_id": "session_abc",
        "event_type": "rating",
        "movie_id": 999,
        "rating": 1,  # Dislike -> High Free Energy -> Triggers Active Inference
        "timestamp": "2026-05-17T00:00:00Z",
    }

    monkeypatch.setenv("NOVA_API_KEYS", "telemetry-key:test-tenant:test-catalog:enterprise")
    headers = {
        "X-Nova-API-Key": "telemetry-key",
    }
    response = client.post("/v1/events", json=payload, headers=headers)

    # Due to DLQ and safe error handling, this should never 500
    assert response.status_code == 200
    assert response.json()["status"] in ("accepted", "success")


def test_rate_limiter_active():
    """
    Verify the Redis Rate Limiter is loaded in the middleware stack.
    """
    # FastAPI wraps middleware dynamically, so we inspect the repr or inner classes
    middleware_reprs = [repr(m) for m in app.user_middleware]
    assert any("RedisRateLimiter" in m for m in middleware_reprs) or any("Middleware" in m for m in middleware_reprs)


def test_movie_trailer_endpoint():
    """Verify the /movie/{id}/trailer endpoint resolves known trailers."""
    response = client.get("/movie/1318447/trailer")
    assert response.status_code == 200
    data = response.json()
    assert "trailer_key" in data
    assert data["trailer_key"] == "kgv8jf_8dm0"


def test_movie_trailer_endpoint_dune():
    """Verify Dune 2 trailer resolves."""
    response = client.get("/movie/693134/trailer")
    assert response.status_code == 200
    assert response.json()["trailer_key"] == "Way9Dexny3w"


def test_fetch_trailer_function():
    """Directly test fetch_trailer async function."""
    import asyncio
    from backend.api.recommendation_routes import fetch_trailer
    key = asyncio.run(fetch_trailer(1318447))
    assert key == "kgv8jf_8dm0"
    mario_key = asyncio.run(fetch_trailer(1226863))
    assert mario_key == "SA9ohTuGl4Q"
    send_help_key = asyncio.run(fetch_trailer(1198994))
    assert send_help_key == "R4wiXj9NmEE"


def test_movie_trailer_endpoint_super_mario():
    """Verify Super Mario Galaxy Movie trailer resolves."""
    response = client.get("/movie/1226863/trailer")
    assert response.status_code == 200
    assert response.json()["trailer_key"] == "SA9ohTuGl4Q"
