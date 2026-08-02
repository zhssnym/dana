/*
The one IANA timezone validator. 10.3 fixes the rule (a timezone is a valid
IANA identifier, else 422) and 7.1 requires the same validation everywhere a
zone enters: users.timezone writes refuse through the schema below, while
GET /auth/google's tz query is treated as absent when the predicate refuses
it, because sign-in never fails over a zone (a recorded 7.1 deviation).

Intl.DateTimeFormat is the oracle because it consults the runtime's own zone
database and accepts tzdb aliases (US/Eastern for America/New_York), which
8.1 counts as the same zone rather than a change. Two more oracle tolerances
are deliberate: it matches names case-insensitively ("utc" validates and is
stored as typed, which Luxon accepts through the same oracle), and it accepts
ECMA-402 offset identifiers ("+05:30"), which are not IANA names and would
break the Luxon zone math reminders rely on later (11.9), so identifiers
opening with a sign are refused before the oracle runs; no IANA name does.
*/
import { z } from 'zod'

export function isIanaTimezone(value: string): boolean {
  if (value === '' || value.startsWith('+') || value.startsWith('-')) {
    return false
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const ianaTimezone = z
  .string({ error: 'must be a string' })
  .refine(isIanaTimezone, { error: 'must be a valid IANA timezone identifier' })
