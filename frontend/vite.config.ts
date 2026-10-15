import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        // The calendar feed link shown in the app is /api/ical/<token>.ics on the app's own domain.
        // In production Netlify forwards it to the backend (public/_redirects); this does the same for `vite dev`.
        '/api/ical': {
          target: env.VITE_API_URL ?? 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  }
})
