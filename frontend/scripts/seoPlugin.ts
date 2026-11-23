// Build-time SEO output and checks (vite.config.ts, `vite build` only). No dependencies beyond Node and Vite.
// - Writes dist/sitemap.xml from src/publicRoutes.ts (lastmod = build date). There is no hand-kept copy.
// - Prerenders every public route (src/prerender.tsx, rendered in Node through Vite) into dist/prerender/<name>.html:
//   the built index.html with the page's markup inside #root and its own title, description, canonical and share
//   tags; the JSON-LD only on the home page. dist/index.html stays the empty app shell (SPA fallback, service worker).
// - Adds a forced rewrite per public route to dist/_redirects, before the SPA fallback (e.g. /terms → prerender/terms.html).
// - Fails the build when:
//   * an inline <script> in index.html or a prerendered page has no matching 'sha256-...' in the CSP of dist/_headers
//     (JSON-LD blocks are data, not scripts, and are skipped),
//   * robots.txt is missing or has no Sitemap line,
//   * the sitemap lists a URL that is not a public route, or a public route is missing from App.tsx or prerender.tsx,
//   * index.html's title or description differs from the "/" entry in src/publicRoutes.ts, or a description is
//     longer than 155 characters,
//   * a prerendered page has not exactly one <h1> with the expected text, or misses its title, description or canonical,
//   * a prerendered page refers to a local picture/file that is not in dist (e.g. a missing .avif/.webp),
//   * a prerendered page's content mentions Airbnb, shows a calendar feed link (/api/ical/<token>), or uses a
//     screenshot of the signed-in app (src/prerender.tsx appOnlyFiles).
import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import react from "@vitejs/plugin-react";
import {createServer, type Plugin} from "vite";
import {canonicalUrl, PUBLIC_ROUTES, SITE_URL, type PublicRoute} from "../src/publicRoutes.ts";

const MAX_DESCRIPTION = 155;
export const PRERENDER_DIR = "prerender";

/** Structured data for the home page only. No ratings, reviews or prices on purpose. */
const STRUCTURED_DATA = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "SoftwareApplication",
            "@id": `${SITE_URL}/#app`,
            name: "RoomTrack",
            url: `${SITE_URL}/`,
            description: "RoomTrack is the reservation manager for owners of apartments and guesthouses. Add direct bookings, bring in Booking.com, and see who arrives, who leaves and which room is free.",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web, Android, iOS",
            publisher: {"@id": `${SITE_URL}/#organization`},
        },
        {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: "RoomTrack",
            url: `${SITE_URL}/`,
            logo: `${SITE_URL}/logo-512x512.png`,
        },
    ],
};

export function prerenderFile(path: string): string {
    return `${PRERENDER_DIR}/${path === "/" ? "home" : path.slice(1).replace(/\//g, "-")}.html`;
}

