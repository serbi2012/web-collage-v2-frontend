"""테스트 서버 + Chrome for Testing(익스텐션 로드)을 띄우고, 사이드 패널을 열어 폭을 넓힌다.
사용: python e2e/boot.py [처음 열 URL]
환경변수:
  EXT          로드할 익스텐션 폴더 (기본: .output-e2e/chrome-mv3 — `pnpm build:e2e` 결과)
  CHROME_BIN   크롬 실행 파일 (기본: ../.browsers 아래 Chrome for Testing 자동 탐색. 정식 Chrome 137+ 는 --load-extension 을 무시함)
  KEEP_PROFILE 1 이면 프로필을 지우지 않음 (S4: 같은 프로필로 재시작 검증)
"""
import glob
import json
import os
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab  # noqa: E402
import inputs  # noqa: E402
import winput  # noqa: E402

HERE = lab.HERE
ROOT = os.path.dirname(HERE)
EXT = os.path.abspath(os.environ.get('EXT') or os.path.join(ROOT, '.output-e2e', 'chrome-mv3'))
# WC_WIN="x,y" 로 창 위치 지정 (예: 보조 모니터). 크기는 spike 와 같은 1600×1000
# CDP 모드는 실제 화면이 필요 없으므로 기본으로 화면 밖에 띄운다 (가림 감지로 렌더링이 멈추지 않게 플래그도 켬)
_wx, _wy = (int(v) for v in os.environ.get('WC_WIN', '0,0' if inputs.MODE == 'os' else '-1700,1600').split(','))
WIN = dict(x=_wx, y=_wy, w=1600, h=1000)
PANEL_W = 620


def find_chrome():
    if os.environ.get('CHROME_BIN'):
        return os.environ['CHROME_BIN']
    cands = sorted(glob.glob(os.path.join(ROOT, '..', '.browsers', 'chrome', '*', 'chrome-win64', 'chrome.exe')))
    cands += sorted(glob.glob(os.path.join(ROOT, '.browsers', 'chrome', '*', 'chrome-win64', 'chrome.exe')))
    if not cands:
        sys.exit('Chrome for Testing 을 찾지 못했습니다: npx @puppeteer/browsers install chrome@stable --path ../.browsers  또는 CHROME_BIN 지정')
    return os.path.abspath(cands[-1])


def ps(cmd):
    return subprocess.run(['powershell', '-NoProfile', '-Command', cmd], capture_output=True, text=True).stdout


def kill_previous():
    # 이 하네스가 띄운 크롬만 (디버깅 포트로 식별) + 테스트 서버
    ps(f"Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object {{ $_.CommandLine -like '*--remote-debugging-port={lab.CDP_PORT}*' }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}")
    ps("Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*launch-real-chrome*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }")
    ps("Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -like '*e2e*server.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }")
    time.sleep(1.0)


def start_server():
    log = open(os.path.join(lab.OUT, 'server.out'), 'w')
    subprocess.Popen([sys.executable, os.path.join(HERE, 'server.py'), os.path.join(ROOT, 'testsite'), lab.OUT], stdout=log, stderr=log,
                     creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS)
    for _ in range(40):
        try:
            urllib.request.urlopen(lab.SERVER + '/index.html', timeout=1)
            return
        except Exception:
            time.sleep(0.25)
    sys.exit('테스트 서버가 뜨지 않았습니다')


