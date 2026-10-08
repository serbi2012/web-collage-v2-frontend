// Web Collage Spike — content script
// 하는 일
//  1) 스크랩 모드(사이드 패널이 열려 있을 때)에서 마우스 아래 요소를 하이라이트
//  2) 그 요소를 "브라우저 기본 드래그"로 끌 수 있게 무장(draggable=true)
//  3) dragstart 순간엔 가벼운 번호표(id)만 dataTransfer에 싣고,
//     계산된 스타일을 굳힌 스냅샷은 background로 따로 보냄
(() => {
  if (globalThis.__wcSpike) return;
  globalThis.__wcSpike = true;

  // [G16] 스냅샷 기본값 계산용 iframe 안에서는 아무것도 하지 않음
  try {
    if (window.frameElement && window.frameElement.hasAttribute('data-wc-defaults')) return;
  } catch (_) { /* cross-origin frame */ }

  const WC_TYPE = 'application/x-web-collage';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const IS_TOP = window === window.top;

  const state = {
    enabled: false, // 패널이 열려 있으면 true
    paused: false, // Esc로 잠시 끄기
    alt: false, // Alt 누르는 동안: 무장 해제(텍스트 선택용)
    hoverEl: null,
    stack: [], // Alt+휠로 넓혔을 때 되돌아갈 경로
    armed: null,
    dragging: null,
    pressed: false, // 버튼 누르고 있는 중
  };
  const active = () => state.enabled && !state.paused;

  // ---------------------------------------------------------------- 상태 동기화
  try {
    chrome.storage.local.get('scrapEnabled', (r) => setEnabled(!!(r && r.scrapEnabled)));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.scrapEnabled) setEnabled(!!changes.scrapEnabled.newValue);
    });
  } catch (_) {}

  function setEnabled(on) {
    state.enabled = on;
    if (!on) {
      setHover(null);
    }
    syncWheel();
  }

  // ---------------------------------------------------------------- 하이라이트 오버레이
  let overlay = null;
  function ensureOverlay() {
    if (overlay && overlay.host.isConnected) return overlay;
    const host = document.createElement('wc-spike-overlay');
    host.style.cssText =
      'all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      .box{position:fixed;box-sizing:border-box;border:2px solid #ff5a5f;background:rgba(255,90,95,.08);
           border-radius:3px;pointer-events:none;display:none}
      .label{position:fixed;font:600 11px/20px system-ui,sans-serif;color:#fff;background:#ff5a5f;
             padding:0 8px 0 6px;border-radius:4px;pointer-events:auto;display:none;white-space:nowrap;
             cursor:grab;-webkit-user-drag:element;user-select:none}
      .label::before{content:"⠿ ";opacity:.85}
    </style><div class="box"></div><div class="label" draggable="true" title="여기를 잡고 끌어도 됩니다"></div>`;
    (document.documentElement || document).appendChild(host);
    overlay = { host, box: root.querySelector('.box'), label: root.querySelector('.label') };
    // [G2] 손잡이 드래그: 편집 가능한 영역(코드 에디터 등)처럼 크롬이 드래그를 시작하지 않는 곳의 대안
    overlay.label.addEventListener('dragstart', (e) => {
      if (!active() || !state.hoverEl) return;
      beginDrag(e, 'element', state.hoverEl, null, 'handle');
    });
    overlay.label.addEventListener('mousedown', () => {
      state.pressed = true;
    });
    return overlay;
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
    Object.assign(o.box.style, {
      display: 'block',
      left: r.left + 'px',
      top: r.top + 'px',
      width: r.width + 'px',
      height: r.height + 'px',
    });
    o.label.textContent =
      describe(el) + `  ${Math.round(r.width)}×${Math.round(r.height)}` + (state.alt ? '  (텍스트 선택 모드)' : '');
    Object.assign(o.label.style, {
      display: 'block',
      left: Math.max(0, r.left) + 'px',
      top: (r.top > 20 ? r.top - 20 : Math.min(r.bottom + 2, innerHeight - 20)) + 'px',
    });
  }
  function describe(el) {
    let s = el.localName;
    if (el.id) s += '#' + el.id;
    const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
    if (c) s += '.' + c;
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  }

  // ---------------------------------------------------------------- 무장(드래그 가능하게)
  function arm(el) {
    if (state.armed && state.armed.el === el) return;
    disarm();
    state.armed = {
      el,
      prevAttr: el.getAttribute('draggable'),
      prevDrag: el.style ? el.style.getPropertyValue('-webkit-user-drag') : '',
      prevPrio: el.style ? el.style.getPropertyPriority('-webkit-user-drag') : '',
      hadStyle: el.hasAttribute('style'),
    };
    el.setAttribute('draggable', 'true');
    // [G10] 사이트가 -webkit-user-drag:none 을 걸어둔 경우까지 덮어쓰기 (인라인 !important가 이김)
    if (el.style) el.style.setProperty('-webkit-user-drag', 'element', 'important');
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

  function setHover(el) {
    if (state.dragging) return;
    if (el === state.hoverEl) return paintOverlay();
    state.hoverEl = el;
    if (el && active() && !state.alt && !holdsSelection(el)) arm(el);
    else disarm();
    paintOverlay();
  }

  const parentOf = (el) => {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode && el.getRootNode();
    return root && root.host ? root.host : null;
  };
  const isPageRoot = (el) => !el || el === document.documentElement || el === document.body;

  // 검증 자동화용 훅: data-wc-target 이 붙은 조상이 있으면 그 요소를 대상으로 (실사용 UX는 Alt+휠)
  function pickTarget(el) {
    for (let e = el; e; e = parentOf(e)) if (e.hasAttribute && e.hasAttribute('data-wc-target')) return e;
    return el;
  }

  // ---------------------------------------------------------------- 이벤트
  window.addEventListener(
    'mouseover',
    (e) => {
      // [G1] 버튼을 누른 채 움직이는 동안엔 대상 고정!
      // (크롬은 버튼을 누르고 몇 px 움직인 뒤에야 "무엇을 끌지" 결정하기 때문에,
      //  그 사이에 무장 대상이 바뀌면 드래그가 아니라 텍스트 선택이 되어버림)
      if (!active() || state.dragging || state.pressed) return;
      // [G4] Alt 상태는 키보드 이벤트가 아니라 마우스 이벤트에서 읽음
      // (사이드 패널에 포커스가 있으면 페이지는 keydown 을 못 받기 때문)
      state.alt = e.altKey;
      const t = e.composedPath()[0];
      const el = t && t.nodeType === 1 ? t : t && t.parentElement;
      if (overlay && el === overlay.host) return; // 손잡이 위: 현재 대상 유지
      if (!el || isPageRoot(el)) return setHover(null);
      state.stack = [];
      setHover(pickTarget(el));
    },
    true
  );

  // Alt + 휠: 위로 굴리면 부모로 넓히고, 아래로 굴리면 다시 좁힘.
  // passive:false 리스너는 페이지 스크롤을 메인 스레드에 묶어 느리게 하므로 스크랩 모드일 때만 등록한다(syncWheel).
  function onWheel(e) {
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
          state.alt = keepAlt;
          if (keepAlt) disarm();
        }
      } else if (state.stack.length) {
        setHover(state.stack.pop());
      }
  }
  let wheelOn = false;
  function syncWheel() {
    const want = active();
    if (want === wheelOn) return;
    wheelOn = want;
    if (want) window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    else window.removeEventListener('wheel', onWheel, { capture: true });
  }

  window.addEventListener(
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
    true
  );
  window.addEventListener(
    'keyup',
    (e) => {
      if (e.key === 'Alt' && state.alt) {
        state.alt = false;
        if (state.hoverEl && active() && !state.dragging && !holdsSelection(state.hoverEl)) arm(state.hoverEl);
        paintOverlay();
      }
    },
    true
  );
  window.addEventListener('blur', () => {
    state.pressed = false;
    if (state.alt) {
      state.alt = false;
      if (state.hoverEl && active() && !state.dragging) arm(state.hoverEl);
    }
  });

  // [G4] 같은 요소 위에서 Alt 만 눌렀다 뗐을 때도 반영 (마우스 이벤트의 altKey 기준)
  window.addEventListener(
    'mousemove',
    (e) => {
      if (!active() || state.pressed || state.dragging || e.altKey === state.alt) return;
      state.alt = e.altKey;
      if (state.alt) disarm();
      else if (state.hoverEl && !holdsSelection(state.hoverEl)) arm(state.hoverEl);
      paintOverlay();
    },
    { capture: true, passive: true }
  );

  // [G10] 사이트가 mousedown/pointerdown 에서 preventDefault 해서 드래그를 막는 걸 차단.
  // content script 는 document_start 에 등록되므로 window capture 단계에서 페이지 스크립트보다 먼저 실행됨.
  const guardDown = (e) => {
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
  window.addEventListener('pointerdown', guardDown, true);
  window.addEventListener('mousedown', guardDown, true);
  const release = () => {
    state.pressed = false;
  };
  window.addEventListener('pointerup', release, true);
  window.addEventListener('mouseup', release, true);
  window.addEventListener('pointercancel', release, true);
  // 스크랩 모드에선 클릭으로 링크가 열리지 않게
  window.addEventListener(
    'click',
    (e) => {
      if (!active() || !state.armed || !e.composedPath().includes(state.armed.el)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true
  );

  const reposition = () => state.hoverEl && paintOverlay();
  window.addEventListener('scroll', reposition, { capture: true, passive: true });
  window.addEventListener('resize', reposition, { passive: true });

  // ---------------------------------------------------------------- 드래그 시작
  window.addEventListener(
    'dragstart',
    (e) => {
      if (!active()) return;
      const dt = e.dataTransfer;
      if (!dt) return;
      const path = e.composedPath();
      if (overlay && path.includes(overlay.host)) return; // 손잡이 드래그는 손잡이 쪽 핸들러가 처리
      const origin = path[0];
      const nativeTypes = Array.from(dt.types || []);
      const sel = window.getSelection();
      const selectionLike =
        sel && !sel.isCollapsed && nativeTypes.length > 0 && !nativeTypes.includes('text/uri-list');
      if (selectionLike && (e.altKey || state.alt || origin.nodeType === 3 || !state.armed)) {
        const range = sel.getRangeAt(0);
        let c = range.commonAncestorContainer;
        if (c.nodeType !== 1) c = c.parentElement;
        beginDrag(e, 'selection', c, range, 'native');
      } else if (state.armed && path.includes(state.armed.el)) {
        beginDrag(e, 'element', state.armed.el, null, 'native');
      }
      // 그 외: 우리 드래그가 아님 → 브라우저 기본 동작 유지
    },
    true
  );

  function beginDrag(e, kind, root, range, via) {
    const dt = e.dataTransfer;
    const path = e.composedPath();
    const origin = path[0];
    const nativeTypes = Array.from(dt.types || []);
    const sel = window.getSelection();
    // [G10] 페이지의 dragstart 핸들러가 preventDefault 로 취소하지 못하게
    e.stopImmediatePropagation();

    const id = uid();
    const r = root.getBoundingClientRect();
    const meta = {
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

    const preview = (kind === 'selection' ? sel.toString() : visibleText(root)).slice(0, 2000);
    let html = kind === 'selection' ? '' : root.outerHTML;
    const pad = Number(document.documentElement.getAttribute('data-wc-pad') || 0); // 대용량 테스트 훅
    if (pad > 0) html += '<!--' + 'x'.repeat(pad) + '-->';

    // [G11] 링크/이미지 위에서 시작한 드래그도 우리 데이터로 덮고, 드래그 이미지는 대상 전체로 (이미지 드래그의 Files 는 남음 [G12])
    if (kind === 'element') dt.clearData();
    dt.setData(WC_TYPE, JSON.stringify(meta));
    dt.setData('text/plain', preview);
    if (html) dt.setData('text/html', html);
    meta.htmlPayloadBytes = html.length;
    dt.effectAllowed = 'copyMove';
    if (kind === 'element' && origin !== root) {
      try {
        const ox = via === 'handle' ? 12 : e.clientX - r.left;
        const oy = via === 'handle' ? 12 : e.clientY - r.top;
        dt.setDragImage(root, ox, oy);
      } catch (_) {}
    }

    // [G3] 손잡이 드래그는 손잡이(라벨) 자체가 드래그 원본이라, dragstart 안에서 바로 숨기면 크롬이 드래그를 취소함
    if (via === 'handle') setTimeout(hideOverlay, 0);
    else hideOverlay();
    state.dragging = { id, root, meta };

    // 화면 캡처(대체 이미지·비교용)는 최대한 빨리 요청
    send({
      type: 'clip:begin',
      id,
      meta,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      viewport: { w: innerWidth, h: innerHeight },
    });

    // [D4] 무거운 스냅샷은 드래그가 시작된 뒤에 (드래그 시작을 늦추지 않게)
    setTimeout(() => {
      const t0 = performance.now();
      let clip;
      try {
        clip = snapshot(root, { range });
      } catch (err) {
        clip = { error: String(err && err.stack ? err.stack : err) };
      }
      clip.meta = meta;
      clip.stats = Object.assign(clip.stats || {}, { snapshotMs: Math.round(performance.now() - t0) });
      send({ type: 'clip:put', id, clip });
    }, 0);
  }

  window.addEventListener(
    'dragend',
    (e) => {
      state.pressed = false;
      const d = state.dragging;
      if (!d) return;
      state.dragging = null;
      send({ type: 'clip:end', id: d.id, dropEffect: e.dataTransfer ? e.dataTransfer.dropEffect : null });
      paintOverlay();
    },
    true
  );

  // [검증 전용 훅] 페이지 안 버튼 클릭 → content script → background 의 sidePanel.open() 이
  // 사용자 제스처로 인정되는지 확인하려고 만든 것 (결과: 인정됨).
  // 제품에서는 아무 페이지나 postMessage 로 패널을 열 수 있으면 안 되므로, 우리 오버레이 UI 안의 버튼으로 대체할 것.
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.__wc === 'open-panel') send({ type: 'open-panel' });
  });

  // ---------------------------------------------------------------- 유틸
  // [G5] 선택된 글자가 들어 있는 요소는 무장하지 않음
  // (크롬은 draggable 요소 안의 글자를 선택 불가로 취급해서, 무장하는 순간 선택이 사라져 보임)
  function holdsSelection(el) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    try {
      return sel.getRangeAt(0).intersectsNode(el);
    } catch (_) {
      return false;
    }
  }
  function pointInSelection(x, y) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    for (const r of sel.getRangeAt(0).getClientRects()) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  }
  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (_) {}
  }
  function uid() {
    return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
  }
  function visibleText(el) {
    return (el.innerText || el.textContent || '').replace(/\s+\n/g, '\n').trim();
  }

  // ================================================================ 스냅샷
  // 원리: 원본 요소를 복제하면서 "브라우저가 실제로 계산한 스타일"을 요소마다 인라인으로 굳힌다.
  //  - 부모 선택자(.article p 등)에 의존하던 스타일도 값으로 박히므로, 어디에 붙여도 모양이 유지됨
  //  - 계산값의 URL은 이미 절대경로라서 상대경로 문제도 같이 해결됨
  const SKIP_TAGS = new Set([
    'script', 'noscript', 'template', 'style', 'link', 'meta', 'base', 'title', 'head', 'wc-spike-overlay', 'source', 'track',
    // SVG 애니메이션: 정지 화면엔 불필요하고, <set attributeName="href" to="javascript:…"> 같은 우회 통로가 됨
    'set', 'animate', 'animateTransform', 'animateMotion', 'discard',
  ]);
  const SKIP_PROP_PREFIX = [
    '--', 'transition', 'animation', 'will-change', 'inline-size', 'block-size', 'min-inline-size', 'min-block-size',
    'max-inline-size', 'max-block-size', 'margin-block', 'margin-inline', 'padding-block', 'padding-inline', 'inset-block',
    'inset-inline', 'border-block', 'border-inline', 'border-start', 'border-end', 'scroll-', 'overscroll', 'contain-intrinsic',
    'overflow-block', 'overflow-inline', 'view-transition', 'anchor-', 'position-try', 'position-anchor', 'position-area',
    'position-visibility', 'offset-', '-webkit-user-drag', 'user-select', '-webkit-user-select', 'pointer-events',
    'content-visibility', 'container', 'touch-action', 'interactivity', 'field-sizing', 'interpolate-size', 'timeline-',
    'view-timeline', 'animation-timeline', 'caret', 'cursor', 'app-region', '-webkit-tap-highlight', 'speak', 'hyphenate-limit',
  ];
  const SKIP_PROP_EXACT = new Set(['contain', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'height', 'width', 'min-height']);
  const INHERITED = new Set(
    (
      'border-collapse border-spacing caption-side color color-scheme direction empty-cells font-family font-feature-settings ' +
      'font-kerning font-optical-sizing font-palette font-size font-size-adjust font-stretch font-style font-synthesis-small-caps ' +
      'font-synthesis-style font-synthesis-weight font-variant-alternates font-variant-caps font-variant-east-asian ' +
      'font-variant-emoji font-variant-ligatures font-variant-numeric font-variant-position font-variation-settings font-weight ' +
      'forced-color-adjust hyphens hyphenate-character image-orientation image-rendering letter-spacing line-break line-height ' +
      'list-style-image list-style-position list-style-type math-depth math-shift math-style orphans overflow-wrap paint-order ' +
      'print-color-adjust quotes ruby-align ruby-position tab-size text-align text-align-last text-anchor text-autospace ' +
      'text-combine-upright text-decoration-skip-ink text-emphasis-color text-emphasis-position text-emphasis-style text-indent ' +
      'text-justify text-orientation text-rendering text-shadow text-size-adjust text-spacing-trim text-transform ' +
      'text-underline-offset text-underline-position text-wrap-mode text-wrap-style visibility white-space-collapse widows ' +
      'word-break word-spacing writing-mode -webkit-text-fill-color -webkit-text-stroke-color -webkit-text-stroke-width ' +
      '-webkit-font-smoothing -webkit-locale -webkit-line-break -webkit-rtl-ordering -webkit-text-security ' +
      '-webkit-text-orientation -webkit-border-horizontal-spacing -webkit-border-vertical-spacing clip-rule color-interpolation ' +
      'color-interpolation-filters color-rendering dominant-baseline fill fill-opacity fill-rule marker-end marker-mid ' +
      'marker-start shape-rendering stroke stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit ' +
      'stroke-opacity stroke-width accent-color dynamic-range-limit'
    ).split(/\s+/)
  );
  const REPLACED = new Set(['img', 'svg', 'video', 'canvas', 'iframe', 'embed', 'object', 'input', 'textarea', 'select', 'button', 'progress', 'meter']);
  const HTML_ATTRS = new Set([
    'id', 'href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'width', 'height', 'dir', 'lang', 'type', 'value', 'checked',
    'disabled', 'placeholder', 'start', 'reversed', 'datetime', 'span', 'poster', 'name', 'open', 'label', 'selected', 'multiple',
    'rows', 'cols', 'readonly', 'role', 'aria-label', 'aria-hidden', 'cellpadding', 'cellspacing', 'border', 'scope', 'headers', 'abbr',
  ]);

  let defaultsFrame = null;
  const defaultsCache = new Map();
  function defaultsDoc() {
    if (defaultsFrame && defaultsFrame.isConnected && defaultsFrame.contentDocument) return defaultsFrame.contentDocument;
    defaultsFrame = document.createElement('iframe');
    defaultsFrame.setAttribute('data-wc-defaults', '');
    defaultsFrame.setAttribute('aria-hidden', 'true');
    defaultsFrame.style.cssText =
      'all:initial;position:fixed;left:-20000px;top:0;width:1200px;height:800px;visibility:hidden;border:0;pointer-events:none;';
    (document.documentElement || document.body).appendChild(defaultsFrame);
    const d = defaultsFrame.contentDocument;
    if (!d.body) {
      d.open();
      d.write('<!doctype html><html><head></head><body></body></html>');
      d.close();
    }
    return d;
  }
  function readStyle(cs) {
    const o = Object.create(null);
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i];
      o[p] = cs.getPropertyValue(p);
    }
    return o;
  }
  function defaultsFor(el, pseudo) {
    const ns = el.namespaceURI === SVG_NS ? 'svg' : 'html';
    const key = ns + ':' + el.localName + (pseudo || '');
    let v = defaultsCache.get(key);
    if (v) return v;
    const d = defaultsDoc();
    let probe, holder;
    if (ns === 'svg') {
      holder = d.createElementNS(SVG_NS, 'svg');
      probe = el.localName === 'svg' ? holder : d.createElementNS(SVG_NS, el.localName);
      if (probe !== holder) holder.appendChild(probe);
      d.body.appendChild(holder);
    } else {
      try {
        probe = d.createElement(el.localName);
      } catch (_) {
        probe = d.createElement('span');
      }
      holder = probe;
      d.body.appendChild(probe);
    }
    v = readStyle(d.defaultView.getComputedStyle(probe, pseudo || null));
    holder.remove();
    defaultsCache.set(key, v);
    return v;
  }

  const skipProp = (p) => {
    if (SKIP_PROP_EXACT.has(p)) return true;
    for (const pre of SKIP_PROP_PREFIX) if (p.startsWith(pre)) return true;
    return false;
  };

  // [G7] 검사할 CSS 속성 목록은 "깨끗한 문서의 기본 요소"에서 한 번만 뽑아 둠.
  // (GitHub 처럼 CSS 변수가 수천 개인 사이트는 요소마다 cs.length 가 2,400개 안팎이 되어
  //  전부 훑으면 매우 느려짐 → 실제 CSS 속성 ~380개만 확인)
  let PROPS = null;
  function propList() {
    if (PROPS) return PROPS;
    const probe = document.createElement('div');
    PROPS = Object.keys(defaultsFor(probe)).filter((p) => !skipProp(p));
    return PROPS;
  }

  function styleText(cs, parentCS, defs, isRoot, extra) {
    let out = '';
    let n = 0;
    for (const p of propList()) {
      const v = cs.getPropertyValue(p);
      if (!v) continue;
      if (INHERITED.has(p)) {
        if (!isRoot && parentCS && parentCS.getPropertyValue(p) === v) continue;
      } else if (defs[p] === v) {
        continue;
      }
      if ((p === 'transform-origin' || p === 'perspective-origin') && cs.transform === 'none' && cs.perspective === 'none') continue;
      // 안 보이는 테두리/윤곽선 색은 생략(용량 절약)
      const m = /^border-(top|right|bottom|left)-color$/.exec(p);
      if (m && cs.getPropertyValue(`border-${m[1]}-style`) === 'none') continue;
      if (p === 'outline-color' && cs.outlineStyle === 'none') continue;
      if (p === 'column-rule-color' && cs.columnRuleStyle === 'none') continue;
      if (p === 'text-decoration-color' && cs.textDecorationLine === 'none') continue;
      out += p + ':' + v + ';';
      n++;
    }
    // [G6] 테두리 스타일이 있으면 두께도 반드시 함께 (Tailwind 처럼 "solid + 0px" 인 경우,
    // 0px 이 기본값과 같다고 빼버리면 브라우저가 기본 두께 3px 로 그려버림)
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const bs = cs.getPropertyValue(`border-${side}-style`);
      if (bs && bs !== 'none' && bs !== 'hidden' && !out.includes(`border-${side}-width:`)) {
        out += `border-${side}-width:${cs.getPropertyValue(`border-${side}-width`)};`;
      }
    }
    if (cs.outlineStyle && cs.outlineStyle !== 'none' && !out.includes('outline-width:')) out += `outline-width:${cs.outlineWidth};`;
    if (cs.columnRuleStyle && cs.columnRuleStyle !== 'none' && !out.includes('column-rule-width:')) out += `column-rule-width:${cs.columnRuleWidth};`;
    if (extra) out += extra;
    return { text: out, n };
  }

  function absUrl(u, base) {
    try {
      return new URL(u, base || document.baseURI).href;
    } catch (_) {
      return u;
    }
  }
  // 정규화한 뒤의 프로토콜로 판단해야 함: URL 파서는 탭·줄바꿈을 지우므로 "jav\tascript:" 가 javascript: 가 됨
  function safeUrl(u, kind) {
    const abs = absUrl(u);
    let proto = '';
    try {
      proto = new URL(abs).protocol;
    } catch (_) {
      return null;
    }
    if (proto === 'http:' || proto === 'https:') return abs;
    if (kind === 'src' && proto === 'data:' && /^data:image\//i.test(abs)) return abs;
    return null; // javascript:, vbscript:, data:text/html, file:, blob:(패널에서 못 씀) 등은 버림
  }
  const URL_RE = /url\((['"]?)(.*?)\1\)/g;

  function snapshot(root, opts) {
    const range = opts && opts.range;
    // [G15] 비활성 문서에서 복제본 생성 (페이지의 커스텀 엘리먼트 코드가 실행되지 않게)
    const doc = document.implementation.createHTMLDocument('');
    const ctx = {
      doc,
      range,
      rules: [],
      wcid: 0,
      nodes: 0,
      props: 0,
      families: new Set(),
      images: new Set(),
      svgRefs: new Set(),
      fallbacks: [],
      warnings: [],
      t0: performance.now(),
    };
    const rootCS = getComputedStyle(root);
    const out = cloneEl(root, null, ctx, true);
    if (!out) throw new Error('루트 요소가 보이지 않습니다(display:none?)');

    // 루트 보정: 원래 위치에서 떼어낸 것이므로 위치/여백/변형을 초기화
    const r = root.getBoundingClientRect();
    out.style.setProperty('position', 'relative');
    for (const p of ['top', 'left', 'right', 'bottom', 'margin-top', 'margin-left', 'margin-right', 'margin-bottom', 'transform', 'translate', 'rotate', 'scale', 'float']) {
      out.style.removeProperty(p);
    }
    out.style.setProperty('margin', '0');
    out.setAttribute('data-wc-root', '');
    if (rootCS.display === 'inline' || rootCS.display === 'contents') out.style.setProperty('display', 'inline-block');

    // <use href="#..."> 가 참조하는 SVG 심볼을 같이 담기
    let defs = '';
    if (ctx.svgRefs.size) {
      const parts = [];
      for (const ref of ctx.svgRefs) {
        const target = (root.getRootNode && root.getRootNode().getElementById
          ? root.getRootNode().getElementById(ref)
          : null) || document.getElementById(ref);
        if (target) parts.push(sanitizeSvgSubtree(target.cloneNode(true)).outerHTML);
      }
      if (parts.length) defs = `<svg xmlns="${SVG_NS}" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>${parts.join('')}</defs></svg>`;
    }

    const tf = performance.now();
    const fonts = collectFontFaces(ctx.families);
    const fontScanMs = Math.round(performance.now() - tf);
    const html = out.outerHTML;
    return {
      html,
      css: ctx.rules.join('\n'),
      defs,
      width: Math.ceil(r.width),
      height: Math.ceil(r.height),
      families: Array.from(ctx.families),
      fontFaces: fonts.fontFaces,
      crossOriginSheets: fonts.crossOriginSheets,
      imageUrls: Array.from(ctx.images),
      fallbacks: ctx.fallbacks,
      warnings: ctx.warnings,
      stats: { nodes: ctx.nodes, props: ctx.props, htmlBytes: html.length, pseudoRules: ctx.rules.length, fontScanMs, walkMs: Math.round(tf - ctx.t0) },
    };
  }

  function addFamilies(ctx, ff) {
    for (const f of ff.split(',')) {
      const name = f.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
      if (name) ctx.families.add(name);
    }
  }
  function addUrls(ctx, text) {
    if (!text || text.indexOf('url(') < 0) return;
    URL_RE.lastIndex = 0;
    let m;
    while ((m = URL_RE.exec(text))) {
      const u = m[2];
      if (/^https?:/i.test(u)) ctx.images.add(u);
    }
  }

  function fallbackImg(ctx, el, cs, reason) {
    const img = ctx.doc.createElement('img');
    const r = el.getBoundingClientRect();
    const n = ctx.fallbacks.length;
    img.setAttribute('data-wc-fallback', String(n));
    img.setAttribute('alt', reason);
    ctx.fallbacks.push({ n, reason, rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
    return img;
  }

  function cloneEl(el, parentCS, ctx, isRoot) {
    const tag = el.localName;
    if (SKIP_TAGS.has(tag)) return null;
    if (ctx.range && !isRoot && !ctx.range.intersectsNode(el)) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return null;
    if (++ctx.nodes > 20000) throw new Error('요소가 너무 많습니다(2만 개 초과)');

    const isSvg = el.namespaceURI === SVG_NS;
    let out;
    let replacedBy = null;
    if (tag === 'canvas') {
      try {
        const url = el.toDataURL('image/png');
        out = ctx.doc.createElement('img');
        out.setAttribute('src', url);
        replacedBy = 'canvas→img';
      } catch (_) {
        out = fallbackImg(ctx, el, cs, 'canvas(cross-origin)');
        replacedBy = 'canvas→screenshot';
      }
    } else if (tag === 'iframe' || tag === 'embed' || tag === 'object') {
      out = fallbackImg(ctx, el, cs, tag);
      replacedBy = tag + '→screenshot';
    } else if (tag === 'video') {
      const poster = el.getAttribute('poster') && safeUrl(el.getAttribute('poster'), 'src');
      if (poster) {
        out = ctx.doc.createElement('img');
        out.setAttribute('src', poster);
        if (/^https?:/i.test(poster)) ctx.images.add(poster);
        replacedBy = 'video→poster';
      } else {
        out = fallbackImg(ctx, el, cs, 'video');
        replacedBy = 'video→screenshot';
      }
    } else {
      try {
        out = isSvg ? ctx.doc.createElementNS(SVG_NS, tag) : ctx.doc.createElement(tag);
      } catch (_) {
        out = ctx.doc.createElement('span');
        ctx.warnings.push('이상한 태그 이름: ' + tag);
      }
      copyAttrs(el, out, isSvg, ctx);
    }

    // 스타일 굳히기
    const defs = defaultsFor(el);
    const st = styleText(cs, parentCS, defs, isRoot, '');
    ctx.props += st.n;
    let extra = '';
    const disp = cs.display;
    const replaced = REPLACED.has(tag) || replacedBy || (isSvg && tag === 'svg');
    if (!isSvg || tag === 'svg') {
      if (replaced) {
        extra += `width:${cs.width};height:${cs.height};`;
      } else if (disp !== 'inline' && disp !== 'contents' && !disp.startsWith('table-') && disp !== 'table') {
        if (cs.width.endsWith('px')) extra += `width:${cs.width};`;
        if (cs.height.endsWith('px') && parseFloat(cs.height) > 0) extra += `min-height:${cs.height};`;
      } else if (disp === 'table') {
        if (cs.width.endsWith('px')) extra += `width:${cs.width};`;
      }
    }
    // [G8] 스냅샷은 정지 화면이라 스크롤바가 필요 없음 (스크롤 영역 → 잘라서 보여주기)
    if (/auto|scroll/.test(cs.overflowX)) extra += 'overflow-x:hidden;';
    if (/auto|scroll/.test(cs.overflowY)) extra += 'overflow-y:hidden;';
    // 고정/스티키 요소는 패널 안에서 따라다니지 않게
    if (!isRoot && cs.position === 'fixed') extra += 'position:absolute;';
    if (!isRoot && cs.position === 'sticky') extra += 'position:relative;';
    if (replacedBy && replacedBy.endsWith('screenshot')) extra += 'object-fit:fill;';
    out.setAttribute('style', st.text + extra);
    addFamilies(ctx, cs.fontFamily);
    addUrls(ctx, st.text);

    // 가상 요소 ::before / ::after
    if (!replacedBy) {
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(el, pseudo);
        const content = ps.content;
        if (!content || content === 'none' || content === 'normal') continue;
        const pdefs = defaultsFor(el, pseudo);
        const pst = styleText(ps, cs, pdefs, false, '');
        if (!out.hasAttribute('data-wcid')) out.setAttribute('data-wcid', String(++ctx.wcid));
        ctx.rules.push(`[data-wcid="${out.getAttribute('data-wcid')}"]${pseudo}{${pst.text}content:${content};}`);
        addFamilies(ctx, ps.fontFamily);
        addUrls(ctx, pst.text + content);
      }
    }

    if (replacedBy) return out;

    // 폼 값
    if (tag === 'input') {
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) out.setAttribute('checked', '');
      } else if (el.type !== 'password' && el.type !== 'file') {
        out.setAttribute('value', el.value);
      }
      return out;
    }
    if (tag === 'textarea') {
      out.textContent = el.value;
      return out;
    }
    if (tag === 'img') return out;

    // [G14] 자식 (Shadow DOM 은 펼쳐서 담기: closed 는 chrome.dom.openOrClosedShadowRoot, slot 은 할당 노드로)
    const sr = el.shadowRoot || (chrome.dom && chrome.dom.openOrClosedShadowRoot ? safeShadow(el) : null);
    const kids = sr ? sr.childNodes : el.childNodes;
    appendKids(kids, out, cs, ctx);
    if (tag === 'select') {
      Array.from(out.querySelectorAll('option')).forEach((o, i) => {
        if (el.options[i] && el.options[i].selected) o.setAttribute('selected', '');
      });
    }
    return out;
  }

  function safeShadow(el) {
    try {
      return chrome.dom.openOrClosedShadowRoot(el);
    } catch (_) {
      return null;
    }
  }

  function appendKids(kids, out, cs, ctx) {
    for (const k of kids) {
      if (k.nodeType === 3) {
        let text = k.data;
        if (ctx.range) {
          if (!ctx.range.intersectsNode(k)) continue;
          const s = k === ctx.range.startContainer ? ctx.range.startOffset : 0;
          const e = k === ctx.range.endContainer ? ctx.range.endOffset : k.data.length;
          text = k.data.slice(s, e);
        }
        out.appendChild(ctx.doc.createTextNode(text));
      } else if (k.nodeType === 1) {
        if (k.localName === 'slot') {
          const assigned = k.assignedNodes({ flatten: true });
          appendKids(assigned.length ? assigned : k.childNodes, out, cs, ctx);
          continue;
        }
        const c = cloneEl(k, cs, ctx, false);
        if (c) out.appendChild(c);
      }
    }
  }

  function copyAttrs(el, out, isSvg, ctx) {
    for (const a of Array.from(el.attributes)) {
      const name = a.name;
      const lname = name.toLowerCase();
      if (lname.startsWith('on') || lname === 'style' || lname === 'class' || lname.startsWith('data-wc')) continue;
      if (!isSvg && !HTML_ATTRS.has(lname)) continue;
      let v = a.value;
      if (lname === 'href' || lname === 'xlink:href' || lname === 'src') {
        if (isSvg && v.startsWith('#')) {
          if (el.localName === 'use') ctx.svgRefs.add(v.slice(1));
        } else {
          const safe = safeUrl(v, lname === 'src' || (isSvg && el.localName === 'image') ? 'src' : 'href');
          if (!safe) continue;
          v = safe;
          if (isSvg && el.localName === 'image') ctx.images.add(v);
        }
      }
      try {
        if (isSvg && name.includes(':')) {
          const nsUri = name.startsWith('xlink:') ? 'http://www.w3.org/1999/xlink' : a.namespaceURI;
          out.setAttributeNS(nsUri, name, v);
        } else {
          out.setAttribute(name, v);
        }
      } catch (_) {}
    }
    if (el.localName === 'img') {
      let src = el.currentSrc || el.src;
      if (!src || (!el.complete && !el.naturalWidth)) {
        const lazy = el.getAttribute('data-src') || el.getAttribute('data-original') || el.getAttribute('data-lazy-src');
        if (lazy) src = absUrl(lazy);
      }
      const safeSrc = src && safeUrl(src, 'src');
      if (safeSrc) {
        out.setAttribute('src', safeSrc);
        if (/^https?:/i.test(safeSrc)) ctx.images.add(safeSrc);
      }
    }
    if (el.localName === 'a') {
      out.setAttribute('target', '_blank');
      out.setAttribute('rel', 'noopener noreferrer');
    }
  }

  function sanitizeSvgSubtree(node) {
    const walker = [node];
    while (walker.length) {
      const n = walker.pop();
      if (n.nodeType !== 1) continue;
      if (n.localName === 'script' || n.localName === 'foreignObject') {
        n.remove();
        continue;
      }
      for (const a of Array.from(n.attributes)) if (a.name.toLowerCase().startsWith('on')) n.removeAttribute(a.name);
      walker.push(...n.childNodes);
    }
    return node;
  }

  function collectFontFaces(families) {
    const fontFaces = [];
    const crossOriginSheets = [];
    const seen = new Set();
    const visit = (rules, base) => {
      for (const rule of rules) {
        if (rule.type === CSSRule.FONT_FACE_RULE) {
          const fam = rule.style.getPropertyValue('font-family').trim().replace(/^['"]|['"]$/g, '').toLowerCase();
          if (!families.has(fam)) continue;
          const text = rule.cssText.replace(URL_RE, (m, q, u) => `url("${u.startsWith('data:') ? u : absUrl(u, base)}")`);
          if (!seen.has(text)) {
            seen.add(text);
            fontFaces.push(text);
          }
        } else if (rule.type === CSSRule.IMPORT_RULE) {
          try {
            visit(rule.styleSheet.cssRules, rule.styleSheet.href || base);
          } catch (_) {
            if (rule.styleSheet && rule.styleSheet.href) crossOriginSheets.push(rule.styleSheet.href);
          }
        } else if (rule.cssRules) {
          visit(rule.cssRules, base);
        }
      }
    };
    const sheets = [...document.styleSheets, ...(document.adoptedStyleSheets || [])];
    for (const sheet of sheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (_) {
        if (sheet.href) crossOriginSheets.push(sheet.href);
        continue;
      }
      visit(rules, sheet.href || document.baseURI);
    }
    return { fontFaces, crossOriginSheets: Array.from(new Set(crossOriginSheets)) };
  }
})();
