// content script 전용 작은 문자열 묶음 (패널용 사전 src/shared/i18n.ts 를 통째로 넣지 않으려고)
const ko = (() => {
  try {
    return (chrome.i18n?.getUILanguage?.() || navigator.language || 'ko').toLowerCase().startsWith('ko');
  } catch {
    return true;
  }
})();
export const LABEL_TITLE = ko ? '여기를 잡고 끌어도 됩니다 · 경로를 누르면 그 단계로' : 'Grab here to drag · click a path step to select it';
export const TEXT_MODE = ko ? '(텍스트 선택 모드)' : '(text selection mode)';
