/*
Whether a time reads as 17:30 or 5:30 PM, as a preference rather than a guess.

Imran's ruling, 2026-08-18: the format is the person's to choose, and the
picker offers both regardless of which they chose — the setting decides how a
time is written, never which times can be reached.

12-hour is the default, ruled 2026-08-18. The setting can move it to 24-hour
and the picker reaches every hour and minute either way.

The store is deliberately not a React context. Times are written in the row,
in the card's chips, inside two pickers and in a settings control, and a
provider would have to wrap all of them; a module store with
`useSyncExternalStore` reaches every one without anybody threading anything.
It is the shape the reverted `lib/density.tsx` used for row density, and if
that preference comes back it should come back like this.

Lane 1: it lives in the browser and does not follow a person between devices.
Syncing it to the account is a separate want and needs a column, an endpoint
and therefore an RFC — the same conversation DES-113 parked for row density.
*/

import { useSyncExternalStore } from "react"

export type TimeFormat = "24" | "12"

const KEY = "dana.timeFormat"

function read(): TimeFormat {
  try {
    return localStorage.getItem(KEY) === "24" ? "24" : "12"
  } catch {
    /* Private modes and sandboxed frames throw rather than return null. A
       display preference is not worth failing a render over. */
    return "12"
  }
}

let current: TimeFormat = read()
const listeners = new Set<() => void>()

export function setTimeFormat(next: TimeFormat) {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* Remembered for this session only, which is the honest fallback. */
  }
  listeners.forEach((notify) => notify())
}

export function useTimeFormat(): TimeFormat {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    () => current,
    () => "12",
  )
}

/* ------------------------------------------------------------ the value -- */
/*
Times are stored as "HH:MM" on the 24-hour clock whatever the person has
chosen, and converted only when they are drawn. Storing what is displayed is
how a preference change quietly rewrites data, and 12-hour text cannot even
represent midnight without a convention nobody agreed to.
*/

export interface Clock {
  hour: number
  minute: number
}

export function parseTime(value: string | null | undefined): Clock | null {
  if (!value) return null
  const found = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!found) return null
  const hour = Number(found[1])
  const minute = Number(found[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

export function toValue({ hour, minute }: Clock) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

/* 0 and 12 both read as 12 on a 12-hour clock, which is the one case a
   remainder gets wrong and the one people notice. */
export function to12Hour(hour: number) {
  return hour % 12 === 0 ? 12 : hour % 12
}

export function to24Hour(hour12: number, period: "AM" | "PM") {
  const base = hour12 % 12
  return period === "PM" ? base + 12 : base
}

export function periodOf(hour: number): "AM" | "PM" {
  return hour < 12 ? "AM" : "PM"
}

/* The one place a time becomes words. Everything that draws a time goes
   through here, so the preference cannot be honoured in one place and
   forgotten in another. */
export function formatTime(value: string | null | undefined, format: TimeFormat) {
  const clock = parseTime(value)
  if (!clock) return null
  if (format === "24") return toValue(clock)
  return `${to12Hour(clock.hour)}:${String(clock.minute).padStart(2, "0")} ${periodOf(clock.hour)}`
}
