// 정식 Google Chrome(137+)은 --load-extension 을 무시한다. 대신 CDP Extensions.loadUnpacked 로 올린다
// (--remote-debugging-pipe + --enable-unsafe-extension-debugging 필요 → puppeteer-core 가 처리).
// 사용: node e2e/launch-real-chrome.mjs <익스텐션 폴더> <CDP 포트> <프로필 폴더> [x,y]
// 띄운 뒤 이 프로세스는 계속 살아 있고(브라우저 수명), 파이썬 하네스는 CDP 포트로 붙는다 (boot.py WC_REAL_CHROME=1).
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const [ext, port = '9222', profile, pos = '-1700,1600'] = process.argv.slice(2);
const exe = process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!existsSync(exe)) throw new Error('Chrome 없음: ' + exe);

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: false,
  pipe: true,
  enableExtensions: [ext],
  defaultViewport: null,
  userDataDir: profile,
  ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
  args: [
    `--remote-debugging-port=${port}`, '--remote-allow-origins=*', '--no-first-run', '--no-default-browser-check',
    `--window-position=${pos}`, '--window-size=1600,1000', '--lang=ko-KR', '--force-device-scale-factor=1',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-lcd-text',
    '--disable-features=Translate,CalculateNativeWinOcclusion', '--disable-sync', '--password-store=basic',
  ],
});
console.log(JSON.stringify({ ok: true, version: await browser.version(), pid: browser.process()?.pid }));
browser.on('disconnected', () => process.exit(0));
