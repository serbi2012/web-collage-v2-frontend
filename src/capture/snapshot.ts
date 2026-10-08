// 스냅샷 (PLAN §6.3)
// 원리: 원본 요소를 복제하면서 "브라우저가 실제로 계산한 스타일"을 요소마다 인라인으로 굳힌다.
//  - 부모 선택자(.article p 등)에 의존하던 스타일도 값으로 박히므로, 어디에 붙여도 모양이 유지됨
//  - 계산값의 URL은 이미 절대경로라서 상대경로 문제도 같이 해결됨
import type { RawClip, Rect } from '../shared/protocol';
import { MAX_SNAPSHOT_NODES } from '../shared/constants';
import { absUrl, cssHttpUrls, safeUrl, URL_RE } from './url';
import { copyAttr, sanitizeSvgTree, SKIP_TAGS, SVG_NS } from './sanitize';
import { defaultsFor, REPLACED, styleText } from './styles';
import { parseFamilyList } from './fonts';

type SnapshotResult = Omit<RawClip, 'meta' | 'stats'> & { stats: Omit<RawClip['stats'], 'snapshotMs'> };

interface Ctx {
  doc: Document;
  range: Range | null;
  base: string;
  rules: string[];
  wcid: number;
  nodes: number;
  props: number;
  families: Set<string>;
  images: Set<string>;
  svgRefs: Set<string>;
  fallbacks: RawClip['fallbacks'];
  warnings: string[];
  root: Element;
  rootBox: { left: number; top: number };
  sliceStart: number;
  yields: number;
}

/** 페이지 메인 스레드를 오래 붙잡지 않도록 이 시간마다 한 번 양보한다 (PLAN M1 성능, ≤100ms 연속 점유) */
const SLICE_MS = 10;
const yieldToPage = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * root 를 스냅샷한다. 시간 조각으로 나눠 실행하고, 그 사이 대상 DOM 이 바뀌면(R12: 캐러셀·SPA) 다시 뜬다.
 */
export async function snapshot(root: Element, opts: { range?: Range | null; ignoreAttrsOn?: Element } = {}): Promise<SnapshotResult> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let dirty = false;
    const note = (records: MutationRecord[]) => {
      for (const r of records) {
        // 우리 무장(draggable·인라인 -webkit-user-drag)이 바꾼 속성은 무시
        if (r.type === 'attributes' && r.target === opts.ignoreAttrsOn && (r.attributeName === 'draggable' || r.attributeName === 'style')) continue;
        dirty = true;
      }
    };
    const mo = new MutationObserver(note);
    mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
    try {
      const res = await snapshotOnce(root, opts.range || null);
      note(mo.takeRecords());
      if (!dirty) return res;
      if (attempt === 2) {
        res.warnings.push('스냅샷 도중 페이지 내용이 바뀌었습니다(R12)');
        return res;
      }
    } catch (e) {
      lastErr = e;
      if (!dirty) throw e;
    } finally {
      mo.disconnect();
    }
  }
  throw lastErr || new Error('snapshot failed');
}

async function snapshotOnce(root: Element, range: Range | null): Promise<SnapshotResult> {
  // [G15] 비활성 문서에서 복제본 생성 (페이지의 커스텀 엘리먼트 코드가 실행되지 않게)
  const doc = document.implementation.createHTMLDocument('');
  const t0 = performance.now();
  const r = root.getBoundingClientRect();
  const rootCS = getComputedStyle(root);
  const ctx: Ctx = {
    doc,
    range,
    base: document.baseURI,
    rules: [],
    wcid: 0,
    nodes: 0,
    props: 0,
    families: new Set(),
    images: new Set(),
    svgRefs: new Set(),
    fallbacks: [],
    warnings: [],
    root,
    // 루트의 padding box 왼쪽 위 (절대 위치 보정의 기준점)
    rootBox: { left: r.left + (parseFloat(rootCS.borderLeftWidth) || 0), top: r.top + (parseFloat(rootCS.borderTopWidth) || 0) },
    sliceStart: performance.now(),
    yields: 0,
  };
  const out = await cloneEl(root, null, ctx, true);
  if (!out) throw new Error('루트 요소가 보이지 않습니다(display:none?)');

  // 루트 보정: 원래 위치에서 떼어낸 것이므로 위치/여백/변형을 초기화
  out.style.setProperty('position', 'relative');
  for (const p of ['top', 'left', 'right', 'bottom', 'margin-top', 'margin-left', 'margin-right', 'margin-bottom', 'transform', 'translate', 'rotate', 'scale', 'float']) {
    out.style.removeProperty(p);
  }
  out.style.setProperty('margin', '0');
  out.setAttribute('data-wc-root', '');
  if (rootCS.display === 'inline' || rootCS.display === 'contents') out.style.setProperty('display', 'inline-block');

  // <use href="#..."> 가 참조하는 SVG 심볼을 같이 담기
  let defs = '';
  if (ctx.svgRefs.size) {
    const parts: string[] = [];
    const rn = root.getRootNode() as Document | ShadowRoot;
    for (const ref of ctx.svgRefs) {
      const target = (rn.getElementById ? rn.getElementById(ref) : null) || document.getElementById(ref);
      if (target) parts.push(sanitizeSvgTree(doc.importNode(target, true) as Element, ctx.base).outerHTML);
    }
    if (parts.length) defs = `<svg xmlns="${SVG_NS}" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>${parts.join('')}</defs></svg>`;
  }

  const tf = performance.now();
  const fonts = collectFontFaces(ctx.families);
  const fontScanMs = Math.round(performance.now() - tf);
  const html = out.outerHTML;
  return {
    html,
    css: ctx.rules.join('\n'),
    defs,
    width: Math.ceil(r.width),
    height: Math.ceil(r.height),
    families: Array.from(ctx.families),
    fontFaces: fonts.fontFaces,
    crossOriginSheets: fonts.crossOriginSheets,
    imageUrls: Array.from(ctx.images),
    fallbacks: ctx.fallbacks,
    warnings: ctx.warnings,
    stats: { nodes: ctx.nodes, props: ctx.props, htmlBytes: html.length, pseudoRules: ctx.rules.length, fontScanMs, walkMs: Math.round(tf - t0) },
  };
}

