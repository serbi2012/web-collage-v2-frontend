import os
import sys, time, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import lab
url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/index.html'
print(subprocess.run([os.path.join(os.path.dirname(os.path.abspath(__file__)), 'start.sh'), url], capture_output=True, text=True).stdout[:200])
time.sleep(2.5)
for _ in range(2):
    lab.xdo('mousemove', 1572, 112); lab.xdo('click', 1); time.sleep(0.4)
lab.xdo('mousemove', 700, 900); lab.xdo('click', 1); time.sleep(0.3)
lab.xdo('key', 'alt+shift+k'); time.sleep(1.5)
print([t['url'][:60] for t in lab.targets()])
# 패널 폭 넓히기 (620px)
pn, _ = lab.panel()
lab.xdo('mousemove', 1222, 600); time.sleep(0.3); lab.xdo('mousedown', 1); time.sleep(0.1)
for x in range(1222, 949, -13): lab.xdo('mousemove', x, 600); time.sleep(0.02)
lab.xdo('mouseup', 1); time.sleep(0.8)
print('panel width', pn.eval('innerWidth'))
