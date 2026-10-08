import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BlockNode, DisplayMode } from '../shared/types';
import { WC_MOVE_MIME } from '../shared/protocol';
import { usePanel } from './store';
import { fit, loadRenderable, renderInto, type Renderable } from './render';
import { notifyRendered, hostLabel } from './ingest';
import { setMoving } from './dnd';
import { find, nudge, remove } from './tree';

const DISPLAY_LABEL: Record<DisplayMode, string> = { fit: '맞춤', original: '원본 크기', reflow: '다시 흐르게' };

export function BlockView({ node }: { node: BlockNode }) {
  const ui = usePanel((s) => s.blockUi[node.id]);
  const ver = usePanel((s) => (node.clipId ? s.clipVer[node.clipId] || 0 : 0));
  const compare = usePanel((s) => !!s.compare[node.id]);
  const apply = usePanel((s) => s.apply);
  const toggleCompare = usePanel((s) => s.toggleCompare);
  const [r, setR] = useState<Renderable | null | undefined>(undefined);
  const hostRef = useRef<HTMLDivElement>(null);
  const loading = ui?.status === 'loading';

  useEffect(() => {
    if (!node.clipId || loading) return;
    let alive = true;
    loadRenderable(node.clipId).then((x) => alive && setR(x));
    return () => {
      alive = false;
    };
  }, [node.clipId, ver, loading]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!r || !host) return;
    renderInto(host, r, node.display, node.bg !== false);
    notifyRendered(node.clipId!);
  }, [r, node.display, node.clipId, node.bg]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !r) return;
    const ro = new ResizeObserver(() => fit(host, r.width, node.display));
    ro.observe(host);
    return () => ro.disconnect();
  }, [r, node.display]);

  const info = r?.info;
  const srcText = info ? `${hostLabel(info.url)} · ${info.kind} <${info.tag || '?'}>` : loading ? '가져오는 중…' : ui?.status === 'error' ? '실패' : '…';
  const missing = r === null && !loading && ui?.status !== 'error';

  return (
    <article className={`block${compare ? ' compare' : ''}${ui?.status === 'error' ? ' error' : ''}`} data-node-id={node.id} data-testid="block">
      <div
        className="block-head"
        draggable
        title={info ? `${info.title}\n${info.url}` : ''}
        onDragStart={(e) => {
          e.dataTransfer.setData(WC_MOVE_MIME, node.id);
          e.dataTransfer.effectAllowed = 'move';
          const el = (e.currentTarget as HTMLElement).parentElement!;
          e.dataTransfer.setDragImage(el, 20, 12);
          setMoving(node.id);
        }}
        onDragEnd={() => setMoving(null)}
      >
        <span className="grip" aria-hidden>
          ⠿
        </span>
        <span className="src">{srcText}</span>
        <button title="위로" onClick={() => apply((d) => void nudge(d.root, node.id, -1))}>
          ↑
        </button>
        <button title="아래로" onClick={() => apply((d) => void nudge(d.root, node.id, 1))}>
          ↓
        </button>
        {r?.refShotSrc && (
          <button className="cmp" title="원본 화면과 비교" aria-pressed={compare} onClick={() => toggleCompare(node.id)}>
            비교
          </button>
        )}
        {r?.bg && (
          <button
            title="원래 페이지 배경 깔기"
            aria-pressed={node.bg !== false}
            onClick={() =>
              apply((d) => {
                const f = find(d.root, node.id);
                if (f && f.node.kind === 'block') f.node.bg = f.node.bg === false;
              })
            }
          >
            배경
          </button>
        )}
        <select
          className="display"
          title="표시 방식"
          value={node.display}
          onChange={(e) =>
            apply((d) => {
              const f = find(d.root, node.id);
              if (f && f.node.kind === 'block') f.node.display = e.target.value as DisplayMode;
            })
          }
        >
          {(Object.keys(DISPLAY_LABEL) as DisplayMode[]).map((k) => (
            <option key={k} value={k}>
              {DISPLAY_LABEL[k]}
            </option>
          ))}
        </select>
        {info?.url && /^https?:/i.test(info.url) && (
          <a className="open" href={info.url} target="_blank" rel="noopener noreferrer" title="출처 열기">
            ↗
          </a>
        )}
        <button className="del" title="삭제" onClick={() => apply((d) => void remove(d.root, node.id))}>
          ✕
        </button>
      </div>
      {(loading || ui?.status === 'error' || missing) && (
        <div className="placeholder">
          {ui?.status === 'error' ? `실패: ${ui.error}` : missing ? '조각을 찾을 수 없습니다' : `가져오는 중…\n${ui?.preview || ''}`}
        </div>
      )}
      <div className="clip" ref={hostRef} hidden={!r} />
      {compare && r?.refShotSrc && (
        <div className="refshot">
          <img alt="원본 화면" src={r.refShotSrc} />
        </div>
      )}
    </article>
  );
}
