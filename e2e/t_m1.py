"""M1 캡처 엔진 케이스 (testsite/m1.html, quirks.html, spa.html iframe) + 충실도(원본 vs 조각 픽셀 비교)
합격 기준: 케이스별 기대 + 픽셀 차이 비율 ≤ FID_MAX.
(PLAN M1 초기 목표 2% — 측정값은 docs/SPIKE_REPORT.md 에 기록, 기준은 소유자와 조정)"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lab  # noqa: E402
import runner  # noqa: E402
import fidelity  # noqa: E402
from runner import Session  # noqa: E402

FID_MAX = float(os.environ.get('WC_FID_MAX', '0.02'))  # PLAN M1 초기 목표 2%
s = Session('')

# (페이지, 이름, 선택자, 기대)
CASES = [
    ('m1.html', 'M1_tailwind_border', '#tw', {}),
    ('m1.html', 'M1_scroll_container', '#scroller', {}),
    ('m1.html', 'M1_sticky_fixed', '#sticky', {'no_fid': True}),  # fixed 자식: 원본은 화면 구석, 조각은 안쪽 (의도된 차이)
    ('m1.html', 'M1_hover_frozen', '#hover-card', {'not_contains': ['rgb(255, 241, 194)', 'rgb(245, 166, 35)']}),
    ('m1.html', 'M1_dark_ancestor_bg', '#dark-text', {'ancestor': 'rgb(27, 30, 43)'}),
    ('m1.html', 'M1_abs_layout', '#abs-list', {}),
    ('m1.html', 'M1_lazy_image', '#lazy-img', {'contains': ['wc-asset:'], 'no_fid': True}),  # 원본은 자리표시, 조각은 진짜 이미지 (의도된 차이)
    ('m1.html', 'M1_imageset_transform', '#imgset', {}),
    ('m1.html', 'M1_nested_flex_grid', '#nest', {}),
    ('m1.html', 'M1_crossorigin_font', '#xfont', {'fonts': 2}),
    ('quirks.html', 'M1_quirks', '#qbox', {}),
    ('spa.html', 'M1_iframe_content', '#tile-iframe', {'frames_ok': True, 'contains': ['iframe 안 콘텐츠']}),
    ('index.html', 'M1_core_card', '#card-news', {}),
]
results = []
page = None
for pg_name, name, sel, exp in CASES:
    if pg_name != page:
        s.goto(f'{lab.SERVER}/{pg_name}', wait=2.5 if pg_name == 'spa.html' else 2.0)
        page = pg_name
    rep = s.case(name, sel, box='new', where=(4, 4), mark=True, shot=False, expect={})
    # s.case 의 기본 판정은 지우고 아래에서 한 번에
    runner.FAILS[:] = [f for f in runner.FAILS if f[0] != name]
    runner.PASSES[:] = [p for p in runner.PASSES if p != name]
    reasons = []
    if not rep or rep.get('error') or not rep.get('customTypeArrived'):
        runner.verdict(name, [f"드롭 실패 {rep and rep.get('error')}"])
        continue
    cid = rep['meta']['id']
    clip = s.pn.eval(f'window.__wcTest.clip({json.dumps(cid)})') or {}
    text = clip.get('html', '') + clip.get('css', '')
    for t in exp.get('contains', []):
        if t not in text:
            reasons.append(f'"{t}" 없음')
    for t in exp.get('not_contains', []):
        if t in text:
            reasons.append(f'"{t}" 박제됨')
    if 'ancestor' in exp and (rep.get('ancestorBg') or {}).get('color') != exp['ancestor']:
        reasons.append(f"조상 배경 {rep.get('ancestorBg')}")
    if exp.get('frames_ok') and not (rep.get('frames') and all(f.get('ok') for f in rep['frames'])):
        reasons.append(f"iframe 내용 {rep.get('frames')}")
    if 'fonts' in exp and (rep.get('fonts') or {}).get('loaded', 0) < exp['fonts']:
        reasons.append(f"웹폰트 {rep.get('fonts')}")
    fid = None
    if not exp.get('no_fid'):
        fid = fidelity.measure(s.pn, cid, name)
        if 'error' in fid:
            reasons.append('충실도 측정 실패: ' + fid['error'])
        elif fid['ratio'] > FID_MAX:
            reasons.append(f"픽셀 차이 {fid['ratio'] * 100:.1f}% > {FID_MAX * 100:.0f}%")
    st = rep.get('stats') or {}
    fid_txt = f"{fid['ratio'] * 100:.2f}%" if fid and 'ratio' in fid else '-'
    print(f"   {name}: 픽셀 차이 {fid_txt} 스냅샷 {st.get('snapshotMs')}ms 노드 {st.get('nodes')}")
    results.append({'name': name, 'fid': fid, 'snap': st.get('snapshotMs'), 'nodes': st.get('nodes')})
    runner.verdict(name, reasons)
with open(os.path.join(lab.OUT, 'm1_results.json'), 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=1)
runner.finish()
