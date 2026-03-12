# Mesh Router Benchmark Results

Benchmark conducted on 2025-03-06 against `wisera.inojob.com` PCS.

## Test Configuration

- **Payload**: 50MB (upload/download)
- **Samples**: 20 latency measurements
- **Target**: IPv6 PCS via sslip.io and CF Worker routes

## Results Summary

| Route | Latency (avg) | Latency (p95) | Download | Upload |
|-------|---------------|---------------|----------|--------|
| **Direct (sslip.io)** | 34ms | 42ms | 111 Mbps | 351 Mbps |
| **CF Worker** | 159ms | 339ms | 129 Mbps | 158 Mbps |
| **CF + Gateway + Tunnel** | 188ms | 245ms | 97 Mbps | 96 Mbps |

## Route Descriptions

| Route | Path | Use Case |
|-------|------|----------|
| Direct | Client → sslip.io → PCS | Baseline, bypasses all routing |
| CF Worker | Client → CF Worker → sslip.io → PCS | Default production path |
| Gateway + Tunnel | Client → CF Worker → Gateway → WireGuard → PCS | NAT traversal fallback |

## Performance Analysis

### Latency Overhead

| Hop | Added Latency |
|-----|---------------|
| CF Worker | +125ms |
| Gateway + Tunnel | +29ms (on top of CF) |
| **Total (Gateway path)** | +154ms vs direct |

### Throughput Impact

| Route | Download | Upload |
|-------|----------|--------|
| Direct | 100% | 100% |
| CF Worker | 116% | 45% |
| Gateway + Tunnel | 87% | 27% |

### Variance

- **Direct**: Low variance (p95/avg = 1.2x)
- **CF Worker**: High variance (p95/avg = 2.1x)
- **Gateway**: Moderate variance (p95/avg = 1.3x)

## Known Limits

| Limit | Value | Cause |
|-------|-------|-------|
| Upload size via CF Worker | 100 MB | Cloudflare request body limit |
| Available test payloads | 50, 200, 500 MB | Server-side generated files |

## Running Benchmarks

```bash
# Direct path (baseline)
./benchmark.sh perf-<ip>.sslip.io --payload 50

# CF Worker (default)
./benchmark.sh perf-<domain>.<server> --payload 50

# Force gateway path
./benchmark.sh perf-<domain>.<server> --payload 50 --force gateway
```

## Generating Test Payloads

```bash
# Generate all payloads on server
curl -X POST https://perf-<domain>/generate

# Generate specific size
curl -X POST https://perf-<domain>/generate/200mb

# Check available payloads
curl https://perf-<domain>/generate
```