def start_real_chrome(url):
    """WC_REAL_CHROME=1: 소유자 PC 의 정식 Google Chrome (별도 임시 프로필). 정식 Chrome 137+ 는 --load-extension 을 무시하므로
    e2e/launch-real-chrome.mjs 가 CDP Extensions.loadUnpacked(파이프 연결)로 올린다."""
    profile = os.path.join(lab.OUT, 'realchrome-profile')
    if os.environ.get('KEEP_PROFILE') != '1' and os.path.isdir(profile):
        import shutil
        shutil.rmtree(profile, ignore_errors=True)
    log = open(os.path.join(lab.OUT, 'realchrome.log'), 'w')
    proc = subprocess.Popen(['node', os.path.join(HERE, 'launch-real-chrome.mjs'), EXT, str(lab.CDP_PORT), profile, f"{WIN['x']},{WIN['y']}"],
                            stdout=log, stderr=log, cwd=ROOT)
    for _ in range(120):
        try:
            with open(os.path.join(lab.OUT, 'realchrome.log')) as f:
                txt = f.read()
            if '"ok":true' in txt:
                pid = json.loads(txt.strip().splitlines()[-1])['pid']
                break
        except Exception:
            pass
        time.sleep(0.25)
    else:
        sys.exit('정식 Chrome 실행 실패: ' + open(os.path.join(lab.OUT, 'realchrome.log')).read()[-500:])
    pg, _ = lab.page('')
    pg.call('Page.navigate', url=url)
    time.sleep(1.5)

    class P:  # main_hwnd 가 pid 만 쓴다
        pass
    p = P()
    p.pid = pid
    return p


def start_chrome(url):
    if os.environ.get('WC_REAL_CHROME') == '1':
        return start_real_chrome(url)
    profile = os.path.join(lab.OUT, 'profile')
    if os.environ.get('KEEP_PROFILE') != '1' and os.path.isdir(profile):
        import shutil
        shutil.rmtree(profile, ignore_errors=True)
    args = [find_chrome(), f'--user-data-dir={profile}', '--no-first-run', '--no-default-browser-check',
            f'--disable-extensions-except={EXT}', f'--load-extension={EXT}',
            f"--window-position={WIN['x']},{WIN['y']}", f"--window-size={WIN['w']},{WIN['h']}",
            f'--remote-debugging-port={lab.CDP_PORT}', '--remote-allow-origins=*', '--lang=ko-KR', '--force-device-scale-factor=1',
            '--disable-features=Translate,OptimizationHints,MediaRouter,GlobalMediaControls,CalculateNativeWinOcclusion', '--disable-search-engine-choice-screen',
            '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
            '--disable-lcd-text',  # 충실도 비교: 원본(흑백 안티에일리어싱)과 조각(LCD)이 달라지지 않게
            '--disable-sync', '--password-store=basic', url]
    log = open(os.path.join(lab.OUT, 'chrome.log'), 'w')
    proc = subprocess.Popen(args, stdout=log, stderr=log)
    for _ in range(80):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{lab.CDP_PORT}/json/version', timeout=1)
            break
        except Exception:
            time.sleep(0.25)
    return proc


def main_hwnd(pid, timeout=10):
    t0 = time.time()
    while time.time() - t0 < timeout:
        # 브라우저 프로세스의 보이는 최상위 창 중 가장 큰 것
        hs = winput.windows_of_pid(pid)
        if not hs:
            # 정식 Chrome 을 puppeteer 로 띄우면 창이 숨김 상태로 시작할 수 있다 → 활성화하지 않고 보이게
            hs = winput.windows_of_pid(pid, include_hidden=True)
            for h in hs:
                winput.user32.ShowWindow(h, 4)  # SW_SHOWNOACTIVATE
        if hs:
            return max(hs, key=lambda h: (lambda r: (r[2] - r[0]) * (r[3] - r[1]))(winput.window_rect(h)))
        time.sleep(0.25)
    raise RuntimeError('크롬 창을 찾지 못했습니다')


