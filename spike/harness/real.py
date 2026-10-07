"""실제 상용 사이트에서 요소를 진짜 마우스로 끌어 사이드 패널에 넣고 결과를 기록"""
import sys, time, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab
import runner
from runner import Session, summarize
from PIL import Image

# 대상 요소 찾기 (사람이 Alt+휠로 고르는 걸 자동화하기 위한 테스트 훅)
AUTO = """(() => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 220 && r.height > 120 && r.width * r.height < 520000; };
  const c = [...document.querySelectorAll('article, section, li, figure, table, div')].filter(e => vis(e) && e.querySelector('img') && (e.innerText || '').trim().length > 30);
  c.sort((a, b) => { const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return B.width * B.height - A.width * A.height; });
  return c[0] || null; })()"""

SITES = [
    ('react_learn_box', 'https://react.dev/learn', 5,
     "[...document.querySelectorAll('h3,h2,h4')].find(h => h.textContent.trim() === 'You will learn')?.parentElement"),
    ('react_codeblock', None, 0, "document.querySelector('main pre')?.parentElement"),
    ('wikipedia_infobox', 'https://ko.wikipedia.org/wiki/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD', 6, "document.querySelector('table.infobox')"),
    ('mdn_example', 'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/box-shadow', 7,
     "document.querySelector('interactive-example')", 'handle'),
    ('mdn_table', None, 0, "document.querySelector('table.properties, table.standard-table, main table')"),
    ('naver_main', 'https://www.naver.com/', 7, "document.querySelector('.id_health') || [...document.querySelectorAll('[class*=content_area]')].find(e => e.querySelector('img'))"),
    ('youtube_result', 'https://www.youtube.com/results?search_query=lofi+hip+hop', 9, "document.querySelector('ytd-video-renderer')"),
    ('hackernews', 'https://news.ycombinator.com/', 4, "document.querySelector('.athing')?.closest('table')"),
    ('github_readme', 'https://github.com/serbi2012/web-collage-frontend', 7, "document.querySelector('article.markdown-body')"),
    ('naver_blog', 'https://blog.naver.com/naver_diary', 9, 'FRAME'),
    ('brunch', 'https://brunch.co.kr/@sambright/108', 7, "document.querySelector('.wrap_body') || document.querySelector('article')"),
    ('namuwiki', 'https://namu.wiki/w/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD', 8, None),
    ('coupang', 'https://www.coupang.com/', 8, None),
    ('local_bigtable', 'http://127.0.0.1:8765/big.html', 2, "document.querySelector('#big')"),
]

PICK = """((finder) => {
  document.querySelectorAll('[data-wc-target]').forEach(e => e.removeAttribute('data-wc-target'));
  const el = finder;
  if (!el) return null;
  el.setAttribute('data-wc-target', '');
  const tall = el.getBoundingClientRect().height > innerHeight * 0.7;
  el.scrollIntoView({block: tall ? 'start' : 'center', inline: 'nearest'});
  return {tag: el.localName, cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60), tall};
})(%s)"""

POINT = """(() => {
  const el = document.querySelector('[data-wc-target]'); if (!el) return null;
  const r = el.getBoundingClientRect();
  const top = Math.max(r.top, 110), bottom = Math.min(r.bottom, innerHeight - 15), left = Math.max(r.left, 5), right = Math.min(r.right, innerWidth - 5);
  const pts = [];
  for (let iy = 1; iy <= 6; iy++) for (let ix = 1; ix <= 6; ix++) pts.push([left + (right - left) * ix / 7, top + (bottom - top) * iy / 7]);
  let best = null;
  for (const [x, y] of pts) {
    const h = document.elementFromPoint(x, y);
    if (!h || !el.contains(h)) continue;
    const score = (h.closest('a') ? 0 : 2) + (h.localName === 'img' ? 0 : 1);
    if (!best || score > best.score) best = {x, y, score, hit: h.localName};
    if (score === 3) break;
  }
  return best ? Object.assign(best, {rect: {x: r.left, y: r.top, w: r.width, h: r.height}}) : null;
})()"""


