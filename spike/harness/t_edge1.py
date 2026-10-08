import os
import sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import lab
import runner
from runner import Session
s = Session('')
s.goto('http://127.0.0.1:8765/index.html')
print('offsets', s.offP, s.offS)
s.case('E1_image', '#photo', box=1, index='end', expect=dict(kind='element', tag='img', images_ok=True))                 # 기본으로 끌리는 이미지
s.case('E2_link', '#link-ref', box=1, index=0, expect=dict(kind='element', tag='a'))                   # 링크, Box2 맨 앞에 끼워넣기
s.case('E3_protected', '#protected', box=0, index='end', expect=dict(tag='img', via_referer=True, images_ok=True))         # Referer 엄격 검사 이미지
s.case('E4_table', '#table-small', box='new', where=(5, 5), mark=True, expect=dict(tag='table'))  # 표 전체 → 새 박스
# E14: <p> 위에서 Alt+휠 위로 → 부모(카드)로 넓힌 뒤 드래그 (실사용 UX 경로, 테스트 훅 없음)
def widen():
    lab.xdo('keydown', 'alt'); time.sleep(0.15)
    lab.xdo('click', 4); time.sleep(0.25)
    lab.xdo('keyup', 'alt'); time.sleep(0.3)
s.case('E14_altwheel', '#para', box=1, index=1, pre=widen, expect=dict(tag='article'))  # <p> 에서 시작해 부모(카드)로 넓혀짐
runner.finish()
