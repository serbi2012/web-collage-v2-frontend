# 결정 기록 (Decision Log)

> 각 결정의 **이유와 근거**, 그리고 **기각한 대안**을 남깁니다.
> 코드탭 AI 규칙: 여기서 기각된 대안을 다시 제안하지 마세요. 단, 새 근거(측정 결과 등)가 생기면 근거를 들어 소유자에게 먼저 물어보세요.
> 상태: ✅ 확정 · 🧪 검증됨(기술검증 통과) · 🟡 잠정(착수 시 재확인)

## 요약표

| ID | 결정 | 상태 | 기각한 대안 |
|---|---|---|---|
| D1 | 사용자가 보고 있는 **실제 탭에서 캡처** | ✅🧪 | URL로 HTML 다시 받아오기(v1 방식), iframe으로 띄우기 |
| D2 | 편집기는 **크롬 사이드 패널** | ✅🧪 | 별도 탭 편집기(v1), 팝업 |
| D3 | 드래그는 **브라우저 기본 드래그(HTML5 DnD)** | ✅🧪 | **클릭으로 담기(소유자 거부)**, 직접 만든 mousemove 드래그 |
| D4 | **번호표 프로토콜**: dataTransfer엔 메타(id)만, 스냅샷은 별도 전달 | ✅🧪 | 스냅샷을 dragstart 안에서 계산해 통째로 싣기 |
| D5 | 스냅샷 = **계산된 스타일을 요소마다 인라인으로 굳히기** | ✅🧪 | 스타일시트 규칙 복사, 스크린샷만 저장 |
| D6 | 패널에서 **Shadow DOM으로 격리** 렌더 + CSS `zoom`으로 폭 맞춤 | ✅🧪 | 패널 문서에 그대로 삽입 |
| D7 | 이미지 등 에셋은 **background가 직접 받아 로컬 보관**, 핫링크 차단은 DNR로 Referer 설정 | ✅🧪 | 원본 URL 그대로 참조 |
| D8 | 웹폰트 `@font-face`는 **패널 문서(head)**에 주입 | ✅🧪 | Shadow DOM 안에 주입(크롬에서 동작 안 함) |
| D9 | 스크랩 모드는 **패널이 열려 있을 때만** | ✅🧪 | 항상 켜짐 |
| D10 | 대상 선택: 마우스 아래 요소 + **Alt+휠로 부모 확장** + **라벨 손잡이** + **Alt 드래그로 텍스트 일부** | ✅🧪 | 클릭으로 선택 후 버튼으로 담기 |
| D11 | Alt 상태는 **마우스 이벤트의 `altKey`**에서 읽기 | ✅🧪 | keydown/keyup에만 의존 |
| D12 | **로컬 우선** 저장(IndexedDB). 공유·협업은 나중에 | ✅ | 서버 필수 구조(v1) |
| D13 | 기술 스택: WXT + TypeScript + React(패널) + 바닐라 TS(content) + Dexie + DOMPurify | 🟡 | (착수 시 최신 상태 확인) |
| D14 | 드래그 테스트는 **실제 OS 마우스 입력**(Xvfb + xdotool)으로 | ✅🧪 | Playwright/CDP 드래그 시뮬레이션만으로 검증 |
| D15 | v1 코드는 **재사용하지 않음**, 새로 작성 | ✅ | v1 위에 점진 수정 |

---

