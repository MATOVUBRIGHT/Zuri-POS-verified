import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

/**
 * Service worker handling for production
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Don't force an SW update on every load; it can lead to
        // controller takeover behavior that users experience as a reload.
        // The SW will still update through normal lifecycle.
        void registration;
      })
      .catch((registrationError) => {
        console.error('Service worker registration failed:', registrationError);
      });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
