// Tiny static server for the E2E build (frontend/e2e/.dist) with an SPA fallback and a same-origin proxy:
//   /api/*      → the local backend container (http://127.0.0.1:18081), so the browser never needs CORS
//   everything else → a file from e2e/.dist, or index.html for app routes
// Local only: it binds to 127.0.0.1 and refuses to proxy anywhere but 127.0.0.1/localhost.
//
// Usage: node e2e/stack/ui-server.mjs   (env: E2E_UI_PORT=4180, E2E_API_URL=http://127.0.0.1:18081, E2E_DIST)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.E2E_UI_PORT ?? 4180)
const API = new URL(process.env.E2E_API_URL ?? 'http://127.0.0.1:18081')
const DIST = path.resolve(process.env.E2E_DIST ?? path.join(here, '..', '.dist'))

if (!['127.0.0.1', 'localhost'].includes(API.hostname)) {
  console.error(`refusing to proxy to ${API.hostname}: the E2E stack is local only`)
  process.exit(1)
}
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error(`no build in ${DIST}; run e2e/stack/up.sh first`)
  process.exit(1)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.vtt': 'text/vtt', '.txt': 'text/plain',
  '.xml': 'application/xml',
}

function proxy(req, res) {
  const headers = { ...req.headers }
  // Same origin from the browser's point of view; the backend's hard-coded CORS list does not include this port.
  delete headers.origin
  const upstream = http.request(
    { hostname: API.hostname, port: API.port, path: req.url, method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    },
  )
  upstream.on('error', (err) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: `e2e proxy: ${err.code ?? err.message}` }))
  })
  req.pipe(upstream)
}

// The security headers Netlify sends for every path (the "/*" block of public/_headers, copied into the build), so the
// E2E suite runs under the real Content-Security-Policy (audit SEC-06).
function siteWideHeaders() {
  const file = path.join(DIST, '_headers')
  if (!fs.existsSync(file)) return {}
  const out = {}
  let inBlock = false
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    if (!/^\s/.test(raw)) { inBlock = raw.trim() === '/*'; continue }
    if (!inBlock) continue
    const i = raw.indexOf(':')
    out[raw.slice(0, i).trim().toLowerCase()] = raw.slice(i + 1).trim()
  }
  return out
}
const SITE_HEADERS = siteWideHeaders()

function serveFile(res, file, status = 200) {
  const ext = path.extname(file).toLowerCase()
  const headers = { ...SITE_HEADERS, 'content-type': TYPES[ext] ?? 'application/octet-stream' }
  // Same caching rules as public/_headers on Netlify
  if (/[\\/]assets[\\/]/.test(file)) headers['cache-control'] = 'public, max-age=31536000, immutable'
  else headers['cache-control'] = 'no-cache'
  res.writeHead(status, headers)
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://local')
  if (url.pathname.startsWith('/api/')) return proxy(req, res)
  const decoded = decodeURIComponent(url.pathname)
  const file = path.resolve(DIST, '.' + decoded)
  if (file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file)
  // A missing asset is a real 404; anything else is an app route.
  if (path.extname(decoded) && !decoded.endsWith('.html')) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    return res.end('not found')
  }
  serveFile(res, path.join(DIST, 'index.html'))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`e2e ui-server: http://127.0.0.1:${PORT} (dist ${DIST}, api ${API.origin})`)
})
