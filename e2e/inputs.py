"""입력 방식 두 가지 (WC_INPUT 환경변수)

cdp (기본) — 실제 마우스를 움직이지 않는다.
    CDP Input.dispatchMouseEvent 로 페이지에 마우스 입력을 넣으면 크롬이 **진짜 dragstart** 를 만든다.
    Input.setInterceptDrags 로 그 드래그 데이터(우리 번호표 MIME 포함)를 가로채서
    사이드 패널 문서에 Input.dispatchDragEvent 로 dragenter/dragover/drop 을 넣는다 → 패널은 **진짜 drop 이벤트**를 받는다.
    건너뛰는 것: OS 가 드래그를 다른 WebContents 로 넘겨주는 단계(DoDragDrop) 하나뿐.

os — 실제 OS 마우스 입력(SendInput). 페이지 → 패널 경계를 OS 가 실제로 넘겨주는지 확인할 때만 (D14, PLAN M0 Windows 확인).
    실행 중에는 실제 커서가 움직이고 테스트 창이 맨 위에 고정된다.
"""
import os
import time

import lab

MODE = os.environ.get('WC_INPUT', 'cdp')
ALT, CTRL, SHIFT = 1, 2, 8  # CDP modifiers 비트


class CdpInput:
    mode = 'cdp'

    def __init__(self, session):
        self.s = session

    def _c(self, t):
        return self.s.cdp(t)

    def move(self, t, x, y, buttons=0, mods=0):
        self._c(t).call('Input.dispatchMouseEvent', type='mouseMoved', x=x, y=y, buttons=buttons, modifiers=mods,
                        button='left' if buttons else 'none')

    def down(self, t, x, y, mods=0):
        self._c(t).call('Input.dispatchMouseEvent', type='mousePressed', x=x, y=y, button='left', buttons=1, clickCount=1, modifiers=mods)

    def up(self, t, x, y, mods=0):
        self._c(t).call('Input.dispatchMouseEvent', type='mouseReleased', x=x, y=y, button='left', buttons=0, clickCount=1, modifiers=mods)

    def click(self, t, x, y):
        self.move(t, x, y)
        self.down(t, x, y)
        self.up(t, x, y)

    def wheel_up(self, t, x, y, mods=0):
        self._c(t).call('Input.dispatchMouseEvent', type='mouseWheel', x=x, y=y, deltaX=0, deltaY=-120, modifiers=mods)

    def key(self, t, key, kind, mods=0):
        codes = {'Alt': ('AltLeft', 18), 'Control': ('ControlLeft', 17), 'Shift': ('ShiftLeft', 16), 'z': ('KeyZ', 90), 'Escape': ('Escape', 27)}
        code, vk = codes[key]
        p = dict(type=kind, key=key, code=code, windowsVirtualKeyCode=vk, nativeVirtualKeyCode=vk, modifiers=mods)
        if kind == 'keyDown' and len(key) == 1:
            p['type'] = 'rawKeyDown'
        self._c(t).call('Input.dispatchKeyEvent', **p)

    def hotkey(self, t, *keys):
        """예: hotkey('panel', 'Control', 'Shift', 'z')"""
        bits = {'Alt': ALT, 'Control': CTRL, 'Shift': SHIFT}
        mods = 0
        for k in keys:
            self.key(t, k, 'keyDown', mods)
            mods |= bits.get(k, 0)
        for k in reversed(keys):
            mods &= ~bits.get(k, 0)
            self.key(t, k, 'keyUp', mods)

    def drag(self, src_t, src, dst_t, dst, pre=None, settle=0.4, mods=0, overs=6, hold=0.0, over_fn=None, approach=True, via=None):
        """src_t 문서의 src 에서 잡아 dst_t 문서의 dst 에 놓는다. 드래그가 시작되지 않으면 False.
        via: [(x, y, 횟수, 멈춤조건|None)] 놓기 전에 머물 지점들 (자동 스크롤 등). dst 는 놓는 순간 계산하는 함수여도 된다"""
        S, D = self._c(src_t), self._c(dst_t)
        S.call('Input.setInterceptDrags', enabled=True)
        S.events.clear()
        sx, sy = src
        if approach:  # 비스듬히 들어와서 hover 가 새로 계산되게 (손잡이 드래그는 현재 대상을 유지해야 하므로 끔)
            self.move(src_t, sx - 40, sy - 40)
        self.move(src_t, sx, sy)  # hover → 하이라이트/무장
        time.sleep(settle)
        if pre:
            pre()
        self.down(src_t, sx, sy, mods)
        time.sleep(0.05)
        ev = None
        for i in range(1, 9):  # 드래그 시작 임계값(몇 px)을 넘게 움직인다
            S.call('Input.dispatchMouseEvent', type='mouseMoved', x=sx + 4 * i, y=sy + 2 * i, button='left', buttons=1, modifiers=mods)
            ev = S.wait_event('Input.dragIntercepted', 0.15)
            if ev:
                break
        if not ev:
            ev = S.wait_event('Input.dragIntercepted', 1.0)
        if not ev:
            self.up(src_t, sx + 32, sy + 16, mods)
            S.call('Input.setInterceptDrags', enabled=False)
            return False
        data = ev['data']
        first = via[0][:2] if via else (dst() if callable(dst) else dst)
        D.call('Input.dispatchDragEvent', type='dragEnter', x=first[0], y=first[1], data=data, modifiers=mods)
        for vx, vy, n, stop in via or []:
            for _ in range(n):
                D.call('Input.dispatchDragEvent', type='dragOver', x=vx, y=vy, data=data, modifiers=mods)
                time.sleep(0.05)
                if stop and stop():
                    break
        dx, dy = dst() if callable(dst) else dst
        for i in range(overs):
            D.call('Input.dispatchDragEvent', type='dragOver', x=dx, y=dy, data=data, modifiers=mods)
            if over_fn:
                over_fn(i)
            time.sleep(0.05)
        if hold:
            time.sleep(hold)
        D.call('Input.dispatchDragEvent', type='drop', x=dx, y=dy, data=data, modifiers=mods)
        # 원본 쪽 드래그 끝내기 (dragend 는 drop 보다 늦게 온다 — clip:current 폴백의 전제)
        try:
            S.call('Input.dispatchDragEvent', type='dragCancel', x=sx, y=sy, data=data)
        except RuntimeError:
            pass
        self.up(src_t, sx, sy, mods)
        S.call('Input.setInterceptDrags', enabled=False)
        return True


