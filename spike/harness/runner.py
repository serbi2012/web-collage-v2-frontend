import os
import sys, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import lab

FAILS = []


class Session:
    def __init__(self, url_part='', reset_panel=True):
        self.url_part = url_part
        self.pg, _ = lab.page(url_part)
        self.pn, _ = lab.panel()
        if reset_panel:
            # 스크립트마다 빈 패널에서 시작 (앞 테스트가 남긴 블록에 영향받지 않게)
            self.pn.eval('location.reload(); true')
            time.sleep(1.5)
        self.recal()

    def recal(self):
        self.offP = lab.calibrate(self.pg, (600, 960))
        self.offS = lab.calibrate(self.pn, (1300, 900))

    def goto(self, url, wait=2.0):
        self.pg.call('Page.navigate', url=url)
        time.sleep(wait)
        self.pg.close()
        self.pg, _ = lab.page('')
        try:
            self.offP = lab.calibrate(self.pg, (600, 960))
        except RuntimeError:
            pass  # 페이지 전체가 iframe 인 경우(네이버 블로그 등): 창 배치가 같으므로 이전 값 사용

    def dst_point(self, box=0, index='end'):
        js = """((box, index) => {
          let boxEl = box === 'new' ? document.querySelector('.new-box') : document.querySelectorAll('.box:not(.new-box)')[box];
          boxEl.scrollIntoView({block: 'center'});
          if (box === 'new') { const r = boxEl.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; }
          const list = boxEl.querySelector('.blocks'); const blocks = [...list.querySelectorAll(':scope > .block')];
          const lr = list.getBoundingClientRect();
          if (!blocks.length) return {x: lr.left + lr.width/2, y: lr.top + lr.height/2};
          if (index === 'end') { const r = blocks[blocks.length-1].getBoundingClientRect(); return {x: r.left + r.width/2, y: Math.min(r.bottom - 8, innerHeight - 20)}; }
          const r = blocks[index].getBoundingClientRect(); return {x: r.left + r.width/2, y: Math.max(r.top + 8, 10)};
        })(%s, %s)""" % (json.dumps(box), json.dumps(index))
        p = self.pn.eval(js)
        time.sleep(0.3)
        p = self.pn.eval(js)
        return (self.offS[0] + p['x'], self.offS[1] + p['y'])

    def src_point(self, selector, where='center', mark=False, scroll=True):
        r = lab.rect(self.pg, selector, scroll=scroll, mark=mark)
        if r is None:
            raise RuntimeError('selector not found: ' + selector)
        if where == 'pad':
            return (self.offP[0] + r['x'] + 6, self.offP[1] + r['y'] + min(r['h'] / 2, 200))
        if isinstance(where, tuple):
            pt = (self.offP[0] + r['x'] + where[0], self.offP[1] + r['y'] + where[1])
            if pt[1] < self.offP[1] + 2:
                raise RuntimeError('source point above viewport: %r' % (pt,))
            return pt
        y = r['y'] + r['h'] / 2
        y = max(min(y, 900 - 87 - 10), r['y'] + 4)
        return (self.offP[0] + r['x'] + r['w'] / 2, self.offP[1] + y)

    def case(self, name, selector, box=0, index='end', where='center', mark=False, pre=None, shot=True, timeout=25, expect=None):
        src = self.src_point(selector, where, mark)
        dst = self.dst_point(box, index)
        t0 = int(time.time() * 1000)
        lab.drag(src, dst, pre=pre)
        rep = lab.wait_report(t0, timeout=timeout)
        time.sleep(0.8)
        if shot:
            lab.shot(f'case_{name}.png')
        summarize(name, rep)
        check(name, rep, expect or {})
        return rep


def summarize(name, rep):
    if not rep:
        print(f'[{name}] ❌ NO DROP REPORT'); return None
    m = rep.get('meta') or {}
    st = rep.get('stats') or {}
    print(f"[{name}] types={rep['types']} custom={rep.get('customTypeArrived')} kind={m.get('kind')} tag={m.get('tag')} "
          f"box={rep.get('box')} idx={rep.get('index')} snap={st.get('snapshotMs')}ms nodes={st.get('nodes')} html={st.get('htmlBytes')}B "
          f"drop→visible={rep.get('dropToVisibleMs')}ms wait={rep.get('waitForClipMs')}ms img={rep.get('imgDirect')}→{rep.get('imgFinal')} "
          f"localize={ {k: v for k, v in (rep.get('localize') or {}).items() if k != 'failures'} } fails={(rep.get('localize') or {}).get('failures')} "
          f"fonts={rep.get('fonts')} fallbacks={rep.get('fallbacks')} err={rep.get('error')} srcDrop={rep.get('sourceDropEffect')} "
          f"sizes={rep.get('sizes')} warn={rep.get('warnings')}")
    return rep


def check(name, rep, expect):
    """합격 기준 확인. expect 키: custom(기본 True) kind tag via isTop images_ok localize_ok via_referer
    fonts_loaded fallbacks_ok max_visible_ms min_html_bytes"""
    reasons = []
    if not rep:
        reasons.append('드롭 보고 없음 (패널에 안 들어옴)')
    else:
        m = rep.get('meta') or {}
        if expect.get('custom', True) and not rep.get('customTypeArrived'):
            reasons.append('번호표(커스텀 MIME) 미도착')
        for k in ('kind', 'tag', 'via', 'isTop'):
            if k in expect and m.get(k) != expect[k]:
                reasons.append(f"{k}={m.get(k)!r} (기대 {expect[k]!r})")
        if rep.get('error'):
            reasons.append('error=' + str(rep['error'])[:100])
        if expect.get('images_ok'):
            fin = rep.get('imgFinal') or rep.get('imgDirect') or {}
            if not fin.get('total') or fin.get('ok') != fin.get('total'):
                reasons.append(f'이미지 {fin}')
        loc = rep.get('localize') or {}
        if expect.get('localize_ok') and loc.get('fail'):
            reasons.append(f"로컬화 실패 {loc.get('fail')}건 {loc.get('failures')}")
        if expect.get('via_referer') and not loc.get('viaReferer'):
            reasons.append('Referer 재시도로 받은 이미지 없음')
        if expect.get('fonts_loaded') and not (rep.get('fonts') or {}).get('loaded'):
            reasons.append(f"웹폰트 미로드 {rep.get('fonts')}")
        if expect.get('fallbacks_ok'):
            fb = rep.get('fallbacks') or []
            if not fb or not all(f.get('ok') for f in fb):
                reasons.append(f'대체 이미지 {fb}')
        if 'max_visible_ms' in expect and (rep.get('dropToVisibleMs') or 1e9) > expect['max_visible_ms']:
            reasons.append(f"드롭→표시 {rep.get('dropToVisibleMs')}ms > {expect['max_visible_ms']}ms")
        if 'min_html_bytes' in expect and (rep.get('sizes') or {}).get('text/html', 0) < expect['min_html_bytes']:
            reasons.append(f"text/html {(rep.get('sizes') or {}).get('text/html')}B < {expect['min_html_bytes']}B")
    verdict(name, reasons)


def verdict(name, reasons):
    if reasons:
        FAILS.append((name, reasons))
        print(f'   → ❌ FAIL [{name}]: ' + '; '.join(reasons))
    else:
        print(f'   → ✅ PASS [{name}]')


def finish():
    import sys as _sys
    print(f"RESULT: {'PASS' if not FAILS else 'FAIL'} ({len(FAILS)}건 실패)" + ''.join(f'\n  - {n}: {r}' for n, r in FAILS))
    _sys.exit(1 if FAILS else 0)
