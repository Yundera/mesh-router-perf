#!/bin/bash
# Unified Network Benchmark Script for mesh-router-perf
# Usage: ./benchmark.sh <domain> [options]
#
# Examples:
#   ./benchmark.sh perf-wisera.inojob.com
#   ./benchmark.sh perf-wisera.inojob.com --samples 100 --iterations 10
#   ./benchmark.sh perf-alice.nsl.sh --force gateway --payload 50

set -e

# =============================================================================
# Argument Parsing
# =============================================================================
DOMAIN=""
FORCE_ROUTE=""
PAYLOAD_MB=50
LATENCY_SAMPLES=20
ITERATIONS=1

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
        --iterations|--loops)
            ITERATIONS="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 <domain> [options]"
            echo ""
            echo "Arguments:"
            echo "  domain                  Target domain (e.g., perf-wisera.inojob.com)"
            echo ""
            echo "Options:"
            echo "  --force <route>         Force routing path: gateway, direct, or tunnel"
            echo "  --payload <MB>          Payload size for upload/download (default: 50, max: 100)"
            echo "  --samples <N>           Number of latency samples (default: 20)"
            echo "  --iterations <N>        Number of upload/download cycles (default: 1)"
            echo "  -h, --help              Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 perf-wisera.inojob.com"
            echo "  $0 perf-wisera.inojob.com --samples 100 --iterations 10"
            echo "  $0 perf-alice.nsl.sh --force gateway --payload 50"
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
    echo "Usage: $0 <domain> [options]"
    exit 1
fi

# Cap payload at 100MB (CF Worker limit)
if [[ $PAYLOAD_MB -gt 100 ]]; then
    PAYLOAD_MB=100
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
# Helper Functions
# =============================================================================
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
echo -e "${CYAN}Target:${NC}     $BASE_URL"
if [[ -n "$FORCE_ROUTE" ]]; then
    echo -e "${CYAN}Force:${NC}      $FORCE_ROUTE"
fi
echo -e "${CYAN}Payload:${NC}    ${PAYLOAD_MB}MB"
echo -e "${CYAN}Samples:${NC}    $LATENCY_SAMPLES (latency)"
if [[ $ITERATIONS -gt 1 ]]; then
    echo -e "${CYAN}Iterations:${NC} $ITERATIONS (upload/download)"
fi
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
    ROUTE_DISPLAY=$(echo "$ROUTE" | sed 's/,/ -> /g')
    echo -e "${CYAN}Route:${NC}      $ROUTE_DISPLAY"
else
    echo -e "${CYAN}Route:${NC}      ${DIM}(no x-mesh-route header)${NC}"
fi
echo ""

# =============================================================================
# Latency Test
# =============================================================================
echo -e "${BOLD}Latency${NC} ${DIM}(HTTP round-trip to /echo, $LATENCY_SAMPLES samples)${NC}"

declare -a LATENCIES
ERRORS=0

for i in $(seq 1 $LATENCY_SAMPLES); do
    TIMING=$(curl -s -o /dev/null -w "%{time_total}" $CURL_HEADERS "$BASE_URL/echo" 2>/dev/null || echo "error")

    if [[ "$TIMING" == "error" ]]; then
        ((ERRORS++))
    else
        MS=$(awk "BEGIN {printf \"%.1f\", $TIMING * 1000}")
        LATENCIES+=("$MS")
    fi
done

