import numpy as np
import pyarrow.parquet as pq
import math

embs = np.load('models/sbert_embeddings.npy', mmap_mode='r')
ids = np.load('models/movie_ids.npy')
id_to_idx = {int(mid): i for i, mid in enumerate(ids)}

t = pq.read_table('data/processed/movies_transformed.parquet')
pyd = t.to_pylist()
meta_by_id = {int(m['id']): m for m in pyd}

def evaluate_movie(movie_id):
    idx = id_to_idx[movie_id]
    vec = embs[idx]
    seed_m = meta_by_id[movie_id]
    seed_title = seed_m['title']
    seed_genres = set(seed_m.get('genres') or [])

    dots = np.dot(embs, vec)
    top_candidates = np.argsort(dots)[::-1][1:61]

    print(f"\n=======================================================")
    print(f"QUERY MOVIE: [{movie_id}] {seed_title} ({seed_m.get('release_date')}) - Genres: {seed_m.get('genres')}")
    print(f"=======================================================")

    print("\n--- 1. NAIVE RAW COSINE (Top 5) ---")
    for i in top_candidates[:5]:
        m = meta_by_id.get(int(ids[i]), {})
        print(f"  [{m.get('id')}] {m.get('title')} | sim: {dots[i]:.4f} | rating: {m.get('vote_average')} (votes: {m.get('vote_count')}) | genres: {m.get('genres')}")

    def score_candidate(i):
        mid = int(ids[i])
        m = meta_by_id.get(mid, {})
        sim = float(dots[i])

        # Genre Jaccard
        cand_genres = set(m.get('genres') or [])
        union = len(seed_genres | cand_genres)
        jaccard = (len(seed_genres & cand_genres) / union) if union > 0 else 0.0

        # Bayesian quality prior (Wilson shrinkage)
        vc = float(m.get('vote_count') or 0.0)
        va = float(m.get('vote_average') or 0.0)
        bayes_quality = (vc * va + 30.0 * 6.5) / (vc + 30.0) / 10.0

        # Popularity prior
        pop = float(m.get('popularity') or 0.0)
        log_pop = min(1.0, math.log1p(pop) / math.log1p(300.0))

        # Diversity / Derivative penalty
        pen = 0.0
        cand_title_lower = m.get('title', '').lower()
        if seed_title.lower() in cand_title_lower and cand_title_lower != seed_title.lower():
            pen = -0.18

        return 0.50 * sim + 0.25 * jaccard + 0.15 * bayes_quality + 0.10 * log_pop + pen

    reranked = sorted(top_candidates, key=score_candidate, reverse=True)

    print("\n--- 2. PRECISION HYBRID RERANKING (Top 5) ---")
    for i in reranked[:5]:
        m = meta_by_id.get(int(ids[i]), {})
        hs = score_candidate(i)
        print(f"  [{m.get('id')}] {m.get('title')} | score: {hs:.4f} (sim: {dots[i]:.4f}) | rating: {m.get('vote_average')} (votes: {m.get('vote_count')}) | genres: {m.get('genres')}")

if __name__ == "__main__":
    evaluate_movie(872585) # Oppenheimer
    evaluate_movie(157336) # Interstellar
    evaluate_movie(27205)  # Inception
