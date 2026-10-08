// 콜라주 트리 조작 (순수 함수, immer draft 에도 그대로 쓸 수 있게 제자리 변경) — 단위 테스트: tests/tree.test.ts
import { MAX_BOX_DEPTH } from '../shared/constants';
import type { BlockNode, BoxNode, CollageDoc, DisplayMode, ID, TreeNode } from '../shared/types';

export const uid = (): ID => crypto.randomUUID();

export function makeBox(title?: string, direction: BoxNode['direction'] = 'column'): BoxNode {
  return { kind: 'box', id: uid(), title, direction, children: [] };
}
export function makeBlock(clipId: ID, display: DisplayMode = 'fit'): BlockNode {
  return { kind: 'block', id: uid(), type: 'clip', clipId, display };
}

/** M5 메모 블록 */
export function makeNote(text = ''): BlockNode {
  return { kind: 'block', id: uid(), type: 'note', note: text, display: 'fit' };
}

export function makeDoc(title = '새 콜라주', boxes = 1): CollageDoc {
  const now = Date.now();
  const root = makeBox(undefined, 'column');
  for (let i = 0; i < boxes; i++) root.children.push(makeBox(`Box ${i + 1}`));
  return { id: uid(), title, theme: 'light', root, createdAt: now, updatedAt: now, schemaVersion: 1 };
}

export interface Found {
  node: TreeNode;
  parent: BoxNode | null;
  index: number;
  /** 박스 단계: 최상위(root) = 0, root 의 자식 박스 = 1 … */
  depth: number;
}

export function find(root: BoxNode, id: ID): Found | null {
  if (root.id === id) return { node: root, parent: null, index: -1, depth: 0 };
  const stack: Array<{ box: BoxNode; depth: number }> = [{ box: root, depth: 0 }];
  while (stack.length) {
    const { box, depth } = stack.pop()!;
    for (let i = 0; i < box.children.length; i++) {
      const c = box.children[i];
      if (c.id === id) return { node: c, parent: box, index: i, depth: c.kind === 'box' ? depth + 1 : depth };
      if (c.kind === 'box') stack.push({ box: c, depth: depth + 1 });
    }
  }
  return null;
}

/** 이 노드 아래 박스가 몇 단계 쌓여 있는지 (블록 = 0, 빈 박스 = 1) */
export function boxHeight(n: TreeNode): number {
  if (n.kind !== 'box') return 0;
  let h = 0;
  for (const c of n.children) h = Math.max(h, boxHeight(c));
  return 1 + h;
}

export function contains(ancestor: TreeNode, id: ID): boolean {
  if (ancestor.id === id) return true;
  return ancestor.kind === 'box' && ancestor.children.some((c) => contains(c, id));
}

/** parent 박스 안에 node 를 넣을 수 있는지 (중첩 최대 MAX_BOX_DEPTH 단계) */
export function canPlace(root: BoxNode, node: TreeNode, parentId: ID): boolean {
  const p = find(root, parentId);
  if (!p || p.node.kind !== 'box') return false;
  if (contains(node, parentId)) return false; // 자기 자신(또는 자손) 안으로는 못 넣음
  return p.depth + boxHeight(node) <= MAX_BOX_DEPTH;
}

export function insert(root: BoxNode, parentId: ID, index: number, node: TreeNode): boolean {
  if (!canPlace(root, node, parentId)) return false;
  const p = find(root, parentId)!.node as BoxNode;
  const i = Math.max(0, Math.min(index, p.children.length));
  p.children.splice(i, 0, node);
  return true;
}

export function remove(root: BoxNode, id: ID): TreeNode | null {
  const f = find(root, id);
  if (!f || !f.parent) return null;
  return f.parent.children.splice(f.index, 1)[0];
}

/**
 * id 노드를 parentId 박스의 index 위치로 옮긴다. index 는 "옮길 노드를 뺀 뒤" 기준 (패널 DOM 에서 자기 자신을 빼고 계산한 값).
 */
export function move(root: BoxNode, id: ID, parentId: ID, index: number): boolean {
  const f = find(root, id);
  if (!f || !f.parent) return false;
  if (!canPlace(root, f.node, parentId)) return false;
  // canPlace 는 옮길 노드가 원래 자리에 있는 상태로 depth 를 재지만, 자기 자손으로는 못 가므로 결과는 같다
  const node = f.parent.children.splice(f.index, 1)[0];
  const p = find(root, parentId)!.node as BoxNode;
  p.children.splice(Math.max(0, Math.min(index, p.children.length)), 0, node);
  return true;
}

/** 같은 부모 안에서 한 칸 위/아래로 (키보드 대안) */
export function nudge(root: BoxNode, id: ID, delta: -1 | 1): boolean {
  const f = find(root, id);
  if (!f || !f.parent) return false;
  const j = f.index + delta;
  if (j < 0 || j >= f.parent.children.length) return false;
  const arr = f.parent.children;
  [arr[f.index], arr[j]] = [arr[j], arr[f.index]];
  return true;
}

/** 새 id 로 깊은 복제 (조각(clip)은 불변이라 같은 clipId 를 공유해도 된다) */
export function cloneWithNewIds<T extends TreeNode>(n: T): T {
  if (n.kind === 'block') return { ...n, id: uid() };
  return { ...n, id: uid(), children: n.children.map((c) => cloneWithNewIds(c)) } as T;
}

export function duplicate(root: BoxNode, id: ID): TreeNode | null {
  const f = find(root, id);
  if (!f || !f.parent) return null;
  const copy = cloneWithNewIds(f.node);
  f.parent.children.splice(f.index + 1, 0, copy);
  return copy;
}

export function walk(n: TreeNode, fn: (n: TreeNode, depth: number) => void, depth = 0) {
  fn(n, depth);
  if (n.kind === 'box') for (const c of n.children) walk(c, fn, depth + 1);
}

export function clipIdsOf(n: TreeNode): ID[] {
  const out: ID[] = [];
  walk(n, (x) => {
    if (x.kind === 'block' && x.clipId) out.push(x.clipId);
  });
  return out;
}
