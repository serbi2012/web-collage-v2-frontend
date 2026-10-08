// 하이라이트 오버레이 — 페이지 레이아웃·스타일에 영향을 주지 않도록 closed Shadow DOM + position:fixed (PLAN §6.1)

export const OVERLAY_TAG = 'wc-overlay';

export interface Overlay {
  host: HTMLElement;
  box: HTMLDivElement;
  label: HTMLDivElement;
}

const CSS = `
.box{position:fixed;box-sizing:border-box;border:2px solid #ff5a5f;background:rgba(255,90,95,.08);
     border-radius:3px;pointer-events:none;display:none}
.label{position:fixed;font:600 11px/20px system-ui,sans-serif;color:#fff;background:#ff5a5f;
       padding:0 8px 0 6px;border-radius:4px;pointer-events:auto;display:none;white-space:nowrap;
       cursor:grab;-webkit-user-drag:element;user-select:none}
.label::before{content:"⠿ ";opacity:.85}`;

export function createOverlay(): Overlay {
  const host = document.createElement(OVERLAY_TAG);
  host.style.cssText = 'all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const box = document.createElement('div');
  box.className = 'box';
  const label = document.createElement('div');
  label.className = 'label';
  // [G2] 라벨 자체가 draggable 손잡이: 편집 가능한 영역(코드 에디터 등)처럼 크롬이 드래그를 시작하지 않는 곳의 대안
  label.draggable = true;
  label.title = '여기를 잡고 끌어도 됩니다';
  root.append(style, box, label);
  (document.documentElement || document).appendChild(host);
  return { host, box, label };
}

export function describe(el: Element): string {
  let s = el.localName;
  if (el.id) s += '#' + el.id;
  const cls = (el as HTMLElement).className;
  const c = typeof cls === 'string' ? cls.trim().split(/\s+/)[0] : '';
  if (c) s += '.' + c;
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

/** 라벨 위치: 대상 위쪽에 공간이 있으면 위, 아니면 아래 (E2E t_handle 이 같은 규칙으로 손잡이 위치를 계산) */
export function labelTop(r: DOMRect): number {
  return r.top > 20 ? r.top - 20 : Math.min(r.bottom + 2, innerHeight - 20);
}
