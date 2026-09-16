import os
import sys
import json
import struct
import time
import numpy as np

def precompute():
    t0 = time.perf_counter()
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    models_dir = os.path.join(base_dir, "models")
    embeddings_path = os.path.join(models_dir, "sbert_embeddings.npy")
    movie_ids_path = os.path.join(models_dir, "movie_ids.npy")

    print(f"Loading embeddings from {embeddings_path}...")
    embeddings = np.load(embeddings_path).astype(np.float32)
    movie_ids = np.load(movie_ids_path).astype(np.int64)

    num_movies, dim = embeddings.shape
    print(f"Loaded {num_movies} movies with dimension {dim}")

    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    norm_embeddings = embeddings / norms

    k = 20
    sort_indices = np.argsort(movie_ids)
    sorted_movie_ids = movie_ids[sort_indices]
    sorted_norm_embeddings = norm_embeddings[sort_indices]

    batch_size = 2500
    topk_indices = np.zeros((num_movies, k), dtype=np.int64)
    topk_scores = np.zeros((num_movies, k), dtype=np.float32)

    print(f"Computing top-{k} nearest neighbors in batches of {batch_size}...")
    for start_idx in range(0, num_movies, batch_size):
        end_idx = min(start_idx + batch_size, num_movies)
        batch = sorted_norm_embeddings[start_idx:end_idx]
        sim_matrix = np.dot(batch, sorted_norm_embeddings.T)

        for row_in_batch, global_idx in enumerate(range(start_idx, end_idx)):
            sim_matrix[row_in_batch, global_idx] = -1e9

        partitioned_indices = np.argpartition(sim_matrix, -(k + 1), axis=1)[:, -k:]
        batch_topk_scores = np.take_along_axis(sim_matrix, partitioned_indices, axis=1)
        sorted_order = np.argsort(-batch_topk_scores, axis=1)

        topk_indices[start_idx:end_idx] = np.take_along_axis(partitioned_indices, sorted_order, axis=1)
        topk_scores[start_idx:end_idx] = np.take_along_axis(batch_topk_scores, sorted_order, axis=1)
        print(f"Processed {end_idx}/{num_movies} movies...")

    print("Building JSON artifact...")
    topk_dict = {}
    for i in range(num_movies):
        mid = int(sorted_movie_ids[i])
        recs = [
            [int(sorted_movie_ids[topk_indices[i, rank]]), round(float(topk_scores[i, rank]), 4)]
            for rank in range(k)
        ]
        topk_dict[str(mid)] = recs

    json_path = os.path.join(models_dir, "precomputed_topk.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(topk_dict, f, separators=(",", ":"))
    print(f"Saved JSON to {json_path}")

    print("Building binary artifact...")
    bin_path = os.path.join(models_dir, "precomputed_topk.bin")
    with open(bin_path, "wb") as f:
        f.write(b"APEXTOPK")
        f.write(struct.pack("<III", 1, k, num_movies))
        f.write(sorted_movie_ids.tobytes())
        for i in range(num_movies):
            for rank in range(k):
                rec_mid = int(sorted_movie_ids[topk_indices[i, rank]])
                score = float(topk_scores[i, rank])
                f.write(struct.pack("<qf", rec_mid, score))
    print(f"Saved binary to {bin_path}")

    elapsed = time.perf_counter() - t0
    print(f"Precomputation complete in {elapsed:.2f}s!")

if __name__ == "__main__":
    precompute()
