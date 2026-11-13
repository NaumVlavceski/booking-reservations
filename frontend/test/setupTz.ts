// Vitest setup (see vitest.config.ts): pins the process time zone for this project before any test code runs.
// Node re-reads TZ when process.env.TZ is assigned, so Date and Intl follow it from here on.
const tz = process.env.TEST_TZ
if (tz) process.env.TZ = tz
