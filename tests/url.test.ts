// 직렬화기의 보안 경계 (D17, G21): URL 은 정규화한 뒤 프로토콜로 판단
import { describe, expect, it } from 'vitest';
import { absUrl, cssHttpUrls, safeUrl } from '../src/capture/url';

const BASE = 'https://example.com/a/b.html';

describe('safeUrl', () => {
  it('상대경로를 절대경로로', () => {
    expect(safeUrl('img/x.png', 'src', BASE)).toBe('https://example.com/a/img/x.png');
    expect(safeUrl('/x', 'href', BASE)).toBe('https://example.com/x');
    expect(safeUrl('//cdn.example.org/y.png', 'src', BASE)).toBe('https://cdn.example.org/y.png');
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'jav\tascript:alert(1)', // [G21] 탭이 섞인 우회
    'jav\nascript:alert(1)',
    ' \u0000javascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'blob:https://example.com/123',
  ])('위험한 URL 은 버린다: %j', (u) => {
    expect(safeUrl(u, 'href', BASE)).toBeNull();
    expect(safeUrl(u, 'src', BASE)).toBeNull();
  });

  it('data:image 는 src 에서만 허용', () => {
    const d = 'data:image/png;base64,iVBORw0KGgo=';
    expect(safeUrl(d, 'src', BASE)).toBe(d);
    expect(safeUrl(d, 'href', BASE)).toBeNull();
  });

  it('absUrl 은 잘못된 URL 이면 원문', () => {
    expect(absUrl('http://[bad', BASE)).toBe('http://[bad');
  });
});

describe('cssHttpUrls', () => {
  it('http(s) url() 만 모은다', () => {
    const css = `background-image:url("https://a.com/x.png"), url(data:image/png;base64,AA), url('http://b.com/y.svg');`;
    expect(cssHttpUrls(css)).toEqual(['https://a.com/x.png', 'http://b.com/y.svg']);
  });
});
