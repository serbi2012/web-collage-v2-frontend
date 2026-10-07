import os
import sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import lab
import runner
from runner import Session, summarize
s = Session('')
s.goto('http://127.0.0.1:8765/index.html')
# E5b: Alt 로 선택 → Alt 떼고 → 선택 영역 위를 잡아 끌기
r = lab.rect(s.pg, '#para', scroll=False)
x0, y0 = int(s.offP[0] + r['x'] + 3), int(s.offP[1] + r['y'] + 12)
lab.xdo('mousemove', x0 + 5, y0 + 5); time.sleep(0.1); lab.xdo('mousemove', x0, y0); time.sleep(0.3)
lab.xdo('keydown', 'alt'); time.sleep(0.15); lab.xdo('mousedown', 1); time.sleep(0.1)
for i in range(1, 11): lab.xdo('mousemove', x0 + 26 * i, y0 + (27 if i > 8 else 0)); time.sleep(0.03)
lab.xdo('mouseup', 1); time.sleep(0.2); lab.xdo('keyup', 'alt'); time.sleep(0.3)
print('selected:', repr(s.pg.eval('getSelection().toString()')[:50]))
dst = s.dst_point(1, 'end'); t0 = int(time.time() * 1000)
lab.drag((x0 + 80, y0), dst)
rep = summarize('E5b_sel_alt_released', lab.wait_report(t0))
if rep: print('   kind=', rep['meta']['kind'])
runner.check('E5b_sel_alt_released', rep, dict(kind='selection'))
s.pg.eval('getSelection().removeAllRanges(); true')

# E15: 패널을 닫고, 페이지 안 버튼 클릭으로 열 수 있는지 (사용자 제스처 전달)
lab.xdo('mousemove', 1576, 100); lab.xdo('click', 1); time.sleep(1.0)
print('panel open after X?', any('sidepanel' in t['url'] for t in lab.targets()))
s.pg.eval("""(() => { const b = document.createElement('button'); b.id = 'openbtn'; b.textContent = '콜라주 열기';
  b.style.cssText = 'position:fixed;left:20px;bottom:20px;z-index:99;padding:10px 16px;font-size:16px';
  b.onclick = () => window.postMessage({__wc: 'open-panel'}, '*'); document.body.appendChild(b); return true; })()""")
time.sleep(0.3)
t0 = int(time.time() * 1000)
r = lab.rect(s.pg, '#openbtn', scroll=False)
lab.xdo('mousemove', int(r['x'] + 20), int(s.offP[1] + r['y'] + 10)); time.sleep(0.2); lab.xdo('click', 1); time.sleep(1.5)
print('[E15_open_from_page_button] panel open?', any('sidepanel' in t['url'] for t in lab.targets()), '| bg report:', [ {k: x.get(k) for k in ('ok','error')} for x in lab.reports(t0) if x.get('kind') == 'open-panel'])
lab.shot('case_E15.png')
opened = any('sidepanel' in t['url'] for t in lab.targets())
bg = [x for x in lab.reports(t0) if x.get('kind') == 'open-panel']
runner.verdict('E15_open_from_page_button', [] if opened and bg and bg[-1].get('ok') else [f'패널 열림={opened}, bg={bg}'])
runner.finish()
