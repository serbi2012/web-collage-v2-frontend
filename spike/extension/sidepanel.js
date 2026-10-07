// Web Collage Spike — side panel
// 페이지에서 끌어온 드래그를 받아서, 번호표로 스냅샷을 받아와 박스 안 원하는 위치에 렌더링
const WC_TYPE = 'application/x-web-collage';
const MOVE_TYPE = 'application/x-wc-move';
const REPORT_URL = 'http://127.0.0.1:8765/report'; // 검증 하네스 전용 (배포본에서는 비움)

// 패널이 열려 있는 동안 스크랩 모드 유지
const port = chrome.runtime.connect({ name: 'panel' });
setInterval(() => {
  try {
    port.postMessage({ ping: Date.now() });
  } catch (_) {}
}, 20000);

const board = document.getElementById('board');
const indicator = document.getElementById('indicator');
let session = null; // 진행 중인 드래그 정보
let blockSeq = 0;
window.__wcResults = [];

// ---------------------------------------------------------------- 드롭 위치 계산
function dropSpot(x, y) {
  const el = document.elementFromPoint(x, y);
  let box = el && el.closest('.box');
  // [G17] (알려진 버그) 고정 헤더 위처럼 박스 밖이면 마지막 박스로 들어감 → v2 에서 수정. 긴 패널 자동 스크롤도 없음
  if (!box) {
    const boxes = [...board.querySelectorAll('.box:not(.new-box)')];
    box = boxes[boxes.length - 1];
  }
  if (box.classList.contains('new-box')) return { box, isNew: true, index: 0 };
  const blocks = [...box.querySelectorAll(':scope > .blocks > .block')];
  let index = blocks.length;
  for (let i = 0; i < blocks.length; i++) {
    const r = blocks[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) {
      index = i;
      break;
    }
  }
  return { box, isNew: false, index, blocks };
}

function showIndicator(spot) {
  board.querySelectorAll('.box.over').forEach((b) => b !== spot.box && b.classList.remove('over'));
  spot.box.classList.add('over');
  if (spot.isNew) {
    indicator.style.display = 'none';
    return;
  }
  const list = spot.box.querySelector('.blocks');
  const lr = list.getBoundingClientRect();
  let y;
  if (!spot.blocks.length) y = lr.top + lr.height / 2;
  else if (spot.index < spot.blocks.length) y = spot.blocks[spot.index].getBoundingClientRect().top - 5;
  else y = spot.blocks[spot.blocks.length - 1].getBoundingClientRect().bottom + 5;
  Object.assign(indicator.style, { display: 'block', left: lr.left + 'px', width: lr.width + 'px', top: y - 1 + 'px' });
}
function hideIndicator() {
  indicator.style.display = 'none';
  board.querySelectorAll('.box.over').forEach((b) => b.classList.remove('over'));
}

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (!session) session = { firstTypes: [...e.dataTransfer.types], enterAt: Date.now(), overs: 0 };
});
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (session) session.overs++;
  e.dataTransfer.dropEffect = e.dataTransfer.types.includes(MOVE_TYPE) ? 'move' : 'copy';
  showIndicator(dropSpot(e.clientX, e.clientY));
});
document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight)) {
    hideIndicator();
    session = null;
  }
});
document.addEventListener('drop', onDrop);

// ---------------------------------------------------------------- 드롭 처리
async function onDrop(e) {
  e.preventDefault();
  const dropAt = Date.now();
  const dt = e.dataTransfer;
  const spot = dropSpot(e.clientX, e.clientY);
  hideIndicator();
  const types = [...dt.types];
  const data = {};
  const sizes = {};
  for (const t of types) {
    if (t === 'Files') { // [G12] 이미지 드래그엔 Files 가 같이 옴
      sizes.Files = dt.files.length;
      continue;
    }
    data[t] = dt.getData(t);
    sizes[t] = data[t].length;
  }
  const s = session;
  session = null;

  if (types.includes(MOVE_TYPE)) {
    moveBlock(data[MOVE_TYPE], spot);
    return;
  }

  const container = spot.isNew ? newBox() : spot.box.querySelector('.blocks');
  let meta = null;
  try {
    meta = data[WC_TYPE] ? JSON.parse(data[WC_TYPE]) : null;
  } catch (_) {}

  const block = createBlock(meta, data['text/plain'] || data['text/uri-list'] || '');
  const index = spot.isNew ? 0 : spot.index;
  const siblings = [...container.querySelectorAll(':scope > .block')];
  container.insertBefore(block, siblings[index] || null);

  const result = {
    kind: 'drop',
    types,
    sizes,
    firstTypes: s && s.firstTypes,
    dragovers: s && s.overs,
    customTypeArrived: !!meta,
    meta,
    box: [...board.querySelectorAll('.box')].indexOf(container.closest('.box')),
    index,
    panelWidth: innerWidth,
    dragDurationMs: meta ? dropAt - meta.startedAt : null,
  };

  if (!meta) {
    renderForeign(block, data);
    result.foreign = true;
    return logResult(result, block);
  }

  const t0 = performance.now();
  const clip = await chrome.runtime.sendMessage({ type: 'clip:get', id: meta.id });
  result.waitForClipMs = Math.round(performance.now() - t0);
  if (!clip || clip.error) {
    result.error = (clip && clip.error) || 'no clip';
    markError(block, result.error);
    return logResult(result, block);
  }
  const t1 = performance.now();
  renderClip(block, clip);
  result.renderMs = Math.round(performance.now() - t1);
  result.dropToVisibleMs = Date.now() - dropAt;
  result.stats = clip.stats;
  result.warnings = clip.warnings;
  result.finalizeError = clip.finalizeError;
  result.fallbacks = (clip.fallbacks || []).map((f) => ({ reason: f.reason, ok: !!f.dataUrl }));
  result.hasRefShot = !!clip.refShot;

  Object.assign(result, await checkAssets(block, clip, meta));
  const endInfo = await chrome.runtime.sendMessage({ type: 'clip:end-info', id: meta.id });
  result.sourceDropEffect = endInfo && endInfo.dropEffect;
  logResult(result, block);
}

