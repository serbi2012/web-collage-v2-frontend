// picker: 하이라이트·무장·손잡이·선택 드래그 (PLAN §6.1, §6.2)
// 1) 스크랩 모드(이 창의 사이드 패널이 열려 있고 스위치가 켜져 있을 때)에서 마우스 아래 요소를 하이라이트
// 2) 그 요소를 "브라우저 기본 드래그"로 끌 수 있게 무장(draggable=true)
// 3) dragstart 순간엔 가벼운 번호표(DragMeta)만 dataTransfer 에 싣고, 스냅샷은 background 로 따로 보냄
import { DRAG_HTML_MAX, DRAG_TEXT_MAX, WC_MIME, type ContentMsg, type DragMeta, type FrameSnap, type RawClip } from '../shared/protocol';
import { neutralizeHover } from '../capture/hover';
import { snapshot } from '../capture/snapshot';
import { createOverlay, labelTop, paintCrumbs, type Overlay } from './overlay';
import { TEXT_MODE } from './strings';

interface Armed {
  el: HTMLElement;
  prevAttr: string | null;
  prevDrag: string;
  prevPrio: string;
  hadStyle: boolean;
}

/** R8: text/html 을 만들기 전에 요소 수가 이보다 많으면 생략 (outerHTML 직렬화가 드래그 시작을 늦추지 않게) */
const DRAG_HTML_MAX_ELEMENTS = 3000;

