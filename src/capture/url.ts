// URL 처리 — 직렬화기의 보안 경계 (D17, G21). 순수 함수라서 단위 테스트로 지킨다.

export function absUrl(u: string, base: string): string {
  try {
    return new URL(u, base).href;
  } catch {
    return u;
  }
}

/**
 * [G21] 정규화한 뒤의 프로토콜로 판단해야 함: URL 파서는 탭·줄바꿈을 지우므로 "jav\tascript:" 가 javascript: 가 됨.
 * href 는 http(s)만, src 는 http(s) + data:image/* 만 허용. 그 외(javascript:, vbscript:, data:text/html, file:, blob: …)는 null.
 */
export function safeUrl(u: string, kind: 'href' | 'src', base: string): string | null {
  const abs = absUrl(u, base);
  let proto = '';
  try {
    proto = new URL(abs).protocol;
  } catch {
    return null;
  }
  if (proto === 'http:' || proto === 'https:') return abs;
  // data:image/svg+xml 는 <img> 로 쓰면 스크립트가 실행되지 않으므로 허용
  if (kind === 'src' && proto === 'data:' && /^data:image\//i.test(abs)) return abs;
  return null;
}

export const URL_RE = /url\((['"]?)(.*?)\1\)/g;

/** CSS 텍스트의 url(...) 중 http(s) 만 모은다 */
export function cssHttpUrls(text: string): string[] {
  if (!text || text.indexOf('url(') < 0) return [];
  const out: string[] = [];
  const re = new RegExp(URL_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) if (/^https?:/i.test(m[2])) out.push(m[2]);
  return out;
}

export function safeHost(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}
