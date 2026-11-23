import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { productionApiUrlProblem } from './src/lib/buildChecks.ts'
// SEO: sitemap.xml + build checks (robots.txt, CSP hashes, titles). See scripts/seoPlugin.ts.
import { seoPlugin } from './scripts/seoPlugin.ts'

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
      // SEO: see scripts/seoPlugin.ts
      seoPlugin(),
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
          // assets/admin/: the admin panel's chunks are never precached (owners never need them; online only)
          globIgnores: ['help/**', 'landing/**', 'assets/admin/**',
            // SEO: the prerendered public pages are for first visits and crawlers; the app itself uses index.html
            'prerender/**'],
          navigateFallback: '/index.html',
          // A path ending in a file extension (a help screenshot opened full size, robots.txt...) is a file, not an app page
          navigateFallbackDenylist: [/^\/api\//, /\/[^/]+\.[a-z0-9]{2,5}$/i],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          },
      }),
    ],
    build: {
      rolldownOptions: {
        output: {
          // The admin panel's lazy chunks (their entry module is in src/admin/) go to assets/admin/, so the service
          // worker can leave them out. Code the owner app also uses stays in the owner chunks.
          chunkFileNames: (chunk) => {
            const inAdmin = (id: string | null) => Boolean(id && id.replace(/\\/g, '/').includes('/src/admin/'))
            const adminOnly = chunk.facadeModuleId ? inAdmin(chunk.facadeModuleId)
              : chunk.moduleIds.length > 0 && chunk.moduleIds.every(inAdmin)
            return adminOnly ? 'assets/admin/[name]-[hash].js' : 'assets/[name]-[hash].js'
          },
          minifyInternalExports: true,
          // Everything the owner app uses stays in one chunk (only the admin chunks import from it). Left out: the admin
          // code itself, the service-worker helper (loaded lazily as before) and the infinite-list code only Admin uses.
          codeSplitting: {
            groups: [{
              name: 'app',
              test: (id: string) => !/\/src\/admin\/|\/workbox-window\/|infiniteQuery/i.test(id.replace(/\\/g, '/')),
            }],
          },
        },
      },
    },
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
