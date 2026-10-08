// 조각 렌더링 (PLAN §6.4): 블록마다 Shadow DOM 격리, @font-face 는 패널 document.head 에 (G13), 폭은 CSS zoom 으로 맞춤
import { db } from '../db/dexie';
import { ASSET_RE } from '../shared/constants';
import type { Clip, DisplayMode, ID } from '../shared/types';
import type { RawClip } from '../shared/protocol';

/** 렌더에 필요한 것만 (저장된 Clip 이든 막 도착한 RawClip 이든) */
export interface Renderable {
  info: { url: string; title: string; kind: string; tag: string };
  html: string;
  css: string;
  defs: string;
  width: number;
  fontFaces: string[];
  fallbackSrc: Record<number, string>;
  refShotSrc?: string;
  /** 원래 페이지 배경 CSS 선언 (루트가 투명한 조각) */
  bg?: string;
  /** 저장본인지 (false = 드롭 직후 원본 URL 그대로 쓴 임시 렌더) */
  stored: boolean;
}

/** 조상 배경 → CSS 선언 (렌더·내보내기 공용) */
export function bgCss(b: { color?: string; image?: string; repeat?: string; size?: string } | undefined): string | undefined {
  if (!b || (!b.color && !b.image)) return undefined;
  let s = '';
  if (b.color) s += `background-color:${b.color};`;
  if (b.image) s += `background-image:${b.image};background-repeat:${b.repeat || 'repeat'};background-size:${b.size || 'auto'};`;
  return s;
}

// ---------------------------------------------------------------- 에셋 object URL (패널 수명 동안 캐시)
const assetUrls = new Map<ID, Promise<string | null>>();
export function assetUrl(id: ID): Promise<string | null> {
  let p = assetUrls.get(id);
  if (!p) {
    p = db.assets.get(id).then((a) => (a ? URL.createObjectURL(a.blob) : null));
    assetUrls.set(id, p);
  }
  return p;
}

/** 텍스트 안의 wc-asset:<id> 를 object URL 로 바꿔 끼운다 */
export async function resolveAssets(text: string): Promise<string> {
  if (!text || text.indexOf('wc-asset:') < 0) return text;
  const ids = new Set<string>();
  for (const m of text.matchAll(new RegExp(ASSET_RE.source, 'g'))) ids.add(m[1]);
  const map = new Map<string, string>();
  await Promise.all([...ids].map(async (id) => map.set(id, (await assetUrl(id)) || '')));
  return text.replace(new RegExp(ASSET_RE.source, 'g'), (_m, id: string) => map.get(id) || '');
}

// 같은 조각을 여러 블록이 쓰거나 다시 그릴 때 매번 DB 를 읽지 않게
const renderables = new Map<ID, Promise<Renderable | null>>();
const live = new Map<ID, Renderable>(); // 드롭 직후 임시 렌더 (저장 전)

export function setLiveRenderable(clipId: ID, r: Renderable | null) {
  if (r) live.set(clipId, r);
  else live.delete(clipId);
  renderables.delete(clipId);
}

export function renderableFromRaw(raw: RawClip): Renderable {
  const fallbackSrc: Record<number, string> = {};
  for (const f of raw.fallbacks || []) if (f.dataUrl) fallbackSrc[f.n] = f.dataUrl;
  const m = raw.meta;
  // 폰트는 저장본(접두어·로컬 Blob)에서만 주입한다: 원래 이름 그대로 넣으면 다른 사이트의 같은 이름 폰트와 섞인다 (D8)
  return {
    info: { url: m.url, title: m.title, kind: m.kind, tag: m.tag },
    html: raw.html,
    css: raw.css,
    defs: raw.defs,
    width: raw.width,
    fontFaces: [],
    fallbackSrc,
    refShotSrc: raw.refShot,
    bg: bgCss(raw.ancestorBg),
    stored: false,
  };
}

export async function renderableFromClip(clip: Clip): Promise<Renderable> {
  const fallbackSrc: Record<number, string> = {};
  await Promise.all(
    (clip.fallbacks || []).map(async (f) => {
      if (f.assetId) fallbackSrc[f.n] = (await assetUrl(f.assetId)) || '';
    }),
  );
  const [html, css, defs, fontFaces, refShotSrc] = await Promise.all([
    resolveAssets(clip.html),
    resolveAssets(clip.css),
    resolveAssets(clip.defs),
    Promise.all((clip.fontFaces || []).map(resolveAssets)),
    clip.refShotAssetId ? assetUrl(clip.refShotAssetId) : Promise.resolve(null),
  ]);
  const info = { url: clip.source.url, title: clip.source.title, kind: clip.kind, tag: clip.source.tag || '' };
  const bg = clip.ancestorBg ? await resolveAssets(bgCss(clip.ancestorBg) || '') : undefined;
  return { info, html, css, defs, width: clip.width, fontFaces, fallbackSrc, refShotSrc: refShotSrc || undefined, bg: bg || undefined, stored: true };
}

