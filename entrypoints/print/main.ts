// 인쇄/PDF 전용 확장 페이지: 내보내기 HTML 을 iframe 에 띄우고 window.print() (PLAN M3)
import { db } from '../../src/db/dexie';
import { exportHtmlString } from '../../src/export/actions';

const status = document.getElementById('status')!;
const frame = document.getElementById('frame') as HTMLIFrameElement;
const print = () => frame.contentWindow?.print();
document.getElementById('print')!.addEventListener('click', print);

(async () => {
  const id = new URLSearchParams(location.search).get('id');
  const doc = id ? await db.collages.get(id) : undefined;
  if (!doc) {
    status.textContent = '콜라주를 찾을 수 없습니다';
    return;
  }
  document.title = `${doc.title} — 인쇄`;
  frame.onload = () => {
    status.textContent = doc.title;
    // 이미지·폰트가 그려질 시간을 조금 준 뒤 인쇄 대화상자
    setTimeout(print, 600);
  };
  frame.srcdoc = await exportHtmlString(doc);
})();
