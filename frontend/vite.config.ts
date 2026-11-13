import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { productionApiUrlProblem } from './src/lib/buildChecks.ts'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (command === 'build') {
    const problem = productionApiUrlProblem(mode, env.VITE_API_URL, env.VITE_ALLOW_LOCAL_API === '1')
    if (problem) throw new Error(`Production build refused: ${problem}. Set VITE_API_URL (e.g. https://api.roomtrack.app).`)
  }
  return {
    plugins: [
      react(),
      tailwindcss(),
     VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeManifestIcons: false,
        devOptions: {
          enabled: true,
          suppressWarnings: true,
          navigateFallback: 'index.html',
        },
        manifest: {
          id: '/',
          name: 'RoomTrack',
          short_name: 'RoomTrack',
          description: 'One calendar for every booking from Booking.com and your own guests.',
          lang: 'en',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          theme_color: '#FFFFFF',
          background_color: '#F3F5F6',
          categories: ['business', 'productivity'],
          icons: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/logo-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            {
              name: 'Calendar',
              url: '/dashboard/calendar',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'New reservation',
              short_name: 'New booking',
              url: '/dashboard/reservations/new',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
          globIgnores: ['help/**', 'landing/**'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          },
      }),
    ],
    server: {
      proxy: {
        '/api/ical': {
          target: env.VITE_API_URL ?? 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  }
})
