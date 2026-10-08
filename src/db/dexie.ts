// IndexedDB (Dexie) — 패널과 background 가 같은 익스텐션 origin 이라 같은 DB 를 쓴다 (PLAN §5, §7)
import Dexie, { type Table } from 'dexie';
import type { Asset, Clip, CollageDoc, ID } from '../shared/types';
import type { ClipResult, DragMeta, Rect } from '../shared/protocol';

/** background 의 진행 중 조각 보관소 (G18: service worker 가 잠들어도 사라지지 않게) */
export interface ClipStoreRow {
  id: ID;
  createdAt: number;
  meta?: DragMeta;
  rect?: Rect;
  viewport?: { w: number; h: number };
  tabId?: number;
  windowId?: number;
  clip?: ClipResult;
  readyAt?: number;
  endInfo?: { dropEffect: string | null; at: number };
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export class WcDB extends Dexie {
  collages!: Table<CollageDoc, ID>;
  clips!: Table<Clip, ID>;
  assets!: Table<Asset, ID>;
  clipStore!: Table<ClipStoreRow, ID>;
  settings!: Table<SettingRow, string>;

  constructor() {
    super('web-collage');
    // 스키마 버전 관리: 바꿀 때는 version(2).stores(...).upgrade(...) 를 아래에 추가 (src/db/migrations.ts 참고)
    this.version(1).stores({
      collages: 'id, updatedAt',
      clips: 'id, source.url',
      assets: 'id',
      clipStore: 'id, createdAt',
      settings: 'key',
    });
  }
}

export const db = new WcDB();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}
export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}
