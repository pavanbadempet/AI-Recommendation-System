import urllib.request
import json

base = "https://pavanbadempet-movie-rec-api.hf.space"

def test_endpoints():
    # 1. Health
    print("--- 1. Testing /health ---")
    req = urllib.request.urlopen(f"{base}/health")
    data = json.loads(req.read().decode())
    print(json.dumps(data, indent=2))
    assert data["movie_count"] == 75253, f"Expected 75253 movies, got {data['movie_count']}"

    # 2. Search
    print("\n--- 2. Testing /v1/search?query=Oppenheimer ---")
    req = urllib.request.urlopen(f"{base}/v1/search?query=Oppenheimer")
    results = json.loads(req.read().decode())
    items = results.get("results", results) if isinstance(results, dict) else results
    print(f"Results: {len(items)}")
    for m in items[:3]:
        print(f"  [{m['id']}] {m['title']} ({m.get('release_date')}) - Score: {m.get('score')} - Genres: {m.get('genres')}")

    # 3. Vector Recommendations
    print("\n--- 3. Testing /v1/recommendations/id/872585 (Oppenheimer) ---")
    req = urllib.request.urlopen(f"{base}/v1/recommendations/id/872585?top_k=5")
    recs = json.loads(req.read().decode())
    print(f"Inference latency: {recs.get('inference_latency_ms')} ms")
    print(f"Model: {recs.get('model_type')}")
    for r in recs.get("recommendations", []):
        print(f"  -> [{r['id']}] {r['title']} (sim: {r.get('similarity_score', 0):.4f})")

    # 4. Showcase
    print("\n--- 4. Testing /movies/showcase ---")
    req = urllib.request.urlopen(f"{base}/movies/showcase")
    showcase = json.loads(req.read().decode())
    print(f"Showcase movies count: {len(showcase)}")
    for m in showcase[:3]:
        print(f"  Popular: {m['title']} (pop: {m.get('popularity')})")

    print("\nALL VERIFICATIONS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_endpoints()
