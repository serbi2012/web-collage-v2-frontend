// 조각 렌더링 (PLAN §6.4): 블록마다 Shadow DOM 격리, @font-face 는 패널 document.head 에 (G13), 폭은 CSS zoom 으로 맞춤
import { db } from '../db/dexie';
import { ASSET_RE } from '../shared/constants';
import type { Clip, DisplayMode, ID, Stroke } from '../shared/types';
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
const urlToAsset = new Map<string, ID>(); // M5 편집: object URL → 에셋 id (저장 때 되돌리기)
export function assetUrl(id: ID): Promise<string | null> {
  let p = assetUrls.get(id);
  if (!p) {
    p = db.assets.get(id).then((a) => {
      if (!a) return null;
      const u = URL.createObjectURL(a.blob);
      urlToAsset.set(u, id);
      return u;
    });
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

/** 저장된 조각이 바뀌었을 때(편집) 캐시를 버린다 */
export function forgetRenderable(clipId: ID) {
  renderables.delete(clipId);
}

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

export interface RenderOpts {
  display: DisplayMode;
  withBg?: boolean;
  readable?: boolean;
  /** M5 크기 배율 */
  scale?: number;
  /** M5 주석 */
  ink?: Stroke[];
}

export function renderInto(host: HTMLElement, r: Renderable, o: RenderOpts) {
  const { display } = o;
  const sr = host.shadowRoot || host.attachShadow({ mode: 'open' });
  sr.textContent = '';
  // 보안: CSS 는 textContent 로 넣어 "</style>" 로 빠져나가는 일을 막는다 (값은 페이지가 만든 것)
  const style = document.createElement('style');
  style.textContent = `:host{all:initial;display:block;overflow:hidden}
.wrap{position:relative;width:${r.width ? r.width + 'px' : 'auto'};${o.withBg !== false && r.bg ? r.bg : ''}}
.wrap[contenteditable=true]{outline:2px dashed var(--accent,#ff5a5f);outline-offset:-2px;cursor:text}
.wrap.drawing{cursor:crosshair;user-select:none}
svg.ink{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:2147483646}
${display === 'reflow' ? REFLOW_CSS : ''}
${r.css || ''}
${o.readable ? READABLE_CSS : ''}`;
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
  renderInk(wrap, o.ink || []);
  injectFonts(r.fontFaces);
  fit(host, r.width, display, o.scale);
}

// ---------------------------------------------------------------- M5 주석 레이어 (SVG)
const SVG = 'http://www.w3.org/2000/svg';
export const INK_STYLE: Record<Stroke['tool'], { opacity: number; blend: string }> = {
  hl: { opacity: 0.38, blend: 'multiply' },
  pen: { opacity: 1, blend: 'normal' },
};

export function strokePath(pts: number[]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
  if (pts.length === 2) d += `L${pts[0] + 0.1} ${pts[1]}`; // 점 하나도 보이게
  return d;
}

/** 주석 SVG 를 문자열로 (내보내기용). 값은 숫자·색 형식만 통과 */
export function inkSvgString(ink: Stroke[] | undefined): string {
  if (!ink || !ink.length) return '';
  const paths = ink
    .filter((k) => /^#[0-9a-f]{3,8}$/i.test(k.color) && Array.isArray(k.pts))
    .map((k) => {
      const st = INK_STYLE[k.tool] || INK_STYLE.pen;
      const pts = k.pts.map((v) => Math.round(Number(v) * 10) / 10).filter((v) => Number.isFinite(v));
      return `<path d="${strokePath(pts)}" fill="none" stroke="${k.color}" stroke-width="${Math.max(0.5, Math.min(60, Number(k.w) || 3))}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${st.opacity}" style="mix-blend-mode:${st.blend}"/>`;
    })
    .join('');
  return `<svg class="ink" xmlns="${SVG}" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none">${paths}</svg>`;
}

export function renderInk(wrap: HTMLElement, ink: Stroke[]) {
  wrap.querySelector(':scope > svg.ink')?.remove();
  const t = document.createElement('template');
  t.innerHTML = inkSvgString(ink) || `<svg class="ink" xmlns="${SVG}"></svg>`;
  wrap.appendChild(t.content);
}

export function fit(host: HTMLElement, width: number, display: DisplayMode, scale = 1) {
  const wrap = host.shadowRoot?.querySelector<HTMLElement>('.wrap');
  if (!wrap) return;
  const sc = Math.max(0.1, Math.min(4, scale || 1));
  if (display !== 'fit') {
    wrap.style.zoom = String(sc);
    host.style.overflowX = display === 'original' ? 'auto' : 'hidden';
    return;
  }
  host.style.overflowX = 'hidden';
  const avail = host.clientWidth || host.parentElement?.clientWidth || width;
  // 맞춤: 패널 폭에 맞춘 뒤 배율을 곱하되 패널 폭을 넘지 않게
  const base = width && width > avail ? avail / width : 1;
  wrap.style.zoom = String(Math.min(base * sc, width ? avail / width : sc));
}

/** 편집한 HTML 의 object URL 을 저장 형식(wc-asset:<id>)으로 되돌린다 */
export function unresolveAssets(html: string): string {
  let out = html;
  for (const [url, id] of urlToAsset) if (out.includes(url)) out = out.split(url).join('wc-asset:' + id);
  return out;
}
