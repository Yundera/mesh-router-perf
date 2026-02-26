/**
 * WebSocket Benchmark
 *
 * Tests WebSocket connection establishment and message echo latency.
 * Measures: connection time, message round-trip time
 */

import ws from "k6/ws";
import { check, sleep } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";
import { getActiveTargets, getDefaultOptions, logConfig } from "../lib/config.js";
import { handleSummary as createReport } from "../lib/report.js";

// Custom metrics
const wsConnectTime = new Trend("ws_connect_time");
const wsMessageRtt = new Trend("ws_message_rtt");
const wsMessagesReceived = new Counter("ws_messages_received");
const wsErrors = new Counter("ws_errors");
const wsSuccessRate = new Rate("ws_success_rate");

const targets = getActiveTargets();

export const options = {
  ...getDefaultOptions(),
  thresholds: {
    ws_connect_time: ["p(95)<500"],
    ws_message_rtt: ["p(95)<100"],
    ws_success_rate: ["rate>0.95"],
  },
};

export function setup() {
  logConfig();
  return { targets };
}

export default function (data) {
  const { targets } = data;

  for (const [name, baseUrl] of Object.entries(targets)) {
    // Convert HTTP URL to WebSocket URL
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/ws";

    const connectStart = Date.now();

    const res = ws.connect(wsUrl, {}, function (socket) {
      const connectTime = Date.now() - connectStart;
      wsConnectTime.add(connectTime);

      let messagesReceived = 0;

      socket.on("open", () => {
        // Send test messages
        for (let i = 0; i < 10; i++) {
          const sendTime = Date.now();
          const message = JSON.stringify({
            type: "ping",
            id: i,
            sendTime,
          });
          socket.send(message);
        }
      });

      socket.on("message", (msg) => {
        messagesReceived++;
        wsMessagesReceived.add(1);

        try {
          const data = JSON.parse(msg);
          if (data.echo && data.echo.sendTime) {
            const rtt = Date.now() - data.echo.sendTime;
            wsMessageRtt.add(rtt);
          }
        } catch {
          // Binary or non-JSON message
        }

        // Close after receiving all echo messages
        if (messagesReceived >= 10) {
          socket.close();
        }
      });

      socket.on("error", (e) => {
        wsErrors.add(1);
        console.error(`WebSocket error on ${name}: ${e.error()}`);
      });

      socket.setTimeout(() => {
        socket.close();
      }, 5000);
    });

    const success = check(res, {
      "WebSocket connected": (r) => r && r.status === 101,
    });

    wsSuccessRate.add(success ? 1 : 0);

    if (!success) {
      wsErrors.add(1);
    }
  }

  sleep(0.5);
}

export function handleSummary(data) {
  return createReport(data, "websocket");
}
