#!/usr/bin/env bash
# Independent Mac dashboard; Nginx is LAN-accessible, read-only Python API remains loopback-only.
set -Eeuo pipefail
[[ $# -eq 0 ]] || { echo 'Usage: bash games/minecraft-ai/scripts/run-dashboard.sh' >&2; exit 2; }
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DASHBOARD="$(cd -- "$SCRIPT_DIR/../dashboard" && pwd -P)"
MINDCRAFT_NAME="${ALICE_MINDCRAFT_NAME:-mindcraft-alice}"
if [[ ! "$MINDCRAFT_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]]; then
  echo 'Invalid ALICE_MINDCRAFT_NAME' >&2; exit 2
fi
export ALICE_MINDCRAFT_NAME="$MINDCRAFT_NAME"
WEB_PORT="${ALICE_DASHBOARD_PORT:-8788}"
API_PORT="${ALICE_DASHBOARD_API_PORT:-18788}"
for port in "$WEB_PORT" "$API_PORT"; do
  [[ "$port" =~ ^[0-9]+$ ]] && ((10#$port >= 1024 && 10#$port <= 65535)) || {
    echo "Invalid port: $port" >&2; exit 2;
  }
done
[[ "$WEB_PORT" != "$API_PORT" ]] || { echo 'Web and API ports must differ' >&2; exit 2; }
for c in python3 nginx curl mktemp; do command -v "$c" >/dev/null || {
  echo "Missing $c. On Mac install Nginx with: brew install nginx" >&2; exit 1;
}; done
# Nginx's own config location determines mime.types; never overwrite system config.
NGINX_CONF="$(nginx -V 2>&1 | sed -n 's/.*--conf-path=\([^ ]*\).*/\1/p' | head -n 1)"
MIMES="${NGINX_CONF%/*}/mime.types"
[[ -f "$MIMES" ]] || { echo "Nginx mime.types missing: $MIMES" >&2; exit 1; }
case "$DASHBOARD:$MIMES" in *\"*|*\\*) echo 'Unsupported path characters' >&2; exit 1;; esac
umask 077
RUNTIME_DIR="$(mktemp -d "${TMPDIR:-/tmp}/alice-dashboard.XXXXXXXX")"
mkdir -p "$RUNTIME_DIR/logs"
API_PID=''
NGINX_STARTED=0
cleanup() {
  if (( NGINX_STARTED )); then nginx -p "$RUNTIME_DIR/" -c "$RUNTIME_DIR/nginx.conf" -s quit >/dev/null 2>&1 || true; fi
  if [[ -n "$API_PID" ]]; then kill "$API_PID" 2>/dev/null || true; wait "$API_PID" 2>/dev/null || true; fi
  rm -rf -- "$RUNTIME_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cat > "$RUNTIME_DIR/nginx.conf" <<EOF
worker_processes 1;
pid "$RUNTIME_DIR/nginx.pid";
error_log "$RUNTIME_DIR/logs/error.log" warn;
events { worker_connections 128; }
http {
  include "$MIMES";
  default_type application/octet-stream;
  access_log off;
  server {
    listen 0.0.0.0:$WEB_PORT;
    server_name _;
    root "$DASHBOARD";
    index index.html;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Content-Security-Policy "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" always;
    # Keep the existing LAN dashboard readable without login; all writes
    # require a Mac-local browser, never a remote LAN/VPN client.
    location = /api/control/command {
      allow 127.0.0.1;
      deny all;
      limit_except POST { deny all; }
      proxy_set_header Host 127.0.0.1:$API_PORT;
      proxy_pass http://127.0.0.1:$API_PORT;
      proxy_read_timeout 25s;
    }
    location = /api/control/settings {
      allow 127.0.0.1;
      deny all;
      limit_except POST { deny all; }
      proxy_set_header Host 127.0.0.1:$API_PORT;
      proxy_pass http://127.0.0.1:$API_PORT;
      proxy_read_timeout 25s;
    }
    # Export is private Bedrock behavior evidence, unlike public LAN status.
    location ~ ^/api/acceptance/ {
      allow 127.0.0.1;
      deny all;
      limit_except GET { deny all; }
      proxy_set_header Host 127.0.0.1:$API_PORT;
      proxy_pass http://127.0.0.1:$API_PORT;
      proxy_read_timeout 45s;
    }
    location /api/ {
      proxy_set_header Host 127.0.0.1:$API_PORT;
      proxy_pass http://127.0.0.1:$API_PORT;
      proxy_read_timeout 25s;
      proxy_buffering off;
    }
    location / { try_files \$uri \$uri/ /index.html; }
  }
}
EOF
nginx -p "$RUNTIME_DIR/" -c "$RUNTIME_DIR/nginx.conf" -t >/dev/null
ALICE_DASHBOARD_PORT="$WEB_PORT" ALICE_DASHBOARD_API_PORT="$API_PORT" python3 -u "$DASHBOARD/server.py" > "$RUNTIME_DIR/logs/api.log" 2>&1 &
API_PID=$!
healthy=0
for _ in {1..25}; do
  if curl -fsS --max-time 1 "http://127.0.0.1:$API_PORT/api/health" >/dev/null 2>&1; then healthy=1; break; fi
  if ! kill -0 "$API_PID" 2>/dev/null; then break; fi
  sleep .2
done
if (( !healthy )); then echo 'Alice dashboard API failed:' >&2; cat "$RUNTIME_DIR/logs/api.log" >&2; exit 1; fi
nginx -p "$RUNTIME_DIR/" -c "$RUNTIME_DIR/nginx.conf"
NGINX_STARTED=1
echo "Alice 控制台 (Mac 本机): http://127.0.0.1:$WEB_PORT"
LAN_IP=""
if command -v ipconfig >/dev/null 2>&1; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
fi
if [[ "$LAN_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Alice 控制台 (局域网): http://$LAN_IP:$WEB_PORT"
else
  echo "Alice 控制台 (局域网): http://<Mac的局域网IPv4>:$WEB_PORT"
fi
echo "Nginx 监听 0.0.0.0:${WEB_PORT}；无需登录（局域网/VPN 可到达本机的设备均可能访问日志）。"
echo "只在可信网络使用；请勿映射 ${WEB_PORT} 到公网。API 仍仅在 127.0.0.1:${API_PORT}。"
echo "仅本机可以修改行为设置；局域网设备仍只能查看数据。"
echo "Mint SSH: ${ALICE_SSH_TARGET:-tedz@192.168.0.104} | instance: $MINDCRAFT_NAME"
echo '按 Ctrl+C 仅停止控制台，不会停止 Alice 或 Minecraft。'
while kill -0 "$API_PID" 2>/dev/null; do sleep 1; done
echo 'Alice dashboard API exited unexpectedly:' >&2
cat "$RUNTIME_DIR/logs/api.log" >&2
exit 1