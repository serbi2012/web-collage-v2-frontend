import { useState } from 'react';
import type { BoxNode, TreeNode } from '../shared/types';
import { MAX_BOX_DEPTH } from '../shared/constants';
import { WC_MOVE_MIME } from '../shared/protocol';
import { usePanel } from './store';
import { BlockView } from './BlockView';
import { setMoving } from './dnd';
import { duplicate, find, insert, makeBox, nudge, remove } from './tree';

export function Children({ box, depth }: { box: BoxNode; depth: number }) {
  return (
    <>
      {box.children.map((c: TreeNode) =>
        c.kind === 'box' ? <BoxView key={c.id} node={c} depth={depth + 1} /> : <BlockView key={c.id} node={c} />,
      )}
    </>
  );
}

export function BoxView({ node, depth }: { node: BoxNode; depth: number }) {
  const apply = usePanel((s) => s.apply);
  const [editing, setEditing] = useState(false);
  const boxIndex = usePanel((s) => {
    // 하네스 계약: 첫 박스는 .box[data-box="0"] (문서 순서 기준)
    let i = 0;
    let found = -1;
    const walk = (b: BoxNode) => {
      for (const c of b.children) {
        if (c.kind !== 'box') continue;
        if (c.id === node.id) found = i;
        i++;
        walk(c);
      }
    };
    if (s.doc) walk(s.doc.root);
    return found;
  });
  const setTitle = (title: string) =>
    apply((d) => {
      const f = find(d.root, node.id);
      if (f && f.node.kind === 'box') f.node.title = title.trim() || undefined;
    });

  return (
    <section className={`box depth-${depth}`} data-id={node.id} data-node-id={node.id} data-box={boxIndex} data-testid="box">
      <div
        className="box-head"
        draggable={!editing}
        onDragStart={(e) => {
          if ((e.target as HTMLElement).closest('input,button')) return;
          e.dataTransfer.setData(WC_MOVE_MIME, node.id);
          e.dataTransfer.effectAllowed = 'move';
          setMoving(node.id);
        }}
        onDragEnd={() => setMoving(null)}
      >
        <span className="grip" aria-hidden>
          ⠿
        </span>
        {editing ? (
          <input
            className="box-title-input"
            autoFocus
            defaultValue={node.title || ''}
            onBlur={(e) => {
              setTitle(e.target.value);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <h2 className="box-title" title="두 번 눌러 이름 바꾸기" onDoubleClick={() => setEditing(true)}>
            {node.title || '이름 없는 박스'}
          </h2>
        )}
        <button
          title={node.direction === 'column' ? '가로로 정렬' : '세로로 정렬'}
          onClick={() =>
            apply((d) => {
              const f = find(d.root, node.id);
              if (f && f.node.kind === 'box') f.node.direction = f.node.direction === 'column' ? 'row' : 'column';
            })
          }
        >
          {node.direction === 'column' ? '↕ 세로' : '↔ 가로'}
        </button>
        {depth < MAX_BOX_DEPTH && (
          <button title="안에 박스 추가" onClick={() => apply((d) => void insert(d.root, node.id, Number.MAX_SAFE_INTEGER, makeBox('새 박스')))}>
            ＋박스
          </button>
        )}
        <button title="위로" onClick={() => apply((d) => void nudge(d.root, node.id, -1))}>
          ↑
        </button>
        <button title="아래로" onClick={() => apply((d) => void nudge(d.root, node.id, 1))}>
          ↓
        </button>
        <button title="복제" onClick={() => apply((d) => void duplicate(d.root, node.id))}>
          ⧉
        </button>
        <button className="del" title="박스 삭제" onClick={() => apply((d) => void remove(d.root, node.id))}>
          ✕
        </button>
      </div>
      <div className={`blocks dir-${node.direction}`} data-children-of={node.id} data-dir={node.direction}>
        <Children box={node} depth={depth} />
      </div>
    </section>
  );
}
