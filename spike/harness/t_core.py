"""CORE: 부모 선택자 스타일·웹폰트·::before 배지·SVG <use>·배경 패턴이 있는 카드를 끌어 Box 1 에 놓기.
드래그 도중(s03_middrag.png)과 놓은 뒤(s04_afterdrop.png) 화면을 저장한다."""
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import lab
import runner
from runner import Session, summarize

s = Session('')
s.goto('http://127.0.0.1:8765/index.html')
src = s.src_point('#card-news', where='pad', scroll=False)      # 카드의 왼쪽 여백 = 카드 자체를 잡음
dst = s.dst_point(0)
print('src', src, 'dst', dst)

t0 = int(time.time() * 1000)
sx, sy = map(int, src); dx, dy = map(int, dst)
lab.xdo('mousemove', sx - 40, sy - 40); time.sleep(0.1)
lab.xdo('mousemove', sx, sy); time.sleep(0.5)
lab.xdo('mousedown', 1); time.sleep(0.12)
steps = 30
for i in range(1, steps + 1):
    t = i / steps; e = t * t * (3 - 2 * t)
    lab.xdo('mousemove', int(sx + (dx - sx) * e), int(sy + (dy - sy) * e)); time.sleep(0.03)
time.sleep(0.4)
lab.shot('s03_middrag.png')
lab.xdo('mouseup', 1)
rep = lab.wait_report(t0)
time.sleep(1.0)
lab.shot('s04_afterdrop.png')
summarize('CORE', rep)
runner.check('CORE', rep, dict(kind='element', tag='article', images_ok=True, localize_ok=True, fonts_loaded=True, max_visible_ms=200))
runner.finish()
