// 드롭 처리 (PLAN §6.2): 번호표 읽기 → 그 자리에 자리표시 → clip:get → Shadow DOM 렌더 → 에셋 로컬화 → DB 저장
import { WC_MIME, WC_MOVE_MIME, isClipError, parseDragMeta, type ClipResult, type DragMeta, type RawClip } from '../shared/protocol';
import type { ID } from '../shared/types';
import { safeHost } from '../capture/url';
import { usePanel } from './store';
import { find, insert, makeBlock, makeBox, move } from './tree';
import type { Spot } from './dnd';
import { logResult, type DropReport } from './log';
import { renderableFromClip, renderableFromRaw, setLiveRenderable } from './render';
import { ask, saveExternalClip, saveRawClip } from './save-clip';
import { getSettings } from '../shared/settings';

// 블록이 처음 그려졌을 때 알려 받기 (드롭→표시 시간 측정: 조각 HTML 을 넣은 직후)
const renderWaiters = new Map<ID, Array<() => void>>();
export function notifyRendered(clipId: ID) {
  const ws = renderWaiters.get(clipId);
  if (!ws) return;
  renderWaiters.delete(clipId);
  ws.forEach((w) => w());
}
function waitRendered(clipId: ID, timeoutMs = 5000) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, timeoutMs);
    const list = renderWaiters.get(clipId) || [];
    list.push(() => {
      clearTimeout(t);
      resolve();
    });
    renderWaiters.set(clipId, list);
  });
}

/** 새 박스를 만들어(또는 자리 그대로) 노드를 넣을 parentId/index 를 정한다 */
function placeNode(spot: Spot, node: Parameters<typeof insert>[3], history = true): { parentId: ID; index: number } | null {
  let placed: { parentId: ID; index: number } | null = null;
  usePanel.getState().apply(
    (d) => {
      if (spot.kind === 'new') {
        const n = d.root.children.filter((c) => c.kind === 'box').length;
        const box = makeBox(`Box ${n + 1}`);
        d.root.children.push(box);
        if (insert(d.root, box.id, 0, node)) placed = { parentId: box.id, index: 0 };
      } else if (insert(d.root, spot.parentId, spot.index, node)) {
        placed = { parentId: spot.parentId, index: spot.index };
      }
    },
    { history },
  );
  return placed;
}

function boxIndexOf(parentId: ID): number {
  const boxes = Array.from(document.querySelectorAll<HTMLElement>('.box:not(.new-box)'));
  return boxes.findIndex((b) => b.dataset.id === parentId);
}

