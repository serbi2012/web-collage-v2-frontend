import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { boxHeight, canPlace, clipIdsOf, duplicate, find, insert, makeBlock, makeBox, makeDoc, move, nudge, remove } from '../src/panel/tree';
import type { BoxNode } from '../src/shared/types';

function sample() {
  const doc = makeDoc('t', 2);
  const [b1, b2] = doc.root.children as BoxNode[];
  const x = makeBlock('clip-x');
  const y = makeBlock('clip-y');
  b1.children.push(x, y);
  return { doc, b1, b2, x, y };
}

describe('트리 조작', () => {
  it('find: 부모·위치·박스 단계', () => {
    const { doc, b1, y } = sample();
    const f = find(doc.root, y.id)!;
    expect(f.parent!.id).toBe(b1.id);
    expect(f.index).toBe(1);
    expect(find(doc.root, b1.id)!.depth).toBe(1);
  });

  it('move: 같은 박스 안 순서 바꾸기 (index 는 옮길 노드를 뺀 기준)', () => {
    const { doc, b1, x, y } = sample();
    expect(move(doc.root, y.id, b1.id, 0)).toBe(true);
    expect(b1.children.map((c) => c.id)).toEqual([y.id, x.id]);
  });

  it('move: 박스 간 이동', () => {
    const { doc, b1, b2, x } = sample();
    move(doc.root, x.id, b2.id, 0);
    expect(b2.children[0].id).toBe(x.id);
    expect(b1.children).toHaveLength(1);
  });

  it('박스를 자기 자신·자손 안으로 옮길 수 없다', () => {
    const { doc, b1 } = sample();
    const inner = makeBox('in');
    insert(doc.root, b1.id, 0, inner);
    expect(move(doc.root, b1.id, inner.id, 0)).toBe(false);
    expect(move(doc.root, b1.id, b1.id, 0)).toBe(false);
  });

  it('중첩은 최대 3단계', () => {
    const { doc, b1 } = sample();
    const l2 = makeBox('2');
    const l3 = makeBox('3');
    expect(insert(doc.root, b1.id, 0, l2)).toBe(true);
    expect(insert(doc.root, l2.id, 0, l3)).toBe(true);
    expect(insert(doc.root, l3.id, 0, makeBox('4'))).toBe(false);
    expect(insert(doc.root, l3.id, 0, makeBlock('c'))).toBe(true); // 블록은 OK
    // 2단계 박스 묶음을 2단계 안으로는 못 넣음 (2 + 2 > 3)
    const pair = makeBox('p');
    pair.children.push(makeBox('q'));
    expect(boxHeight(pair)).toBe(2);
    expect(canPlace(doc.root, pair, l2.id)).toBe(false);
    expect(canPlace(doc.root, pair, b1.id)).toBe(true);
  });

  it('nudge·duplicate·remove·clipIdsOf', () => {
    const { doc, b1, x, y } = sample();
    nudge(doc.root, x.id, 1);
    expect(b1.children.map((c) => c.id)).toEqual([y.id, x.id]);
    const copy = duplicate(doc.root, b1.id)!;
    expect(copy.id).not.toBe(b1.id);
    expect(clipIdsOf(doc.root).sort()).toEqual(['clip-x', 'clip-x', 'clip-y', 'clip-y']);
    remove(doc.root, copy.id);
    expect(clipIdsOf(doc.root)).toHaveLength(2);
  });

  it('immer draft 에서도 동작 (패널 Undo 기록용)', () => {
    const { doc, b2, x } = sample();
    const next = produce(doc, (d) => void move(d.root, x.id, b2.id, 0));
    expect(next).not.toBe(doc);
    expect((next.root.children[1] as BoxNode).children[0].id).toBe(x.id);
    expect((doc.root.children[0] as BoxNode).children[0].id).toBe(x.id); // 원본 불변
  });
});
