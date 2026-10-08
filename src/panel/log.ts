// 검증 로그: 드롭마다 결과를 남긴다. 소유자의 Windows 확인용("드롭 OK" vs "외부 드롭")이자 E2E 하네스 보고(E2E 빌드만)
import { create } from 'zustand';
import { E2E_REPORT_URL } from '../shared/constants';

export interface DropReport {
  kind: 'drop' | 'move';
  at?: number;
  [k: string]: unknown;
}

export const useLog = create<{ items: DropReport[]; push: (r: DropReport) => void }>((set) => ({
  items: [],
  push: (r) => set((s) => ({ items: [r, ...s.items].slice(0, 200) })),
}));

export function logResult(result: DropReport) {
  const r = { ...result, at: Date.now() };
  useLog.getState().push(r);
  if (__E2E__) {
    // [E2E 전용 훅] 하네스로 결과 보내기 + 수동 확인용 보관 (D16: 배포 빌드에선 제거됨)
    const w = window as unknown as { __wcResults?: DropReport[] };
    (w.__wcResults ||= []).push(r);
    fetch(E2E_REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: 'panel', ...r }) }).catch(() => {});
  }
}
