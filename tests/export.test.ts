import { describe, expect, it } from 'vitest';
import { buildExportHtml, escCss, escHtml } from '../src/export/html';
import { buildMarkdown } from '../src/export/markdown';
import { makeBlock, makeDoc } from '../src/panel/tree';
import type { BoxNode, Clip } from '../src/shared/types';

const ID = 'a'.repeat(64);

function fixture() {
  const doc = makeDoc('제목 <b>', 1);
  const box = doc.root.children[0] as BoxNode;
  box.title = '박스</h2><script>';
  box.children.push(makeBlock('c1'));
  const clip: Clip = {
    id: 'c1',
    kind: 'element',
    source: { url: 'https://site.test/p?a=1&b=2', title: 'Site "T"', capturedAt: 0, via: 'native', tag: 'div' },
    html: `<div data-wc-root="" style="background:url(&quot;wc-asset:${ID}&quot;)"><h3>Hello</h3><img src="wc-asset:${ID}" alt="pic"><p>world</p></div>`,
    css: `[data-wcid="1"]::before{content:"</style><script>alert(1)</script>"}`,
    defs: '',
    width: 1200,
    height: 300,
    fontFaces: [`@font-face { font-family: "wc-000000-x"; src: url("wc-asset:${ID}") }`],
    assetMap: { 'https://site.test/a.png': ID },
    fallbacks: [],
    text: 'Hello world',
    stats: { nodes: 4, htmlBytes: 100, snapshotMs: 1 },
  };
  return { doc, clips: new Map([['c1', clip]]) };
}

describe('HTML 내보내기', () => {
  const { doc, clips } = fixture();
  const html = buildExportHtml({
    doc,
    clips,
    assets: new Map([[ID, 'data:image/png;base64,QUJD']]),
    parse: (h) => {
      const t = document.createElement('template');
      t.innerHTML = h;
      return t.content;
    },
    serialize: (f) => {
      const d = document.createElement('div');
      d.appendChild(f.cloneNode(true));
      return d.innerHTML;
    },
  });

  it('CSP 메타로 스크립트 금지', () => {
    expect(html).toContain(`content="script-src 'none'`);
  });
  it('에셋 인라인 (wc-asset 참조가 남지 않음)', () => {
    expect(html).not.toContain('wc-asset:');
    expect(html).toContain('data:image/png;base64,QUJD');
  });
  it('CSS 가 </style> 로 빠져나가지 못한다', () => {
    expect(html).not.toMatch(/<\/style><script>/i);
    expect(html).toContain('\\3c /style>');
  });
  it('제목·출처는 이스케이프', () => {
    expect(html).toContain('제목 &lt;b&gt;');
    expect(html).toContain('박스&lt;/h2&gt;&lt;script&gt;');
    expect(html).toContain('href="https://site.test/p?a=1&amp;b=2"');
  });
  it('fit: 내보내기 폭보다 넓으면 zoom 으로 축소, Declarative Shadow DOM 으로 격리', () => {
    expect(html).toMatch(/zoom:0\.\d+/);
    expect(html).toContain('<template shadowrootmode="open">');
  });
  it('escHtml/escCss', () => {
    expect(escHtml(`<a href="x">&`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
    expect(escCss('a</style>b')).toBe('a\\3c /style>b');
  });
});

describe('Markdown 내보내기', () => {
  it('박스 제목은 제목으로, 이미지는 zip 안 경로로, 출처 표기', () => {
    const { doc, clips } = fixture();
    const md = buildMarkdown(doc, clips, () => 'assets/pic.png');
    expect(md).toMatch(/^# 제목 <b>/);
    expect(md).toContain('### Hello');
    expect(md).toContain('![pic](assets/pic.png)');
    expect(md).toContain('> 출처: [Site "T"](https://site.test/p?a=1&b=2)');
  });
});
