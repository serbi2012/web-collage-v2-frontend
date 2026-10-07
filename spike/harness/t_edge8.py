"""E10: 패널 안에서 블록 순서 바꾸기.
다른 테스트가 남긴 블록과 섞이지 않도록 새 박스를 만들어 블록 2개를 넣고, 마지막 블록을 맨 앞으로 옮긴다."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import lab
import runner
from runner import Session

s = Session('')
s.goto('http://127.0.0.1:8765/index.html')
s.case('E10_setup_link', '#link-ref', box='new', shot=False)               # 새 박스 생성
last = s.pn.eval("document.querySelectorAll('.box:not(.new-box)').length") - 1
s.case('E10_setup_image', '#photo', box=last, index='end', shot=False)      # 같은 박스 끝에 추가
# 고정 헤더 아래로 그 박스가 보이게 스크롤 → 마지막 블록의 머리(회색 줄)를 잡아 맨 앞으로
s.pn.eval(f"document.querySelectorAll('.box:not(.new-box)')[{last}].scrollIntoView({{block:'start'}}); scrollBy(0, -110); true")
time.sleep(0.5)
info = s.pn.eval(f"""(() => {{ const box = document.querySelectorAll('.box:not(.new-box)')[{last}];
  const heads = [...box.querySelectorAll('.block-head')];
  const r = heads[heads.length-1].getBoundingClientRect(); const r0 = heads[0].getBoundingClientRect();
  return {{names: heads.map(h => h.querySelector('.src').textContent.split(' · ')[1]), src: {{x: r.left + 40, y: r.top + r.height/2}}, dst: {{x: r0.left + 60, y: r0.top + 4}}, vh: innerHeight}}; }})()""")
print('box before:', info['names'], '| src y', round(info['src']['y']), '/ viewport', info['vh'])
t0 = int(time.time() * 1000)
lab.drag((s.offS[0] + info['src']['x'], s.offS[1] + info['src']['y']), (s.offS[0] + info['dst']['x'], s.offS[1] + info['dst']['y']))
mv = lab.wait_report(t0, pred=lambda r: r.get('kind') == 'move', timeout=8)
after = s.pn.eval(f"[...document.querySelectorAll('.box:not(.new-box)')[{last}].querySelectorAll('.block-head .src')].map(e => e.textContent.split(' · ')[1])")
ok = bool(mv) and after == list(reversed(info['names']))
print('[E10_reorder]', 'OK' if ok else 'FAIL', '| box after:', after)
lab.shot('case_E10.png')
runner.verdict('E10_reorder', [] if ok else [f'순서가 안 바뀜: {info["names"]} → {after}'])
runner.finish()
