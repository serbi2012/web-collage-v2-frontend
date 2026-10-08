"""M3 / S4: 저장과 내보내기
P1  패널 새로고침 후 콜라주 그대로 (이미지·폰트 포함)
P2  브라우저를 껐다 켜도(같은 프로필) 그대로
P3  네트워크 차단 상태에서도 이미지·폰트 정상 (로컬 Blob)
P4  내보낸 HTML: CSP 메타, 에셋 인라인, 오프라인에서 열어도 이미지 보임
※ 마지막에 브라우저를 재시작하므로 run_all.py 에서 맨 끝에 실행한다.
"""
import json, os, sys, time, pathlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab, runner, boot
from runner import Session

RENDER_JS = """(async () => {
  await new Promise(r => setTimeout(r, 1500));
  const hosts = [...document.querySelectorAll('.block .clip')].filter(h => h.shadowRoot);
  const imgs = hosts.flatMap(h => [...h.shadowRoot.querySelectorAll('img')]);
  await Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 3000); })));
  await document.fonts.ready;
  const faces = [...document.fonts].filter(f => /^wc-/.test(f.family.replace(/["']/g, '')));
  await Promise.all(faces.map(f => f.load().catch(() => 0)));
  return { blocks: document.querySelectorAll('.block').length, rendered: hosts.length,
    imgs: imgs.length, imgsOk: imgs.filter(i => i.naturalWidth > 0).length,
    remote: imgs.filter(i => /^https?:/.test(i.getAttribute('src') || '')).length,
    fonts: faces.length, fontsOk: faces.filter(f => f.status === 'loaded').length,
    docId: window.__wcTest.doc().id };
})()"""


def check_render(name, pn, expect_doc=None):
    r = pn.eval(RENDER_JS)
    print(f'[{name}]', r)
    reasons = []
    if not r['rendered'] or r['rendered'] != r['blocks']:
        reasons.append(f"렌더된 블록 {r['rendered']}/{r['blocks']}")
    if not r['imgs'] or r['imgsOk'] != r['imgs']:
        reasons.append(f"이미지 {r['imgsOk']}/{r['imgs']}")
    if r['remote']:
        reasons.append(f"원격 URL 이미지 {r['remote']}개 (로컬화 안 됨)")
    if not r['fontsOk']:
        reasons.append(f"웹폰트 {r['fontsOk']}/{r['fonts']}")
    if expect_doc and r['docId'] != expect_doc:
        reasons.append('다른 콜라주가 열림')
    runner.verdict(name, reasons)
    return r


s = Session('')
s.goto(lab.SERVER + '/index.html')
s.case('P0_setup_card', '#card-news', box=0, where='pad', expect=dict(tag='article', images_ok=True, fonts_loaded=True))
s.case('P0_setup_protected', '#protected', box=1, expect=dict(tag='img', images_ok=True))
s.pn.eval('window.__wcTest.flush()')
doc_id = s.pn.eval('window.__wcTest.doc().id')

# P1 패널 새로고침
s.pn.eval('location.reload(); true')
time.sleep(2.0)
s.pn.close()
s.pn, _ = lab.panel()
check_render('P1_reload_panel', s.pn, doc_id)

# P2 브라우저 재시작 (같은 프로필)
os.environ['KEEP_PROFILE'] = '1'
boot.boot()
pn, _ = lab.panel()
time.sleep(1.5)
check_render('P2_restart_same_profile', pn, doc_id)

# P3 네트워크 차단 + 테스트 서버도 내림
boot.ps("Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -like '*e2e*server.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }")
pn.call('Network.enable')
pn.call('Network.emulateNetworkConditions', offline=True, latency=0, downloadThroughput=-1, uploadThroughput=-1)
pn.call('Page.reload', ignoreCache=True)
time.sleep(2.5)
pn.close()
pn, _ = lab.panel()
pn.call('Network.enable')
pn.call('Network.emulateNetworkConditions', offline=True, latency=0, downloadThroughput=-1, uploadThroughput=-1)
check_render('P3_offline', pn, doc_id)
lab.shot('case_P3_offline.png')

# P4 내보내기
html = pn.eval('window.__wcTest.exportHtml()')
out = pathlib.Path(lab.OUT) / 'export.html'
out.write_text(html, encoding='utf-8')
reasons = []
if "script-src 'none'" not in html:
    reasons.append('CSP 메타 없음')
if '127.0.0.1:8765/img' in html:
    reasons.append('원격 이미지 URL 이 남아 있음')
if 'wc-asset:' in html:
    reasons.append('wc-asset 참조가 남아 있음')
if '<script' in html.lower():
    reasons.append('script 태그 있음')
import urllib.request
with urllib.request.urlopen(f'http://127.0.0.1:{lab.CDP_PORT}/json/version') as resp:
    b = lab.CDP(json.load(resp)['webSocketDebuggerUrl'])
tid = b.call('Target.createTarget', url='about:blank')['targetId']
tab = lab.CDP(lab.find_target(lambda t: t.get('id') == tid)['webSocketDebuggerUrl'])
tab.call('Network.enable')
tab.call('Network.emulateNetworkConditions', offline=True, latency=0, downloadThroughput=-1, uploadThroughput=-1)
tab.call('Page.navigate', url=out.as_uri())
time.sleep(2.5)
r = tab.eval("""(async () => { const hosts = [...document.querySelectorAll('.clip')].filter(h => h.shadowRoot);
  const imgs = hosts.flatMap(h => [...h.shadowRoot.querySelectorAll('img')]);
  await document.fonts.ready;
  return {blocks: document.querySelectorAll('.block').length, shadows: hosts.length, imgs: imgs.length, ok: imgs.filter(i => i.naturalWidth > 0).length,
    fonts: [...document.fonts].filter(f => f.status === 'loaded').length}; })()""")
print('[P4_export_html]', r, f'{len(html) // 1024}KB')
if not r['shadows'] or r['shadows'] != r['blocks']:
    reasons.append(f"Shadow DOM 렌더 {r['shadows']}/{r['blocks']}")
if not r['imgs'] or r['ok'] != r['imgs']:
    reasons.append(f"오프라인 이미지 {r['ok']}/{r['imgs']}")
if not r['fonts']:
    reasons.append('폰트 미로드')
runner.verdict('P4_export_html_offline', reasons)
b.call('Target.closeTarget', targetId=tid)
runner.finish()
