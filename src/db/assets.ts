// 에셋(이미지·폰트·화면 캡처) Blob 저장: 내용 SHA-256 으로 중복 제거 (PLAN §6.5)
import { db } from './dexie';
import type { ID } from '../shared/types';
import { ASSET_RE } from '../shared/constants';

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function putAssetBlob(blob: Blob, sourceUrl?: string): Promise<ID> {
  const buf = await blob.arrayBuffer();
  const id = await sha256Hex(buf);
  const exists = await db.assets.get(id);
  if (!exists) {
    await db.assets.put({ id, mime: blob.type || 'application/octet-stream', bytes: buf.byteLength, blob: new Blob([buf], { type: blob.type }), sourceUrl, createdAt: Date.now() });
  }
  return id;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

export async function putAssetDataUrl(dataUrl: string): Promise<ID> {
  return putAssetBlob(await dataUrlToBlob(dataUrl));
}

/** 텍스트 안의 wc-asset:<id> 참조를 모은다 */
export function assetIdsIn(...texts: string[]): string[] {
  const ids = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(new RegExp(ASSET_RE.source, 'g'))) ids.add(m[1]);
  }
  return [...ids];
}

/** 참조가 없어진 조각·에셋 정리 (GC). 콜라주 트리에서 쓰지 않는 조각 → 그 조각만 쓰던 에셋 순서 */
export async function collectGarbage(): Promise<{ clips: number; assets: number }> {
  const usedClips = new Set<string>();
  await db.collages.each((c) => {
    const walk = (n: { kind: string; children?: unknown[]; clipId?: string }) => {
      if (n.kind === 'block' && n.clipId) usedClips.add(n.clipId);
      for (const k of (n.children || []) as typeof n[]) walk(k);
    };
    walk(c.root as never);
  });
  const deadClips: string[] = [];
  const usedAssets = new Set<string>();
  await db.clips.each((clip) => {
    if (!usedClips.has(clip.id)) {
      deadClips.push(clip.id);
      return;
    }
    for (const id of Object.values(clip.assetMap || {})) usedAssets.add(id);
    if (clip.refShotAssetId) usedAssets.add(clip.refShotAssetId);
    for (const f of clip.fallbacks || []) if (f.assetId) usedAssets.add(f.assetId);
    for (const id of assetIdsIn(clip.html, clip.css, ...(clip.fontFaces || []))) usedAssets.add(id);
  });
  await db.clips.bulkDelete(deadClips);
  const deadAssets: string[] = [];
  const now = Date.now();
  await db.assets.each((a) => {
    // 방금 받은(아직 조각에 연결되기 전) 에셋은 남긴다
    if (!usedAssets.has(a.id) && now - (a.createdAt || 0) > 10 * 60 * 1000) deadAssets.push(a.id);
  });
  await db.assets.bulkDelete(deadAssets);
  return { clips: deadClips.length, assets: deadAssets.length };
}
