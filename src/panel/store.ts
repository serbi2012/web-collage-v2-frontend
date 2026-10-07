// 패널 상태: CollageDoc 트리 + Undo/Redo (PLAN M2). 문서가 작아서 immer 의 구조 공유 스냅샷을 그대로 history 로 쓴다.
import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { CollageDoc, CollageMeta, ID } from '../shared/types';

const HISTORY_LIMIT = 100;

export interface BlockUi {
  status: 'loading' | 'error' | 'ready';
  preview?: string;
  error?: string;
}

interface PanelState {
  doc: CollageDoc | null;
  past: CollageDoc[];
  future: CollageDoc[];
  collages: CollageMeta[];
  scrapEnabled: boolean;
  /** 블록별 일시 상태 (가져오는 중·실패). 저장하지 않음 */
  blockUi: Record<ID, BlockUi>;
  /** 블록별 원본 비교 표시. 저장하지 않음 */
  compare: Record<ID, boolean>;
  /** 조각 렌더 데이터가 바뀌었을 때 다시 그리게 하는 카운터 (clipId → n) */
  clipVer: Record<ID, number>;

  /** 문서 변경. history:false 면 Undo 기록을 남기지 않는다(드롭 직후 clipId 보정 등) */
  apply: (recipe: (d: Draft<CollageDoc>) => void, opts?: { history?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  setDoc: (doc: CollageDoc | null) => void;
  setCollages: (list: CollageMeta[]) => void;
  setScrap: (v: boolean) => void;
  setBlockUi: (id: ID, ui: BlockUi | null) => void;
  toggleCompare: (id: ID) => void;
  bumpClip: (clipId: ID) => void;
}

export const usePanel = create<PanelState>((set, get) => ({
  doc: null,
  past: [],
  future: [],
  collages: [],
  scrapEnabled: true,
  blockUi: {},
  compare: {},
  clipVer: {},

  apply: (recipe, opts = {}) => {
    const { doc, past } = get();
    if (!doc) return;
    const next = produce(doc, (d) => {
      recipe(d);
      d.updatedAt = Date.now();
    });
    if (next === doc) return;
    if (opts.history === false) set({ doc: next });
    else set({ doc: next, past: [...past, doc].slice(-HISTORY_LIMIT), future: [] });
  },
  undo: () => {
    const { doc, past, future } = get();
    if (!doc || !past.length) return;
    const prev = past[past.length - 1];
    set({ doc: { ...prev, updatedAt: Date.now() }, past: past.slice(0, -1), future: [doc, ...future] });
  },
  redo: () => {
    const { doc, past, future } = get();
    if (!doc || !future.length) return;
    const [next, ...rest] = future;
    set({ doc: { ...next, updatedAt: Date.now() }, past: [...past, doc], future: rest });
  },
  setDoc: (doc) => set({ doc, past: [], future: [], compare: {} }),
  setCollages: (collages) => set({ collages }),
  setScrap: (scrapEnabled) => set({ scrapEnabled }),
  setBlockUi: (id, ui) =>
    set((s) => {
      const blockUi = { ...s.blockUi };
      if (ui) blockUi[id] = ui;
      else delete blockUi[id];
      return { blockUi };
    }),
  toggleCompare: (id) => set((s) => ({ compare: { ...s.compare, [id]: !s.compare[id] } })),
  bumpClip: (clipId) => set((s) => ({ clipVer: { ...s.clipVer, [clipId]: (s.clipVer[clipId] || 0) + 1 } })),
}));
