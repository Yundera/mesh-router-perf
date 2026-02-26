/**
 * File Download Benchmark
 *
 * Tests download bandwidth through different routing paths.
 * Measures: throughput (MB/s), time to first byte, total download time
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter, Gauge } from "k6/metrics";
import { getActiveTargets, logConfig } from "../lib/config.js";
import { handleSummary as createReport } from "../lib/report.js";

// Custom metrics
const downloadThroughput = new Trend("custom_download_throughput_mbps");
const downloadTtfb = new Trend("custom_download_ttfb");
const downloadSize = new Counter("custom_download_bytes");
const downloadErrors = new Counter("custom_download_errors");

const targets = getActiveTargets();

// File size to download (configurable via env)
const FILE_SIZE = __ENV.DOWNLOAD_SIZE || "50mb";

export const options = {
  vus: parseInt(__ENV.K6_VUS || "5", 10),
  duration: __ENV.K6_DURATION || "60s",
  thresholds: {
    custom_download_throughput_mbps: ["avg>10"],
    custom_download_ttfb: ["p(95)<500"],
    http_req_failed: ["rate<0.05"],
  },
};

export function setup() {
  logConfig();
  console.log(`Download test file size: ${FILE_SIZE}`);

  // Check file availability
  for (const [name, url] of Object.entries(targets)) {
    const res = http.get(`${url}/download`, { timeout: "10s" });
    if (res.status === 200) {
      const body = JSON.parse(res.body);
      const fileInfo = body.available[FILE_SIZE.toLowerCase()];
      if (!fileInfo || !fileInfo.exists) {
        console.warn(
          `Warning: ${name} does not have ${FILE_SIZE} file available`
        );
      } else {
        console.log(
          `  ${name}: ${FILE_SIZE} available (${fileInfo.size} bytes)`
        );
      }
    }
  }
  console.log("");

  return { targets, fileSize: FILE_SIZE };
}

export default function (data) {
  const { targets, fileSize } = data;

  for (const [name, url] of Object.entries(targets)) {
    const startTime = Date.now();

    const res = http.get(`${url}/download/${fileSize}`, {
      tags: { target: name },
      timeout: "300s", // 5 minute timeout for large files
      responseType: "binary",
    });

    const totalTime = Date.now() - startTime;

    const success = check(
      res,
      {
        "status is 200": (r) => r.status === 200,
        "received data": (r) => r.body && r.body.length > 0,
      },
      { target: name }
    );

    if (success && res.body) {
      const bytesReceived = res.body.length;
      const throughputMbps = (bytesReceived * 8) / (totalTime * 1000); // Mbps

      downloadThroughput.add(throughputMbps);
      downloadTtfb.add(res.timings.waiting);
      downloadSize.add(bytesReceived);
    } else {
      downloadErrors.add(1);
    }
  }

  sleep(1); // Longer pause between downloads
}

export function handleSummary(data) {
  return createReport(data, "file-download");
}
