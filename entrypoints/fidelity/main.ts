// [E2E 전용] 충실도 측정 페이지 (PLAN M1): 저장된 조각을 원본 폭 1:1 로 그린다.
// 하네스가 이 영역을 캡처해 원본 화면 캡처(refShot)와 픽셀 비교한다. 배포 빌드에서는 wxt.config.ts 훅이 이 엔트리포인트를 뺀다.
import { db } from '../../src/db/dexie';
import { assetUrl, renderableFromClip, renderInto } from '../../src/panel/render';

(async () => {
  const p = new URLSearchParams(location.search);
  const clip = await db.clips.get(p.get('clip') || '');
  const host = document.getElementById('host')!;
  if (!clip) {
    document.body.dataset.ready = 'missing';
    return;
  }
  const r = await renderableFromClip(clip);
  host.style.width = clip.width + 'px';
  renderInto(host, r, 'original', p.get('bg') !== '0');
  const imgs = Array.from(host.shadowRoot!.querySelectorAll('img'));
  await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((res) => ((i.onload = i.onerror = res), setTimeout(res, 3000))))));
  await document.fonts.ready;
  await new Promise((res) => setTimeout(res, 300));
  const ref = clip.refShotAssetId ? await assetUrl(clip.refShotAssetId) : null;
  let refDataUrl: string | null = null;
  if (ref) {
    const blob = await (await fetch(ref)).blob();
    refDataUrl = await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.readAsDataURL(blob);
    });
  }
  const rect = host.getBoundingClientRect();
  Object.assign(window, { fidelity: { rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height }, ref: refDataUrl, width: clip.width, height: clip.height } });
  document.body.dataset.ready = '1';
})();
