// 패널 드롭 위치 계산·삽입선·자동 스크롤 (PLAN M2)
// DOM 규칙: 박스 = .box[data-id], 그 자식 목록 = .blocks[data-children-of][data-dir], 자식 = [data-node-id]
//           최상위(root) 자식 목록 = #board > .blocks.root-children, 새 박스 영역 = .new-box

export type Spot =
  | { kind: 'new' }
  | { kind: 'into'; parentId: string; index: number; container: HTMLElement; children: HTMLElement[]; dir: 'column' | 'row' };

/** 패널 안에서 옮기는 중인 노드 (dragover 중엔 dataTransfer 를 읽을 수 없어서 따로 기억) */
export let movingNodeId: string | null = null;
export function setMoving(id: string | null) {
  movingNodeId = id;
}

/**
 * [G17 수정] 고정 헤더 위나 박스 밖이면 null (마지막 박스로 들어가지 않음).
 * 박스가 중첩돼 있으면 가장 안쪽 박스에 들어간다.
 */
export function dropSpot(x: number, y: number): Spot | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;
  if (el.closest('.top, #logwrap')) return null;
  if (el.closest('.new-box')) return { kind: 'new' };
  let container: HTMLElement | null = null;
  const box = el.closest<HTMLElement>('.box[data-id]');
  if (box) container = box.querySelector<HTMLElement>(':scope > .blocks');
  else if (el.closest('#board')) container = document.querySelector<HTMLElement>('#board > .root-children');
  if (!container) return null;
  // 옮기는 중인 박스 자신(또는 그 안)에 놓으려는 경우: 그 박스의 부모 목록 기준으로
  if (movingNodeId) {
    const moving = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(movingNodeId)}"]`);
    if (moving && moving.classList.contains('box') && moving.contains(container)) {
      const outer = moving.parentElement?.closest<HTMLElement>('.blocks');
      if (!outer) return null;
      container = outer;
    }
  }
  const dir = (container.dataset.dir as 'column' | 'row') || 'column';
  const children = Array.from(container.children).filter(
    (c): c is HTMLElement => c instanceof HTMLElement && !!c.dataset.nodeId && c.dataset.nodeId !== movingNodeId,
  );
  let index = children.length;
  for (let i = 0; i < children.length; i++) {
    const r = children[i].getBoundingClientRect();
    const before = dir === 'row' ? x < r.left + r.width / 2 && y < r.bottom : y < r.top + r.height / 2;
    if (before) {
      index = i;
      break;
    }
  }
  return { kind: 'into', parentId: container.dataset.childrenOf!, index, container, children, dir };
}

export function showIndicator(ind: HTMLElement, spot: Spot | null) {
  document.querySelectorAll('.box.over, .board.over').forEach((b) => b.classList.remove('over'));
  if (!spot) {
    ind.style.display = 'none';
    return;
  }
  if (spot.kind === 'new') {
    document.querySelector('.new-box')?.classList.add('over');
    ind.style.display = 'none';
    return;
  }
  (spot.container.closest('.box') || spot.container.closest('.board'))?.classList.add('over');
  const lr = spot.container.getBoundingClientRect();
  const { children, index, dir } = spot;
  if (dir === 'row' && children.length) {
    let x: number;
    if (index < children.length) x = children[index].getBoundingClientRect().left - 5;
    else x = children[children.length - 1].getBoundingClientRect().right + 5;
    Object.assign(ind.style, { display: 'block', left: x - 1 + 'px', top: lr.top + 'px', width: '3px', height: lr.height + 'px' });
    return;
  }
  let y: number;
  if (!children.length) y = lr.top + lr.height / 2;
  else if (index < children.length) y = children[index].getBoundingClientRect().top - 5;
  else y = children[children.length - 1].getBoundingClientRect().bottom + 5;
  Object.assign(ind.style, { display: 'block', left: lr.left + 'px', width: lr.width + 'px', top: y - 1 + 'px', height: '3px' });
}

/** [G17 수정] 긴 패널: 드래그 중 위·아래 가장자리에 가면 자동 스크롤 (dragover 는 마우스가 멈춰 있어도 계속 온다) */
export function autoScroll(y: number) {
  const top = document.querySelector('.top')?.getBoundingClientRect().bottom || 0;
  const EDGE = 56;
  if (y < top + EDGE) window.scrollBy(0, -Math.ceil((top + EDGE - y) / 3));
  else if (y > innerHeight - EDGE) window.scrollBy(0, Math.ceil((y - (innerHeight - EDGE)) / 3));
}
