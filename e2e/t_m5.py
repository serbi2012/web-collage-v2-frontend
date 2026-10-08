"""M5 편집 케이스
M5a  메모 블록: 박스의 ＋메모 → 글 입력 → 저장
M5b  조각 안 글자 직접 편집 → 새 조각으로 갈라 저장, Ctrl+Z 로 원래 조각, Ctrl+Shift+Z 로 다시
M5c  크기 배율 50%
M5d  형광펜으로 그리기 → 주석 1획 저장
M5e  내보낸 HTML 에 메모·편집 글자·주석이 반영
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab  # noqa: E402
import runner  # noqa: E402
from runner import Session  # noqa: E402

s = Session('')
s.goto(lab.SERVER + '/index.html')
s.case('M5_setup_card', '#card-news', box=0, where='pad', shot=False, expect=dict(tag='article'))
time.sleep(1.0)


def doc():
    return s.pn.eval('window.__wcTest.doc()')


def box1():
    return doc()['root']['children'][0]


def center(js):
    p = s.pn.eval(f"(() => {{ const e = {js}; if (!e) return null; e.scrollIntoView({{block:'center'}}); const r = e.getBoundingClientRect(); return {{x: r.left + r.width/2, y: r.top + r.height/2}}; }})()")
    time.sleep(0.2)
    return s.pn.eval(f"(() => {{ const e = {js}; const r = e.getBoundingClientRect(); return {{x: r.left + r.width/2, y: r.top + r.height/2}}; }})()") if p else None


def click(js):
    p = center(js)
    if p:
        s.inp.click('panel', p['x'], p['y'])
        time.sleep(0.4)
    return p


def focus_board():
    ih = s.pn.eval('innerHeight')
    s.inp.click('panel', 20, ih - 12)
    time.sleep(0.2)


# ---------------------------------------------------------------- M5a 메모
click("[...document.querySelectorAll('.box:not(.new-box)')[0].querySelectorAll(':scope > .box-head button')].find(b => b.textContent.includes('메모') || b.textContent.includes('Note'))")
click("document.querySelector('.block.note textarea')")
s.pn.call('Input.insertText', text='메모 테스트 ✍')
focus_board()
time.sleep(0.4)
notes = [c for c in box1()['children'] if c.get('type') == 'note']
runner.verdict('M5a_note', [] if notes and notes[0].get('note') == '메모 테스트 ✍' else [f'메모={notes}'])

# ---------------------------------------------------------------- M5b 편집
clip_block = next(c for c in box1()['children'] if c.get('type') == 'clip')
old_clip = clip_block['clipId']
click(f"document.querySelector('[data-node-id=\"{clip_block['id']}\"] .block-head button.edit')")
editable = s.pn.eval(f"document.querySelector('[data-node-id=\"{clip_block['id']}\"] .clip').shadowRoot.querySelector('.wrap').isContentEditable")
# 커서를 맨 앞 글자 위치에 두고 입력
s.pn.eval(f"""(() => {{ const w = document.querySelector('[data-node-id="{clip_block['id']}"] .clip').shadowRoot.querySelector('.wrap');
  const h2 = w.querySelector('h2'); const sel = w.getRootNode().getSelection ? w.getRootNode().getSelection() : getSelection();
  const r = document.createRange(); r.setStart(h2.firstChild, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; }})()""")
s.pn.call('Input.insertText', text='EDITED ')
time.sleep(0.2)
click(f"document.querySelector('[data-node-id=\"{clip_block['id']}\"] .block-head button.edit')")
time.sleep(0.8)
new_clip = next(c for c in box1()['children'] if c['id'] == clip_block['id'])['clipId']
new_html = (s.pn.eval(f'window.__wcTest.clip({json.dumps(new_clip)})') or {}).get('html', '')
reasons = []
if not editable:
    reasons.append('편집 모드가 켜지지 않음')
if new_clip == old_clip:
    reasons.append('새 조각으로 갈라지지 않음')
if 'EDITED' not in new_html:
    reasons.append('편집 글자가 저장되지 않음')
if 'wc-asset:' not in new_html:
    reasons.append('이미지 참조(wc-asset)가 되돌려지지 않음')
focus_board()
s.inp.hotkey('panel', 'Control', 'z')
time.sleep(0.5)
undone = next(c for c in box1()['children'] if c['id'] == clip_block['id'])['clipId']
s.inp.hotkey('panel', 'Control', 'Shift', 'z')
time.sleep(0.5)
redone = next(c for c in box1()['children'] if c['id'] == clip_block['id'])['clipId']
if undone != old_clip or redone != new_clip:
    reasons.append(f'되돌리기 {undone == old_clip} / 다시 하기 {redone == new_clip}')
lab.shot('case_M5b_edit.png')
runner.verdict('M5b_edit_fork_undo', reasons)

# ---------------------------------------------------------------- M5c 크기 배율
sel = f"document.querySelector('[data-node-id=\"{clip_block['id']}\"] select.scale')"
z0 = s.pn.eval(f"parseFloat(document.querySelector('[data-node-id=\"{clip_block['id']}\"] .clip').shadowRoot.querySelector('.wrap').style.zoom)")
s.pn.eval(f"(() => {{ const e = {sel}; e.value = '0.5'; e.dispatchEvent(new Event('change', {{bubbles: true}})); return true; }})()")
time.sleep(0.5)
z1 = s.pn.eval(f"parseFloat(document.querySelector('[data-node-id=\"{clip_block['id']}\"] .clip').shadowRoot.querySelector('.wrap').style.zoom)")
sc = next(c for c in box1()['children'] if c['id'] == clip_block['id']).get('scale')
# 조각이 작아지면 패널 세로 스크롤바가 사라져 폭이 조금 늘 수 있다 → 비율로 판단
runner.verdict('M5c_scale', [] if sc == 0.5 and abs(z1 / z0 - 0.5) < 0.06 else [f'scale={sc} zoom {z0}→{z1}'])
s.pn.eval(f"(() => {{ const e = {sel}; e.value = '1'; e.dispatchEvent(new Event('change', {{bubbles: true}})); return true; }})()")
time.sleep(0.4)

# ---------------------------------------------------------------- M5d 형광펜
click(f"document.querySelector('[data-node-id=\"{clip_block['id']}\"] .block-head button.draw')")
area = s.pn.eval(f"(() => {{ const h = document.querySelector('[data-node-id=\"{clip_block['id']}\"] .clip'); h.scrollIntoView({{block:'center'}}); const r = h.getBoundingClientRect(); return {{x: r.left, y: r.top, w: r.width, h: r.height}}; }})()")
time.sleep(0.3)
area = s.pn.eval(f"(() => {{ const r = document.querySelector('[data-node-id=\"{clip_block['id']}\"] .clip').getBoundingClientRect(); return {{x: r.left, y: r.top, w: r.width, h: r.height}}; }})()")
x0, y0 = area['x'] + 20, area['y'] + 40
s.pn.call('Input.dispatchMouseEvent', type='mouseMoved', x=x0, y=y0)
s.pn.call('Input.dispatchMouseEvent', type='mousePressed', x=x0, y=y0, button='left', buttons=1, clickCount=1)
for i in range(1, 12):
    s.pn.call('Input.dispatchMouseEvent', type='mouseMoved', x=x0 + i * 15, y=y0 + (i % 2) * 2, button='left', buttons=1)
    time.sleep(0.02)
s.pn.call('Input.dispatchMouseEvent', type='mouseReleased', x=x0 + 165, y=y0, button='left', buttons=0, clickCount=1)
time.sleep(0.5)
ink = next(c for c in box1()['children'] if c['id'] == clip_block['id']).get('ink') or []
paths = s.pn.eval(f"document.querySelector('[data-node-id=\"{clip_block['id']}\"] .clip').shadowRoot.querySelectorAll('svg.ink path').length")
lab.shot('case_M5d_ink.png')
runner.verdict('M5d_ink', [] if len(ink) == 1 and len(ink[0]['pts']) >= 10 and paths == 1 else [f'ink={len(ink)} pts={ink and len(ink[0]["pts"])} paths={paths}'])
click(f"[...document.querySelectorAll('[data-node-id=\"{clip_block['id']}\"] .ink-tools button')].pop()")

# ---------------------------------------------------------------- M5e 내보내기
s.pn.eval('window.__wcTest.flush()')
html = s.pn.eval('window.__wcTest.exportHtml()')
open(os.path.join(lab.OUT, 'export_m5.html'), 'w', encoding='utf-8').write(html)
miss = [k for k, v in {'메모': '메모 테스트 ✍' in html, '편집 글자': 'EDITED' in html, '주석': 'class="ink"' in html and '<path d="M' in html}.items() if not v]
runner.verdict('M5e_export_reflects_edits', [] if not miss else ['내보내기에 없음: ' + ', '.join(miss)])
runner.finish()
