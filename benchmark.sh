#!/bin/bash
# Unified Network Benchmark Script for mesh-router-perf
# Usage: ./benchmark.sh <domain> [--force <gateway|direct|tunnel>] [--payload <MB>]
#
# Examples:
#   ./benchmark.sh perf-wisera.inojob.com
#   ./benchmark.sh perf-alice.nsl.sh --force gateway
#   ./benchmark.sh perf-mestio.nsl.sh --force tunnel --payload 100

set -e

# =============================================================================
# Argument Parsing
# =============================================================================
DOMAIN=""
FORCE_ROUTE=""
PAYLOAD_MB=200
LATENCY_SAMPLES=10

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_ROUTE="$2"
            shift 2
            ;;
        --payload)
            PAYLOAD_MB="$2"
            shift 2
            ;;
        --samples)
            LATENCY_SAMPLES="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 <domain> [--force <gateway|direct|tunnel>] [--payload <MB>] [--samples <N>]"
            echo ""
            echo "Arguments:"
            echo "  domain              Target domain (e.g., perf-wisera.inojob.com)"
            echo ""
            echo "Options:"
            echo "  --force <route>     Force routing path: gateway, direct, or tunnel"
            echo "  --payload <MB>      Payload size for upload/download tests (default: 200, max: 500)"
            echo "  --samples <N>       Number of latency samples (default: 10)"
            echo "  -h, --help          Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 perf-wisera.inojob.com"
            echo "  $0 perf-alice.nsl.sh --force gateway"
            echo "  $0 perf-mestio.nsl.sh --force tunnel --payload 100"
            exit 0
            ;;
        *)
            if [[ -z "$DOMAIN" ]]; then
                DOMAIN="$1"
            else
                echo "Error: Unknown argument: $1"
                exit 1
            fi
            shift
            ;;
    esac
done

if [[ -z "$DOMAIN" ]]; then
    echo "Error: Domain is required"
    echo "Usage: $0 <domain> [--force <gateway|direct|tunnel>] [--payload <MB>]"
    exit 1
fi

