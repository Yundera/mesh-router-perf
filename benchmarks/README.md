# mesh-router-perf Benchmarks

k6-based performance benchmarks for mesh-router infrastructure.

## Prerequisites

Install k6: https://k6.io/docs/getting-started/installation/

```bash
# macOS
brew install k6

# Linux (snap)
sudo snap install k6

# Linux (apt)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

## Quick Start

```bash
# Configure targets
cp ../.env.example ../.env
# Edit ../.env with your PCS URLs

# Run latency test
./run.sh latency

# Run all tests
./run.sh all
```

## Scenarios

| Scenario | Description | Duration |
|----------|-------------|----------|
| `latency` | HTTP echo endpoint latency | ~2 min |
| `websocket` | WebSocket connection & message RTT | ~2 min |
| `download` | File download throughput (50MB default) | ~2 min |
| `upload` | File upload throughput (10MB default) | ~2 min |
| `all` | Full suite (all above, sequential) | ~3 min |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TARGET_DIRECT_SERVICE` | Direct service URL | `http://localhost:3000` |
| `TARGET_DIRECT_PCS` | PCS nginx URL | (empty) |
| `TARGET_GATEWAY` | Gateway URL | (empty) |
| `TARGET_CF_WORKER` | CF Worker URL | (empty) |
| `K6_VUS` | Virtual users | `10` |
| `K6_DURATION` | Test duration | `60s` |
| `DOWNLOAD_SIZE` | Download file size | `50mb` |
| `UPLOAD_SIZE_MB` | Upload size in MB | `10` |
| `REPORT_DIR` | Report output dir | `./reports` |

### Test Paths

Configure multiple targets to compare routing overhead:

```bash
# Direct to service (baseline, no routing)
TARGET_DIRECT_SERVICE=http://192.168.1.100:3000

# Through PCS local nginx
TARGET_DIRECT_PCS=http://192.168.1.100:80/perf

# Through mesh-router-gateway
TARGET_GATEWAY=https://perf.alice.nsl.sh

# Through Cloudflare Worker
TARGET_CF_WORKER=https://perf.alice.cf-domain.com
```

## Running Benchmarks

### Basic Usage

```bash
# Run specific scenario
./run.sh latency
./run.sh websocket
./run.sh download
./run.sh upload
./run.sh all

# With custom options
./run.sh latency --vus 20 --duration 2m
./run.sh download --env DOWNLOAD_SIZE=500mb
```

### Direct k6 Usage

```bash
# Run with k6 directly
k6 run scenarios/http-latency.js

# With options
k6 run --vus 10 --duration 30s scenarios/http-latency.js

# Output to JSON
k6 run --summary-export=report.json scenarios/http-latency.js
```

### Running k6 with Docker

If you don't have k6 installed locally, you can use the Docker image:

```bash
# Basic usage (IPv4 targets only)
docker run --rm \
  -v "$(pwd):/benchmarks" \
  -e TARGET_DIRECT_SERVICE=https://perf.example.com \
  -e K6_VUS=10 \
  -e K6_DURATION=30s \
  grafana/k6 run /benchmarks/scenarios/http-latency.js
```

#### IPv6 Targets (nip.io domains)

Docker containers don't have IPv6 connectivity by default. For IPv6 targets (like nip.io domains resolving to IPv6), use `--network host`:

```bash
# With host networking (required for IPv6)
docker run --rm --network host \
  -v "$(pwd):/benchmarks" \
  -e TARGET_DIRECT_SERVICE=https://perf-2001-bc8-1234-abcd.nip.io \
  -e K6_VUS=10 \
  -e K6_DURATION=30s \
  grafana/k6 run /benchmarks/scenarios/http-latency.js
```

#### Self-signed/Custom CA Certificates

For targets using custom CA certificates (like gateway-routed domains), add `--insecure-skip-tls-verify`:

```bash
docker run --rm --network host \
  -v "$(pwd):/benchmarks" \
  -e TARGET_DIRECT_SERVICE=https://perf-192-168-1-100.nip.io \
  grafana/k6 run --insecure-skip-tls-verify /benchmarks/scenarios/http-latency.js
```

#### Summary

| Target Type | Docker Flag | TLS Flag |
|-------------|-------------|----------|
| IPv4 (public) | (none) | (none) |
| IPv6 / nip.io | `--network host` | (none or `--insecure-skip-tls-verify`) |
| Custom CA cert | (none) | `--insecure-skip-tls-verify` |
| IPv6 + Custom CA | `--network host` | `--insecure-skip-tls-verify` |

## Reports

Reports are JSON files saved to `../reports/`:

```
reports/
├── 2024-01-15T10-30-00_http-latency.json
├── 2024-01-15T10-35-00_websocket.json
└── 2024-01-15T10-40-00_full-suite.json
```

### Report Format

```json
{
  "scenario": "http-latency",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "duration_ms": 120000,
  "metrics": {
    "http_req_duration": {
      "type": "trend",
      "values": {
        "avg": 45.23,
        "p(95)": 89.45,
        "p(99)": 123.67
      }
    }
  },
  "thresholds": {
    "http_req_duration{p(95)<200}": { "ok": true }
  }
}
```

