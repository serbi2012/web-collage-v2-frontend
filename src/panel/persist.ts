// 콜라주 저장·불러오기 (PLAN M3): 변경마다 디바운스 자동 저장, 콜라주 여러 개
import { db, getSetting, setSetting } from '../db/dexie';
import { collectGarbage } from '../db/assets';
import { migrateDoc } from '../db/migrations';
import type { CollageDoc, CollageMeta, ID } from '../shared/types';
import { makeDoc } from './tree';
import { usePanel } from './store';

const SAVE_DEBOUNCE_MS = 300;
const CURRENT_KEY = 'currentCollage';

export async function listCollages(): Promise<CollageMeta[]> {
  const all = await db.collages.orderBy('updatedAt').reverse().toArray();
  return all.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }));
}

async function refreshList() {
  usePanel.getState().setCollages(await listCollages());
}

export async function openCollage(id: ID | null) {
  await flushSave();
  let doc: CollageDoc | undefined = id ? await db.collages.get(id) : undefined;
  if (!doc) {
    const list = await listCollages();
    doc = list.length ? await db.collages.get(list[0].id) : undefined;
  }
  if (!doc) {
    doc = makeDoc('내 콜라주', 1);
    await db.collages.put(doc);
  }
  doc = migrateDoc(doc);
  lastSaved = doc;
  usePanel.getState().setDoc(doc);
  await setSetting(CURRENT_KEY, doc.id);
  await refreshList();
}

export async function newCollage(title = '새 콜라주') {
  const doc = makeDoc(title, 1);
  await db.collages.put(doc);
  await openCollage(doc.id);
}

export async function deleteCollage(id: ID) {
  await flushSave();
  await db.collages.delete(id);
  await openCollage(null);
  collectGarbage().catch(() => {});
}

export async function initPersistence() {
  await openCollage(await getSetting<ID | null>(CURRENT_KEY, null));
  usePanel.subscribe((s, prev) => {
    if (s.doc && s.doc !== prev.doc) scheduleSave();
  });
  addEventListener('pagehide', () => void flushSave());
  // 오래된 조각·에셋 정리 (패널을 열 때 한 번)
  setTimeout(() => collectGarbage().catch(() => {}), 5000);
}

let timer: ReturnType<typeof setTimeout> | null = null;
let lastSaved: CollageDoc | null = null;
function scheduleSave() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS);
}
export async function flushSave() {
  if (timer) clearTimeout(timer);
  timer = null;
  const doc = usePanel.getState().doc;
  if (!doc || doc === lastSaved) return;
  lastSaved = doc;
  await db.collages.put(doc);
  const list = usePanel.getState().collages;
  const i = list.findIndex((c) => c.id === doc.id);
  if (i < 0 || list[i].title !== doc.title) await refreshList();
}
