import { describe, expect, it } from 'vitest';
import {
  familyOfFace,
  fontFacesFromCss,
  fontUrlsOf,
  parseFamilyList,
  prefixedFamily,
  rewriteFaceFamily,
  rewriteFamiliesInCss,
  rewriteFamilyValue,
  splitFamilies,
} from '../src/capture/fonts';

describe('font-family 파싱', () => {
  it('따옴표·쉼표를 처리한다', () => {
    expect(parseFamilyList(`"Noto Sans KR", 'A, B', system-ui`)).toEqual(['noto sans kr', 'a, b', 'system-ui']);
    expect(splitFamilies(`"A, B", C`)).toEqual(['"A, B"', 'C']);
  });
});

describe('@font-face 추출', () => {
  const css = `@font-face{font-family:"Inter";src:url(fonts/inter.woff2) format("woff2")}
@font-face { font-family: Other; src: url("/o.woff") }
@font-face{font-family:'Inline';src:url(data:font/woff2;base64,AAAA)}`;
  it('필요한 family 만, url() 은 시트 기준 절대경로로', () => {
    const faces = fontFacesFromCss(css, 'https://cdn.test/css/site.css', new Set(['inter', 'inline']));
    expect(faces).toHaveLength(2);
    expect(faces[0]).toContain('url("https://cdn.test/css/fonts/inter.woff2")');
    expect(faces[1]).toContain('data:font/woff2'); // data: 는 그대로
    expect(familyOfFace(faces[0])).toBe('inter');
    expect(fontUrlsOf(faces[0])).toEqual(['https://cdn.test/css/fonts/inter.woff2']);
  });
});

describe('family 접두어 (D8: 사이트마다 같은 이름이 다른 폰트일 수 있음)', () => {
  it('출처가 다르면 이름이 달라지고 같으면 같다', () => {
    const a = prefixedFamily('github.com', 'inter');
    expect(a).toMatch(/^wc-[0-9a-f]{6}-inter$/);
    expect(prefixedFamily('github.com', 'inter')).toBe(a);
    expect(prefixedFamily('example.com', 'inter')).not.toBe(a);
  });
  it('값·CSS·@font-face 를 바꾼다 (모르는 이름은 그대로)', () => {
    const map = new Map([['inter', 'wc-abc123-inter']]);
    expect(rewriteFamilyValue(`Inter, "Helvetica Neue", sans-serif`, map)).toBe(`"wc-abc123-inter", "Helvetica Neue", sans-serif`);
    expect(rewriteFamilyValue(`Arial`, map)).toBe('Arial');
    expect(rewriteFamiliesInCss(`[data-wcid="1"]::before{font-family:"Inter";color:red}`, map)).toBe(`[data-wcid="1"]::before{font-family:"wc-abc123-inter";color:red}`);
    expect(rewriteFaceFamily(`@font-face { font-family: "Inter"; src: url(x) }`, 'wc-abc123-inter')).toContain('font-family: "wc-abc123-inter";');
  });
});
