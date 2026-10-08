import { useEffect, useRef, useState } from 'react';
import { WC_MOVE_MIME, type PanelPortMsg, PANEL_PORT } from '../shared/protocol';
import type { ThemeId } from '../shared/types';
import { t } from '../shared/i18n';
import { getSettings, onSettingsChanged, setSettings, type Settings } from '../shared/settings';
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
  const [settings, setLocalSettings] = useState<Settings | null>(null);

  useEffect(() => {
    getSettings().then(setLocalSettings);
    return onSettingsChanged(setLocalSettings);
  }, []);

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
      const tg = e.target as HTMLElement;
      if (tg.closest('input, textarea, select, [contenteditable="true"]') || tg.shadowRoot) return;
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
    document.documentElement.lang = navigator.language.startsWith('ko') ? 'ko' : 'en';
  }, [doc?.theme]);

  if (!doc) return <div className="loading">{t('loading')}</div>;

  const run = (label: string, fn: () => Promise<unknown>) => async () => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      alert(t('failed', label, e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="top">
        <div className="row">
          <div className="brand">
            <span className="dot" aria-hidden />
            Web Collage
          </div>
          <select className="collage-select" value={doc.id} title={t('pickCollage')} aria-label={t('pickCollage')} onChange={(e) => openCollage(e.target.value)}>
            {collages.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button title={t('newCollage')} aria-label={t('newCollage')} onClick={() => newCollage()}>
            ＋
          </button>
          <button
            title={t('rename')}
            aria-label={t('rename')}
            onClick={() => {
              const v = prompt(t('renamePrompt'), doc.title);
              if (v && v.trim()) apply((d) => void (d.title = v.trim()));
            }}
          >
            ✎
          </button>
          <button
            title={t('deleteCollage')}
            aria-label={t('deleteCollage')}
            onClick={() => {
              if (confirm(t('deleteConfirm', doc.title))) deleteCollage(doc.id);
            }}
          >
            🗑
          </button>
          <button title={t('settings')} aria-label={t('settings')} onClick={() => chrome.runtime.openOptionsPage()}>
            ⚙
          </button>
        </div>
        <div className="row">
          <label className={`switch${scrap ? ' on' : ''}`} title={t('scrapTitle')}>
            <input type="checkbox" checked={scrap} onChange={toggleScrap} data-testid="scrap-switch" />
            <span className="knob" aria-hidden />
            {scrap ? t('scrapOn') : t('scrapOff')}
          </label>
          <span className="spacer" />
          <button title={t('undo')} aria-label={t('undo')} disabled={!canUndo} onClick={undo}>
            ↶
          </button>
          <button title={t('redo')} aria-label={t('redo')} disabled={!canRedo} onClick={redo}>
            ↷
          </button>
          <select title={t('theme')} aria-label={t('theme')} value={doc.theme} onChange={(e) => apply((d) => void (d.theme = e.target.value as ThemeId))}>
            <option value="light">{t('themeLight')}</option>
            <option value="dark">{t('themeDark')}</option>
            <option value="sepia">{t('themeSepia')}</option>
          </select>
          <button
            className={`toggle${doc.readable ? ' on' : ''}`}
            title={t('readableTitle')}
            aria-pressed={!!doc.readable}
            onClick={() => apply((d) => void (d.readable = !d.readable))}
          >
            Aa
          </button>
          <details className="menu">
            <summary title={t('export')}>{t('export')}</summary>
            <div className="menu-items" role="menu">
              <button role="menuitem" onClick={run(t('exportHtml'), () => exportHtmlFile(doc))}>
                {t('exportHtml')}
              </button>
              <button role="menuitem" onClick={run(t('exportMd'), () => exportMarkdownZip(doc))}>
                {t('exportMd')}
              </button>
              <button role="menuitem" onClick={run(t('print'), () => openPrint(doc))}>
                {t('print')}
              </button>
            </div>
          </details>
        </div>
        <div className="hint" dangerouslySetInnerHTML={{ __html: t('hint') }} />
        {busy && <div className="hint busy">{t('busy', busy)}</div>}
      </header>

      {settings && !settings.onboarded && <Onboarding onDone={() => setSettings({ onboarded: true })} />}

      <main id="board" className={`board${doc.readable ? ' readable' : ''}`} data-testid="board">
        <div className="blocks root-children" data-children-of={doc.root.id} data-dir="column">
          <Children box={doc.root} depth={0} />
        </div>
        <section className="box new-box" data-box="new" data-testid="new-box">
          <div className="new-label">{t('newBoxDrop')}</div>
        </section>
      </main>

      <LogPanel />
      <div id="indicator" ref={indicatorRef} aria-hidden="true" />
    </>
  );
}

/** M4 첫 실행 안내 (사전 문자열만 넣으므로 innerHTML 이 안전) */
function Onboarding({ onDone }: { onDone: () => void }) {
  const keys = ['ob1', 'ob2', 'ob3', 'ob4', 'ob5'] as const;
  return (
    <section className="onboarding" role="note" aria-label={t('obTitle')}>
      <h2>{t('obTitle')}</h2>
      <ol
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-shortcuts]')) {
            e.preventDefault();
            chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
          }
        }}
      >
        {keys.map((k) => (
          <li key={k} dangerouslySetInnerHTML={{ __html: t(k) }} />
        ))}
      </ol>
      <button className="primary" onClick={onDone}>
        {t('obDone')}
      </button>
    </section>
  );
}

function LogPanel() {
  const items = useLog((s) => s.items);
  return (
    <details id="logwrap">
      <summary>
        {t('log')} <span id="logcount">{items.length}</span>
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
  if (r.kind === 'move')
    return (
      <li>
        <span className="ok">{t('logMove')}</span> → Box {Number(r.box) + 1} #{String(r.index)}
      </li>
    );
  const meta = r.meta as { url?: string; tag?: string } | null;
  const st = (r.stats || {}) as { snapshotMs?: number; nodes?: number };
  const okDrop = !!r.customTypeArrived;
  const label = okDrop ? t('logOk') : r.fallbackUsed ? t('logFallback') : t('logForeign');
  return (
    <li>
      <span className={okDrop ? 'ok' : r.fallbackUsed ? 'warn' : 'bad'}>{label}</span> {meta?.url ? new URL(meta.url).host : ''} &lt;{meta?.tag || '?'}&gt; · types{' '}
      {(r.types as string[]).length} · snapshot {st.snapshotMs ?? '-'}ms/{st.nodes ?? '-'} · drop→visible {String(r.dropToVisibleMs ?? '-')}ms
      {r.error ? <span className="bad"> · {String(r.error)}</span> : null}
    </li>
  );
}