## D1. 실제 탭에서 캡처한다 ✅🧪
- **결정**: content script가 사용자가 보고 있는 탭에서 이미 렌더된 DOM과 계산된 스타일을 떠온다.
- **이유**: v1의 "다시 받아오기"는 SPA·로그인·봇 차단·경로·CSS 충돌 문제를 원리적으로 못 푼다([LEGACY_ANALYSIS §3](LEGACY_ANALYSIS.md#3-상용-사이트에서-안-되던-근본-원인)). 사용자가 보고 있는 화면은 이미 로그인·JS 실행·지연 로딩이 끝난 상태다.
- **근거**: 검증에서 유튜브·쿠팡(봇 차단이 강한 곳)·네이버·위키백과 등 실제 사이트에서 동작([SPIKE_REPORT](SPIKE_REPORT.md)).
- **기각**: URL 재요청(v1), iframe 띄우기(x-frame-options·교차 출처 DOM 접근 불가·보안).

## D2. 편집기는 크롬 사이드 패널 ✅🧪
- **결정**: `chrome.sidePanel`의 확장 페이지가 콜라주 편집기. 페이지 옆에 붙어 있고 탭을 옮겨 다녀도 유지된다.
- **이유**: 브라우저가 이미 완벽한 "웹 창"이므로 v1처럼 웹 창을 흉내 낼 필요가 없다. 패널은 별도 문서라 사이트 CSS에 오염되지 않는다.
- **근거**: `_execute_action` 단축키(Alt+Shift+K)와 툴바 클릭으로 열림 확인. 페이지 안 버튼 클릭 → content script 메시지 → `chrome.sidePanel.open({tabId})`도 사용자 제스처로 인정되어 열림 확인.
- **주의**: 패널 폭은 사용자가 조절(코드로 강제 불가). 한 번에 하나의 익스텐션 패널만 보인다. 크롬 116+ (`sidePanel.open`).

## D3. 드래그는 브라우저 기본 드래그 ✅🧪
- **결정**: 페이지 요소에 `draggable=true`를 임시로 붙여(무장) HTML5 기본 드래그로 패널까지 끈다.
- **이유**: 소유자가 정한 핵심 가치가 "쉽게 이것저것 **끌어서** 스크랩"이다. 기본 드래그는 OS가 처리하므로 페이지 → 사이드 패널(서로 다른 문서) 경계를 넘는다.
- **근거**: 실제 X11 마우스 입력으로 커스텀 MIME(`application/x-web-collage`)까지 패널에 도착. 드래그 이미지가 커서를 따라 패널로 넘어감([assets/middrag.png](assets/middrag.png)).
- **기각**:
  - **클릭으로 담기** — 소유자 원문 "클릭하면 의미가 없어". 주 방식은 물론 보조 방식도 소유자 확인 없이 넣지 말 것.
  - 직접 만든 mousemove 드래그(v1 방식) — 마우스 이벤트가 문서 경계를 못 넘는다.
- **예비안(플랜 B)**: 페이지 위에 Shadow DOM으로 격리한 떠 있는 편집기. 플랜 A가 특정 OS에서 실패할 때만 고려.
- **⚠️ 미검증**: Windows/Mac 크롬. 리눅스에서만 확인했다. 원리상 동작해야 하지만 M0에서 소유자가 실물 확인.

## D4. 번호표 프로토콜 ✅🧪
- **결정**: `dragstart`에서는 가벼운 메타(번호표 id, 출처 URL 등)만 `dataTransfer`에 싣고, 무거운 스냅샷은 `setTimeout(0)` 뒤에 계산해 `chrome.runtime` 메시지로 background에 맡긴다. 패널은 drop 때 id로 받아온다.
- **이유**: `dragstart` 핸들러는 동기라서 그 안에서 큰 스냅샷을 계산하면 드래그 시작이 늦어진다. 사람이 끌어서 놓는 데 보통 0.5~2초가 걸리므로 그 사이 계산이 끝난다.
- **근거**: dataTransfer 자체는 5MB·40MB도 그대로 넘어갔다(용량 문제는 아님). 드롭 후 스냅샷 대기 시간은 보통 수 ms~수십 ms.
- **보강 필요**: 특정 OS에서 커스텀 MIME이 안 넘어올 경우를 대비해 "가장 최근 드래그(clip:last)" 조회 폴백을 둔다(M0).

## D5. 스냅샷 = 계산된 스타일 굳히기 ✅🧪
- **결정**: 원본을 복제하면서 `getComputedStyle` 값을 요소마다 인라인 `style`로 박는다. UA 기본값과 같은 값은 생략하고, 상속 속성은 부모와 같으면 생략한다. `::before/::after`는 `[data-wcid]` 선택자 규칙으로 따로 담는다.
- **이유**: 부모 선택자에 의존하던 스타일도 값으로 고정되므로 어디에 붙여도 모양이 유지된다. 계산값의 `url()`은 이미 절대경로라서 경로 문제도 같이 풀린다.
- **근거**: 실제 사이트에서 원본과 거의 동일([assets/clip-vs-original.png](assets/clip-vs-original.png)).
- **기각**: 스타일시트 규칙 복사(SingleFile 방식) — 교차 출처 시트 접근, 선택자 재작성이 복잡함. 스크린샷만 저장 — 텍스트 선택·편집·재배치 불가(대체 수단으로만 사용).
- **알려진 한계**: 절대 위치 레이아웃 어긋남, 일부 웹폰트 교차 출처 실패, 화면 밖 영상/iframe → [PLAN M1](PLAN.md#m1-캡처-엔진-완성도).

## D6. 패널 렌더링은 Shadow DOM 격리 ✅🧪
- **결정**: 조각마다 `attachShadow({mode:'open'})` 안에 렌더하고, host는 `all: initial`. 패널 폭보다 넓으면 CSS `zoom`으로 축소.
- **주의**: 축소된 텍스트 위주 조각은 글씨가 작아지고 줄바꿈이 미세하게 달라진다 → "맞춤/원본 크기/다시 흐르게" 옵션 검토(M1).
- **보안**: 스냅샷 생성 단계에서 script·on* 속성·`javascript:` URL을 제거한다. 남이 공유한 콘텐츠를 렌더할 때는 DOMPurify를 추가로 거친다(M6).

## D7. 에셋 로컬화 + Referer 처리 ✅🧪
- **결정**: background(service worker)가 이미지 URL을 직접 받아 data URL/Blob으로 보관한다. 1차 요청이 실패하면 `declarativeNetRequest` 세션 규칙(`tabIds: [TAB_ID_NONE]`)으로 Referer를 원래 페이지로 설정해 다시 요청한다.
- **근거**: 테스트 사이트의 "Referer 엄격 검사" 이미지가 패널에서 직접은 403, Referer 재설정 재요청으로 성공.
- **이유**: 저장한 콜라주는 원본 사이트가 바뀌거나 사라져도 그대로 보여야 한다.

## D8. 폰트는 패널 문서 범위에 ✅🧪
- **결정**: 조각이 쓰는 font-family의 `@font-face`를 모아(접근 가능한 시트는 CSSOM, 교차 출처 시트는 background가 받아 파싱) 패널 `document.head`에 주입한다.
- **이유**: 크롬에서는 Shadow DOM 안에 선언한 `@font-face`가 동작하지 않는다.
- **근거**: react.dev(Optimistic), YouTube(Roboto), MDN(Inter, JetBrains Mono), 브런치 폰트가 패널에서 로드됨. GitHub 폰트는 교차 출처 제한으로 실패 → 폰트 파일도 직접 받아 넣기(M1).
- **주의**: 사이트마다 같은 family 이름이 다른 폰트일 수 있다 → 이름 충돌 방지(접두어) 필요(M1).

## D9. 스크랩 모드는 패널이 열려 있을 때만 ✅🧪
- **결정**: 패널이 background와 `runtime.connect({name:'panel'})` 포트를 열면 `chrome.storage.local.scrapEnabled = true`, 끊기면 false. content script는 이 값을 구독한다.
- **주의**: MV3 service worker가 잠들 수 있으므로 패널이 20초마다 ping. 패널 안에 켜기/끄기 스위치를 둔다(Esc 일시정지는 페이지에 포커스가 있을 때만 동작하므로 보조 수단).

## D10. 대상 선택 UX ✅🧪
- 마우스 아래 요소를 하이라이트하고 즉시 무장(`draggable=true` + 인라인 `-webkit-user-drag: element !important`).
- **Alt + 휠 위로**: 부모로 넓히기 / 아래로: 되돌리기.
- **라벨 손잡이(⠿)**: 하이라이트 라벨 자체가 draggable. 코드 에디터처럼 **편집 가능한 영역에서는 크롬이 드래그를 아예 시작하지 않으므로** 손잡이가 필요하다(MDN 라이브 예제로 확인).
- **Alt 누른 채 드래그 = 텍스트 선택**, 선택된 글자 위를 잡고 끌면 선택 부분만 스크랩.

## D11. Alt는 마우스 이벤트에서 읽는다 ✅🧪
- **이유**: 키보드 포커스가 사이드 패널에 있으면 페이지는 keydown을 받지 못한다(검증 중 실제로 발생). 마우스 이벤트의 `altKey`는 포커스와 무관하다.

## D12. 로컬 우선 ✅
- IndexedDB(Dexie)에 콜라주·조각·에셋을 저장한다. 서버 없이 완결.
- 공유: 읽기 전용 링크(M6), 실시간 협업은 Yjs 후보(그 이후). 기본값은 비공개 + 출처 URL 자동 표기(남의 콘텐츠를 다루므로).

## D13. 기술 스택 🟡
| 영역 | 선택 | 메모 |
|---|---|---|
| 익스텐션 프레임워크 | **WXT** (Vite 기반, MV3) | 사이드 패널 엔트리포인트 지원. 착수 시 최신 버전·대안(CRXJS 등) 확인 |
| 언어 | TypeScript strict | |
| 패널 UI | React | 상태: Zustand(+immer 패치로 Undo) 후보 |
| content script | **프레임워크 없이** 바닐라 TS | 모든 페이지에 주입되므로 가볍게 |
| 저장 | Dexie (IndexedDB) | |
| 정화 | DOMPurify | 공유 콘텐츠 렌더 시 |
| 테스트 | Vitest(순수 함수), Python E2E 하네스(드래그), 필요시 Playwright(비드래그 통합) | |
| 패키지 매니저 | pnpm | |

## D14. 드래그는 실제 OS 마우스로 테스트 ✅🧪
- **이유**: 페이지 → 사이드 패널은 서로 다른 WebContents라서 Playwright/CDP의 드래그 시뮬레이션으로는 재현이 안 된다. 실제 X11 입력(xdotool)이 OS 드래그 세션을 만든다.
- **도구**: [`spike/harness/`](../spike/harness/) (Xvfb + Chromium + xdotool + CDP). 사용법은 [`spike/README.md`](../spike/README.md).

## D15. v1 코드는 재사용하지 않는다 ✅
- 구조(다시 받아오기, innerHTML 상태, 소켓)가 근본적으로 다르다. 컨셉·UX 아이디어만 계승.

## D16. 테스트 훅은 E2E 빌드에만 ✅
- `data-wc-target`, `data-wc-pad`, `postMessage` 패널 열기, `REPORT_URL`, `__wcResults`는 배포 빌드에 넣지 않는다. 배포 빌드를 grep 해 발견되면 실패. → [TEST_CASES §3](TEST_CASES.md)

## D17. 정화 정책 ✅
- 우리 스냅샷(허용 목록 직렬화)은 그대로 렌더하되 직렬화기를 보안 경계로 테스트한다. 외부 출처 HTML(외부 드롭·가져오기·공유)은 DOMPurify 필수. 내보낸 HTML엔 `script-src 'none'` CSP 메타. (D6의 "공유 시에만"을 대체)
- 폴백 이름은 `clip:last`가 아니라 진행 중 드래그를 돌려주는 `clip:current` (PLAN §6.2).

---

## v2 착수 이후 (2026-10-07, 코드탭 AI)

| ID | 결정 | 상태 | 기각한 대안 |
|---|---|---|---|
| D18 | §13 착수 전 결정은 **기본값 전부 채택**(아래), 레포는 `serbi2012/web-collage-v2-frontend` 의 `v2` 브랜치 | ✅ | — |
| D19 | E2E 하네스는 Windows 로 옮기고 **입력 방식 두 가지**: CDP 모드(기본, 실제 마우스 미사용) + OS 모드(SendInput) | ✅🧪 | Playwright 드래그 시뮬레이션만(D14 위반), 매번 실제 마우스(소유자 PC 사용 방해) |
| D20 | 외부 드롭(번호표·폴백 둘 다 없음)은 `Clip.kind = 'external'` 로 저장 (DOMPurify 통과본) | ✅ | 저장하지 않고 화면에만 표시 |
| D21 | `scripting` 권한 추가(PLAN M2 계획대로, R4: 설치·업데이트 직후 열린 탭에 주입). `unlimitedStorage` 는 아직 추가하지 않음 | ✅ | 처음부터 unlimitedStorage |
| D22 | 웹폰트 family 접두어는 `wc-<fnv1a(사이트 host + family) 6자리>-<family>` (같은 사이트의 조각끼리는 공유, 다른 사이트와는 분리) | ✅ | 조각마다 다른 접두어(같은 폰트를 중복 저장) |

### D18. §13 기본값 채택
소유자가 "직접 적용하고 크롬에서 확인해서 완성해 달라"고 해서 묻지 않고 기본값으로 진행했다(PLAN §13 규칙).
| # | 채택 |
|---|---|
| Q1 | `web-collage-v2-frontend` 레포, 새 브랜치 `v2` (v1 마이그레이션 코드는 git 기록에 남기고 작업 트리에서 제거, D15). 백엔드 레포는 MVP 가 로컬 전용(Q6)이라 손대지 않음 |
| Q2·Q3 | 이름 Web Collage, 웹스토어 기존 항목 업데이트 전제로 version 2.0.0 |
| Q4·Q5 | Chrome, React |
| Q6 | MVP 로컬 전용 |
| Q7 | Alt+Shift+K (Windows 입력 언어 전환과 겹치는지는 아직 미확인 — 하네스는 이 단축키를 쓰지 않음) |
| Q8 | 기본 표시 방식 fit (블록마다 fit/original/reflow 선택 가능) |
| Q9 | 패널 상단 **스크랩 스위치(기본 켜짐) + 창 단위**. 켜져 있으면 무장된 요소의 클릭 차단(spike 와 같음), 끄면 평소대로 |
| Q10 | 실제 사이트 접속 테스트 허용(이번엔 로컬 testsite 위주로 진행) |
| Q11 | gitmoji 커밋, 한국어 PR |
| Q12 | Windows 확인 전에도 진행 |

### D19. Windows E2E 하네스: CDP 모드 + OS 모드
- **CDP 모드**: 페이지에 `Input.dispatchMouseEvent` → 크롬이 진짜 hover·mousedown·**dragstart** 를 만든다(우리 content script 의 무장·G1·G10 경로가 그대로 돈다). `Input.setInterceptDrags` 로 그 드래그 데이터(번호표 MIME 포함)를 받아 패널 문서에 `Input.dispatchDragEvent`(dragenter/dragover/drop)로 넣는다. 패널은 진짜 drop 이벤트를 받는다.
  - 건너뛰는 것: OS 가 드래그를 페이지 WebContents → 패널 WebContents 로 넘겨주는 단계 하나(DoDragDrop). 이건 OS 모드로 확인한다.
  - 장점: 소유자의 실제 마우스를 건드리지 않고, 창을 화면 밖(-1700,1600)에 띄워도 된다(`--disable-backgrounding-occluded-windows`, `CalculateNativeWinOcclusion` 끔).
- **OS 모드**(`WC_INPUT=os`): `SendInput` 으로 진짜 OS 마우스·키보드. spike 의 xdotool 과 같은 역할. 화면 캡처는 `PrintWindow` 로 테스트 창 내용만(겹친 다른 앱 화면이 찍히지 않게).
- 기각: 매 회귀를 OS 모드로 — 소유자가 PC 를 쓰는 중이면 커서를 빼앗고, 다른 창이 가리면 실패한다.
