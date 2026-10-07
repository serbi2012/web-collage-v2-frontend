/** 빌드 시점 상수: E2E 빌드에서만 true (wxt.config.ts 의 vite define). 배포 빌드에서는 false 라서 훅 코드가 제거된다. */
declare const __E2E__: boolean;

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export const gfm: TurndownService.Plugin;
}
