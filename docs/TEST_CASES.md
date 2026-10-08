# 테스트 케이스와 합격 기준

> 진짜 마우스 E2E(`spike/harness`)의 케이스별 **합격 기준**, 하네스가 기대는 **계약**, 그리고 **절대 배포하면 안 되는 테스트 훅** 목록.
> 합격 판정은 `spike/harness/runner.py`의 `check()`가 자동으로 한다. 스크립트는 하나라도 실패하면 종료 코드 1, `run_local.sh`는 전체 요약 후 실패 시 1.

## 1. 케이스별 합격 기준

공통: 모든 드롭 케이스는 **번호표(커스텀 MIME) 도착**(`customTypeArrived=true`)과 **스냅샷 오류 없음**이 기본 조건이다.

| ID | 스크립트 | 무엇을 | 추가 합격 기준 | 비고 |
|---|---|---|---|---|
| CORE | `t_core.py` | 카드(부모 선택자 스타일·웹폰트·`::before`·SVG `<use>`·배경 패턴) → Box 1 | `kind=element`, `tag=article`, 이미지 전부 로드, 로컬화 실패 0, 웹폰트 ≥1 로드, 드롭→표시 ≤ 200ms | 드래그 도중/후 스크린샷 저장 |
| E1 | `t_edge1.py` | 이미지 단독 | `tag=img`, 이미지 로드 | 이미지 드래그엔 `Files` 동반(G12) |
| E2 | `t_edge1.py` | 링크 → Box 2 맨 앞 | `tag=a` | |
| E3 | `t_edge1.py` | Referer 엄격 검사 이미지 | `tag=img`, **Referer 재시도로 받은 이미지 ≥1**, 최종 이미지 로드 | 서버 `/protected/*`가 외부 Referer 를 403 처리 |
| E4 | `t_edge1.py` | 표 전체 → 새 박스 | `tag=table` | `data-wc-target` 로 표 전체 지정 |
| E14 | `t_edge1.py` | `<p>`에서 Alt+휠 위로 → 부모(카드)로 넓혀 끌기 | `tag=article` | 실사용 UX 경로(테스트 훅 없음) |
| E6a/b | `t_edge4.py` | 복사·드래그 방지 쇼핑몰의 카드·이미지 | `tag=div`/`img`, 이미지 로드 | |
| E6 | `t_edge4.py` | 페이지의 `dragstart` 차단 핸들러 | **실행 0회** (`window.__blockedDragstart` 없음) | G10 |
| E7a~d | `t_edge4.py` | SPA 타일: Shadow DOM(open·closed·slot), canvas, 교차 출처 iframe, 폼 값 | `tag=section`, E7c 는 **대체 이미지 생성 성공** | |
| E8 | `t_edge4.py` | 교차 출처 iframe **안쪽** 요소 | `isTop=false`, `tag=div` | all_frames |
| E13 | `t_edge6.py` | 큰 표(요소 7,102개) | `tag=table` | 시간은 기록만, 예산은 PLAN §11 |
| E9 | `t_edge6.py` | dataTransfer 5MB / 40MB | `text/html` 크기 ≥ 5MB / 40MB 로 도착 | `data-wc-pad` 훅 |
| E10 | `t_edge8.py` | 패널 안 순서 바꾸기 (자기 박스에 블록 2개 → 마지막을 맨 앞으로) | 순서가 정확히 뒤집힘 | 긴 패널 자동 스크롤 미구현(G17) |
| E5b | `t_edge9.py`, `t_sel_final.py` | Alt로 텍스트 선택 → Alt 떼고 선택 위를 잡아 끌기 | `kind=selection` | G5 |
| E15 | `t_edge9.py` | 패널을 닫고 페이지 안 버튼으로 열기 | 패널 열림 + background `open-panel ok` | `postMessage` 훅(테스트 전용) |
| E5a | `t_sel_final.py` | Alt 누른 채 선택하고 그대로 끌기 | `kind=selection` | |
| CORE_regress | `t_sel_final.py` | 선택이 없으면 다시 요소 드래그 | `tag=article` | |
| G2 | `t_handle.py` | 편집 영역(contenteditable)을 그냥 잡고 끌기 | **드롭이 일어나지 않아야 함**(크롬 동작 확인) | 실패하면 크롬 동작이 바뀐 것 |
| G2G3 | `t_handle.py` | 하이라이트 라벨(⠿ 손잡이)로 끌기 | `via=handle`, `tag=section` | MDN 라이브 예제의 로컬 재현 |
| (외부망) | `t_mdn2.py` | MDN 라이브 예제를 손잡이로 | `via=handle`, `tag=interactive-example` | |
| (외부망) | `real.py` | 실제 사이트 묶음 | 번호표 도착 | 사이트 사정으로 흔들릴 수 있음 |

E11·E12는 결번(검증 중 폐기한 시나리오)이다.

