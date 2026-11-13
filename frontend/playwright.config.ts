import { defineConfig, devices } from '@playwright/test'

// E2E against the LOCAL stack only (frontend/e2e/stack/up.sh): a production build served by e2e/stack/ui-server.mjs
// on 127.0.0.1:4180, which proxies /api to the backend container on 127.0.0.1:18081.
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4180'
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:18081'

// Hard guard: these suites create accounts and bookings. They must never run against production.
for (const url of [BASE_URL, API_URL]) {
  if (/roomtrack\.app/i.test(url)) {
    throw new Error(`Refusing to run E2E against ${url}: only the local stack is allowed (see Docs/testing/README.md).`)
  }
}

const common = {
  baseURL: BASE_URL,
  locale: 'en-US',
  // The owner's zone; seed dates are computed in the machine's local zone, which is the same on this machine.
  timezoneId: process.env.E2E_TZ ?? 'Europe/Skopje',
  // The app registers a service worker; only the PWA spec lets it run.
  serviceWorkers: 'block' as const,
  trace: 'retain-on-failure' as const,
  screenshot: 'only-on-failure' as const,
  actionTimeout: 10_000,
  navigationTimeout: 20_000,
}

const NOT_SPECIAL = ['**/responsive.spec.ts', '**/pwa.spec.ts']

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 4,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }], ['json', { outputFile: 'e2e/.work/results.json' }]],
  globalSetup: './e2e/support/global-setup.ts',
  use: common,
  projects: [
    {
      name: 'chromium',
      testIgnore: NOT_SPECIAL,
      use: { ...devices['Desktop Chrome'], ...common, viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'webkit-mobile',
      testIgnore: ['**/pwa.spec.ts', '**/perf.spec.ts', '**/lighthouse*'],
      use: {
        ...devices['iPhone 13'],
        ...common,
        browserName: 'webkit',
        viewport: { width: 390, height: 844 },
      },
    },
    // Responsive matrix (the 390x844 phone is webkit-mobile above).
    ...[
      [360, 640],
      [768, 1024],
      [1280, 800],
      [1920, 1080],
    ].map(([width, height]) => ({
      name: `responsive-${width}x${height}`,
      testMatch: '**/responsive.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ...common,
        viewport: { width, height },
        ...(width < 768 ? { isMobile: true, hasTouch: true } : {}),
      },
    })),
    {
      name: 'pwa',
      testMatch: '**/pwa.spec.ts',
      use: { ...devices['Desktop Chrome'], ...common, serviceWorkers: 'allow' },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'node e2e/stack/ui-server.mjs',
        url: `${BASE_URL}/login`,
        reuseExistingServer: true,
        timeout: 20_000,
        env: { E2E_API_URL: API_URL },
      },
})
