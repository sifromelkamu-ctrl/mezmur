import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AdminApp from './AdminApp.tsx'

// No service-worker registration here (unlike main.tsx) — sw.js's
// cache-first strategy exists for the listener app's asset/artwork
// caching specifically; registering it on this separate admin domain
// would cache nothing it's actually written to intercept.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
)
