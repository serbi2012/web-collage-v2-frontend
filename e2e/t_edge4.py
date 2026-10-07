import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab, runner
from runner import Session, summarize
s = Session('')
# E6 hostile: 드래그·선택·우클릭을 막는 사이트
s.goto(lab.SERVER + '/hostile.html')
s.case('E6a_hostile_card', '#product', box=1, index='end', where='pad', expect=dict(tag='div', images_ok=True))
s.case('E6b_hostile_img', '#product-img', box=1, index='end', expect=dict(tag='img', images_ok=True))
blocked = s.pg.eval('window.__blockedDragstart')
print('   page blocked dragstart count (should be 0/None):', blocked)
runner.verdict('E6_page_blocker_never_ran', [] if not blocked else [f'페이지의 dragstart 차단 핸들러가 {blocked}번 실행됨'])
# E7 SPA: JS로 나중에 그려지는 내용 + Shadow DOM + canvas + 다른 출처 iframe + 폼 값
s.goto(lab.SERVER + '/spa.html', wait=2.5)
for name, sel, exp in [('E7a_shadow', '#tile-shadow', {}), ('E7b_canvas', '#tile-canvas', {}), ('E7c_iframe_tile', '#tile-iframe', {'fallbacks_ok': True}), ('E7d_form', '#tile-form', {})]:
    s.case(name, sel, box='new', where=(4, 4), mark=True, expect=dict(tag='section', **exp))
# E8: 다른 출처 iframe "안쪽" 요소를 직접 끌기 (all_frames)
r = lab.rect(s.pg, '#tile-iframe iframe', scroll=True)
src = (r['x'] + r['w'] / 2, r['y'] + r['h'] / 2)
dst = s.dst_point('new')
t0 = s.drag(src, dst)
rep = summarize('E8_inside_iframe', lab.wait_report(t0))
if rep: print('   isTop=', rep['meta'].get('isTop'), 'url=', rep['meta'].get('url'))
runner.check('E8_inside_iframe', rep, dict(isTop=False, tag='div'))
runner.finish()
