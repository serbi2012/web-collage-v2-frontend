// 번호표(id) ↔ 스냅샷 보관소 (PLAN §6.2, §8)
// [G18] MV3 service worker 가 잠들면 메모리가 사라지므로 완성된 조각은 IndexedDB(clipStore)에 보관한다.
//       메모리는 기다리는 쪽(waiters)과 진행 중인 화면 캡처 Promise 용.
import { db, type ClipStoreRow } from '../db/dexie';
import { CLIP_STORE_TTL_MS } from '../shared/constants';
import { CURRENT_DRAG_TTL_MS, type ClipResult, type ContentMsg, type FrameSnap, type RawClip } from '../shared/protocol';
import { cropToDataUrl } from './screenshot';
import { fontFacesFromSheet } from './assets';

interface Live {
  row: ClipStoreRow;
  shotP?: Promise<{ dataUrl?: string; ms?: number; error?: string }>;
  waiters: Array<(c: ClipResult) => void>;
}
const live = new Map<string, Live>();

function rec(id: string): Live {
  let r = live.get(id);
  if (!r) {
    r = { row: { id, createdAt: Date.now() }, waiters: [] };
    live.set(id, r);
  }
  return r;
}

export function onBegin(msg: Extract<ContentMsg, { type: 'clip:begin' }>, sender: chrome.runtime.MessageSender) {
  const r = rec(msg.id);
  Object.assign(r.row, { meta: msg.meta, rect: msg.rect, viewport: msg.viewport, tabId: sender.tab?.id, windowId: sender.tab?.windowId });
  // 최상위 프레임만 화면 캡처 (captureVisibleTab 좌표는 최상위 프레임 기준이라 하위 프레임은 좌표 변환이 필요 — 미지원)
  if (msg.meta.isTop && sender.tab) {
    const t0 = Date.now();
    const windowId = sender.tab.windowId;
    // [G9] 하이라이트 오버레이가 화면에서 사라진 다음 프레임을 찍도록 아주 잠깐 대기 (captureVisibleTab 은 초당 2회 제한)
    const capture = () => chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    r.shotP = new Promise((res) => setTimeout(res, 90))
      // 초당 2회 제한·탭 전환 직후 실패하면 한 번 더 (captureVisibleTab)
      .then(() => capture().catch(() => new Promise((res) => setTimeout(res, 600)).then(capture)))
      .then((dataUrl) => ({ dataUrl, ms: Date.now() - t0 }))
      .catch((e: unknown) => ({ error: String(e instanceof Error ? e.message : e) }));
  }
  db.clipStore.put(r.row).catch(() => {});
}

export async function onPut(msg: Extract<ContentMsg, { type: 'clip:put' }>) {
  const r = rec(msg.id);
  const clip = msg.clip;
  if (!('error' in clip)) await finalize(r, clip);
  r.row.clip = clip;
  r.row.readyAt = Date.now();
  if (!r.row.meta && clip.meta) r.row.meta = clip.meta;
  for (const w of r.waiters.splice(0)) w(clip);
  await db.clipStore.put(r.row).catch(() => {});
  cleanup();
}

export function onEnd(msg: Extract<ContentMsg, { type: 'clip:end' }>) {
  const r = rec(msg.id);
  r.row.endInfo = { dropEffect: msg.dropEffect, at: Date.now() };
  db.clipStore.update(msg.id, { endInfo: r.row.endInfo }).catch(() => {});
}

async function finalize(r: Live, clip: RawClip) {
  const t0 = Date.now();
  try {
    // 0) iframe 내용: 그 프레임의 content script 가 뜬 스냅샷으로 대체 이미지를 바꾼다 (M1)
    if (clip.frames?.length && r.row.tabId !== undefined) await mergeFrames(r.row.tabId, clip);
    // 1) 교차 출처 스타일시트의 @font-face 가져오기
    if (clip.crossOriginSheets?.length && clip.families?.length) {
      const fams = new Set(clip.families);
      const extra = await Promise.all(clip.crossOriginSheets.slice(0, 12).map((u) => fontFacesFromSheet(u, fams)));
      const seen = new Set(clip.fontFaces);
      for (const list of extra)
        for (const f of list)
          if (!seen.has(f)) {
            seen.add(f);
            clip.fontFaces.push(f);
          }
      clip.stats.crossOriginSheetsFetched = clip.crossOriginSheets.length;
    }
    // 2) canvas/iframe/video 대체 이미지 + 원본 비교용 스크린샷
    if (r.shotP) {
      const shot = await r.shotP;
      if (shot.dataUrl) {
        clip.stats.captureMs = shot.ms;
        const bmp = await createImageBitmap(await (await fetch(shot.dataUrl)).blob());
        const vw = r.row.viewport?.w;
        const ratio = vw ? bmp.width / vw : 1;
        clip.refShot = (await cropToDataUrl(bmp, clip.rect || r.row.rect, ratio)) || undefined;
        for (const fb of clip.fallbacks || []) fb.dataUrl = (await cropToDataUrl(bmp, fb.rect, ratio)) || undefined;
        bmp.close();
      } else {
        clip.stats.captureError = shot.error;
      }
    }
    clip.stats.finalizeMs = Date.now() - t0;
  } catch (e) {
    clip.finalizeError = String(e instanceof Error ? e.stack : e);
  }
}

