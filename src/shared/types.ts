// 저장 모델 (IndexedDB) — PLAN §7
export type ID = string; // crypto.randomUUID()

export type ThemeId = 'light' | 'dark' | 'sepia';
export type DisplayMode = 'fit' | 'original' | 'reflow';

/** 콜라주 문서 하나 = 트리 하나 (작으므로 통째로 저장 → Undo/협업(Yjs) 전환이 쉬움) */
export interface CollageDoc {
  id: ID;
  title: string;
  theme: ThemeId;
  root: BoxNode; // 최상위 박스 (세로 방향)
  createdAt: number;
  updatedAt: number;
  schemaVersion: 1;
}

/** v1의 Box: 블록과 다른 박스를 담는 바구니. 가로/세로 정렬 */
export interface BoxNode {
  kind: 'box';
  id: ID;
  title?: string;
  direction: 'column' | 'row';
  children: TreeNode[]; // 중첩 최대 3단계 (MAX_BOX_DEPTH)
}

/** v1의 Block: 개별 조각 */
export interface BlockNode {
  kind: 'block';
  id: ID;
  type: 'clip' | 'note'; // note 는 M5
  clipId?: ID;
  note?: string;
  display: DisplayMode;
}

export type TreeNode = BoxNode | BlockNode;

/** 스크랩한 조각 (크므로 별도 테이블) */
export interface Clip {
  id: ID; // 드래그 번호표 id 를 그대로 사용
  /** external = 우리 번호표가 없는 외부 드롭(다른 앱·폴백 실패). DOMPurify 를 거친 HTML (D17) */
  kind: 'element' | 'selection' | 'external';
  source: { url: string; title: string; frameUrl?: string; capturedAt: number; via: 'native' | 'handle' | 'external'; tag?: string };
  html: string; // 스타일을 인라인으로 굳힌 HTML (허용 목록 직렬화 결과). 에셋 URL 은 'wc-asset:<id>'
  css: string; // 가상요소 규칙
  defs: string; // SVG 심볼
  width: number; // 원본 CSS px
  height: number;
  fontFaces: string[]; // url() 은 저장 후 'wc-asset:<assetId>' 로 치환, family 는 접두어(wc-xxxxxx-) 처리
  assetMap: Record<string, ID>; // 원본 URL → Asset.id
  refShotAssetId?: ID; // 원본 화면 캡처 (비교용)
  fallbacks: Array<{ n: number; reason: string; assetId?: ID }>;
  text: string; // 검색·미리보기용 평문
  stats: { nodes: number; htmlBytes: number; snapshotMs: number };
}

export interface Asset {
  id: ID; // 내용 SHA-256 (중복 제거)
  mime: string;
  bytes: number;
  blob: Blob;
  sourceUrl?: string;
  createdAt: number;
}

export interface CollageMeta {
  id: ID;
  title: string;
  updatedAt: number;
}