function sitemapXml(date: string): string {
    const urls = PUBLIC_ROUTES.filter((route) => route.inSitemap)
        .map((route) => `  <url>\n    <loc>${canonicalUrl(route.path)}</loc>\n    <lastmod>${date}</lastmod>\n  </url>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

function decodeEntities(text: string): string {
    return text.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function escapeAttr(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Hashes of the inline scripts the browser would run (CRLF → LF, as the HTML parser does). */
export function inlineScriptHashes(html: string): string[] {
    const hashes: string[] = [];
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const attrs = match[1];
        if (/\bsrc\s*=/i.test(attrs)) continue;
        const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
        // Data blocks (JSON-LD) are never executed; module/classic scripts are.
        if (type && type !== "module" && type !== "text/javascript" && type !== "application/javascript") continue;
        const body = match[2].replace(/\r\n?/g, "\n");
        hashes.push(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
    }
    return hashes;
}

/** Replaces a tag's attribute value; throws when the tag is missing, so a template change can't silently skip it. */
function setMeta(html: string, selector: RegExp, value: string): string {
    if (!selector.test(html)) throw new Error(`index.html is missing ${selector}`);
    return html.replace(selector, (_tag, before: string, after: string) => `${before}${escapeAttr(value)}${after}`);
}

function pageHtml(template: string, route: PublicRoute, body: string): string {
    const url = canonicalUrl(route.path);
    const isHome = route.path === "/";
    let html = template;
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(route.title)}</title>`);
    html = setMeta(html, /(<meta name="description" content=")[^"]*(")/, route.description);
    html = setMeta(html, /(<meta property="og:url" content=")[^"]*(")/, url);
    // The home page keeps its own share wording from index.html; the other pages share their own title and text.
    if (!isHome) {
        html = setMeta(html, /(<meta property="og:title" content=")[^"]*(")/, route.title);
        html = setMeta(html, /(<meta property="og:description" content=")[^"]*(")/, route.description);
        html = setMeta(html, /(<meta name="twitter:title" content=")[^"]*(")/, route.title);
        html = setMeta(html, /(<meta name="twitter:description" content=")[^"]*(")/, route.description);
    }
    const head = [`<link rel="canonical" href="${url}" />`];
    if (isHome) head.push(`<script type="application/ld+json">${JSON.stringify(STRUCTURED_DATA)}</script>`);
    html = html.replace("</head>", `    ${head.join("\n    ")}\n  </head>`);
    if (!html.includes('<div id="root"></div>')) throw new Error('index.html is missing <div id="root"></div>');
    return html.replace('<div id="root"></div>', () => `<div id="root">${body}</div>`);
}

/** The forced rewrites, inserted before the SPA fallback line (`/*`). */
function withRewrites(redirects: string): string {
    const lines = redirects.split(/\r?\n/);
    const fallback = lines.findIndex((line) => line.trim().startsWith("/*"));
    if (fallback < 0) throw new Error("_redirects has no /* fallback line");
    const rewrites = [
        "# Prerendered public pages (generated by scripts/seoPlugin.ts from src/publicRoutes.ts)",
        ...PUBLIC_ROUTES.map((route) => `${route.path}  /${prerenderFile(route.path)}  200!`),
    ];
    lines.splice(fallback, 0, ...rewrites);
    return lines.join("\n");
}

/** Renders the public pages in Node, with the same mode and env (VITE_DEMO_ENABLED...) as the build. */
async function renderPublicPages(root: string, mode: string, envDir: string | false): Promise<{bodies: Record<string, string>; appOnlyFiles: string[]}> {
    const server = await createServer({
        configFile: false,
        root,
        mode,
        envDir,
        logLevel: "error",
        appType: "custom",
        plugins: [react()],
        server: {middlewareMode: true, hmr: false, ws: false},
        // Nothing to pre-bundle: Node loads the dependencies directly (and the scan would trip on virtual:pwa-register)
        optimizeDeps: {noDiscovery: true, include: []},
    });
    try {
        const mod = await server.ssrLoadModule("/src/prerender.tsx") as {
            prerenderPaths: string[];
            renderPage: (path: string) => string;
            appOnlyFiles: string[];
        };
        const missing = PUBLIC_ROUTES.filter((route) => !mod.prerenderPaths.includes(route.path)).map((route) => route.path);
        if (missing.length) throw new Error(`src/prerender.tsx has no page for ${missing.join(", ")}`);
        const bodies = Object.fromEntries(PUBLIC_ROUTES.map((route) => [route.path, mod.renderPage(route.path)]));
        return {bodies, appOnlyFiles: mod.appOnlyFiles};
    } finally {
        await server.close();
    }
}

function checkPage(route: PublicRoute, html: string, csp: string, problems: string[], outDir: string, appOnlyFiles: string[]) {
    const file = prerenderFile(route.path);
    const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim());
    if (h1s.length !== 1) problems.push(`${file} has ${h1s.length} <h1> elements (expected exactly 1)`);
    else if (h1s[0] !== route.h1) problems.push(`${file} <h1> is "${h1s[0]}", expected "${route.h1}"`);
    const title = decodeEntities(/<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "");
    if (title !== route.title) problems.push(`${file} <title> is "${title}"`);
    const description = decodeEntities(/<meta name="description" content="([^"]*)"/i.exec(html)?.[1] ?? "");
    if (!description || description !== route.description) problems.push(`${file} has the wrong meta description`);
    const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
    if (canonicals.length !== 1 || canonicals[0] !== canonicalUrl(route.path)) problems.push(`${file} needs exactly one canonical ${canonicalUrl(route.path)}`);
    const rootContent = /<div id="root">([\s\S]*)<\/div>\s*<\/body>/i.exec(html)?.[1] ?? "";
    if (rootContent.replace(/<[^>]+>/g, "").trim().length < 50) problems.push(`${file} has (almost) no text in #root`);
    const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    if (route.path === "/" ? ldBlocks.length !== 1 : ldBlocks.length !== 0) problems.push(`${file}: JSON-LD belongs on the home page only, once`);
    for (const block of ldBlocks) {
        try {
            JSON.parse(block[1]);
        } catch {
            problems.push(`${file} has a JSON-LD block that is not valid JSON`);
        }
    }
    // Local files the page's content points to (img src, picture srcset, links to pictures) must exist in dist
    const refs = [...rootContent.matchAll(/\b(?:src|srcset|href)="(\/[^"#?]+\.[a-z0-9]+)"/gi)].map((m) => m[1]);
    for (const ref of new Set(refs)) {
        if (!existsSync(join(outDir, ref))) problems.push(`${file} refers to ${ref}, which is not in dist`);
    }
    const text = rootContent.replace(/<[^>]+>/g, " ");
    if (/airbnb/i.test(rootContent)) problems.push(`${file} mentions Airbnb`);
    if (/\/api\/ical\/[0-9a-f]{6,}/i.test(rootContent)) problems.push(`${file} shows a calendar feed link`);
    for (const appFile of appOnlyFiles) {
        if (rootContent.includes(appFile)) problems.push(`${file} uses ${appFile}, a screenshot of the signed-in app`);
    }
    if (!text.trim()) problems.push(`${file} has no text`);
    for (const hash of inlineScriptHashes(html)) {
        if (!csp.includes(hash)) problems.push(`inline script in ${file} needs ${hash} in the CSP script-src (public/_headers)`);
    }
}

export function seoPlugin(): Plugin {
    let outDir = "dist";
    let root = process.cwd();
    let mode = "production";
    let envDir: string | false = root;
    return {
        name: "roomtrack-seo",
        apply: "build",
        configResolved(config) {
            root = config.root;
            mode = config.mode;
            envDir = config.envDir;
            outDir = resolve(config.root, config.build.outDir);
        },
        async closeBundle() {
            const problems: string[] = [];
            const read = (file: string) => readFileSync(join(outDir, file), "utf8");

            // sitemap.xml
            const date = new Date().toISOString().slice(0, 10);
            writeFileSync(join(outDir, "sitemap.xml"), sitemapXml(date));
            const allowed = new Set(PUBLIC_ROUTES.map((route) => canonicalUrl(route.path)));
            const listed = [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
            for (const url of listed) {
                if (!allowed.has(url)) problems.push(`sitemap.xml lists ${url}, which is not in src/publicRoutes.ts`);
                if (!url.startsWith(`${SITE_URL}/`)) problems.push(`sitemap.xml URL is not absolute on ${SITE_URL}: ${url}`);
            }
            const appSource = readFileSync(resolve(root, "src/App.tsx"), "utf8");
            for (const route of PUBLIC_ROUTES) {
                if (!appSource.includes(`path="${route.path}"`)) problems.push(`public route ${route.path} has no <Route path="${route.path}"> in App.tsx`);
                if (route.description.length > MAX_DESCRIPTION) problems.push(`description for ${route.path} is ${route.description.length} characters (max ${MAX_DESCRIPTION})`);
                if (!route.title.trim() || !route.description.trim()) problems.push(`empty title or description for ${route.path}`);
            }

            // robots.txt
            if (!existsSync(join(outDir, "robots.txt"))) problems.push("robots.txt is missing (public/robots.txt)");
            else if (!read("robots.txt").includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) problems.push("robots.txt has no Sitemap line");

            // index.html (the app shell) vs. publicRoutes "/"
            const shell = read("index.html");
            const home = PUBLIC_ROUTES.find((route) => route.path === "/");
            const title = decodeEntities(/<title>([^<]*)<\/title>/i.exec(shell)?.[1] ?? "");
            const description = decodeEntities(/<meta name="description" content="([^"]*)"/i.exec(shell)?.[1] ?? "");
            if (!home || title !== home.title) problems.push(`index.html <title> "${title}" differs from "/" in src/publicRoutes.ts`);
            if (!home || description !== home.description) problems.push(`index.html meta description differs from "/" in src/publicRoutes.ts`);

            // CSP hashes for the shell's inline scripts
            const csp = read("_headers").split(/\r?\n/).find((line) => line.trim().startsWith("Content-Security-Policy:")) ?? "";
            if (!csp) problems.push("_headers has no Content-Security-Policy line");
            for (const hash of inlineScriptHashes(shell)) {
                if (!csp.includes(hash)) problems.push(`inline script in index.html needs ${hash} in the CSP script-src (public/_headers)`);
            }

            // Prerendered public pages + their rewrites
            const {bodies, appOnlyFiles} = await renderPublicPages(root, mode, envDir);
            mkdirSync(join(outDir, PRERENDER_DIR), {recursive: true});
            for (const route of PUBLIC_ROUTES) {
                const html = pageHtml(shell, route, bodies[route.path]);
                writeFileSync(join(outDir, prerenderFile(route.path)), html);
                checkPage(route, html, csp, problems, outDir, appOnlyFiles);
            }
            const redirects = withRewrites(read("_redirects"));
            writeFileSync(join(outDir, "_redirects"), redirects);
            for (const route of PUBLIC_ROUTES) {
                if (!redirects.includes(`${route.path}  /${prerenderFile(route.path)}  200!`)) problems.push(`_redirects has no rewrite for ${route.path}`);
            }

            if (problems.length) throw new Error(`SEO/CSP build check failed:\n- ${problems.join("\n- ")}`);
        },
    };
}
