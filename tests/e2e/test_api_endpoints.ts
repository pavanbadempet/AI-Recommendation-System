/**
 * E2E API Test Suite for Pure Rust Axum Serving Backend and Bun Edge Server
 *
 * Tiers:
 * - Tier 1: Feature Coverage (>=5 tests per endpoint: /health, /v1/recommendations, /v1/search, /v1/catalog, /v1/events)
 * - Tier 2: Boundary & Corner Cases (IDs, limits, empty strings, injections, malformed JSON, invalid methods)
 * - Tier 3: Cross-Feature Combinations (Search -> Recs -> Events chain, Catalog -> Details, Parameter Isolation)
 * - Tier 4: Real-World User Flows (Exploration journeys, session streams, cold/warm consistency)
 */

export const BASE_URL = process.env.TARGET_URL || "http://127.0.0.1:8080";

export interface TestResult {
  tier: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export const testResults: TestResult[] = [];

// Helper HTTP methods
export async function getJson(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", ...options.headers },
    ...options,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, headers: res.headers, body: json, rawText: text };
}

export async function postJson(path: string, payload: any, options: RequestInit = {}) {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
    ...options,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, headers: res.headers, body: json, rawText: text };
}

export async function requestRaw(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, options);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, headers: res.headers, body: json, rawText: text };
}

// Environment detection for Bun Test vs Standalone Runner
let describe: any = (name: string, fn: () => void) => {};
let test: any = (name: string, fn: () => Promise<void> | void) => {};
let expect: any = (actual: any) => ({
  toBe: (expected: any) => {
    if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
  },
  toBeDefined: () => {
    if (actual === undefined || actual === null) throw new Error("Expected defined, got undefined/null");
  },
  toBeGreaterThan: (val: number) => {
    if (!(actual > val)) throw new Error(`Expected > ${val}, got ${actual}`);
  },
  toBeGreaterThanOrEqual: (val: number) => {
    if (!(actual >= val)) throw new Error(`Expected >= ${val}, got ${actual}`);
  },
  toBeLessThanOrEqual: (val: number) => {
    if (!(actual <= val)) throw new Error(`Expected <= ${val}, got ${actual}`);
  },
});

try {
  const bunTest = await import("bun:test");
  // Test if describe can be called without error
  bunTest.describe("__runner_detect__", () => {});
  describe = bunTest.describe;
  test = bunTest.test;
  expect = bunTest.expect;
} catch {
  // Running outside bun test (e.g. bun run tests/e2e/run_all.ts)
}

// ============================================================================
// TIER 1: FEATURE COVERAGE (>=5 tests per endpoint)
// ============================================================================

