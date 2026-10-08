import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BlockNode, DisplayMode, Stroke } from '../shared/types';
import { WC_MOVE_MIME } from '../shared/protocol';
import { t } from '../shared/i18n';
import { usePanel } from './store';
import { fit, loadRenderable, renderInk, renderInto, strokePath, INK_STYLE, type Renderable } from './render';
import { notifyRendered, hostLabel } from './ingest';
import { setMoving } from './dnd';
import { find, nudge, remove } from './tree';
import { saveEditedClip } from './edit';

const DISPLAY_LABEL: Record<DisplayMode, string> = { fit: t('displayFit'), original: t('displayOriginal'), reflow: t('displayReflow') };
const SCALES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const PENS: Array<{ tool: Stroke['tool']; color: string; w: number; label: string }> = [
  { tool: 'hl', color: '#ffe14d', w: 14, label: '▮' },
  { tool: 'hl', color: '#7cf29c', w: 14, label: '▮' },
  { tool: 'pen', color: '#e5383b', w: 3, label: '✎' },
  { tool: 'pen', color: '#2f6fed', w: 3, label: '✎' },
];

function useHead(node: BlockNode) {
  const apply = usePanel((s) => s.apply);
  const patch = (fn: (b: BlockNode) => void, history = true) =>
    apply((d) => {
      const f = find(d.root, node.id);
      if (f && f.node.kind === 'block') fn(f.node);
    }, { history });
  return { apply, patch };
}

function HeadDrag({ node, children, title }: { node: BlockNode; children: React.ReactNode; title?: string }) {
  return (
    <div
      className="block-head"
      draggable
      title={title}
      onDragStart={(e) => {
        if ((e.target as HTMLElement).closest('button,select,a,textarea')) return;
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
      {children}
    </div>
  );
}

export function BlockView({ node }: { node: BlockNode }) {
  return node.type === 'note' ? <NoteView node={node} /> : <ClipView node={node} />;
}

// ---------------------------------------------------------------- M5 메모 블록
function NoteView({ node }: { node: BlockNode }) {
  const { apply, patch } = useHead(node);
  const [text, setText] = useState(node.note || '');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setText(node.note || ''), [node.note]);
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, [text]);
  return (
    <article className="block note" data-node-id={node.id} data-testid="block">
      <HeadDrag node={node}>
        <span className="src">{t('noteBlock')}</span>
        <button title={t('up')} aria-label={t('up')} onClick={() => apply((d) => void nudge(d.root, node.id, -1))}>
          ↑
        </button>
        <button title={t('down')} aria-label={t('down')} onClick={() => apply((d) => void nudge(d.root, node.id, 1))}>
          ↓
        </button>
        <button className="del" title={t('delete')} aria-label={t('delete')} onClick={() => apply((d) => void remove(d.root, node.id))}>
          ✕
        </button>
      </HeadDrag>
      <textarea
        ref={ref}
        className="note-text"
        value={text}
        placeholder={t('notePlaceholder')}
        aria-label={t('noteBlock')}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== (node.note || '')) patch((b) => void (b.note = text.slice(0, 100_000)));
        }}
      />
    </article>
  );
}

