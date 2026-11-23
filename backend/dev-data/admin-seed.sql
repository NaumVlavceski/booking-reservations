-- LOCAL DEVELOPMENT ONLY. Never run this against production.
-- About 500 fake owners (emails seed_NNNN@example.test) with properties, rooms, reservations, calendars, conflicts and
-- email history, to try the admin panel and measure its queries. Not a Flyway migration; excluded from the Docker
-- image (backend/.dockerignore). Re-running it first removes the previous seed owners.
--
--   psql -h localhost -U booking -d booking -f backend/dev-data/admin-seed.sql
--
-- Fixed random seed, so every run creates the same data.

SELECT setseed(0.42);

-- Remove an earlier seed (children first; same order as the app's account deletion)
DELETE FROM email_log WHERE lower(to_address) LIKE 'seed\_%@example.test';
DELETE FROM external_event WHERE external_calendar_id IN (SELECT c.id FROM external_calendar c JOIN unit x ON x.id = c.unit_id
    JOIN app_user u ON u.owner_id = x.owner_id WHERE u.email LIKE 'seed\_%@example.test');
DELETE FROM sync_conflict WHERE owner_id IN (SELECT owner_id FROM app_user WHERE email LIKE 'seed\_%@example.test');
DELETE FROM external_calendar WHERE unit_id IN (SELECT x.id FROM unit x JOIN app_user u ON u.owner_id = x.owner_id
    WHERE u.email LIKE 'seed\_%@example.test');
DELETE FROM reservation WHERE owner_id IN (SELECT owner_id FROM app_user WHERE email LIKE 'seed\_%@example.test');
DELETE FROM unit WHERE owner_id IN (SELECT owner_id FROM app_user WHERE email LIKE 'seed\_%@example.test');
DELETE FROM property WHERE owner_id IN (SELECT owner_id FROM app_user WHERE email LIKE 'seed\_%@example.test');
CREATE TEMP TABLE seed_old AS SELECT id, owner_id FROM app_user WHERE email LIKE 'seed\_%@example.test';
DELETE FROM app_user WHERE id IN (SELECT id FROM seed_old);
DELETE FROM owner WHERE id IN (SELECT owner_id FROM seed_old);
DROP TABLE seed_old;

DO $$
DECLARE
    first_names TEXT[] := ARRAY['Ana', 'Marko', 'Elena', 'Goran', 'Stefan', 'Ivana', 'Dragan', 'Biljana', 'Nikola',
        'Marta', 'Ivan', 'Sara', 'Petar', 'Jana', 'Banana', 'Aleksandar', 'Мила', 'Петар', 'Ана', 'Христина'];
    last_names TEXT[] := ARRAY['Petrovska', 'Stojanov', 'Trajkova', 'Ilievski', 'Naumov', 'Kostova', 'Pavlov',
        'Todorova', 'Jovanov', 'Ristova', 'Стојанов', 'Николовска', 'O''Brien', 'Under_score', 'Hundred%'];
    i INT;
    owner_id UUID;
    user_id UUID;
    prop_id UUID;
    unit_id UUID;
    cal_id UUID;
    created TIMESTAMP;
    n_props INT;
    n_units INT;
    n_res INT;
    start_day DATE;
    p INT;
    u INT;
    r INT;
BEGIN
    FOR i IN 1..500 LOOP
        owner_id := gen_random_uuid();
        user_id := gen_random_uuid();
        created := (now() - (random() * interval '60 days'))::timestamp;
        INSERT INTO owner (id, contact_phone, active, created_at)
        VALUES (owner_id, CASE WHEN random() < 0.7 THEN '+389 7' || (random() * 9)::int || ' ' || lpad((random() * 999)::int::text, 3, '0')
                                   || '-' || lpad((random() * 999)::int::text, 3, '0') END, TRUE, created);
        INSERT INTO app_user (id, owner_id, email, password_hash, full_name, role, active, created_at, email_verified_at, last_seen_at)
        VALUES (user_id, owner_id, 'seed_' || lpad(i::text, 4, '0') || '@example.test',
                'not-a-real-hash', -- seed owners can't sign in
                first_names[1 + (random() * (array_length(first_names, 1) - 1))::int] || ' ' ||
                last_names[1 + (random() * (array_length(last_names, 1) - 1))::int],
                'OWNER', TRUE, created,
                CASE WHEN random() < 0.85 THEN created + interval '5 minutes' END,
                CASE WHEN random() < 0.8 THEN now() - (random() * interval '30 days') END);

        n_props := CASE WHEN random() < 0.2 THEN 0 ELSE 1 + (random() * 2)::int END;
        FOR p IN 1..n_props LOOP
            prop_id := gen_random_uuid();
            INSERT INTO property (id, owner_id, name, address, created_at) VALUES (prop_id, owner_id, 'House ' || p, 'Lake St ' || p, created);
            n_units := CASE WHEN random() < 0.1 THEN 0 ELSE 1 + (random() * 3)::int END;
            FOR u IN 1..n_units LOOP
                unit_id := gen_random_uuid();
                INSERT INTO unit (id, property_id, owner_id, name, capacity, created_at)
                VALUES (unit_id, prop_id, owner_id, 'Studio ' || p || '.' || u, 2, created);
                IF random() < 0.5 THEN
                    cal_id := gen_random_uuid();
                    INSERT INTO external_calendar (id, unit_id, platform, ics_url, consecutive_failures, last_synced_at,
                                                   last_success_at, last_error_at, last_error_message, created_at)
                    VALUES (cal_id, unit_id, 'BOOKING', 'https://ical.booking.com/v1/export?t=seed-' || gen_random_uuid(),
                            CASE WHEN random() < 0.1 THEN 3 ELSE 0 END, now() - interval '5 minutes',
                            now() - (random() * interval '3 days'), CASE WHEN random() < 0.2 THEN now() - interval '1 day' END,
                            CASE WHEN random() < 0.2 THEN 'Feed returned HTTP 403' END, created);
                    IF random() < 0.05 THEN
                        INSERT INTO sync_conflict (id, owner_id, unit_id, external_calendar_id, external_uid, platform,
                                                   incoming_start, incoming_end, kind, status, created_at)
                        VALUES (gen_random_uuid(), owner_id, unit_id, cal_id, 'seed-' || gen_random_uuid(), 'BOOKING',
                                current_date + 10, current_date + 12, 'NEW_OVERLAP', 'OPEN', now());
                    END IF;
                END IF;
                n_res := (random() * 15)::int;
                start_day := current_date - 120;
                FOR r IN 1..n_res LOOP
                    start_day := start_day + 1 + (random() * 6)::int;
                    INSERT INTO reservation (id, unit_id, owner_id, stay_range, status, source, guest_name, total_amount,
                                             created_at, updated_at)
                    VALUES (gen_random_uuid(), unit_id, owner_id, daterange(start_day, start_day + 3),
                            CASE WHEN random() < 0.1 THEN 'CANCELLED' ELSE 'CONFIRMED' END, 'DIRECT',
                            'Guest ' || r, (50 + random() * 400)::int, created, created + random() * (now() - created));
                    start_day := start_day + 3;
                END LOOP;
            END LOOP;
        END LOOP;

        INSERT INTO email_log (owner_id, to_address, type, subject, status, attempts, created_at)
        VALUES (owner_id, 'seed_' || lpad(i::text, 4, '0') || '@example.test', 'VERIFY_EMAIL', 'Your RoomTrack verification code',
                CASE WHEN random() < 0.05 THEN 'BOUNCED' ELSE 'DELIVERED' END, 1, created);
    END LOOP;
END $$;

ANALYZE;
SELECT count(*) AS seed_owners FROM app_user WHERE email LIKE 'seed\_%@example.test';