def open_panel(pg):
    """[E2E 전용 훅] 페이지 안 버튼 클릭(진짜 클릭 = 사용자 제스처) → content script → background sidePanel.open (E15).
    Alt+Shift+K 는 Windows 입력 언어 전환 단축키와 겹칠 수 있어서(R11) 하네스는 쓰지 않는다."""
    for _ in range(40):
        if pg.eval('document.readyState') == 'complete':
            break
        time.sleep(0.25)
    time.sleep(0.5)
    js = """(() => { let b = document.getElementById('wc-open-btn'); if (!b) { b = document.createElement('button'); b.id = 'wc-open-btn';
      b.textContent = '콜라주 열기'; b.style.cssText = 'position:fixed;left:20px;bottom:20px;z-index:2147483647;padding:10px 16px;font-size:16px';
      b.onclick = () => window.postMessage({__wc: 'open-panel'}, '*'); document.documentElement.appendChild(b); }
      const r = b.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; })()"""
    # 설치 직후엔 background 가 열린 탭에 content script 를 다시 주입하므로(R4) 잠깐 사이 메시지가 빠질 수 있다 → 몇 번 재시도
    for attempt in range(4):
        r = pg.eval(js)
        time.sleep(0.2)
        if inputs.MODE == 'os':
            off = lab.calibrate(pg, lab.win_point(600, 600))
            winput.click(off[0] + r['x'], off[1] + r['y'])
        else:  # CDP 입력도 사용자 제스처로 인정된다
            for kind in ('mouseMoved', 'mousePressed', 'mouseReleased'):
                pg.call('Input.dispatchMouseEvent', type=kind, x=r['x'], y=r['y'], button='left', buttons=1 if kind == 'mousePressed' else 0, clickCount=1)
        for _ in range(10):
            if lab.panel_open():
                break
            time.sleep(0.2)
        if lab.panel_open():
            break
        time.sleep(1.0)
    pg.eval("document.getElementById('wc-open-btn')?.remove(); true")
    return lab.panel_open()


def widen_panel(win_rect):
    pn, _ = lab.panel()
    w0 = pn.eval('innerWidth')
    offS = lab.calibrate(pn, (win_rect[2] - 60, win_rect[1] + 500))
    edge = offS[0] - 3  # 페이지와 패널 사이 크기 조절 손잡이
    y = win_rect[1] + 500
    if w0 < PANEL_W - 10:
        winput.move(edge, y)
        time.sleep(0.3)
        winput.down()
        time.sleep(0.15)
        for x, yy in lab.ease_path((edge, y), (edge - (PANEL_W - w0), y), 20):
            winput.move(x, yy)
            time.sleep(0.02)
        time.sleep(0.2)
        winput.up()
        time.sleep(0.8)
    return w0, pn.eval('innerWidth')


def boot(url=None):
    url = url or lab.SERVER + '/index.html'
    if not os.path.isfile(os.path.join(EXT, 'manifest.json')):
        sys.exit(f'익스텐션 빌드가 없습니다: {EXT}  (pnpm build:e2e)')
    kill_previous()
    start_server()
    proc = start_chrome(url)
    time.sleep(2.5)
    hwnd = main_hwnd(proc.pid)
    wr = winput.window_rect(hwnd)
    with open(os.path.join(lab.OUT, 'window.json'), 'w') as f:
        json.dump({'hwnd': hwnd, 'pid': proc.pid, 'bbox': list(wr)}, f)
    lab._win = None
    pg, _ = lab.page('')
    if inputs.MODE == 'os':
        lab.ensure_front()
        # 창 활성화(포그라운드 잠금 대비): 페이지 빈 곳 한 번 클릭
        winput.click(*lab.win_point(700, -60))
        time.sleep(0.4)
    open_panel(pg)
    if not lab.panel_open():
        sys.exit('사이드 패널이 열리지 않았습니다')
    time.sleep(1.0)
    if inputs.MODE == 'os':
        w0, w1 = widen_panel(wr)
    else:
        pn, _ = lab.panel()
        w0 = w1 = pn.eval('innerWidth')
    print(json.dumps({'mode': inputs.MODE, 'chrome': 'Google Chrome (정식)' if os.environ.get('WC_REAL_CHROME') == '1' else find_chrome(), 'ext': EXT, 'window': winput.window_rect(hwnd), 'panelWidth': [w0, w1]}, ensure_ascii=False))
    return proc


if __name__ == '__main__':
    boot(sys.argv[1] if len(sys.argv) > 1 else None)
