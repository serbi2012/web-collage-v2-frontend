"""Windows 용 진짜 OS 입력: SendInput 으로 마우스·키보드 이벤트를 보낸다 (spike 의 xdotool 대체, D14).
CDP 의 Input.dispatchDragEvent 나 Playwright 드래그는 페이지 → 사이드 패널(다른 WebContents) 경계를 못 넘으므로 쓰지 않는다.
SendInput 은 OS 입력 큐에 들어가서 크롬이 진짜 OLE 드래그 세션(DoDragDrop)을 만든다."""
import ctypes
import time
from ctypes import wintypes

user32 = ctypes.WinDLL('user32', use_last_error=True)
try:  # 좌표를 물리 픽셀로 (배율 100%가 아니어도 맞게)
    ctypes.WinDLL('shcore').SetProcessDpiAwareness(2)
except Exception:
    try:
        user32.SetProcessDPIAware()
    except Exception:
        pass

INPUT_MOUSE, INPUT_KEYBOARD = 0, 1
MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_WHEEL = 0x0800
MOUSEEVENTF_VIRTUALDESK = 0x4000
MOUSEEVENTF_ABSOLUTE = 0x8000
KEYEVENTF_KEYUP = 0x0002
ULONG_PTR = ctypes.c_size_t


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [('dx', wintypes.LONG), ('dy', wintypes.LONG), ('mouseData', wintypes.DWORD),
                ('dwFlags', wintypes.DWORD), ('time', wintypes.DWORD), ('dwExtraInfo', ULONG_PTR)]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [('wVk', wintypes.WORD), ('wScan', wintypes.WORD), ('dwFlags', wintypes.DWORD),
                ('time', wintypes.DWORD), ('dwExtraInfo', ULONG_PTR)]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [('uMsg', wintypes.DWORD), ('wParamL', wintypes.WORD), ('wParamH', wintypes.WORD)]


class _U(ctypes.Union):
    _fields_ = [('mi', MOUSEINPUT), ('ki', KEYBDINPUT), ('hi', HARDWAREINPUT)]


class INPUT(ctypes.Structure):
    _anonymous_ = ('u',)
    _fields_ = [('type', wintypes.DWORD), ('u', _U)]


def _send(*inputs):
    arr = (INPUT * len(inputs))(*inputs)
    n = user32.SendInput(len(inputs), arr, ctypes.sizeof(INPUT))
    if n != len(inputs):
        raise OSError(f'SendInput failed: {ctypes.get_last_error()}')


def _vd():
    return (user32.GetSystemMetrics(76), user32.GetSystemMetrics(77), user32.GetSystemMetrics(78), user32.GetSystemMetrics(79))


def move(x, y):
    vx, vy, vw, vh = _vd()
    nx = int(round((x - vx) * 65535 / (vw - 1)))
    ny = int(round((y - vy) * 65535 / (vh - 1)))
    i = INPUT(type=INPUT_MOUSE)
    i.mi = MOUSEINPUT(nx, ny, 0, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, 0, 0)
    _send(i)


def down():
    i = INPUT(type=INPUT_MOUSE)
    i.mi = MOUSEINPUT(0, 0, 0, MOUSEEVENTF_LEFTDOWN, 0, 0)
    _send(i)


def up():
    i = INPUT(type=INPUT_MOUSE)
    i.mi = MOUSEINPUT(0, 0, 0, MOUSEEVENTF_LEFTUP, 0, 0)
    _send(i)


def click(x=None, y=None):
    if x is not None:
        move(x, y)
        time.sleep(0.05)
    down()
    time.sleep(0.05)
    up()


def wheel(clicks=1):
    """양수 = 위로 굴리기 (deltaY < 0)"""
    i = INPUT(type=INPUT_MOUSE)
    i.mi = MOUSEINPUT(0, 0, ctypes.c_uint32(120 * clicks).value, MOUSEEVENTF_WHEEL, 0, 0)
    _send(i)


VK = {'alt': 0x12, 'shift': 0x10, 'ctrl': 0x11, 'esc': 0x1B, 'z': 0x5A, 'y': 0x59, 'k': 0x4B}