class OsInput:
    """실제 OS 마우스 (client 좌표 → 화면 좌표는 Session 의 보정값으로)"""
    mode = 'os'

    def __init__(self, session):
        import winput
        self.w = winput
        self.s = session

    def _xy(self, t, x, y):
        ox, oy = self.s.off[t]
        return int(ox + x), int(oy + y)

    def move(self, t, x, y, buttons=0, mods=0):
        self.w.move(*self._xy(t, x, y))

    def down(self, t, x, y, mods=0):
        self.move(t, x, y)
        if mods & ALT:
            self.w.key_down('alt')
        self.w.down()

    def up(self, t, x, y, mods=0):
        self.w.up()
        if mods & ALT:
            self.w.key_up('alt')

    def click(self, t, x, y):
        lab.ensure_front()
        self.w.click(*self._xy(t, x, y))

    def wheel_up(self, t, x, y, mods=0):
        self.move(t, x, y)
        if mods & ALT:
            self.w.key_down('alt')
            time.sleep(0.15)
        self.w.wheel(1)
        time.sleep(0.25)
        if mods & ALT:
            self.w.key_up('alt')
            time.sleep(0.3)

    def key(self, t, key, kind, mods=0):
        name = {'Alt': 'alt', 'Control': 'ctrl', 'Shift': 'shift', 'z': 'z', 'Escape': 'esc'}[key]
        (self.w.key_down if kind == 'keyDown' else self.w.key_up)(name)

    def hotkey(self, t, *keys):
        for k in keys:
            self.key(t, k, 'keyDown')
            time.sleep(0.05)
        for k in reversed(keys):
            self.key(t, k, 'keyUp')
            time.sleep(0.05)

    def drag(self, src_t, src, dst_t, dst, pre=None, settle=0.5, mods=0, overs=6, hold=0.35, over_fn=None, approach=True, via=None):
        lab.ensure_front()
        sx, sy = self._xy(src_t, *src)
        t0 = lab.now_ms()
        if approach:
            self.w.move(sx - 40, sy - 40)
            time.sleep(0.1)
            self.w.move(*lab.win_point(800, 62))  # 페이지 밖(주소창 쪽)으로 한 번 나갔다가 다시 들어와 hover 재계산
            time.sleep(0.15)
        self.w.move(sx, sy)
        time.sleep(settle)
        if pre:
            pre()
        if mods & ALT:
            self.w.key_down('alt')
        self.w.down()
        time.sleep(0.12)
        cur = (sx, sy)
        for vx, vy, n, stop in via or []:
            p = self._xy(dst_t, vx, vy)
            for x, y in lab.ease_path(cur, p, 20):
                self.w.move(x, y)
                time.sleep(0.025)
            cur = p
            for k in range(n):  # 같은 자리에 머물러도 크롬은 dragover 를 계속 보낸다 (1px 흔들어 확실히)
                self.w.move(p[0] + (k % 2), p[1])
                time.sleep(0.06)
                if stop and stop():
                    break
        dx, dy = self._xy(dst_t, *(dst() if callable(dst) else dst))
        for x, y in lab.ease_path(cur, (dx, dy), 28 if not via else 10):
            self.w.move(x, y)
            time.sleep(0.025)
        for i in range(overs if over_fn else 0):
            self.w.move(dx + (i % 2), dy)
            over_fn(i)
            time.sleep(0.06)
        time.sleep(hold)
        self.w.up()
        if mods & ALT:
            self.w.key_up('alt')
        return t0


def make(session):
    return OsInput(session) if MODE == 'os' else CdpInput(session)
