import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab, runner, boot
from runner import Session, summarize
s = Session('')
s.goto(lab.SERVER + '/index.html')
# E5b: Alt 로 선택 → Alt 떼고 → 선택 영역 위를 잡아 끌기
x0, y0 = s.alt_select('#para')
print('selected:', repr((s.pg.eval('getSelection().toString()') or '')[:50]))
t0 = s.drag((x0 + 80, y0), s.dst_point(1, 'end'))
rep = summarize('E5b_sel_alt_released', lab.wait_report(t0))
runner.check('E5b_sel_alt_released', rep, dict(kind='selection'))
s.pg.eval('getSelection().removeAllRanges(); true')

# E15: 패널을 닫고, 페이지 안 버튼 클릭으로 열 수 있는지 (사용자 제스처 전달)
s.pn.eval('window.close(); true')
time.sleep(1.0)
print('panel open after close?', lab.panel_open())
t0 = lab.now_ms()
boot.open_panel(s.pg)
time.sleep(0.8)
opened = lab.panel_open()
bg = [x for x in lab.reports(t0) if x.get('kind') == 'open-panel']
print('[E15_open_from_page_button] panel open?', opened, '| bg report:', [{k: x.get(k) for k in ('ok', 'error')} for x in bg])
lab.shot('case_E15.png')
runner.verdict('E15_open_from_page_button', [] if opened and bg and bg[-1].get('ok') else [f'패널 열림={opened}, bg={bg}'])
runner.finish()
