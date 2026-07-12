import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
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
