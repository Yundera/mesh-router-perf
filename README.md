# mesh-router-perf

Performance testing toolkit for mesh-router infrastructure.

## Quick Start

### 1. Deploy Test Service to PCS

The perf service **must be deployed with the `perf-` subdomain prefix**. This is required for both the mesh routing and for testing.

```bash
pnpm install
pnpm build
docker build -t mesh-router-perf .

# Copy to PCS and run (ensure container has label: compass: "perf-{yourdomain}.{server}")
docker compose up -d
```

**Example deployment labels:**
```yaml
labels:
  compass: "perf-wisera.inojob.com"
  compass.reverse_proxy: "{{upstreams 3000}}"
```

### 2. Generate Test Data (on PCS)

```bash
docker exec mesh-router-perf pnpm run generate-data
```

### 3. Run Benchmarks (locally)

```bash
# Install k6: https://k6.io/docs/getting-started/installation/

cp .env.example .env
# Edit .env with your PCS URL

./benchmarks/run.sh latency    # HTTP latency test
./benchmarks/run.sh websocket  # WebSocket test
./benchmarks/run.sh download   # Download bandwidth
./benchmarks/run.sh upload     # Upload bandwidth
./benchmarks/run.sh all        # Full suite
```

## Service Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/echo` | GET/POST | Echo request back with metadata |
| `/download/:size` | GET | Download test file (50mb, 500mb, 5gb) |
| `/upload` | POST | Upload test with throughput measurement |
| `/delay/:ms` | GET | Delayed response |
| `/ws` | WS | Native WebSocket echo server |
| `/socket.io` | HTTP/WS | Socket.IO server (v4, polling + websocket) |

## API Test Script

Quick validation of all endpoints including WebSocket connectivity.

**IMPORTANT:** URLs must use the `perf-` subdomain prefix. The test script is designed specifically for the mesh-router-perf service endpoints.

```bash
# Test local service
pnpm test-api

# Test remote deployment via mesh routing
# Format: https://perf-{userdomain}.{serverdomain}
bash test-api.sh https://perf-wisera.inojob.com
bash test-api.sh https://perf-alice.nsl.sh

# Test via sslip.io direct (bypass CF Worker)
# Format: https://perf-{ip-with-dashes}.sslip.io
bash test-api.sh https://perf-192-168-1-100.sslip.io
bash test-api.sh https://perf-2001-bc8-3021-101-be24-11ff-fe81-9faa.sslip.io  # IPv6
```

**Common mistake:** Running the test against a URL without `perf-` prefix (e.g., `wisera.inojob.com`) will fail because the app doesn't have the `/health`, `/echo`, `/ws` endpoints that this test expects.

### Test Coverage

The script runs 14 tests across all endpoint types:

| Category | Tests | Description |
|----------|-------|-------------|
| HTTP | 5 | health, echo GET/POST, delay, download |
| Native WebSocket | 5 | connect, echo RTT, multi-message (5x), keep-alive (3s), burst (10x) |
| Socket.IO | 4 | polling handshake, connect + welcome, upgrade, echo event |

### Sample Output

```
=============================================
Route Information
=============================================
Target: https://perf-example.domain.com
Route: cf-worker,nip.io,pcs

=============================================
Native WebSocket (/ws)
=============================================
Testing: WebSocket /ws connect
✓ PASS: WebSocket /ws connect (166ms)
Testing: WebSocket /ws echo RTT
✓ PASS: WebSocket /ws echo RTT
Testing: WebSocket /ws multi-message (5x)
✓ PASS: WebSocket /ws multi-message
Testing: WebSocket /ws keep-alive (3s)
✓ PASS: WebSocket /ws keep-alive
Testing: WebSocket /ws burst (10x rapid)
✓ PASS: WebSocket /ws burst

=============================================
Socket.IO (/socket.io)
=============================================
Testing: Socket.IO polling handshake
✓ PASS: Socket.IO polling (sid: bMVcxICk..., "upgrades":["websocket"])
Testing: Socket.IO connect + welcome
✓ PASS: Socket.IO connect + welcome (106ms)
Testing: Socket.IO upgrade polling→websocket
✓ PASS: Socket.IO upgrade (450ms)
Testing: Socket.IO echo event
✓ PASS: Socket.IO echo event

=============================================
Summary
=============================================
Passed: 14/14
Failed: 0/14
```

### Debugging WebSocket Issues

The hardened WebSocket tests catch common proxy issues:

| Symptom | Likely Cause |
|---------|--------------|
| Connect OK, then TIMEOUT | Proxy not forwarding WS frames |
| `RSV1 must be clear` | Compression mismatch |
| Stuck on polling | WebSocket upgrade blocked |
| 502 Bad Gateway | Proxy misconfiguration |

## Test Paths

Configure different routing paths in `.env`:

```bash
# Direct to service (baseline)
TARGET_DIRECT_SERVICE=http://192.168.1.100:3000

# Through local nginx
TARGET_DIRECT_PCS=http://192.168.1.100:80/perf

# Through mesh-router-gateway
TARGET_GATEWAY=https://perf.alice.nsl.sh

# Through Cloudflare Worker (optional)
TARGET_CF_WORKER=https://perf.alice.cf-domain.com
```

## Debugging Routes

Use trace headers to see the routing path:

```bash
curl -H "X-Mesh-Trace: 1" https://perf-example.domain.com/health
# Response header: x-mesh-route: cf-worker,nip.io,direct,pcs
```

Force a specific route:

```bash
curl -H "X-Mesh-Force: gateway" https://perf-example.domain.com/health
```

See [benchmarks/README.md](./benchmarks/README.md#debugging-routes) for details.

## Reports

Benchmark results are saved to `reports/`:

```bash
ls reports/
# 2024-01-15T10-30-00_http-latency.json
# 2024-01-15T10-35-00_websocket.json
```

## Development

### Service

```bash
pnpm install
pnpm start          # Development with hot reload
pnpm build          # Build TypeScript
pnpm test           # Run tests
pnpm run generate-data  # Generate test files
```

### Benchmarks

```bash
# Run single scenario with custom options
k6 run --vus 10 --duration 30s benchmarks/scenarios/http-latency.js

# Output to JSON
k6 run --summary-export=report.json benchmarks/scenarios/http-latency.js
```

## CI/CD

Docker images are automatically built and pushed to GitHub Container Registry on:
- Push to `main` branch (tagged as `latest`)
- Version tags (`v*` → `1.2.3`, `1.2`)

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed design documentation.
