// M5 조각 안 글자 직접 편집: 편집본은 **새 조각으로 갈라** 저장한다 (원본 조각은 그대로 → 되돌리기·복제 블록에 영향 없음)
import DOMPurify from 'dompurify';
import { db } from '../db/dexie';
import type { ID } from '../shared/types';
import { forgetRenderable, unresolveAssets } from './render';

/**
 * 편집한 HTML 은 사용자가 붙여 넣은 외부 HTML 이 섞일 수 있으므로 DOMPurify 를 거친다 (D17).
 * 우리 조각에 필요한 인라인 style·data-wc* 속성과 SVG 는 남긴다.
 */
export function sanitizeEdited(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'base', 'meta', 'link'],
    ALLOWED_URI_REGEXP: /^(?:https?:|wc-asset:|data:image\/|#)/i,
  });
}

export async function saveEditedClip(clipId: ID, wrap: HTMLElement): Promise<ID | null> {
  const old = await db.clips.get(clipId);
  if (!old) return null;
  const copy = wrap.cloneNode(true) as HTMLElement;
  copy.querySelector(':scope > svg.ink')?.remove(); // 주석은 블록에 따로 저장
  copy.querySelectorAll('img[data-wc-fallback]').forEach((img) => img.removeAttribute('src')); // 대체 이미지는 렌더 때 다시 채움
  const html = sanitizeEdited(unresolveAssets(copy.innerHTML));
  if (html === old.html) return null;
  const id = crypto.randomUUID();
  const text = (copy.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  await db.clips.put({ ...old, id, html, text, stats: { ...old.stats, htmlBytes: html.length } });
  forgetRenderable(id);
  return id;
}
