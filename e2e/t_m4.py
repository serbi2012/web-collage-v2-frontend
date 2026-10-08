"""M4 UX 케이스
M4a  라벨 경로(브레드크럼)에서 'article' 단계를 누르면 그 요소로 바뀌고, 안쪽으로 마우스를 움직여도 고정 → 끌면 article
M4b  가독성 모드(Aa) → 조각에 테마 덮어쓰기 CSS 적용
M4c  첫 실행 안내가 보이고 "알겠어요" 로 닫힘 (설정에 저장)
M4d  설정 페이지에서 기본 표시 방식을 '다시 흐르게'로 → 새로 놓은 블록에 적용
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab  # noqa: E402
import runner  # noqa: E402
from runner import Session, summarize  # noqa: E402

s = Session('')
s.goto(lab.SERVER + '/index.html')


def crumb_boxes(cdp):
    """닫힌 Shadow DOM(오버레이) 안 라벨의 경로 단계 위치 — CDP DOM 은 pierce 로 닫힌 shadow 도 본다"""
    root = cdp.call('DOM.getDocument', depth=-1, pierce=True)['root']
    out = []

    def walk(n):
        attrs = n.get('attributes') or []
        a = dict(zip(attrs[::2], attrs[1::2]))
        if 'c' in (a.get('class') or '').split() and 'data-i' in a:
            q = cdp.call('DOM.getBoxModel', nodeId=n['nodeId'])['model']['content']
            text = ''.join(ch.get('nodeValue', '') for ch in n.get('children') or [])
            out.append({'i': int(a['data-i']), 'text': text, 'x': (q[0] + q[2]) / 2, 'y': (q[1] + q[5]) / 2})
        for k in ('children', 'shadowRoots'):
            for c in n.get(k) or []:
                walk(c)

    walk(root)
    return out


# ---------------------------------------------------------------- M4a 경로로 단계 고르기
para = s.src_point('#para')
s.inp.move('page', para[0] - 30, para[1] - 20)
s.inp.move('page', *para)
time.sleep(0.4)
crumbs = crumb_boxes(s.pg)
print('   crumbs:', [c['text'] for c in crumbs])
art = next((c for c in crumbs if c['text'] == 'article'), None)
reasons = []
if not art:
    reasons.append(f'경로에 article 없음: {crumbs}')
else:
    s.inp.click('page', art['x'], art['y'])
    time.sleep(0.3)
    # 고정 확인: 카드 안 다른 곳(문단 글자 위)으로 움직여도 article 유지
    s.inp.move('page', para[0] + 30, para[1] + 5)
    time.sleep(0.3)
    armed = s.pg.eval("document.querySelector('#card-news').getAttribute('draggable')")
    if armed != 'true':
        reasons.append(f'article 이 무장되지 않음 (draggable={armed})')
    t0 = s.drag((para[0] + 30, para[1] + 5), s.dst_point(0), approach=False)
    rep = summarize('M4a_breadcrumb', lab.wait_report(t0))
    if not rep or (rep.get('meta') or {}).get('tag') != 'article':
        reasons.append(f"끌린 대상 {rep and rep.get('meta', {}).get('tag')} (기대 article)")
runner.verdict('M4a_breadcrumb_lock', reasons)

# ---------------------------------------------------------------- M4b 가독성 모드
btn = s.pn.eval("(() => { const b = [...document.querySelectorAll('.top button')].find(x => x.textContent.trim() === 'Aa'); const r = b.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; })()")
s.pn.eval('scrollTo(0,0); true')
s.inp.click('panel', btn['x'], btn['y'])
time.sleep(0.6)
css = s.pn.eval("(() => { const h = document.querySelector('.block .clip'); return h && h.shadowRoot ? h.shadowRoot.querySelector('style').textContent : ''; })()")
on = s.pn.eval('window.__wcTest.doc().readable')
runner.verdict('M4b_readable_mode', [] if on and 'var(--ink' in css else [f'readable={on}, css 적용={"var(--ink" in css}'])
lab.shot('case_M4b_readable.png')
s.inp.click('panel', btn['x'], btn['y'])  # 되돌리기

# ---------------------------------------------------------------- M4c 첫 실행 안내
s.pn.eval("chrome.storage.local.get('settings').then(r => chrome.storage.local.set({settings: {...(r.settings || {}), onboarded: false}})).then(() => true)")
time.sleep(0.6)
shown = s.pn.eval("!!document.querySelector('.onboarding')")
done = s.pn.eval("(() => { const b = document.querySelector('.onboarding button.primary'); if (!b) return null; const r = b.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; })()")
if done:
    s.inp.click('panel', done['x'], done['y'])
time.sleep(0.6)
gone = s.pn.eval("!document.querySelector('.onboarding')")
saved = s.pn.eval("chrome.storage.local.get('settings').then(r => !!(r.settings && r.settings.onboarded))")
lab.shot('case_M4c_onboarding.png')
runner.verdict('M4c_onboarding', [] if shown and gone and saved else [f'보임={shown} 닫힘={gone} 저장={saved}'])

# ---------------------------------------------------------------- M4d 설정: 기본 표시 방식
ext = s.pn.eval('location.host')
import urllib.request  # noqa: E402
with urllib.request.urlopen(f'http://127.0.0.1:{lab.CDP_PORT}/json/version') as r:
    b = lab.CDP(json.load(r)['webSocketDebuggerUrl'])
tid = b.call('Target.createTarget', url=f'chrome-extension://{ext}/options.html')['targetId']
time.sleep(1.5)
op = lab.CDP(lab.find_target(lambda t: t.get('id') == tid)['webSocketDebuggerUrl'])
radio = op.eval("(() => { const r = document.querySelectorAll('input[name=display]')[2].getBoundingClientRect(); return {x: r.left + 4, y: r.top + 4}; })()")
for kind in ('mouseMoved', 'mousePressed', 'mouseReleased'):
    op.call('Input.dispatchMouseEvent', type=kind, x=radio['x'], y=radio['y'], button='left', buttons=1 if kind == 'mousePressed' else 0, clickCount=1)
time.sleep(0.5)
op_shot = op.call('Page.captureScreenshot', format='png')['data']
import base64  # noqa: E402
open(os.path.join(lab.OUT, 'case_M4d_options.png'), 'wb').write(base64.b64decode(op_shot))
b.call('Target.closeTarget', targetId=tid)
rep = s.case('M4d_default_display', '#link-ref', box=1, shot=False, expect=dict(tag='a'))
blk = s.pn.eval("(() => { const d = window.__wcTest.doc(); const box = d.root.children[1]; return box.children[box.children.length - 1]; })()")
runner.verdict('M4d_default_display_applied', [] if blk and blk.get('display') == 'reflow' else [f'display={blk and blk.get("display")}'])
s.pn.eval("chrome.storage.local.get('settings').then(r => chrome.storage.local.set({settings: {...(r.settings || {}), defaultDisplay: 'fit'}})).then(() => true)")
runner.finish()
