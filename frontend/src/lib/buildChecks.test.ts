import {describe, expect, it} from "vitest";
import {productionApiUrlProblem} from "./buildChecks";

// SEC-02: a production build must never ship a bundle that calls localhost.
describe("productionApiUrlProblem", () => {
    it("refuses a production build without a real https API address", () => {
        expect(productionApiUrlProblem("production", undefined)).toMatch(/not set/);
        expect(productionApiUrlProblem("production", "  ")).toMatch(/not set/);
        expect(productionApiUrlProblem("production", "http://localhost:8080")).toMatch(/this machine/);
        expect(productionApiUrlProblem("production", "http://127.0.0.1:4180")).toMatch(/this machine/);
        expect(productionApiUrlProblem("production", "/api")).toMatch(/full address/);
        expect(productionApiUrlProblem("production", "http://api.roomtrack.app")).toMatch(/https/);
    });

    it("accepts the real address, development builds, and the local E2E stack when it opts in", () => {
        expect(productionApiUrlProblem("production", "https://api.roomtrack.app")).toBeNull();
        expect(productionApiUrlProblem("development", "http://localhost:8080")).toBeNull();
        expect(productionApiUrlProblem("production", "http://127.0.0.1:4180", true)).toBeNull();
    });
});
