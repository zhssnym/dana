/*
The one IANA timezone validator, using Intl (it accepts tzdb aliases and is
case-insensitive). Identifiers starting with a sign are refused first: Intl
accepts offsets like "+05:30", which would break the Luxon reminder math.
Sign-in treats an invalid tz as absent instead (7.1).
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
