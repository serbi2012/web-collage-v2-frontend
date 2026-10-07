// 메시지 프로토콜 — PLAN §8
import type { ID } from './types';

export const WC_MIME = 'application/x-web-collage'; // 페이지 → 패널 번호표
export const WC_MOVE_MIME = 'application/x-wc-move'; // 패널 안 블록·박스 이동

/** dragstart 에서 동기로 만드는 text/plain·text/html 의 상한 (R8: 큰 요소에서 드래그 시작이 늦어지지 않게) */
export const DRAG_TEXT_MAX = 2000;
export const DRAG_HTML_MAX = 1024 * 1024;

/** clip:current 폴백: clip:begin 뒤 이 시간이 지나면 진행 중 드래그로 보지 않음 */
export const CURRENT_DRAG_TTL_MS = 30_000;

export interface DragMeta {
  v: 1;
  id: ID;
  kind: 'element' | 'selection';
  via: 'native' | 'handle';
  url: string;
  title: string;
  isTop: boolean;
  tag: string;
  w: number;
  h: number;
  startedAt: number;
  nativeTypes: string[];
  originNodeType: number;
  htmlPayloadBytes?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ClipStats {
  nodes: number;
  props: number;
  htmlBytes: number;
  pseudoRules: number;
  snapshotMs: number;
  walkMs?: number;
  fontScanMs?: number;
  captureMs?: number;
  finalizeMs?: number;
  captureError?: string;
  crossOriginSheetsFetched?: number;
}

/** content script 가 만든 스냅샷 결과 */
export interface RawClip {
  html: string;
  css: string;
  defs: string;
  width: number;
  height: number;
  families: string[];
  fontFaces: string[];
  crossOriginSheets: string[];
  imageUrls: string[];
  fallbacks: Array<{ n: number; reason: string; rect: Rect; dataUrl?: string }>; // dataUrl 은 background 가 채움
  warnings: string[];
  stats: ClipStats;
  meta: DragMeta;
  text?: string;
  refShot?: string; // background 가 채움 (원본 화면 크롭, data URL)
  finalizeError?: string;
}
export interface ClipError {
  error: string;
  meta?: DragMeta;
}
export type ClipResult = RawClip | ClipError;
export const isClipError = (c: ClipResult | null | undefined): c is ClipError => !c || 'error' in c;

/** content → background */
export type ContentMsg =
  | { type: 'clip:begin'; id: ID; meta: DragMeta; rect: Rect; viewport: { w: number; h: number } }
  | { type: 'clip:put'; id: ID; clip: RawClip | ClipError }
  | { type: 'clip:end'; id: ID; dropEffect: string | null }
  | { type: 'scrap:query' }
  | { type: 'panel:open' }; // E2E 빌드의 테스트 훅에서만 보냄 (사용자 제스처 필요)

export type LocalizeKind = 'image' | 'font';
export interface LocalizeResult {
  ok: boolean;
  assetId?: ID;
  status?: number;
  via?: 'direct' | 'referer' | 'credentials';
  error?: string;
  bytes?: number;
}

/** panel → background (응답 있음) */
export type PanelReq =
  | { type: 'clip:get'; id: ID; timeoutMs?: number } // → ClipResult
  | { type: 'clip:current' } // → ClipResult | null   (커스텀 MIME 미도착 폴백, §6.2)
  | { type: 'clip:end-info'; id: ID } // → { dropEffect, at } | null
  | { type: 'assets:localize'; urls: string[]; referer: string; kind?: LocalizeKind } // → Record<url, LocalizeResult>
  | { type: 'scrap:set'; windowId: number; enabled: boolean };

/** background → content (탭의 모든 프레임) */
export type BgToContent = { type: 'scrap:state'; enabled: boolean };

/** panel ↔ background Port 이름. 연결 직후 { type:'hello', windowId, enabled } 전달, 20초 ping, 끊기면 재연결 */
export const PANEL_PORT = 'panel';
export type PanelPortMsg = { type: 'hello'; windowId: number; enabled: boolean } | { type: 'ping'; at: number };

// ---------------------------------------------------------------- 타입 가드 (크기·형식이 이상한 메시지는 버린다)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 80;

export function isDragMeta(v: unknown): v is DragMeta {
  return (
    isObj(v) &&
    v.v === 1 &&
    isId(v.id) &&
    (v.kind === 'element' || v.kind === 'selection') &&
    (v.via === 'native' || v.via === 'handle') &&
    typeof v.url === 'string' &&
    v.url.length < 8192 &&
    typeof v.tag === 'string' &&
    typeof v.startedAt === 'number'
  );
}

export function parseDragMeta(json: string | undefined | null): DragMeta | null {
  if (!json || json.length > 32 * 1024) return null;
  try {
    const v: unknown = JSON.parse(json);
    return isDragMeta(v) ? v : null;
  } catch {
    return null;
  }
}

export function isContentMsg(m: unknown): m is ContentMsg {
  if (!isObj(m) || typeof m.type !== 'string') return false;
  switch (m.type) {
    case 'clip:begin':
      return isId(m.id) && isDragMeta(m.meta) && isObj(m.rect) && isObj(m.viewport);
    case 'clip:put':
      return isId(m.id) && isObj(m.clip);
    case 'clip:end':
      return isId(m.id);
    case 'scrap:query':
    case 'panel:open':
      return true;
  }
  return false;
}

export function isPanelReq(m: unknown): m is PanelReq {
  if (!isObj(m) || typeof m.type !== 'string') return false;
  switch (m.type) {
    case 'clip:get':
    case 'clip:end-info':
      return isId(m.id);
    case 'clip:current':
      return true;
    case 'assets:localize':
      return Array.isArray(m.urls) && m.urls.length <= 500 && typeof m.referer === 'string';
    case 'scrap:set':
      return typeof m.windowId === 'number' && typeof m.enabled === 'boolean';
  }
  return false;
}
