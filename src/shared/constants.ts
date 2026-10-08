/** 박스 중첩 최대 단계 (최상위 박스 = 1단계) — PLAN M2 */
export const MAX_BOX_DEPTH = 3;

/** 저장할 때 에셋 URL 자리에 쓰는 표시. 렌더 시 object URL 로 바꿔 끼운다 */
export const ASSET_SCHEME = 'wc-asset:';
export const ASSET_RE = /wc-asset:([0-9a-f]{64})/g;

/** 이미지·폰트 하나의 최대 크기 */
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;

/** 진행 중 조각 보관소(clipStore)에서 오래된 항목 정리 기준 */
export const CLIP_STORE_TTL_MS = 10 * 60 * 1000;

/** 스냅샷 최대 요소 수 */
export const MAX_SNAPSHOT_NODES = 20000;

/** E2E 하네스 결과 수집 서버 (E2E 빌드에서만 사용) */
export const E2E_REPORT_URL = __E2E__ ? 'http://127.0.0.1:8765/report' : '';
