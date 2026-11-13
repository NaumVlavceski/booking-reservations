import fs from "node:fs";
import path from "node:path";

// The ids written by e2e/stack/seed.ts.
export interface SeedRes {id: string; unitId: string; checkIn: string; checkOut: string; status: string; guestName: string; label: string}
export interface SeedUnit {id: string; propertyId: string; name: string; capacity: number; token: string}
export interface Seed {
    today: string;
    password: string;
    a: {
        email: string; fullName: string;
        properties: {lake: {id: string; name: string}; town: {id: string; name: string}};
        units: {lake1: SeedUnit; lake2: SeedUnit; lake3: SeedUnit; town1: SeedUnit; town2: SeedUnit};
        reservations: SeedRes[]; cancelledIds: string[]; importedIds: string[];
    };
    b: {email: string; fullName: string; property: {id: string; name: string}; units: SeedUnit[]; reservations: {id: string; unitId: string}[]};
    zero: {email: string; fullName: string};
    perf: {email: string; fullName: string; property: {id: string; name: string}; unitCount: number; reservationCount: number};
}

let cached: Seed | null = null;
export function seed(): Seed {
    cached ??= JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", ".work", "run", "seed.json"), "utf8")) as Seed;
    return cached;
}
