"""스냅샷 CPU 프로파일 (E2E 빌드 bench 훅 + CDP Profiler). 사용: python e2e/profile_snapshot.py [page] [selector]"""
import collections, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab
page = sys.argv[1] if len(sys.argv) > 1 else 'big.html'
sel = sys.argv[2] if len(sys.argv) > 2 else '#big'
pg, _ = lab.page('')
pg.call('Page.navigate', url=f'{lab.SERVER}/{page}')
time.sleep(2)
pg.close(); pg, _ = lab.page('')
pg.eval("window.__benchRes = []; addEventListener('message', e => { if (e.data && e.data.__wcBench) window.__benchRes.push(e.data.__wcBench); }); true")
pg.call('Profiler.enable'); pg.call('Profiler.setSamplingInterval', interval=200); pg.call('Profiler.start')
pg.eval(f"window.postMessage({{__wc: 'bench', selector: {json.dumps(sel)}}}, '*'); true")
for _ in range(300):
    if pg.eval('window.__benchRes.length'):
        break
    time.sleep(0.1)
prof = pg.call('Profiler.stop')['profile']
print(pg.eval('window.__benchRes'))
nodes = {n['id']: n for n in prof['nodes']}
dt = prof['timeDeltas']; samples = prof['samples']
self_t = collections.Counter()
for sid, d in zip(samples, dt):
    cf = nodes[sid]['callFrame']
    self_t[(cf['functionName'] or '(anon)') + ' ' + cf['url'].split('/')[-1] + ':' + str(cf['lineNumber'])] += d
tot = sum(self_t.values())
for k, v in self_t.most_common(15):
    print(f'{v/1000:8.1f}ms {100*v/tot:5.1f}%  {k}')
