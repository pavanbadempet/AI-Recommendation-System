/**
 * Unified E2E Test & Benchmark Orchestrator
 *
 * Runs all API endpoint test tiers (Tiers 1-4) and high-concurrency latency benchmarks.
 * Exits with code 0 on 100% pass rate and SLA compliance, or code 1 on any failure.
 */

import { runAllApiTests, BASE_URL } from "./test_api_endpoints";
import { runAllBenchmarks } from "./benchmark_latency";

async function checkServerHealth(url: string, maxRetries = 5, retryDelayMs = 500): Promise<boolean> {
  console.log(`📡 Probing backend health at ${url}/health ...`);
  for (let i = 1; i <= maxRetries; i++) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.status === 200) {
        console.log(`✅ Backend is ONLINE and healthy (attempt ${i}/${maxRetries})\n`);
        return true;
      }
    } catch {
      if (i < maxRetries) {
        console.log(`⏳ Waiting for backend to become ready (attempt ${i}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  return false;
}

async function main() {
  console.log("========================================================================");
  console.log("🎬 APEX MOVIE RECOMMENDATION SYSTEM — E2E TEST & BENCHMARK SUITE");
  console.log(`   Target Server: ${BASE_URL}`);
  console.log(`   Timestamp    : ${new Date().toISOString()}`);
  console.log("========================================================================\n");

  const isHealthy = await checkServerHealth(BASE_URL);
  if (!isHealthy) {
    console.error(`❌ ERROR: Target server at ${BASE_URL} is unreachable or unhealthy.`);
    console.error("   Please ensure the Rust backend or Bun server is running:");
    console.error("   $ cargo run --manifest-path backend/rust_core/Cargo.toml");
    console.error("   $ bun run scripts/dev.ts\n");
    process.exit(1);
  }

  // 1. Run Functional & Multi-Tier API Test Suite
  console.log("------------------------------------------------------------------------");
  console.log("PHASE 1: MULTI-TIER FUNCTIONAL & BOUNDARY VALIDATION");
  console.log("------------------------------------------------------------------------");
  const apiTestResult = await runAllApiTests();

  // 2. Run High-Concurrency Latency Benchmark Harness
  console.log("------------------------------------------------------------------------");
  console.log("PHASE 2: HIGH-CONCURRENCY LATENCY BENCHMARKS (<2ms SLA)");
  console.log("------------------------------------------------------------------------");
  const benchmarkResult = await runAllBenchmarks();

  // 3. Overall Execution Summary
  console.log("========================================================================");
  console.log("🏆 FINAL E2E EXECUTION REPORT");
  console.log("========================================================================");
  console.log(`- API Endpoint Tests   : ${apiTestResult.passed}/${apiTestResult.total} Passed (${apiTestResult.failed} Failed)`);
  console.log(`- Latency SLA Status   : ${benchmarkResult.allPassed ? "ALL PASSED (<2.0ms P95)" : "SOME FAILED"}`);

  const allPassed = apiTestResult.failed === 0 && benchmarkResult.allPassed;
  if (allPassed) {
    console.log("\n✨ VERIFICATION PASSED: All functional assertions and latency thresholds satisfied!");
    process.exit(0);
  } else {
    console.error("\n💥 VERIFICATION FAILED: One or more tests or latency SLAs did not meet criteria.");
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal test orchestrator error:", err);
    process.exit(1);
  });
}
