import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import { initApiBase } from './lib/api';
import { initAnalytics } from './lib/analytics';
// HUD fonts (bundled — the Tauri app must never hit a font CDN).
// Chakra Petch = display headlines (--font-display); IBM Plex Mono =
// telemetry/labels (--font-hud). Chakra Petch tops out at weight 700, so
// headlines use font-bold — font-black would be browser-synthesized mush.
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './index.css';

function applyTheme() {
  // 'system' is resolved here (and kept live by App.tsx's media listener) so
  // <html> ALWAYS carries an explicit .dark or .light class — Tailwind's
  // `dark:` variant and all .dark-scoped HUD styles depend on it.
  let theme = 'dark'; // fresh installs get the Neural OS look
  try {
    const raw = localStorage.getItem('handymate-settings');
    const settings = raw ? JSON.parse(raw) : {};
    theme = settings.theme || 'dark';
  } catch { /* fall through to dark */ }
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('light', !dark);
}

applyTheme();

// Fetch the API base URL from the Tauri backend before rendering.
// This ensures JARVIS_PORT is defined in one place (the Rust backend).
// In non-Tauri environments this is a no-op.
initApiBase().finally(() => {
  // Kick off analytics init in the background — it's never awaited so
  // a slow/failed identity fetch never delays UI render.
  void initAnalytics();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  );
});