function addFamilies(ctx: Ctx, ff: string) {
  for (const f of parseFamilyList(ff)) ctx.families.add(f);
}
function addUrls(ctx: Ctx, text: string) {
  for (const u of cssHttpUrls(text)) ctx.images.add(u);
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function fallbackImg(ctx: Ctx, el: Element, reason: string): HTMLImageElement {
  const img = ctx.doc.createElement('img');
  const n = ctx.fallbacks.length;
  img.setAttribute('data-wc-fallback', String(n));
  img.setAttribute('alt', reason);
  ctx.fallbacks.push({ n, reason, rect: rectOf(el) });
  return img;
}

/**
 * M1 절대 위치 보정: 포함 블록이 루트 밖인 absolute(·fixed) 자손은 원래 좌표가 루트 밖 기준이라
 * 떼어 놓으면 어긋난다(네이버 블로그 목록 사례) → 루트 padding box 기준 좌표로 다시 계산한다.
 */
function fixedUpPosition(el: Element, cs: CSSStyleDeclaration, ctx: Ctx): string {
  const pos = cs.position;
  if (pos !== 'absolute' && pos !== 'fixed') return '';
  if (pos === 'absolute') {
    const op = (el as HTMLElement).offsetParent;
    // 포함 블록이 루트 자신이거나 루트 안이면 원래 좌표가 그대로 맞다
    if (op && (op === ctx.root || ctx.root.contains(op))) return '';
  }
  if (cs.transform !== 'none') return pos === 'fixed' ? 'position:absolute;' : '';
  const r = el.getBoundingClientRect();
  const left = r.left - ctx.rootBox.left - (parseFloat(cs.marginLeft) || 0);
  const top = r.top - ctx.rootBox.top - (parseFloat(cs.marginTop) || 0);
  return `position:absolute;left:${round2(left)}px;top:${round2(top)}px;right:auto;bottom:auto;`;
}
const round2 = (v: number) => Math.round(v * 100) / 100;

async function cloneEl(el: Element, parentCS: CSSStyleDeclaration | null, ctx: Ctx, isRoot: boolean): Promise<HTMLElement | SVGElement | null> {
  const tag = el.localName;
  if (SKIP_TAGS.has(tag.toLowerCase())) return null;
  if (ctx.range && !isRoot && !ctx.range.intersectsNode(el)) return null;
  const cs = getComputedStyle(el);
  if (cs.display === 'none') return null;
  if (++ctx.nodes > MAX_SNAPSHOT_NODES) throw new Error(`요소가 너무 많습니다(${MAX_SNAPSHOT_NODES / 10000}만 개 초과)`);
  if (performance.now() - ctx.sliceStart > SLICE_MS) {
    await yieldToPage();
    ctx.sliceStart = performance.now();
    ctx.yields++;
  }

  const isSvg = el.namespaceURI === SVG_NS;
  let out: HTMLElement | SVGElement;
  let replacedBy: string | null = null;
  if (tag === 'canvas') {
    try {
      const url = (el as HTMLCanvasElement).toDataURL('image/png');
      out = ctx.doc.createElement('img');
      out.setAttribute('src', url);
      replacedBy = 'canvas→img';
    } catch {
      out = fallbackImg(ctx, el, 'canvas(cross-origin)');
      replacedBy = 'canvas→screenshot';
    }
  } else if (tag === 'iframe' || tag === 'embed' || tag === 'object') {
    out = fallbackImg(ctx, el, tag);
    replacedBy = tag + '→screenshot';
  } else if (tag === 'video') {
    const p = el.getAttribute('poster');
    const poster = p && safeUrl(p, 'src', ctx.base);
    if (poster) {
      out = ctx.doc.createElement('img');
      out.setAttribute('src', poster);
      if (/^https?:/i.test(poster)) ctx.images.add(poster);
      replacedBy = 'video→poster';
    } else {
      out = fallbackImg(ctx, el, 'video');
      replacedBy = 'video→screenshot';
    }
  } else {
    try {
      out = isSvg ? (ctx.doc.createElementNS(SVG_NS, tag) as SVGElement) : ctx.doc.createElement(tag);
    } catch {
      out = ctx.doc.createElement('span');
      ctx.warnings.push('이상한 태그 이름: ' + tag);
    }
    copyAttrs(el, out, isSvg, ctx);
  }

  // 스타일 굳히기
  const st = styleText(cs, parentCS, defaultsFor(el), isRoot);
  ctx.props += st.n;
  let extra = '';
  const disp = cs.display;
  const replaced = REPLACED.has(tag) || replacedBy || (isSvg && tag === 'svg');
  if (!isSvg || tag === 'svg') {
    if (replaced) {
      extra += `width:${cs.width};height:${cs.height};`;
    } else if (disp !== 'inline' && disp !== 'contents' && !disp.startsWith('table-') && disp !== 'table') {
      // 블록 요소는 width 고정 + 높이는 min-height (글꼴 차이로 내용이 길어져도 잘리지 않게)
      if (cs.width.endsWith('px')) extra += `width:${cs.width};`;
      if (cs.height.endsWith('px') && parseFloat(cs.height) > 0) extra += `min-height:${cs.height};`;
    } else if (disp === 'table') {
      if (cs.width.endsWith('px')) extra += `width:${cs.width};`;
    }
  }
  // [G8] 스냅샷은 정지 화면이라 스크롤바가 필요 없음 (스크롤 영역 → 잘라서 보여주기)
  if (/auto|scroll/.test(cs.overflowX)) extra += 'overflow-x:hidden;';
  if (/auto|scroll/.test(cs.overflowY)) extra += 'overflow-y:hidden;';
  if (!isRoot) {
    // 절대 위치 보정(M1) + 고정 요소는 패널 안에서 따라다니지 않게 absolute 로
    extra += fixedUpPosition(el, cs, ctx);
    if (cs.position === 'sticky') extra += 'position:relative;';
  }
  if (replacedBy && replacedBy.endsWith('screenshot')) extra += 'object-fit:fill;';
  out.setAttribute('style', st.text + extra);
  addFamilies(ctx, cs.fontFamily);
  addUrls(ctx, st.text);

  // 가상 요소 ::before / ::after
  if (!replacedBy) {
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      const content = ps.content;
      if (!content || content === 'none' || content === 'normal') continue;
      const pst = styleText(ps, cs, defaultsFor(el, pseudo), false);
      if (!out.hasAttribute('data-wcid')) out.setAttribute('data-wcid', String(++ctx.wcid));
      ctx.rules.push(`[data-wcid="${out.getAttribute('data-wcid')}"]${pseudo}{${pst.text}content:${content};}`);
      addFamilies(ctx, ps.fontFamily);
      addUrls(ctx, pst.text + content);
    }
  }

  if (replacedBy) return out;

  // 폼 값 (비밀번호·파일 제외)
  if (tag === 'input') {
    const inp = el as HTMLInputElement;
    if (inp.type === 'checkbox' || inp.type === 'radio') {
      if (inp.checked) out.setAttribute('checked', '');
    } else if (inp.type !== 'password' && inp.type !== 'file') {
      out.setAttribute('value', inp.value);
    }
    return out;
  }
  if (tag === 'textarea') {
    out.textContent = (el as HTMLTextAreaElement).value;
    return out;
  }
  if (tag === 'img') return out;

  // [G14] 자식 (Shadow DOM 은 펼쳐서 담기: closed 는 chrome.dom.openOrClosedShadowRoot, slot 은 할당 노드로)
  const sr = (el as HTMLElement).shadowRoot || safeShadow(el);
  await appendKids(sr ? sr.childNodes : el.childNodes, out, cs, ctx);
  if (tag === 'select') {
    const sel = el as HTMLSelectElement;
    Array.from(out.querySelectorAll('option')).forEach((o, i) => {
      if (sel.options[i] && sel.options[i].selected) o.setAttribute('selected', '');
    });
  }
  return out;
}