## 2. 하네스 계약 (v2 패널·빌드가 지켜야 하는 것)

하네스는 아래에 기대고 있다. v2로 옮길 때 같은 의미의 `data-testid`를 두고 `runner.py`·`real.py`·`t_*.py`의 셀렉터를 바꾸거나, 테스트 빌드에서 같은 구조를 유지할 것.

| 대상 | spike 에서의 형태 | 쓰는 곳 |
|---|---|---|
| 박스 | `.box` (새 박스 영역은 `.box.new-box`), 첫 박스는 `.box[data-box="0"]` | `runner.dst_point`, `t_core` |
| 블록 목록 | `.box > .blocks > .block` | `runner.dst_point` |
| 블록 머리 | `.block-head` (draggable), 안의 `.src` 텍스트는 `"host · kind <tag>"` 형식 | `t_edge8` (" · " 로 분리) |
| 비교 표시 | `.block.compare` 클래스 | `real.panel_crop` |
| 패널 페이지 | URL 이 `…/sidepanel.html` 인 CDP page 대상 | `lab.panel()` |
| 고정 헤더 높이 | 약 100~110px (스크롤 보정 `scrollBy(0,-110)`) | `t_edge8`, `real.py` |
| 결과 보고 | 패널이 드롭마다 `POST http://127.0.0.1:8765/report` (JSON) | `lab.wait_report` |
| 보고 JSON | `from:'panel', kind:'drop'|'move', at, types[], sizes{}, firstTypes[], customTypeArrived, meta(DragMeta), box, index, dragDurationMs, waitForClipMs, renderMs, dropToVisibleMs, stats{nodes,props,htmlBytes,snapshotMs,captureMs,finalizeMs,fontScanMs,walkMs}, warnings[], fallbacks[{reason,ok}], hasRefShot, imgDirect{total,ok}, imgFinal{total,ok}, localize{total,ok,viaReferer,fail,failures[],ms}, fonts{declared,loaded,error,families[]}, sourceDropEffect, error?` | `runner.summarize/check` |
| background 보고 | `{from:'bg', kind:'open-panel', ok, error?}` | `t_edge9` |
| 수동 확인용 | 패널 `window.__wcResults` (하네스는 읽지 않음) | 사람이 CDP 로 볼 때 |

`dropToVisibleMs`는 **조각 HTML을 넣은 직후**(그리기 전, 이미지 로컬화 전) 시각이다. 사람이 빨리 휙 놓는 경우 스냅샷 시간이 드래그 시간보다 길 수 있으니, 스냅샷 시간(`stats.snapshotMs`)은 따로 본다.

## 3. 절대 배포하면 안 되는 테스트 훅 (Must-not-ship)

v2에서는 아래를 **E2E 빌드에서만** 켠다(예: 빌드 플래그 `WXT_E2E`). 배포 빌드에 들어가면 **아무 웹사이트나** 사용자가 끄는 대상을 바꾸거나(드래그 하이재킹), 드래그 데이터를 부풀리거나, 패널을 열 수 있다.

| 훅 | 위치(spike) | 위험 |
|---|---|---|
| `data-wc-target` 속성이 있는 조상을 대상으로 선택 | `content.js` `pickTarget()` | 사이트가 감싸는 요소에 붙여 끄는 대상을 바꿈 |
| `<html data-wc-pad="N">` 으로 text/html 부풀리기 | `content.js` `beginDrag()` | 사이트가 드래그 데이터를 거대하게 |
| `window.postMessage({__wc:'open-panel'})` → 패널 열기 | `content.js` message 리스너 | 사이트가 사용자 클릭을 이용해 패널을 엶 |
| `REPORT_URL` (127.0.0.1:8765 로 결과 전송) | `background.js`, `sidepanel.js` | 사용 기록이 로컬 포트로 나감 |
| 패널 `window.__wcResults` | `sidepanel.js` | 불필요한 기록 보관 |

**자동 확인(M0 에 추가)**: 배포 빌드 결과물에서 `127.0.0.1:8765`, `data-wc-target`, `data-wc-pad`, `__wc` 문자열을 grep 해서 하나라도 나오면 빌드 실패.

## 4. 케이스 추가 규칙
- 새 함정을 발견하면 로컬 testsite 에 재현 페이지를 만들고(외부망 없이 돌도록), `t_*.py` 에 `expect=` 로 합격 기준을 적는다.
- M1 에서 추가할 로컬 케이스(현재는 실제 사이트에서만 확인했거나 미검증): Tailwind식 `border-style:solid; border-width:0`(G6), 스크롤 컨테이너(G8), fixed·sticky 자식, `:hover` 스타일, 업로드 드롭존이 있는 페이지, quirks 모드 페이지, **CORS 헤더 없는 교차 출처 웹폰트**(지금 `server.py`는 모든 응답에 `Access-Control-Allow-Origin: *`를 붙이므로 별도 경로 필요), 절대 위치 레이아웃(그리드/메이슨리), 지연 로딩 이미지.

