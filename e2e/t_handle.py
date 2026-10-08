"""G2/G3: 편집 가능 영역(contenteditable)에선 크롬이 드래그를 시작하지 않음 → 하이라이트 라벨(⠿ 손잡이)로 끌기."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab, runner
from runner import Session, summarize

s = Session('')
s.goto(lab.SERVER + '/editor.html')
s.pg.eval("document.querySelector('#demo').setAttribute('data-wc-target', ''); true")  # Alt+휠로 #demo 를 고른 상황
r = s.pg.eval("(() => { const r = document.querySelector('#demo').getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height, ih: innerHeight}; })()")
inside = (r['x'] + 120, r['y'] + 90)
ltop = r['y'] - 20 if r['y'] > 20 else min(r['y'] + r['h'] + 2, r['ih'] - 20)  # overlay.ts labelTop 과 같은 규칙
handle = (max(0, r['x']) + 30, ltop + 10)

# 1) 전제 확인: 편집 영역을 잡고 끌면 드롭이 안 일어나야 함(크롬 동작)
t0 = s.drag(inside, s.dst_point(0))
rep = lab.wait_report(t0, timeout=5)
runner.verdict('G2_editable_blocks_native_drag', [] if not rep else ['편집 영역에서 드래그가 시작됨(크롬 동작이 바뀌었는지 확인 필요)'])
s.pg.eval('getSelection().removeAllRanges(); true')

# 2) 손잡이로 끌기: 편집 영역 위로 마우스를 올려 하이라이트 → 라벨(손잡이)에서 잡기
s.inp.move('page', *inside)
time.sleep(0.5)
dst = s.dst_point(0)
s.inp.move('page', *inside)
time.sleep(0.4)
t0 = s.drag(handle, dst, settle=0.4, approach=False)
rep = lab.wait_report(t0, timeout=15)
summarize('G2G3_handle_drag', rep)
runner.check('G2G3_handle_drag', rep, dict(via='handle', tag='section'))
lab.shot('case_handle.png')
runner.finish()
