# mesh-router-perf

Performance testing toolkit for mesh-router infrastructure.

## Quick Start

### 1. Deploy Test Service to PCS

```bash
pnpm install
pnpm build
docker build -t mesh-router-perf .

# Copy to PCS and run
docker compose up -d
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
| `/ws` | WS | WebSocket echo server |
| `/delay/:ms` | GET | Delayed response |

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
