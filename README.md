# Web Collage v2

아무 웹사이트에서나 **보이는 그대로의 조각을 마우스로 끌어** 크롬 사이드 패널의 콜라주에 모으고, 박스로 재구성해 저장·내보내는 크롬 익스텐션(MV3).
2022년 v1 을 새로 만든 버전입니다. 계획·결정·검증 기록은 [`docs/`](docs/), AI 작업 안내는 [`CLAUDE.md`](CLAUDE.md).

## 쓰는 법
1. 툴바 아이콘(또는 Alt+Shift+K)으로 사이드 패널을 연다 → 그 창은 **스크랩 모드**(패널 상단 스위치로 끄고 켬).
2. 페이지에서 마우스를 올리면 빨간 테두리 + 라벨(⠿)이 뜬다. 그대로 **잡고 끌어** 패널 박스에 놓는다.
   - **Alt + 휠 위로**: 부모로 넓히기 / 아래로: 되돌리기
   - 코드 에디터처럼 안 잡히는 곳은 **라벨(⠿ 손잡이)** 을 잡고 끌기
   - **Alt 누른 채 드래그**로 글자 일부 선택 → 그 위를 잡고 끌기
3. 패널: 박스 추가·중첩(최대 3단계)·가로/세로 정렬·이름 바꾸기(두 번 클릭)·복제, 블록/박스 머리를 끌어 순서 바꾸기, 원본 비교, 표시 방식(맞춤/원본 크기/다시 흐르게), Ctrl+Z / Ctrl+Shift+Z.
4. 모든 변경은 자동 저장(IndexedDB, 이미지·폰트까지 로컬 보관 → 오프라인·원본 삭제 후에도 그대로). 콜라주 여러 개.
5. 내보내기: 단일 HTML(에셋 인라인, 오프라인에서 열림) · Markdown(+이미지 zip) · 인쇄/PDF.

## 개발
```bash
pnpm install
pnpm dev          # 개발 모드
pnpm build        # 배포 빌드 (.output/chrome-mv3) + 테스트 훅 검사
pnpm test         # 단위 테스트
pnpm e2e          # E2E 빌드 + 진짜 드래그 회귀 (e2e/, Windows + Chrome for Testing)
```
크롬에 직접 올려 보기: `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램을 로드합니다" → `.output/chrome-mv3`.

## 구조
```
entrypoints/   background.ts · content.ts · sidepanel/ · print/
src/shared/    protocol.ts(메시지·번호표) · types.ts(저장 모델) · constants.ts
src/picker/    하이라이트·무장·손잡이·선택 드래그 (content script, 프레임워크 없음)
src/capture/   스냅샷(계산된 스타일 굳히기) · 속성 허용 목록 정화 · 폰트
src/bg/        번호표 보관소 · 화면 캡처 · 에셋 받기(Referer 재시도) · 창 단위 스크랩 모드
src/panel/     React 편집기 (Box & Block, 드롭 위치, Undo, 자동 저장)
src/db/        Dexie 스키마 · 에셋 Blob(SHA-256 중복 제거·GC) · 마이그레이션 틀
src/export/    HTML · Markdown · 인쇄
src/testhooks/ E2E 빌드 전용 훅 (배포 빌드에 들어가면 빌드 실패)
tests/         Vitest        e2e/  진짜 드래그 하네스        testsite/  로컬 테스트 페이지
spike/         기술검증 참고 구현(수정하지 않음)
```
