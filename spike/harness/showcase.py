"""시연 녹화(외부망 필요): 실제 사이트 3곳에서 요소를 끌어 패널에 넣는 장면을 구간별로 녹화 → 이어 붙여 out/web-collage-drag-demo.mp4
GIF 변환: ffmpeg -i out/web-collage-drag-demo.mp4 -vf "fps=9,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse" out/demo.gif"""
import sys, time, subprocess, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab
from runner import Session

OUT = lab.OUT
SEG = []


class Rec:
    def __init__(self, name):
        self.path = os.path.join(OUT, f'seg_{name}.mp4')
        self.p = subprocess.Popen(
            ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '1', '-video_size', '1600x1000',
             '-framerate', '15', '-i', ':99', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', self.path],
            stdin=subprocess.PIPE, env=lab.ENV)
        time.sleep(0.6)

    def stop(self):
        time.sleep(0.3)
        self.p.communicate(b'q', timeout=20)
        SEG.append(self.path)


def human_drag(src, dst, steps=45):
    sx, sy = map(int, src)
    dx, dy = map(int, dst)
    lab.xdo('mousedown', 1)
    time.sleep(0.15)
    for i in range(1, steps + 1):
        t = i / steps
        e = t * t * (3 - 2 * t)
        # 살짝 위로 휘는 궤적
        lab.xdo('mousemove', int(sx + (dx - sx) * e), int(sy + (dy - sy) * e - 60 * (4 * t * (1 - t))))
        time.sleep(0.035)
    time.sleep(0.6)
    lab.xdo('mouseup', 1)


def segment(s, name, url, wait, finder, box):
    s.goto(url, wait=wait)
    info = s.pg.eval("""((el) => { if (!el) return null; document.querySelectorAll('[data-wc-target]').forEach(e => e.removeAttribute('data-wc-target'));
      el.setAttribute('data-wc-target', ''); el.scrollIntoView({block: el.getBoundingClientRect().height > innerHeight * 0.7 ? 'start' : 'center'}); return true; })(%s)""" % finder)
    time.sleep(1.5)
    from real import POINT
    pt = s.pg.eval(POINT)
    if not info or not pt:
        print('skip', name)
        return
    src = (s.offP[0] + pt['x'], s.offP[1] + pt['y'])
    dst = s.dst_point(box) if box == 'new' else s.dst_point(box, 'end')
    lab.xdo('mousemove', 700, 960)
    time.sleep(0.2)
    rec = Rec(name)
    # 천천히 다가가서 하이라이트 보여주기
    for i in range(1, 16):
        lab.xdo('mousemove', int(700 + (src[0] - 700) * i / 15), int(960 + (src[1] - 960) * i / 15))
        time.sleep(0.03)
    time.sleep(1.0)
    t0 = int(time.time() * 1000)
    human_drag(src, dst)
    lab.wait_report(t0, timeout=20)
    s.pn.eval("(() => { const b = [...document.querySelectorAll('.block')].pop(); b.scrollIntoView({block: 'center'}); return 1; })()")
    time.sleep(1.8)
    rec.stop()


s = Session('')
segment(s, 'youtube', 'https://www.youtube.com/results?search_query=lofi+hip+hop', 9, "document.querySelector('ytd-video-renderer')", 0)
segment(s, 'naver', 'https://www.naver.com/', 7, "document.querySelector('.id_health') || [...document.querySelectorAll('[class*=content_area]')].find(e => e.querySelector('img'))", 1)
segment(s, 'coupang', 'https://www.coupang.com/', 8, "(() => { const vis = e => { const r = e.getBoundingClientRect(); return r.width > 220 && r.height > 120 && r.width * r.height < 520000; }; const c = [...document.querySelectorAll('article, section, li, figure, table, div')].filter(e => vis(e) && e.querySelector('img') && (e.innerText || '').trim().length > 30); c.sort((a, b) => { const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return B.width * B.height - A.width * A.height; }); return c[0] || null; })()", 'new')

# 이어 붙이기
lst = os.path.join(OUT, 'segs.txt')
with open(lst, 'w') as f:
    for p in SEG:
        f.write(f"file '{p}'\n")
mp4 = os.path.join(OUT, 'web-collage-drag-demo.mp4')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', mp4], check=True)
print('mp4', mp4, os.path.getsize(mp4))