## Metrics

### HTTP Metrics

| Metric | Description |
|--------|-------------|
| `http_req_duration` | Total request time |
| `http_req_waiting` | Time to first byte (TTFB) |
| `http_req_connecting` | TCP connection time |
| `http_req_tls_handshaking` | TLS handshake time |
| `http_req_failed` | Failed request rate |
| `http_reqs` | Request count & rate |

### WebSocket Metrics

| Metric | Description |
|--------|-------------|
| `ws_connect_time` | Connection establishment time |
| `ws_message_rtt` | Message round-trip time |
| `ws_messages_received` | Message count |
| `ws_success_rate` | Successful connection rate |

### Throughput Metrics

| Metric | Description |
|--------|-------------|
| `custom_download_throughput_mbps` | Download speed (Mbps) |
| `custom_upload_throughput_mbps` | Upload speed (Mbps) |
| `data_received` | Total bytes received |
| `data_sent` | Total bytes sent |

## Debugging Routes

### Trace Headers

Use `X-Mesh-Trace: 1` to see the routing path taken by a request:

```bash
curl -s -D- -o /dev/null -H "X-Mesh-Trace: 1" https://perf-wisera.inojob.com/health | grep x-mesh
# x-mesh-route: cf-worker,nip.io,direct,pcs
```

**Route segments:**
| Segment | Description |
|---------|-------------|
| `cf-worker` | Request went through Cloudflare Worker |
| `gateway` | Request went through mesh-router-gateway (OpenResty) |
| `nip.io` | Resolved via nip.io to PCS IP |
| `direct` | Direct connection (not tunneled) |
| `tunnel` | Connection via WireGuard tunnel |
| `pcs` | Reached the PCS |

### Force Headers

Use `X-Mesh-Force` to force a specific routing path:

```bash
# Force gateway fallback (bypass direct nip.io)
curl -H "X-Mesh-Trace: 1" -H "X-Mesh-Force: gateway" https://perf-wisera.inojob.com/health

# Force direct connection
curl -H "X-Mesh-Trace: 1" -H "X-Mesh-Force: direct" https://perf-wisera.inojob.com/health
```

### Comparing Routes in Benchmarks

To benchmark different routing paths, use the dedicated route comparison scenarios:

#### Available Route Scenarios

| Scenario | File | Route | Description |
|----------|------|-------|-------------|
| Default | `http-latency.js` | `cf-worker,nip.io,pcs` | Standard CF Worker path |
| Gateway/Tunnel | `http-latency-gateway.js` | `cf-worker,gateway,tunnel,pcs` | Forces gateway fallback |
| Direct sslip.io | `http-latency-direct.js` | `pcs` | Bypasses CF Worker entirely |

#### Finding the Direct sslip.io Domain

To benchmark direct PCS access, first get the sslip.io domain from the backend:

```bash
# Get the sslip.io domain for a PCS
curl -s "https://nsl.sh/router/api/resolve/v2/mestio" | jq '.routes[].domain' | grep -v null

# Output: "2001-bc8-3021-201-be24-11ff-fe2e-9336.sslip.io"

# For perf subdomain, prefix with "perf-":
# https://perf-2001-bc8-3021-201-be24-11ff-fe2e-9336.sslip.io
```

#### Running Route Comparison

```bash
# 1. Default path (CF Worker → nip.io direct) - ~38ms latency
docker run --rm --network host -v "$(pwd):/benchmarks" \
  -e TARGET_DIRECT_SERVICE=https://perf-mestio.nsl.sh \
  grafana/k6 run /benchmarks/scenarios/http-latency.js

# 2. Gateway + Tunnel path - ~137ms latency
docker run --rm --network host -v "$(pwd):/benchmarks" \
  -e TARGET_DIRECT_SERVICE=https://perf-mestio.nsl.sh \
  grafana/k6 run /benchmarks/scenarios/http-latency-gateway.js

# 3. Direct sslip.io (no CF Worker) - ~7ms latency
docker run --rm --network host -v "$(pwd):/benchmarks" \
  -e TARGET_DIRECT_SERVICE=https://perf-2001-bc8-3021-201-be24-11ff-fe2e-9336.sslip.io \
  grafana/k6 run /benchmarks/scenarios/http-latency-direct.js
```

#### Expected Results

| Path | Avg Latency | p95 | Throughput |
|------|-------------|-----|------------|
| Direct sslip.io | ~7ms | ~11ms | ~75 req/s |
| CF + nip.io | ~38ms | ~46ms | ~71 req/s |
| CF + Gateway + Tunnel | ~137ms | ~162ms | ~34 req/s |

See `reports/2026-03-04_routing-path-comparison.md` for detailed analysis.

## Thresholds

Default pass/fail thresholds:

| Metric | Threshold |
|--------|-----------|
| `http_req_duration` | p(95) < 200ms |
| `http_req_failed` | rate < 1% |
| `ws_connect_time` | p(95) < 500ms |
| `ws_message_rtt` | p(95) < 100ms |
| `download_throughput` | avg > 10 Mbps |
| `upload_throughput` | avg > 5 Mbps |