export function loadRenderable(clipId: ID): Promise<Renderable | null> {
  const l = live.get(clipId);
  if (l) return Promise.resolve(l);
  let p = renderables.get(clipId);
  if (!p) {
    p = db.clips.get(clipId).then((c) => (c ? renderableFromClip(c) : null));
    renderables.set(clipId, p);
  }
  return p;
}

// ---------------------------------------------------------------- 폰트: [G13] @font-face 는 Shadow DOM 안에서 무시되므로 패널 문서 head 에 주입
let fontStyle: HTMLStyleElement | null = null;
const fontSeen = new Set<string>();
export function injectFonts(faces: string[], doc: Document = document) {
  if (!fontStyle || !fontStyle.isConnected) {
    fontStyle = doc.createElement('style');
    fontStyle.id = 'wc-fonts';
    doc.head.appendChild(fontStyle);
  }
  let add = '';
  for (const f of faces) {
    if (fontSeen.has(f)) continue;
    fontSeen.add(f);
    add += f + '\n';
  }
  if (add) fontStyle.appendChild(doc.createTextNode(add));
}

// ---------------------------------------------------------------- Shadow DOM 렌더
/** 표시 방식별 추가 CSS. reflow = 텍스트 위주 조각을 패널 폭에 맞춰 다시 흐르게 (M1 실험) */
const REFLOW_CSS = `.wrap{width:auto!important;max-width:100%}
.wrap *{max-width:100%!important;box-sizing:border-box}
.wrap [data-wc-root]{width:auto!important}
.wrap img,.wrap svg,.wrap video{height:auto!important}`;

/** M4 가독성 모드: 조각의 글자색·배경·글꼴을 패널 테마로 덮어쓴다 (이미지·배치는 그대로). 테마 변수는 :host 를 넘어 상속된다 */
export const READABLE_CSS = `.wrap{color:var(--ink,#1d1d1f)!important;background:var(--panel,#fff)!important;font-family:var(--read-font,system-ui,sans-serif)!important}
.wrap *{color:inherit!important;background-color:transparent!important;background-image:none!important;font-family:inherit!important;text-shadow:none!important;border-color:var(--line,#ddd)!important;box-shadow:none!important}
.wrap a{color:var(--accent,#3a5bd9)!important}`;

export function renderInto(host: HTMLElement, r: Renderable, display: DisplayMode, withBg = true, readable = false) {
  const sr = host.shadowRoot || host.attachShadow({ mode: 'open' });
  sr.textContent = '';
  // 보안: CSS 는 textContent 로 넣어 "</style>" 로 빠져나가는 일을 막는다 (값은 페이지가 만든 것)
  const style = document.createElement('style');
  style.textContent = `:host{all:initial;display:block;overflow:hidden}
.wrap{width:${r.width ? r.width + 'px' : 'auto'};${withBg && r.bg ? r.bg : ''}}
${display === 'reflow' ? REFLOW_CSS : ''}
${r.css || ''}
${readable ? READABLE_CSS : ''}`;
  sr.appendChild(style);
  if (r.defs) {
    const t = document.createElement('template');
    t.innerHTML = r.defs;
    sr.appendChild(t.content);
  }
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  // 우리 스냅샷은 허용 목록 직렬화 결과라 그대로 렌더한다 (D17). 패널 CSP 가 인라인 스크립트도 막는다.
  wrap.innerHTML = r.html;
  sr.appendChild(wrap);
  sr.querySelectorAll('img[data-wc-fallback]').forEach((img) => {
    const src = r.fallbackSrc[Number(img.getAttribute('data-wc-fallback'))];
    if (src) img.setAttribute('src', src);
  });
  injectFonts(r.fontFaces);
  fit(host, r.width, display);
}

export function fit(host: HTMLElement, width: number, display: DisplayMode) {
  const wrap = host.shadowRoot?.querySelector<HTMLElement>('.wrap');
  if (!wrap) return;
  if (display !== 'fit') {
    wrap.style.zoom = '1';
    host.style.overflowX = display === 'original' ? 'auto' : 'hidden';
    return;
  }
  host.style.overflowX = 'hidden';
  const avail = host.clientWidth || host.parentElement?.clientWidth || width;
  wrap.style.zoom = String(width && width > avail ? avail / width : 1);
}
