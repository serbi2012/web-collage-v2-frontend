import os
import sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import lab
import runner
from runner import Session, summarize
s = Session('')
s.goto('http://127.0.0.1:8765/index.html')
def alt_select():
    r = lab.rect(s.pg, '#para', scroll=False)
    x0, y0 = int(s.offP[0] + r['x'] + 3), int(s.offP[1] + r['y'] + 12)
    lab.xdo('mousemove', x0 + 5, y0 + 5); time.sleep(0.1); lab.xdo('mousemove', x0, y0); time.sleep(0.3)
    lab.xdo('keydown', 'alt'); time.sleep(0.15); lab.xdo('mousedown', 1); time.sleep(0.1)
    for i in range(1, 11): lab.xdo('mousemove', x0 + 26 * i, y0 + (27 if i > 8 else 0)); time.sleep(0.03)
    lab.xdo('mouseup', 1); time.sleep(0.2)
    return x0, y0
for name, release in [('E5a_alt_held', False), ('E5b_alt_released', True)]:
    x0, y0 = alt_select()
    if release: lab.xdo('keyup', 'alt'); time.sleep(0.3)
    print(name, 'selected:', repr(s.pg.eval('getSelection().toString()')[:30]))
    dst = s.dst_point(0, 'end'); t0 = int(time.time() * 1000)
    lab.drag((x0 + 80, y0), dst)
    if not release: lab.xdo('keyup', 'alt')
    rep = summarize(name, lab.wait_report(t0))
    if rep: print('   kind=', rep['meta']['kind'])
    runner.check(name, rep, dict(kind='selection'))
    s.pg.eval('getSelection().removeAllRanges(); true'); time.sleep(0.4)
# 회귀 확인: 선택이 없을 땐 다시 요소 드래그가 되는지
s.case('CORE_regress_card', '#card-news', box=1, index='end', where='pad', expect=dict(kind='element', tag='article'))  # 선택이 없으면 다시 요소 드래그
lab.shot('case_sel_final.png')
runner.finish()
