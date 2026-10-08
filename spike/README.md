# spike/ — 기술검증 코드 (참고 구현 + 진짜 마우스 테스트 도구)

> 2026-10-07 기술검증에 쓴 코드입니다. **제품 코드가 아니라 참고 구현**입니다.
> v2는 이 코드를 TypeScript 모듈로 새로 짜되, 여기 담긴 **동작과 "왜 그렇게 했는지" 주석(함정 대응)**은 그대로 이어가세요.
> 결과 요약은 [`docs/SPIKE_REPORT.md`](../docs/SPIKE_REPORT.md).

## 구성

| 폴더 | 내용 |
|---|---|
| `extension/` | MV3 익스텐션. `content.js`(하이라이트·무장·드래그 시작·스냅샷), `background.js`(번호표 보관소·화면 캡처·이미지/폰트 가져오기·Referer 규칙), `sidepanel.*`(드롭 받기·박스·렌더·검증 로그) |
| `harness/` | 가상 화면 + 실제 Chromium + xdotool 로 **진짜 OS 마우스 드래그**를 재현하는 Python 테스트 도구 |
| `testsite/` | 일부러 까다롭게 만든 로컬 테스트 페이지 (127.0.0.1:8765) |
| `out/` | 실행 결과(스크린샷, `reports.jsonl`, 로그). git 에 올리지 않음 |

### extension 의 메시지 흐름 (요약)
```
content ──dragstart──▶ dataTransfer: application/x-web-collage = {id, url, title, kind, ...}  (번호표)
content ──clip:begin {id, rect, viewport}──▶ background  (90ms 뒤 captureVisibleTab)
content ──clip:put {id, clip}──────────────▶ background  (setTimeout 0 뒤 스냅샷 계산)
panel   ──clip:get {id}────────────────────▶ background  → clip (+ refShot, 대체 이미지)
panel   ──localize {urls, referer}─────────▶ background  → {url: dataUrl}   (실패 시 DNR 로 Referer 설정해 재시도)
content ──clip:end {id, dropEffect}────────▶ background
panel   ──runtime.connect('panel')─────────▶ background  → storage.local.scrapEnabled = true/false
```

## 준비 (클라우드 컨테이너 기준, 1회)

```bash
apt-get install -y xdotool                      # Xvfb, ImageMagick(import), ffmpeg 가 없으면 같이: xvfb imagemagick ffmpeg
pip install --break-system-packages websocket-client pillow
```
- **Chromium**: Claude Code 클라우드 환경에는 Playwright 용 Chromium 이 `/opt/pw-browsers/chromium-*/chrome-linux/chrome` 에 있다(자동 탐색). 다르면 `CHROME_BIN=/경로` 지정.
  - 주의: 정식 Google Chrome 137+ 는 `--load-extension` 을 무시한다. **Chromium** 을 쓸 것.
- **외부 사이트 테스트**: 환경에 `HTTPS_PROXY` 가 있으면 자동으로 `--proxy-server` 로 넘긴다. 프록시 CA 는 NSS 저장소(`~/.pki/nssdb`)에 등록되어 있어야 한다. 네트워크가 막힌 환경이면 로컬 테스트만 가능.

## 실행

```bash
bash spike/harness/run_local.sh            # 로컬 회귀 테스트 전체 (외부망 불필요, 4~5분)

# 개별 실행
python3 spike/harness/boot.py              # 브라우저 띄우기 + 인포바 닫기 + Alt+Shift+K 로 패널 열기 + 패널 폭 620px
python3 spike/harness/t_core.py            # 핵심: 카드 → Box 1 (드래그 도중/후 스크린샷 저장)
python3 spike/harness/t_edge1.py           # 이미지·링크·핫링크 이미지·표·Alt+휠
python3 spike/harness/t_edge4.py           # 드래그 방지 사이트, SPA(Shadow DOM·canvas·iframe·폼)
python3 spike/harness/t_edge6.py           # 큰 표(요소 7천 개), dataTransfer 5MB/40MB
python3 spike/harness/t_edge8.py           # 패널 안 순서 바꾸기
python3 spike/harness/t_edge9.py           # Alt 선택 후 끌기, 페이지 안 버튼으로 패널 열기
python3 spike/harness/t_sel_final.py       # 텍스트 선택 2가지 + 요소 드래그 회귀
python3 spike/harness/t_mdn2.py            # (외부망) MDN 라이브 예제를 손잡이로 끌기
python3 spike/harness/real.py [이름...]     # (외부망) 실제 사이트 묶음. 이름 없으면 전부
python3 spike/harness/showcase.py          # (외부망) 시연 녹화 → out/web-collage-drag-demo.mp4

EXT=/path/to/.output/chrome-mv3 python3 spike/harness/boot.py   # 다른 빌드(예: v2 WXT 빌드) 로드
```

