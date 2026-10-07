// 속성 허용 목록 직렬화 (D17, G21, PLAN M1 "SVG 도 허용 목록으로")
import { describe, expect, it } from 'vitest';
import { copyAttr, sanitizeSvgTree, SKIP_TAGS, SVG_NS } from '../src/capture/sanitize';

const BASE = 'https://site.test/page';

function copyAll(src: string, isSvg = false) {
  const t = document.createElement('template');
  t.innerHTML = src;
  const el = (isSvg ? t.content.querySelector('svg > *') : t.content.firstElementChild) as Element;
  const out = isSvg ? document.createElementNS(SVG_NS, el.localName) : document.createElement(el.localName);
  const refs: string[] = [];
  const imgs: string[] = [];
  for (const a of Array.from(el.attributes)) copyAttr(el.localName, isSvg, a.name, a.namespaceURI, a.value, out, BASE, { onUseRef: (r) => refs.push(r), onImage: (u) => imgs.push(u) });
  return { out, refs, imgs };
}

describe('HTML 속성 허용 목록', () => {
  it('on* · style · class · data-wc* 는 버린다', () => {
    const { out } = copyAll('<div onclick="x()" onmouseover="y()" style="color:red" class="a" data-wc-target="" title="t" id="i"></div>');
    expect(out.getAttributeNames().sort()).toEqual(['id', 'title']);
  });
  it('허용 목록에 없는 속성은 버린다 (formaction, srcdoc 등)', () => {
    const { out } = copyAll('<button formaction="javascript:x" srcdoc="<script>" name="n"></button>');
    expect(out.getAttributeNames()).toEqual(['name']);
  });
  it('href 는 http(s)만, 상대경로는 절대경로로', () => {
    expect(copyAll('<a href="jav&#9;ascript:alert(1)">x</a>').out.hasAttribute('href')).toBe(false);
    expect(copyAll('<a href="../x">x</a>').out.getAttribute('href')).toBe('https://site.test/x');
  });
});

describe('SVG 속성 허용 목록', () => {
  it('도형 속성은 남기고 이벤트·스크립트 경로는 버린다', () => {
    const { out } = copyAll('<svg><path d="M0 0L1 1" fill="red" onload="x()" style="a" class="c"></path></svg>', true);
    expect(out.getAttribute('d')).toBe('M0 0L1 1');
    expect(out.getAttribute('fill')).toBe('red');
    expect(out.hasAttribute('onload')).toBe(false);
    expect(out.hasAttribute('class')).toBe(false);
  });
  it('<use> 는 문서 안 참조(#id)만, 외부 참조는 버린다', () => {
    const inner = copyAll('<svg><use href="#star"></use></svg>', true);
    expect(inner.out.getAttribute('href')).toBe('#star');
    expect(inner.refs).toEqual(['star']);
    const ext = copyAll('<svg><use href="https://evil.test/sprite.svg#x"></use></svg>', true);
    expect(ext.out.hasAttribute('href')).toBe(false);
  });
  it('SVG <a> 의 javascript: href 는 버린다', () => {
    expect(copyAll('<svg><a href="javascript:alert(1)"></a></svg>', true).out.hasAttribute('href')).toBe(false);
  });
  it('<image> href 는 받아둘 이미지로 기록', () => {
    const r = copyAll('<svg><image href="pic.png"></image></svg>', true);
    expect(r.out.getAttribute('href')).toBe('https://site.test/pic.png');
    expect(r.imgs).toEqual(['https://site.test/pic.png']);
  });
});

describe('sanitizeSvgTree (SVG 심볼 defs)', () => {
  it('script·foreignObject·애니메이션을 지우고 속성을 정리한다', () => {
    // 파서 차이(happy-dom 의 SVG <script> 처리)를 피하려고 DOM API 로 만든다
    const mk = (tag: string, attrs: Record<string, string> = {}, kids: Element[] = []) => {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      e.append(...kids);
      return e;
    };
    const sym = mk('symbol', { id: 's', onclick: 'x()' }, [
      mk('script', {}, []),
      mk('foreignObject'),
      mk('a', { href: 'javascript:alert(1)' }, [mk('set', { attributeName: 'href', to: 'javascript:alert(2)' }), mk('path', { d: 'M0 0', style: 'fill:red', onload: 'y()' })]),
    ]);
    const out = sanitizeSvgTree(sym, BASE);
    expect(out.outerHTML).not.toMatch(/script|foreignObject|<set|onclick|onload|javascript/i);
    expect(out.querySelector('path')!.getAttribute('style')).toBe('fill:red');
    expect(out.querySelector('path')!.getAttribute('d')).toBe('M0 0');
  });
});

describe('SKIP_TAGS', () => {
  it('스크립트 통로가 되는 태그를 포함한다', () => {
    for (const t of ['script', 'style', 'template', 'base', 'set', 'animate', 'foreignobject']) expect(SKIP_TAGS.has(t)).toBe(true);
  });
});
