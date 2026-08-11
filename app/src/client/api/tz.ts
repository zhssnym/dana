/*
The zone every view request carries.

7.0 makes tz required on every view endpoint, and its absent half was ruled
onto that section on 2026-08-07: a missing value is a 422 rather than a
default, because the only plausible default, UTC, hands most of the world the
wrong day with nothing on the wire to say it was substituted. So the client
has to report a real zone, and the browser is the only place one exists.

Read on every call rather than once at module load. 8.1 lets today move when
the person moves, and a tab left open across a flight would otherwise keep
asking for the zone it started in. The call is cheap and the alternative is a
staleness nobody can see.
*/

/**
 * The browser's IANA zone, or UTC when the platform reports nothing usable.
 *
 * The fallback is deliberately not validated here. 11.15 records that
 * Intl.DateTimeFormat is a tolerant oracle and that every IANA validation goes
 * through the shared validator; what this function owes is a value to send,
 * and the server is what decides whether it is one. A client that filtered
 * here would answer a stale zone database with silence where the server
 * answers it with a 422 naming the field.
 */
export function browserTimezone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return zone === undefined || zone === '' ? 'UTC' : zone
}

/**
 * Today's calendar date in the browser's zone, as 4.11's YYYY-MM-DD.
 *
 * The only place this client evaluates a date, and it is sanctioned: 7.11
 * lists "pre-filling defaults per entry point" among the client conveniences
 * with no authority, and 9.3's entry-point table is what asks for it. It is
 * never a filter and never a comparison. Every page's grouping, every overdue
 * badge and every today boundary is the server's answer to the tz this same
 * module reports, which is what keeps the two from disagreeing.
 *
 * en-CA rather than arithmetic on an epoch: that locale formats a date as
 * YYYY-MM-DD, and passing the zone through is what makes it the same civil
 * date the server computes from the same identifier.
 */
export function todayInBrowserZone(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: browserTimezone() })
}
