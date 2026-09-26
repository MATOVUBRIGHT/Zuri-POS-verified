import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Global error handlers for renderer process (Electron)
window.addEventListener('error', (event) => {
  console.error("Renderer runtime error:", event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error("Renderer unhandled rejection:", event.reason);
});

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML =
    "<p style=\"font-family:sans-serif;padding:24px;\">Missing #root element. Check index.html.</p>";
} else {
  createRoot(rootEl).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
