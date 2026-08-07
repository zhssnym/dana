import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    /*
    Vitest's default is 5000 ms, which is not a margin this suite has. Measured
    over five consecutive runs by the Adversarial Test engineer, who raised this
    under protocol section 3 because this file is Platform's: AC-114's slowest
    case ranged 1941 ms to 5811 ms and survives only because that file carries
    its own 120 second override, and AC-070's ranged 1237 ms to 2784 ms with no
    override at all. Both are database cases whose cost is PGlite's, so the
    spread is the machine's mood rather than anything the assertions control.

    What makes it worth a config line rather than a shrug: a case that exceeds
    its timeout reports as an Error, not an assertion, so it never says what it
    was measuring. The run differs from the previous one by exactly one failure
    with nothing naming what moved, which is the most expensive kind of red.

    Global rather than per-case, because the per-case version is one fix written
    into every file that ever gets slow, and leaves the next file written
    exposed again. 30 seconds gives the slowest observed case a fivefold margin
    while still failing a genuinely hung test quickly. Files needing more say so
    themselves; AC-114's 120 second override is the standing example, and a
    per-file setting still wins over this one.

    Hook timeouts keep Vitest's 10000 ms default: nothing has measured the
    fixture seeding against it, and a number nobody measured is the kind this
    comment exists to argue against.
    */
    testTimeout: 30_000,
    include: [
      'src/**/*.test.{ts,tsx}',
      'db/**/*.test.{ts,tsx}',
      'tests/**/*.test.{ts,tsx}',
    ],
  },
})
