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

const TARGET = __ENV.TARGET_DIRECT_SERVICE || "https://perf-mestio.nsl.sh";

export function setup() {
  console.log("=== Gateway Force Header Benchmark ===");
  console.log("Target: " + TARGET);
  console.log("Header: X-Mesh-Force: gateway");
  console.log("Expected route: cf-worker,gateway,tunnel,pcs");

  const res = http.get(TARGET + "/health", {
    headers: { "X-Mesh-Force": "gateway" },
    timeout: "10s"
  });
  console.log("Health check: " + res.status);
  return {};
}

export default function() {
  const res = http.get(TARGET + "/echo", {
    headers: { "X-Mesh-Force": "gateway" },
  });

  check(res, {
    "status is 200": (r) => r.status === 200,
  });

  sleep(0.1);
}