export async function handleDrop(dt: DataTransfer, spot: Spot, session: { firstTypes?: string[]; overs?: number } | null) {
  const dropAt = Date.now();
  const types = Array.from(dt.types);
  const data: Record<string, string> = {};
  const sizes: Record<string, number> = {};
  for (const t of types) {
    if (t === 'Files') {
      // [G12] 이미지 드래그엔 Files 가 같이 옴
      sizes.Files = dt.files.length;
      continue;
    }
    data[t] = dt.getData(t);
    sizes[t] = data[t].length;
  }

  // ---------------------------------------------------------------- 패널 안 이동
  if (types.includes(WC_MOVE_MIME)) {
    const nodeId = data[WC_MOVE_MIME];
    let ok = false;
    let to: { parentId: ID; index: number } | null = null;
    usePanel.getState().apply((d) => {
      if (spot.kind === 'new') {
        const n = d.root.children.filter((c) => c.kind === 'box').length;
        const box = makeBox(`Box ${n + 1}`);
        d.root.children.push(box);
        ok = move(d.root, nodeId, box.id, 0);
        if (ok) to = { parentId: box.id, index: 0 };
        else d.root.children.pop();
      } else {
        ok = move(d.root, nodeId, spot.parentId, spot.index);
        if (ok) to = { parentId: spot.parentId, index: spot.index };
      }
    });
    await nextFrame();
    const t = to as { parentId: ID; index: number } | null;
    logResult({ kind: 'move', ok, nodeId, box: t ? boxIndexOf(t.parentId) : -1, index: t ? t.index : -1 });
    return;
  }

  // ---------------------------------------------------------------- 페이지에서 끌어온 조각
  let meta: DragMeta | null = parseDragMeta(data[WC_MIME]);
  const customTypeArrived = !!meta;
  const block = makeBlock(meta ? meta.id : crypto.randomUUID(), (await getSettings()).defaultDisplay);
  const preview = (data['text/plain'] || data['text/uri-list'] || '').slice(0, 200);
  usePanel.getState().setBlockUi(block.id, { status: 'loading', preview });
  const placed = placeNode(spot, block);
  if (!placed) {
    usePanel.getState().setBlockUi(block.id, null);
    return;
  }
  const result: DropReport = {
    kind: 'drop',
    types,
    sizes,
    firstTypes: session?.firstTypes,
    dragovers: session?.overs,
    customTypeArrived,
    meta,
    box: 0,
    index: placed.index,
    panelWidth: innerWidth,
  };
  await nextFrame();
  result.box = boxIndexOf(placed.parentId);

  let raw: ClipResult | null = null;
  const t0 = performance.now();
  if (meta) {
    raw = await ask<ClipResult>({ type: 'clip:get', id: meta.id });
  } else {
    // 폴백 (PLAN §6.2): 커스텀 MIME 이 안 넘어오는 OS 대비 → 진행 중 드래그를 background 에 묻는다
    raw = await ask<ClipResult | null>({ type: 'clip:current' });
    if (raw && !isClipError(raw)) {
      meta = raw.meta;
      result.meta = meta;
      result.fallbackUsed = 'clip:current';
      const clipId = meta.id;
      usePanel.getState().apply((d) => {
        const f = find(d.root, block.id);
        if (f && f.node.kind === 'block') f.node.clipId = clipId;
      }, { history: false });
    } else {
      raw = null;
    }
  }

  if (!meta || !raw) {
    // 외부 드롭: 다른 앱에서 끌어왔거나 번호표·폴백 둘 다 실패 → DOMPurify 를 거쳐 저장 (D17)
    const clipId = (find(usePanel.getState().doc!.root, block.id)?.node as { clipId?: ID } | undefined)?.clipId || block.id;
    const clip = await saveExternalClip(clipId, data);
    setLiveRenderable(clip.id, null);
    usePanel.getState().setBlockUi(block.id, null);
    usePanel.getState().bumpClip(clip.id);
    result.foreign = true;
    logResult(result);
    return;
  }
  result.dragDurationMs = dropAt - meta.startedAt;
  result.waitForClipMs = Math.round(performance.now() - t0);
  if (isClipError(raw)) {
    result.error = raw.error;
    usePanel.getState().setBlockUi(block.id, { status: 'error', error: raw.error, preview });
    logResult(result);
    return;
  }

  // 1) 받은 그대로 먼저 그린다 (원본 URL — 빠르게 보여주기)
  const rc = raw as RawClip;
  const t1 = performance.now();
  setLiveRenderable(meta.id, renderableFromRaw(rc));
  const rendered = waitRendered(meta.id);
  usePanel.getState().setBlockUi(block.id, null);
  usePanel.getState().bumpClip(meta.id);
  await rendered;
  result.renderMs = Math.round(performance.now() - t1);
  result.dropToVisibleMs = Date.now() - dropAt;
  result.stats = rc.stats;
  result.warnings = rc.warnings;
  result.finalizeError = rc.finalizeError;
  result.fallbacks = (rc.fallbacks || []).map((f) => ({ reason: f.reason, ok: !!f.dataUrl }));
  result.hasRefShot = !!rc.refShot;
  result.frames = (rc.frames || []).map((f) => ({ ok: !!f.ok, error: f.error }));
  result.ancestorBg = rc.ancestorBg;

  const sr = () => document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(block.id)}"] .clip`)?.shadowRoot || null;
  const remoteImgs = Array.from(sr()?.querySelectorAll('img') || []).filter((i) => /^https?:/i.test(i.getAttribute('src') || ''));
  await Promise.all(remoteImgs.map((img) => waitImg(img, 5000)));
  result.imgDirect = { total: remoteImgs.length, ok: remoteImgs.filter((i) => i.naturalWidth > 0).length };

  // 2) 에셋 로컬화 + 저장 → 저장본(로컬 Blob)으로 다시 그린다
  try {
    const { clip, report, familyMap } = await saveRawClip(rc);
    result.localize = report;
    const stored = await renderableFromClip(clip);
    setLiveRenderable(meta.id, stored);
    const again = waitRendered(meta.id);
    usePanel.getState().bumpClip(meta.id);
    await again;
    const imgs = Array.from(sr()?.querySelectorAll('img') || []);
    await Promise.all(imgs.map((img) => waitImg(img, 3000)));
    result.imgFinal = { total: imgs.length, ok: imgs.filter((i) => i.naturalWidth > 0).length };
    result.fonts = await checkFonts(clip.fontFaces.length, familyMap);
    setLiveRenderable(meta.id, null); // 이후엔 DB 의 저장본을 쓴다
  } catch (e) {
    result.error = 'save: ' + String(e instanceof Error ? e.message : e);
  }
  const endInfo = await ask<{ dropEffect: string | null } | null>({ type: 'clip:end-info', id: meta.id });
  result.sourceDropEffect = endInfo?.dropEffect;
  logResult(result);
}

async function checkFonts(declared: number, familyMap: Map<string, string>) {
  if (!declared) return { declared: 0 };
  const names = new Set([...familyMap.values()].map((n) => n.toLowerCase()));
  const deadline = Date.now() + 3000;
  let faces: FontFace[] = [];
  while (Date.now() < deadline) {
    faces = Array.from(document.fonts).filter((f) => names.has(f.family.replace(/^['"]|['"]$/g, '').toLowerCase()));
    if (faces.some((f) => f.status === 'loaded') && !faces.some((f) => f.status === 'loading')) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  return {
    declared,
    loaded: faces.filter((f) => f.status === 'loaded').length,
    error: faces.filter((f) => f.status === 'error').length,
    families: [...new Set(faces.filter((f) => f.status === 'loaded').map((f) => f.family))].slice(0, 8),
  };
}

function waitImg(img: HTMLImageElement, ms: number) {
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    const done = () => {
      clearTimeout(t);
      resolve();
    };
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function hostLabel(url: string | undefined) {
  return url ? safeHost(url) : '외부 드롭';
}
