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
k6 run --out json=result.json scenarios/http-latency.js
```

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
