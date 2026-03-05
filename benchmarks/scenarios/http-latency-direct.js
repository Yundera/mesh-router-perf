import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "10s", target: 10 },
    { duration: "30s", target: 10 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

const TARGET = __ENV.TARGET_DIRECT_SERVICE || "https://perf-2001-bc8-3021-201-be24-11ff-fe2e-9336.sslip.io";

export function setup() {
  console.log("=== Direct sslip.io Benchmark (no CF Worker) ===");
  console.log("Target: " + TARGET);
  console.log("Route: direct to PCS via IPv6 sslip.io");

  const res = http.get(TARGET + "/health", {
    timeout: "10s"
  });
  console.log("Health check: " + res.status);
  return {};
}

export default function() {
  const res = http.get(TARGET + "/echo");

  check(res, {
    "status is 200": (r) => r.status === 200,
  });

  sleep(0.1);
}
