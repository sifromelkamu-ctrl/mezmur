import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Pinned so the dev server never silently moves to 5174+ if the port's
    // busy — an embedded/proxied browser (VS Code's preview, a forwarded
    // tunnel, etc.) that's pointed at a fixed port would otherwise end up
    // talking to nothing. hmr.clientPort pins the hot-reload WebSocket to
    // the same port explicitly, rather than inferring it from
    // window.location.port, which a proxy/webview can rewrite — a broken
    // HMR socket fails silently rather than erroring, which reads exactly
    // like "the page went blank on the next click."
    strictPort: true,
    hmr: {
      clientPort: 5173,
    },
  },
  build: {
    // No sourcemaps in the deployed bundle — smaller artifact, and this is
    // a private app with no public bug-tracker integration to justify them.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Splits large, rarely-changing third-party deps into their own
        // chunk so a normal app-code deploy doesn't force everyone to
        // re-download React/router/Supabase — those stay cached across
        // releases.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('react-router') || id.includes('/react/') || id.includes('/react-dom/')) return 'vendor'
          return undefined
        },
      },
    },
  },
})
