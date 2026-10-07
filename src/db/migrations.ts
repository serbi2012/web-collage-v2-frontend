// 마이그레이션 틀 (PLAN M3)
// CollageDoc.schemaVersion 은 문서 안 구조의 버전, Dexie version() 은 테이블·인덱스 버전이다.
// 문서 구조를 바꿀 때는 여기에 변환 함수를 추가하고 migrateDoc 에서 차례로 적용한다.
import type { CollageDoc } from '../shared/types';

export const CURRENT_DOC_SCHEMA = 1 as const;

type AnyDoc = Omit<CollageDoc, 'schemaVersion'> & { schemaVersion: number };
const steps: Record<number, (d: AnyDoc) => AnyDoc> = {
  // 예) 1: (d) => ({ ...d, schemaVersion: 2, ...변환 }),
};

export function migrateDoc(doc: AnyDoc): CollageDoc {
  let d = doc;
  while (d.schemaVersion < CURRENT_DOC_SCHEMA) {
    const step = steps[d.schemaVersion];
    if (!step) throw new Error(`schemaVersion ${d.schemaVersion} 변환 함수가 없습니다`);
    d = step(d);
  }
  return d as CollageDoc;
}
