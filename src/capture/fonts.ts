// 웹폰트 처리: font-family 파싱, @font-face 추출, family 이름 접두어 (D8, PLAN M1 폰트 로컬화)
import { absUrl, URL_RE } from './url';

const unquote = (s: string) => s.trim().replace(/^['"]|['"]$/g, '');

/** "A", 'B', C → ['a','b','c'] (소문자) */
export function parseFamilyList(ff: string): string[] {
  return splitFamilies(ff)
    .map((f) => unquote(f).toLowerCase())
    .filter(Boolean);
}

/** 따옴표 안의 쉼표는 무시하고 나눈다 */
export function splitFamilies(ff: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  for (const ch of ff) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** @font-face 블록 텍스트에서 family 이름 (소문자) */
export function familyOfFace(face: string): string {
  const m = /font-family\s*:\s*([^;}]+)/i.exec(face);
  return m ? unquote(m[1]).toLowerCase() : '';
}

/** 교차 출처 스타일시트 텍스트에서 필요한 family 의 @font-face 만 뽑아 url() 을 절대경로로 */
export function fontFacesFromCss(text: string, sheetUrl: string, fams: Set<string>): string[] {
  const out: string[] = [];
  const re = /@font-face\s*{[^}]*}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const block = m[0];
    const fam = familyOfFace(block);
    if (!fam || !fams.has(fam)) continue;
    out.push(absolutizeCssUrls(block, sheetUrl));
  }
  return out;
}

export function absolutizeCssUrls(css: string, base: string): string {
  return css.replace(new RegExp(URL_RE.source, 'g'), (all, _q: string, u: string) =>
    u.startsWith('data:') ? all : `url("${absUrl(u, base)}")`,
  );
}

/** @font-face 의 폰트 파일 URL (http(s)만) */
export function fontUrlsOf(face: string): string[] {
  const out: string[] = [];
  const re = new RegExp(URL_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(face))) if (/^https?:/i.test(m[2])) out.push(m[2]);
  return out;
}

/** 접두어 붙인 family 이름: 사이트마다 같은 이름이 다른 폰트일 수 있으므로 (D8 주의) */
export function prefixedFamily(origin: string, family: string): string {
  return `wc-${fnv1a(origin + '|' + family)}-${family}`;
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

/** @font-face 의 font-family 값을 바꾼다 */
export function rewriteFaceFamily(face: string, newName: string): string {
  return face.replace(/font-family\s*:\s*([^;}]+)/i, `font-family: "${newName}"`);
}

/** font-family 값 안의 이름을 map(소문자 → 새 이름)대로 바꾼다. 없는 이름(시스템 폰트·generic)은 그대로 */
export function rewriteFamilyValue(value: string, map: Map<string, string>): string {
  let changed = false;
  const parts = splitFamilies(value).map((p) => {
    const n = map.get(unquote(p).toLowerCase());
    if (!n) return p;
    changed = true;
    return `"${n}"`;
  });
  return changed ? parts.join(', ') : value;
}

/** CSS 텍스트 안의 모든 font-family 선언을 바꾼다 (가상요소 규칙용) */
export function rewriteFamiliesInCss(css: string, map: Map<string, string>): string {
  if (!map.size) return css;
  return css.replace(/(font-family\s*:\s*)([^;}]+)/gi, (_all, pre: string, val: string) => pre + rewriteFamilyValue(val, map));
}
