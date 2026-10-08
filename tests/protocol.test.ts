import { describe, expect, it } from 'vitest';
import { isContentMsg, isPanelReq, parseDragMeta } from '../src/shared/protocol';

const meta = { v: 1, id: 'abc', kind: 'element', via: 'native', url: 'https://x.test/', title: 't', isTop: true, tag: 'div', w: 1, h: 1, startedAt: 1, nativeTypes: [], originNodeType: 1 };

describe('메시지 타입 가드 (크기·형식이 이상한 메시지는 버린다)', () => {
  it('번호표 파싱', () => {
    expect(parseDragMeta(JSON.stringify(meta))?.id).toBe('abc');
    expect(parseDragMeta('{bad')).toBeNull();
    expect(parseDragMeta(JSON.stringify({ ...meta, v: 2 }))).toBeNull();
    expect(parseDragMeta(JSON.stringify({ ...meta, kind: 'evil' }))).toBeNull();
    expect(parseDragMeta('x'.repeat(40000))).toBeNull();
  });
  it('content 메시지', () => {
    expect(isContentMsg({ type: 'clip:begin', id: 'abc', meta, rect: {}, viewport: {} })).toBe(true);
    expect(isContentMsg({ type: 'clip:begin', id: '', meta, rect: {}, viewport: {} })).toBe(false);
    expect(isContentMsg({ type: 'nope' })).toBe(false);
    expect(isContentMsg(null)).toBe(false);
  });
  it('panel 요청', () => {
    expect(isPanelReq({ type: 'clip:get', id: 'abc' })).toBe(true);
    expect(isPanelReq({ type: 'assets:localize', urls: new Array(501).fill('x'), referer: '' })).toBe(false);
    expect(isPanelReq({ type: 'scrap:set', windowId: 1, enabled: true })).toBe(true);
  });
});

describe('설정·다국어', async () => {
  const { normalizeServer } = await import('../src/shared/settings');
  const { t } = await import('../src/shared/i18n');
  it('공유 서버 주소 정리', () => {
    expect(normalizeServer(' https://share.test/ ')).toBe('https://share.test');
    expect(normalizeServer('')).toBe('');
    expect(normalizeServer('javascript:alert(1)')).toBeNull();
    expect(normalizeServer('ftp://x')).toBeNull();
  });
  it('문구 치환', () => {
    expect(t('failed', 'A', 'B')).toMatch(/A.*B/);
  });
});
