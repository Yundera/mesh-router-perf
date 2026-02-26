/**
 * Full Benchmark Suite
 *
 * Runs all benchmark scenarios in sequence with different virtual user allocations.
 * Provides comprehensive performance overview across all routing paths.
 */

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep, group } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import { getActiveTargets, logConfig } from "../lib/config.js";
import { handleSummary as createReport } from "../lib/report.js";

// Metrics for each test type
const echoLatency = new Trend("custom_echo_latency");
const echoErrors = new Counter("custom_echo_errors");

const wsConnectTime = new Trend("custom_ws_connect_time");
const wsMessageRtt = new Trend("custom_ws_message_rtt");
const wsErrors = new Counter("custom_ws_errors");

const downloadThroughput = new Trend("custom_download_throughput_mbps");
const downloadErrors = new Counter("custom_download_errors");

const uploadThroughput = new Trend("custom_upload_throughput_mbps");
const uploadErrors = new Counter("custom_upload_errors");

const overallSuccess = new Rate("custom_overall_success");

const targets = getActiveTargets();

export const options = {
  scenarios: {
    http_latency: {
      executor: "constant-vus",
      vus: 10,
      duration: "30s",
      exec: "httpLatencyTest",
      tags: { scenario: "http_latency" },
    },
    websocket: {
      executor: "constant-vus",
      vus: 5,
      duration: "30s",
      startTime: "35s",
      exec: "websocketTest",
      tags: { scenario: "websocket" },
    },
    download: {
      executor: "constant-vus",
      vus: 3,
      duration: "30s",
      startTime: "70s",
      exec: "downloadTest",
      tags: { scenario: "download" },
    },
    upload: {
      executor: "constant-vus",
      vus: 3,
      duration: "30s",
      startTime: "105s",
      exec: "uploadTest",
      tags: { scenario: "upload" },
    },
  },
  thresholds: {
    custom_echo_latency: ["p(95)<200"],
    custom_ws_connect_time: ["p(95)<500"],
    custom_download_throughput_mbps: ["avg>10"],
    custom_upload_throughput_mbps: ["avg>5"],
    custom_overall_success: ["rate>0.95"],
  },
};

export function setup() {
  logConfig();

  // Verify all targets
  console.log("Verifying targets...");
  for (const [name, url] of Object.entries(targets)) {
    const res = http.get(`${url}/health`, { timeout: "10s" });
    console.log(
      `  ${name}: ${res.status === 200 ? "OK" : "FAILED (" + res.status + ")"}`
    );
  }
  console.log("");

  // Generate upload data
  const uploadData = generateData(1024 * 1024); // 1MB

  return { targets, uploadData };
}

function generateData(size) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// HTTP Latency Test
export function httpLatencyTest(data) {
  const { targets } = data;

  for (const [name, url] of Object.entries(targets)) {
    group(`echo_${name}`, () => {
      const res = http.get(`${url}/echo`, {
        tags: { target: name },
      });

      echoLatency.add(res.timings.duration);

      const success = check(res, {
        "status is 200": (r) => r.status === 200,
      });

      overallSuccess.add(success ? 1 : 0);
      if (!success) {
        echoErrors.add(1);
      }
    });
  }

  sleep(0.1);
}

// WebSocket Test
export function websocketTest(data) {
  const { targets } = data;

  for (const [name, baseUrl] of Object.entries(targets)) {
    group(`ws_${name}`, () => {
      const wsUrl = baseUrl.replace(/^http/, "ws") + "/ws";
      const connectStart = Date.now();

      const res = ws.connect(wsUrl, {}, function (socket) {
        wsConnectTime.add(Date.now() - connectStart);

        let received = 0;

        socket.on("open", () => {
          for (let i = 0; i < 5; i++) {
            socket.send(JSON.stringify({ type: "ping", id: i, t: Date.now() }));
          }
        });

        socket.on("message", (msg) => {
          received++;
          try {
            const data = JSON.parse(msg);
            if (data.echo && data.echo.t) {
              wsMessageRtt.add(Date.now() - data.echo.t);
            }
          } catch {}

          if (received >= 5) {
            socket.close();
          }
        });

        socket.setTimeout(() => socket.close(), 3000);
      });

      const success = check(res, { connected: (r) => r && r.status === 101 });
      overallSuccess.add(success ? 1 : 0);
      if (!success) wsErrors.add(1);
    });
  }

  sleep(0.5);
}

// Download Test
export function downloadTest(data) {
  const { targets } = data;

  for (const [name, url] of Object.entries(targets)) {
    group(`download_${name}`, () => {
      const startTime = Date.now();

      const res = http.get(`${url}/download/50mb`, {
        tags: { target: name },
        timeout: "120s",
        responseType: "binary",
      });

      const totalTime = Date.now() - startTime;

      const success = check(res, {
        "status is 200": (r) => r.status === 200,
        "received data": (r) => r.body && r.body.length > 0,
      });

      if (success && res.body) {
        const throughput = (res.body.length * 8) / (totalTime * 1000);
        downloadThroughput.add(throughput);
      }

      overallSuccess.add(success ? 1 : 0);
      if (!success) downloadErrors.add(1);
    });
  }

  sleep(1);
}

// Upload Test
export function uploadTest(data) {
  const { targets, uploadData } = data;

  for (const [name, url] of Object.entries(targets)) {
    group(`upload_${name}`, () => {
      const startTime = Date.now();

      const res = http.post(`${url}/upload`, uploadData, {
        tags: { target: name },
        headers: { "Content-Type": "application/octet-stream" },
        timeout: "120s",
      });

      const totalTime = Date.now() - startTime;

      const success = check(res, {
        "status is 200": (r) => r.status === 200,
      });

      if (success) {
        const throughput = (uploadData.length * 8) / (totalTime * 1000);
        uploadThroughput.add(throughput);
      }

      overallSuccess.add(success ? 1 : 0);
      if (!success) uploadErrors.add(1);
    });
  }

  sleep(1);
}

export function handleSummary(data) {
  return createReport(data, "full-suite");
}
