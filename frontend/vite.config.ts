import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Installable app + service worker. The worker only serves the app's own built files (the "app shell").
      // It has no runtime routes at all, so requests to the API (another origin) never go through it: they
      // reach the network exactly as the app sent them (Authorization, X-Background, X-Refreshed-Token) and
      // nothing from the API is ever cached. Booking data is always live.
      VitePWA({
        // A new version waits until the user taps "Reload" in the update banner (src/components/AppUpdateBanner.tsx).
        registerType: 'prompt',
        // Registered from React (src/lib/pwa.ts) instead of an injected script.
        injectRegister: false,
        // The icons are already in the precache through globPatterns below; don't list them twice.
        includeManifestIcons: false,
        manifest: {
          id: '/',
          name: 'RoomTrack',
          short_name: 'RoomTrack',
          description: 'One calendar for every booking from Booking.com, Airbnb and your own guests.',
          lang: 'en',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          // "any": the calendar is useful in landscape and on tablets; a manifest can't lock phones only.
          orientation: 'any',
          // tokens.css: --rt-surface (top bar) and --rt-canvas (app background, used for the splash screen).
          theme_color: '#FFFFFF',
          background_color: '#F4F6F9',
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
          // The app shell: built JS/CSS/HTML plus the logo and icons. Not the help screenshots.
          globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
          globIgnores: ['help/**'],
          // Any address in the app opens index.html (offline too); React Router then shows the right page.
          navigateFallback: '/index.html',
          // /api/ical/* is the calendar feed Netlify forwards to the backend (public/_redirects): never the app.
          navigateFallbackDenylist: [/^\/api\//],
          // Deleting the previous version's precache once the new one is active.
          cleanupOutdatedCaches: true,
          // The very first worker takes over open tabs at once (nothing to replace). Updates still wait for "Reload".
          clientsClaim: true,
          // Deliberately no runtimeCaching: see the comment above VitePWA().
        },
      }),
    ],
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