결과 읽기: 각 드롭마다 한 줄 요약이 출력된다.
```
[케이스] types=[...] custom=True kind=element tag=article ... snap=43ms nodes=11 drop→visible=31ms img={...}→{...} fonts={...}
```
`custom=True` 면 번호표가 도착한 것, `NO DROP REPORT` 면 드롭이 패널에 안 들어온 것이다.

## 하네스가 하는 일과 함정 (꼭 읽기)

| 주제 | 내용 |
|---|---|
| 진짜 입력 | `lab.drag()` 는 xdotool 로 이동 → 누름 → 28단계 이동 → 놓기. CDP `Input.dispatchDragEvent` 나 Playwright 드래그는 **문서 경계(페이지→패널)를 못 넘으므로** 쓰지 않는다 |
| 좌표 보정 | 화면 좌표 ↔ 문서 좌표 차이는 `lab.calibrate()` 가 마우스를 실제로 움직여 `mousemove` 의 clientX/Y 로 측정. 하드코딩 금지 (`Session` 사용) |
| 창 관리자 없음 | Xvfb 에는 창 관리자가 없어서 **탭 줄/툴바를 누르고 끌면 창 전체가 끌려간다.** 누르는 점이 화면 위쪽(뷰포트 밖)으로 나가지 않게 할 것. 끌려가면 `lab.reset_window()` |
| 키보드 포커스 | 키 입력은 포커스된 문서로 간다. 드롭 뒤에는 보통 **패널에 포커스**가 있어 페이지가 keydown 을 못 받는다(제품 설계에도 반영: Alt 는 마우스 이벤트에서 읽기) |
| 인포바 | `--no-sandbox`·API 키 경고 인포바 2개를 (1572,112) 두 번 클릭해 닫는다. 화면 크기 1600×1000 기준 |
| 패널 열기 | Alt+Shift+K (`_execute_action` 단축키) → `openPanelOnActionClick` 으로 사이드 패널 |
| 패널 폭 | 패널 왼쪽 경계(약 x=1222)를 마우스로 끌어 620px 로 넓힌다 (코드로 폭 지정 불가) |
| 테스트 훅 | 요소에 `data-wc-target` 속성을 붙이면 content script 가 그 요소를 대상으로 고른다(사람의 Alt+휠 선택을 대신함). `<html data-wc-pad="N">` 은 dataTransfer 에 N바이트 덧붙임 |
| 결과 수집 | 패널·background 가 `REPORT_URL`(http://127.0.0.1:8765/report)로 JSON 을 보내고 `out/reports.jsonl` 에 쌓인다 |
| CDP 대상 | `http://127.0.0.1:9222/json/list` 에서 사이드 패널은 `chrome-extension://…/sidepanel.html` page, background 는 service_worker 로 보인다(`clips` 같은 전역을 직접 조회 가능) |
| 고정 헤더 | 사이트의 고정 헤더 아래(뷰포트 y≥110)를 누르도록 `real.py` 의 `POINT` 가 점을 고른다 |
| 부드러운 스크롤 | `scroll-behavior: smooth` 사이트는 `scrollIntoView` 직후 좌표가 틀리므로 1~2초 기다린 뒤 측정 |
| 사이트 변경 | 네이버 메인처럼 계속 다시 그려지는 영역은 표시해 둔 대상이 사라질 수 있다 → 안정적인 대상 선택 |

## v2 에 하네스 붙이기
- v2 빌드 폴더를 `EXT=` 로 넘기면 같은 방식으로 로드된다.
- 하네스는 패널 DOM 의 `.box`, `.blocks`, `.block`, `.block-head`, `.new-box` 와 `window.__wcResults`, `REPORT_URL` 보고에 기대고 있다.
  v2 패널에 같은 의미의 `data-testid` 를 두고 `runner.py` 셀렉터를 바꾸거나, 테스트 빌드에서만 같은 보고 훅을 켜도록 맞출 것 ([PLAN M0](../docs/PLAN.md#m0-프로젝트-세팅과-기준선)).
