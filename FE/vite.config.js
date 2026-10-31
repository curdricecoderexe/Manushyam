import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Same-origin /api in dev so the httpOnly refresh cookie works without CORS tricks.
  server: { port: 5173, proxy: { '/api': 'http://localhost:5001', '/sitemap.xml': { target: 'http://localhost:5001', rewrite: () => '/api/seo/sitemap.xml' }, '/socket.io': { target: 'http://localhost:5001', ws: true } } },
  build: {
    // Off for deploys (they would be public); BUILD_SOURCEMAP=true makes hidden maps for error triage.
    sourcemap: loadEnv(mode, '.', 'BUILD_').BUILD_SOURCEMAP === 'true' ? 'hidden' : false,
    rollupOptions: {
      output: {
        // React + router change rarely, so they get their own long-cached chunk.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|react-router)\//.test(id)) return 'react'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
    include: ['src/**/*.test.{js,jsx}'],
  },
}))
