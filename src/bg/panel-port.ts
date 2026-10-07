// 스크랩 모드: 창 단위 (PLAN §6.6, R3)
// 패널이 port 'panel' 로 연결하며 자기 windowId 와 스위치 상태를 알린다. background 는 "패널이 열린 창" 목록을 가지고,
// content script 의 질의(scrap:query)에는 sender.tab.windowId 기준으로 답하고, 변경은 그 창의 탭들(모든 프레임)에 알린다.
import { PANEL_PORT, type BgToContent, type PanelPortMsg } from '../shared/protocol';

interface WinState {
  ports: Set<chrome.runtime.Port>;
  enabled: boolean;
}
const windows = new Map<number, WinState>();

export function scrapEnabledFor(windowId: number | undefined): boolean {
  if (windowId === undefined) return false;
  const w = windows.get(windowId);
  return !!w && w.ports.size > 0 && w.enabled;
}

export async function broadcast(windowId: number) {
  const msg: BgToContent = { type: 'scrap:state', enabled: scrapEnabledFor(windowId) };
  const tabs = await chrome.tabs.query({ windowId }).catch(() => [] as chrome.tabs.Tab[]);
  for (const t of tabs) if (t.id !== undefined) chrome.tabs.sendMessage(t.id, msg).catch(() => {});
}

export function setScrap(windowId: number, enabled: boolean) {
  const w = windows.get(windowId);
  if (!w) return;
  const before = scrapEnabledFor(windowId);
  w.enabled = enabled;
  if (before !== scrapEnabledFor(windowId)) broadcast(windowId);
}

export function initPanelPorts() {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PANEL_PORT) return;
    let windowId: number | null = null;
    port.onMessage.addListener((m: PanelPortMsg) => {
      if (m.type !== 'hello' || typeof m.windowId !== 'number') return; // ping 은 service worker 를 깨워 두는 용도
      windowId = m.windowId;
      const w = windows.get(windowId) || { ports: new Set(), enabled: true };
      const before = scrapEnabledFor(windowId);
      w.ports.add(port);
      w.enabled = m.enabled;
      windows.set(windowId, w);
      if (before !== scrapEnabledFor(windowId)) broadcast(windowId);
    });
    port.onDisconnect.addListener(() => {
      if (windowId === null) return;
      const w = windows.get(windowId);
      if (!w) return;
      w.ports.delete(port);
      if (!w.ports.size) {
        windows.delete(windowId);
        broadcast(windowId);
      }
    });
  });
  // 탭이 다른 창으로 옮겨지면 그 창 기준으로 다시 알려준다
  chrome.tabs.onAttached.addListener((tabId, info) => {
    const msg: BgToContent = { type: 'scrap:state', enabled: scrapEnabledFor(info.newWindowId) };
    chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  });
}
