"""v2 신규 케이스 (PLAN M0·M2 완료 기준)
F1   커스텀 MIME 이 안 넘어올 때 clip:current 폴백 (E2E 빌드의 data-wc-nomime 스위치)
G17  패널 고정 헤더 위 드롭 → 드롭되지 않아야 함 (마지막 박스로 가지 않음)
M2a  중첩 박스 만들기(＋박스 버튼) + 그 안 특정 위치에 드롭
M2b  박스 간 블록 이동 (블록 머리 끌기)
M2d  Undo / Redo (Ctrl+Z / Ctrl+Shift+Z, 패널 안)
M2c  긴 패널 자동 스크롤 (드래그 중 아래 가장자리에 머물기)
M2e  패널이 없는 다른 창은 스크랩 모드 아님 (창 단위)
"""
import json, os, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab, runner
from runner import Session, summarize

s = Session('')
s.goto(lab.SERVER + '/index.html')


def doc():
    return s.pn.eval('window.__wcTest.doc()')


def count_blocks(node):
    return 1 if node['kind'] == 'block' else sum(count_blocks(c) for c in node['children'])


def ids(node):
    return [c['id'] for c in node['children']]


# ---------------------------------------------------------------- F1 폴백
s.pg.eval("document.documentElement.setAttribute('data-wc-nomime', ''); true")
s.case('F1_fallback_clip_current', '#card-news', box=0, where='pad', expect=dict(custom=False, fallback=True, kind='element', tag='article', images_ok=True))
s.pg.eval("document.documentElement.removeAttribute('data-wc-nomime'); true")

# ---------------------------------------------------------------- G17 헤더 위 드롭
before = count_blocks(doc()['root'])
s.pn.eval('scrollTo(0,0); true')
hdr = s.pn.eval("(() => { const r = document.querySelector('.top .hint').getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; })()")
t0 = s.drag(s.src_point('#photo'), (hdr['x'], hdr['y']))
rep = lab.wait_report(t0, timeout=5)
after = count_blocks(doc()['root'])
lab.shot('case_G17_header.png')
runner.verdict('G17_header_drop_ignored', [] if not rep and after == before else [f'헤더 위 드롭이 들어감 report={bool(rep)} blocks {before}→{after}'])

# ---------------------------------------------------------------- M2a 중첩 박스
s.pn.eval("document.querySelectorAll('.box:not(.new-box)')[0].scrollIntoView({block:'center'}); true")
time.sleep(0.3)
btn = s.pn.eval("""(() => { const b = [...document.querySelectorAll('.box:not(.new-box)')[0].querySelectorAll(':scope > .box-head button')].find(x => x.textContent.includes('박스'));
  const r = b.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; })()""")
s.inp.click('panel', btn['x'], btn['y'])
time.sleep(0.6)
box1 = doc()['root']['children'][0]
nested = [c for c in box1['children'] if c['kind'] == 'box']
runner.verdict('M2a_add_nested_box', [] if len(nested) == 1 else [f'중첩 박스 생성 실패: {box1}'])
# 중첩 박스는 문서 순서상 .box 목록의 두 번째 (Box1 → 그 안의 박스 → Box2)
s.case('M2a_drop_into_nested', '#link-ref', box=1, index='end', expect=dict(tag='a'))
nested = [c for c in doc()['root']['children'][0]['children'] if c['kind'] == 'box']
in_nested = bool(nested) and any(c['kind'] == 'block' for c in nested[0]['children'])
runner.verdict('M2a_nested_position', [] if in_nested else [f'중첩 박스 안에 안 들어감: {json.dumps(doc()["root"], ensure_ascii=False)[:300]}'])

# ---------------------------------------------------------------- M2b 박스 간 이동: 중첩 박스의 블록 → Box 2
moved_id = nested[0]['children'][0]['id'] if in_nested else None
info = s.pn.eval("""(() => { const nb = document.querySelectorAll('.box:not(.new-box)')[1]; nb.scrollIntoView({block:'center'});
  const h = nb.querySelector(':scope > .blocks > .block > .block-head').getBoundingClientRect();
  const b2 = document.querySelectorAll('.box:not(.new-box)')[2].querySelector(':scope > .blocks').getBoundingClientRect();
  return {src: {x: h.left + 30, y: h.top + h.height/2}, dst: {x: b2.left + b2.width/2, y: Math.min(b2.top + Math.min(b2.height/2, 30), innerHeight - 20)}}; })()""")
t0 = s.drag((info['src']['x'], info['src']['y']), (info['dst']['x'], info['dst']['y']), src_t='panel', dst_t='panel')
mv = lab.wait_report(t0, pred=lambda r: r.get('kind') == 'move', timeout=8)
time.sleep(0.4)
box2 = doc()['root']['children'][1]
ok_move = bool(mv) and moved_id in ids(box2)
lab.shot('case_M2b_move.png')
runner.verdict('M2b_move_between_boxes', [] if ok_move else [f'이동 실패 move={mv} box2={ids(box2)}'])