def frame_pick(s):
    """네이버 블로그: 본문이 iframe#mainFrame 안에 있음 (같은 출처라 메인에서 접근 가능)"""
    js = """(() => {
      const f = document.querySelector('#mainFrame'); if (!f) return null;
      const d = f.contentDocument; if (!d) return null;
      d.querySelectorAll('[data-wc-target]').forEach(e => e.removeAttribute('data-wc-target'));
      const imgs = [...d.querySelectorAll('.se-main-container .se-component.se-image, .se-main-container .se-component, .post-area .post, .post')].filter(c => c.querySelector('img') && c.getBoundingClientRect().height > 120 && c.getBoundingClientRect().height < 900);
      const el = imgs[0] || d.querySelector('.se-main-container') ; if (!el) return null;
      el.setAttribute('data-wc-target', '');
      el.scrollIntoView({block: 'center'});
      return {tag: el.localName, cls: el.className.slice(0, 60)};
    })()"""
    info = s.pg.eval(js)
    if not info:
        return None, None
    time.sleep(1.2)
    pt = s.pg.eval("""(() => { const f = document.querySelector('#mainFrame'); const fr = f.getBoundingClientRect();
      const el = f.contentDocument.querySelector('[data-wc-target]'); const r = el.getBoundingClientRect();
      return {x: fr.left + r.left + Math.min(40, r.width / 2), y: fr.top + Math.max(r.top + 20, 30) + Math.min(60, r.height / 3), rect: {x: fr.left + r.left, y: fr.top + r.top, w: r.width, h: r.height}, hit: 'frame'}; })()""")
    return info, pt


def panel_crop(s, name):
    """새로 추가된 블록을 '비교' 모드로 펼쳐서 패널 부분만 잘라 저장"""
    s.pn.eval("""(() => { const b = [...document.querySelectorAll('.block')].pop(); b.classList.add('compare'); b.scrollIntoView({block: 'start'}); scrollBy(0, -100); return true; })()""")
    time.sleep(1.0)
    full = lab.shot(f'real_{name}_full.png')
    im = Image.open(full)
    left = int(s.offS[0]) - 10
    im.crop((left, 85, 1600, 1000)).save(os.path.join(lab.OUT, f'real_{name}_panel.png'))


def run(names=None):
    s = Session('')
    results = {}
    for site in SITES:
        name, url, wait, finder = site[:4]
        mode = site[4] if len(site) > 4 else 'press'
        if names and name not in names:
            continue
        print(f'\n=== {name} {url or "(same page)"}')
        try:
            if url:
                s.goto(url, wait=wait)
            title = s.pg.eval('document.title')
            print('   title:', title[:70])
            if finder == 'FRAME':
                info, pt = frame_pick(s)
            else:
                info = s.pg.eval(PICK % (finder or AUTO))
                if not info:
                    print('   ❌ target not found'); results[name] = {'error': 'target not found', 'title': title}; continue
                time.sleep(1.2)
                pt = s.pg.eval(POINT)
            print('   target:', info, '| press at', pt and {k: pt[k] for k in ('x', 'y', 'hit')})
            if not pt:
                results[name] = {'error': 'no visible press point', 'title': title}; continue
            lab.shot(f'real_{name}_page.png')
            src = (s.offP[0] + pt['x'], s.offP[1] + pt['y'])
            dst = s.dst_point('new')
            t0 = int(time.time() * 1000)
            if mode == 'handle':
                # 요소 위에 올려 하이라이트한 뒤, 라벨(손잡이)을 잡고 끌기
                r = pt['rect']; ih = s.pg.eval('innerHeight')
                ltop = r['y'] - 20 if r['y'] > 20 else min(r['y'] + r['h'] + 2, ih - 20)
                hx, hy = int(s.offP[0] + max(0, r['x']) + 30), int(s.offP[1] + ltop + 10)
                lab.xdo('mousemove', 940, 95); time.sleep(0.2)
                lab.xdo('mousemove', int(src[0]), int(src[1])); time.sleep(0.5)
                lab.xdo('mousemove', hx, hy); time.sleep(0.4)
                lab.xdo('mousedown', 1); time.sleep(0.12)
                for i in range(1, 29):
                    lab.xdo('mousemove', hx + (int(dst[0]) - hx) * i // 28, hy + (int(dst[1]) - hy) * i // 28); time.sleep(0.03)
                time.sleep(0.4); lab.xdo('mouseup', 1)
            else:
                lab.drag(src, dst)
            rep = summarize(name, lab.wait_report(t0, timeout=45))
            runner.check(name, rep, {})
            if rep:
                panel_crop(s, name)
            results[name] = {'title': title, 'target': info, 'report': rep}
        except Exception as e:
            print('   ❌ exception', e)
            results[name] = {'error': str(e)[:300]}
            try:
                lab.reset_window()
            except Exception:
                pass
    with open(os.path.join(lab.OUT, 'real_results.json'), 'a') as f:
        f.write(json.dumps(results, ensure_ascii=False) + '\n')
    return results


if __name__ == '__main__':
    run(sys.argv[1:] or None)
    runner.finish()