// ---------------------------------------------------------------- 블록
function createBlock(meta, preview) {
  const block = document.createElement('article');
  block.className = 'block';
  block.dataset.bid = String(++blockSeq);
  const head = document.createElement('div');
  head.className = 'block-head';
  head.draggable = true;
  const host = meta ? safeHost(meta.url) : '외부 드롭';
  head.innerHTML = `<span class="src"></span><button class="cmp" title="원본 화면과 비교">비교</button><button class="del" title="삭제">✕</button>`;
  head.querySelector('.src').textContent = `${host} · ${meta ? meta.kind + ' <' + meta.tag + '>' : ''}`;
  head.title = meta ? meta.title + '\n' + meta.url : '';
  head.querySelector('.del').onclick = () => block.remove();
  head.querySelector('.cmp').onclick = () => block.classList.toggle('compare');
  head.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData(MOVE_TYPE, block.dataset.bid);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(block, 20, 12);
  });
  const clip = document.createElement('div');
  clip.className = 'clip';
  const ph = document.createElement('div');
  ph.className = 'placeholder';
  ph.textContent = '가져오는 중…\n' + (preview || '').slice(0, 200);
  clip.appendChild(ph);
  const ref = document.createElement('div');
  ref.className = 'refshot';
  block.append(head, clip, ref);
  return block;
}

function moveBlock(bid, spot) {
  const block = board.querySelector(`.block[data-bid="${CSS.escape(bid)}"]`);
  if (!block) return;
  const container = spot.isNew ? newBox() : spot.box.querySelector('.blocks');
  const siblings = [...container.querySelectorAll(':scope > .block')].filter((b) => b !== block);
  container.insertBefore(block, siblings[spot.index] || null);
  logResult({ kind: 'move', bid, box: [...board.querySelectorAll('.box')].indexOf(container.closest('.box')), index: spot.index });
}

function newBox() {
  const n = board.querySelectorAll('.box:not(.new-box)').length;
  const box = document.createElement('section');
  box.className = 'box';
  box.dataset.box = String(n);
  box.innerHTML = `<h2 class="box-title">Box ${n + 1}</h2><div class="blocks"></div>`;
  board.insertBefore(box, board.querySelector('.new-box'));
  return box.querySelector('.blocks');
}

function safeHost(u) {
  try {
    return new URL(u).host;
  } catch (_) {
    return u;
  }
}

function markError(block, err) {
  block.classList.add('error');
  block.querySelector('.placeholder').textContent = '실패: ' + err;
}

function renderForeign(block, data) {
  const host = block.querySelector('.clip');
  const sr = host.attachShadow({ mode: 'open' });
  if (data['text/html']) sr.innerHTML = `<style>:host{all:initial;display:block;padding:8px;font:14px system-ui}</style>${data['text/html']}`;
  else sr.textContent = data['text/plain'] || data['text/uri-list'] || '(내용 없음)';
}

function renderClip(block, clip) {
  const host = block.querySelector('.clip');
  host.textContent = '';
  const sr = host.shadowRoot || host.attachShadow({ mode: 'open' });
  sr.innerHTML =
    `<style>:host{all:initial;display:block;overflow:hidden} .wrap{width:${clip.width}px} ${clip.css || ''}</style>` +
    (clip.defs || '') +
    `<div class="wrap">${clip.html}</div>`;
  sr.querySelectorAll('img[data-wc-fallback]').forEach((img) => {
    const fb = clip.fallbacks[Number(img.getAttribute('data-wc-fallback'))];
    if (fb && fb.dataUrl) img.src = fb.dataUrl;
  });
  block.dataset.w = String(clip.width);
  if (clip.refShot) block.querySelector('.refshot').innerHTML = `<img alt="원본 화면" src="${clip.refShot}">`;
  injectFonts(clip.fontFaces || []);
  fit(block);
}

