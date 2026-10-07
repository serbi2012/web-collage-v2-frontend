import { useEffect, useRef, useState } from 'react';
import { WC_MOVE_MIME, type PanelPortMsg, PANEL_PORT } from '../shared/protocol';
import type { ThemeId } from '../shared/types';
import { usePanel } from './store';
import { Children } from './BoxView';
import { autoScroll, dropSpot, showIndicator } from './dnd';
import { handleDrop } from './ingest';
import { useLog, type DropReport } from './log';
import { deleteCollage, newCollage, openCollage } from './persist';
import { exportHtmlFile, exportMarkdownZip, openPrint } from '../export/actions';

const SCRAP_KEY = 'scrapSwitch';

export function App() {
  const doc = usePanel((s) => s.doc);
  const collages = usePanel((s) => s.collages);
  const scrap = usePanel((s) => s.scrapEnabled);
  const canUndo = usePanel((s) => s.past.length > 0);
  const canRedo = usePanel((s) => s.future.length > 0);
  const { apply, undo, redo, setScrap } = usePanel.getState();
  const indicatorRef = useRef<HTMLDivElement>(null);
  const windowIdRef = useRef<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // ---------------------------------------------------------------- 패널 ↔ background 연결 (창 단위 스크랩 모드, R4 재연결)
  useEffect(() => {
    let port: chrome.runtime.Port | null = null;
    let closed = false;
    const connect = async () => {
      if (closed) return;
      const win = await chrome.windows.getCurrent();
      windowIdRef.current = win.id ?? null;
      const stored = await chrome.storage.local.get(SCRAP_KEY);
      const enabled = stored[SCRAP_KEY] !== false;
      setScrap(enabled);
      port = chrome.runtime.connect({ name: PANEL_PORT });
      port.postMessage({ type: 'hello', windowId: win.id!, enabled } satisfies PanelPortMsg);
      port.onDisconnect.addListener(() => {
        port = null;
        // service worker 가 다시 시작되면 포트가 끊긴다 → 다시 연결
        setTimeout(connect, 300);
      });
    };
    connect();
    const ping = setInterval(() => {
      try {
        port?.postMessage({ type: 'ping', at: Date.now() } satisfies PanelPortMsg);
      } catch {
        /* 끊김 → onDisconnect 에서 재연결 */
      }
    }, 20000);
    return () => {
      closed = true;
      clearInterval(ping);
      port?.disconnect();
    };
  }, [setScrap]);

  const toggleScrap = async () => {
    const next = !scrap;
    setScrap(next);
    await chrome.storage.local.set({ [SCRAP_KEY]: next });
    if (windowIdRef.current !== null) chrome.runtime.sendMessage({ type: 'scrap:set', windowId: windowIdRef.current, enabled: next });
  };

  // ---------------------------------------------------------------- 드래그 받기 (페이지 → 패널, 패널 안 이동)
  useEffect(() => {
    let session: { firstTypes: string[]; overs: number } | null = null;
    const ind = indicatorRef.current!;
    const onEnter = (e: DragEvent) => {
      e.preventDefault();
      if (!session) session = { firstTypes: Array.from(e.dataTransfer?.types || []), overs: 0 };
    };
    const onOver = (e: DragEvent) => {
      autoScroll(e.clientY);
      const spot = dropSpot(e.clientX, e.clientY);
      showIndicator(ind, spot);
      if (!spot) {
        // [G17 수정] 헤더 위 등 놓을 곳이 아니면 드롭을 받지 않음
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.preventDefault();
      if (session) session.overs++;
      if (e.dataTransfer) e.dataTransfer.dropEffect = e.dataTransfer.types.includes(WC_MOVE_MIME) ? 'move' : 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!e.relatedTarget && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight)) {
        showIndicator(ind, null);
        session = null;
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const spot = dropSpot(e.clientX, e.clientY);
      showIndicator(ind, null);
      const s = session;
      session = null;
      if (!spot || !e.dataTransfer) return;
      handleDrop(e.dataTransfer, spot, s).catch((err) => console.error('drop', err));
    };
    document.addEventListener('dragenter', onEnter);
    document.addEventListener('dragover', onOver);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragenter', onEnter);
      document.removeEventListener('dragover', onOver);
      document.removeEventListener('dragleave', onLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, []);

  // ---------------------------------------------------------------- Undo / Redo (패널 안)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  useEffect(() => {
    document.documentElement.dataset.theme = doc?.theme || 'light';
  }, [doc?.theme]);

  if (!doc) return <div className="loading">불러오는 중…</div>;

  const run = (label: string, fn: () => Promise<unknown>) => async () => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      alert(`${label} 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="top">
        <div className="row">
          <div className="brand">
            <span className="dot" />
            Web Collage
          </div>
          <select className="collage-select" value={doc.id} title="콜라주 고르기" onChange={(e) => openCollage(e.target.value)}>
            {collages.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button title="새 콜라주" onClick={() => newCollage()}>
            ＋
          </button>
          <button
            title="이름 바꾸기"
            onClick={() => {
              const t = prompt('콜라주 이름', doc.title);
              if (t && t.trim()) apply((d) => void (d.title = t.trim()));
            }}
          >
            ✎
          </button>
          <button
            title="이 콜라주 삭제"
            onClick={() => {
              if (confirm(`"${doc.title}" 콜라주를 삭제할까요? 되돌릴 수 없습니다.`)) deleteCollage(doc.id);
            }}
          >
            🗑
          </button>
        </div>
        <div className="row">
          <label className={`switch${scrap ? ' on' : ''}`} title="켜져 있으면 이 창의 페이지에서 요소를 하이라이트하고 끌 수 있습니다. 끄면 페이지를 평소대로 쓸 수 있습니다.">
            <input type="checkbox" checked={scrap} onChange={toggleScrap} data-testid="scrap-switch" />
            <span className="knob" />
            스크랩 {scrap ? '켜짐' : '꺼짐'}
          </label>
          <span className="spacer" />
          <button title="되돌리기 (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            ↶
          </button>
          <button title="다시 하기 (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
            ↷
          </button>
          <select
            title="테마"
            value={doc.theme}
            onChange={(e) => apply((d) => void (d.theme = e.target.value as ThemeId))}
          >
            <option value="light">라이트</option>
            <option value="dark">다크</option>
            <option value="sepia">세피아</option>
          </select>
          <details className="menu">
            <summary title="내보내기">내보내기</summary>
            <div className="menu-items">
              <button onClick={run('HTML 내보내기', () => exportHtmlFile(doc))}>단일 HTML 파일</button>
              <button onClick={run('Markdown 내보내기', () => exportMarkdownZip(doc))}>Markdown (+이미지 zip)</button>
              <button onClick={run('인쇄', () => openPrint(doc))}>인쇄 / PDF</button>
            </div>
          </details>
        </div>
        <div className="hint">
          페이지에서 요소를 <b>끌어다</b> 놓으세요 · <kbd>Alt</kbd>+휠 부모로 넓히기 · 라벨 <b>⠿</b> 잡고 끌기 · <kbd>Alt</kbd>+드래그 글자 선택
          {busy && <span className="busy"> · {busy} 중…</span>}
        </div>
      </header>

      <main id="board" className="board" data-testid="board">
        <div className="blocks root-children" data-children-of={doc.root.id} data-dir="column">
          <Children box={doc.root} depth={0} />
        </div>
        <section className="box new-box" data-box="new" data-testid="new-box">
          <div className="new-label">＋ 여기에 놓으면 새 박스</div>
        </section>
      </main>

      <LogPanel />
      <div id="indicator" ref={indicatorRef} aria-hidden="true" />
    </>
  );
}

function LogPanel() {
  const items = useLog((s) => s.items);
  return (
    <details id="logwrap">
      <summary>
        검증 로그 <span id="logcount">{items.length}</span>
      </summary>
      <ol id="log">
        {items.map((r, i) => (
          <LogItem key={items.length - i} r={r} />
        ))}
      </ol>
    </details>
  );
}

function LogItem({ r }: { r: DropReport }) {
  if (r.kind === 'move') return <li><span className="ok">이동</span> → Box {Number(r.box) + 1} #{String(r.index)}</li>;
  const meta = r.meta as { url?: string; tag?: string } | null;
  const st = (r.stats || {}) as { snapshotMs?: number; nodes?: number };
  const okDrop = !!r.customTypeArrived;
  const label = okDrop ? '드롭 OK' : r.fallbackUsed ? '드롭 OK(폴백)' : '외부 드롭';
  return (
    <li>
      <span className={okDrop ? 'ok' : r.fallbackUsed ? 'warn' : 'bad'}>{label}</span> {meta?.url ? new URL(meta.url).host : ''} &lt;{meta?.tag || '?'}&gt; · 타입{' '}
      {(r.types as string[]).length}개 · 스냅샷 {st.snapshotMs ?? '-'}ms/{st.nodes ?? '-'}노드 · 드롭→표시 {String(r.dropToVisibleMs ?? '-')}ms
      {r.error ? <span className="bad"> · {String(r.error)}</span> : null}
    </li>
  );
}
