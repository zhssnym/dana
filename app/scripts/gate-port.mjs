/*
The browser leg's TCP port, resolved in one place because two places drift.

**Why this file exists.** Two browser legs on one port seed and truncate each
other's database underneath the browser, which looks from the report like
crashed pages and assertions timing out at two minutes that pass in three
seconds alone (docs/troubleshooting.md). Playwright never reuses a server, and
gate.mjs refuses to start the leg when anything answers on the port. So a
second parallel gate needs a port of its own, and that is `DANA_GATE_PORT`
(issue #254); unset, it is the default below.

**The number lives here and nowhere else, and that is the whole point of a
separate module.** gate.mjs reads it to decide what to probe, what to name in
its record and what to hand the child process; playwright.config.ts reads it to
decide what to serve and where to point the browser. Two files each spelling
their own fallback would agree until the day one of them did not, and the
failure of that day is a gate that probes one port and runs on another — the
exact collision this mechanism exists to prevent. Neither reader may carry a
port literal of its own; nothing checks that automatically any more.
*/
import process from 'node:process'

/**
 * The port when nobody sets one.
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
 * Absent or blank is the default. Blank as well as absent because `DANA_GATE_PORT=` in a shell and
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
