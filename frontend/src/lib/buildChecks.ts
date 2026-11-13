// Build-time checks, used by vite.config.ts (not by the app itself).

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

/**
 * Audit SEC-02: a production build without VITE_API_URL (or with the localhost value from frontend/.env) shipped a
 * bundle that called http://localhost:8080. Returns why the address is unusable for a production build, or null.
 * `allowLocal` is for the local E2E stack only (VITE_ALLOW_LOCAL_API=1), which builds against 127.0.0.1 on purpose.
 */
export function productionApiUrlProblem(mode: string, apiUrl: string | undefined, allowLocal = false): string | null {
    if (mode !== "production") return null;
    if (!apiUrl || !apiUrl.trim()) return "VITE_API_URL is not set";
    let url: URL;
    try {
        url = new URL(apiUrl.trim());
    } catch {
        return `VITE_API_URL is not a full address (${apiUrl})`;
    }
    const local = LOCAL_HOSTS.has(url.hostname) || url.hostname.endsWith(".localhost");
    if (local) return allowLocal ? null : `VITE_API_URL points to this machine (${url.origin})`;
    if (url.protocol !== "https:") return `VITE_API_URL must be https (${url.origin})`;
    return null;
}
