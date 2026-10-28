import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Separate config (not a second entry in vite.config.ts's rollupOptions.input)
// so this is its own independent Vercel project/deploy with its own build
// command — npm run build:admin — producing dist-admin/, never touching the
// listener app's own dist/ or its vite.config.ts. See src/AdminApp.tsx for
// why this exists as a genuinely separate site rather than routes inside
// the listener app.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-admin',
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, 'admin.html'),
      output: {
        // Same split as vite.config.ts, for the same reason — React/
        // react-router/Supabase stay in their own cacheable chunk instead
        // of bloating the one entry chunk every admin page's first load
        // has to fetch.
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
