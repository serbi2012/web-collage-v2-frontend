// [E2E 전용 훅] 패널 (TEST_CASES §3) — main.tsx 에서 `if (__E2E__)` 로만 부른다. 배포 빌드에선 호출이 제거되고
// 이 모듈도 트리 셰이킹으로 빠진다. scripts/check-no-testhooks.mjs 가 배포 빌드를 grep 해서 확인한다.
import { db } from '../db/dexie';
import { makeBox, makeDoc } from '../panel/tree';
import { exportHtmlString } from '../export/actions';
import { flushSave, openCollage } from '../panel/persist';
import { usePanel } from '../panel/store';

export function installPanelTestHooks() {
  const w = window as unknown as Record<string, unknown>;
  w.__wcTest = {
    /** 빈 콜라주(박스 n개)로 시작 — 스크립트마다 앞 테스트가 남긴 블록에 영향받지 않게 */
    async reset(boxes = 2) {
      const doc = makeDoc('E2E', boxes);
      await db.collages.put(doc);
      await openCollage(doc.id);
      return doc.id;
    },
    doc: () => usePanel.getState().doc,
    clip: (id: string) => db.clips.get(id),
    /** 긴 패널 만들기 (자동 스크롤 테스트) */
    addBoxes(n: number) {
      usePanel.getState().apply((d) => {
        for (let i = 0; i < n; i++) d.root.children.push(makeBox(`Filler ${i + 1}`));
      });
    },
    exportHtml: async () => exportHtmlString(usePanel.getState().doc!),
    flush: () => flushSave(),
    counts: async () => ({ collages: await db.collages.count(), clips: await db.clips.count(), assets: await db.assets.count() }),
  };
}