# Normalize domain (add https:// if needed)
if [[ ! "$DOMAIN" =~ ^https?:// ]]; then
    BASE_URL="https://$DOMAIN"
else
    BASE_URL="$DOMAIN"
fi

# =============================================================================
# Colors and Formatting
# =============================================================================
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

# =============================================================================
# Helper Functions (using awk for portability)
# =============================================================================
calc() {
    awk "BEGIN {printf \"%.2f\", $1}"
}

calc_int() {
    awk "BEGIN {printf \"%.0f\", $1}"
}

format_speed() {
    local mbps=$1
    if awk "BEGIN {exit !($mbps >= 1000)}"; then
        awk "BEGIN {printf \"%.1f Gbps\", $mbps / 1000}"
    else
        awk "BEGIN {printf \"%.1f Mbps\", $mbps}"
    fi
}

format_time() {
    local ms=$1
    if awk "BEGIN {exit !($ms >= 1000)}"; then
        awk "BEGIN {printf \"%.2fs\", $ms / 1000}"
    else
        awk "BEGIN {printf \"%.0fms\", $ms}"
    fi
}

format_size() {
    local bytes=$1
    if [[ $bytes -ge 1073741824 ]]; then
        awk "BEGIN {printf \"%.1f GB\", $bytes / 1073741824}"
    elif [[ $bytes -ge 1048576 ]]; then
        awk "BEGIN {printf \"%.1f MB\", $bytes / 1048576}"
    elif [[ $bytes -ge 1024 ]]; then
        awk "BEGIN {printf \"%.1f KB\", $bytes / 1024}"
    else
        printf "%d B" "$bytes"
    fi
}

# =============================================================================
# Header
# =============================================================================
echo ""
echo -e "${BOLD}=== Network Benchmark ===${NC}"
echo -e "${CYAN}Target:${NC}  $BASE_URL"
if [[ -n "$FORCE_ROUTE" ]]; then
    echo -e "${CYAN}Force:${NC}   $FORCE_ROUTE"
fi
echo -e "${CYAN}Payload:${NC} ${PAYLOAD_MB}MB"
echo ""

# =============================================================================
# Route Detection
# =============================================================================
echo -e "${DIM}Detecting route...${NC}"
CURL_HEADERS=""
if [[ -n "$FORCE_ROUTE" ]]; then
    CURL_HEADERS="-H X-Mesh-Force:$FORCE_ROUTE"
fi

ROUTE_RESPONSE=$(curl -s -D- -o /dev/null -H "X-Mesh-Trace: 1" $CURL_HEADERS "$BASE_URL/health" 2>&1)
ROUTE=$(echo "$ROUTE_RESPONSE" | grep -i "x-mesh-route" | cut -d: -f2- | tr -d ' \r\n' || echo "")

if [[ -n "$ROUTE" ]]; then
    # Format route nicely: cf-worker,nip.io,direct,pcs -> cf-worker -> nip.io -> direct -> pcs
    ROUTE_DISPLAY=$(echo "$ROUTE" | sed 's/,/ -> /g')
    echo -e "${CYAN}Route:${NC}   $ROUTE_DISPLAY"
else
    echo -e "${CYAN}Route:${NC}   ${DIM}(no x-mesh-route header)${NC}"
fi
echo ""

# =============================================================================
# Latency Test
# =============================================================================
echo -e "${BOLD}Latency${NC} ${DIM}(HTTP round-trip to /echo, $LATENCY_SAMPLES samples)${NC}"

declare -a LATENCIES
ERRORS=0

for i in $(seq 1 $LATENCY_SAMPLES); do
    # Use curl timing to measure total request time
    TIMING=$(curl -s -o /dev/null -w "%{time_total}" $CURL_HEADERS "$BASE_URL/echo" 2>/dev/null || echo "error")

    if [[ "$TIMING" == "error" ]]; then
        ((ERRORS++))
    else
        # Convert to milliseconds
        MS=$(awk "BEGIN {printf \"%.1f\", $TIMING * 1000}")
        LATENCIES+=("$MS")
    fi
done

if [[ ${#LATENCIES[@]} -gt 0 ]]; then
    # Sort latencies
    IFS=$'\n' SORTED=($(printf '%s\n' "${LATENCIES[@]}" | sort -n)); unset IFS

    # Calculate stats
    SUM=0
    for lat in "${LATENCIES[@]}"; do
        SUM=$(awk "BEGIN {print $SUM + $lat}")
    done
    AVG=$(awk "BEGIN {printf \"%.1f\", $SUM / ${#LATENCIES[@]}}")
    MIN="${SORTED[0]}"
    MAX="${SORTED[-1]}"

    # Calculate percentiles
    N=${#SORTED[@]}
    P95_IDX=$(awk "BEGIN {printf \"%.0f\", ($N - 1) * 0.95}")
    P99_IDX=$(awk "BEGIN {printf \"%.0f\", ($N - 1) * 0.99}")
    P95="${SORTED[$P95_IDX]}"
    P99="${SORTED[$P99_IDX]}"

    printf "  ${GREEN}Avg:${NC} %s  ${DIM}|${NC}  Min: %s  Max: %s  p95: %s  p99: %s\n" \
        "$(format_time $AVG)" "$(format_time $MIN)" "$(format_time $MAX)" "$(format_time $P95)" "$(format_time $P99)"

    if [[ $ERRORS -gt 0 ]]; then
        echo -e "  ${YELLOW}Errors: $ERRORS/$LATENCY_SAMPLES requests failed${NC}"
    fi
else
    echo -e "  ${YELLOW}All requests failed${NC}"
fi
echo ""

# =============================================================================
# Download Test
# =============================================================================
# Map payload size to available file (max 500mb)
if [[ $PAYLOAD_MB -le 50 ]]; then
    DL_SIZE="50mb"
    DL_BYTES=$((50 * 1024 * 1024))
elif [[ $PAYLOAD_MB -le 200 ]]; then
    DL_SIZE="200mb"
    DL_BYTES=$((200 * 1024 * 1024))
else
    DL_SIZE="500mb"
    DL_BYTES=$((500 * 1024 * 1024))
fi

echo -e "${BOLD}Download${NC} ${DIM}($DL_SIZE)${NC}"

# First check if file exists
DL_CHECK=$(curl -s $CURL_HEADERS "$BASE_URL/download/$DL_SIZE" -w "%{http_code}" -o /tmp/dl_check_$$ 2>/dev/null)
DL_BODY=$(cat /tmp/dl_check_$$ 2>/dev/null || echo "")
rm -f /tmp/dl_check_$$ 2>/dev/null

if [[ "$DL_CHECK" != "200" ]] || echo "$DL_BODY" | grep -q '"status":"error"'; then
    echo -e "  ${YELLOW}File not available - run 'pnpm run generate-data' on server${NC}"
else
    # Download with timing (actual timed download)
    DL_RESULT=$(curl -s -o /dev/null -w "%{size_download} %{time_total} %{time_starttransfer}" \
        $CURL_HEADERS "$BASE_URL/download/$DL_SIZE" 2>/dev/null || echo "0 0 0")

    read DL_DOWNLOADED DL_TIME DL_TTFB <<< "$DL_RESULT"

    if [[ "$DL_DOWNLOADED" -gt 1000 && "$DL_TIME" != "0" ]]; then
        # Calculate throughput in Mbps (bytes * 8 / seconds / 1_000_000)
        DL_MBPS=$(awk "BEGIN {printf \"%.2f\", $DL_DOWNLOADED * 8 / $DL_TIME / 1000000}")
        DL_TIME_MS=$(awk "BEGIN {printf \"%.0f\", $DL_TIME * 1000}")
        DL_TTFB_MS=$(awk "BEGIN {printf \"%.0f\", $DL_TTFB * 1000}")

        printf "  ${GREEN}Speed:${NC} %s  ${DIM}|${NC}  Downloaded: %s  Time: %s  TTFB: %s\n" \
            "$(format_speed $DL_MBPS)" "$(format_size $DL_DOWNLOADED)" "$(format_time $DL_TIME_MS)" "$(format_time $DL_TTFB_MS)"
    else
        echo -e "  ${YELLOW}Download failed${NC}"
    fi
fi
echo ""

# =============================================================================
# Upload Test
# =============================================================================
UPLOAD_BYTES=$((PAYLOAD_MB * 1024 * 1024))
echo -e "${BOLD}Upload${NC} ${DIM}(${PAYLOAD_MB}MB)${NC}"

# Generate random data to temp file first (more reliable than piping)
UPLOAD_FILE="/tmp/upload_test_$$"
dd if=/dev/urandom of="$UPLOAD_FILE" bs=1M count=$PAYLOAD_MB 2>/dev/null

# Upload with timing
UL_RESULT=$(curl -s -X POST \
    -H "Content-Type: application/octet-stream" \
    $CURL_HEADERS \
    --data-binary "@$UPLOAD_FILE" \
    -w "\n%{size_upload} %{time_total}" \
    "$BASE_URL/upload" 2>/dev/null || echo "error")

rm -f "$UPLOAD_FILE" 2>/dev/null

if [[ "$UL_RESULT" != "error" ]]; then
    # Parse response - last line has timing info
    UL_TIMING=$(echo "$UL_RESULT" | tail -1)
    UL_RESPONSE=$(echo "$UL_RESULT" | head -n -1)

    read UL_UPLOADED UL_TIME <<< "$UL_TIMING"

    if [[ -n "$UL_UPLOADED" && "$UL_UPLOADED" != "0" && -n "$UL_TIME" && "$UL_TIME" != "0" ]]; then
        # Calculate throughput (client-side)
        UL_MBPS=$(awk "BEGIN {printf \"%.2f\", $UL_UPLOADED * 8 / $UL_TIME / 1000000}")
        UL_TIME_MS=$(awk "BEGIN {printf \"%.0f\", $UL_TIME * 1000}")

        # Parse server-side throughput from JSON response
        SERVER_MBPS=$(echo "$UL_RESPONSE" | sed -n 's/.*"throughput_mbps":\([0-9.]*\).*/\1/p')

        printf "  ${GREEN}Speed:${NC} %s  ${DIM}|${NC}  Uploaded: %s  Time: %s" \
            "$(format_speed $UL_MBPS)" "$(format_size $UL_UPLOADED)" "$(format_time $UL_TIME_MS)"

        if [[ -n "$SERVER_MBPS" && "$SERVER_MBPS" != "0" ]]; then
            # Only show server throughput if it's reasonable (< 10 Gbps)
            SERVER_CHECK=$(awk "BEGIN {print ($SERVER_MBPS < 10000) ? 1 : 0}")
            if [[ "$SERVER_CHECK" == "1" ]]; then
                printf "  ${DIM}(server: %s)${NC}" "$(format_speed $SERVER_MBPS)"
            fi
        fi
        printf "\n"
    else
        echo -e "  ${YELLOW}Upload failed${NC}"
    fi
else
    echo -e "  ${YELLOW}Upload failed${NC}"
fi
echo ""

# =============================================================================
# Summary
# =============================================================================
echo -e "${DIM}---${NC}"
echo -e "${DIM}Tip: Use --force gateway|direct|tunnel to test different routing paths${NC}"
