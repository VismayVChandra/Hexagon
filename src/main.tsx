import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Self-hosted fonts (latin subsets are fetched on demand; both are cached for offline use by the service worker).
import '@fontsource-variable/figtree/wght.css';
import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/bricolage-grotesque/wght.css'; // Honey Pop skin; only downloaded once something uses it
import '@fontsource/atkinson-hyperlegible/latin-400.css'; // "Easier-to-read text" option
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles.css';
import { captureAuthRedirect } from './cloud/authRedirect';

// Must run before the router sees the URL: confirmation and reset emails link back with a result in the hash.
captureAuthRedirect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline app shell. Production builds only: a service worker in dev would serve stale files.
// This caches the app itself and, for installed apps that allow it, sends come-back reminders (no push server involved).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {
      /* offline support is a bonus; the app works without it */
    });
  });
}
