// Lighthouse against the LOCAL E2E UI (never production): /login signed out, and the calendar signed in as owner A.
// Uses Playwright's full Chromium as CHROME_PATH. For the signed-in run, a throwaway Chrome profile gets the token in
// localStorage first (Playwright), then Lighthouse opens that profile with --disable-storage-reset.
// Lighthouse itself comes from `npx lighthouse@12.8.2` (not saved in package.json).
//
// Usage (stack up, UI server running): node e2e/stack/lighthouse.mjs   → e2e/.work/lighthouse/*.json + summary.json
import {chromium} from '@playwright/test'
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4180'
if (/roomtrack\.app/i.test(BASE)) throw new Error('local stack only')
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:18081'
const OUT = path.join(here, '..', '.work', 'lighthouse')
fs.mkdirSync(OUT, {recursive: true})
const seed = JSON.parse(fs.readFileSync(path.join(here, '..', '.work', 'run', 'seed.json'), 'utf8'))
const CHROME = chromium.executablePath()

const token = (await (await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: {'content-type': 'application/json'},
  body: JSON.stringify({email: seed.a.email, password: seed.password}),
})).json()).token

// A profile that is signed in as owner A
const profile = path.join(OUT, 'profile-signed-in')
fs.rmSync(profile, {recursive: true, force: true})
const ctx = await chromium.launchPersistentContext(profile, {executablePath: CHROME, headless: true})
const page = await ctx.newPage()
await page.goto(`${BASE}/login`)
await page.evaluate((t) => localStorage.setItem('auth_token', t), token)
await ctx.close()

const results = []
function run(name, url, preset, signedIn) {
  const file = path.join(OUT, `${name}-${preset}.json`)
  const flags = ['--headless=new', '--no-first-run', ...(signedIn ? [`--user-data-dir=${profile}`] : [])].join(' ')
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
    '--yes', 'lighthouse@12.8.2', url, '--output=json', `--output-path=${file}`, '--quiet',
    '--only-categories=performance,accessibility,best-practices,seo', `--chrome-flags="${flags}"`,
    ...(preset === 'desktop' ? ['--preset=desktop'] : []), ...(signedIn ? ['--disable-storage-reset'] : []),
  ], {stdio: 'inherit', shell: process.platform === 'win32', env: {...process.env, CHROME_PATH: CHROME}, timeout: 240_000})
  const r = JSON.parse(fs.readFileSync(file, 'utf8'))
  const score = (k) => (r.categories[k] ? Math.round(r.categories[k].score * 100) : null)
  const a = r.audits
  results.push({
    page: name, preset, finalUrl: r.finalDisplayedUrl, performance: score('performance'), accessibility: score('accessibility'),
    bestPractices: score('best-practices'), seo: score('seo'),
    FCP: a['first-contentful-paint']?.displayValue, LCP: a['largest-contentful-paint']?.displayValue,
    TBT: a['total-blocking-time']?.displayValue, CLS: a['cumulative-layout-shift']?.displayValue,
    transferKB: Math.round((a['total-byte-weight']?.numericValue ?? 0) / 1024),
    failedA11y: Object.values(a).filter((x) => x.score === 0 && r.categories.accessibility.auditRefs.some((ref) => ref.id === x.id)).map((x) => x.id),
  })
}
for (const preset of ['mobile', 'desktop']) run('login', `${BASE}/login`, preset, false)
for (const preset of ['mobile', 'desktop']) run('calendar', `${BASE}/dashboard/calendar`, preset, true)
fs.rmSync(profile, {recursive: true, force: true})
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
