"""E2E 하네스 라이브러리 (Windows): CDP 로 페이지/패널 좌표를 읽고, SendInput 으로 진짜 OS 마우스 입력을 보낸다.
spike/harness/lab.py 를 Windows 용으로 옮긴 것 (xdotool → winput, import → PIL.ImageGrab)."""
import itertools
import json
import os
import time
import urllib.request

import websocket

import winput

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('WC_OUT') or os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
CDP_PORT = int(os.environ.get('WC_CDP_PORT', '9222'))
SERVER = 'http://127.0.0.1:8765'
REPORTS = os.path.join(OUT, 'reports.jsonl')


def targets():
    with urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json/list') as r:
        return json.load(r)


class CDP:
    _ids = itertools.count(1)

    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=60, suppress_origin=True)
        self.events = []  # 응답이 아닌 CDP 이벤트 (예: Input.dragIntercepted)

    def call(self, method, **params):
        i = next(self._ids)
        self.ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == i:
                if 'error' in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get('result', {})
            if 'method' in msg:
                self.events.append(msg)

    def wait_event(self, method, timeout):
        t0 = time.time()
        while True:
            for k, e in enumerate(self.events):
                if e.get('method') == method:
                    self.events.pop(k)
                    return e.get('params', {})
            left = timeout - (time.time() - t0)
            if left <= 0:
                return None
            self.ws.settimeout(left)
            try:
                msg = json.loads(self.ws.recv())
                if 'method' in msg:
                    self.events.append(msg)
            except websocket.WebSocketTimeoutException:
                return None
            finally:
                self.ws.settimeout(60)

    def eval(self, expr, await_promise=True):
        r = self.call('Runtime.evaluate', expression=expr, returnByValue=True, awaitPromise=await_promise, userGesture=False)
        if 'exceptionDetails' in r:
            raise RuntimeError(json.dumps(r['exceptionDetails'], ensure_ascii=False)[:800])
        return r.get('result', {}).get('value')

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def find_target(pred, timeout=10):
    t0 = time.time()
    while time.time() - t0 < timeout:
        for t in targets():
            if pred(t):
                return t
        time.sleep(0.25)
    raise RuntimeError('target not found')


def page(url_part='', timeout=10):
    t = find_target(lambda t: t['type'] == 'page' and url_part in t['url'] and not t['url'].startswith('chrome-extension://')
                    and not t['url'].startswith('devtools://'), timeout)
    return CDP(t['webSocketDebuggerUrl']), t


def panel_open():
    return any(t['url'].startswith('chrome-extension://') and 'sidepanel.html' in t['url'] for t in targets())


def panel(timeout=10):
    t = find_target(lambda t: t['url'].startswith('chrome-extension://') and 'sidepanel.html' in t['url'], timeout)
    return CDP(t['webSocketDebuggerUrl']), t


def worker(timeout=10):
    t = find_target(lambda t: t['type'] == 'service_worker' and t['url'].startswith('chrome-extension://'), timeout)
    return CDP(t['webSocketDebuggerUrl']), t


def shot(name):
    """테스트 크롬 창의 내용만 캡처 (PrintWindow: 겹친 다른 앱 화면은 찍히지 않음)"""
    path = os.path.join(OUT, name)
    try:
        winput.capture_window(window_info()['hwnd']).save(path)
    except Exception as e:  # 캡처는 보조 자료
        print('   (shot failed:', e, ')')
    return path


_win = None


def window_info():
    """테스트 크롬 창 (hwnd 는 boot 가 저장, 위치는 매번 실제 값 — 사용자가 창을 옮겨도 맞게)"""
    global _win
    if not _win:
        with open(os.path.join(OUT, 'window.json')) as f:
            _win = json.load(f)
    _win['bbox'] = list(winput.window_rect(_win['hwnd']))
    return _win


def win_point(dx, dy):
    """창 왼쪽 위 기준 상대 좌표 → 화면 좌표 (음수면 오른쪽/아래 기준)"""
    l, t, r, b = window_info()['bbox']
    return (l + dx if dx >= 0 else r + dx), (t + dy if dy >= 0 else b + dy)


