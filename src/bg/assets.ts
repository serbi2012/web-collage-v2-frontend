// 에셋 받기 → Blob 으로 IndexedDB 에 저장 (PLAN §6.5, D7)
// 받는 순서: ① 일반 요청(credentials:'omit') → ② Referer 를 원래 페이지로 설정해 재시도 → ③ credentials:'include' (R7: 로그인해야 보이는 이미지)
import { putAssetBlob } from '../db/assets';
import { MAX_ASSET_BYTES } from '../shared/constants';
import type { LocalizeKind, LocalizeResult } from '../shared/protocol';
import { fontFacesFromCss } from '../capture/fonts';
import { withReferer } from './referer-rule';

function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...init, signal: ac.signal }).finally(() => clearTimeout(t));
}

export async function fontFacesFromSheet(url: string, fams: Set<string>): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) return [];
    return fontFacesFromCss(await res.text(), url, fams);
  } catch {
    return [];
  }
}

export async function localize(urls: string[], referer: string, kind: LocalizeKind = 'image'): Promise<Record<string, LocalizeResult>> {
  const results: Record<string, LocalizeResult> = {};
  const queue = Array.from(new Set(urls)).slice(0, 300);
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift()!;
      results[url] = await fetchAsset(url, referer, kind);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return results;
}

type Try = { blob?: Blob; status?: number; error?: string };

async function tryOnce(url: string, init: RequestInit): Promise<Try> {
  try {
    const res = await fetchWithTimeout(url, 12000, init);
    if (!res.ok) return { status: res.status };
    const blob = await res.blob();
    if (blob.size > MAX_ASSET_BYTES) return { status: res.status, error: `too big (${blob.size}B)` };
    if (!blob.size) return { status: res.status, error: 'empty' };
    return { status: res.status, blob };
  } catch (e) {
    return { error: String(e instanceof Error ? e.message : e) };
  }
}

async function fetchAsset(url: string, referer: string, kind: LocalizeKind): Promise<LocalizeResult> {
  if (!/^https?:/i.test(url)) return { ok: false, error: 'unsupported scheme' };
  const store = async (t: Try, via: LocalizeResult['via']): Promise<LocalizeResult> => {
    let blob = t.blob!;
    // 폰트 응답의 MIME 이 엉뚱한 경우가 많아서(@font-face 는 MIME 과 무관하게 동작) 그대로 둔다
    if (kind === 'image' && !blob.type.startsWith('image/')) blob = new Blob([blob], { type: guessImageMime(url) || blob.type });
    const assetId = await putAssetBlob(blob, url);
    return { ok: true, assetId, status: t.status, via, bytes: blob.size };
  };
  const first = await tryOnce(url, { credentials: 'omit' });
  if (first.blob) return store(first, 'direct');
  if (first.error?.startsWith('too big')) return { ok: false, status: first.status, error: first.error };
  if (referer) {
    const second = await withReferer(url, referer, () => tryOnce(url, { credentials: 'omit', cache: 'reload' }));
    if (second.blob) return store(second, 'referer');
  }
  const third = await tryOnce(url, { credentials: 'include' });
  if (third.blob) return store(third, 'credentials');
  return { ok: false, status: third.status ?? first.status, error: third.error || first.error || `HTTP ${first.status}` };
}

function guessImageMime(url: string): string | null {
  const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
  const map: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon' };
  return ext ? map[ext] || null : null;
}
