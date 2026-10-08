// 설정 페이지 (PLAN M4: 단축키·기본 표시 방식, M6: 공유 서버)
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LANG } from '../../src/shared/i18n';
import { DEFAULT_SETTINGS, getSettings, normalizeServer, setSettings, type Settings } from '../../src/shared/settings';
import type { DisplayMode } from '../../src/shared/types';
import './style.css';

const L =
  LANG === 'ko'
    ? {
        title: '설정',
        display: '새 조각의 기본 표시 방식',
        fit: '맞춤 (패널 폭에 맞게 축소)',
        original: '원본 크기 (가로 스크롤)',
        reflow: '다시 흐르게 (글 위주 조각)',
        shortcut: '단축키',
        shortcutDesc: '기본은 Alt+Shift+K 입니다. Windows 에서 입력 언어 전환(Alt+Shift)과 겹치면 바꾸세요.',
        shortcutBtn: '단축키 설정 열기',
        share: '공유 서버 (선택)',
        shareDesc: '읽기 전용 공유 링크를 만들 서버 주소입니다. 비워 두면 공유 기능을 쓰지 않습니다. 콜라주는 항상 이 컴퓨터에 먼저 저장됩니다.',
        shareDays: '공유 링크 보관 일수',
        bad: 'http(s) 주소를 넣어 주세요',
        storage: '저장 공간',
        used: '사용 중',
        onboarding: '처음 사용 안내 다시 보기',
        saved: '저장됨',
        version: '버전',
      }
    : {
        title: 'Settings',
        display: 'Default display for new clips',
        fit: 'Fit (shrink to panel width)',
        original: 'Original size (scroll horizontally)',
        reflow: 'Reflow (text-heavy clips)',
        shortcut: 'Shortcut',
        shortcutDesc: 'Default is Alt+Shift+K. Change it if it clashes with your input-language switch (Alt+Shift on Windows).',
        shortcutBtn: 'Open shortcut settings',
        share: 'Share server (optional)',
        shareDesc: 'Server for read-only share links. Leave empty to disable sharing. Collages are always saved on this computer first.',
        shareDays: 'Keep share links for (days)',
        bad: 'Enter an http(s) address',
        storage: 'Storage',
        used: 'used',
        onboarding: 'Show the intro again',
        saved: 'Saved',
        version: 'Version',
      };

function Options() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [server, setServer] = useState('');
  const [msg, setMsg] = useState('');
  const [usage, setUsage] = useState('');

  useEffect(() => {
    getSettings().then((x) => {
      setS(x);
      setServer(x.shareServer);
    });
    navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage || 0) / 1024 / 1024).toFixed(1)} MB ${L.used}`));
  }, []);

  const save = async (patch: Partial<Settings>) => {
    setS(await setSettings(patch));
    setMsg(L.saved);
    setTimeout(() => setMsg(''), 1200);
  };

  return (
    <main>
      <h1>Web Collage · {L.title}</h1>

      <section>
        <h2>{L.display}</h2>
        {(['fit', 'original', 'reflow'] as DisplayMode[]).map((d) => (
          <label key={d} className="radio">
            <input type="radio" name="display" checked={s.defaultDisplay === d} onChange={() => save({ defaultDisplay: d })} /> {L[d]}
          </label>
        ))}
      </section>

      <section>
        <h2>{L.shortcut}</h2>
        <p>{L.shortcutDesc}</p>
        <button onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>{L.shortcutBtn}</button>
      </section>

      <section>
        <h2>{L.share}</h2>
        <p>{L.shareDesc}</p>
        <div className="row">
          <input
            type="url"
            placeholder="https://share.example.com"
            value={server}
            aria-label={L.share}
            onChange={(e) => setServer(e.target.value)}
            onBlur={() => {
              const n = normalizeServer(server);
              if (n === null) setMsg(L.bad);
              else {
                setServer(n);
                save({ shareServer: n });
              }
            }}
          />
        </div>
        <label className="row">
          {L.shareDays}
          <input type="number" min={1} max={90} value={s.shareDays} onChange={(e) => save({ shareDays: Math.max(1, Math.min(90, Number(e.target.value) || 30)) })} />
        </label>
      </section>

      <section>
        <h2>{L.storage}</h2>
        <p>{usage}</p>
        <button onClick={() => save({ onboarded: false })}>{L.onboarding}</button>
      </section>

      <footer>
        {L.version} {chrome.runtime.getManifest().version} <span className="msg" role="status">{msg}</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('app')!).render(<Options />);
