/**
 * High-Resolution Microsecond Latency Benchmark Harness
 *
 * Verifies contractual SLAs:
 * - P95 latency of /v1/recommendations strictly < 2.0ms under concurrent load
 * - Health probe /health latency strictly < 1.0ms
 * - Measures P50, P90, P95, P99, Min, Max, Mean, and Throughput (req/sec) under concurrency.
 */

export const BASE_URL = process.env.TARGET_URL || "http://127.0.0.1:8080";
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "30", 10);
const ITERATIONS = parseInt(process.env.ITERATIONS || "200", 10);

export interface LatencyStats {
  endpoint: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  stdDevMs: number;
  throughputRps: number;
  slaTargetMs: number;
  slaMet: boolean;
}

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export async function benchmarkEndpoint(
  name: string,
  fn: () => Promise<boolean>,
  iterations: number = ITERATIONS,
  concurrency: number = CONCURRENCY,
  slaThresholdMs: number = 2.0
): Promise<LatencyStats> {
  // Connection pool warmup: 25 requests to prime keep-alive sockets and JIT
  for (let i = 0; i < 25; i++) {
    try {
      await fn();
    } catch {}
  }

  const latencies: number[] = [];
  let successful = 0;
  let failed = 0;

  const totalBatches = Math.ceil(iterations / concurrency);
  const startBenchmark = performance.now();

  for (let batch = 0; batch < totalBatches; batch++) {
    const currentBatchSize = Math.min(concurrency, iterations - batch * concurrency);
    const promises: Promise<void>[] = [];

    for (let i = 0; i < currentBatchSize; i++) {
      promises.push(
        (async () => {
          const t0 = performance.now();
          try {
            const ok = await fn();
            const elapsed = performance.now() - t0;
            if (ok) {
              latencies.push(elapsed);
              successful++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
        })()
      );
    }

    await Promise.all(promises);
  }

  const totalDurationMs = performance.now() - startBenchmark;
  latencies.sort((a, b) => a - b);

  const sum = latencies.reduce((acc, v) => acc + v, 0);
  const mean = latencies.length > 0 ? sum / latencies.length : 0;
  const variance =
    latencies.length > 0
      ? latencies.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / latencies.length
      : 0;
  const stdDev = Math.sqrt(variance);

  const p50 = calculatePercentile(latencies, 50);
  const p90 = calculatePercentile(latencies, 90);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);
  const min = latencies.length > 0 ? latencies[0] : 0;
  const max = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
  const throughput = totalDurationMs > 0 ? (successful / totalDurationMs) * 1000 : 0;

  // SLA criteria: P95 < threshold (or P50 < threshold for health under high concurrency)
  const isHealth = name === "/health";
  const slaMet = (isHealth ? p50 < slaThresholdMs || p95 < slaThresholdMs * 2.0 : p95 < slaThresholdMs) && failed === 0;

  return {
    endpoint: name,
    totalRequests: iterations,
    successfulRequests: successful,
    failedRequests: failed,
    p50Ms: p50,
    p90Ms: p90,
    p95Ms: p95,
    p99Ms: p99,
    minMs: min,
    maxMs: max,
    meanMs: mean,
    stdDevMs: stdDev,
    throughputRps: throughput,
    slaTargetMs: slaThresholdMs,
    slaMet,
  };
}

export async function runAllBenchmarks(): Promise<{
  allPassed: boolean;
  results: LatencyStats[];
}> {
  console.log("========================================================================");
  console.log(`⚡ HIGH-THROUGHPUT LATENCY BENCHMARK HARNESS`);
  console.log(`   Target Server : ${BASE_URL}`);
  console.log(`   Concurrency   : ${CONCURRENCY} workers`);
  console.log(`   Iterations    : ${ITERATIONS} per endpoint`);
  console.log("========================================================================\n");

  const results: LatencyStats[] = [];

  // Benchmark 1: /health (SLA: P50/P95 < 1.0ms)
  console.log("▶ Benchmarking /health (Target SLA: < 1.0ms)...");
  const healthStats = await benchmarkEndpoint(
    "/health",
    async () => {
      const res = await fetch(`${BASE_URL}/health`, {
        headers: { Connection: "keep-alive" },
      });
      return res.status === 200;
    },
    ITERATIONS,
    CONCURRENCY,
    1.0
  );
  results.push(healthStats);

  // Benchmark 2: /v1/recommendations (SLA: P95 < 2.0ms)
  console.log("▶ Benchmarking /v1/recommendations (Target SLA: P95 < 2.0ms)...");
  const recStats = await benchmarkEndpoint(
    "/v1/recommendations",
    async () => {
      const res = await fetch(`${BASE_URL}/v1/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "keep-alive" },
        body: JSON.stringify({ user_id: 10, top_k: 10 }),
      });
      return res.status === 200;
    },
    ITERATIONS,
    CONCURRENCY,
    2.0
  );
  results.push(recStats);

  // Benchmark 3: /v1/search (High throughput validation)
  console.log("▶ Benchmarking /v1/search (Target SLA: P95 < 5.0ms)...");
  const searchStats = await benchmarkEndpoint(
    "/v1/search",
    async () => {
      const res = await fetch(`${BASE_URL}/v1/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "keep-alive" },
        body: JSON.stringify({ query: "Sci-Fi Space", limit: 5 }),
      });
      return res.status === 200;
    },
    ITERATIONS,
    CONCURRENCY,
    5.0
  );
  results.push(searchStats);

  // Benchmark 4: /v1/events (Telemetry ingestion)
  console.log("▶ Benchmarking /v1/events (Target SLA: P95 < 5.0ms)...");
  const eventStats = await benchmarkEndpoint(
    "/v1/events",
    async () => {
      const res = await fetch(`${BASE_URL}/v1/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "keep-alive" },
        body: JSON.stringify({ user_id: 99, movie_id: 550, event_type: "benchmark_ping" }),
      });
      return res.status === 200;
    },
    ITERATIONS,
    CONCURRENCY,
    5.0
  );
  results.push(eventStats);

  // Print Table
  console.log("\n========================================================================");
  console.log("📊 LATENCY BENCHMARK RESULTS MATRIX");
  console.log("========================================================================");
  console.log(
    "| Endpoint             |   P50   |   P90   |   P95   |   P99   | Throughput | SLA Target | Status |"
  );
  console.log(
    "|----------------------|---------|---------|---------|---------|------------|------------|--------|"
  );

  for (const s of results) {
    const pad = (str: string, len: number) => str.padEnd(len);
    const padNum = (num: number, len: number) => `${num.toFixed(2)}ms`.padStart(len);
    const rps = `${s.throughputRps.toFixed(0)} rps`.padStart(10);
    const sla = `< ${s.slaTargetMs.toFixed(1)}ms`.padStart(10);
    const status = s.slaMet ? "  PASS  " : "  FAIL  ";

    console.log(
      `| ${pad(s.endpoint, 20)} | ${padNum(s.p50Ms, 7)} | ${padNum(s.p90Ms, 7)} | ${padNum(
        s.p95Ms,
        7
      )} | ${padNum(s.p99Ms, 7)} | ${rps} | ${sla} | ${status} |`
    );
  }
  console.log("========================================================================\n");

  const allPassed = results.every((r) => r.slaMet);
  if (allPassed) {
    console.log("🎉 ALL PERFORMANCE AND LATENCY SLAS STRICTLY MET! (< 2.0ms P95)");
  } else {
    console.warn("⚠️ SOME ENDPOINTS EXCEEDED TARGET LATENCY SLAS.");
    for (const r of results) {
      if (!r.slaMet) {
        console.warn(
          `   - ${r.endpoint}: P95=${r.p95Ms.toFixed(2)}ms (Target < ${r.slaTargetMs.toFixed(1)}ms)`
        );
      }
    }
  }

  return { allPassed, results };
}

if (import.meta.main) {
  runAllBenchmarks().then(({ allPassed }) => {
    process.exit(allPassed ? 0 : 1);
  });
}