# ---------------------------------------------------------------- M2d Undo / Redo
n0 = count_blocks(doc()['root'])
ih = s.pn.eval('innerHeight')
s.inp.click('panel', 20, ih - 12)  # 패널에 포커스 (보드 빈 곳)
time.sleep(0.3)
s.inp.hotkey('panel', 'Control', 'z')
time.sleep(0.5)
d_undo = doc()
undone_back = any(moved_id in ids(b) for b in d_undo['root']['children'][0]['children'] if b['kind'] == 'box')
s.inp.hotkey('panel', 'Control', 'Shift', 'z')
time.sleep(0.5)
d_redo = doc()
redone = moved_id in ids(d_redo['root']['children'][1])
runner.verdict('M2d_undo_redo', [] if undone_back and redone and count_blocks(d_redo['root']) == n0 else [f'undo={undone_back} redo={redone}'])

# ---------------------------------------------------------------- M2c 긴 패널 자동 스크롤
s.pn.eval('window.__wcTest.addBoxes(14); scrollTo(0,0); true')
time.sleep(0.6)
first_block = s.pn.eval("document.querySelectorAll('.box:not(.new-box)')[0].querySelector('.block').dataset.nodeId")
head = s.pn.eval(f"(() => {{ const r = document.querySelector('[data-node-id=\"{first_block}\"] .block-head').getBoundingClientRect(); return {{x: r.left + 30, y: r.top + r.height/2, vh: innerHeight, sh: document.documentElement.scrollHeight}}; }})()")
print('   panel scrollHeight', head['sh'], 'viewport', head['vh'])
at_bottom = lambda: s.pn.eval('scrollY + innerHeight >= document.documentElement.scrollHeight - 2')


def last_box_point():
    p = s.pn.eval("""(() => { const bs = document.querySelectorAll('.box:not(.new-box)'); const r = bs[bs.length-1].getBoundingClientRect();
      return {x: r.left + r.width/2, y: r.top + r.height/2}; })()""")
    return (p['x'], p['y'])


last_id = s.pn.eval("(() => { const bs = document.querySelectorAll('.box:not(.new-box)'); return bs[bs.length-1].dataset.id; })()")
t0 = s.drag((head['x'], head['y']), last_box_point, src_t='panel', dst_t='panel', via=[(head['x'], head['vh'] - 12, 120, at_bottom)])
scrolled = s.pn.eval('scrollY')
mv = lab.wait_report(t0, pred=lambda r: r.get('kind') == 'move', timeout=8)
time.sleep(0.4)
lastbox = [c for c in doc()['root']['children'] if c['id'] == last_id]
ok_scroll = scrolled > 200 and bool(lastbox) and first_block in ids(lastbox[0])
lab.shot('case_M2c_autoscroll.png')
runner.verdict('M2c_autoscroll', [] if ok_scroll else [f'scrollY={scrolled} move={bool(mv)} inLast={bool(lastbox) and ids(lastbox[0])}'])


# ---------------------------------------------------------------- M2e 창 단위 스크랩 모드
# 새 창(패널 없음)과 원래 창(패널 있음)에서 마우스를 올려 본다(CDP 이동, 드래그 아님). 무장·오버레이는 패널 창에서만 생겨야 한다.
def hover_armed(cdp, sel):
    r = cdp.eval(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return {{x: r.left + 20, y: r.top + 20}}; }})()")
    cdp.call('Input.dispatchMouseEvent', type='mouseMoved', x=r['x'] - 10, y=r['y'] - 10)
    cdp.call('Input.dispatchMouseEvent', type='mouseMoved', x=r['x'], y=r['y'])
    time.sleep(0.4)
    return cdp.eval(f"(() => document.querySelector('{sel}').getAttribute('draggable') === 'true' || !!document.querySelector('wc-overlay'))()")


with urllib.request.urlopen(f'http://127.0.0.1:{lab.CDP_PORT}/json/version') as resp:
    b = lab.CDP(json.load(resp)['webSocketDebuggerUrl'])
tid = b.call('Target.createTarget', url=lab.SERVER + '/index.html?win2', newWindow=True, left=-1700, top=1600, width=1200, height=800)['targetId']  # 화면 밖에
time.sleep(2.5)
other = lab.CDP(lab.find_target(lambda t: t.get('id') == tid)['webSocketDebuggerUrl'])
in_other = hover_armed(other, '#card-news')
b.call('Target.closeTarget', targetId=tid)
time.sleep(0.5)
in_main = hover_armed(s.pg, '#card-news')
runner.verdict('M2e_scrap_mode_per_window', [] if (not in_other and in_main) else [f'다른 창 무장={in_other}, 패널 창 무장={in_main}'])
runner.finish()
