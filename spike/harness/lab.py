"""검증 하네스 라이브러리: CDP로 페이지/패널 좌표를 읽고, xdotool로 진짜 OS 마우스 입력을 보낸다."""
import json, os, subprocess, time, itertools, urllib.request
import websocket

OUT = os.environ.get('WC_OUT') or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'out')
os.makedirs(OUT, exist_ok=True)
ENV = dict(os.environ, DISPLAY=':99')


def targets():
    with urllib.request.urlopen('http://127.0.0.1:9222/json/list') as r:
        return json.load(r)


class CDP:
    _ids = itertools.count(1)

    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=30, suppress_origin=True)

    def call(self, method, **params):
        i = next(self._ids)
        self.ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == i:
                if 'error' in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get('result', {})

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
    t = find_target(lambda t: t['type'] == 'page' and url_part in t['url'] and not t['url'].startswith('chrome-extension://'), timeout)
    return CDP(t['webSocketDebuggerUrl']), t


def panel(timeout=10):
    t = find_target(lambda t: t['url'].startswith('chrome-extension://') and 'sidepanel.html' in t['url'], timeout)
    return CDP(t['webSocketDebuggerUrl']), t


def xdo(*args):
    return subprocess.run(['xdotool', *map(str, args)], env=ENV, capture_output=True, text=True).stdout.strip()


def shot(name):
    path = os.path.join(OUT, name)
    subprocess.run(['import', '-display', ':99', '-window', 'root', path], env=ENV, check=True)
    return path


# ------------------------------------------------------------ 좌표 보정
_CAL_JS = """
(() => { if (!window.__lm) { window.__lm = {x:-1,y:-1,n:0};
  addEventListener('mousemove', e => { window.__lm = {x:e.clientX, y:e.clientY, n: window.__lm.n+1}; }, true); }
  return true; })()
"""


def calibrate(cdp, probe):
    """화면 좌표 → 문서 client 좌표 오프셋을 실제 마우스를 움직여서 측정"""
    cdp.eval(_CAL_JS)
    xdo('mousemove', probe[0] - 30, probe[1] - 30)
    time.sleep(0.15)
    xdo('mousemove', probe[0], probe[1])
    time.sleep(0.25)
    lm = cdp.eval('window.__lm')
    if lm['x'] < 0:
        raise RuntimeError('calibration failed: no mousemove seen at %r' % (probe,))
    return probe[0] - lm['x'], probe[1] - lm['y']


def rect(cdp, selector, scroll=True, mark=False):
    js = f"""(() => {{ const el = document.querySelector({json.dumps(selector)}); if (!el) return null;
      {'el.scrollIntoView({block: el.getBoundingClientRect().height > innerHeight * 0.8 ? "start" : "center", inline:"nearest"});' if scroll else ''}
      {'document.querySelectorAll("[data-wc-target]").forEach(e => e.removeAttribute("data-wc-target")); el.setAttribute("data-wc-target", "");' if mark else ''}
      const r = el.getBoundingClientRect(); return {{x:r.left, y:r.top, w:r.width, h:r.height}}; }})()"""
    r = cdp.eval(js)
    if scroll:
        time.sleep(0.4)
        r = cdp.eval(f"""(() => {{ const r = document.querySelector({json.dumps(selector)}).getBoundingClientRect(); return {{x:r.left, y:r.top, w:r.width, h:r.height}}; }})()""")
    return r


def drag(src, dst, steps=28, hold=0.35, settle=0.5, pre=None):
    """진짜 X11 마우스 드래그: 이동 → 누름 → 여러 단계로 이동 → 놓기"""
    sx, sy = map(int, src)
    dx, dy = map(int, dst)
    xdo('mousemove', sx - 40, sy - 40)
    time.sleep(0.1)
    xdo('mousemove', 940, 95)   # 페이지 밖(패널 경계)으로 한 번 나갔다가
    time.sleep(0.15)
    xdo('mousemove', sx, sy)    # 다시 들어와서 hover 가 새로 계산되게
    time.sleep(settle)  # hover → 하이라이트/무장
    if pre:
        pre()
    xdo('mousedown', 1)
    time.sleep(0.12)
    for i in range(1, steps + 1):
        t = i / steps
        e = t * t * (3 - 2 * t)
        xdo('mousemove', int(sx + (dx - sx) * e), int(sy + (dy - sy) * e))
        time.sleep(0.025)
    time.sleep(hold)
    xdo('mouseup', 1)


def reports(since=0):
    p = os.path.join(OUT, 'reports.jsonl')
    if not os.path.exists(p):
        return []
    out = []
    with open(p) as f:
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


def reset_window():
    """창이 끌려가 버렸을 때 원위치 (브라우저 수준 CDP)"""
    with urllib.request.urlopen('http://127.0.0.1:9222/json/version') as r:
        ws = json.load(r)['webSocketDebuggerUrl']
    b = CDP(ws)
    for t in targets():
        if t['type'] == 'page' and not t['url'].startswith('chrome-extension://'):
            w = b.call('Browser.getWindowForTarget', targetId=t['id'])
            b.call('Browser.setWindowBounds', windowId=w['windowId'], bounds={'windowState': 'normal'})
            b.call('Browser.setWindowBounds', windowId=w['windowId'], bounds={'left': 0, 'top': 0, 'width': 1600, 'height': 1000})
            break
    b.close()
