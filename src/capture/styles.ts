// 계산된 스타일 → 인라인 style 텍스트 (D5)
import { SVG_NS } from './sanitize';

export const SKIP_PROP_PREFIX = [
  '--', 'transition', 'animation', 'will-change', 'inline-size', 'block-size', 'min-inline-size', 'min-block-size',
  'max-inline-size', 'max-block-size', 'margin-block', 'margin-inline', 'padding-block', 'padding-inline', 'inset-block',
  'inset-inline', 'border-block', 'border-inline', 'border-start', 'border-end', 'scroll-', 'overscroll', 'contain-intrinsic',
  'overflow-block', 'overflow-inline', 'view-transition', 'anchor-', 'position-try', 'position-anchor', 'position-area',
  'position-visibility', 'offset-', '-webkit-user-drag', 'user-select', '-webkit-user-select', 'pointer-events',
  'content-visibility', 'container', 'touch-action', 'interactivity', 'field-sizing', 'interpolate-size', 'timeline-',
  'view-timeline', 'animation-timeline', 'caret', 'cursor', 'app-region', '-webkit-tap-highlight', 'speak', 'hyphenate-limit',
];
export const SKIP_PROP_EXACT = new Set(['contain', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'height', 'width', 'min-height']);

export const INHERITED = new Set(
  (
    'border-collapse border-spacing caption-side color color-scheme direction empty-cells font-family font-feature-settings ' +
    'font-kerning font-optical-sizing font-palette font-size font-size-adjust font-stretch font-style font-synthesis-small-caps ' +
    'font-synthesis-style font-synthesis-weight font-variant-alternates font-variant-caps font-variant-east-asian ' +
    'font-variant-emoji font-variant-ligatures font-variant-numeric font-variant-position font-variation-settings font-weight ' +
    'forced-color-adjust hyphens hyphenate-character image-orientation image-rendering letter-spacing line-break line-height ' +
    'list-style-image list-style-position list-style-type math-depth math-shift math-style orphans overflow-wrap paint-order ' +
    'print-color-adjust quotes ruby-align ruby-position tab-size text-align text-align-last text-anchor text-autospace ' +
    'text-combine-upright text-decoration-skip-ink text-emphasis-color text-emphasis-position text-emphasis-style text-indent ' +
    'text-justify text-orientation text-rendering text-shadow text-size-adjust text-spacing-trim text-transform ' +
    'text-underline-offset text-underline-position text-wrap-mode text-wrap-style visibility white-space-collapse widows ' +
    'word-break word-spacing writing-mode -webkit-text-fill-color -webkit-text-stroke-color -webkit-text-stroke-width ' +
    '-webkit-font-smoothing -webkit-locale -webkit-line-break -webkit-rtl-ordering -webkit-text-security ' +
    '-webkit-text-orientation -webkit-border-horizontal-spacing -webkit-border-vertical-spacing clip-rule color-interpolation ' +
    'color-interpolation-filters color-rendering dominant-baseline fill fill-opacity fill-rule marker-end marker-mid ' +
    'marker-start shape-rendering stroke stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit ' +
    'stroke-opacity stroke-width accent-color dynamic-range-limit'
  ).split(/\s+/),
);

export const REPLACED = new Set(['img', 'svg', 'video', 'canvas', 'iframe', 'embed', 'object', 'input', 'textarea', 'select', 'button', 'progress', 'meter']);

export function skipProp(p: string): boolean {
  if (SKIP_PROP_EXACT.has(p)) return true;
  for (const pre of SKIP_PROP_PREFIX) if (p.startsWith(pre)) return true;
  return false;
}

export type StyleMap = Record<string, string>;

function readStyle(cs: CSSStyleDeclaration): StyleMap {
  const o: StyleMap = Object.create(null);
  for (let i = 0; i < cs.length; i++) {
    const p = cs[i];
    o[p] = cs.getPropertyValue(p);
  }
  return o;
}

// ---------------------------------------------------------------- UA 기본값 (숨김 iframe 에서 태그별 계산, 캐시)
let defaultsFrame: HTMLIFrameElement | null = null;
const defaultsCache = new Map<string, StyleMap>();

