// 단일 HTML 내보내기 (PLAN M3): 에셋 인라인(data URL), 오프라인에서 열림, CSP 메타로 스크립트 금지 (§6.4)
// 조각은 Declarative Shadow DOM(<template shadowrootmode>)으로 격리해서 패널과 같은 모양을 유지한다.
import type { BlockNode, BoxNode, Clip, CollageDoc, ID, TreeNode } from '../shared/types';
import { ASSET_RE } from '../shared/constants';
import { safeHost } from '../capture/url';
import { bgCss, inkSvgString, READABLE_CSS } from '../panel/render';
import { LANG, t } from '../shared/i18n';

export const EXPORT_WIDTH = 920;

export interface ExportInput {
  doc: CollageDoc;
  clips: Map<ID, Clip>;
  /** asset id → data URL (없으면 빈 문자열) */
  assets: Map<ID, string>;
  /** 템플릿 HTML 을 파싱해 대체 이미지 src 를 넣을 때 쓰는 문서 (패널 document) */
  parse: (html: string) => DocumentFragment;
  serialize: (frag: DocumentFragment) => string;
}

export const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** <style> 안의 CSS 가 "</style>" 로 빠져나가지 못하게 */
export const escCss = (s: string) => s.replace(/</g, '\\3c ');

const THEMES: Record<string, { bg: string; panel: string; ink: string; muted: string; line: string }> = {
  light: { bg: '#f6f6f4', panel: '#ffffff', ink: '#1d1d1f', muted: '#6b6b70', line: '#e3e2de' },
  dark: { bg: '#17171a', panel: '#212125', ink: '#ececef', muted: '#9c9ca3', line: '#34343a' },
  sepia: { bg: '#f1e7d0', panel: '#fbf4e4', ink: '#3b2f1e', muted: '#7b6a52', line: '#e0d2b4' },
};

const REFLOW_CSS = `.wrap{width:auto!important;max-width:100%}.wrap *{max-width:100%!important;box-sizing:border-box}.wrap [data-wc-root]{width:auto!important}.wrap img,.wrap svg,.wrap video{height:auto!important}`;

function replaceAssets(text: string, assets: Map<ID, string>): string {
  return text.replace(new RegExp(ASSET_RE.source, 'g'), (_m, id: string) => assets.get(id) || '');
}

export function assetIdsOfClip(c: Clip): ID[] {
  const ids = new Set<ID>();
  for (const t of [c.html, c.css, c.defs, ...(c.fontFaces || [])]) for (const m of (t || '').matchAll(new RegExp(ASSET_RE.source, 'g'))) ids.add(m[1]);
  for (const f of c.fallbacks || []) if (f.assetId) ids.add(f.assetId);
  return [...ids];
}

