# Web Collage v2 — Claude 작업 안내

아무 웹사이트에서나 보이는 그대로의 조각을 **마우스로 끌어** 크롬 사이드 패널의 콜라주에 모으는 MV3 익스텐션.
2022년 v1([serbi2012/web-collage-frontend](https://github.com/serbi2012/web-collage-frontend))을 완전히 새로 만든다.
기술검증(spike) 통과: 페이지 → 사이드 패널 기본 드래그가 실제 Chromium + 실제 OS 마우스 입력으로 동작함(Linux).

## 먼저 읽을 것 (순서대로)
1. `docs/CONTEXT.md` — 대화 경위, 소유자 요구사항(원문 인용)
2. `docs/PLAN.md` — 계획서 본체: 아키텍처, 데이터 모델, 메시지 프로토콜, 마일스톤과 완료 기준
3. `docs/DECISIONS.md` — 결정과 **기각된 대안**
4. `docs/SPIKE_REPORT.md` — 검증 결과, 측정값, **함정 G1~G19**
5. `spike/README.md` — 참고 구현(`spike/extension`)과 진짜 마우스 테스트 도구(`spike/harness`)
6. (참고) `docs/LEGACY_ANALYSIS.md` — v1이 왜 실패했는지

## 절대 원칙
- **끌어서 스크랩이 핵심이다.** 클릭으로 담기를 주 방식으로 만들지 않는다. (소유자: "클릭하면 의미가 없어") 보조 방식으로 넣는 것도 소유자 확인 후.
- **페이지 HTML을 다시 받아오지 않는다.** 항상 사용자가 보고 있는 탭의 렌더 결과를 content script가 캡처한다.
- 드래그는 **브라우저 기본 드래그(HTML5 DnD)**. `dataTransfer`에는 번호표(`application/x-web-collage` = DragMeta)만, 스냅샷은 `dragstart` 뒤 비동기로 계산해 background를 거쳐 전달한다.
- 드래그·스냅샷 관련 변경은 **진짜 OS 마우스 E2E**(`spike/harness` 또는 이를 옮긴 `e2e/`)로 확인하기 전엔 완료가 아니다. Playwright/CDP 드래그 시뮬레이션은 페이지 → 패널 경계를 못 넘는다.
- content script는 모든 페이지·프레임에 들어간다: **프레임워크 없이 가볍게**, 스크랩 모드가 꺼져 있으면 이벤트에서 즉시 반환.
- 보안: 스냅샷에 script·on* 속성·`javascript:` URL 금지. 저장·공유된 HTML은 렌더 전 DOMPurify.

## 함정 요약 (상세: docs/SPIKE_REPORT.md §5)
| ID | 한 줄 |
|---|---|
| G1 | 버튼을 누르고 있는 동안 hover/무장 대상 고정 (안 그러면 드래그 대신 텍스트 선택) |
| G2 | 편집 가능 영역에선 크롬이 드래그를 시작하지 않음 → 하이라이트 라벨을 draggable 손잡이로 |
| G3 | 드래그 원본(손잡이)을 `dragstart` 안에서 숨기면 드래그가 취소됨 → 한 틱 뒤 숨김 |
| G4 | 패널에 포커스가 있으면 페이지는 keydown 을 못 받음 → Alt 는 마우스 이벤트의 `altKey` |
| G5 | draggable 요소 안의 선택 텍스트는 사라져 보임 → 선택과 겹치는 요소는 무장하지 않음 |
| G6 | `border-style` 이 있으면 `border-width` 도 항상 기록 (Tailwind solid+0px → 3px 테두리 버그) |
| G7 | `getComputedStyle` 은 실제 CSS 속성 목록(~380개)만 순회 (CSS 변수 수천 개 사이트에서 5.5배 차이) |
| G10 | `document_start` + `window` capture 단계 `stopImmediatePropagation` 으로 사이트의 드래그 방지 무력화 |
| G13 | `@font-face` 는 Shadow DOM 안에서 무시됨 → 패널 `document.head` 에 주입 |
| G17 | ✅ v2 수정: 헤더 위 드롭은 받지 않음, 긴 패널은 드래그 중 가장자리에서 자동 스크롤 (`src/panel/dnd.ts`) |
| G18 | ✅ v2 수정: 진행 중 조각 보관소를 IndexedDB(`clipStore`)에 (`src/bg/clip-store.ts`) |
| G22 | 원본 탭의 dragend 와 패널의 `clip:current` 순서가 뒤집힐 수 있음 → 방금 끝난 드래그도 1.5초간 진행 중으로 |
| G24 | `<body>`·`<html>` 을 그대로 복제하면 패널 innerHTML 에서 태그째 버려짐 → div 로 |
| G25 | 자식이 모두 absolute 인 목록은 높이 0 → absolute 자손 범위까지 조각·캡처 영역 확장 |

## 명령어
```bash
pnpm install                 # 의존성 (postinstall 에서 wxt prepare)
pnpm dev                     # WXT 개발 모드
pnpm build                   # 배포 빌드 → .output/chrome-mv3 + 테스트 훅 grep 검사(있으면 실패)
pnpm build:e2e               # E2E 빌드(테스트 훅 포함) → .output-e2e/chrome-mv3
pnpm typecheck               # tsc --noEmit
pnpm test                    # Vitest 단위 테스트 (tests/)
pnpm e2e                     # E2E 빌드 + 전체 회귀 (e2e/run_all.py), 실패 시 종료 코드 1

# E2E 하네스 (Windows, Python 3 + websocket-client + pillow, Chrome for Testing)
npx @puppeteer/browsers install chrome@stable --path ../.browsers   # 1회. 정식 Chrome 137+ 는 --load-extension 을 무시함
python e2e/run_all.py                  # 전체 (CDP 모드: 실제 마우스를 움직이지 않음, 창은 화면 밖)
python e2e/run_all.py t_core t_v2      # 일부만
WC_INPUT=os WC_WIN=2600,40 python e2e/run_all.py t_core   # OS 모드: 진짜 마우스(SendInput). 실행 중 커서가 움직임
python e2e/boot.py                     # 브라우저 + 패널만 띄우기
WC_REAL_CHROME=1 python e2e/run_all.py # 정식 Google Chrome(별도 임시 프로필, CDP Extensions.loadUnpacked)으로
python e2e/bench.py                    # 스냅샷 성능 (큰 표·CORE), Long Task 로 페이지 멈춤 측정
python e2e/profile_snapshot.py         # 스냅샷 CPU 프로파일 (함수별 시간)
```
- 충실도: `t_m1.py` 가 E2E 빌드 전용 `fidelity.html` 로 원본 캡처와 픽셀 비교(기준 2%, `WC_FID_MAX`), 비교 이미지는 `e2e/out/fid_*.png`.
- **CDP 모드(기본)**: 페이지에 CDP 마우스 입력 → 크롬이 진짜 dragstart → `Input.setInterceptDrags` 로 데이터를 가로채 패널에 진짜 drop. 건너뛰는 것은 OS 가 WebContents 사이로 드래그를 넘겨주는 단계 하나뿐.
- **OS 모드**: 그 단계까지 확인 (D14). 드래그 UX·플랫폼 동작 변경 시, 마일스톤 끝에 한 번씩. 소유자가 PC 를 쓰는 중이면 먼저 물어볼 것.
- spike 하네스(`spike/harness`, Linux xdotool)는 참고용으로 그대로 둔다.

## 진행 방식
- `docs/PLAN.md` §10 마일스톤을 **M0부터 순서대로**. 시작 전 §13 "착수 전 결정 사항"을 소유자에게 확인(기본값 제시).
- 마일스톤마다 브랜치 + PR, 완료 기준(✅) 체크리스트와 테스트 출력 첨부.
- 결정이 바뀌면 `docs/DECISIONS.md`에 다음 번호(현재 D29부터), 새 함정은 `docs/SPIKE_REPORT.md` §5에 다음 번호(현재 G27부터) 추가.
- `spike/`는 참고용이다. 고치지 말고, v2 코드로 옮길 때 동작과 "왜" 주석을 유지한다.

## 소유자와 소통
한국어 편한 존댓말, 호칭 "태섭님". **결론 먼저**, 표·목록 적극 활용, 전문용어보다 쉬운 말, 설명 중간에 도표 환영.
끝에 **다음 할 일**을 제안하되 선택지만 늘어놓지 말고 **추천 하나를 콕** 집는다. 애매하면 먼저 묻는다.
