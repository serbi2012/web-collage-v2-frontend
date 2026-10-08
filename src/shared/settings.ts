// 사용자 설정 (chrome.storage.local 'settings') — 패널·설정 페이지 공용 (PLAN M4)
import type { DisplayMode } from './types';

export interface Settings {
  /** 새로 놓는 블록의 표시 방식 (Q8 기본 fit) */
  defaultDisplay: DisplayMode;
  /** 공유 서버 주소 (M6). 비어 있으면 공유 메뉴가 설정으로 안내 */
  shareServer: string;
  /** 공유 링크 보관 일수 (서버 최대 90) */
  shareDays: number;
  /** 첫 실행 안내를 봤는지 */
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = { defaultDisplay: 'fit', shareServer: '', shareDays: 30, onboarded: false };
const KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...((r[KEY] as Partial<Settings>) || {}) };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const fn = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]) cb({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as Partial<Settings>) });
  };
  chrome.storage.onChanged.addListener(fn);
  return () => chrome.storage.onChanged.removeListener(fn);
}

/** 공유 서버 주소 정리: 끝의 / 제거, http(s) 만 */
export function normalizeServer(u: string): string | null {
  const s = u.trim().replace(/\/+$/, '');
  if (!s) return '';
  try {
    const url = new URL(s);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin + url.pathname.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}
