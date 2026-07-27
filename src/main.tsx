import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Registered unconditionally (not gated behind the push-notification opt-in
// that src/lib/pushNotifications.ts separately triggers) so the asset/
// artwork caching sw.js now does applies to every visitor. Idempotent — the
// browser reuses the existing registration if one already exists, so
// pushNotifications.ts's own later `register("/sw.js")` call for push stays
// correct and unaffected by this.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
