// 속성 허용 목록 — 직렬화기는 보안 경계다 (D17, G21). HTML·SVG 모두 허용 목록 방식.
import { safeUrl } from './url';

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** 복제하지 않는 태그. SVG 애니메이션은 정지 화면엔 불필요하고 <set attributeName="href" to="javascript:…"> 같은 우회 통로가 됨 (G21) */
export const SKIP_TAGS = new Set([
  'script', 'noscript', 'template', 'style', 'link', 'meta', 'base', 'title', 'head', 'source', 'track', 'wc-overlay',
  'set', 'animate', 'animatetransform', 'animatemotion', 'discard', 'foreignobject', 'frameset', 'frame', 'portal', 'applet',
]);

export const HTML_ATTRS = new Set([
  'id', 'href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'width', 'height', 'dir', 'lang', 'type', 'value', 'checked',
  'disabled', 'placeholder', 'start', 'reversed', 'datetime', 'span', 'poster', 'name', 'open', 'label', 'selected', 'multiple',
  'rows', 'cols', 'readonly', 'role', 'aria-label', 'aria-hidden', 'cellpadding', 'cellspacing', 'border', 'scope', 'headers', 'abbr',
]);

// M1: SVG 도 거부 목록 → 허용 목록으로 (G21 이어서)
export const SVG_ATTRS = new Set(
  (
    'id viewbox width height x y x1 y1 x2 y2 cx cy r rx ry fx fy fr d points pathlength transform fill fill-opacity fill-rule ' +
    'stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit stroke-opacity ' +
    'opacity clip-path clip-rule mask filter preserveaspectratio version href xlink:href xmlns xmlns:xlink ' +
    'gradientunits gradienttransform offset stop-color stop-opacity spreadmethod patternunits patterncontentunits ' +
    'patterntransform maskunits maskcontentunits clippathunits filterunits primitiveunits stddeviation in in2 result mode ' +
    'operator k1 k2 k3 k4 dx dy values type tablevalues slope intercept amplitude exponent flood-color flood-opacity ' +
    'lighting-color font-family font-size font-weight font-style text-anchor dominant-baseline alignment-baseline ' +
    'baseline-shift letter-spacing word-spacing textlength lengthadjust startoffset method spacing side marker-start ' +
    'marker-mid marker-end markerwidth markerheight markerunits refx refy orient role aria-label aria-hidden focusable ' +
    'display visibility color overflow vector-effect shape-rendering paint-order rotate lang xml:space ' +
    'color-interpolation-filters edgemode kernelmatrix order divisor bias targetx targety preservealpha surfacescale ' +
    'specularconstant specularexponent diffuseconstant azimuth elevation pointsatx pointsaty pointsatz limitingconeangle ' +
    'numoctaves seed stitchtiles basefrequency scale xchannelselector ychannelselector radius'
  ).split(/\s+/),
);

export interface AttrSink {
  setAttribute(name: string, value: string): void;
  setAttributeNS(ns: string | null, name: string, value: string): void;
}

/**
 * 원본 속성 하나를 허용 목록으로 걸러 복제본에 옮긴다. 옮긴 값(또는 null)을 돌려준다.
 * onUseRef: SVG <use href="#id"> 가 참조하는 심볼 id, onImage: 받아둘 이미지 URL
 */
export function copyAttr(
  tag: string,
  isSvg: boolean,
  name: string,
  namespaceURI: string | null,
  value: string,
  out: AttrSink,
  base: string,
  hooks: { onUseRef?: (id: string) => void; onImage?: (url: string) => void } = {},
): string | null {
  const lname = name.toLowerCase();
  if (lname.startsWith('on') || lname === 'style' || lname === 'class' || lname.startsWith('data-wc')) return null;
  if (!(isSvg ? SVG_ATTRS : HTML_ATTRS).has(lname)) return null;
  let v = value;
  if (lname === 'href' || lname === 'xlink:href' || lname === 'src') {
    if (isSvg && v.trim().startsWith('#')) {
      // 문서 안 참조(#id)만 그대로 둔다
      v = v.trim();
      if (tag === 'use') hooks.onUseRef?.(v.slice(1));
    } else {
      if (isSvg && tag === 'use') return null; // 외부 문서 참조 금지
      const asSrc = lname === 'src' || (isSvg && tag === 'image');
      const safe = safeUrl(v, asSrc ? 'src' : 'href', base);
      if (!safe) return null;
      v = safe;
      if (isSvg && tag === 'image' && /^https?:/i.test(v)) hooks.onImage?.(v);
    }
  }
  try {
    if (isSvg && name.includes(':')) {
      const ns = lname.startsWith('xlink:') ? XLINK_NS : namespaceURI;
      out.setAttributeNS(ns, name, v);
    } else {
      out.setAttribute(name, v);
    }
  } catch {
    return null;
  }
  return v;
}

/** SVG 심볼(defs)처럼 통째로 복제한 하위 트리를 허용 목록으로 정리한다 */
export function sanitizeSvgTree(node: Element, base: string): Element {
  const stack: Element[] = [node];
  while (stack.length) {
    const n = stack.pop()!;
    for (const child of Array.from(n.children)) {
      if (SKIP_TAGS.has(child.localName.toLowerCase())) child.remove();
      else stack.push(child);
    }
    const isSvg = n.namespaceURI === SVG_NS;
    for (const a of Array.from(n.attributes)) {
      // 심볼은 계산된 스타일을 굳히지 않으므로 인라인 style 은 남긴다 (CSS 값은 스크립트를 실행할 수 없음)
      if (a.name === 'style') continue;
      n.removeAttribute(a.name);
      copyAttr(n.localName, isSvg, a.name, a.namespaceURI, a.value, n, base);
    }
  }
  return node;
}