## 5. v2 하네스 (`e2e/`, Windows) — 2026-10-07 추가
spike 하네스를 Windows 로 옮기면서 입력 방식을 둘로 나눴다 (D19). 판정 함수(`runner.check`)와 보고 JSON 은 위 §1·§2 그대로.

| 모드 | 실행 | 실제 마우스 | 확인 범위 |
|---|---|---|---|
| CDP (기본) | `python e2e/run_all.py` | 안 움직임, 창은 화면 밖 | 페이지의 진짜 dragstart → 가로챈 데이터로 패널에 진짜 drop. OS 의 WebContents 간 전달만 제외 |
| OS | `WC_INPUT=os python e2e/run_all.py …` | 움직임(SendInput) | 전부 (spike 의 xdotool 과 같음) |

### 추가 케이스
| ID | 스크립트 | 무엇을 | 합격 기준 |
|---|---|---|---|
| F1 | `t_v2.py` | `<html data-wc-nomime>`(E2E 훅)로 번호표를 빼고 카드 드래그 | `fallbackUsed='clip:current'`, `tag=article`, 이미지 로드 |
| G17 | `t_v2.py` | 패널 고정 헤더 위에 놓기 | 드롭 보고 없음 + 블록 수 그대로 |
| M2a | `t_v2.py` | Box 1 의 "＋박스" 클릭 → 중첩 박스 안에 드롭 | 문서 트리에서 중첩 박스 안에 블록 |
| M2b | `t_v2.py` | 블록 머리를 끌어 다른 박스로 | 문서 트리에서 옮겨짐 |
| M2d | `t_v2.py` | 패널에서 Ctrl+Z / Ctrl+Shift+Z | 되돌림·다시 하기 후 원래 상태 |
| M2c | `t_v2.py` | 박스 14개 추가 후 첫 블록을 끌어 아래 가장자리에 머물기 → 마지막 박스에 놓기 | `scrollY > 200` + 마지막 박스에 들어감 |
| M2e | `t_v2.py` | 패널 없는 새 창에서 hover | 그 창에선 무장·오버레이 없음, 패널 창에선 있음 |
| P1 | `t_persist.py` | 패널 새로고침 | 블록·이미지·웹폰트 그대로, 원격 URL 0 |
| P2 | `t_persist.py` | 같은 프로필로 브라우저 재시작 | 같은 콜라주, 이미지·폰트 그대로 |
| P3 | `t_persist.py` | 네트워크 차단 + 테스트 서버 종료 후 패널 새로고침 | 이미지·폰트 그대로 (S4) |
| P4 | `t_persist.py` | HTML 내보내기 → 오프라인 탭에서 열기 | CSP 메타, 원격·`wc-asset` 참조 없음, Shadow DOM 렌더, 이미지·폰트 로드 |

### 하네스 계약 변경
- 박스 자식 목록은 `.box > .blocks` 의 `[data-node-id]` (블록 `.block` 과 중첩 박스 `.box` 가 섞임). 최상위는 `#board > .root-children`.
- 패널 초기화는 `window.__wcTest.reset(n)` (E2E 빌드 전용). 그 밖에 `doc()`, `addBoxes(n)`, `exportHtml()`, `flush()`.
- 테스트 훅 목록에 `data-wc-nomime`(번호표 빼기), `__wcTest` 추가 — 배포 빌드 grep 대상 (`scripts/check-no-testhooks.mjs`).

## 6. M1·M4 케이스 (2026-10-08 추가)
| ID | 스크립트 | 무엇을 | 합격 기준 |
|---|---|---|---|
| M1_* (13개) | `t_m1.py` | `testsite/m1.html`(Tailwind 테두리·스크롤·sticky/fixed·hover·어두운 배경·절대 위치·지연 로딩·image-set·중첩 flex/grid·교차 출처 폰트), `quirks.html`, `spa.html` iframe, CORE 카드 | 케이스별 기대 + **원본 캡처 대비 픽셀 차이 ≤ 2%** (`fidelity.html`, ±1px 허용) |
| M4a | `t_m4.py` | 라벨 경로에서 article 클릭 → 안쪽으로 움직여도 고정 → 끌기 | `tag=article` |
| M4b | `t_m4.py` | 가독성 모드 토글 | 조각 Shadow DOM 에 테마 덮어쓰기 CSS |
| M4c | `t_m4.py` | 첫 실행 안내 표시·닫기 | 닫히고 `settings.onboarded=true` |
| M4d | `t_m4.py` | 설정 페이지에서 기본 표시 방식 '다시 흐르게' | 새 블록 `display=reflow` |

E2E 전용 추가 훅: `fidelity.html`(배포 빌드에서 엔트리포인트째 빠짐), 패널 `__wcTest.clip(id)`, content `postMessage({__wc:'bench'})`.
