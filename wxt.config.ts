import { defineConfig } from 'wxt';

// E2E 빌드(WXT_E2E=1)에서만 테스트 훅을 켠다 (D16, TEST_CASES §3).
// __E2E__ 는 빌드 시점 상수라서 배포 빌드에서는 훅 코드가 통째로 제거된다.
// 배포 빌드는 scripts/check-no-testhooks.mjs 가 훅 문자열이 없는지 grep 으로 확인한다.
const E2E = process.env.WXT_E2E === '1';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: E2E ? '.output-e2e' : '.output',
  hooks: {
    // 충실도 측정 페이지(entrypoints/fidelity)는 E2E 빌드에만 넣는다
    'entrypoints:resolved': (_wxt, entrypoints) => {
      if (E2E) return;
      const i = entrypoints.findIndex((e) => e.name === 'fidelity');
      if (i >= 0) entrypoints.splice(i, 1);
    },
  },
  vite: () => ({
    define: { __E2E__: JSON.stringify(E2E) },
  }),
  manifest: {
    // 다국어(M4): public/_locales/{ko,en}/messages.json
    name: '__MSG_extName__',
    description: '__MSG_extDesc__',
    default_locale: 'ko',
    minimum_chrome_version: '116',
    // sidePanel 은 WXT 가 sidepanel 엔트리포인트를 보고 자동으로 추가한다.
    // scripting: 설치·업데이트 직후 이미 열려 있던 탭에 content script 주입(R4, PLAN M2)
    permissions: ['sidePanel', 'storage', 'declarativeNetRequestWithHostAccess', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: { default_title: '__MSG_actionTitle__' },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+K' },
        description: '__MSG_cmdOpen__',
      },
    },
  },
});
