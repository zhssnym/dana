/*
The vitest leg with a guard on its own completeness.

**Why this file exists.** On 2026-08-24 a serial PGlite run reported

    Test Files  223 passed (228)
    Tests       1636 passed (1665)

emitted five `[vitest-pool]: Worker forks emitted error / Worker exited
unexpectedly`, printed its own warning that this "might cause false positive
tests", and returned **exit code 0**. Five files never ran. CI's test steps
read nothing but the exit code, so a run in that state reports success having
measured 223 of 228 files, and nothing anywhere says so. That is the false
green the protocol's definition of done exists to forbid, arriving through
the one door nobody was watching.

The workflow already guards the other false green, an empty
TEST_DATABASE_URL silently re-running the PGlite leg twice; this guards the
one underneath it.

**What it checks, and why that is the right check.** Vitest's summary line
carries both halves of the fact: the categories it is reporting, and the
total it collected in parentheses. A complete run accounts for every
collected file in some category. The losing run reported 223 passed against a
collected 228 and named no category for the other five, which is exactly the
arithmetic this refuses. So the rule is that the reported categories sum to
the total, on both the file line and the test line.

**Deliberately conservative in one direction.** This can turn a false green
into a red and can never turn a real green into a red by itself: a non-zero
exit from vitest passes straight through untouched, and a summary this cannot
find is passed through rather than invented into a failure. A guard that
fails when it is confused would be a worse gate than no guard, because the
first flaky parse would teach everyone to ignore it.

Skipped files count toward the total on purpose. A file skipped on purpose is
accounted for; a file that vanished is not.

Spec: protocol section 4 (the definition of done and its false-green rule),
11.10 and 11.11 (the legs and what runs them), and the SESSION-LOG entry of
2026-08-24 that records the run this was written from.
*/
import { spawn } from 'node:child_process'
import process from 'node:process'
import { URL, fileURLToPath } from 'node:url'

/**
 * The colour vitest writes around its summary. Built from a char code rather
 * than written as an escape in a literal, because a control character inside
 * a regular expression is a lint error, and an invisible one in source is
 * worse than a verbose one.
 */
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

/** The summary lines vitest prints, e.g. "Test Files  228 passed (228)". */
const SUMMARY = /^\s*(Test Files|Tests)\s+(.+?)\s+\((\d+)\)\s*$/

/**
 * The categories in a summary line, as {label, count} pairs. Vitest writes
 * them as "223 passed | 5 skipped", one pipe-separated clause each.
 */
function categories(body) {
  return body
    .split('|')
    .map((clause) => clause.trim())
    .map((clause) => /^(\d+)\s+(.+)$/.exec(clause))
    .filter((match) => match !== null)
    .map((match) => ({ count: Number(match[1]), label: match[2] }))
}

const args = process.argv.slice(2)
// vitest's own entry, run by this node rather than through npx: spawning a
// .cmd shim fails with EINVAL on Node 22 for Windows, and a shell would put
// quoting between this file and the arguments it forwards.
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
const child = spawn(process.execPath, [vitest, 'run', ...args], {
  stdio: ['inherit', 'pipe', 'pipe'],
})

let captured = ''
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    captured += chunk
    process.stdout.write(chunk)
  })
}

child.on('close', (code) => {
  // A real failure passes straight through. Nothing below can rescue it, and
  // nothing below should second-guess it.
  if (code !== 0) process.exit(code ?? 1)

  const lines = captured.split(/\r?\n/).map((line) => line.replace(ANSI, ''))
  const complaints = []

  for (const line of lines) {
    const match = SUMMARY.exec(line)
    if (match === null) continue
    const [, what, body, total] = match
    const parts = categories(body)
    if (parts.length === 0) continue
    const accounted = parts.reduce((sum, part) => sum + part.count, 0)
    if (accounted !== Number(total)) {
      complaints.push(
        `${what}: vitest collected ${total} and accounted for ${accounted} ` +
          `(${parts.map((part) => `${part.count} ${part.label}`).join(', ')}). ` +
          `${Number(total) - accounted} never reported a result.`,
      )
    }
  }

  if (complaints.length === 0) process.exit(0)

  process.stderr.write(
    '\n' +
      'The suite exited 0 while part of it never ran, which is the false green\n' +
      'of 2026-08-24 (see app/scripts/run-suite.mjs and the SESSION-LOG entry).\n' +
      'Vitest reports a total it collected and the categories it resolved; those\n' +
      'disagree here:\n\n' +
      complaints.map((line) => `  ${line}\n`).join('') +
      '\nThis is usually a worker fork dying: look above for "[vitest-pool]:\n' +
      'Worker forks emitted error" or "Worker exited unexpectedly". Rerun the\n' +
      'affected files alone before believing anything about them.\n',
  )
  process.exit(1)
})