function fit(block) {
  const host = block.querySelector('.clip');
  const wrap = host.shadowRoot && host.shadowRoot.querySelector('.wrap');
  if (!wrap) return;
  const w = Number(block.dataset.w) || 1;
  const avail = host.clientWidth || block.clientWidth;
  wrap.style.zoom = String(w > avail ? avail / w : 1);
}
new ResizeObserver(() => document.querySelectorAll('.block').forEach(fit)).observe(document.body);

const fontStyle = document.createElement('style');
fontStyle.id = 'wc-fonts';
document.head.appendChild(fontStyle);
const fontSeen = new Set();
// [G13] @font-face 는 Shadow DOM 안에서 무시되므로 패널 문서 head 에 주입
function injectFonts(faces) {
  let add = '';
  for (const f of faces) {
    if (fontSeen.has(f)) continue;
    fontSeen.add(f);
    add += f + '\n';
  }
  if (add) fontStyle.textContent += add;
}

// ---------------------------------------------------------------- 이미지·폰트 점검 + 로컬화
async function checkAssets(block, clip, meta) {
  const sr = block.querySelector('.clip').shadowRoot;
  const out = {};
  const imgs = [...sr.querySelectorAll('img')].filter((i) => /^https?:/i.test(i.getAttribute('src') || ''));
  await Promise.all(imgs.map((img) => waitImg(img, 5000)));
  out.imgDirect = { total: imgs.length, ok: imgs.filter((i) => i.naturalWidth > 0).length };

  // 저장용으로 이미지를 직접 가져와 data URL 로 바꿔 넣기 (핫링크 차단 대응 포함)
  const urls = clip.imageUrls || [];
  if (urls.length) {
    const t0 = performance.now();
    const res = await chrome.runtime.sendMessage({ type: 'localize', urls, referer: meta.url });
    out.localize = { total: urls.length, ok: 0, viaReferer: 0, fail: 0, failures: [], ms: Math.round(performance.now() - t0) };
    for (const u of urls) {
      const r = res && res[u];
      if (r && r.dataUrl) {
        out.localize.ok++;
        if (r.via === 'referer') out.localize.viaReferer++;
        sr.querySelectorAll('img').forEach((img) => {
          if (img.getAttribute('src') === u) img.setAttribute('src', r.dataUrl);
        });
        sr.querySelectorAll('[style*="url("]').forEach((el) => {
          const st = el.getAttribute('style');
          if (st.includes(u)) el.setAttribute('style', st.split(u).join(r.dataUrl));
        });
      } else {
        out.localize.fail++;
        if (out.localize.failures.length < 5) out.localize.failures.push({ u: u.slice(0, 140), status: r && (r.status || r.error), first: r && (r.firstStatus || r.firstError) });
      }
    }
    const imgs2 = [...sr.querySelectorAll('img')];
    await Promise.all(imgs2.map((img) => waitImg(img, 3000)));
    out.imgFinal = { total: imgs2.length, ok: imgs2.filter((i) => i.naturalWidth > 0).length };
  }

  // 폰트: 렌더링에 필요한 서브셋이 실제로 받아졌는지
  const fams = new Set(clip.families || []);
  if ((clip.fontFaces || []).length) {
    await new Promise((r) => setTimeout(r, 2500));
    const faces = [...document.fonts].filter((f) => fams.has(f.family.replace(/^['"]|['"]$/g, '').toLowerCase()));
    out.fonts = {
      declared: clip.fontFaces.length,
      loaded: faces.filter((f) => f.status === 'loaded').length,
      error: faces.filter((f) => f.status === 'error').length,
      families: [...new Set(faces.filter((f) => f.status === 'loaded').map((f) => f.family))].slice(0, 8),
    };
  } else {
    out.fonts = { declared: 0 };
  }
  return out;
}

function waitImg(img, ms) {
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    const done = () => {
      clearTimeout(t);
      resolve();
    };
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });
}

// ---------------------------------------------------------------- 결과 기록
function logResult(result, block) {
  window.__wcResults.push(result);
  const li = document.createElement('li');
  const okDrop = result.kind === 'move' || result.customTypeArrived;
  const st = result.stats || {};
  li.innerHTML =
    result.kind === 'move'
      ? `<span class="ok">이동</span> → Box ${result.box + 1} #${result.index}`
      : `<span class="${okDrop ? 'ok' : 'bad'}">${okDrop ? '드롭 OK' : '외부 드롭'}</span> ` +
        `${result.meta ? safeHost(result.meta.url) : ''} &lt;${result.meta ? result.meta.tag : '?'}&gt; ` +
        `· 타입 ${result.types.length}개 · 스냅샷 ${st.snapshotMs ?? '-'}ms/${st.nodes ?? '-'}노드 · ` +
        `드롭→표시 ${result.dropToVisibleMs ?? '-'}ms` +
        (result.error ? ` · <span class="bad">${result.error}</span>` : '');
  const log = document.getElementById('log');
  log.prepend(li);
  document.getElementById('logcount').textContent = String(log.children.length);
  if (REPORT_URL) {
    fetch(REPORT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ from: 'panel', at: Date.now() }, result)),
    }).catch(() => {});
  }
}
