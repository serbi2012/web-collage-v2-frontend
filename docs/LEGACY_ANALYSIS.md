# 옛 프로젝트(v1) 분석

> 대상: [serbi2012/web-collage-frontend](https://github.com/serbi2012/web-collage-frontend), [serbi2012/web-collage-backend](https://github.com/serbi2012/web-collage-backend)
> 2026-09-29 코드 리뷰 결과. v2는 이 코드를 **재사용하지 않고 새로 만든다.** 다만 컨셉과 UX 아이디어는 이어간다.

## 1. 개요

| 항목 | 내용 |
|---|---|
| 정체 | 웹페이지의 DOM 요소를 가져와 원하는 형식으로 재구성하는 스크랩 크롬 익스텐션 |
| 개발 기간 | 2022-11-14 ~ 2022-11-30 (약 2.5주), README 정리 2022-12-18 |
| 프론트 | React 17, Redux Toolkit, styled-components, socket.io-client, cheerio, axios, react-to-print, Jest, webpack(크롬 익스텐션 보일러플레이트), Manifest V3 |
| 백엔드 | Express 4, Mongoose(MongoDB), socket.io |
| 기능 | 8개 모드: Scrap / Select / Edit / Box / Drawing / Share / Save / Theme |
| 배포 | 크롬 웹스토어 [Web Collage](https://chrome.google.com/webstore/detail/web-collage/pdiapdjejpnapdhjnlnifjkkddephbkb) (항목 ID `pdiapdjejpnapdhjnlnifjkkddephbkb`) |

### v1 구조
```
 ┌──────────── Main 페이지 (익스텐션 탭) ─────────────┐
 │ Sidebar │  ScrapWindow   ║   WebWindow           │
 │ (8 모드) │  Box ⊃ Block   ║  axios로 HTML 받아옴   │
 │         │  ← 드래그&드롭 ─╫─ cheerio로 경로 보정   │
 └─────────┴───────┬────────╨───────────────────────┘
                   │ socket.io (실시간 공유) / REST (공유키 저장·조회)
                   ▼
            web-collage-backend (MongoDB)
```

## 2. 잘한 점 (v2에서도 지킬 것)
- README에 **고민의 흐름**을 기록함 (iframe → x-frame-options 막힘 → webRequest 우회 → 보안 문제로 포기 → HTML 문자열 + cheerio). v2에서도 결정 기록을 남긴다.
- 드래그&드롭을 라이브러리 없이 직접 구현하며 원리를 이해함 (`cloneNode(true)`로 원본이 사라지는 문제 해결 등).
- MV3 마이그레이션, 기능별 브랜치 → PR 흐름, gitmoji 커밋, 유닛 테스트.
- UX 아이디어: 마우스를 올리면 하이라이트, Box & Block 구조, contentEditable 기반 직접 편집, 테마(가독성), Mac 이미지 드래그 충돌 처리.

## 3. 상용 사이트에서 안 되던 근본 원인

v1은 `WebWindow`에서 **URL을 axios로 다시 받아 innerHTML로 흉내 내는 방식**이었다. 이 방식 자체가 막다른 길이다.

| # | 원인 | 증상 | 예시 |
|---|---|---|---|
| 1 | JS로 화면을 그리는 사이트(SPA): 받아온 HTML엔 `<div id="root">`만 있고, innerHTML로 넣은 스크립트는 실행 안 됨 | 텅 빈 화면 | 유튜브, 노션, X |
| 2 | 사용자 쿠키(로그인)가 요청에 안 실림 | 로그인 화면/권한 없음 | 메일, 카페, 사내 위키 |
| 3 | 브라우저가 아닌 요청이라 봇 차단·동의 페이지에 걸림 | 보안 확인 화면 | 해외 언론, 쇼핑몰 |
| 4 | 경로 땜질의 한계: `srcset`, CSS 속 `url()`, 폰트, `data-src` 지연 로딩, `/` 없는 상대경로 | 이미지·아이콘·폰트 깨짐 | 블로그, 쇼핑몰 |
| 5 | 이미지 핫링크 차단(Referer 검사) | 엑박 | 네이버 블로그 등 |
| 6 | CSS 충돌(양방향): 사이트 CSS가 익스텐션 UI까지 바꾸고, 떼어온 요소는 부모 선택자(`.article p`) 스타일을 잃음 | 붙이는 순간 모양이 달라짐 | 거의 전부 |
| 7 | 복제 불가 요소: canvas, 영상, iframe, Shadow DOM | 빈 박스 | 지도, 차트, 임베드 |

`utils/manipulateDom.js`의 사이트별 하드코딩 예외(`expressjs.com`, `www.latimes.com`, `recoiljs.org`)가 이 벽에 부딪힌 흔적이다.

## 4. 코드 수준 문제

| # | 문제 | 위치 |
|---|---|---|
| 1 | 보일러플레이트 content script가 `<all_urls>`에 주입되어 **모든 사이트 콘솔에** "Content script works!" 로그 출력 | `src/pages/Content/index.js`, `manifest.json` |
| 2 | `<a>` href를 무조건 `https://도메인` + href로 바꿔 절대경로가 `https://a.comhttps://b.com/…`로 깨짐, `img/a.png` 같은 상대경로도 깨짐 | `utils/manipulateDom.js` |
| 3 | `url.slice('https://'.length)`로 도메인 추출 → `http://` 사이트에서 틀어짐 | `WebWindow` |
| 4 | 소켓을 3곳(WebWindow, ScrapWindow, DrawingCanvas)에서 각각 `io.connect()`, cleanup에서 `disconnect()` 안 함 → URL 바뀔 때마다 연결 누적 | 컴포넌트 3곳 |
| 5 | 상태를 React state가 아니라 **DOM(innerHTML)** 자체에 보관 → Undo 불가, 저장·동기화가 "통째로 덮어쓰기" | `ScrapWindow` 전반 |
| 6 | 익스텐션인데 `document.cookie`로 상태 전달, `deleteCookie`에 `path=/` 없음 | `utils/manageCookie.js` |
| 7 | Save 모드 = `react-to-print`(인쇄). 실제 저장/불러오기 없음 → 새로고침하면 작업 소실 | `SidebarSaveModeModal` |
| 8 | 공유받은 HTML을 필터 없이 innerHTML | Share 모드 |
| 9 | `yarn.lock`·`package-lock.json` 공존, `jest`가 dependencies에, 지원 종료된 `node-sass` | `package.json` |

### 백엔드 문제

| # | 문제 |
|---|---|
| 1 | ⚠️ `socket.broadcast.emit`으로 **모든 접속자에게** 콜라주 내용을 뿌리고 클라이언트가 shareKey로 거름 → 남의 콜라주가 전부 다른 사람 브라우저로 전송됨 (가장 큰 보안 구멍) |
| 2 | 마우스를 떼거나 키를 칠 때마다 HTML 전체 전송, 동시 편집 시 마지막 사람이 다 덮어씀 |
| 3 | 인증 없음, 생성·조회 API만 있음(공유 누를 때마다 새 문서), 요청 크기 500MB 허용, CORS 전체 허용 |

## 5. 가져갈 것 / 버릴 것

| ✅ 가져갈 것 | 🗑️ 버릴 것 |
|---|---|
| "필요한 것만 모아 재구성해 가독성을 높인다"는 컨셉 | WebWindow (axios + cheerio 다시 받아오기 방식 전체) |
| Box & Block 구조 → 중첩 박스 + 가로/세로 정렬 | innerHTML = 상태인 구조 |
| 마우스를 올리면 하이라이트되는 UX | 쿠키로 상태 넘기기 |
| 테마(다크 등, 가독성 목적) | 전체 브로드캐스트 소켓 |
| 드로잉 주석, 직접 편집(Edit) 아이디어 → 후순위 마일스톤 | 인쇄로 대신하던 저장 |
| 결정 과정을 문서로 남기는 습관 | 사이트별 하드코딩 예외 |
| 크롬 웹스토어 기존 항목(업데이트로 재사용 가능) | 직접 만든 mousemove 드래그 (문서 경계를 못 넘음) |