export function buildExportHtml(input: ExportInput): string {
  const { doc, clips, assets } = input;
  const theme = THEMES[doc.theme] || THEMES.light;
  const fontFaces = new Set<string>();

  const renderBlock = (clip: Clip | undefined, node: BlockNode, avail: number): string => {
    const { display } = node;
    const withBg = node.bg !== false;
    if (node.type === 'note') return `<figure class="block note"><div class="note">${escHtml(node.note || '')}</div></figure>`;
    if (!clip) return `<figure class="block missing"><div class="ph">${escHtml(t('missingClip'))}</div></figure>`;
    for (const f of clip.fontFaces || []) fontFaces.add(replaceAssets(f, assets));
    // 대체 이미지(canvas·iframe·video 화면 캡처) 넣기
    const frag = input.parse(clip.html);
    frag.querySelectorAll('img[data-wc-fallback]').forEach((img) => {
      const f = (clip.fallbacks || []).find((x) => x.n === Number(img.getAttribute('data-wc-fallback')));
      if (f?.assetId) img.setAttribute('src', 'wc-asset:' + f.assetId);
    });
    const html = replaceAssets(input.serialize(frag), assets);
    const w = clip.width;
    const sc = node.scale || 1;
    const base = display === 'fit' && w && w > avail ? avail / w : 1;
    const zoom = display === 'fit' ? Math.min(base * sc, w ? avail / w : sc) : sc;
    const css = `:host{all:initial;display:block;overflow:${display === 'original' ? 'auto' : 'hidden'}}
.wrap{position:relative;width:${w ? w + 'px' : 'auto'};zoom:${zoom.toFixed(4)};${withBg ? replaceAssets(bgCss(clip.ancestorBg) || '', assets) : ''}}
${display === 'reflow' ? REFLOW_CSS : ''}
${replaceAssets(clip.css || '', assets)}
${doc.readable ? READABLE_CSS : ''}`;
    const src = clip.source.url && /^https?:/i.test(clip.source.url) ? clip.source.url : '';
    const cap = src
      ? `<figcaption>${t('source')}: <a href="${escHtml(src)}" rel="noopener noreferrer">${escHtml(clip.source.title || safeHost(src))}</a> · ${escHtml(safeHost(src))}</figcaption>`
      : '';
    return (
      `<figure class="block"><div class="clip"><template shadowrootmode="open"><style>${escCss(css)}</style>` +
      replaceAssets(clip.defs || '', assets) +
      `<div class="wrap">${html}${inkSvgString(node.ink)}</div></template></div>${cap}</figure>`
    );
  };

  const renderNode = (n: TreeNode, avail: number, depth: number): string => {
    if (n.kind === 'block') return renderBlock(n.clipId ? clips.get(n.clipId) : undefined, n, avail);
    return renderBox(n, avail, depth);
  };
  const renderBox = (b: BoxNode, avail: number, depth: number): string => {
    const inner = avail - (depth > 0 ? 22 : 0);
    const per = b.direction === 'row' && b.children.length ? (inner - 10 * (b.children.length - 1)) / b.children.length : inner;
    const kids = b.children.map((c) => renderNode(c, Math.max(120, per), depth + 1)).join('');
    if (depth === 0) return `<div class="kids dir-${b.direction}">${kids}</div>`;
    return `<section class="box dir-${b.direction}">${b.title ? `<h2>${escHtml(b.title)}</h2>` : ''}<div class="kids dir-${b.direction}">${kids}</div></section>`;
  };

  const body = renderBox(doc.root, EXPORT_WIDTH, 0);
  const css = `:root{--ink:${theme.ink};--panel:${theme.panel};--line:${theme.line};--muted:${theme.muted};--accent:#ff5a5f}*{box-sizing:border-box}html,body{margin:0;background:${theme.bg};color:${theme.ink};font:15px/1.6 system-ui,-apple-system,"Malgun Gothic","Noto Sans KR",sans-serif}
main{max-width:${EXPORT_WIDTH + 48}px;margin:0 auto;padding:32px 24px 64px}
header h1{font-size:26px;margin:0 0 4px}header p{margin:0 0 24px;color:${theme.muted};font-size:13px}
.kids{display:flex;flex-direction:column;gap:14px}.kids.dir-row{flex-direction:row;flex-wrap:wrap;align-items:flex-start}.kids.dir-row>*{flex:1 1 0;min-width:120px}
.box{background:${theme.panel};border:1px solid ${theme.line};border-radius:10px;padding:10px}
.box h2{margin:0 0 8px;font-size:13px;color:${theme.muted};font-weight:600}
.block{margin:0;border:1px solid ${theme.line};border-radius:8px;overflow:hidden;background:${doc.readable ? theme.panel : '#fff'};break-inside:avoid}
.block figcaption{font-size:11px;color:#6b6b70;padding:4px 8px;border-top:1px solid #eee;background:#fafafa}
.block figcaption a{color:inherit}.ph{padding:12px;color:#999}.block.note{background:#fffbe6}.note{padding:10px 12px;white-space:pre-wrap;color:#1d1d1f}
@media print{body{background:#fff}main{padding:0}.box{break-inside:auto}}`;
  const created = new Date().toLocaleString(LANG === 'ko' ? 'ko-KR' : 'en-US');
  return `<!doctype html>
<html lang="${LANG}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; base-uri 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Web Collage 2">
<title>${escHtml(doc.title)}</title>
<style>${escCss([...fontFaces].join('\n'))}</style>
<style>${css}</style>
</head><body><main><header><h1>${escHtml(doc.title)}</h1><p>${escHtml(t('exportFooter', created))}</p></header>
${body}
</main></body></html>`;
}
