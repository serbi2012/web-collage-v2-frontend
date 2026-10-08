import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BlockNode, DisplayMode } from '../shared/types';
import { WC_MOVE_MIME } from '../shared/protocol';
import { usePanel } from './store';
import { fit, loadRenderable, renderInto, type Renderable } from './render';
import { notifyRendered, hostLabel } from './ingest';
import { setMoving } from './dnd';
import { find, nudge, remove } from './tree';
import { t } from '../shared/i18n';

const DISPLAY_LABEL: Record<DisplayMode, string> = { fit: t('displayFit'), original: t('displayOriginal'), reflow: t('displayReflow') };

export function BlockView({ node }: { node: BlockNode }) {
  const ui = usePanel((s) => s.blockUi[node.id]);
  const ver = usePanel((s) => (node.clipId ? s.clipVer[node.clipId] || 0 : 0));
  const compare = usePanel((s) => !!s.compare[node.id]);
  const apply = usePanel((s) => s.apply);
  const toggleCompare = usePanel((s) => s.toggleCompare);
  const readable = usePanel((s) => !!s.doc?.readable);
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
    renderInto(host, r, node.display, node.bg !== false, readable);
    notifyRendered(node.clipId!);
  }, [r, node.display, node.clipId, node.bg, readable]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !r) return;
    const ro = new ResizeObserver(() => fit(host, r.width, node.display));
    ro.observe(host);
    return () => ro.disconnect();
  }, [r, node.display]);

  const info = r?.info;
  const srcText = info ? `${hostLabel(info.url)} · ${info.kind} <${info.tag || '?'}>` : loading ? t('fetching') : ui?.status === 'error' ? t('failedShort') : '…';
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
        <button title={t('up')} aria-label={t('up')} onClick={() => apply((d) => void nudge(d.root, node.id, -1))}>
          ↑
        </button>
        <button title={t('down')} aria-label={t('down')} onClick={() => apply((d) => void nudge(d.root, node.id, 1))}>
          ↓
        </button>
        {r?.refShotSrc && (
          <button className="cmp" title={t('compareTitle')} aria-pressed={compare} onClick={() => toggleCompare(node.id)}>
            {t('compare')}
          </button>
        )}
        {r?.bg && (
          <button
            title={t('bgTitle')}
            aria-pressed={node.bg !== false}
            onClick={() =>
              apply((d) => {
                const f = find(d.root, node.id);
                if (f && f.node.kind === 'block') f.node.bg = f.node.bg === false;
              })
            }
          >
            {t('bg')}
          </button>
        )}
        <select
          className="display"
          title={t('displayTitle')}
          aria-label={t('displayTitle')}
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
          <a className="open" href={info.url} target="_blank" rel="noopener noreferrer" title={t('openSource')} aria-label={t('openSource')}>
            ↗
          </a>
        )}
        <button className="del" title={t('delete')} aria-label={t('delete')} onClick={() => apply((d) => void remove(d.root, node.id))}>
          ✕
        </button>
      </div>
      {(loading || ui?.status === 'error' || missing) && (
        <div className="placeholder">
          {ui?.status === 'error' ? t('failedClip', ui.error || '') : missing ? t('missingClip') : `${t('fetching')}\n${ui?.preview || ''}`}
        </div>
      )}
      <div className="clip" ref={hostRef} hidden={!r} />
      {compare && r?.refShotSrc && (
        <div className="refshot">
          <img alt={t('compareTitle')} src={r.refShotSrc} />
        </div>
      )}
    </article>
  );
}
