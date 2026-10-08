import { useState } from 'react';
import type { BoxNode, TreeNode } from '../shared/types';
import { MAX_BOX_DEPTH } from '../shared/constants';
import { WC_MOVE_MIME } from '../shared/protocol';
import { t } from '../shared/i18n';
import { usePanel } from './store';
import { BlockView } from './BlockView';
import { setMoving } from './dnd';
import { duplicate, find, insert, makeBox, makeNote, nudge, remove } from './tree';

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
    <section
      className={`box depth-${depth}`}
      data-id={node.id}
      data-node-id={node.id}
      data-box={boxIndex}
      data-testid="box"
      aria-label={node.title || t('unnamedBox')}
    >
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
            aria-label={t('rename')}
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
          <h2
            className="box-title"
            title={t('boxRenameHint')}
            tabIndex={0}
            onDoubleClick={() => setEditing(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'F2') setEditing(true);
            }}
          >
            {node.title || t('unnamedBox')}
          </h2>
        )}
        <button
          title={node.direction === 'column' ? t('toRow') : t('toColumn')}
          onClick={() =>
            apply((d) => {
              const f = find(d.root, node.id);
              if (f && f.node.kind === 'box') f.node.direction = f.node.direction === 'column' ? 'row' : 'column';
            })
          }
        >
          {node.direction === 'column' ? t('dirColumn') : t('dirRow')}
        </button>
        {depth < MAX_BOX_DEPTH && (
          <button title={t('addBox')} onClick={() => apply((d) => void insert(d.root, node.id, Number.MAX_SAFE_INTEGER, makeBox(t('newBox'))))}>
            {t('addBoxShort')}
          </button>
        )}
        <button title={t('addNote')} onClick={() => apply((d) => void insert(d.root, node.id, Number.MAX_SAFE_INTEGER, makeNote()))}>
          {t('addNoteShort')}
        </button>
        <button title={t('up')} aria-label={t('up')} onClick={() => apply((d) => void nudge(d.root, node.id, -1))}>
          ↑
        </button>
        <button title={t('down')} aria-label={t('down')} onClick={() => apply((d) => void nudge(d.root, node.id, 1))}>
          ↓
        </button>
        <button title={t('duplicate')} aria-label={t('duplicate')} onClick={() => apply((d) => void duplicate(d.root, node.id))}>
          ⧉
        </button>
        <button className="del" title={t('deleteBox')} aria-label={t('deleteBox')} onClick={() => apply((d) => void remove(d.root, node.id))}>
          ✕
        </button>
      </div>
      <div className={`blocks dir-${node.direction}`} data-children-of={node.id} data-dir={node.direction} data-empty={t('emptyBox')}>
        <Children box={node} depth={depth} />
      </div>
    </section>
  );
}
