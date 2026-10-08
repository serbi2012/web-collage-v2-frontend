"""스냅샷 성능 측정 (E2E 빌드의 bench 훅). 사용: python e2e/bench.py [반복 수]
페이지 메인 스레드 최대 연속 점유는 Long Task(>50ms) 관찰로 잰다 (PLAN §11: ≤ 100ms). 없으면 "<50ms"."""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab, boot

N = int(sys.argv[1]) if len(sys.argv) > 1 else 3
CASES = [('big.html', '#big', 'E13 큰 표 (요소 ~7,100)'), ('index.html', '#card-news', 'CORE 카드'), ('big.html', '#big-title', '제목 1개')]
boot.boot()
pg, _ = lab.page('')
out = []
for page, sel, name in CASES:
    pg.call('Page.navigate', url=f'{lab.SERVER}/{page}')
    time.sleep(2)
    pg.close(); pg, _ = lab.page('')
    pg.eval("window.__benchRes = []; window.__lt = []; new PerformanceObserver(l => l.getEntries().forEach(e => __lt.push(Math.round(e.duration)))).observe({type: 'longtask'}); addEventListener('message', e => { if (e.data && e.data.__wcBench) window.__benchRes.push(e.data.__wcBench); }); true")
    time.sleep(0.5)
    for i in range(N):
        pg.eval(f"window.postMessage({{__wc: 'bench', selector: {json.dumps(sel)}}}, '*'); true")
        for _ in range(200):
            if pg.eval('window.__benchRes.length') > i:
                break
            time.sleep(0.1)
    res = pg.eval('window.__benchRes')
    lt = pg.eval('window.__lt')
    ms = sorted(r['ms'] for r in res)
    print(f"{name}: 중앙값 {ms[len(ms)//2]}ms (전체 {ms}) nodes={res[0]['nodes']} props={res[0]['props']} 최대 연속 점유 {str(max(lt)) + 'ms' if lt else '<50ms'}")