def key_down(name):
    i = INPUT(type=INPUT_KEYBOARD)
    i.ki = KEYBDINPUT(VK[name], 0, 0, 0, 0)
    _send(i)


def key_up(name):
    i = INPUT(type=INPUT_KEYBOARD)
    i.ki = KEYBDINPUT(VK[name], 0, KEYEVENTF_KEYUP, 0, 0)
    _send(i)


def cursor():
    p = wintypes.POINT()
    user32.GetCursorPos(ctypes.byref(p))
    return p.x, p.y


# ---------------------------------------------------------------- 창 다루기
WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


def windows_of_pid(pid, include_hidden=False):
    out = []

    def cb(hwnd, _):
        p = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(p))
        if p.value == pid and (include_hidden or user32.IsWindowVisible(hwnd)):
            buf = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, buf, 256)
            if buf.value == 'Chrome_WidgetWin_1' and user32.GetWindowTextLengthW(hwnd) > 0:
                out.append(hwnd)
        return True

    user32.EnumWindows(WNDENUMPROC(cb), 0)
    return out


def window_rect(hwnd):
    r = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return r.left, r.top, r.right, r.bottom


def set_topmost(hwnd, on=True):
    HWND_TOPMOST, HWND_NOTOPMOST = -1, -2
    SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW = 0x2, 0x1, 0x40
    user32.SetWindowPos(hwnd, HWND_TOPMOST if on else HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)


def foreground(hwnd):
    """창을 맨 앞으로. SetForegroundWindow 가 거부되면(포그라운드 잠금) 호출하는 쪽이 창 안을 한 번 클릭해서 활성화한다."""
    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    set_topmost(hwnd, True)
    return bool(user32.SetForegroundWindow(hwnd))


def owns_point(hwnd, x, y):
    """화면의 (x, y) 를 실제로 이 창이 받는지 (다른 창이 덮고 있으면 False)"""
    user32.WindowFromPoint.argtypes = [wintypes.POINT]
    user32.WindowFromPoint.restype = wintypes.HWND
    user32.GetAncestor.restype = wintypes.HWND
    w = user32.WindowFromPoint(wintypes.POINT(int(x), int(y)))
    return bool(w) and user32.GetAncestor(w, 2) == hwnd


def capture_window(hwnd):
    """PrintWindow(PW_RENDERFULLCONTENT) 로 이 창의 내용만 캡처 — 겹친 다른 앱 화면이 찍히지 않는다"""
    from PIL import Image
    gdi32 = ctypes.WinDLL('gdi32')
    l, t, r, b = window_rect(hwnd)
    w, h = r - l, b - t
    hdc = user32.GetWindowDC(hwnd)
    mdc = gdi32.CreateCompatibleDC(hdc)
    bmp = gdi32.CreateCompatibleBitmap(hdc, w, h)
    gdi32.SelectObject(mdc, bmp)
    user32.PrintWindow(hwnd, mdc, 2)

    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [('biSize', wintypes.DWORD), ('biWidth', wintypes.LONG), ('biHeight', wintypes.LONG), ('biPlanes', wintypes.WORD),
                    ('biBitCount', wintypes.WORD), ('biCompression', wintypes.DWORD), ('biSizeImage', wintypes.DWORD),
                    ('biXPelsPerMeter', wintypes.LONG), ('biYPelsPerMeter', wintypes.LONG), ('biClrUsed', wintypes.DWORD), ('biClrImportant', wintypes.DWORD)]
    bi = BITMAPINFOHEADER(ctypes.sizeof(BITMAPINFOHEADER), w, -h, 1, 32, 0, 0, 0, 0, 0, 0)
    buf = ctypes.create_string_buffer(w * h * 4)
    gdi32.GetDIBits(mdc, bmp, 0, h, buf, ctypes.byref(bi), 0)
    gdi32.DeleteObject(bmp)
    gdi32.DeleteDC(mdc)
    user32.ReleaseDC(hwnd, hdc)
    return Image.frombuffer('RGBA', (w, h), buf, 'raw', 'BGRA', 0, 1).convert('RGB')
