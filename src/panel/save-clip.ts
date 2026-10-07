// 막 도착한 RawClip → 에셋 로컬화(이미지·폰트·화면 캡처) → 저장용 Clip (PLAN §6.5, M1 폰트 로컬화)
import DOMPurify from 'dompurify';
import { db } from '../db/dexie';
import { putAssetDataUrl } from '../db/assets';
import { ASSET_SCHEME } from '../shared/constants';
import type { LocalizeResult, PanelReq, RawClip } from '../shared/protocol';
import type { Clip, ID } from '../shared/types';
import { familyOfFace, fontUrlsOf, prefixedFamily, rewriteFaceFamily, rewriteFamiliesInCss, rewriteFamilyValue } from '../capture/fonts';
import { safeHost, URL_RE } from '../capture/url';

export function ask<T>(req: PanelReq): Promise<T> {
  return chrome.runtime.sendMessage(req) as Promise<T>;
}

export interface LocalizeReport {
  total: number;
  ok: number;
  viaReferer: number;
  viaCredentials: number;
  fail: number;
  failures: Array<{ u: string; status?: number | string }>;
  ms: number;
  fonts: { total: number; ok: number };
}

const mapUrls = (text: string, map: Record<string, ID>) =>
  text.replace(new RegExp(URL_RE.source, 'g'), (all, q: string, u: string) => (map[u] ? `url(${q}${ASSET_SCHEME}${map[u]}${q})` : all));

export async function saveRawClip(raw: RawClip): Promise<{ clip: Clip; report: LocalizeReport; familyMap: Map<string, string> }> {
  const t0 = performance.now();
  const meta = raw.meta;
  const imageUrls = raw.imageUrls || [];
  const fontUrls = Array.from(new Set((raw.fontFaces || []).flatMap(fontUrlsOf)));
  const [imgRes, fontRes] = await Promise.all([
    imageUrls.length ? ask<Record<string, LocalizeResult>>({ type: 'assets:localize', urls: imageUrls, referer: meta.url, kind: 'image' }) : Promise.resolve({} as Record<string, LocalizeResult>),
    fontUrls.length ? ask<Record<string, LocalizeResult>>({ type: 'assets:localize', urls: fontUrls, referer: meta.url, kind: 'font' }) : Promise.resolve({} as Record<string, LocalizeResult>),
  ]);
  const report: LocalizeReport = { total: imageUrls.length, ok: 0, viaReferer: 0, viaCredentials: 0, fail: 0, failures: [], ms: 0, fonts: { total: fontUrls.length, ok: 0 } };
  const assetMap: Record<string, ID> = {};
  for (const u of imageUrls) {
    const r = imgRes?.[u];
    if (r?.ok && r.assetId) {
      assetMap[u] = r.assetId;
      report.ok++;
      if (r.via === 'referer') report.viaReferer++;
      if (r.via === 'credentials') report.viaCredentials++;
    } else {
      report.fail++;
      if (report.failures.length < 5) report.failures.push({ u: u.slice(0, 140), status: r?.status ?? r?.error });
    }
  }
  for (const u of fontUrls) {
    const r = fontRes?.[u];
    if (r?.ok && r.assetId) {
      assetMap[u] = r.assetId;
      report.fonts.ok++;
    }
  }

  // 폰트: 사이트마다 같은 이름이 다른 폰트일 수 있으므로 family 에 접두어 (D8)
  const origin = safeHost(meta.url);
  const familyMap = new Map<string, string>();
  for (const f of raw.fontFaces || []) {
    const fam = familyOfFace(f);
    if (fam && !familyMap.has(fam)) familyMap.set(fam, prefixedFamily(origin, fam));
  }
  const fontFaces = (raw.fontFaces || []).map((f) => {
    const fam = familyOfFace(f);
    const renamed = fam && familyMap.has(fam) ? rewriteFaceFamily(f, familyMap.get(fam)!) : f;
    return mapUrls(renamed, assetMap);
  });

  // HTML: 인라인 스타일의 url()·font-family, img src, SVG image href 를 DOM 수준에서 바꾼다 (속성값의 &amp; 등 이스케이프 문제 회피)
  const tpl = document.createElement('template'); // 비활성: 이미지를 받거나 스크립트를 실행하지 않음
  tpl.innerHTML = raw.html;
  for (const el of Array.from(tpl.content.querySelectorAll('*'))) {
    const st = el.getAttribute('style');
    if (st) {
      let next = st.indexOf('url(') >= 0 ? mapUrls(st, assetMap) : st;
      if (familyMap.size && next.indexOf('font-family') >= 0) next = next.replace(/(font-family\s*:\s*)([^;]+)/gi, (_a, pre: string, val: string) => pre + rewriteFamilyValue(val, familyMap));
      if (next !== st) el.setAttribute('style', next);
    }
    if (el.localName === 'img') {
      const src = el.getAttribute('src');
      if (src && assetMap[src]) el.setAttribute('src', ASSET_SCHEME + assetMap[src]);
    } else if (el.localName === 'image') {
      for (const a of ['href', 'xlink:href']) {
        const v = el.getAttribute(a);
        if (v && assetMap[v]) el.setAttribute(a, ASSET_SCHEME + assetMap[v]);
      }
    }
  }
  // 화면 캡처 대체 이미지 · 원본 비교 캡처
  const fallbacks = await Promise.all(
    (raw.fallbacks || []).map(async (f) => ({ n: f.n, reason: f.reason, assetId: f.dataUrl ? await putAssetDataUrl(f.dataUrl) : undefined })),
  );
  const refShotAssetId = raw.refShot ? await putAssetDataUrl(raw.refShot) : undefined;

  const html = tpl.innerHTML;
  const clip: Clip = {
    id: meta.id,
    kind: meta.kind,
    source: { url: meta.url, title: meta.title, capturedAt: meta.startedAt, via: meta.via, tag: meta.tag, frameUrl: meta.isTop ? undefined : meta.url },
    html,
    css: rewriteFamiliesInCss(mapUrls(raw.css || '', assetMap), familyMap),
    defs: raw.defs || '',
    width: raw.width,
    height: raw.height,
    fontFaces,
    assetMap,
    refShotAssetId,
    fallbacks,
    text: raw.text || tpl.content.textContent?.replace(/\s+/g, ' ').trim().slice(0, 2000) || '',
    stats: { nodes: raw.stats.nodes, htmlBytes: html.length, snapshotMs: raw.stats.snapshotMs },
  };
  await db.clips.put(clip);
  report.ms = Math.round(performance.now() - t0);
  return { clip, report, familyMap };
}

