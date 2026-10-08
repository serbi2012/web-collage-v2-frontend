// Markdown 내보내기 (+이미지 zip) — PLAN M3
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type { BoxNode, Clip, CollageDoc, ID, TreeNode } from '../shared/types';
import { ASSET_RE } from '../shared/constants';
import { safeHost } from '../capture/url';

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/x-icon': 'ico',
};
export const extOf = (mime: string) => EXT[mime] || 'bin';

export function buildMarkdown(doc: CollageDoc, clips: Map<ID, Clip>, assetPath: (id: ID) => string | null): string {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  td.use(gfm);
  td.remove(['style', 'script', 'noscript', 'svg' as keyof HTMLElementTagNameMap]);
  const out: string[] = [`# ${doc.title}`, ''];

  const block = (clip: Clip | undefined) => {
    if (!clip) return;
    const html = clip.html.replace(new RegExp(ASSET_RE.source, 'g'), (_m, id: string) => assetPath(id) || '');
    const md = td.turndown(html).trim();
    if (md) out.push(md, '');
    if (clip.source.url && /^https?:/i.test(clip.source.url)) out.push(`> 출처: [${clip.source.title || safeHost(clip.source.url)}](${clip.source.url})`, '');
    out.push('---', '');
  };
  const node = (n: TreeNode, depth: number) => {
    if (n.kind === 'block') {
      if (n.type === 'note') {
        if (n.note) out.push(n.note, '', '---', '');
        return;
      }
      return block(n.clipId ? clips.get(n.clipId) : undefined);
    }
    box(n, depth);
  };
  const box = (b: BoxNode, depth: number) => {
    if (depth > 0 && b.title) out.push(`${'#'.repeat(Math.min(6, depth + 1))} ${b.title}`, '');
    for (const c of b.children) node(c, depth + 1);
  };
  box(doc.root, 0);
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}