// ---------------------------------------------------------------- 조각 블록
function ClipView({ node }: { node: BlockNode }) {
  const ui = usePanel((s) => s.blockUi[node.id]);
  const ver = usePanel((s) => (node.clipId ? s.clipVer[node.clipId] || 0 : 0));
  const compare = usePanel((s) => !!s.compare[node.id]);
  const toggleCompare = usePanel((s) => s.toggleCompare);
  const readable = usePanel((s) => !!s.doc?.readable);
  const { apply, patch } = useHead(node);
  const [r, setR] = useState<Renderable | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [drawing, setDrawing] = useState<number | null>(null); // 고른 펜 번호
  const hostRef = useRef<HTMLDivElement>(null);
  const loading = ui?.status === 'loading';
  const scale = node.scale || 1;

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
    renderInto(host, r, { display: node.display, withBg: node.bg !== false, readable, scale, ink: node.ink });
    notifyRendered(node.clipId!);
    // 렌더가 바뀌면 편집 상태는 끝난 것으로
    setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, node.display, node.clipId, node.bg, readable]);

  // 주석·배율은 다시 그리지 않고 그 부분만
  useEffect(() => {
    const wrap = hostRef.current?.shadowRoot?.querySelector<HTMLElement>('.wrap');
    if (wrap) renderInk(wrap, node.ink || []);
  }, [node.ink, r]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !r) return;
    fit(host, r.width, node.display, scale);
    const ro = new ResizeObserver(() => fit(host, r.width, node.display, scale));
    ro.observe(host);
    return () => ro.disconnect();
  }, [r, node.display, scale]);

  // ---------------------------------------------------------------- 편집 (M5)
  const wrapEl = () => hostRef.current?.shadowRoot?.querySelector<HTMLElement>('.wrap') || null;
  const startEdit = () => {
    const w = wrapEl();
    if (!w) return;
    setDrawing(null);
    w.contentEditable = 'true';
    w.focus();
    setEditing(true);
  };
  const finishEdit = async () => {
    const w = wrapEl();
    if (!w || !node.clipId) return;
    w.contentEditable = 'false';
    setEditing(false);
    const newId = await saveEditedClip(node.clipId, w);
    if (newId) patch((b) => void (b.clipId = newId));
  };

  // ---------------------------------------------------------------- 그리기 (M5)
  useEffect(() => {
    const w = wrapEl();
    if (!w || drawing === null) return;
    const pen = PENS[drawing];
    w.classList.add('drawing');
    let pts: number[] = [];
    let path: SVGPathElement | null = null;
    const toLocal = (e: PointerEvent) => {
      const rect = w.getBoundingClientRect();
      const z = parseFloat(w.style.zoom) || 1;
      return [Math.round(((e.clientX - rect.left) / z) * 10) / 10, Math.round(((e.clientY - rect.top) / z) * 10) / 10];
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      w.setPointerCapture(e.pointerId);
      pts = toLocal(e);
      const svg = w.querySelector(':scope > svg.ink');
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const st = INK_STYLE[pen.tool];
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', pen.color);
      path.setAttribute('stroke-width', String(pen.w));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke-opacity', String(st.opacity));
      path.style.mixBlendMode = st.blend;
      path.setAttribute('d', strokePath(pts));
      svg?.appendChild(path);
    };
    const move = (e: PointerEvent) => {
      if (!path) return;
      const [x, y] = toLocal(e);
      const lx = pts[pts.length - 2];
      const ly = pts[pts.length - 1];
      if (Math.hypot(x - lx, y - ly) < 1.5) return;
      pts.push(x, y);
      path.setAttribute('d', strokePath(pts));
    };
    const up = () => {
      if (!path) return;
      path = null;
      const stroke: Stroke = { tool: pen.tool, color: pen.color, w: pen.w, pts: pts.slice(0, 20000) };
      pts = [];
      patch((b) => void (b.ink = [...(b.ink || []), stroke]));
    };
    w.addEventListener('pointerdown', down);
    w.addEventListener('pointermove', move);
    w.addEventListener('pointerup', up);
    w.addEventListener('pointercancel', up);
    return () => {
      w.classList.remove('drawing');
      w.removeEventListener('pointerdown', down);
      w.removeEventListener('pointermove', move);
      w.removeEventListener('pointerup', up);
      w.removeEventListener('pointercancel', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, r]);

  const info = r?.info;
  const srcText = info ? `${hostLabel(info.url)} · ${info.kind} <${info.tag || '?'}>` : loading ? t('fetching') : ui?.status === 'error' ? t('failedShort') : '…';
  const missing = r === null && !loading && ui?.status !== 'error';
  const canEdit = !!r?.stored;

  return (
    <article
      className={`block${compare ? ' compare' : ''}${ui?.status === 'error' ? ' error' : ''}${editing ? ' editing' : ''}${drawing !== null ? ' drawing' : ''}`}
      data-node-id={node.id}
      data-testid="block"
    >
      <HeadDrag node={node} title={info ? `${info.title}\n${info.url}` : ''}>
        <span className="src">{srcText}</span>
        <button title={t('up')} aria-label={t('up')} onClick={() => apply((d) => void nudge(d.root, node.id, -1))}>
          ↑
        </button>
        <button title={t('down')} aria-label={t('down')} onClick={() => apply((d) => void nudge(d.root, node.id, 1))}>
          ↓
        </button>
        {canEdit && (
          <button className="edit" title={t('editTitle')} aria-pressed={editing} onClick={editing ? finishEdit : startEdit}>
            {editing ? t('editDone') : t('edit')}
          </button>
        )}
        {canEdit && (
          <button className="draw" title={t('drawTitle')} aria-pressed={drawing !== null} onClick={() => setDrawing(drawing === null ? 0 : null)}>
            {t('draw')}
          </button>
        )}
        {r?.refShotSrc && (
          <button className="cmp" title={t('compareTitle')} aria-pressed={compare} onClick={() => toggleCompare(node.id)}>
            {t('compare')}
          </button>
        )}
        {r?.bg && (
          <button title={t('bgTitle')} aria-pressed={node.bg !== false} onClick={() => patch((b) => void (b.bg = b.bg === false))}>
            {t('bg')}
          </button>
        )}
        <select
          className="display"
          title={t('displayTitle')}
          aria-label={t('displayTitle')}
          value={node.display}
          onChange={(e) => patch((b) => void (b.display = e.target.value as DisplayMode))}
        >
          {(Object.keys(DISPLAY_LABEL) as DisplayMode[]).map((k) => (
            <option key={k} value={k}>
              {DISPLAY_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          className="scale"
          title={t('scale')}
          aria-label={t('scale')}
          value={String(scale)}
          onChange={(e) => patch((b) => void (b.scale = Number(e.target.value) === 1 ? undefined : Number(e.target.value)))}
        >
          {SCALES.map((v) => (
            <option key={v} value={String(v)}>
              {Math.round(v * 100)}%
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
      </HeadDrag>
      {drawing !== null && (
        <div className="ink-tools" role="toolbar" aria-label={t('drawTitle')}>
          {PENS.map((p, i) => (
            <button
              key={i}
              className={`pen${drawing === i ? ' on' : ''}`}
              style={{ color: p.color }}
              aria-pressed={drawing === i}
              title={p.tool === 'hl' ? 'highlighter' : 'pen'}
              onClick={() => setDrawing(i)}
            >
              {p.label}
            </button>
          ))}
          <button title={t('undo')} disabled={!node.ink?.length} onClick={() => patch((b) => void (b.ink = (b.ink || []).slice(0, -1)))}>
            ↶
          </button>
          <button title={t('delete')} disabled={!node.ink?.length} onClick={() => patch((b) => void (b.ink = undefined))}>
            ✕
          </button>
          <span className="spacer" />
          <button onClick={() => setDrawing(null)}>{t('editDone')}</button>
        </div>
      )}
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
