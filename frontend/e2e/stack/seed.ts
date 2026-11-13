// Deterministic seed for the LOCAL E2E stack (audit-fe-db / audit-fe-api). Wipes every row, then creates:
//   owner A  owner-a@example.test  2 properties, 5 rooms, 30 reservations (paid, confirmed, blocked, cancelled,
//            imported from Booking.com, one "check the price", one with no amount, Cyrillic and long names)
//   owner B  owner-b@example.test  1 property, 2 rooms, 3 reservations (for cross-tenant checks)
//   owner Z  owner-zero@example.test  verified, no properties (onboarding)
//   owner P  owner-perf@example.test  1 property, 30 rooms, 1,050 reservations (performance)
// All passwords are TEST_PASSWORD from e2e/support/backend.ts: test values for this throwaway database only.
// Dates are relative to today (local time) so the calendar always shows them. IDs go to e2e/.work/run/seed.json.
//
// Usage: node e2e/stack/seed.ts   (from frontend/; Node 24 runs TypeScript directly)
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
    TEST_PASSWORD, apiOk, createProperty, createReservation, createVerifiedOwner, day, psql, renameUnit,
    type NewReservation, type Reservation, type Unit,
} from "../support/backend.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SEED_FILE = path.join(here, "..", ".work", "run", "seed.json");

export const OWNERS = {
    a: {email: "owner-a@example.test", fullName: "Ana Owner"},
    b: {email: "owner-b@example.test", fullName: "Boris Owner"},
    zero: {email: "owner-zero@example.test", fullName: "Zoran Empty"},
    perf: {email: "owner-perf@example.test", fullName: "Petra Perf"},
};

