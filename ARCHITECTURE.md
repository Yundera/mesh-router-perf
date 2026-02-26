# mesh-router-perf Architecture

## Overview

mesh-router-perf is a performance testing toolkit for the mesh-router infrastructure. It consists of two main components:

1. **Test Service**: A Fastify-based HTTP/WebSocket server deployed on PCS instances
2. **Benchmark Scripts**: k6-based load testing scripts run from a local machine

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Local Machine                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    k6 Benchmark Runner                           │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐  │   │
│  │  │ HTTP        │ │ WebSocket   │ │ Download    │ │ Upload    │  │   │
│  │  │ Latency     │ │ Echo        │ │ Bandwidth   │ │ Bandwidth │  │   │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └─────┬─────┘  │   │
│  └─────────┼───────────────┼───────────────┼──────────────┼────────┘   │
│            │               │               │              │             │
│            └───────────────┴───────────────┴──────────────┘             │
│                                    │                                     │
│                            ┌───────▼───────┐                            │
│                            │ reports/*.json │                            │
│                            └───────────────┘                            │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │ Direct to    │  │ Through      │  │ Through      │
            │ PCS Service  │  │ Gateway      │  │ CF Worker    │
            │ (baseline)   │  │ (OpenResty)  │  │ (optional)   │
            └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                   │                 │                 │
                   │    ┌────────────┘                 │
                   │    │                              │
                   ▼    ▼                              │
            ┌──────────────────────────────────────────┼──────────────────┐
            │                    PCS Instance          │                  │
            │  ┌────────────────────────────────────┐  │                  │
            │  │          mesh-router-perf          │◀─┘                  │
            │  │           Test Service             │                     │
            │  │  ┌───────┐ ┌──────┐ ┌──────────┐  │                     │
            │  │  │ /echo │ │ /ws  │ │/download │  │                     │
            │  │  └───────┘ └──────┘ └──────────┘  │                     │
            │  └────────────────────────────────────┘                     │
            └─────────────────────────────────────────────────────────────┘
```

## Test Paths

The benchmark suite measures performance across multiple routing paths to identify overhead at each layer:

| Path | Route | Purpose |
|------|-------|---------|
| **Direct Service** | `http://pcs-ip:3000` | Baseline (no routing overhead) |
| **Direct PCS** | `http://pcs-ip:80/perf/` | Local nginx routing only |
| **Gateway** | `https://perf.user.nsl.sh` | Full mesh-router-gateway path |
| **CF Worker** | `https://perf.user.cf-domain` | Cloudflare Worker edge path |

## Test Service Design

### Technology Stack

- **Fastify** - High-performance HTTP framework (faster than Express)
- **@fastify/websocket** - WebSocket support via ws library
- **@fastify/multipart** - Streaming file upload handling
- **TypeScript** - Type safety and consistency with other submodules

### Endpoints

```
Health & Echo
─────────────
GET  /health              → { status: "ok", timestamp, version }
GET  /echo                → Returns request metadata, headers, timing
POST /echo                → Echoes request body with metadata

Download (Streaming)
────────────────────
GET  /download/:size      → Streams file (50mb, 500mb, 5gb)
                            Supports Range requests for resume testing

Upload (Streaming)
──────────────────
POST /upload              → Accepts body stream
                            Returns { size, duration_ms, throughput_mbps }

WebSocket
─────────
WS   /ws                  → Echo server (sends back received messages)
                            Supports binary and text frames

Utility
───────
GET  /delay/:ms           → Responds after N milliseconds delay
GET  /cpu/:ms             → CPU-intensive work for N milliseconds
```

### Response Format

All JSON responses follow a consistent format:

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": { ... },
  "meta": {
    "request_id": "uuid",
    "duration_ms": 1.234,
    "version": "1.0.0"
  }
}
```

### File Generation

The service includes a utility script to generate test files:

```bash
pnpm run generate-data
```

This creates:
- `data/50mb.bin` - 50 MB of random data
- `data/500mb.bin` - 500 MB of random data
- `data/5gb.bin` - 5 GB of random data (optional, requires flag)

Files use deterministic random data for reproducibility.

## Benchmark Design

### k6 Framework

k6 is chosen for its:
- Native JavaScript/TypeScript support
- Excellent metrics and thresholds
- Low resource overhead
- Built-in protocols (HTTP, WebSocket, gRPC)
- JSON output for programmatic analysis

### Scenario Structure

Each scenario is a self-contained k6 script that:
1. Loads configuration from environment
2. Defines test stages (ramp-up, steady, ramp-down)
3. Executes requests with timing
4. Validates response correctness
5. Records metrics

```javascript
// Example scenario structure
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up
    { duration: '1m', target: 10 },   // Steady state
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  // Test logic
}
```

### Scenarios

| Scenario | Purpose | Key Metrics |
|----------|---------|-------------|
| **http-latency.js** | Basic HTTP round-trip | p50, p95, p99 latency |
| **websocket.js** | WebSocket connection & echo | Connection time, message RTT |
| **file-download.js** | Download bandwidth | Throughput (MB/s), TTFB |
| **file-upload.js** | Upload bandwidth | Throughput (MB/s), completion time |
| **full-suite.js** | All scenarios combined | Aggregate metrics |

### Configuration

Benchmarks are configured via environment variables:

```bash
# Target URLs
TARGET_DIRECT_SERVICE=http://192.168.1.100:3000
TARGET_DIRECT_PCS=http://192.168.1.100:80/perf
TARGET_GATEWAY=https://perf.alice.nsl.sh
TARGET_CF_WORKER=https://perf.alice.cf-domain.com

# Test parameters
K6_VUS=10                    # Virtual users
K6_DURATION=60s              # Test duration
K6_ITERATIONS=1000           # Total iterations (alternative to duration)

# Report settings
REPORT_DIR=./reports
REPORT_PREFIX=benchmark
```

### Report Format

Reports are JSON files with timestamps:

```
reports/
├── 2024-01-15T10-30-00_http-latency.json
├── 2024-01-15T10-35-00_websocket.json
└── 2024-01-15T10-40-00_full-suite.json
```

Each report contains:
- Test metadata (scenario, duration, targets)
- k6 metrics (request counts, latencies, throughput)
- Thresholds (pass/fail status)
- Environment info (k6 version, OS)

## Deployment

### PCS Deployment

The test service is deployed as a Docker container on PCS:

```yaml
# docker-compose.yml
services:
  mesh-router-perf:
    image: rg.fr-par.scw.cloud/aptero/mesh-router-perf:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data:ro
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    networks:
      - pcs
```

### Integration with CasaOS

When deployed via CasaOS, the service is accessible at:
- Direct: `http://pcs-ip:3000`
- Via nginx: `http://pcs-ip/perf/`
- Via mesh-router: `https://perf.user.domain`

### Docker Image

Multi-stage build following mesh-router-agent pattern:

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
# Install pnpm, copy source, build TypeScript

# Stage 2: Production
FROM node:22-alpine
# Copy only dist/, node_modules/, package.json
# Minimal production image
```

## Metrics

### Primary Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **http_req_duration** | Total request time | p95 < 200ms |
| **http_req_failed** | Failed requests | < 1% |
| **http_req_connecting** | TCP connection time | p95 < 50ms |
| **http_req_tls_handshaking** | TLS handshake time | p95 < 100ms |
| **http_req_waiting** | Time to first byte | p95 < 100ms |
| **ws_connecting** | WebSocket connection | p95 < 100ms |
| **ws_msgs_received** | Messages per second | > 1000/s |
| **data_received** | Download throughput | > 50 MB/s |
| **data_sent** | Upload throughput | > 10 MB/s |

### Derived Metrics

The benchmark scripts calculate additional metrics:
- **Routing overhead**: Gateway latency - Direct latency
- **CF overhead**: CF Worker latency - Gateway latency
- **Throughput efficiency**: Actual / Theoretical max
- **Connection reuse rate**: Requests / Connections

## Future Enhancements

### Planned Features

1. **Grafana Dashboard** - Real-time metrics visualization
2. **InfluxDB Storage** - Time-series metrics storage
3. **CI Integration** - Automated performance regression testing
4. **Multi-region Testing** - Benchmarks from multiple locations
5. **Comparative Reports** - Before/after comparison

### Potential Metrics

- Memory usage under load
- CPU utilization correlation
- Connection pool efficiency
- TLS session resumption rate
- HTTP/2 multiplexing benefits