def ensure_front():
    """드래그 전에 테스트 창이 맨 앞인지 확인 (진짜 OS 입력은 화면에서 맨 위 창으로 간다)"""
    w = window_info()
    l, t, r, b = w['bbox']
    pts = [(l + 300, t + 300), (r - 200, t + 500), (l + 700, b - 60), (r - 100, b - 100)]
    for _ in range(3):
        if all(winput.owns_point(w['hwnd'], x, y) for x, y in pts):
            return True
        winput.foreground(w['hwnd'])
        time.sleep(0.4)
    raise RuntimeError('테스트 크롬 창이 다른 창에 가려져 있습니다')


# ------------------------------------------------------------ 좌표 보정
_CAL_JS = """
(() => { if (!window.__lm) { window.__lm = {x:-1,y:-1,n:0};
  addEventListener('mousemove', e => { window.__lm = {x:e.clientX, y:e.clientY, n: window.__lm.n+1}; }, true); }
  return true; })()
"""


def calibrate(cdp, probe):
    """화면 좌표 → 문서 client 좌표 오프셋을 실제 마우스를 움직여서 측정"""
    lm = None
    for _ in range(3):  # 페이지가 막 다시 그려진 경우(문서 교체) 리스너를 다시 건다
        cdp.eval(_CAL_JS)
        winput.move(probe[0] - 30, probe[1] - 30)
        time.sleep(0.15)
        winput.move(probe[0], probe[1])
        time.sleep(0.3)
        lm = cdp.eval('window.__lm')
        if lm and lm['x'] >= 0:
            break
        time.sleep(0.5)
    if not lm or lm['x'] < 0:
        raise RuntimeError('calibration failed: no mousemove seen at %r' % (probe,))
    return probe[0] - lm['x'], probe[1] - lm['y']


def rect(cdp, selector, scroll=True, mark=False):
    js = f"""(() => {{ const el = document.querySelector({json.dumps(selector)}); if (!el) return null;
      {'el.scrollIntoView({block: el.getBoundingClientRect().height > innerHeight * 0.8 ? "start" : "center", inline:"nearest"});' if scroll else ''}
      {'document.querySelectorAll("[data-wc-target]").forEach(e => e.removeAttribute("data-wc-target")); el.setAttribute("data-wc-target", "");' if mark else ''}
      const r = el.getBoundingClientRect(); return {{x:r.left, y:r.top, w:r.width, h:r.height}}; }})()"""
    r = cdp.eval(js)
    if scroll and r is not None:
        time.sleep(0.4)
        r = cdp.eval(f"""(() => {{ const r = document.querySelector({json.dumps(selector)}).getBoundingClientRect(); return {{x:r.left, y:r.top, w:r.width, h:r.height}}; }})()""")
    return r


def ease_path(src, dst, steps):
    sx, sy = src
    dx, dy = dst
    for i in range(1, steps + 1):
        t = i / steps
        e = t * t * (3 - 2 * t)
        yield int(sx + (dx - sx) * e), int(sy + (dy - sy) * e)


def drag(src, dst, steps=28, hold=0.35, settle=0.5, pre=None, away=None):
    """진짜 OS 마우스 드래그: 이동 → 누름 → 여러 단계로 이동 → 놓기"""
    ensure_front()
    sx, sy = map(int, src)
    dx, dy = map(int, dst)
    winput.move(sx - 40, sy - 40)
    time.sleep(0.1)
    winput.move(*(away or win_point(800, 62)))  # 페이지 밖(주소창 쪽)으로 한 번 나갔다가
    time.sleep(0.15)
    winput.move(sx, sy)  # 다시 들어와서 hover 가 새로 계산되게
    time.sleep(settle)  # hover → 하이라이트/무장
    if pre:
        pre()
    winput.down()
    time.sleep(0.12)
    for x, y in ease_path((sx, sy), (dx, dy), steps):
        winput.move(x, y)
        time.sleep(0.025)
    time.sleep(hold)
    winput.up()


def reports(since=0):
    if not os.path.exists(REPORTS):
        return []
    out = []
    with open(REPORTS, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except Exception:
                    pass
    return [r for r in out if r.get('at', 0) >= since]


def wait_report(since, pred=lambda r: r.get('from') == 'panel' and r.get('kind') == 'drop', timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        rs = [r for r in reports(since) if pred(r)]
        if rs:
            return rs[-1]
        time.sleep(0.3)
    return None


def now_ms():
    return int(time.time() * 1000)