async function main() {
    const started = Date.now();
    // Every table hangs off owner (directly or through app_user / unit), so this empties the database.
    psql("TRUNCATE owner, app_user CASCADE;");

    // ---------- owner A ----------
    const a = await createVerifiedOwner({...OWNERS.a, password: TEST_PASSWORD});
    const lake = await createProperty(a.token, "Lakeside Apartments", 3, "Kej Makedonija 1, Ohrid");
    const town = await createProperty(a.token, "Old Town House", 2, "Ulica 7, Bitola");
    const [lake1, lake2, lake3] = await Promise.all([
        renameUnit(a.token, lake.units[0], "Lake Studio", 2),
        renameUnit(a.token, lake.units[1], "Lake Family Room", 5),
        renameUnit(a.token, lake.units[2], "Lake Attic", 3),
    ]);
    const [town1, town2] = await Promise.all([
        renameUnit(a.token, town.units[0], "Town Double", 2),
        renameUnit(a.token, town.units[1], "Town Suite", 4),
    ]);

    // Six stays per room, 3 nights each with a free day in between, from 9 days ago: [d, d+3), [d+4, d+7), ...
    const rooms: Unit[] = [lake1, lake2, lake3, town1, town2];
    const guestNames = [
        "Ana Petrova", "Marko Jovanov", "Ивана Стојанова", "Elena Nikolova", "Jean-Luc Moreau",
        "Stefan Trajkovski", "Mia Müller", "Олег Иванов", "Sara Ristova",
        "Maximilian Alexander von Hohenberg-Lichtenstein the Third", "Lea Petrovska", "Nikola Georgiev",
    ];
    const created: (Reservation & {label: string})[] = [];
    let n = 0;
    for (const room of rooms) {
        for (let i = 0; i < 6; i++) {
            const start = -9 + i * 4;
            const kind = (i + rooms.indexOf(room)) % 6; // 0 confirmed+total, 1 paid, 2 confirmed per-night, 3 blocked, 4 no amount, 5 per-guest
            const r: NewReservation = {
                unitId: room.id, checkIn: day(start), checkOut: day(start + 3),
                guestName: kind === 3 ? "" : guestNames[n % guestNames.length], guestsCount: 2,
            };
            if (kind === 0) Object.assign(r, {totalAmount: 300, nightlyRate: 100, pricePerGuest: 50});
            if (kind === 1) Object.assign(r, {status: "PAID", totalAmount: 240, nightlyRate: 80, pricePerGuest: 40});
            if (kind === 2) Object.assign(r, {totalAmount: 165, nightlyRate: 55, pricePerGuest: 27.5, guestEmail: "guest@example.test", guestPhone: "+389 70 111 222", notes: "Late arrival"});
            if (kind === 3) Object.assign(r, {status: "BLOCK"});
            if (kind === 5) Object.assign(r, {totalAmount: 100, nightlyRate: 33.33, pricePerGuest: 16.67});
            const saved = await createReservation(a.token, r);
            created.push({...saved, label: `${room.name}#${i}`});
            n++;
        }
    }
    // Three cancelled (soft), three imported from Booking.com, one flagged "check the price".
    const cancelled = [created[2], created[9], created[20]];
    for (const r of cancelled) await apiOk("DELETE", `/api/reservations/${r.id}`, a.token);
    const imported = [created[7], created[14], created[25]];
    psql(`UPDATE reservation SET source = 'BOOKING' WHERE id IN (${imported.map((r) => `'${r.id}'`).join(",")});
          UPDATE reservation SET guest_name = 'CLOSED - Not available' WHERE id = '${imported[1].id}';
          UPDATE reservation SET price_needs_review = true WHERE id = '${imported[0].id}';`);

    // ---------- owner B ----------
    const b = await createVerifiedOwner({...OWNERS.b, password: TEST_PASSWORD});
    const bHouse = await createProperty(b.token, "B Guesthouse", 2, "Skopje");
    const bRes: Reservation[] = [];
    for (let i = 0; i < 3; i++) {
        bRes.push(await createReservation(b.token, {
            unitId: bHouse.units[i % 2].id, checkIn: day(i * 5), checkOut: day(i * 5 + 2),
            guestName: `B Guest ${i + 1}`, totalAmount: 200, nightlyRate: 100, pricePerGuest: 50,
        }));
    }

    // ---------- owner Z (no properties) ----------
    await createVerifiedOwner({...OWNERS.zero, password: TEST_PASSWORD});

    // ---------- owner P (performance: 30 rooms, 1,050 reservations, inserted in SQL) ----------
    const p = await createVerifiedOwner({...OWNERS.perf, password: TEST_PASSWORD});
    const perf = await createProperty(p.token, "Perf Hotel", 30, "Load street 1");
    const perfOwner = psql(`SELECT owner_id FROM unit WHERE id = '${perf.units[0].id}';`);
    psql(`INSERT INTO reservation (id, unit_id, owner_id, stay_range, status, source, guest_name, guests_count,
                                   price_per_guest, nightly_rate, total_amount, created_at, updated_at, price_needs_review)
          SELECT gen_random_uuid(), u.id, u.owner_id,
                 daterange(current_date - 60 + g * 4, current_date - 60 + g * 4 + 3, '[)'),
                 CASE WHEN g % 5 = 0 THEN 'PAID' WHEN g % 11 = 0 THEN 'BLOCK' ELSE 'CONFIRMED' END,
                 CASE WHEN g % 7 = 0 THEN 'BOOKING' ELSE 'DIRECT' END,
                 'Perf guest ' || g, 2, 50, 100, 300, now(), now(), false
          FROM unit u CROSS JOIN generate_series(0, 34) g
          WHERE u.owner_id = '${perfOwner}';`);
    const perfCount = Number(psql(`SELECT count(*) FROM reservation WHERE owner_id = '${perfOwner}';`));

    const seed = {
        seededAt: new Date().toISOString(),
        today: day(0),
        password: TEST_PASSWORD,
        a: {
            ...OWNERS.a,
            properties: {lake: lake.property, town: town.property},
            units: {lake1, lake2, lake3, town1, town2},
            reservations: created.map(({id, unitId, checkIn, checkOut, status, guestName, label}) => ({id, unitId, checkIn, checkOut, status, guestName, label})),
            cancelledIds: cancelled.map((r) => r.id),
            importedIds: imported.map((r) => r.id),
        },
        b: {...OWNERS.b, property: bHouse.property, units: bHouse.units, reservations: bRes.map((r) => ({id: r.id, unitId: r.unitId}))},
        zero: OWNERS.zero,
        perf: {...OWNERS.perf, property: perf.property, unitCount: perf.units.length, reservationCount: perfCount},
    };
    fs.mkdirSync(path.dirname(SEED_FILE), {recursive: true});
    fs.writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
    console.log(`seeded in ${Date.now() - started} ms: A ${created.length} reservations (${cancelled.length} cancelled), B ${bRes.length}, perf ${perfCount} → ${SEED_FILE}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
