// Prints a summary of e2e/.work/results.json: counts per project, every expected failure (test.fail with
// its FE-xx reason and the actual error, to check it fails for the right reason) and the slowest tests.
// Usage: node e2e/support/summarize.mjs [path]
import fs from 'node:fs'
const file = process.argv[2] ?? 'e2e/.work/results.json'
const report = JSON.parse(fs.readFileSync(file, 'utf8'))
const counts = {}
const fails = []
const slow = []
const walk = (suite, trail = []) => {
  for (const s of suite.suites ?? []) walk(s, [...trail, s.title])
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests) {
      const res = t.results.at(-1)
      if (!res) continue
      const c = (counts[t.projectName] ??= { passed: 0, expectedFail: 0, failed: 0, skipped: 0, flaky: 0 })
      if (t.status === 'skipped') c.skipped++
      else if (t.status === 'unexpected') c.failed++
      else if (t.status === 'flaky') c.flaky++
      else if (t.expectedStatus === 'failed') c.expectedFail++
      else c.passed++
      const title = `[${t.projectName}] ${spec.file} › ${spec.title}`
      if (t.expectedStatus === 'failed') {
        const why = t.annotations.find((a) => a.type === 'fail')?.description ?? ''
        fails.push(`${title}\n    reason: ${why}\n    actual: ${(res.error?.message ?? '(no error)').replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 3).join(' / ').slice(0, 260)}`)
      }
      if (t.status === 'unexpected') fails.push(`UNEXPECTED ${title}\n    ${(res.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 6).join(' / ').slice(0, 600)}`)
      slow.push([res.duration, title])
    }
  }
}
walk(report)
console.log(JSON.stringify(counts, null, 1))
console.log(fails.join('\n'))
console.log('slowest:\n' + slow.sort((a, b) => b[0] - a[0]).slice(0, 8).map(([d, t]) => `  ${d} ms ${t}`).join('\n'))
