/*
The browser leg's TCP port, resolved in one place because two places drift.

**Why this file exists.** `npm run gate` is the only thing that produces a
record, and `GATE: green` is the only thing that opens a pull request, so until
issue #254 every branch on a machine queued through one slot. The thing that
made it a slot was a constant: the browser leg's port was written into
playwright.config.ts, Playwright never reuses a server, and gate.mjs refuses to
start the leg when anything answers there. That refusal is right and it stays —
two browser legs on one port seed and truncate each other's database underneath
the browser, and CLAUDE.md records what that looks like from the report, which
is crashed pages and assertions timing out at two minutes that pass in three
seconds alone. What was wrong was not the check. It was that the only way to
have two gates was to not have two gates.

The port is now `DANA_GATE_PORT`, and **the default is what it always was**, so
every command, script and habit that existed before this file means exactly
what it meant before. Setting it is how a second lane gets a port of its own.

**The number lives here and nowhere else, and that is the whole point of a
separate module.** gate.mjs reads it to decide what to probe, what to name in
its record and what to hand the child process; playwright.config.ts reads it to
decide what to serve and where to point the browser. Two files each spelling
their own fallback would agree until the day one of them did not, and the
failure of that day is a gate that probes one port and runs on another — the
exact collision this mechanism exists to prevent, arriving through the
mechanism itself. The issue weighed a generated second config against one
config that reads a variable and chose the second for this reason; a shared
resolver is that argument carried one step further.

`tests/guards/guard-gate-port.test.ts` is what holds it: it resolves both
readers and fails if they disagree, and it fails if either file grows a port
literal of its own again.
*/
import process from 'node:process'

/**
 * What the port was before it was a setting, and what it is when nobody says.
 *
 * Not 3000, which `npm run dev` already uses. The two cannot run at once
 * anyway, both wanting the same single-connection PGlite directory (11.15),
 * but a stale dev API answering on 3000 would otherwise be a plausible thing
 * for the browser leg to attach to, and the failure would look like the
 * application misbehaving rather than like the wrong application.
 */
export const DEFAULT_GATE_PORT = 3100

/** A whole number and nothing else: no sign, no exponent, no hex, no decimal point. */
const DIGITS = /^[0-9]+$/

/**
 * The browser leg's port for this process.
 *
 * Absent or blank is the default, and that is what makes an environment
 * without `DANA_GATE_PORT` behave exactly as it did before the variable
 * existed. Blank as well as absent because `DANA_GATE_PORT=` in a shell and
 * `env: { DANA_GATE_PORT: '' }` in a spawn are both how a caller says "I am
 * not choosing one" — the same spelling playwright.config.ts already uses to
 * say it about `TEST_DATABASE_URL`.
 *
 * **Anything else present and unusable throws rather than quietly
 * defaulting.** A typo that fell back would put this run on the port belonging
 * to the gate it was trying to get out of the way of, and the report would
 * then look like crashed pages rather than like a typo — which is precisely
 * the failure the occupancy precondition exists to refuse, reintroduced one
 * layer above it. Failing at the first line is the cheap version of that.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {number}
 */
export function gatePort(env = process.env) {
  const raw = env.DANA_GATE_PORT
  if (raw === undefined || raw.trim() === '') return DEFAULT_GATE_PORT

  const trimmed = raw.trim()
  const port = Number(trimmed)
  if (!DIGITS.test(trimmed) || port < 1 || port > 65535) {
    throw new Error(
      `DANA_GATE_PORT is ${JSON.stringify(raw)}, which is not a TCP port. Give it a whole ` +
        `number from 1 to 65535, or leave it unset for the default of ${DEFAULT_GATE_PORT}.`,
    )
  }
  return port
}
