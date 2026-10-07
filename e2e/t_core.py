"""CORE: 부모 선택자 스타일·웹폰트·::before 배지·SVG <use>·배경 패턴이 있는 카드를 끌어 Box 1 에 놓기.
드래그 도중(OS 모드만, s03_middrag.png)과 놓은 뒤(s04_afterdrop.png) 화면을 저장한다."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab, runner
from runner import Session, summarize

s = Session('')
s.goto(lab.SERVER + '/index.html')
src = s.src_point('#card-news', where='pad', scroll=False)  # 카드의 왼쪽 여백 = 카드 자체를 잡음
dst = s.dst_point(0)
print('mode', s.inp.mode, 'src', src, 'dst', dst)
t0 = s.drag(src, dst, over_fn=(lambda i: i == 3 and lab.shot('s03_middrag.png')) if s.inp.mode == 'os' else None)
rep = lab.wait_report(t0)
time.sleep(1.0)
lab.shot('s04_afterdrop.png')
summarize('CORE', rep)
runner.check('CORE', rep, dict(kind='element', tag='article', images_ok=True, localize_ok=True, fonts_loaded=True, max_visible_ms=200))
runner.finish()
