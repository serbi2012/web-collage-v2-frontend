// Web Collage Spike — background (service worker)
// 역할: 번호표(id) ↔ 스냅샷 보관소, 화면 캡처로 대체 이미지 만들기, 이미지·폰트 가져오기

// [G18] 메모리 보관소: MV3 service worker 가 잠들면 사라짐 → v2 에서는 IndexedDB 로 영속화할 것
const clips = new Map(); // id -> { meta, rect, viewport, shotP, clip, endInfo, waiters }
const panelPorts = new Set();

function rec(id) {
  let r = clips.get(id);
  if (!r) {
    r = { id, waiters: [], createdAt: Date.now() };
    clips.set(id, r);
  }
  return r;
}

async function init() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (e) {
    console.warn('setPanelBehavior', e);
  }
}
chrome.runtime.onInstalled.addListener(() => {
  init();
  chrome.storage.local.set({ scrapEnabled: false });
});
chrome.runtime.onStartup.addListener(() => {
  init();
  chrome.storage.local.set({ scrapEnabled: false });
});
init();

// 패널이 열려 있는 동안만 스크랩 모드
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'panel') return;
  panelPorts.add(port);
  chrome.storage.local.set({ scrapEnabled: true });
  port.onMessage.addListener(() => {}); // keep-alive ping
  port.onDisconnect.addListener(() => {
    panelPorts.delete(port);
    if (panelPorts.size === 0) chrome.storage.local.set({ scrapEnabled: false });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg && msg.type) {
    case 'clip:begin': {
      const r = rec(msg.id);
      r.meta = msg.meta;
      r.rect = msg.rect;
      r.viewport = msg.viewport;
      r.tabId = sender.tab && sender.tab.id;
      // 최상위 프레임만 화면 캡처(하위 프레임은 좌표 변환이 필요해서 이번 검증에선 제외)
      if (msg.meta && msg.meta.isTop && sender.tab) {
        const t0 = Date.now();
        // [G9] 하이라이트 오버레이가 화면에서 사라진 다음 프레임을 찍도록 아주 잠깐 대기 (captureVisibleTab 은 초당 2회 제한)
        r.shotP = new Promise((res) => setTimeout(res, 90))
          .then(() => chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }))
          .then((dataUrl) => ({ dataUrl, ms: Date.now() - t0 }))
          .catch((e) => ({ error: String(e && e.message ? e.message : e) }));
      }
      return false;
    }
    case 'clip:put': {
      finalize(msg.id, msg.clip);
      return false;
    }
    case 'clip:end': {
      const r = rec(msg.id);
      r.endInfo = { dropEffect: msg.dropEffect, at: Date.now() };
      return false;
    }
    case 'clip:get': {
      getClip(msg.id, msg.timeoutMs || 15000).then(sendResponse);
      return true;
    }
    case 'clip:end-info': {
      const r = clips.get(msg.id);
      sendResponse(r ? r.endInfo || null : null);
      return false;
    }
    case 'localize': {
      localize(msg.urls || [], msg.referer).then(sendResponse);
      return true;
    }
    case 'open-panel': {
      // 사용자 제스처가 content script → background 로 전달되는지 확인용
      const tabId = sender.tab && sender.tab.id;
      chrome.sidePanel
        .open({ tabId })
        .then(() => report({ kind: 'open-panel', ok: true }))
        .catch((e) => report({ kind: 'open-panel', ok: false, error: String(e && e.message ? e.message : e) }));
      return false;
    }
  }
  return false;
});

async function finalize(id, clip) {
  const r = rec(id);
  const t0 = Date.now();
  try {
    // 1) 교차 출처 스타일시트의 @font-face 가져오기
    if (clip.crossOriginSheets && clip.crossOriginSheets.length && clip.families && clip.families.length) {
      const fams = new Set(clip.families);
      const extra = await Promise.all(clip.crossOriginSheets.slice(0, 12).map((u) => fontFacesFromSheet(u, fams)));
      const seen = new Set(clip.fontFaces);
      for (const list of extra) for (const f of list) if (!seen.has(f)) {
        seen.add(f);
        clip.fontFaces.push(f);
      }
      clip.stats.crossOriginSheetsFetched = clip.crossOriginSheets.length;
    }
    // 2) canvas/iframe/video 대체 이미지 + 원본 비교용 스크린샷
    if (r.shotP) {
      const shot = await r.shotP;
      if (shot.dataUrl) {
        clip.stats.captureMs = shot.ms;
        const bmp = await createImageBitmap(await (await fetch(shot.dataUrl)).blob());
        const ratio = r.viewport && r.viewport.w ? bmp.width / r.viewport.w : 1;
        clip.refShot = await crop(bmp, r.rect, ratio);
        for (const fb of clip.fallbacks || []) {
          fb.dataUrl = await crop(bmp, fb.rect, ratio);
        }
        bmp.close && bmp.close();
      } else {
        clip.stats.captureError = shot.error;
      }
    }
    clip.stats.finalizeMs = Date.now() - t0;
  } catch (e) {
    clip.finalizeError = String(e && e.stack ? e.stack : e);
  }
  r.clip = clip;
  r.readyAt = Date.now();
  for (const w of r.waiters.splice(0)) w(clip);
  // 오래된 것 정리
  for (const [k, v] of clips) if (Date.now() - v.createdAt > 10 * 60 * 1000) clips.delete(k);
}