function safeShadow(el: Element): ShadowRoot | null {
  try {
    const dom = typeof chrome !== 'undefined' ? chrome.dom : undefined;
    return dom && dom.openOrClosedShadowRoot ? dom.openOrClosedShadowRoot(el as HTMLElement) : null;
  } catch {
    return null;
  }
}

async function appendKids(kids: NodeListOf<ChildNode> | ChildNode[] | Node[], out: Element, cs: CSSStyleDeclaration, ctx: Ctx) {
  for (const k of Array.from(kids)) {
    if (k.nodeType === 3) {
      const t = k as Text;
      let text = t.data;
      if (ctx.range) {
        if (!ctx.range.intersectsNode(t)) continue;
        const s = t === ctx.range.startContainer ? ctx.range.startOffset : 0;
        const e = t === ctx.range.endContainer ? ctx.range.endOffset : t.data.length;
        text = t.data.slice(s, e);
      }
      out.appendChild(ctx.doc.createTextNode(text));
    } else if (k.nodeType === 1) {
      const e = k as Element;
      if (e.localName === 'slot') {
        const assigned = (e as HTMLSlotElement).assignedNodes({ flatten: true });
        await appendKids(assigned.length ? assigned : Array.from(e.childNodes), out, cs, ctx);
        continue;
      }
      const c = await cloneEl(e, cs, ctx, false);
      if (c) out.appendChild(c);
    }
  }
}

