import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab, boot, runner
from runner import Session, summarize
boot.boot(lab.SERVER + '/m1.html')
s = Session('')
s.goto(lab.SERVER + '/m1.html')
src = s.src_point('#lazy-img', where=(4, 4), mark=True)
print('lazy src point', src, s.pg.eval("(() => { const i = document.querySelector('#lazy-img'); const r = i.getBoundingClientRect(); return [r.toJSON(), i.complete, i.naturalWidth, i.getAttribute('draggable')]; })()"))
ok = s.inp.drag('page', src, 'panel', s.dst_point('new'))
print('drag started:', ok)
time.sleep(2)
print([ (r.get('kind'), (r.get('meta') or {}).get('tag'), r.get('error')) for r in lab.reports(lab.now_ms() - 5000)])
s.goto(lab.SERVER + '/spa.html', wait=2.5)
rep = s.case('iframe', '#tile-iframe', box='new', where=(4, 4), mark=True, shot=False)
print('frames', rep and rep.get('frames'))
