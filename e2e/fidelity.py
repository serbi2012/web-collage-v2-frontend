"""충실도 측정 (PLAN M1): 원본 화면 캡처(refShot) vs 패널 조각 렌더(1:1, 같은 폭) 픽셀 비교.
조각은 E2E 빌드의 fidelity.html 에서 원본 폭으로 그리고, CDP 로 그 영역만 캡처한다."""
import base64
import io
import json
import os
import time
import urllib.request

import lab

DIFF_TOL = 48  # 채널 차이가 이보다 크면 "다른 픽셀" (안티에일리어싱·서브픽셀 차이 흡수)


def _img(data):
    from PIL import Image
    b64 = data.split(',', 1)[1] if data.startswith('data:') else data
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert('RGB')


def measure(pn, clip_id, name, bg=True):
    ext_id = pn.eval('location.host')
    with urllib.request.urlopen(f'http://127.0.0.1:{lab.CDP_PORT}/json/version') as r:
        b = lab.CDP(json.load(r)['webSocketDebuggerUrl'])
    tid = b.call('Target.createTarget', url='about:blank')['targetId']
    tab = lab.CDP(lab.find_target(lambda t: t.get('id') == tid)['webSocketDebuggerUrl'])
    try:
        tab.call('Emulation.setDeviceMetricsOverride', width=1600, height=1200, deviceScaleFactor=1, mobile=False)
        tab.call('Page.navigate', url=f'chrome-extension://{ext_id}/fidelity.html?clip={clip_id}&bg={1 if bg else 0}')
        for _ in range(80):
            if tab.eval('document.body && document.body.dataset.ready'):
                break
            time.sleep(0.1)
        f = tab.eval('window.fidelity')
        if not f or not f.get('ref'):
            return {'error': 'refShot 없음'}
        rect = f['rect']
        h = max(1, min(rect['h'], 4000))
        tab.call('Emulation.setDeviceMetricsOverride', width=max(1600, int(rect['w']) + 10), height=int(h) + 10, deviceScaleFactor=1, mobile=False)
        time.sleep(0.3)
        shot = tab.call('Page.captureScreenshot', format='png', clip={'x': 0, 'y': 0, 'width': rect['w'], 'height': h, 'scale': 1})['data']
    finally:
        b.call('Target.closeTarget', targetId=tid)
    from PIL import Image, ImageChops
    ref, got = _img(f['ref']), _img(shot)
    w, hh = min(ref.width, got.width), min(ref.height, got.height)
    ref_c, got_c = ref.crop((0, 0, w, hh)), got.crop((0, 0, w, hh))

    def diff_mask(dx, dy):
        # 원본은 소수점 좌표에 그려질 수 있어 글자가 1px 어긋나는 경우가 흔하다 → ±1px 이동 중 가장 잘 맞는 것
        g = got.crop((dx, dy, dx + w, dy + hh)) if (dx, dy) != (0, 0) else got_c
        d = ImageChops.difference(ref_c, g)
        r, gg, bb = d.split()
        mx = ImageChops.lighter(ImageChops.lighter(r, gg), bb)
        m = mx.point(lambda v: 255 if v > DIFF_TOL else 0)
        return m.histogram()[255], m

    best = None
    for dy in (0, -1, 1):
        for dx in (0, -1, 1):
            if dx < 0 or dy < 0:
                # 음수 이동은 원본 쪽을 자르는 대신 조각을 오른쪽/아래로 민 것과 같다
                g = Image.new('RGB', (w + 1, hh + 1), (255, 255, 255))
                g.paste(got, (-dx if dx < 0 else 0, -dy if dy < 0 else 0))
                d = ImageChops.difference(ref_c, g.crop((0, 0, w, hh)))
                r, gg, bb = d.split()
                mx = ImageChops.lighter(ImageChops.lighter(r, gg), bb)
                m = mx.point(lambda v: 255 if v > DIFF_TOL else 0)
                cand = (m.histogram()[255], m)
            else:
                cand = diff_mask(dx, dy)
            if best is None or cand[0] < best[0]:
                best = cand
    bad, mask = best
    ratio = bad / float(w * hh)
    # 나란히: 원본 | 조각 | 차이(빨강)
    comp = Image.new('RGB', (w * 3 + 20, hh), (255, 255, 255))
    comp.paste(ref_c, (0, 0))
    comp.paste(got_c, (w + 10, 0))
    zero = Image.new('L', (w, hh), 0)
    comp.paste(Image.merge('RGB', (mask, zero, zero)), (2 * w + 20, 0))
    comp.save(os.path.join(lab.OUT, f'fid_{name}.png'))
    return {'ratio': round(ratio, 4), 'ref': list(ref.size), 'got': list(got.size)}
