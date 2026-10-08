// Web Collage — background (service worker)
// 역할: 번호표 보관소 · 화면 캡처 · 에셋(이미지·폰트) 수집 · Referer 규칙 · 창별 패널 연결(스크랩 모드)
import { isContentMsg, isPanelReq } from '../src/shared/protocol';
import { E2E_REPORT_URL } from '../src/shared/constants';
import { currentClip, endInfo, getClip, onBegin, onEnd, onPut } from '../src/bg/clip-store';
import { localize } from '../src/bg/assets';
import { initPanelPorts, scrapEnabledFor, setScrap } from '../src/bg/panel-port';

export default defineBackground(() => {
  const init = () => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => console.warn('setPanelBehavior', e));
  init();
  chrome.runtime.onStartup.addListener(init);
  chrome.runtime.onInstalled.addListener(() => {
    init();
    injectIntoOpenTabs();
  });
  initPanelPorts();

  chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
    // 우리 content script 메시지 (탭에서 온 것)
    if (sender.tab && isContentMsg(msg)) {
      switch (msg.type) {
        case 'clip:begin':
          onBegin(msg, sender);
          return false;
        case 'clip:put':
          onPut(msg);
          return false;
        case 'clip:end':
          onEnd(msg);
          return false;
        case 'scrap:query':
          sendResponse({ enabled: scrapEnabledFor(sender.tab.windowId) });
          return false;
        case 'panel:open':
          if (__E2E__) {
            // [E2E 전용 훅] 사용자 제스처가 content script → background 로 전달되는지 (E15)
            chrome.sidePanel
              .open({ windowId: sender.tab.windowId })
              .then(() => report({ kind: 'open-panel', ok: true }))
              .catch((e: unknown) => report({ kind: 'open-panel', ok: false, error: String(e instanceof Error ? e.message : e) }));
          }
          return false;
      }
    }
    // 패널 요청 (익스텐션 페이지에서 온 것)
    if (!sender.tab && sender.id === chrome.runtime.id && isPanelReq(msg)) {
      switch (msg.type) {
        case 'clip:get':
          getClip(msg.id, msg.timeoutMs || 15000).then(sendResponse);
          return true;
        case 'clip:current':
          currentClip().then(sendResponse);
          return true;
        case 'clip:end-info':
          endInfo(msg.id).then(sendResponse);
          return true;
        case 'assets:localize':
          localize(msg.urls, msg.referer, msg.kind).then(sendResponse);
          return true;
        case 'scrap:set':
          setScrap(msg.windowId, msg.enabled);
          sendResponse({ ok: true });
          return false;
      }
    }
    return false;
  });
});

/** R4: 설치·업데이트 직후 이미 열려 있던 탭에는 content script 가 없다 → 주입 (scripting 권한) */
async function injectIntoOpenTabs() {
  const files = (chrome.runtime.getManifest().content_scripts || []).flatMap((c) => c.js || []);
  if (!files.length) return;
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file:///*'] }).catch(() => [] as chrome.tabs.Tab[]);
  for (const t of tabs) {
    if (t.id === undefined || t.discarded) continue;
    chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files }).catch(() => {});
  }
}

function report(obj: Record<string, unknown>) {
  if (!__E2E__ || !E2E_REPORT_URL) return;
  fetch(E2E_REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: 'bg', at: Date.now(), ...obj }) }).catch(() => {});
}
