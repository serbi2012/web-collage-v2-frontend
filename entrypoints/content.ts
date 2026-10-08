// Web Collage — content script (모든 페이지·모든 프레임, document_start)
// 프레임워크 없이 가볍게. 스크랩 모드가 꺼져 있으면 리스너는 즉시 반환하고 non-passive 리스너는 등록하지 않는다 (G20).
import { startPicker } from '../src/picker/picker';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,
  main(ctx) {
    // [G16] 스냅샷 기본값 계산용 iframe 안에서는 아무것도 하지 않음
    try {
      if (window.frameElement && window.frameElement.hasAttribute('data-wc-defaults')) return;
    } catch {
      /* cross-origin frame */
    }
    // R4: 익스텐션이 업데이트·다시 로드되면 남은 옛 스크립트(고아)는 리스너를 모두 떼고 무장을 해제한다.
    // (WXT 의 ctx 가 새 스크립트 시작·runtime 연결 끊김을 감지해 abort 신호를 준다)
    startPicker(ctx.signal);
  },
});