function getClip(id, timeoutMs) {
  const r = rec(id);
  if (r.clip) return Promise.resolve(r.clip);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: 'timeout: 스냅샷이 도착하지 않음' }), timeoutMs);
    r.waiters.push((c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
}

async function crop(bmp, rect, ratio) {
  if (!rect) return null;
  const sx = Math.max(0, Math.round(rect.x * ratio));
  const sy = Math.max(0, Math.round(rect.y * ratio));
  const sw = Math.min(bmp.width - sx, Math.round((rect.w + Math.min(0, rect.x)) * ratio));
  const sh = Math.min(bmp.height - sy, Math.round((rect.h + Math.min(0, rect.y)) * ratio));
  if (sw <= 0 || sh <= 0) return null;
  const c = new OffscreenCanvas(sw, sh);
  c.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
  return blobToDataUrl(await c.convertToBlob({ type: 'image/png' }));
}

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(s)}`;
}

async function fontFacesFromSheet(url, fams) {
  try {
    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) return [];
    const text = await res.text();
    const out = [];
    const re = /@font-face\s*{[^}]*}/gi;
    let m;
    while ((m = re.exec(text))) {
      const block = m[0];
      const fm = /font-family\s*:\s*([^;]+);?/i.exec(block);
      if (!fm) continue;
      const fam = fm[1].trim().replace(/^['"]|['"]$/g, '').toLowerCase();
      if (!fams.has(fam)) continue;
      out.push(block.replace(/url\((['"]?)(.*?)\1\)/g, (all, q, u) => (u.startsWith('data:') ? all : `url("${new URL(u, url).href}")`)));
    }
    return out;
  } catch (_) {
    return [];
  }
}

function fetchWithTimeout(url, ms, init) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, Object.assign({ signal: ac.signal }, init || {})).finally(() => clearTimeout(t));
}

// [D7] 이미지 가져오기: 1차 그냥 요청 → 실패하면 Referer 를 원래 페이지로 설정(declarativeNetRequest)해서 재시도
// 주의(v2에서 개선): credentials 'omit' 이라 로그인해야 보이는 이미지는 실패할 수 있음, 규칙 id 는 SW 재시작 시 충돌 가능
let ruleSeq = 1000;
async function localize(urls, referer) {
  const results = {};
  const queue = urls.slice(0, 200);
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      results[url] = await fetchImage(url, referer);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return results;
}

async function fetchImage(url, referer) {
  const t0 = Date.now();
  const tryOnce = async (cache) => {
    const res = await fetchWithTimeout(url, 10000, { credentials: 'omit', cache: cache || 'default' });
    if (!res.ok) return { status: res.status };
    const blob = await res.blob();
    if (blob.size > 4 * 1024 * 1024) return { status: res.status, tooBig: blob.size };
    return { status: res.status, dataUrl: await blobToDataUrl(blob), bytes: blob.size };
  };
  let first;
  try {
    first = await tryOnce();
  } catch (e) {
    first = { error: String(e && e.message ? e.message : e) };
  }
  if (first.dataUrl || !referer) return Object.assign(first, { ms: Date.now() - t0, via: 'direct' });
  // Referer 재시도
  const id = ruleSeq++;
  let host;
  try {
    host = new URL(url).hostname;
  } catch (_) {
    return first;
  }
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [
        {
          id,
          priority: 1,
          action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'set', value: referer }] },
          condition: { requestDomains: [host], tabIds: [chrome.tabs.TAB_ID_NONE], resourceTypes: ['xmlhttprequest', 'image', 'other'] },
        },
      ],
    });
    let second;
    try {
      second = await tryOnce('reload');
    } catch (e) {
      second = { error: String(e && e.message ? e.message : e) };
    }
    return Object.assign(second, { ms: Date.now() - t0, via: 'referer', firstStatus: first.status, firstError: first.error });
  } finally {
    chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }).catch(() => {});
  }
}

// 검증 하네스로 결과 보내기 (배포본에서는 REPORT_URL 을 비움)
const REPORT_URL = 'http://127.0.0.1:8765/report';
function report(obj) {
  if (!REPORT_URL) return;
  fetch(REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ from: 'bg', at: Date.now() }, obj)) }).catch(() => {});
}
