#!/bin/bash

# mesh-router-perf benchmark runner
# Usage: ./run.sh [scenario] [options]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment if exists
if [ -f "$ROOT_DIR/.env" ]; then
    export $(grep -v '^#' "$ROOT_DIR/.env" | xargs)
fi

# Ensure reports directory exists
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/reports}"
mkdir -p "$REPORT_DIR"
export REPORT_DIR

# Available scenarios
declare -A SCENARIOS
SCENARIOS["latency"]="scenarios/http-latency.js"
SCENARIOS["websocket"]="scenarios/websocket.js"
SCENARIOS["download"]="scenarios/file-download.js"
SCENARIOS["upload"]="scenarios/file-upload.js"
SCENARIOS["all"]="scenarios/full-suite.js"

# Show help
show_help() {
    echo "mesh-router-perf Benchmark Runner"
    echo ""
    echo "Usage: $0 <scenario> [k6 options]"
    echo ""
    echo "Scenarios:"
    echo "  latency     - HTTP latency benchmark (echo endpoint)"
    echo "  websocket   - WebSocket connection and echo benchmark"
    echo "  download    - File download bandwidth test"
    echo "  upload      - File upload bandwidth test"
    echo "  all         - Run full benchmark suite"
    echo ""
    echo "Examples:"
    echo "  $0 latency"
    echo "  $0 latency --vus 20 --duration 2m"
    echo "  $0 download --env DOWNLOAD_SIZE=500mb"
    echo "  $0 all"
    echo ""
    echo "Environment variables:"
    echo "  TARGET_DIRECT_SERVICE  - Direct service URL (default: http://localhost:3000)"
    echo "  TARGET_DIRECT_PCS      - PCS nginx URL"
    echo "  TARGET_GATEWAY         - Mesh-router gateway URL"
    echo "  TARGET_CF_WORKER       - Cloudflare Worker URL"
    echo "  K6_VUS                 - Virtual users (default: 10)"
    echo "  K6_DURATION            - Test duration (default: 60s)"
    echo "  REPORT_DIR             - Report output directory (default: ./reports)"
    echo ""
}

# Check if k6 is installed
check_k6() {
    if ! command -v k6 &> /dev/null; then
        echo "Error: k6 is not installed"
        echo ""
        echo "Install k6:"
        echo "  macOS:   brew install k6"
        echo "  Linux:   sudo snap install k6"
        echo "  Docker:  docker run -i grafana/k6 run - <script.js"
        echo ""
        echo "See: https://k6.io/docs/getting-started/installation/"
        exit 1
    fi
}

# Main
main() {
    if [ $# -eq 0 ] || [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
        show_help
        exit 0
    fi

    check_k6

    SCENARIO="$1"
    shift

    if [ -z "${SCENARIOS[$SCENARIO]}" ]; then
        echo "Error: Unknown scenario '$SCENARIO'"
        echo ""
        echo "Available scenarios: ${!SCENARIOS[*]}"
        exit 1
    fi

    SCRIPT_PATH="$SCRIPT_DIR/${SCENARIOS[$SCENARIO]}"

    echo "========================================="
    echo "Running: $SCENARIO"
    echo "Script:  $SCRIPT_PATH"
    echo "Reports: $REPORT_DIR"
    echo "========================================="
    echo ""

    # Run k6 with any additional arguments
    k6 run "$SCRIPT_PATH" "$@"

    echo ""
    echo "========================================="
    echo "Benchmark complete!"
    echo "Report saved to: $REPORT_DIR/"
    echo "========================================="
}

main "$@"
