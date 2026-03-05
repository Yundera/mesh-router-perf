#!/bin/bash
# API Test Script for mesh-router-perf
# Tests all endpoints: HTTP, Native WebSocket, Socket.IO

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; ((PASS++)); }
log_fail() { echo -e "${RED}✗ FAIL${NC}: $1 - $2"; ((FAIL++)); }
log_test() { echo -e "${YELLOW}Testing${NC}: $1"; }

# =============================================================================
# Route Trace
# =============================================================================
echo ""
echo "============================================="
echo "Route Information"
echo "============================================="
echo -e "${CYAN}Target${NC}: $BASE_URL"

# Get route trace
ROUTE=$(curl -s -D- -o /dev/null -H "X-Mesh-Trace: 1" "$BASE_URL/" 2>&1 | grep -i "x-mesh-route" | cut -d: -f2- | tr -d ' \r')
if [ -n "$ROUTE" ]; then
    echo -e "${CYAN}Route${NC}: $ROUTE"
else
    echo -e "${CYAN}Route${NC}: (no x-mesh-route header)"
fi

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

WS_URL=$(echo "$BASE_URL" | sed 's/http/ws/' | sed 's/https/wss/')

# Test 1: Connection + Welcome message
log_test "WebSocket /ws connect"
RESP=$(NODE_PATH=/usr/lib/node_modules node -e "
const WebSocket = require('ws');
const start = Date.now();
const ws = new WebSocket('$WS_URL/ws');
ws.on('open', () => console.log('OPEN:' + (Date.now()-start) + 'ms'));
ws.on('message', (d) => {
  const msg = d.toString();
  if (msg.includes('connected')) { console.log('WELCOME'); ws.close(); process.exit(0); }
});
ws.on('error', (e) => { console.log('ERROR:' + e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 5000);
" 2>&1 || echo "FAILED")
if echo "$RESP" | grep -q 'WELCOME'; then
    LATENCY=$(echo "$RESP" | grep -o 'OPEN:[0-9]*ms' | cut -d: -f2)
    log_pass "WebSocket /ws connect ($LATENCY)"
else
    log_fail "WebSocket /ws connect" "$RESP"
fi

# Test 2: Message echo round-trip
log_test "WebSocket /ws echo RTT"
RESP=$(NODE_PATH=/usr/lib/node_modules node -e "
const WebSocket = require('ws');
const ws = new WebSocket('$WS_URL/ws');
let welcomed = false;
ws.on('open', () => {});
ws.on('message', (d) => {
  const msg = d.toString();
  if (!welcomed && msg.includes('connected')) {
    welcomed = true;
    ws.send(JSON.stringify({test:'echo-' + Date.now()}));
    return;
  }
  if (msg.includes('echo-')) {
    console.log('ECHO_OK');
    ws.close();
    process.exit(0);
  }
});
ws.on('error', (e) => { console.log('ERROR:' + e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 5000);
" 2>&1 || echo "FAILED")
if echo "$RESP" | grep -q 'ECHO_OK'; then
    log_pass "WebSocket /ws echo RTT"
else
    log_fail "WebSocket /ws echo RTT" "$RESP"
fi

# Test 3: Multiple messages stability
log_test "WebSocket /ws multi-message (5x)"
RESP=$(NODE_PATH=/usr/lib/node_modules node -e "
const WebSocket = require('ws');
const ws = new WebSocket('$WS_URL/ws');
let count = 0, welcomed = false;
ws.on('message', (d) => {
  const msg = d.toString();
  if (!welcomed && msg.includes('connected')) {
    welcomed = true;
    for (let i = 0; i < 5; i++) ws.send(JSON.stringify({seq: i}));
    return;
  }
  if (msg.includes('seq')) count++;
  if (count >= 5) { console.log('MULTI_OK:' + count); ws.close(); process.exit(0); }
});
ws.on('error', (e) => { console.log('ERROR:' + e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT:' + count + '/5'); process.exit(1); }, 5000);
" 2>&1 || echo "FAILED")
if echo "$RESP" | grep -q 'MULTI_OK'; then
    log_pass "WebSocket /ws multi-message"
else
    log_fail "WebSocket /ws multi-message" "$RESP"
fi

# Test 4: Keep-alive (connection held for 3 seconds)
log_test "WebSocket /ws keep-alive (3s)"
RESP=$(NODE_PATH=/usr/lib/node_modules node -e "
const WebSocket = require('ws');
const ws = new WebSocket('$WS_URL/ws');
let msgCount = 0;
ws.on('message', () => msgCount++);
ws.on('open', () => {
  setTimeout(() => ws.send(JSON.stringify({ping:1})), 1000);
  setTimeout(() => ws.send(JSON.stringify({ping:2})), 2000);
  setTimeout(() => {
    if (msgCount >= 3) { console.log('KEEPALIVE_OK:' + msgCount); ws.close(); process.exit(0); }
    else { console.log('FAIL:' + msgCount); process.exit(1); }
  }, 3000);
});
ws.on('error', (e) => { console.log('ERROR:' + e.message); process.exit(1); });
" 2>&1 || echo "FAILED")
if echo "$RESP" | grep -q 'KEEPALIVE_OK'; then
    log_pass "WebSocket /ws keep-alive"
else
    log_fail "WebSocket /ws keep-alive" "$RESP"
fi

# Test 5: Message burst (10 rapid messages)
log_test "WebSocket /ws burst (10x rapid)"
RESP=$(NODE_PATH=/usr/lib/node_modules node -e "
const WebSocket = require('ws');
const ws = new WebSocket('$WS_URL/ws');
let count = 0, welcomed = false;
ws.on('message', (d) => {
  if (!welcomed) { welcomed = true; for(let i=0;i<10;i++) ws.send(JSON.stringify({seq:i})); return; }
  count++;
  if (count >= 10) { console.log('BURST_OK:' + count); ws.close(); process.exit(0); }
});
ws.on('error', (e) => { console.log('ERROR:' + e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT:' + count); process.exit(1); }, 5000);
" 2>&1 || echo "FAILED")
if echo "$RESP" | grep -q 'BURST_OK'; then
    log_pass "WebSocket /ws burst"
else
    log_fail "WebSocket /ws burst" "$RESP"
fi

# =============================================================================
# Socket.IO (/socket.io)
# =============================================================================
echo ""
echo "============================================="
echo "Socket.IO (/socket.io)"
echo "============================================="

# Test 1: Polling handshake
log_test "Socket.IO polling handshake"
RESP=$(curl -sf "$BASE_URL/socket.io/?EIO=4&transport=polling" 2>/dev/null || echo "")
if [ -n "$RESP" ] && echo "$RESP" | grep -q 'sid'; then
    SID=$(echo "$RESP" | sed -n 's/.*"sid":"\([^"]*\)".*/\1/p')
    UPGRADES=$(echo "$RESP" | grep -o '"upgrades":\[[^]]*\]')
    log_pass "Socket.IO polling (sid: ${SID:0:8}..., $UPGRADES)"
else
    log_fail "Socket.IO polling" "no session ID"
fi

# Test 2: Connect + welcome event (using socket.io-client)
log_test "Socket.IO connect + welcome"
RESP=$(NODE_PATH=/usr/lib/node_modules node -e "
const { io } = require('socket.io-client');
const start = Date.now();
const socket = io('$BASE_URL', { transports: ['websocket'] });
socket.on('welcome', (data) => {
  console.log('WELCOME_OK:' + (Date.now()-start) + 'ms:' + data.type);
  socket.disconnect();
  process.exit(0);
});
socket.on('connect_error', (e) => { console.log('ERROR:' + e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 5000);
" 2>&1 || echo "FAILED")
if echo "$RESP" | grep -q 'WELCOME_OK'; then
    LATENCY=$(echo "$RESP" | grep -o 'WELCOME_OK:[0-9]*ms' | cut -d: -f2)
    log_pass "Socket.IO connect + welcome ($LATENCY)"
else
    log_fail "Socket.IO connect + welcome" "$RESP"
fi

# Test 3: Socket.IO client library (polling → upgrade)
log_test "Socket.IO upgrade polling→websocket"
RESP=$(NODE_PATH=/usr/lib/node_modules node -e "
const { io } = require('socket.io-client');
const start = Date.now();
const socket = io('$BASE_URL', { transports: ['polling', 'websocket'] });
socket.io.engine.on('upgrade', (transport) => {
  console.log('UPGRADED:' + transport.name + ':' + (Date.now()-start) + 'ms');
  socket.disconnect();
  process.exit(0);
});
socket.on('connect', () => console.log('CONNECTED:' + socket.io.engine.transport.name));
socket.on('connect_error', (e) => { console.log('ERROR:' + e.message); process.exit(1); });
setTimeout(() => {
  console.log('TIMEOUT:transport=' + (socket.io.engine?.transport?.name || 'none'));
  process.exit(1);
}, 8000);
" 2>&1 || echo "FAILED")
if echo "$RESP" | grep -q 'UPGRADED:websocket'; then
    LATENCY=$(echo "$RESP" | grep -o 'UPGRADED:websocket:[0-9]*ms' | cut -d: -f3)
    log_pass "Socket.IO upgrade ($LATENCY)"
else
    log_fail "Socket.IO upgrade" "$RESP"
fi

# Test 4: Socket.IO echo event
log_test "Socket.IO echo event"
RESP=$(NODE_PATH=/usr/lib/node_modules node -e "
const { io } = require('socket.io-client');
const socket = io('$BASE_URL', { transports: ['websocket'] });
socket.on('connect', () => {
  socket.emit('echo', {test: 'data-' + Date.now()}, (response) => {
    if (response && response.echo && response.echo.test) {
      console.log('ECHO_OK');
      socket.disconnect();
      process.exit(0);
    }
  });
});
socket.on('connect_error', (e) => { console.log('ERROR:' + e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 5000);
" 2>&1 || echo "FAILED")
if echo "$RESP" | grep -q 'ECHO_OK'; then
    log_pass "Socket.IO echo event"
else
    log_fail "Socket.IO echo event" "$RESP"
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
