#!/usr/bin/env bash
# 가상 화면(Xvfb) + 테스트 서버 + 실제 Chromium(익스텐션 로드)을 띄운다.
# 사용: bash spike/harness/start.sh [처음 열 URL]
# 환경변수:
#   EXT         로드할 익스텐션 폴더 (기본: spike/extension)
#   CHROME_BIN  Chromium 실행 파일 (기본: /opt/pw-browsers/chromium-*/chrome-linux/chrome 자동 탐색)
#   HTTPS_PROXY 있으면 Chromium 에 --proxy-server 로 전달 (클라우드 컨테이너의 외부망 프록시)
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="$(cd "$HERE/.." && pwd)"            # = spike/
OUT="${WC_OUT:-$BASE/out}"
EXT="${EXT:-$BASE/extension}"
CHROME="${CHROME_BIN:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome 2>/dev/null | sort | tail -1)}"
mkdir -p "$OUT"
export DISPLAY=:99

if [ -z "$CHROME" ] || [ ! -x "$CHROME" ]; then
  echo "Chromium 을 찾지 못했습니다. CHROME_BIN 환경변수로 경로를 지정하세요." >&2
  exit 1
fi
for bin in Xvfb xdotool import curl python3; do
  command -v "$bin" >/dev/null || { echo "필요한 프로그램 없음: $bin (spike/README.md 의 준비 단계 참고)" >&2; exit 1; }
done

if ! pgrep -f "Xvfb :99" >/dev/null; then
  setsid nohup Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp >"$OUT/xvfb.log" 2>&1 &
  sleep 1
fi
# 테스트 서버 (127.0.0.1:8765): 다른 위치의 서버가 떠 있으면 내리고 이 폴더 기준으로 다시 띄움
pkill -f "harness/server.py" 2>/dev/null; sleep 0.3
setsid nohup python3 "$HERE/server.py" "$BASE/testsite" "$OUT" >"$OUT/server.out" 2>&1 &
sleep 0.5

PROXY_FLAG=()
if [ -n "${HTTPS_PROXY:-}" ]; then PROXY_FLAG=(--proxy-server="$HTTPS_PROXY"); fi

# 이 하네스가 띄운 Chromium 만 종료 (경로 형태와 무관하게 디버깅 포트로 식별)
pkill -f -- "--remote-debugging-port=9222" 2>/dev/null; sleep 1
rm -rf "$OUT/profile"
setsid nohup "$CHROME" \
  --user-data-dir="$OUT/profile" \
  --no-sandbox --no-first-run --no-default-browser-check \
  --disable-extensions-except="$EXT" --load-extension="$EXT" \
  --window-position=0,0 --window-size=1600,1000 \
  --remote-debugging-port=9222 --remote-allow-origins='*' \
  "${PROXY_FLAG[@]}" \
  --lang=ko-KR --force-device-scale-factor=1 \
  --password-store=basic --disable-features=Translate,OptimizationHints,MediaRouter \
  "${1:-http://127.0.0.1:8765/index.html}" >"$OUT/chrome.log" 2>&1 &
for i in $(seq 1 40); do
  curl -s http://127.0.0.1:9222/json/version >/dev/null && break
  sleep 0.25
done
curl -s http://127.0.0.1:9222/json/version | head -3
