import {describe, expect, it} from "vitest";
import indexHtml from "../../index.html?raw";
import headers from "../../public/_headers?raw";

// Audit SEC-06 / FE-04: public/_headers carries a Content-Security-Policy that allows index.html's inline theme script
// by its hash. Editing that script without updating the hash would block it in production (dark-mode flash).
const csp = headers.split("\n").find((line: string) => line.trim().startsWith("Content-Security-Policy:")) ?? "";

async function sha256Base64(text: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    return btoa(String.fromCharCode(...digest));
}

describe("public/_headers security headers", () => {
    it("allows exactly the inline scripts that index.html has, by hash", async () => {
        // Browsers hash the script text after the HTML parser turned CRLF into LF (a Windows checkout has CRLF)
        const inline = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1].replace(/\r\n?/g, "\n"));
        expect(inline.length).toBeGreaterThan(0);
        for (const body of inline) {
            const hash = `'sha256-${await sha256Base64(body)}'`;
            expect(csp, "update the hash in public/_headers after changing index.html's inline script").toContain(hash);
        }
        expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
        expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    });

    it("forbids framing and other sites' scripts, and sends the other hardening headers", () => {
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toMatch(/connect-src 'self' https:\/\/api\.roomtrack\.app;/);
        expect(headers).toContain("Referrer-Policy: strict-origin-when-cross-origin");
        expect(headers).toContain("X-Content-Type-Options: nosniff");
        expect(headers).toMatch(/Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\)/);
    });
});