if [[ ${#LATENCIES[@]} -gt 0 ]]; then
    IFS=$'\n' SORTED=($(printf '%s\n' "${LATENCIES[@]}" | sort -n)); unset IFS

    SUM=0
    for lat in "${LATENCIES[@]}"; do
        SUM=$(awk "BEGIN {print $SUM + $lat}")
    done
    AVG=$(awk "BEGIN {printf \"%.1f\", $SUM / ${#LATENCIES[@]}}")
    MIN="${SORTED[0]}"
    MAX="${SORTED[-1]}"

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
# Map payload size to available file
if [[ $PAYLOAD_MB -le 50 ]]; then
    DL_SIZE="50mb"
elif [[ $PAYLOAD_MB -le 100 ]]; then
    DL_SIZE="50mb"
else
    DL_SIZE="200mb"
fi

echo -e "${BOLD}Download${NC} ${DIM}($DL_SIZE x $ITERATIONS iterations)${NC}"

# Check if file exists first
DL_CHECK=$(curl -s $CURL_HEADERS "$BASE_URL/download/$DL_SIZE" -w "%{http_code}" -o /dev/null --max-time 5 2>/dev/null || echo "000")

if [[ "$DL_CHECK" != "200" ]]; then
    echo -e "  ${YELLOW}File not available (HTTP $DL_CHECK) - run 'curl -X POST $BASE_URL/generate'${NC}"
else
    declare -a DL_SPEEDS
    declare -a DL_TIMES
    TOTAL_BYTES=0

    for i in $(seq 1 $ITERATIONS); do
        DL_RESULT=$(curl -s -o /dev/null -w "%{size_download} %{time_total} %{time_starttransfer}" \
            $CURL_HEADERS "$BASE_URL/download/$DL_SIZE" 2>/dev/null || echo "0 0 0")

        read bytes time ttfb <<< "$DL_RESULT"

        if [[ "$bytes" -gt 0 && "$time" != "0" ]]; then
            MBPS=$(awk "BEGIN {printf \"%.1f\", $bytes * 8 / $time / 1000000}")
            TIME_MS=$(awk "BEGIN {printf \"%.0f\", $time * 1000}")
            DL_SPEEDS+=("$MBPS")
            DL_TIMES+=("$TIME_MS")
            TOTAL_BYTES=$((TOTAL_BYTES + bytes))
        fi
    done

    if [[ ${#DL_SPEEDS[@]} -gt 0 ]]; then
        # Calculate averages
        SUM_SPEED=0
        SUM_TIME=0
        for s in "${DL_SPEEDS[@]}"; do SUM_SPEED=$(awk "BEGIN {print $SUM_SPEED + $s}"); done
        for t in "${DL_TIMES[@]}"; do SUM_TIME=$(awk "BEGIN {print $SUM_TIME + $t}"); done

        AVG_SPEED=$(awk "BEGIN {printf \"%.1f\", $SUM_SPEED / ${#DL_SPEEDS[@]}}")
        AVG_TIME=$(awk "BEGIN {printf \"%.0f\", $SUM_TIME / ${#DL_TIMES[@]}}")

        # Min/Max speed
        IFS=$'\n' SORTED_SPEEDS=($(printf '%s\n' "${DL_SPEEDS[@]}" | sort -n)); unset IFS
        MIN_SPEED="${SORTED_SPEEDS[0]}"
        MAX_SPEED="${SORTED_SPEEDS[-1]}"

        printf "  ${GREEN}Avg:${NC} %s  ${DIM}|${NC}  Min: %s  Max: %s  Time: %s\n" \
            "$(format_speed $AVG_SPEED)" "$(format_speed $MIN_SPEED)" "$(format_speed $MAX_SPEED)" "$(format_time $AVG_TIME)"
        printf "  ${DIM}Total: $(format_size $TOTAL_BYTES) in $ITERATIONS iterations${NC}\n"
    else
        echo -e "  ${YELLOW}All downloads failed${NC}"
    fi
fi
echo ""

# =============================================================================
# Upload Test
# =============================================================================
echo -e "${BOLD}Upload${NC} ${DIM}(${PAYLOAD_MB}MB x $ITERATIONS iterations)${NC}"

# Create upload file once
UPLOAD_FILE="/tmp/upload_bench_$$"
dd if=/dev/urandom of="$UPLOAD_FILE" bs=1M count=$PAYLOAD_MB 2>/dev/null

declare -a UL_SPEEDS
declare -a UL_TIMES
TOTAL_BYTES=0

for i in $(seq 1 $ITERATIONS); do
    UL_RESULT=$(curl -s -X POST \
        -H "Content-Type: application/octet-stream" \
        $CURL_HEADERS \
        --data-binary "@$UPLOAD_FILE" \
        -w "%{size_upload} %{time_total}" \
        -o /dev/null \
        "$BASE_URL/upload" 2>/dev/null || echo "0 0")

    read bytes time <<< "$UL_RESULT"

    if [[ "$bytes" -gt 0 && "$time" != "0" ]]; then
        MBPS=$(awk "BEGIN {printf \"%.1f\", $bytes * 8 / $time / 1000000}")
        TIME_MS=$(awk "BEGIN {printf \"%.0f\", $time * 1000}")
        UL_SPEEDS+=("$MBPS")
        UL_TIMES+=("$TIME_MS")
        TOTAL_BYTES=$((TOTAL_BYTES + bytes))
    fi
done

rm -f "$UPLOAD_FILE"

if [[ ${#UL_SPEEDS[@]} -gt 0 ]]; then
    # Calculate averages
    SUM_SPEED=0
    SUM_TIME=0
    for s in "${UL_SPEEDS[@]}"; do SUM_SPEED=$(awk "BEGIN {print $SUM_SPEED + $s}"); done
    for t in "${UL_TIMES[@]}"; do SUM_TIME=$(awk "BEGIN {print $SUM_TIME + $t}"); done

    AVG_SPEED=$(awk "BEGIN {printf \"%.1f\", $SUM_SPEED / ${#UL_SPEEDS[@]}}")
    AVG_TIME=$(awk "BEGIN {printf \"%.0f\", $SUM_TIME / ${#UL_TIMES[@]}}")

    # Min/Max speed
    IFS=$'\n' SORTED_SPEEDS=($(printf '%s\n' "${UL_SPEEDS[@]}" | sort -n)); unset IFS
    MIN_SPEED="${SORTED_SPEEDS[0]}"
    MAX_SPEED="${SORTED_SPEEDS[-1]}"

    printf "  ${GREEN}Avg:${NC} %s  ${DIM}|${NC}  Min: %s  Max: %s  Time: %s\n" \
        "$(format_speed $AVG_SPEED)" "$(format_speed $MIN_SPEED)" "$(format_speed $MAX_SPEED)" "$(format_time $AVG_TIME)"
    printf "  ${DIM}Total: $(format_size $TOTAL_BYTES) in $ITERATIONS iterations${NC}\n"
else
    echo -e "  ${YELLOW}All uploads failed${NC}"
fi
echo ""

# =============================================================================
# Summary
# =============================================================================
echo -e "${DIM}---${NC}"
echo -e "${DIM}Tip: Use --samples 100 --iterations 10 for more accurate results${NC}"