function defaultsDoc(): Document {
  if (defaultsFrame && defaultsFrame.isConnected && defaultsFrame.contentDocument) return defaultsFrame.contentDocument;
  defaultsFrame = document.createElement('iframe');
  // [G16] 이 iframe 안에서도 content script 가 돌기 때문에(match_about_blank) 표시를 달아 즉시 종료시킨다
  defaultsFrame.setAttribute('data-wc-defaults', '');
  defaultsFrame.setAttribute('aria-hidden', 'true');
  defaultsFrame.style.cssText =
    'all:initial;position:fixed;left:-20000px;top:0;width:1200px;height:800px;visibility:hidden;border:0;pointer-events:none;';
  (document.documentElement || document.body).appendChild(defaultsFrame);
  const d = defaultsFrame.contentDocument!;
  if (!d.body) {
    d.open();
    d.write('<!doctype html><html><head></head><body></body></html>');
    d.close();
  }
  return d;
}

export function defaultsFor(el: Element, pseudo?: string): StyleMap {
  const ns = el.namespaceURI === SVG_NS ? 'svg' : 'html';
  const key = ns + ':' + el.localName + (pseudo || '');
  const hit = defaultsCache.get(key);
  if (hit) return hit;
  const d = defaultsDoc();
  let probe: Element;
  let holder: Element;
  if (ns === 'svg') {
    holder = d.createElementNS(SVG_NS, 'svg');
    probe = el.localName === 'svg' ? holder : d.createElementNS(SVG_NS, el.localName);
    if (probe !== holder) holder.appendChild(probe);
    d.body.appendChild(holder);
  } else {
    try {
      probe = d.createElement(el.localName);
    } catch {
      probe = d.createElement('span');
    }
    holder = probe;
    d.body.appendChild(probe);
  }
  const v = readStyle(d.defaultView!.getComputedStyle(probe, pseudo || null));
  holder.remove();
  defaultsCache.set(key, v);
  return v;
}

// [G7] 검사할 CSS 속성 목록은 "깨끗한 문서의 기본 요소"에서 한 번만 뽑아 둠.
// (GitHub 처럼 CSS 변수가 수천 개인 사이트는 요소마다 cs.length 가 2,400개 안팎이 되어
//  전부 훑으면 매우 느려짐 → 실제 CSS 속성 ~380개만 확인)
let PROPS: string[] | null = null;
export function propList(): string[] {
  if (PROPS) return PROPS;
  PROPS = Object.keys(defaultsFor(document.createElement('div'))).filter((p) => !skipProp(p));
  return PROPS;
}

export function styleText(cs: CSSStyleDeclaration, parentCS: CSSStyleDeclaration | null, defs: StyleMap, isRoot: boolean): { text: string; n: number } {
  let out = '';
  let n = 0;
  const has = new Set<string>();
  for (const p of propList()) {
    const v = cs.getPropertyValue(p);
    if (!v) continue;
    if (INHERITED.has(p)) {
      if (!isRoot && parentCS && parentCS.getPropertyValue(p) === v) continue;
    } else if (defs[p] === v) {
      continue;
    }
    if ((p === 'transform-origin' || p === 'perspective-origin') && cs.transform === 'none' && cs.perspective === 'none') continue;
    // 안 보이는 테두리/윤곽선 색은 생략(용량 절약)
    const m = /^border-(top|right|bottom|left)-color$/.exec(p);
    if (m && cs.getPropertyValue(`border-${m[1]}-style`) === 'none') continue;
    if (p === 'outline-color' && cs.outlineStyle === 'none') continue;
    if (p === 'column-rule-color' && cs.columnRuleStyle === 'none') continue;
    if (p === 'text-decoration-color' && cs.textDecorationLine === 'none') continue;
    out += p + ':' + v + ';';
    has.add(p);
    n++;
  }
  // [G6] 테두리 스타일이 있으면 두께도 반드시 함께 (Tailwind 처럼 "solid + 0px" 인 경우,
  // 0px 이 기본값과 같다고 빼버리면 브라우저가 기본 두께 3px 로 그려버림)
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const bs = cs.getPropertyValue(`border-${side}-style`);
    if (bs && bs !== 'none' && bs !== 'hidden' && !has.has(`border-${side}-width`)) {
      out += `border-${side}-width:${cs.getPropertyValue(`border-${side}-width`)};`;
    }
  }
  if (cs.outlineStyle && cs.outlineStyle !== 'none' && !has.has('outline-width')) out += `outline-width:${cs.outlineWidth};`;
  if (cs.columnRuleStyle && cs.columnRuleStyle !== 'none' && !has.has('column-rule-width')) out += `column-rule-width:${cs.columnRuleWidth};`;
  return { text: out, n };
}
