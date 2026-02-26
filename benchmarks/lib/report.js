/**
 * Report utilities for k6 benchmarks
 */

// Format timestamp for filename
export function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// Get report filename
export function getReportFilename(scenario) {
  const timestamp = getTimestamp();
  return `${timestamp}_${scenario}.json`;
}

// Summary handler for custom metrics output
export function handleSummary(data, scenario) {
  const timestamp = new Date().toISOString();
  const filename = getReportFilename(scenario);

  const report = {
    scenario,
    timestamp,
    duration_ms: data.state ? data.state.testRunDurationMs : 0,
    metrics: {},
    thresholds: {},
  };

  // Extract key metrics
  const metricsToExtract = [
    "http_req_duration",
    "http_req_failed",
    "http_req_waiting",
    "http_req_connecting",
    "http_req_tls_handshaking",
    "http_reqs",
    "data_received",
    "data_sent",
    "iterations",
    "vus",
    "vus_max",
  ];

  for (const metricName of metricsToExtract) {
    if (data.metrics[metricName]) {
      const metric = data.metrics[metricName];
      report.metrics[metricName] = {
        type: metric.type,
        contains: metric.contains,
        values: metric.values,
      };
    }
  }

  // Extract custom metrics (prefixed with custom_)
  for (const [name, metric] of Object.entries(data.metrics)) {
    if (name.startsWith("custom_") || name.startsWith("ws_")) {
      report.metrics[name] = {
        type: metric.type,
        contains: metric.contains,
        values: metric.values,
      };
    }
  }

  // Extract threshold results
  if (data.thresholds) {
    for (const [name, threshold] of Object.entries(data.thresholds)) {
      report.thresholds[name] = {
        ok: threshold.ok,
      };
    }
  }

  const reportDir = __ENV.REPORT_DIR || "./reports";
  const reportPath = `${reportDir}/${filename}`;

  return {
    [reportPath]: JSON.stringify(report, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}

// Simple text summary (k6 default-like)
function textSummary(data, options = {}) {
  const indent = options.indent || "";
  let output = "";

  output += "\n=== Summary ===\n\n";

  // Key metrics
  const keyMetrics = [
    "http_reqs",
    "http_req_duration",
    "http_req_failed",
    "iterations",
  ];

  for (const name of keyMetrics) {
    if (data.metrics[name]) {
      const m = data.metrics[name];
      if (m.type === "counter") {
        output += `${indent}${name}: ${m.values.count} (${m.values.rate.toFixed(2)}/s)\n`;
      } else if (m.type === "trend") {
        output += `${indent}${name}: avg=${m.values.avg.toFixed(2)}ms p95=${m.values["p(95)"].toFixed(2)}ms\n`;
      } else if (m.type === "rate") {
        output += `${indent}${name}: ${(m.values.rate * 100).toFixed(2)}%\n`;
      }
    }
  }

  // Thresholds
  if (data.thresholds && Object.keys(data.thresholds).length > 0) {
    output += "\n=== Thresholds ===\n\n";
    for (const [name, threshold] of Object.entries(data.thresholds)) {
      const status = threshold.ok ? "✓" : "✗";
      output += `${indent}${status} ${name}\n`;
    }
  }

  return output;
}
