import { createRoot } from 'react-dom/client';
import { App } from '../../src/panel/App';
import { initPersistence } from '../../src/panel/persist';
import { installPanelTestHooks } from '../../src/testhooks/panel';
import './style.css';

initPersistence().then(() => {
  if (__E2E__) installPanelTestHooks();
  createRoot(document.getElementById('app')!).render(<App />);
});
