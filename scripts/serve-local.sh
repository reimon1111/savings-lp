#!/usr/bin/env bash
# LP を http://localhost:3002/ で配信（index.html はルート）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/lp"
PORT="${PORT:-3002}"
echo "LP: http://127.0.0.1:${PORT}/"
exec python3 -m http.server "$PORT"
