import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab, runner
from runner import Session
s = Session('')
s.goto(lab.SERVER + '/big.html')
s.pg.eval('scrollTo(0,0); true')
s.case('E13_bigtable', '#big', box='new', where=(3, 3), mark=True, timeout=40, expect=dict(tag='table'))  # 성능은 기록만 (PLAN §11)
for mb in (5, 40):
    s.pg.eval(f"scrollTo(0,0); document.documentElement.setAttribute('data-wc-pad', '{mb * 1024 * 1024}'); true")
    rep = s.case(f'E9_payload_{mb}MB', '#big-title', box='new', where=(30, 10), mark=True, timeout=60, shot=False, expect=dict(tag='h2', min_html_bytes=mb * 1024 * 1024))
    if rep: print(f"   text/html arrived bytes={rep['sizes'].get('text/html')} drop→visible={rep.get('dropToVisibleMs')}ms dragDuration={rep.get('dragDurationMs')}ms")
s.pg.eval("document.documentElement.removeAttribute('data-wc-pad'); true")
runner.finish()
