"""Standalone CLI Runner and Latency SLA Verifier for E2E Test Suite.

Runs all 4 test tiers (Tier 1: Features, Tier 2: Boundaries, Tier 3: Combinations,
Tier 4: Latency SLAs) with sequential execution, aggregates timing benchmarks,
and renders a structured markdown/terminal summary table.
"""

from __future__ import annotations

import os
import sys
import time
from typing import Any

# Ensure root directory is on PYTHONPATH
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import pytest


def run_e2e_suite() -> int:
    """Execute all 4 E2E test tiers and output formatted report."""
    print("=" * 80)
    print("🎬  NOVA MOVIE RECOMMENDATION SYSTEM — FULL E2E TEST SUITE")
    print("=" * 80)
    print(f"Target Directory: {os.path.join(REPO_ROOT, 'tests', 'e2e')}")
    print(f"Python Runtime:  {sys.version.split()[0]}")
    print("=" * 80)

    start_total_time = time.perf_counter()

    tier_files = [
        ("Tier 1: Core Feature Isolation", "tests/e2e/test_tier1_features.py"),
        ("Tier 2: Boundaries & Corners", "tests/e2e/test_tier2_boundaries.py"),
        ("Tier 3: Combinations & Concurrency", "tests/e2e/test_tier3_combinations.py"),
        ("Tier 4: Latency SLA & Benchmarks", "tests/e2e/test_tier4_latency_sla.py"),
    ]

    tier_results: list[dict[str, Any]] = []
    overall_exit_code = 0

    for name, file_path in tier_files:
        full_path = os.path.join(REPO_ROOT, file_path)
        print(f"\n▶ Executing {name} ({file_path})...")
        print("-" * 80)

        tier_start = time.perf_counter()
        # Override any xdist auto-parallelization with -o addopts=""
        pytest_args = [
            full_path,
            "-v",
            "--tb=short",
            "-o",
            "addopts=",
        ]
        exit_code = pytest.main(pytest_args)
        tier_duration = time.perf_counter() - tier_start

        passed = exit_code == 0
        if not passed:
            overall_exit_code = exit_code

        tier_results.append({
            "name": name,
            "file": file_path,
            "passed": passed,
            "exit_code": int(exit_code),
            "duration": tier_duration,
        })

    total_duration = time.perf_counter() - start_total_time

    # Render Summary Table
    print("\n" + "=" * 80)
    print("📊  E2E TEST SUITE EXECUTION SUMMARY")
    print("=" * 80)
    print(f"{'Tier / Test Module':<38} | {'Status':<10} | {'Duration (s)':<12} | {'Exit Code':<10}")
    print("-" * 80)

    all_passed = True
    for res in tier_results:
        status_str = "✅ PASS" if res["passed"] else "❌ FAIL"
        if not res["passed"]:
            all_passed = False
        print(f"{res['name']:<38} | {status_str:<10} | {res['duration']:<12.2f} | {res['exit_code']:<10}")

    print("=" * 80)
    total_status = "✅ ALL TIERS PASSED" if all_passed else "❌ SUITE FAILED"
    print(f"Overall Status: {total_status}")
    print(f"Total Execution Time: {total_duration:.2f} seconds")
    print("=" * 80)

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(run_e2e_suite())
