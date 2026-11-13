import { defineConfig } from 'vitest/config'

const tzProject = (name: string, tz: string, include: string[]) => ({
  test: {
    name,
    environment: 'node' as const,
    include,
    pool: 'forks' as const,
    setupFiles: ['./test/setupTz.ts'],
    env: { TEST_TZ: tz },
  },
})

const ALL = ['src/**/*.test.ts']
// The files whose results can depend on the local time zone.
const TZ_SENSITIVE = [
  'src/lib/dates.test.ts',
  'src/lib/pricing.test.ts',
  'src/lib/stayDates.test.ts',
  'src/lib/timezone.test.ts',
]

export default defineConfig({
  test: {
    projects: [
      tzProject('unit', 'Europe/Skopje', ALL),
      tzProject('tz-la', 'America/Los_Angeles', TZ_SENSITIVE),
      tzProject('tz-kiritimati', 'Pacific/Kiritimati', TZ_SENSITIVE),
    ],
  },
})
