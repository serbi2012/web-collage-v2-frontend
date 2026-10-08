// R6: 스냅샷은 버튼을 누른 채로(드래그 중) 뜨므로 :hover·:active 스타일이 박제된다(카드가 떠 있는 모양, 링크 밑줄 등).
// 조사 결과(docs/DECISIONS.md D23): 요소의 hover 상태를 스크립트로 끌 방법은 없고, 대신 접근 가능한 스타일시트의
// :hover/:active 규칙 선택자를 잠깐 ":not(*)" 로 바꿔 무효화한 뒤 되돌리는 방식이 가장 정확하다.
//  - 교차 출처 스타일시트는 CSSOM 접근이 막혀 있어 그 안의 :hover 규칙은 그대로 남는다(한계)
//  - DOM 을 바꾸지 않으므로 페이지의 MutationObserver 는 반응하지 않는다
//  - :not(:hover) 처럼 부정 안에 든 경우는 뜻이 뒤집히므로 건드리지 않는다

const STATE_RE = /:(hover|active)(?![\w-])/g;
const HAS_STATE = /:(hover|active)(?![\w-])/;
const MAX_RULES = 20000;

export function neutralizeHover(root: Element): () => void {
  const changed: Array<{ rule: CSSStyleRule; selector: string }> = [];
  let seen = 0;
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (++seen > MAX_RULES) return;
      if (rule.type === CSSRule.STYLE_RULE) {
        const sr = rule as CSSStyleRule;
        const sel = sr.selectorText;
        if (sel && HAS_STATE.test(sel) && !/:not\([^)]*:(hover|active)/.test(sel)) {
          changed.push({ rule: sr, selector: sel });
          try {
            sr.selectorText = sel.replace(STATE_RE, ':not(*)');
          } catch {
            /* 바꿀 수 없는 선택자 */
          }
        }
        if (sr.cssRules && sr.cssRules.length) visit(sr.cssRules); // CSS nesting (&:hover)
      } else if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
        visit((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  const sheets: CSSStyleSheet[] = [...Array.from(document.styleSheets), ...(document.adoptedStyleSheets || [])];
  // 대상이 Shadow DOM 안이면 그 shadow root 들의 시트도
  for (let n: Node | null = root; n; ) {
    const rn = n.getRootNode() as ShadowRoot | Document;
    if (!(rn instanceof ShadowRoot)) break;
    sheets.push(...Array.from(rn.styleSheets), ...(rn.adoptedStyleSheets || []));
    n = rn.host;
  }
  for (const sh of sheets) {
    try {
      visit(sh.cssRules);
    } catch {
      /* 교차 출처 시트 */
    }
  }
  return () => {
    for (const { rule, selector } of changed) {
      try {
        rule.selectorText = selector;
      } catch {
        /* 시트가 사라짐 */
      }
    }
  };
}
