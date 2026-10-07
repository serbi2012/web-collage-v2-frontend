"""E10: 패널 안에서 블록 순서 바꾸기. 새 박스에 블록 2개를 넣고 마지막 블록(머리)을 잡아 맨 앞으로."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab, runner
from runner import Session

s = Session('')
s.goto(lab.SERVER + '/index.html')
s.case('E10_setup_link', '#link-ref', box='new', shot=False)
last = s.pn.eval("document.querySelectorAll('.box:not(.new-box)').length") - 1
s.case('E10_setup_image', '#photo', box=last, index='end', shot=False)
hh = s.pn.eval("document.querySelector('.top').getBoundingClientRect().bottom")
s.pn.eval(f"document.querySelectorAll('.box:not(.new-box)')[{last}].scrollIntoView({{block:'start'}}); scrollBy(0, -{hh + 10}); true")
time.sleep(0.5)
info = s.pn.eval(f"""(() => {{ const box = document.querySelectorAll('.box:not(.new-box)')[{last}];
  const heads = [...box.querySelectorAll(':scope > .blocks > .block > .block-head')];
  const r = heads[heads.length-1].getBoundingClientRect(); const r0 = heads[0].getBoundingClientRect();
  return {{names: heads.map(h => h.querySelector('.src').textContent.split(' · ')[1]), src: {{x: r.left + 40, y: r.top + r.height/2}}, dst: {{x: r0.left + 60, y: r0.top + 4}}, vh: innerHeight}}; }})()""")
print('box before:', info['names'], '| src y', round(info['src']['y']), '/ viewport', info['vh'])
t0 = s.drag((info['src']['x'], info['src']['y']), (info['dst']['x'], info['dst']['y']), src_t='panel', dst_t='panel')
mv = lab.wait_report(t0, pred=lambda r: r.get('kind') == 'move', timeout=8)
time.sleep(0.4)
after = s.pn.eval(f"[...document.querySelectorAll('.box:not(.new-box)')[{last}].querySelectorAll(':scope > .blocks > .block .src')].map(e => e.textContent.split(' · ')[1])")
ok = bool(mv) and after == list(reversed(info['names']))
print('[E10_reorder]', 'OK' if ok else 'FAIL', '| box after:', after)
lab.shot('case_E10.png')
runner.verdict('E10_reorder', [] if ok else [f'순서가 안 바뀜: {info["names"]} → {after}'])
runner.finish()
