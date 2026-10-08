"""로컬 회귀 테스트 전체 실행 (외부망 불필요, 진짜 OS 마우스). 하나라도 실패하면 종료 코드 1.
사용: pnpm e2e  (= pnpm build:e2e && python e2e/run_all.py)
      python e2e/run_all.py t_core t_v2   (일부만)
기본은 CDP 모드(실제 마우스를 움직이지 않음, 창은 화면 밖). WC_INPUT=os 면 실제 커서가 움직이고 테스트 창이 가려지면 실패한다.
WC_REAL_CHROME=1 이면 정식 Google Chrome(별도 임시 프로필)으로 (D28)."""
import os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lab, boot  # noqa: E402

ALL = ['t_core', 't_edge1', 't_edge4', 't_edge6', 't_edge8', 't_edge9', 't_sel_final', 't_handle', 't_v2', 't_m1', 't_m4', 't_persist']


def main():
    names = sys.argv[1:] or ALL
    if os.path.exists(lab.REPORTS):
        os.remove(lab.REPORTS)
    boot.boot()
    failed = []
    t_start = time.time()
    env = dict(os.environ, PYTHONIOENCODING='utf-8')
    for n in names:
        print(f'=================== {n}', flush=True)
        try:
            rc = subprocess.run([sys.executable, os.path.join(HERE, n + '.py')], env=env, timeout=420).returncode
        except subprocess.TimeoutExpired:
            rc = 124
        if rc != 0:
            failed.append(f'{n}(rc={rc})')
            if not lab.panel_open():  # 다음 스크립트를 위해 다시 띄움
                boot.boot()
    print('=================== 요약')
    print(f'{len(names)}개 스크립트, {int(time.time() - t_start)}초')
    # 테스트 창은 맨 위 고정 해제
    try:
        import winput
        winput.set_topmost(lab.window_info()['hwnd'], False)
    except Exception:
        pass
    if failed:
        print('FAILED: ' + ' '.join(failed))
        sys.exit(1)
    print('ALL PASS')


if __name__ == '__main__':
    main()
