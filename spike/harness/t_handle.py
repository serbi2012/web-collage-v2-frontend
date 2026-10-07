"""G2/G3: 편집 가능 영역(contenteditable)에선 크롬이 드래그를 시작하지 않음 → 하이라이트 라벨(⠿ 손잡이)로 끌기.
(외부망 없이 MDN 라이브 예제 상황을 재현)"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import lab
import runner
from runner import Session, summarize

s = Session('')
s.goto('http://127.0.0.1:8765/editor.html')
s.pg.eval("document.querySelector('#demo').setAttribute('data-wc-target', ''); true")   # Alt+휠로 #demo 를 고른 상황
r = s.pg.eval("(() => { const r = document.querySelector('#demo').getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height, ih: innerHeight}; })()")
inside = (int(s.offP[0] + r['x'] + 120), int(s.offP[1] + r['y'] + 90))          # 코드(편집 영역) 위
ltop = r['y'] - 20 if r['y'] > 20 else min(r['y'] + r['h'] + 2, r['ih'] - 20)   # content.js paintOverlay 와 같은 규칙
handle = (int(s.offP[0] + max(0, r['x']) + 30), int(s.offP[1] + ltop + 10))

# 1) 전제 확인: 편집 영역을 잡고 끌면 드롭이 안 일어나야 함(크롬 동작)
dst = s.dst_point(0)
t0 = int(time.time() * 1000)
lab.drag(inside, dst)
rep = lab.wait_report(t0, timeout=5)
runner.verdict('G2_editable_blocks_native_drag', [] if not rep else ['편집 영역에서 드래그가 시작됨(크롬 동작이 바뀌었는지 확인 필요)'])
s.pg.eval('getSelection().removeAllRanges(); true')

# 2) 손잡이로 끌기
lab.xdo('mousemove', 940, 95); time.sleep(0.2)
lab.xdo('mousemove', *inside); time.sleep(0.5)                 # 하이라이트
lab.xdo('mousemove', *handle); time.sleep(0.4)                 # 라벨(손잡이)로 이동
dst = s.dst_point(0)
t0 = int(time.time() * 1000)
hx, hy = handle
lab.xdo('mousedown', 1); time.sleep(0.12)
for i in range(1, 29):
    lab.xdo('mousemove', hx + (int(dst[0]) - hx) * i // 28, hy + (int(dst[1]) - hy) * i // 28); time.sleep(0.03)
time.sleep(0.4); lab.xdo('mouseup', 1)
rep = lab.wait_report(t0, timeout=15)
summarize('G2G3_handle_drag', rep)
runner.check('G2G3_handle_drag', rep, dict(via='handle', tag='section'))
lab.shot('case_handle.png')
runner.finish()