async function mergeFrames(tabId: number, clip: RawClip) {
  await Promise.all(
    (clip.frames || []).map(async (f) => {
      try {
        const res = (await Promise.race([
          chrome.tabs.sendMessage(tabId, { type: 'frame:snap', token: f.token }),
          new Promise((resolve) => setTimeout(() => resolve({ error: 'timeout' }), 4000)),
        ])) as FrameSnap | { error: string } | undefined;
        if (!res || 'error' in res) {
          f.ok = false;
          f.error = res ? res.error : 'no response';
          return;
        }
        const re = new RegExp(`<img data-wc-fallback="${f.n}"[^>]*>`);
        const m = re.exec(clip.html);
        if (!m) {
          f.ok = false;
          f.error = 'placeholder not found';
          return;
        }
        const style = /style="([^"]*)"/.exec(m[0])?.[1] || '';
        const box = style.replace(/object-fit:[^;]*;?/g, '') + 'overflow:hidden;position:relative;' + (/(^|;)display:/.test(style) ? '' : 'display:inline-block;');
        const inner = `<div style="position:absolute;left:${-res.scrollX}px;top:${-res.scrollY}px;width:${res.width}px">${res.html}</div>`;
        clip.html = clip.html.replace(m[0], `<div data-wc-frame="${f.n}" style="${box}">${inner}</div>`);
        clip.css = [clip.css, res.css].filter(Boolean).join('\n');
        clip.defs += res.defs;
        const add = (into: string[], from: string[]) => {
          for (const x of from) if (!into.includes(x)) into.push(x);
        };
        add(clip.families, res.families);
        add(clip.fontFaces, res.fontFaces);
        add(clip.crossOriginSheets, res.crossOriginSheets);
        add(clip.imageUrls, res.imageUrls);
        clip.stats.nodes += res.nodes;
        f.ok = true;
      } catch (e) {
        f.ok = false;
        f.error = String(e instanceof Error ? e.message : e);
      }
    }),
  );
}

export async function getClip(id: string, timeoutMs = 15000): Promise<ClipResult> {
  const r = live.get(id);
  if (r?.row.clip) return r.row.clip;
  const stored = await db.clipStore.get(id).catch(() => undefined);
  if (stored?.clip) return stored.clip;
  const rr = rec(id);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: 'timeout: 스냅샷이 도착하지 않음' }), timeoutMs);
    rr.waiters.push((c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
}

/**
 * 폴백 (PLAN §6.2): 커스텀 MIME 이 패널에 안 온 경우, clip:begin ~ clip:end 사이의 "진행 중 드래그"를 돌려준다.
 * drop 은 dragend 보다 먼저 일어나므로 drop 시점엔 보통 아직 진행 중이다. 30초가 지났거나 없으면 null(=외부 드롭).
 * [G22] 다만 원본 탭의 dragend(clip:end)와 패널의 clip:current 는 서로 다른 프로세스에서 와서 순서가 뒤집힐 수 있다
 *       → 방금(ENDED_GRACE_MS 안에) 끝난 드래그도 진행 중으로 본다.
 */
const ENDED_GRACE_MS = 1500;
export async function currentClip(): Promise<ClipResult | null> {
  const now = Date.now();
  const inProgress = (row: ClipStoreRow) =>
    !!row.meta && now - row.meta.startedAt <= CURRENT_DRAG_TTL_MS && (!row.endInfo || now - row.endInfo.at <= ENDED_GRACE_MS);
  let best: ClipStoreRow | null = null;
  for (const { row } of live.values()) if (inProgress(row) && (!best || row.meta!.startedAt > best.meta!.startedAt)) best = row;
  if (!best) {
    // service worker 가 드래그 도중 다시 시작된 경우
    const rows = await db.clipStore.where('createdAt').above(now - CURRENT_DRAG_TTL_MS).toArray();
    for (const row of rows) if (inProgress(row) && (!best || row.meta!.startedAt > best.meta!.startedAt)) best = row;
  }
  return best ? getClip(best.id) : null;
}

export async function endInfo(id: string) {
  return live.get(id)?.row.endInfo || (await db.clipStore.get(id))?.endInfo || null;
}

let lastCleanup = 0;
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, v] of live) if (now - v.row.createdAt > CLIP_STORE_TTL_MS) live.delete(k);
  db.clipStore.where('createdAt').below(now - CLIP_STORE_TTL_MS).delete().catch(() => {});
}