function copyAttrs(el: Element, out: Element, isSvg: boolean, ctx: Ctx) {
  const tag = el.localName;
  for (const a of Array.from(el.attributes)) {
    copyAttr(tag, isSvg, a.name, a.namespaceURI, a.value, out, ctx.base, {
      onUseRef: (id) => ctx.svgRefs.add(id),
      onImage: (u) => ctx.images.add(u),
    });
  }
  if (tag === 'img') {
    const img = el as HTMLImageElement;
    let src = img.currentSrc || img.src;
    if (!src || (!img.complete && !img.naturalWidth)) {
      // 지연 로딩 이미지
      const lazy = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
      if (lazy) src = absUrl(lazy, ctx.base);
    }
    const safeSrc = src && safeUrl(src, 'src', ctx.base);
    if (safeSrc) {
      out.setAttribute('src', safeSrc);
      if (/^https?:/i.test(safeSrc)) ctx.images.add(safeSrc);
    } else {
      out.removeAttribute('src');
    }
  }
  if (tag === 'a') {
    out.setAttribute('target', '_blank');
    out.setAttribute('rel', 'noopener noreferrer');
  }
}

/** 사용하는 font-family 의 @font-face 를 모은다. 접근 가능한 시트는 CSSOM, 교차 출처 시트는 background 가 받아 파싱 */
function collectFontFaces(families: Set<string>): { fontFaces: string[]; crossOriginSheets: string[] } {
  const fontFaces: string[] = [];
  const crossOriginSheets: string[] = [];
  const seen = new Set<string>();
  const visit = (rules: CSSRuleList, base: string) => {
    for (const rule of Array.from(rules)) {
      if (rule.type === CSSRule.FONT_FACE_RULE) {
        const fam = (rule as CSSFontFaceRule).style.getPropertyValue('font-family').trim().replace(/^['"]|['"]$/g, '').toLowerCase();
        if (!families.has(fam)) continue;
        const text = rule.cssText.replace(new RegExp(URL_RE.source, 'g'), (_m, _q: string, u: string) => `url("${u.startsWith('data:') ? u : absUrl(u, base)}")`);
        if (!seen.has(text)) {
          seen.add(text);
          fontFaces.push(text);
        }
      } else if (rule.type === CSSRule.IMPORT_RULE) {
        const ss = (rule as CSSImportRule).styleSheet;
        try {
          if (ss) visit(ss.cssRules, ss.href || base);
        } catch {
          if (ss && ss.href) crossOriginSheets.push(ss.href);
        }
      } else if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
        visit((rule as CSSGroupingRule).cssRules, base);
      }
    }
  };
  const sheets = [...Array.from(document.styleSheets), ...(document.adoptedStyleSheets || [])];
  for (const sheet of sheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      if (sheet.href) crossOriginSheets.push(sheet.href);
      continue;
    }
    visit(rules, sheet.href || document.baseURI);
  }
  return { fontFaces, crossOriginSheets: Array.from(new Set(crossOriginSheets)) };
}
