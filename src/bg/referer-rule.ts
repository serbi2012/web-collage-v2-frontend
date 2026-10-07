// [D7] declarativeNetRequest 세션 규칙으로 Referer 를 원래 페이지로 설정 (핫링크 차단 대응)
// R7 정리:
//  - 규칙 id 는 service worker 가 다시 시작돼도 겹치지 않게 기존 세션 규칙을 조회해 할당
//  - 같은 host 에 대한 요청은 직렬화 (규칙이 host 단위라 겹치면 다른 요청의 Referer 가 바뀜)
//  - tabIds: [TAB_ID_NONE] → 익스텐션 자신의 요청에만 적용, 끝나면 즉시 제거

const hostChains = new Map<string, Promise<unknown>>();
let nextId: number | null = null;

async function allocRuleId(): Promise<number> {
  if (nextId === null) {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    nextId = rules.reduce((m, r) => Math.max(m, r.id), 1000) + 1;
  }
  return nextId++;
}

export function withReferer<T>(url: string, referer: string, fn: () => Promise<T>): Promise<T> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return fn();
  }
  const prev = hostChains.get(host) || Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    const id = await allocRuleId();
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [
        {
          id,
          priority: 1,
          action: {
            type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
            requestHeaders: [{ header: 'referer', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value: referer }],
          },
          condition: {
            requestDomains: [host],
            tabIds: [chrome.tabs.TAB_ID_NONE],
            resourceTypes: ['xmlhttprequest', 'image', 'other'] as chrome.declarativeNetRequest.ResourceType[],
          },
        },
      ],
    });
    try {
      return await fn();
    } finally {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }).catch(() => {});
    }
  });
  hostChains.set(host, run);
  run.finally(() => {
    if (hostChains.get(host) === run) hostChains.delete(host);
  });
  return run;
}
