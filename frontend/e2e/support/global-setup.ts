import {execFileSync} from "node:child_process";
import path from "node:path";
import {API_URL} from "./backend.ts";

// Checks that the local stack is up, then re-seeds it (owners A, B, Z and the performance owner) so every run
// starts from the same data. E2E_SKIP_SEED=1 keeps the current data.
export default async function globalSetup() {
    try {
        const res = await fetch(`${API_URL}/actuator/health`);
        if (!res.ok) throw new Error(`health ${res.status}`);
    } catch (err) {
        throw new Error(`The local E2E API (${API_URL}) is not up. Run: bash e2e/stack/up.sh  (${String(err)})`, {cause: err});
    }
    if (process.env.E2E_SKIP_SEED === "1") return;
    execFileSync(process.execPath, [path.join(import.meta.dirname, "..", "stack", "seed.ts")], {stdio: "inherit"});
}
