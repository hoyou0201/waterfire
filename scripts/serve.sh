#!/usr/bin/env bash
# 이 Mac에서 게임 서버를 띄우고 Cloudflare 터널로 인터넷에 연결한다. Ctrl+C로 둘 다 끈다.
#
#   pnpm serve
#
# - 접속 암호는 .env의 ROOM_PASSWORD (없으면 처음 실행할 때 무작위로 만든다)
# - .env에 TUNNEL_NAME이 있으면 그 이름의 터널(내 도메인)로, 없으면 임시 주소(*.trycloudflare.com)로 연결한다
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8080}"

if [ ! -f .env ]; then
  echo "ROOM_PASSWORD=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 10)" >.env
  echo "→ .env를 만들었습니다. 접속 암호는 .env의 ROOM_PASSWORD 값입니다."
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

if ! command -v cloudflared >/dev/null; then
  echo "cloudflared가 필요합니다: brew install cloudflared" >&2
  exit 1
fi

echo "→ 빌드"
pnpm install --frozen-lockfile >/dev/null
pnpm build >/dev/null

echo "→ 게임 서버 시작 (localhost:$PORT)"
PORT="$PORT" pnpm start &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null' EXIT INT TERM

for _ in $(seq 1 30); do
  curl -sf "http://localhost:$PORT/" >/dev/null && break
  sleep 0.5
done

if [ -n "${TUNNEL_NAME:-}" ]; then
  echo "→ 터널 '$TUNNEL_NAME' 연결"
  cloudflared tunnel run --url "http://localhost:$PORT" "$TUNNEL_NAME"
else
  echo "→ 임시 터널 연결. 아래 로그에 나오는 https://…trycloudflare.com 주소를 친구에게 보내세요"
  cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT"
fi
