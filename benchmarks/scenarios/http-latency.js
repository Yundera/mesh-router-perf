/**
 * HTTP Latency Benchmark
 *
 * Tests basic HTTP round-trip latency across different routing paths.
 * Measures: connection time, TLS handshake, TTFB, total duration
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";
import { getActiveTargets, getDefaultOptions, logConfig } from "../lib/config.js";
import { handleSummary as createReport } from "../lib/report.js";

// Custom metrics per target
const targetLatency = {};
const targetErrors = {};

const targets = getActiveTargets();
for (const name of Object.keys(targets)) {
  targetLatency[name] = new Trend(`custom_latency_${name}`);
  targetErrors[name] = new Counter(`custom_errors_${name}`);
}

export const options = getDefaultOptions();

export function setup() {
  logConfig();

  // Verify all targets are reachable
  console.log("Verifying targets...");
  for (const [name, url] of Object.entries(targets)) {
    const res = http.get(`${url}/health`, { timeout: "10s" });
    if (res.status !== 200) {
      console.warn(`Warning: ${name} (${url}) returned status ${res.status}`);
    } else {
      console.log(`  ${name}: OK`);
    }
  }
  console.log("");

  return { targets };
}

export default function (data) {
  const { targets } = data;

  for (const [name, url] of Object.entries(targets)) {
    const res = http.get(`${url}/echo`, {
      tags: { target: name },
    });

    // Record custom metrics
    targetLatency[name].add(res.timings.duration);

    const success = check(
      res,
      {
        "status is 200": (r) => r.status === 200,
        "has valid JSON": (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.status === "ok";
          } catch {
            return false;
          }
        },
      },
      { target: name }
    );

    if (!success) {
      targetErrors[name].add(1);
    }
  }

  sleep(0.1); // Small delay between iterations
}

export function handleSummary(data) {
  return createReport(data, "http-latency");
}
