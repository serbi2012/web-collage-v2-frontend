// 하이라이트 오버레이 — 페이지 레이아웃·스타일에 영향을 주지 않도록 closed Shadow DOM + position:fixed (PLAN §6.1)

import { LABEL_TITLE } from './strings';

export const OVERLAY_TAG = 'wc-overlay';

export interface Overlay {
  host: HTMLElement;
  box: HTMLDivElement;
  label: HTMLDivElement;
}

const CSS = `
.box{position:fixed;box-sizing:border-box;border:2px solid #ff5a5f;background:rgba(255,90,95,.08);
     border-radius:3px;pointer-events:none;display:none;
     transition:left .07s ease-out,top .07s ease-out,width .07s ease-out,height .07s ease-out}
.label{position:fixed;font:600 11px/20px system-ui,sans-serif;color:#fff;background:#ff5a5f;
       padding:0 8px 0 6px;border-radius:4px;pointer-events:auto;display:none;white-space:nowrap;
       cursor:grab;-webkit-user-drag:element;user-select:none;max-width:90vw;overflow:hidden;text-overflow:ellipsis}
.label::before{content:"⠿ ";opacity:.85}
.c{cursor:pointer;opacity:.78;border-radius:3px;padding:0 2px}
.c:hover{opacity:1;background:rgba(255,255,255,.22)}
.c.cur{opacity:1}
.sep{opacity:.6;padding:0 1px}
.size{opacity:.85;margin-left:6px}
.box.locked{border-style:solid;box-shadow:0 0 0 2px rgba(255,90,95,.35)}
@media (prefers-reduced-motion: reduce){.box{transition:none}}`;

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
  label.title = LABEL_TITLE;
  root.append(style, box, label);
  (document.documentElement || document).appendChild(host);
  return { host, box, label };
}

/**
 * M4 라벨 경로(브레드크럼): 바깥 조상 몇 단계 › 현재 대상. 단계를 누르면 그 요소로 바꾼다.
 * 페이지 문자열은 textContent 로만 넣는다 (클래스 이름 등에 HTML 이 섞여도 안전)
 */
export function paintCrumbs(label: HTMLElement, chain: Element[], size: string, extra: string) {
  label.textContent = '';
  chain.forEach((el, i) => {
    if (i) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = '›';
      label.appendChild(sep);
    }
    const c = document.createElement('span');
    c.className = 'c' + (i === chain.length - 1 ? ' cur' : '');
    c.dataset.i = String(i);
    c.textContent = i === chain.length - 1 ? describe(el) : el.localName;
    label.appendChild(c);
  });
  const s = document.createElement('span');
  s.className = 'size';
  s.textContent = size + (extra ? '  ' + extra : '');
  label.appendChild(s);
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