export function startPicker(signal: AbortSignal) {
  const IS_TOP = window === window.top;
  const state = {
    enabled: false, // 이 창의 패널이 열려 있고 스크랩 스위치가 켜져 있으면 true
    paused: false, // Esc 로 잠시 끄기 (페이지에 포커스가 있을 때만 동작하는 보조 수단)
    alt: false, // Alt 누르는 동안: 무장 해제(텍스트 선택용)
    hoverEl: null as Element | null,
    stack: [] as Element[], // Alt+휠로 넓혔을 때 되돌아갈 경로
    armed: null as Armed | null,
    dragging: null as { id: string; root: Element; meta: DragMeta } | null,
    pressed: false, // 버튼 누르고 있는 중
    locked: null as Element | null, // M4: Alt+휠·경로로 고른 대상은 마우스가 그 안에 있는 동안 고정
    chain: [] as Element[], // 라벨 경로에 보이는 요소들 (바깥 → 현재)
  };
  const active = () => state.enabled && !state.paused;
  const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts: AddEventListenerOptions = {}) =>
    window.addEventListener(type, fn as EventListener, { ...opts, signal });

  // ---------------------------------------------------------------- 상태 동기화 (창 단위, PLAN §6.6)
  function setEnabled(v: boolean) {
    state.enabled = v;
    if (!v) setHover(null);
    syncWheel();
  }
  send({ type: 'scrap:query' }, (res: unknown) => setEnabled(!!(res as { enabled?: boolean } | undefined)?.enabled));
  const onBgMessage = (msg: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
    const m = msg as { type?: string; enabled?: boolean; token?: string };
    if (m && m.type === 'scrap:state') setEnabled(!!m.enabled);
    if (m && m.type === 'frame:snap' && typeof m.token === 'string' && frameTokens.has(m.token)) {
      // M1 iframe 내용: 바깥 문서가 이 프레임에 건넨 번호표가 맞을 때만 응답 (다른 프레임은 응답하지 않음)
      snapFrame(m.token).then(sendResponse, (e) => sendResponse({ error: String(e instanceof Error ? e.message : e) }));
      return true;
    }
    return false;
  };
  chrome.runtime.onMessage.addListener(onBgMessage);

  // 바깥 문서(부모 프레임)가 스냅샷 도중 건네는 번호표 (src/capture/snapshot.ts askFrame)
  const frameTokens = new Set<string>();
  on('message', (e) => {
    const d = e.data as { wcFrameToken?: unknown } | null;
    // 번호표는 무작위라 페이지 스크립트가 끼워 넣어도 background 가 물어보지 않으면 쓰이지 않는다
    if (!d || typeof d.wcFrameToken !== 'string' || window === window.top) return;
    frameTokens.add(d.wcFrameToken);
    if (frameTokens.size > 20) frameTokens.delete(frameTokens.values().next().value!);
  });
  async function snapFrame(token: string): Promise<FrameSnap | { error: string }> {
    frameTokens.delete(token);
    const root = document.body || document.documentElement;
    if (root.getElementsByTagName('*').length > 3000) return { error: 'frame too big' };
    const s = await snapshot(root, { idPrefix: 'f' + token.slice(0, 6) + '-', frames: false });
    return {
      html: s.html,
      css: s.css,
      defs: s.defs,
      scrollX: Math.round(window.scrollX),
      scrollY: Math.round(window.scrollY),
      width: s.width,
      families: s.families,
      fontFaces: s.fontFaces,
      crossOriginSheets: s.crossOriginSheets,
      imageUrls: s.imageUrls,
      nodes: s.stats.nodes,
    };
  }
  signal.addEventListener('abort', () => {
    try {
      chrome.runtime.onMessage.removeListener(onBgMessage);
    } catch {
      /* 익스텐션이 이미 사라진 고아 스크립트 */
    }
    setHover(null);
    disarm();
    syncWheel(true);
    overlay?.host.remove();
  });

  // ---------------------------------------------------------------- 하이라이트 오버레이
  let overlay: Overlay | null = null;
  function ensureOverlay(): Overlay {
    if (overlay && overlay.host.isConnected) return overlay;
    overlay = createOverlay();
    const o = overlay;
    o.label.addEventListener('dragstart', (e) => {
      if (!active() || !state.hoverEl) return;
      beginDrag(e, 'element', state.hoverEl, null, 'handle');
    });
    o.label.addEventListener('mousedown', () => {
      state.pressed = true;
    });
    // M4 라벨 경로: 단계를 누르면 그 요소로 (끌기가 아니라 대상 고르기 — 담기는 여전히 끌어서만)
    o.label.addEventListener('click', (e) => {
      const c = (e.composedPath()[0] as Element | undefined)?.closest?.('.c') as HTMLElement | null;
      const target = c && state.chain[Number(c.dataset.i)];
      e.preventDefault();
      e.stopPropagation();
      if (!target || target === state.hoverEl) return;
      if (state.hoverEl && target.contains(state.hoverEl)) state.stack.push(state.hoverEl);
      setHover(target);
      state.locked = target;
      paintOverlay();
    });
    return o;
  }
  function hideOverlay() {
    if (!overlay) return;
    overlay.box.style.display = 'none';
    overlay.label.style.display = 'none';
  }
  function paintOverlay() {
    const el = state.hoverEl;
    if (!el || !el.isConnected || !active()) return hideOverlay();
    const o = ensureOverlay();
    const r = el.getBoundingClientRect();
    Object.assign(o.box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    o.box.classList.toggle('locked', state.locked === el);
    const chain: Element[] = [el];
    for (let p = parentOf(el); p && !isPageRoot(p) && chain.length < 4; p = parentOf(p)) chain.unshift(p);
    state.chain = chain;
    paintCrumbs(o.label, chain, `${Math.round(r.width)}×${Math.round(r.height)}`, state.alt ? TEXT_MODE : '');
    Object.assign(o.label.style, { display: 'block', left: Math.max(0, r.left) + 'px', top: labelTop(r) + 'px' });
  }

  // ---------------------------------------------------------------- 무장(드래그 가능하게)
  function arm(el: Element) {
    if (state.armed && state.armed.el === el) return;
    disarm();
    const h = el as HTMLElement;
    state.armed = {
      el: h,
      prevAttr: h.getAttribute('draggable'),
      prevDrag: h.style ? h.style.getPropertyValue('-webkit-user-drag') : '',
      prevPrio: h.style ? h.style.getPropertyPriority('-webkit-user-drag') : '',
      hadStyle: h.hasAttribute('style'),
    };
    h.setAttribute('draggable', 'true');
    // [G10] 사이트가 -webkit-user-drag:none 을 걸어둔 경우까지 덮어쓰기 (인라인 !important 가 이김)
    if (h.style) h.style.setProperty('-webkit-user-drag', 'element', 'important');
  }
  function disarm() {
    const a = state.armed;
    if (!a) return;
    state.armed = null;
    const el = a.el;
    if (a.prevAttr === null) el.removeAttribute('draggable');
    else el.setAttribute('draggable', a.prevAttr);
    if (el.style) {
      if (a.prevDrag) el.style.setProperty('-webkit-user-drag', a.prevDrag, a.prevPrio);
      else el.style.removeProperty('-webkit-user-drag');
      if (!a.hadStyle && el.getAttribute('style') === '') el.removeAttribute('style');
    }
  }

  function setHover(el: Element | null) {
    if (state.dragging) return;
    if (el === state.hoverEl) return paintOverlay();
    state.hoverEl = el;
    if (el && active() && !state.alt && !holdsSelection(el)) arm(el);
    else disarm();
    paintOverlay();
  }

  const parentOf = (el: Element): Element | null => {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode() as ShadowRoot;
    return root && root.host ? root.host : null;
  };
  const isPageRoot = (el: Element | null) => !el || el === document.documentElement || el === document.body;

  function pickTarget(el: Element): Element {
    if (__E2E__) {
      // [E2E 전용 훅] data-wc-target 이 붙은 조상을 대상으로 (실사용 UX 는 Alt+휠). 배포 빌드에선 제거됨 (D16)
      for (let e: Element | null = el; e; e = parentOf(e)) if (e.hasAttribute && e.hasAttribute('data-wc-target')) return e;
    }
    return el;
  }

  // ---------------------------------------------------------------- 이벤트
  on(
    'mouseover',
    (e) => {
      // [G1] 버튼을 누른 채 움직이는 동안엔 대상 고정!
      // (크롬은 버튼을 누르고 몇 px 움직인 뒤에야 "무엇을 끌지" 결정하기 때문에,
      //  그 사이에 무장 대상이 바뀌면 드래그가 아니라 텍스트 선택이 되어버림)
      if (!active() || state.dragging || state.pressed) return;
      // [G4] Alt 상태는 키보드 이벤트가 아니라 마우스 이벤트에서 읽음
      // (사이드 패널에 포커스가 있으면 페이지는 keydown 을 못 받기 때문)
      state.alt = e.altKey;
      const t = e.composedPath()[0] as Node | undefined;
      const el = t && t.nodeType === 1 ? (t as Element) : t ? t.parentElement : null;
      if (overlay && el === overlay.host) return; // 손잡이 위: 현재 대상 유지
      // M4: 고른 대상(Alt+휠·경로) 안에서 움직이는 동안은 안쪽 요소로 바뀌지 않게
      if (state.locked && el && state.locked.isConnected && (state.locked === el || state.locked.contains(el))) return;
      state.locked = null;
      if (!el || isPageRoot(el)) return setHover(null);
      state.stack = [];
      setHover(pickTarget(el));
    },
    { capture: true },
  );

  // Alt + 휠: 위로 굴리면 부모로 넓히고, 아래로 굴리면 다시 좁힘.
  // [G20] passive:false 리스너는 페이지 스크롤을 메인 스레드에 묶어 느리게 하므로 스크랩 모드일 때만 등록한다(syncWheel).
  function onWheel(e: WheelEvent) {
    if (!active() || !e.altKey || !state.hoverEl) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.deltaY < 0) {
      const p = parentOf(state.hoverEl);
      if (p && !isPageRoot(p)) {
        state.stack.push(state.hoverEl);
        const keepAlt = state.alt;
        state.alt = false;
        setHover(p);
        state.locked = p;
        state.alt = keepAlt;
        if (keepAlt) disarm();
        paintOverlay();
      }
    } else if (state.stack.length) {
      const back = state.stack.pop()!;
      setHover(back);
      state.locked = state.stack.length ? back : null;
      paintOverlay();
    }
  }
  let wheelOn = false;
  function syncWheel(forceOff = false) {
    const want = !forceOff && active();
    if (want === wheelOn) return;
    wheelOn = want;
    if (want) window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    else window.removeEventListener('wheel', onWheel, { capture: true });
  }

  on(
    'keydown',
    (e) => {
      if (!state.enabled) return;
      if (e.key === 'Escape') {
        state.paused = !state.paused;
        if (state.paused) setHover(null);
        syncWheel();
      } else if (e.key === 'Alt' && !state.alt) {
        state.alt = true;
        disarm();
        paintOverlay();
      }
    },
    { capture: true },
  );
  on(
    'keyup',
    (e) => {
      if (e.key === 'Alt' && state.alt) {
        state.alt = false;
        if (state.hoverEl && active() && !state.dragging && !holdsSelection(state.hoverEl)) arm(state.hoverEl);
        paintOverlay();
      }
    },
    { capture: true },
  );
  on('blur', () => {
    state.pressed = false;
    if (state.alt) {
      state.alt = false;
      if (state.hoverEl && active() && !state.dragging) arm(state.hoverEl);
    }
  });

  // [G4] 같은 요소 위에서 Alt 만 눌렀다 뗐을 때도 반영 (마우스 이벤트의 altKey 기준)
  on(
    'mousemove',
    (e) => {
      if (!active() || state.pressed || state.dragging || e.altKey === state.alt) return;
      state.alt = e.altKey;
      if (state.alt) disarm();
      else if (state.hoverEl && !holdsSelection(state.hoverEl)) arm(state.hoverEl);
      paintOverlay();
    },
    { capture: true, passive: true },
  );

  // [G10] 사이트가 mousedown/pointerdown 에서 preventDefault 해서 드래그를 막는 걸 차단.
  // content script 는 document_start 에 등록되므로 window capture 단계에서 페이지 스크립트보다 먼저 실행됨.
  // ⚠️ R3: 스크랩 모드에서 무장된 요소의 mousedown 이 페이지에 전달되지 않고 click 도 막혀서 링크·버튼이 동작하지 않는다.
  //    → 패널 상단 스크랩 스위치로 끄면 평소대로 (Q9 기본값)
  const guardDown = (e: MouseEvent) => {
    if (!active() || e.button !== 0) return;
    if (overlay && e.composedPath().includes(overlay.host)) {
      // 손잡이를 누른 경우: 페이지 스크립트가 끼어들어 드래그를 막지 못하게
      state.pressed = true;
      e.stopImmediatePropagation();
      return;
    }
    if (e.altKey) {
      // Alt+누르기 = 텍스트 선택 모드: 무장 해제하고 브라우저 기본 동작에 맡김
      state.alt = true;
      disarm();
      return;
    }
    if (pointInSelection(e.clientX, e.clientY)) {
      // [G5] 이미 선택된 글자 위를 누르면: 요소 대신 "선택한 부분"을 끌기
      disarm();
      state.pressed = true;
      return;
    }
    if (!state.armed) return;
    if (!e.composedPath().includes(state.armed.el)) return;
    state.pressed = true;
    e.stopImmediatePropagation();
  };
  on('pointerdown', guardDown, { capture: true });
  on('mousedown', guardDown, { capture: true });
  const release = () => {
    state.pressed = false;
  };
  on('pointerup', release, { capture: true });
  on('mouseup', release, { capture: true });
  on('pointercancel', release, { capture: true });
  // 스크랩 모드에선 클릭으로 링크가 열리지 않게
  on(
    'click',
    (e) => {
      if (!active() || !state.armed || !e.composedPath().includes(state.armed.el)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    { capture: true },
  );

  const reposition = () => state.hoverEl && paintOverlay();
  on('scroll', reposition, { capture: true, passive: true });
  on('resize', reposition, { passive: true });

  // ---------------------------------------------------------------- 드래그 시작
  on(
    'dragstart',
    (e) => {
      if (!active()) return;
      const dt = e.dataTransfer;
      if (!dt) return;
      const path = e.composedPath();
      if (overlay && path.includes(overlay.host)) return; // 손잡이 드래그는 손잡이 쪽 핸들러가 처리
      const origin = path[0] as Node;
      const nativeTypes = Array.from(dt.types || []);
      const sel = window.getSelection();
      const selectionLike = sel && !sel.isCollapsed && nativeTypes.length > 0 && !nativeTypes.includes('text/uri-list');
      if (sel && selectionLike && (e.altKey || state.alt || origin.nodeType === 3 || !state.armed)) {
        const range = sel.getRangeAt(0);
        let c: Node | null = range.commonAncestorContainer;
        if (c.nodeType !== 1) c = c.parentElement;
        if (c) beginDrag(e, 'selection', c as Element, range, 'native');
      } else if (state.armed && path.includes(state.armed.el)) {
        beginDrag(e, 'element', state.armed.el, null, 'native');
      }
      // 그 외: 우리 드래그가 아님 → 브라우저 기본 동작 유지
    },
    { capture: true },
  );

  function beginDrag(e: DragEvent, kind: DragMeta['kind'], root: Element, range: Range | null, via: DragMeta['via']) {
    const dt = e.dataTransfer!;
    const path = e.composedPath();
    const origin = path[0] as Node;
    const nativeTypes = Array.from(dt.types || []);
    const sel = window.getSelection();
    // [G10] 페이지의 dragstart 핸들러가 preventDefault 로 취소하지 못하게
    e.stopImmediatePropagation();

    const id = uid();
    const r = root.getBoundingClientRect();
    const meta: DragMeta = {
      v: 1,
      id,
      kind,
      via,
      url: location.href,
      title: document.title,
      isTop: IS_TOP,
      tag: root.localName,
      w: Math.round(r.width),
      h: Math.round(r.height),
      startedAt: Date.now(),
      nativeTypes,
      originNodeType: origin.nodeType,
    };

    // R8: dragstart 는 동기라서 여기서 만드는 다른 앱용 데이터엔 상한을 둔다 (무거운 것은 전부 스냅샷 쪽으로)
    const preview = kind === 'selection' && sel ? sel.toString().slice(0, DRAG_TEXT_MAX) : previewText(root);
    let html = '';
    if (kind === 'element' && root.getElementsByTagName('*').length <= DRAG_HTML_MAX_ELEMENTS) {
      html = root.outerHTML;
      if (html.length > DRAG_HTML_MAX) html = '';
    }
    if (__E2E__) {
      // [E2E 전용 훅] <html data-wc-pad="N"> 으로 dataTransfer 대용량 테스트 (E9). 배포 빌드에선 제거됨 (D16)
      const pad = Number(document.documentElement.getAttribute('data-wc-pad') || 0);
      if (pad > 0) html += '<!--' + 'x'.repeat(pad) + '-->';
    }

    // [G11] 링크/이미지 위에서 시작한 드래그도 우리 데이터로 덮고, 드래그 이미지는 대상 전체로 (이미지 드래그의 Files 는 남음 [G12])
    if (kind === 'element') {
      dt.clearData();
      // R9: 이미지 드래그엔 크롬이 이미지 파일(Files)을 붙인다 → Gmail·Drive 같은 업로드 드롭존이 "파일 업로드"로 받아 버린다.
      // clearData() 는 파일 항목을 지우지 않으므로 items.clear() 로 함께 지운다 (dragstart 안에서만 쓰기 가능)
      try {
        dt.items.clear();
      } catch {
        /* 읽기 전용이면 그대로 */
      }
    }
    let omitMime = false;
    if (__E2E__) {
      // [E2E 전용 훅] 커스텀 MIME 을 일부러 빼서 clip:current 폴백을 테스트 (PLAN §6.2)
      omitMime = document.documentElement.hasAttribute('data-wc-nomime');
    }
    if (!omitMime) dt.setData(WC_MIME, JSON.stringify(meta));
    dt.setData('text/plain', preview);
    if (html) dt.setData('text/html', html);
    meta.htmlPayloadBytes = html.length;
    dt.effectAllowed = 'copyMove';
    if (kind === 'element' && origin !== root) {
      try {
        const ox = via === 'handle' ? 12 : e.clientX - r.left;
        const oy = via === 'handle' ? 12 : e.clientY - r.top;
        dt.setDragImage(root, ox, oy);
      } catch {
        /* 드래그 이미지는 보조 */
      }
    }

    // [G3] 손잡이 드래그는 손잡이(라벨) 자체가 드래그 원본이라, dragstart 안에서 바로 숨기면 크롬이 드래그를 취소함
    if (via === 'handle') setTimeout(hideOverlay, 0);
    else hideOverlay();
    state.dragging = { id, root, meta };

    // 화면 캡처(대체 이미지·비교용)는 최대한 빨리 요청
    send({ type: 'clip:begin', id, meta, rect: { x: r.left, y: r.top, w: r.width, h: r.height }, viewport: { w: innerWidth, h: innerHeight } });

    // [D4] 무거운 스냅샷은 드래그가 시작된 뒤에 (드래그 시작을 늦추지 않게)
    const armedEl = state.armed?.el;
    const dragAt = performance.now();
    setTimeout(async () => {
      const t0 = performance.now();
      // R6: 누른 채로 뜨는 스냅샷에 :hover·:active 모양이 박제되지 않게 잠깐 무효화 (원본 비교 캡처도 같은 상태가 되도록 250ms 이상 유지)
      const restoreHover = neutralizeHover(root);
      let clip: RawClip | { error: string; meta: DragMeta };
      try {
        const s = await snapshot(root, { range, ignoreAttrsOn: armedEl });
        clip = { ...s, meta, text: preview, stats: { ...s.stats, snapshotMs: Math.round(performance.now() - t0) } };
      } catch (err) {
        clip = { error: String(err instanceof Error ? err.stack || err.message : err), meta };
      }
      send({ type: 'clip:put', id, clip });
      setTimeout(restoreHover, Math.max(0, 250 - (performance.now() - dragAt)));
    }, 0);
  }

  on(
    'dragend',
    (e) => {
      state.pressed = false;
      const d = state.dragging;
      if (!d) return;
      state.dragging = null;
      send({ type: 'clip:end', id: d.id, dropEffect: e.dataTransfer ? e.dataTransfer.dropEffect : null });
      paintOverlay();
    },
    { capture: true },
  );

  if (__E2E__) {
    // [E2E 전용 훅] 페이지 안 버튼 클릭 → content script → background 의 sidePanel.open() (E15, 사용자 제스처 전달 확인).
    // 아무 페이지나 postMessage 로 패널을 열 수 있으면 안 되므로 배포 빌드에선 제거됨 (D16)
    on('message', (e) => {
      if (e.source === window && e.data && (e.data as { __wc?: string }).__wc === 'open-panel') send({ type: 'panel:open' });
      // [E2E 전용 훅] 스냅샷 성능 측정: postMessage({__wc:'bench', selector}) → postMessage({__wcBench: 결과})
      const d = e.data as { __wc?: string; selector?: string } | null;
      if (e.source === window && d && d.__wc === 'bench' && d.selector) {
        const el = document.querySelector(d.selector);
        if (!el) return;
        const t0 = performance.now();
        snapshot(el).then((r) => {
          window.postMessage({ __wcBench: { ms: Math.round(performance.now() - t0), nodes: r.stats.nodes, props: r.stats.props, htmlBytes: r.stats.htmlBytes } }, '*');
        });
      }
    });
  }

  // ---------------------------------------------------------------- 유틸
  // [G5] 선택된 글자가 들어 있는 요소는 무장하지 않음
  // (크롬은 draggable 요소 안의 글자를 선택 불가로 취급해서, 무장하는 순간 선택이 사라져 보임)
  function holdsSelection(el: Element) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    try {
      return sel.getRangeAt(0).intersectsNode(el);
    } catch {
      return false;
    }
  }
  function pointInSelection(x: number, y: number) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    for (const r of Array.from(sel.getRangeAt(0).getClientRects())) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  }
}

function send(msg: ContentMsg, cb?: (res: unknown) => void) {
  try {
    const p = chrome.runtime.sendMessage(msg);
    p.then((res) => cb && cb(res)).catch(() => {});
  } catch {
    /* 익스텐션이 업데이트·제거된 고아 스크립트 */
  }
}

function uid(): string {
  return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
}

/** R8: innerText 는 레이아웃 계산이 필요해 큰 요소에서 느리므로 textContent 앞부분만 정리해서 쓴다 */
function previewText(el: Element): string {
  const raw = (el as HTMLElement).innerText !== undefined && el.getElementsByTagName('*').length <= 400 ? (el as HTMLElement).innerText : (el.textContent || '').slice(0, DRAG_TEXT_MAX * 4);
  return raw.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim().slice(0, DRAG_TEXT_MAX);
}
