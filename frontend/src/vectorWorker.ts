/**
 * Dedicated Web Worker for In-Browser Vector Cosine Similarity Search.
 * Receives search requests and computes top-K dot products without blocking React UI rendering.
 */

export interface SearchRequest {
  type: "SEARCH";
  queryVector: number[] | Float32Array;
  topK?: number;
  vectors?: Float32Array;
  movieIds?: number[];
}

export interface MatchResult {
  id: number;
  score: number;
}

export interface SearchResponse {
  type: "RESULTS";
  matches: MatchResult[];
  durationMs: number;
  error?: string;
}

let storedVectors: Float32Array | null = null;
let storedMovieIds: number[] | null = null;
const vectorDim = 384;

export function handleSearchMessage(
  data: SearchRequest,
  postMessage: (msg: SearchResponse) => void
): void {
  if (!data || data.type !== "SEARCH") return;

  const t0 = performance.now();
  const query = data.queryVector instanceof Float32Array 
    ? data.queryVector 
    : new Float32Array(data.queryVector);

  if (data.vectors) storedVectors = data.vectors;
  if (data.movieIds) storedMovieIds = data.movieIds;

  if (!storedVectors || !storedMovieIds) {
    postMessage({
      type: "RESULTS",
      matches: [],
      durationMs: performance.now() - t0,
      error: "Vectors not initialized in worker"
    });
    return;
  }

  const topK = data.topK || 10;
  const numItems = storedMovieIds.length;
  const dim = query.length || vectorDim;

  const scores: MatchResult[] = [];

  for (let i = 0; i < numItems; i++) {
    const offset = i * dim;
    let dot = 0.0;
    
    let j = 0;
    for (; j <= dim - 4; j += 4) {
      dot += query[j] * storedVectors[offset + j]
           + query[j + 1] * storedVectors[offset + j + 1]
           + query[j + 2] * storedVectors[offset + j + 2]
           + query[j + 3] * storedVectors[offset + j + 3];
    }
    for (; j < dim; j++) {
      dot += query[j] * storedVectors[offset + j];
    }

    scores.push({ id: storedMovieIds[i], score: dot });
  }

  scores.sort((a, b) => b.score - a.score);
  const matches = scores.slice(0, topK);
  const durationMs = performance.now() - t0;

  postMessage({
    type: "RESULTS",
    matches,
    durationMs
  });
}

if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  self.onmessage = (event: MessageEvent<SearchRequest>) => {
    handleSearchMessage(event.data, (msg) => self.postMessage(msg));
  };
}
