import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab, runner, inputs
from runner import Session, summarize
s = Session('')
s.goto(lab.SERVER + '/index.html')
os_mode = s.inp.mode == 'os'

for name, release in [('E5a_alt_held', False), ('E5b_alt_released', True)]:
    x0, y0 = s.alt_select('#para', keep_alt=not release)
    print(name, 'selected:', repr((s.pg.eval('getSelection().toString()') or '')[:30]))
    dst = s.dst_point(0, 'end')
    # Alt 를 누른 채 끌기: CDP 는 이벤트마다 modifiers 로, OS 는 alt_select 에서 누른 키를 그대로 둔 채
    t0 = s.drag((x0 + 80, y0), dst, mods=inputs.ALT if (not release and not os_mode) else 0)
    if not release and os_mode:
        s.inp.key('page', 'Alt', 'keyUp')
    rep = summarize(name, lab.wait_report(t0))
    if rep: print('   kind=', rep['meta']['kind'])
    runner.check(name, rep, dict(kind='selection'))
    s.pg.eval('getSelection().removeAllRanges(); true'); time.sleep(0.4)
# 회귀 확인: 선택이 없을 땐 다시 요소 드래그
s.case('CORE_regress_card', '#card-news', box=1, index='end', where='pad', expect=dict(kind='element', tag='article'))
lab.shot('case_sel_final.png')
runner.finish()
