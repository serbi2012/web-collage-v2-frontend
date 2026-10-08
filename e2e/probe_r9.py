"""R9 조사: 스크랩 모드에서 이미지를 끌 때 드래그 데이터에 파일(Files)이 붙는지 + 페이지 업로드 드롭존에 놓으면 반응하는지"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab, boot
from runner import Session
boot.boot(lab.SERVER + '/m1.html')
s = Session('m1.html', reset_panel=True)
s.goto(lab.SERVER + '/m1.html')
pg = s.pg
src = s.src_point('#dz-img')
dz = s.src_point('#dropzone')
pg.call('Input.setInterceptDrags', enabled=True); pg.events.clear()
s.inp.move('page', src[0] - 30, src[1] - 30); s.inp.move('page', *src); time.sleep(0.4)
s.inp.down('page', *src)
ev = None
for i in range(1, 10):
    pg.call('Input.dispatchMouseEvent', type='mouseMoved', x=src[0] + 4 * i, y=src[1] + 2 * i, button='left', buttons=1)
    ev = pg.wait_event('Input.dragIntercepted', 0.2)
    if ev: break
data = ev['data']
print('items:', [(i['mimeType'], len(i['data'])) for i in data['items']], 'files:', data.get('files'), 'fileContents?', 'filenames' in data)
for t in ('dragEnter', 'dragOver', 'drop'):
    pg.call('Input.dispatchDragEvent', type=t, x=dz[0], y=dz[1], data=data)
s.inp.up('page', *dz)
pg.call('Input.setInterceptDrags', enabled=False)
time.sleep(0.5)
print('dropzone saw:', pg.eval('window.__dz'))
