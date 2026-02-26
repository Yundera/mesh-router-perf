/**
 * File Upload Benchmark
 *
 * Tests upload bandwidth through different routing paths.
 * Measures: throughput (MB/s), server processing time
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";
import { getActiveTargets, logConfig } from "../lib/config.js";
import { handleSummary as createReport } from "../lib/report.js";

// Custom metrics
const uploadThroughput = new Trend("custom_upload_throughput_mbps");
const uploadServerTime = new Trend("custom_upload_server_time");
const uploadSize = new Counter("custom_upload_bytes");
const uploadErrors = new Counter("custom_upload_errors");

const targets = getActiveTargets();

// Upload size in MB (configurable via env)
const UPLOAD_SIZE_MB = parseInt(__ENV.UPLOAD_SIZE_MB || "10", 10);
const UPLOAD_SIZE_BYTES = UPLOAD_SIZE_MB * 1024 * 1024;

// Generate random data for upload
function generateData(size) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const options = {
  vus: parseInt(__ENV.K6_VUS || "5", 10),
  duration: __ENV.K6_DURATION || "60s",
  thresholds: {
    custom_upload_throughput_mbps: ["avg>5"],
    http_req_failed: ["rate<0.05"],
  },
};

// Pre-generate upload data
let uploadData;

export function setup() {
  logConfig();
  console.log(`Upload test size: ${UPLOAD_SIZE_MB} MB`);

  // Verify upload endpoint is available
  for (const [name, url] of Object.entries(targets)) {
    const res = http.get(`${url}/health`, { timeout: "10s" });
    if (res.status === 200) {
      console.log(`  ${name}: Ready`);
    }
  }
  console.log("");

  // Generate data (smaller for setup, actual data generated per VU)
  console.log("Generating upload data...");
  uploadData = generateData(UPLOAD_SIZE_BYTES);
  console.log(`Generated ${UPLOAD_SIZE_MB} MB of test data`);

  return { targets, uploadData };
}

export default function (data) {
  const { targets, uploadData } = data;

  for (const [name, url] of Object.entries(targets)) {
    const startTime = Date.now();

    const res = http.post(`${url}/upload`, uploadData, {
      tags: { target: name },
      headers: {
        "Content-Type": "application/octet-stream",
      },
      timeout: "300s",
    });

    const totalTime = Date.now() - startTime;

    const success = check(
      res,
      {
        "status is 200": (r) => r.status === 200,
        "valid response": (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.status === "ok" && body.size > 0;
          } catch {
            return false;
          }
        },
      },
      { target: name }
    );

    if (success) {
      const body = JSON.parse(res.body);
      const throughputMbps = (uploadData.length * 8) / (totalTime * 1000);

      uploadThroughput.add(throughputMbps);
      uploadServerTime.add(body.duration_ms);
      uploadSize.add(uploadData.length);
    } else {
      uploadErrors.add(1);
    }
  }

  sleep(1);
}

export function handleSummary(data) {
  return createReport(data, "file-upload");
}
