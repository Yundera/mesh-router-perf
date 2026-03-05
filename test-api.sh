#!/bin/bash
# API Test Script for mesh-router-perf
# Tests all endpoints: HTTP, WebSocket (native), WebSocket (polling), Socket.IO

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; ((PASS++)); }
log_fail() { echo -e "${RED}✗ FAIL${NC}: $1 - $2"; ((FAIL++)); }
log_test() { echo -e "${YELLOW}Testing${NC}: $1"; }

# =============================================================================
# HTTP Endpoints
# =============================================================================
echo ""
echo "============================================="
echo "HTTP Endpoints"
echo "============================================="

# Health
log_test "GET /health"
if RESP=$(curl -sf "$BASE_URL/health" 2>/dev/null); then
    log_pass "/health"
else
    log_fail "/health" "request failed"
fi

# Echo GET
log_test "GET /echo"
RESP=$(curl -sf "$BASE_URL/echo" 2>/dev/null || echo "")
if [ -n "$RESP" ] && echo "$RESP" | grep -q '"method":"GET"'; then
    log_pass "GET /echo"
else
    log_fail "GET /echo" "unexpected response: $RESP"
fi

# Echo POST
log_test "POST /echo"
RESP=$(curl -sf -X POST -H "Content-Type: application/json" -d '{"test":"data"}' "$BASE_URL/echo" 2>/dev/null || echo "")
if [ -n "$RESP" ] && echo "$RESP" | grep -q '"test":"data"'; then
    log_pass "POST /echo"
else
    log_fail "POST /echo" "unexpected response: $RESP"
fi

# Delay
log_test "GET /delay/100"
START=$(date +%s%N)
RESP=$(curl -sf "$BASE_URL/delay/100" 2>/dev/null || echo "")
END=$(date +%s%N)
ELAPSED=$(( (END - START) / 1000000 ))
if [ "$ELAPSED" -ge 90 ]; then
    log_pass "/delay/100 (${ELAPSED}ms)"
else
    log_fail "/delay/100" "took ${ELAPSED}ms, expected >= 90ms"
fi

# Download (info endpoint)
log_test "GET /download"
RESP=$(curl -sf "$BASE_URL/download" 2>/dev/null || echo "")
if [ -n "$RESP" ] && echo "$RESP" | grep -q '"status":"ok"'; then
    log_pass "/download info"
else
    log_fail "/download info" "unexpected response"
fi

# =============================================================================
# Native WebSocket (/ws)
# =============================================================================
echo ""
echo "============================================="
echo "Native WebSocket (/ws)"
echo "============================================="

log_test "WebSocket /ws echo"
WS_URL=$(echo "$BASE_URL" | sed 's/http/ws/' | sed 's/https/wss/')
RESP=$(NODE_PATH=/usr/lib/node_modules node -e "
const WebSocket = require('ws');
const ws = new WebSocket('$WS_URL/ws');
ws.on('open', () => ws.send(JSON.stringify({msg:'test'})));
ws.on('message', (d) => console.log(d.toString()));
setTimeout(() => process.exit(0), 2000);
" 2>&1 || echo "")
if echo "$RESP" | grep -q 'connected' && echo "$RESP" | grep -q 'msg'; then
    log_pass "WebSocket /ws"
else
    log_fail "WebSocket /ws" "unexpected: $RESP"
fi

# =============================================================================
# WS-Polling (/ws-polling)
# =============================================================================
echo ""
echo "============================================="
echo "WS-Polling (/ws-polling)"
echo "============================================="

log_test "GET /ws-polling/poll (handshake)"
RESP=$(curl -sf "$BASE_URL/ws-polling/poll?transport=polling" 2>/dev/null || echo "")
if [ -n "$RESP" ] && echo "$RESP" | grep -q '"sid"'; then
    SID=$(echo "$RESP" | sed -n 's/.*"sid":"\([^"]*\)".*/\1/p')
    log_pass "/ws-polling handshake (sid: ${SID:0:8}...)"
else
    log_fail "/ws-polling handshake" "no session ID"
fi

# =============================================================================
# Socket.IO (/socket.io)
# =============================================================================
echo ""
echo "============================================="
echo "Socket.IO (/socket.io)"
echo "============================================="

log_test "GET /socket.io/ (handshake)"
RESP=$(curl -sf "$BASE_URL/socket.io/?EIO=4&transport=polling" 2>/dev/null || echo "")
if [ -n "$RESP" ] && echo "$RESP" | grep -q 'sid'; then
    SID=$(echo "$RESP" | sed -n 's/.*"sid":"\([^"]*\)".*/\1/p')
    log_pass "Socket.IO handshake (sid: ${SID:0:8}...)"
else
    log_fail "Socket.IO handshake" "no session ID"
fi

# Socket.IO WebSocket upgrade test
log_test "Socket.IO WebSocket"
WS_URL=$(echo "$BASE_URL" | sed 's/http/ws/' | sed 's/https/wss/')
RESP=$(NODE_PATH=/usr/lib/node_modules node -e "
const WebSocket = require('ws');
const ws = new WebSocket('$WS_URL/socket.io/?EIO=4&transport=websocket');
ws.on('open', () => { console.log('ws-open'); setTimeout(() => process.exit(0), 500); });
ws.on('error', (e) => { console.log('err:', e.message); process.exit(1); });
setTimeout(() => process.exit(1), 5000);
" 2>&1 || echo "connection-failed")
if echo "$RESP" | grep -q 'ws-open'; then
    log_pass "Socket.IO WebSocket"
else
    log_fail "Socket.IO WebSocket" "connection failed: $RESP"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================="
echo "Summary"
echo "============================================="
TOTAL=$((PASS + FAIL))
echo -e "Passed: ${GREEN}${PASS}${NC}/${TOTAL}"
echo -e "Failed: ${RED}${FAIL}${NC}/${TOTAL}"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