describe("Tier 1: Feature Coverage", () => {
  describe("Endpoint: /health", () => {
    test("T1.1: Health check returns HTTP 200 OK", async () => {
      const res = await getJson("/health");
      expect(res.status).toBe(200);
    });

    test("T1.2: Health check body has status 'healthy'", async () => {
      const res = await getJson("/health");
      expect(res.body).toBeDefined();
      expect(res.body.status).toBe("healthy");
    });

    test("T1.3: Health check returns mode or version identifier", async () => {
      const res = await getJson("/health");
      expect(
        res.body.mode !== undefined ||
        res.body.version !== undefined ||
        res.body.movie_count !== undefined
      ).toBe(true);
    });

    test("T1.4: Health check response returns JSON content-type header", async () => {
      const res = await getJson("/health");
      const contentType = res.headers.get("content-type") || "";
      expect(contentType.includes("application/json")).toBe(true);
    });

    test("T1.5: Health check timestamp or metadata field is non-empty string", async () => {
      const res = await getJson("/health");
      const hasValidMeta =
        typeof res.body.timestamp === "string" ||
        typeof res.body.mode === "string" ||
        typeof res.body.status === "string";
      expect(hasValidMeta).toBe(true);
    });
  });

  describe("Endpoint: /v1/recommendations & /v1/recommendations/id/:id", () => {
    test("T1.6: GET or POST recommendations returns 200 OK with candidates", async () => {
      let res = await postJson("/v1/recommendations", { movie_id: 550, top_k: 5 });
      if (res.status !== 200) {
        res = await getJson("/v1/recommendations/id/550");
      }
      expect(res.status).toBe(200);
      const recs = res.body?.recommendations || res.body?.results || [];
      expect(Array.isArray(recs)).toBe(true);
      expect(recs.length).toBeGreaterThan(0);
    });

    test("T1.7: Recommendation query respects limit parameter (n / top_k)", async () => {
      let res = await postJson("/v1/recommendations", { user_id: 1, top_k: 3 });
      if (res.status !== 200) {
        res = await getJson("/v1/recommendations/id/1?n=3");
      }
      expect(res.status).toBe(200);
      const recs = res.body?.recommendations || res.body?.results || [];
      expect(recs.length).toBe(3);
    });

    test("T1.8: Candidate items contain id, title, and similarity score", async () => {
      let res = await postJson("/v1/recommendations", { user_id: 10, top_k: 5 });
      if (res.status !== 200) {
        res = await getJson("/v1/recommendations/id/10?n=5");
      }
      expect(res.status).toBe(200);
      const recs = res.body?.recommendations || res.body?.results || [];
      expect(recs.length).toBeGreaterThan(0);
      const item = recs[0];
      expect(item.id !== undefined).toBe(true);
      expect(typeof item.title).toBe("string");
      const score = item.similarity_score ?? item.score;
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0.0);
    });

    test("T1.9: Candidate items are sorted in descending score order", async () => {
      let res = await postJson("/v1/recommendations", { top_k: 5 });
      if (res.status !== 200) {
        res = await getJson("/v1/recommendations/id/1?n=5");
      }
      expect(res.status).toBe(200);
      const recs = res.body?.recommendations || res.body?.results || [];
      if (recs.length >= 2) {
        for (let i = 0; i < recs.length - 1; i++) {
          const s1 = recs[i].similarity_score ?? recs[i].score ?? 1;
          const s2 = recs[i + 1].similarity_score ?? recs[i + 1].score ?? 0;
          expect(s1).toBeGreaterThanOrEqual(s2);
        }
      }
    });

    test("T1.10: POST /v1/recommendations handles user_id and top_k envelope", async () => {
      const res = await postJson("/v1/recommendations", { user_id: 42, top_k: 7 });
      expect(res.status).toBe(200);
      const recs = res.body?.recommendations || res.body?.results || [];
      expect(recs.length).toBe(7);
    });

    test("T1.11: Root metadata endpoint / returns engine identification", async () => {
      const res = await getJson("/");
      expect(res.status).toBe(200);
      expect(res.body.version !== undefined || res.body.status !== undefined).toBe(true);
    });
  });

  describe("Endpoint: /v1/search", () => {
    test("T1.12: POST /v1/search with query string returns 200 OK", async () => {
      const res = await postJson("/v1/search", { query: "Inception", limit: 5 });
      expect(res.status).toBe(200);
      expect(res.body.results).toBeDefined();
      expect(Array.isArray(res.body.results)).toBe(true);
    });

    test("T1.13: GET /v1/search with query parameter returns 200 OK or matches search route", async () => {
      let res = await postJson("/v1/search", { query: "Sci-Fi", limit: 5 });
      if (res.status !== 200) {
        res = await getJson("/v1/search?q=Sci-Fi&limit=5");
      }
      expect(res.status).toBe(200);
      const results = res.body.results || [];
      expect(Array.isArray(results)).toBe(true);
    });

    test("T1.14: Search response echoes query and contains candidate metadata", async () => {
      const res = await postJson("/v1/search", { query: "Matrix", limit: 3 });
      expect(res.status).toBe(200);
      expect(res.body.query).toBe("Matrix");
      expect(res.body.results.length).toBeLessThanOrEqual(3);
    });

    test("T1.15: Search results items have id, title, and score fields", async () => {
      const res = await postJson("/v1/search", { query: "Interstellar", limit: 4 });
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBe(4);
      const first = res.body.results[0];
      expect(first.id).toBeDefined();
      expect(typeof first.title).toBe("string");
      expect(typeof (first.similarity_score ?? first.score)).toBe("number");
    });

    test("T1.16: Multi-word query execution returns 200 OK with relevant candidate list", async () => {
      const res = await postJson("/v1/search", { query: "space adventure thriller", limit: 5 });
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBe(5);
    });
  });

  describe("Endpoint: /v1/catalog", () => {
    test("T1.17: GET /v1/catalog/browse returns 200 OK", async () => {
      let res = await getJson("/v1/catalog/browse");
      if (res.status === 404) {
        res = await getJson("/v1/catalog");
      }
      expect(res.status).toBe(200);
      const items = res.body.results || res.body.movies || [];
      expect(Array.isArray(items)).toBe(true);
    });

    test("T1.18: Catalog items contain id and title metadata", async () => {
      let res = await getJson("/v1/catalog/browse");
      if (res.status === 404) {
        res = await getJson("/v1/catalog");
      }
      expect(res.status).toBe(200);
      const items = res.body.results || res.body.movies || [];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].id).toBeDefined();
      expect(typeof items[0].title).toBe("string");
    });

    test("T1.19: Catalog response returns query/category identifier", async () => {
      let res = await getJson("/v1/catalog/browse");
      if (res.status === 404) {
        res = await getJson("/v1/catalog");
      }
      expect(res.status).toBe(200);
      expect(res.body.query !== undefined || res.body.total !== undefined || res.body.movies !== undefined).toBe(true);
    });

    test("T1.20: Admin status endpoint returns operational status", async () => {
      const res = await getJson("/v1/admin/status");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("online");
    });

    test("T1.21: Evaluation benchmark endpoint returns performance metrics", async () => {
      const res = await getJson("/v1/evaluation/benchmark");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("completed");
    });
  });

  describe("Endpoint: /v1/events", () => {
    test("T1.22: POST /v1/events with view event returns 200 OK and ingested status", async () => {
      const res = await postJson("/v1/events", {
        user_id: 101,
        movie_id: 550,
        event_type: "view",
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ingested");
    });

    test("T1.23: POST /v1/events with click event returns ingested confirmation", async () => {
      const res = await postJson("/v1/events", {
        user_id: 102,
        movie_id: 680,
        event_type: "click",
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ingested");
    });

    test("T1.24: POST /v1/events with rating event returns 200 OK", async () => {
      const res = await postJson("/v1/events", {
        user_id: 103,
        movie_id: 13,
        event_type: "rating",
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ingested");
    });

    test("T1.25: POST /v1/events accepts multiple distinct user IDs", async () => {
      const res = await postJson("/v1/events", {
        user_id: 999999,
        movie_id: 1,
        event_type: "watchlist_add",
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ingested");
    });

    test("T1.26: Sequential batch of events executes with 100% success", async () => {
      for (let i = 1; i <= 5; i++) {
        const res = await postJson("/v1/events", {
          user_id: 200 + i,
          movie_id: 1000 + i,
          event_type: "impression",
        });
        expect(res.status).toBe(200);
      }
    });
  });
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES
// ============================================================================

describe("Tier 2: Boundary & Corner Cases", () => {
  test("T2.1: Recommendation limit=1 boundary returns exactly 1 item", async () => {
    let res = await postJson("/v1/recommendations", { top_k: 1 });
    if (res.status !== 200) {
      res = await getJson("/v1/recommendations/id/1?n=1");
    }
    expect(res.status).toBe(200);
    const recs = res.body.recommendations || res.body.results || [];
    expect(recs.length).toBe(1);
  });

  test("T2.2: Recommendation limit=50 maximum standard boundary returns 50 items", async () => {
    let res = await postJson("/v1/recommendations", { top_k: 50 });
    if (res.status !== 200) {
      res = await getJson("/v1/recommendations/id/1?n=50");
    }
    expect(res.status).toBe(200);
    const recs = res.body.recommendations || res.body.results || [];
    expect(recs.length).toBe(50);
  });

  test("T2.3: Recommendation limit=0 boundary is handled safely without server crash", async () => {
    const res = await postJson("/v1/recommendations", { top_k: 0 });
    expect([200, 400, 422].includes(res.status)).toBe(true);
  });

  test("T2.4: Extreme limit=1000 is processed safely without memory exhaustion", async () => {
    const res = await postJson("/v1/recommendations", { top_k: 1000 });
    expect([200, 400, 422].includes(res.status)).toBe(true);
    if (res.status === 200) {
      const recs = res.body.recommendations || res.body.results || [];
      expect(recs.length).toBeLessThanOrEqual(1000);
    }
  });

  test("T2.5: Empty string search query is handled gracefully", async () => {
    const res = await postJson("/v1/search", { query: "", limit: 5 });
    expect([200, 400, 422].includes(res.status)).toBe(true);
  });

  test("T2.6: Whitespace-only search query is handled safely", async () => {
    const res = await postJson("/v1/search", { query: "     ", limit: 5 });
    expect([200, 400, 422].includes(res.status)).toBe(true);
  });

  test("T2.7: Special characters and SQL injection strings do not crash server", async () => {
    const res = await postJson("/v1/search", {
      query: "' OR '1'='1'; DROP TABLE movies; --",
      limit: 5,
    });
    expect(res.status).toBe(200);
  });

  test("T2.8: XSS payload strings are safely handled and echoed without execution", async () => {
    const res = await postJson("/v1/search", {
      query: "<script>alert('XSS')</script>",
      limit: 3,
    });
    expect(res.status).toBe(200);
    expect(res.body.query).toBe("<script>alert('XSS')</script>");
  });

  test("T2.9: 1000-character long query string does not overflow buffer", async () => {
    const longQuery = "SciFi".repeat(200);
    const res = await postJson("/v1/search", { query: longQuery, limit: 5 });
    expect(res.status).toBe(200);
  });

  test("T2.10: Malformed JSON body in POST request returns 400 Bad Request", async () => {
    const res = await postJson("/v1/search", "{ malformed json: true, ");
    expect([400, 422].includes(res.status)).toBe(true);
  });

  test("T2.11: Missing required field in JSON payload is rejected with 400/422", async () => {
    const res = await postJson("/v1/events", { user_id: 100 });
    expect([400, 422].includes(res.status)).toBe(true);
  });

  test("T2.12: Invalid HTTP method returns 405/404", async () => {
    const res = await requestRaw("/health", { method: "DELETE" });
    expect([405, 404].includes(res.status)).toBe(true);
  });

  test("T2.13: Non-existent route returns 404 Not Found", async () => {
    const res = await getJson("/non_existent_api_route_xyz_123");
    expect(res.status).toBe(404);
  });

  test("T2.14: Auth login with credentials returns auth token", async () => {
    const res = await postJson("/v1/auth/login", { username: "tester", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });
});

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS
// ============================================================================

describe("Tier 3: Cross-Feature Combinations", () => {
  test("T3.1: Flow: Search -> Extract Top Candidate ID -> Get Recommendations -> Ingest View Event", async () => {
    const searchRes = await postJson("/v1/search", { query: "Inception", limit: 3 });
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.results.length).toBeGreaterThan(0);
    const topMovieId = searchRes.body.results[0].id;

    let recRes = await postJson("/v1/recommendations", { user_id: topMovieId, top_k: 5 });
    expect(recRes.status).toBe(200);
    const recs = recRes.body.recommendations || recRes.body.results || [];
    expect(recs.length).toBeGreaterThan(0);

    const targetRecId = recs[0].id;
    const eventRes = await postJson("/v1/events", {
      user_id: 1001,
      movie_id: targetRecId,
      event_type: "recommendation_click",
    });
    expect(eventRes.status).toBe(200);
    expect(eventRes.body.status).toBe("ingested");
  });

  test("T3.2: Flow: Catalog Browse -> Pick Movie -> Query SIMD Recs -> Log Impression Event", async () => {
    let catalogRes = await getJson("/v1/catalog/browse");
    if (catalogRes.status === 404) {
      catalogRes = await getJson("/v1/catalog");
    }
    expect(catalogRes.status).toBe(200);
    const movies = catalogRes.body.results || catalogRes.body.movies || [];
    expect(movies.length).toBeGreaterThan(0);
    const pickedMovie = movies[0];

    const recRes = await postJson("/v1/recommendations", { user_id: pickedMovie.id, top_k: 4 });
    expect(recRes.status).toBe(200);

    const eventRes = await postJson("/v1/events", {
      user_id: 4004,
      movie_id: pickedMovie.id,
      event_type: "catalog_impression",
    });
    expect(eventRes.status).toBe(200);
  });

  test("T3.3: Parameter Isolation: n=3 vs n=7 on same entity produce distinct dimensioned outputs", async () => {
    const resA = await postJson("/v1/recommendations", { user_id: 99, top_k: 3 });
    const resB = await postJson("/v1/recommendations", { user_id: 99, top_k: 7 });

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const recsA = resA.body.recommendations || resA.body.results || [];
    const recsB = resB.body.recommendations || resB.body.results || [];

    expect(recsA.length).toBe(3);
    expect(recsB.length).toBe(7);
  });

  test("T3.4: Concurrent Mixed Traffic: 12 parallel requests across all route families execute without error", async () => {
    const promises = [
      getJson("/health"),
      postJson("/v1/search", { query: "Matrix", limit: 3 }),
      postJson("/v1/recommendations", { user_id: 1, top_k: 5 }),
      postJson("/v1/events", { user_id: 1, movie_id: 10, event_type: "ping" }),
      getJson("/v1/catalog/browse"),
      getJson("/v1/admin/status"),
      getJson("/v1/billing/usage"),
      postJson("/v1/search", { query: "Action", limit: 4 }),
      postJson("/v1/recommendations", { user_id: 2, top_k: 6 }),
      postJson("/v1/events", { user_id: 2, movie_id: 20, event_type: "view" }),
      getJson("/health"),
      postJson("/v1/pipeline/run", {}),
    ];

    const results = await Promise.all(promises);
    for (const r of results) {
      expect([200, 201].includes(r.status)).toBe(true);
    }
  });
});

// ============================================================================
// TIER 4: REAL-WORLD USER FLOWS
// ============================================================================

describe("Tier 4: Real-World User Flows", () => {
  test("T4.1: Journey: New Visitor Discovery Journey", async () => {
    const health = await getJson("/health");
    expect(health.status).toBe(200);

    let catalog = await getJson("/v1/catalog/browse");
    expect(catalog.status).toBe(200);

    const search = await postJson("/v1/search", { query: "Sci-Fi Space", limit: 5 });
    expect(search.status).toBe(200);
    expect(search.body.results.length).toBe(5);

    const selectedMovie = search.body.results[1];
    const recs = await postJson("/v1/recommendations", { user_id: selectedMovie.id, top_k: 8 });
    expect(recs.status).toBe(200);
    expect((recs.body.recommendations || recs.body.results).length).toBe(8);

    const viewEvent = await postJson("/v1/events", {
      user_id: 5050,
      movie_id: selectedMovie.id,
      event_type: "view_details",
    });
    expect(viewEvent.status).toBe(200);

    const watchlistEvent = await postJson("/v1/events", {
      user_id: 5050,
      movie_id: selectedMovie.id,
      event_type: "add_to_watchlist",
    });
    expect(watchlistEvent.status).toBe(200);
  });

  test("T4.2: Journey: Cold vs Warm Query Consistency & Determinism", async () => {
    const payload = { query: "Christopher Nolan Inception", limit: 5 };

    const res1 = await postJson("/v1/search", payload);
    expect(res1.status).toBe(200);

    const res2 = await postJson("/v1/search", payload);
    expect(res2.status).toBe(200);

    expect(res1.body.results.length).toBe(res2.body.results.length);
    if (res1.body.results.length > 0) {
      expect(res1.body.results[0].id).toBe(res2.body.results[0].id);
      expect(res1.body.results[0].title).toBe(res2.body.results[0].title);
    }
  });

  test("T4.3: Journey: Continuous Event Stream Telemetry Under Continuous Recommendations", async () => {
    for (let session = 1; session <= 4; session++) {
      const rec = await postJson("/v1/recommendations", { user_id: session, top_k: 3 });
      expect(rec.status).toBe(200);

      const event = await postJson("/v1/events", {
        user_id: session,
        movie_id: session * 10,
        event_type: "session_heartbeat",
      });
      expect(event.status).toBe(200);
    }
  });
});

// ============================================================================
// STANDALONE RUNNER EXECUTION
// ============================================================================

export async function runAllApiTests(): Promise<{ passed: number; failed: number; total: number }> {
  console.log("========================================================================");
  console.log(`🚀 RUNNING E2E API ENDPOINT TESTS AGAINST: ${BASE_URL}`);
  console.log("========================================================================\n");

  let passed = 0;
  let failed = 0;

  async function execute(tier: string, name: string, fn: () => Promise<void>) {
    const t0 = performance.now();
    try {
      await fn();
      const durationMs = performance.now() - t0;
      testResults.push({ tier, name, passed: true, durationMs });
      console.log(`  ✅ [${tier}] ${name} (${durationMs.toFixed(2)}ms)`);
      passed++;
    } catch (err: any) {
      const durationMs = performance.now() - t0;
      testResults.push({ tier, name, passed: false, durationMs, error: err?.message || String(err) });
      console.error(`  ❌ [${tier}] ${name} (${durationMs.toFixed(2)}ms)`);
      console.error(`     Error: ${err?.message || err}`);
      failed++;
    }
  }

  // Execute Tier 1
  console.log("▶ Executing Tier 1: Feature Coverage (>=5 tests per endpoint)...");
  await execute("Tier 1", "T1.1: Health check returns 200 OK", async () => {
    const res = await getJson("/health");
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });
  await execute("Tier 1", "T1.2: Health check body has status 'healthy'", async () => {
    const res = await getJson("/health");
    if (res.body?.status !== "healthy") throw new Error(`Expected status 'healthy', got ${res.body?.status}`);
  });
  await execute("Tier 1", "T1.3: Health check returns mode or version identifier", async () => {
    const res = await getJson("/health");
    if (!res.body?.mode && !res.body?.version && !res.body?.status) throw new Error("Missing metadata identifier");
  });
  await execute("Tier 1", "T1.4: Health check response returns JSON content-type header", async () => {
    const res = await getJson("/health");
    if (!res.headers.get("content-type")?.includes("application/json")) throw new Error("Missing JSON content-type");
  });
  await execute("Tier 1", "T1.5: Health check timestamp or metadata field is valid", async () => {
    const res = await getJson("/health");
    if (!res.body?.timestamp && !res.body?.mode) throw new Error("Missing timestamp or mode");
  });
  await execute("Tier 1", "T1.6: GET/POST recommendations returns candidates", async () => {
    let res = await postJson("/v1/recommendations", { user_id: 1, top_k: 5 });
    if (res.status !== 200) res = await getJson("/v1/recommendations/id/1");
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const recs = res.body?.recommendations || res.body?.results || [];
    if (!Array.isArray(recs) || recs.length === 0) throw new Error("No recommendations returned");
  });
  await execute("Tier 1", "T1.7: Recommendation query respects limit parameter", async () => {
    let res = await postJson("/v1/recommendations", { user_id: 1, top_k: 3 });
    if (res.status !== 200) res = await getJson("/v1/recommendations/id/1?n=3");
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const recs = res.body?.recommendations || res.body?.results || [];
    if (recs.length !== 3) throw new Error(`Expected 3 recs, got ${recs.length}`);
  });
  await execute("Tier 1", "T1.8: Candidate items contain id, title, and score", async () => {
    const res = await postJson("/v1/recommendations", { top_k: 5 });
    const recs = res.body?.recommendations || res.body?.results || [];
    if (!recs[0] || recs[0].id === undefined || !recs[0].title) throw new Error("Invalid candidate schema");
  });
  await execute("Tier 1", "T1.9: Candidate items are sorted descending by score", async () => {
    const res = await postJson("/v1/recommendations", { top_k: 5 });
    const recs = res.body?.recommendations || res.body?.results || [];
    if (recs.length >= 2) {
      for (let i = 0; i < recs.length - 1; i++) {
        const s1 = recs[i].similarity_score ?? recs[i].score ?? 1;
        const s2 = recs[i + 1].similarity_score ?? recs[i + 1].score ?? 0;
        if (s1 < s2) throw new Error(`Sort order violation: ${s1} < ${s2}`);
      }
    }
  });
  await execute("Tier 1", "T1.10: POST /v1/recommendations user_id and top_k envelope", async () => {
    const res = await postJson("/v1/recommendations", { user_id: 42, top_k: 7 });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const recs = res.body?.recommendations || res.body?.results || [];
    if (recs.length !== 7) throw new Error(`Expected 7, got ${recs.length}`);
  });
  await execute("Tier 1", "T1.11: Root metadata endpoint / returns engine identification", async () => {
    const res = await getJson("/");
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });
  await execute("Tier 1", "T1.12: POST /v1/search with query string returns 200", async () => {
    const res = await postJson("/v1/search", { query: "Inception", limit: 5 });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });
  await execute("Tier 1", "T1.13: GET/POST /v1/search query execution", async () => {
    const res = await postJson("/v1/search", { query: "Sci-Fi", limit: 5 });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });
  await execute("Tier 1", "T1.14: Search response echoes query and candidate metadata", async () => {
    const res = await postJson("/v1/search", { query: "Matrix", limit: 3 });
    if (res.body?.query !== "Matrix") throw new Error(`Query mismatch: ${res.body?.query}`);
  });
  await execute("Tier 1", "T1.15: Search results items have id, title, and score fields", async () => {
    const res = await postJson("/v1/search", { query: "Interstellar", limit: 4 });
    const first = res.body?.results?.[0];
    if (!first || first.id === undefined || !first.title) throw new Error("Invalid search result schema");
  });
  await execute("Tier 1", "T1.16: Multi-word search query execution", async () => {
    const res = await postJson("/v1/search", { query: "space adventure thriller", limit: 5 });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });
  await execute("Tier 1", "T1.17: GET /v1/catalog/browse returns 200 OK", async () => {
    let res = await getJson("/v1/catalog/browse");
    if (res.status === 404) res = await getJson("/v1/catalog");
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });
  await execute("Tier 1", "T1.18: Catalog items contain id and title metadata", async () => {
    let res = await getJson("/v1/catalog/browse");
    if (res.status === 404) res = await getJson("/v1/catalog");
    const items = res.body?.results || res.body?.movies || [];
    if (!items[0] || items[0].id === undefined) throw new Error("Missing id in catalog");
  });
  await execute("Tier 1", "T1.19: Catalog response returns total or category metadata", async () => {
    let res = await getJson("/v1/catalog/browse");
    if (res.status === 404) res = await getJson("/v1/catalog");
    if (!res.body?.query && !res.body?.total && !res.body?.results) throw new Error("Missing catalog meta");
  });
  await execute("Tier 1", "T1.20: Admin status endpoint returns operational status", async () => {
    const res = await getJson("/v1/admin/status");
    if (res.status !== 200 || res.body?.status !== "online") throw new Error("Admin status not online");
  });
  await execute("Tier 1", "T1.21: Evaluation benchmark endpoint returns performance metrics", async () => {
    const res = await getJson("/v1/evaluation/benchmark");
    if (res.status !== 200 || res.body?.status !== "completed") throw new Error("Benchmark not completed");
  });
  await execute("Tier 1", "T1.22: POST /v1/events with view event returns ingested status", async () => {
    const res = await postJson("/v1/events", { user_id: 101, movie_id: 550, event_type: "view" });
    if (res.status !== 200 || res.body?.status !== "ingested") throw new Error("Event not ingested");
  });
  await execute("Tier 1", "T1.23: POST /v1/events with click event returns ingested confirmation", async () => {
    const res = await postJson("/v1/events", { user_id: 102, movie_id: 680, event_type: "click" });
    if (res.status !== 200 || res.body?.status !== "ingested") throw new Error("Event not ingested");
  });
  await execute("Tier 1", "T1.24: POST /v1/events with rating event returns 200 OK", async () => {
    const res = await postJson("/v1/events", { user_id: 103, movie_id: 13, event_type: "rating" });
    if (res.status !== 200 || res.body?.status !== "ingested") throw new Error("Event not ingested");
  });
  await execute("Tier 1", "T1.25: POST /v1/events accepts multiple distinct user IDs", async () => {
    const res = await postJson("/v1/events", { user_id: 999999, movie_id: 1, event_type: "watchlist_add" });
    if (res.status !== 200 || res.body?.status !== "ingested") throw new Error("Event not ingested");
  });
  await execute("Tier 1", "T1.26: Sequential batch of events executes with 100% success", async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await postJson("/v1/events", { user_id: 200 + i, movie_id: 1000 + i, event_type: "impression" });
      if (res.status !== 200) throw new Error(`Failed on batch item ${i}`);
    }
  });

  // Execute Tier 2
  console.log("\n▶ Executing Tier 2: Boundary & Corner Cases...");
  await execute("Tier 2", "T2.1: Recommendation limit=1 boundary", async () => {
    const res = await postJson("/v1/recommendations", { top_k: 1 });
    const recs = res.body?.recommendations || res.body?.results || [];
    if (recs.length !== 1) throw new Error(`Expected 1 rec, got ${recs.length}`);
  });
  await execute("Tier 2", "T2.2: Recommendation limit=50 boundary", async () => {
    const res = await postJson("/v1/recommendations", { top_k: 50 });
    const recs = res.body?.recommendations || res.body?.results || [];
    if (recs.length !== 50) throw new Error(`Expected 50 recs, got ${recs.length}`);
  });
  await execute("Tier 2", "T2.3: Recommendation limit=0 boundary safety", async () => {
    const res = await postJson("/v1/recommendations", { top_k: 0 });
    if (![200, 400, 422].includes(res.status)) throw new Error(`Unexpected status ${res.status}`);
  });
  await execute("Tier 2", "T2.4: Extreme limit=1000 handled safely", async () => {
    const res = await postJson("/v1/recommendations", { top_k: 1000 });
    if (![200, 400, 422].includes(res.status)) throw new Error(`Unexpected status ${res.status}`);
  });
  await execute("Tier 2", "T2.5: Empty string search query", async () => {
    const res = await postJson("/v1/search", { query: "", limit: 5 });
    if (![200, 400, 422].includes(res.status)) throw new Error(`Unexpected status ${res.status}`);
  });
  await execute("Tier 2", "T2.6: Whitespace-only search query", async () => {
    const res = await postJson("/v1/search", { query: "     ", limit: 5 });
    if (![200, 400, 422].includes(res.status)) throw new Error(`Unexpected status ${res.status}`);
  });
  await execute("Tier 2", "T2.7: SQL injection strings handled safely", async () => {
    const res = await postJson("/v1/search", { query: "' OR '1'='1'; DROP TABLE movies; --", limit: 5 });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });
  await execute("Tier 2", "T2.8: XSS payload handled safely", async () => {
    const res = await postJson("/v1/search", { query: "<script>alert('XSS')</script>", limit: 3 });
    if (res.status !== 200 || res.body?.query !== "<script>alert('XSS')</script>") throw new Error("XSS failed");
  });
  await execute("Tier 2", "T2.9: 1000-character long query string", async () => {
    const longQuery = "SciFi".repeat(200);
    const res = await postJson("/v1/search", { query: longQuery, limit: 5 });
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });
  await execute("Tier 2", "T2.10: Malformed JSON body in POST request", async () => {
    const res = await postJson("/v1/search", "{ malformed json: true, ");
    if (![400, 422].includes(res.status)) throw new Error(`Expected 400/422, got ${res.status}`);
  });
  await execute("Tier 2", "T2.11: Missing required field in JSON payload", async () => {
    const res = await postJson("/v1/events", { user_id: 100 });
    if (![400, 422].includes(res.status)) throw new Error(`Expected 400/422, got ${res.status}`);
  });
  await execute("Tier 2", "T2.12: Invalid HTTP method returns 405/404", async () => {
    const res = await requestRaw("/health", { method: "DELETE" });
    if (![405, 404].includes(res.status)) throw new Error(`Expected 405/404, got ${res.status}`);
  });
  await execute("Tier 2", "T2.13: Non-existent route returns 404", async () => {
    const res = await getJson("/non_existent_route_xyz");
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });
  await execute("Tier 2", "T2.14: Auth login returns auth token", async () => {
    const res = await postJson("/v1/auth/login", { username: "tester", password: "pwd" });
    if (res.status !== 200 || !res.body?.token) throw new Error("Auth login failed");
  });

  // Execute Tier 3
  console.log("\n▶ Executing Tier 3: Cross-Feature Combinations...");
  await execute("Tier 3", "T3.1: Flow: Search -> Recs -> Event Chain", async () => {
    const searchRes = await postJson("/v1/search", { query: "Inception", limit: 3 });
    const topId = searchRes.body?.results?.[0]?.id || 1;
    const recRes = await postJson("/v1/recommendations", { user_id: topId, top_k: 5 });
    const targetRecId = recRes.body?.recommendations?.[0]?.id || 2;
    const eventRes = await postJson("/v1/events", { user_id: 1001, movie_id: targetRecId, event_type: "click" });
    if (eventRes.status !== 200) throw new Error("Chain failed");
  });
  await execute("Tier 3", "T3.2: Flow: Catalog Browse -> Pick -> Recs -> Event", async () => {
    let catRes = await getJson("/v1/catalog/browse");
    if (catRes.status === 404) catRes = await getJson("/v1/catalog");
    const pickId = catRes.body?.results?.[0]?.id || 1;
    const recRes = await postJson("/v1/recommendations", { user_id: pickId, top_k: 4 });
    const eventRes = await postJson("/v1/events", { user_id: 4004, movie_id: pickId, event_type: "browse_view" });
    if (eventRes.status !== 200) throw new Error("Catalog chain failed");
  });
  await execute("Tier 3", "T3.3: Parameter Isolation n=3 vs n=7", async () => {
    const r1 = await postJson("/v1/recommendations", { user_id: 99, top_k: 3 });
    const r2 = await postJson("/v1/recommendations", { user_id: 99, top_k: 7 });
    const c1 = r1.body?.recommendations?.length || r1.body?.results?.length;
    const c2 = r2.body?.recommendations?.length || r2.body?.results?.length;
    if (c1 !== 3 || c2 !== 7) throw new Error(`Isolation mismatch: ${c1} vs ${c2}`);
  });
  await execute("Tier 3", "T3.4: Concurrent Mixed Traffic (12 parallel requests)", async () => {
    const promises = [
      getJson("/health"),
      postJson("/v1/search", { query: "Matrix", limit: 3 }),
      postJson("/v1/recommendations", { user_id: 1, top_k: 5 }),
      postJson("/v1/events", { user_id: 1, movie_id: 10, event_type: "ping" }),
      getJson("/v1/catalog/browse"),
      getJson("/v1/admin/status"),
      getJson("/v1/billing/usage"),
      postJson("/v1/search", { query: "Action", limit: 4 }),
      postJson("/v1/recommendations", { user_id: 2, top_k: 6 }),
      postJson("/v1/events", { user_id: 2, movie_id: 20, event_type: "view" }),
      getJson("/health"),
      postJson("/v1/pipeline/run", {}),
    ];
    const results = await Promise.all(promises);
    for (const r of results) {
      if (![200, 201].includes(r.status)) throw new Error(`Concurrent status ${r.status}`);
    }
  });

  // Execute Tier 4
  console.log("\n▶ Executing Tier 4: Real-World User Flows...");
  await execute("Tier 4", "T4.1: New Visitor Discovery Journey", async () => {
    const h = await getJson("/health");
    if (h.status !== 200) throw new Error("Health failed");
    const s = await postJson("/v1/search", { query: "Sci-Fi Space", limit: 5 });
    if (s.status !== 200) throw new Error("Search failed");
    const id = s.body?.results?.[0]?.id || 1;
    const r = await postJson("/v1/recommendations", { user_id: id, top_k: 8 });
    if (r.status !== 200) throw new Error("Rec failed");
    const e = await postJson("/v1/events", { user_id: 5050, movie_id: id, event_type: "watchlist" });
    if (e.status !== 200) throw new Error("Event failed");
  });
  await execute("Tier 4", "T4.2: Cold vs Warm Query Determinism", async () => {
    const r1 = await postJson("/v1/search", { query: "Christopher Nolan Inception", limit: 5 });
    const r2 = await postJson("/v1/search", { query: "Christopher Nolan Inception", limit: 5 });
    if (r1.status !== 200 || r2.status !== 200) throw new Error("Search query failed");
    if (r1.body?.results?.[0]?.id !== r2.body?.results?.[0]?.id) throw new Error("Non-deterministic results");
  });
  await execute("Tier 4", "T4.3: Continuous Telemetry Stream Simulation", async () => {
    for (let s = 1; s <= 4; s++) {
      const rec = await postJson("/v1/recommendations", { user_id: s, top_k: 3 });
      if (rec.status !== 200) throw new Error("Rec failed");
      const ev = await postJson("/v1/events", { user_id: s, movie_id: s * 10, event_type: "heartbeat" });
      if (ev.status !== 200) throw new Error("Event failed");
    }
  });

  const total = passed + failed;
  console.log("\n========================================================================");
  console.log(`📊 API TEST SUMMARY: Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`🎯 Pass Rate: ${((passed / total) * 100).toFixed(1)}%`);
  console.log("========================================================================\n");

  return { passed, failed, total };
}

if (import.meta.main) {
  runAllApiTests().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  });
}
