import os
import sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import lab
import runner
from runner import Session, summarize
s = Session('')
s.goto('https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/box-shadow', wait=7)
s.pg.eval("(() => { const ie = document.querySelector('interactive-example'); ie.setAttribute('data-wc-target',''); ie.scrollIntoView({block:'center'}); return 1; })()")
time.sleep(2.5)
r = s.pg.eval("(() => { const r = document.querySelector('interactive-example').getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height, ih: innerHeight}; })()")
inside = (s.offP[0] + r['x'] + r['w'] * 0.3, s.offP[1] + max(r['y'], 0) + 60)
ltop = r['y'] - 20 if r['y'] > 20 else min(r['y'] + r['h'] + 2, r['ih'] - 20)
handle = (s.offP[0] + max(0, r['x']) + 30, s.offP[1] + ltop + 10)
print('element rect', {k: round(v) for k, v in r.items()}, 'handle at', handle)
lab.xdo('mousemove', 940, 95); time.sleep(0.2)
lab.xdo('mousemove', int(inside[0]), int(inside[1])); time.sleep(0.5)    # 요소 위에 올려 하이라이트
lab.shot('mdn_hover.png')
dst = s.dst_point('new'); t0 = int(time.time() * 1000)
hx, hy = map(int, handle)
lab.xdo('mousemove', hx, hy); time.sleep(0.4)                         # 손잡이로 이동
lab.xdo('mousedown', 1); time.sleep(0.12)
for i in range(1, 29): lab.xdo('mousemove', hx + (int(dst[0]) - hx) * i // 28, hy + (int(dst[1]) - hy) * i // 28); time.sleep(0.03)
time.sleep(0.4); lab.xdo('mouseup', 1)
rep = summarize('mdn_example_via_handle', lab.wait_report(t0, timeout=25))
if rep: print('   via=', rep['meta'].get('via'))
runner.check('mdn_example_via_handle', rep, dict(via='handle', tag='interactive-example'))
time.sleep(1)
from real import panel_crop
panel_crop(s, 'mdn_example')
runner.finish()
