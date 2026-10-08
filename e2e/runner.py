"""케이스 실행·합격 판정 (spike/harness/runner.py 를 v2 패널·Windows 용으로 옮긴 것). 합격 기준은 docs/TEST_CASES.md"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab  # noqa: E402
import inputs  # noqa: E402

FAILS = []
PASSES = []


class Session:
    """페이지·패널 CDP 연결 + 입력(inputs.MODE). 좌표는 모두 각 문서의 client(CSS px) 좌표로 다룬다."""

    def __init__(self, url_part='', reset_panel=True, boxes=2):
        self.url_part = url_part
        self.pg, _ = lab.page(url_part)
        self.pn, _ = lab.panel()
        self.inp = inputs.make(self)
        self.off = {'page': (0, 0), 'panel': (0, 0)}
        if reset_panel:
            # 스크립트마다 빈 콜라주(박스 2개)에서 시작 — 앞 테스트가 남긴 블록에 영향받지 않게 [E2E 전용 훅 __wcTest]
            self.pn.eval(f'window.__wcTest.reset({boxes})')
            time.sleep(0.6)
        self.recal()

    def cdp(self, t):
        return self.pg if t == 'page' else self.pn

    def recal(self):
        if self.inp.mode != 'os':
            return
        lab.ensure_front()
        self.off['page'] = lab.calibrate(self.pg, lab.win_point(600, -40))
        self.off['panel'] = lab.calibrate(self.pn, lab.win_point(-80, -120))

    def goto(self, url, wait=2.0):
        self.pg.call('Page.navigate', url=url)
        time.sleep(wait)
        self.pg.close()
        self.pg, _ = lab.page('')
        if self.inp.mode == 'os':
            try:
                self.off['page'] = lab.calibrate(self.pg, lab.win_point(600, -40))
            except RuntimeError:
                pass  # 페이지 전체가 iframe 인 경우: 창 배치가 같으므로 이전 값 사용

    def dst_point(self, box=0, index='end'):
        js = """((box, index) => {
          let boxEl = box === 'new' ? document.querySelector('.new-box') : document.querySelectorAll('.box:not(.new-box)')[box];
          boxEl.scrollIntoView({block: 'center'});
          if (box === 'new') { const r = boxEl.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; }
          const list = boxEl.querySelector(':scope > .blocks'); const blocks = [...list.querySelectorAll(':scope > [data-node-id]')];
          const lr = list.getBoundingClientRect();
          if (!blocks.length) return {x: lr.left + lr.width/2, y: lr.top + lr.height/2};
          if (index === 'end') { const r = blocks[blocks.length-1].getBoundingClientRect(); return {x: r.left + r.width/2, y: Math.min(r.bottom - 8, innerHeight - 20)}; }
          const r = blocks[index].getBoundingClientRect(); return {x: r.left + r.width/2, y: Math.max(r.top + 8, 10)};
        })(%s, %s)""" % (json.dumps(box), json.dumps(index))
        p = self.pn.eval(js)
        time.sleep(0.3)
        p = self.pn.eval(js)
        return (p['x'], p['y'])

    def src_point(self, selector, where='center', mark=False, scroll=True):
        r = lab.rect(self.pg, selector, scroll=scroll, mark=mark)
        if r is None:
            raise RuntimeError('selector not found: ' + selector)
        ih = self.pg.eval('innerHeight')
        if where == 'pad':
            return (r['x'] + 6, r['y'] + min(r['h'] / 2, 200))
        if isinstance(where, tuple):
            if r['y'] + where[1] < 2:
                raise RuntimeError('source point above viewport')
            return (r['x'] + where[0], r['y'] + where[1])
        y = r['y'] + r['h'] / 2
        y = max(min(y, ih - 10), r['y'] + 4)
        return (r['x'] + r['w'] / 2, y)

    def alt_select(self, selector='#para', keep_alt=False):
        """Alt 누른 채 글자 일부를 드래그해서 선택. keep_alt=True 면 (OS 모드) Alt 키를 누른 채로 둔다"""
        r = lab.rect(self.pg, selector, scroll=False)
        x0, y0 = r['x'] + 3, r['y'] + 12
        self.inp.move('page', x0 + 5, y0 + 5)
        time.sleep(0.1)
        self.inp.move('page', x0, y0)
        time.sleep(0.3)
        self.inp.down('page', x0, y0, mods=inputs.ALT)
        time.sleep(0.1)
        x, y = x0, y0
        for i in range(1, 11):
            x, y = x0 + 26 * i, y0 + (27 if i > 8 else 0)
            self.inp.move('page', x, y, buttons=1, mods=inputs.ALT)
            time.sleep(0.03)
        self.inp.up('page', x, y, mods=0 if keep_alt else inputs.ALT)
        time.sleep(0.3)
        return x0, y0

    def drag(self, src, dst, src_t='page', dst_t='panel', **kw):
        """드래그 후 그 뒤 들어온 보고를 기다릴 기준 시각(ms)을 돌려준다"""
        t0 = lab.now_ms()
        self.inp.drag(src_t, src, dst_t, dst, **kw)
        return t0

    def case(self, name, selector, box=0, index='end', where='center', mark=False, pre=None, shot=True, timeout=25, expect=None):
        src = self.src_point(selector, where, mark)
        dst = self.dst_point(box, index)
        t0 = self.drag(src, dst, pre=pre)
        rep = lab.wait_report(t0, timeout=timeout)
        time.sleep(0.8)
        if shot:
            lab.shot(f'case_{name}.png')
        summarize(name, rep)
        check(name, rep, expect or {})
        return rep


def summarize(name, rep):
    if not rep:
        print(f'[{name}] ❌ NO DROP REPORT')
        return None
    m = rep.get('meta') or {}
    st = rep.get('stats') or {}
    loc = rep.get('localize') or {}
    print(f"[{name}] types={rep.get('types')} custom={rep.get('customTypeArrived')} fallback={rep.get('fallbackUsed')} kind={m.get('kind')} tag={m.get('tag')} "
          f"box={rep.get('box')} idx={rep.get('index')} snap={st.get('snapshotMs')}ms nodes={st.get('nodes')} html={st.get('htmlBytes')}B "
          f"drop→visible={rep.get('dropToVisibleMs')}ms wait={rep.get('waitForClipMs')}ms img={rep.get('imgDirect')}→{rep.get('imgFinal')} "
          f"localize={ {k: v for k, v in loc.items() if k != 'failures'} } fails={loc.get('failures')} "
          f"fonts={rep.get('fonts')} fallbacks={rep.get('fallbacks')} err={rep.get('error')} srcDrop={rep.get('sourceDropEffect')} "
          f"sizes={rep.get('sizes')} warn={rep.get('warnings')}")
    return rep


def check(name, rep, expect):
    """합격 기준 확인. expect 키: custom(기본 True) fallback kind tag via isTop images_ok localize_ok via_referer
    fonts_loaded fallbacks_ok max_visible_ms min_html_bytes"""
    reasons = []
    if not rep:
        reasons.append('드롭 보고 없음 (패널에 안 들어옴)')
    else:
        m = rep.get('meta') or {}
        if expect.get('custom', True) and not rep.get('customTypeArrived'):
            reasons.append('번호표(커스텀 MIME) 미도착')
        if expect.get('fallback') and rep.get('fallbackUsed') != 'clip:current':
            reasons.append(f"clip:current 폴백 미사용 ({rep.get('fallbackUsed')})")
        for k in ('kind', 'tag', 'via', 'isTop'):
            if k in expect and m.get(k) != expect[k]:
                reasons.append(f"{k}={m.get(k)!r} (기대 {expect[k]!r})")
        if rep.get('error'):
            reasons.append('error=' + str(rep['error'])[:160])
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
        PASSES.append(name)
        print(f'   → ✅ PASS [{name}]')


def finish():
    print(f"RESULT: {'PASS' if not FAILS else 'FAIL'} ({len(PASSES)}건 통과, {len(FAILS)}건 실패)" + ''.join(f'\n  - {n}: {r}' for n, r in FAILS))
    sys.exit(1 if FAILS else 0)
