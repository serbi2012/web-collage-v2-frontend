// 내보내기 실행 (패널·인쇄 페이지에서 사용)
import { strToU8, zipSync } from 'fflate';
import { db } from '../db/dexie';
import { blobToDataUrl } from '../bg/screenshot';
import type { Clip, CollageDoc, ID } from '../shared/types';
import { clipIdsOf } from '../panel/tree';
import { flushSave } from '../panel/persist';
import { assetIdsOfClip, buildExportHtml } from './html';
import { buildMarkdown, extOf } from './markdown';

async function loadClips(doc: CollageDoc): Promise<Map<ID, Clip>> {
  const ids = [...new Set(clipIdsOf(doc.root))];
  const rows = await db.clips.bulkGet(ids);
  return new Map(rows.filter((c): c is Clip => !!c).map((c) => [c.id, c]));
}

export async function exportHtmlString(doc: CollageDoc): Promise<string> {
  const clips = await loadClips(doc);
  const assetIds = new Set<ID>();
  for (const c of clips.values()) for (const id of assetIdsOfClip(c)) assetIds.add(id);
  const assets = new Map<ID, string>();
  const rows = await db.assets.bulkGet([...assetIds]);
  await Promise.all(rows.map(async (a) => a && assets.set(a.id, await blobToDataUrl(a.blob))));
  return buildExportHtml({
    doc,
    clips,
    assets,
    parse: (html) => {
      const t = document.createElement('template');
      t.innerHTML = html;
      return t.content;
    },
    serialize: (frag) => {
      const d = document.createElement('div');
      d.appendChild(frag.cloneNode(true));
      return d.innerHTML;
    },
  });
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 80) || 'collage';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function exportHtmlFile(doc: CollageDoc) {
  await flushSave();
  const html = await exportHtmlString(doc);
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName(doc.title)}.html`);
}

export async function exportMarkdownZip(doc: CollageDoc) {
  await flushSave();
  const clips = await loadClips(doc);
  const files: Record<string, Uint8Array> = {};
  const paths = new Map<ID, string>();
  const ids = new Set<ID>();
  for (const c of clips.values()) for (const id of Object.values(c.assetMap || {})) ids.add(id);
  const rows = await db.assets.bulkGet([...ids]);
  for (const a of rows) {
    if (!a || !a.mime.startsWith('image/')) continue;
    const p = `assets/${a.id.slice(0, 16)}.${extOf(a.mime)}`;
    paths.set(a.id, p);
    files[p] = new Uint8Array(await a.blob.arrayBuffer());
  }
  files['collage.md'] = strToU8(buildMarkdown(doc, clips, (id) => paths.get(id) || null));
  const zip = zipSync(files, { level: 6 });
  download(new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' }), `${safeName(doc.title)}.zip`);
}

export async function openPrint(doc: CollageDoc) {
  await flushSave();
  await chrome.tabs.create({ url: chrome.runtime.getURL(`/print.html?id=${encodeURIComponent(doc.id)}`) });
}
