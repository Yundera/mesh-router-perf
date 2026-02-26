/**
 * Configuration loader for k6 benchmarks
 * Reads from environment variables
 */

// Target URLs - test different routing paths
export const TARGETS = {
  direct_service: __ENV.TARGET_DIRECT_SERVICE || "http://localhost:3000",
  direct_pcs: __ENV.TARGET_DIRECT_PCS || "",
  gateway: __ENV.TARGET_GATEWAY || "",
  cf_worker: __ENV.TARGET_CF_WORKER || "",
};

// Test parameters
export const TEST_CONFIG = {
  vus: parseInt(__ENV.K6_VUS || "10", 10),
  duration: __ENV.K6_DURATION || "60s",
  iterations: parseInt(__ENV.K6_ITERATIONS || "0", 10),
};

// Thresholds
export const THRESHOLDS = {
  http_req_duration_p95: parseInt(__ENV.THRESHOLD_P95_MS || "200", 10),
  http_req_failed_rate: parseFloat(__ENV.THRESHOLD_FAIL_RATE || "0.01"),
};

// Get active targets (non-empty URLs)
export function getActiveTargets() {
  const active = {};
  for (const [name, url] of Object.entries(TARGETS)) {
    if (url) {
      active[name] = url;
    }
  }
  return active;
}

// Get default options for scenarios
export function getDefaultOptions() {
  const options = {
    thresholds: {
      http_req_duration: [`p(95)<${THRESHOLDS.http_req_duration_p95}`],
      http_req_failed: [`rate<${THRESHOLDS.http_req_failed_rate}`],
    },
  };

  if (TEST_CONFIG.iterations > 0) {
    options.iterations = TEST_CONFIG.iterations;
    options.vus = TEST_CONFIG.vus;
  } else {
    options.stages = [
      { duration: "10s", target: TEST_CONFIG.vus },
      { duration: TEST_CONFIG.duration, target: TEST_CONFIG.vus },
      { duration: "10s", target: 0 },
    ];
  }

  return options;
}

// Log configuration at start
export function logConfig() {
  console.log("=== Benchmark Configuration ===");
  console.log(`VUs: ${TEST_CONFIG.vus}`);
  console.log(`Duration: ${TEST_CONFIG.duration}`);
  console.log("");
  console.log("Active Targets:");
  const active = getActiveTargets();
  for (const [name, url] of Object.entries(active)) {
    console.log(`  ${name}: ${url}`);
  }
  console.log("");
}
