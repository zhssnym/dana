/*
 * The zone every view request carries; the server refuses a missing one. Read on every call, so a tab left open
 * across time zones follows the person.
 */

/** The browser's IANA zone, or UTC. Not validated here: the server validates and answers 422. */
export function browserTimezone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return zone === undefined || zone === '' ? 'UTC' : zone
}

/**
 * Today's date in the browser's zone as YYYY-MM-DD, for entry-point defaults only, never for filtering. en-CA
 * formats as YYYY-MM-DD.
 */
export function todayInBrowserZone(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: browserTimezone() })
}
