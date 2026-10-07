// 화면 캡처 크롭: 원본 비교용 refShot, canvas·iframe·video 대체 이미지
import type { Rect } from '../shared/protocol';

export async function cropToDataUrl(bmp: ImageBitmap, rect: Rect | undefined, ratio: number): Promise<string | null> {
  if (!rect) return null;
  const sx = Math.max(0, Math.round(rect.x * ratio));
  const sy = Math.max(0, Math.round(rect.y * ratio));
  const sw = Math.min(bmp.width - sx, Math.round((rect.w + Math.min(0, rect.x)) * ratio));
  const sh = Math.min(bmp.height - sy, Math.round((rect.h + Math.min(0, rect.y)) * ratio));
  if (sw <= 0 || sh <= 0) return null;
  const c = new OffscreenCanvas(sw, sh);
  c.getContext('2d')!.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
  return blobToDataUrl(await c.convertToBlob({ type: 'image/png' }));
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(s)}`;
}