/**
 * 외부 출처 HTML(우리 번호표가 없는 드롭: 다른 앱·폴백 실패)은 반드시 DOMPurify 를 거친다 (D17)
 */
export async function saveExternalClip(id: ID, data: Record<string, string>): Promise<Clip> {
  const rawHtml = data['text/html'];
  let html: string;
  if (rawHtml) {
    html = DOMPurify.sanitize(rawHtml, { FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'], FORBID_ATTR: ['class', 'id'] });
  } else {
    const text = data['text/plain'] || data['text/uri-list'] || '(내용 없음)';
    const div = document.createElement('div');
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = text;
    html = div.outerHTML;
  }
  html = `<div data-wc-root style="padding:10px 12px;font:14px/1.6 system-ui,sans-serif;color:#1d1d1f;background:#fff">${html}</div>`;
  const uri = (data['text/uri-list'] || '').split('\n').find((l) => l && !l.startsWith('#')) || '';
  const clip: Clip = {
    id,
    kind: 'external',
    source: { url: uri, title: '외부 드롭', capturedAt: Date.now(), via: 'external' },
    html,
    css: '',
    defs: '',
    width: 0,
    height: 0,
    fontFaces: [],
    assetMap: {},
    fallbacks: [],
    text: (data['text/plain'] || '').slice(0, 2000),
    stats: { nodes: 0, htmlBytes: html.length, snapshotMs: 0 },
  };
  await db.clips.put(clip);
  return clip;
}
